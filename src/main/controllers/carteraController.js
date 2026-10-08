'use strict';

const { getDB } = require('../database/db');
const { parseISO: _parseISO, clasificar: _clasificar } = require('../domain/cartera');

function _isoLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function _obtenerDocumentosBase(db) {
  return db.prepare(`
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
  `).all();
}

function getCarteraVencimientos(params = {}) {
  const db = getDB();
  const hoyISO = _isoLocal();
  const pageSize = Math.max(10, Math.min(100, Number(params.pageSize) || 50));
  const page = Math.max(1, Number(params.page) || 1);
  const tipo = String(params.tipo || 'TODOS').toUpperCase();
  const estado = String(params.estado || 'TODOS').toUpperCase();
  const buscar = String(params.buscar || '').trim().toLowerCase();
  const desde = _parseISO(params.desde) ? String(params.desde) : '';
  const hasta = _parseISO(params.hasta) ? String(params.hasta) : '';

  const base = _obtenerDocumentosBase(db).map(r => {
    const cls = _clasificar(r.fecha_venc, hoyISO);
    return {
      tipo: r.tipo,
      doc_tipo: r.doc_tipo,
      doc_numero: r.doc_numero,
      codigo: r.codigo,
      razon_social: r.razon_social,
      fecha_emision: r.fecha_emision || '',
      fecha_venc: r.fecha_venc,
      saldo: Number(r.saldo || 0),
      movimientos: Number(r.movimientos || 0),
      estado: cls.estado,
      dias: cls.dias,
      estado_etiqueta: cls.etiqueta,
    };
  });

  const resumen = base.reduce((acc, r) => {
    if (r.tipo === 'CXC') {
      acc.cxc_documentos += 1;
      acc.cxc_saldo += r.saldo;
    } else {
      acc.cxp_documentos += 1;
      acc.cxp_saldo += r.saldo;
    }
    if (r.estado === 'VENCIDO') {
      acc.vencidos += 1;
      acc.vencidos_saldo += r.saldo;
    }
    if (r.estado === 'PROXIMO' || r.estado === 'HOY') {
      acc.proximos_7 += 1;
      acc.proximos_7_saldo += r.saldo;
    }
    return acc;
  }, {
    cxc_documentos: 0, cxc_saldo: 0,
    cxp_documentos: 0, cxp_saldo: 0,
    vencidos: 0, vencidos_saldo: 0,
    proximos_7: 0, proximos_7_saldo: 0,
  });

  let filtrados = base.filter(r => {
    if (tipo !== 'TODOS' && r.tipo !== tipo) return false;
    if (estado === 'VENCIDO' && r.estado !== 'VENCIDO') return false;
    if (estado === 'PROXIMO' && !['PROXIMO', 'HOY'].includes(r.estado)) return false;
    if (estado === 'PENDIENTE' && r.estado !== 'PENDIENTE') return false;
    if (estado === 'HOY' && r.estado !== 'HOY') return false;
    if (desde && r.fecha_venc < desde) return false;
    if (hasta && r.fecha_venc > hasta) return false;
    if (buscar) {
      const texto = `${r.doc_tipo} ${r.doc_numero} ${r.codigo} ${r.razon_social}`.toLowerCase();
      if (!texto.includes(buscar)) return false;
    }
    return true;
  });

  // Primero vencidos (más antiguos), luego lo que vence antes.
  filtrados.sort((a, b) => {
    const priority = { VENCIDO: 0, HOY: 1, PROXIMO: 2, PENDIENTE: 3 };
    return (priority[a.estado] - priority[b.estado]) || a.fecha_venc.localeCompare(b.fecha_venc) || a.razon_social.localeCompare(b.razon_social);
  });

  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    fecha_corte: hoyISO,
    resumen,
    filtros: { tipo, estado, buscar: params.buscar || '', desde, hasta },
    paginacion: { page: safePage, pageSize, total, totalPages },
    documentos: filtrados.slice(offset, offset + pageSize),
  };
}

module.exports = { getCarteraVencimientos };
