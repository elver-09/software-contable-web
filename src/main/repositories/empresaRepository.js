"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function obtenerPerfil(db, ...params) {
  return db.prepare("SELECT * FROM config_empresa WHERE id = 1").get(...params);
}

function prepararGuardadoPerfil(db) {
  return db.prepare(`
      INSERT INTO config_empresa (id, nombre_comercial, ruc, direccion_fiscal, telefono, correo, periodo_contable, logo)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre_comercial=excluded.nombre_comercial,
        ruc=excluded.ruc,
        direccion_fiscal=excluded.direccion_fiscal,
        telefono=excluded.telefono,
        correo=excluded.correo,
        periodo_contable=excluded.periodo_contable,
        logo=excluded.logo
    `);
}
function guardarPeriodo(db, periodo) {
  return db.prepare(`INSERT INTO config_empresa (id, periodo_contable) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET periodo_contable=excluded.periodo_contable`).run(periodo);
}
function renombrarDirectorio(db,id,nombre) {
  const info=db.prepare('UPDATE empresas SET nombre=? WHERE id=?').run(nombre,id);
  if(info.changes!==1) throw Error('Empresa no encontrada.');
}
module.exports = { renombrarDirectorio, obtenerPerfil, prepararGuardadoPerfil, guardarPeriodo };
