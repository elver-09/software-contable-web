'use strict';

// Estructura oficial interna de Ansorito para el Estado de Resultados.
// Los conceptos son preestablecidos; el usuario únicamente administra el número
// de nota y las cuentas exactas del Balance de Comprobación que alimentan cada línea.
const ER_BLOCKS = Object.freeze([
  {
    key: 'BRUTA',
    label: 'UTILIDAD BRUTA',
    help: 'Ingresos operacionales y costo de ventas o servicios.',
    subtotalKey: 'utilidad_bruta',
    subtotalLabel: 'UTILIDAD BRUTA',
  },
  {
    key: 'OPERATIVA',
    label: 'UTILIDAD OPERATIVA',
    help: 'Gastos y otros resultados operativos posteriores a la utilidad bruta.',
    subtotalKey: 'utilidad_operativa',
    subtotalLabel: 'UTILIDAD OPERATIVA',
  },
  {
    key: 'ANTES_FINANCIAMIENTO',
    label: 'UTILIDAD ANTES DE FINANCIAMIENTO E IMPUESTO A LA RENTA',
    help: 'Resultados no operativos anteriores al financiamiento e impuesto a la renta.',
    subtotalKey: 'utilidad_antes_financiamiento_ir',
    subtotalLabel: 'UTILIDAD ANTES DE FINANCIAMIENTO E IMPUESTO A LA RENTA',
  },
  {
    key: 'ANTES_IMPUESTO',
    label: 'UTILIDAD ANTES DE IMPUESTO',
    help: 'Resultados financieros anteriores al impuesto a las ganancias.',
    subtotalKey: 'utilidad_antes_impuesto',
    subtotalLabel: 'UTILIDAD ANTES DE IMPUESTO',
  },
  {
    key: 'NETA',
    label: 'UTILIDAD / PÉRDIDA NETA',
    help: 'Impuesto a las ganancias y ajustes finales.',
    subtotalKey: 'utilidad_neta',
    subtotalLabel: 'UTILIDAD / PÉRDIDA NETA',
  },
]);

// Una nota preestablecida por cada línea no subtotal del modelo solicitado.
// conceptoKey permite distinguir los tres conceptos que visualmente comparten
// el nombre "Ganancia / Pérdida por diferencia de cambio".
const ER_DEFAULT_NOTES = Object.freeze([
  { conceptoKey:'VENTAS_OPERACIONALES', numero:'Nota 1',  nombre:'Ingresos por ventas (operacionales)', bloque:'BRUTA', orden:10 },
  { conceptoKey:'COSTO_VENTAS', numero:'Nota 2',  nombre:'Costo de ventas o servicios', bloque:'BRUTA', orden:20 },

  { conceptoKey:'GASTOS_VENTAS', numero:'Nota 3',  nombre:'Gastos de ventas', bloque:'OPERATIVA', orden:10 },
  { conceptoKey:'GASTOS_ADMINISTRATIVOS', numero:'Nota 4',  nombre:'Gastos administrativos', bloque:'OPERATIVA', orden:20 },
  { conceptoKey:'GASTOS_INVESTIGACION', numero:'Nota 5',  nombre:'Gastos de investigación y desarrollo', bloque:'OPERATIVA', orden:30 },
  { conceptoKey:'RESULTADO_VENTA_PPE', numero:'Nota 6',  nombre:'Ganancia / Pérdida por venta de activo fijo (PPE)', bloque:'OPERATIVA', orden:40 },
  { conceptoKey:'DIF_CAMBIO_OPERATIVA', numero:'Nota 7',  nombre:'Ganancia / Pérdida por diferencia de cambio', bloque:'OPERATIVA', orden:50 },

  { conceptoKey:'INGRESOS_DEPOSITOS', numero:'Nota 8',  nombre:'Ingresos por depósitos a plazo', bloque:'ANTES_FINANCIAMIENTO', orden:10 },
  { conceptoKey:'VALORIZACION_INVERSIONES', numero:'Nota 9',  nombre:'Valorización de inversiones financieras', bloque:'ANTES_FINANCIAMIENTO', orden:20 },
  { conceptoKey:'ARRENDAMIENTO_PROPIEDADES_INVERSION', numero:'Nota 10', nombre:'Ingreso por arrendamiento de propiedades de inversión', bloque:'ANTES_FINANCIAMIENTO', orden:30 },
  { conceptoKey:'VALOR_RAZONABLE_PROPIEDADES', numero:'Nota 11', nombre:'Valor razonable de propiedades de inversión', bloque:'ANTES_FINANCIAMIENTO', orden:40 },
  { conceptoKey:'PARTICIPACION_ASOCIADAS', numero:'Nota 12', nombre:'Participación en resultados de asociadas', bloque:'ANTES_FINANCIAMIENTO', orden:50 },
  { conceptoKey:'DIF_CAMBIO_NO_OPERATIVA', numero:'Nota 13', nombre:'Ganancia / Pérdida por diferencia de cambio', bloque:'ANTES_FINANCIAMIENTO', orden:60 },

  { conceptoKey:'INTERESES_PRESTAMOS', numero:'Nota 14', nombre:'Intereses por préstamos bancarios', bloque:'ANTES_IMPUESTO', orden:10 },
  { conceptoKey:'INTERESES_ARRENDAMIENTOS', numero:'Nota 15', nombre:'Intereses por arrendamientos', bloque:'ANTES_IMPUESTO', orden:20 },
  { conceptoKey:'VALOR_PRESENTE_PROVISIONES', numero:'Nota 16', nombre:'Efecto del valor presente de provisiones', bloque:'ANTES_IMPUESTO', orden:30 },
  { conceptoKey:'DIF_CAMBIO_FINANCIERA', numero:'Nota 17', nombre:'Ganancia / Pérdida por diferencia de cambio', bloque:'ANTES_IMPUESTO', orden:40 },

  { conceptoKey:'IMPUESTO_GANANCIAS', numero:'Nota 18', nombre:'Impuesto a las ganancias', bloque:'NETA', orden:10 },
]);

