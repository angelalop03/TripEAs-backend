// src/config/supabaseClient.js
// Cliente de Supabase para usar en el backend (Node.js)

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
// Usamos la service_role key porque este cliente vive en el BACKEND (servidor de confianza).
// Esta key puede saltarse las políticas de RLS, por eso NUNCA debe usarse en el frontend/móvil.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;