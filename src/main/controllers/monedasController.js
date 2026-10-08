const monedasRepository = require('../repositories/monedasRepository.js');
function _getGlobalDB() {
  // Carga diferida para que la lógica pura de fechas/BCRP pueda probarse sin
  // inicializar Electron ni abrir SQLite.
  return require('../database/db').getGlobalDB();
}

const BCRP_SERIE_COMPRA = 'PD04639PD';
const BCRP_SERIE_VENTA = 'PD04640PD';
const BCRP_BASE_URL = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api';
const SUNAT_TXT_URL = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt';

const MONEDA_USD = 'USD';
const FETCH_TIMEOUT_MS = 15000;
const MAX_DIAS_RANGO = 366;
const DIAS_BUSQUEDA_ANTERIOR = 15;

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

function getMonedas() {
  try {
    const db = _getGlobalDB();
    return monedasRepository.getMonedas_all_monedas(db);
  } catch (error) {
    console.error('Error obteniendo monedas:', error);
    return [];
  }
}

function normalizarMonedaData(data = {}) {
  const tipoCambio = Number(data.tipo_cambio);
  const compra = data.compra === null || data.compra === undefined || data.compra === ''
    ? 0
    : Number(data.compra);
  const venta = data.venta === null || data.venta === undefined || data.venta === ''
    ? (Number.isFinite(tipoCambio) ? tipoCambio : 0)
    : Number(data.venta);

  return {
    fecha: String(data.fecha || '').trim(),
    nombre: String(data.nombre || '').trim().toUpperCase(),
    tipo_cambio: tipoCambio,
    compra: Number.isFinite(compra) ? compra : 0,
    venta: Number.isFinite(venta) ? venta : 0,
    fuente: String(data.fuente || 'MANUAL').trim(),
    fecha_fuente: String(data.fecha_fuente || data.fecha || '').trim()
  };
}

function addMoneda(data) {
  try {
    const db = _getGlobalDB();
    const moneda = normalizarMonedaData(data);

    const fechaOk = validarFechaYYYYMMDD(moneda.fecha);
    if (!fechaOk.ok) return { success: false, error: fechaOk.error };
    if (!moneda.nombre) return { success: false, error: 'La moneda es obligatoria.' };
    if (!Number.isFinite(moneda.tipo_cambio) || moneda.tipo_cambio <= 0) {
      return { success: false, error: 'El tipo de cambio debe ser mayor que cero.' };
    }

    monedasRepository.addMoneda_run_monedas(db, moneda.fecha, moneda.nombre, moneda.tipo_cambio, moneda.compra, moneda.venta, moneda.fuente, moneda.fecha_fuente);

    return { success: true };
  } catch (error) {
    console.error('Error agregando/actualizando moneda:', error);
    return { success: false, error: error.message };
  }
}

function updateMoneda({ newData, oldData }) {
  try {
    const db = _getGlobalDB();
    const fechaOk = validarFechaYYYYMMDD(newData?.fecha);
    if (!fechaOk.ok) return { success: false, error: fechaOk.error };

    const nombre = String(newData?.nombre || '').trim().toUpperCase();
    const tipoCambio = Number(newData?.tipo_cambio);
    if (!nombre) return { success: false, error: 'La moneda es obligatoria.' };
    if (!Number.isFinite(tipoCambio) || tipoCambio <= 0) {
      return { success: false, error: 'El tipo de cambio debe ser mayor que cero.' };
    }

    const info = monedasRepository.updateMoneda_run_monedas(db, newData.fecha, nombre, tipoCambio, oldData.fecha, oldData.nombre);

    if (info.changes === 0) {
      return { success: false, error: 'El registro a actualizar no fue encontrado.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error actualizando moneda:', error);
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return { success: false, error: 'La nueva combinación de fecha y moneda ya existe.' };
    }
    return { success: false, error: error.message };
  }
}

