const { getPeriodoTrabajo } = require('./empresaController');
const dashboardRepository = require('../repositories/dashboardRepository.js');
// src/main/controllers/dashboardController.js
// ═══════════════════════════════════════════════════════════════════════════════
// Controlador de estadísticas para el Dashboard Contable Profesional
// Acceso síncrono a los repositorios sobre el motor contable configurado.
//
// ARQUITECTURA DE DATOS:
//   - vouchers          → cabecera del asiento (origen, fecha, totales)
//   - voucher_detalles  → líneas del asiento (cuenta, debe, haber, entidad...)
//   - plan_cuentas      → catálogo (codigo, descripcion, tipo, nivel)
//   - entidades         → directorio (codigo, razon_social, tipo)
//
// PLAN DE CUENTAS PCGE (Perú):
//   Elemento 1 = Activo Corriente        (ctas 10-19)
//   Elemento 2 = Activo No Corriente     (ctas 20-39)
//   Elemento 3 = Patrimonio              (ctas 30-39)
//   Elemento 4 = Pasivo                  (ctas 40-49)
//   Elemento 5 = Patrimonio Neto         (ctas 50-59)
//   Elemento 6 = Gastos por Naturaleza   (ctas 60-69)
//   Elemento 7 = Ingresos                (ctas 70-79)
//   Elemento 9 = Costos de Prod.         (ctas 90-99)
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const { getDB } = require('../database/db');

// ── Helpers internos ───────────────────────────────────────────────────────────

/**
 * Genera array de strings 'YYYY-MM' para los últimos N meses
 * (incluye el mes actual).
 */
