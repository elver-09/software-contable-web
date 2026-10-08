// src/main/controllers/sireController.js
// ─────────────────────────────────────────────────────────────────────────────
// SIRE — Sistema Integrado de Registros Electrónicos (SUNAT)
// Consolida el Registro de Ventas e Ingresos (RVIE) y el Registro de Compras
// (RCE) a partir de los asientos ya registrados (origen 14 = ventas, 8 = compras).
// Reutiliza la data del módulo de reportes y permite exportar un archivo plano
// (formato tipo SIRE, delimitado por '|') para el período elegido.
// ─────────────────────────────────────────────────────────────────────────────
const os = require('os');
const path = require('path');
const fs = require('fs');
const reportesController = require('./reportesController');

// Devuelve las filas aplanadas de ventas o compras para el período.
function getDatosSire({ tipo, desde, hasta }) {
  try {
    const rptTipo = tipo === 'compras' ? 'registro-compras' : 'registro-ventas';
    const r = reportesController.previsualizar({ tipo: rptTipo, desde, hasta });
    if (!r.success) return { success: false, error: r.error, filas: [], totalGeneral: null };

    const filas = [];
    (r.data.grupos || []).forEach(g => (g.filas || []).forEach(f => filas.push({ ...f, td: f.td || g.td })));
    return { success: true, tipo, filas, totalGeneral: r.data.totalGeneral, resumen: r.resumen };
  } catch (error) {
    console.error('SIRE getDatos error:', error);
    return { success: false, error: error.message, filas: [] };
  }
}

const _n = (x) => Number(x || 0).toFixed(2);

// Exportación local de diagnóstico. Conserva los campos tributarios explícitos
// para no perder información al mover datos internamente. No pretende reemplazar
// el generador/validador oficial de archivos de reemplazo SUNAT.
function _lineaVentas(f, periodo) {
  return [
    periodo, f.numero, f.fecha_emision || '', f.fecha_venc || '',
    f.td || '', f.serie || '', f.num_comprobante || '',
    f.cli_doc_tipo || '', f.cli_doc_num || '', f.razon_social || '',
    _n(f.valor_exportacion ?? f.valor_export), _n(f.base_gravada), _n(f.descuento_base),
    _n(f.igv), _n(f.descuento_igv), _n(f.exonerada), _n(f.inafecta), _n(f.isc),
    _n(f.base_ivap), _n(f.ivap), _n(f.icbper ?? f.icbp), _n(f.otros_tributos ?? f.otros),
    _n(f.importe_total), (f.moneda || 'PEN'), (f.tc || 1),
    f.ref_fecha || '', f.ref_tipo_documento || f.ref_td || '', f.ref_serie || '', f.ref_numero || f.ref_num || '',
    f.tributario_explicito === false ? 'INFERIDO' : (f.tributario_fuente || 'EXPLICITO'),
  ].join('|');
}

function _lineaCompras(f, periodo) {
  return [
    periodo, f.numero, f.fecha_emision || '', f.fecha_venc || '',
    f.td || '', f.serie || '', f.num_comprobante || '',
    f.prov_doc_tipo || '', f.prov_doc_num || '', f.razon_social || '',
    _n(f.g1_base), _n(f.g1_igv), _n(f.g2_base), _n(f.g2_igv), _n(f.g3_base), _n(f.g3_igv),
    _n(f.valor_no_grav), _n(f.isc), _n(f.icbper), _n(f.otros_tributos), _n(f.importe_total),
    (f.moneda || 'PEN'), (f.tc || 1), f.ref_fecha || '', f.ref_tipo_documento || f.ref_td || '', f.ref_serie || '', f.ref_numero || f.ref_num || '',
    f.detraccion_fecha || f.detrac_fecha || '', f.detraccion_numero || f.detrac_num || '', f.marca_retencion || '',
    f.tributario_explicito === false ? 'INFERIDO' : (f.tributario_fuente || 'EXPLICITO'),
  ].join('|');
}

// Genera un TXT de diagnóstico interno para revisar/mover datos tributarios.
// No es el archivo oficial de reemplazo SUNAT y no debe presentarse como tal.
function exportarSireTxt({ tipo, desde, hasta }) {
  try {
    const d = getDatosSire({ tipo, desde, hasta });
    if (!d.success) return d;
    if (!d.filas.length) return { success: false, error: 'No hay comprobantes en el período.' };

    const periodo = String(desde || '').substring(0, 7).replace('-', ''); // YYYYMM
    const linea = tipo === 'compras' ? _lineaCompras : _lineaVentas;
    const txt = d.filas.map(f => linea(f, periodo)).join('\r\n');

    const nombre = `DIAGNOSTICO_${tipo === 'compras' ? 'RCE' : 'RVIE'}_${periodo}.txt`;
    const tmp = path.join(require('../../../server/context.cjs').current().tempDir, path.basename(nombre));
    fs.writeFileSync(tmp, txt, 'utf8');
    return { success: true, filePath: tmp, defaultName: nombre, filas: d.filas.length };
  } catch (error) {
    console.error('SIRE exportar TXT error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { getDatosSire, exportarSireTxt };
