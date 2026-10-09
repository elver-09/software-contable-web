"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const original = require("./schema-original.json");
const { connectionConfig } = require("./connection.cjs");
const { AccountingRepository } = require("./repository.cjs");
const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  await db.exec(
    fs.readFileSync(
      path.join(
        __dirname,
        "../../supabase/migrations/202610080001_original_accounting.sql",
      ),
      "utf8",
    ),
  );
  await db.query(
    "INSERT INTO ansorito.empresas(id,owner_id,nombre) VALUES ($1,$2,$3),($4,$5,$6)",
    [companyA, alice, "Empresa A", companyB, bob, "Empresa B"],
  );
  await db.exec("SET ROLE authenticated");
  return db;
}
async function scope(db, user, company) {
  await db.query(
    "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('ansorito.scope_id',$2,false)",
    [user, company],
  );
}
test("PostgreSQL preserves every original column and accepts original seeds", async () => {
  const db = await fixture();
  try {
    for (const [kind, tables] of Object.entries(original)) {
      await scope(db, alice, kind === "global" ? alice : companyA);
      for (const table of tables) {
        const columns = await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2",
          ["ansorito", table.name],
        );
        for (const c of table.columns)
          assert.ok(
            columns.rows.some((r) => r.column_name === c.name),
            `${table.name}.${c.name}`,
          );
        for (const row of table.seed) {
          const keys = Object.keys(row);
          await db.query(
            `INSERT INTO ansorito."${table.name}" (${keys.map((k) => '"' + k + '"').join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
            Object.values(row),
          );
        }
      }
    }
  } finally {
    await db.close();
  }
});
test("RLS blocks other users, unselected companies, and forged ownership", async () => {
  const db = await fixture();
  try {
    await scope(db, alice, companyA);
    await db.query(
      "INSERT INTO ansorito.plan_cuentas(codigo,descripcion) VALUES ('10','Caja A')",
    );
    await scope(db, bob, companyB);
    assert.equal(
      (await db.query("SELECT * FROM ansorito.plan_cuentas")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO ansorito.plan_cuentas(owner_id,scope_id,codigo,descripcion) VALUES ($1,$2,$3,$4)",
        [alice, companyA, "11", "Intento"],
      ),
      { code: "42501" },
    );
    await scope(db, bob, companyA);
    assert.equal(
      (await db.query("SELECT * FROM ansorito.plan_cuentas")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO ansorito.plan_cuentas(codigo,descripcion) VALUES ('11','Intento')",
      ),
      { code: "42501" },
    );
    await scope(db, alice, alice);
    await db.query(
      "INSERT INTO ansorito.plan_cuentas(codigo,descripcion) VALUES ('10','Caja global')",
    );
    assert.equal(
      (await db.query("SELECT descripcion FROM ansorito.plan_cuentas")).rows[0]
        .descripcion,
      "Caja global",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO ansorito.vouchers(origen,fecha) VALUES ('DIARIO','2026-10-08')",
      ),
      { code: "42501" },
    );
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM ansorito.plan_cuentas"), {
      code: "42501",
    });
  } finally {
    await db.close();
  }
});
test("Company references cannot cross scopes; deleting a voucher removes its children", async () => {
  const db = await fixture();
  try {
    await scope(db, alice, companyA);
    await db.query(
      "INSERT INTO ansorito.vouchers(id,origen,fecha) VALUES (50,'DIARIO','2026-10-08')",
    );
    await db.query(
      "INSERT INTO ansorito.voucher_detalles(voucher_id,cuenta,debe) VALUES (50,'10',123.456789)",
    );
    assert.equal(
      String(
        (await db.query("SELECT debe FROM ansorito.voucher_detalles")).rows[0]
          .debe,
      ),
      "123.456789",
    );
    await scope(db, bob, companyB);
    await assert.rejects(
      db.query(
        "INSERT INTO ansorito.voucher_detalles(voucher_id,cuenta) VALUES (50,'10')",
      ),
      { code: "23503" },
    );
    await scope(db, alice, companyA);
    await db.query("DELETE FROM ansorito.vouchers WHERE id=50");
    assert.equal(
      (await db.query("SELECT * FROM ansorito.voucher_detalles")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("Remote PostgreSQL always verifies TLS certificates", () => {
  const config = connectionConfig({
    DATABASE_URL:
      "postgres://user:example@pooler.example.com:5432/postgres?sslmode=require",
  });
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(
    new URL(config.connectionString).searchParams.has("sslmode"),
    false,
  );
  assert.throws(() => connectionConfig({}), /DATABASE_URL/);
});
test("Repository creates complete companies and preserves seed IDs without sequence collisions", async () => {
  const db = await fixture();
  const client = { query: (...args) => db.query(...args), release() {} };
  const repository = new AccountingRepository({ connect: async () => client });
  try {
    const a = await repository.createCompany(alice, "Nueva contabilidad");
    const b = await repository.createCompany(alice, "Segunda contabilidad");
    const companies = await repository.listCompanies(alice);
    assert.ok(companies.some((c) => c.id === a.id));
    assert.ok(companies.some((c) => c.id === b.id));
    assert.equal(
      (await repository.listCompanies(bob)).some((c) => c.id === a.id),
      false,
    );
    await repository.transaction(alice, a.id, async (c) => {
      const defaults = await c.query(
        "SELECT id,nombre FROM amarres_asistente ORDER BY id",
      );
      assert.equal(
        defaults.rows.length,
        original.empresa.find((t) => t.name === "amarres_asistente").seed
          .length,
      );
      const inserted = await c.query(
        "INSERT INTO amarres_asistente(nombre,tipo,prefijo,cuenta_destino) VALUES ('Adicional','COMPRA','60','42') RETURNING id",
      );
      assert.ok(
        Number(inserted.rows[0].id) >
          Math.max(...defaults.rows.map((r) => Number(r.id))),
      );
    });
    await assert.rejects(
      repository.transaction(alice, a.id, async (c) => {
        await c.query(
          "INSERT INTO plan_cuentas(codigo,descripcion) VALUES ('999','Debe revertirse')",
        );
        throw new Error("Revertir");
      }),
      /Revertir/,
    );
    await repository.transaction(alice, a.id, async (c) =>
      assert.equal(
        (await c.query("SELECT * FROM plan_cuentas WHERE codigo='999'")).rows
          .length,
        0,
      ),
    );
  } finally {
    await db.close();
  }
});

test('Working period upsert preserves the profile and company isolation in PostgreSQL', async()=>{
 const db=await fixture();const {translate}=require('./sql.cjs');const repo=require('../../src/main/repositories/empresaRepository');
 const calls=[];const adapter={prepare(sql){return {run(...params){calls.push({sql,params});}};}};
 try {
  await db.exec('SET search_path TO ansorito, public');
  await scope(db,alice,companyA);
  await db.query("INSERT INTO ansorito.config_empresa(id,nombre_comercial,ruc) VALUES(1,$1,$2)",['Perfil A','20111111111']);
  repo.guardarPeriodo(adapter,'2024-02');await db.query(translate(calls[0].sql),calls[0].params);
  const a=(await db.query('SELECT nombre_comercial,ruc,periodo_contable FROM ansorito.config_empresa WHERE id=1')).rows[0];
  assert.deepEqual(a,{nombre_comercial:'Perfil A',ruc:'20111111111',periodo_contable:'2024-02'});
  await scope(db,bob,companyB);repo.guardarPeriodo(adapter,'2025-12');await db.query(translate(calls[1].sql),calls[1].params);
  assert.equal((await db.query('SELECT periodo_contable FROM ansorito.config_empresa WHERE id=1')).rows[0].periodo_contable,'2025-12');
  await scope(db,alice,companyA);assert.equal((await db.query('SELECT periodo_contable FROM ansorito.config_empresa WHERE id=1')).rows[0].periodo_contable,'2024-02');
 } finally {await db.close();}
});

test('Automatic destinations persist snapshots in PostgreSQL and isolate companies and owners',async()=>{
 const db=await fixture();try{
  await db.exec('RESET ROLE');await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202610080005_asientos_automaticos.sql'),'utf8'));await db.exec('SET ROLE authenticated');await db.exec('SET search_path=ansorito,public');
  await scope(db,alice,companyA);
  const repo=require('../../src/main/repositories/asientosAutomaticosRepository');const {translate}=require('./sql.cjs');
  const rule={nombre:'Destino compra',prefijo:'6011',origen:'8',cuenta_debe:'2011',cuenta_haber:'6111',porcentaje:100,activo:1};
  const tasks=[];repo.guardar({prepare(sql){return {run(...p){tasks.push([translate(sql),p]);return {changes:1};}}}},rule);
  await db.query(...tasks[0]);
  assert.equal((await db.query('SELECT nombre FROM asientos_automaticos')).rows[0].nombre,rule.nombre);
  await db.query("INSERT INTO vouchers(id,origen,numero_voucher,fecha,periodo,total_debe,total_haber) VALUES(900,'8',900,'2026-10-08','2026-10',200,200)");
  await db.query("INSERT INTO voucher_detalles(id,voucher_id,cuenta,debe,haber) VALUES(900,900,'6011',100,0),(901,900,'2011',100,0)");
  await db.query('INSERT INTO asientos_automaticos_lineas(detalle_id,voucher_id,fuente_id,regla_json,lado) VALUES($1,$2,$3,$4,$5)',[901,900,900,JSON.stringify(rule),'DEBE']);
  await scope(db,alice,companyB);assert.equal((await db.query('SELECT * FROM asientos_automaticos')).rows.length,0);
  await scope(db,bob,companyB);assert.equal((await db.query('SELECT * FROM asientos_automaticos_lineas')).rows.length,0);
  await assert.rejects(db.query('INSERT INTO asientos_automaticos(owner_id,scope_id,nombre,prefijo,cuenta_debe,cuenta_haber,porcentaje,activo) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[alice,companyA,'Ajeno','6','2011','6111',100,1]),{code:'42501'});
  await scope(db,alice,companyA);assert.equal((await db.query('SELECT fuente_id FROM asientos_automaticos_lineas')).rows[0].fuente_id,900);
  await db.query('DELETE FROM vouchers WHERE id=900');assert.equal((await db.query('SELECT * FROM asientos_automaticos_lineas')).rows.length,0);
 }finally{await db.close();}
});

test('Renombrar el directorio en PostgreSQL preserva el ID y no modifica empresas de otro usuario',async()=>{
 const db=await fixture();try{await scope(db,alice,companyA);await db.exec('SET search_path=ansorito,public');
 const {renombrarDirectorio}=require('../../src/main/repositories/empresaRepository');const {translate}=require('./sql.cjs');const tasks=[];
 renombrarDirectorio({prepare(sql){return {run(...p){tasks.push([translate(sql),p]);return {changes:1};}}}},companyA,'Empresa renombrada');await db.query(...tasks[0]);
 assert.equal((await db.query('SELECT nombre FROM empresas WHERE id=$1',[companyA])).rows[0].nombre,'Empresa renombrada');
 await scope(db,bob,companyB);const changed=await db.query(...tasks[0]);assert.equal(changed.affectedRows,0);assert.equal((await db.query('SELECT nombre FROM empresas WHERE id=$1',[companyB])).rows[0].nombre,'Empresa B');
 }finally{await db.close();}
});
