"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function getSiguienteNumero_get_vouchers(db, ...params) {
  return db
    .prepare(
      `
      SELECT COALESCE(MAX(numero_voucher), 0) AS maximo
      FROM vouchers WHERE origen = ? AND periodo = ?
    `,
    )
    .get(...params);
}

function addVoucher_get_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
          SELECT v.id, v.periodo, v.numero_voucher, v.origen
          FROM voucher_detalles vd
          JOIN vouchers v ON v.id = vd.voucher_id
          WHERE UPPER(TRIM(vd.doc_numero)) = UPPER(TRIM(?))
            AND v.origen = ?
          LIMIT 1
        `,
    )
    .get(...params);
}

function prepararInsercionCabecera(db) {
  return db.prepare(
    `SELECT COALESCE(MAX(numero_voucher),0) AS maximo FROM vouchers WHERE origen=? AND periodo=?`,
  );
}

function addVoucher_prepare_vouchers_2(db) {
  return db.prepare(
    `INSERT INTO vouchers (origen,numero_voucher,fecha,periodo,glosa_cabecera,total_debe,total_haber) VALUES (?,?,?,?,?,?,?)`,
  );
}

function prepararInsercionDetalle(db) {
  return db.prepare(
    `INSERT INTO voucher_detalles (voucher_id,cuenta,nombre_cuenta,debe,haber,moneda,tc,equivalente,doc_tipo,doc_numero,fecha_doc,fecha_venc,codigo,razon_social,glosa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
}

function buscarVoucher_get_vouchers(db, ...params) {
  return db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(...params);
}

function buscarVoucher_get_vouchers_2(db, { numV, periodo, origen }) {
  let sql = "SELECT * FROM vouchers WHERE numero_voucher = ? AND periodo = ?";
  const params = [parseInt(numV, 10), periodo];
  if (origen) {
    sql += " AND origen = ?";
    params.push(origen);
  }
  sql += " ORDER BY id DESC LIMIT 1";
  return db.prepare(sql).get(...params);
}

function buscarVoucher_get_vouchers_3(db, ...params) {
  return db
    .prepare(
      "SELECT * FROM vouchers WHERE origen = ? AND numero_voucher = ? ORDER BY id DESC LIMIT 1",
    )
    .get(...params);
}

function buscarVoucher_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
      SELECT d.*, COALESCE(pc.descripcion, d.nombre_cuenta) AS nombre_plan
      FROM voucher_detalles d
      LEFT JOIN plan_cuentas pc ON pc.codigo = d.cuenta
      WHERE d.voucher_id = ? ORDER BY d.id ASC
    `,
    )
    .all(...params);
}

function buscarVoucherPorFactura_all_voucher_detalles(db, { periodo, origen }) {
  let sqlList =
    "SELECT v.*, (SELECT vd.doc_numero FROM voucher_detalles vd WHERE vd.voucher_id = v.id AND vd.doc_numero IS NOT NULL AND TRIM(vd.doc_numero) != '' LIMIT 1) AS doc_numero FROM vouchers v WHERE v.periodo = ?";
  const paramsList = [periodo];
  if (origen) {
    sqlList += " AND v.origen = ?";
    paramsList.push(origen);
  }
  sqlList += " ORDER BY v.id DESC LIMIT 50";
  return db.prepare(sqlList).all(...paramsList);
}

function buscarVoucherPorFactura_all_voucher_detalles_2(db, ...params) {
  return db
    .prepare(
      "SELECT d.*, COALESCE(pc.descripcion, d.nombre_cuenta) AS nombre_plan FROM voucher_detalles d LEFT JOIN plan_cuentas pc ON pc.codigo = d.cuenta WHERE d.voucher_id = ? ORDER BY d.id ASC",
    )
    .all(...params);
}

function buscarVoucherPorFactura_all_vouchers(
  db,
  { docNumero, periodo, origen },
) {
  let sql =
    "SELECT DISTINCT v.* FROM vouchers v JOIN voucher_detalles d ON d.voucher_id = v.id WHERE UPPER(TRIM(d.doc_numero)) = UPPER(TRIM(?))";
  const params = [String(docNumero).trim()];
  if (periodo) {
    sql += " AND v.periodo = ?";
    params.push(periodo);
  }
  if (origen) {
    sql += " AND v.origen = ?";
    params.push(origen);
  }
  sql += " ORDER BY v.id DESC";
  return db.prepare(sql).all(...params);
}

function buscarVoucherPorFactura_all_voucher_detalles_3(db, ...params) {
  return db
    .prepare(
      "SELECT d.*, COALESCE(pc.descripcion, d.nombre_cuenta) AS nombre_plan FROM voucher_detalles d LEFT JOIN plan_cuentas pc ON pc.codigo = d.cuenta WHERE d.voucher_id = ? ORDER BY d.id ASC",
    )
    .all(...params);
}

function updateVoucherCompleto_get_vouchers(db, ...params) {
  return db
    .prepare("SELECT id, origen, fecha FROM vouchers WHERE id = ?")
    .get(...params);
}

function updateVoucherCompleto_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
        SELECT id
        FROM voucher_detalles
        WHERE voucher_id = ?
        ORDER BY id ASC
      `,
    )
    .all(...params);
}

