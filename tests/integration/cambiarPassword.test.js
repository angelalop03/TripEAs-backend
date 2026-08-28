// tests/integration/cambiarPassword.test.js
// Prueba de integración del cambio de contraseña (PUT /api/auth/cambiar-password):
// verifica la contraseña actual reautenticando en un cliente desechable
// antes de aplicar el cambio con la API admin del cliente compartido.
const request = require('supertest');
const { crearMockSupabaseClient } = require('../helpers/mockSupabaseClient');

const RUTA_SUPABASE_CLIENT = require.resolve('../../src/config/supabaseClient');
const USUARIO = { id: 'usuario-1', email: 'ana@test.com' };

function cargarAppConMocks({ mockSupabase, signInWithPassword }) {
  jest.resetModules();
  jest.doMock(RUTA_SUPABASE_CLIENT, () => mockSupabase);
  jest.doMock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ auth: { signInWithPassword } })),
  }));
  return require('../../src/app');
}

function mockAutenticado(mockSupabase) {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
}

describe('PUT /api/auth/cambiar-password', () => {
  test('cambia la contraseña cuando la actual es correcta y la nueva es válida', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.auth.admin.updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });

    const signInWithPassword = jest.fn().mockResolvedValue({ data: { user: USUARIO }, error: null });
    const app = cargarAppConMocks({ mockSupabase, signInWithPassword });

    const respuesta = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', 'Bearer token-valido')
      .send({ password_actual: 'ViejaClave123', password_nueva: 'NuevaClave123' });

    expect(respuesta.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'ViejaClave123' });
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith('usuario-1', { password: 'NuevaClave123' });
  });

  test('rechaza el cambio si la contraseña actual no es correcta, sin llegar a actualizarla', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.auth.admin.updateUserById = jest.fn();

    const signInWithPassword = jest.fn().mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    const app = cargarAppConMocks({ mockSupabase, signInWithPassword });

    const respuesta = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', 'Bearer token-valido')
      .send({ password_actual: 'ClaveIncorrecta', password_nueva: 'NuevaClave123' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toBe('La contraseña actual no es correcta');
    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  test('rechaza contraseñas nuevas demasiado cortas sin reautenticar', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    const signInWithPassword = jest.fn();
    const app = cargarAppConMocks({ mockSupabase, signInWithPassword });

    const respuesta = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', 'Bearer token-valido')
      .send({ password_actual: 'ViejaClave123', password_nueva: 'corta' });

    expect(respuesta.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test('rechaza si faltan campos', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    const app = cargarAppConMocks({ mockSupabase, signInWithPassword: jest.fn() });

    const respuesta = await request(app)
      .put('/api/auth/cambiar-password')
      .set('Authorization', 'Bearer token-valido')
      .send({ password_actual: 'ViejaClave123' });

    expect(respuesta.status).toBe(400);
  });

  test('responde 401 si no se manda token de autenticación', async () => {
    const mockSupabase = crearMockSupabaseClient();
    const app = cargarAppConMocks({ mockSupabase, signInWithPassword: jest.fn() });

    const respuesta = await request(app)
      .put('/api/auth/cambiar-password')
      .send({ password_actual: 'ViejaClave123', password_nueva: 'NuevaClave123' });

    expect(respuesta.status).toBe(401);
  });
});
