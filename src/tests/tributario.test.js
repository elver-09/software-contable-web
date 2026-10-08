const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/testDb');
const { runMigrations } = require('../main/database/migrationRunner');
const { EMPRESA_MIGRATIONS } = require('../main/database/migrations/empresa');
const {
  normalizarTributario,
  validarClasificacionMinima,
  validarContraAsiento,
  guardarTributario,
  obtenerTributario,
} = require('../main/controllers/tributarioController');

const detalleVenta = [{
  cuenta: '1212', doc_tipo: '01', doc_numero: 'F001-123', fecha_doc: '2026-08-01',
  codigo: '20123456789', razon_social: 'CLIENTE SAC', moneda: 'PEN', tc: 1,
}];

function venta(overrides = {}) {
  return {
    tipo_registro: 'VENTA',
    comprobante: { requiere_revision: 0 },
    venta: { base_gravada: 100, igv: 18, importe_total: 118, ...overrides },
  };
}

test('venta gravada explícita normaliza y concilia con el asiento', () => {
  const n = normalizarTributario(venta(), { origen: '14', detalles: detalleVenta, fechaContable: '2026-08-01' });
  assert.equal(n.comprobante.serie, 'F001');
  assert.equal(n.comprobante.numero, '123');
  assert.equal(n.venta.base_gravada, 100);
  assert.doesNotThrow(() => validarClasificacionMinima(n));
  assert.doesNotThrow(() => validarContraAsiento(n, 118, 118));
});

test('una ficha con solo total no cuenta como clasificación tributaria', () => {
  const n = normalizarTributario(venta({ base_gravada: 0, igv: 0 }), { origen: '14', detalles: detalleVenta });
  assert.throws(() => validarClasificacionMinima(n), /incompletos/i);
});

test('nota de crédito tributaria negativa puede conciliar con asiento positivo', () => {
  const n = normalizarTributario(venta({ base_gravada: -100, igv: -18, importe_total: -118 }), {
    origen: '14', detalles: [{ ...detalleVenta[0], doc_tipo: '07', doc_numero: 'FC01-1' }]
  });
  assert.doesNotThrow(() => validarContraAsiento(n, 118, 118));
});

test('rechaza total tributario distinto del total contable', () => {
  const n = normalizarTributario(venta({ importe_total: 150 }), { origen: '14', detalles: detalleVenta });
  assert.throws(() => validarContraAsiento(n, 118, 118), /no coincide/i);
});

test('rechaza una clasificación explícita con múltiples comprobantes', () => {
  assert.throws(() => normalizarTributario(venta(), {
    origen: '14',
    detalles: [detalleVenta[0], { ...detalleVenta[0], doc_numero: 'F001-999' }],
  }), /solo puede representar un comprobante/i);
});

test('guardarTributario persiste cabecera y detalle dentro del esquema migrado', () => {
  const { db, close } = createTestDatabase();
  try {
    runMigrations(db, EMPRESA_MIGRATIONS, { logger: { log() {}, error() {} }, scope: 'tributario-test' });
    const voucher = db.prepare(`
      INSERT INTO vouchers(origen,numero_voucher,fecha,periodo,total_debe,total_haber)
      VALUES('14',1,'2026-08-01','2026-08',118,118)
    `).run();
    const id = Number(voucher.lastInsertRowid);
    guardarTributario(db, id, '14', venta(), detalleVenta, '2026-08-01', 118, 118);
    const saved = obtenerTributario(db, id);
    assert.equal(saved.tipo_registro, 'VENTA');
    assert.equal(Number(saved.venta.base_gravada), 100);
    assert.equal(Number(saved.venta.igv), 18);
    assert.equal(saved.comprobante.serie, 'F001');
  } finally { close(); }
});


test('una ficha vacía no se considera completa', () => {
  const n = normalizarTributario(venta({base_gravada:0,igv:0,importe_total:0}), {origen:'14',detalles:detalleVenta});
  assert.throws(() => validarClasificacionMinima(n), /incompletos/i);
});
test('rechaza un detalle que no suma el total aunque coincida con el asiento', () => {
  const n = normalizarTributario(venta({importe_total:999}), {origen:'14',detalles:detalleVenta});
  assert.doesNotThrow(() => validarContraAsiento(n,999,999));
  assert.throws(() => validarClasificacionMinima(n), /suma del detalle/i);
});
test('clasificaciones G2, G3, no gravada y ajustes con signo conservan su suma', () => {
  for (const compra of [
    {g2_base:100,g2_igv:18,importe_total:118},
    {g3_base:100,g3_igv:18,importe_total:118},
    {valor_no_gravado:118,importe_total:118},
    {g1_base:-100,g1_igv:-18,importe_total:-118},
  ]) {
    const n = normalizarTributario({tipo_registro:'COMPRA',compra}, {origen:'8',detalles:detalleVenta});
    assert.doesNotThrow(() => validarClasificacionMinima(n));
    assert.doesNotThrow(() => validarContraAsiento(n,118,118));
  }
});
test('descuentos con signo se suman sin aplicar un porcentaje fijo', () => {
  const n = normalizarTributario(venta({descuento_base:-10,descuento_igv:-1.8,importe_total:106.2}), {origen:'14',detalles:detalleVenta});
  assert.doesNotThrow(() => validarClasificacionMinima(n));
});

test('rechaza números con texto y valores no finitos',()=>{
 for(const base_gravada of ['100abc',Infinity,NaN])
 assert.throws(()=>normalizarTributario(venta({base_gravada}),{origen:'14',detalles:detalleVenta}),/inválido/i);
});
