"use strict";
const { configKeys } = require("./identifiers");
// SQL and database access for this module; business decisions remain in its controller.
function _getConfig_get_sire_config(db, ...params) {
  return db.prepare("SELECT * FROM sire_config WHERE id = 1").get(...params);
}

function _updateConfig_get_sire_config(db, ...params) {
  return db.prepare("SELECT id FROM sire_config WHERE id = 1").get(...params);
}

function _updateConfig_run_sire_config(db, { keys }, ...params) {
  configKeys(keys);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  return db
    .prepare(
      `UPDATE sire_config SET ${sets}, updated_at = datetime('now','localtime') WHERE id = 1`,
    )
    .run(...params);
}

function _updateConfig_run_sire_config_2(db, { keys }, ...params) {
  configKeys(keys);
  return db
    .prepare(
      `INSERT INTO sire_config (id, ${keys.join(", ")}) VALUES (1, ${keys.map(() => "?").join(", ")})`,
    )
    .run(...params);
}
module.exports = {
  _getConfig_get_sire_config,
  _updateConfig_get_sire_config,
  _updateConfig_run_sire_config,
  _updateConfig_run_sire_config_2,
};
