"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function getMonedas_all_monedas(db, ...params) {
  return db
    .prepare(
      `
      SELECT fecha, nombre, tipo_cambio, compra, venta, fuente, fecha_fuente
      FROM monedas
      ORDER BY fecha DESC, nombre ASC
    `,
    )
    .all(...params);
}

function addMoneda_run_monedas(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO monedas (fecha, nombre, tipo_cambio, compra, venta, fuente, fecha_fuente)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fecha, nombre) DO UPDATE SET
        tipo_cambio = excluded.tipo_cambio,
        compra = excluded.compra,
        venta = excluded.venta,
        fuente = excluded.fuente,
        fecha_fuente = excluded.fecha_fuente
    `,
    )
    .run(...params);
}

function updateMoneda_run_monedas(db, ...params) {
  return db
    .prepare(
      `
      UPDATE monedas
      SET fecha = ?, nombre = ?, tipo_cambio = ?
      WHERE fecha = ? AND nombre = ?
    `,
    )
    .run(...params);
}

function deleteMoneda_run_monedas(db, ...params) {
  return db
    .prepare(`DELETE FROM monedas WHERE fecha = ? AND nombre = ?`)
    .run(...params);
}

function guardarLoteTiposCambio_all_monedas(db, ...params) {
  return db
    .prepare(
      `SELECT fecha || '|' || nombre AS clave FROM monedas WHERE nombre = ?`,
    )
    .all(...params);
}

function guardarLoteTiposCambio_prepare_monedas(db) {
  return db.prepare(`
    INSERT INTO monedas (fecha, nombre, tipo_cambio, compra, venta, fuente, fecha_fuente)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fecha, nombre) DO UPDATE SET
      tipo_cambio = excluded.tipo_cambio,
      compra = excluded.compra,
      venta = excluded.venta,
      fuente = excluded.fuente,
      fecha_fuente = excluded.fecha_fuente
  `);
}

function fetchAndSaveTipoCambio_get_monedas(db, ...params) {
  return db
    .prepare(
      `
    SELECT fecha, nombre, tipo_cambio, compra, venta, fuente, fecha_fuente
    FROM monedas WHERE fecha = ? AND nombre = ?
  `,
    )
    .get(...params);
}
module.exports = {
  getMonedas_all_monedas,
  addMoneda_run_monedas,
  updateMoneda_run_monedas,
  deleteMoneda_run_monedas,
  guardarLoteTiposCambio_all_monedas,
  guardarLoteTiposCambio_prepare_monedas,
  fetchAndSaveTipoCambio_get_monedas,
};