function deleteMoneda({ fecha, nombre }) {
  try {
    const db = _getGlobalDB();
    const info = monedasRepository.deleteMoneda_run_monedas(db, fecha, nombre);
    if (info.changes === 0) {
      return { success: false, error: 'El registro a eliminar no fue encontrado.' };
    }
    return { success: true };
  } catch (error) {
    console.error('Error eliminando moneda:', error);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────

function validarFechaYYYYMMDD(fecha) {
  if (!fecha || typeof fecha !== 'string') return { ok: false, error: 'La fecha es obligatoria.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'La fecha debe tener formato YYYY-MM-DD.' };

  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valida = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valida ? { ok: true } : { ok: false, error: 'La fecha ingresada no es válida.' };
}

function fechaUTC(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatearUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function sumarDias(fecha, dias) {
  const date = fechaUTC(fecha);
  date.setUTCDate(date.getUTCDate() + dias);
  return formatearUTC(date);
}

function restarDias(fecha, dias) {
  return sumarDias(fecha, -dias);
}

function diferenciaDias(desde, hasta) {
  return Math.floor((fechaUTC(hasta) - fechaUTC(desde)) / 86400000);
}

function hoyLocalYYYYMMDD() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validarRango(desde, hasta) {
  const vd = validarFechaYYYYMMDD(desde);
  if (!vd.ok) return { ok: false, error: `Fecha desde: ${vd.error}` };
  const vh = validarFechaYYYYMMDD(hasta);
  if (!vh.ok) return { ok: false, error: `Fecha hasta: ${vh.error}` };
  if (desde > hasta) return { ok: false, error: 'La fecha desde no puede ser posterior a la fecha hasta.' };

  const dias = diferenciaDias(desde, hasta) + 1;
  if (dias > MAX_DIAS_RANGO) {
    return { ok: false, error: `El rango máximo permitido es de ${MAX_DIAS_RANGO} días.` };
  }

  const hoy = hoyLocalYYYYMMDD();
  if (hasta > hoy) return { ok: false, error: 'No se pueden descargar tipos de cambio de fechas futuras.' };
  return { ok: true, dias };
}

// ─────────────────────────────────────────────
// BCRP oficial: series SBS compra/venta
// ─────────────────────────────────────────────

function convertirNumeroBCRP(valor) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim().replace(',', '.');
  if (!limpio || ['n.d.', 'n.d', 'nd', 'nan'].includes(limpio.toLowerCase())) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function parsearJSONBCRP(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const limpio = texto.trim();
  if (!limpio) return null;

  try { return JSON.parse(limpio); } catch (_) { /* algunos responses agregan contenido extra */ }

  const inicio = limpio.indexOf('{');
  if (inicio < 0) return null;
  let profundidad = 0;
  let dentroString = false;
  let escapado = false;

  for (let i = inicio; i < limpio.length; i++) {
    const ch = limpio[i];
    if (escapado) { escapado = false; continue; }
    if (ch === '\\') { escapado = true; continue; }
    if (ch === '"') { dentroString = !dentroString; continue; }
    if (dentroString) continue;
    if (ch === '{') profundidad++;
    if (ch === '}') {
      profundidad--;
      if (profundidad === 0) {
        try { return JSON.parse(limpio.slice(inicio, i + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

const MESES_BCRP = Object.freeze({
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12
});

function parsearFechaBCRP(nombre) {
  const match = String(nombre || '').trim().match(/^(\d{1,2})\.([A-Za-zÁÉÍÓÚáéíóú]{3})\.(\d{2}|\d{4})$/);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = MESES_BCRP[match[2].toLowerCase()];
  let year = Number(match[3]);
  if (!mes) return null;
  if (year < 100) year = year >= 70 ? 1900 + year : 2000 + year;

  const fecha = `${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return validarFechaYYYYMMDD(fecha).ok ? fecha : null;
}

function mapearErrorConexion(error, fuente = 'la fuente de tipo de cambio') {
  if (error?.name === 'AbortError') return `Tiempo de espera agotado consultando ${fuente}.`;
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)) {
    return `No se pudo conectar con ${fuente}. Verifique su conexión a internet.`;
  }
  return error?.message || `Error inesperado consultando ${fuente}.`;
}

async function consultarBCRPRango(desde, hasta) {
  if (desde > hasta) return [];

  const series = `${BCRP_SERIE_COMPRA}-${BCRP_SERIE_VENTA}`;
  const url = `${BCRP_BASE_URL}/${series}/json/${desde}/${hasta}/esp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' }
    });

    if (!response.ok) throw new Error(`BCRP respondió HTTP ${response.status}.`);
    const data = parsearJSONBCRP(await response.text());
    if (!data || !Array.isArray(data.periods)) throw new Error('BCRP no devolvió un JSON de series válido.');

    return data.periods.map(periodo => {
      const fecha = parsearFechaBCRP(periodo?.name);
      const compra = convertirNumeroBCRP(periodo?.values?.[0]);
      const venta = convertirNumeroBCRP(periodo?.values?.[1]);
      return fecha && compra !== null && venta !== null ? { fecha, compra, venta } : null;
    }).filter(Boolean).sort((a, b) => a.fecha.localeCompare(b.fecha));
  } finally {
    clearTimeout(timeout);
  }
}

// SUNAT indica que su T.C. publicado corresponde al cierre SBS del día anterior.
// Por ello, para reconstruir una fecha SUNAT D desde BCRP usamos la última
// observación SBS válida estrictamente anterior a D. En fines de semana/feriados,
// el mismo valor se arrastra hasta que exista una nueva observación publicada.
function construirTiposSUNATDesdeBCRP(desde, hasta, observaciones) {
  const resultados = [];
  let indice = 0;
  let ultima = null;
  const ordenadas = [...observaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    while (indice < ordenadas.length && ordenadas[indice].fecha < fecha) {
      ultima = ordenadas[indice];
      indice++;
    }

    if (!ultima) continue;
    resultados.push({
      fecha,
      nombre: MONEDA_USD,
      compra: ultima.compra,
      venta: ultima.venta,
      tipo_cambio: ultima.venta,
      fuente: 'BCRP/SBS→SUNAT',
      fecha_fuente: ultima.fecha
    });
  }

  return resultados;
}

// ─────────────────────────────────────────────
// SUNAT oficial (dato publicado más reciente)
// ─────────────────────────────────────────────

async function fetchSUNATTxt() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SUNAT_TXT_URL, { signal: controller.signal, headers: { Accept: 'text/plain,*/*' } });
    if (!response.ok) return null;
    const parts = (await response.text()).trim().split('|');
    if (parts.length < 3) return null;

    const fechaParts = String(parts[0] || '').trim().split('/');
    if (fechaParts.length !== 3) return null;
    const [d, m, y] = fechaParts;
    const fecha = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!validarFechaYYYYMMDD(fecha).ok) return null;

    const compra = Number(String(parts[1]).replace(',', '.'));
    const venta = Number(String(parts[2]).replace(',', '.'));
    if (!Number.isFinite(compra) || !Number.isFinite(venta) || compra <= 0 || venta <= 0) return null;
    return { fecha, compra, venta };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function guardarLoteTiposCambio(registros) {
  const db = _getGlobalDB();
  const existentes = new Set(
    monedasRepository.guardarLoteTiposCambio_all_monedas(db, MONEDA_USD).map(r => r.clave)
  );

  const upsert = monedasRepository.guardarLoteTiposCambio_prepare_monedas(db);

  let insertados = 0;
  let actualizados = 0;
  const tx = db.transaction((items) => {
    for (const item of items) {
      const clave = `${item.fecha}|${item.nombre}`;
      upsert.run(item.fecha, item.nombre, item.tipo_cambio, item.compra, item.venta, item.fuente, item.fecha_fuente || '');
      if (existentes.has(clave)) actualizados++;
      else { insertados++; existentes.add(clave); }
    }
  });
  tx(registros);

  return { insertados, actualizados, guardados: insertados + actualizados };
}

function normalizarParametrosRango(paramsOrYear, month) {
  // Compatibilidad con la firma anterior fetchTipoCambioRango(year, month)
  if (typeof paramsOrYear === 'number' || /^\d{4}$/.test(String(paramsOrYear || ''))) {
    const year = Number(paramsOrYear);
    const mes = Number(month);
    if (!Number.isInteger(year) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;
    const desde = `${year}-${String(mes).padStart(2, '0')}-01`;
    const fin = new Date(Date.UTC(year, mes, 0));
    const hasta = formatearUTC(fin);
    return { desde, hasta };
  }

  if (paramsOrYear && typeof paramsOrYear === 'object') {
    return { desde: paramsOrYear.desde, hasta: paramsOrYear.hasta };
  }
  return null;
}

async function fetchTipoCambioRango(paramsOrYear, month) {
  const params = normalizarParametrosRango(paramsOrYear, month);
  if (!params) return { success: false, error: 'Parámetros de rango inválidos.' };

  const { desde, hasta } = params;
  const validacion = validarRango(desde, hasta);
  if (!validacion.ok) return { success: false, error: validacion.error };

  try {
    // Pedimos días previos porque el T.C. SUNAT de la primera fecha puede depender
    // de la última cotización SBS válida del periodo anterior.
    const bcrpDesde = restarDias(desde, DIAS_BUSQUEDA_ANTERIOR);
    const bcrpHasta = restarDias(hasta, 1);
    let observaciones = [];
    let errorBCRP = null;

    try {
      observaciones = await consultarBCRPRango(bcrpDesde, bcrpHasta);
    } catch (error) {
      errorBCRP = mapearErrorConexion(error, 'BCRP');
    }

    let registros = construirTiposSUNATDesdeBCRP(desde, hasta, observaciones);
    const porFecha = new Map(registros.map(r => [r.fecha, r]));

    // Para hoy, preferimos el dato directamente publicado por SUNAT cuando está disponible.
    const hoy = hoyLocalYYYYMMDD();
    let sunatDirecto = 0;
    if (desde <= hoy && hasta >= hoy) {
      const sunat = await fetchSUNATTxt();
      if (sunat && sunat.fecha <= hoy && diferenciaDias(sunat.fecha, hoy) <= DIAS_BUSQUEDA_ANTERIOR) {
        porFecha.set(hoy, {
          fecha: hoy,
          nombre: MONEDA_USD,
          compra: sunat.compra,
          venta: sunat.venta,
          tipo_cambio: sunat.venta,
          fuente: 'SUNAT',
          fecha_fuente: sunat.fecha
        });
        sunatDirecto = 1;
      }
    }

    registros = [...porFecha.values()]
      .filter(r => r.fecha >= desde && r.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (registros.length === 0) {
      return {
        success: false,
        error: errorBCRP || `No se encontró información suficiente para el rango ${desde} a ${hasta}.`
      };
    }

    const persistencia = guardarLoteTiposCambio(registros);
    const totalSolicitados = validacion.dias;
    const fechasGuardadas = new Set(registros.map(r => r.fecha));
    const sinDato = [];
    for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
      if (!fechasGuardadas.has(fecha)) sinDato.push(fecha);
    }

    return {
      success: true,
      desde,
      hasta,
      solicitados: totalSolicitados,
      guardados: persistencia.guardados,
      insertados: persistencia.insertados,
      actualizados: persistencia.actualizados,
      sunat_directo: sunatDirecto,
      bcrp_derivados: registros.filter(r => r.fuente.startsWith('BCRP')).length,
      sin_dato: sinDato,
      aviso: errorBCRP && sunatDirecto ? errorBCRP : null
    };
  } catch (error) {
    console.error('Error obteniendo rango de tipo de cambio:', error.message);
    return { success: false, error: mapearErrorConexion(error) };
  }
}

async function fetchAndSaveTipoCambio(fecha) {
  const validacion = validarFechaYYYYMMDD(fecha);
  if (!validacion.ok) return { success: false, error: validacion.error };

  const resultado = await fetchTipoCambioRango({ desde: fecha, hasta: fecha });
  if (!resultado.success) return resultado;

  const db = _getGlobalDB();
  const data = monedasRepository.fetchAndSaveTipoCambio_get_monedas(db, fecha, MONEDA_USD);

  return data
    ? { success: true, data: { ...data, fecha_solicitada: fecha, fecha_encontrada: data.fecha_fuente || fecha } }
    : { success: false, error: `No se pudo resolver un tipo de cambio para ${fecha}.` };
}

module.exports = {
  getMonedas,
  addMoneda,
  updateMoneda,
  deleteMoneda,
  fetchAndSaveTipoCambio,
  fetchTipoCambioRango,
  // exportados para pruebas unitarias/diagnóstico
  _parsearFechaBCRP: parsearFechaBCRP,
  _construirTiposSUNATDesdeBCRP: construirTiposSUNATDesdeBCRP,
  _validarRango: validarRango
};
