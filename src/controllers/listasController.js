// src/controllers/listasController.js
// RF-9: Listas de tareas compartidas con actualización en tiempo real

const supabase = require('../config/supabaseClient');

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/listas/crear
async function crearLista(req, res) {
  const { id_viaje, titulo_lista } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje || !titulo_lista) {
    return res.status(400).json({ error: 'Faltan campos: id_viaje o titulo_lista' });
  }

  const { data: lista, error } = await supabase
    .from('listas')
    .insert([{ id_viaje, titulo_lista }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(201).json({ message: 'Lista creada correctamente', lista });
}

// GET /api/listas/:id_viaje
async function obtenerListas(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: listas, error } = await supabase
    .from('listas')
    .select(`
      id_lista,
      titulo_lista,
      items_lista (
        id_item,
        nombre_item,
        esta_completado,
        id_asignado_a,
        usuarios (nombre)
      )
    `)
    .eq('id_viaje', id_viaje);

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ listas });
}

// POST /api/listas/items/anadir
async function anadirItem(req, res) {
  const { id_lista, nombre_item, id_asignado_a } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_lista || !nombre_item) {
    return res.status(400).json({ error: 'Faltan campos: id_lista o nombre_item' });
  }

  const { data: item, error } = await supabase
    .from('items_lista')
    .insert([{ id_lista, nombre_item, id_asignado_a: id_asignado_a || null }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(201).json({ message: 'Item añadido correctamente', item });
}

// PATCH /api/listas/items/:id_item/completar
async function completarItem(req, res) {
  const { id_item } = req.params;
  const { esta_completado } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: item, error } = await supabase
    .from('items_lista')
    .update({ esta_completado })
    .eq('id_item', id_item)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Item actualizado', item });
}

module.exports = { crearLista, obtenerListas, anadirItem, completarItem };