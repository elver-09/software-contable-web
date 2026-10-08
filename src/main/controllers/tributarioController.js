const tributarioRepository = require('../repositories/tributarioRepository.js');
// src/main/controllers/tributarioController.js
// Modelo tributario explícito asociado a vouchers de Compras (8) y Ventas (14).
// La información tributaria es la fuente para RVIE/RCE; las líneas del asiento
// siguen siendo la fuente contable. Ambas se validan por total antes del COMMIT.

const TOLERANCIA = 0.01;

function _num(v, campo = 'monto') {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`Valor tributario inválido en ${campo}.`);
  return n;
}

function _txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function _partirDocumento(docNumero) {
  const raw = _txt(docNumero).toUpperCase();
  if (!raw) return { serie: '', numero: '' };
  const idx = raw.indexOf('-');
  if (idx < 0) return { serie: '', numero: raw };
  return { serie: raw.slice(0, idx).trim(), numero: raw.slice(idx + 1).trim() };
}

function _tipoDesdeOrigen(origen) {
  const o = String(origen || '');
  if (o === '14') return 'VENTA';
  if (o === '8') return 'COMPRA';
  return '';
}

function _primerDetalle(detalles = []) {
  return detalles.find(d => _txt(d.doc_numero) || _txt(d.codigo)) || detalles[0] || {};
}

function _validarDocumentoUnico(detalles = []) {
  const docs = new Set();
  for (const d of detalles) {
    const numero = _txt(d.doc_numero).toUpperCase();
    if (!numero || numero === '-') continue;
    const tipo = _txt(d.doc_tipo).toUpperCase();
    docs.add(`${tipo}|${numero}`);
  }
  if (docs.size > 1) {
    throw new Error('Un voucher con información tributaria explícita solo puede representar un comprobante. Separe los documentos en vouchers distintos.');
  }
}

