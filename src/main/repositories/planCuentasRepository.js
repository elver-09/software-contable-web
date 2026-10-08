"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function addCuenta_prepare_plan_cuentas(db) {
  return db.prepare(`
      INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
      VALUES (?, ?, ?, ?, ?)
    `);
}

function updateCuenta_run_plan_cuentas(db, ...params) {
  return db
    .prepare(
      `
          UPDATE plan_cuentas
          SET codigo = ?, descripcion = ?, tipo = ?, nivel = ?, estado_resultados = ?
          WHERE codigo = ?
        `,
    )
    .run(...params);
}

function updateCuenta_run_plan_cuentas_2(db, ...params) {
  return db
    .prepare(
      `
        INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(...params);
}

function updateCuenta_run_plan_cuentas_3(db, ...params) {
  return db
    .prepare(
      `
      UPDATE plan_cuentas
      SET codigo = ?, descripcion = ?, tipo = ?, nivel = ?, estado_resultados = ?
      WHERE codigo = ?
    `,
    )
    .run(...params);
}

function setEstadoResultados_run_plan_cuentas(db, ...params) {
  return db
    .prepare("UPDATE plan_cuentas SET estado_resultados=? WHERE codigo=?")
    .run(...params);
}

function setEstadoResultados_run_plan_cuentas_2(db, ...params) {
  return db
    .prepare(
      `
        INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(...params);
}

function setEstadoResultados_run_plan_cuentas_3(db, ...params) {
  return db
    .prepare("UPDATE plan_cuentas SET estado_resultados=? WHERE codigo=?")
    .run(...params);
}

function deleteCuenta_run_plan_cuentas(db, ...params) {
  return db.prepare("DELETE FROM plan_cuentas WHERE codigo = ?").run(...params);
}

function deleteCuenta_run_plan_cuentas_2(db, ...params) {
  return db.prepare("DELETE FROM plan_cuentas WHERE codigo = ?").run(...params);
}

function importFromExcel_prepare_plan_cuentas(db) {
  return db.prepare(`
      INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET 
        descripcion=excluded.descripcion, 
        tipo=excluded.tipo, 
        nivel=excluded.nivel,
        estado_resultados=excluded.estado_resultados
    `);
}
module.exports = {
  addCuenta_prepare_plan_cuentas,
  updateCuenta_run_plan_cuentas,
  updateCuenta_run_plan_cuentas_2,
  updateCuenta_run_plan_cuentas_3,
  setEstadoResultados_run_plan_cuentas,
  setEstadoResultados_run_plan_cuentas_2,
  setEstadoResultados_run_plan_cuentas_3,
  deleteCuenta_run_plan_cuentas,
  deleteCuenta_run_plan_cuentas_2,
  importFromExcel_prepare_plan_cuentas,
};
