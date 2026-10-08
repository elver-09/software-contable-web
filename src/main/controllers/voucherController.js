const voucherRepository = require('../repositories/voucherRepository.js');
// src/main/controllers/voucherController.js
const { getDB } = require('../database/db');
const { guardarTributario, obtenerTributario } = require('./tributarioController');
const { montoContable, montoEditable, calcularTotales, validarCuadre } = require('../domain/voucherValidation');

function getSiguienteNumero({ origen, periodo, fechaContable }) {
  try {
    const db = getDB();
    // El correlativo va por origen y por PERÍODO contable (no por la fecha de hoy).
    const per = periodo || (fechaContable ? fechaContable.substring(0, 7) : '');
    const fila = voucherRepository.getSiguienteNumero_get_vouchers(db, origen, per);
    return { success: true, numero: (fila.maximo || 0) + 1 };
  } catch (error) {
    console.error("Error calculando siguiente número:", error);
    return { success: false, error: error.message };
  }
}

function validarDuplicados(db, origen, detalles, excluirId = -1) {
  if (!['8','14'].includes(String(origen))) return;
  const revisados = new Set();
  for (const d of detalles) {
    const doc = String(d.doc_numero || '').trim();
    if (!doc || doc === '-') continue;
    const relacionados = detalles.filter(l => String(l.doc_numero || '').trim().toUpperCase() === doc.toUpperCase());
    const tipo = String(d.doc_tipo || relacionados.find(l => l.doc_tipo)?.doc_tipo || '').trim();
    const proveedor = String(d.codigo || relacionados.find(l => l.codigo)?.codigo || '').trim();
    const clave = [doc.toUpperCase(),tipo, String(origen)==='8'?proveedor:''].join('|');
    if (revisados.has(clave)) continue;
    revisados.add(clave);
    const existente = voucherRepository.addVoucher_get_voucher_detalles(db, doc, String(origen), tipo, String(origen), proveedor, excluirId);
    if (existente) throw new Error(`DUPLICADO: El comprobante ${doc} ya está registrado en ${String(origen)==='8'?'Compras':'Ventas'}, período ${existente.periodo}, voucher N° ${existente.numero_voucher}.`);
  }
}

