// src/controllers/viajesController.js
// RF-2: Crear viaje con token de invitación único de 8 caracteres (Regla de Negocio 1)

const supabase = require('../config/supabaseClient');
const crypto = require('crypto');

// Genera un token alfanumérico seguro de 8 caracteres en mayúsculas (ej: 8F2A3D9E)
function generarTokenViaje() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

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

// POST /api/viajes/subir-portada
// Sube una imagen de portada ANTES de crear el viaje (todavía no existe
// id_viaje en este punto) y devuelve la URL pública para pasarla a /crear.
async function subirPortada(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
  }

  const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposPermitidos.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG o WEBP' });
  }

  const nombreArchivo = `portadas/${user.id}_${Date.now()}_${req.file.originalname}`;

  // Reutilizamos el bucket "album" (ya existe) bajo el prefijo portadas/
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

  return res.status(201).json({ url_portada: urlData.publicUrl });
}

// POST /api/viajes/crear
async function crearViaje(req, res) {
  const { nombre_viaje, descripcion, fecha_inicio, fecha_fin, url_portada } = req.body;

  // El id del usuario creador viene del token JWT que manda el frontend en el header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  // Verificamos el token con Supabase para obtener el usuario autenticado
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!nombre_viaje) {
    return res.status(400).json({ error: 'El nombre del viaje es obligatorio' });
  }

  // Generamos el token único de 8 caracteres (Regla de Negocio 1)
  const codigo_invitacion = generarTokenViaje();

  // Insertamos el viaje en la base de datos
  const { data: viaje, error: viajeError } = await supabase
    .from('viajes_grupos')
    .insert([
      {
        nombre_viaje,
        descripcion: descripcion || null,
        codigo_invitacion,
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null,
        url_portada: url_portada || null,
      },
    ])
    .select()
    .single();

  if (viajeError) {
    return res.status(400).json({ error: viajeError.message });
  }

  // Añadimos al creador como participante con rol 'admin' (RF-2)
  const { error: participanteError } = await supabase
    .from('participantes_viaje')
    .insert([
      {
        id_viaje: viaje.id_viaje,
        id_usuario: user.id,
        rol: 'admin',
        es_fantasma: false,
      },
    ]);

  if (participanteError) {
    return res.status(400).json({ error: participanteError.message });
  }

  return res.status(201).json({
    message: 'Viaje creado correctamente',
    viaje: {
      ...viaje,
      tu_rol: 'admin',
    },
  });
}

// GET /api/viajes/mis-viajes
// Devuelve todos los viajes en los que participa el usuario autenticado
async function misViajes(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  const { data: viajes, error } = await supabase
    .from('participantes_viaje')
    .select(`
      rol,
      es_fantasma,
      viajes_grupos (
        id_viaje,
        nombre_viaje,
        descripcion,
        codigo_invitacion,
        fecha_inicio,
        fecha_fin,
        url_portada,
        creado_en
      )
    `)
    .eq('id_usuario', user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({
    viajes: viajes.map(v => ({
      ...v.viajes_grupos,
      rol: v.rol,
    })),
  });
}

// POST /api/viajes/unirse
// Un usuario se une a un viaje usando el código de invitación (RF-2 + Regla de Negocio 3)
async function unirseAViaje(req, res) {
  const { codigo_invitacion, soy_nuevo } = req.body;

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!codigo_invitacion) {
    return res.status(400).json({ error: 'El código de invitación es obligatorio' });
  }

  // Buscamos el viaje por su código único
  const { data: viaje, error: viajeError } = await supabase
    .from('viajes_grupos')
    .select('*')
    .eq('codigo_invitacion', codigo_invitacion.toUpperCase())
    .single();

  if (viajeError || !viaje) {
    return res.status(404).json({ error: 'Código de invitación no válido' });
  }

  // Comprobamos si ya es participante
  const { data: yaParticipa } = await supabase
    .from('participantes_viaje')
    .select('*')
    .eq('id_viaje', viaje.id_viaje)
    .eq('id_usuario', user.id)
    .single();

  if (yaParticipa) {
    return res.status(200).json({
      message: 'Ya eres participante de este viaje',
      viaje,
    });
  }

  // Buscamos perfiles fantasma en este viaje (Regla de Negocio 3: fusión de
  // identidad). Si el frontend ya nos confirmó que el usuario es nuevo
  // (soy_nuevo, tras preguntarle y que diga que ninguno de los fantasmas es
  // él) nos saltamos esta comprobación y lo unimos directo como miembro.
  if (!soy_nuevo) {
    const { data: fantasmas } = await supabase
      .from('participantes_viaje')
      .select(`
        id_usuario,
        usuarios (id_usuario, nombre)
      `)
      .eq('id_viaje', viaje.id_viaje)
      .eq('es_fantasma', true);

    // Si hay fantasmas, los devolvemos para que el usuario seleccione cuál es él
    if (fantasmas && fantasmas.length > 0) {
      return res.status(200).json({
        message: 'Selecciona tu perfil provisional si ya fuiste añadido al viaje',
        viaje,
        perfiles_fantasma: fantasmas.map(f => ({
          id_usuario: f.usuarios.id_usuario,
          nombre: f.usuarios.nombre,
        })),
        accion_requerida: 'fusion_identidad',
      });
    }
  }

  // Si no hay fantasmas, añadimos al usuario directamente como miembro
  const { error: participanteError } = await supabase
    .from('participantes_viaje')
    .insert([
      {
        id_viaje: viaje.id_viaje,
        id_usuario: user.id,
        rol: 'miembro',
        es_fantasma: false,
      },
    ]);

  if (participanteError) {
    return res.status(400).json({ error: participanteError.message });
  }

  return res.status(201).json({
    message: '¡Te has unido al viaje correctamente!',
    viaje,
    rol: 'miembro',
  });
}