function updateVoucherCompleto_prepare_voucher_detalles(db) {
  return db.prepare(`
        UPDATE voucher_detalles SET
          cuenta = ?, nombre_cuenta = ?, debe = ?, haber = ?, moneda = ?, tc = ?, equivalente = ?,
          doc_tipo = ?, doc_numero = ?, fecha_doc = ?, fecha_venc = ?,
          codigo = ?, razon_social = ?, glosa = ?
        WHERE id = ? AND voucher_id = ?
      `);
}

function updateVoucherCompleto_get_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
        SELECT COALESCE(SUM(debe), 0) AS td, COALESCE(SUM(haber), 0) AS th
        FROM voucher_detalles
        WHERE voucher_id = ?
      `,
    )
    .get(...params);
}

function updateVoucherCompleto_run_vouchers(db, ...params) {
  return db
    .prepare(
      `
        UPDATE vouchers
        SET total_debe = ?, total_haber = ?
        WHERE id = ?
      `,
    )
    .run(...params);
}

function listarDocumentosPendientes(db, { tipo }, ...params) {
  let cuentaCondition = "substr(vd.cuenta,1,2) IN ('12','42')";
  if (tipo === "COMPRA") cuentaCondition = "substr(vd.cuenta,1,2) = '42'";
  else if (tipo === "VENTA") cuentaCondition = "substr(vd.cuenta,1,2) = '12'";
  return db
    .prepare(
      `
      SELECT vd.doc_tipo, vd.doc_numero, vd.fecha_doc, vd.fecha_venc, vd.codigo, vd.razon_social, vd.cuenta,
        CASE WHEN substr(vd.cuenta,1,2) = '12' THEN 'CXC' ELSE 'CXP' END AS tipo_cxc,
        SUM(vd.debe) AS total_debe, SUM(vd.haber) AS total_haber,
        CASE WHEN substr(vd.cuenta,1,2) = '12' THEN SUM(vd.debe - vd.haber) ELSE SUM(vd.haber - vd.debe) END AS saldo_pendiente,
        MAX(v.origen) AS origen, MAX(v.periodo) AS periodo, MAX(v.fecha) AS fecha_asiento, MAX(v.id) AS voucher_id, MAX(v.numero_voucher) AS numero_voucher
      FROM voucher_detalles vd JOIN vouchers v ON v.id = vd.voucher_id
      WHERE ${cuentaCondition} AND vd.doc_numero IS NOT NULL AND TRIM(vd.doc_numero) != ''
      GROUP BY vd.doc_numero, vd.codigo, substr(vd.cuenta,1,2)
      HAVING CASE WHEN substr(vd.cuenta,1,2) = '12' THEN SUM(vd.debe - vd.haber) ELSE SUM(vd.haber - vd.debe) END > 0.01
      ORDER BY fecha_asiento DESC LIMIT 100
    `,
    )
    .all(...params);
}
module.exports = {
  getSiguienteNumero_get_vouchers,
  addVoucher_get_voucher_detalles,
  prepararInsercionCabecera,
  addVoucher_prepare_vouchers_2,
  prepararInsercionDetalle,
  buscarVoucher_get_vouchers,
  buscarVoucher_get_vouchers_2,
  buscarVoucher_get_vouchers_3,
  buscarVoucher_all_voucher_detalles,
  buscarVoucherPorFactura_all_voucher_detalles,
  buscarVoucherPorFactura_all_voucher_detalles_2,
  buscarVoucherPorFactura_all_vouchers,
  buscarVoucherPorFactura_all_voucher_detalles_3,
  updateVoucherCompleto_get_vouchers,
  updateVoucherCompleto_all_voucher_detalles,
  updateVoucherCompleto_prepare_voucher_detalles,
  updateVoucherCompleto_get_voucher_detalles,
  updateVoucherCompleto_run_vouchers,
  listarDocumentosPendientes,
};
