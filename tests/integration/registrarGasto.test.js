// tests/integration/registrarGasto.test.js
// Prueba de integración del flujo crítico "crear un gasto y repartirlo
// entre el grupo" (POST /api/gastos/registrar), con Supabase mockeado.
const request = require('supertest');
const { crearMockSupabaseClient } = require('../helpers/mockSupabaseClient');

const RUTA_SUPABASE_CLIENT = require.resolve('../../src/config/supabaseClient');
const USUARIO = { id: 'usuario-1' };

function cargarAppConMock(mockSupabase) {
  jest.resetModules();
  jest.doMock(RUTA_SUPABASE_CLIENT, () => mockSupabase);
  return require('../../src/app');
}

function mockAutenticado(mockSupabase) {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO }, error: null });
}

describe('POST /api/gastos/registrar (flujo crítico: crear un gasto compartido)', () => {
  test('registra el gasto y su distribución cuando las cuotas cuadran con el total', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({
      data: { id_gasto: 'gasto-1', id_viaje: 'viaje-1', concepto: 'Cena', monto_total: 40 },
      error: null,
    }); // insert en "gastos"
    mockSupabase.encolarResultado({ data: null, error: null }); // insert en "distribucion_gastos"

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({
        id_viaje: 'viaje-1',
        concepto: 'Cena',
        monto_total: 40,
        distribucion: [
          { id_usuario: 'usuario-1', cuota: 20 },
          { id_usuario: 'usuario-2', cuota: 20 },
        ],
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.gasto.id_gasto).toBe('gasto-1');

    expect(mockSupabase.llamadas[0].tabla).toBe('gastos');
    expect(mockSupabase.llamadas[1].tabla).toBe('distribucion_gastos');
    expect(mockSupabase.llamadas[1].metodos[0]).toEqual({
      nombre: 'insert',
      args: [
        [
          { id_gasto: 'gasto-1', id_usuario: 'usuario-1', cuota: 20 },
          { id_gasto: 'gasto-1', id_usuario: 'usuario-2', cuota: 20 },
        ],
      ],
    });
  });

  test('usa al usuario autenticado como pagador si no se especifica id_pagador', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: { id_gasto: 'gasto-2' }, error: null });
    mockSupabase.encolarResultado({ data: null, error: null });

    const app = cargarAppConMock(mockSupabase);

    await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({
        id_viaje: 'viaje-1',
        concepto: 'Taxi',
        monto_total: 10,
        distribucion: [{ id_usuario: 'usuario-1', cuota: 10 }],
      });

    const insertGasto = mockSupabase.llamadas[0];
    expect(insertGasto.metodos[0].args[0][0]).toMatchObject({ id_pagador: USUARIO.id });
  });

  test('permite especificar un id_pagador distinto (p.ej. un participante fantasma que pagó en efectivo)', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: { id_gasto: 'gasto-3' }, error: null });
    mockSupabase.encolarResultado({ data: null, error: null });

    const app = cargarAppConMock(mockSupabase);

    await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({
        id_viaje: 'viaje-1',
        concepto: 'Hotel',
        monto_total: 100,
        id_pagador: 'fantasma-1',
        distribucion: [{ id_usuario: 'usuario-1', cuota: 100 }],
      });

    const insertGasto = mockSupabase.llamadas[0];
    expect(insertGasto.metodos[0].args[0][0]).toMatchObject({ id_pagador: 'fantasma-1' });
  });

  test('rechaza el gasto si la suma de las cuotas no coincide con el monto total', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({
        id_viaje: 'viaje-1',
        concepto: 'Cena',
        monto_total: 40,
        distribucion: [
          { id_usuario: 'usuario-1', cuota: 10 },
          { id_usuario: 'usuario-2', cuota: 10 },
        ], // suman 20, no 40
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatch(/no coincide con el monto total/);
    // La validación de negocio debe cortar ANTES de tocar la base de datos.
    expect(mockSupabase.llamadas).toHaveLength(0);
  });

  test('rechaza el gasto si faltan campos obligatorios', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({ id_viaje: 'viaje-1', concepto: 'Cena' }); // sin monto_total ni distribucion

    expect(respuesta.status).toBe(400);
    expect(mockSupabase.llamadas).toHaveLength(0);
  });

  test('no inserta la distribución si falla la inserción del gasto', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockAutenticado(mockSupabase);
    mockSupabase.encolarResultado({ data: null, error: { message: 'columna inválida' } });

    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/gastos/registrar')
      .set('Authorization', 'Bearer token-valido')
      .send({
        id_viaje: 'viaje-1',
        concepto: 'Cena',
        monto_total: 20,
        distribucion: [{ id_usuario: 'usuario-1', cuota: 20 }],
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toBe('columna inválida');
    expect(mockSupabase.llamadas).toHaveLength(1); // solo el intento de insertar el gasto
  });

  test('responde 401 si no se manda token de autenticación', async () => {
    const mockSupabase = crearMockSupabaseClient();
    const app = cargarAppConMock(mockSupabase);

    const respuesta = await request(app)
      .post('/api/gastos/registrar')
      .send({ id_viaje: 'viaje-1', concepto: 'Cena', monto_total: 20, distribucion: [{ id_usuario: 'u1', cuota: 20 }] });

    expect(respuesta.status).toBe(401);
    expect(mockSupabase.llamadas).toHaveLength(0);
  });
});
