// src/main/controllers/sireConfigController.js
// ─────────────────────────────────────────────────────────────────────────────
// Gestión segura de credenciales SUNAT para SIRE API.
// - Nunca devuelve Clave SOL / Client Secret en texto plano al renderer.
// - Los hosts y scope SUNAT son fijos y validados.
// - Migra credenciales legacy si aún pueden descifrarse.
// ─────────────────────────────────────────────────────────────────────────────
const { getDB } = require('../database/db');
const crypto = require('../services/sunat/sireCryptoService');
const {
  SUNAT_SCOPE,
  SUNAT_SECURITY_BASE_URL,
  SUNAT_SIRE_BASE_URL,
  validateClientId,
  validateOfficialConfig,
} = require('../services/sunat/sunatSecurityConfig');

function _credState(value) {
  return crypto.inspect(value);
}

function _normalizeOfficialEndpoints(db) {
  // Aunque alguien haya alterado manualmente SQLite, dejamos persistidos los
  // valores oficiales. Los servicios de red, además, NO confían en estas columnas.
  try {
    db.prepare(`
      UPDATE sire_config
         SET scope = ?, seguridad_base_url = ?, sire_base_url = ?
       WHERE id = 1
         AND (COALESCE(scope,'') <> ?
          OR COALESCE(seguridad_base_url,'') <> ?
          OR COALESCE(sire_base_url,'') <> ?)
    `).run(
      SUNAT_SCOPE, SUNAT_SECURITY_BASE_URL, SUNAT_SIRE_BASE_URL,
      SUNAT_SCOPE, SUNAT_SECURITY_BASE_URL, SUNAT_SIRE_BASE_URL,
    );
  } catch (_) {}
}

function getConfig() {
  try {
    const db = getDB();
    _normalizeOfficialEndpoints(db);
    const row = db.prepare('SELECT * FROM sire_config WHERE id = 1').get();
    const security = crypto.getSecurityInfo();

    if (!row) {
      return {
        success: true,
        config: {
          ruc: '', usuario_sol: '', clave_sol: '', client_id: '', client_secret: '',
          scope: SUNAT_SCOPE,
          seguridad_base_url: SUNAT_SECURITY_BASE_URL,
          sire_base_url: SUNAT_SIRE_BASE_URL,
          estado_conexion: 'NO_CONFIGURADO',
          token_expires_at: '',
          tiene_clave_sol: false,
          tiene_client_secret: false,
          tiene_token: false,
          credenciales_requieren_reingreso: false,
          seguridad_credenciales: security,
        },
      };
    }

    const claveState = _credState(row.clave_sol_enc);
    const secretState = _credState(row.client_secret_enc);
    const tokenState = _credState(row.access_token_enc);
    const requiereReingreso =
      (claveState.present && !claveState.decryptable) ||
      (secretState.present && !secretState.decryptable);

    return {
      success: true,
      config: {
        ruc: row.ruc || '',
        usuario_sol: row.usuario_sol || '',
        // Nunca desciframos únicamente para mostrar/enmascarar en UI.
        clave_sol: '',
        client_id: row.client_id || '',
        client_secret: '',
        scope: SUNAT_SCOPE,
        seguridad_base_url: SUNAT_SECURITY_BASE_URL,
        sire_base_url: SUNAT_SIRE_BASE_URL,
        estado_conexion: requiereReingreso ? 'ERROR_CREDENCIALES' : (row.estado_conexion || 'NO_CONFIGURADO'),
        token_expires_at: row.token_expires_at || '',
        tiene_clave_sol: claveState.present && claveState.decryptable,
        tiene_client_secret: secretState.present && secretState.decryptable,
        tiene_token: tokenState.present && tokenState.decryptable,
        clave_sol_invalida: claveState.present && !claveState.decryptable,
        client_secret_invalido: secretState.present && !secretState.decryptable,
        credenciales_requieren_reingreso: requiereReingreso,
        credenciales_legacy: claveState.needsMigration || secretState.needsMigration,
        seguridad_credenciales: security,
      },
    };
  } catch (err) {
    console.error('sireConfigController.getConfig:', err.message);
    return { success: false, error: err.message };
  }
}

