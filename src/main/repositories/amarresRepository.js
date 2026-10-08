"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function getAmarres_all_amarres_asistente(db, ...params) {
  return db
    .prepare(
      `
      SELECT id, nombre, tipo, prefijo, doc_tipo, moneda,
             cuenta_igv, cuenta_igv_exo, cuenta_igv_ina, cuenta_destino, activo
      FROM amarres_asistente
      ORDER BY tipo ASC, LENGTH(prefijo) DESC, prefijo ASC
    `,
    )
    .all(...params);
}

function addAmarre_run_amarres_asistente(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO amarres_asistente
        (nombre, tipo, prefijo, doc_tipo, moneda, cuenta_igv, cuenta_igv_exo, cuenta_igv_ina, cuenta_destino, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(...params);
}

function updateAmarre_run_amarres_asistente(db, ...params) {
  return db
    .prepare(
      `
      UPDATE amarres_asistente
      SET nombre = ?, tipo = ?, prefijo = ?, doc_tipo = ?, moneda = ?,
          cuenta_igv = ?, cuenta_igv_exo = ?, cuenta_igv_ina = ?, cuenta_destino = ?, activo = ?
      WHERE id = ?
    `,
    )
    .run(...params);
}

function deleteAmarre_run_amarres_asistente(db, ...params) {
  return db
    .prepare("DELETE FROM amarres_asistente WHERE id = ?")
    .run(...params);
}
module.exports = {
  getAmarres_all_amarres_asistente,
  addAmarre_run_amarres_asistente,
  updateAmarre_run_amarres_asistente,
  deleteAmarre_run_amarres_asistente,
};
