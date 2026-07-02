// src/controllers/ruletaController.js
// RF-8: Gobernanza y toma de decisiones lúdica (ruleta / votación)

const supabase = require('../config/supabaseClient');

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/ruleta/crear
async function crearRuleta(req, res) {
  const { id_viaje, titulo, opciones } = req.body;
  // opciones es un array de strings: ["Restaurante A", "Restaurante B", "Restaurante C"]

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !titulo || !opciones || opciones.length < 2) {
    return res.status(400).json({ error: 'Se necesita id_viaje, titulo y al menos 2 opciones' });
  }

  // 1. Creamos la ruleta
  const { data: ruleta, error: ruletaError } = await supabase
    .from('ruletas')
    .insert([{ id_viaje, titulo }])
    .select()
    .single();

  if (ruletaError) return res.status(400).json({ error: ruletaError.message });

  // 2. Insertamos las opciones
  const opcionesInsert = opciones.map(texto => ({
    id_ruleta: ruleta.id_ruleta,
    texto_opcion: texto,
  }));

  const { data: opcionesData, error: opcionesError } = await supabase
    .from('opciones_ruleta')
    .insert(opcionesInsert)
    .select();

  if (opcionesError) return res.status(400).json({ error: opcionesError.message });

  return res.status(201).json({
    message: 'Ruleta creada correctamente',
    ruleta: { ...ruleta, opciones: opcionesData },
  });
}

// POST /api/ruleta/:id_ruleta/girar
// Selecciona una opción ganadora de forma aleatoria
async function girarRuleta(req, res) {
  const { id_ruleta } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  // Obtenemos todas las opciones de esta ruleta
  const { data: opciones, error } = await supabase
    .from('opciones_ruleta')
    .select('*')
    .eq('id_ruleta', id_ruleta);

  if (error || !opciones || opciones.length === 0) {
    return res.status(404).json({ error: 'Ruleta no encontrada o sin opciones' });
  }

  // Seleccionamos una opción aleatoria
  const ganadora = opciones[Math.floor(Math.random() * opciones.length)];

  return res.status(200).json({
    message: '🎰 ¡La ruleta ha girado!',
    ganadora: {
      id_opcion: ganadora.id_opcion,
      texto_opcion: ganadora.texto_opcion,
    },
    total_opciones: opciones.length,
  });
}

// GET /api/ruleta/:id_viaje
async function obtenerRuletas(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: ruletas, error } = await supabase
    .from('ruletas')
    .select(`
      id_ruleta,
      titulo,
      opciones_ruleta (id_opcion, texto_opcion)
    `)
    .eq('id_viaje', id_viaje);

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ruletas });
}

module.exports = { crearRuleta, girarRuleta, obtenerRuletas };