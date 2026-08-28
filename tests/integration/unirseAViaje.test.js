// tests/integration/unirseAViaje.test.js
// Prueba de integración del flujo crítico "unirse a un viaje mediante
// código de invitación" (POST /api/viajes/unirse), pasando por el
// enrutado real de Express y el controlador completo, con Supabase mockeado.
const request = require('supertest');
const { crearMockSupabaseClient } = require('../helpers/mockSupabaseClient');

const RUTA_SUPABASE_CLIENT = require.resolve('../../src/config/supabaseClient');
const USUARIO = { id: 'usuario-1' };
const VIAJE = { id_viaje: 'viaje-1', nombre_viaje: 'Verano en Mallorca', codigo_invitacion: 'ABCD1234' };

function cargarAppConMock(mockSupabase) {
  jest.resetModules();
  jest.doMock(RUTA_SUPABASE_CLIENT, () => mockSupabase);
  return require('../../src/app');
}

function mockAutenticado(mockSupabase) {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
}

describe('POST /api/viajes/unirse (flujo crítico: unirse a un viaje por token)', () => {
  test('une al usuario como miembro cuando el código es válido y no hay perfiles fantasma', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: VIAJE, error: null }); // viaje encontrado
    mockSupabase.encolarResultado({ data: null, error: null }); // no participa todavía
    mockSupabase.encolarResultado({ data: [], error: null }); // sin fantasmas
    mockSupabase.encolarResultado({ data: null, error: null }); // insert participante OK

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/viajes/unirse')
      .set('Authorization', 'Bearer token-valido')
      .send({ codigo_invitacion: 'abcd1234' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.rol).toBe('miembro');
    expect(respuesta.body.viaje.id_viaje).toBe('viaje-1');

    // El código se busca en mayúsculas independientemente de cómo lo escriba el usuario.
    const buscarViaje = mockSupabase.llamadas[0];
    expect(buscarViaje.metodos).toContainEqual({ nombre: 'eq', args: ['codigo_invitacion', 'ABCD1234'] });

    // El insert final crea al usuario como "miembro", no como admin.
    const insertParticipante = mockSupabase.llamadas[3];
    expect(insertParticipante.tabla).toBe('participantes_viaje');
    expect(insertParticipante.metodos[0]).toEqual({
      nombre: 'insert',
      args: [[{ id_viaje: 'viaje-1', id_usuario: USUARIO.id, rol: 'miembro', es_fantasma: false }]],
    });
  });

  test('responde 404 si el código de invitación no corresponde a ningún viaje', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: null, error: { message: 'not found' } });

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/viajes/unirse')
      .set('Authorization', 'Bearer token-valido')
      .send({ codigo_invitacion: 'NOEXISTE' });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('Código de invitación no válido');
    expect(mockSupabase.llamadas).toHaveLength(1);
  });

  test('no duplica al usuario si ya es participante del viaje', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: VIAJE, error: null });
    mockSupabase.encolarResultado({ data: { id_usuario: USUARIO.id }, error: null }); // ya participa

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/viajes/unirse')
      .set('Authorization', 'Bearer token-valido')
      .send({ codigo_invitacion: 'ABCD1234' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.message).toBe('Ya eres participante de este viaje');
    // No debe buscar fantasmas ni intentar un insert si ya participaba.
    expect(mockSupabase.llamadas).toHaveLength(2);
  });

  test('pide fusión de identidad si hay perfiles fantasma en el viaje, en vez de unirse directamente', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: VIAJE, error: null });
    mockSupabase.encolarResultado({ data: null, error: null }); // no participa
    mockSupabase.encolarResultado({
      data: [{ id_usuario: 'fantasma-1', usuarios: { id_usuario: 'fantasma-1', nombre: 'Carlos' } }],
      error: null,
    }); // hay un fantasma

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/viajes/unirse')
      .set('Authorization', 'Bearer token-valido')
      .send({ codigo_invitacion: 'ABCD1234' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.accion_requerida).toBe('fusion_identidad');
    expect(respuesta.body.perfiles_fantasma).toEqual([{ id_usuario: 'fantasma-1', nombre: 'Carlos' }]);
    // No debe insertar como participante nuevo: el usuario tiene que elegir fusionarse.
    expect(mockSupabase.llamadas).toHaveLength(3);
  });

  test('con soy_nuevo=true, une al usuario directamente aunque haya perfiles fantasma en el viaje', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: VIAJE, error: null }); // viaje encontrado
    mockSupabase.encolarResultado({ data: null, error: null }); // no participa todavía
    mockSupabase.encolarResultado({ data: null, error: null }); // insert participante OK

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/viajes/unirse')
      .set('Authorization', 'Bearer token-valido')
      .send({ codigo_invitacion: 'ABCD1234', soy_nuevo: true });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.rol).toBe('miembro');
    // No debe consultar fantasmas: solo viaje + yaParticipa + insert (3 llamadas, no 4).
    expect(mockSupabase.llamadas).toHaveLength(3);
    expect(mockSupabase.llamadas[2].tabla).toBe('participantes_viaje');
    expect(mockSupabase.llamadas[2].metodos[0].nombre).toBe('insert');
  });

  test('responde 401 si no se manda token de autenticación', async () => {
    const mockSupabase = crearMockSupabaseClient();
    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app).post('/api/viajes/unirse').send({ codigo_invitacion: 'ABCD1234' });

    expect(respuesta.status).toBe(401);
    expect(mockSupabase.llamadas).toHaveLength(0);
  });
});
