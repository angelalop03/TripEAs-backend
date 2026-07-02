// src/controllers/participantesController.js
// RF-3: Gestión de integrantes provisionales (Usuario Fantasma) - Regla de Negocio 2 y 3

const supabase = require('../config/supabaseClient');

// Helper para verificar usuario autenticado desde el token JWT
async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// Helper para verificar que el usuario es admin del viaje
async function verificarAdmin(id_viaje, id_usuario) {
  const { data } = await supabase
    .from('participantes_viaje')
    .select('rol')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_usuario)
    .single();
  return data?.rol === 'admin';
}

// POST /api/participantes/anadir-fantasma
// El admin añade un miembro sin cuenta (Regla de Negocio 2: "Usuario Fantasma")
async function anadirFantasma(req, res) {
  const { id_viaje, nombre } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !nombre) {
    return res.status(400).json({ error: 'Faltan campos: id_viaje o nombre' });
  }

  // Solo el admin del viaje puede añadir fantasmas
  const esAdmin = await verificarAdmin(id_viaje, user.id);
  if (!esAdmin) {
    return res.status(403).json({ error: 'Solo el administrador del viaje puede añadir integrantes' });
  }

  // 1. Creamos el usuario fantasma en la tabla usuarios
  // email y password_hash quedan NULL (Regla de Negocio 2)
  const { data: fantasma, error: fantasmaError } = await supabase
    .from('usuarios')
    .insert([{ nombre }])
    .select()
    .single();

  if (fantasmaError) {
    return res.status(400).json({ error: fantasmaError.message });
  }

  // 2. Lo añadimos como participante del viaje marcado como fantasma
  const { error: participanteError } = await supabase
    .from('participantes_viaje')
    .insert([{
      id_viaje,
      id_usuario: fantasma.id_usuario,
      rol: 'miembro',
      es_fantasma: true,
    }]);

  if (participanteError) {
    return res.status(400).json({ error: participanteError.message });
  }

  return res.status(201).json({
    message: `Integrante provisional "${nombre}" añadido correctamente`,
    fantasma: {
      id_usuario: fantasma.id_usuario,
      nombre: fantasma.nombre,
      es_fantasma: true,
    },
  });
}

// POST /api/participantes/reclamar-identidad
// Un usuario real se fusiona con su perfil fantasma (Regla de Negocio 3: "Fusión Dinámica")
async function reclamarIdentidad(req, res) {
  const { id_viaje, id_fantasma } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !id_fantasma) {
    return res.status(400).json({ error: 'Faltan campos: id_viaje o id_fantasma' });
  }

  // Verificamos que el perfil fantasma existe y pertenece al viaje
  const { data: fantasma, error: fantasmaError } = await supabase
    .from('participantes_viaje')
    .select('*')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_fantasma)
    .eq('es_fantasma', true)
    .single();

  if (fantasmaError || !fantasma) {
    return res.status(404).json({ error: 'Perfil provisional no encontrado en este viaje' });
  }

  // Verificamos que el usuario real no sea ya participante del viaje
  const { data: yaParticipa } = await supabase
    .from('participantes_viaje')
    .select('*')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', user.id)
    .single();

  if (yaParticipa) {
    return res.status(400).json({ error: 'Ya eres participante de este viaje' });
  }

  // MUTACIÓN EN CASCADA (Regla de Negocio 3):
  // Actualizamos todas las referencias al ID fantasma → ID real

  // 1. Gastos donde el fantasma era el pagador
  await supabase
    .from('gastos')
    .update({ id_pagador: user.id })
    .eq('id_pagador', id_fantasma);

  // 2. Distribución de gastos donde aparecía el fantasma
  await supabase
    .from('distribucion_gastos')
    .update({ id_usuario: user.id })
    .eq('id_usuario', id_fantasma);

  // 3. Items de lista asignados al fantasma
  await supabase
    .from('items_lista')
    .update({ id_asignado_a: user.id })
    .eq('id_asignado_a', id_fantasma);

  // 4. Documentos subidos por el fantasma
  await supabase
    .from('documentos')
    .update({ id_subido_por: user.id })
    .eq('id_subido_por', id_fantasma);

  // 5. Álbum de fotos subidas por el fantasma
  await supabase
    .from('album_fotos')
    .update({ id_subido_por: user.id })
    .eq('id_subido_por', id_fantasma);

  // 6. Convertimos el registro del participante fantasma → usuario real
  await supabase
    .from('participantes_viaje')
    .update({
      id_usuario: user.id,
      es_fantasma: false,
    })
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', id_fantasma);

  // 7. Eliminamos el perfil fantasma de la tabla usuarios (ya no es necesario)
  await supabase
    .from('usuarios')
    .delete()
    .eq('id_usuario', id_fantasma);

  return res.status(200).json({
    message: '¡Identidad reclamada correctamente! Tus datos han sido vinculados.',
    id_usuario_real: user.id,
  });
}

// GET /api/participantes/:id_viaje
// Lista todos los participantes de un viaje (reales y fantasmas)
async function listarParticipantes(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data, error } = await supabase
    .from('participantes_viaje')
    .select(`
      rol,
      es_fantasma,
      usuarios (id_usuario, nombre, email, url_foto_perfil)
    `)
    .eq('id_viaje', id_viaje);

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({
    participantes: data.map(p => ({
      ...p.usuarios,
      rol: p.rol,
      es_fantasma: p.es_fantasma,
    })),
  });
}

module.exports = { anadirFantasma, reclamarIdentidad, listarParticipantes };