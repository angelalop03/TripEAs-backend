// tests/unit/liquidacionGastos.test.js
// Pruebas unitarias del algoritmo de teoría de grafos para la liquidación
// de gastos (src/utils/liquidacionGastos.js). Son funciones puras (sin
// acceso a base de datos), así que se testean directamente sin mocks.
const { calcularBalances, calcularTransaccionesMinimas } = require('../../src/utils/liquidacionGastos');

describe('calcularBalances', () => {
  test('un solo gasto dividido a partes iguales entre pagador y otro participante', () => {
    const gastos = [
      {
        id_pagador: 'A',
        monto_total: 30,
        distribucion: [
          { id_usuario: 'A', cuota: 15 },
          { id_usuario: 'B', cuota: 15 },
        ],
      },
    ];

    const balances = calcularBalances(gastos);

    expect(balances.A).toBeCloseTo(15); // pagó 30, le corresponden 15 → le deben 15
    expect(balances.B).toBeCloseTo(-15); // no pagó nada, le corresponden 15 → debe 15
  });

  test('varios gastos con distintos pagadores se acumulan en el balance neto', () => {
    const gastos = [
      {
        id_pagador: 'A',
        monto_total: 60,
        distribucion: [
          { id_usuario: 'A', cuota: 20 },
          { id_usuario: 'B', cuota: 20 },
          { id_usuario: 'C', cuota: 20 },
        ],
      },
      {
        id_pagador: 'B',
        monto_total: 30,
        distribucion: [
          { id_usuario: 'A', cuota: 15 },
          { id_usuario: 'B', cuota: 15 },
        ],
      },
    ];

    const balances = calcularBalances(gastos);

    // A: pagó 60, le corresponden cuotas 20+15=35 → +25
    // B: pagó 30, le corresponden cuotas 20+15=35 → -5
    // C: pagó 0, le corresponde cuota 20 → -20
    expect(balances.A).toBeCloseTo(25);
    expect(balances.B).toBeCloseTo(-5);
    expect(balances.C).toBeCloseTo(-20);
  });

  test('reparto desigual (cuotas no iguales entre participantes)', () => {
    const gastos = [
      {
        id_pagador: 'A',
        monto_total: 100,
        distribucion: [
          { id_usuario: 'A', cuota: 70 },
          { id_usuario: 'B', cuota: 30 },
        ],
      },
    ];

    const balances = calcularBalances(gastos);

    expect(balances.A).toBeCloseTo(30);
    expect(balances.B).toBeCloseTo(-30);
  });

  test('lista de gastos vacía no genera balances', () => {
    expect(calcularBalances([])).toEqual({});
  });

  test('la suma de todos los balances es siempre cero (conservación del dinero)', () => {
    const gastos = [
      {
        id_pagador: 'A',
        monto_total: 47.5,
        distribucion: [
          { id_usuario: 'A', cuota: 10.5 },
          { id_usuario: 'B', cuota: 12.3 },
          { id_usuario: 'C', cuota: 24.7 },
        ],
      },
      {
        id_pagador: 'C',
        monto_total: 20,
        distribucion: [
          { id_usuario: 'A', cuota: 10 },
          { id_usuario: 'D', cuota: 10 },
        ],
      },
    ];

    const balances = calcularBalances(gastos);
    const suma = Object.values(balances).reduce((acc, b) => acc + b, 0);

    expect(suma).toBeCloseTo(0);
  });
});

describe('calcularTransaccionesMinimas', () => {
  test('sin balances no hay transacciones', () => {
    expect(calcularTransaccionesMinimas({})).toEqual([]);
  });

  test('balances ya saldados (todos a cero) no generan transacciones', () => {
    const transacciones = calcularTransaccionesMinimas({ A: 0, B: 0 });
    expect(transacciones).toEqual([]);
  });

  test('caso simple: un deudor y un acreedor', () => {
    const transacciones = calcularTransaccionesMinimas({ A: -20, B: 20 }, { A: 'Ana', B: 'Bruno' });

    expect(transacciones).toEqual([
      { de_id: 'A', de_nombre: 'Ana', a_id: 'B', a_nombre: 'Bruno', cantidad: 20 },
    ]);
  });

  test('un deudor con dos acreedores: reparte la deuda en dos transacciones', () => {
    const transacciones = calcularTransaccionesMinimas({ A: -30, B: 10, C: 20 });

    expect(transacciones).toHaveLength(2);
    expect(transacciones.every((t) => t.de_id === 'A')).toBe(true);
    const totalPagado = transacciones.reduce((acc, t) => acc + t.cantidad, 0);
    expect(totalPagado).toBeCloseTo(30);
  });

  test('minimiza el número de transacciones frente al reparto ingenuo (2 deudores, 2 acreedores)', () => {
    // Reparto ingenuo por pares de gastos originales podría generar más de
    // 2 transacciones; el óptimo real para este balance neto son 2.
    const balances = { A: -10, B: -10, C: 10, D: 10 };
    const transacciones = calcularTransaccionesMinimas(balances);

    expect(transacciones).toHaveLength(2);
  });

  test('cada transacción deja saldada como mínimo una de las dos partes', () => {
    const balances = { A: -15, B: -25, C: 10, D: 30 };
    const transacciones = calcularTransaccionesMinimas(balances);

    // Invariante del algoritmo greedy: nº de transacciones <= deudores + acreedores - 1
    expect(transacciones.length).toBeLessThanOrEqual(3);

    // Verificamos que las transacciones realmente saldan las deudas: sumando
    // lo que paga cada deudor y lo que recibe cada acreedor coincide con sus
    // balances originales.
    const pagadoPor = {};
    const recibidoPor = {};
    transacciones.forEach((t) => {
      pagadoPor[t.de_id] = (pagadoPor[t.de_id] ?? 0) + t.cantidad;
      recibidoPor[t.a_id] = (recibidoPor[t.a_id] ?? 0) + t.cantidad;
    });

    expect(pagadoPor.A).toBeCloseTo(15);
    expect(pagadoPor.B).toBeCloseTo(25);
    expect(recibidoPor.C).toBeCloseTo(10);
    expect(recibidoPor.D).toBeCloseTo(30);
  });

  test('ignora balances residuales por errores de redondeo de coma flotante (< 0.01)', () => {
    const transacciones = calcularTransaccionesMinimas({ A: -0.005, B: 0.005 });
    expect(transacciones).toEqual([]);
  });

  test('usa el id como nombre si no se proporciona el mapa de nombres', () => {
    const transacciones = calcularTransaccionesMinimas({ X: -5, Y: 5 });
    expect(transacciones[0].de_nombre).toBe('X');
    expect(transacciones[0].a_nombre).toBe('Y');
  });
});
