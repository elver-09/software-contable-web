// Tests use an existing confirmed Auth owner, with ALL accounting writes rolled back.
process.env.ANSORITO_DB_ENGINE = "postgres";
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { storage } = require("../server/context.cjs");
const db = require("../server/postgres/database.cjs");
const userId = process.env.ANSORITO_VERIFY_USER_ID;
if (!userId)
  throw Error(
    "Define ANSORITO_VERIFY_USER_ID para verificar sin crear cuentas.",
  );
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ansorito-pg-verify-"));
const context = {
  workspace,
  tempDir: workspace,
  userId,
  requestId: crypto.randomUUID(),
};
let passed = false,
  pgSnapshot,
  backupFile;
function snapshot() {
  const report = require("../src/main/controllers/reportesController");
  return {
    reports: Object.fromEntries(
      [
        "registro-ventas",
        "registro-compras",
        "libro-diario",
        "libro-mayor",
        "balance-comprobacion",
        "estado-resultados",
        "situacion-financiera",
        "notas-eeff",
        "notas-er",
      ].map((tipo) => [
        tipo,
        report.previsualizar({
          tipo,
          desde: "2026-01-01",
          hasta: "2026-12-31",
          nivel: 4,
        }),
      ]),
    ),
    cartera:
      require("../src/main/controllers/carteraController").getCarteraVencimientos(
        {},
      ),
    dashboard:
      require("../src/main/controllers/dashboardController").getDashboardData(),
    pending:
      require("../src/main/controllers/voucherController").getDocumentosPendientes(
        {},
      ),
  };
}
try {
  storage.run(context, () => {
    db.getGlobalDB().transaction(() => {
      const created = db.createCompany("Verificación temporal — rollback");
      assert.equal(created.success, true);
      const vouchers = require("../src/main/controllers/voucherController");
      const data = {
        origen: "5",
        fechaContable: "2026-10-07",
        periodo: "2026-10",
        glosa: "Prueba",
        detalles: [
          {
            cuenta: "1011",
            nombre_cuenta: "Caja",
            debe: 118,
            haber: 0,
            moneda: "PEN",
            tc: 1,
          },
          {
            cuenta: "4212",
            nombre_cuenta: "Facturas",
            debe: 0,
            haber: 118,
            moneda: "PEN",
            tc: 1,
            doc_tipo: "01",
            doc_numero: "F001-TEST",
            fecha_doc: "2026-10-07",
            fecha_venc: "2026-11-07",
            codigo: "20123456789",
            razon_social: "Prueba",
          },
        ],
      };
      const saved = vouchers.addVoucher(data);
      assert.equal(saved.success, true, saved.error);
      assert.equal(saved.numero_voucher, 1);
      const found = vouchers.buscarVoucher({ id: saved.id });
      assert.equal(found.success, true);
      assert.equal(found.cabecera.total_debe, 118);
      for (const origen of ["8", "14"]) {
        const extra = structuredClone(data);
        extra.origen = origen;
        extra.detalles.forEach((d) => {
          d.doc_numero = "F001-" + origen;
          d.doc_tipo = "01";
          d.fecha_doc = "2026-10-07";
          d.codigo = "20123456789";
          d.razon_social = "Prueba";
        });
        const r = vouchers.addVoucher(extra);
        assert.equal(r.success, true, r.error);
      }
      const report = require("../src/main/controllers/reportesController");
      assert.equal(
        report.resumenPeriodo({ desde: "2026-01-01", hasta: "2026-12-31" })
          .totalDebe,
        354,
      );
      assert.equal(vouchers.getDocumentosPendientes({}).success, true);
      const cartera =
        require("../src/main/controllers/carteraController").getCarteraVencimientos(
          {},
        );
      assert.ok(Array.isArray(cartera.documentos));
      require("../src/main/controllers/dashboardController").getDashboardData({
        periodo: "2026-10",
      });
      pgSnapshot = JSON.parse(JSON.stringify(snapshot()));
      for (const [tipo, result] of Object.entries(pgSnapshot.reports))
        assert.equal(result.success, true, tipo + ": " + result.error);
      const backup = require("../server/postgres/backups.cjs").backupDatabase(
        "empresa",
      );
      backupFile = backup.filePath;
      assert.ok(fs.statSync(backup.filePath).size > 0);
      const restored = require("../server/postgres/backups.cjs").importDatabase(
        {
          kind: "empresa",
          name: "Importación temporal",
          base64: fs.readFileSync(backup.filePath).toString("base64"),
        },
      );
      assert.equal(restored.success, true);
      assert.equal(restored.vouchers, 3);
      const next = vouchers.addVoucher(data);
      assert.equal(next.success, true, next.error);
      passed = true;
      throw Error("ROLLBACK_VERIFICACION");
    })();
  });
} catch (e) {
  if (e.message !== "ROLLBACK_VERIFICACION") {
    console.error("Validación falló:", e.message);
    process.exitCode = 1;
  }
}
if (passed) {
  try {
    const companyId = context.companyId;
    const folder = path.join(workspace, "companies", companyId);
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(backupFile, path.join(folder, "contable.db"));
    fs.writeFileSync(
      path.join(workspace, "companies.json"),
      JSON.stringify([
        {
          id: companyId,
          name: "Referencia",
          publicPath: "/empresas/" + companyId + "/Referencia",
        },
      ]),
    );
    delete process.env.ANSORITO_DB_ENGINE;
    for (const file of Object.keys(require.cache))
      if (file.includes(path.join("src", "main"))) delete require.cache[file];
    const reference = storage.run(context, () =>
      JSON.parse(JSON.stringify(snapshot())),
    );
    assert.deepEqual(pgSnapshot, reference);
    console.log(
      "PASS: resultados idénticos a SQLite para nueve reportes, cartera, dashboard y documentos.",
    );
  } catch (e) {
    console.error("Comparación falló:", e.message);
    process.exitCode = 1;
  }
}
fs.rmSync(workspace, { recursive: true, force: true });
if (passed && !process.exitCode)
  console.log(
    "PASS: empresa, asiento, nueve reportes, resumen, documentos, cartera y dashboard. Datos revertidos.",
  );
// Close background query worker and its socket after transaction rollback.
setTimeout(() => process.exit(process.exitCode || 0), 50);
