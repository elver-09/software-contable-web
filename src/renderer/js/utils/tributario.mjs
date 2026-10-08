// Shared validation for the browser and the Node 24 accounting server.
export function evaluarDetalleTributario(t) {
  if (!t) return { estado: 'PENDIENTE', ok: false, texto: 'Complete los datos del comprobante' };
  const compra = t.tipo_registro === 'COMPRA';
  const d = compra ? t.compra : t.venta;
  const campos = compra
    ? ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv','valor_no_gravado','isc','icbper','otros_tributos']
    : ['valor_exportacion','base_gravada','descuento_base','igv','descuento_igv','importe_exonerado','importe_inafecto','isc','base_ivap','ivap','icbper','otros_tributos'];
  const valores = [...campos, 'importe_total'].map(k => Number(d?.[k] ?? 0));
  if (valores.some(n => !Number.isFinite(n))) return { estado:'INCOMPLETO', ok:false, texto:'Hay un importe inválido' };
  const total = valores.pop();
  if (!valores.some(n => Math.abs(n) > 0.009)) return { estado:'INCOMPLETO', ok:false, texto:'Complete la base, impuesto o importe no gravado del comprobante' };
  const suma = valores.reduce((a,b) => a+b, 0);
  if (Math.abs(Math.round(suma*100)-Math.round(total*100)) > 1) return { estado:'DESGLOSE', ok:false, texto:`La suma del detalle (${suma.toFixed(2)}) no coincide con el importe total (${total.toFixed(2)})` };
  return { estado:'LISTO', ok:true, texto:'Detalle del comprobante completo' };
}

// Only reduce to the common fields when doing so loses no classification.
export function resumirTributarioAsistente(t) {
  if (!t) return null;
  const compra=t.tipo_registro==='COMPRA'; const d=compra?t.compra:t.venta;
  if (!d) return null;
  const opciones=compra ? [
    ['GRAVADO','G1','g1_base','g1_igv'],['GRAVADO','G2','g2_base','g2_igv'],['GRAVADO','G3','g3_base','g3_igv'],['INAFECTO','G1','valor_no_gravado',null],
  ] : [
    ['GRAVADO','G1','base_gravada','igv'],['EXONERADO','G1','importe_exonerado',null],['INAFECTO','G1','importe_inafecto',null],['EXPORTACION','G1','valor_exportacion',null],
  ];
  const importes=compra ? ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv','valor_no_gravado','isc','icbper','otros_tributos'] : ['valor_exportacion','base_gravada','igv','descuento_base','descuento_igv','importe_exonerado','importe_inafecto','isc','base_ivap','ivap','icbper','otros_tributos'];
  for (const [afectacion,grupo,b,i] of opciones) {
    if (Math.abs(Number(d[b]||0)) <= .009) continue;
    if (importes.some(k=>k!==b&&k!==i&&Math.abs(Number(d[k]||0))>.009)) continue;
    const base=Number(d[b]); const igv=Number(d[i]||0);
    if (!evaluarDetalleTributario(t).ok) continue;
    return {afectacion,grupo,base,igv,tasa:igv/base*100};
  }
  return null;
}

// Match an existing simple distribution to its original accounting lines.
// Never infer G1/G2/G3 or change the document's tax treatment from an account.
export function sincronizarTributarioLineas(t, originales, actuales) {
  const fallo = {ok:false, texto:'Revise la distribución tributaria en Datos especiales: estas líneas no permiten actualizarla automáticamente.'};
  const r = resumirTributarioAsistente(t);
  if (!r || !Array.isArray(originales) || originales.length !== (r.igv ? 3 : 2) || actuales.length !== originales.length) return fallo;
  const compra = t.tipo_registro === 'COMPRA';
  const lado = (compra === (r.base > 0)) ? 'debe' : 'haber';
  const otro = lado === 'debe' ? 'haber' : 'debe';
  const cerca = (a,b) => Math.abs(Number(a)-Number(b)) < .010001;
  const base = originales.filter(d => cerca(d[lado], Math.abs(r.base)) && !Number(d[otro]) && !String(d.cuenta).startsWith('4011'));
  const igv = originales.filter(d => cerca(d[lado], Math.abs(r.igv)) && !Number(d[otro]) && String(d.cuenta).startsWith('4011'));
  const contra = originales.filter(d => cerca(d[otro], Math.abs(r.base+r.igv)) && !Number(d[lado]) && String(d.cuenta).startsWith(compra?'42':'12'));
  if (base.length !== 1 || contra.length !== 1 || (r.igv && igv.length !== 1)) return fallo;
  if (originales.some(d => ['doc_tipo','doc_numero','codigo'].some(k => String(d[k]??'') !== String(originales[0][k]??'')))) return fallo;
  if (new Set(originales.map(d => String(d.id))).size !== originales.length) return fallo;
  const campos = ['cuenta','moneda','tc','doc_tipo','doc_numero','codigo'];
  for (const d of originales) {
    const n = actuales.find(x => String(x.id) === String(d.id));
    if (!n || String(d.moneda||'PEN') !== 'PEN' || campos.some(k => String(d[k]??'') !== String(n[k]??''))) return fallo;
    const l = Number(d.debe) ? 'debe' : 'haber';
    if (Number(n[l==='debe'?'haber':'debe']) || !Number.isFinite(Number(n[l])) || Number(n[l]) <= 0) return fallo;
  }
  const importe = d => Number(actuales.find(x => String(x.id)===String(d.id))[lado]);
  const signo = Math.sign(r.base);
  const nuevo = JSON.parse(JSON.stringify(t));
  const datos = compra ? nuevo.compra : nuevo.venta;
  const b = compra ? (r.afectacion==='GRAVADO' ? `${r.grupo.toLowerCase()}_base` : 'valor_no_gravado')
    : ({GRAVADO:'base_gravada',EXONERADO:'importe_exonerado',INAFECTO:'importe_inafecto',EXPORTACION:'valor_exportacion'})[r.afectacion];
  datos[b] = signo * importe(base[0]);
  if (r.igv) datos[compra ? `${r.grupo.toLowerCase()}_igv` : 'igv'] = signo * importe(igv[0]);
  datos.importe_total = Math.round((datos[b] + (r.igv ? datos[compra?`${r.grupo.toLowerCase()}_igv`:'igv'] : 0))*100)/100;
  return {ok:true, tributario:nuevo};
}
