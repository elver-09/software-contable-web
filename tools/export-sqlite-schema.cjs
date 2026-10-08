const fs = require("node:fs");
const Database = require("../server/sqlite.cjs");
const { runMigrations } = require("../src/main/database/migrationRunner");
const {
  EMPRESA_MIGRATIONS,
} = require("../src/main/database/migrations/empresa");
const { GLOBAL_MIGRATIONS } = require("../src/main/database/migrations/global");
const result = {};
for (const [scope, migrations] of [
  ["empresa", EMPRESA_MIGRATIONS],
  ["global", GLOBAL_MIGRATIONS],
]) {
  const db = new Database(":memory:");
  runMigrations(db, migrations, {
    logger: { log() {}, warn() {}, error() {} },
  });
  result[scope] = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'",
    )
    .all()
    .map((t) => ({
      ...t,
      columns: db.prepare(`PRAGMA table_info(${t.name})`).all(),
      indexes: db
        .prepare(`PRAGMA index_list(${t.name})`)
        .all()
        .map((i) => ({
          ...i,
          columns: db.prepare(`PRAGMA index_info(${i.name})`).all(),
        })),
      foreignKeys: db.prepare(`PRAGMA foreign_key_list(${t.name})`).all(),
      seed: db.prepare(`SELECT * FROM ${t.name}`).all(),
    }));
  db.close();
}
fs.writeFileSync(
  "server/postgres/schema-original.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    empresa: result.empresa.map((x) => x.name),
    global: result.global.map((x) => x.name),
  }),
);
