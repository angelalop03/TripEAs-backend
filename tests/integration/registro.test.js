// tests/integration/registro.test.js
// Prueba de integración del flujo crítico "registro de usuario"
// (POST /api/auth/registro): pasa por el enrutado real de Express, el
// middleware de JSON y el controlador completo. Se mockea Supabase (tanto
// el cliente compartido como el cliente desechable que usa
// crearClienteAuth() para signUp) para no depender de una base de datos real.
const request = require('supertest');
const { crearMockSupabaseClient } = require('../helpers/mockSupabaseClient');

const RUTA_SUPABASE_CLIENT = require.resolve('../../src/config/supabaseClient');

function cargarAppConMocks({ mockSupabase, signUp }) {
  jest.resetModules();
  jest.doMock(RUTA_SUPABASE_CLIENT, () => mockSupabase);
  jest.doMock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ auth: { signUp } })),
  }));
  return require('../../src/app');
}

describe('POST /api/auth/registro (flujo crítico: alta de usuario)', () => {
  test('crea el usuario cuando los datos son válidos y el nombre está libre', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.encolarResultado({ data: null, error: null }); // nombre libre
    mockSupabase.encolarResultado({
      data: { id_usuario: 'nuevo-1', nombre: 'ana', email: 'ana@test.com' },
      error: null,
    }); // insert en "usuarios"

    const signUp = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'nuevo-1', email: 'ana@test.com' },
        session: { access_token: 'token-de-sesion' },
      },
      error: null,
    });

    const app = cargarAppConMocks({ mockSupabase, signUp });

    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'ana@test.com', password: 'contraseñaSegura1', nombre: 'ana' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.usuario.nombre).toBe('ana');
    expect(respuesta.body.session.access_token).toBe('token-de-sesion');
    expect(signUp).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'contraseñaSegura1' });

    // La comprobación de unicidad de nombre debe ir sobre la tabla "usuarios".
    expect(mockSupabase.llamadas[0].tabla).toBe('usuarios');
  });

  test('rechaza el registro si el nombre de usuario ya existe (sin crear cuenta en Auth)', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.encolarResultado({ data: { id_usuario: 'otro-usuario' }, error: null }); // nombre ya en uso

    const signUp = jest.fn();
    const app = cargarAppConMocks({ mockSupabase, signUp });

    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'duplicado@test.com', password: 'contraseñaSegura1', nombre: 'ana' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toBe('Ese nombre de usuario ya está en uso');
    // No debe haberse intentado crear la cuenta de Auth si el nombre choca.
    expect(signUp).not.toHaveBeenCalled();
  });

  test('rechaza el registro si faltan campos obligatorios', async () => {
    const mockSupabase = crearMockSupabaseClient();
    const signUp = jest.fn();
    const app = cargarAppConMocks({ mockSupabase, signUp });

    const respuesta = await request(app).post('/api/auth/registro').send({ email: 'sin-datos@test.com' });

    expect(respuesta.status).toBe(400);
    expect(mockSupabase.llamadas).toHaveLength(0);
    expect(signUp).not.toHaveBeenCalled();
  });

  test('propaga el error de Supabase Auth si el email ya está registrado', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.encolarResultado({ data: null, error: null }); // nombre libre

    const signUp = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });

    const app = cargarAppConMocks({ mockSupabase, signUp });

    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'repetido@test.com', password: 'contraseñaSegura1', nombre: 'nombreNuevo' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toBe('User already registered');
  });

  test('si falla el insert en "usuarios" tras crear la cuenta de Auth, la deshace (no deja huérfanos)', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.encolarResultado({ data: null, error: null }); // nombre libre
    mockSupabase.encolarResultado({ data: null, error: { message: 'columna inválida' } }); // insert en "usuarios" falla

    const signUp = jest.fn().mockResolvedValue({
      data: { user: { id: 'auth-huerfano-1', email: 'huerfano@test.com' }, session: {} },
      error: null,
    });

    const app = cargarAppConMocks({ mockSupabase, signUp });

    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ email: 'huerfano@test.com', password: 'contraseñaSegura1', nombre: 'nombreNuevo' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toBe('columna inválida');
    // La cuenta de Auth creada un instante antes debe deshacerse.
    expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('auth-huerfano-1');
  });
});
