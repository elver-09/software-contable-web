"use strict";
// Only declared catalog tables and SIRE columns may form SQL identifiers.
const sireColumns = new Set([
  "ruc",
  "usuario_sol",
  "clave_sol_enc",
  "client_id",
  "client_secret_enc",
  "scope",
  "seguridad_base_url",
  "sire_base_url",
  "access_token_enc",
  "token_expires_at",
  "estado_conexion",
  "updated_at",
  "cuenta_gasto",
  "cuenta_ingreso",
  "cuenta_igv_compras",
  "cuenta_igv_ventas",
  "cuenta_cxp",
  "cuenta_cxc",
]);
function configKeys(keys) {
  if (
    !Array.isArray(keys) ||
    !keys.length ||
    keys.some((k) => !sireColumns.has(k))
  )
    throw Error("Campos de configuración SIRE inválidos.");
  return keys;
}
function catalogTable(name) {
  if (!["plan_cuentas", "tipos_documentos", "entidades"].includes(name))
    throw Error("Catálogo inválido.");
  return name;
}
module.exports = { configKeys, catalogTable };
