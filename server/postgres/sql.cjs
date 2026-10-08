function translate(sql) {
  sql = sql
    .replace(
      /datetime\('now',\s*'localtime'\)/gi,
      "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima','YYYY-MM-DD HH24:MI:SS')",
    )
    .replace(
      /ON CONFLICT\s*\(([^)]+)\)/gi,
      (_, c) => `ON CONFLICT(scope_id, ${c})`,
    )
    .replace(/AS (totalDebe|totalHaber)\b/g, 'AS "$1"');
  sql = sql.replace(
    "COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS descripcion",
    "COALESCE(MAX(pc.descripcion), (array_agg(vd.nombre_cuenta ORDER BY vd.id))[1], 'Sin descripción') AS descripcion",
  );
  if (sql.includes("AS saldo_pendiente"))
    for (const f of [
      "doc_tipo",
      "fecha_doc",
      "fecha_venc",
      "razon_social",
      "cuenta",
    ])
      sql = sql.replace(
        new RegExp("vd\\." + f + "(?=,|\\s*\\n)"),
        `(array_agg(vd.${f} ORDER BY v.numero_voucher DESC, vd.id))[1] AS ${f}`,
      );
  if (/HAVING saldo >/.test(sql)) {
    sql = sql.replace(
      /CASE\s+WHEN substr\(vd.cuenta,1,2\) IN \('12','16'\) THEN SUM\(COALESCE\(vd.debe,0\) - COALESCE\(vd.haber,0\)\)\s+ELSE SUM\(COALESCE\(vd.haber,0\) - COALESCE\(vd.debe,0\)\)\s+END AS saldo/,
      "SUM(CASE WHEN substr(vd.cuenta,1,2) IN ('12','16') THEN COALESCE(vd.debe,0)-COALESCE(vd.haber,0) ELSE COALESCE(vd.haber,0)-COALESCE(vd.debe,0) END) AS saldo",
    );
    sql =
      "SELECT * FROM (" +
      sql.replace(
        /HAVING saldo > 0\.009\s+ORDER BY vd.fecha_venc ASC, razon_social ASC, doc_numero ASC\s*$/,
        ") grouped WHERE saldo > 0.009 ORDER BY fecha_venc ASC, razon_social ASC, doc_numero ASC",
      );
  }
  let out = "",
    n = 0,
    state = "normal";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      next = sql[i + 1];
    if (state === "single" || state === "double") {
      out += c;
      const q = state === "single" ? "'" : '"';
      if (c === q) {
        if (next === q) {
          out += next;
          i++;
        } else state = "normal";
      }
    } else if (state === "line") {
      out += c;
      if (c === "\n") state = "normal";
    } else if (state === "block") {
      out += c;
      if (c === "*" && next === "/") {
        out += next;
        i++;
        state = "normal";
      }
    } else if (c === "'" || c === '"') {
      state = c === "'" ? "single" : "double";
      out += c;
    } else if (c === "-" && next === "-") {
      state = "line";
      out += c + next;
      i++;
    } else if (c === "/" && next === "*") {
      state = "block";
      out += c + next;
      i++;
    } else out += c === "?" ? "$" + ++n : c;
  }
  return out;
}
module.exports = { translate };
