"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function getDashboardData_get_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
      SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ?
        AND substr(vd.cuenta, 1, 1) = '7'
    `,
    )
    .get(...params);
}

function getDashboardData_get_voucher_detalles_2(db, ...params) {
  return db
    .prepare(
      `
      SELECT COALESCE(SUM(vd.debe - vd.haber), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ?
        AND substr(vd.cuenta, 1, 1) = '6'
    `,
    )
    .get(...params);
}

function getDashboardData_get_vouchers(db, ...params) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM vouchers WHERE periodo = ?`)
    .get(...params);
}

function getDashboardData_get_vouchers_2(db, ...params) {
  return db
    .prepare(
      `
      SELECT COALESCE(SUM(total_haber), 0) AS total
      FROM vouchers WHERE periodo = ? AND origen = '14'
    `,
    )
    .get(...params);
}

function getDashboardData_get_voucher_detalles_3(db, ...params) {
  return db
    .prepare(
      `
      SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ? AND v.origen = '14' AND substr(vd.cuenta,1,2) = '40'
    `,
    )
    .get(...params);
}

function getDashboardData_get_voucher_detalles_4(db, ...params) {
  return db
    .prepare(
      `
    SELECT COALESCE(SUM(vd.debe - vd.haber), 0) AS saldo
    FROM voucher_detalles vd
    WHERE substr(vd.cuenta, 1, 2) IN ('12', '16')
  `,
    )
    .get(...params);
}

function getDashboardData_get_voucher_detalles_5(db, ...params) {
  return db
    .prepare(
      `
    SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS saldo
    FROM voucher_detalles vd
    WHERE substr(vd.cuenta, 1, 2) IN ('42', '46')
  `,
    )
    .get(...params);
}

function getDashboardData_get_vouchers_3(db, ...params) {
  return db.prepare(`SELECT COUNT(*) AS n FROM vouchers`).get(...params);
}

function getDashboardData_get_plan_cuentas(db, ...params) {
  return db.prepare(`SELECT COUNT(*) AS n FROM plan_cuentas`).get(...params);
}

function getDashboardData_get_entidades(db, ...params) {
  return db.prepare(`SELECT COUNT(*) AS n FROM entidades`).get(...params);
}

function getDashboardData_get_vouchers_4(db, ...params) {
  return db
    .prepare(
      `
    SELECT COALESCE(SUM(total_debe),0) AS debe, COALESCE(SUM(total_haber),0) AS haber
    FROM vouchers WHERE periodo = ?
  `,
    )
    .get(...params);
}

function getDashboardData_all_vouchers(db, ...params) {
  return db
    .prepare(
      `
    SELECT
      v.periodo AS periodo,
      SUM(CASE WHEN substr(vd.cuenta,1,1) = '7' THEN (vd.haber - vd.debe) ELSE 0 END) AS ingresos,
      SUM(CASE WHEN substr(vd.cuenta,1,1) = '6' THEN (vd.debe - vd.haber) ELSE 0 END) AS gastos,
      COUNT(DISTINCT v.id) AS asientos
    FROM vouchers v
    JOIN voucher_detalles vd ON vd.voucher_id = v.id
    WHERE v.periodo BETWEEN ? AND ?
    GROUP BY v.periodo
    ORDER BY periodo ASC
  `,
    )
    .all(...params);
}

function getDashboardData_all_vouchers_2(db, ...params) {
  return db
    .prepare(
      `
    SELECT periodo AS periodo, origen, COALESCE(SUM(total_haber),0) AS total
    FROM vouchers
    WHERE periodo BETWEEN ? AND ? AND origen IN ('14','8')
    GROUP BY periodo, origen
  `,
    )
    .all(...params);
}

