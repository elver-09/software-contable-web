"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function _getNotas_all_config_notas_er(db, ...params) {
  return db
    .prepare(
      `
    SELECT id, numero, nombre, bloque, cuentas, orden,
           concepto_key, COALESCE(preestablecida,0) AS preestablecida
    FROM config_notas_er
    WHERE COALESCE(preestablecida,0)=1
    ORDER BY CASE bloque
      WHEN 'BRUTA' THEN 1
      WHEN 'OPERATIVA' THEN 2
      WHEN 'ANTES_FINANCIAMIENTO' THEN 3
      WHEN 'ANTES_IMPUESTO' THEN 4
      WHEN 'NETA' THEN 5
      ELSE 99 END,
      orden, id
  `,
    )
    .all(...params);
}

function saveNota_get_config_notas_er(db, ...params) {
  return db
    .prepare(
      `
      SELECT id,numero,nombre,bloque,cuentas,orden,concepto_key,COALESCE(preestablecida,0) AS preestablecida
      FROM config_notas_er WHERE id=?
    `,
    )
    .get(...params);
}

function saveNota_run_config_notas_er(db, ...params) {
  return db
    .prepare(
      `
      UPDATE config_notas_er
      SET numero=?, nombre=?, bloque=?, cuentas=?, orden=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `,
    )
    .run(...params);
}

function deleteNota_get_config_notas_er(db, ...params) {
  return db
    .prepare("SELECT preestablecida FROM config_notas_er WHERE id=?")
    .get(...params);
}

function deleteNota_run_config_notas_er(db, ...params) {
  return db.prepare("DELETE FROM config_notas_er WHERE id=?").run(...params);
}

function _queryBalanceNaturaleza_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
    SELECT vd.cuenta AS cuenta,
      COALESCE(MAX(pc.descripcion), MAX(vd.nombre_cuenta), '') AS nombre,
      SUM(vd.debe) AS sum_debe,
      SUM(vd.haber) AS sum_haber,
      CASE WHEN SUM(vd.debe)>=SUM(vd.haber) THEN SUM(vd.debe)-SUM(vd.haber) ELSE 0 END AS saldo_deudor,
      CASE WHEN SUM(vd.haber)>SUM(vd.debe) THEN SUM(vd.haber)-SUM(vd.debe) ELSE 0 END AS saldo_acreedor
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
    GROUP BY vd.cuenta
    ORDER BY vd.cuenta
  `,
    )
    .all(...params);
}
module.exports = {
  _getNotas_all_config_notas_er,
  saveNota_get_config_notas_er,
  saveNota_run_config_notas_er,
  deleteNota_get_config_notas_er,
  deleteNota_run_config_notas_er,
  _queryBalanceNaturaleza_all_voucher_detalles,
};
