// src/controllers/authController.js
// Lógica de registro e inicio de sesión usando Supabase Auth (RF-1)

const supabase = require('../config/supabaseClient');

// POST /api/auth/registro
async function registro(req, res) {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Faltan campos: email, password o nombre' });
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
        nombre,
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