function getDashboardData_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
    SELECT v.periodo AS periodo, v.origen AS origen,
           COALESCE(SUM(vd.haber - vd.debe),0) AS neto40
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo BETWEEN ? AND ?
      AND v.origen IN ('14','8') AND substr(vd.cuenta,1,2) = '40'
    GROUP BY v.periodo, v.origen
  `,
    )
    .all(...params);
}

function getDashboardData_all_voucher_detalles_2(db, ...params) {
  return db
    .prepare(
      `
    SELECT codigo, razon_social, SUM(total) AS total FROM (
      SELECT
        (SELECT vd.codigo       FROM voucher_detalles vd WHERE vd.voucher_id = v.id AND vd.codigo       IS NOT NULL AND vd.codigo       <> '' LIMIT 1) AS codigo,
        (SELECT vd.razon_social FROM voucher_detalles vd WHERE vd.voucher_id = v.id AND vd.razon_social IS NOT NULL AND vd.razon_social <> '' LIMIT 1) AS razon_social,
        v.total_haber AS total
      FROM vouchers v WHERE v.origen = ?
    ) WHERE codigo IS NOT NULL AND codigo <> ''
    GROUP BY codigo, razon_social
    ORDER BY total DESC
    LIMIT 6
  `,
    )
    .all(...params);
}

function getDashboardData_all_voucher_detalles_3(db, ...params) {
  return db
    .prepare(
      `
    SELECT
      substr(vd.cuenta, 1, 2) AS rubro,
      SUM(vd.debe - vd.haber)   AS importe
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo = ?
      AND substr(vd.cuenta, 1, 1) = '6'
    GROUP BY substr(vd.cuenta, 1, 2)
    HAVING SUM(vd.debe - vd.haber) > 0.01
    ORDER BY importe DESC
    LIMIT 10
  `,
    )
    .all(...params);
}

function getDashboardData_get_plan_cuentas_2(db, ...params) {
  return db
    .prepare(
      `
      SELECT descripcion FROM plan_cuentas WHERE codigo = ? LIMIT 1
    `,
    )
    .get(...params);
}

function getDashboardData_all_voucher_detalles_4(db, ...params) {
  return db
    .prepare(
      `
    SELECT
      vd.cuenta,
      COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS descripcion,
      SUM(vd.debe)  AS total_debe,
      SUM(vd.haber) AS total_haber,
      SUM(vd.debe - vd.haber) AS saldo
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo = ?
    GROUP BY vd.cuenta
    ORDER BY SUM(vd.debe) DESC
    LIMIT 5
  `,
    )
    .all(...params);
}

function getDashboardData_all_voucher_detalles_5(db, ...params) {
  return db
    .prepare(
      `
    SELECT
      vd.cuenta,
      COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS descripcion,
      SUM(vd.debe)  AS total_debe,
      SUM(vd.haber) AS total_haber,
      SUM(vd.haber - vd.debe) AS saldo
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo = ?
    GROUP BY vd.cuenta
    ORDER BY SUM(vd.haber) DESC
    LIMIT 5
  `,
    )
    .all(...params);
}

function getDashboardData_all_vouchers_3(db, ...params) {
  return db
    .prepare(
      `
    SELECT fecha, COUNT(*) AS cantidad
    FROM vouchers
    WHERE periodo = ?
    GROUP BY fecha
    ORDER BY fecha ASC
  `,
    )
    .all(...params);
}

function getDashboardData_all_vouchers_4(db, ...params) {
  return db
    .prepare(
      `
    SELECT periodo AS periodo,
           ABS(SUM(total_debe) - SUM(total_haber)) AS diferencia
    FROM vouchers
    WHERE periodo BETWEEN ? AND ?
    GROUP BY periodo
    HAVING ABS(SUM(total_debe) - SUM(total_haber)) > 0.01
    ORDER BY periodo DESC
  `,
    )
    .all(...params);
}

function getDashboardData_get_vouchers_5(db, ...params) {
  return db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM vouchers
    WHERE periodo = ?
      AND (glosa_cabecera IS NULL OR TRIM(glosa_cabecera) = '')
  `,
    )
    .get(...params);
}

