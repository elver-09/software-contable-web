const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const parser=require('@babel/parser');
process.env.AUTO_EXCHANGE_RATE='0';
process.env.ANSORITO_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ansorito-balance-test-'));
const {makeServer}=require('./index.cjs');
let server,base,cookie,company,resultado;
async function rpc(channel,args=[],extra={}){
 const r=await fetch(base+'/rpc',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({channel,args,companyId:company,...extra})});
 const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;
}
const muestra=[['1011','Efectivo',510,453.4],['1212','Por cobrar',6480,510],['1411','Cuentas diversas',20000,0],['40111','Tributos',2409.8,988.48],['4212','Por pagar',453.4,15845.4],['5011','Capital',0,20000],['6011','Compras',13435.6,0],['7011','Ventas',0,5491.52]];
const parametros={tipo:'balance-comprobacion',desde:'2026-07-01',hasta:'2026-07-31',nivel:2};
before(async()=>{
 server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base);cookie=r.headers.get('set-cookie').split(';')[0];
 company=(await rpc('empresa:seleccionar',[],{companyName:'Regresión balance',companyId:null})).companyId;
 const detalles=muestra.flatMap(([cuenta,nombre_cuenta,debe,haber])=>[...(debe?[{cuenta,nombre_cuenta,debe,haber:0}]:[]),...(haber?[{cuenta,nombre_cuenta,debe:0,haber}]:[])]);
 const saved=(await rpc('voucher:add',[{origen:'5',fechaContable:'2026-07-31',periodo:'2026-07',glosa:'Caso del documento de observaciones',detalles}])).value;
 assert.equal(saved.success,true,saved.error);
 resultado=(await rpc('reportes:previsualizar',[parametros])).value;assert.equal(resultado.success,true,resultado.error);
});
after(()=>new Promise(r=>server.close(r)));
const cerca=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} ≠ ${b}`);
test('Cuenta 40 deudora se incluye en Activo y el resultado coincide con pérdidas y ganancias',()=>{
 const c=resultado.data.find(c=>c.cuenta==='40');cerca(c.saldo_deudor,1421.32);cerca(c.activo,1421.32);assert.equal(c.pasivo,0);
 const r=resultado.resumen;cerca(r.totalDebe,43288.8);cerca(r.totalHaber,43288.8);cerca(r.totalActivo,27447.92);cerca(r.totalPasivo,35392);
 cerca(r.ganancia,-7944.08);cerca(r.totalActivo-r.totalPasivo,r.ganancia);
 assert.equal(resultado.data.find(c=>c.cuenta==='60').activo,0);cerca(resultado.data.find(c=>c.cuenta==='60').nat_perdida,13435.6);
 assert.equal(resultado.data.find(c=>c.cuenta==='70').pasivo,0);cerca(resultado.data.find(c=>c.cuenta==='70').nat_ganancia,5491.52);
});
test('Excel conserva el saldo 40 en Activo y los mismos subtotales y resultados',async()=>{
 const v=(await rpc('reportes:exportar-excel',[parametros])).value;assert.equal(v.success,true,v.error);
 const bytes=Buffer.from(await (await fetch(base+'/download/'+v.download+'?company='+company,{headers:{Cookie:cookie}})).arrayBuffer());
 const xlsx=require('xlsx');const book=xlsx.read(bytes,{type:'buffer'});const rows=xlsx.utils.sheet_to_json(book.Sheets['Balance Comprobación'],{header:1});
 const c=rows.find(r=>r[0]==='40');cerca(c[6],1421.32);assert.equal(c[7],0);
 const sub=rows.find(r=>r[1]==='SUBTOTALES');cerca(sub[6],27447.92);cerca(sub[7],35392);
 const gan=rows.find(r=>r[5]==='GANANCIA O PÉRDIDA');cerca(gan[6],7944.08);cerca(gan[9],7944.08);
});
function funcion(source,nombre,globals){
 const node=parser.parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===nombre);
 const c=vm.createContext(globals);vm.runInContext(source.slice(node.start,node.end),c);return c[nombre];
}
test('La tabla PDF utiliza Activo corregido y la misma pérdida en las tres secciones',()=>{
 const source=fs.readFileSync(require.resolve('../src/main/controllers/reportesController'),'utf8');
 const build=funcion(source,'construirPDFBalance',{AZUL_OSC:'#000',GRIS_CLR:'#eee',VERDE:'#0f0',ROJO:'#f00',NEGRO:'#000',textoContraste:()=> '#fff',fmt:n=>Number(n).toFixed(2),alturaCabecera:()=>0,buildCabeceraEmpresa:()=>null});
 const rows=build({},resultado.data,parametros.desde,parametros.hasta).content[0].table.body;
 assert.equal(rows.find(r=>r[0].text==='40')[6].text,'1421.32');
 const gan=rows.find(r=>r[0].text==='GANANCIA O PÉRDIDA DEL EJERCICIO');assert.equal(gan[6].text,'7944.08');assert.equal(gan[9].text,'7944.08');assert.equal(gan[11].text,'7944.08');
});
test('La pantalla muestra el saldo 40 en Activo y los tres resultados coinciden',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/js/modules/reportes.js'),'utf8');
 const build=funcion(source,'_previewBalance',{fmt:n=>Number(n).toFixed(2),escapeHTML:String});
 const html=build(resultado.data);const row=html.match(/<tr><td class="rpt-td-cuenta">40<\/td>.*?<\/tr>/s)[0];
 const cells=[...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(m=>m[1]);assert.equal(cells[6],'1421.32');assert.equal(cells[7],'');
 const gan=html.match(/GANANCIA O PÉRDIDA DEL EJERCICIO<\/td>(.*?)<\/tr>/s)[1];assert.equal((gan.match(/7944.08/g)||[]).length,3);
});
test('Saldos contrarios al prefijo se mantienen a nivel 2 y detalle, sin mover gastos, ingresos ni cuentas de orden',async()=>{
 const detalles=[['1011',0,100],['2011',0,200],['3311',0,300],['4212',400,0],['5011',200,0],['6011',100,0],['7011',0,100],['8811',50,0],['8812',0,50],['9111',25,0],['7911',0,25]].map(([cuenta,debe,haber])=>({cuenta,debe,haber}));
 assert.equal((await rpc('voucher:add',[{origen:'5',fechaContable:'2026-08-01',periodo:'2026-08',detalles}])).value.success,true);
 for(const nivel of [2,4]){
  const r=(await rpc('reportes:previsualizar',[{...parametros,desde:'2026-08-01',hasta:'2026-08-31',nivel}])).value;assert.equal(r.success,true);
  for(const c of r.data){
   const elem=c.cuenta[0];
   if('12345'.includes(elem)){cerca(c.activo,c.saldo_deudor);cerca(c.pasivo,c.saldo_acreedor);}
   else {assert.equal(c.activo,0);assert.equal(c.pasivo,0);}
  }
 }
});
