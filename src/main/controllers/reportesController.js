const reportesRepository = require('../repositories/reportesRepository.js');
// src/main/controllers/reportesController.js
// ═══════════════════════════════════════════════════════════════════════════════
// Controlador de Reportes Contables — Ansorito
//
// REPORTES:
//   1. Libro Diario        — FORMATO 5.1 SUNAT (portrait)
//   2. Libro Mayor         — Movimientos por cuenta con saldo corrido
//   3. Balance de Comprobación — Sumas y Saldos
//   4. Estado de Resultados    — Ingresos - Gastos = Utilidad
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { getDB, getGlobalDB } = require('../database/db');
const estadoResultadosController = require('./estadoResultadosController');
const { buildEffectivePlanMap, resolveEffectiveAccountName } = require('../services/catalogos/planCuentasLookup');

// ── pdfmake ──────────────────────────────────────────────────────────────────
let _pdfReady = false;
let _pm = null;

function initPdfMake() {
  if (_pdfReady) return _pm;
  _pm = require('pdfmake/build/pdfmake');
  const vfs = require('pdfmake/build/vfs_fonts');
  Object.keys(vfs).forEach(f => {
    _pm.virtualfs.writeFileSync(f, Buffer.from(vfs[f], 'base64'));
  });
  _pdfReady = true;
  return _pm;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS COMUNES
// ═══════════════════════════════════════════════════════════════════════════════

const AZUL_OSC = '#1e3a56';
const AZUL_MED = '#1560a0';
const GRIS_CLR = '#f4f7fb';
const ROJO     = '#9b2335';
const VERDE    = '#147848';
const NEGRO    = '#182433';
const GRIS_TXT = '#486080';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Devuelve el color de texto (oscuro o blanco) que mejor contrasta con un fondo
// hex dado. Permite que los colores de cabecera CLAROS sigan siendo legibles.
// withHash=true → '#RRGGBB'; false → 'RRGGBB' (para xlsx-js-style).
function textoContraste(hex, withHash = true) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return withHash ? '#FFFFFF' : 'FFFFFF';
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000; // luminancia percibida
  const oscuro = '1A2330', claro = 'FFFFFF';
  const sel = yiq >= 150 ? oscuro : claro; // fondo claro → texto oscuro
  return withHash ? `#${sel}` : sel;
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return '0.00';
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function textoPeriodo(desde, hasta) {
  const [dy, dm] = desde.split('-');
  const [hy, hm] = hasta.split('-');
  if (dm === hm && dy === hy) return `${MESES[parseInt(dm,10)].toUpperCase()} ${dy}`;
  return `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`;
}

function getEmpresa() {
  try {
    return reportesRepository.getEmpresa_get_config_empresa(getDB()) || {};
  } catch (_) { return {}; }
}

function origenLabel(cod) {
  const m = {
    '1':'Caja y Bancos', '5':'Opción Diario', '8':'Reg. Compras',
    '14':'Reg. Ventas e Ingresos', '31':'Planillas', '50':'Provisiones', '90':'Otros',
  };
  return m[cod] || `Origen ${cod}`;
}

// ── Encabezado/pie PDF reutilizable (para L.Mayor, Balance, EERR) ────────────
function pdfEncabezado(empresa, titulo, desde, hasta) {
  return {
    margin: [0, 0, 0, 8],
    table: { widths: ['*', 'auto'],
      body: [[
        { border:[false,false,false,false], stack: [
            { text: titulo, fontSize: 15, bold: true, color: AZUL_OSC, margin: [0,0,0,3] },
            { text: (empresa.nombre_comercial || 'EMPRESA').toUpperCase(), fontSize: 11, bold: true, color: NEGRO, margin: [0,0,0,2] },
            { text: `RUC: ${empresa.ruc || '—'}`, fontSize: 9, color: GRIS_TXT },
        ]},
        { border:[false,false,false,false], alignment: 'right', stack: [
            { text: 'PERÍODO', fontSize: 7, bold: true, color: GRIS_TXT, characterSpacing: 1, margin: [0,0,0,2] },
            { text: textoPeriodo(desde, hasta), fontSize: 11, bold: true, color: AZUL_MED, margin: [0,0,0,4] },
            { text: `Impreso: ${new Date().toLocaleDateString('es-PE')}`, fontSize: 8, color: GRIS_TXT },
        ]},
      ]],
    },
    layout: 'noBorders',
  };
}

function pdfLineaSep() {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 795, y2: 0, lineWidth: 1.5, lineColor: AZUL_MED }],
    margin: [0, 0, 0, 10],
  };
}