function getDashboardData_all_voucher_detalles_6(db, ...params) {
  return db
    .prepare(
      `
    SELECT vd.doc_tipo, vd.doc_numero, vd.fecha_venc, vd.codigo, vd.razon_social,
           vd.debe, vd.haber, vd.cuenta,
           CASE WHEN substr(vd.cuenta,1,2) IN ('12','16') THEN 'CXC' ELSE 'CXP' END AS tipo_cxc,
           v.id AS voucher_id, v.origen, v.numero_voucher
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE vd.fecha_venc IS NOT NULL
      AND vd.fecha_venc != ''
      AND vd.fecha_venc < ?
      AND substr(vd.cuenta,1,2) IN ('12','16','42','46')
    ORDER BY vd.fecha_venc ASC
  `,
    )
    .all(...params);
}

function getDashboardData_get_voucher_detalles_6(db, ...params) {
  return db
    .prepare(
      `
      SELECT COUNT(*) AS n
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ? AND substr(vd.cuenta,1,1) = '7'
    `,
    )
    .get(...params);
}

function getDashboardData_all_vouchers_5(db, ...params) {
  return db
    .prepare(
      `
    SELECT origen, COUNT(*) AS cantidad
    FROM vouchers
    WHERE periodo = ?
    GROUP BY origen
    ORDER BY cantidad DESC, origen DESC
  `,
    )
    .all(...params);
}

function getDashboardData_all_entidades(db, ...params) {
  return db
    .prepare(
      `
    SELECT tipo, COUNT(*) AS cantidad FROM entidades GROUP BY tipo ORDER BY cantidad DESC
  `,
    )
    .all(...params);
}

function getDashboardData_all_vouchers_6(db, ...params) {
  return db
    .prepare(
      `
    SELECT fecha, COUNT(*) AS cantidad, SUM(total_debe) AS debe, SUM(total_haber) AS haber
    FROM vouchers
    WHERE fecha >= ?
    GROUP BY fecha
    ORDER BY fecha ASC
  `,
    )
    .all(...params);
}

function getDashboardData_get_config_empresa(db, ...params) {
  return db.prepare("SELECT * FROM config_empresa WHERE id = 1").get(...params);
}

function getDashboardData_get_monedas(db, ...params) {
  return db
    .prepare(
      `SELECT compra, venta, fecha FROM monedas WHERE nombre = 'USD' ORDER BY fecha DESC LIMIT 1`,
    )
    .get(...params);
}

function getDashboardData_get_sire_config(db, ...params) {
  return db
    .prepare("SELECT estado_conexion FROM sire_config WHERE id = 1")
    .get(...params);
}
module.exports = {
  getDashboardData_get_voucher_detalles,
  getDashboardData_get_voucher_detalles_2,
  getDashboardData_get_vouchers,
  getDashboardData_get_vouchers_2,
  getDashboardData_get_voucher_detalles_3,
  getDashboardData_get_voucher_detalles_4,
  getDashboardData_get_voucher_detalles_5,
  getDashboardData_get_vouchers_3,
  getDashboardData_get_plan_cuentas,
  getDashboardData_get_entidades,
  getDashboardData_get_vouchers_4,
  getDashboardData_all_vouchers,
  getDashboardData_all_vouchers_2,
  getDashboardData_all_voucher_detalles,
  getDashboardData_all_voucher_detalles_2,
  getDashboardData_all_voucher_detalles_3,
  getDashboardData_get_plan_cuentas_2,
  getDashboardData_all_voucher_detalles_4,
  getDashboardData_all_voucher_detalles_5,
  getDashboardData_all_vouchers_3,
  getDashboardData_all_vouchers_4,
  getDashboardData_get_vouchers_5,
  getDashboardData_all_voucher_detalles_6,
  getDashboardData_get_voucher_detalles_6,
  getDashboardData_all_vouchers_5,
  getDashboardData_all_entidades,
  getDashboardData_all_vouchers_6,
  getDashboardData_get_config_empresa,
  getDashboardData_get_monedas,
  getDashboardData_get_sire_config,
};
