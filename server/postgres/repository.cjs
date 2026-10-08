"use strict";
const { Pool, types } = require("pg");
const { connectionConfig } = require("./connection.cjs");
const original = require("./schema-original.json");
// Match the numeric API contract of the original accounting controllers.
types.setTypeParser(1700, Number);
types.setTypeParser(20, Number);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
class AccountingRepository {
  constructor(pool) {
    this.pool = pool || new Pool({ ...connectionConfig(), max: 8 });
  }
  async transaction(userId, scopeId, fn) {
    if (!uuid.test(userId) || !uuid.test(scopeId))
      throw new Error("Usuario o empresa inválidos.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(
        "SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('ansorito.scope_id',$3,true)",
        [
          JSON.stringify({ sub: userId, role: "authenticated" }),
          userId,
          scopeId,
        ],
      );
      await client.query("SET LOCAL search_path = ansorito, pg_catalog");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async seed(client, kind) {
    for (const table of original[kind]) {
      for (const row of table.seed) {
        const keys = Object.keys(row);
        await client.query(
          `INSERT INTO ${quote(table.name)} (${keys.map(quote).join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          Object.values(row),
        );
      }
      // Identity sequences begin above all original seed IDs in the migration.
      // Creating a company requires no privilege to reset shared sequences.
    }
  }
  async listCompanies(userId) {
    return this.transaction(
      userId,
      userId,
      async (c) =>
        (
          await c.query(
            "SELECT id,nombre,created_at FROM empresas ORDER BY created_at,id",
          )
        ).rows,
    );
  }
  async createCompany(userId, name) {
    name = String(name || "").trim();
    if (!name || name.length > 200)
      throw new Error("Escribe un nombre de empresa de hasta 200 caracteres.");
    return this.transaction(userId, userId, async (c) => {
      const company = (
        await c.query(
          "INSERT INTO empresas(nombre) VALUES($1) RETURNING id,nombre",
          [name],
        )
      ).rows[0];
      await c.query("SELECT set_config('ansorito.scope_id',$1,true)", [
        company.id,
      ]);
      await this.seed(c, "empresa");
      return company;
    });
  }
  async initializeGlobal(userId) {
    return this.transaction(userId, userId, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "ansorito-global:" + userId,
      ]);
      // Company creation/global initialization will be integrated in the runtime
      // before this repository replaces the SQLite controller adapter.
      if ((await c.query("SELECT 1 FROM monedas LIMIT 1")).rows.length) return;
      // Global seeds are currently empty; retain this method for schema parity.
      await this.seed(c, "global");
    });
  }
  async close() {
    await this.pool.end();
  }
}
module.exports = { AccountingRepository };
