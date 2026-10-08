// src/tests/helpers/testDb.js
// Usa better-sqlite3 cuando está instalado (entorno real del proyecto) y
// node:sqlite como fallback para poder ejecutar la suite en Node 22+.

function createTestDatabase(filename = ':memory:') {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(filename);
    return { db, driver: 'better-sqlite3', close: () => db.close() };
  } catch (_) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(filename);
    return { db, driver: 'node:sqlite', close: () => db.close() };
  }
}

module.exports = { createTestDatabase };
