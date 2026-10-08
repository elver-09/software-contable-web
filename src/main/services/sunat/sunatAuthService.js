const sunatAuthServiceRepository = require('../../repositories/sunatAuthServiceRepository.js');
// src/main/services/sunat/sunatAuthService.js
// ─────────────────────────────────────────────────────────────────────────────
// Autenticación OAuth2 contra el API de Seguridad SUNAT.
// FASE 6: Token completo con refresh, revocación y detección granular de errores.
// ─────────────────────────────────────────────────────────────────────────────
const { getDB } = require('../../database/db');
const crypto = require('./sireCryptoService');
const {
  SUNAT_SCOPE,
  buildAuthTokenUrl,
  validateClientId,
} = require('./sunatSecurityConfig');

// Mapeo de errores OAuth2 → mensajes amigables en español
const AUTH_ERRORS = {
  invalid_client:       'Client ID o Client Secret inválidos. Verifique sus credenciales API.',
  invalid_grant:        'Usuario SOL o Clave SOL incorrectos. Verifique sus credenciales.',
  unauthorized_client:  'El Client ID no está autorizado para este scope. Revise la configuración en SOL.',
  invalid_scope:        `El scope solicitado no es válido. Debe ser ${SUNAT_SCOPE}`,
  unsupported_grant_type: 'Tipo de concesión no soportado por SUNAT.',
  access_denied:        'Acceso denegado. El contribuyente no tiene permisos para SIRE.',
};

function _getConfig() {
  try {
    const db = getDB();
    return sunatAuthServiceRepository._getConfig_get_sire_config(db) || null;
  } catch (_) { return null; }
}

function _updateConfig(fields) {
  try {
    const db = getDB();
    const keys = Object.keys(fields);
    const vals = keys.map(k => fields[k]);
    const existing = sunatAuthServiceRepository._updateConfig_get_sire_config(db);
    if (existing) {
      sunatAuthServiceRepository._updateConfig_run_sire_config(db, { keys }, ...vals);
    } else {
      sunatAuthServiceRepository._updateConfig_run_sire_config_2(db, { keys }, ...vals);
    }
  } catch (err) {
    console.error('sunatAuth._updateConfig:', err.message);
  }
}

function _log(cfg, operacion, metodo, endpoint, statusCode, success, mensaje) {
  // Logs desactivados para no llenar la BD
}

// Traduce el código de error OAuth2 a un mensaje amigable
function _traducirErrorAuth(data, httpStatus) {
  const code = data.error || '';
  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  if (data.error_description) return data.error_description;
  if (httpStatus === 401) return 'Credenciales rechazadas por SUNAT (HTTP 401).';
  if (httpStatus === 403) return 'Acceso prohibido. El contribuyente no tiene permisos suficientes (HTTP 403).';
  if (httpStatus === 404) return 'Endpoint de autenticación no encontrado. Verifique la URL base de seguridad.';
  if (httpStatus === 429) return 'Demasiadas solicitudes. Espere unos minutos e intente nuevamente.';
  if (httpStatus >= 500) return `Error interno de SUNAT (HTTP ${httpStatus}). Intente más tarde.`;
  return `Error de autenticación: HTTP ${httpStatus}`;
}

// Traduce errores de red a mensajes amigables
function _traducirErrorRed(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return 'Tiempo de espera agotado. SUNAT no respondió en 15 segundos. Intente más tarde.';
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return 'No se puede resolver el servidor de SUNAT. Verifique su conexión a internet.';
  }
  if (err.code === 'ECONNREFUSED') {
    return 'Conexión rechazada por el servidor de SUNAT. El servicio podría estar en mantenimiento.';
  }
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return 'La conexión con SUNAT se interrumpió. Intente nuevamente.';
  }
  if (err.message && (err.message.includes('fetch') || err.message.includes('network'))) {
    return 'Sin conexión a internet o SUNAT no disponible.';
  }
  return `Error de conexión: ${err.message}`;
}

/**
 * Solicita un nuevo access_token a SUNAT vía OAuth2 password grant.
 */
