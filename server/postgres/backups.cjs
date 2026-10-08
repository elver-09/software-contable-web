const fs = require("node:fs");
const path = require("node:path");
const SQLite = require("../sqlite.cjs");
const { current } = require("../context.cjs");
const cloud = require("./database.cjs");
const schema = require("./schema-original.json");
const { runMigrations } = require("../../src/main/database/migrationRunner");
const {
  EMPRESA_MIGRATIONS,
} = require("../../src/main/database/migrations/empresa");
const {
  GLOBAL_MIGRATIONS,
} = require("../../src/main/database/migrations/global");
const migrations = (kind) =>
  kind === "global" ? GLOBAL_MIGRATIONS : EMPRESA_MIGRATIONS;
function copyRows(from, to, tables) {
  // Parent records must precede their fiscal details in PostgreSQL.
  const priority = [
    "vouchers",
    "comprobantes_tributarios",
    "comprobante_venta",
    "comprobante_compra",
    "voucher_detalles",
  ];
  const ordered = [...tables].sort((a, b) => {
    const i = priority.indexOf(a.name),
      j = priority.indexOf(b.name);
    return (i < 0 ? 20 : i) - (j < 0 ? 20 : j);
  });
  for (const t of ordered) {
    const keys = t.columns.map((c) => c.name);
    const insert = to.prepare(
      `INSERT INTO ${t.name} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    );
    for (const row of from
      .prepare(`SELECT ${keys.join(",")} FROM ${t.name}`)
      .all())
      insert.run(...keys.map((k) => row[k]));
  }
}
function backupDatabase(kind) {
  kind = kind === "global" ? "global" : "empresa";
  const c = current(),
    source = kind === "global" ? cloud.getGlobalDB() : cloud.getDB();
  const file = path.join(
    c.tempDir,
    kind === "global" ? "global_contable.db" : "empresa_contable.db",
  );
  const sqlite = new SQLite(file);
  try {
    runMigrations(sqlite, migrations(kind), {
      logger: { log() {}, warn() {}, error() {} },
    });
    source.transaction(() => {
      source
        .prepare("SELECT pg_advisory_xact_lock(hashtext(?))")
        .get(kind === "global" ? c.userId : c.companyId);
      sqlite.transaction(() => {
        for (const t of schema[kind]) sqlite.exec("DELETE FROM " + t.name);
        copyRows(source, sqlite, schema[kind]);
      })();
    })();
  } finally {
    sqlite.close();
  }
  return { success: true, filePath: file, fileName: path.basename(file) };
}
function importDatabase(input) {
  const c = current(),
    kind = input.kind === "global" ? "global" : "empresa";
  const bytes = Buffer.from(String(input.base64 || ""), "base64");
  if (
    bytes.length > 20 * 1024 * 1024 ||
    bytes.subarray(0, 16).toString() !== "SQLite format 3\0"
  )
    throw Error("Selecciona una copia SQLite válida (hasta 20 MB).");
  const name = String(input.name || "Empresa importada").trim();
  if (!name || name.length > 100 || /[\/\\\x00-\x1f]/.test(name))
    throw Error("Nombre de empresa inválido");
  const file = path.join(c.tempDir, "candidate.db");
  fs.writeFileSync(file, bytes);
  const sqlite = new SQLite(file);
  try {
    if (sqlite.pragma("integrity_check", { simple: true }) !== "ok")
      throw Error("La copia está dañada");
    if (
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('view','trigger')",
        )
        .all().length
    )
      throw Error("La copia contiene objetos no esperados");
    const names = new Set(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((x) => x.name),
    );
    for (const n of kind === "global"
      ? ["plan_cuentas", "tipos_documentos", "entidades"]
      : ["vouchers", "voucher_detalles", "config_empresa"])
      if (!names.has(n)) throw Error("La copia no corresponde a Ansorito");
    runMigrations(sqlite, migrations(kind), {
      logger: { log() {}, warn() {}, error() {} },
    });
    return cloud.getGlobalDB().transaction(() => {
      if (kind === "global") {
        if (cloud.companies().length)
          throw Error("Importa el catálogo global antes de crear empresas.");
        for (const t of schema.global)
          if (
            cloud
              .getGlobalDB()
              .prepare(`SELECT COUNT(*) AS n FROM ${t.name}`)
              .get().n
          )
            throw Error("El catálogo global ya contiene datos.");
      } else cloud.createCompany(name);
      const target = kind === "global" ? cloud.getGlobalDB() : cloud.getDB();
      target
        .prepare("SELECT pg_advisory_xact_lock(hashtext(?))")
        .get(kind === "global" ? c.userId : c.companyId);
      for (const t of schema[kind]) target.exec("DELETE FROM " + t.name);
      copyRows(sqlite, target, schema[kind]);
      return {
        success: true,
        kind,
        ...(kind === "empresa" ? cloud.getEstadoEmpresa() : {}),
        ...(kind === "empresa"
          ? {
              vouchers: target
                .prepare("SELECT COUNT(*) AS n FROM vouchers")
                .get().n,
              detalles: target
                .prepare("SELECT COUNT(*) AS n FROM voucher_detalles")
                .get().n,
            }
          : {}),
      };
    })();
  } finally {
    sqlite.close();
  }
}
module.exports = { backupDatabase, importDatabase, copyRows };
