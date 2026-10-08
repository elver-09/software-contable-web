"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function _registrarOperacion_run_sire_operaciones(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO sire_operaciones (tipo, periodo, operacion, ticket, estado, archivo_nombre, archivo_path, mensaje)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(...params);
}

function descargarArchivo_get_sire_config(db, ...params) {
  return db.prepare("SELECT ruc FROM sire_config WHERE id = 1").get(...params);
}

function listarArchivos_get_sire_config(db, ...params) {
  return db.prepare("SELECT ruc FROM sire_config WHERE id = 1").get(...params);
}
module.exports = {
  _registrarOperacion_run_sire_operaciones,
  descargarArchivo_get_sire_config,
  listarArchivos_get_sire_config,
};
