// src/main/controllers/sireSunatController.js
// ─────────────────────────────────────────────────────────────────────────────
// Controlador de operaciones SIRE contra SUNAT API.
// FASE 7: Manejo de archivos organizado por empresa/período/tipo.
// FASE 8: Validaciones y mensajes de error claros.
// FASE 9: Sin datos sensibles en respuestas al renderer.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const { app } = require('../../../server/electron.cjs');
const { getDB } = require('../database/db');
const authService = require('../services/sunat/sunatAuthService');
const ventasService = require('../services/sunat/sireVentasService');
const comprasService = require('../services/sunat/sireComprasService');
const ticketService = require('../services/sunat/sireTicketService');
const sireLocalController = require('./sireController');

// ── Validaciones ─────────────────────────────────────────────────────────────

function _validarPeriodo(periodo) {
  if (!periodo || !/^\d{6}$/.test(String(periodo))) {
    return 'Período inválido. Use formato YYYYMM (ej: 202606).';
  }
  const mes = parseInt(periodo.substring(4, 6));
  if (mes < 1 || mes > 12) return 'El mes del período debe estar entre 01 y 12.';
  return null; // ok
}

function _normalizarTipo(tipo) {
  const value = String(tipo || '').toUpperCase();
  return value === 'VENTAS' || value === 'COMPRAS' ? value : '';
}

function _getService(tipo) {
  return _normalizarTipo(tipo) === 'COMPRAS' ? comprasService : ventasService;
}

// ── FASE 7: Directorio organizado para archivos SUNAT ────────────────────────
// Estructura: userData/sire/{ruc}/{periodo}/{ventas|compras}/
function _getArchivoDir(ruc, periodo, tipo) {
  const safeRuc = /^\d{11}$/.test(String(ruc || '')) ? String(ruc) : 'sin-ruc';
  const safePeriodo = /^\d{6}$/.test(String(periodo || '')) ? String(periodo) : 'sin-periodo';
  const normalizedTipo = _normalizarTipo(tipo);
  const safeTipo = normalizedTipo === 'COMPRAS' ? 'compras' : 'ventas';
  const base = path.join(
    app.getPath('userData'),
    'sire',
    safeRuc,
    safePeriodo,
    safeTipo
  );
  try {
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  } catch (err) {
    console.error('SIRE: No se pudo crear directorio de archivos:', err.message);
  }
  return base;
}

function _registrarOperacion(tipo, periodo, operacion, ticket, estado, mensaje, archivoNombre, archivoPath) {
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO sire_operaciones (tipo, periodo, operacion, ticket, estado, archivo_nombre, archivo_path, mensaje)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tipo, periodo, operacion, ticket || null, estado, archivoNombre || null, archivoPath || null, mensaje || null);
  } catch (_) {}
}

