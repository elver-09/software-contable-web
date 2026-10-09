const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {esPeriodoValido,normalizarPeriodo,rangoPeriodo,fechaInicialPeriodo,nombrePeriodo,esPeriodoDisponible,mesesDisponibles}=require('../src/renderer/js/utils/periodoTrabajo.mjs');
process.env.AUTO_EXCHANGE_RATE='0';process.env.ANSORITO_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ansorito-periodo-test-'));
const {makeServer}=require('./index.cjs');let server,base,cookie,company;
async function rpc(channel,args=[],extra={}){
 const r=await fetch(base+'/rpc',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({channel,args,companyId:company,...extra})});
 const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return channel==='empresa:seleccionar'?b:b.value;
}
before(async()=>{server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;cookie=(await fetch(base)).headers.get('set-cookie').split(';')[0];const r=await rpc('empresa:seleccionar',[],{companyName:'Período A',companyId:null});company=r.companyId;});
after(()=>new Promise(r=>server.close(r)));
test('Mes y ejercicio válidos, años heredados, febrero bisiesto y fecha inicial del voucher',()=>{
 const hoy=new Date(2026,9,8);assert.equal(normalizarPeriodo('2024',hoy),'2024-10');assert.equal(normalizarPeriodo(null,hoy),'2026-10');
 for(const p of ['2026-00','2026-13','26-01','1899-01','2026-01-01',null])assert.equal(esPeriodoValido(p),false);
 assert.deepEqual(rangoPeriodo('2024-02'),{desde:'2024-02-01',hasta:'2024-02-29'});
 assert.equal(rangoPeriodo('2025-02').hasta,'2025-02-28');assert.equal(rangoPeriodo('2026-12').hasta,'2026-12-31');
 assert.equal(fechaInicialPeriodo('2026-10',hoy),'2026-10-08');assert.equal(fechaInicialPeriodo('2024-02',hoy),'2024-02-01');assert.equal(nombrePeriodo('2024-02'),'Febrero 2024');
});
test('El período persiste en el perfil y se conserva al editar los datos de empresa',async()=>{
 assert.equal((await rpc('empresa:set-periodo',[{periodo:'2024-02'}])).success,true);
 assert.equal((await rpc('empresa:get-periodo')).periodo,'2024-02');
 assert.equal((await rpc('empresa:update-info',[{nombre:'Empresa A editada',ruc:'20123456789',direccion:'Prueba',telefono:'',correo:'',logo:null}])).success,true);
 assert.equal((await rpc('empresa:get-info')).periodo_contable,'2024-02');assert.equal((await rpc('empresa:get-periodo')).periodo,'2024-02');
});
test('Una empresa no modifica el período de otra y los valores inválidos no se guardan',async()=>{
 const r=await rpc('empresa:seleccionar',[],{companyName:'Período B',companyId:null});const other=r.companyId;
 assert.equal((await rpc('empresa:set-periodo',[{periodo:'2025-12'}],{companyId:other})).success,true);
 assert.equal((await rpc('empresa:get-periodo')).periodo,'2024-02');assert.equal((await rpc('empresa:get-periodo',[],{companyId:other})).periodo,'2025-12');
 for(const periodo of ['2026-13','2026-00','abc','2024-02-01','99999-01'])assert.equal((await rpc('empresa:set-periodo',[{periodo}])).success,false);
 assert.equal((await rpc('empresa:get-periodo')).periodo,'2024-02');
});
test('Dashboard consulta el mes elegido, compara con su mes anterior y desplaza los gráficos',async()=>{
 for(const [periodo,total] of [['2024-01',100],['2024-02',200]]){
  const r=await rpc('voucher:add',[{origen:'5',fechaContable:periodo+'-01',periodo,detalles:[{cuenta:'1011',debe:total,haber:0},{cuenta:'7011',debe:0,haber:total}]}]);assert.equal(r.success,true,r.error);
 }
 const d=await rpc('dashboard:get-data');assert.equal(d.periodoActual,'2024-02');assert.equal(d.periodoAnt,'2024-01');assert.equal(d.kpi.ingresosMes,200);assert.equal(d.kpi.vouchersMes,1);assert.equal(d.kpi.debesMes,200);
 assert.equal(d.evolucion.at(-1).periodo,'2024-02');assert.equal(d.evolucion[0].periodo,'2023-03');assert.equal(d.heatmap.length,29);
});

test('Octubre del ejercicio actual muestra diez meses; ejercicios anteriores muestran doce',()=>{
 const hoy=new Date(2026,9,8);
 assert.equal(mesesDisponibles('2026',hoy),10);assert.equal(mesesDisponibles('2025',hoy),12);assert.equal(mesesDisponibles('2027',hoy),0);
 assert.equal(esPeriodoDisponible('2026-10',hoy),true);assert.equal(esPeriodoDisponible('2026-11',hoy),false);assert.equal(esPeriodoDisponible('2025-12',hoy),true);
 assert.equal(normalizarPeriodo('2026-12',hoy),'2026-10');assert.equal(normalizarPeriodo('2027',hoy),'2026-10');
 assert.equal(mesesDisponibles('2026',new Date(2026,0,1)),1);assert.equal(mesesDisponibles('2026',new Date(2026,11,31)),12);
});
test('El servidor rechaza meses y ejercicios futuros sin alterar el período guardado',async()=>{
 const hoy=new Date();const futuro=`${hoy.getFullYear()+1}-01`;
 assert.equal((await rpc('empresa:set-periodo',[{periodo:futuro}])).success,false);
 if(hoy.getMonth()<11){const mesFuturo=`${hoy.getFullYear()}-${String(hoy.getMonth()+2).padStart(2,'0')}`;assert.equal((await rpc('empresa:set-periodo',[{periodo:mesFuturo}])).success,false);}
 assert.equal((await rpc('empresa:get-periodo')).periodo,'2024-02');
});

test('Editar nombre actualiza directorio y perfil, conserva identidad y rechaza nombres inválidos',async()=>{
 const listaAnterior=await rpc('empresa:get-list');const rutaAnterior=listaAnterior.find(p=>p.includes(company));
 const antes=await rpc('empresa:get-info');const renombrar=await rpc('empresa:update-info',[{nombre:'Empresa renombrada',ruc:antes.ruc,direccion:antes.direccion_fiscal,telefono:antes.telefono,correo:antes.correo,logo:antes.logo}]);assert.equal(renombrar.success,true,renombrar.error);
 const lista=await rpc('empresa:get-list');assert.equal(lista.length,listaAnterior.length);assert.ok(lista.includes('/empresas/'+company+'/Empresa renombrada'));assert.equal(lista.includes(rutaAnterior),false);
 assert.equal((await rpc('empresa:get-info')).nombre_comercial,'Empresa renombrada');assert.equal((await rpc('empresa:get-info')).periodo_contable,antes.periodo_contable);
 assert.equal((await rpc('empresa:conectar-directa',[rutaAnterior])).success,true);
 for(const nombre of ['', 'Empresa/otra'])assert.equal((await rpc('empresa:update-info',[{nombre}])).success,false);
 assert.equal((await rpc('empresa:get-info')).nombre_comercial,'Empresa renombrada');assert.deepEqual(await rpc('empresa:get-list'),lista);
 assert.equal((await rpc('empresa:update-info',[{nombre:'Empresa sin logo'}])).success,true);assert.equal((await rpc('empresa:get-info')).logo,null);
});
