"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function addDocumento_run_tipos_documentos(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO tipos_documentos (codigo, descripcion)
      VALUES (?, ?)
    `,
    )
    .run(...params);
}

function updateDocumento_run_tipos_documentos(db, ...params) {
  return db
    .prepare(
      `
          UPDATE tipos_documentos
          SET codigo = ?, descripcion = ?
          WHERE codigo = ?
        `,
    )
    .run(...params);
}

function updateDocumento_run_tipos_documentos_2(db, ...params) {
  return db
    .prepare(
      `
        INSERT INTO tipos_documentos (codigo, descripcion)
        VALUES (?, ?)
      `,
    )
    .run(...params);
}

function updateDocumento_run_tipos_documentos_3(db, ...params) {
  return db
    .prepare(
      `
      UPDATE tipos_documentos
      SET codigo = ?, descripcion = ?
      WHERE codigo = ?
    `,
    )
    .run(...params);
}

function deleteDocumento_run_tipos_documentos(db, ...params) {
  return db
    .prepare("DELETE FROM tipos_documentos WHERE codigo = ?")
    .run(...params);
}

function deleteDocumento_run_tipos_documentos_2(db, ...params) {
  return db
    .prepare("DELETE FROM tipos_documentos WHERE codigo = ?")
    .run(...params);
}

function importFromExcel_prepare_tipos_documentos(db) {
  return db.prepare(`
      INSERT INTO tipos_documentos (codigo, descripcion)
      VALUES (?, ?)
      ON CONFLICT(codigo) DO UPDATE SET descripcion=excluded.descripcion
    `);
}
module.exports = {
  addDocumento_run_tipos_documentos,
  updateDocumento_run_tipos_documentos,
  updateDocumento_run_tipos_documentos_2,
  updateDocumento_run_tipos_documentos_3,
  deleteDocumento_run_tipos_documentos,
  deleteDocumento_run_tipos_documentos_2,
  importFromExcel_prepare_tipos_documentos,
};
