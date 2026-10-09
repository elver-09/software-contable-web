// Shared calculation for the server and the editor. Only original lines trigger rules.
export function seleccionarReglas(cuenta, origen, reglas) {
  let candidatas = reglas.filter(r => Number(r.activo) === 1 && String(cuenta).startsWith(r.prefijo) && (r.origen === '*' || String(r.origen) === String(origen)));
  const longitud = Math.max(0, ...candidatas.map(r => r.prefijo.length));
  candidatas = candidatas.filter(r => r.prefijo.length === longitud);
  if (candidatas.some(r => r.origen !== '*')) candidatas = candidatas.filter(r => r.origen !== '*');
  return candidatas;
}
export function generarDestino(fuente, reglas, nombres = new Map()) {
  const neto = Number(fuente.debe || 0) - Number(fuente.haber || 0);
  if (!Number.isFinite(neto)) throw Error('Importe inválido para el asiento automático.');
  const total = reglas.reduce((s,r) => s + Number(r.porcentaje), 0);
  if (total > 100.000001) throw Error('La distribución de asientos automáticos supera el 100 %.');
  return reglas.flatMap(r => {
    const importe = Math.round(Math.abs(neto) * Number(r.porcentaje)) / 100;
    if (!importe) return [];
    return ['DEBE','HABER'].map(lado => {
      const cuenta = lado === 'DEBE' ? r.cuenta_debe : r.cuenta_haber;
      const alDebe = (lado === 'DEBE') === (neto > 0);
      const moneda = fuente.moneda || 'PEN';
      const tc = Number(fuente.tc || 1);
      return {...fuente, id: undefined, cuenta, nombre_plan: undefined,
        nombre_cuenta: nombres.get(cuenta) || (lado === 'DEBE' ? r.nombre_debe : r.nombre_haber) || cuenta,
        debe: alDebe ? importe : 0, haber: alDebe ? 0 : importe,
        equivalente: Math.round(importe * (moneda === 'PEN' ? 1 : tc) * 100) / 100,
        automatico: true, automatico_fuente_id: fuente.id,
        automatico_regla: r, automatico_lado: lado,
        glosa: `Destino automático: ${r.nombre}${fuente.glosa ? ' · ' + fuente.glosa : ''}`};
    });
  });
}
export function recalcularDestinos(detalles) {
  const originales = detalles.filter(d => !d.automatico);
  const generadas = detalles.filter(d => d.automatico);
  const nuevas = originales.flatMap(f => {
    const previas = generadas.filter(d => Number(d.automatico_fuente_id) === Number(f.id));
    const reglas = [...new Map(previas.map(d => [d.automatico_regla.id, d.automatico_regla])).values()];
    return generarDestino(f, reglas.filter(r => String(f.cuenta).startsWith(r.prefijo))).map(d => {
      const anterior = previas.find(p => p.automatico_regla.id === d.automatico_regla.id && p.automatico_lado === d.automatico_lado);
      return {...d, id: anterior?.id};
    });
  });
  // Keep IDs and zero lines until the server regenerates them; update endpoints require every existing ID.
  return detalles.map(d => d.automatico ? (nuevas.find(n => n.id === d.id) || {...d, debe:0, haber:0, equivalente:0}) : d);
}
