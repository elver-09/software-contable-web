'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDB } = require('../database/db');
const { obtenerPerfil } = require('../repositories/empresaRepository');
const { getCarteraVencimientos } = require('../controllers/carteraController');
const fecha = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '—';
const etiquetas = {TODOS:'Todos', CXC:'Por cobrar', CXP:'Por pagar', VENCIDO:'Vencidos', PROXIMO:'Próximos 7 días', HOY:'Vencen hoy', PENDIENTE:'Pendientes'};
function preparar(params) {
  if (params.desde && params.hasta && params.desde > params.hasta) throw Error('La fecha desde no puede ser posterior a hasta.');
  const data = getCarteraVencimientos({...params, tipo:params.carteraTipo || 'TODOS'}, true);
  if (!data.documentos.length) throw Error('No hay documentos que coincidan con los filtros para descargar.');
  const empresa = obtenerPerfil(getDB()) || {};
  const filtros = `Tipo: ${etiquetas[data.filtros.tipo] || 'Todos'} · Estado: ${etiquetas[data.filtros.estado] || 'Todos'} · Vencimiento: ${fecha(data.filtros.desde)} a ${fecha(data.filtros.hasta)} · Buscar: ${data.filtros.buscar || '—'}`;
  const totales = data.documentos.reduce((a,d) => {a[d.tipo] += d.saldo; return a;}, {CXC:0,CXP:0});
  const rows = data.documentos.map(d => [etiquetas[d.tipo], `${d.doc_tipo} ${d.doc_numero}`, d.codigo, d.razon_social, fecha(d.fecha_emision), fecha(d.fecha_venc), d.estado_etiqueta, d.saldo]);
  return {data, empresa, filtros, totales, rows};
}
const headers = ['Tipo','Documento','RUC / Código','Entidad','Emisión','Vencimiento','Estado','Saldo (S/)'];
function exportar(params, formato) {
  const {data,empresa,filtros,totales,rows} = preparar(params);
  const fileName = `Cartera_${String(empresa.ruc || 'SIN_RUC').replace(/[^0-9A-Za-z_-]/g,'')}_${data.fecha_corte}.${formato === 'pdf' ? 'pdf' : 'xlsx'}`;
  const filePath = path.join(require('../../../server/context.cjs').current().tempDir, `${randomUUID()}-${fileName}`);
  const cabecera = ['CARTERA Y VENCIMIENTOS', empresa.nombre_comercial || 'Empresa', `RUC: ${empresa.ruc || '—'}`, empresa.direccion_fiscal || '', `Fecha de corte: ${fecha(data.fecha_corte)}`, filtros];
  if (formato === 'excel') {
    const xlsx = require('xlsx-js-style');
    const sheet = xlsx.utils.aoa_to_sheet([...cabecera.map(t=>[t]), [], headers, ...rows, [], ['Total por cobrar','','','','','','',totales.CXC], ['Total por pagar','','','','','','',totales.CXP]]);
    sheet['!cols'] = [14,23,18,42,14,14,24,18].map(wch=>({wch}));
    sheet['!merges'] = cabecera.map((_,r)=>({s:{r,c:0},e:{r,c:7}}));
    for (let r=8;r<8+rows.length;r++) sheet[`H${r+1}`].z='#,##0.00';
    for (let r=9+rows.length;r<=10+rows.length;r++) sheet[`H${r+1}`].z='#,##0.00';
    for (let c=0;c<8;c++) sheet[xlsx.utils.encode_cell({r:7,c})].s={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'2B3E4C'}}};
    const book = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(book,sheet,'Cartera'); xlsx.writeFile(book,filePath);
    return {success:true,filePath,fileName};
  }
  const pm = require('pdfmake/build/pdfmake');
  const vfs = require('pdfmake/build/vfs_fonts');
  for (const [name,value] of Object.entries(vfs)) pm.virtualfs.writeFileSync(name,Buffer.from(value,'base64'));
  const money = n => n.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const def = {pageSize:'A4',pageOrientation:'landscape',pageMargins:[28,28,28,34],defaultStyle:{font:'Roboto',fontSize:8},footer:(p,t)=>({text:`Página ${p} de ${t}`,alignment:'right',margin:[28,8,28,0],fontSize:8}),content:[
    ...cabecera.map((text,i)=>({text,fontSize:i===0?15:9,bold:i<2,margin:[0,0,0,5]})),
    {text:`${rows.length} documento(s) · Importes expresados en soles`,margin:[0,4,0,8]},
    {table:{headerRows:1,widths:[46,80,67,'*',48,48,91,65],body:[headers.map(text=>({text,bold:true,fillColor:'#2B3E4C',color:'#FFFFFF'})),...rows.map(row=>row.map((value,i)=>({text:i===7?money(value):String(value),alignment:i===7?'right':'left'})))]},layout:'lightHorizontalLines'},
    {text:`Total por cobrar: ${money(totales.CXC)}    Total por pagar: ${money(totales.CXP)}`,bold:true,alignment:'right',margin:[0,12,0,0]}
  ]};
  return pm.createPdf(def).getBuffer().then(buffer=>{fs.writeFileSync(filePath,Buffer.from(buffer));return {success:true,filePath,fileName};});
}
module.exports = {preparar,exportar};