function normalizarTributario(tributario, { origen, detalles = [], fechaContable = '' } = {}) {
  if (!tributario) return null;

  const esperado = _tipoDesdeOrigen(origen);
  if (!esperado) throw new Error('Solo los vouchers de Compras (8) o Ventas (14) admiten información tributaria explícita.');

  const tipo = _txt(tributario.tipo_registro || tributario.tipo || esperado).toUpperCase();
  if (tipo !== esperado) throw new Error(`La información tributaria ${tipo} no corresponde al origen ${origen}.`);

  _validarDocumentoUnico(detalles);
  const d0 = _primerDetalle(detalles);
  const docPartes = _partirDocumento(d0.doc_numero);
  const c = tributario.comprobante || {};

  const comprobante = {
    // Los datos identificatorios del comprobante siguen a las líneas del asiento.
    // Así una edición de documento/fecha/entidad no deja desfasada la cabecera tributaria.
    fecha_emision: _txt(d0.fecha_doc || c.fecha_emision || fechaContable),
    fecha_vencimiento: _txt(d0.fecha_venc || c.fecha_vencimiento || c.fecha_venc),
    tipo_documento: _txt(d0.doc_tipo || c.tipo_documento || c.tipo_doc),
    serie: _txt(docPartes.serie || c.serie).toUpperCase(),
    numero: _txt(docPartes.numero || c.numero),
    tipo_doc_identidad: _txt(c.tipo_doc_identidad || c.tipo_doc_id),
    numero_doc_identidad: _txt(d0.codigo || c.numero_doc_identidad || c.ruc_dni),
    razon_social: _txt(d0.razon_social || c.razon_social),
    moneda: _txt(d0.moneda || c.moneda || 'PEN') || 'PEN',
    tipo_cambio: _num(d0.tc ?? c.tipo_cambio ?? c.tc ?? 1, 'tipo de cambio') || 1,
    ref_fecha: _txt(c.ref_fecha),
    ref_tipo_documento: _txt(c.ref_tipo_documento || c.ref_td),
    ref_serie: _txt(c.ref_serie),
    ref_numero: _txt(c.ref_numero || c.ref_num),
    car_sunat: _txt(c.car_sunat || c.car),
    fuente: (_txt(c.fuente || tributario.fuente || 'MANUAL') || 'MANUAL').toUpperCase(),
    requiere_revision: Number(c.requiere_revision ?? tributario.requiere_revision ?? 0) ? 1 : 0,
  };

  if (!comprobante.tipo_documento || !comprobante.numero) {
    throw new Error('La información tributaria requiere tipo y número de comprobante.');
  }

  if (tipo === 'VENTA') {
    const v = tributario.venta || tributario.detalle || {};
    return {
      tipo_registro: tipo,
      comprobante,
      venta: {
        valor_exportacion: _num(v.valor_exportacion ?? v.valor_export, 'valor exportación'),
        base_gravada: _num(v.base_gravada, 'base gravada'),
        descuento_base: _num(v.descuento_base, 'descuento base'),
        igv: _num(v.igv, 'IGV'),
        descuento_igv: _num(v.descuento_igv, 'descuento IGV'),
        importe_exonerado: _num(v.importe_exonerado ?? v.exonerada ?? v.exonerado, 'importe exonerado'),
        importe_inafecto: _num(v.importe_inafecto ?? v.inafecta ?? v.inafecto, 'importe inafecto'),
        isc: _num(v.isc, 'ISC'),
        base_ivap: _num(v.base_ivap, 'base IVAP'),
        ivap: _num(v.ivap, 'IVAP'),
        icbper: _num(v.icbper ?? v.icbp, 'ICBPER'),
        otros_tributos: _num(v.otros_tributos ?? v.otros, 'otros tributos'),
        importe_total: _num(v.importe_total ?? v.total, 'importe total'),
      },
    };
  }

  const cpr = tributario.compra || tributario.detalle || {};
  return {
    tipo_registro: tipo,
    comprobante,
    compra: {
      g1_base: _num(cpr.g1_base ?? cpr.base_gravada ?? cpr.base_imponible, 'G1 base'),
      g1_igv: _num(cpr.g1_igv ?? cpr.igv, 'G1 IGV'),
      g2_base: _num(cpr.g2_base, 'G2 base'),
      g2_igv: _num(cpr.g2_igv, 'G2 IGV'),
      g3_base: _num(cpr.g3_base, 'G3 base'),
      g3_igv: _num(cpr.g3_igv, 'G3 IGV'),
      valor_no_gravado: _num(cpr.valor_no_gravado ?? cpr.valor_no_grav, 'valor no gravado'),
      isc: _num(cpr.isc, 'ISC'),
      icbper: _num(cpr.icbper ?? cpr.icbp, 'ICBPER'),
      otros_tributos: _num(cpr.otros_tributos ?? cpr.otros, 'otros tributos'),
      importe_total: _num(cpr.importe_total ?? cpr.total, 'importe total'),
      detraccion_numero: _txt(cpr.detraccion_numero ?? cpr.detrac_num),
      detraccion_fecha: _txt(cpr.detraccion_fecha ?? cpr.detrac_fecha),
      marca_retencion: _txt(cpr.marca_retencion),
    },
  };
}

function validarClasificacionMinima(normalizado) {
  if (!normalizado) return;
  const datos = normalizado.tipo_registro === 'VENTA' ? normalizado.venta : normalizado.compra;
  const campos = normalizado.tipo_registro === 'VENTA'
    ? ['valor_exportacion','base_gravada','descuento_base','igv','descuento_igv','importe_exonerado','importe_inafecto','isc','base_ivap','ivap','icbper','otros_tributos']
    : ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv','valor_no_gravado','isc','icbper','otros_tributos'];
  const total = _num(datos?.importe_total, 'importe total');
  const tieneDetalle = campos.some(c => Math.abs(_num(datos?.[c], c)) > TOLERANCIA);

  // Una ficha explícita que solo contiene el total no constituye una clasificación:
  // seguiría siendo imposible distinguir gravado/exonerado/inafecto o G1/G2/G3.
  // Los vouchers históricos pueden permanecer SIN ficha y seguir usando el modo inferido.
  if (Math.abs(total) > TOLERANCIA && !tieneDetalle) {
    throw new Error('Los datos tributarios están incompletos: se informó el total, pero falta clasificar al menos una base, importe o impuesto. Complete la ficha tributaria o mantenga el voucher como histórico/inferido.');
  }
}

