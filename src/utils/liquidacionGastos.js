// src/utils/liquidacionGastos.js
// RF-4: Algoritmo de teoría de grafos para liquidación óptima de gastos
// Minimiza el número de transacciones necesarias para saldar todas las deudas del grupo

/**
 * Calcula el balance neto de cada participante.
 * Balance positivo = le deben dinero.
 * Balance negativo = debe dinero.
 *
 * @param {Array} gastos - Lista de gastos con su distribución
 * @returns {Object} - Mapa de id_usuario → balance neto
 */
function calcularBalances(gastos) {
  const balances = {};

  gastos.forEach(gasto => {
    const { id_pagador, monto_total, distribucion } = gasto;

    // El pagador suma el total que adelantó
    if (!balances[id_pagador]) balances[id_pagador] = 0;
    balances[id_pagador] += monto_total;

    // Cada participante resta su cuota correspondiente
    distribucion.forEach(({ id_usuario, cuota }) => {
      if (!balances[id_usuario]) balances[id_usuario] = 0;
      balances[id_usuario] -= cuota;
    });
  });

  return balances;
}

/**
 * Algoritmo de liquidación simplificada por teoría de grafos.
 * Utiliza una estrategia greedy (voraz) sobre los extremos del grafo de deudas:
 * en cada iteración, el que más debe paga al que más le deben,
 * reduciendo el número total de transacciones al mínimo posible.
 *
 * @param {Object} balances - Mapa de id_usuario → balance neto
 * @param {Object} nombresUsuarios - Mapa de id_usuario → nombre (para la respuesta legible)
 * @returns {Array} - Lista de transacciones { de, a, cantidad }
 */
function calcularTransaccionesMinimas(balances, nombresUsuarios = {}) {
  // Separamos en deudores (balance < 0) y acreedores (balance > 0)
  // Ignoramos balances de 0 (ya están saldados)
  const deudores = [];
  const acreedores = [];

  Object.entries(balances).forEach(([id, balance]) => {
    const redondeado = Math.round(balance * 100) / 100; // evitamos errores de punto flotante
    if (redondeado < -0.01) deudores.push({ id, balance: redondeado });
    if (redondeado > 0.01) acreedores.push({ id, balance: redondeado });
  });

  // Ordenamos de mayor a menor (greedy: primero los extremos)
  deudores.sort((a, b) => a.balance - b.balance);   // más negativo primero
  acreedores.sort((a, b) => b.balance - a.balance); // más positivo primero

  const transacciones = [];
  let i = 0; // índice deudores
  let j = 0; // índice acreedores

  while (i < deudores.length && j < acreedores.length) {
    const deudor = deudores[i];
    const acreedor = acreedores[j];

    // La cantidad que se transfiere es el mínimo entre lo que debe y lo que le deben
    const cantidad = Math.min(Math.abs(deudor.balance), acreedor.balance);
    const cantidadRedondeada = Math.round(cantidad * 100) / 100;

    transacciones.push({
      de_id: deudor.id,
      de_nombre: nombresUsuarios[deudor.id] || deudor.id,
      a_id: acreedor.id,
      a_nombre: nombresUsuarios[acreedor.id] || acreedor.id,
      cantidad: cantidadRedondeada,
    });

    // Actualizamos los balances restantes
    deudor.balance += cantidad;
    acreedor.balance -= cantidad;

    // Si el balance llega a 0 (o casi), pasamos al siguiente
    if (Math.abs(deudor.balance) < 0.01) i++;
    if (Math.abs(acreedor.balance) < 0.01) j++;
  }

  return transacciones;
}

module.exports = { calcularBalances, calcularTransaccionesMinimas };