// ── Parsear archivo SIRE (ZIP con TXT delimitado por '|') ────────────────────
// El archivo descargado de SUNAT es un ZIP que contiene un TXT con registros
// delimitados por '|'. Cada línea es un comprobante.
// Formato RVIE (Ventas): período|CUO|correlativo|fecEmisión|fecVenc|tipDoc|serie|numero|...
// Formato RCE (Compras): período|CUO|correlativo|fecEmisión|fecVenc|tipDoc|serie|numero|...
function _parsearArchivoSIRE(base64, nombreArchivo, tipo) {
  const buffer = Buffer.from(base64, 'base64');
  let contenido = '';

  // Si es ZIP, extraer el primer TXT
  if (nombreArchivo && nombreArchivo.toLowerCase().endsWith('.zip')) {
    try {
      // Intentar con adm-zip si está instalado
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      const txtEntry = entries.find(e => !e.isDirectory && (e.entryName.toLowerCase().endsWith('.txt') || e.entryName.toLowerCase().endsWith('.csv')));
      if (txtEntry) {
        contenido = txtEntry.getData().toString('utf8');
      } else if (entries.length > 0) {
        contenido = entries.find(e => !e.isDirectory)?.getData().toString('utf8') || '';
      } else {
        throw new Error('El archivo ZIP está vacío.');
      }
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        // Fallback: descomprimir manualmente (ZIP simple con zlib)
        try {
          const zlib = require('zlib');
          // Buscar el inicio del contenido comprimido en el ZIP
          // ZIP local file header: PK\x03\x04...
          const raw = buffer;
          if (raw[0] === 0x50 && raw[1] === 0x4B) {
            // Leer el header del primer archivo
            const compMethod = raw.readUInt16LE(8);
            const compSize = raw.readUInt32LE(18);
            const uncompSize = raw.readUInt32LE(22);
            const fnLen = raw.readUInt16LE(26);
            const exLen = raw.readUInt16LE(28);
            const dataStart = 30 + fnLen + exLen;
            const compData = raw.subarray(dataStart, dataStart + compSize);

            if (compMethod === 8) { // Deflate
              contenido = zlib.inflateRawSync(compData).toString('utf8');
            } else if (compMethod === 0) { // Stored (sin compresión)
              contenido = compData.toString('utf8');
            } else {
              contenido = buffer.toString('utf8'); // último recurso
            }
          } else {
            contenido = buffer.toString('utf8');
          }
        } catch (_) {
          contenido = buffer.toString('utf8');
        }
      } else {
        throw err;
      }
    }
  } else {
    // Es TXT o CSV directo
    contenido = buffer.toString('utf8');
  }

  if (!contenido || !contenido.trim()) return [];

  // Limpiar BOM y normalizar
  contenido = contenido.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = contenido.split('\n');
  const joined = [];
  let i = 0;

  // Saltar header si existe
  if (rawLines.length > 0 && rawLines[0].toLowerCase().includes('ruc') && rawLines[0].toLowerCase().includes('razon')) {
    i = 1;
  }

  // Los archivos SIRE de SUNAT tienen registros en 2 líneas:
  // Línea 1: "RUC|RAZÓN SOCIAL"
  // Línea 2: "|PERIODO|CAR|FECHA|..." (empieza con |)
  while (i < rawLines.length) {
    const line = rawLines[i].trim();
    if (!line) { i++; continue; }
    if (i + 1 < rawLines.length && rawLines[i + 1].trim().startsWith('|')) {
      joined.push(line + rawLines[i + 1].trim());
      i += 2;
    } else if (line.split('|').length > 20) {
      joined.push(line);
      i++;
    } else {
      i++;
    }
  }

  const registros = [];

  // Convertir fecha DD/MM/YYYY → YYYY-MM-DD
  const parseFecha = (f) => {
    if (!f) return '';
    f = f.trim();
    if (f.includes('/')) {
      const p = f.split('/');
      return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : f;
    }
    return f;
  };

  const monto = (v) => {
    const n = Number.parseFloat(String(v ?? '0').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const esCompras = String(tipo || '').toUpperCase() === 'COMPRAS';

  for (const linea of joined) {
    const campos = linea.split('|');
    if (campos.length < 20) continue;

    // SUNAT publica estructuras distintas para RVIE (Anexo 3) y RCE (Anexo 11).
    // No se reutilizan posiciones de Ventas para Compras: en RCE los campos 15-20
    // corresponden a G1/G2/G3 (base e IGV) y el campo 25 es el total del CP.
    let reg;
    let importesVerificar = [];

    if (esCompras) {
      const g1Base = monto(campos[14]);
      const g1Igv = monto(campos[15]);
      const g2Base = monto(campos[16]);
      const g2Igv = monto(campos[17]);
      const g3Base = monto(campos[18]);
      const g3Igv = monto(campos[19]);
      const noGravado = monto(campos[20]);
      const isc = monto(campos[21]);
      const icbper = monto(campos[22]);
      const otros = monto(campos[23]);
      const totalCPRaw = String(campos[24] ?? '').trim();
      const totalCP = monto(campos[24]);

      reg = {
        tipo_documento: String(campos[6] || '').trim(),
        serie: String(campos[7] || '').trim().toUpperCase(),
        // RCE: campo 9 = año (DUA/DAM), campo 10 = número inicial del CP.
        anio_documento: String(campos[8] || '').trim(),
        numero: String(campos[9] || '').trim(),
        numero_final: String(campos[10] || '').trim(),
        tipo_doc_identidad: String(campos[11] || '').trim(),
        ruc_entidad: String(campos[12] || '').trim(),
        razon_social: String(campos[13] || '').trim(),
        fecha_emision: parseFecha(campos[4]),
        fecha_vencimiento: parseFecha(campos[5]),
        periodo: String(campos[2] || '').trim(),
        car_sunat: String(campos[3] || '').trim(),
        g1_base: g1Base, g1_igv: g1Igv,
        g2_base: g2Base, g2_igv: g2Igv,
        g3_base: g3Base, g3_igv: g3Igv,
        valor_no_gravado: noGravado,
        isc, icbper, otros_tributos: otros,
        importe_total: totalCPRaw === '' ? (g1Base + g1Igv + g2Base + g2Igv + g3Base + g3Igv + noGravado + isc + icbper + otros) : totalCP,
        moneda: String(campos[25] || 'PEN').trim() || 'PEN',
        tipo_cambio: String(campos[26] || '1.000').trim(),
        ref_fecha: parseFecha(campos[27]),
        ref_tipo_documento: String(campos[28] || '').trim(),
        ref_serie: String(campos[29] || '').trim().toUpperCase(),
        cod_dam_dsi: String(campos[30] || '').trim(),
        ref_numero: String(campos[31] || '').trim(),
        clasificacion_bienes_servicios: String(campos[32] || '').trim(),
        proyecto_operadores: String(campos[33] || '').trim(),
        porcentaje_participacion: monto(campos[34]),
        imb: monto(campos[35]),
        car_original: String(campos[36] || '').trim(),
        // Compatibilidad con pantallas/contabilización existentes.
        base_imponible: g1Base + g2Base + g3Base,
        igv: g1Igv + g2Igv + g3Igv,
        requiere_revision: 0,
      };
      importesVerificar = [reg.importe_total,g1Base,g1Igv,g2Base,g2Igv,g3Base,g3Igv,noGravado,isc,icbper,otros];
    } else {
      const valorExport = monto(campos[13]);
      const biGravada = monto(campos[14]);
      const dsctoBase = monto(campos[15]);
      const igv = monto(campos[16]);
      const dsctoIgv = monto(campos[17]);
      const exonerado = monto(campos[18]);
      const inafecto = monto(campos[19]);
      const isc = monto(campos[20]);
      const baseIvap = monto(campos[21]);
      const ivap = monto(campos[22]);
      const icbper = monto(campos[23]);
      const otros = monto(campos[24]);
      const totalCPRaw = String(campos[25] ?? '').trim();
      const totalCP = monto(campos[25]);

      reg = {
        tipo_documento: String(campos[6] || '').trim(),
        serie: String(campos[7] || '').trim().toUpperCase(),
        numero: String(campos[8] || '').trim(),
        numero_final: String(campos[9] || '').trim(),
        tipo_doc_identidad: String(campos[10] || '').trim(),
        ruc_entidad: String(campos[11] || '').trim(),
        razon_social: String(campos[12] || '').trim(),
        fecha_emision: parseFecha(campos[4]),
        fecha_vencimiento: parseFecha(campos[5]),
        periodo: String(campos[2] || '').trim(),
        car_sunat: String(campos[3] || '').trim(),
        valor_exportacion: valorExport,
        base_gravada: biGravada,
        descuento_base: dsctoBase,
        igv,
        descuento_igv: dsctoIgv,
        exonerado,
        inafecto,
        isc,
        base_ivap: baseIvap,
        ivap,
        icbper,
        otros_tributos: otros,
        importe_total: totalCPRaw === '' ? (valorExport + biGravada + dsctoBase + igv + dsctoIgv + exonerado + inafecto + isc + baseIvap + ivap + icbper + otros) : totalCP,
        moneda: String(campos[26] || 'PEN').trim() || 'PEN',
        tipo_cambio: String(campos[27] || '1.000').trim(),
        ref_fecha: parseFecha(campos[28]),
        ref_tipo_documento: String(campos[29] || '').trim(),
        ref_serie: String(campos[30] || '').trim().toUpperCase(),
        ref_numero: String(campos[31] || '').trim(),
        proyecto_operadores: String(campos[32] || '').trim(),
        base_imponible: biGravada,
        requiere_revision: 0,
      };
      importesVerificar = [reg.importe_total,valorExport,biGravada,dsctoBase,igv,dsctoIgv,exonerado,inafecto,isc,ivap,icbper,otros];
    }

    const tieneMonto = importesVerificar.some(v => Math.abs(Number(v) || 0) > 0.00001);
    if (reg.tipo_documento && reg.numero && tieneMonto) registros.push(reg);
  }

  console.log(`SIRE: Parseados ${registros.length} registros del archivo ${nombreArchivo}`);
  return registros;
}

// ── Probar conexión ──────────────────────────────────────────────────────────

async function testConnection() {
  return authService.testConnection();
}

// ── Consultar períodos ───────────────────────────────────────────────────────

async function consultarPeriodos({ tipo }) {
  if (!tipo) return { success: false, error: 'Seleccione un tipo (Ventas o Compras).' };
  const service = _getService(tipo);
  const r = await service.consultarPeriodos();
  return { success: r.ok, data: r.data, error: r.error };
}

// ── Descargar propuesta ──────────────────────────────────────────────────────

async function descargarPropuesta({ tipo, periodo }) {
  const errPer = _validarPeriodo(periodo);
  if (errPer) return { success: false, error: errPer };
  const tipoNormalizado = _normalizarTipo(tipo);
  if (!tipoNormalizado) return { success: false, error: 'Tipo inválido. Use Ventas o Compras.' };

  const service = _getService(tipoNormalizado);
  const r = await service.descargarPropuesta(periodo);
  return { success: r.ok, data: r.data, error: r.error };
}

// ── Consultar ticket ─────────────────────────────────────────────────────────

async function consultarTicket({ tipo, ticket, periodo }) {
  const ticketValue = String(ticket || '').trim();
  if (!ticketValue) return { success: false, error: 'Ingrese el número de ticket.' };
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(ticketValue)) return { success: false, error: 'El número de ticket tiene un formato inválido.' };
  if (periodo) {
    const errPer = _validarPeriodo(String(periodo));
    if (errPer) return { success: false, error: errPer };
  }
  const tipoNormalizado = _normalizarTipo(tipo);
  if (!tipoNormalizado) return { success: false, error: 'Tipo inválido. Use Ventas o Compras.' };

  const r = await ticketService.consultarTicket({ tipo: tipoNormalizado, ticket: ticketValue, periodo });
  return { success: r.ok, data: r.data, error: r.error };
}

