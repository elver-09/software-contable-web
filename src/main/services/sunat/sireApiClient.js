const sireApiClientRepository = require('../../repositories/sireApiClientRepository.js');
// src/main/services/sunat/sireApiClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Cliente HTTP centralizado para las APIs SIRE de SUNAT.
// FASE 8: Mapeo completo de errores con mensajes amigables en español.
// ─────────────────────────────────────────────────────────────────────────────
const { getDB } = require('../../database/db');
const authService = require('./sunatAuthService');
const { buildSireUrl } = require('./sunatSecurityConfig');

const DEFAULT_TIMEOUT = 30000;

// ── Mapeo de errores HTTP SUNAT → mensajes amigables ────────────────────────
const HTTP_ERRORS = {
  400: 'Solicitud inválida. Verifique el formato del período u otros parámetros.',
  401: 'No autorizado. El token venció o las credenciales son incorrectas.',
  403: 'Acceso prohibido. El contribuyente no tiene permisos para esta operación.',
  404: 'Recurso no encontrado. Verifique el período o el endpoint.',
  409: 'Conflicto. Es posible que la operación ya fue realizada previamente.',
  422: 'Datos no procesables. Verifique el formato del archivo o los parámetros enviados.',
  429: 'Demasiadas solicitudes. Espere unos minutos antes de reintentar.',
  500: 'Error interno de SUNAT. Intente más tarde.',
  502: 'SUNAT no disponible temporalmente (Bad Gateway). Intente en unos minutos.',
  503: 'Servicio SUNAT en mantenimiento. Intente más tarde.',
  504: 'SUNAT no respondió a tiempo (Gateway Timeout). Intente más tarde.',
};

// Errores SIRE específicos que vienen en el body de la respuesta
const SIRE_ERRORS = {
  'PER-NO-HAB':        'El período indicado no está habilitado para operaciones SIRE.',
  'TIC-PEN':           'El ticket aún está pendiente de procesamiento. Consulte más tarde.',
  'TIC-FIN':           'El ticket ya fue procesado. Puede descargar el archivo.',
  'TIC-ERR':           'El ticket terminó con error. Verifique los datos enviados.',
  'TIC-NO-ENC':        'El ticket no fue encontrado.',
  'ARC-NO-DISP':       'El archivo solicitado no está disponible.',
  'SIN-PERMISO':       'El contribuyente no tiene permisos suficientes para esta operación.',
  'PROP-NO-ENC':       'No se encontró propuesta SUNAT para el período indicado.',
  'PROP-YA-ACEPTADA':  'La propuesta ya fue aceptada anteriormente.',
  'LIB-NO-HAB':        'El libro electrónico no está habilitado para este contribuyente.',
};

function _traducirErrorSire(data, httpStatus) {
  // 1. Error SIRE específico
  const codError = data?.codError || data?.cod || data?.code || '';
  if (SIRE_ERRORS[codError]) return SIRE_ERRORS[codError];

  // 2. Mensaje del body
  if (data?.message) return data.message;
  if (data?.desError) return data.desError;
  if (data?.error_description) return data.error_description;
  if (data?.error && typeof data.error === 'string') return data.error;

  // 3. Mapeo por código HTTP
  if (HTTP_ERRORS[httpStatus]) return HTTP_ERRORS[httpStatus];

  return `Error inesperado de SUNAT (HTTP ${httpStatus}).`;
}

function _traducirErrorRed(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return `Tiempo de espera agotado. SUNAT no respondió en ${DEFAULT_TIMEOUT / 1000} segundos.`;
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return 'No se puede alcanzar el servidor de SUNAT. Verifique su conexión a internet.';
  }
  if (err.code === 'ECONNREFUSED') {
    return 'Conexión rechazada. SUNAT podría estar en mantenimiento.';
  }
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return 'La conexión se interrumpió. Intente nuevamente.';
  }
  if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'Error de certificado SSL del servidor SUNAT.';
  }
  return `Error de conexión: ${err.message}`;
}

