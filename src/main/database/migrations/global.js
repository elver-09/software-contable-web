// src/main/database/migrations/global.js
const { addColumnIfMissing } = require('../migrationRunner');

const GLOBAL_MIGRATIONS = [
  {
    version: 1,
    name: 'catalogos_globales_base',
    up(db) {
      db.exec(`
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

        CREATE TABLE IF NOT EXISTS monedas (
          fecha TEXT NOT NULL,
          nombre TEXT NOT NULL,
          tipo_cambio REAL NOT NULL,
          compra REAL DEFAULT 0,
          venta REAL DEFAULT 0,
          fuente TEXT DEFAULT '',
          fecha_fuente TEXT DEFAULT '',
          PRIMARY KEY (fecha, nombre)
        );
      `);
    },
  },
  {
    version: 2,
    name: 'entidades_globales_tipo_documento',
    up(db) {
      addColumnIfMissing(db, 'entidades', 'tipo_documento', "ALTER TABLE entidades ADD COLUMN tipo_documento TEXT DEFAULT ''");
    },
  },
  {
    version: 3,
    name: 'monedas_globales_compra_venta_fuente',
    up(db) {
      addColumnIfMissing(db, 'monedas', 'compra', 'ALTER TABLE monedas ADD COLUMN compra REAL DEFAULT 0');
      addColumnIfMissing(db, 'monedas', 'venta', 'ALTER TABLE monedas ADD COLUMN venta REAL DEFAULT 0');
      addColumnIfMissing(db, 'monedas', 'fuente', "ALTER TABLE monedas ADD COLUMN fuente TEXT DEFAULT ''");
      addColumnIfMissing(db, 'monedas', 'fecha_fuente', "ALTER TABLE monedas ADD COLUMN fecha_fuente TEXT DEFAULT ''");
      db.exec(`
        UPDATE monedas
        SET fecha_fuente = fecha
        WHERE fecha_fuente IS NULL OR TRIM(fecha_fuente) = '';

        UPDATE monedas
        SET venta = tipo_cambio
        WHERE (venta IS NULL OR venta = 0) AND tipo_cambio > 0;
      `);
    },
  },
  {
    version: 4,
    name: 'plan_cuentas_habilitacion_estado_resultados',
    up(db) {
      addColumnIfMissing(db, 'plan_cuentas', 'estado_resultados', 'ALTER TABLE plan_cuentas ADD COLUMN estado_resultados INTEGER NOT NULL DEFAULT 0');
    },
  },
];

module.exports = { GLOBAL_MIGRATIONS };
