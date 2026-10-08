const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bucket = "ansorito-files";
const hashes = new Map();
const encoded = (name) => name.split("/").map(encodeURIComponent).join("/");
async function request(session, route, options = {}) {
  const response = await fetch(
    process.env.SUPABASE_URL + "/storage/v1/" + route,
    {
      ...options,
      signal: AbortSignal.timeout(60000),
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + session.access_token,
        ...options.headers,
      },
    },
  );
  if (!response.ok)
    throw Error(
      "No se pudo acceder al archivo privado de Supabase (" +
        response.status +
        ").",
    );
  return response;
}
async function upload(session, file, object) {
  const bytes = fs.readFileSync(file),
    hash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (hashes.get(object) === hash) return object;
  await request(session, "object/" + bucket + "/" + encoded(object), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" },
    body: bytes,
  });
  hashes.set(object, hash);
  return object;
}
async function exportFile(session, c, file) {
  const object = `${session.userId}/${c.companyId || "global"}/exports/${crypto.randomUUID()}/${path.basename(file)}`;
  return upload(session, file, object);
}
async function publishSire(session, c) {
  if (!c.companyId) return;
  const base = path.join(c.workspace, "companies", c.companyId, "sire");
  if (!fs.existsSync(base)) return;
  async function visit(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, item.name);
      if (item.isDirectory()) await visit(full);
      else if (item.isFile())
        await upload(
          session,
          full,
          `${session.userId}/${c.companyId}/sire/${path.relative(base, full).split(path.sep).join("/")}`,
        );
    }
  }
  await visit(base);
}
async function hydrateSire(session, c, channel, args) {
  if (
    !c.companyId ||
    !["sire-sunat:listar-archivos", "sire:comparar-local-sunat"].includes(
      channel,
    )
  )
    return;
  const p = args?.[0] || {};
  if (!/^\d{6}$/.test(String(p.periodo || ""))) return;
  const tipo = String(p.tipo || "")
    .toUpperCase()
    .startsWith("COMPRA")
    ? "compras"
    : "ventas";
  // RUC is part of the original SIRE path; list scoped folders before finding it.
  const root = `${session.userId}/${c.companyId}/sire`;
  const folders = await (
    await request(session, "object/list/" + bucket, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: root, limit: 1000 }),
    })
  ).json();
  for (const folder of folders) {
    if (!/^\d{11}$|^sin-ruc$/.test(folder.name)) continue;
    const prefix = root + "/" + folder.name + "/" + p.periodo + "/" + tipo;
    const files = await (
      await request(session, "object/list/" + bucket, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000 }),
      })
    ).json();
    for (const item of files) {
      if (!item.id || path.basename(item.name) !== item.name) continue;
      const target = path.join(
        c.workspace,
        "companies",
        c.companyId,
        "sire",
        folder.name,
        p.periodo,
        tipo,
        item.name,
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const response = await request(
        session,
        "object/" + bucket + "/" + encoded(prefix + "/" + item.name),
      );
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      if (item.updated_at)
        fs.utimesSync(
          target,
          new Date(item.updated_at),
          new Date(item.updated_at),
        );
    }
  }
}
async function download(session, object) {
  return request(session, "object/" + bucket + "/" + encoded(object));
}
module.exports = { exportFile, publishSire, hydrateSire, download };
