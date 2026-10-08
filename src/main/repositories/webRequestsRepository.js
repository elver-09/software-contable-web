"use strict";
function obtenerSolicitud(db, id) {
  return db.prepare("SELECT * FROM _web_requests WHERE id=?").get(id);
}
function guardarSolicitud(db, id, hash, result) {
  return db.prepare("INSERT INTO _web_requests (id,hash,result) VALUES (?,?,?)").run(id, hash, result);
}
module.exports = { obtenerSolicitud, guardarSolicitud };
