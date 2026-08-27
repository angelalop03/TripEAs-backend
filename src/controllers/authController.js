// src/controllers/authController.js
// Lógica de registro e inicio de sesión usando Supabase Auth (RF-1)

const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabaseClient');

// signUp()/signInWithPassword() MUTAN la sesión interna del cliente de
// supabase-js con la que llame (queda "logueado" como ese usuario para las
// siguientes peticiones que hagan con ese mismo cliente). Como `supabase`
// es un cliente ÚNICO compartido por todo el servidor con la service_role
// key, si se usara aquí, en cuanto una sola persona iniciara sesión el
// cliente compartido dejaría de actuar como service_role para el resto de
// peticiones (subidas de Storage, updates, etc. de cualquier usuario),
// saltando "new row violates row-level security policy" — lo comprobamos
// en vivo y era justo lo que pasaba. Por eso registro/login usan un
// cliente NUEVO y desechable (con la anon key, como corresponde a un login)
// en cada llamada, que nunca toca el cliente compartido.
function crearClienteAuth() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Escapa los comodines de ILIKE (%, _, \) para que el nombre del usuario se
// compare como texto literal y no como patrón.
function escaparPatronLike(texto) {
  return texto.replace(/[%_\\]/g, (caracter) => `\\${caracter}`);
}

// POST /api/auth/registro
async function registro(req, res) {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Faltan campos: email, password o nombre' });
  }

  const nombreLimpio = nombre.trim();

  // Regla de negocio: no puede haber dos usuarios con el mismo nombre
  // (comparación insensible a mayúsculas). Se comprueba ANTES de crear el
  // usuario en Supabase Auth para no dejar una cuenta de Auth huérfana sin
  // fila en "usuarios" si el nombre ya está en uso.
  const { data: nombreExistente } = await supabase
    .from('usuarios')
    .select('id_usuario')
    .ilike('nombre', escaparPatronLike(nombreLimpio))
    .maybeSingle();

  if (nombreExistente) {
    return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });
  }

  // 1. Crear el usuario en el sistema de Auth de Supabase (cliente propio,
  // ver crearClienteAuth() arriba — nunca el `supabase` compartido)
  const { data: authData, error: authError } = await crearClienteAuth().auth.signUp({
    email,
    password,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // 2. Crear el registro correspondiente en nuestra tabla "usuarios"
  // (usamos el mismo id que genera Supabase Auth para mantener todo enlazado)
  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .insert([
      {
        id_usuario: authData.user.id,
        nombre: nombreLimpio,
        email,
      },
    ])
    .select()
    .single();

  if (userError) {
    return res.status(400).json({ error: userError.message });
  }

  return res.status(201).json({
    message: 'Usuario registrado correctamente',
    usuario: userData,
    session: authData.session,
  });
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan campos: email o password' });
  }

  const { data, error } = await crearClienteAuth().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  // data.user es el usuario de Supabase Auth: no tiene "nombre" (solo
  // id/email), así que sin esto el frontend caía al email como si fuera
  // el nombre. Traemos la fila real de "usuarios" para devolver el
  // nombre y la foto de perfil correctos, igual que hace registro().
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, email, url_foto_perfil')
    .eq('id_usuario', data.user.id)
    .single();

  return res.status(200).json({
    message: 'Inicio de sesión correcto',
    session: data.session,
    usuario: perfil ?? data.user,
  });
}

module.exports = { registro, login };