function _prepareExistingCipher(existingCipher, fieldLabel) {
  if (!existingCipher) return { success: true, value: '' };
  const state = crypto.inspect(existingCipher);
  if (!state.decryptable) {
    return {
      success: false,
      error: `${fieldLabel} almacenado no puede recuperarse con el nuevo esquema seguro. Ingréselo nuevamente.`,
    };
  }
  if (!state.needsMigration) return { success: true, value: existingCipher };

  const migrated = crypto.migrateCiphertextIfNeeded(existingCipher);
  if (!migrated.success) {
    return { success: false, error: `No se pudo migrar ${fieldLabel}: ${migrated.error}` };
  }
  return { success: true, value: migrated.value };
}

function saveConfig(data = {}) {
  try {
    const db = getDB();

    if (!data.ruc || !/^\d{11}$/.test(String(data.ruc).trim())) {
      return { success: false, error: 'El RUC debe tener exactamente 11 dígitos.' };
    }
    const usuarioSol = String(data.usuario_sol || '').trim().toUpperCase();
    if (!usuarioSol) return { success: false, error: 'El usuario SOL es obligatorio.' };
    if (usuarioSol.length > 50 || /[\r\n\0]/.test(usuarioSol)) {
      return { success: false, error: 'El usuario SOL tiene un formato inválido.' };
    }

    const clientValidation = validateClientId(data.client_id);
    if (!clientValidation.ok) return { success: false, error: clientValidation.error };

    const officialValidation = validateOfficialConfig(data);
    if (!officialValidation.ok) return { success: false, error: officialValidation.error };

    const existing = db.prepare(`
      SELECT id, clave_sol_enc, client_secret_enc
      FROM sire_config WHERE id = 1
    `).get();

    const fields = {
      ruc: String(data.ruc).trim(),
      usuario_sol: usuarioSol,
      client_id: clientValidation.value,
      scope: SUNAT_SCOPE,
      seguridad_base_url: SUNAT_SECURITY_BASE_URL,
      sire_base_url: SUNAT_SIRE_BASE_URL,
      estado_conexion: 'CONFIGURADO',
    };

    // Clave SOL nueva o migración segura de la existente.
    if (data.clave_sol && !String(data.clave_sol).includes('***')) {
      fields.clave_sol_enc = crypto.encrypt(String(data.clave_sol));
    } else {
      const prepared = _prepareExistingCipher(existing?.clave_sol_enc, 'la Clave SOL');
      if (!prepared.success) return prepared;
      fields.clave_sol_enc = prepared.value;
    }

    // Client Secret nuevo o migración segura del existente.
    if (data.client_secret && !String(data.client_secret).includes('***')) {
      fields.client_secret_enc = crypto.encrypt(String(data.client_secret));
    } else {
      const prepared = _prepareExistingCipher(existing?.client_secret_enc, 'el Client Secret');
      if (!prepared.success) return prepared;
      fields.client_secret_enc = prepared.value;
    }

    if (!fields.clave_sol_enc) return { success: false, error: 'La Clave SOL es obligatoria.' };
    if (!fields.client_secret_enc) return { success: false, error: 'El Client Secret es obligatorio.' };

    const keys = Object.keys(fields);
    const tx = db.transaction(() => {
      if (existing) {
        const sets = keys.map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE sire_config SET ${sets}, updated_at = datetime('now','localtime') WHERE id = 1`)
          .run(...keys.map(k => fields[k]));
      } else {
        const placeholders = keys.map(() => '?').join(', ');
        db.prepare(`INSERT INTO sire_config (id, ${keys.join(', ')}) VALUES (1, ${placeholders})`)
          .run(...keys.map(k => fields[k]));
      }

      // Un token anterior deja de ser confiable si se cambió/regrabó configuración.
      db.prepare(`
        UPDATE sire_config
           SET access_token_enc = NULL,
               token_expires_at = NULL,
               estado_conexion = 'CONFIGURADO'
         WHERE id = 1
      `).run();
    });
    tx();

    console.log(`sireConfig: Credenciales protegidas guardadas para RUC ${crypto.mask(fields.ruc)}.`);
    return {
      success: true,
      mensaje: 'Configuración guardada de forma segura.',
      seguridad: crypto.getSecurityInfo(),
    };
  } catch (err) {
    console.error('sireConfigController.saveConfig:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { getConfig, saveConfig };
