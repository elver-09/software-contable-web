const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const parser=require('@babel/parser');
const {sincronizarTributarioLineas,resumirTributarioAsistente,evaluarDetalleTributario}=require('../src/renderer/js/utils/tributario.mjs');
const compra={tipo_registro:'COMPRA',comprobante:{fuente:'ASISTENTE'},compra:{g1_base:3005,g1_igv:540.9,importe_total:3545.9,detraccion_numero:'CONSTANCIA'}};
const filas=[{id:1,cuenta:'6011',debe:3005,haber:0},{id:2,cuenta:'40111',debe:540.9,haber:0},{id:3,cuenta:'4212',debe:0,haber:3545.9}].map(d=>({...d,moneda:'PEN',tc:1,doc_tipo:'01',doc_numero:'F000-03',codigo:'20123456789'}));
const cambiar=(f,b=4000,i=720)=>f.map((d,n)=>({...d,debe:n===0?b:n===1?i:0,haber:n===2?b+i:0}));
test('Editar base, IGV y contrapartida sincroniza la compra y conserva G1 y referencias',()=>{
 const r=sincronizarTributarioLineas(compra,filas,cambiar(filas));assert.equal(r.ok,true);
 assert.equal(r.tributario.compra.g1_base,4000);assert.equal(r.tributario.compra.g1_igv,720);assert.equal(r.tributario.compra.importe_total,4720);assert.equal(r.tributario.compra.detraccion_numero,'CONSTANCIA');assert.equal(compra.compra.g1_base,3005);
});
test('Se conservan G2/G3, ventas exoneradas y notas de crédito negativas',()=>{
 for(const g of ['g2','g3']) {
  const t={tipo_registro:'COMPRA',compra:{[g+'_base']:3005,[g+'_igv']:540.9,importe_total:3545.9}};
  assert.equal(sincronizarTributarioLineas(t,filas,cambiar(filas)).tributario.compra[g+'_base'],4000);
 }
 const nota={tipo_registro:'VENTA',venta:{base_gravada:-3005,igv:-540.9,importe_total:-3545.9}};
 const f=filas.map((d,n)=>({...d,cuenta:n===0?'7011':n===2?'1212':d.cuenta}));
 assert.equal(sincronizarTributarioLineas(nota,f,cambiar(f)).tributario.venta.importe_total,-4720);
 const ex={tipo_registro:'VENTA',venta:{importe_exonerado:100,importe_total:100}};
 const e=[{id:1,cuenta:'7011',debe:0,haber:100},{id:2,cuenta:'1212',debe:100,haber:0}];
 const nuevo=e.map(d=>({...d,debe:d.debe?150:0,haber:d.haber?150:0}));
 assert.equal(sincronizarTributarioLineas(ex,e,nuevo).tributario.venta.importe_exonerado,150);
});
test('Cuentas, moneda, documentos diferentes y distribución mixta no se reclasifican',()=>{
 for(const cambio of [{cuenta:'40112'},{moneda:'USD'},{tc:3.8},{doc_numero:'OTRO'}]) {
  const f=cambiar(filas);f[1]={...f[1],...cambio};assert.equal(sincronizarTributarioLineas(compra,filas,f).ok,false);
 }
 const mixto={tipo_registro:'COMPRA',compra:{g1_base:100,g2_base:100,importe_total:200}};
 assert.equal(sincronizarTributarioLineas(mixto,filas,cambiar(filas)).ok,false);
 const f=structuredClone(filas);f[1].doc_numero='OTRO';assert.equal(sincronizarTributarioLineas(compra,f,f).ok,false);
});
const source=fs.readFileSync(require.resolve('../src/renderer/js/modules/editarRegistros.js'),'utf8');
const ast=parser.parse(source,{sourceType:'module'});
const nombres=['_valorComparable','_calcularTotales','_sincronizarTributarioEditor','_evaluarTributarioEditor','_tributarioEditorHTML'];
function editor(t=compra,f=filas) {
 const c=vm.createContext({_voucherOriginal:structuredClone({tributario:t,detalles:f}),_voucherActual:structuredClone({tributario:t,detalles:f}),_tributarioManual:false,_tributarioAviso:null,_tributarioExpandido:false,_tributarioModificado:false,sincronizarTributarioLineas,resumirTributarioAsistente,evaluarDetalleTributario,escapeHTML:String,escapeAttr:String,fmt:n=>Number(n).toFixed(2)});
 for(const n of ast.program.body.filter(n=>n.type==='FunctionDeclaration'&&nombres.includes(n.id.name))) vm.runInContext(source.slice(n.start,n.end),c);
 return c;
}
test('El editor actualiza el borrador, preserva detracciones editadas y restaura al revertir las líneas',()=>{
 const c=editor();c._voucherActual.tributario.compra.detraccion_numero='EDITADA';c._voucherActual.detalles=cambiar(filas);c._sincronizarTributarioEditor();
 assert.equal(c._voucherActual.tributario.compra.importe_total,4720);assert.equal(c._voucherActual.tributario.compra.detraccion_numero,'EDITADA');assert.equal(c._evaluarTributarioEditor().ok,true);
 c._voucherActual.detalles=structuredClone(filas);c._sincronizarTributarioEditor();assert.equal(c._voucherActual.tributario.compra.g1_base,3005);assert.equal(c._voucherActual.tributario.compra.detraccion_numero,'EDITADA');
});
test('El editor bloquea cambios ambiguos aunque el total siga cuadrado; el modo manual no sobrescribe',()=>{
 const c=editor();c._voucherActual.detalles[0].cuenta='6091';c._sincronizarTributarioEditor();assert.equal(c._evaluarTributarioEditor().ok,false);
 c._tributarioManual=true;c._voucherActual.tributario.compra.g1_base=3010;c._sincronizarTributarioEditor();assert.equal(c._voucherActual.tributario.compra.g1_base,3010);
});
test('Resumen visible, detalles cerrados y montos manuales desactivados por defecto',()=>{
 const c=editor();const html=c._tributarioEditorHTML();assert.match(html,/Base \/ valor: S\/ 3005.00/);assert.match(html,/se actualizan al editar/);assert.match(html,/<details id="er-tax-especiales" >/);assert.match(html,/step="0.01" disabled/);
 c._tributarioManual=true;c._tributarioExpandido=true;const manual=c._tributarioEditorHTML();assert.match(manual,/<details id="er-tax-especiales" open>/);assert.doesNotMatch(manual,/step="0.01" disabled/);
});