function pdfFooterFactory(empresa, titulo, desde, hasta) {
  return (page, pages) => ({
    columns: [
      { text: `${empresa.nombre_comercial || ''} — ${titulo} — ${textoPeriodo(desde,hasta)}`, fontSize: 7, color: GRIS_TXT, margin: [30,0,0,0] },
      { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 7, color: GRIS_TXT, margin: [0,0,30,0] },
    ],
    margin: [0,10,0,0],
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. LIBRO DIARIO — FORMATO 5.1 SUNAT
// ═══════════════════════════════════════════════════════════════════════════════

// ── Reportes tipo "diario" (journal) ────────────────────────────────────────
// Cada uno reutiliza el mismo motor del Libro Diario, pero filtrando por un
// libro fijo (origen) y con su propio título de formato.
//   - Libro Diario:      todos los libros, correlativo global 1..N (orden cronológico)
//   - Registro de Ventas: solo libro 14, renumerado 1..N
//   - Registro de Compras: solo libro 8, renumerado 1..N
const DIARIO_REPORTES = {
  'libro-diario':     { origen: null, titulo: 'FORMATO 5.1: "LIBRO DIARIO"',  label: 'LibroDiario',     hoja: 'Libro Diario'     },
  'registro-ventas':  { origen: '14', titulo: 'REGISTRO DE VENTAS E INGRESOS', label: 'RegistroVentas',  hoja: 'Registro Ventas'  },
  'registro-compras': { origen: '8',  titulo: 'REGISTRO DE COMPRAS',           label: 'RegistroCompras', hoja: 'Registro Compras' },
};

function queryLibroDiario(desde, hasta, origen) {
  const db = getDB();

  return reportesRepository.listarLibroDiario(db, { desde, hasta, origen });
}

/**
 * Agrupa filas planas en vouchers con detalles.
 * Asigna número correlativo secuencial (1, 2, 3...) por orden de aparición.
 */
function agruparVouchers(filas) {
  const mapa = new Map();
  let correlativo = 0;

  for (const f of filas) {
    if (!mapa.has(f.voucher_id)) {
      correlativo++;
      mapa.set(f.voucher_id, {
        id: f.voucher_id, origen: f.origen, numero: f.numero_voucher,
        fecha: f.fecha, glosa: f.glosa_cabecera || '',
        correlativo,
        total_debe: 0, total_haber: 0, detalles: [],
      });
    }
    const v = mapa.get(f.voucher_id);
    const debe  = parseFloat(f.debe)  || 0;
    const haber = parseFloat(f.haber) || 0;
    v.total_debe  += debe;
    v.total_haber += haber;
    v.detalles.push({
      cuenta: f.cuenta || '', nombre: f.nombre_cuenta || f.cuenta || '',
      debe, haber,
      glosa: f.detalle_glosa || f.glosa_cabecera || '',
      doc_tipo: f.doc_tipo || '', doc_numero: f.doc_numero || '',
      fecha_doc: f.fecha_doc || f.fecha || '',
      fecha_venc: f.fecha_venc || '',
      codigo: f.codigo || '',
      tc: f.tc || 1,
      moneda: f.moneda || 'PEN', razon_social: f.razon_social || '',
    });
  }
  return Array.from(mapa.values());
}

// ── PDF FORMATO 5.1 — Portrait — Cabecera repetida en cada página ────────────
function construirPDFLibroDiario(empresa, vouchers, desde, hasta, headerColor, tituloFormato) {
  let granDebe = 0, granHaber = 0;
  vouchers.forEach(v => { granDebe += v.total_debe; granHaber += v.total_haber; });
  const TITULO_FMT = tituloFormato || 'FORMATO 5.1: "LIBRO DIARIO"';

  const HDR_BG = headerColor || '#2C3E50';
  const HDR_TX = textoContraste(HDR_BG);

  // ── Celdas auxiliares ─────────────────────────────────────────────────
  const cs = (text, opts = {}) => ({
    text: text ?? '', fontSize: 6.5, color: '#000',
    alignment: opts.align || 'center',
    bold: opts.bold || false,
    margin: [3, 4, 3, 4],
    ...opts,
  });

  const hdrCell = (text, opts = {}) => ({
    text, fontSize: 6, bold: true, color: HDR_TX, fillColor: HDR_BG,
    alignment: 'center', noWrap: false,
    margin: [3, 9, 3, 9], // margen simétrico → centra y deja aire arriba/abajo
    ...opts,
  });

  // Celda vacía CON bordes (separador visible entre asientos)
  const blankCell = () => ({ text: '', margin: [0, 3, 0, 3] });

  // ── Cabecera de empresa (idéntica para todos los reportes) ────────────
  const buildHeader = buildCabeceraEmpresa(empresa, TITULO_FMT, desde, hasta);

  const headerHeight = alturaCabecera(empresa);

  // ── Cabecera de la tabla (2 filas, se repite por headerRows) ──────────
  const headerRow1 = [
    hdrCell('N° CORRELATIVO', { rowSpan: 2 }),
    hdrCell('FECHA DE OPERACIÓN', { rowSpan: 2 }),
    hdrCell('GLOSA DE LA OPERACIÓN', { rowSpan: 2 }),
    hdrCell('REFERENCIA DE LA OPERACIÓN', { colSpan: 3 }),
    {}, {},
    hdrCell('CUENTA CONTABLE\nASOCIADA A LA OPERACIÓN', { colSpan: 2 }),
    {},
    hdrCell('MOVIMIENTO', { colSpan: 2 }),
    {},
  ];

  const headerRow2 = [
    {}, {}, {},
    hdrCell('COD. DEL LIBRO'),
    hdrCell('N° CORRELATIVO'),
    hdrCell('N° DOCUMENTO'),
    hdrCell('CÓDIGO'),
    hdrCell('DENOMINACIÓN'),
    hdrCell('DEBE'),
    hdrCell('HABER'),
  ];

  // ── Filas de datos ────────────────────────────────────────────────────
  const body = [headerRow1, headerRow2];

  vouchers.forEach((v, vIdx) => {
    const numCorrelativo = String(v.correlativo);
    const fechaOp = v.detalles[0]?.fecha_doc || v.fecha || '';
    const glosaOp = v.detalles[0]?.glosa || v.glosa || '';
    const codLibro = v.origen;
    const numVoucher = String(v.numero).padStart(4, '0');

    v.detalles.forEach((det, idx) => {
      const esPrimera = idx === 0;
      body.push([
        cs(esPrimera ? numCorrelativo : '', { align: 'center', bold: esPrimera }),
        cs(esPrimera ? fmtFecha(fechaOp) : '', { align: 'center' }),
        cs(esPrimera ? glosaOp : '', { align: 'left' }),
        cs(esPrimera ? codLibro : '', { align: 'center' }),
        cs(esPrimera ? numVoucher : '', { align: 'center' }),
        cs(det.doc_numero || '', { align: 'center' }),
        cs(det.cuenta, { bold: true, align: 'center' }),
        cs(det.nombre, { align: 'left' }),
        cs(det.debe > 0 ? fmt(det.debe) : '', { align: 'right' }),
        cs(det.haber > 0 ? fmt(det.haber) : '', { align: 'right' }),
      ]);
    });

    // *** SIN "TOTALES DEL ASIENTO" — solo fila en blanco con bordes ***
    if (vIdx < vouchers.length - 1) {
      body.push(Array(10).fill(null).map(() => blankCell()));
    }
  });

  // Fila TOTALES GENERALES (única fila de totales)
  body.push([
    cs(''), cs(''), cs(''), cs(''), cs(''), cs(''), cs(''),
    cs('TOTALES:', { bold: true, align: 'right', fontSize: 8 }),
    cs(fmt(granDebe), { bold: true, align: 'right', fontSize: 8 }),
    cs(fmt(granHaber), { bold: true, align: 'right', fontSize: 8 }),
  ]);

  const widths = [34, 40, 82, 28, 34, 48, 34, '*', 48, 48];

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [42, headerHeight + 10, 42, 44],
    // Cabecera repetida en CADA página
    header: buildHeader,
    footer: (page, pages) => ({
      columns: [
        { text: `${(empresa.razon_social || empresa.nombre_comercial || '').toUpperCase()} — Libro Diario`, fontSize: 6, color: '#888', margin: [42,0,0,0] },
        { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 6, color: '#888', margin: [0,0,42,0] },
      ],
      margin: [0, 8, 0, 0],
    }),
    content: [
      {
        table: {
          headerRows: 2,
          dontBreakRows: true,
          widths,
          body,
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 2 || i === node.table.body.length) ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => '#c0ccd8',
          paddingLeft:   () => 3,
          paddingRight:  () => 3,
          paddingTop:    () => 2,
          paddingBottom: () => 2,
        },
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 7, color: '#000' },
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. LIBRO MAYOR — Movimientos agrupados por cuenta con saldo corrido
// ═══════════════════════════════════════════════════════════════════════════════

function queryLibroMayor(desde, hasta, cuentaDesde, cuentaHasta) {
  const db = getDB();

  const movimientos = reportesRepository.listarMovimientosMayor(db, { desde, hasta, cuentaDesde, cuentaHasta });

  const saldosIni = {};
  reportesRepository.listarSaldosInicialesMayor(db, { desde, cuentaDesde, cuentaHasta }).forEach(r => {
    saldosIni[r.cuenta] = (r.debe_ini || 0) - (r.haber_ini || 0);
  });

  const cuentasMap = new Map();
  movimientos.forEach(m => {
    if (!cuentasMap.has(m.cuenta)) {
      cuentasMap.set(m.cuenta, {
        cuenta: m.cuenta, nombre: m.nombre,
        saldo_inicial: saldosIni[m.cuenta] || 0,
        movimientos: [], total_debe: 0, total_haber: 0,
      });
    }
    const c = cuentasMap.get(m.cuenta);
    const debe = parseFloat(m.debe) || 0;
    const haber = parseFloat(m.haber) || 0;
    c.total_debe  += debe;
    c.total_haber += haber;
    c.movimientos.push({
      fecha: m.fecha, origen: m.origen, numero: m.numero_voucher,
      glosa: m.glosa || '', debe, haber,
      doc_tipo: m.doc_tipo || '', doc_numero: m.doc_numero || '',
    });
  });

  const resultado = [];
  cuentasMap.forEach(c => {
    let saldo = c.saldo_inicial;
    c.movimientos.forEach(m => { saldo += m.debe - m.haber; m.saldo = saldo; });
    c.saldo_final = saldo;
    resultado.push(c);
  });
  return resultado;
}

function construirPDFLibroMayor(empresa, cuentas, desde, hasta, headerColor) {
  const HDR_BG = headerColor || '#2C3E50';
  const HDR_TX = textoContraste(HDR_BG);
  const FZ = 8;
  const SIN_BORDE = [false, false, false, false];
  const CON_BORDE = [true, true, true, true];
  const SOLO_TOP  = [false, true, false, false];

  const cs = (text, opts = {}) => ({
    text: text ?? '', fontSize: FZ, color: '#000',
    alignment: opts.align || 'left', bold: opts.bold || false,
    margin: [3, 2.5, 3, 2.5], border: SIN_BORDE, ...opts,
  });
  const hc = (text, opts = {}) => ({
    text, fontSize: 7.5, bold: true, color: HDR_TX, fillColor: HDR_BG,
    alignment: 'center', margin: [3, 5, 3, 5], border: CON_BORDE, ...opts,
  });
  const E = () => ({});

  const widths = [62, 78, '*', 80, 80];
  const NCOL = widths.length;
  const layout = {
    defaultBorder: false,
    paddingLeft: () => 2, paddingRight: () => 2,
    paddingTop: () => 0, paddingBottom: () => 0,
    hLineColor: () => '#333', vLineColor: () => '#333',
  };

  // Cabecera de columnas ÚNICA (se repite solo al saltar de página)
  const headRow1 = [
    hc('FECHA DE LA\nOPERACIÓN', { rowSpan: 2 }),
    hc('N° CORRELATIVO', { rowSpan: 2 }),
    hc('DESCRIPCIÓN O GLOSA', { rowSpan: 2 }),
    hc('SALDOS Y MOVIMIENTOS', { colSpan: 2 }), E(),
  ];
  const headRow2 = [E(), E(), E(), hc('DEUDOR'), hc('ACREEDOR')];
  const body = [headRow1, headRow2];

  cuentas.forEach((c, idx) => {
    // Rótulo de la cuenta (fila de grupo, sin recuadro)
    body.push([{
      colSpan: NCOL, border: SIN_BORDE, margin: [1, idx > 0 ? 7 : 4, 1, 2],
      text: [
        { text: 'CÓDIGO Y/O DENOMINACIÓN DE LA CUENTA CONTABLE: ', bold: true, fontSize: 8 },
        { text: `${c.cuenta} - ${c.nombre}`, bold: true, fontSize: 8, color: '#1560a0' },
      ],
    }, {}, {}, {}, {}]);

    c.movimientos.forEach(m => {
      body.push([
        cs(fmtFecha(m.fecha), { align: 'center' }),
        cs(String(m.numero), { align: 'center' }),
        cs(m.glosa || '', { align: 'left' }),
        cs(m.debe > 0 ? fmt(m.debe) : '', { align: 'right' }),
        cs(m.haber > 0 ? fmt(m.haber) : '', { align: 'right' }),
      ]);
    });

    // TOTALES de la cuenta
    body.push([
      cs('', { colSpan: 2 }), {},
      cs('TOTALES', { align: 'right', bold: true }),
      cs(fmt(c.total_debe),  { align: 'right', bold: true, border: SOLO_TOP }),
      cs(fmt(c.total_haber), { align: 'right', bold: true, border: SOLO_TOP }),
    ]);
  });

  const headerHeight = alturaCabecera(empresa);

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [34, headerHeight + 12, 34, 36],
    header: buildCabeceraEmpresa(empresa, 'FORMATO 6.1: "LIBRO MAYOR"', desde, hasta),
    footer: pdfFooterFactory(empresa, 'Libro Mayor', desde, hasta),
    content: [{ table: { headerRows: 2, widths, body }, layout }],
    defaultStyle: { font: 'Roboto', fontSize: FZ, color: '#000' },
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. BALANCE DE COMPROBACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function queryBalanceComprobacion(desde, hasta, nivel) {
  const db = getDB();
  const dig = Number(nivel || 0);
  if (!Number.isInteger(dig) || dig < 0 || dig > 32) throw new Error('Nivel de cuenta inválido');
  const rows = reportesRepository.listarBalanceComprobacion(db, { dig }, desde, hasta);

  // Calcular CUENTAS (Activo/Pasivo), NATURALEZA (Pérdida/Ganancia), FUNCIÓN
  return rows.map(c => {
    const elem = c.cuenta.charAt(0);
    let activo = 0, pasivo = 0, nat_perdida = 0, nat_ganancia = 0;
    // Activo: elementos 1,2,3 → saldo deudor
    if (['1','2','3'].includes(elem)) activo = c.saldo_deudor;
    // Pasivo+Patrimonio: elementos 4,5 → saldo acreedor
    if (['4','5'].includes(elem)) pasivo = c.saldo_acreedor;
    // Naturaleza: gastos (6) → pérdida, ingresos (7) → ganancia
    if (elem === '6') nat_perdida = c.saldo_deudor;
    if (elem === '7') nat_ganancia = c.saldo_acreedor;
    // Elemento 8 (Resultados): su naturaleza depende del lado de su saldo.
    // Esto permite que cuentas como 88 Impuesto a la Renta alimenten el ER.
    if (elem === '8') {
      nat_perdida = c.saldo_deudor;
      nat_ganancia = c.saldo_acreedor;
    }
    return { ...c, activo, pasivo, nat_perdida, nat_ganancia, fun_perdida: nat_perdida, fun_ganancia: nat_ganancia };
  });
}

function construirPDFBalance(empresa, cuentas, desde, hasta, headerColor) {
  const HDR_BG = headerColor || AZUL_OSC;
  const HDR_TX = textoContraste(HDR_BG);
  let totD=0,totH=0,totDr=0,totAc=0,tAct=0,tPas=0,tNP=0,tNG=0,tFP=0,tFG=0;
  cuentas.forEach(c=>{totD+=c.sum_debe;totH+=c.sum_haber;totDr+=c.saldo_deudor;totAc+=c.saldo_acreedor;tAct+=(c.activo||0);tPas+=(c.pasivo||0);tNP+=(c.nat_perdida||0);tNG+=(c.nat_ganancia||0);tFP+=(c.fun_perdida||0);tFG+=(c.fun_ganancia||0);});
  const gan = tNG - tNP;
  const hs = (text, opts={}) => ({text,fontSize:6,bold:true,color:HDR_TX,fillColor:HDR_BG,alignment:'center',margin:[2,6,2,6],...opts});
  const v = (n) => n > 0.005 ? fmt(n) : '';
  const body = [
    [hs('Cuenta',{rowSpan:2,alignment:'left',margin:[3,8,2,6]}),hs('Nombre',{rowSpan:2,alignment:'left',margin:[2,8,2,6]}),hs('MOVIMIENTOS',{colSpan:2}),{},hs('SALDOS',{colSpan:2}),{},hs('CUENTAS',{colSpan:2}),{},hs('NATURALEZA',{colSpan:2}),{},hs('FUNCIÓN',{colSpan:2}),{}],
    [{},{},hs('Débito'),hs('Crédito'),hs('Deudor'),hs('Acreedor'),hs('Activo'),hs('Pasivo'),hs('Pérdida'),hs('Ganancia'),hs('Pérdida'),hs('Ganancia')],
  ];
  cuentas.forEach((c,i)=>{const bg=i%2===0?'#fff':GRIS_CLR;
    const s=(text,opts={})=>({text:text??'',fontSize:6.5,fillColor:bg,color:'#000',alignment:'right',margin:[2,3,2,3],...opts});
    body.push([s(c.cuenta,{bold:true,color:AZUL_OSC,alignment:'left',margin:[3,3,2,3]}),s(c.nombre,{alignment:'left'}),s(v(c.sum_debe)),s(v(c.sum_haber)),s(v(c.saldo_deudor),{bold:true,color:VERDE}),s(v(c.saldo_acreedor),{bold:true,color:ROJO}),s(v(c.activo||0)),s(v(c.pasivo||0)),s(v(c.nat_perdida||0),{color:ROJO}),s(v(c.nat_ganancia||0),{color:VERDE}),s(v(c.fun_perdida||0),{color:ROJO}),s(v(c.fun_ganancia||0),{color:VERDE})]);
  });
  const st=(text,opts={})=>({text:text??'',fontSize:6.5,bold:true,fillColor:'#e8f0fa',alignment:'right',margin:[2,4,2,4],...opts});
  body.push([st('SUBTOTALES',{colSpan:2,margin:[3,4,2,4]}),{},st(fmt(totD)),st(fmt(totH)),st(fmt(totDr)),st(fmt(totAc)),st(fmt(tAct)),st(fmt(tPas)),st(fmt(tNP)),st(fmt(tNG)),st(fmt(tFP)),st(fmt(tFG))]);
  const gs=(text,opts={})=>({text:text??'',fontSize:6.5,bold:true,fillColor:'#fff8e1',alignment:'right',margin:[2,4,2,4],...opts});
  body.push([gs('GANANCIA O PÉRDIDA DEL EJERCICIO',{colSpan:6}),{},{},{},{},{},gs(v(tAct<tPas?tPas-tAct:0)),gs(v(tAct>tPas?tAct-tPas:0)),gs(v(tNG>tNP?tNG-tNP:0),{color:ROJO}),gs(v(tNP>tNG?tNP-tNG:0),{color:VERDE}),gs(v(tFG>tFP?tFG-tFP:0),{color:ROJO}),gs(v(tFP>tFG?tFP-tFG:0),{color:VERDE})]);
  const ft=(text,opts={})=>({text:text??'',fontSize:6.5,bold:true,color:HDR_TX,fillColor:HDR_BG,alignment:'right',margin:[2,5,2,5],...opts});
  body.push([ft('TOTALES',{colSpan:6}),{},{},{},{},{},ft(fmt(Math.max(tAct,tPas))),ft(fmt(Math.max(tAct,tPas))),ft(fmt(Math.max(tNP,tNG))),ft(fmt(Math.max(tNP,tNG))),ft(fmt(Math.max(tFP,tFG))),ft(fmt(Math.max(tFP,tFG)))]);
  const headerHeight = alturaCabecera(empresa);
  return {pageSize:'A4',pageOrientation:'landscape',pageMargins:[20,headerHeight+10,20,44],
    header: buildCabeceraEmpresa(empresa,'BALANCE DE COMPROBACIÓN',desde,hasta),
    footer:(page,pages)=>({columns:[{text:`${(empresa.razon_social||empresa.nombre_comercial||'').toUpperCase()} — Balance de Comprobación`,fontSize:6,color:'#888',margin:[20,0,0,0]},{text:`Página ${page} de ${pages}`,alignment:'right',fontSize:6,color:'#888',margin:[0,0,20,0]}],margin:[0,8,0,0]}),
    content:[{table:{headerRows:2,dontBreakRows:true,widths:[36,'*',42,42,42,42,42,42,42,42,42,42],body},layout:{
      hLineWidth:(i,node)=>(i===0||i===2||i===node.table.body.length)?0.5:0,vLineWidth:()=>0,hLineColor:()=>'#c0ccd8',
      paddingLeft:()=>2,paddingRight:()=>2,paddingTop:()=>1,paddingBottom:()=>1}}],
    defaultStyle:{font:'Roboto',fontSize:7,color:NEGRO}};
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. ESTADO DE RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════════

function queryEstadoResultados(desde, hasta) {
  const result = estadoResultadosController.getData({ desde, hasta });
  if (!result?.success) throw new Error(result?.error || 'No se pudo calcular el Estado de Resultados.');
  return result.data;
}

function _fmtER(n) {
  const value = Number(n || 0);
  if (value < -0.005) return `(S/ ${fmt(Math.abs(value))})`;
  return `S/ ${fmt(value)}`;
}

function construirPDFEstadoResultados(empresa, data, desde, hasta, headerColor) {
  const HDR = headerColor || AZUL_OSC;
  const HDR_TX = textoContraste(HDR);
  const headerHeight = alturaCabecera(empresa);
  const lineas = data?.lineas || [];

  // El ER usa la misma plantilla corporativa que Libro Diario, Compras y Ventas:
  // cabecera de empresa reutilizable, tipografía compacta y pie uniforme.
  const body = [[
    { text:'RUBRO', bold:true, color:HDR_TX, fillColor:HDR, fontSize:6.5, margin:[5,5,3,5], border:[false,false,false,false] },
    { text:'NOTA', bold:true, color:HDR_TX, fillColor:HDR, alignment:'center', fontSize:6.5, margin:[3,5,3,5], border:[false,false,false,false] },
    { text:'IMPORTE', bold:true, color:HDR_TX, fillColor:HDR, alignment:'right', fontSize:6.5, margin:[3,5,5,5], border:[false,false,false,false] },
  ]];

  lineas.forEach(l => {
    if (l.tipo === 'subtotal') {
      body.push([
        { text:l.label, colSpan:2, bold:true, fontSize:l.final?8:7.5, fillColor:l.final?HDR:'#e7f0f8', color:l.final?HDR_TX:HDR, margin:[5,5,3,5], border:[false,true,false,true], borderColor:l.final?HDR:AZUL_MED }, {},
        { text:_fmtER(l.importe), bold:true, fontSize:l.final?8:7.5, fillColor:l.final?HDR:'#e7f0f8', color:l.final?HDR_TX:HDR, alignment:'right', margin:[3,5,5,5], border:[false,true,false,true], borderColor:l.final?HDR:AZUL_MED },
      ]);
      return;
    }
    body.push([
      { text:l.nombre || l.label || '', fontSize:7, color:NEGRO, margin:[5,3,3,3], border:[false,false,false,true], borderColor:'#c0ccd8' },
      { text:l.numero || l.nota_numero || '', fontSize:6.5, color:AZUL_MED, alignment:'center', margin:[3,3,3,3], border:[false,false,false,true], borderColor:'#c0ccd8' },
      { text:_fmtER(l.importe), fontSize:7, color:Number(l.importe)<0?ROJO:NEGRO, alignment:'right', margin:[3,3,5,3], border:[false,false,false,true], borderColor:'#c0ccd8' },
    ]);
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [42, headerHeight + 10, 42, 44],
    header: buildCabeceraEmpresa(empresa, 'ESTADO DE RESULTADOS', desde, hasta),
    footer: (page, pages) => ({
      columns: [
        { text: `${(empresa.razon_social || empresa.nombre_comercial || '').toUpperCase()} — Estado de Resultados`, fontSize: 6, color: '#888', margin: [42,0,0,0] },
        { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 6, color: '#888', margin: [0,0,42,0] },
      ],
      margin: [0,8,0,0],
    }),
    content: [{
      table: { headerRows: 1, dontBreakRows: true, widths: ['*', 58, 92], body },
      layout: {
        defaultBorder: false,
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0,
        vLineWidth: () => 0,
        hLineColor: () => '#c0ccd8',
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    }],
    defaultStyle: { font: 'Roboto', fontSize: 7, color: NEGRO },
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// CABECERA DE EMPRESA — compartida por TODOS los reportes (PDF)
// Bloque idéntico: TÍTULO · PERÍODO · RUC · RAZÓN SOCIAL · DIRECCIÓN (+ logo)
// ═══════════════════════════════════════════════════════════════════════════════
function buildCabeceraEmpresa(empresa, titulo, desde, hasta) {
  // Logo → base64 (si existe)
  let logoImg = null;
  if (empresa.logo) {
    try {
      let logoData = empresa.logo;
      if (!logoData.startsWith('data:') && fs.existsSync(logoData)) {
        const ext = path.extname(logoData).replace('.', '');
        logoData = `data:image/${ext};base64,${fs.readFileSync(logoData).toString('base64')}`;
      }
      if (logoData.startsWith('data:')) logoImg = logoData;
    } catch (_) { /* sin logo */ }
  }

  const direccion   = empresa.direccion_fiscal || empresa.direccion || '';
  const razonSocial = (empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase();

  return () => {
    const textoCol = {
      width: '*',
      stack: [
        { text: titulo, fontSize: 9, bold: true, margin: [0, 0, 0, 3] },
        { text: `PERÍODO:  ${textoPeriodo(desde, hasta)}`, fontSize: 8, bold: true, margin: [0, 0, 0, 1] },
        { text: `RUC:  ${empresa.ruc || '—'}`, fontSize: 8, bold: true, margin: [0, 0, 0, 1] },
        { text: `APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL:  ${razonSocial}`, fontSize: 8, bold: true, margin: [0, 0, 0, 1] },
        ...(direccion ? [{ text: `DIRECCIÓN:  ${direccion}`, fontSize: 8, bold: true, margin: [0, 0, 0, 1] }] : []),
      ],
    };
    // Logo limpio (sin recuadro): la imagen ajustada con `fit` mantiene su
    // proporción y se ve nítida, sin borde que la haga ver tosca.
    const logoCol = { width: 'auto', image: logoImg, fit: [50, 50], alignment: 'right' };
    const blankCol = { width: '*', text: '' };
    // 3 columnas: datos (izq) · logo (centro) · en blanco (der)
    return {
      margin: [42, 8, 42, 0],
      columns: logoImg ? [textoCol, logoCol, blankCol] : [textoCol],
    };
  };
}

// Altura aproximada del bloque de cabecera (logo va en la misma fila que el texto)
function alturaCabecera(empresa) {
  const dir = empresa.direccion_fiscal || empresa.direccion || '';
  return 66 + (dir ? 10 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ESTADO DE SITUACIÓN FINANCIERA (Balance General) — EDITABLE
// ═══════════════════════════════════════════════════════════════════════════════

function queryEstadoSituacionFinanciera(desde, hasta) {
  const db = getDB();

  // Helper: busca nombre de cuenta en plan_cuentas probando varios niveles
  const getNombre = (codigo) => {
    for (const len of [codigo.length, 2, 1]) {
      const r = reportesRepository.queryEstadoSituacionFinanciera_get_plan_cuentas(db, codigo.substring(0, len));
      if (r?.descripcion) return r.descripcion;
    }
    return `Cuenta ${codigo}`;
  };

  const q = (elem) => reportesRepository.queryEstadoSituacionFinanciera_all_voucher_detalles(db, desde, hasta, elem).map(r => ({ ...r, nombre: r.nombre_raw || getNombre(r.cuenta) }));

  // ACTIVO: elementos 1,2,3 → saldo deudor (debe - haber)
  const activoCorriente = q('1').map(r => ({ ...r, importe: r.saldo_deudor }));
  const activoNoCorr2 = q('2').map(r => ({ ...r, importe: r.saldo_deudor }));
  const activoNoCorr3 = q('3').map(r => ({ ...r, importe: r.saldo_deudor }));
  const activoNoCorriente = [...activoNoCorr2, ...activoNoCorr3];

  // PASIVO: elemento 4 → saldo acreedor (haber - debe)
  const pasivo = q('4').map(r => ({ ...r, importe: r.saldo_acreedor }));

  // PATRIMONIO: elemento 5 → saldo acreedor (haber - debe)
  const patrimonio = q('5').map(r => ({ ...r, importe: r.saldo_acreedor }));

  // Resultado del ejercicio (ingresos - gastos)
  const ingresos = reportesRepository.queryEstadoSituacionFinanciera_get_voucher_detalles(db, desde, hasta)?.total || 0;
  const gastos = reportesRepository.queryEstadoSituacionFinanciera_get_voucher_detalles_2(db, desde, hasta)?.total || 0;
  const resultadoEjercicio = ingresos - gastos;

  const totalActivoCorriente = activoCorriente.reduce((s, r) => s + r.importe, 0);
  const totalActivoNoCorriente = activoNoCorriente.reduce((s, r) => s + r.importe, 0);
  const totalActivo = totalActivoCorriente + totalActivoNoCorriente;
  const totalPasivo = pasivo.reduce((s, r) => s + r.importe, 0);
  const totalPatrimonio = patrimonio.reduce((s, r) => s + r.importe, 0) + resultadoEjercicio;
  const totalPasivoPatrimonio = totalPasivo + totalPatrimonio;

  return {
    activoCorriente, activoNoCorriente, pasivo, patrimonio,
    resultadoEjercicio,
    totalActivoCorriente, totalActivoNoCorriente, totalActivo,
    totalPasivo, totalPatrimonio, totalPasivoPatrimonio,
    cuadre: Math.abs(totalActivo - totalPasivoPatrimonio) < 0.01,
  };
}

function construirPDFSituacionFinanciera(empresa, data, desde, hasta, headerColor) {
  const HDR_BG = headerColor || AZUL_OSC;
  const HDR_TX = textoContraste(HDR_BG);
  const headerHeight = alturaCabecera(empresa);

  function seccion(titulo, items, total, color) {
    const filas = [];
    filas.push({ margin: [0, 10, 0, 4], text: titulo, fontSize: 10, bold: true, color: HDR_BG });
    items.forEach(item => {
      filas.push({ margin: [14, 0, 0, 0], columns: [
        { text: item.cuenta, width: 35, fontSize: 8, bold: true, color: GRIS_TXT },
        { text: item.nombre, fontSize: 8, color: NEGRO },
        { text: `S/ ${fmt(Math.abs(item.importe))}`, width: 80, alignment: 'right', fontSize: 8, color: NEGRO },
      ]});
    });
    filas.push({ margin: [0, 5, 0, 2], table: { widths: ['*', 80], body: [[
      { text: `Total ${titulo}`, bold: true, fontSize: 9, color: color, alignment: 'right', border: [false, true, false, true], margin: [0, 3, 6, 3] },
      { text: `S/ ${fmt(total)}`, bold: true, fontSize: 9, color: color, alignment: 'right', border: [false, true, false, true], margin: [0, 3, 0, 3] },
    ]] }, layout: { hLineWidth: i => i === 0 || i === 1 ? 1 : 0, vLineWidth: () => 0, hLineColor: () => '#c0ccd8' } });
    return filas;
  }

  const content = [];
  // Dos columnas: ACTIVO a la izquierda, PASIVO+PATRIMONIO a la derecha
  const colIzq = [
    { text: 'ACTIVO', fontSize: 12, bold: true, color: HDR_BG, margin: [0, 0, 0, 4] },
    ...seccion('Activo Corriente', data.activoCorriente, data.totalActivoCorriente, '#147848'),
    ...seccion('Activo No Corriente', data.activoNoCorriente, data.totalActivoNoCorriente, '#147848'),
    { margin: [0, 8, 0, 0], table: { widths: ['*', 80], body: [[
      { text: 'TOTAL ACTIVO', bold: true, fontSize: 10, color: '#fff', fillColor: HDR_BG, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 6, 5] },
      { text: `S/ ${fmt(data.totalActivo)}`, bold: true, fontSize: 10, color: '#fff', fillColor: HDR_BG, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 0, 5] },
    ]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0 } },
  ];

  const patrimonioItems = [...data.patrimonio];
  if (data.resultadoEjercicio !== 0) {
    patrimonioItems.push({ cuenta: '', nombre: data.resultadoEjercicio >= 0 ? 'Resultado del Ejercicio (Utilidad)' : 'Resultado del Ejercicio (Pérdida)', importe: data.resultadoEjercicio });
  }

  const colDer = [
    { text: 'PASIVO Y PATRIMONIO', fontSize: 12, bold: true, color: HDR_BG, margin: [0, 0, 0, 4] },
    ...seccion('Pasivo', data.pasivo, data.totalPasivo, '#9b2335'),
    ...seccion('Patrimonio', patrimonioItems, data.totalPatrimonio, '#5a4a9a'),
    { margin: [0, 8, 0, 0], table: { widths: ['*', 80], body: [[
      { text: 'TOTAL PASIVO Y PATRIMONIO', bold: true, fontSize: 10, color: '#fff', fillColor: HDR_BG, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 6, 5] },
      { text: `S/ ${fmt(data.totalPasivoPatrimonio)}`, bold: true, fontSize: 10, color: '#fff', fillColor: HDR_BG, alignment: 'right', border: [false, false, false, false], margin: [0, 5, 0, 5] },
    ]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0 } },
  ];

  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [42, headerHeight + 10, 42, 44],
    header: buildCabeceraEmpresa(empresa, 'ESTADO DE SITUACIÓN FINANCIERA', desde, hasta),
    footer: (page, pages) => ({
      columns: [
        { text: `${(empresa.razon_social || empresa.nombre_comercial || '').toUpperCase()} — Estado de Situación Financiera`, fontSize: 6, color: '#888', margin: [42, 0, 0, 0] },
        { text: `Página ${page} de ${pages}`, alignment: 'right', fontSize: 6, color: '#888', margin: [0, 0, 42, 0] },
      ], margin: [0, 8, 0, 0],
    }),
    content: [
      { columns: [{ width: '50%', stack: colIzq }, { width: '50%', stack: colDer, margin: [10, 0, 0, 0] }] },
      { margin: [0, 14, 0, 0], text: [
        { text: data.cuadre ? '✓ CUADRADO' : '✗ DESCUADRADO', bold: true, fontSize: 9, color: data.cuadre ? VERDE : ROJO },
        { text: `  |  Activo: S/ ${fmt(data.totalActivo)}  =  Pasivo + Patrimonio: S/ ${fmt(data.totalPasivoPatrimonio)}`, fontSize: 8, color: GRIS_TXT },
      ]},
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: NEGRO },
  };
}
// ═══════════════════════════════════════════════════════════════════════════════

// Separa "E001-211" → { serie:'E001', numero:'211' }. Si no hay guion, todo es número.
function separarComprobante(docNumero) {
  const s = String(docNumero || '').trim();
  if (!s) return { serie: '', numero: '' };
  const i = s.lastIndexOf('-');
  if (i === -1) return { serie: '', numero: s };
  return { serie: s.slice(0, i), numero: s.slice(i + 1) };
}

// Tipo de documento de identidad del cliente según longitud del código:
// 11 dígitos → 6 (RUC), 8 → 1 (DNI), otro → en blanco.
function tipoDocIdentidad(codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length === 11) return '6';
  if (c.length === 8)  return '1';
  return '';
}

// Mapa { codigo → tipo_documento } de clientes/proveedores (local + global).
// Sirve para resolver el "Doc" (tipo de documento de identidad) en el reporte.
function mapaEntidadesDocTipo() {
  const m = {};
  const cargar = (rows) => rows.forEach(r => { if (r.codigo) m[String(r.codigo)] = String(r.tipo_documento || ''); });
  try { cargar(reportesRepository.mapaEntidadesDocTipo_all_entidades(getGlobalDB())); } catch (_) {}
  try { cargar(reportesRepository.mapaEntidadesDocTipo_all_entidades_2(getDB())); } catch (_) {}
  return m;
}

// Mapa { codigo → descripción } de tipos de documento (FACTURA, BOLETA, etc.)
function mapaTiposDocumento() {
  try {
    const filas = reportesRepository.mapaTiposDocumento_all_tipos_documentos(getDB());
    const m = {};
    filas.forEach(f => { m[String(f.codigo)] = f.descripcion; });
    return m;
  } catch (_) { return {}; }
}

// Construye la data tributaria de Ventas agrupada por Tipo de Documento.
// Los comprobantes nuevos usan los importes explícitos guardados junto al voucher.
// Solo los vouchers históricos sin clasificación tributaria conservan el cálculo
// heredado desde las líneas contables y quedan marcados para revisión.
function _mapaTributarioVentas(voucherIds) {
  if (!voucherIds.length) return new Map();
  const db = getDB();
  const rows = reportesRepository._mapaTributarioVentas_all_comprobantes_tributarios(db, ...voucherIds);
  return new Map(rows.map(r => [Number(r.voucher_id), r]));
}

// Registro de Ventas: prioriza la información tributaria explícita almacenada
// con el comprobante. Solo vouchers históricos sin esa información usan el
// cálculo heredado desde el asiento y quedan marcados como "inferidos".
function queryRegistroVentas(desde, hasta, origenLibro) {
  const vouchers = agruparVouchers(queryLibroDiario(desde, hasta, origenLibro));
  const tiposDoc = mapaTiposDocumento();
  const entidadesDoc = mapaEntidadesDocTipo();
  const tributarios = _mapaTributarioVentas(vouchers.map(v => v.id));
  const grupos = new Map();
  let registrosInferidos = 0;
  let registrosRevision = 0;

  const nuevoTotal = () => ({
    valor_export: 0, valor_exportacion: 0, base_gravada: 0, descuento_base: 0,
    exonerada: 0, inafecta: 0, isc: 0, igv: 0, descuento_igv: 0, base_ivap: 0, ivap: 0,
    icbp: 0, icbper: 0, otros: 0, otros_tributos: 0, importe_total: 0,
  });

  vouchers.forEach(v => {
    const cab = v.detalles[0] || {};
    const tx = tributarios.get(Number(v.id));
    let fila;

    if (tx) {
      fila = {
        numero: v.numero,
        fecha_emision: tx.fecha_emision || cab.fecha_doc || v.fecha || '',
        fecha_venc: tx.fecha_vencimiento || '',
        td: tx.tipo_documento || cab.doc_tipo || '',
        serie: tx.serie || '',
        num_comprobante: tx.numero || '',
        cli_doc_tipo: tx.tipo_doc_identidad || tipoDocIdentidad(tx.numero_doc_identidad),
        cli_doc_num: tx.numero_doc_identidad || '',
        razon_social: tx.razon_social || '',
        valor_export: Number(tx.valor_exportacion) || 0, valor_exportacion: Number(tx.valor_exportacion) || 0,
        base_gravada: Number(tx.base_gravada) || 0, descuento_base: Number(tx.descuento_base) || 0,
        exonerada: Number(tx.importe_exonerado) || 0,
        inafecta: Number(tx.importe_inafecto) || 0,
        isc: Number(tx.isc) || 0,
        igv: Number(tx.igv) || 0, descuento_igv: Number(tx.descuento_igv) || 0,
        base_ivap: Number(tx.base_ivap) || 0, ivap: Number(tx.ivap) || 0,
        icbp: Number(tx.icbper) || 0, icbper: Number(tx.icbper) || 0,
        otros: Number(tx.otros_tributos) || 0, otros_tributos: Number(tx.otros_tributos) || 0,
        importe_total: Number(tx.importe_total) || 0,
        moneda: tx.moneda || 'PEN', tc: Number(tx.tipo_cambio) || 1,
        ref_fecha: tx.ref_fecha || '', ref_td: tx.ref_tipo_documento || '',
        ref_serie: tx.ref_serie || '', ref_num: tx.ref_numero || '',
        car_sunat: tx.car_sunat || '',
        tributario_explicito: true,
        tributario_fuente: tx.fuente || 'MANUAL',
        requiere_revision: Number(tx.requiere_revision) || 0,
      };
      if (fila.requiere_revision) registrosRevision++;
    } else {
      registrosInferidos++;
      const igv = v.detalles.reduce((sum, d) =>
        sum + (String(d.cuenta).startsWith('40') ? (Number(d.haber) || 0) + (Number(d.debe) || 0) : 0), 0);
      const total = Math.max(v.total_debe, v.total_haber);
      const base = +(total - igv).toFixed(2);
      const conIgv = igv > 0.005;
      const { serie, numero } = separarComprobante(cab.doc_numero);
      const docTipoEntidad = entidadesDoc[String(cab.codigo || '')] || '';
      fila = {
        numero: v.numero, fecha_emision: cab.fecha_doc || v.fecha || '', fecha_venc: cab.fecha_venc || '',
        td: cab.doc_tipo || '', serie, num_comprobante: numero,
        cli_doc_tipo: docTipoEntidad || tipoDocIdentidad(cab.codigo), cli_doc_num: cab.codigo || '',
        razon_social: cab.razon_social || '', valor_export: 0, valor_exportacion: 0,
        base_gravada: conIgv ? base : 0, descuento_base: 0,
        // Compatibilidad histórica: antes el sistema colocaba todo lo no gravado
        // como exonerado. Se conserva para no romper reportes anteriores, pero la
        // fila queda explícitamente marcada como inferida/requiere revisión.
        exonerada: conIgv ? 0 : base, inafecta: 0, isc: 0,
        igv: conIgv ? +igv.toFixed(2) : 0, descuento_igv: 0, base_ivap: 0, ivap: 0,
        icbp: 0, icbper: 0, otros: 0, otros_tributos: 0,
        importe_total: +total.toFixed(2), moneda: cab.moneda || 'PEN', tc: cab.tc || 1,
        ref_fecha:'', ref_td:'', ref_serie:'', ref_num:'', car_sunat:'',
        tributario_explicito: false, tributario_fuente: 'INFERIDO_HISTORICO', requiere_revision: 1,
      };
    }

    const key = fila.td || '00';
    if (!grupos.has(key)) grupos.set(key, { td:key, desc:tiposDoc[key] || '', filas:[], totales:nuevoTotal() });
    const g = grupos.get(key);
    g.filas.push(fila);
    ['valor_export','valor_exportacion','base_gravada','descuento_base','exonerada','inafecta','isc','igv','descuento_igv','base_ivap','ivap','icbp','icbper','otros','otros_tributos','importe_total']
      .forEach(k => { g.totales[k] += Number(fila[k]) || 0; });
  });

  const totalGeneral = nuevoTotal();
  const listaGrupos = [...grupos.values()].sort((a,b) => a.td.localeCompare(b.td));
  listaGrupos.forEach(g => Object.keys(totalGeneral).forEach(k => { totalGeneral[k] += g.totales[k]; }));
  return { grupos:listaGrupos, totalGeneral, registrosInferidos, registrosRevision };
}

// PDF horizontal del Registro de Ventas con detalle tributario explícito.
// Mantiene visibles los ajustes (descuentos), IVAP e ICBPER para no perder
// información al tratar notas de crédito u operaciones mixtas.
function construirPDFRegistroVentas(empresa, dataReg, desde, hasta, headerColor, titulo) {
  const HDR_BG = headerColor || '#2C3E50';
  const HDR_TX = textoContraste(HDR_BG);
  const FZ = 4.2;
  const SIN_BORDE = [false, false, false, false];
  const CON_BORDE = [true, true, true, true];
  const SOLO_TOP  = [false, true, false, false];

  const cs = (text, opts = {}) => ({
    text: text ?? '', fontSize: FZ, color: '#000',
    alignment: opts.align || 'left', bold: opts.bold || false,
    margin: [1, 2.5, 1, 2.5], border: SIN_BORDE, ...opts,
  });
  const hc = (text, opts = {}) => ({
    text, fontSize: 4.2, bold: true, color: HDR_TX, fillColor: HDR_BG,
    alignment: 'center', margin: [1, 5, 1, 5], border: CON_BORDE, ...opts,
  });
  const money = (n, bold = false) => cs(Math.abs(Number(n) || 0) > 0.00001 ? fmt(n) : '0.00', { align: 'right', bold });
  const E = () => ({});

  // 27 columnas: identificación + detalle tributario completo + referencia.
  const widths = [16,28,28,12,20,24,14,34,'*',26,28,24,26,24,25,25,18,24,20,26,24,27,18,24,12,18,24];
  const NCOL = widths.length;

  const headRow1 = [
    hc('N°\nVou.', { rowSpan: 3 }),
    hc('F.\nEmisión', { rowSpan: 3 }),
    hc('F.\nVenc.', { rowSpan: 3 }),
    hc('Comprobante de pago', { colSpan: 3 }), E(), E(),
    hc('Información del Cliente', { colSpan: 3 }), E(), E(),
    hc('Valor\nExport.', { rowSpan: 3 }),
    hc('Base\nGravada', { rowSpan: 3 }),
    hc('Dscto.\nBase', { rowSpan: 3 }),
    hc('IGV/IPM', { rowSpan: 3 }),
    hc('Dscto.\nIGV', { rowSpan: 3 }),
    hc('Exonerada', { rowSpan: 3 }),
    hc('Inafecta', { rowSpan: 3 }),
    hc('ISC', { rowSpan: 3 }),
    hc('Base\nIVAP', { rowSpan: 3 }),
    hc('IVAP', { rowSpan: 3 }),
    hc('ICBPER', { rowSpan: 3 }),
    hc('Otros\nTributos', { rowSpan: 3 }),
    hc('Importe\nTotal', { rowSpan: 3 }),
    hc('T/C', { rowSpan: 3 }),
    hc('Referencia del Comprobante', { colSpan: 4 }), E(), E(), E(),
  ];
  const headRow2 = [
    E(), E(), E(),
    hc('T/D', { rowSpan: 2 }), hc('Serie', { rowSpan: 2 }), hc('Número', { rowSpan: 2 }),
    hc('Doc. de Identidad', { colSpan: 2 }), E(), hc('Apellidos y\nNombres o\nRazón Social', { rowSpan: 2 }),
    E(), E(), E(), E(), E(), E(), E(), E(), E(), E(), E(), E(), E(), E(),
    hc('Fecha', { rowSpan: 2 }), hc('T/D', { rowSpan: 2 }), hc('Serie', { rowSpan: 2 }), hc('Número', { rowSpan: 2 }),
  ];
  const headRow3 = [
    E(), E(), E(), E(), E(), E(), hc('Doc'), hc('Número'),
    ...Array(NCOL - 8).fill(E()),
  ];

  const body = [headRow1, headRow2, headRow3];
  const filaTotales = (etq, t) => {
    const tc = (text, o = {}) => cs(text, { border: SOLO_TOP, ...o });
    const tm = (n) => tc(Math.abs(Number(n) || 0) > 0.00001 ? fmt(n) : '0.00', { align: 'right', bold: true });
    return [
      tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),
      tc(etq, { align:'right', bold:true, fontSize:5 }),
      tm(t.valor_export),tm(t.base_gravada),tm(t.descuento_base),tm(t.igv),tm(t.descuento_igv),
      tm(t.exonerada),tm(t.inafecta),tm(t.isc),tm(t.base_ivap),tm(t.ivap),tm(t.icbper),
      tm(t.otros_tributos),tm(t.importe_total),tc(''),tc(''),tc(''),tc(''),tc(''),
    ];
  };

  dataReg.grupos.forEach(g => {
    body.push([
      { text:`Tipo Doc.: ${g.td}      ${g.desc || ''}`, colSpan:NCOL, bold:true, fontSize:5.8, margin:[1,4,1,2], border:SIN_BORDE },
      ...Array(NCOL - 1).fill({}),
    ]);
    g.filas.forEach(f => {
      body.push([
        cs(String(f.numero), {align:'center'}), cs(fmtFecha(f.fecha_emision), {align:'center'}),
        cs(f.fecha_venc ? fmtFecha(f.fecha_venc) : '', {align:'center'}), cs(f.td, {align:'center'}),
        cs(f.serie, {align:'center'}), cs(f.num_comprobante, {align:'center'}), cs(f.cli_doc_tipo, {align:'center'}),
        cs(f.cli_doc_num, {align:'center'}), cs(f.razon_social),
        money(f.valor_export), money(f.base_gravada), money(f.descuento_base), money(f.igv), money(f.descuento_igv),
        money(f.exonerada), money(f.inafecta), money(f.isc), money(f.base_ivap), money(f.ivap), money(f.icbper),
        money(f.otros_tributos), money(f.importe_total),
        cs(f.tc ? Number(f.tc).toFixed(3) : '', {align:'center'}),
        cs(f.ref_fecha ? fmtFecha(f.ref_fecha) : '', {align:'center'}), cs(f.ref_td, {align:'center'}),
        cs(f.ref_serie, {align:'center'}), cs(f.ref_num, {align:'center'}),
      ]);
    });
    body.push(filaTotales('TOTALES:', g.totales));
  });

  const headerHeight = alturaCabecera(empresa);
  return {
    pageSize:'A4', pageOrientation:'landscape', pageMargins:[8, headerHeight + 10, 8, 26],
    header:buildCabeceraEmpresa(empresa, titulo, desde, hasta),
    footer:(page,pages) => ({ columns:[
      { text:`${(empresa.razon_social || empresa.nombre_comercial || '').toUpperCase()} — ${titulo}`, fontSize:6, color:'#888', margin:[8,0,0,0] },
      { text:`Página ${page} de ${pages}`, alignment:'right', fontSize:6, color:'#888', margin:[0,0,8,0] },
    ], margin:[0,8,0,0] }),
    content:[{ table:{ headerRows:3, widths, body }, layout:{ defaultBorder:false, paddingLeft:()=>1, paddingRight:()=>1, paddingTop:()=>0, paddingBottom:()=>0, hLineColor:()=>'#333', vLineColor:()=>'#333' } }],
    defaultStyle:{ fontSize:FZ },
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRO DE COMPRAS — FORMATO 8.1 (SUNAT)
// ═══════════════════════════════════════════════════════════════════════════════

// Construye la data tributaria de Compras agrupada por Tipo de Documento.
// Los comprobantes nuevos conservan G1/G2/G3 y los demás importes explícitos.
// Solo los vouchers históricos sin clasificación tributaria usan la inferencia
// heredada desde las cuentas contables y quedan marcados para revisión.
function _mapaTributarioCompras(voucherIds) {
  if (!voucherIds.length) return new Map();
  const db = getDB();
  const rows = reportesRepository._mapaTributarioCompras_all_comprobantes_tributarios(db, ...voucherIds);
  return new Map(rows.map(r => [Number(r.voucher_id), r]));
}

function queryRegistroCompras(desde, hasta) {
  const vouchers = agruparVouchers(queryLibroDiario(desde, hasta, '8'));
  const tiposDoc = mapaTiposDocumento();
  const entidadesDoc = mapaEntidadesDocTipo();
  const tributarios = _mapaTributarioCompras(vouchers.map(v => v.id));
  const grupos = new Map();
  let registrosInferidos = 0;
  let registrosRevision = 0;

  const CAMPOS = ['g1_base','g1_igv','g2_base','g2_igv','g3_base','g3_igv','valor_no_grav','isc','icbper','otros_tributos','otros','importe_total'];
  const nuevoTotal = () => CAMPOS.reduce((o,k) => (o[k]=0,o), {});

  vouchers.forEach(v => {
    const cab = v.detalles[0] || {};
    const tx = tributarios.get(Number(v.id));
    let fila;

    if (tx) {
      fila = {
        numero:v.numero, fecha_emision:tx.fecha_emision || cab.fecha_doc || v.fecha || '',
        fecha_venc:tx.fecha_vencimiento || '', td:tx.tipo_documento || cab.doc_tipo || '',
        serie:tx.serie || '', anio_dua:'', num_comprobante:tx.numero || '',
        prov_doc_tipo:tx.tipo_doc_identidad || tipoDocIdentidad(tx.numero_doc_identidad),
        prov_doc_num:tx.numero_doc_identidad || '', razon_social:tx.razon_social || '',
        g1_base:Number(tx.g1_base)||0, g1_igv:Number(tx.g1_igv)||0,
        g2_base:Number(tx.g2_base)||0, g2_igv:Number(tx.g2_igv)||0,
        g3_base:Number(tx.g3_base)||0, g3_igv:Number(tx.g3_igv)||0,
        valor_no_grav:Number(tx.valor_no_gravado)||0,
        isc:Number(tx.isc)||0, icbper:Number(tx.icbper)||0, otros_tributos:Number(tx.otros_tributos)||0,
        otros:(Number(tx.otros_tributos)||0) + (Number(tx.icbper)||0),
        importe_total:Number(tx.importe_total)||0,
        num_no_domic:'', detrac_num:tx.detraccion_numero||'', detrac_fecha:tx.detraccion_fecha||'', marca_retencion:tx.marca_retencion||'',
        moneda:tx.moneda||'PEN', tc:Number(tx.tipo_cambio)||1,
        ref_fecha:tx.ref_fecha||'', ref_td:tx.ref_tipo_documento||'', ref_serie:tx.ref_serie||'', ref_num:tx.ref_numero||'',
        car_sunat:tx.car_sunat||'', tributario_explicito:true, tributario_fuente:tx.fuente||'MANUAL',
        requiere_revision:Number(tx.requiere_revision)||0,
      };
      if (fila.requiere_revision) registrosRevision++;
    } else {
      registrosInferidos++;
      const igv = v.detalles.reduce((sum,d) =>
        sum + (String(d.cuenta).startsWith('40') ? (Number(d.haber)||0) + (Number(d.debe)||0) : 0), 0);
      const total = Math.max(v.total_debe,v.total_haber);
      const base = +(total-igv).toFixed(2);
      const conIgv = igv > 0.005;
      const { serie, numero } = separarComprobante(cab.doc_numero);
      const docTipoProv = entidadesDoc[String(cab.codigo || '')] || '';
      fila = {
        numero:v.numero, fecha_emision:cab.fecha_doc||v.fecha||'', fecha_venc:cab.fecha_venc||'',
        td:cab.doc_tipo||'', serie, anio_dua:'', num_comprobante:numero,
        prov_doc_tipo:docTipoProv || tipoDocIdentidad(cab.codigo), prov_doc_num:cab.codigo||'',
        razon_social:cab.razon_social||'', g1_base:conIgv?base:0, g1_igv:conIgv?+igv.toFixed(2):0,
        g2_base:0,g2_igv:0,g3_base:0,g3_igv:0,valor_no_grav:conIgv?0:base,
        isc:0,icbper:0,otros_tributos:0,otros:0,importe_total:+total.toFixed(2),num_no_domic:'',detrac_num:'',detrac_fecha:'',marca_retencion:'',
        moneda:cab.moneda||'PEN',tc:cab.tc||1,ref_fecha:'',ref_td:'',ref_serie:'',ref_num:'',car_sunat:'',
        tributario_explicito:false,tributario_fuente:'INFERIDO_HISTORICO',requiere_revision:1,
      };
    }

    const key=fila.td||'00';
    if(!grupos.has(key)) grupos.set(key,{td:key,desc:tiposDoc[key]||'',filas:[],totales:nuevoTotal()});
    const g=grupos.get(key); g.filas.push(fila); CAMPOS.forEach(k=>{g.totales[k]+=Number(fila[k])||0;});
  });

  const totalGeneral=nuevoTotal();
  const listaGrupos=[...grupos.values()].sort((a,b)=>a.td.localeCompare(b.td));
  listaGrupos.forEach(g=>CAMPOS.forEach(k=>{totalGeneral[k]+=g.totales[k];}));
  return { grupos:listaGrupos,totalGeneral,registrosInferidos,registrosRevision };
}

// PDF horizontal del Registro de Compras con G1/G2/G3 e ICBPER separados.
function construirPDFRegistroCompras(empresa, dataReg, desde, hasta, headerColor, titulo) {
  const HDR_BG = headerColor || '#2C3E50';
  const HDR_TX = textoContraste(HDR_BG);
  const FZ = 4.2;
  const SIN_BORDE = [false, false, false, false];
  const CON_BORDE = [true, true, true, true];
  const SOLO_TOP  = [false, true, false, false];
  const cs = (text, opts = {}) => ({ text:text ?? '', fontSize:FZ, color:'#000', alignment:opts.align || 'left', bold:opts.bold || false, margin:[1,2.5,1,2.5], border:SIN_BORDE, ...opts });
  const hc = (text, opts = {}) => ({ text, fontSize:4.2, bold:true, color:HDR_TX, fillColor:HDR_BG, alignment:'center', margin:[1,5,1,5], border:CON_BORDE, ...opts });
  const money = (n, bold = false) => cs(Math.abs(Number(n) || 0) > 0.00001 ? fmt(n) : '0.00', { align:'right', bold });
  const E = () => ({});

  // 29 columnas: el ICBPER se conserva independiente de otros tributos/cargos.
  const widths = [15,27,29,11,19,12,24,12,29,'*',24,18,22,18,22,18,23,17,21,22,26,18,21,21,18,21,11,18,22];
  const NCOL = widths.length;
  const headRow1 = [
    hc('N°\nCorrel.', {rowSpan:3}), hc('F.\nEmisión', {rowSpan:3}), hc('F. Venc.\no Pago', {rowSpan:3}),
    hc('Comprobante de Pago o Documento', {colSpan:3}),E(),E(), hc('N° del\nComprobante', {rowSpan:3}),
    hc('Información del Proveedor', {colSpan:3}),E(),E(), hc('Op. Gravadas', {colSpan:2}),E(),
    hc('Op. Gravadas y\nNo Gravadas', {colSpan:2}),E(), hc('Op. No Gravadas', {colSpan:2}),E(),
    hc('Valor Adq.\nNo Gravadas', {rowSpan:3}), hc('ISC', {rowSpan:3}), hc('ICBPER', {rowSpan:3}),
    hc('Otros\nTributos\ny Cargos', {rowSpan:3}), hc('Importe\nTotal', {rowSpan:3}), hc('N° Comp.\nSuj. No\nDomic.', {rowSpan:3}),
    hc('Const. Depósito\nDetracción', {colSpan:2}),E(), hc('T/C', {rowSpan:3}),
    hc('Referencia del Comprobante', {colSpan:4}),E(),E(),E(),
  ];
  const headRow2 = [
    E(),E(),E(), hc('Tipo\n(T.10)', {rowSpan:2}), hc('Serie /\nCód. Dep.', {rowSpan:2}), hc('Año\nDUA', {rowSpan:2}), E(),
    hc('Doc. de Identidad', {colSpan:2}),E(), hc('Apellidos y\nNombres o\nRazón Social', {rowSpan:2}),
    hc('Base\nImponible', {rowSpan:2}),hc('IGV', {rowSpan:2}),hc('Base\nImponible', {rowSpan:2}),hc('IGV', {rowSpan:2}),hc('Base\nImponible', {rowSpan:2}),hc('IGV', {rowSpan:2}),
    E(),E(),E(),E(),E(),E(), hc('Número', {rowSpan:2}),hc('Fecha', {rowSpan:2}),E(),
    hc('Fecha', {rowSpan:2}),hc('Tipo\n(T.10)', {rowSpan:2}),hc('Serie', {rowSpan:2}),hc('N° Comp.', {rowSpan:2}),
  ];
  const headRow3 = [E(),E(),E(),E(),E(),E(),E(),hc('Tipo\n(T.2)'),hc('Número'), ...Array(NCOL - 9).fill(E())];
  const body = [headRow1,headRow2,headRow3];

  const filaTotales = (etq,t) => {
    const tc = (text,o={}) => cs(text,{border:SOLO_TOP,...o});
    const tm = (n) => tc(Math.abs(Number(n)||0)>0.00001 ? fmt(n) : '0.00',{align:'right',bold:true});
    return [tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(etq,{align:'right',bold:true,fontSize:5}),
      tm(t.g1_base),tm(t.g1_igv),tm(t.g2_base),tm(t.g2_igv),tm(t.g3_base),tm(t.g3_igv),tm(t.valor_no_grav),tm(t.isc),tm(t.icbper),tm(t.otros_tributos),tm(t.importe_total),
      tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc(''),tc('')];
  };

  dataReg.grupos.forEach(g => {
    body.push([{text:`Tipo Doc.: ${g.td}      ${g.desc || ''}`,colSpan:NCOL,bold:true,fontSize:5.5,margin:[1,4,1,2],border:SIN_BORDE},...Array(NCOL-1).fill({})]);
    g.filas.forEach(f => body.push([
      cs(String(f.numero),{align:'center'}),cs(fmtFecha(f.fecha_emision),{align:'center'}),cs(f.fecha_venc ? fmtFecha(f.fecha_venc) : '',{align:'center'}),
      cs(f.td,{align:'center'}),cs(f.serie,{align:'center'}),cs(f.anio_dua,{align:'center'}),cs(f.num_comprobante,{align:'center'}),
      cs(f.prov_doc_tipo,{align:'center'}),cs(f.prov_doc_num,{align:'center'}),cs(f.razon_social),
      money(f.g1_base),money(f.g1_igv),money(f.g2_base),money(f.g2_igv),money(f.g3_base),money(f.g3_igv),money(f.valor_no_grav),money(f.isc),money(f.icbper),money(f.otros_tributos),money(f.importe_total),
      cs(f.num_no_domic,{align:'center'}),cs(f.detrac_num,{align:'center'}),cs(f.detrac_fecha ? fmtFecha(f.detrac_fecha) : '',{align:'center'}),
      cs(f.tc ? Number(f.tc).toFixed(3) : '',{align:'center'}),cs(f.ref_fecha ? fmtFecha(f.ref_fecha) : '',{align:'center'}),cs(f.ref_td,{align:'center'}),cs(f.ref_serie,{align:'center'}),cs(f.ref_num,{align:'center'}),
    ]));
    body.push(filaTotales('TOTALES:',g.totales));
  });

  const headerHeight = alturaCabecera(empresa);
  return {
    pageSize:'A4',pageOrientation:'landscape',pageMargins:[8,headerHeight+10,8,26],header:buildCabeceraEmpresa(empresa,titulo,desde,hasta),
    footer:(page,pages)=>({columns:[{text:`${(empresa.razon_social || empresa.nombre_comercial || '').toUpperCase()} — ${titulo}`,fontSize:6,color:'#888',margin:[8,0,0,0]},{text:`Página ${page} de ${pages}`,alignment:'right',fontSize:6,color:'#888',margin:[0,0,8,0]}],margin:[0,8,0,0]}),
    content:[{table:{headerRows:3,widths,body},layout:{defaultBorder:false,paddingLeft:()=>1,paddingRight:()=>1,paddingTop:()=>0,paddingBottom:()=>0,hLineColor:()=>'#333',vLineColor:()=>'#333'}}],defaultStyle:{fontSize:FZ},
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES EXPORTADAS — API unificada
// ═══════════════════════════════════════════════════════════════════════════════

function previsualizar(params) {
  try {
    const { tipo, desde, hasta, cuentaDesde, cuentaHasta, nivel } = params;
    if (!desde || !hasta) return { success: false, error: 'Indique fecha desde y hasta.' };
    if (desde > hasta)   return { success: false, error: 'La fecha desde no puede ser mayor que hasta.' };

    switch (tipo) {
      case 'registro-ventas': {
        const data = queryRegistroVentas(desde, hasta, '14');
        if (!data.grupos.length) return { success: false, error: 'No hay ventas registradas en ese período.' };
        const t = data.totalGeneral;
        const nFilas = data.grupos.reduce((s, g) => s + g.filas.length, 0);
        return { success: true, tipo, data, resumen: {
          asientos: nFilas, totalDebe: t.importe_total, totalHaber: t.igv, cuadre: true,
          baseGravada: t.base_gravada, igv: t.igv, importeTotal: t.importe_total,
          registrosInferidos: data.registrosInferidos || 0, registrosRevision: data.registrosRevision || 0,
        }};
      }
      case 'registro-compras': {
        const data = queryRegistroCompras(desde, hasta);
        if (!data.grupos.length) return { success: false, error: 'No hay compras registradas en ese período.' };
        const t = data.totalGeneral;
        const nFilas = data.grupos.reduce((s, g) => s + g.filas.length, 0);
        const baseTotal = t.g1_base + t.g2_base + t.g3_base;
        const igvTotal  = t.g1_igv + t.g2_igv + t.g3_igv;
        return { success: true, tipo, data, resumen: {
          asientos: nFilas, totalDebe: t.importe_total, totalHaber: igvTotal, cuadre: true,
          baseGravada: baseTotal, igv: igvTotal, importeTotal: t.importe_total,
          registrosInferidos: data.registrosInferidos || 0, registrosRevision: data.registrosRevision || 0,
        }};
      }
      case 'libro-diario': {
        // Formato 2.0 del Libro Diario: aún no implementado (placeholder)
        if (String(params.formatoDiario) === '2.0') {
          return { success: false, error: 'El Formato 2.0 del Libro Diario está en construcción.' };
        }
        const cfg = DIARIO_REPORTES[tipo];
        const filas = queryLibroDiario(desde, hasta, cfg.origen);  // diario → null (todos); compras → libro fijo
        if (!filas.length) return { success: false, error: 'No hay asientos en ese período.' };
        const vouchers = agruparVouchers(filas);
        let totD = 0, totH = 0;
        vouchers.forEach(v => { totD += v.total_debe; totH += v.total_haber; });
        return { success: true, tipo, data: vouchers, resumen: {
          asientos: vouchers.length, totalDebe: totD, totalHaber: totH,
          cuadre: Math.abs(totD - totH) < 0.01,
        }};
      }
      case 'libro-mayor': {
        const cuentas = queryLibroMayor(desde, hasta, cuentaDesde, cuentaHasta);
        if (!cuentas.length) return { success: false, error: 'No hay movimientos para las cuentas en ese período.' };
        let totD = 0, totH = 0;
        cuentas.forEach(c => { totD += c.total_debe; totH += c.total_haber; });
        return { success: true, tipo, data: cuentas, resumen: {
          cuentas: cuentas.length, movimientos: cuentas.reduce((s,c)=>s+c.movimientos.length,0),
          totalDebe: totD, totalHaber: totH,
        }};
      }
      case 'balance-comprobacion': {
        const cuentas = queryBalanceComprobacion(desde, hasta, nivel);
        if (!cuentas.length) return { success: false, error: 'No hay movimientos en ese período.' };
        let totD=0,totH=0,totDeudor=0,totAcreedor=0,totActivo=0,totPasivo=0,totNP=0,totNG=0,totFP=0,totFG=0;
        cuentas.forEach(c=>{totD+=c.sum_debe;totH+=c.sum_haber;totDeudor+=c.saldo_deudor;totAcreedor+=c.saldo_acreedor;
          totActivo+=(c.activo||0);totPasivo+=(c.pasivo||0);totNP+=(c.nat_perdida||0);totNG+=(c.nat_ganancia||0);totFP+=(c.fun_perdida||0);totFG+=(c.fun_ganancia||0);});
        return { success:true, tipo, data:cuentas, resumen:{
          cuentas:cuentas.length,totalDebe:totD,totalHaber:totH,
          totalDeudor:totDeudor,totalAcreedor:totAcreedor,
          totalActivo:totActivo,totalPasivo:totPasivo,
          totalNatPerdida:totNP,totalNatGanancia:totNG,totalFunPerdida:totFP,totalFunGanancia:totFG,
          ganancia:totNG-totNP,cuadre:Math.abs(totDeudor-totAcreedor)<0.01,
        }};
      }
      case 'estado-resultados': {
        const data = queryEstadoResultados(desde, hasta);
        if (!data.rubros_configurados)
          return { success: false, error: 'No hay notas configuradas para Estado de Resultados. Active cuentas ER en el Plan de Cuentas y cree sus notas en Config. ER.' };
        return { success:true, tipo, data, resumen:{
          totalIngresos:data.ingresos,totalGastos:data.gastos,
          resultado:data.resultado,
          rubrosConfigurados:data.rubros_configurados,
        }};
      }
      case 'situacion-financiera': {
        const data = queryEstadoSituacionFinanciera(desde, hasta);
        if (!data.activoCorriente.length && !data.activoNoCorriente.length && !data.pasivo.length && !data.patrimonio.length)
          return { success: false, error: 'No hay datos contables en ese período.' };
        return { success:true, tipo, data, resumen:{
          totalActivo:data.totalActivo,totalPasivo:data.totalPasivo,
          totalPatrimonio:data.totalPatrimonio,resultadoEjercicio:data.resultadoEjercicio,
          cuadre:data.cuadre,
        }};
      }
      case 'notas-eeff': {
        return { success: true, tipo, data: [], resumen: {} };
      }
      case 'notas-er': {
        const data = queryEstadoResultados(desde, hasta);
        const notas = (data.lineas || []).filter(l => l.tipo === 'nota' && l.nota_numero && (l.cuentas || []).length);
        return { success: true, tipo, data, resumen: { notas: notas.length } };
      }
      default:
        return { success: false, error: `Tipo de reporte desconocido: ${tipo}` };
    }
  } catch (err) {
    console.error('Reportes.previsualizar:', err);
    return { success: false, error: err.message };
  }
}

// ── Helper: obtener datos ESF basados en notas configuradas ──
function _getESFNotasData(db, desde, hasta) {
  try {
    const notas = reportesRepository._getESFNotasData_all_config_notas_eeff(db);
    if (!notas.length) return null;
    const balances = reportesRepository._getESFNotasData_all_voucher_detalles(db, desde, hasta);
    const balMap = new Map(balances.map(b => [String(b.cuenta || '').trim(), b]));
    const planMap = buildEffectivePlanMap();
    return notas.map(n => {
      const cuentasArr = JSON.parse(n.cuentas || '[]');
      let total = 0;
      const detalle = [];
      for (const codigo of cuentasArr) {
        let saldo = 0;
        for (const [key, bal] of balMap) {
          if (key.startsWith(codigo)) {
            const elem = key.charAt(0);
            if (['1','2','3'].includes(elem)) saldo += bal.saldo_deudor;
            else if (['4','5'].includes(elem)) saldo += bal.saldo_acreedor;
          }
        }
        total += saldo;
        const nombre = resolveEffectiveAccountName(codigo, { planMap, balanceMap: balMap });
        detalle.push({ codigo, nombre, saldo });
      }
      return { ...n, detalle, total };
    });
  } catch(_) { return null; }
}

function _construirPDFESFNotas(empresa, notas, desde, hasta, headerColor) {
  const cats = { ACTIVO_CORRIENTE:[], ACTIVO_NO_CORRIENTE:[], PASIVO_CORRIENTE:[], PASIVO_NO_CORRIENTE:[], PATRIMONIO:[] };
  const totCat = { ACTIVO_CORRIENTE:0, ACTIVO_NO_CORRIENTE:0, PASIVO_CORRIENTE:0, PASIVO_NO_CORRIENTE:0, PATRIMONIO:0 };
  notas.forEach(n => { if(cats[n.categoria]) { cats[n.categoria].push(n); totCat[n.categoria] += n.total; } });
  const tAC=totCat.ACTIVO_CORRIENTE, tANC=totCat.ACTIVO_NO_CORRIENTE;
  const tPC=totCat.PASIVO_CORRIENTE, tPNC=totCat.PASIVO_NO_CORRIENTE, tPat=totCat.PATRIMONIO;
  const tActivo=tAC+tANC, tPasivo=tPC+tPNC, tPP=tPasivo+tPat;
  const cuadra = Math.abs(tActivo-tPP)<0.01;
  const headerHeight = alturaCabecera(empresa);

  const secTitle = (t) => ({ text:t, bold:true, fontSize:10, margin:[0,10,0,4], decoration:'underline' });
  const notaRow = (n) => ({
    columns: [
      { text:n.nombre, fontSize:9, width:'*' },
      { text:n.numero, fontSize:8, color:AZUL_MED, width:50, alignment:'center' },
      { text:`S/ ${fmt(n.total)}`, fontSize:9, bold:true, width:80, alignment:'right' }
    ], margin:[10,2,0,2]
  });
  const totalLine = (label, val, big) => ({
    columns: [
      { text:label, bold:true, fontSize:big?10:9, width:'*', alignment:'right', margin:[0,0,10,0] },
      { text:`S/ ${fmt(val)}`, bold:true, fontSize:big?10:9, width:80, alignment:'right' }
    ],
    margin: big ? [0,6,0,4] : [0,4,0,2],
    ...(big ? { fillColor:'#1e3a56', color:'#fff', padding:[10,8,10,8] } : {})
  });
  const bigTotal = (label, val) => ({
    table: { widths:['*',80], body:[[
      { text:label, bold:true, fontSize:10, color:'#fff', alignment:'right', margin:[0,0,10,0], border:[false,false,false,false] },
      { text:`S/ ${fmt(val)}`, bold:true, fontSize:10, color:'#fff', alignment:'right', border:[false,false,false,false] }
    ]]},
    layout:{ hLineWidth:()=>0, vLineWidth:()=>0, fillColor:()=>'#1e3a56', paddingTop:()=>6, paddingBottom:()=>6, paddingLeft:()=>8, paddingRight:()=>8 },
    margin:[0,6,0,4]
  });

  const leftCol = [
    { text:'ACTIVO', bold:true, fontSize:12, margin:[0,0,0,6] },
    secTitle('Activo Corriente'),
    ...cats.ACTIVO_CORRIENTE.map(notaRow),
    totalLine('Total Activo Corriente', tAC),
    secTitle('Activo No Corriente'),
    ...cats.ACTIVO_NO_CORRIENTE.map(notaRow),
    totalLine('Total Activo No Corriente', tANC),
    bigTotal('TOTAL ACTIVO', tActivo),
  ];

  const rightCol = [
    { text:'PASIVO Y PATRIMONIO', bold:true, fontSize:12, margin:[0,0,0,6] },
    secTitle('Pasivo Corriente'),
    ...cats.PASIVO_CORRIENTE.map(notaRow),
    totalLine('Total Pasivo Corriente', tPC),
    secTitle('Pasivo No Corriente'),
    ...cats.PASIVO_NO_CORRIENTE.map(notaRow),
    totalLine('Total Pasivo No Corriente', tPNC),
    totalLine('TOTAL PASIVO', tPasivo),
    secTitle('Patrimonio'),
    ...cats.PATRIMONIO.map(notaRow),
    totalLine('Total Patrimonio', tPat),
    bigTotal('TOTAL PASIVO Y PATRIMONIO', tPP),
  ];

  return {
    pageSize:'A4', pageOrientation:'landscape', pageMargins:[42,headerHeight+10,42,44],
    header: buildCabeceraEmpresa(empresa,'ESTADO DE SITUACIÓN FINANCIERA',desde,hasta),
    footer:(page,pages)=>({columns:[
      {text:`${(empresa.razon_social||'').toUpperCase()} — Estado de Situación Financiera`,fontSize:6,color:'#888',margin:[42,0,0,0]},
      {text:`Página ${page} de ${pages}`,alignment:'right',fontSize:6,color:'#888',margin:[0,0,42,0]}
    ],margin:[0,8,0,0]}),
    content:[
      { columns:[ { stack:leftCol, width:'48%' }, { stack:rightCol, width:'48%' } ], columnGap:20 },
      { text: cuadra
        ? `✓ CUADRADO  |  Activo: S/ ${fmt(tActivo)}  =  Pasivo + Patrimonio: S/ ${fmt(tPP)}`
        : `✗ DESCUADRADO  |  Activo: S/ ${fmt(tActivo)}  ≠  Pasivo + Patrimonio: S/ ${fmt(tPP)}`,
        fontSize:8, bold:true, color:cuadra?VERDE:ROJO, margin:[0,14,0,0], alignment:'center' }
    ],
    defaultStyle:{font:'Roboto',fontSize:9,color:NEGRO}
  };
}

async function generarPDF(params) {
  try {
    const { tipo, desde, hasta, cuentaDesde, cuentaHasta, nivel } = params;
    if (!desde || !hasta) return { success: false, error: 'Indique período.' };
    if (desde > hasta)   return { success: false, error: 'Período inválido.' };

    const empresa = getEmpresa();
    const db = getDB();
    let docDef, label;

    switch (tipo) {
      case 'registro-ventas': {
        const data = queryRegistroVentas(desde, hasta, '14');
        if (!data.grupos.length) return { success: false, error: 'No hay ventas registradas en ese período.' };
        docDef = construirPDFRegistroVentas(empresa, data, desde, hasta, params.headerColor, 'REGISTRO DE VENTAS E INGRESOS');
        label = 'RegistroVentas'; break;
      }
      case 'registro-compras': {
        const data = queryRegistroCompras(desde, hasta);
        if (!data.grupos.length) return { success: false, error: 'No hay compras registradas en ese período.' };
        docDef = construirPDFRegistroCompras(empresa, data, desde, hasta, params.headerColor, 'REGISTRO DE COMPRAS');
        label = 'RegistroCompras'; break;
      }
      case 'libro-diario': {
        if (String(params.formatoDiario) === '2.0') {
          return { success: false, error: 'El Formato 2.0 del Libro Diario está en construcción.' };
        }
        const cfg = DIARIO_REPORTES['libro-diario'];
        const filas = queryLibroDiario(desde, hasta, cfg.origen);
        if (!filas.length) return { success: false, error: 'No hay asientos en ese período.' };
        docDef = construirPDFLibroDiario(empresa, agruparVouchers(filas), desde, hasta, params.headerColor, cfg.titulo);
        label = cfg.label; break;
      }
      case 'libro-mayor': {
        const cuentas = queryLibroMayor(desde, hasta, cuentaDesde, cuentaHasta);
        if (!cuentas.length) return { success: false, error: 'No hay movimientos.' };
        docDef = construirPDFLibroMayor(empresa, cuentas, desde, hasta, params.headerColor);
        label = 'LibroMayor'; break;
      }
      case 'balance-comprobacion': {
        const cuentas = queryBalanceComprobacion(desde, hasta, nivel);
        if (!cuentas.length) return { success: false, error: 'No hay movimientos.' };
        docDef = construirPDFBalance(empresa, cuentas, desde, hasta, params.headerColor);
        label = 'BalanceComprobacion'; break;
      }
      case 'estado-resultados': {
        const data = queryEstadoResultados(desde, hasta);
        if (!data.rubros_configurados) return { success: false, error: 'No hay notas configuradas para Estado de Resultados.' };
        docDef = construirPDFEstadoResultados(empresa, data, desde, hasta, params.headerColor);
        label = 'EstadoResultados'; break;
      }
      case 'situacion-financiera': {
        // Use notas configuration if available
        const notasData = _getESFNotasData(db, desde, hasta);
        if (notasData && notasData.length > 0) {
          docDef = _construirPDFESFNotas(empresa, notasData, desde, hasta, params.headerColor);
        } else {
          const data = queryEstadoSituacionFinanciera(desde, hasta);
          docDef = construirPDFSituacionFinanciera(empresa, data, desde, hasta, params.headerColor);
        }
        label = 'SituacionFinanciera'; break;
      }
      case 'notas-eeff': {
        const notasData = _getESFNotasData(db, desde, hasta);
        if (!notasData || !notasData.length) return { success: false, error: 'No hay notas configuradas.' };
        // Build PDF with notas detail - 2 columns
        const headerHeight = alturaCabecera(empresa);
        const catLabels = { ACTIVO_CORRIENTE:'Activo Corriente', ACTIVO_NO_CORRIENTE:'Activo No Corriente', PASIVO_CORRIENTE:'Pasivo Corriente', PASIVO_NO_CORRIENTE:'Pasivo No Corriente', PATRIMONIO:'Patrimonio' };
        const notaBlock = (n) => {
          const cuentasArr = JSON.parse(n.cuentas || '[]');
          const rows = [[
            { text:'Cuenta', bold:true, fontSize:7, color:'#fff', fillColor:AZUL_OSC, border:[false,false,false,false], margin:[4,4,2,4] },
            { text:'Denominación', bold:true, fontSize:7, color:'#fff', fillColor:AZUL_OSC, border:[false,false,false,false], margin:[2,4,2,4] },
            { text:'Saldo', bold:true, fontSize:7, color:'#fff', fillColor:AZUL_OSC, alignment:'right', border:[false,false,false,false], margin:[2,4,4,4] }
          ]];
          (n.detalle||[]).forEach((d,i) => {
            const bg = i%2===0?'#fff':GRIS_CLR;
            rows.push([
              { text:d.codigo, fontSize:7, bold:true, color:AZUL_MED, fillColor:bg, border:[false,false,false,false], margin:[4,2,2,2] },
              { text:d.nombre||'—', fontSize:7, fillColor:bg, border:[false,false,false,false], margin:[2,2,2,2] },
              { text:fmt(Math.abs(d.saldo||0)), fontSize:7, alignment:'right', fillColor:bg, border:[false,false,false,false], margin:[2,2,4,2] }
            ]);
          });
          rows.push([
            { text:'', border:[false,false,false,false] },
            { text:`Total ${n.nombre}`, bold:true, fontSize:7, alignment:'right', border:[false,true,false,false], borderColor:['','#c0ccd8','',''], margin:[2,4,2,4] },
            { text:`S/ ${fmt(Math.abs(n.total||0))}`, bold:true, fontSize:7, alignment:'right', border:[false,true,false,false], borderColor:['','#c0ccd8','',''], margin:[2,4,4,4] }
          ]);
          return {
            stack: [
              { text:[
                { text:`${n.numero}  `, bold:true, color:AZUL_MED, fontSize:8 },
                { text:n.nombre, bold:true, fontSize:8 },
                { text:`  (${catLabels[n.categoria]||''})`, fontSize:7, color:'#888' }
              ], margin:[0,0,0,4] },
              { text:`S/ ${fmt(Math.abs(n.total||0))}`, alignment:'right', bold:true, fontSize:8, color:AZUL_OSC, margin:[0,-14,0,4] },
              { table:{ headerRows:1, widths:[40,'*',60], body:rows }, layout:{ hLineWidth:()=>0, vLineWidth:()=>0, paddingLeft:()=>0, paddingRight:()=>0, paddingTop:()=>0, paddingBottom:()=>0 } }
            ],
            margin: [0,0,0,10]
          };
        };
        // 2 columns
        const left = [], right = [];
        notasData.forEach((n,i) => { (i%2===0?left:right).push(notaBlock(n)); });
        docDef = {
          pageSize:'A4', pageOrientation:'landscape', pageMargins:[30,headerHeight+10,30,44],
          header: buildCabeceraEmpresa(empresa,'NOTAS A LOS ESTADOS FINANCIEROS',desde,hasta),
          footer:(page,pages)=>({columns:[
            {text:`${(empresa.razon_social||'').toUpperCase()} — Notas EEFF`,fontSize:6,color:'#888',margin:[30,0,0,0]},
            {text:`Página ${page} de ${pages}`,alignment:'right',fontSize:6,color:'#888',margin:[0,0,30,0]}
          ],margin:[0,8,0,0]}),
          content:[{ columns:[{ stack:left, width:'48%' },{ stack:right, width:'48%' }], columnGap:20 }],
          defaultStyle:{font:'Roboto',fontSize:8,color:NEGRO}
        };
        label = 'NotasEEFF'; break;
      }
      case 'notas-er': {
        const erData = queryEstadoResultados(desde, hasta);
        const erN = (erData.lineas || []).filter(n => n.tipo === 'nota' && n.nota_numero && (n.cuentas || []).length);
        if (!erN.length) return { success:false, error:'No hay notas asignadas en Config. ER.' };
        const hH = alturaCabecera(empresa);
        const nB = (n) => ({stack:[
          {text:[{text:(n.numero||n.nota_numero)+'  ',bold:true,color:AZUL_MED,fontSize:8},{text:n.nombre||n.label||'',bold:true,fontSize:8}],margin:[0,0,0,4]},
          {text:_fmtER(n.importe),alignment:'right',bold:true,fontSize:8,color:AZUL_OSC,margin:[0,-14,0,4]},
          {table:{headerRows:1,widths:[48,'*',70],body:[
            [{text:'Cuenta',bold:true,fontSize:7,color:'#fff',fillColor:AZUL_OSC,border:[false,false,false,false],margin:[4,4,2,4]},{text:'Denominación',bold:true,fontSize:7,color:'#fff',fillColor:AZUL_OSC,border:[false,false,false,false],margin:[2,4,2,4]},{text:'Naturaleza',bold:true,fontSize:7,color:'#fff',fillColor:AZUL_OSC,alignment:'right',border:[false,false,false,false],margin:[2,4,4,4]}],
            ...(n.detalle||[]).map((d,i)=>[{text:d.cuenta,fontSize:7,bold:true,color:AZUL_MED,fillColor:i%2===0?'#fff':GRIS_CLR,border:[false,false,false,false],margin:[4,2,2,2]},{text:d.nombre||'Sin denominación',fontSize:7,fillColor:i%2===0?'#fff':GRIS_CLR,border:[false,false,false,false],margin:[2,2,2,2]},{text:_fmtER(d.importe),fontSize:7,alignment:'right',fillColor:i%2===0?'#fff':GRIS_CLR,border:[false,false,false,false],margin:[2,2,4,2]}]),
            [{text:'',border:[false,false,false,false]},{text:'Total '+n.label,bold:true,fontSize:7,alignment:'right',border:[false,true,false,false],borderColor:['','#c0ccd8','',''],margin:[2,4,2,4]},{text:_fmtER(n.importe),bold:true,fontSize:7,alignment:'right',border:[false,true,false,false],borderColor:['','#c0ccd8','',''],margin:[2,4,4,4]}]
          ]},layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}}
        ],margin:[0,0,0,10]});
        const l=[],r=[];erN.forEach((n,i)=>{(i%2===0?l:r).push(nB(n));});
        docDef={pageSize:'A4',pageOrientation:'landscape',pageMargins:[30,hH+10,30,44],header:buildCabeceraEmpresa(empresa,'NOTAS AL ESTADO DE RESULTADOS',desde,hasta),footer:(p,t)=>({columns:[{text:(empresa.razon_social||'').toUpperCase()+' — Notas ER',fontSize:6,color:'#888',margin:[30,0,0,0]},{text:'Página '+p+' de '+t,alignment:'right',fontSize:6,color:'#888',margin:[0,0,30,0]}],margin:[0,8,0,0]}),content:[{columns:[{stack:l,width:'48%'},{stack:r,width:'48%'}],columnGap:20}],defaultStyle:{font:'Roboto',fontSize:8,color:NEGRO}};
        label='NotasER'; break;
      }
      default:
        return { success: false, error: `Tipo desconocido: ${tipo}` };
    }

    const pm = initPdfMake();
    const buffer = await pm.createPdf(docDef).getBuffer();
    const ruc = empresa.ruc || 'SIN_RUC';
    const fileName = `${label}_${ruc}_${desde}_${hasta}.pdf`;
    const filePath = path.join(require('../../../server/context.cjs').current().tempDir, path.basename(fileName));
    fs.writeFileSync(filePath, Buffer.from(buffer));
    console.log(`Reportes: PDF ${label} → ${filePath} (${buffer.length} bytes)`);
    return { success: true, filePath, fileName };
  } catch (err) {
    console.error('Reportes.generarPDF:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Exporta a Excel. Libro Diario usa FORMATO 5.1 SUNAT con cabecera.
 */
function exportarExcel(params) {
  try {
    // Intentar xlsx-js-style (soporta bordes/colores), si no, xlsx estándar
    let xlsx;
    try { xlsx = require('xlsx-js-style'); } catch (_) { xlsx = require('xlsx'); }
    const { tipo, desde, hasta, cuentaDesde, cuentaHasta, nivel } = params;
    if (!desde || !hasta) return { success: false, error: 'Indique período.' };

    const empresa = getEmpresa();
    const db = getDB();
    let wb = xlsx.utils.book_new();
    let label;

    switch (tipo) {
      case 'registro-ventas': {
        const data = queryRegistroVentas(desde, hasta, '14');
        if (!data.grupos.length) return { success: false, error: 'Sin datos.' };
        const hdrHex = (params.headerColor || '#2C3E50').replace('#', '');
        const txHex  = textoContraste(hdrHex, false);
        const bThin  = { style: 'thin', color: { rgb: '000000' } };
        const bd     = { top: bThin, bottom: bThin, left: bThin, right: bThin };
        const sH = { font: { bold: true, color: { rgb: txHex }, sz: 8 }, fill: { fgColor: { rgb: hdrHex } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bd };
        const sC = (al = 'left', b = false) => ({ font: { sz: 8, bold: b }, alignment: { horizontal: al, vertical: 'center', wrapText: true }, border: bd });
        const sM = (b = false) => ({ ...sC('right', b), numFmt: '#,##0.00;[Red]-#,##0.00' });
        const sG = { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'EEF2F6' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: bd };

        const cols = ['N° Vou.','F. Emisión','F. Venc.','T/D','Serie','Número','Doc','N° Doc. Cliente','Apellidos y Nombres o Razón Social',
          'Valor Export.','Base Imp. Gravada','Dscto. Base','IGV/IPM','Dscto. IGV','Exonerada','Inafecta','I.S.C.','Base IVAP','IVAP','ICBPER','Otros Tributos','Importe Total','T/C',
          'Ref. Fecha','Ref. T/D','Ref. Serie','Ref. Número'];
        const aoa = [], st = [];
        aoa.push(['REGISTRO DE VENTAS E INGRESOS']); st.push([{ font: { bold: true, sz: 12 } }]);
        aoa.push([`PERÍODO: ${textoPeriodo(desde, hasta)}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([`RUC: ${empresa.ruc || '—'}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([`RAZÓN SOCIAL: ${(empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase()}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([]); st.push(null);
        const hdrRowIdx = aoa.length;
        aoa.push(cols); st.push(cols.map(() => sH));

        const filaTot = (etq, t) => {
          aoa.push(['','','','','','','','', etq,
            t.valor_export,t.base_gravada,t.descuento_base,t.igv,t.descuento_igv,t.exonerada,t.inafecta,t.isc,t.base_ivap,t.ivap,t.icbper,t.otros_tributos,t.importe_total,
            '','','','','']);
          const row = Array(cols.length).fill(sM(true)); row[8] = sC('right', true); for (let i=0;i<9;i++) row[i]=sC(i===8?'right':'center',true); for(let i=22;i<cols.length;i++) row[i]=sC('center',true); st.push(row);
        };

        data.grupos.forEach(g => {
          aoa.push([`Tipo Doc.: ${g.td}   ${g.desc || ''}`]); st.push([sG]);
          g.filas.forEach(f => {
            aoa.push([f.numero, fmtFecha(f.fecha_emision), f.fecha_venc ? fmtFecha(f.fecha_venc) : '', f.td, f.serie, f.num_comprobante, f.cli_doc_tipo, f.cli_doc_num, f.razon_social,
              f.valor_export,f.base_gravada,f.descuento_base,f.igv,f.descuento_igv,f.exonerada,f.inafecta,f.isc,f.base_ivap,f.ivap,f.icbper,f.otros_tributos,f.importe_total,
              f.tc ? Number(f.tc).toFixed(3) : '', f.ref_fecha ? fmtFecha(f.ref_fecha) : '', f.ref_td, f.ref_serie, f.ref_num]);
            st.push([sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('left'),
              ...Array(13).fill(null).map(()=>sM()), sC('center'),sC('center'),sC('center'),sC('center'),sC('center')]);
          });
          filaTot('TOTALES:', g.totales);
        });

        const ws = xlsx.utils.aoa_to_sheet(aoa);
        for (let r = 0; r < aoa.length; r++) {
          const styles = st[r]; if (!styles) continue;
          for (let c = 0; c < cols.length; c++) {
            const addr = xlsx.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { v: '', t: 's' };
            ws[addr].s = styles[c] || styles[0];
          }
        }
        ws['!merges'] = [0,1,2,3].map(r => ({ s:{r,c:0}, e:{r,c:cols.length-1} }));
        ws['!cols'] = cols.map((c,i) => ({ wch: i === 8 ? 34 : (i < 9 ? 10 : 13) }));
        ws['!rows'] = []; ws['!rows'][hdrRowIdx] = { hpt: 32 };
        xlsx.utils.book_append_sheet(wb, ws, 'Registro Ventas');
        label = 'RegistroVentas';
        break;
      }
      case 'registro-compras': {
        const data = queryRegistroCompras(desde, hasta);
        if (!data.grupos.length) return { success: false, error: 'Sin datos.' };
        const hdrHex = (params.headerColor || '#2C3E50').replace('#', '');
        const txHex  = textoContraste(hdrHex, false);
        const bThin  = { style: 'thin', color: { rgb: '000000' } };
        const bd     = { top: bThin, bottom: bThin, left: bThin, right: bThin };
        const sH = { font: { bold: true, color: { rgb: txHex }, sz: 8 }, fill: { fgColor: { rgb: hdrHex } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bd };
        const sC = (al = 'left', b = false) => ({ font: { sz: 8, bold: b }, alignment: { horizontal: al, vertical: 'center', wrapText: true }, border: bd });
        const sM = (b = false) => ({ ...sC('right', b), numFmt: '#,##0.00;[Red]-#,##0.00' });
        const sG = { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'EEF2F6' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: bd };

        const N = 29;
        const aoa = [], st = [];
        aoa.push(['REGISTRO DE COMPRAS']); st.push([{ font: { bold: true, sz: 12 } }]);
        aoa.push([`PERÍODO: ${textoPeriodo(desde, hasta)}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([`RUC: ${empresa.ruc || '—'}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([`RAZÓN SOCIAL: ${(empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase()}`]); st.push([{ font: { bold: true, sz: 10 } }]);
        aoa.push([]); st.push(null);

        const hr1 = aoa.length, hr2 = hr1 + 1, hr3 = hr1 + 2;
        const blank = () => new Array(N).fill('');
        const f1 = blank(), f2 = blank(), f3 = blank();
        const put = (row,c,v) => { row[c]=v; };
        put(f1,0,'N° Correl.');put(f1,1,'F. Emisión');put(f1,2,'F. Venc. o Pago');put(f1,3,'Comprobante de Pago o Documento');put(f1,6,'N° del Comprobante');put(f1,7,'Información del Proveedor');
        put(f1,10,'Op. Gravadas');put(f1,12,'Op. Gravadas y No Gravadas');put(f1,14,'Op. No Gravadas');put(f1,16,'Valor Adq. No Gravadas');put(f1,17,'I.S.C.');put(f1,18,'ICBPER');put(f1,19,'Otros Tributos y Cargos');put(f1,20,'Importe Total');put(f1,21,'N° Comp. Suj. No Domic.');put(f1,22,'Const. Depósito Detracción');put(f1,24,'T/C');put(f1,25,'Referencia del Comprobante');
        put(f2,3,'Tipo (T.10)');put(f2,4,'Serie / Cód. Dep. Aduanera');put(f2,5,'Año DUA');put(f2,7,'Doc. de Identidad');put(f2,9,'Apellidos y Nombres o Razón Social');
        put(f2,10,'Base Imponible');put(f2,11,'IGV');put(f2,12,'Base Imponible');put(f2,13,'IGV');put(f2,14,'Base Imponible');put(f2,15,'IGV');put(f2,22,'Número');put(f2,23,'Fecha');put(f2,25,'Fecha');put(f2,26,'Tipo (T.10)');put(f2,27,'Serie');put(f2,28,'N° Comp.');
        put(f3,7,'Tipo (T.2)');put(f3,8,'Número');
        aoa.push(f1);st.push(f1.map(()=>sH));aoa.push(f2);st.push(f2.map(()=>sH));aoa.push(f3);st.push(f3.map(()=>sH));

        const filaTot = (etq,t) => {
          const row=new Array(N).fill('');row[9]=etq;row[10]=t.g1_base;row[11]=t.g1_igv;row[12]=t.g2_base;row[13]=t.g2_igv;row[14]=t.g3_base;row[15]=t.g3_igv;row[16]=t.valor_no_grav;row[17]=t.isc;row[18]=t.icbper;row[19]=t.otros_tributos;row[20]=t.importe_total;aoa.push(row);
          const sr=Array(N).fill(sM(true));sr[9]=sC('right',true);for(let i=0;i<10;i++) sr[i]=sC('left',true);for(let i=21;i<N;i++) sr[i]=sC('center',true);st.push(sr);
        };
        data.grupos.forEach(g => {
          aoa.push([`Tipo Doc.: ${g.td}   ${g.desc || ''}`]);st.push([sG]);
          g.filas.forEach(f => {
            aoa.push([f.numero,fmtFecha(f.fecha_emision),f.fecha_venc?fmtFecha(f.fecha_venc):'',f.td,f.serie,f.anio_dua,f.num_comprobante,f.prov_doc_tipo,f.prov_doc_num,f.razon_social,
              f.g1_base,f.g1_igv,f.g2_base,f.g2_igv,f.g3_base,f.g3_igv,f.valor_no_grav,f.isc,f.icbper,f.otros_tributos,f.importe_total,f.num_no_domic,f.detrac_num,f.detrac_fecha?fmtFecha(f.detrac_fecha):'',f.tc?Number(f.tc).toFixed(3):'',f.ref_fecha?fmtFecha(f.ref_fecha):'',f.ref_td,f.ref_serie,f.ref_num]);
            st.push([sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('center'),sC('left'),...Array(11).fill(null).map(()=>sM()),...Array(8).fill(null).map(()=>sC('center'))]);
          });filaTot('TOTALES:',g.totales);
        });

        const ws=xlsx.utils.aoa_to_sheet(aoa);
        for(let r=0;r<aoa.length;r++){const styles=st[r];if(!styles)continue;for(let c=0;c<N;c++){const addr=xlsx.utils.encode_cell({r,c});if(!ws[addr])ws[addr]={v:'',t:'s'};ws[addr].s=styles[c]||styles[0];}}
        const merges=[0,1,2,3].map(r=>({s:{r,c:0},e:{r,c:N-1}}));
        [0,1,2,6,16,17,18,19,20,21,24].forEach(c=>merges.push({s:{r:hr1,c},e:{r:hr3,c}}));
        [[3,5],[7,9],[10,11],[12,13],[14,15],[22,23],[25,28]].forEach(([a,b])=>merges.push({s:{r:hr1,c:a},e:{r:hr1,c:b}}));
        [3,4,5,9,10,11,12,13,14,15,22,23,25,26,27,28].forEach(c=>merges.push({s:{r:hr2,c},e:{r:hr3,c}}));
        merges.push({s:{r:hr2,c:7},e:{r:hr2,c:8}});ws['!merges']=merges;
        ws['!cols']=Array.from({length:N},(_,i)=>({wch:i===9?30:(i<10?10:12)}));ws['!rows']=[];ws['!rows'][hr1]={hpt:34};ws['!rows'][hr2]={hpt:28};
        xlsx.utils.book_append_sheet(wb,ws,'Registro Compras');label='RegistroCompras';break;
      }
      case 'libro-diario': {
        if (String(params.formatoDiario) === '2.0') {
          return { success: false, error: 'El Formato 2.0 del Libro Diario está en construcción.' };
        }
        const cfg = DIARIO_REPORTES['libro-diario'];
        const filas = queryLibroDiario(desde, hasta, cfg.origen);
        if (!filas.length) return { success: false, error: 'Sin datos.' };
        const vouchers = agruparVouchers(filas);

        // Color de cabecera configurable
        const hdrHex = (params.headerColor || '#2C3E50').replace('#', '');

        // Estilos reutilizables
        const borderThin = { style: 'thin', color: { rgb: '000000' } };
        const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
        const hdrStyle = {
          font: { bold: true, color: { rgb: textoContraste(hdrHex, false) }, sz: 9 },
          fill: { fgColor: { rgb: hdrHex } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: borders,
        };
        const hdrStyleSub = { ...hdrStyle, font: { ...hdrStyle.font, sz: 8 } };
        const cellStyle = (opts = {}) => ({
          font: { sz: 9, bold: opts.bold || false },
          alignment: { horizontal: opts.align || 'left', vertical: 'center', wrapText: true },
          border: borders,
          numFmt: opts.numFmt || undefined,
        });
        const moneyStyle = (opts = {}) => ({
          ...cellStyle({ align: 'right', ...opts }),
          numFmt: '#,##0.00',
        });
        const titleStyle = {
          font: { bold: true, sz: 12 },
          alignment: { horizontal: 'left' },
        };
        const infoStyle = {
          font: { bold: true, sz: 10 },
          alignment: { horizontal: 'left' },
        };

        // Construir AOA con cabecera FORMATO 5.1
        const aoa = [];
        const rowStyles = []; // Mapa paralelo de estilos por fila

        // Fila 0: Título
        aoa.push([cfg.titulo,'','','','','','','','','']);
        rowStyles.push(Array(10).fill(titleStyle));
        // Fila 1: vacía
        aoa.push(['','','','','','','','','','']);
        rowStyles.push(null);
        // Fila 2: Período
        aoa.push([`PERÍODO: ${textoPeriodo(desde, hasta)}`,'','','','','','','','','']);
        rowStyles.push(Array(10).fill(infoStyle));
        // Fila 3: RUC
        aoa.push([`RUC: ${empresa.ruc || '—'}`,'','','','','','','','','']);
        rowStyles.push(Array(10).fill(infoStyle));
        // Fila 4: Razón social
        aoa.push([`APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL: ${(empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase()}`,'','','','','','','','','']);
        rowStyles.push(Array(10).fill(infoStyle));
        // Fila 5: Dirección (si existe)
        const xlsDireccion = empresa.direccion_fiscal || empresa.direccion || '';
        if (xlsDireccion) {
          aoa.push([`DIRECCIÓN: ${xlsDireccion}`,'','','','','','','','','']);
          rowStyles.push(Array(10).fill(infoStyle));
        }
        // Fila vacía
        aoa.push(['','','','','','','','','','']);
        rowStyles.push(null);

        // Filas de cabecera de la tabla (la posición depende de si hay dirección)
        const hdrRow1Idx = aoa.length; // para los merges

        // Fila 6: Cabecera 1 (agrupada)
        aoa.push([
          'N° CORRELATIVO',
          'FECHA DE OPERACIÓN',
          'GLOSA DE LA OPERACIÓN',
          'REFERENCIA DE LA OPERACIÓN', '', '',
          'CUENTA CONTABLE ASOCIADA A LA OPERACIÓN', '',
          'MOVIMIENTO', '',
        ]);
        rowStyles.push(Array(10).fill(hdrStyle));

        // Fila 7: Cabecera 2 (subcolumnas)
        aoa.push([
          '', '', '',
          'COD. DEL LIBRO',
          'N° CORRELATIVO',
          'N° DOCUMENTO',
          'CÓDIGO', 'DENOMINACIÓN',
          'DEBE', 'HABER',
        ]);
        rowStyles.push(Array(10).fill(hdrStyleSub));

        // Datos
        let granDebe = 0, granHaber = 0;
        vouchers.forEach((v, vIdx) => {
          granDebe += v.total_debe; granHaber += v.total_haber;
          // *** Sin ceros a la izquierda ***
          const numC = String(v.correlativo);
          const fechaOp = fmtFecha(v.detalles[0]?.fecha_doc || v.fecha || '');
          // *** Glosa del usuario (preferir la del detalle) ***
          const glosa = v.detalles[0]?.glosa || v.glosa || '';
          const codLib = v.origen;
          const numV = String(v.numero).padStart(4, '0');

          v.detalles.forEach((det, idx) => {
            const esPrimera = idx === 0;
            aoa.push([
              esPrimera ? numC : '',
              esPrimera ? fechaOp : '',
              esPrimera ? glosa : '',
              esPrimera ? codLib : '',
              esPrimera ? numV : '',
              det.doc_numero || '',
              det.cuenta,
              det.nombre,
              det.debe > 0 ? det.debe : '',
              det.haber > 0 ? det.haber : '',
            ]);
            rowStyles.push([
              cellStyle({ align: 'center', bold: esPrimera }),
              cellStyle({ align: 'center' }),
              cellStyle(),
              cellStyle({ align: 'center' }),
              cellStyle({ align: 'center' }),
              cellStyle({ align: 'center' }),
              cellStyle({ bold: true }),
              cellStyle(),
              moneyStyle(),
              moneyStyle(),
            ]);
          });

          // *** SIN "TOTALES DEL ASIENTO" ***
          // Fila en blanco CON bordes (separador visible entre asientos)
          if (vIdx < vouchers.length - 1) {
            aoa.push(['','','','','','','','','','']);
            rowStyles.push([
              cellStyle(), cellStyle(), cellStyle(), cellStyle(),
              cellStyle(), cellStyle(), cellStyle(), cellStyle(),
              cellStyle(), cellStyle(),
            ]);
          }
        });

        // Fila TOTALES GENERALES
        aoa.push(['', '', '', '', '', '', '', 'TOTALES:', granDebe, granHaber]);
        rowStyles.push([
          cellStyle(), cellStyle(), cellStyle(), cellStyle(),
          cellStyle(), cellStyle(), cellStyle(),
          cellStyle({ align: 'right', bold: true }),
          moneyStyle({ bold: true }),
          moneyStyle({ bold: true }),
        ]);

        const ws = xlsx.utils.aoa_to_sheet(aoa);

        // Aplicar estilos a cada celda (funciona con xlsx-js-style)
        for (let r = 0; r < aoa.length; r++) {
          const styles = rowStyles[r];
          if (!styles) continue;
          for (let c = 0; c < 10; c++) {
            const addr = xlsx.utils.encode_cell({ r, c });
            if (ws[addr]) {
              ws[addr].s = styles[c] || styles[0];
            } else {
              ws[addr] = { v: '', t: 's', s: styles[c] || styles[0] };
            }
          }
        }

        // Fusiones de celdas (posiciones dinámicas por si hay dirección)
        const hr1 = hdrRow1Idx;
        const hr2 = hdrRow1Idx + 1;
        ws['!merges'] = [
          { s:{r:0,c:0}, e:{r:0,c:9} },  // Título
          { s:{r:2,c:0}, e:{r:2,c:9} },  // Período
          { s:{r:3,c:0}, e:{r:3,c:9} },  // RUC
          { s:{r:4,c:0}, e:{r:4,c:9} },  // Razón social
          // Cabecera tabla: grupos
          { s:{r:hr1,c:3}, e:{r:hr1,c:5} },  // REFERENCIA
          { s:{r:hr1,c:6}, e:{r:hr1,c:7} },  // CUENTA CONTABLE
          { s:{r:hr1,c:8}, e:{r:hr1,c:9} },  // MOVIMIENTO
          // Cabecera tabla: rowSpan primeras 3 columnas
          { s:{r:hr1,c:0}, e:{r:hr2,c:0} },
          { s:{r:hr1,c:1}, e:{r:hr2,c:1} },
          { s:{r:hr1,c:2}, e:{r:hr2,c:2} },
        ];

        // Anchos de columna
        ws['!cols'] = [
          { wch: 12 }, // N° correlativo
          { wch: 14 }, // Fecha
          { wch: 40 }, // Glosa
          { wch: 12 }, // Cód libro
          { wch: 12 }, // N° correlativo voucher
          { wch: 12 }, // N° doc
          { wch: 12 }, // Cód cuenta
          { wch: 35 }, // Denominación
          { wch: 18 }, // Debe
          { wch: 18 }, // Haber
        ];

        // Altura de filas de cabecera
        ws['!rows'] = [];
        ws['!rows'][6] = { hpt: 30 };
        ws['!rows'][7] = { hpt: 40 };

        xlsx.utils.book_append_sheet(wb, ws, cfg.hoja);
        label = cfg.label;
        break;
      }
      case 'libro-mayor': {
        const cuentas = queryLibroMayor(desde, hasta, cuentaDesde, cuentaHasta);
        if (!cuentas.length) return { success: false, error: 'Sin datos.' };
        const hdrHex = (params.headerColor || '#2C3E50').replace('#', '');
        const txHex  = textoContraste(hdrHex, false);
        const bThin  = { style: 'thin', color: { rgb: '000000' } };
        const bd     = { top: bThin, bottom: bThin, left: bThin, right: bThin };
        const sH = { font: { bold: true, color: { rgb: txHex }, sz: 9 }, fill: { fgColor: { rgb: hdrHex } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bd };
        const sC = (al = 'left', b = false) => ({ font: { sz: 10, bold: b }, alignment: { horizontal: al, vertical: 'center', wrapText: true }, border: bd });
        const sM = (b = false) => ({ ...sC('right', b), numFmt: '#,##0.00' });
        const sLbl = { font: { bold: true, sz: 10, color: { rgb: '1560A0' } }, alignment: { horizontal: 'left', vertical: 'center' } };

        const N = 5;
        const aoa = [], st = [], merges = [];
        const push = (row, styleRow) => { aoa.push(row); st.push(styleRow); };
        const blank = () => new Array(N).fill('');

        push(['FORMATO 6.1: "LIBRO MAYOR"'], [{ font: { bold: true, sz: 12 } }]);
        push([`PERÍODO: ${textoPeriodo(desde, hasta)}`], [{ font: { bold: true, sz: 10 } }]);
        push([`RUC: ${empresa.ruc || '—'}`], [{ font: { bold: true, sz: 10 } }]);
        push([`APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL: ${(empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase()}`], [{ font: { bold: true, sz: 10 } }]);
        [0, 1, 2, 3].forEach(r => merges.push({ s: { r, c: 0 }, e: { r, c: N - 1 } }));
        push([], null); // separadora

        // Cabecera de columnas ÚNICA (2 niveles)
        const r1 = aoa.length, r2 = r1 + 1;
        const f1 = blank(); f1[0] = 'FECHA DE LA OPERACIÓN'; f1[1] = 'N° CORRELATIVO'; f1[2] = 'DESCRIPCIÓN O GLOSA'; f1[3] = 'SALDOS Y MOVIMIENTOS';
        const f2 = blank(); f2[3] = 'DEUDOR'; f2[4] = 'ACREEDOR';
        push(f1, f1.map(() => sH));
        push(f2, f2.map(() => sH));
        merges.push({ s: { r: r1, c: 0 }, e: { r: r2, c: 0 } });
        merges.push({ s: { r: r1, c: 1 }, e: { r: r2, c: 1 } });
        merges.push({ s: { r: r1, c: 2 }, e: { r: r2, c: 2 } });
        merges.push({ s: { r: r1, c: 3 }, e: { r: r1, c: 4 } });

        cuentas.forEach((c, idx) => {
          // Rótulo de la cuenta (una fila combinada a todo el ancho)
          const rLbl = aoa.length;
          push([`CÓDIGO Y/O DENOMINACIÓN DE LA CUENTA CONTABLE: ${c.cuenta} - ${c.nombre}`], [sLbl]);
          merges.push({ s: { r: rLbl, c: 0 }, e: { r: rLbl, c: N - 1 } });

          c.movimientos.forEach(m => {
            const ref = m.doc_numero ? `${m.doc_tipo} ${m.doc_numero}` : '';
            const glosa = (m.glosa || '') + (ref ? `  ·  ${ref}` : '');
            push(
              [fmtFecha(m.fecha), String(m.numero), glosa, m.debe || 0, m.haber || 0],
              [sC('center'), sC('center'), sC('left'), sM(), sM()]
            );
          });

          const rTot = aoa.length;
          push(['TOTALES', '', '', c.total_debe, c.total_haber],
            [sC('right', true), sC('right', true), sC('right', true), sM(true), sM(true)]);
          merges.push({ s: { r: rTot, c: 0 }, e: { r: rTot, c: 2 } });

          push([], null); // separadora entre cuentas
        });

        const ws = xlsx.utils.aoa_to_sheet(aoa);
        for (let r = 0; r < aoa.length; r++) {
          const styles = st[r]; if (!styles) continue;
          for (let c = 0; c < N; c++) {
            const addr = xlsx.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { v: '', t: 's' };
            ws[addr].s = styles[c] || styles[0];
          }
        }
        ws['!merges'] = merges;
        ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 48 }, { wch: 16 }, { wch: 16 }];
        xlsx.utils.book_append_sheet(wb, ws, 'Libro Mayor');
        label = 'LibroMayor'; break;
      }
      case 'balance-comprobacion': {
        const cuentas = queryBalanceComprobacion(desde, hasta, nivel);
        if (!cuentas.length) return { success: false, error: 'Sin datos.' };
        const hdrHex = (params.headerColor || '#2C3E50').replace('#', '');
        const txHex  = textoContraste(hdrHex, false);
        const bThin  = { style: 'thin', color: { rgb: '000000' } };
        const bd     = { top: bThin, bottom: bThin, left: bThin, right: bThin };
        const sH = { font: { bold: true, color: { rgb: txHex }, sz: 8 }, fill: { fgColor: { rgb: hdrHex } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bd };
        const sC = (al = 'left', b = false) => ({ font: { sz: 8, bold: b }, alignment: { horizontal: al, vertical: 'center' }, border: bd });
        const sM = (b = false) => ({ ...sC('right', b), numFmt: '#,##0.00' });
        const sSubt = { font: { bold: true, sz: 8 }, fill: { fgColor: { rgb: 'E8F0FA' } }, alignment: { horizontal: 'right' }, border: bd, numFmt: '#,##0.00' };
        const sGan = { font: { bold: true, sz: 8 }, fill: { fgColor: { rgb: 'FFF3CD' } }, alignment: { horizontal: 'right' }, border: bd, numFmt: '#,##0.00' };
        const sTot = { font: { bold: true, color: { rgb: txHex }, sz: 8 }, fill: { fgColor: { rgb: hdrHex } }, alignment: { horizontal: 'right' }, border: bd, numFmt: '#,##0.00' };
        const NC = 12;
        const aoa = [], stArr = [], merges = [];
        // Company header
        aoa.push(['BALANCE DE COMPROBACIÓN']); stArr.push([{ font: { bold: true, sz: 11 } }]);
        aoa.push([`PERÍODO: ${textoPeriodo(desde, hasta)}`]); stArr.push([{ font: { bold: true, sz: 9 } }]);
        aoa.push([`RUC: ${empresa.ruc || '—'}`]); stArr.push([{ font: { bold: true, sz: 9 } }]);
        aoa.push([`RAZÓN SOCIAL: ${(empresa.razon_social || empresa.nombre_comercial || '—').toUpperCase()}`]); stArr.push([{ font: { bold: true, sz: 9 } }]);
        if (empresa.direccion_fiscal) { aoa.push([`DIRECCIÓN: ${empresa.direccion_fiscal}`]); stArr.push([{ font: { sz: 8 } }]); }
        else { aoa.push([]); stArr.push(null); }
        [0,1,2,3,4].forEach(r => merges.push({ s:{r,c:0}, e:{r,c:NC-1} }));
        aoa.push([]); stArr.push(null);
        // Header row 1
        const hr1 = aoa.length;
        aoa.push(['Cuenta','Nombre','MOVIMIENTOS','','SALDOS','','CUENTAS','','NATURALEZA','','FUNCIÓN','']);
        stArr.push(new Array(NC).fill(sH));
        // Header row 2
        const hr2 = aoa.length;
        aoa.push(['','','Débito','Crédito','Deudor','Acreedor','Activo','Pasivo','Pérdida','Ganancia','Pérdida','Ganancia']);
        stArr.push(new Array(NC).fill(sH));
        merges.push({s:{r:hr1,c:0},e:{r:hr2,c:0}},{s:{r:hr1,c:1},e:{r:hr2,c:1}},
          {s:{r:hr1,c:2},e:{r:hr1,c:3}},{s:{r:hr1,c:4},e:{r:hr1,c:5}},
          {s:{r:hr1,c:6},e:{r:hr1,c:7}},{s:{r:hr1,c:8},e:{r:hr1,c:9}},{s:{r:hr1,c:10},e:{r:hr1,c:11}});
        // Data
        let tD=0,tH=0,tDr=0,tAc=0,tAct=0,tPas=0,tNP=0,tNG=0,tFP=0,tFG=0;
        cuentas.forEach(c => {
          tD+=c.sum_debe;tH+=c.sum_haber;tDr+=c.saldo_deudor;tAc+=c.saldo_acreedor;
          tAct+=(c.activo||0);tPas+=(c.pasivo||0);tNP+=(c.nat_perdida||0);tNG+=(c.nat_ganancia||0);tFP+=(c.fun_perdida||0);tFG+=(c.fun_ganancia||0);
          aoa.push([c.cuenta,c.nombre,c.sum_debe||0,c.sum_haber||0,c.saldo_deudor||0,c.saldo_acreedor||0,c.activo||0,c.pasivo||0,c.nat_perdida||0,c.nat_ganancia||0,c.fun_perdida||0,c.fun_ganancia||0]);
          stArr.push([sC('left',true),sC('left'),sM(),sM(),sM(),sM(),sM(),sM(),sM(),sM(),sM(),sM()]);
        });
        const gan = tNG - tNP;
        aoa.push(['','SUBTOTALES',tD,tH,tDr,tAc,tAct,tPas,tNP,tNG,tFP,tFG]);
        stArr.push(new Array(NC).fill(sSubt));
        aoa.push(['','','','','','GANANCIA O PÉRDIDA',tAct<tPas?tPas-tAct:0,tAct>tPas?tAct-tPas:0,tNG>tNP?tNG-tNP:0,tNP>tNG?tNP-tNG:0,tFG>tFP?tFG-tFP:0,tFP>tFG?tFP-tFG:0]);
        stArr.push(new Array(NC).fill(sGan));
        merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:5}});
        aoa.push(['','','','','TOTALES','',Math.max(tAct,tPas),Math.max(tAct,tPas),Math.max(tNP,tNG),Math.max(tNP,tNG),Math.max(tFP,tFG),Math.max(tFP,tFG)]);
        stArr.push(new Array(NC).fill(sTot));
        merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:4}});
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        const range = xlsx.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
          const styles = stArr[r]; if (!styles) continue;
          for (let cc = range.s.c; cc <= range.e.c; cc++) {
            const addr = xlsx.utils.encode_cell({r,c:cc});
            if (styles[cc]) { if(ws[addr]) ws[addr].s = styles[cc]; else ws[addr] = {v:'',t:'s',s:styles[cc]}; }
          }
        }
        ws['!merges'] = merges;
        ws['!cols'] = [{wch:10},{wch:35},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13}];
        ws['!rows'] = []; ws['!rows'][hr1] = {hpt:28}; ws['!rows'][hr2] = {hpt:22};
        xlsx.utils.book_append_sheet(wb, ws, 'Balance Comprobación');
        label = 'BalanceComprobacion'; break;
      }
      case 'estado-resultados': {
        const data = queryEstadoResultados(desde, hasta);
        const rows = (data.lineas || []).map(l => ({
          'Tipo': l.tipo === 'subtotal' ? 'SUBTOTAL' : 'NOTA',
          'Rubro': l.tipo === 'nota' ? (l.nombre || l.label || '') : l.label,
          'Nota': l.numero || l.nota_numero || '',
          'Cuentas': l.tipo === 'nota' ? (l.cuentas || []).join(', ') : '',
          'Importe': Number(l.importe || 0)
        }));
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Estado Resultados');
        label = 'EstadoResultados'; break;
      }
      case 'situacion-financiera': {
        const notasData = _getESFNotasData(db, desde, hasta);
        const rows = [];
        if (notasData && notasData.length > 0) {
          const cats = { ACTIVO_CORRIENTE:[], ACTIVO_NO_CORRIENTE:[], PASIVO_CORRIENTE:[], PASIVO_NO_CORRIENTE:[], PATRIMONIO:[] };
          const totCat = { ACTIVO_CORRIENTE:0, ACTIVO_NO_CORRIENTE:0, PASIVO_CORRIENTE:0, PASIVO_NO_CORRIENTE:0, PATRIMONIO:0 };
          notasData.forEach(n => { if(cats[n.categoria]) { cats[n.categoria].push(n); totCat[n.categoria]+=n.total; } });
          rows.push({'Sección':'ACTIVO','Nota':'','Nombre':'','Importe':''});
          rows.push({'Sección':'ACTIVO CORRIENTE','Nota':'','Nombre':'','Importe':''});
          cats.ACTIVO_CORRIENTE.forEach(n => rows.push({'Sección':'','Nota':n.numero,'Nombre':n.nombre,'Importe':n.total}));
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL ACTIVO CORRIENTE','Importe':totCat.ACTIVO_CORRIENTE});
          rows.push({'Sección':'ACTIVO NO CORRIENTE','Nota':'','Nombre':'','Importe':''});
          cats.ACTIVO_NO_CORRIENTE.forEach(n => rows.push({'Sección':'','Nota':n.numero,'Nombre':n.nombre,'Importe':n.total}));
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL ACTIVO NO CORRIENTE','Importe':totCat.ACTIVO_NO_CORRIENTE});
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL ACTIVO','Importe':totCat.ACTIVO_CORRIENTE+totCat.ACTIVO_NO_CORRIENTE});
          rows.push({'Sección':'','Nota':'','Nombre':'','Importe':''});
          rows.push({'Sección':'PASIVO Y PATRIMONIO','Nota':'','Nombre':'','Importe':''});
          rows.push({'Sección':'PASIVO CORRIENTE','Nota':'','Nombre':'','Importe':''});
          cats.PASIVO_CORRIENTE.forEach(n => rows.push({'Sección':'','Nota':n.numero,'Nombre':n.nombre,'Importe':n.total}));
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL PASIVO CORRIENTE','Importe':totCat.PASIVO_CORRIENTE});
          rows.push({'Sección':'PASIVO NO CORRIENTE','Nota':'','Nombre':'','Importe':''});
          cats.PASIVO_NO_CORRIENTE.forEach(n => rows.push({'Sección':'','Nota':n.numero,'Nombre':n.nombre,'Importe':n.total}));
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL PASIVO NO CORRIENTE','Importe':totCat.PASIVO_NO_CORRIENTE});
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL PASIVO','Importe':totCat.PASIVO_CORRIENTE+totCat.PASIVO_NO_CORRIENTE});
          rows.push({'Sección':'PATRIMONIO','Nota':'','Nombre':'','Importe':''});
          cats.PATRIMONIO.forEach(n => rows.push({'Sección':'','Nota':n.numero,'Nombre':n.nombre,'Importe':n.total}));
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL PATRIMONIO','Importe':totCat.PATRIMONIO});
          rows.push({'Sección':'','Nota':'','Nombre':'TOTAL PASIVO Y PATRIMONIO','Importe':totCat.PASIVO_CORRIENTE+totCat.PASIVO_NO_CORRIENTE+totCat.PATRIMONIO});
        } else {
          const data = queryEstadoSituacionFinanciera(desde, hasta);
          rows.push({'Sección':'ACTIVO CORRIENTE','Cuenta':'','Nombre':'','Importe':''});
          data.activoCorriente.forEach(r => rows.push({'Sección':'','Cuenta':r.cuenta,'Nombre':r.nombre,'Importe':r.importe}));
          rows.push({'Sección':'','Cuenta':'','Nombre':'Total Activo Corriente','Importe':data.totalActivoCorriente});
          rows.push({'Sección':'PASIVO','Cuenta':'','Nombre':'','Importe':''});
          data.pasivo.forEach(r => rows.push({'Sección':'','Cuenta':r.cuenta,'Nombre':r.nombre,'Importe':r.importe}));
          rows.push({'Sección':'','Cuenta':'','Nombre':'TOTAL ACTIVO','Importe':data.totalActivo});
        }
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Situación Financiera');
        label = 'SituacionFinanciera'; break;
      }
      case 'notas-eeff': {
        const notasData = _getESFNotasData(db, desde, hasta);
        const rows = [];
        if (notasData && notasData.length > 0) {
          notasData.forEach(n => {
            rows.push({'Nota':n.numero,'Nombre':n.nombre,'Categoría':n.categoria.replace(/_/g,' '),'Cuenta':'','Denominación':'','Saldo':'','Total':n.total});
            (n.detalle || []).forEach(d => rows.push({
              'Nota':'', 'Nombre':'', 'Categoría':'',
              'Cuenta':d.codigo, 'Denominación':d.nombre || 'Sin denominación',
              'Saldo':d.saldo, 'Total':''
            }));
          });
        }
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Notas EEFF');
        label = 'NotasEEFF'; break;
      }
      case 'notas-er': {
        const erData = queryEstadoResultados(desde, hasta);
        const erN = (erData.lineas || []).filter(n => n.tipo === 'nota' && n.nota_numero && (n.cuentas || []).length);
        const rows = [];
        erN.forEach(n => {
          rows.push({'Nota':n.nota_numero,'Rubro':n.label,'Cuenta':'','Denominación':'','Pérdida':'','Ganancia':'','Importe':n.importe});
          (n.detalle||[]).forEach(d => rows.push({'Nota':'','Rubro':'','Cuenta':d.cuenta,'Denominación':d.nombre||'Sin denominación','Pérdida':d.perdida,'Ganancia':d.ganancia,'Importe':d.importe}));
        });
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Notas ER');
        label = 'NotasER'; break;
      }
      default:
        return { success: false, error: 'Tipo desconocido.' };
    }

    const ruc = empresa.ruc || 'SIN_RUC';
    const fileName = `${label}_${ruc}_${desde}_${hasta}.xlsx`;
    const filePath = path.join(require('../../../server/context.cjs').current().tempDir, path.basename(fileName));
    xlsx.writeFile(wb, filePath);
    console.log(`Reportes: Excel ${label} → ${filePath}`);
    return { success: true, filePath, fileName };
  } catch (err) {
    console.error('Reportes.exportarExcel:', err);
    return { success: false, error: err.message };
  }
}

function resumenPeriodo(params) {
  try {
    const db = getDB();
    const { desde, hasta } = params;
    if (!desde || !hasta) return { success: false, error: 'Indique período.' };
    const stats = reportesRepository.resumenPeriodo_get_vouchers(db, desde, hasta);
    const origenes = reportesRepository.resumenPeriodo_all_vouchers(db, desde, hasta);
    return { success: true, asientos: stats.asientos, totalDebe: stats.totalDebe, totalHaber: stats.totalHaber,
      cuadre: Math.abs(stats.totalDebe - stats.totalHaber) < 0.01, origenes };
  } catch (err) { return { success: false, error: err.message }; }
}

module.exports = { previsualizar, generarPDF, exportarExcel, resumenPeriodo };
