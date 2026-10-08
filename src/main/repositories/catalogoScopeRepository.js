"use strict";
const { catalogTable } = require("./identifiers");
// SQL and database access for this module; business decisions remain in its controller.
function listarCatalogo(db, { tableName }, ...params) {
  catalogTable(tableName);
  return db.prepare(`SELECT * FROM ${tableName}`).all(...params);
}

function existeCodigo(db, { tableName }, ...params) {
  catalogTable(tableName);
  return db
    .prepare(`SELECT 1 FROM ${tableName} WHERE codigo = ?`)
    .get(...params);
}

function obtenerPorCodigo(db, { tableName }, ...params) {
  catalogTable(tableName);
  return db
    .prepare(`SELECT * FROM ${tableName} WHERE codigo = ?`)
    .get(...params);
}
module.exports = { listarCatalogo, existeCodigo, obtenerPorCodigo };
