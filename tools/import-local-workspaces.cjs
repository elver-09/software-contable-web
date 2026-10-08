process.env.ANSORITO_DB_ENGINE = "postgres";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { storage } = require("../server/context.cjs");
const cloud = require("../server/postgres/database.cjs");
const SQLite = require("../server/sqlite.cjs");
const { copyRows } = require("../server/postgres/backups.cjs");
const schema = require("../server/postgres/schema-original.json");
const { runMigrations } = require("../src/main/database/migrationRunner");
const { GLOBAL_MIGRATIONS } = require("../src/main/database/migrations/global");
const {
  EMPRESA_MIGRATIONS,
} = require("../src/main/database/migrations/empresa");
const root = path.resolve(process.env.ANSORITO_DATA_DIR || "data");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ansorito-import-"));
let count = 0;
function source(file, kind) {
  const target = path.join(tmp, crypto.randomUUID() + ".db");
  const original = new SQLite(file);
  try {
    original.prepare("VACUUM INTO ?").run(target);
  } finally {
    original.close();
  }
  const candidate = new SQLite(target);
  if (candidate.pragma("integrity_check", { simple: true }) !== "ok")
    throw Error("Copia local dañada");
  runMigrations(
    candidate,
    kind === "global" ? GLOBAL_MIGRATIONS : EMPRESA_MIGRATIONS,
    { logger: { log() {}, warn() {}, error() {} } },
  );
  return candidate;
}
try {
  for (const userId of fs
    .readdirSync(root)
    .filter((x) => /^[a-f0-9-]{36}$/.test(x))) {
    const workspace = path.join(root, userId);
    storage.run({ workspace, tempDir: tmp, userId }, () => {
      const global = cloud.getGlobalDB();
      global.transaction(() => {
        const listFile = path.join(workspace, "companies.json");
        const companies = fs.existsSync(listFile)
          ? JSON.parse(fs.readFileSync(listFile, "utf8"))
          : [];
        const inputs = [
          {
            key: "global",
            kind: "global",
            file: path.join(workspace, "global_contable.db"),
          },
          ...companies.map((c) => ({
            key: c.id,
            kind: "empresa",
            file: path.join(workspace, "companies", c.id, "contable.db"),
            company: c,
          })),
        ];
        for (const input of inputs) {
          if (!fs.existsSync(input.file)) continue;
          const candidate = source(input.file, input.kind);
          try {
            const fingerprint = crypto.createHash("sha256");
            for (const table of schema[input.kind])
              fingerprint.update(
                JSON.stringify(
                  candidate.prepare(`SELECT * FROM ${table.name}`).all(),
                ),
              );
            const sha = fingerprint.digest("hex");
            const previous = global
              .prepare("SELECT sha256 FROM _desktop_imports WHERE source_key=?")
              .get(input.key);
            if (previous) {
              if (previous.sha256 !== sha)
                throw Error(
                  "La fuente local cambió después de su importación; requiere revisión.",
                );
              continue;
            }
            if (input.company) {
              if (cloud.companies().some((c) => c.id === input.company.id))
                throw Error(
                  "La empresa ya existe sin registro de importación.",
                );
              global
                .prepare("INSERT INTO empresas(id,nombre) VALUES (?,?)")
                .run(input.company.id, input.company.name);
              require("../server/context.cjs").current().companyId =
                input.company.id;
            }
            const target = input.kind === "global" ? global : cloud.getDB();
            for (const table of schema[input.kind])
              if (
                target.prepare(`SELECT COUNT(*) AS n FROM ${table.name}`).get()
                  .n
              )
                throw Error("El destino contiene datos; no se sobrescribirán.");
            copyRows(candidate, target, schema[input.kind]);
            for (const table of schema[input.kind]) {
              const expected = candidate
                .prepare(`SELECT COUNT(*) AS n FROM ${table.name}`)
                .get().n;
              const actual = target
                .prepare(`SELECT COUNT(*) AS n FROM ${table.name}`)
                .get().n;
              if (expected !== actual)
                throw Error("Conteo de importación no coincide.");
            }
            global
              .prepare(
                "INSERT INTO _desktop_imports(source_key,sha256) VALUES (?,?)",
              )
              .run(input.key, sha);
            count++;
          } finally {
            candidate.close();
          }
        }
      })();
    });
  }
  console.log("Espacios importados y verificados:", count);
} catch (e) {
  console.error("Importación revertida:", e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}
