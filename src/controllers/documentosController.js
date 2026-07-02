// src/controllers/documentosController.js
// RF-6: Repositorio de documentación centralizada (billetes, reservas en PDF)
// Los archivos se suben a Supabase Storage y la URL se guarda en la BD

const supabase = require('../config/supabaseClient');

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// POST /api/documentos/subir
// Recibe el archivo como buffer (desde multer) y lo sube a Supabase Storage
async function subirDocumento(req, res) {
  const { id_viaje } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!id_viaje) {
    return res.status(400).json({ error: 'Falta el campo id_viaje' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
  }

  // Solo permitimos PDFs
  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Solo se permiten archivos PDF' });
  }

  // Nombre único para evitar colisiones: viaje/timestamp_nombreoriginal.pdf
  const nombreArchivo = `${id_viaje}/${Date.now()}_${req.file.originalname}`;

  // 1. Subimos el archivo a Supabase Storage (bucket "documentos")
  const { data: storageData, error: storageError } = await supabase.storage
    .from('documentos')
    .upload(nombreArchivo, req.file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (storageError) {
    return res.status(400).json({ error: storageError.message });
  }

  // 2. Obtenemos la URL pública del archivo
  const { data: urlData } = supabase.storage
    .from('documentos')
    .getPublicUrl(nombreArchivo);

  const url_almacenamiento = urlData.publicUrl;

  // 3. Guardamos el registro en la tabla documentos
  const { data: documento, error: docError } = await supabase
    .from('documentos')
    .insert([{
      id_viaje,
      id_subido_por: user.id,
      nombre_archivo: req.file.originalname,
      url_almacenamiento,
    }])
    .select()
    .single();

  if (docError) {
    return res.status(400).json({ error: docError.message });
  }

  return res.status(201).json({
    message: 'Documento subido correctamente',
    documento: {
      ...documento,
      // La URL pública permite descargar el archivo directamente
      // El frontend la usará para guardarlo localmente (acceso offline)
      url_descarga: url_almacenamiento,
    },
  });
}

// GET /api/documentos/:id_viaje
// Lista todos los documentos de un viaje con su URL de descarga
async function obtenerDocumentos(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: documentos, error } = await supabase
    .from('documentos')
    .select(`
      id_documento,
      nombre_archivo,
      url_almacenamiento,
      fecha_subida,
      usuarios (nombre)
    `)
    .eq('id_viaje', id_viaje)
    .order('fecha_subida', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ documentos });
}

// DELETE /api/documentos/:id_documento
async function eliminarDocumento(req, res) {
  const { id_documento } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  // Obtenemos el documento para saber la ruta en Storage
  const { data: documento, error: docError } = await supabase
    .from('documentos')
    .select('url_almacenamiento, id_subido_por')
    .eq('id_documento', id_documento)
    .single();

  if (docError || !documento) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  // Solo puede eliminar quien lo subió
  if (documento.id_subido_por !== user.id) {
    return res.status(403).json({ error: 'No tienes permiso para eliminar este documento' });
  }

  // Extraemos el path relativo del Storage desde la URL pública
  const path = documento.url_almacenamiento.split('/storage/v1/object/public/documentos/')[1];

  // Eliminamos del Storage
  await supabase.storage.from('documentos').remove([path]);

  // Eliminamos el registro de la BD
  await supabase.from('documentos').delete().eq('id_documento', id_documento);

  return res.status(200).json({ message: 'Documento eliminado correctamente' });
}

module.exports = { subirDocumento, obtenerDocumentos, eliminarDocumento };