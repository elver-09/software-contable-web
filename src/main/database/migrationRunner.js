// src/main/database/migrationRunner.js
// Ejecuta migraciones SQLite numeradas de forma determinista y transaccional.
// Compatible con better-sqlite3 y con node:sqlite para las pruebas automatizadas.

const MIGRATION_TABLE = 'schema_migrations';

function _log(logger, level, message) {
  const fn = logger && typeof logger[level] === 'function' ? logger[level] : null;
  if (fn) fn(message);
}

function tableExists(db, tableName) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
  ).get(tableName));
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) return false;
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(c => c.name === columnName);
}

function indexExists(db, indexName) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='index' AND name=? LIMIT 1"
  ).get(indexName));
}

function addColumnIfMissing(db, tableName, columnName, alterSql) {
  if (!columnExists(db, tableName, columnName)) db.exec(alterSql);
}

function validateMigrationDefinitions(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new Error('No se definieron migraciones de base de datos.');
  }

  const seenVersions = new Set();
  const seenNames = new Set();
  let expected = 1;

  for (const migration of migrations) {
    if (!Number.isInteger(migration?.version) || migration.version <= 0) {
      throw new Error('Cada migración debe tener una versión entera positiva.');
    }
    if (migration.version !== expected) {
      throw new Error(`Las migraciones deben ser consecutivas. Se esperaba v${expected} y se encontró v${migration.version}.`);
    }
    if (!migration.name || typeof migration.name !== 'string') {
      throw new Error(`La migración v${migration.version} no tiene nombre.`);
    }
    if (typeof migration.up !== 'function') {
      throw new Error(`La migración v${migration.version} (${migration.name}) no implementa up(db).`);
    }
    if (seenVersions.has(migration.version) || seenNames.has(migration.name)) {
      throw new Error(`Migración duplicada: v${migration.version} / ${migration.name}.`);
    }
    seenVersions.add(migration.version);
    seenNames.add(migration.name);
    expected++;
  }
}

function readAppliedMigrations(db) {
  if (!tableExists(db, MIGRATION_TABLE)) return [];
  return db.prepare(`
    SELECT version, name, applied_at
    FROM ${MIGRATION_TABLE}
    ORDER BY version ASC
  `).all();
}

function getMigrationState(db, migrations) {
  validateMigrationDefinitions(migrations);
  const applied = readAppliedMigrations(db);
  const byVersion = new Map(migrations.map(m => [m.version, m]));
  const latestVersion = migrations[migrations.length - 1].version;

  // Una BD creada por una versión más reciente no debe abrirse con software antiguo.
  const future = applied.find(row => Number(row.version) > latestVersion);
  if (future) {
    throw new Error(
      `La base de datos usa la migración v${future.version}, pero esta versión del software solo conoce hasta v${latestVersion}. ` +
      'Actualice el software antes de abrir esta base.'
    );
  }

  // El historial aplicado debe ser un prefijo continuo: 1,2,3... Nunca 1,3.
  for (let i = 0; i < applied.length; i++) {
    const row = applied[i];
    const expectedVersion = i + 1;
    if (Number(row.version) !== expectedVersion) {
      throw new Error(
        `Historial de migraciones inconsistente: se esperaba v${expectedVersion} y se encontró v${row.version}.`
      );
    }
    const definition = byVersion.get(Number(row.version));
    if (!definition) {
      throw new Error(`La migración aplicada v${row.version} no existe en esta versión del software.`);
    }
    if (String(row.name) !== definition.name) {
      throw new Error(
        `La migración v${row.version} fue registrada como "${row.name}", pero el software espera "${definition.name}". ` +
        'No se modifican migraciones ya publicadas.'
      );
    }
  }

  const currentVersion = applied.length ? Number(applied[applied.length - 1].version) : 0;
  const pending = migrations.filter(m => m.version > currentVersion);

  return {
    currentVersion,
    latestVersion,
    applied,
    pending,
    upToDate: pending.length === 0,
  };
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function runMigrations(db, migrations, { scope = 'database', logger = console } = {}) {
  const before = getMigrationState(db, migrations);
  if (before.upToDate) {
    _log(logger, 'log', `DB ${scope}: esquema actualizado en v${before.currentVersion}.`);
    return { ...before, appliedNow: [] };
  }

  const appliedNow = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureMigrationTable(db);

    for (const migration of before.pending) {
      _log(logger, 'log', `DB ${scope}: aplicando v${migration.version} ${migration.name}...`);
      migration.up(db);
      db.prepare(`
        INSERT INTO ${MIGRATION_TABLE} (version, name)
        VALUES (?, ?)
      `).run(migration.version, migration.name);
      appliedNow.push({ version: migration.version, name: migration.name });
    }

    const latestVersion = migrations[migrations.length - 1].version;
    db.exec(`PRAGMA user_version = ${latestVersion}`);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    _log(logger, 'error', `DB ${scope}: migración revertida: ${error.message}`);
    throw new Error(`No se pudo actualizar la base de datos (${scope}): ${error.message}`);
  }

  const after = getMigrationState(db, migrations);
  _log(logger, 'log', `DB ${scope}: migración completada v${before.currentVersion} → v${after.currentVersion}.`);
  return { ...after, appliedNow };
}

module.exports = {
  MIGRATION_TABLE,
  tableExists,
  columnExists,
  indexExists,
  addColumnIfMissing,
  validateMigrationDefinitions,
  readAppliedMigrations,
  getMigrationState,
  runMigrations,
};
