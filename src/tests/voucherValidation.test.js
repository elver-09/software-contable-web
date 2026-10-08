const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calcularTotales,
  validarCuadre,
  montoEditable,
} = require('../main/domain/voucherValidation');

test('calcula y acepta un asiento cuadrado', () => {
  const totals = calcularTotales([
    { debe: 118, haber: 0 },
    { debe: 0, haber: 100 },
    { debe: 0, haber: 18 },
  ]);
  assert.deepEqual(totals, { debe: 118, haber: 118 });
  assert.doesNotThrow(() => validarCuadre(totals.debe, totals.haber));
});

test('rechaza un asiento descuadrado', () => {
  assert.throws(() => validarCuadre(118, 117.5), /descuadrado/i);
});

test('tolera diferencias de redondeo de hasta un céntimo', () => {
  assert.doesNotThrow(() => validarCuadre(100, 99.995));
});

test('edición monetaria rechaza importes negativos o inválidos', () => {
  assert.throws(() => montoEditable(-1, 'Debe', 10), /Monto inválido/);
  assert.throws(() => montoEditable('abc', 'Haber', 11), /Monto inválido/);
});
