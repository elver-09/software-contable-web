const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/testDb');
const { runMigrations, columnExists, tableExists, indexExists } = require('../main/database/migrationRunner');
const { EMPRESA_MIGRATIONS } = require('../main/database/migrations/empresa');

const silent = { log() {}, error() {} };

function migrate(db) {
  return runMigrations(db, EMPRESA_MIGRATIONS, { logger: silent, scope: 'empresa-test' });
}

test('empresa nueva llega al esquema actual completo', () => {
  const { db, close } = createTestDatabase();
  try {
    const result = migrate(db);
    assert.equal(result.currentVersion, EMPRESA_MIGRATIONS.at(-1).version);
    for (const table of [
      'vouchers','voucher_detalles','comprobantes_tributarios','comprobante_venta',
      'comprobante_compra','sire_config','sire_operaciones','sire_logs','config_notas_eeff','config_estado_resultados','config_notas_er'
    ]) assert.equal(tableExists(db, table), true, `falta ${table}`);
    assert.equal(columnExists(db, 'vouchers', 'periodo'), true);
    assert.equal(columnExists(db, 'plan_cuentas', 'estado_resultados'), true);
    assert.equal(columnExists(db, 'sire_config', 'cuenta_cxc'), true);
    assert.equal(indexExists(db, 'idx_vouchers_periodo'), true);
    assert.equal(indexExists(db, 'idx_ct_documento'), true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM amarres_asistente').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, EMPRESA_MIGRATIONS.length);
  } finally { close(); }
});

test('migra vouchers legacy numero→numero_voucher y reconstruye periodo vacío', () => {
  const { db, close } = createTestDatabase();
  try {
    db.exec(`
      CREATE TABLE vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origen TEXT NOT NULL,
        numero TEXT,
        fecha TEXT NOT NULL,
        periodo TEXT
      );
      INSERT INTO vouchers(id,origen,numero,fecha,periodo) VALUES
        (1,'14','153','2026-06-30',''),
        (2,'8','20','2026-01-03','2025-12');
    `);

    migrate(db);
    const rows = db.prepare('SELECT id,numero_voucher,fecha,periodo FROM vouchers ORDER BY id').all();
    assert.deepEqual(rows.map(r => Number(r.numero_voucher)), [153, 20]);
    assert.equal(rows[0].periodo, '2026-06');
    assert.equal(rows[1].periodo, '2025-12', 'debe conservar el periodo contable explícito');
    assert.equal(columnExists(db, 'vouchers', 'numero'), false);
    assert.equal(tableExists(db, 'vouchers_legacy'), false);
  } finally { close(); }
});

test('recupera vouchers_legacy cuando una migración antigua quedó interrumpida', () => {
  const { db, close } = createTestDatabase();
  try {
    db.exec(`
      CREATE TABLE vouchers_legacy (
        id INTEGER PRIMARY KEY,
        origen TEXT,
        numero INTEGER,
        fecha TEXT
      );
      INSERT INTO vouchers_legacy VALUES(7,'14',33,'2026-02-14');
    `);
    migrate(db);
    const row = db.prepare('SELECT id,origen,numero_voucher,periodo FROM vouchers WHERE id=7').get();
    assert.equal(Number(row.numero_voucher), 33);
    assert.equal(row.periodo, '2026-02');
    assert.equal(tableExists(db, 'vouchers_legacy'), false);
  } finally { close(); }
});

test('reaplicar las migraciones de empresa no duplica semillas ni datos', () => {
  const { db, close } = createTestDatabase();
  try {
    migrate(db);
    db.exec("INSERT INTO plan_cuentas(codigo,descripcion) VALUES('101','Caja')");
    migrate(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_cuentas').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM amarres_asistente').get().n, 2);
  } finally { close(); }
});

test('v10 convierte configuración ER fija previa en notas dinámicas sin perder cuentas', () => {
  const { db, close } = createTestDatabase();
  try {
    runMigrations(db, EMPRESA_MIGRATIONS.filter(m => m.version <= 9), { logger: silent, scope: 'empresa-v9-test' });
    db.prepare(`INSERT INTO config_estado_resultados(rubro,nota_numero,cuentas,orden) VALUES(?,?,?,?)`)
      .run('ventas_operacionales','NOTA 12',JSON.stringify(['70111']),1);
    runMigrations(db, EMPRESA_MIGRATIONS, { logger: silent, scope: 'empresa-v10-test' });
    const n = db.prepare('SELECT numero,nombre,bloque,cuentas FROM config_notas_er').get();
    assert.equal(n.numero, 'NOTA 12');
    assert.equal(n.nombre, 'Ingresos por ventas (operacionales)');
    assert.equal(n.bloque, 'BRUTA');
    assert.deepEqual(JSON.parse(n.cuentas), ['70111']);
  } finally { close(); }
});

test('v11 crea las 18 notas base ER y obliga números de nota únicos', () => {
  const { db, close } = createTestDatabase();
  try {
    migrate(db);
    const rows = db.prepare(`SELECT numero,nombre,bloque,concepto_key,preestablecida FROM config_notas_er WHERE preestablecida=1 ORDER BY id`).all();
    assert.equal(rows.length, 18);
    assert.equal(new Set(rows.map(r => r.concepto_key)).size, 18);
    assert.equal(rows.every(r => Number(r.preestablecida) === 1), true);
    assert.equal(rows.some(r => r.nombre === 'Ingresos por ventas (operacionales)'), true);
    assert.equal(rows.some(r => r.nombre === 'Impuesto a las ganancias'), true);
    assert.throws(() => {
      db.prepare(`UPDATE config_notas_er SET numero=? WHERE concepto_key=?`).run('Nota 1', 'COSTO_VENTAS');
    }, /UNIQUE/i);
  } finally { close(); }
});
