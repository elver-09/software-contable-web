// src/main/domain/voucherValidation.js
// Reglas contables puras y reutilizables. No dependen de Electron ni SQLite,
// por lo que pueden probarse directamente con node:test.

const TOLERANCIA_CUADRE = 0.01;

function montoContable(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return 0;
  const n = Number.parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

function montoEditable(valor, campo = 'monto', detalleId = '') {
  if (valor === null || valor === undefined || String(valor).trim() === '') return 0;
  const n = Number.parseFloat(valor);
  if (!Number.isFinite(n) || n < 0) {
    const linea = detalleId === '' ? '' : ` de la línea ${detalleId}`;
    throw new Error(`Monto inválido en ${campo}${linea}.`);
  }
  return n;
}

function calcularTotales(detalles = []) {
  if (!Array.isArray(detalles)) throw new Error('Los detalles del voucher deben ser una lista.');
  return detalles.reduce((acc, detalle) => {
    acc.debe += montoContable(detalle?.debe);
    acc.haber += montoContable(detalle?.haber);
    return acc;
  }, { debe: 0, haber: 0 });
}

function validarCuadre(totalDebe, totalHaber) {
  const debe = montoContable(totalDebe);
  const haber = montoContable(totalHaber);
  const diferencia = debe - haber;

  if (Math.abs(diferencia) > TOLERANCIA_CUADRE) {
    throw new Error(
      `No se puede guardar el asiento porque está descuadrado. ` +
      `Debe: ${debe.toFixed(2)}, Haber: ${haber.toFixed(2)}, ` +
      `Diferencia: ${Math.abs(diferencia).toFixed(2)}.`
    );
  }

  return { debe, haber, diferencia };
}

module.exports = {
  TOLERANCIA_CUADRE,
  montoContable,
  montoEditable,
  calcularTotales,
  validarCuadre,
};