function addVoucher(data) {
  try {
    const db = getDB();
    const { origen, fechaContable, periodo, glosa, detalles, tributario } = data;
    if (!origen) throw new Error("El campo 'origen' es obligatorio.");
    if (!fechaContable) throw new Error("La fecha contable es obligatoria.");
    if (!Array.isArray(detalles) || detalles.length === 0)
      throw new Error("El voucher debe tener al menos una línea de detalle.");

    const per = periodo || fechaContable.substring(0, 7);

    // ── Validación de duplicados para Compras (8) y Ventas (14) ──────────
    // Un comprobante es único en su origen. No puede existir dos veces
    // en compras ni en ventas. En otros orígenes (caja, diario, etc.)
    // sí puede repetirse porque se registra el pago/cobro de esa factura.
    if (origen === '8' || origen === '14' || origen === 8 || origen === 14) {
      validarDuplicados(db, origen, detalles);
    }

    const { debe: totalDebe, haber: totalHaber } = calcularTotales(detalles);
    validarCuadre(totalDebe, totalHaber);

    const stmtMax = voucherRepository.prepararInsercionCabecera(db);
    const stmtCab = voucherRepository.addVoucher_prepare_vouchers_2(db);
    const stmtDet = voucherRepository.prepararInsercionDetalle(db);

    let numeroAsignado = null, idInsertado = null;
    db.transaction(() => {
      const { maximo } = stmtMax.get(origen, per);
      numeroAsignado = (maximo || 0) + 1;
      const info = stmtCab.run(origen, numeroAsignado, fechaContable, per, glosa || null, totalDebe, totalHaber);
      idInsertado = info.lastInsertRowid;
      for (const l of detalles) {
        stmtDet.run(idInsertado, l.cuenta||'', l.nombre_cuenta||'', parseFloat(l.debe)||0, parseFloat(l.haber)||0,
          l.moneda||'PEN', parseFloat(l.tc)||1, parseFloat(l.equivalente)||0,
          l.doc_tipo||null, l.doc_numero||null, l.fecha_doc||null, l.fecha_venc||null,
          l.codigo||null, l.razon_social||null, l.glosa||null);
      }
      // El comprobante tributario se guarda dentro de la MISMA transacción que
      // cabecera y líneas. Si su total no concilia con el asiento, todo hace rollback.
      if (tributario) {
        guardarTributario(db, idInsertado, origen, tributario, detalles, fechaContable, totalDebe, totalHaber);
      }
    })();

    console.log(`Voucher guardado — Origen: ${origen} | Período: ${per} | N°: ${numeroAsignado} | ID: ${idInsertado}`);
    return { success: true, numero_voucher: numeroAsignado, id: idInsertado };
  } catch (error) {
    console.error("Error guardando voucher:", error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BÚSQUEDA Y EDICIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function buscarVoucher({ origen, numeroVoucher, id, periodo, numero_voucher }) {
  try {
    const db = getDB();
    let cabecera = null;
    const numV = numeroVoucher || numero_voucher;
    if (id) {
      cabecera = voucherRepository.buscarVoucher_get_vouchers(db, id);
    } else if (numV && periodo) {

      cabecera = voucherRepository.buscarVoucher_get_vouchers_2(db, { numV, periodo, origen });
    } else if (numV && origen) {
      cabecera = voucherRepository.buscarVoucher_get_vouchers_3(db, origen, parseInt(numV, 10));
    }

    if (!cabecera) return { success: false, error: `No se encontró el voucher.` };

    const detalles = voucherRepository.buscarVoucher_all_voucher_detalles(db, cabecera.id);

    const tributario = obtenerTributario(db, cabecera.id);
    return { success: true, cabecera, detalles, tributario };
  } catch (error) {
    console.error('Error buscando voucher:', error);
    return { success: false, error: error.message };
  }
}

// Busca un asiento por PERÍODO (YYYY-MM) y N° de comprobante/factura (doc_numero).
// El origen es opcional para acotar. Si hay varios, devuelve el más reciente.
function buscarVoucherPorFactura({ periodo, docNumero, origen }) {
  try {
    const db = getDB();
    const tieneFactura = docNumero && String(docNumero).trim() !== '';

    if (!tieneFactura) {
      if (!periodo) return { success: false, error: 'Seleccione un período para buscar.' };

      const cabeceras = voucherRepository.buscarVoucherPorFactura_all_voucher_detalles(db, { periodo, origen });
      if (!cabeceras.length) return { success: false, error: 'No hay asientos en el período ' + periodo + '.' };
      const cabecera = cabeceras[0];
      const detalles = voucherRepository.buscarVoucherPorFactura_all_voucher_detalles_2(db, cabecera.id);
      const tributario = obtenerTributario(db, cabecera.id);
      return { success: true, cabecera, detalles, tributario, multiples: cabeceras.length, listaVouchers: cabeceras };
    }


    const cabeceras = voucherRepository.buscarVoucherPorFactura_all_vouchers(db, { docNumero, periodo, origen });
    if (!cabeceras.length) return { success: false, error: 'No se encontró un asiento con la factura "' + docNumero + '"' + (periodo ? ' en el período ' + periodo : '') + '.' };
    const cabecera = cabeceras[0];
    const detalles = voucherRepository.buscarVoucherPorFactura_all_voucher_detalles_3(db, cabecera.id);
    const tributario = obtenerTributario(db, cabecera.id);
    return { success: true, cabecera, detalles, tributario, multiples: cabeceras.length };
  } catch (error) {
    console.error('Error buscando voucher por factura:', error);
    return { success: false, error: error.message };
  }
}

// Guarda TODAS las líneas editadas de un voucher en una sola transacción.
// El renderer puede trabajar con un borrador temporal descuadrado; SQLite solo
// recibe los cambios cuando el resultado final del asiento está cuadrado.
function updateVoucherCompleto(data) {
  try {
    const db = getDB();
    const voucherId = Number.parseInt(data?.voucher_id ?? data?.id, 10);
    const detalles = data?.detalles;

    if (!Number.isInteger(voucherId) || voucherId <= 0)
      return { success: false, error: 'ID de voucher requerido.' };
    if (!Array.isArray(detalles) || detalles.length === 0)
      return { success: false, error: 'El voucher debe contener al menos una línea.' };

    const resultado = db.transaction(() => {
      const voucher = voucherRepository.updateVoucherCompleto_get_vouchers(db, voucherId);
      if (!voucher) throw new Error('Voucher no encontrado.');

      // La edición actual solo modifica líneas existentes. Exigimos recibir el
      // conjunto completo para evitar guardar totales calculados sobre un borrador
      // incompleto o sobre líneas pertenecientes a otro voucher.
      const actuales = voucherRepository.updateVoucherCompleto_all_voucher_detalles(db, voucherId);

      if (actuales.length !== detalles.length) {
        throw new Error('Las líneas del asiento cambiaron mientras se editaba. Vuelva a cargar el voucher.');
      }

      const idsActuales = new Set(actuales.map(r => Number(r.id)));
      const idsEntrada = detalles.map(d => Number.parseInt(d.id, 10));
      if (new Set(idsEntrada).size !== idsEntrada.length || idsEntrada.some(id => !idsActuales.has(id))) {
        throw new Error('El borrador contiene líneas inválidas o que no pertenecen al voucher.');
      }

      let totalDebe = 0;
      let totalHaber = 0;

      const preparados = detalles.map(d => {
        const id = Number.parseInt(d.id, 10);
        const debe = montoEditable(d.debe, 'Debe', id);
        const haber = montoEditable(d.haber, 'Haber', id);
        const tcIngresado = montoContable(d.tc);
        const tc = tcIngresado > 0 ? tcIngresado : 1;
        const moneda = d.moneda || 'PEN';
        const equivalente = moneda === 'PEN' ? (debe + haber) : (debe + haber) * tc;

        totalDebe += debe;
        totalHaber += haber;

        return {
          id,
          cuenta: d.cuenta || '',
          nombre_cuenta: d.nombre_cuenta || '',
          debe,
          haber,
          moneda,
          tc,
          equivalente,
          doc_tipo: d.doc_tipo || null,
          doc_numero: d.doc_numero || null,
          fecha_doc: d.fecha_doc || null,
          fecha_venc: d.fecha_venc || null,
          codigo: d.codigo || null,
          razon_social: d.razon_social || null,
          glosa: d.glosa || null,
        };
      });

      const cuadrados = validarCuadre(totalDebe, totalHaber);
      validarDuplicados(db, voucher.origen, preparados, voucherId);

      const stmtUpdate = voucherRepository.updateVoucherCompleto_prepare_voucher_detalles(db);

      for (const d of preparados) {
        const info = stmtUpdate.run(
          d.cuenta, d.nombre_cuenta, d.debe, d.haber, d.moneda, d.tc, d.equivalente,
          d.doc_tipo, d.doc_numero, d.fecha_doc, d.fecha_venc,
          d.codigo, d.razon_social, d.glosa, d.id, voucherId
        );
        if (info.changes !== 1) throw new Error(`No se pudo actualizar la línea ${d.id}.`);
      }

      // Comprobación defensiva con los valores realmente persistidos antes del COMMIT.
      const totalesPersistidos = voucherRepository.updateVoucherCompleto_get_voucher_detalles(db, voucherId);
      const finales = validarCuadre(totalesPersistidos.td, totalesPersistidos.th);

      // Si el voucher ya tenía datos tributarios explícitos, no permitimos que una
      // edición contable cambie el total y deje el comprobante tributario desfasado.
      // El renderer puede enviar data.tributario para actualizar ambos en conjunto.
      const existenteTrib = obtenerTributario(db, voucherId);
      if (data?.tributario) {
        guardarTributario(
          db, voucherId, data?.origen || voucher.origen,
          data.tributario, preparados, data?.fechaContable || voucher.fecha || '', finales.debe, finales.haber
        );
      } else if (existenteTrib) {
        // Mantiene sincronizados tipo/número/fecha/entidad/moneda con las líneas editadas.
        // Los importes tributarios explícitos se conservan y se revalidan contra el asiento.
        guardarTributario(
          db, voucherId, voucher.origen, existenteTrib, preparados, voucher.fecha || '', finales.debe, finales.haber
        );
      }

      voucherRepository.updateVoucherCompleto_run_vouchers(db, finales.debe, finales.haber, voucherId);

      return {
        voucher_id: voucherId,
        total_debe: finales.debe,
        total_haber: finales.haber,
        lineas_actualizadas: preparados.length,
      };
    })();

    return { success: true, ...resultado };
  } catch (error) {
    console.error('Error guardando edición completa del voucher:', error.message);
    return { success: false, error: error.message };
  }
}


function getDocumentosPendientes({ tipo, termino } = {}) {
  try {
    const db = getDB();
    let rows = voucherRepository.listarDocumentosPendientes(db, { tipo });
    if (termino && termino.trim()) {
      const t = termino.trim().toLowerCase();
      rows = rows.filter(r => (r.doc_numero||'').toLowerCase().includes(t) || (r.codigo||'').toLowerCase().includes(t) || (r.razon_social||'').toLowerCase().includes(t));
    }
    return { success: true, documentos: rows };
  } catch (error) { return { success: false, error: error.message, documentos: [] }; }
}

module.exports = { addVoucher, getSiguienteNumero, buscarVoucher, buscarVoucherPorFactura, updateVoucherCompleto, getDocumentosPendientes };
