// src/controllers/calendarioController.js
// RF-5: Cronograma temporal dinámico con actividades colaborativas

const supabase = require('../config/supabaseClient');

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/calendario/crear
async function crearEvento(req, res) {
  const { id_viaje, titulo, descripcion, ubicacion, fecha_hora_inicio, fecha_hora_fin } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !titulo || !fecha_hora_inicio) {
    return res.status(400).json({ error: 'Faltan campos: id_viaje, titulo o fecha_hora_inicio' });
  }

  const { data: evento, error } = await supabase
    .from('eventos_calendario')
    .insert([{ id_viaje, titulo, descripcion, ubicacion, fecha_hora_inicio, fecha_hora_fin }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(201).json({ message: 'Evento creado correctamente', evento });
}

// GET /api/calendario/:id_viaje
async function obtenerEventos(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: eventos, error } = await supabase
    .from('eventos_calendario')
    .select('*')
    .eq('id_viaje', id_viaje)
    .order('fecha_hora_inicio', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ eventos });
}

// PUT /api/calendario/:id_evento
async function editarEvento(req, res) {
  const { id_evento } = req.params;
  const { titulo, descripcion, ubicacion, fecha_hora_inicio, fecha_hora_fin } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: evento, error } = await supabase
    .from('eventos_calendario')
    .update({ titulo, descripcion, ubicacion, fecha_hora_inicio, fecha_hora_fin })
    .eq('id_evento', id_evento)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Evento actualizado correctamente', evento });
}

// DELETE /api/calendario/:id_evento
async function eliminarEvento(req, res) {
  const { id_evento } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { error } = await supabase
    .from('eventos_calendario')
    .delete()
    .eq('id_evento', id_evento);

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Evento eliminado correctamente' });
}

module.exports = { crearEvento, obtenerEventos, editarEvento, eliminarEvento };