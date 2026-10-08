"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function addEntidad_run_entidades(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento)
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(...params);
}

function updateEntidad_run_entidades(db, ...params) {
  return db
    .prepare(
      `
          UPDATE entidades
          SET codigo = ?, razon_social = ?, tipo = ?, tipo_documento = ?
          WHERE codigo = ?
        `,
    )
    .run(...params);
}

function updateEntidad_run_entidades_2(db, ...params) {
  return db
    .prepare(
      `
        INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento)
        VALUES (?, ?, ?, ?)
      `,
    )
    .run(...params);
}

function updateEntidad_run_entidades_3(db, ...params) {
  return db
    .prepare(
      `
      UPDATE entidades
      SET codigo = ?, razon_social = ?, tipo = ?, tipo_documento = ?
      WHERE codigo = ?
    `,
    )
    .run(...params);
}

function deleteEntidad_run_entidades(db, ...params) {
  return db.prepare("DELETE FROM entidades WHERE codigo = ?").run(...params);
}

function deleteEntidad_run_entidades_2(db, ...params) {
  return db.prepare("DELETE FROM entidades WHERE codigo = ?").run(...params);
}

function importFromExcel_prepare_entidades(db) {
  return db.prepare(
    `INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento) VALUES (?, ?, ?, ?) ON CONFLICT(codigo) DO UPDATE SET razon_social=excluded.razon_social, tipo=excluded.tipo, tipo_documento=excluded.tipo_documento`,
  );
}
module.exports = {
  addEntidad_run_entidades,
  updateEntidad_run_entidades,
  updateEntidad_run_entidades_2,
  updateEntidad_run_entidades_3,
  deleteEntidad_run_entidades,
  deleteEntidad_run_entidades_2,
  importFromExcel_prepare_entidades,
};
