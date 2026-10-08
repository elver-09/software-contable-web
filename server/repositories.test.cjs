const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const parser=require('@babel/parser');
const traverse=require('@babel/traverse').default;
const root=path.resolve(__dirname,'../src/main');
function sources(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
 const file=path.join(folder,entry.name);return entry.isDirectory()?sources(file):file.endsWith('.js')?[file]:[];
});}
test('Controllers, SUNAT services and route registration contain no SQL or direct statements',()=>{
 for(const file of [...sources(path.join(root,'controllers')),...sources(path.join(root,'services')),path.join(root,'main.js'),path.join(__dirname,'voucher-web.cjs')]){
  const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'unambiguous'});
  traverse(ast,{
   CallExpression(p){const c=p.node.callee;if(c.type==='MemberExpression'&&['prepare','exec'].includes(c.property.name))assert.fail('Acceso SQL fuera del repositorio: '+path.relative(root,file));},
   StringLiteral(p){assert.ok(!/^\s*(SELECT\s+.+\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b)/is.test(p.node.value),'SQL fuera del repositorio: '+path.relative(root,file));},
   TemplateLiteral(p){const text=p.node.quasis.map(q=>q.value.raw).join(' PARAM ');assert.ok(!/^\s*(SELECT\s+.+\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b)/is.test(text),'SQL fuera del repositorio: '+path.relative(root,file));}
  });
 }
});
test('Dynamic catalog names and SIRE columns reject undeclared identifiers',()=>{
 const {catalogTable,configKeys}=require('../src/main/repositories/identifiers');
 assert.equal(catalogTable('plan_cuentas'),'plan_cuentas');
 assert.deepEqual(configKeys(['ruc','access_token_enc']),['ruc','access_token_enc']);
 assert.throws(()=>catalogTable('auth.users'),/Catálogo inválido/);
 assert.throws(()=>configKeys(['owner_id']),/Campos de configuración/);
 assert.throws(()=>configKeys(['ruc = NULL; DELETE FROM vouchers']),/Campos de configuración/);
 assert.throws(()=>require('../src/main/repositories/reportesRepository').listarBalanceComprobacion({}, {dig:'4); DELETE FROM vouchers'}),/Nivel de cuenta/);
});
test('Optional report filters bind values without changing their date and account order',()=>{
 const repo=require('../src/main/repositories/reportesRepository');const calls=[];
 const db={prepare(sql){return {all(...params){calls.push({sql,params});return [];}};}};
 const injected="42' OR 1=1 --";
 repo.listarMovimientosMayor(db,{desde:'2026-01-01',hasta:'2026-12-31',cuentaDesde:injected,cuentaHasta:'79'});
 assert.deepEqual(calls[0].params,['2026-01-01','2026-12-31',injected,'79']);
 assert.equal(calls[0].sql.includes(injected),false);
 assert.match(calls[0].sql,/vd\.cuenta >= \?/);assert.match(calls[0].sql,/vd\.cuenta <= \?/);
 repo.listarLibroDiario(db,{desde:'2026-01-01',hasta:'2026-12-31'});
 assert.deepEqual(calls[1].params,['2026-01-01','2026-12-31']);
 assert.equal(calls[1].sql.includes('AND v.origen = ?'),false);
});
