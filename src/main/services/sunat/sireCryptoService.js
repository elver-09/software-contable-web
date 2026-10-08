// src/main/services/sunat/sireCryptoService.js
// ─────────────────────────────────────────────────────────────────────────────
// Protección de datos sensibles SIRE (Clave SOL, Client Secret y tokens).
//
// Prioridad:
//   1) Electron safeStorage -> DPAPI (Windows), Keychain (macOS), keyring (Linux)
//   2) SIRE_MASTER_KEY      -> AES-256-GCM para entornos sin safeStorage seguro
//
// Nunca se genera una clave a partir de hostname/hardware para NUEVOS datos.
// Ese mecanismo predecible se conserva únicamente para intentar recuperar datos
// legacy generados por versiones anteriores cuando safeStorage no estaba activo.
// ─────────────────────────────────────────────────────────────────────────────
const nodeCrypto = require('crypto');
const os = require('os');

const SAFE_PREFIX = 'ss1:';
const ENV_PREFIX = 'env1:';
const LEGACY_ALGORITHM = 'aes-256-gcm';
const LEGACY_IV_LENGTH = 16;
const TAG_LENGTH = 16;
const LEGACY_SALT = 'sire-contable-pro-2026';

function _safeStorageState() {
  try {
    const { safeStorage } = require('../../../../server/electron.cjs');
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      return { available: false, secure: false, backend: 'unavailable', safeStorage: null };
    }

    let backend = process.platform === 'win32' ? 'Windows DPAPI'
      : process.platform === 'darwin' ? 'macOS Keychain'
      : 'Linux secret store';

    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      backend = safeStorage.getSelectedStorageBackend();
      if (backend === 'basic_text') {
        return { available: true, secure: false, backend, safeStorage };
      }
    }
    return { available: true, secure: true, backend, safeStorage };
  } catch (_) {
    return { available: false, secure: false, backend: 'unavailable', safeStorage: null };
  }
}

function _getEnvMasterSecret() {
  const value = String(process.env.SIRE_MASTER_KEY || '');
  return value.length >= 32 ? value : '';
}

function getSecurityInfo() {
  const ss = _safeStorageState();
  if (ss.secure) {
    return {
      available: true,
      secure: true,
      provider: 'safeStorage',
      backend: ss.backend,
      message: `Credenciales protegidas por ${ss.backend}.`,
    };
  }

  if (_getEnvMasterSecret()) {
    return {
      available: true,
      secure: true,
      provider: 'environment',
      backend: 'SIRE_MASTER_KEY + AES-256-GCM',
      message: 'Credenciales protegidas mediante una clave maestra del entorno.',
    };
  }

  const linuxBasic = process.platform === 'linux' && ss.backend === 'basic_text';
  return {
    available: false,
    secure: false,
    provider: 'none',
    backend: ss.backend,
    message: linuxBasic
      ? 'El almacén seguro de Linux está en modo basic_text. Configure un keyring seguro o SIRE_MASTER_KEY.'
      : 'No hay un almacén seguro disponible. No se guardarán nuevas credenciales hasta habilitar safeStorage o SIRE_MASTER_KEY.',
  };
}

