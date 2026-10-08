"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function registrarRutasIPC_all_config_notas_eeff(db, ...params) {
  return db
    .prepare(
      "SELECT * FROM config_notas_eeff WHERE categoria IN ('ACTIVO_CORRIENTE','ACTIVO_NO_CORRIENTE','PASIVO_CORRIENTE','PASIVO_NO_CORRIENTE','PATRIMONIO') ORDER BY categoria, orden, id",
    )
    .all(...params);
}

function registrarRutasIPC_run_config_notas_eeff(db, ...params) {
  return db
    .prepare(
      "UPDATE config_notas_eeff SET numero=?,nombre=?,categoria=?,cuentas=?,orden=? WHERE id=?",
    )
    .run(...params);
}

function registrarRutasIPC_run_config_notas_eeff_2(db, ...params) {
  return db
    .prepare(
      "INSERT INTO config_notas_eeff (numero,nombre,categoria,cuentas,orden) VALUES (?,?,?,?,?)",
    )
    .run(...params);
}

function registrarRutasIPC_run_config_notas_eeff_3(db, ...params) {
  return db.prepare("DELETE FROM config_notas_eeff WHERE id=?").run(...params);
}

function registrarRutasIPC_all_config_notas_eeff_2(db, ...params) {
  return db
    .prepare(
      "SELECT * FROM config_notas_eeff WHERE categoria IN ('ACTIVO_CORRIENTE','ACTIVO_NO_CORRIENTE','PASIVO_CORRIENTE','PASIVO_NO_CORRIENTE','PATRIMONIO') ORDER BY categoria, orden, id",
    )
    .all(...params);
}

function registrarRutasIPC_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
          SELECT vd.cuenta AS cuenta,
            CASE WHEN SUM(vd.debe) >= SUM(vd.haber) THEN SUM(vd.debe) - SUM(vd.haber) ELSE 0 END AS saldo_deudor,
            CASE WHEN SUM(vd.haber) > SUM(vd.debe) THEN SUM(vd.haber) - SUM(vd.debe) ELSE 0 END AS saldo_acreedor,
            MAX(vd.nombre_cuenta) AS nombre_cuenta
          FROM voucher_detalles vd JOIN vouchers v ON v.id = vd.voucher_id
          WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
          GROUP BY vd.cuenta
        `,
    )
    .all(...params);
}

function registrarRutasIPC_get_sire_config(db, ...params) {
  return db
    .prepare(
      "SELECT cuenta_gasto,cuenta_ingreso,cuenta_igv_compras,cuenta_igv_ventas,cuenta_cxp,cuenta_cxc FROM sire_config WHERE id=1",
    )
    .get(...params);
}

function registrarRutasIPC_run_sire_config(db, ...params) {
  return db
    .prepare(
      "UPDATE sire_config SET cuenta_gasto=?,cuenta_ingreso=?,cuenta_igv_compras=?,cuenta_igv_ventas=?,cuenta_cxp=?,cuenta_cxc=? WHERE id=1",
    )
    .run(...params);
}

function registrarRutasIPC_get_plan_cuentas(db, ...params) {
  return db
    .prepare("SELECT descripcion FROM plan_cuentas WHERE codigo = ? LIMIT 1")
    .get(...params);
}
module.exports = {
  registrarRutasIPC_all_config_notas_eeff,
  registrarRutasIPC_run_config_notas_eeff,
  registrarRutasIPC_run_config_notas_eeff_2,
  registrarRutasIPC_run_config_notas_eeff_3,
  registrarRutasIPC_all_config_notas_eeff_2,
  registrarRutasIPC_all_voucher_detalles,
  registrarRutasIPC_get_sire_config,
  registrarRutasIPC_run_sire_config,
  registrarRutasIPC_get_plan_cuentas,
};
