const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./helpers/testDb');
const {
  runMigrations,
  getMigrationState,
  tableExists,
  columnExists,
} = require('../main/database/migrationRunner');

const silent = { log() {}, error() {} };

test('migrationRunner aplica migraciones consecutivas y es idempotente', () => {
  const { db, close } = createTestDatabase();
  try {
    const migrations = [
      { version: 1, name: 'crear_demo', up(d) { d.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY)'); } },
      { version: 2, name: 'agregar_nombre', up(d) { d.exec('ALTER TABLE demo ADD COLUMN nombre TEXT'); } },
    ];

    const first = runMigrations(db, migrations, { logger: silent, scope: 'test' });
    assert.equal(first.currentVersion, 2);
    assert.deepEqual(first.appliedNow.map(m => m.version), [1, 2]);
    assert.equal(tableExists(db, 'demo'), true);
    assert.equal(columnExists(db, 'demo', 'nombre'), true);

    const second = runMigrations(db, migrations, { logger: silent, scope: 'test' });
    assert.equal(second.currentVersion, 2);
    assert.deepEqual(second.appliedNow, []);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 2);
  } finally { close(); }
});

test('migrationRunner revierte todo el lote si una migración falla', () => {
  const { db, close } = createTestDatabase();
  try {
    const migrations = [
      { version: 1, name: 'crear_demo', up(d) { d.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY)'); } },
      { version: 2, name: 'fallar', up(d) { d.exec('ESTO NO ES SQL'); } },
    ];

    assert.throws(
      () => runMigrations(db, migrations, { logger: silent, scope: 'rollback' }),
      /No se pudo actualizar la base de datos/
    );
    assert.equal(tableExists(db, 'demo'), false);
    assert.equal(tableExists(db, 'schema_migrations'), false);
  } finally { close(); }
});

test('migrationRunner bloquea bases creadas por una versión futura', () => {
  const { db, close } = createTestDatabase();
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_migrations(version,name) VALUES(99,'futura');
    `);
    const migrations = [{ version: 1, name: 'base', up() {} }];
    assert.throws(() => getMigrationState(db, migrations), /versión del software|software solo conoce/);
  } finally { close(); }
});

test('migrationRunner detecta historial con huecos', () => {
  const { db, close } = createTestDatabase();
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_migrations(version,name) VALUES(1,'uno');
      INSERT INTO schema_migrations(version,name) VALUES(3,'tres');
    `);
    const migrations = [
      { version: 1, name: 'uno', up() {} },
      { version: 2, name: 'dos', up() {} },
      { version: 3, name: 'tres', up() {} },
    ];
    assert.throws(() => getMigrationState(db, migrations), /Historial de migraciones inconsistente/);
  } finally { close(); }
});
