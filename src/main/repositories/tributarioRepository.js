"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function guardarTributario_run_comprobantes_tributarios(db, ...params) {
  return db
    .prepare(
      `
    INSERT INTO comprobantes_tributarios (
      voucher_id,tipo_registro,fecha_emision,fecha_vencimiento,tipo_documento,serie,numero,
      tipo_doc_identidad,numero_doc_identidad,razon_social,moneda,tipo_cambio,
      ref_fecha,ref_tipo_documento,ref_serie,ref_numero,car_sunat,fuente,requiere_revision,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
    ON CONFLICT(voucher_id) DO UPDATE SET
      tipo_registro=excluded.tipo_registro,fecha_emision=excluded.fecha_emision,
      fecha_vencimiento=excluded.fecha_vencimiento,tipo_documento=excluded.tipo_documento,
      serie=excluded.serie,numero=excluded.numero,tipo_doc_identidad=excluded.tipo_doc_identidad,
      numero_doc_identidad=excluded.numero_doc_identidad,razon_social=excluded.razon_social,
      moneda=excluded.moneda,tipo_cambio=excluded.tipo_cambio,ref_fecha=excluded.ref_fecha,
      ref_tipo_documento=excluded.ref_tipo_documento,ref_serie=excluded.ref_serie,
      ref_numero=excluded.ref_numero,car_sunat=excluded.car_sunat,fuente=excluded.fuente,
      requiere_revision=excluded.requiere_revision,updated_at=datetime('now','localtime')
  `,
    )
    .run(...params);
}

function guardarTributario_get_comprobantes_tributarios(db, ...params) {
  return db
    .prepare("SELECT id FROM comprobantes_tributarios WHERE voucher_id=?")
    .get(...params);
}

function guardarTributario_run_comprobante_compra(db, ...params) {
  return db
    .prepare("DELETE FROM comprobante_compra WHERE comprobante_id=?")
    .run(...params);
}

function guardarTributario_run_comprobante_venta(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO comprobante_venta (
        comprobante_id,valor_exportacion,base_gravada,descuento_base,igv,descuento_igv,
        importe_exonerado,importe_inafecto,isc,base_ivap,ivap,icbper,otros_tributos,importe_total
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(comprobante_id) DO UPDATE SET
        valor_exportacion=excluded.valor_exportacion,base_gravada=excluded.base_gravada,
        descuento_base=excluded.descuento_base,igv=excluded.igv,descuento_igv=excluded.descuento_igv,
        importe_exonerado=excluded.importe_exonerado,importe_inafecto=excluded.importe_inafecto,
        isc=excluded.isc,base_ivap=excluded.base_ivap,ivap=excluded.ivap,icbper=excluded.icbper,
        otros_tributos=excluded.otros_tributos,importe_total=excluded.importe_total
    `,
    )
    .run(...params);
}

function guardarTributario_run_comprobante_venta_2(db, ...params) {
  return db
    .prepare("DELETE FROM comprobante_venta WHERE comprobante_id=?")
    .run(...params);
}

function guardarTributario_run_comprobante_compra_2(db, ...params) {
  return db
    .prepare(
      `
      INSERT INTO comprobante_compra (
        comprobante_id,g1_base,g1_igv,g2_base,g2_igv,g3_base,g3_igv,valor_no_gravado,
        isc,icbper,otros_tributos,importe_total,detraccion_numero,detraccion_fecha,marca_retencion
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(comprobante_id) DO UPDATE SET
        g1_base=excluded.g1_base,g1_igv=excluded.g1_igv,g2_base=excluded.g2_base,g2_igv=excluded.g2_igv,
        g3_base=excluded.g3_base,g3_igv=excluded.g3_igv,valor_no_gravado=excluded.valor_no_gravado,
        isc=excluded.isc,icbper=excluded.icbper,otros_tributos=excluded.otros_tributos,
        importe_total=excluded.importe_total,detraccion_numero=excluded.detraccion_numero,
        detraccion_fecha=excluded.detraccion_fecha,marca_retencion=excluded.marca_retencion
    `,
    )
    .run(...params);
}

function obtenerTributario_get_comprobantes_tributarios(db, ...params) {
  return db
    .prepare("SELECT * FROM comprobantes_tributarios WHERE voucher_id=?")
    .get(...params);
}

function obtenerTributario_get_comprobante_venta(db, ...params) {
  return db
    .prepare("SELECT * FROM comprobante_venta WHERE comprobante_id=?")
    .get(...params);
}

function obtenerTributario_get_comprobante_compra(db, ...params) {
  return db
    .prepare("SELECT * FROM comprobante_compra WHERE comprobante_id=?")
    .get(...params);
}
module.exports = {
  guardarTributario_run_comprobantes_tributarios,
  guardarTributario_get_comprobantes_tributarios,
  guardarTributario_run_comprobante_compra,
  guardarTributario_run_comprobante_venta,
  guardarTributario_run_comprobante_venta_2,
  guardarTributario_run_comprobante_compra_2,
  obtenerTributario_get_comprobantes_tributarios,
  obtenerTributario_get_comprobante_venta,
  obtenerTributario_get_comprobante_compra,
};
