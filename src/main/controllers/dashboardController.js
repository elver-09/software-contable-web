// src/main/controllers/dashboardController.js
// ═══════════════════════════════════════════════════════════════════════════════
// Controlador de estadísticas para el Dashboard Contable Profesional
// Todas las consultas son síncronas (better-sqlite3).
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
function _ultimos_n_meses(n) {
  const hoy = new Date();
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
  const anio         = hoy.getFullYear();
  const mes          = String(hoy.getMonth() + 1).padStart(2, '0');
  const periodoActual = `${anio}-${mes}`;
  const periodoAnt   = _mes_anterior(periodoActual);
  const ultimos12    = _ultimos_n_meses(12);
  const ultimos6     = ultimos12.slice(-6);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. KPI — Ingresos del mes (Elemento 7: cuentas que empiezan por 7)
  //    En PCGE: los ingresos van al Haber de cuentas 7x
  //    Calculamos la suma del Haber neto de esas cuentas en el período.
  // ─────────────────────────────────────────────────────────────────────────────
  const _ingresosDelMes = (periodo) =>
    db.prepare(`
      SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ?
        AND substr(vd.cuenta, 1, 1) = '7'
    `).get(periodo)?.total ?? 0;

  const ingresosMes  = _ingresosDelMes(periodoActual);
  const ingresosAnt  = _ingresosDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. KPI — Egresos/Gastos del mes (Elemento 6: cuentas que empiezan por 6)
  //    En PCGE: los gastos van al Debe de cuentas 6x
  // ─────────────────────────────────────────────────────────────────────────────
  const _gastosDelMes = (periodo) =>
    db.prepare(`
      SELECT COALESCE(SUM(vd.debe - vd.haber), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ?
        AND substr(vd.cuenta, 1, 1) = '6'
    `).get(periodo)?.total ?? 0;

  const gastosMes  = _gastosDelMes(periodoActual);
  const gastosAnt  = _gastosDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. KPI — Cantidad de asientos del mes
  // ─────────────────────────────────────────────────────────────────────────────
  const _asientosMes = (periodo) =>
    db.prepare(`SELECT COUNT(*) AS n FROM vouchers WHERE periodo = ?`)
      .get(periodo)?.n ?? 0;

  const vouchersMes = _asientosMes(periodoActual);
  const vouchersAnt = _asientosMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // KPI — Ventas del mes (importe total facturado, asientos origen '14')
  // ─────────────────────────────────────────────────────────────────────────────
  const _ventasDelMes = (periodo) =>
    db.prepare(`
      SELECT COALESCE(SUM(total_haber), 0) AS total
      FROM vouchers WHERE periodo = ? AND origen = '14'
    `).get(periodo)?.total ?? 0;

  const ventasMes = _ventasDelMes(periodoActual);
  const ventasAnt = _ventasDelMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // KPI — IGV débito fiscal del mes (cuentas 40 en ventas, origen '14')
  //    En ventas el IGV se abona (Haber) → haber - debe es positivo.
  // ─────────────────────────────────────────────────────────────────────────────
  const _igvVentasMes = (periodo) =>
    db.prepare(`
      SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS total
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ? AND v.origen = '14' AND substr(vd.cuenta,1,2) = '40'
    `).get(periodo)?.total ?? 0;

  const igvMes = _igvVentasMes(periodoActual);
  const igvAnt = _igvVentasMes(periodoAnt);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. KPI — Cuentas por Cobrar (saldo deudor cuentas 12x, 16x)
  //    Saldo acumulado histórico (no solo del mes), neto Debe-Haber
  // ─────────────────────────────────────────────────────────────────────────────
  const cxCobrar = db.prepare(`
    SELECT COALESCE(SUM(vd.debe - vd.haber), 0) AS saldo
    FROM voucher_detalles vd
    WHERE substr(vd.cuenta, 1, 2) IN ('12', '16')
  `).get()?.saldo ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. KPI — Cuentas por Pagar (saldo acreedor cuentas 42x, 46x)
  //    Saldo acumulado histórico, neto Haber-Debe
  // ─────────────────────────────────────────────────────────────────────────────
  const cxPagar = db.prepare(`
    SELECT COALESCE(SUM(vd.haber - vd.debe), 0) AS saldo
    FROM voucher_detalles vd
    WHERE substr(vd.cuenta, 1, 2) IN ('42', '46')
  `).get()?.saldo ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. KPI — Resultado del período = Ingresos - Gastos
  // ─────────────────────────────────────────────────────────────────────────────
  const resultadoMes  = ingresosMes - gastosMes;
  const resultadoAnt  = ingresosAnt - gastosAnt;

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. KPI — Total de asientos histórico y total de cuentas
  // ─────────────────────────────────────────────────────────────────────────────
  const totalVouchers  = db.prepare(`SELECT COUNT(*) AS n FROM vouchers`).get()?.n ?? 0;
  const totalCuentas   = db.prepare(`SELECT COUNT(*) AS n FROM plan_cuentas`).get()?.n ?? 0;
  const totalEntidades = db.prepare(`SELECT COUNT(*) AS n FROM entidades`).get()?.n ?? 0;

  // Debes y Haberes del mes (para badge de cuadre)
  const sumasMes = db.prepare(`
    SELECT COALESCE(SUM(total_debe),0) AS debe, COALESCE(SUM(total_haber),0) AS haber
    FROM vouchers WHERE periodo = ?
  `).get(periodoActual) ?? { debe: 0, haber: 0 };

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. EVOLUCIÓN MENSUAL (12 meses): Ingresos, Gastos, Resultado
  //    Consulta optimizada: un solo JOIN para los 12 meses
  // ─────────────────────────────────────────────────────────────────────────────
  const primerMes = ultimos12[0];
  const ultimoMes = ultimos12[ultimos12.length - 1];

  const evolucionRaw = db.prepare(`
    SELECT
      v.periodo AS periodo,
      SUM(CASE WHEN substr(vd.cuenta,1,1) = '7' THEN (vd.haber - vd.debe) ELSE 0 END) AS ingresos,
      SUM(CASE WHEN substr(vd.cuenta,1,1) = '6' THEN (vd.debe - vd.haber) ELSE 0 END) AS gastos,
      COUNT(DISTINCT v.id) AS asientos
    FROM vouchers v
    JOIN voucher_detalles vd ON vd.voucher_id = v.id
    WHERE v.periodo BETWEEN ? AND ?
    GROUP BY v.periodo
    ORDER BY periodo ASC
  `).all(primerMes, ultimoMes);

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
  const ventasComprasRaw = db.prepare(`
    SELECT periodo AS periodo, origen, COALESCE(SUM(total_haber),0) AS total
    FROM vouchers
    WHERE periodo BETWEEN ? AND ? AND origen IN ('14','8')
    GROUP BY periodo, origen
  `).all(primerMes, ultimoMes);
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
  const igvRaw = db.prepare(`
    SELECT v.periodo AS periodo, v.origen AS origen,
           COALESCE(SUM(vd.haber - vd.debe),0) AS neto40
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo BETWEEN ? AND ?
      AND v.origen IN ('14','8') AND substr(vd.cuenta,1,2) = '40'
    GROUP BY v.periodo, v.origen
  `).all(primerMes, ultimoMes);
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
  const _topEntidades = (origen) => db.prepare(`
    SELECT codigo, razon_social, SUM(total) AS total FROM (
      SELECT
        (SELECT vd.codigo       FROM voucher_detalles vd WHERE vd.voucher_id = v.id AND vd.codigo       IS NOT NULL AND vd.codigo       <> '' LIMIT 1) AS codigo,
        (SELECT vd.razon_social FROM voucher_detalles vd WHERE vd.voucher_id = v.id AND vd.razon_social IS NOT NULL AND vd.razon_social <> '' LIMIT 1) AS razon_social,
        v.total_haber AS total
      FROM vouchers v WHERE v.origen = ?
    ) WHERE codigo IS NOT NULL AND codigo <> ''
    GROUP BY codigo, razon_social
    ORDER BY total DESC
    LIMIT 6
  `).all(origen);
  const topClientes    = _topEntidades('14');
  const topProveedores = _topEntidades('8');

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. ESTRUCTURA DE GASTOS DEL MES (Elemento 6 desglosado por subcuenta)
  //    Agrupa por los 2 primeros dígitos de cuenta (cuenta de 2 dígitos = rubro)
  // ─────────────────────────────────────────────────────────────────────────────
  const gastosPorRubroRaw = db.prepare(`
    SELECT
      substr(vd.cuenta, 1, 2) AS rubro,
      SUM(vd.debe - vd.haber)   AS importe
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE v.periodo = ?
      AND substr(vd.cuenta, 1, 1) = '6'
    GROUP BY substr(vd.cuenta, 1, 2)
    HAVING SUM(vd.debe - vd.haber) > 0.01
    ORDER BY importe DESC
    LIMIT 10
  `).all(periodoActual);

  // Enriquecer con nombres del plan de cuentas
  const totalGastos = gastosPorRubroRaw.reduce((s, r) => s + r.importe, 0) || 1;
  const gastosPorRubro = gastosPorRubroRaw.map(r => {
    const cuenta = db.prepare(`
      SELECT descripcion FROM plan_cuentas WHERE codigo = ? LIMIT 1
    `).get(r.rubro);
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
  const topCuentasDebe = db.prepare(`
    SELECT
      vd.cuenta,
      COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS descripcion,
      SUM(vd.debe)  AS total_debe,
      SUM(vd.haber) AS total_haber,
      SUM(vd.debe - vd.haber) AS saldo
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo = ?
    GROUP BY vd.cuenta
    ORDER BY SUM(vd.debe) DESC
    LIMIT 5
  `).all(periodoActual);

  const topCuentasHaber = db.prepare(`
    SELECT
      vd.cuenta,
      COALESCE(pc.descripcion, vd.nombre_cuenta, 'Sin descripción') AS descripcion,
      SUM(vd.debe)  AS total_debe,
      SUM(vd.haber) AS total_haber,
      SUM(vd.haber - vd.debe) AS saldo
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    LEFT JOIN plan_cuentas pc ON pc.codigo = vd.cuenta
    WHERE v.periodo = ?
    GROUP BY vd.cuenta
    ORDER BY SUM(vd.haber) DESC
    LIMIT 5
  `).all(periodoActual);

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. MAPA DE CALOR — Asientos por día del mes actual
  // ─────────────────────────────────────────────────────────────────────────────
  const heatmapRaw = db.prepare(`
    SELECT fecha, COUNT(*) AS cantidad
    FROM vouchers
    WHERE periodo = ?
    GROUP BY fecha
    ORDER BY fecha ASC
  `).all(periodoActual);

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
  const periodosDescuadrados = db.prepare(`
    SELECT periodo AS periodo,
           ABS(SUM(total_debe) - SUM(total_haber)) AS diferencia
    FROM vouchers
    WHERE periodo BETWEEN ? AND ?
    GROUP BY periodo
    HAVING ABS(SUM(total_debe) - SUM(total_haber)) > 0.01
    ORDER BY periodo DESC
  `).all(primerMes, ultimoMes);

  if (periodosDescuadrados.length > 0) {
    alertas.push({
      tipo:  'error',
      icono: 'fa-triangle-exclamation',
      titulo: `${periodosDescuadrados.length} período(s) descuadrado(s)`,
      detalle: periodosDescuadrados.map(p => p.periodo).join(', '),
    });
  }

  // B) Vouchers sin glosa registrada en el mes actual
  const vouchersSinGlosa = db.prepare(`
    SELECT COUNT(*) AS n FROM vouchers
    WHERE periodo = ?
      AND (glosa_cabecera IS NULL OR TRIM(glosa_cabecera) = '')
  `).get(periodoActual)?.n ?? 0;

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
  const vencidasDetalle = db.prepare(`
    SELECT vd.doc_tipo, vd.doc_numero, vd.fecha_venc, vd.codigo, vd.razon_social,
           vd.debe, vd.haber, vd.cuenta,
           CASE WHEN substr(vd.cuenta,1,2) IN ('12','16') THEN 'CXC' ELSE 'CXP' END AS tipo_cxc,
           v.id AS voucher_id, v.origen, v.numero_voucher
    FROM voucher_detalles vd
    JOIN vouchers v ON v.id = vd.voucher_id
    WHERE vd.fecha_venc IS NOT NULL
      AND vd.fecha_venc != ''
      AND vd.fecha_venc < ?
      AND substr(vd.cuenta,1,2) IN ('12','16','42','46')
    ORDER BY vd.fecha_venc ASC
  `).all(hoyStr);

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
    const tieneIngresos = db.prepare(`
      SELECT COUNT(*) AS n
      FROM voucher_detalles vd
      JOIN vouchers v ON v.id = vd.voucher_id
      WHERE v.periodo = ? AND substr(vd.cuenta,1,1) = '7'
    `).get(periodoActual)?.n ?? 0;

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
  const porOrigen = db.prepare(`
    SELECT origen, COUNT(*) AS cantidad
    FROM vouchers
    WHERE periodo = ?
    GROUP BY origen
    ORDER BY cantidad DESC, origen DESC
  `).all(periodoActual);

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. DISTRIBUCIÓN DE ENTIDADES
  // ─────────────────────────────────────────────────────────────────────────────
  const distribEntidades = db.prepare(`
    SELECT tipo, COUNT(*) AS cantidad FROM entidades GROUP BY tipo ORDER BY cantidad DESC
  `).all();

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. ACTIVIDAD DIARIA (últimos 30 días) — para sparkline
  // ─────────────────────────────────────────────────────────────────────────────
  const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const actividadDiaria = db.prepare(`
    SELECT fecha, COUNT(*) AS cantidad, SUM(total_debe) AS debe, SUM(total_haber) AS haber
    FROM vouchers
    WHERE fecha >= ?
    GROUP BY fecha
    ORDER BY fecha ASC
  `).all(hace30);

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. DATOS DE EMPRESA + TIPO DE CAMBIO DEL DÍA
  // ─────────────────────────────────────────────────────────────────────────────
  let empresa = {};
  try { empresa = db.prepare('SELECT * FROM config_empresa WHERE id = 1').get() || {}; } catch(_) {}

  let tcHoy = null;
  try {
    const { getGlobalDB } = require('../database/db');
    const gdb = getGlobalDB();
    tcHoy = gdb.prepare(`SELECT compra, venta, fecha FROM monedas WHERE nombre = 'USD' ORDER BY fecha DESC LIMIT 1`).get() || null;
  } catch(_) {}

  // Estado SIRE
  let sireEstado = 'NO_CONFIGURADO';
  try { sireEstado = db.prepare('SELECT estado_conexion FROM sire_config WHERE id = 1').get()?.estado_conexion || 'NO_CONFIGURADO'; } catch(_) {}

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
