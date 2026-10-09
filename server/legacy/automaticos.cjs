const tables = [
 {name:'asientos_automaticos', columns:['id','nombre','prefijo','origen','cuenta_debe','cuenta_haber','porcentaje','activo']},
 {name:'asientos_automaticos_lineas', columns:['detalle_id','voucher_id','fuente_id','regla_json','lado']}
].map(t => ({...t, columns:t.columns.map(name=>({name}))}));
function ensureAutomaticosSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS asientos_automaticos (
 id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, prefijo TEXT NOT NULL,
 origen TEXT NOT NULL DEFAULT '*', cuenta_debe TEXT NOT NULL, cuenta_haber TEXT NOT NULL,
 porcentaje REAL NOT NULL CHECK(porcentaje > 0 AND porcentaje <= 100), activo INTEGER NOT NULL CHECK(activo IN (0,1)));
 CREATE TABLE IF NOT EXISTS asientos_automaticos_lineas (
 detalle_id INTEGER PRIMARY KEY REFERENCES voucher_detalles(id) ON DELETE CASCADE,
 voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
 fuente_id INTEGER NOT NULL REFERENCES voucher_detalles(id) ON DELETE CASCADE,
 regla_json TEXT NOT NULL, lado TEXT NOT NULL CHECK(lado IN ('DEBE','HABER')));`);
}
module.exports = {ensureAutomaticosSchema, tables};