function validarContraAsiento(normalizado, totalDebe, totalHaber) {
  if (!normalizado) return;
  const totalContable = Math.max(Math.abs(Number(totalDebe) || 0), Math.abs(Number(totalHaber) || 0));
  const totalTrib = normalizado.tipo_registro === 'VENTA'
    ? normalizado.venta.importe_total
    : normalizado.compra.importe_total;

  // Las notas de crédito pueden almacenarse tributariamente con signo negativo,
  // mientras el asiento conserva importes positivos invirtiendo Debe/Haber.
  // Si el asiento tiene importe, el total tributario explícito es obligatorio: dejarlo
  // en cero haría que el registro parezca clasificado cuando en realidad está incompleto.
  if (totalContable > TOLERANCIA && Math.abs(totalTrib) <= TOLERANCIA) {
    throw new Error('El importe total tributario es obligatorio y no puede quedar en cero para un asiento con movimiento.');
  }
  if (Math.abs(Math.abs(totalTrib) - totalContable) > TOLERANCIA) {
    throw new Error(
      `El total tributario (${totalTrib.toFixed(2)}) no coincide con el total del asiento (${totalContable.toFixed(2)}).`
    );
  }
}

function guardarTributario(db, voucherId, origen, tributario, detalles, fechaContable, totalDebe, totalHaber) {
  const n = normalizarTributario(tributario, { origen, detalles, fechaContable });
  if (!n) return null;
  validarClasificacionMinima(n);
  validarContraAsiento(n, totalDebe, totalHaber);

  const c = n.comprobante;
  tributarioRepository.guardarTributario_run_comprobantes_tributarios(db, voucherId, n.tipo_registro, c.fecha_emision, c.fecha_vencimiento, c.tipo_documento, c.serie, c.numero, c.tipo_doc_identidad, c.numero_doc_identidad, c.razon_social, c.moneda, c.tipo_cambio, c.ref_fecha, c.ref_tipo_documento, c.ref_serie, c.ref_numero, c.car_sunat, c.fuente, c.requiere_revision);

  const ct = tributarioRepository.guardarTributario_get_comprobantes_tributarios(db, voucherId);
  if (!ct) throw new Error('No se pudo obtener el comprobante tributario guardado.');

  if (n.tipo_registro === 'VENTA') {
    const v = n.venta;
    tributarioRepository.guardarTributario_run_comprobante_compra(db, ct.id);
    tributarioRepository.guardarTributario_run_comprobante_venta(db, ct.id, v.valor_exportacion, v.base_gravada, v.descuento_base, v.igv, v.descuento_igv, v.importe_exonerado, v.importe_inafecto, v.isc, v.base_ivap, v.ivap, v.icbper, v.otros_tributos, v.importe_total);
  } else {
    const cpr = n.compra;
    tributarioRepository.guardarTributario_run_comprobante_venta_2(db, ct.id);
    tributarioRepository.guardarTributario_run_comprobante_compra_2(db, ct.id, cpr.g1_base, cpr.g1_igv, cpr.g2_base, cpr.g2_igv, cpr.g3_base, cpr.g3_igv, cpr.valor_no_gravado, cpr.isc, cpr.icbper, cpr.otros_tributos, cpr.importe_total, cpr.detraccion_numero, cpr.detraccion_fecha, cpr.marca_retencion);
  }

  return obtenerTributario(db, voucherId);
}

function obtenerTributario(db, voucherId) {
  const c = tributarioRepository.obtenerTributario_get_comprobantes_tributarios(db, voucherId);
  if (!c) return null;
  const base = {
    tipo_registro: c.tipo_registro,
    comprobante: {
      fecha_emision:c.fecha_emision||'', fecha_vencimiento:c.fecha_vencimiento||'',
      tipo_documento:c.tipo_documento||'', serie:c.serie||'', numero:c.numero||'',
      tipo_doc_identidad:c.tipo_doc_identidad||'', numero_doc_identidad:c.numero_doc_identidad||'',
      razon_social:c.razon_social||'', moneda:c.moneda||'PEN', tipo_cambio:c.tipo_cambio||1,
      ref_fecha:c.ref_fecha||'', ref_tipo_documento:c.ref_tipo_documento||'', ref_serie:c.ref_serie||'',
      ref_numero:c.ref_numero||'', car_sunat:c.car_sunat||'', fuente:c.fuente||'MANUAL',
      requiere_revision:Number(c.requiere_revision)||0,
    }
  };
  if (c.tipo_registro === 'VENTA') {
    base.venta = tributarioRepository.obtenerTributario_get_comprobante_venta(db, c.id) || {};
  } else {
    base.compra = tributarioRepository.obtenerTributario_get_comprobante_compra(db, c.id) || {};
  }
  return base;
}

module.exports = { normalizarTributario, validarClasificacionMinima, validarContraAsiento, guardarTributario, obtenerTributario };