function _encryptWithEnv(plainText) {
  const master = _getEnvMasterSecret();
  if (!master) throw new Error('SIRE_MASTER_KEY no está configurada o es demasiado corta.');
  const salt = nodeCrypto.randomBytes(16);
  const iv = nodeCrypto.randomBytes(12);
  const key = nodeCrypto.scryptSync(master, salt, 32);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENV_PREFIX + Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

function _decryptWithEnv(payload) {
  const master = _getEnvMasterSecret();
  if (!master) throw new Error('La clave maestra del entorno no está disponible.');
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 45) throw new Error('Dato cifrado inválido.');
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const encrypted = buf.subarray(44);
  const key = nodeCrypto.scryptSync(master, salt, 32);
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

function _decryptLegacyHardware(encryptedBase64) {
  // Compatibilidad exclusiva con el fallback antiguo hostname/plataforma.
  const seed = `${os.hostname()}-${os.platform()}-${LEGACY_SALT}`;
  const key = nodeCrypto.scryptSync(seed, LEGACY_SALT, 32);
  const buf = Buffer.from(encryptedBase64, 'base64');
  if (buf.length < LEGACY_IV_LENGTH + TAG_LENGTH + 1) throw new Error('Legacy inválido.');
  const iv = buf.subarray(0, LEGACY_IV_LENGTH);
  const tag = buf.subarray(LEGACY_IV_LENGTH, LEGACY_IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(LEGACY_IV_LENGTH + TAG_LENGTH);
  const decipher = nodeCrypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

function encrypt(plainText) {
  if (!plainText) return '';
  const value = String(plainText);
  const ss = _safeStorageState();

  if (ss.secure) {
    const encrypted = ss.safeStorage.encryptString(value);
    return SAFE_PREFIX + encrypted.toString('base64');
  }

  if (_getEnvMasterSecret()) return _encryptWithEnv(value);

  throw new Error(getSecurityInfo().message);
}

function decryptWithMeta(encryptedValue) {
  if (!encryptedValue) return { value: '', decryptable: true, needsMigration: false, format: 'empty' };
  const raw = String(encryptedValue);

  try {
    if (raw.startsWith(SAFE_PREFIX)) {
      const ss = _safeStorageState();
      if (!ss.secure) return { value: '', decryptable: false, needsMigration: false, format: 'safeStorage' };
      const value = ss.safeStorage.decryptString(Buffer.from(raw.slice(SAFE_PREFIX.length), 'base64'));
      return { value, decryptable: true, needsMigration: false, format: 'safeStorage' };
    }

    if (raw.startsWith(ENV_PREFIX)) {
      const value = _decryptWithEnv(raw.slice(ENV_PREFIX.length));
      // Si safeStorage ya está disponible, conviene migrar desde la clave de entorno.
      return { value, decryptable: true, needsMigration: _safeStorageState().secure, format: 'environment' };
    }

    // Dato sin prefijo = formato legacy. Solo se intenta el fallback determinista
    // antiguo. Los datos antiguos cifrados con una clave derivada de una salida
    // aleatoria de safeStorage no son recuperables tras reiniciar y deberán reingresarse.
    const value = _decryptLegacyHardware(raw);
    return { value, decryptable: true, needsMigration: true, format: 'legacy-hardware' };
  } catch (_) {
    return { value: '', decryptable: false, needsMigration: false, format: raw.includes(':') ? 'unknown' : 'legacy-unreadable' };
  }
}

function decrypt(encryptedValue) {
  return decryptWithMeta(encryptedValue).value;
}

function inspect(encryptedValue) {
  if (!encryptedValue) return { present: false, decryptable: true, needsMigration: false, format: 'empty' };
  const meta = decryptWithMeta(encryptedValue);
  return {
    present: true,
    decryptable: meta.decryptable,
    needsMigration: meta.needsMigration,
    format: meta.format,
  };
}

function migrateCiphertextIfNeeded(encryptedValue) {
  const meta = decryptWithMeta(encryptedValue);
  if (!meta.decryptable) return { success: false, value: encryptedValue, error: 'La credencial almacenada no se puede descifrar.' };
  if (!meta.needsMigration) return { success: true, value: encryptedValue, migrated: false };
  try {
    return { success: true, value: encrypt(meta.value), migrated: true };
  } catch (err) {
    return { success: false, value: encryptedValue, error: err.message };
  }
}

function mask(value, visibleChars = 3) {
  if (!value || value.length <= visibleChars * 2) return '***';
  return value.substring(0, visibleChars) + '***' + value.substring(value.length - visibleChars);
}

module.exports = {
  encrypt,
  decrypt,
  decryptWithMeta,
  inspect,
  migrateCiphertextIfNeeded,
  getSecurityInfo,
  mask,
};
