const { workerData } = require("node:worker_threads");
const { Client, types } = require("pg");
const { connectionConfig } = require("./connection.cjs");
types.setTypeParser(1700, Number);
types.setTypeParser(20, Number);
const client = new Client(connectionConfig());
const ready = client
  .connect()
  .then(() =>
    client.query("SET ROLE authenticated; SET search_path=ansorito,pg_catalog"),
  );
ready.catch(() => {});
let lastContext = "";
workerData.port.on("message", async (m) => {
  try {
    await ready;
    const context = m.userId + ":" + m.scopeId;
    if (
      lastContext !== context &&
      !/^(COMMIT|ROLLBACK|RELEASE|SAVEPOINT)/i.test(m.sql)
    ) {
      await client.query(
        "SELECT set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('ansorito.scope_id',$3,false)",
        [
          JSON.stringify({ sub: m.userId, role: "authenticated" }),
          m.userId,
          m.scopeId,
        ],
      );
      lastContext = context;
    }
    const r = await client.query(m.sql, m.params);
    if (/^(COMMIT|ROLLBACK|RELEASE)/i.test(m.sql)) lastContext = "";
    workerData.port.postMessage({
      result: { rows: r.rows, rowCount: r.rowCount },
    });
  } catch (e) {
    workerData.port.postMessage({
      error: { message: e.message, code: e.code },
    });
  } finally {
    const signal = new Int32Array(m.signal);
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
});