function _ultimos_n_meses(n, periodo) {
  const [anio,mes] = periodo.split('-').map(Number);
  const hoy = new Date(anio, mes-1, 1);
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

/**
 * Período anterior al recibido ('YYYY-MM' → 'YYYY-MM')
 */
function _mes_anterior(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // mes-2 porque meses JS son 0-based
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calcula variación porcentual de a→b.
 * Devuelve null si no hay base de comparación.
 */
function _variacion(anterior, actual) {
  if (!anterior || anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100 * 10) / 10;
}

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * Retorna todas las métricas necesarias para el dashboard en una sola llamada.
 */
function getDashboardData() {
  let db;
  try {
    db = getDB();
  } catch (_) {
    return { sinEmpresa: true };
  }

  const hoy          = new Date();
  const periodoActual = getPeriodoTrabajo().periodo;
  const [anio, mes] = periodoActual.split('-');
  const periodoAnt   = _mes_anterior(periodoActual);
  const ultimos12    = _ultimos_n_meses(12, periodoActual);
  const ultimos6     = ultimos12.slice(-6);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. KPI — Ingresos del mes (Elemento 7: cuentas que empiezan por 7)
  //    En PCGE: los ingresos van al Haber de cuentas 7x
  //    Calculamos la suma del Haber neto de esas cuentas en el período.
  // ─────────────────────────────────────────────────────────────────────────────
  const _ingresosDelMes = (periodo) =>
    dashboardRepository.getDashboardData_get_voucher_detalles(db, periodo)?.total ?? 0;

  const ingresosMes  = _ingresosDelMes(periodoActual);
  const ingresosAnt  = _ingresosDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. KPI — Egresos/Gastos del mes (Elemento 6: cuentas que empiezan por 6)
  //    En PCGE: los gastos van al Debe de cuentas 6x
  // ─────────────────────────────────────────────────────────────────────────────
  const _gastosDelMes = (periodo) =>
    dashboardRepository.getDashboardData_get_voucher_detalles_2(db, periodo)?.total ?? 0;

  const gastosMes  = _gastosDelMes(periodoActual);
  const gastosAnt  = _gastosDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. KPI — Cantidad de asientos del mes
  // ─────────────────────────────────────────────────────────────────────────────
  const _asientosMes = (periodo) =>
    dashboardRepository.getDashboardData_get_vouchers(db, periodo)?.n ?? 0;

  const vouchersMes = _asientosMes(periodoActual);
  const vouchersAnt = _asientosMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // KPI — Ventas del mes (importe total facturado, asientos origen '14')
  // ─────────────────────────────────────────────────────────────────────────────
  const _ventasDelMes = (periodo) =>
    dashboardRepository.getDashboardData_get_vouchers_2(db, periodo)?.total ?? 0;

  const ventasMes = _ventasDelMes(periodoActual);
  const ventasAnt = _ventasDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // KPI — IGV débito fiscal del mes (cuentas 40 en ventas, origen '14')
  //    En ventas el IGV se abona (Haber) → haber - debe es positivo.
  // ─────────────────────────────────────────────────────────────────────────────
  const _igvVentasMes = (periodo) =>
    dashboardRepository.getDashboardData_get_voucher_detalles_3(db, periodo)?.total ?? 0;

  const igvMes = _igvVentasMes(periodoActual);
  const igvAnt = _igvVentasMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. KPI — Cuentas por Cobrar (saldo deudor cuentas 12x, 16x)
  //    Saldo acumulado histórico (no solo del mes), neto Debe-Haber
  // ─────────────────────────────────────────────────────────────────────────────
  const cxCobrar = dashboardRepository.getDashboardData_get_voucher_detalles_4(db)?.saldo ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. KPI — Cuentas por Pagar (saldo acreedor cuentas 42x, 46x)
  //    Saldo acumulado histórico, neto Haber-Debe
  // ─────────────────────────────────────────────────────────────────────────────
  const cxPagar = dashboardRepository.getDashboardData_get_voucher_detalles_5(db)?.saldo ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. KPI — Resultado del período = Ingresos - Gastos
  // ─────────────────────────────────────────────────────────────────────────────
  const resultadoMes  = ingresosMes - gastosMes;
  const resultadoAnt  = ingresosAnt - gastosAnt;

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. KPI — Total de asientos histórico y total de cuentas
  // ─────────────────────────────────────────────────────────────────────────────
  const totalVouchers  = dashboardRepository.getDashboardData_get_vouchers_3(db)?.n ?? 0;
  const totalCuentas   = dashboardRepository.getDashboardData_get_plan_cuentas(db)?.n ?? 0;
  const totalEntidades = dashboardRepository.getDashboardData_get_entidades(db)?.n ?? 0;

  // Debes y Haberes del mes (para badge de cuadre)
  const sumasMes = dashboardRepository.getDashboardData_get_vouchers_4(db, periodoActual) ?? { debe: 0, haber: 0 };

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. EVOLUCIÓN MENSUAL (12 meses): Ingresos, Gastos, Resultado
  //    Consulta optimizada: un solo JOIN para los 12 meses
  // ─────────────────────────────────────────────────────────────────────────────
  const primerMes = ultimos12[0];
  const ultimoMes = ultimos12[ultimos12.length - 1];

  const evolucionRaw = dashboardRepository.getDashboardData_all_vouchers(db, primerMes, ultimoMes);

  // Rellenar meses sin datos con ceros
  const evolucionMap = {};
  evolucionRaw.forEach(r => { evolucionMap[r.periodo] = r; });

  const evolucion = ultimos12.map(periodo => {
    const r = evolucionMap[periodo];
    const ingresos = r?.ingresos ?? 0;
    const gastos   = r?.gastos   ?? 0;
    return {
      periodo,
      ingresos: Math.max(0, ingresos),
      gastos:   Math.max(0, gastos),
      resultado: ingresos - gastos,
      asientos: r?.asientos ?? 0,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8.b VENTAS vs COMPRAS por mes (12 meses): origen '14' vs origen '8'
  // ─────────────────────────────────────────────────────────────────────────────
  const ventasComprasRaw = dashboardRepository.getDashboardData_all_vouchers_2(db, primerMes, ultimoMes);
  const vcMap = {};
  ventasComprasRaw.forEach(r => {
    if (!vcMap[r.periodo]) vcMap[r.periodo] = { ventas: 0, compras: 0 };
    if (r.origen === '14') vcMap[r.periodo].ventas = r.total;
    else if (r.origen === '8') vcMap[r.periodo].compras = r.total;
  });
  const ventasVsCompras = ultimos12.map(periodo => ({
    periodo,
    ventas:  vcMap[periodo]?.ventas  ?? 0,
    compras: vcMap[periodo]?.compras ?? 0,
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // 8.c IGV mensual (12 meses): Débito (ventas) vs Crédito (compras) → Neto
  //    Débito  = cuenta 40 en origen '14' (haber - debe)
  //    Crédito = cuenta 40 en origen '8'  (debe - haber)
  // ─────────────────────────────────────────────────────────────────────────────
  const igvRaw = dashboardRepository.getDashboardData_all_voucher_detalles(db, primerMes, ultimoMes);
  const igvMap = {};
  igvRaw.forEach(r => {
    if (!igvMap[r.periodo]) igvMap[r.periodo] = { debito: 0, credito: 0 };
    if (r.origen === '14') igvMap[r.periodo].debito = r.neto40;        // ventas: haber-debe (+)
    else if (r.origen === '8') igvMap[r.periodo].credito = -r.neto40;  // compras: debe-haber (+)
  });
  const igvMensual = ultimos12.map(periodo => {
    const d = igvMap[periodo]?.debito  ?? 0;
    const c = igvMap[periodo]?.credito ?? 0;
    return { periodo, debito: Math.max(0, d), credito: Math.max(0, c), neto: d - c };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8.d TOP CLIENTES (origen '14') y TOP PROVEEDORES (origen '8')
  //    Agrupa el importe total de cada asiento por la entidad de su cabecera.
  // ─────────────────────────────────────────────────────────────────────────────
  const _topEntidades = (origen) => dashboardRepository.getDashboardData_all_voucher_detalles_2(db, origen);
  const topClientes    = _topEntidades('14');
  const topProveedores = _topEntidades('8');

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. ESTRUCTURA DE GASTOS DEL MES (Elemento 6 desglosado por subcuenta)
  //    Agrupa por los 2 primeros dígitos de cuenta (cuenta de 2 dígitos = rubro)
  // ─────────────────────────────────────────────────────────────────────────────
  const gastosPorRubroRaw = dashboardRepository.getDashboardData_all_voucher_detalles_3(db, periodoActual);

  // Enriquecer con nombres del plan de cuentas
  const totalGastos = gastosPorRubroRaw.reduce((s, r) => s + r.importe, 0) || 1;
  const gastosPorRubro = gastosPorRubroRaw.map(r => {
    const cuenta = dashboardRepository.getDashboardData_get_plan_cuentas_2(db, r.rubro);
    return {
      rubro:       r.rubro,
      descripcion: cuenta?.descripcion ?? `Cuenta ${r.rubro}`,
      importe:     r.importe,
      pct:         Math.round((r.importe / totalGastos) * 1000) / 10,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. TOP 5 CUENTAS — Mayor movimiento Debe y Haber en el período
  // ─────────────────────────────────────────────────────────────────────────────
  const topCuentasDebe = dashboardRepository.getDashboardData_all_voucher_detalles_4(db, periodoActual);

  const topCuentasHaber = dashboardRepository.getDashboardData_all_voucher_detalles_5(db, periodoActual);

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. MAPA DE CALOR — Asientos por día del mes actual
  // ─────────────────────────────────────────────────────────────────────────────
  const heatmapRaw = dashboardRepository.getDashboardData_all_vouchers_3(db, periodoActual);

  // Generar estructura completa del mes con todos los días
  const diasEnMes = new Date(anio, parseInt(mes, 10), 0).getDate();
  const heatmapMap = {};
  heatmapRaw.forEach(r => { heatmapMap[r.fecha] = r.cantidad; });

  const heatmap = [];
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${mes}-${String(d).padStart(2, '0')}`;
    const diaSemana = new Date(anio, parseInt(mes, 10) - 1, d).getDay(); // 0=Dom
    heatmap.push({
      fecha,
      dia:       d,
      diaSemana, // 0=Dom, 1=Lun, ..., 6=Sáb
      cantidad:  heatmapMap[fecha] ?? 0,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. ALERTAS CONTABLES
  // ─────────────────────────────────────────────────────────────────────────────
  const alertas = [];

  // A) Períodos descuadrados (últimos 12 meses)
  const periodosDescuadrados = dashboardRepository.getDashboardData_all_vouchers_4(db, primerMes, ultimoMes);

  if (periodosDescuadrados.length > 0) {
    alertas.push({
      tipo:  'error',
      icono: 'fa-triangle-exclamation',
      titulo: `${periodosDescuadrados.length} período(s) descuadrado(s)`,
      detalle: periodosDescuadrados.map(p => p.periodo).join(', '),
    });
  }

  // B) Vouchers sin glosa registrada en el mes actual
  const vouchersSinGlosa = dashboardRepository.getDashboardData_get_vouchers_5(db, periodoActual)?.n ?? 0;

  if (vouchersSinGlosa > 0) {
    alertas.push({
      tipo:   'warning',
      icono:  'fa-pen-to-square',
      titulo: `${vouchersSinGlosa} asiento(s) sin glosa`,
      detalle: 'Asientos del período sin descripción registrada.',
    });
  }

  // C) Líneas con fecha de vencimiento pasada (CxC y CxP vencidas)
  //    Ahora devuelve el detalle de cada documento para mostrar en el dashboard.
  const hoyStr  = hoy.toISOString().slice(0, 10);
  const vencidasDetalle = dashboardRepository.getDashboardData_all_voucher_detalles_6(db, hoyStr);

  if (vencidasDetalle.length > 0) {
    const cxcItems = vencidasDetalle.filter(d => d.tipo_cxc === 'CXC');
    const cxpItems = vencidasDetalle.filter(d => d.tipo_cxc === 'CXP');
    const sumCxC = cxcItems.reduce((s, d) => s + (d.debe || 0), 0);
    const sumCxP = cxpItems.reduce((s, d) => s + (d.haber || 0), 0);
    alertas.push({
      tipo:   'warning',
      icono:  'fa-calendar-xmark',
      titulo: `${vencidasDetalle.length} documento(s) con vencimiento pasado`,
      detalle: `CxC: ${cxcItems.length} doc. (S/ ${sumCxC.toLocaleString('es-PE',{minimumFractionDigits:2})}) · CxP: ${cxpItems.length} doc. (S/ ${sumCxP.toLocaleString('es-PE',{minimumFractionDigits:2})})`,
      documentos: vencidasDetalle.map(d => ({
        tipo_cxc:    d.tipo_cxc,
        doc_tipo:    d.doc_tipo || '',
        doc_numero:  d.doc_numero || '—',
        fecha_venc:  d.fecha_venc,
        codigo:      d.codigo || '',
        razon_social: d.razon_social || '—',
        monto:       d.tipo_cxc === 'CXC' ? (d.debe || 0) : (d.haber || 0),
        voucher_id:  d.voucher_id,
      })),
    });
  }

  // D) Cuentas 7x sin movimiento este mes (si hay asientos del mes)
  if (vouchersMes > 0) {
    const tieneIngresos = dashboardRepository.getDashboardData_get_voucher_detalles_6(db, periodoActual)?.n ?? 0;

    if (tieneIngresos === 0) {
      alertas.push({
        tipo:  'info',
        icono: 'fa-circle-info',
        titulo: 'Sin ingresos (cuentas 7x) registrados este mes',
        detalle: 'No hay asientos en cuentas de ingresos para el período actual.',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. ASIENTOS POR ORIGEN (para donut - últimos 6 meses + mes actual)
  // ─────────────────────────────────────────────────────────────────────────────
  const porOrigen = dashboardRepository.getDashboardData_all_vouchers_5(db, periodoActual);

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. DISTRIBUCIÓN DE ENTIDADES
  // ─────────────────────────────────────────────────────────────────────────────
  const distribEntidades = dashboardRepository.getDashboardData_all_entidades(db);

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. ACTIVIDAD DIARIA (últimos 30 días) — para sparkline
  // ─────────────────────────────────────────────────────────────────────────────
  const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const actividadDiaria = dashboardRepository.getDashboardData_all_vouchers_6(db, hace30);

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. DATOS DE EMPRESA + TIPO DE CAMBIO DEL DÍA
  // ─────────────────────────────────────────────────────────────────────────────
  let empresa = {};
  try { empresa = dashboardRepository.getDashboardData_get_config_empresa(db) || {}; } catch(_) {}

  let tcHoy = null;
  try {
    const { getGlobalDB } = require('../database/db');
    const gdb = getGlobalDB();
    tcHoy = dashboardRepository.getDashboardData_get_monedas(gdb) || null;
  } catch(_) {}

  // Estado SIRE
  let sireEstado = 'NO_CONFIGURADO';
  try { sireEstado = dashboardRepository.getDashboardData_get_sire_config(db)?.estado_conexion || 'NO_CONFIGURADO'; } catch(_) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // RETORNO CONSOLIDADO
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    sinEmpresa: false,
    periodoActual,
    periodoAnt,
    empresa,
    tcHoy,
    sireEstado,

    kpi: {
      // Valores actuales
      ingresosMes,
      gastosMes,
      resultadoMes,
      vouchersMes,
      ventasMes,
      igvMes,
      cxCobrar:    Math.max(0, cxCobrar),
      cxPagar:     Math.max(0, cxPagar),
      totalVouchers,
      totalCuentas,
      totalEntidades,
      debesMes:    sumasMes.debe,
      haberesMes:  sumasMes.haber,

      // Variaciones vs mes anterior (null = sin dato base)
      varIngresos:  _variacion(ingresosAnt,  ingresosMes),
      varGastos:    _variacion(gastosAnt,    gastosMes),
      varResultado: _variacion(resultadoAnt, resultadoMes),
      varVouchers:  _variacion(vouchersAnt,  vouchersMes),
      varVentas:    _variacion(ventasAnt,    ventasMes),
      varIgv:       _variacion(igvAnt,       igvMes),
    },

    evolucion,          // 12 meses: { periodo, ingresos, gastos, resultado, asientos }
    ventasVsCompras,    // 12 meses: { periodo, ventas, compras }
    igvMensual,         // 12 meses: { periodo, debito, credito, neto }
    topClientes,        // Top 6 clientes por ventas (origen 14)
    topProveedores,     // Top 6 proveedores por compras (origen 8)
    gastosPorRubro,     // Top rubros gastos del mes
    topCuentasDebe,     // Top 5 cuentas por Debe
    topCuentasHaber,    // Top 5 cuentas por Haber
    heatmap,            // Días del mes con cantidad de asientos
    alertas,            // Panel de atención contable
    porOrigen,          // Distribución por origen (donut)
    distribEntidades,   // Distribución entidades
    actividadDiaria,    // Sparkline 30 días
  };
}

module.exports = { getDashboardData };
