"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function _getLocalContext_get_sire_config(db, ...params) {
  return db.prepare("SELECT ruc FROM sire_config WHERE id = 1").get(...params);
}
module.exports = { _getLocalContext_get_sire_config };
