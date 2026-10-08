// src/main/database/migrations/empresa.js
const {
  tableExists,
  columnExists,
  addColumnIfMissing,
} = require('../migrationRunner');
const { ER_DEFAULT_NOTES } = require('../../domain/estadoResultados');

function createVouchersCurrent(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      origen         TEXT    NOT NULL,
      numero_voucher INTEGER NOT NULL DEFAULT 0,
      fecha          TEXT    NOT NULL,
      periodo        TEXT    NOT NULL DEFAULT '',
      glosa_cabecera TEXT,
      total_debe     REAL    DEFAULT 0,
      total_haber    REAL    DEFAULT 0,
      fecha_creacion TEXT    DEFAULT (datetime('now','localtime'))
    )
  `);
}

function legacyColumns(db) {
  return db.prepare('PRAGMA table_info(vouchers_legacy)').all().map(c => c.name);
}

function expr(cols, column, fallback = 'NULL') {
  return cols.includes(column) ? column : fallback;
}

function copyFromLegacy(db) {
  if (!tableExists(db, 'vouchers_legacy')) return;
  const cols = legacyColumns(db);
  const periodoExpr = cols.includes('periodo')
    ? "COALESCE(NULLIF(TRIM(periodo), ''), substr(fecha,1,7))"
    : "substr(fecha,1,7)";
  const numeroExpr = cols.includes('numero_voucher')
    ? "CAST(COALESCE(numero_voucher,0) AS INTEGER)"
    : cols.includes('numero')
      ? "CAST(COALESCE(NULLIF(TRIM(numero),''),'0') AS INTEGER)"
      : '0';

  db.exec(`
    INSERT OR IGNORE INTO vouchers (
      id, origen, numero_voucher, fecha, periodo,
      glosa_cabecera, total_debe, total_haber, fecha_creacion
    )
    SELECT
      id,
      ${expr(cols, 'origen', "''")},
      ${numeroExpr},
      ${expr(cols, 'fecha', "''")},
      ${periodoExpr},
      ${expr(cols, 'glosa_cabecera')},
      ${cols.includes('total_debe') ? 'COALESCE(total_debe,0)' : '0'},
      ${cols.includes('total_haber') ? 'COALESCE(total_haber,0)' : '0'},
      ${cols.includes('fecha_creacion') ? "COALESCE(fecha_creacion, datetime('now','localtime'))" : "datetime('now','localtime')"}
    FROM vouchers_legacy
  `);
}

function normalizeVoucherSchema(db) {
  const hasVouchers = tableExists(db, 'vouchers');
  const hasLegacy = tableExists(db, 'vouchers_legacy');

  if (!hasVouchers) {
    createVouchersCurrent(db);
    if (hasLegacy) {
      copyFromLegacy(db);
      db.exec('DROP TABLE vouchers_legacy');
    }
  } else {
    const cols = db.prepare('PRAGMA table_info(vouchers)').all().map(c => c.name);
    const oldNumero = cols.includes('numero') && !cols.includes('numero_voucher');

    if (oldNumero) {
      if (hasLegacy) {
        throw new Error('Se encontraron simultáneamente vouchers antiguos y vouchers_legacy. Restaure la copia de seguridad o revise la migración interrumpida antes de continuar.');
      }
      db.exec('ALTER TABLE vouchers RENAME TO vouchers_legacy');
      createVouchersCurrent(db);
      copyFromLegacy(db);
      db.exec('DROP TABLE vouchers_legacy');
    } else if (hasLegacy) {
      // Recuperación de una migración vieja interrumpida donde ambas tablas quedaron presentes.
      copyFromLegacy(db);
      db.exec('DROP TABLE vouchers_legacy');
    }
  }

  addColumnIfMissing(db, 'vouchers', 'numero_voucher', "ALTER TABLE vouchers ADD COLUMN numero_voucher INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, 'vouchers', 'periodo', "ALTER TABLE vouchers ADD COLUMN periodo TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'vouchers', 'glosa_cabecera', 'ALTER TABLE vouchers ADD COLUMN glosa_cabecera TEXT');
  addColumnIfMissing(db, 'vouchers', 'total_debe', 'ALTER TABLE vouchers ADD COLUMN total_debe REAL DEFAULT 0');
  addColumnIfMissing(db, 'vouchers', 'total_haber', 'ALTER TABLE vouchers ADD COLUMN total_haber REAL DEFAULT 0');

  // SQLite no permite añadir con ALTER TABLE un DEFAULT de expresión en todas sus versiones.
  // La columna se agrega simple y se hace backfill; las BD nuevas sí nacen con el DEFAULT correcto.
  if (!columnExists(db, 'vouchers', 'fecha_creacion')) {
    db.exec('ALTER TABLE vouchers ADD COLUMN fecha_creacion TEXT');
  }

  db.exec(`
    UPDATE vouchers
    SET periodo = substr(fecha,1,7)
    WHERE (periodo IS NULL OR TRIM(periodo)='')
      AND fecha IS NOT NULL
      AND length(fecha) >= 7;

    UPDATE vouchers
    SET fecha_creacion = datetime('now','localtime')
    WHERE fecha_creacion IS NULL OR TRIM(fecha_creacion)='';
  `);
}

function seedDefaultAmarres(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM amarres_asistente').get().n;
  if (Number(count) > 0) return;
  const insert = db.prepare(`
    INSERT INTO amarres_asistente
      (nombre, tipo, prefijo, cuenta_igv, cuenta_destino, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  insert.run('Compras (gasto + IGV crédito fiscal)', 'COMPRA', '6', '40111', '4212');
  insert.run('Ventas (ingreso + IGV débito fiscal)', 'VENTA', '7', '40111', '1212');
}

