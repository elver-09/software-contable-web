const { test } = require("node:test");
const assert = require("node:assert/strict");
const { translate } = require("./sql.cjs");
test("Bind parameters exclude SQL strings, identifiers and comments", () =>
  assert.equal(
    translate("SELECT '?' AS quoted, \"?\", ? -- ?\n/* ? */ WHERE id=?"),
    "SELECT '?' AS quoted, \"?\", $1 -- ?\n/* ? */ WHERE id=$2",
  ));
test("Upserts preserve independent conflict keys by accounting scope", () =>
  assert.equal(
    translate(
      "INSERT INTO monedas(fecha,nombre,tipo_cambio) VALUES (?,?,?) ON CONFLICT(fecha, nombre) DO UPDATE SET tipo_cambio=excluded.tipo_cambio",
    ),
    "INSERT INTO monedas(fecha,nombre,tipo_cambio) VALUES ($1,$2,$3) ON CONFLICT(scope_id, fecha, nombre) DO UPDATE SET tipo_cambio=excluded.tipo_cambio",
  ));
test("Dates and field names preserve the desktop API", () => {
  assert.match(
    translate("SELECT datetime('now','localtime') AS created_at"),
    /America\/Lima/,
  );
  assert.equal(
    translate("SELECT SUM(total_debe) AS totalDebe"),
    'SELECT SUM(total_debe) AS "totalDebe"',
  );
});
