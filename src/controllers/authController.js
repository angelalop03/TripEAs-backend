// src/controllers/authController.js
// Lógica de registro e inicio de sesión usando Supabase Auth (RF-1)

const supabase = require('../config/supabaseClient');

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

  // 1. Crear el usuario en el sistema de Auth de Supabase
  const { data: authData, error: authError } = await supabase.auth.signUp({
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    message: 'Inicio de sesión correcto',
    session: data.session,
    usuario: data.user,
  });
}

module.exports = { registro, login };