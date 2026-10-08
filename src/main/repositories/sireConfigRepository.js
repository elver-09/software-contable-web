"use strict";
const { configKeys } = require("./identifiers");
// SQL and database access for this module; business decisions remain in its controller.
function _normalizeOfficialEndpoints_run_sire_config(db, ...params) {
  return db
    .prepare(
      `
      UPDATE sire_config
         SET scope = ?, seguridad_base_url = ?, sire_base_url = ?
       WHERE id = 1
         AND (COALESCE(scope,'') <> ?
          OR COALESCE(seguridad_base_url,'') <> ?
          OR COALESCE(sire_base_url,'') <> ?)
    `,
    )
    .run(...params);
}

function getConfig_get_sire_config(db, ...params) {
  return db.prepare("SELECT * FROM sire_config WHERE id = 1").get(...params);
}

function saveConfig_get_sire_config(db, ...params) {
  return db
    .prepare(
      `
      SELECT id, clave_sol_enc, client_secret_enc
      FROM sire_config WHERE id = 1
    `,
    )
    .get(...params);
}

function saveConfig_run_sire_config(db, { keys }, ...params) {
  configKeys(keys);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  return db
    .prepare(
      `UPDATE sire_config SET ${sets}, updated_at = datetime('now','localtime') WHERE id = 1`,
    )
    .run(...params);
}

function saveConfig_run_sire_config_2(db, { keys }, ...params) {
  configKeys(keys);
  const placeholders = keys.map(() => "?").join(", ");
  return db
    .prepare(
      `INSERT INTO sire_config (id, ${keys.join(", ")}) VALUES (1, ${placeholders})`,
    )
    .run(...params);
}

function saveConfig_run_sire_config_3(db, ...params) {
  return db
    .prepare(
      `
        UPDATE sire_config
           SET access_token_enc = NULL,
               token_expires_at = NULL,
               estado_conexion = 'CONFIGURADO'
         WHERE id = 1
      `,
    )
    .run(...params);
}
module.exports = {
  _normalizeOfficialEndpoints_run_sire_config,
  getConfig_get_sire_config,
  saveConfig_get_sire_config,
  saveConfig_run_sire_config,
  saveConfig_run_sire_config_2,
  saveConfig_run_sire_config_3,
};
