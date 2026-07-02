// src/controllers/albumController.js
// RF-7: Álbum multimedia compartido (fotos y vídeos del viaje)

const supabase = require('../config/supabaseClient');

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/album/subir
async function subirArchivo(req, res) {
  const { id_viaje } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje) {
    return res.status(400).json({ error: 'Falta el campo id_viaje' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
  }

  // Determinamos si es foto o vídeo
  const tiposPermitidos = {
    'image/jpeg': 'foto',
    'image/png': 'foto',
    'image/webp': 'foto',
    'video/mp4': 'video',
    'video/quicktime': 'video',
  };

  const tipo = tiposPermitidos[req.file.mimetype];
  if (!tipo) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, MP4 o MOV' });
  }

  const nombreArchivo = `${id_viaje}/${Date.now()}_${req.file.originalname}`;

  // 1. Subimos al bucket "album" en Supabase Storage
  const { error: storageError } = await supabase.storage
    .from('album')
    .upload(nombreArchivo, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (storageError) {
    return res.status(400).json({ error: storageError.message });
  }

  // 2. URL pública del archivo
  const { data: urlData } = supabase.storage
    .from('album')
    .getPublicUrl(nombreArchivo);

  // 3. Guardamos en la tabla album_fotos
  const { data: archivo, error: albumError } = await supabase
    .from('album_fotos')
    .insert([{
      id_viaje,
      id_subido_por: user.id,
      url_multimedia: urlData.publicUrl,
      tipo,
    }])
    .select()
    .single();

  if (albumError) {
    return res.status(400).json({ error: albumError.message });
  }

  return res.status(201).json({
    message: `${tipo === 'foto' ? 'Foto' : 'Vídeo'} subido correctamente`,
    archivo,
  });
}

// GET /api/album/:id_viaje
async function obtenerAlbum(req, res) {
  const { id_viaje } = req.params;
  const { tipo } = req.query; // opcional: ?tipo=foto o ?tipo=video

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  let query = supabase
    .from('album_fotos')
    .select(`
      id_archivo,
      url_multimedia,
      tipo,
      fecha_subida,
      usuarios (nombre)
    `)
    .eq('id_viaje', id_viaje)
    .order('fecha_subida', { ascending: false });

  // Filtro opcional por tipo
  if (tipo === 'foto' || tipo === 'video') {
    query = query.eq('tipo', tipo);
  }

  const { data: archivos, error } = await query;

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({
    total: archivos.length,
    archivos,
  });
}

// DELETE /api/album/:id_archivo
async function eliminarArchivo(req, res) {
  const { id_archivo } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: archivo } = await supabase
    .from('album_fotos')
    .select('url_multimedia, id_subido_por')
    .eq('id_archivo', id_archivo)
    .single();

  if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado' });

  if (archivo.id_subido_por !== user.id) {
    return res.status(403).json({ error: 'No tienes permiso para eliminar este archivo' });
  }

  const path = archivo.url_multimedia.split('/storage/v1/object/public/album/')[1];
  await supabase.storage.from('album').remove([path]);
  await supabase.from('album_fotos').delete().eq('id_archivo', id_archivo);

  return res.status(200).json({ message: 'Archivo eliminado correctamente' });
}

module.exports = { subirArchivo, obtenerAlbum, eliminarArchivo };