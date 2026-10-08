const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUNAT_SECURITY_BASE_URL,
  SUNAT_SIRE_BASE_URL,
  validateClientId,
  validateOfficialConfig,
  buildAuthTokenUrl,
  buildSireUrl,
} = require('../main/services/sunat/sunatSecurityConfig');

test('acepta configuración oficial SUNAT', () => {
  assert.equal(validateOfficialConfig({
    seguridad_base_url: SUNAT_SECURITY_BASE_URL,
    sire_base_url: SUNAT_SIRE_BASE_URL,
    scope: SUNAT_SIRE_BASE_URL,
  }).ok, true);
});

test('bloquea hosts externos y rutas SIRE fuera del ámbito permitido', () => {
  assert.equal(validateOfficialConfig({ sire_base_url: 'https://evil.example' }).ok, false);
  assert.throws(() => buildSireUrl('//evil.example/v1/contribuyente/migeigv/x'), /inválida|bloqueado/i);
  assert.throws(() => buildSireUrl('/v1/otra-api/x'), /fuera del ámbito/i);
});

test('Client ID no admite traversal y la URL OAuth se construye con host oficial', () => {
  assert.equal(validateClientId('../../otro-endpoint').ok, false);
  const url = buildAuthTokenUrl('cliente_12345');
  assert.ok(url.startsWith(`${SUNAT_SECURITY_BASE_URL}/v1/clientessol/`));
});