const EMPRESA_MIGRATIONS = [
  {
    version: 1,
    name: 'base_empresa_catalogos_y_detalles',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS config_empresa (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          nombre_comercial TEXT,
          ruc TEXT UNIQUE,
          direccion_fiscal TEXT,
          telefono TEXT,
          correo TEXT,
          periodo_contable TEXT,
          logo TEXT
        );

        CREATE TABLE IF NOT EXISTS plan_cuentas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          descripcion TEXT NOT NULL,
          tipo TEXT,
          nivel INTEGER
        );

        CREATE TABLE IF NOT EXISTS tipos_documentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          descripcion TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS entidades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          razon_social TEXT NOT NULL,
          tipo TEXT NOT NULL,
          tipo_documento TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS amarres_asistente (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre         TEXT    NOT NULL,
          tipo           TEXT    NOT NULL,
          prefijo        TEXT    NOT NULL,
          doc_tipo       TEXT    DEFAULT '',
          cuenta_igv     TEXT,
          cuenta_igv_exo TEXT,
          cuenta_igv_ina TEXT,
          cuenta_destino TEXT    NOT NULL,
          moneda         TEXT    DEFAULT 'PEN',
          activo         INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS voucher_detalles (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          voucher_id    INTEGER NOT NULL,
          cuenta        TEXT    NOT NULL,
          nombre_cuenta TEXT,
          debe          REAL    DEFAULT 0,
          haber         REAL    DEFAULT 0,
          moneda        TEXT    DEFAULT 'PEN',
          tc            REAL    DEFAULT 1,
          equivalente   REAL    DEFAULT 0,
          doc_tipo      TEXT,
          doc_numero    TEXT,
          fecha_doc     TEXT,
          fecha_venc    TEXT,
          codigo        TEXT,
          razon_social  TEXT,
          glosa         TEXT
        );
      `);
    },
  },
  {
    version: 2,
    name: 'vouchers_esquema_actual_y_periodo',
    up(db) {
      normalizeVoucherSchema(db);
    },
  },
  {
    version: 3,
    name: 'columnas_compatibilidad_empresa',
    up(db) {
      addColumnIfMissing(db, 'config_empresa', 'logo', 'ALTER TABLE config_empresa ADD COLUMN logo TEXT');
      addColumnIfMissing(db, 'voucher_detalles', 'fecha_doc', 'ALTER TABLE voucher_detalles ADD COLUMN fecha_doc TEXT');
      addColumnIfMissing(db, 'voucher_detalles', 'fecha_venc', 'ALTER TABLE voucher_detalles ADD COLUMN fecha_venc TEXT');
      addColumnIfMissing(db, 'amarres_asistente', 'doc_tipo', "ALTER TABLE amarres_asistente ADD COLUMN doc_tipo TEXT DEFAULT ''");
      addColumnIfMissing(db, 'amarres_asistente', 'cuenta_igv_exo', 'ALTER TABLE amarres_asistente ADD COLUMN cuenta_igv_exo TEXT');
      addColumnIfMissing(db, 'amarres_asistente', 'cuenta_igv_ina', 'ALTER TABLE amarres_asistente ADD COLUMN cuenta_igv_ina TEXT');
      addColumnIfMissing(db, 'amarres_asistente', 'moneda', "ALTER TABLE amarres_asistente ADD COLUMN moneda TEXT DEFAULT 'PEN'");
      addColumnIfMissing(db, 'entidades', 'tipo_documento', "ALTER TABLE entidades ADD COLUMN tipo_documento TEXT DEFAULT ''");
    },
  },
  {
    version: 4,
    name: 'modelo_tributario_explicito',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS comprobantes_tributarios (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          voucher_id            INTEGER NOT NULL UNIQUE,
          tipo_registro         TEXT NOT NULL CHECK (tipo_registro IN ('VENTA','COMPRA')),
          fecha_emision         TEXT,
          fecha_vencimiento     TEXT,
          tipo_documento        TEXT,
          serie                 TEXT,
          numero                TEXT,
          tipo_doc_identidad    TEXT,
          numero_doc_identidad  TEXT,
          razon_social          TEXT,
          moneda                TEXT DEFAULT 'PEN',
          tipo_cambio           REAL DEFAULT 1,
          ref_fecha             TEXT,
          ref_tipo_documento    TEXT,
          ref_serie             TEXT,
          ref_numero            TEXT,
          car_sunat             TEXT,
          fuente                TEXT NOT NULL DEFAULT 'MANUAL',
          requiere_revision     INTEGER NOT NULL DEFAULT 0,
          created_at            TEXT DEFAULT (datetime('now','localtime')),
          updated_at            TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS comprobante_venta (
          comprobante_id        INTEGER PRIMARY KEY,
          valor_exportacion     REAL DEFAULT 0,
          base_gravada          REAL DEFAULT 0,
          descuento_base        REAL DEFAULT 0,
          igv                   REAL DEFAULT 0,
          descuento_igv         REAL DEFAULT 0,
          importe_exonerado     REAL DEFAULT 0,
          importe_inafecto      REAL DEFAULT 0,
          isc                   REAL DEFAULT 0,
          base_ivap             REAL DEFAULT 0,
          ivap                  REAL DEFAULT 0,
          icbper                REAL DEFAULT 0,
          otros_tributos        REAL DEFAULT 0,
          importe_total         REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS comprobante_compra (
          comprobante_id        INTEGER PRIMARY KEY,
          g1_base               REAL DEFAULT 0,
          g1_igv                REAL DEFAULT 0,
          g2_base               REAL DEFAULT 0,
          g2_igv                REAL DEFAULT 0,
          g3_base               REAL DEFAULT 0,
          g3_igv                REAL DEFAULT 0,
          valor_no_gravado      REAL DEFAULT 0,
          isc                   REAL DEFAULT 0,
          icbper                REAL DEFAULT 0,
          otros_tributos        REAL DEFAULT 0,
          importe_total         REAL DEFAULT 0,
          detraccion_numero     TEXT,
          detraccion_fecha      TEXT,
          marca_retencion       TEXT
        );
      `);
    },
  },
  {
    version: 5,
    name: 'sire_config_operaciones_logs',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sire_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          ruc TEXT,
          usuario_sol TEXT,
          clave_sol_enc TEXT,
          client_id TEXT,
          client_secret_enc TEXT,
          scope TEXT DEFAULT 'https://api-sire.sunat.gob.pe',
          seguridad_base_url TEXT DEFAULT 'https://api-seguridad.sunat.gob.pe',
          sire_base_url TEXT DEFAULT 'https://api-sire.sunat.gob.pe',
          access_token_enc TEXT,
          token_expires_at TEXT,
          estado_conexion TEXT DEFAULT 'NO_CONFIGURADO',
          updated_at TEXT DEFAULT (datetime('now','localtime')),
          cuenta_gasto TEXT DEFAULT '',
          cuenta_ingreso TEXT DEFAULT '',
          cuenta_igv_compras TEXT DEFAULT '',
          cuenta_igv_ventas TEXT DEFAULT '',
          cuenta_cxp TEXT DEFAULT '',
          cuenta_cxc TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS sire_operaciones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL,
          periodo TEXT NOT NULL,
          operacion TEXT NOT NULL,
          ticket TEXT,
          estado TEXT,
          archivo_nombre TEXT,
          archivo_path TEXT,
          mensaje TEXT,
          created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS sire_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha TEXT DEFAULT (datetime('now','localtime')),
          ruc TEXT,
          tipo TEXT,
          periodo TEXT,
          operacion TEXT,
          metodo TEXT,
          endpoint TEXT,
          status_code INTEGER,
          success INTEGER,
          mensaje TEXT
        );
      `);

      for (const [column, sql] of [
        ['cuenta_gasto', "ALTER TABLE sire_config ADD COLUMN cuenta_gasto TEXT DEFAULT ''"],
        ['cuenta_ingreso', "ALTER TABLE sire_config ADD COLUMN cuenta_ingreso TEXT DEFAULT ''"],
        ['cuenta_igv_compras', "ALTER TABLE sire_config ADD COLUMN cuenta_igv_compras TEXT DEFAULT ''"],
        ['cuenta_igv_ventas', "ALTER TABLE sire_config ADD COLUMN cuenta_igv_ventas TEXT DEFAULT ''"],
        ['cuenta_cxp', "ALTER TABLE sire_config ADD COLUMN cuenta_cxp TEXT DEFAULT ''"],
        ['cuenta_cxc', "ALTER TABLE sire_config ADD COLUMN cuenta_cxc TEXT DEFAULT ''"],
      ]) addColumnIfMissing(db, 'sire_config', column, sql);

      db.exec('INSERT OR IGNORE INTO sire_config (id) VALUES (1)');
    },
  },
  {
    version: 6,
    name: 'configuracion_notas_eeff',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS config_notas_eeff (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT NOT NULL,
          nombre TEXT NOT NULL,
          categoria TEXT NOT NULL,
          cuentas TEXT NOT NULL DEFAULT '[]',
          orden INTEGER DEFAULT 0
        )
      `);
    },
  },
  {
    version: 7,
    name: 'indices_rendimiento_y_tributarios',
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_vouchers_periodo
          ON vouchers(periodo);
        CREATE INDEX IF NOT EXISTS idx_vouchers_origen_periodo
          ON vouchers(origen, periodo);
        CREATE INDEX IF NOT EXISTS idx_vouchers_fecha
          ON vouchers(fecha);
        CREATE INDEX IF NOT EXISTS idx_vd_voucher_id
          ON voucher_detalles(voucher_id);
        CREATE INDEX IF NOT EXISTS idx_vd_cuenta
          ON voucher_detalles(cuenta);
        CREATE INDEX IF NOT EXISTS idx_vd_doc_numero
          ON voucher_detalles(doc_numero);
        CREATE INDEX IF NOT EXISTS idx_ct_tipo_fecha
          ON comprobantes_tributarios(tipo_registro, fecha_emision);
        CREATE INDEX IF NOT EXISTS idx_ct_documento
          ON comprobantes_tributarios(tipo_registro, tipo_documento, serie, numero);
        CREATE INDEX IF NOT EXISTS idx_ct_revision
          ON comprobantes_tributarios(requiere_revision);
      `);
    },
  },
  {
    version: 8,
    name: 'amarres_predeterminados',
    up(db) {
      seedDefaultAmarres(db);
    },
  },
  {
    version: 9,
    name: 'estado_resultados_config_separada',
    up(db) {
      addColumnIfMissing(db, 'plan_cuentas', 'estado_resultados', 'ALTER TABLE plan_cuentas ADD COLUMN estado_resultados INTEGER NOT NULL DEFAULT 0');
      db.exec(`
        CREATE TABLE IF NOT EXISTS config_estado_resultados (
          rubro TEXT PRIMARY KEY,
          nota_numero TEXT DEFAULT '',
          cuentas TEXT NOT NULL DEFAULT '[]',
          orden INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    version: 10,
    name: 'estado_resultados_notas_dinamicas',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS config_notas_er (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT NOT NULL DEFAULT '',
          nombre TEXT NOT NULL,
          bloque TEXT NOT NULL,
          cuentas TEXT NOT NULL DEFAULT '[]',
          orden INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_config_notas_er_bloque_orden
          ON config_notas_er(bloque, orden, id);
      `);

      // Compatibilidad con la primera implementación de Config. ER (v9):
      // si ya se asignaron cuentas a un rubro fijo, convertirlo en una nota
      // dinámica para no perder la configuración del usuario.
      const legacyMap = {
        ventas_operacionales: ['Ingresos por ventas (operacionales)', 'BRUTA'],
        costo_ventas: ['Costo de ventas o servicios', 'BRUTA'],
        gastos_ventas: ['Gastos de ventas', 'OPERATIVA'],
        gastos_administrativos: ['Gastos administrativos', 'OPERATIVA'],
        gastos_investigacion: ['Gastos de investigación y desarrollo', 'OPERATIVA'],
        resultado_venta_ppe: ['Ganancia / Pérdida por venta de activo fijo (PPE)', 'OPERATIVA'],
        diferencia_cambio_operativa: ['Ganancia / Pérdida por diferencia de cambio', 'OPERATIVA'],
        ingresos_depositos_plazo: ['Ingresos por depósitos a plazo', 'ANTES_FINANCIAMIENTO'],
        valorizacion_inversiones: ['Valorización de inversiones financieras', 'ANTES_FINANCIAMIENTO'],
        arrendamiento_propiedades_inversion: ['Ingreso por arrendamiento de propiedades de inversión', 'ANTES_FINANCIAMIENTO'],
        valor_razonable_propiedades: ['Valor razonable de propiedades de inversión', 'ANTES_FINANCIAMIENTO'],
        participacion_asociadas: ['Participación en resultados de asociadas', 'ANTES_FINANCIAMIENTO'],
        diferencia_cambio_no_operativa: ['Ganancia / Pérdida por diferencia de cambio', 'ANTES_FINANCIAMIENTO'],
        intereses_prestamos: ['Intereses por préstamos bancarios', 'ANTES_IMPUESTO'],
        intereses_arrendamientos: ['Intereses por arrendamientos', 'ANTES_IMPUESTO'],
        valor_presente_provisiones: ['Efecto del valor presente de provisiones', 'ANTES_IMPUESTO'],
        diferencia_cambio_financiera: ['Ganancia / Pérdida por diferencia de cambio', 'ANTES_IMPUESTO'],
        impuesto_ganancias: ['Impuesto a las ganancias', 'NETA'],
      };
      const count = db.prepare('SELECT COUNT(*) AS n FROM config_notas_er').get().n;
      if (!count && tableExists(db, 'config_estado_resultados')) {
        const rows = db.prepare('SELECT rubro, nota_numero, cuentas, orden FROM config_estado_resultados ORDER BY orden, rubro').all();
        const ins = db.prepare('INSERT INTO config_notas_er(numero,nombre,bloque,cuentas,orden) VALUES(?,?,?,?,?)');
        rows.forEach((r, idx) => {
          const meta = legacyMap[r.rubro];
          if (!meta) return;
          let cuentas = [];
          try { cuentas = JSON.parse(r.cuentas || '[]'); } catch (_) { cuentas = []; }
          if (!Array.isArray(cuentas) || (!cuentas.length && !String(r.nota_numero || '').trim())) return;
          ins.run(String(r.nota_numero || ''), meta[0], meta[1], JSON.stringify(cuentas), (idx + 1) * 10);
        });
      }
    },
  },

  {
    version: 11,
    name: 'estado_resultados_notas_preestablecidas_unicas',
    up(db) {
      addColumnIfMissing(db, 'config_notas_er', 'concepto_key', "ALTER TABLE config_notas_er ADD COLUMN concepto_key TEXT DEFAULT NULL");
      addColumnIfMissing(db, 'config_notas_er', 'preestablecida', "ALTER TABLE config_notas_er ADD COLUMN preestablecida INTEGER NOT NULL DEFAULT 0");

      const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
      const rows = db.prepare(`SELECT id,numero,nombre,bloque,cuentas,orden,concepto_key,preestablecida FROM config_notas_er ORDER BY id`).all();
      const usedConcepts = new Set(rows.map(r => String(r.concepto_key || '')).filter(Boolean));

      // Vincular configuraciones existentes al concepto fijo equivalente para no perder cuentas.
      for (const def of ER_DEFAULT_NOTES) {
        if (usedConcepts.has(def.conceptoKey)) continue;
        const match = rows.find(r => !r.concepto_key && String(r.bloque) === def.bloque && normalize(r.nombre) === normalize(def.nombre));
        if (match) {
          db.prepare(`UPDATE config_notas_er SET concepto_key=?, preestablecida=1, nombre=?, bloque=?, orden=? WHERE id=?`)
            .run(def.conceptoKey, def.nombre, def.bloque, def.orden, match.id);
          match.concepto_key = def.conceptoKey;
          match.preestablecida = 1;
          usedConcepts.add(def.conceptoKey);
        }
      }

      // Asegurar unicidad de números existentes antes de crear el índice único.
      const allBeforeSeed = db.prepare(`SELECT id,numero FROM config_notas_er ORDER BY id`).all();
      const usedNumbers = new Set();
      let nextNumber = 19;
      const nextFreeNumber = () => {
        let candidate;
        do { candidate = `Nota ${nextNumber++}`; } while (usedNumbers.has(normalize(candidate)));
        usedNumbers.add(normalize(candidate));
        return candidate;
      };
      for (const row of allBeforeSeed) {
        const raw = String(row.numero || '').trim();
        if (!raw) continue;
        const key = normalize(raw);
        if (usedNumbers.has(key)) {
          db.prepare('UPDATE config_notas_er SET numero=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextFreeNumber(), row.id);
        } else {
          usedNumbers.add(key);
        }
      }

      // Crear las 18 líneas preestablecidas. En una base nueva conservan Nota 1..Nota 18;
      // en bases con notas previas se usa el siguiente número libre sin sobrescribir al usuario.
      const existingConcepts = new Set(db.prepare(`SELECT concepto_key FROM config_notas_er WHERE concepto_key IS NOT NULL`).all().map(r => String(r.concepto_key)));
      const insert = db.prepare(`
        INSERT INTO config_notas_er(numero,nombre,bloque,cuentas,orden,concepto_key,preestablecida)
        VALUES(?,?,?,?,?,?,1)
      `);
      for (const def of ER_DEFAULT_NOTES) {
        if (existingConcepts.has(def.conceptoKey)) continue;
        let numero = def.numero;
        if (usedNumbers.has(normalize(numero))) numero = nextFreeNumber();
        else usedNumbers.add(normalize(numero));
        insert.run(numero, def.nombre, def.bloque, '[]', def.orden, def.conceptoKey);
      }

      // Todos los conceptos oficiales quedan marcados como preestablecidos y con nombre/posición fijos.
      const updateFixed = db.prepare(`UPDATE config_notas_er SET nombre=?, bloque=?, orden=?, preestablecida=1 WHERE concepto_key=?`);
      for (const def of ER_DEFAULT_NOTES) updateFixed.run(def.nombre, def.bloque, def.orden, def.conceptoKey);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_config_notas_er_concepto_unique
          ON config_notas_er(concepto_key) WHERE concepto_key IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_config_notas_er_numero_unique
          ON config_notas_er(lower(trim(numero))) WHERE trim(numero) <> '';
      `);
    },
  },

];

module.exports = {
  EMPRESA_MIGRATIONS,
  createVouchersCurrent,
  normalizeVoucherSchema,
};