// GET /api/viajes/:id_viaje
// Devuelve los datos de un viaje concreto (solo si el usuario participa en él).
// Se registra DESPUÉS de /mis-viajes en las rutas para que ese literal no
// sea interpretado como un :id_viaje.
async function obtenerViaje(req, res) {
  const { id_viaje } = req.params;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const { data: participa } = await supabase
    .from('participantes_viaje')
    .select('rol')
    .eq('id_viaje', id_viaje)
    .eq('id_usuario', user.id)
    .single();

  if (!participa) {
    return res.status(403).json({ error: 'No participas en este viaje' });
  }

  const { data: viaje, error } = await supabase
    .from('viajes_grupos')
    .select('*')
    .eq('id_viaje', id_viaje)
    .single();

  if (error || !viaje) {
    return res.status(404).json({ error: 'Viaje no encontrado' });
  }

  return res.status(200).json({ viaje: { ...viaje, tu_rol: participa.rol } });
}

// PUT /api/viajes/:id_viaje
// Actualiza nombre/descripción/fechas/portada de un viaje existente.
// Solo el admin del viaje puede editar los ajustes (RF-2, mismo criterio
// que anadirFantasma en participantesController).
async function actualizarViaje(req, res) {
  const { id_viaje } = req.params;
  const { nombre_viaje, descripcion, fecha_inicio, fecha_fin, url_portada } = req.body;

  const { user, error: authError } = await verificarUsuario(req.headers.authorization);
  if (authError) return res.status(401).json({ error: authError });

  const esAdmin = await verificarAdmin(id_viaje, user.id);
  if (!esAdmin) {
    return res.status(403).json({ error: 'Solo el administrador del viaje puede editar los ajustes' });
  }

  if (nombre_viaje !== undefined && !nombre_viaje.trim()) {
    return res.status(400).json({ error: 'El nombre del viaje no puede estar vacío' });
  }

  const cambios = {};
  if (nombre_viaje !== undefined) cambios.nombre_viaje = nombre_viaje.trim();
  if (descripcion !== undefined) cambios.descripcion = descripcion;
  if (fecha_inicio !== undefined) cambios.fecha_inicio = fecha_inicio;
  if (fecha_fin !== undefined) cambios.fecha_fin = fecha_fin;
  if (url_portada !== undefined) cambios.url_portada = url_portada;

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se ha enviado ningún cambio' });
  }

  const { data: viaje, error } = await supabase
    .from('viajes_grupos')
    .update(cambios)
    .eq('id_viaje', id_viaje)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ message: 'Viaje actualizado correctamente', viaje });
}

module.exports = { crearViaje, misViajes, unirseAViaje, subirPortada, obtenerViaje, actualizarViaje };