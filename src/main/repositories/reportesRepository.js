"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function getEmpresa_get_config_empresa(db, ...params) {
  return db.prepare("SELECT * FROM config_empresa WHERE id = 1").get(...params);
}

function listarLibroDiario(db, { desde, hasta, origen }) {
  let sql = `
    SELECT v.id AS voucher_id, v.origen, v.numero_voucher, v.fecha, v.glosa_cabecera,
      v.total_debe AS v_total_debe, v.total_haber AS v_total_haber,
      d.id AS detalle_id, d.cuenta, d.nombre_cuenta, d.debe, d.haber,
      d.moneda, d.tc, d.glosa AS detalle_glosa, d.doc_tipo, d.doc_numero,
      d.fecha_doc, d.fecha_venc, d.codigo, d.razon_social
    FROM vouchers v
    INNER JOIN voucher_detalles d ON d.voucher_id = v.id
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
  `;
  const params = [desde, hasta];
  if (origen) {
    sql += " AND v.origen = ?";
    params.push(origen);
  }
  sql += " ORDER BY v.fecha ASC, v.numero_voucher ASC, d.id ASC";
  return db.prepare(sql).all(...params);
}

function listarMovimientosMayor(
  db,
  { desde, hasta, cuentaDesde, cuentaHasta },
) {
  let sqlMov = `
    SELECT vd.cuenta,
      COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS nombre,
      v.fecha, v.origen, v.numero_voucher, vd.glosa, vd.debe, vd.haber,
      vd.doc_tipo, vd.doc_numero
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
  `;
  const paramsMov = [desde, hasta];
  if (cuentaDesde) {
    sqlMov += " AND vd.cuenta >= ?";
    paramsMov.push(cuentaDesde);
  }
  if (cuentaHasta) {
    sqlMov += " AND vd.cuenta <= ?";
    paramsMov.push(cuentaHasta);
  }
  sqlMov += " ORDER BY vd.cuenta ASC, v.fecha ASC, v.numero_voucher ASC";
  return db.prepare(sqlMov).all(...paramsMov);
}

function listarSaldosInicialesMayor(db, { desde, cuentaDesde, cuentaHasta }) {
  let sqlIni = `
    SELECT vd.cuenta, SUM(vd.debe) AS debe_ini, SUM(vd.haber) AS haber_ini
    FROM voucher_detalles vd JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo < substr(?,1,7)
  `;
  const paramsIni = [desde];
  if (cuentaDesde) {
    sqlIni += " AND vd.cuenta >= ?";
    paramsIni.push(cuentaDesde);
  }
  if (cuentaHasta) {
    sqlIni += " AND vd.cuenta <= ?";
    paramsIni.push(cuentaHasta);
  }
  sqlIni += " GROUP BY vd.cuenta";
  return db.prepare(sqlIni).all(...paramsIni);
}

function listarBalanceComprobacion(db, { dig }, ...params) {
  if (!Number.isInteger(dig) || dig < 0 || dig > 32)
    throw Error("Nivel de cuenta inválido");
  const cuentaExpr = dig > 0 ? `substr(vd.cuenta, 1, ${dig})` : "vd.cuenta";
  return db
    .prepare(
      `
    SELECT ${cuentaExpr} AS cuenta,
      COALESCE(MAX(pc.descripcion), MAX(vd.nombre_cuenta), 'Sin descripción') AS nombre,
      SUM(vd.debe) AS sum_debe, SUM(vd.haber) AS sum_haber,
      CASE WHEN SUM(vd.debe)>=SUM(vd.haber) THEN SUM(vd.debe)-SUM(vd.haber) ELSE 0 END AS saldo_deudor,
      CASE WHEN SUM(vd.haber)>SUM(vd.debe) THEN SUM(vd.haber)-SUM(vd.debe) ELSE 0 END AS saldo_acreedor,
      COUNT(DISTINCT v.id) AS num_asientos
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = ${cuentaExpr}
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
    GROUP BY ${cuentaExpr} ORDER BY ${cuentaExpr} ASC
  `,
    )
    .all(...params);
}

function queryEstadoSituacionFinanciera_get_plan_cuentas(db, ...params) {
  return db
    .prepare("SELECT descripcion FROM plan_cuentas WHERE codigo = ? LIMIT 1")
    .get(...params);
}

function queryEstadoSituacionFinanciera_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
    SELECT substr(vd.cuenta,1,2) AS cuenta,
      COALESCE(MAX(pc.descripcion), MAX(vd.nombre_cuenta), '') AS nombre_raw,
      SUM(vd.debe) AS debe, SUM(vd.haber) AS haber,
      SUM(vd.debe - vd.haber) AS saldo_deudor,
      SUM(vd.haber - vd.debe) AS saldo_acreedor
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = substr(vd.cuenta,1,2)
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7)
      AND substr(vd.cuenta,1,1) = ?
    GROUP BY substr(vd.cuenta,1,2)
    HAVING ABS(SUM(vd.debe - vd.haber)) > 0.005
    ORDER BY substr(vd.cuenta,1,2)
  `,
    )
    .all(...params);
}

function queryEstadoSituacionFinanciera_get_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
    SELECT COALESCE(SUM(vd.haber - vd.debe),0) AS total
    FROM voucher_detalles vd JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7) AND substr(vd.cuenta,1,1) = '7'
  `,
    )
    .get(...params);
}

