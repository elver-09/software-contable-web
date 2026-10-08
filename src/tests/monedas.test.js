const test = require('node:test');
const assert = require('node:assert/strict');
const {
  _parsearFechaBCRP,
  _construirTiposSUNATDesdeBCRP,
} = require('../main/controllers/monedasController');

test('parsea fechas BCRP al formato YYYY-MM-DD', () => {
  assert.equal(_parsearFechaBCRP('31.Jul.26'), '2026-07-31');
  assert.equal(_parsearFechaBCRP('01.Ago.2026'), '2026-08-01');
});

test('reconstruye tipo SUNAT usando última cotización SBS anterior', () => {
  const result = _construirTiposSUNATDesdeBCRP('2026-08-01', '2026-08-04', [
    { fecha: '2026-07-31', compra: 3.39, venta: 3.40 },
    { fecha: '2026-08-03', compra: 3.41, venta: 3.42 },
  ]);

  assert.deepEqual(result.map(r => [r.fecha, r.fecha_fuente, r.venta]), [
    ['2026-08-01', '2026-07-31', 3.40],
    ['2026-08-02', '2026-07-31', 3.40],
    ['2026-08-03', '2026-07-31', 3.40],
    ['2026-08-04', '2026-08-03', 3.42],
  ]);
});
