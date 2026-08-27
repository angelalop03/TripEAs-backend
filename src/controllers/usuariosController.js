// src/controllers/usuariosController.js
// Edición del perfil propio: nombre y foto de perfil (RF-1 extendido).

const supabase = require('../config/supabaseClient');

// Escapa los comodines de ILIKE (%, _, \) para que el nombre del usuario se
// compare como texto literal y no como patrón.
function escaparPatronLike(texto) {
  return texto.replace(/[%_\\]/g, (caracter) => `\\${caracter}`);
}

async function verificarUsuario(authHeader) {
  if (!authHeader) return { error: 'No se proporcionó token de autenticación' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Token inválido o expirado' };
  return { user };
}

// GET /api/usuarios/perfil
async function obtenerPerfil(req, res) {
  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: perfil, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, email, url_foto_perfil')
    .eq('id_usuario', user.id)
    .single();

  if (error || !perfil) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  return res.status(200).json({ usuario: perfil });
}

// PUT /api/usuarios/perfil
// Actualiza nombre y/o foto de perfil del usuario autenticado.
async function actualizarPerfil(req, res) {
  const { nombre, url_foto_perfil } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (nombre !== undefined && !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  }

  const nombreLimpio = nombre !== undefined ? nombre.trim() : undefined;

  // Misma regla que en el registro: no puede haber dos usuarios con el
  // mismo nombre (excluyendo al propio usuario, por si no lo cambia).
  if (nombreLimpio !== undefined) {
    const { data: nombreExistente } = await supabase
      .from('usuarios')
      .select('id_usuario')
      .ilike('nombre', escaparPatronLike(nombreLimpio))
      .neq('id_usuario', user.id)
      .maybeSingle();

    if (nombreExistente) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });
    }
  }

  const cambios = {};
  if (nombreLimpio !== undefined) cambios.nombre = nombreLimpio;
  if (url_foto_perfil !== undefined) cambios.url_foto_perfil = url_foto_perfil;

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se ha enviado ningún cambio' });
  }

  const { data: perfil, error } = await supabase
    .from('usuarios')
    .update(cambios)
    .eq('id_usuario', user.id)
    .select('id_usuario, nombre, email, url_foto_perfil')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ message: 'Perfil actualizado correctamente', usuario: perfil });
}

// POST /api/usuarios/subir-foto-perfil
// Sube la imagen a Storage y devuelve la URL pública (mismo patrón que
// subirPortada en viajesController.js); actualizarPerfil se llama aparte
// con esa URL para guardarla en la fila del usuario.
async function subirFotoPerfil(req, res) {
  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
  }

  const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposPermitidos.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG o WEBP' });
  }

  const nombreArchivo = `perfiles/${user.id}_${Date.now()}_${req.file.originalname}`;

  // Reutilizamos el bucket "album" (ya existe) bajo el prefijo perfiles/
  const { error: storageError } = await supabase.storage
    .from('album')
    .upload(nombreArchivo, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (storageError) {
    return res.status(400).json({ error: storageError.message });
  }

  const { data: urlData } = supabase.storage.from('album').getPublicUrl(nombreArchivo);

  return res.status(201).json({ url_foto_perfil: urlData.publicUrl });
}

module.exports = { obtenerPerfil, actualizarPerfil, subirFotoPerfil };