function queryEstadoSituacionFinanciera_get_voucher_detalles_2(db, ...params) {
  return db
    .prepare(
      `
    SELECT COALESCE(SUM(vd.debe - vd.haber),0) AS total
    FROM voucher_detalles vd JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo >= substr(?,1,7) AND v.periodo <= substr(?,1,7) AND substr(vd.cuenta,1,1) = '6'
  `,
    )
    .get(...params);
}

function mapaEntidadesDocTipo_all_entidades(db, ...params) {
  return db
    .prepare("SELECT codigo, tipo_documento FROM entidades")
    .all(...params);
}

function mapaEntidadesDocTipo_all_entidades_2(db, ...params) {
  return db
    .prepare("SELECT codigo, tipo_documento FROM entidades")
    .all(...params);
}

function mapaTiposDocumento_all_tipos_documentos(db, ...params) {
  return db
    .prepare("SELECT codigo, descripcion FROM tipos_documentos")
    .all(...params);
}

function _mapaTributarioVentas_all_comprobantes_tributarios(db, ...params) {
  if (!params.length) return [];
  const ph = params.map(() => "?").join(",");
  return db
    .prepare(
      `
    SELECT ct.voucher_id, ct.fecha_emision, ct.fecha_vencimiento, ct.tipo_documento,
      ct.serie, ct.numero, ct.tipo_doc_identidad, ct.numero_doc_identidad, ct.razon_social,
      ct.moneda, ct.tipo_cambio, ct.ref_fecha, ct.ref_tipo_documento, ct.ref_serie, ct.ref_numero,
      ct.car_sunat, ct.fuente, ct.requiere_revision,
      cv.valor_exportacion, cv.base_gravada, cv.descuento_base, cv.igv, cv.descuento_igv,
      cv.importe_exonerado, cv.importe_inafecto, cv.isc, cv.base_ivap, cv.ivap,
      cv.icbper, cv.otros_tributos, cv.importe_total
    FROM comprobantes_tributarios ct
    JOIN comprobante_venta cv ON cv.comprobante_id = ct.id
    WHERE ct.tipo_registro='VENTA' AND ct.voucher_id IN (${ph})
  `,
    )
    .all(...params);
}

function _mapaTributarioCompras_all_comprobantes_tributarios(db, ...params) {
  if (!params.length) return [];
  const ph = params.map(() => "?").join(",");
  return db
    .prepare(
      `
    SELECT ct.voucher_id, ct.fecha_emision, ct.fecha_vencimiento, ct.tipo_documento,
      ct.serie, ct.numero, ct.tipo_doc_identidad, ct.numero_doc_identidad, ct.razon_social,
      ct.moneda, ct.tipo_cambio, ct.ref_fecha, ct.ref_tipo_documento, ct.ref_serie, ct.ref_numero,
      ct.car_sunat, ct.fuente, ct.requiere_revision,
      cc.g1_base,cc.g1_igv,cc.g2_base,cc.g2_igv,cc.g3_base,cc.g3_igv,
      cc.valor_no_gravado,cc.isc,cc.icbper,cc.otros_tributos,cc.importe_total,
      cc.detraccion_numero,cc.detraccion_fecha,cc.marca_retencion
    FROM comprobantes_tributarios ct
    JOIN comprobante_compra cc ON cc.comprobante_id = ct.id
    WHERE ct.tipo_registro='COMPRA' AND ct.voucher_id IN (${ph})
  `,
    )
    .all(...params);
}

function _getESFNotasData_all_config_notas_eeff(db, ...params) {
  return db
    .prepare(
      "SELECT * FROM config_notas_eeff WHERE categoria IN ('ACTIVO_CORRIENTE','ACTIVO_NO_CORRIENTE','PASIVO_CORRIENTE','PASIVO_NO_CORRIENTE','PATRIMONIO') ORDER BY categoria, orden, id",
    )
    .all(...params);
}

function _getESFNotasData_all_voucher_detalles(db, ...params) {
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

function resumenPeriodo_get_vouchers(db, ...params) {
  return db
    .prepare(
      `
      SELECT COUNT(*) AS asientos, COALESCE(SUM(total_debe),0) AS totalDebe, COALESCE(SUM(total_haber),0) AS totalHaber
      FROM vouchers WHERE periodo >= substr(?,1,7) AND periodo <= substr(?,1,7)
    `,
    )
    .get(...params);
}

function resumenPeriodo_all_vouchers(db, ...params) {
  return db
    .prepare(
      `
      SELECT origen, COUNT(*) AS cantidad FROM vouchers
      WHERE periodo >= substr(?,1,7) AND periodo <= substr(?,1,7) GROUP BY origen ORDER BY cantidad DESC, origen DESC
    `,
    )
    .all(...params);
}
module.exports = {
  getEmpresa_get_config_empresa,
  listarLibroDiario,
  listarMovimientosMayor,
  listarSaldosInicialesMayor,
  listarBalanceComprobacion,
  queryEstadoSituacionFinanciera_get_plan_cuentas,
  queryEstadoSituacionFinanciera_all_voucher_detalles,
  queryEstadoSituacionFinanciera_get_voucher_detalles,
  queryEstadoSituacionFinanciera_get_voucher_detalles_2,
  mapaEntidadesDocTipo_all_entidades,
  mapaEntidadesDocTipo_all_entidades_2,
  mapaTiposDocumento_all_tipos_documentos,
  _mapaTributarioVentas_all_comprobantes_tributarios,
  _mapaTributarioCompras_all_comprobantes_tributarios,
  _getESFNotasData_all_config_notas_eeff,
  _getESFNotasData_all_voucher_detalles,
  resumenPeriodo_get_vouchers,
  resumenPeriodo_all_vouchers,
};