const ER_BLOCK_KEYS = Object.freeze(ER_BLOCKS.map(b => b.key));
const ER_DEFAULT_BY_KEY = Object.freeze(Object.fromEntries(ER_DEFAULT_NOTES.map(n => [n.conceptoKey, n])));

function _toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _parseCuentas(value) {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
  try { return _parseCuentas(JSON.parse(value || '[]')); } catch (_) { return []; }
}

function calcularEstadoResultados(configRows, balances) {
  const balMap = new Map((balances || []).map(b => [String(b.cuenta), b]));
  const notas = (configRows || [])
    .filter(n => ER_BLOCK_KEYS.includes(String(n.bloque || '')))
    .map(n => ({ ...n, cuentas: _parseCuentas(n.cuentas) }))
    .sort((a, b) => {
      const ba = ER_BLOCK_KEYS.indexOf(String(a.bloque));
      const bb = ER_BLOCK_KEYS.indexOf(String(b.bloque));
      if (ba !== bb) return ba - bb;
      const oa = Number(a.orden || 0), ob = Number(b.orden || 0);
      if (oa !== ob) return oa - ob;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  let acumulado = 0;
  const lineas = [];

  for (const bloque of ER_BLOCKS) {
    const bloqueNotas = notas.filter(n => String(n.bloque) === bloque.key);

    for (const nota of bloqueNotas) {
      const detalle = nota.cuentas.map(codigo => {
        const b = balMap.get(codigo) || {};
        const perdida = _toNumber(b.nat_perdida);
        const ganancia = _toNumber(b.nat_ganancia);
        return {
          cuenta: codigo,
          // En Notas ER la denominación nunca debe desaparecer: el controlador
          // enriquece el balance con el Plan de Cuentas efectivo y este fallback
          // cubre configuraciones históricas sin movimiento en el período.
          nombre: String(b.nombre || b.descripcion || 'Cuenta sin denominación'),
          perdida,
          ganancia,
          importe: ganancia - perdida,
          existe_balance: balMap.has(codigo),
        };
      });

      const importe = detalle.reduce((s, d) => s + d.importe, 0);
      acumulado += importe;
      lineas.push({
        tipo: 'nota',
        id: nota.id,
        concepto_key: nota.concepto_key || nota.conceptoKey || '',
        bloque: bloque.key,
        numero: String(nota.numero || ''),
        nota_numero: String(nota.numero || ''),
        nombre: String(nota.nombre || ''),
        label: String(nota.nombre || ''),
        orden: Number(nota.orden || 0),
        cuentas: nota.cuentas,
        detalle,
        importe,
      });
    }

    lineas.push({
      tipo: 'subtotal',
      key: bloque.subtotalKey,
      bloque: bloque.key,
      label: bloque.subtotalLabel,
      importe: acumulado,
      final: bloque.subtotalKey === 'utilidad_neta',
    });
  }

  const notasCalculadas = lineas.filter(l => l.tipo === 'nota');
  const ingresos = notasCalculadas.reduce((s, n) => s + Math.max(0, n.importe), 0);
  const gastos = notasCalculadas.reduce((s, n) => s + Math.max(0, -n.importe), 0);
  const resultado = lineas.find(l => l.key === 'utilidad_neta')?.importe || 0;

  return {
    lineas,
    ingresos,
    gastos,
    resultado,
    notas_configuradas: notasCalculadas.length,
    rubros_configurados: notasCalculadas.length,
  };
}

function esBloqueValido(key) {
  return ER_BLOCK_KEYS.includes(String(key));
}

module.exports = {
  ER_BLOCKS,
  ER_BLOCK_KEYS,
  ER_DEFAULT_NOTES,
  ER_DEFAULT_BY_KEY,
  calcularEstadoResultados,
  esBloqueValido,
};