async function requestToken() {
  const cfg = _getConfig();
  if (!cfg) return { success: false, error: 'Configuración SIRE no encontrada. Vaya a Configuración.' };
  if (!cfg.client_id) return { success: false, error: 'Client ID no configurado.' };
  if (!cfg.clave_sol_enc) return { success: false, error: 'Clave SOL no configurada.' };
  if (!cfg.client_secret_enc) return { success: false, error: 'Client Secret no configurado.' };
  if (!cfg.ruc || cfg.ruc.length !== 11) return { success: false, error: 'RUC no configurado o inválido.' };
  if (!cfg.usuario_sol) return { success: false, error: 'Usuario SOL no configurado.' };

  const clientValidation = validateClientId(cfg.client_id);
  if (!clientValidation.ok) return { success: false, error: clientValidation.error };

  const claveMeta = crypto.decryptWithMeta(cfg.clave_sol_enc);
  const secretMeta = crypto.decryptWithMeta(cfg.client_secret_enc);
  const claveSol = claveMeta.value;
  const clientSecret = secretMeta.value;

  if (!claveSol) return { success: false, error: 'No se pudo descifrar la Clave SOL. Vuelva a ingresarla en Configuración SIRE.' };
  if (!clientSecret) return { success: false, error: 'No se pudo descifrar el Client Secret. Vuelva a ingresarlo en Configuración SIRE.' };

  // Migrar transparentemente cifrados legacy recuperables al esquema seguro actual.
  const migrationFields = {};
  if (claveMeta.needsMigration) {
    try { migrationFields.clave_sol_enc = crypto.encrypt(claveSol); } catch (_) {}
  }
  if (secretMeta.needsMigration) {
    try { migrationFields.client_secret_enc = crypto.encrypt(clientSecret); } catch (_) {}
  }
  if (Object.keys(migrationFields).length) _updateConfig(migrationFields);

  const username = `${cfg.ruc}${cfg.usuario_sol}`;
  const scope = SUNAT_SCOPE;
  let endpoint;
  try {
    endpoint = buildAuthTokenUrl(clientValidation.value);
  } catch (err) {
    return { success: false, error: err.message };
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    scope,
    client_id: cfg.client_id,
    client_secret: clientSecret,
    username,
    password: claveSol,
  });

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.access_token) {
      const msg = _traducirErrorAuth(data, resp.status);
      _log(cfg, 'REQUEST_TOKEN', 'POST', endpoint, resp.status, false, msg);
      _updateConfig({ estado_conexion: resp.status === 401 || resp.status === 400 ? 'ERROR_AUTH' : 'ERROR_CONEXION' });
      return { success: false, error: msg };
    }

    // Token obtenido correctamente
    const expiresIn = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    let encryptedToken;
    try {
      encryptedToken = crypto.encrypt(data.access_token);
    } catch (err) {
      _updateConfig({ estado_conexion: 'ERROR_CREDENCIALES' });
      return { success: false, error: `Token recibido, pero no se pudo proteger localmente: ${err.message}` };
    }

    const updateFields = {
      access_token_enc: encryptedToken,
      token_expires_at: expiresAt,
      estado_conexion: 'CONECTADO',
    };

    _updateConfig(updateFields);
    _log(cfg, 'REQUEST_TOKEN', 'POST', endpoint, resp.status, true,
      `Token obtenido (expira en ${expiresIn}s → ${expiresAt.substring(0, 19)})`);

    // No retornar el token al caller que no lo necesite (solo success)
    return { success: true, expiresAt };
  } catch (err) {
    const msg = _traducirErrorRed(err);
    _log(cfg, 'REQUEST_TOKEN', 'POST', endpoint, 0, false, msg);
    _updateConfig({ estado_conexion: 'ERROR_CONEXION' });
    return { success: false, error: msg };
  }
}

/**
 * Devuelve un token válido (descifrado). Si está vencido, solicita uno nuevo.
 * Solo debe llamarse desde servicios del main process (nunca exponer al renderer).
 */
async function getValidToken() {
  const cfg = _getConfig();
  if (!cfg) return { success: false, error: 'Configuración SIRE no encontrada.' };

  if (cfg.access_token_enc && cfg.token_expires_at) {
    const now = Date.now();
    const expires = new Date(cfg.token_expires_at).getTime();
    // Margen de 90 segundos antes de expirar para evitar race conditions
    if (now < expires - 90000) {
      const tokenMeta = crypto.decryptWithMeta(cfg.access_token_enc);
      if (tokenMeta.value) {
        if (tokenMeta.needsMigration) {
          try { _updateConfig({ access_token_enc: crypto.encrypt(tokenMeta.value) }); } catch (_) {}
        }
        return { success: true, token: tokenMeta.value };
      }
    }
  }

  // Token vencido, inexistente o no se pudo descifrar → renovar
  const result = await requestToken();
  if (!result.success) return result;

  // Leer el token recién guardado
  const fresh = _getConfig();
  const token = fresh?.access_token_enc ? crypto.decrypt(fresh.access_token_enc) : '';
  if (!token) return { success: false, error: 'Token generado pero no se pudo recuperar.' };
  return { success: true, token };
}

/**
 * Prueba la conexión solicitando un token y devuelve el estado.
 */
async function testConnection() {
  const result = await requestToken();
  if (result.success) {
    return {
      success: true,
      estado: 'CONECTADO',
      mensaje: `Conexión exitosa con SUNAT. Token válido hasta ${result.expiresAt?.substring(0, 19) || '—'}.`,
    };
  }
  return { success: false, estado: 'ERROR', mensaje: result.error };
}

/**
 * Revoca el token actual (limpia de la BD). Útil al cambiar credenciales.
 */
function revokeToken() {
  try {
    _updateConfig({
      access_token_enc: null,
      token_expires_at: null,
      estado_conexion: 'CONFIGURADO',
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { requestToken, getValidToken, testConnection, revokeToken };
