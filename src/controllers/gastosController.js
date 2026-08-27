// src/controllers/gastosController.js
// RF-4: Control de gastos compartidos con liquidación por teoría de grafos

const supabase = require('../config/supabaseClient');
const { calcularBalances, calcularTransaccionesMinimas } = require('../utils/liquidacionGastos');

// Helper reutilizable para verificar usuario
async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/gastos/registrar
// Registra un gasto y lo distribuye entre los participantes indicados
async function registrarGasto(req, res) {
  const { id_viaje, concepto, monto_total, distribucion } = req.body;
  // distribucion es un array: [{ id_usuario, cuota }, ...]

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !concepto || !monto_total || !distribucion || distribucion.length === 0) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  // Validamos que la suma de cuotas coincide con el monto total
  const sumaCuotas = distribucion.reduce((acc, d) => acc + d.cuota, 0);
  if (Math.abs(sumaCuotas - monto_total) > 0.01) {
    return res.status(400).json({
      error: `La suma de cuotas (${sumaCuotas}) no coincide con el monto total (${monto_total})`,
    });
  }

  // El pagador es el usuario autenticado por defecto,
  // pero se puede especificar otro id_pagador en el body
  // (útil cuando el pagador es un usuario fantasma sin cuenta)
  const id_pagador = req.body.id_pagador || user.id;

  // 1. Insertamos el gasto
  const { data: gasto, error: gastoError } = await supabase
    .from('gastos')
    .insert([{
      id_viaje,
      id_pagador,
      concepto,
      monto_total,
    }])
    .select()
    .single();

  if (gastoError) return res.status(400).json({ error: gastoError.message });

  // 2. Insertamos la distribución del gasto
  const distribucionInsert = distribucion.map(d => ({
    id_gasto: gasto.id_gasto,
    id_usuario: d.id_usuario,
    cuota: d.cuota,
  }));

  const { error: distError } = await supabase
    .from('distribucion_gastos')
    .insert(distribucionInsert);

  if (distError) return res.status(400).json({ error: distError.message });

  return res.status(201).json({
    message: 'Gasto registrado correctamente',
    gasto,
  });
}

// GET /api/gastos/:id_viaje
// Devuelve todos los gastos de un viaje con su distribución
async function obtenerGastos(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: gastos, error } = await supabase
    .from('gastos')
    .select(`
      id_gasto,
      concepto,
      monto_total,
      fecha,
      usuarios!gastos_id_pagador_fkey (id_usuario, nombre),
      distribucion_gastos (id_usuario, cuota)
    `)
    .eq('id_viaje', id_viaje)
    .order('fecha', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ gastos });
}

// GET /api/gastos/:id_viaje/liquidacion
// Calcula el balance de cada participante y las transacciones mínimas para saldar deudas
async function obtenerLiquidacion(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  // 1. Obtenemos todos los gastos del viaje con su distribución
  const { data: gastos, error: gastosError } = await supabase
    .from('gastos')
    .select(`
      id_gasto,
      id_pagador,
      monto_total,
      distribucion_gastos (id_usuario, cuota)
    `)
    .eq('id_viaje', id_viaje);

  if (gastosError) return res.status(400).json({ error: gastosError.message });

  // 2. Obtenemos los nombres de los participantes para mostrarlos en la respuesta
  const { data: participantes } = await supabase
    .from('participantes_viaje')
    .select('usuarios (id_usuario, nombre)')
    .eq('id_viaje', id_viaje);

  const nombresUsuarios = {};
  participantes?.forEach(p => {
    nombresUsuarios[p.usuarios.id_usuario] = p.usuarios.nombre;
  });

  // 3. Preparamos los datos para el algoritmo
  const gastosFormateados = gastos.map(g => ({
    id_pagador: g.id_pagador,
    monto_total: g.monto_total,
    distribucion: g.distribucion_gastos,
  }));

  // 4. Calculamos balances netos
  const balances = calcularBalances(gastosFormateados);

  // 5. Aplicamos el algoritmo de teoría de grafos
  const transacciones = calcularTransaccionesMinimas(balances, nombresUsuarios);

  // 6. Construimos el resumen de balances legible
  const resumenBalances = Object.entries(balances).map(([id, balance]) => ({
    id_usuario: id,
    nombre: nombresUsuarios[id] || id,
    balance: Math.round(balance * 100) / 100,
    estado: balance > 0.01 ? 'le deben' : balance < -0.01 ? 'debe' : 'saldado',
  }));

  return res.status(200).json({
    resumen_balances: resumenBalances,
    transacciones_optimas: transacciones,
    total_transacciones: transacciones.length,
    explicacion: 'El algoritmo ha calculado el mínimo número de transferencias necesarias para saldar todas las deudas del grupo.',
  });
}

module.exports = { registrarGasto, obtenerGastos, obtenerLiquidacion };
