const { current } = require("../context.cjs");
const { database } = require("./adapter.cjs");
const original = require("./schema-original.json");
function companies() {
  return database(current().userId)
    .prepare("SELECT id,nombre FROM empresas ORDER BY created_at,id")
    .all()
    .map((x) => ({
      id: x.id,
      name: x.nombre,
      publicPath: "/empresas/" + x.id + "/" + x.nombre,
    }));
}
function selected() {
  return companies().find((x) => x.id === current().companyId) || null;
}
function getEstadoEmpresa() {
  const p = selected();
  return {
    connected: !!p,
    folderPath: p?.publicPath || null,
    folderName: p?.name || null,
    dbPath: null,
  };
}
function getDB() {
  if (!selected()) throw Error("No hay ninguna empresa seleccionada.");
  return database(current().companyId);
}
function getGlobalDB() {
  return database(current().userId);
}
function conectarEmpresa(value) {
  const p = companies().find((x) => x.id === value || x.publicPath === value || String(value).startsWith('/empresas/'+x.id+'/'));
  if (!p) throw Error("Empresa no registrada en este espacio");
  current().companyId = p.id;
  return { success: true, ...getEstadoEmpresa() };
}
function createCompany(name) {
  const db = getGlobalDB();
  return db.transaction(() => {
    const p = db
      .prepare("INSERT INTO empresas(nombre) VALUES (?) RETURNING id")
      .get(name);
    current().companyId = p.id;
    const companyDb = getDB();
    for (const t of original.empresa)
      for (const row of t.seed) {
        const keys = Object.keys(row);
        companyDb
          .prepare(
            `INSERT INTO ${t.name} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          )
          .run(...Object.values(row));
      }
    return { success: true, ...getEstadoEmpresa() };
  })();
}
function renombrarEmpresa(nombre) {
 require('../../src/main/repositories/empresaRepository').renombrarDirectorio(getDB(),current().companyId,nombre);
}
module.exports = {
  renombrarEmpresa,
  companies,
  getEstadoEmpresa,
  getDB,
  getGlobalDB,
  conectarEmpresa,
  createCompany,
  getMigrationInfo: () => ({ engine: "postgres" }),
};
