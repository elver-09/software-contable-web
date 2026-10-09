const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {seleccionarReglas,generarDestino,recalcularDestinos}=require('../src/renderer/js/utils/asientosAutomaticos.mjs');
process.env.AUTO_EXCHANGE_RATE='0';process.env.ANSORITO_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ansorito-automaticos-test-'));
const {makeServer,storage}=require('./index.cjs');let server,base,cookie,company,rule;
async function rpc(channel,args=[],extra={}){const res=await fetch(base+'/rpc',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({channel,args,companyId:company,...extra})});const b=await res.json();assert.equal(res.status,200,JSON.stringify(b));return channel==='empresa:seleccionar'?b:channel==='web:import-database'?{...b.value,companyId:b.companyId}:b.value;}
const regla={nombre:'Destino de compra',prefijo:'6011',origen:'8',cuenta_debe:'2011',cuenta_haber:'6111',porcentaje:100,activo:1};
function compra(doc='F099-1',b=100,i=18){return {origen:'8',fechaContable:'2026-10-08',periodo:'2026-10',detalles:[{cuenta:'6011',debe:b,haber:0},{cuenta:'40111',debe:i,haber:0},{cuenta:'4212',debe:0,haber:b+i}].map(d=>({...d,moneda:'PEN',tc:1,doc_tipo:'01',doc_numero:doc,codigo:'20123456789'})),tributario:{tipo_registro:'COMPRA',compra:{g1_base:b,g1_igv:i,importe_total:b+i}}};}
before(async()=>{server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;cookie=(await fetch(base)).headers.get('set-cookie').split(';')[0];company=(await rpc('empresa:seleccionar',[],{companyName:'Automaticos A',companyId:null})).companyId;for(const codigo of ['6011','6012','2011','6111','9411','7911','9421','40111','4212'])assert.equal((await rpc('plan-cuentas:add',[{codigo,descripcion:'Cuenta '+codigo}])).success,true);});
after(()=>new Promise(r=>server.close(r)));
test('Configuración valida cuentas, porcentaje, ciclos, distribución y empresa',async()=>{
 for(const invalid of [{prefijo:'xxx'},{cuenta_debe:'99999'},{cuenta_haber:'2011'},{porcentaje:0},{porcentaje:'abc'},{porcentaje:100.1},{porcentaje:33.333},{cuenta_haber:'6011'}])assert.equal((await rpc('automaticos:guardar',[{...regla,...invalid}])).success,false,JSON.stringify(invalid));
 const r=await rpc('automaticos:guardar',[regla]);assert.equal(r.success,true,r.error);rule=r.id;
 assert.equal((await rpc('automaticos:guardar',[{...regla,nombre:'Duplicada',porcentaje:1}])).success,false);
 const other=(await rpc('empresa:seleccionar',[],{companyName:'Automaticos B',companyId:null})).companyId;
 assert.deepEqual((await rpc('automaticos:get',[],{companyId:other})).reglas,[]);
 assert.equal((await rpc('automaticos:eliminar',[rule],{companyId:other})).success,false);
 assert.equal((await rpc('automaticos:get')).reglas.length,1);
});
test('Prefijo específico, origen específico y reparto con redondeo sin cascada',()=>{
 const rs=[{...regla,id:1,prefijo:'6',origen:'*'},{...regla,id:2,origen:'*'},{...regla,id:3,porcentaje:60},{...regla,id:4,porcentaje:40,cuenta_debe:'9411'}];
 const seleccion=seleccionarReglas('6011','8',rs);assert.deepEqual(seleccion.map(r=>r.id),[3,4]);
 const rows=generarDestino({id:1,cuenta:'6011',debe:100.01,haber:0,moneda:'USD',tc:3.8},seleccion);assert.equal(rows.length,4);assert.equal(rows[0].debe,60.01);assert.equal(rows[1].haber,60.01);assert.equal(rows[0].equivalente,228.04);assert.equal(rows[2].debe,40);
 assert.throws(()=>generarDestino({debe:1},[{...regla,porcentaje:60},{...regla,porcentaje:60}]),/100/);
});
let saved;
test('Vista previa, persistencia y reintentos generan destino sin cambiar el comprobante',async()=>{
 const v=compra();const preview=await rpc('automaticos:preview',[v]);assert.equal(preview.lineas.length,2);assert.equal(preview.lineas[0].debe,100);
 const requestId=require('node:crypto').randomUUID();saved=await rpc('voucher:add',[v],{requestId});assert.equal(saved.success,true,saved.error);assert.deepEqual(await rpc('voucher:add',[v],{requestId}),saved);
 const found=await rpc('voucher:buscar',[{id:saved.id}]);assert.equal(found.detalles.length,5);assert.equal(found.detalles.filter(d=>d.automatico).length,2);assert.equal(found.cabecera.total_debe,218);assert.equal(found.tributario.compra.importe_total,118);
 const p=await rpc('reportes:previsualizar',[{tipo:'registro-compras',desde:'2026-10-01',hasta:'2026-10-31'}]);assert.equal(p.success,true,p.error);
});
test('Edición recalcula destino, conserva la regla histórica y no duplica las líneas',async()=>{
 assert.equal((await rpc('automaticos:guardar',[{...regla,id:rule,porcentaje:50}])).success,true);
 let f=await rpc('voucher:buscar',[{id:saved.id}]);
 const manual=f.detalles.filter(d=>!d.automatico);const changes=compra('F099-1',200,36).detalles;
 let detalles=f.detalles.map(d=>d.automatico?{...d,debe:999,haber:999}:{...d,...changes[manual.findIndex(m=>m.id===d.id)]});
 const preview=await rpc('automaticos:preview',[{voucher_id:saved.id,origen:'8',detalles}]);assert.equal(preview.lineas[0].debe,200);
 assert.equal((await rpc('voucher:update-completo',[{voucher_id:saved.id,detalles,webVersion:f.webVersion,tributario:compra('F099-1',200,36).tributario}])).success,true);
 f=await rpc('voucher:buscar',[{id:saved.id}]);assert.equal(f.detalles.length,5);assert.equal(f.detalles.find(d=>d.automatico&&d.debe).debe,200);assert.equal(f.cabecera.total_debe,436);assert.equal(f.tributario.compra.importe_total,236);
 const local=recalcularDestinos(f.detalles.map(d=>d.cuenta==='6011'?{...d,debe:300}:d));assert.equal(local.find(d=>d.automatico&&d.debe).debe,300);
 assert.equal((await rpc('automaticos:eliminar',[rule])).success,true);
 assert.equal((await rpc('voucher:update-completo',[{voucher_id:saved.id,detalles:f.detalles,webVersion:f.webVersion}])).success,true);
 assert.equal((await rpc('voucher:buscar',[{id:saved.id}])).detalles.length,5);
});
test('SIRE usa el mismo motor y las notas de crédito invierten el destino',async()=>{
 rule=(await rpc('automaticos:guardar',[regla])).id;
 const r=await rpc('sire:contabilizar-zip',[{tipo:'compras',glosa:'Importación de prueba',config:{cuenta_gasto:'6011',cuenta_igv_compras:'40111',cuenta_cxp:'4212'},registros:[{serie:'F099',numero:'NC',tipo_doc:'07',fecha_emision:'2026-10-08',periodo:'202610',ruc_dni:'20123456789',g1_base:-100,g1_igv:-18,total:-118}]}]);assert.equal(r.registrados,1,JSON.stringify(r));
 const f=await rpc('voucher:buscar-factura',[{periodo:'2026-10',docNumero:'F099-NC',origen:'8'}]);assert.equal(f.detalles.length,5);assert.equal(f.detalles.find(d=>d.automatico&&d.cuenta==='2011').haber,100);assert.equal(f.tributario.compra.importe_total,-118);
});
test('Los asientos anteriores sin destino no se modifican al activar reglas',async()=>{
 const v=compra('F099-HIST');v.origen='5';v.tributario=undefined;const s=await rpc('voucher:add',[v]);assert.equal(s.success,true);
 const rr=await rpc('automaticos:guardar',[{...regla,origen:'5'}]);assert.equal(rr.success,true,rr.error);
 const f=await rpc('voucher:buscar',[{id:s.id}]);assert.equal(f.detalles.length,3);assert.equal((await rpc('voucher:update-completo',[{voucher_id:s.id,detalles:f.detalles,webVersion:f.webVersion}])).success,true);assert.equal((await rpc('voucher:buscar',[{id:s.id}])).detalles.length,3);
});
test('Fallo tributario revierte voucher, líneas y destinos; respaldos conservan la configuración',async()=>{
 const c={workspace:path.join(process.env.ANSORITO_DATA_DIR,'revision-local'),companyId:company};const db=require('../src/main/database/db');const counts=()=>storage.run(c,()=>['vouchers','voucher_detalles','asientos_automaticos_lineas'].map(t=>db.getDB().prepare('SELECT COUNT(*) AS n FROM '+t).get().n));
 const old=counts();const v=compra('F099-FAIL');v.tributario.compra.importe_total=999;assert.equal((await rpc('voucher:add',[v])).success,false);assert.deepEqual(counts(),old);
 const back=await rpc('web:backup-database',['company']);const bytes=await (await fetch(base+'/download/'+back.download+'?company='+company,{headers:{Cookie:cookie}})).arrayBuffer();const imported=await rpc('web:import-database',[{name:'Copia destinos',kind:'company',base64:Buffer.from(bytes).toString('base64')}]);assert.equal(imported.success,true,imported.error);assert.equal((await rpc('automaticos:get',[],{companyId:imported.companyId})).reglas.length,2);
});
