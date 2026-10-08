const { getMergedCatalog } = require('./catalogoScope');

function normalizarCodigo(codigo) {
  return String(codigo ?? '').trim();
}

function buildEffectivePlanMap() {
  const rows = getMergedCatalog('plan_cuentas');
  return new Map(rows.map(row => [
    normalizarCodigo(row.codigo),
    String(row.descripcion || '').trim()
  ]));
}

/**
 * Resuelve la denominación usando el catálogo efectivo Global + Local.
 * Orden de prioridad:
 * 1. Código exacto en Plan de Cuentas efectivo.
 * 2. Nombre exacto guardado en movimientos del período.
 * 3. Nombre de un movimiento descendiente, si la nota usa una cuenta padre.
 * 4. Cuenta padre más cercana del Plan de Cuentas.
 * 5. Cuenta hija más cercana del Plan de Cuentas.
 */
function resolveEffectiveAccountName(codigo, { planMap, balanceMap } = {}) {
  const code = normalizarCodigo(codigo);
  if (!code) return '';

  const effectiveMap = planMap || buildEffectivePlanMap();
  const exact = String(effectiveMap.get(code) || '').trim();
  if (exact) return exact;

  if (balanceMap) {
    const exactBal = balanceMap.get(code);
    if (exactBal?.nombre_cuenta) return String(exactBal.nombre_cuenta).trim();

    for (const [key, row] of balanceMap) {
      if (normalizarCodigo(key).startsWith(code) && row?.nombre_cuenta) {
        const nombre = String(row.nombre_cuenta).trim();
        if (nombre) return nombre;
      }
    }
  }

  for (let len = code.length - 1; len >= 1; len--) {
    const parent = String(effectiveMap.get(code.slice(0, len)) || '').trim();
    if (parent) return parent;
  }

  const child = [...effectiveMap.entries()]
    .filter(([key, name]) => key.startsWith(code) && String(name || '').trim())
    .sort((a, b) => a[0].length - b[0].length)[0];
  return child ? String(child[1]).trim() : '';
}

module.exports = {
  normalizarCodigo,
  buildEffectivePlanMap,
  resolveEffectiveAccountName,
};
