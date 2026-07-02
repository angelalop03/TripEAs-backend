// src/controllers/viajesController.js
// RF-2: Crear viaje con token de invitación único de 8 caracteres (Regla de Negocio 1)

const supabase = require('../config/supabaseClient');
const crypto = require('crypto');

// Genera un token alfanumérico seguro de 8 caracteres en mayúsculas (ej: 8F2A3D9E)
function generarTokenViaje() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// POST /api/viajes/crear
async function crearViaje(req, res) {
  const { nombre_viaje, descripcion, fecha_inicio, fecha_fin } = req.body;

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
  const { codigo_invitacion } = req.body;

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

  // Buscamos perfiles fantasma en este viaje (Regla de Negocio 3: fusión de identidad)
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

module.exports = { crearViaje, misViajes, unirseAViaje };