const {getDB}=require('../database/db');
const repo=require('../repositories/asientosAutomaticosRepository');
const {getMergedCatalog}=require('../services/catalogos/catalogoScope');
const {seleccionarReglas,generarDestino}=require('../../renderer/js/utils/asientosAutomaticos.mjs');
function listar(){try{return {success:true,reglas:repo.listar(getDB())};}catch(e){return {success:false,error:e.message};}}
function validar(data,plan){
 const r={id:data.id==null?null:Number(data.id),nombre:String(data.nombre||'').trim(),prefijo:String(data.prefijo||'').trim(),origen:String(data.origen||'*'),cuenta_debe:String(data.cuenta_debe||'').trim(),cuenta_haber:String(data.cuenta_haber||'').trim(),porcentaje:Number(data.porcentaje),activo:Number(data.activo)};
 if(r.id!==null&&(!Number.isInteger(r.id)||r.id<=0))throw Error('Regla inválida.');
 if(!r.nombre||r.nombre.length>120)throw Error('Ingrese un nombre de hasta 120 caracteres.');
 if(!/^\d{1,8}$/.test(r.prefijo)||!plan.some(c=>c.codigo.startsWith(r.prefijo)))throw Error('La cuenta o prefijo de origen no existe en el plan contable.');
 if(!['*','1','5','8','14','31','50','90'].includes(r.origen))throw Error('Origen inválido.');
 for(const campo of ['cuenta_debe','cuenta_haber'])if(!/^\d{3,8}$/.test(r[campo])||!plan.some(c=>c.codigo===r[campo]))throw Error('Seleccione cuentas al Debe y Haber existentes en el plan contable (al menos 3 dígitos).');
 if(r.cuenta_debe===r.cuenta_haber)throw Error('Las cuentas al Debe y Haber deben ser diferentes.');
 if(r.cuenta_debe===r.prefijo||r.cuenta_haber===r.prefijo)throw Error('La cuenta de destino no debe ser la misma cuenta de origen.');
 if(!Number.isFinite(r.porcentaje)||r.porcentaje<=0||r.porcentaje>100||Math.abs(r.porcentaje*100-Math.round(r.porcentaje*100))>0.000001)throw Error('El porcentaje debe ser mayor que 0 y hasta 100, con dos decimales.');
 if(![0,1].includes(r.activo))throw Error('Estado inválido.');
 return r;
}
function guardar(data){try{const db=getDB();return db.transaction(()=>{
 const r=validar(data,getMergedCatalog('plan_cuentas'));
 const reglas=repo.listar(db).filter(x=>x.id!==r.id);reglas.push(r);
 const suma=reglas.filter(x=>x.activo===1&&x.prefijo===r.prefijo&&x.origen===r.origen).reduce((s,x)=>s+Number(x.porcentaje),0);
 if(r.activo===1&&suma>100.000001)throw Error('Las reglas activas para este prefijo y origen superan el 100 %.');
 const info=repo.guardar(db,r);if(r.id&&info.changes!==1)throw Error('Regla no encontrada.');
 return {success:true,id:r.id||info.lastInsertRowid};
 })();}catch(e){return {success:false,error:e.message};}}
function eliminar(id){try{if(!Number.isInteger(Number(id))||Number(id)<=0)throw Error('Regla inválida.');const info=repo.eliminar(getDB(),Number(id));if(info.changes!==1)throw Error('Regla no encontrada.');return {success:true};}catch(e){return {success:false,error:e.message};}}
function decorar(db,id,detalles){const marcas=new Map(repo.metadata(db,id).map(m=>[Number(m.detalle_id),m]));return detalles.map(d=>{const m=marcas.get(Number(d.id));return m?{...d,automatico:true,automatico_fuente_id:m.fuente_id,automatico_lado:m.lado,automatico_regla:JSON.parse(m.regla_json)}:{...d,automatico:false};});}
function preparar(db,origen,detalles,marcas=[],historico=false){
 const plan=getMergedCatalog('plan_cuentas');const nombres=new Map(plan.map(c=>[c.codigo,c.descripcion]));const actuales=repo.listar(db);
 return detalles.flatMap((f,index)=>{
 const anteriores=marcas.filter(m=>Number(m.fuente_id)===Number(f.id));
 const reglas=anteriores.length?[...new Map(anteriores.map(m=>{const r=JSON.parse(m.regla_json);return [r.id,r];})).values()]:historico?[]:historico?[]:seleccionarReglas(f.cuenta,origen,actuales);
 for(const r of reglas)for(const c of [r.cuenta_debe,r.cuenta_haber])if(!nombres.has(c))throw Error(`La cuenta ${c} del amarre ${r.nombre} ya no existe en el plan contable.`);
 return generarDestino(f,reglas.filter(r=>String(f.cuenta).startsWith(r.prefijo)).map(r=>({...r,nombre_debe:nombres.get(r.cuenta_debe),nombre_haber:nombres.get(r.cuenta_haber)})),nombres).map(d=>({...d,fuente_index:index}));
 });
}
function previsualizar(data){try{const db=getDB();let marcas=[];let detalles=data.detalles;if(!Array.isArray(detalles))throw Error('Líneas requeridas.');if(data.voucher_id)marcas=repo.metadata(db,Number(data.voucher_id));const ids=new Set(marcas.map(m=>Number(m.detalle_id)));detalles=detalles.filter(d=>!ids.has(Number(d.id)));return {success:true,lineas:preparar(db,data.origen,detalles,marcas,!!data.voucher_id)};}catch(e){return {success:false,error:e.message};}}
module.exports={listar,guardar,eliminar,decorar,preparar,previsualizar,validar};