// ── Descargar archivo generado ───────────────────────────────────────────────

async function descargarArchivo({ tipo, nomArchivoReporte, codTipoArchivoReporte, periodo, codProceso, numTicket }) {
  const rawNombre = String(nomArchivoReporte || '').trim();
  if (!rawNombre) {
    return { success: false, error: 'Ingrese el nombre del archivo. Primero consulte el ticket para obtenerlo.' };
  }
  const nombreSeguro = path.basename(rawNombre);
  if (nombreSeguro !== rawNombre || /[\/\\\0\r\n]/.test(rawNombre)) {
    return { success: false, error: 'El nombre del archivo SIRE contiene una ruta no permitida.' };
  }
  if (periodo) {
    const errPer = _validarPeriodo(String(periodo));
    if (errPer) return { success: false, error: errPer };
  }
  const ticketValue = String(numTicket || '').trim();
  if (ticketValue && !/^[A-Za-z0-9._-]{1,100}$/.test(ticketValue)) {
    return { success: false, error: 'El número de ticket tiene un formato inválido.' };
  }
  const tipoNormalizado = _normalizarTipo(tipo);
  if (!tipoNormalizado) return { success: false, error: 'Tipo inválido. Use Ventas o Compras.' };

  const service = _getService(tipoNormalizado);
  const r = await service.descargarArchivo({
    nomArchivoReporte: nombreSeguro,
    codTipoArchivoReporte: String(codTipoArchivoReporte || '00').replace(/[^A-Za-z0-9_-]/g, ''),
    perTributario: periodo || '',
    codProceso: String(codProceso || '10').replace(/[^A-Za-z0-9_-]/g, ''),
    numTicket: ticketValue,
  });

  if (!r.ok || !r.buffer) {
    return { success: false, error: r.error || 'No se recibió archivo de SUNAT.' };
  }

  // FASE 7: Guardar el archivo — diálogo "Guardar como" para que el usuario elija
  try {
    const db = getDB();
    const ruc = db.prepare('SELECT ruc FROM sire_config WHERE id = 1').get()?.ruc || '';
    const tipoUpper = tipoNormalizado;
    const nombre = nombreSeguro;

    // Guardar una copia en la carpeta interna (respaldo)
    const dir = _getArchivoDir(ruc, periodo || '', tipoNormalizado);
    const backupPath = path.join(dir, nombre);
    fs.writeFileSync(backupPath, r.buffer);

    // Mostrar diálogo "Guardar como" para que el usuario elija la ubicación
    const { dialog, shell, BrowserWindow } = require('../../../server/electron.cjs');
    const mainWindow = BrowserWindow.getFocusedWindow();
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar archivo SIRE',
      defaultPath: nombre,
      filters: [
        { name: 'Archivo ZIP', extensions: ['zip'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });

    let filePath = backupPath;
    if (!saveResult.canceled && saveResult.filePath) {
      fs.copyFileSync(backupPath, saveResult.filePath);
      filePath = saveResult.filePath;
      shell.showItemInFolder(filePath);
    }

    _registrarOperacion(tipoUpper, periodo || '', 'DESCARGAR_ARCHIVO', nomArchivoReporte,
      'DESCARGADO', `Archivo guardado (${r.buffer.length} bytes)`, nombre, filePath);

    return {
      success: true,
      filePath,
      nombre,
      size: r.buffer.length,
      mensaje: `Archivo descargado correctamente: ${nombre} (${(r.buffer.length / 1024).toFixed(1)} KB)`,
    };
  } catch (err) {
    return { success: false, error: `Archivo recibido de SUNAT pero no se pudo guardar en disco: ${err.message}` };
  }
}

// ── Logs y operaciones ───────────────────────────────────────────────────────

function getLogs(params = {}) {
  return { success: true, logs: ticketService.getLogs(params) };
}

function getOperaciones(params = {}) {
  return { success: true, operaciones: ticketService.getOperaciones(params) };
}

// ── Listar archivos descargados ──────────────────────────────────────────────

function listarArchivos({ tipo, periodo } = {}) {
  try {
    const tipoNormalizado = _normalizarTipo(tipo);
    if (!tipoNormalizado) return { success: false, error: 'Tipo inválido. Use VENTAS o COMPRAS.', archivos: [] };
    const errPer = _validarPeriodo(periodo);
    if (errPer) return { success: false, error: errPer, archivos: [] };

    const db = getDB();
    const ruc = db.prepare('SELECT ruc FROM sire_config WHERE id = 1').get()?.ruc || '';
    const dir = _getArchivoDir(ruc, periodo, tipoNormalizado);
    if (!fs.existsSync(dir)) return { success: true, archivos: [] };
    const archivos = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        // El renderer no necesita conocer rutas absolutas del sistema.
        return { nombre: f, size: stat.size, fecha: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { success: true, archivos };
  } catch (err) {
    return { success: false, error: err.message, archivos: [] };
  }
}

// ── Comparación Local vs SUNAT ───────────────────────────────────────────────

async function compararLocalSunat({ tipo, periodo, propuestaSunat, archivoBase64, nombreArchivo }) {
  const errPer = _validarPeriodo(periodo);
  if (errPer) return { success: false, error: errPer };

  // 1. Datos locales
  const perFmt = `${periodo.substring(0, 4)}-${periodo.substring(4, 6)}`;
  const ultimo = new Date(parseInt(periodo.substring(0, 4)), parseInt(periodo.substring(4, 6)), 0).getDate();
  const desde = `${perFmt}-01`, hasta = `${perFmt}-${String(ultimo).padStart(2, '0')}`;
  const local = sireLocalController.getDatosSire({ tipo, desde, hasta });
  if (!local.success) return { success: false, error: `Error obteniendo datos locales: ${local.error}` };

  // 2. Si viene un archivo ZIP base64, parsearlo para obtener los registros SUNAT
  let sunatRecords = Array.isArray(propuestaSunat) ? propuestaSunat : [];
  if (archivoBase64) {
    try {
      sunatRecords = _parsearArchivoSIRE(archivoBase64, nombreArchivo, tipo);
    } catch (err) {
      return { success: false, error: `Error al leer el archivo SUNAT: ${err.message}` };
    }
  }

  // 3. Normalizar preservando la clasificación tributaria explícita.
  const isCompras = String(tipo).toUpperCase() === 'COMPRAS';
  const num = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const pick = (o, ...keys) => {
    for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return num(o[k]);
    return 0;
  };
  const keyDoc = (td, serie, numero) => `${String(td || '').padStart(2,'0')}|${String(serie || '').trim().toUpperCase()}|${String(numero || '').trim()}`;

  const normLocal = local.filas.map(f => {
    const common = {
      tipo_documento: String(f.td || '').padStart(2, '0'),
      serie: String(f.serie || '').trim().toUpperCase(),
      numero: String(f.num_comprobante || '').trim(),
      ruc_entidad: String(isCompras ? (f.prov_doc_num || '') : (f.cli_doc_num || '')).trim(),
      razon_social: String(f.razon_social || '').trim(),
      fecha_emision: String(f.fecha_emision || ''),
      importe_total: num(f.importe_total),
      tributario_explicito: f.tributario_explicito !== false,
    };
    if (isCompras) Object.assign(common, {
      g1_base:num(f.g1_base), g1_igv:num(f.g1_igv), g2_base:num(f.g2_base), g2_igv:num(f.g2_igv),
      g3_base:num(f.g3_base), g3_igv:num(f.g3_igv), valor_no_gravado:num(f.valor_no_grav),
      isc:num(f.isc), icbper:num(f.icbper), otros_tributos:num(f.otros_tributos),
      base_imponible:num(f.g1_base)+num(f.g2_base)+num(f.g3_base),
      igv:num(f.g1_igv)+num(f.g2_igv)+num(f.g3_igv),
    }); else Object.assign(common, {
      valor_exportacion:num(f.valor_exportacion ?? f.valor_export), base_gravada:num(f.base_gravada), descuento_base:num(f.descuento_base),
      igv:num(f.igv), descuento_igv:num(f.descuento_igv), exonerado:num(f.exonerada), inafecto:num(f.inafecta),
      isc:num(f.isc), base_ivap:num(f.base_ivap), ivap:num(f.ivap), icbper:num(f.icbper ?? f.icbp),
      otros_tributos:num(f.otros_tributos ?? f.otros), base_imponible:num(f.base_gravada),
    });
    common._key = keyDoc(common.tipo_documento, common.serie, common.numero);
    return common;
  });

  const normSunat = sunatRecords.map(s => {
    const common = {
      tipo_documento: String(s.tipDoc || s.tipo_documento || s.tipo_doc || '').padStart(2, '0'),
      serie: String(s.serCpe || s.serie || '').trim().toUpperCase(),
      numero: String(s.numCpe || s.numero || '').trim(),
      ruc_entidad: String(s.numDocIde || s.ruc_entidad || s.ruc_dni || '').trim(),
      razon_social: String(s.nomRznSocial || s.razon_social || '').trim(),
      fecha_emision: String(s.fecEmi || s.fecha_emision || ''),
      fecha_vencimiento: String(s.fecVcto || s.fecha_vencimiento || s.fecha_venc || ''),
      periodo: String(s.perTributario || s.periodo || ''),
      importe_total: pick(s,'mtoCpe','importe_total','total'),
      moneda: String(s.codMoneda || s.moneda || 'PEN').trim(),
      tipo_cambio: String(s.tipCambio || s.tipo_cambio || s.tc || '1.000').trim(),
    };
    if (isCompras) Object.assign(common, {
      g1_base:pick(s,'g1_base','mtoBi','base_gravada','base_imponible'),
      g1_igv:pick(s,'g1_igv','mtoIgv','igv'),
      g2_base:pick(s,'g2_base','mtoBiMixto','base_gravada_mixta'),
      g2_igv:pick(s,'g2_igv','mtoIgvMixto','igv_mixto'),
      g3_base:pick(s,'g3_base','mtoBiSinCredito','base_sin_credito'),
      g3_igv:pick(s,'g3_igv','mtoIgvSinCredito','igv_sin_credito'),
      valor_no_gravado:pick(s,'valor_no_gravado','valor_no_grav','mtoNoGravado','exonerado') + pick(s,'inafecto'),
      isc:pick(s,'isc','mtoIsc'), base_ivap:pick(s,'base_ivap','mtoBiIvap'), ivap:pick(s,'ivap','mtoIvap'),
      icbper:pick(s,'icbper','mtoIcbper'), otros_tributos:pick(s,'otros_tributos','mtoOtrosTrib'),
    }); else Object.assign(common, {
      valor_exportacion:pick(s,'valor_exportacion','mtoValFactExpo'),
      base_gravada:pick(s,'base_gravada','mtoBi','base_imponible'), descuento_base:pick(s,'descuento_base','mtoDsctoBi'),
      igv:pick(s,'igv','mtoIgv'), descuento_igv:pick(s,'descuento_igv','mtoDsctoIgv'),
      exonerado:pick(s,'exonerado','importe_exonerado','mtoExonerado'),
      inafecto:pick(s,'inafecto','importe_inafecto','mtoInafecto'),
      isc:pick(s,'isc','mtoIsc'), base_ivap:pick(s,'base_ivap','mtoBiIvap'), ivap:pick(s,'ivap','mtoIvap'),
      icbper:pick(s,'icbper','mtoIcbper'), otros_tributos:pick(s,'otros_tributos','mtoOtrosTrib'),
    });
    if (isCompras) {
      common.base_imponible=common.g1_base+common.g2_base+common.g3_base;
      common.igv=common.g1_igv+common.g2_igv+common.g3_igv;
    } else common.base_imponible=common.base_gravada;
    common._key=keyDoc(common.tipo_documento,common.serie,common.numero);
    return common;
  });

  const localMap = new Map(normLocal.map(r => [r._key, r]));
  const sunatMap = new Map(normSunat.map(r => [r._key, r]));
  const enAmbos = [], soloLocal = [], soloSunat = [], conDiferencia = [];
  const camposComparar = isCompras
    ? ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv','valor_no_gravado','isc','icbper','otros_tributos','importe_total']
    : ['valor_exportacion','base_gravada','descuento_base','igv','descuento_igv','exonerado','inafecto','isc','base_ivap','ivap','icbper','otros_tributos','importe_total'];

  for (const [key, loc] of localMap) {
    const sun = sunatMap.get(key);
    if (!sun) { soloLocal.push(loc); continue; }
    const campos = camposComparar.filter(c => Math.abs(num(loc[c])-num(sun[c])) > 0.01);
    if (campos.length) {
      conDiferencia.push({ local:loc, sunat:sun, diffs:{
        diffMonto:campos.includes('importe_total'), diffIgv:campos.some(c=>c.includes('igv')),
        diffBase:campos.some(c=>c.includes('base') || c==='valor_no_gravado' || c==='exonerado' || c==='inafecto'), campos
      }});
    } else enAmbos.push({ local:loc, sunat:sun });
  }
  for (const [key, sun] of sunatMap) if (!localMap.has(key)) soloSunat.push(sun);

  return {
    success: true,
    resumen: {
      totalLocal: normLocal.length, totalSunat: normSunat.length,
      enAmbos: enAmbos.length, soloLocal: soloLocal.length,
      soloSunat: soloSunat.length, conDiferencia: conDiferencia.length,
    },
    enAmbos, soloLocal, soloSunat, conDiferencia,
  };
}

module.exports = {
  testConnection, consultarPeriodos, descargarPropuesta,
  consultarTicket, descargarArchivo, getLogs, getOperaciones,
  listarArchivos, compararLocalSunat,
};
