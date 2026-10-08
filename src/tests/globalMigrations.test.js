const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/testDb');
const { runMigrations, columnExists } = require('../main/database/migrationRunner');
const { GLOBAL_MIGRATIONS } = require('../main/database/migrations/global');

const silent = { log() {}, error() {} };

test('migra una base global antigua sin perder entidades ni tipos de cambio', () => {
  const { db, close } = createTestDatabase();
  try {
    db.exec(`
      CREATE TABLE entidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        razon_social TEXT NOT NULL,
        tipo TEXT NOT NULL
      );
      INSERT INTO entidades(codigo,razon_social,tipo) VALUES('20123456789','ABC SAC','Proveedor');

      CREATE TABLE monedas (
        fecha TEXT NOT NULL,
        nombre TEXT NOT NULL,
        tipo_cambio REAL NOT NULL,
        PRIMARY KEY(fecha,nombre)
      );
      INSERT INTO monedas(fecha,nombre,tipo_cambio) VALUES('2026-08-01','USD',3.45);
    `);

    runMigrations(db, GLOBAL_MIGRATIONS, { logger: silent, scope: 'global-test' });
    assert.equal(columnExists(db, 'entidades', 'tipo_documento'), true);
    assert.equal(columnExists(db, 'plan_cuentas', 'estado_resultados'), true);
    for (const col of ['compra','venta','fuente','fecha_fuente']) {
      assert.equal(columnExists(db, 'monedas', col), true, `falta monedas.${col}`);
    }
    const tc = db.prepare("SELECT * FROM monedas WHERE fecha='2026-08-01' AND nombre='USD'").get();
    assert.equal(Number(tc.venta), 3.45);
    assert.equal(tc.fecha_fuente, '2026-08-01');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entidades').get().n, 1);
  } finally { close(); }
});
