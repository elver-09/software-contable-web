const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveEffectiveAccountName } = require('../main/services/catalogos/planCuentasLookup');

test('Notas EEFF resuelven denominación desde catálogo efectivo Global + Local', () => {
  const planMap = new Map([
    ['101', 'Caja'],
    ['1031', 'Efectivo en tránsito'],
    ['33', 'Propiedad, planta y equipo'],
    ['1041', 'Cuentas corrientes operativas'],
  ]);
  assert.equal(resolveEffectiveAccountName('101', { planMap }), 'Caja');
  assert.equal(resolveEffectiveAccountName('1031', { planMap }), 'Efectivo en tránsito');
  assert.equal(resolveEffectiveAccountName('33', { planMap }), 'Propiedad, planta y equipo');
});

test('Notas EEFF priorizan override local ya contenido en el catálogo efectivo', () => {
  const planMap = new Map([['1041', 'Cuenta bancaria personalizada']]);
  assert.equal(resolveEffectiveAccountName('1041', { planMap }), 'Cuenta bancaria personalizada');
});

test('Notas EEFF usan nombre histórico del movimiento si la cuenta no está en el catálogo', () => {
  const balanceMap = new Map([['9999', { nombre_cuenta: 'Cuenta histórica' }]]);
  assert.equal(resolveEffectiveAccountName('9999', { planMap: new Map(), balanceMap }), 'Cuenta histórica');
});
