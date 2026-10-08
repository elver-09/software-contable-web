function _dbModule() {
  // Carga diferida: las funciones puras de política (merge/validación) pueden
  // probarse sin inicializar Electron ni better-sqlite3.
  return require('../../database/db');
}

function getLocalDBOptional() {
  try {
    return _dbModule().getDB();
  } catch (_) {
    return null;
  }
}

function getCatalogContext() {
  const globalDb = _dbModule().getGlobalDB();
  const localDb = getLocalDBOptional();
  return {
    globalDb,
    localDb,
    hasCompany: Boolean(localDb),
    writeDb: localDb || globalDb,
    writeScope: localDb ? 'Local' : 'Global'
  };
}


function resolveWriteTarget(preferredScope = 'Auto') {
  const context = getCatalogContext();
  const pref = String(preferredScope || 'Auto').toLowerCase();

  if (pref === 'global') {
    return { ...context, writeDb: context.globalDb, writeScope: 'Global' };
  }
  if (pref === 'local') {
    if (!context.localDb) throw new Error('No hay una empresa activa para guardar el catálogo local.');
    return { ...context, writeDb: context.localDb, writeScope: 'Local' };
  }
  return context;
}

function mergeCatalogRows(globalRows = [], localRows = [], hasCompany = true) {
  const merged = new Map();

  for (const row of globalRows) {
    const codigo = String(row.codigo ?? '');
    merged.set(codigo, {
      ...row,
      origen: 'Global',
      es_override: false,
      heredado_global: Boolean(hasCompany),
      puede_eliminar: !hasCompany,
      puede_cambiar_codigo: !hasCompany,
      modo_edicion: hasCompany ? 'crear_override' : 'global'
    });
  }

  for (const row of localRows) {
    const codigo = String(row.codigo ?? '');
    const globalBase = merged.get(codigo);
    merged.set(codigo, {
      ...row,
      origen: 'Local',
      es_override: Boolean(globalBase),
      heredado_global: false,
      puede_eliminar: true,
      // Si personaliza un código global, cambiar el código haría reaparecer
      // silenciosamente la base global y crearía otro registro distinto.
      puede_cambiar_codigo: !globalBase,
      modo_edicion: globalBase ? 'override' : 'local'
    });
  }

  return [...merged.values()].sort((a, b) =>
    String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true })
  );
}

function getMergedCatalog(tableName) {
  if (!/^(plan_cuentas|tipos_documentos|entidades)$/.test(tableName)) {
    throw new Error('Catálogo no permitido.');
  }

  const { globalDb, localDb, hasCompany } = getCatalogContext();
  const globalRows = globalDb.prepare(`SELECT * FROM ${tableName}`).all();
  const localRows = localDb ? localDb.prepare(`SELECT * FROM ${tableName}`).all() : [];
  return mergeCatalogRows(globalRows, localRows, hasCompany);
}

function existsByCode(db, tableName, codigo) {
  return Boolean(db.prepare(`SELECT 1 FROM ${tableName} WHERE codigo = ?`).get(codigo));
}

function getByCode(db, tableName, codigo) {
  return db.prepare(`SELECT * FROM ${tableName} WHERE codigo = ?`).get(codigo) || null;
}

function validateRename({ context, tableName, oldCodigo, newCodigo, localExists, globalExists }) {
  if (oldCodigo === newCodigo) return null;

  // Un override debe conservar el código de la fila global que personaliza.
  if (context.hasCompany && localExists && globalExists) {
    return 'Este registro personaliza un catálogo global. Puede cambiar sus datos, pero no su código. Para usar otro código, cree un registro nuevo para la empresa.';
  }

  // Al editar una fila global heredada dentro de una empresa, la edición crea
  // un override local y por tanto debe conservar la misma clave.
  if (context.hasCompany && !localExists && globalExists) {
    return 'Los códigos del catálogo global no se renombrarán desde una empresa. Puede personalizar sus datos conservando el mismo código.';
  }

  const collisionLocal = context.localDb && existsByCode(context.localDb, tableName, newCodigo);
  const collisionGlobal = existsByCode(context.globalDb, tableName, newCodigo);

  if (collisionLocal || collisionGlobal) {
    return 'El nuevo código ya está en uso.';
  }

  return null;
}

module.exports = {
  getLocalDBOptional,
  getCatalogContext,
  resolveWriteTarget,
  mergeCatalogRows,
  getMergedCatalog,
  existsByCode,
  getByCode,
  validateRename
};
