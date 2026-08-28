// tests/unit/reclamarIdentidad.test.js
// Pruebas unitarias de la Regla de Negocio 3 ("Fusión Dinámica" de un
// perfil fantasma con la cuenta real que lo reclama), en
// src/controllers/participantesController.js. Se mockea el cliente de
// Supabase para no tocar ninguna base de datos real y poder comprobar,
// llamada a llamada, que la cascada de actualizaciones es correcta.
const { crearMockSupabaseClient } = require('../helpers/mockSupabaseClient');

const RUTA_SUPABASE_CLIENT = require.resolve('../../src/config/supabaseClient');

function crearRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function crearReq({ id_viaje, id_fantasma }) {
  return {
    body: { id_viaje, id_fantasma },
    headers: { authorization: 'Bearer token-valido' },
  };
}

const USUARIO_REAL = { id: 'usuario-real-1' };
const ID_VIAJE = 'viaje-1';
const ID_FANTASMA = 'fantasma-1';

// Carga el controlador con un mock de Supabase fresco para cada test, así
// no hay estado (cursor de llamadas, etc.) que se filtre entre pruebas.
function cargarControladorConMock(mockSupabase) {
  jest.resetModules();
  jest.doMock(RUTA_SUPABASE_CLIENT, () => mockSupabase);
  return require('../../src/controllers/participantesController');
}

describe('reclamarIdentidad (Regla de Negocio 3: fusión de perfil fantasma)', () => {
  test('devuelve 404 si el perfil fantasma no existe en ese viaje', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO_REAL }, error: null });
    mockSupabase.encolarResultado({ data: null, error: null }); // fantasma no encontrado

    const { reclamarIdentidad } = cargarControladorConMock(mockSupabase);
    const req = crearReq({ id_viaje: ID_VIAJE, id_fantasma: ID_FANTASMA });
    const res = crearRes();

    await reclamarIdentidad(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Perfil provisional no encontrado en este viaje' });
    // No debe haber intentado ninguna mutación en cascada.
    expect(mockSupabase.llamadas).toHaveLength(1);
  });

  test('devuelve 400 si el usuario ya es participante del viaje (no permite fusionarse dos veces)', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO_REAL }, error: null });
    mockSupabase.encolarResultado({ data: { id_usuario: ID_FANTASMA, es_fantasma: true }, error: null }); // fantasma existe
    mockSupabase.encolarResultado({ data: { id_usuario: USUARIO_REAL.id }, error: null }); // ya participa

    const { reclamarIdentidad } = cargarControladorConMock(mockSupabase);
    const req = crearReq({ id_viaje: ID_VIAJE, id_fantasma: ID_FANTASMA });
    const res = crearRes();

    await reclamarIdentidad(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Ya eres participante de este viaje' });
    // Se comprobó fantasma + yaParticipa, pero ninguna cascada más.
    expect(mockSupabase.llamadas).toHaveLength(2);
  });

  test('responde 400 si faltan campos obligatorios, sin llegar a consultar Supabase', async () => {
    const mockSupabase = crearMockSupabaseClient();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO_REAL }, error: null });
    const { reclamarIdentidad } = cargarControladorConMock(mockSupabase);
    const res = crearRes();

    await reclamarIdentidad(crearReq({ id_viaje: null, id_fantasma: ID_FANTASMA }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSupabase.llamadas).toHaveLength(0);
  });

  describe('camino feliz: fusiona correctamente el fantasma con el usuario real', () => {
    let mockSupabase;
    let res;

    beforeEach(async () => {
      mockSupabase = crearMockSupabaseClient();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: USUARIO_REAL }, error: null });
      mockSupabase.encolarResultado({ data: { id_usuario: ID_FANTASMA, es_fantasma: true }, error: null }); // fantasma existe
      mockSupabase.encolarResultado({ data: null, error: null }); // no participa todavía
      // Las 7 mutaciones en cascada: su resultado no se comprueba en el
      // controlador, así que cualquier valor sirve.
      for (let i = 0; i < 7; i++) mockSupabase.encolarResultado({ data: null, error: null });

      const { reclamarIdentidad } = cargarControladorConMock(mockSupabase);
      res = crearRes();
      await reclamarIdentidad(crearReq({ id_viaje: ID_VIAJE, id_fantasma: ID_FANTASMA }), res);
    });

    test('responde 200 con el id del usuario real', () => {
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id_usuario_real: USUARIO_REAL.id })
      );
    });

    test('actualiza, en orden, todas las tablas con referencias al fantasma', () => {
      const tablas = mockSupabase.llamadas.map((l) => l.tabla);
      expect(tablas).toEqual([
        'participantes_viaje', // 1. lookup fantasma
        'participantes_viaje', // 2. lookup yaParticipa
        'gastos', // 3. id_pagador
        'distribucion_gastos', // 4. id_usuario
        'items_lista', // 5. id_asignado_a
        'documentos', // 6. id_subido_por
        'album_fotos', // 7. id_subido_por
        'participantes_viaje', // 8. convierte el fantasma en el usuario real
        'usuarios', // 9. borra la fila del fantasma
      ]);
    });

    test('cada mutación reasigna el id del fantasma al id del usuario real, no al revés', () => {
      const [, , gastos, distribucion, items, documentos, album, participante, usuarios] = mockSupabase.llamadas;

      expect(gastos.metodos).toContainEqual({ nombre: 'update', args: [{ id_pagador: USUARIO_REAL.id }] });
      expect(gastos.metodos).toContainEqual({ nombre: 'eq', args: ['id_pagador', ID_FANTASMA] });

      expect(distribucion.metodos).toContainEqual({ nombre: 'update', args: [{ id_usuario: USUARIO_REAL.id }] });
      expect(distribucion.metodos).toContainEqual({ nombre: 'eq', args: ['id_usuario', ID_FANTASMA] });

      expect(items.metodos).toContainEqual({ nombre: 'update', args: [{ id_asignado_a: USUARIO_REAL.id }] });
      expect(documentos.metodos).toContainEqual({ nombre: 'update', args: [{ id_subido_por: USUARIO_REAL.id }] });
      expect(album.metodos).toContainEqual({ nombre: 'update', args: [{ id_subido_por: USUARIO_REAL.id }] });

      // El participante fantasma pasa a ser el usuario real y deja de marcarse como fantasma.
      expect(participante.metodos).toContainEqual({
        nombre: 'update',
        args: [{ id_usuario: USUARIO_REAL.id, es_fantasma: false }],
      });

      // El perfil fantasma en la tabla usuarios se elimina, no se conserva.
      expect(usuarios.metodos).toContainEqual({ nombre: 'delete', args: [] });
      expect(usuarios.metodos).toContainEqual({ nombre: 'eq', args: ['id_usuario', ID_FANTASMA] });
    });
  });
});
