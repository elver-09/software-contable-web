"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { connectionConfig } = require("../server/postgres/connection.cjs");
async function main() {
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('ansorito-schema-migrations'))",
    );
    await client.query(`CREATE SCHEMA IF NOT EXISTS ansorito;
      REVOKE ALL ON SCHEMA ansorito FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ansorito.schema_migrations
        (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
      REVOKE ALL ON ansorito.schema_migrations FROM PUBLIC, authenticated, anon;`);
    const folder = path.join(__dirname, "../supabase/migrations");
    for (const file of fs
      .readdirSync(folder)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = fs.readFileSync(path.join(folder, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const result = await client.query(
        "SELECT checksum FROM ansorito.schema_migrations WHERE version=$1",
        [file],
      );
      if (result.rows.length) {
        if (result.rows[0].checksum !== checksum)
          throw new Error(`La migración aplicada cambió: ${file}`);
        console.log(`Ya aplicada: ${file}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO ansorito.schema_migrations(version,checksum) VALUES($1,$2)",
        [file, checksum],
      );
      console.log(`Aplicada: ${file}`);
    }
    await client.query("COMMIT");
    console.log(
      "Estructura PostgreSQL creada. Los datos existentes no se han importado.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  // Do not print connection strings or credentials, including third-party error details.
  console.error(
    "No se aplicó la migración. Código:",
    error.code || "CONFIGURACION_O_MIGRACION",
  );
  process.exitCode = 1;
});
