"use strict";
// SQL and database access for this module; business decisions remain in its controller.
function _obtenerDocumentosBase_all_voucher_detalles(db, ...params) {
  return db
    .prepare(
      `
    SELECT
      CASE WHEN substr(vd.cuenta,1,2) IN ('12','16') THEN 'CXC' ELSE 'CXP' END AS tipo,
      COALESCE(NULLIF(TRIM(vd.doc_tipo), ''), '—') AS doc_tipo,
      COALESCE(NULLIF(TRIM(vd.doc_numero), ''), '—') AS doc_numero,
      COALESCE(NULLIF(TRIM(vd.codigo), ''), '') AS codigo,
      COALESCE(NULLIF(TRIM(vd.razon_social), ''), 'Sin entidad') AS razon_social,
      vd.fecha_venc AS fecha_venc,
      MIN(NULLIF(vd.fecha_doc, '')) AS fecha_emision,
      CASE
        WHEN substr(vd.cuenta,1,2) IN ('12','16') THEN SUM(COALESCE(vd.debe,0) - COALESCE(vd.haber,0))
        ELSE SUM(COALESCE(vd.haber,0) - COALESCE(vd.debe,0))
      END AS saldo,
      COUNT(DISTINCT vd.voucher_id) AS movimientos
    FROM voucher_detalles vd
    WHERE vd.fecha_venc IS NOT NULL
      AND TRIM(vd.fecha_venc) <> ''
      AND substr(vd.cuenta,1,2) IN ('12','16','42','46')
    GROUP BY
      tipo,
      COALESCE(NULLIF(TRIM(vd.doc_tipo), ''), '—'),
      COALESCE(NULLIF(TRIM(vd.doc_numero), ''), '—'),
      COALESCE(NULLIF(TRIM(vd.codigo), ''), ''),
      COALESCE(NULLIF(TRIM(vd.razon_social), ''), 'Sin entidad'),
      vd.fecha_venc
    HAVING saldo > 0.009
    ORDER BY vd.fecha_venc ASC, razon_social ASC, doc_numero ASC
  `,
    )
    .all(...params);
}
module.exports = { _obtenerDocumentosBase_all_voucher_detalles };
