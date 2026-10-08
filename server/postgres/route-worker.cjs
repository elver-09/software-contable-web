const { parentPort } = require("node:worker_threads");
const { handlers, storage } = require("../index.cjs");
const db = require("./database.cjs");
parentPort.on("message", async ({ id, context, channel, args }) => {
  try {
    const result = await storage.run(context, async () => {
      if (context.companyId) db.getDB();
      if (channel === "internal:daily-exchange") {
        await require("../../src/main/main.js").fetchDailyExchangeRateOnStartup();
        return { value: { success: true }, companyId: context.companyId };
      }
      // Serialize writes for each accounting scope before duplicate/version checks.
      const write = [
        "voucher:add",
        "voucher:update-completo",
        "sire:contabilizar-zip",
      ].includes(channel);
      let value;
      if (write) {
        const connection = db.getDB();
        value = connection.transaction(() => {
          connection
            .prepare("SELECT pg_advisory_xact_lock(hashtext(?))")
            .get(context.companyId);
          return handlers.get(channel)({}, ...args);
        })();
      } else value = await handlers.get(channel)({}, ...args);
      const active = db.companies().find((x) => x.id === context.companyId);
      return { value, companyId: active?.id || null };
    });
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: { message: e.message, code: e.code } });
  }
});
