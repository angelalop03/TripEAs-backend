// tests/helpers/mockSupabaseClient.js
// Mock encadenable del cliente de Supabase para tests unitarios y de
// integración, sin tocar ninguna base de datos real.
//
// Los controladores llaman a supabase.from('tabla').select(...).eq(...)...
// terminando en .single()/.maybeSingle(), o simplemente hacen `await` de la
// cadena (el query builder real de supabase-js es "thenable"). Este mock
// reproduce ambos casos: cada método encadenable devuelve el propio objeto,
// y el resultado final se resuelve con lo que se haya encolado para esa
// llamada a from(), en el ORDEN en que el controlador la invoque.
//
// Uso típico en un test:
//   const mockSupabase = crearMockSupabaseClient();
//   mockSupabase.encolarResultado({ data: {...}, error: null }); // 1ª llamada a from()
//   mockSupabase.encolarResultado({ data: null, error: null });  // 2ª llamada a from()
//   jest.doMock('ruta/a/config/supabaseClient', () => mockSupabase);
//
// Después del test se puede inspeccionar mockSupabase.llamadas para
// comprobar qué tablas y qué métodos se invocaron y con qué argumentos.
function crearMockSupabaseClient() {
  const resultados = [];
  const llamadas = [];
  let cursor = 0;

  const METODOS_ENCADENABLES = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'ilike', 'order', 'limit'];

  const from = jest.fn((tabla) => {
    const resultado = resultados[cursor] ?? { data: null, error: null };
    const registro = { tabla, metodos: [] };
    llamadas.push(registro);

    const chain = {};
    METODOS_ENCADENABLES.forEach((nombre) => {
      chain[nombre] = (...args) => {
        registro.metodos.push({ nombre, args });
        return chain;
      };
    });
    chain.single = () => {
      registro.metodos.push({ nombre: 'single', args: [] });
      cursor++;
      return Promise.resolve(resultado);
    };
    chain.maybeSingle = () => {
      registro.metodos.push({ nombre: 'maybeSingle', args: [] });
      cursor++;
      return Promise.resolve(resultado);
    };
    // Thenable: cubre las llamadas que se hacen con `await` sin terminar en
    // single()/maybeSingle() (p.ej. updates/inserts sin .select()).
    chain.then = (resolve, reject) => {
      cursor++;
      return Promise.resolve(resultado).then(resolve, reject);
    };
    return chain;
  });

  const storageFrom = jest.fn(() => ({
    upload: jest.fn().mockResolvedValue({ data: { path: 'fake/path.jpg' }, error: null }),
    getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://fake.supabase.co/storage/v1/object/public/album/fake.jpg' } })),
    remove: jest.fn().mockResolvedValue({ data: [], error: null }),
  }));

  return {
    from,
    auth: {
      getUser: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      admin: {
        deleteUser: jest.fn().mockResolvedValue({ data: null, error: null }),
      },
    },
    storage: { from: storageFrom },
    // Encola el {data, error} que devolverá la N-ésima llamada a from(), en
    // el orden en que el código bajo test la haga.
    encolarResultado(resultado) {
      resultados.push(resultado);
    },
    llamadas,
  };
}

module.exports = { crearMockSupabaseClient };
