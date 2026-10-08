const path = require("node:path");
const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} = require("node:worker_threads");
const { current } = require("../context.cjs");
const { translate } = require("./sql.cjs");
const schema = require("./schema-original.json");
const ids = new Set(
  [...schema.empresa, ...schema.global]
    .filter((t) => t.columns.some((c) => c.name === "id"))
    .map((t) => t.name),
);
class Bridge {
  constructor() {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(path.join(__dirname, "query-worker.cjs"), {
      workerData: { port: port2 },
      transferList: [port2],
    });
    this.depth = 0;
  }
  query(sql, params = [], scopeId) {
    const c = current(),
      signal = new SharedArrayBuffer(4);
    this.port.postMessage({
      signal,
      sql,
      params: params.map((v) => (v === undefined ? null : v)),
      userId: c.userId,
      scopeId,
    });
    if (Atomics.wait(new Int32Array(signal), 0, 0, 65000) === "timed-out") {
      this.worker.terminate();
      throw Error("PostgreSQL agotó el tiempo de espera.");
    }
    const m = receiveMessageOnPort(this.port)?.message;
    if (!m) throw Error("Respuesta PostgreSQL incompleta");
    if (m.error) {
      const e = Error(m.error.message);
      e.code = m.error.code;
      throw e;
    }
    return m.result;
  }
}
let bridge;
function clean(row) {
  const { owner_id, scope_id, ...values } = row;
  return values;
}
function database(scopeId) {
  if (!bridge) bridge = new Bridge();
  return {
    prepare(original) {
      return {
        all(...p) {
          return bridge.query(translate(original), p, scopeId).rows.map(clean);
        },
        get(...p) {
          return this.all(...p)[0];
        },
        run(...p) {
          const perform = () => {
            bridge.query(
              "SELECT pg_advisory_xact_lock(hashtext($1))",
              [scopeId],
              scopeId,
            );
            let sql = translate(original);
            const table = /^\s*INSERT INTO\s+([a-z_]+)/i.exec(sql)?.[1];
            if (table && ids.has(table)) {
              const columns = /INSERT INTO\s+[a-z_]+\s*\(([^)]+)\)/i.exec(sql);
              if (
                columns &&
                !columns[1]
                  .split(",")
                  .map((s) => s.trim())
                  .includes("id")
              ) {
                const next = bridge.query(
                  "SELECT COALESCE(MAX(id),0)+1 AS next FROM " + table,
                  [],
                  scopeId,
                ).rows[0].next;
                sql = sql
                  .replace(/(INSERT INTO\s+[a-z_]+\s*\()/i, "$1id, ")
                  .replace(/(VALUES\s*\()/i, "$1" + Number(next) + ", ");
              }
              if (!/\bRETURNING\b/i.test(sql))
                sql = sql.trim().replace(/;$/, "") + " RETURNING id";
            }
            const r = bridge.query(sql, p, scopeId);
            return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id || 0 };
          };
          return bridge.depth
            ? perform()
            : database(scopeId).transaction(perform)();
        },
      };
    },
    exec(sql) {
      if (sql.startsWith("CREATE TABLE IF NOT EXISTS _web_requests")) return;
      bridge.query(translate(sql), [], scopeId);
    },
    transaction(fn) {
      return (...args) => {
        const depth = bridge.depth++,
          savepoint = "ansorito_" + depth;
        bridge.query(depth ? "SAVEPOINT " + savepoint : "BEGIN", [], scopeId);
        try {
          const r = fn(...args);
          if (r?.then)
            throw Error("Una transacción contable debe ser síncrona");
          bridge.query(
            depth ? "RELEASE SAVEPOINT " + savepoint : "COMMIT",
            [],
            scopeId,
          );
          return r;
        } catch (e) {
          bridge.query(
            depth ? "ROLLBACK TO SAVEPOINT " + savepoint : "ROLLBACK",
            [],
            scopeId,
          );
          throw e;
        } finally {
          bridge.depth--;
        }
      };
    },
    pragma() {
      throw Error("Usa el conversor de respaldos para esta operación SQLite.");
    },
  };
}
module.exports = { database };
