"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function consultarTicket_run_sire_operaciones(db, ...params) {
  return db
    .prepare(
      `
        UPDATE sire_operaciones SET estado = ?, mensaje = ?
        WHERE ticket = ? AND tipo = ?
      `,
    )
    .run(...params);
}

function getOperaciones_all_sire_operaciones(db, { tipo, periodo, limit }) {
  let sql = "SELECT * FROM sire_operaciones WHERE 1=1";
  const params = [];
  if (tipo) {
    sql += " AND tipo = ?";
    params.push(String(tipo).toUpperCase());
  }
  if (periodo) {
    sql += " AND periodo = ?";
    params.push(periodo);
  }
  sql += " ORDER BY id DESC";
  if (limit) {
    sql += " LIMIT ?";
    params.push(limit);
  }
  return db.prepare(sql).all(...params);
}

function getLogs_all_sire_logs(db, { tipo, periodo, limit }) {
  let sql = "SELECT * FROM sire_logs WHERE 1=1";
  const params = [];
  if (tipo) {
    sql += " AND tipo = ?";
    params.push(String(tipo).toUpperCase());
  }
  if (periodo) {
    sql += " AND periodo = ?";
    params.push(periodo);
  }
  sql += " ORDER BY id DESC";
  if (limit) {
    sql += " LIMIT ?";
    params.push(limit || 100);
  }
  return db.prepare(sql).all(...params);
}
module.exports = {
  consultarTicket_run_sire_operaciones,
  getOperaciones_all_sire_operaciones,
  getLogs_all_sire_logs,
};
