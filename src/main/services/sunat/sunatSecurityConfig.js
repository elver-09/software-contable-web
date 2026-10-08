// src/main/services/sunat/sunatSecurityConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Configuración de seguridad para los servicios SIRE SUNAT.
// Los hosts se mantienen fijos y no se confía en valores provenientes del
// renderer ni de SQLite para construir destinos de red.
// ─────────────────────────────────────────────────────────────────────────────

const SUNAT_SECURITY_BASE_URL = 'https://api-seguridad.sunat.gob.pe';
const SUNAT_SIRE_BASE_URL = 'https://api-sire.sunat.gob.pe';
const SUNAT_SCOPE = SUNAT_SIRE_BASE_URL;

const CLIENT_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

function validateClientId(clientId) {
  const value = String(clientId || '').trim();
  if (!CLIENT_ID_RE.test(value)) {
    return {
      ok: false,
      error: 'El Client ID tiene un formato inválido. Solo se permiten letras, números, punto, guion y guion bajo.',
    };
  }
  return { ok: true, value };
}

function validateOfficialConfig({ scope, seguridad_base_url, sire_base_url } = {}) {
  if (scope && String(scope).trim() !== SUNAT_SCOPE) {
    return { ok: false, error: 'El scope SIRE no puede modificarse. Debe usar el valor oficial de SUNAT.' };
  }
  if (seguridad_base_url && String(seguridad_base_url).trim().replace(/\/$/, '') !== SUNAT_SECURITY_BASE_URL) {
    return { ok: false, error: 'La URL de seguridad no está permitida. Solo se admite el host oficial de SUNAT.' };
  }
  if (sire_base_url && String(sire_base_url).trim().replace(/\/$/, '') !== SUNAT_SIRE_BASE_URL) {
    return { ok: false, error: 'La URL SIRE no está permitida. Solo se admite el host oficial de SUNAT.' };
  }
  return { ok: true };
}

function buildAuthTokenUrl(clientId) {
  const valid = validateClientId(clientId);
  if (!valid.ok) throw new Error(valid.error);
  return `${SUNAT_SECURITY_BASE_URL}/v1/clientessol/${encodeURIComponent(valid.value)}/oauth2/token/`;
}

function buildSireUrl(requestPath) {
  const path = String(requestPath || '');
  if (!path.startsWith('/v1/') || path.startsWith('//') || /[\r\n\\]/.test(path)) {
    throw new Error('Ruta SIRE inválida o no permitida.');
  }

  const url = new URL(path, `${SUNAT_SIRE_BASE_URL}/`);
  if (url.origin !== SUNAT_SIRE_BASE_URL) {
    throw new Error('Destino SIRE bloqueado: el host no pertenece a SUNAT.');
  }
  if (!url.pathname.startsWith('/v1/contribuyente/migeigv/')) {
    throw new Error('Ruta SIRE fuera del ámbito permitido.');
  }
  return url.toString();
}

module.exports = {
  SUNAT_SECURITY_BASE_URL,
  SUNAT_SIRE_BASE_URL,
  SUNAT_SCOPE,
  validateClientId,
  validateOfficialConfig,
  buildAuthTokenUrl,
  buildSireUrl,
};