// ── Log (sin datos sensibles) ────────────────────────────────────────────────
function _log(ruc, tipo, periodo, operacion, metodo, endpoint, statusCode, success, mensaje) {
  // Logs desactivados para no llenar la BD
}

// ── Contexto local (el host NO se lee desde SQLite) ──────────────────────────
function _getLocalContext() {
  try {
    const db = getDB();
    const cfg = sireApiClientRepository._getLocalContext_get_sire_config(db);
    return { ruc: cfg?.ruc || '' };
  } catch (_) {
    return { ruc: '' };
  }
}

// ── Petición HTTP autenticada ────────────────────────────────────────────────
async function request(opts) {
  const { ruc } = _getLocalContext();
  const method = (opts.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return { ok: false, status: 0, error: 'Método HTTP SIRE no permitido.' };
  }
  let url;
  try {
    url = buildSireUrl(opts.path);
  } catch (err) {
    _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, String(opts.path || ''), 0, false, err.message);
    return { ok: false, status: 0, error: err.message };
  }

  // 1. Obtener token
  const tokenResult = await authService.getValidToken();
  if (!tokenResult.success) {
    _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, 0, false, `Sin token: ${tokenResult.error}`);
    return { ok: false, status: 0, error: tokenResult.error };
  }

  // 2. Preparar la petición
  // SUNAT requiere Content-Type + Accept en TODAS las peticiones (incluyendo GET)
  const headers = {
    'Authorization': `Bearer ${tokenResult.token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  const fetchOpts = { method, headers, signal: AbortSignal.timeout(opts.timeout || DEFAULT_TIMEOUT) };
  if (opts.body && method !== 'GET') fetchOpts.body = JSON.stringify(opts.body);

  try {
    // Nunca registrar tokens ni cuerpos que puedan contener información sensible.
    console.log(`SIRE API → ${method} ${new URL(url).pathname}`);

    const resp = await fetch(url, fetchOpts);

    console.log(`SIRE API ← HTTP ${resp.status} ${resp.statusText}`);

    // 3. Token vencido → reintentar UNA vez
    if (resp.status === 401 && !opts._retry) {
      const body401 = await resp.text().catch(() => '');
      const renewed = await authService.requestToken();
      if (renewed.success) return request({ ...opts, _retry: true });
      let detail = '';
      try {
        const parsed = JSON.parse(body401);
        detail = parsed?.error_description || parsed?.message || parsed?.desError || '';
      } catch (_) {}
      const msg = detail ? `Token rechazado por SUNAT: ${detail}` : 'Token rechazado por SUNAT (HTTP 401).';
      _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, 401, false, msg);
      return { ok: false, status: 401, error: msg };
    }

    // 4. Respuesta binaria (archivos)
    if (opts.rawBuffer) {
      if (resp.ok) {
        const buffer = Buffer.from(await resp.arrayBuffer());
        _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, resp.status, true,
          `Archivo recibido (${buffer.length} bytes)`);
        return { ok: true, status: resp.status, buffer };
      } else {
        // Error: interpretar sin imprimir el cuerpo completo en consola.
        const errBody = await resp.text().catch(() => '');
        const msg = _traducirErrorSire((() => { try { return JSON.parse(errBody); } catch (_) { return {}; } })(), resp.status);
        _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, resp.status, false, msg);
        return { ok: false, status: resp.status, error: msg };
      }
    }

    // 5. Respuesta JSON
    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok;
    const msg = ok ? (data.message || 'OK') : _traducirErrorSire(data, resp.status);

    _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, resp.status, ok, msg);

    // FASE 9: Limpiar datos sensibles de la respuesta antes de devolverla
    if (data.access_token) delete data.access_token;
    if (data.refresh_token) delete data.refresh_token;

    return { ok, status: resp.status, data, error: ok ? undefined : msg };
  } catch (err) {
    const msg = _traducirErrorRed(err);
    _log(ruc, opts.tipo, opts.periodo, opts.operacion, method, opts.path, 0, false, msg);
    return { ok: false, status: 0, error: msg };
  }
}

module.exports = { request };
