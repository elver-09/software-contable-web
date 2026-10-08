const crypto = require("node:crypto");
const { current } = require("./context.cjs");
const { getDB } = require("../src/main/database/db");
const hash = (v) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
function version(v) {
  return hash({
    cabecera: v.cabecera,
    detalles: v.detalles,
    tributario: v.tributario,
  });
}
function install(handlers) {
  const add = handlers.get("voucher:add"),
    search = handlers.get("voucher:buscar"),
    searchInvoice = handlers.get("voucher:buscar-factura"),
    update = handlers.get("voucher:update-completo");
  for (const [channel, fn] of [
    ["voucher:buscar", search],
    ["voucher:buscar-factura", searchInvoice],
  ])
    handlers.set(channel, (...args) => {
      const result = fn(...args);
      if (result.success) result.webVersion = version(result);
      return result;
    });
  handlers.set("voucher:update-completo", (_, data) => {
    const actual = search({}, { id: data?.voucher_id ?? data?.id });
    if (!actual.success) return actual;
    if (!data.webVersion || data.webVersion !== version(actual))
      return {
        success: false,
        error:
          "El asiento cambió en otra sesión. Vuelve a cargarlo antes de guardar.",
      };
    return update({}, data);
  });
  handlers.set("voucher:add", (_, data) => {
    const request = current().requestId;
    if (!request) return add({}, data);
    if (!/^[a-f0-9-]{36}$/.test(request))
      throw Error("Identificador de solicitud inválido");
    const db = getDB();
    db.exec(
      "CREATE TABLE IF NOT EXISTS _web_requests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL)",
    );
    return db.transaction(() => {
      const fingerprint = hash(data);
      const previous = db
        .prepare("SELECT * FROM _web_requests WHERE id=?")
        .get(request);
      if (previous) {
        if (previous.hash !== fingerprint)
          throw Error("La solicitud ya existe con otros datos");
        return JSON.parse(previous.result);
      }
      const result = add({}, data);
      if (result.success)
        db.prepare(
          "INSERT INTO _web_requests (id,hash,result) VALUES (?,?,?)",
        ).run(request, fingerprint, JSON.stringify(result));
      return result;
    })();
  });
}
module.exports = { install };
