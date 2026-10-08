const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('@babel/parser');
const {evaluarDetalleTributario,resumirTributarioAsistente}=require('../src/renderer/js/utils/tributario.mjs');
const source=fs.readFileSync(require.resolve('../src/renderer/js/modules/voucher.js'),'utf8');
const node=parser.parse(source,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='_leerTributarioAsistente');
function leer(values,extra={},prev=null){
 const inputs=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:String(v)}]));
 const host={querySelector(s){return s==='#asistente-desglose-manual'?{checked:!!extra.manual}:s==='#asistente-revision'?{checked:!!extra.revision}:null;},querySelectorAll(s){const kind=s==='[data-at]'?'at':s==='[data-atc]'?'atc':'atp';return Object.entries(extra[kind]||{}).map(([k,v])=>({dataset:{[kind]:k},value:String(v)}));}};
 const context=vm.createContext({document:{getElementById(id){return id==='asistente-datos-especiales'?host:inputs[id];}},tributarioPendiente:prev});
 vm.runInContext(source.slice(node.start,node.end),context);
 return JSON.parse(JSON.stringify(context._leerTributarioAsistente()));
}
const common={voucher_origen:'8',asistente_base:100,asistente_igv:18,asistente_total:118,asistente_afectacion:'GRAVADO',asistente_grupo_compra:'G2'};
test('El Asistente integra compra G2 y venta exonerada sin una ficha adicional',()=>{
 const compra=leer(common);assert.equal(compra.compra.g2_base,100);assert.equal(compra.compra.g2_igv,18);assert.equal(evaluarDetalleTributario(compra).ok,true);
 const venta=leer({...common,voucher_origen:'14',asistente_afectacion:'EXONERADO',asistente_total:100});assert.equal(venta.venta.importe_exonerado,100);assert.equal(venta.venta.igv,0);assert.equal(evaluarDetalleTributario(venta).ok,true);
});
test('Distribución especial conserva grupos mixtos, referencia, detracción y revisión',()=>{
 const result=leer({...common,asistente_total:236},{manual:true,revision:true,at:{g1_base:100,g1_igv:18,g2_base:100,g2_igv:18},atc:{ref_serie:'F001',ref_numero:'20'},atp:{detraccion_numero:'ABC',detraccion_fecha:'2026-10-01'}},{comprobante:{car_sunat:'CAR-PRUEBA'}});
 assert.equal(evaluarDetalleTributario(result).ok,true);assert.equal(result.compra.g2_base,100);assert.equal(result.compra.detraccion_numero,'ABC');assert.equal(result.comprobante.ref_numero,'20');assert.equal(result.comprobante.car_sunat,'CAR-PRUEBA');assert.equal(result.comprobante.requiere_revision,1);
});
test('Reabrir una clasificación simple conserva G3 y notas negativas; mezclas permanecen detalladas',()=>{
 assert.deepEqual(resumirTributarioAsistente({tipo_registro:'COMPRA',compra:{g3_base:100,g3_igv:18,importe_total:118}}),{afectacion:'GRAVADO',grupo:'G3',base:100,igv:18,tasa:18});
 const nota=resumirTributarioAsistente({tipo_registro:'VENTA',venta:{base_gravada:-100,igv:-18,importe_total:-118}});assert.equal(nota.base,-100);assert.equal(nota.tasa,18);
 assert.equal(resumirTributarioAsistente({tipo_registro:'COMPRA',compra:{g1_base:100,g2_base:100,importe_total:200}}),null);
});
