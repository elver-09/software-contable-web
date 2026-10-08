// src/renderer/js/modules/dashboard.js
// Dashboard Ejecutivo — Ansorito
'use strict';

import { escapeHTML, escapeAttr } from '../utils/security.js';

function fmt(n) { return Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtK(n) {
  const a = Math.abs(Number(n||0));
  if (a >= 1e6) return (Number(n)/1e6).toFixed(1)+'M';
  if (a >= 1e3) return (Number(n)/1e3).toFixed(1)+'K';
  return fmt(n);
}
function fmtInt(n) { return Math.round(Number(n||0)).toLocaleString('es-PE'); }
function periodoLabel(p) {
  if (!p) return '';
  const [y,m] = String(p).split('-');
  const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${meses[parseInt(m,10)]||m} ${y}`;
}

function getPaleta() {
  const dark = document.body.classList.contains('dark-mode');
  const styles = getComputedStyle(document.body);
  const css = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bgCard:    css('--bg-card', dark ? '#151f2b' : '#ffffff'),
    bgBlock:   css('--bg-block', dark ? '#182432' : '#f5f7f9'),
    tx:        css('--tx', dark ? '#d8e1e8' : '#1c2733'),
    tx2:       css('--tx2', dark ? '#98a8b6' : '#526373'),
    tx3:       css('--tx3', dark ? '#6e8192' : '#7c8d9b'),
    brd:       css('--brd', dark ? '#253342' : '#d5dde4'),
    accent:    css('--accent', dark ? '#6f9fba' : '#2f6f8f'),
    ok:        css('--ok', dark ? '#62a487' : '#2f745c'),
    warn:      css('--warn', dark ? '#c0944a' : '#a16d24'),
    err:       css('--err', dark ? '#c46b75' : '#a0444f'),
    muted:     dark ? '#69778a' : '#65727f',
    grid:      dark ? 'rgba(143,170,190,0.12)' : 'rgba(190,202,213,0.55)',
    label:     css('--tx3', dark ? '#6e8192' : '#7c8d9b'),
    resultado: css('--accent', dark ? '#6f9fba' : '#2f6f8f'),
  };
}

let _root = null;
let _lastData = null;
let _resizeTimer = null;
let _resizeBound = false;

export async function initDashboard() {
  _root = document.querySelector('#view-dashboard .dashboard-container') || document.getElementById('view-dashboard');
  if (!_root) return;

  _root.innerHTML = _skeletonHTML();

  try {
    const data = await window.api.getDashboardData();
    if (!data || data.sinEmpresa || !data.kpi) {
      _root.innerHTML = _errorHTML('Seleccione una empresa para visualizar el tablero ejecutivo.');
      return;
    }
    _lastData = data;
    _root.innerHTML = _buildHTML(data);
    requestAnimationFrame(() => _renderDashboardVisuals(data));

    if (!_resizeBound) {
      window.addEventListener('resize', () => {
        if (!_lastData || !_root || !_root.isConnected) return;
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => _renderDashboardVisuals(_lastData), 140);
      });
      _resizeBound = true;
    }
  } catch (err) {
    console.error('Dashboard error:', err);
    _root.innerHTML = _errorHTML('No se pudo cargar el dashboard: ' + err.message);
  }
}

function _renderDashboardVisuals(data) {
  _drawEvolucionChart(data.evolucion || []);
  _drawVentasComprasChart(data.ventasVsCompras || []);
  _drawIgvChart(data.igvMensual || []);
  _drawGastosDonut(data.gastosPorRubro || []);
  _animarKPIs();
  _initDashboardActions();
}

function _buildHTML(data) {
  const { kpi, periodoActual, empresa, tcHoy, sireEstado, igvMensual, alertas, heatmap, porOrigen, topClientes, topProveedores, gastosPorRubro } = data;
  const paleta = getPaleta();
  const alertasDashboard = (alertas || []).filter(a => !Array.isArray(a.documentos) || a.documentos.length === 0);
  const periodo = periodoLabel(periodoActual);
  const empNombre = (empresa?.nombre_comercial || empresa?.razon_social || 'Empresa').toUpperCase();
  const empRuc = empresa?.ruc || 'Sin RUC';
  const cuadre = Math.abs((kpi.debesMes||0) - (kpi.haberesMes||0)) < 0.01;
  const igvActual = Array.isArray(igvMensual) && igvMensual.length ? igvMensual[igvMensual.length - 1] : { debito: kpi.igvMes || 0, credito: 0, neto: kpi.igvMes || 0 };
  const cierreMsg = cuadre ? 'El período se encuentra cuadrado.' : `Existe una diferencia de S/ ${fmt(Math.abs((kpi.debesMes || 0) - (kpi.haberesMes || 0)))} entre Debe y Haber.`;

  return `
  <div class="ndb-wrap">
    <div class="ndb-hero">
      <div class="ndb-hero__brand">
        <div class="ndb-hero__logo">A</div>
        <div>
          <div class="ndb-kicker">Ansorito · Tablero gerencial</div>
          <div class="ndb-title">${escapeHTML(empNombre)}</div>
          <div class="ndb-subtitle">RUC ${escapeHTML(empRuc)} · Período ${escapeHTML(periodo)}</div>
        </div>
      </div>
      <div class="ndb-hero__meta">
        <span class="ndb-chip ${cuadre ? 'ok' : 'err'}"><i class="fa-solid ${cuadre ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${cuadre ? 'Período cuadrado' : 'Período descuadrado'}</span>
        <span class="ndb-chip"><i class="fa-solid fa-dollar-sign"></i> T.C. USD ${tcHoy ? ('S/ ' + Number(tcHoy.venta || 0).toFixed(3)) : '—'}</span>
        <span class="ndb-chip"><i class="fa-solid fa-file-shield"></i> SIRE ${_estadoSireLabel(sireEstado)}</span>
      </div>
    </div>

    <div class="ndb-kpis">
      ${_kpiCard({ icon:'fa-arrow-trend-up', label:'Ingresos del mes', value:kpi.ingresosMes, prefix:'S/', color:paleta.ok, tone:'positive', variation:kpi.varIngresos, money:true })}
      ${_kpiCard({ icon:'fa-arrow-trend-down', label:'Gastos del mes', value:kpi.gastosMes, prefix:'S/', color:paleta.err, tone:'negative', variation:kpi.varGastos, money:true, invertVariation:true })}
      ${_kpiCard({ icon:'fa-scale-balanced', label:'Resultado del mes', value:kpi.resultadoMes, prefix:'S/', color:kpi.resultadoMes >= 0 ? paleta.accent : paleta.err, tone:kpi.resultadoMes >= 0 ? 'primary' : 'negative', variation:kpi.varResultado, money:true })}
      ${_kpiCard({ icon:'fa-file-lines', label:'Asientos del mes', value:kpi.vouchersMes, prefix:'', color:paleta.muted, tone:'neutral', variation:kpi.varVouchers, integer:true })}
    </div>

    <div class="ndb-strip">
      ${_controlStat('Ventas facturadas', 'S/ ' + fmtK(kpi.ventasMes), 'fa-file-invoice-dollar', 'Ingreso comercial del período')}
      ${_controlStat('IGV neto', 'S/ ' + fmtK(igvActual.neto), 'fa-receipt', 'Débito menos crédito fiscal')}
      ${_controlStat('Debe del mes', 'S/ ' + fmtK(kpi.debesMes), 'fa-arrow-right-to-bracket', 'Total contabilizado al debe')}
      ${_controlStat('Haber del mes', 'S/ ' + fmtK(kpi.haberesMes), 'fa-arrow-right-from-bracket', 'Total contabilizado al haber')}
      ${_controlStat('Entidades registradas', fmtInt(kpi.totalEntidades), 'fa-address-book', 'Clientes, proveedores y otros')}
      ${_controlStat('Tipo de cambio', tcHoy ? ('S/ ' + Number(tcHoy.venta || 0).toFixed(3)) : '—', 'fa-money-bill-transfer', 'Venta referencial del día')}
    </div>

    <div class="ndb-core-layout">
      <div class="ndb-panel ndb-panel--chart ndb-panel--hero-chart">
        <div class="ndb-panel__header">
          <div>
            <div class="ndb-panel__title">Evolución financiera</div>
            <div class="ndb-panel__sub">Comparativo de ingresos, gastos y resultado de los últimos 12 meses.</div>
          </div>
        </div>
        <canvas id="db-evolucion-chart" height="260" style="width:100%;"></canvas>
        <div class="ndb-legend">
          <span><i class="ndb-dot" style="background:${paleta.ok}"></i>Ingresos</span>
          <span><i class="ndb-dot" style="background:${paleta.err}"></i>Gastos</span>
          <span><i class="ndb-line" style="border-color:${paleta.accent}"></i>Resultado</span>
        </div>
      </div>

      <div class="ndb-analytics-layout ndb-analytics-layout--clean">
        <div class="ndb-panel ndb-panel--chart">
          <div class="ndb-panel__header">
            <div>
              <div class="ndb-panel__title">Ventas vs compras</div>
              <div class="ndb-panel__sub">Seguimiento comercial y de abastecimiento por período.</div>
            </div>
          </div>
          <canvas id="db-ventascompras-chart" height="220" style="width:100%;"></canvas>
          <div class="ndb-legend">
            <span><i class="ndb-dot" style="background:${paleta.accent}"></i>Ventas</span>
            <span><i class="ndb-dot" style="background:${paleta.warn}"></i>Compras</span>
          </div>
        </div>

        <div class="ndb-panel ndb-panel--chart">
          <div class="ndb-panel__header">
            <div>
              <div class="ndb-panel__title">Comportamiento del IGV</div>
              <div class="ndb-panel__sub">Débito, crédito y saldo neto mensual.</div>
            </div>
          </div>
          <canvas id="db-igv-chart" height="220" style="width:100%;"></canvas>
          <div class="ndb-legend">
            <span><i class="ndb-dot" style="background:${paleta.accent}"></i>Débito</span>
            <span><i class="ndb-dot" style="background:${paleta.warn}"></i>Crédito</span>
            <span><i class="ndb-line" style="border-color:${paleta.ok}"></i>Neto</span>
          </div>
        </div>

        <div class="ndb-panel ndb-panel--alerts ndb-panel--compact-block">
          <div class="ndb-panel__header ndb-panel__header--compact">
            <div>
              <div class="ndb-panel__title">Alertas y seguimiento</div>
              <div class="ndb-panel__sub">Incidencias contables y tributarias que deben atenderse.</div>
            </div>
            <span class="ndb-alert-count ${alertasDashboard.length ? 'has-alerts' : 'is-clear'}">${fmtInt(alertasDashboard.length)}</span>
          </div>
          ${_alertPanel(alertasDashboard)}
        </div>
      </div>
    </div>

    <div class="ndb-footer">
      <span><i class="fa-solid fa-rotate"></i> Actualizado: ${new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</span>
      <span>Ansorito · Dashboard contable y tributario</span>
    </div>
  </div>
  ${_styles()}`;
}

function _kpiCard({ icon, label, value, prefix='', color='#2f6f8f', tone='primary', variation=null, money=false, integer=false, invertVariation=false }) {
  const badge = _variationBadge(variation, invertVariation);
  const displayVal = money ? fmtK(value) : integer ? fmtInt(value) : fmt(value);
  return `<div class="ndb-kpi ndb-kpi--${tone}">
    <div class="ndb-kpi__icon" style="background:${color}18;color:${color}"><i class="fa-solid ${icon}"></i></div>
    <div class="ndb-kpi__label">${label}</div>
    <div class="ndb-kpi__value db-kpi-val" data-target="${value}" data-money="${money ? 1 : 0}" data-int="${integer ? 1 : 0}"><span class="ndb-kpi__prefix">${prefix}</span><span class="db-kpi-num">${displayVal}</span></div>
    <div class="ndb-kpi__footer">${badge || '<span class="ndb-kpi__helper">Sin comparación previa</span>'}</div>
  </div>`;
}

function _variationBadge(variation, invert=false) {
  if (variation === null || variation === undefined) return '';
  const positive = invert ? variation <= 0 : variation >= 0;
  const icon = variation > 0 ? 'fa-arrow-up' : variation < 0 ? 'fa-arrow-down' : 'fa-minus';
  const cls = positive ? 'is-good' : 'is-bad';
  const sign = variation > 0 ? '+' : '';
  return `<span class="ndb-badge ${cls}"><i class="fa-solid ${icon}"></i> ${sign}${variation}% vs mes anterior</span>`;
}

function _miniStat(label, value, icon) {
  return `<div class="ndb-mini">
    <div class="ndb-mini__icon"><i class="fa-solid ${icon}"></i></div>
    <div class="ndb-mini__content">
      <div class="ndb-mini__label">${label}</div>
      <div class="ndb-mini__value">${value}</div>
    </div>
  </div>`;
}


function _controlStat(label, value, icon, help = '', compact = false, actionLabel = '') {
  return `<div class="ndb-control-tile${compact ? ' is-compact' : ''}">
    <div class="ndb-control-tile__icon"><i class="fa-solid ${icon}"></i></div>
    <div class="ndb-control-tile__body">
      <div class="ndb-control-tile__label">${label}</div>
      <div class="ndb-control-tile__value">${value}</div>
      <div class="ndb-control-tile__help">${help}</div>
      ${actionLabel ? `<button type="button" class="ndb-open-cartera">${actionLabel} <i class="fa-solid fa-arrow-right"></i></button>` : ''}
    </div>
  </div>`;
}

function _heatmapPanel(heatmap) {
  if (!Array.isArray(heatmap) || heatmap.length === 0) {
    return '<div class="ndb-empty-inline">Sin actividad registrada en el período.</div>';
  }
  const max = Math.max(...heatmap.map(d => Number(d.cantidad || 0)), 0);
  const offset = heatmap[0]?.diaSemana || 0;
  const blanks = Array(offset).fill('<div class="ndb-heatmap__blank"></div>').join('');
  const cells = heatmap.map(d => {
    const qty = Number(d.cantidad || 0);
    let level = 0;
    if (max > 0) {
      const ratio = qty / max;
      level = ratio === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4;
    }
    return `<div class="ndb-heatmap__cell lvl-${level}" title="${escapeAttr(d.fecha)} · ${qty} asiento(s)"><span>${d.dia}</span></div>`;
  }).join('');

  return `<div class="ndb-heatmap-wrap">
    <div class="ndb-heatmap__days"><span>D</span><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span></div>
    <div class="ndb-heatmap">${blanks}${cells}</div>
    <div class="ndb-heatmap__legend"><span>Baja</span><i class="lvl-0"></i><i class="lvl-1"></i><i class="lvl-2"></i><i class="lvl-3"></i><i class="lvl-4"></i><span>Alta</span></div>
  </div>`;
}

function _originBreakdown(origenes) {
  if (!Array.isArray(origenes) || origenes.length === 0) return '<div class="ndb-empty-inline">Sin asientos por origen en este período.</div>';
  const max = Math.max(...origenes.map(o => Number(o.cantidad || 0)), 1);
  return `<div class="ndb-origin-list">${origenes.map(o => {
    const code = escapeHTML(o.origen || '—');
    const label = escapeHTML(_origenNombre(o.origen));
    const qty = Number(o.cantidad || 0);
    const pct = Math.max(8, Math.round((qty / max) * 100));
    return `<div class="ndb-origin-item">
      <div class="ndb-origin-item__head"><span class="ndb-origin-item__code">${code}</span><span class="ndb-origin-item__label">${label}</span><strong>${fmtInt(qty)}</strong></div>
      <div class="ndb-origin-item__bar"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join('')}</div>`;
}


function _operativoResumen(heatmap, origenes, cuadre, cierreMsg) {
  const diasActivos = (heatmap || []).filter(d => Number(d.cantidad || 0) > 0);
  const totalAsientos = diasActivos.reduce((a, d) => a + Number(d.cantidad || 0), 0);
  const pico = diasActivos.reduce((max, d) => Number(d.cantidad || 0) > Number(max?.cantidad || 0) ? d : max, null);
  const ultimo = diasActivos.length ? diasActivos[diasActivos.length - 1] : null;
  const topOrigen = Array.isArray(origenes) && origenes.length ? origenes.reduce((a,b) => Number(b.cantidad||0) > Number(a?.cantidad||0) ? b : a, null) : null;
  return `
    <div class="ndb-op-grid">
      ${_miniStat('Días con actividad', fmtInt(diasActivos.length), 'fa-calendar-days')}
      ${_miniStat('Asientos registrados', fmtInt(totalAsientos), 'fa-pen-to-square')}
      ${_miniStat('Orígenes usados', fmtInt((origenes || []).length), 'fa-diagram-project')}
      ${_miniStat('Pico diario', pico ? fmtInt(pico.cantidad) : '0', 'fa-bolt')}
    </div>
    <div class="ndb-inline-block">
      <div class="ndb-inline-title">Resumen del período</div>
      <div class="ndb-summary-list">
        <div class="ndb-summary-list__item"><span>Última fecha con movimiento</span><strong>${escapeHTML(ultimo?.fecha || 'Sin registros')}</strong></div>
        <div class="ndb-summary-list__item"><span>Origen principal</span><strong>${topOrigen ? escapeHTML(_origenNombre(topOrigen.origen)) + ' · ' + fmtInt(topOrigen.cantidad) : 'Sin origen'}</strong></div>
      </div>
    </div>
    <div class="ndb-inline-block">
      <div class="ndb-inline-title">Asientos por origen</div>
      ${_originBreakdown(origenes || [])}
    </div>
    <div class="ndb-status-box ${cuadre ? 'is-ok' : 'is-warn'}">
      <div class="ndb-status-box__title">Cierre del mes</div>
      <div class="ndb-status-box__text">${escapeHTML(cierreMsg)}</div>
    </div>`;
}

function _gastosLista(gastos) {
  if (!Array.isArray(gastos) || gastos.length === 0) return '<div class="ndb-empty-inline">No hay gastos del período para mostrar.</div>';
  return `<div class="ndb-gasto-list">${gastos.slice(0,5).map(g => `
    <div class="ndb-gasto-item">
      <div>
        <div class="ndb-gasto-item__title">${escapeHTML(g.rubro)} · ${escapeHTML(g.descripcion || 'Sin descripción')}</div>
        <div class="ndb-gasto-item__sub">Participación ${fmt(g.pct)}%</div>
      </div>
      <strong>S/ ${fmtK(g.importe)}</strong>
    </div>`).join('')}</div>`;
}

function _rankList(title, items, icon, valueKey = 'total', labelKey = 'razon_social', innerOnly = false) {
  if (!Array.isArray(items) || items.length === 0) {
    return innerOnly ? `<div class="ndb-empty-inline">Sin información disponible.</div>` : `<div class="ndb-rank-card"><div class="ndb-rank-card__head"><i class="fa-solid ${icon}"></i><span>${title}</span></div><div class="ndb-empty-inline">Sin información disponible.</div></div>`;
  }
  const max = Math.max(...items.map(i => Number(i[valueKey] || 0)), 1);
  const body = `<div class="ndb-rank-list">${items.slice(0,6).map(item => {
    const name = escapeHTML(item[labelKey] || item.codigo || 'Sin nombre');
    const amount = Number(item[valueKey] || 0);
    const pct = Math.max(10, Math.round((amount / max) * 100));
    return `<div class="ndb-rank-item">
      <div class="ndb-rank-item__line"><span class="ndb-rank-item__name">${name}</span><strong>S/ ${fmtK(amount)}</strong></div>
      <div class="ndb-rank-item__bar"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join('')}</div>`;
  return innerOnly ? body : `<div class="ndb-rank-card"><div class="ndb-rank-card__head"><i class="fa-solid ${icon}"></i><span>${title}</span></div>${body}</div>`;
}

function _origenNombre(origen) {
  const map = {
    '14': 'Ventas e ingresos',
    '8': 'Compras',
    '1': 'Apertura',
    '2': 'Caja y bancos',
    '3': 'Diario',
    '4': 'Honorarios',
    '5': 'Planillas',
    '6': 'Ajustes',
    '7': 'Cierre',
    '9': 'Otros'
  };
  return map[String(origen || '')] || `Origen ${String(origen || '—')}`;
}

function _alertPanel(alertas) {
  if (!alertas || alertas.length === 0) {
    return '<div class="ndb-clear-state"><div class="ndb-clear-state__icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="ndb-clear-state__title">Sin alertas críticas</div><div class="ndb-clear-state__text">No se detectaron incidencias relevantes en el período actual.</div></div></div>';
  }
  return `<div class="ndb-alert-list">${alertas.slice(0, 6).map(a => _alertaHTML(a)).join('')}</div>`;
}

function _alertaHTML(a) {
  const hasDocumentos = Array.isArray(a.documentos) && a.documentos.length > 0;
  const cls = a.tipo === 'error' ? 'error' : a.tipo === 'warning' ? 'warning' : 'info';
  const safeIcon = /^[a-z0-9- ]+$/i.test(String(a.icono || '')) ? a.icono : 'fa-circle-info';
  return `<div class="ndb-alert ndb-alert--${cls}">
    <div class="ndb-alert__icon"><i class="fa-solid ${escapeAttr(safeIcon)}"></i></div>
    <div class="ndb-alert__body">
      <div class="ndb-alert__title">${escapeHTML(a.titulo || 'Alerta')}</div>
      <div class="ndb-alert__detail">${escapeHTML(a.detalle || 'Sin detalle')}</div>
      ${hasDocumentos ? `<button class="ndb-open-cartera ndb-alert__action" type="button">Ver en Cartera y Vencimientos <i class="fa-solid fa-arrow-right"></i></button>` : ''}
    </div>
  </div>`;
}

function _estadoSireLabel(estado) {
  if (estado === 'CONECTADO') return 'Conectado';
  if (estado === 'CONFIGURADO') return 'Configurado';
  return 'Pendiente';
}

function _initDashboardActions() {
  _root?.querySelectorAll('.ndb-open-cartera').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const nav = document.querySelector('[data-target="view-cartera"]');
      if (nav) nav.click();
    });
  });
}

function _drawEvolucionChart(evolucion) {
  const canvas = document.getElementById('db-evolucion-chart');
  if (!canvas || !evolucion || evolucion.length === 0) return;

  const p = getPaleta(), dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 40 || 580, H = 240;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const PAD = { left: 52, right: 12, top: 20, bottom: 26 };
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom;
  const n = evolucion.length;

  const allVals = evolucion.flatMap(d => [d.ingresos, d.gastos, d.resultado]);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - Math.min(minVal, 0);
  const yScale = v => PAD.top + chartH - ((v - Math.min(minVal,0)) / range * chartH);
  const barW = Math.max(4, Math.floor(chartW / n * 0.25));
  const gap = chartW / n;

  // Grid
  ctx.strokeStyle = p.grid; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    const val = maxVal - (range / 4) * i + Math.min(minVal, 0);
    ctx.fillStyle = p.label; ctx.font = '9px Segoe UI, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(fmtK(val), PAD.left - 8, y + 3);
  }

  // Barras
  evolucion.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2;
    const yI = yScale(d.ingresos), y0 = yScale(0);
    ctx.fillStyle = p.ok; _rrect(ctx, cx - barW - 1, Math.min(yI, y0), barW, Math.abs(y0 - yI), 3); ctx.fill();
    const yG = yScale(d.gastos);
    ctx.fillStyle = p.err; _rrect(ctx, cx + 1, Math.min(yG, y0), barW, Math.abs(y0 - yG), 3); ctx.fill();

    if (n <= 6 || i % 2 === 0) {
      ctx.fillStyle = p.label; ctx.textAlign = 'center'; ctx.font = '9px Segoe UI, sans-serif';
      ctx.fillText(periodoLabel(d.periodo), cx, PAD.top + chartH + 16);
    }
  });

  // Línea resultado
  ctx.beginPath(); ctx.strokeStyle = p.resultado; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
  evolucion.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2, cy = yScale(d.resultado);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  });
  ctx.stroke(); ctx.setLineDash([]);
  evolucion.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2, cy = yScale(d.resultado);
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p.resultado; ctx.fill(); ctx.strokeStyle = p.bgCard; ctx.lineWidth = 1.5; ctx.stroke();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRÁFICO: Ventas vs Compras (barras agrupadas)
// ═══════════════════════════════════════════════════════════════════════════════
function _drawVentasComprasChart(data) {
  const canvas = document.getElementById('db-ventascompras-chart');
  if (!canvas || !data || data.length === 0) return;

  const p = getPaleta(), dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 40 || 580, H = 240;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const PAD = { left: 52, right: 12, top: 20, bottom: 26 };
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom;
  const n = data.length;

  const maxVal = Math.max(...data.flatMap(d => [d.ventas, d.compras]), 1);
  const yScale = v => PAD.top + chartH - (v / maxVal * chartH);
  const barW = Math.max(4, Math.floor(chartW / n * 0.25));
  const gap = chartW / n;

  ctx.strokeStyle = p.grid; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.fillStyle = p.label; ctx.font = '9px Segoe UI, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(fmtK(maxVal - (maxVal / 4) * i), PAD.left - 8, y + 3);
  }

  data.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2;
    ctx.fillStyle = p.accent; _rrect(ctx, cx - barW - 1, yScale(d.ventas), barW, chartH - (yScale(d.ventas) - PAD.top), 3); ctx.fill();
    ctx.fillStyle = p.warn; _rrect(ctx, cx + 1, yScale(d.compras), barW, chartH - (yScale(d.compras) - PAD.top), 3); ctx.fill();
    if (n <= 6 || i % 2 === 0) {
      ctx.fillStyle = p.label; ctx.textAlign = 'center'; ctx.font = '9px Segoe UI, sans-serif';
      ctx.fillText(periodoLabel(d.periodo), cx, PAD.top + chartH + 16);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRÁFICO: IGV Mensual (barras + línea neto)
// ═══════════════════════════════════════════════════════════════════════════════
function _drawIgvChart(igvMensual) {
  const canvas = document.getElementById('db-igv-chart');
  if (!canvas || !igvMensual || igvMensual.length === 0) return;

  const p = getPaleta(), dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 40 || 580, H = 220;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const PAD = { left: 52, right: 12, top: 20, bottom: 26 };
  const chartW = W - PAD.left - PAD.right, chartH = H - PAD.top - PAD.bottom;
  const n = igvMensual.length;

  const allVals = igvMensual.flatMap(d => [d.debito, d.credito, d.neto]);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, 0);
  const range = maxVal - Math.min(minVal, 0);
  const yScale = v => PAD.top + chartH - ((v - Math.min(minVal,0)) / range * chartH);
  const barW = Math.max(4, Math.floor(chartW / n * 0.25));
  const gap = chartW / n;

  ctx.strokeStyle = p.grid; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    const val = maxVal - (range / 4) * i + Math.min(minVal, 0);
    ctx.fillStyle = p.label; ctx.font = '9px Segoe UI, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(fmtK(val), PAD.left - 8, y + 3);
  }

  igvMensual.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2, y0 = yScale(0);
    ctx.fillStyle = p.accent; _rrect(ctx, cx - barW - 1, Math.min(yScale(d.debito), y0), barW, Math.abs(y0 - yScale(d.debito)), 3); ctx.fill();
    ctx.fillStyle = p.warn; _rrect(ctx, cx + 1, Math.min(yScale(d.credito), y0), barW, Math.abs(y0 - yScale(d.credito)), 3); ctx.fill();
    if (n <= 6 || i % 2 === 0) {
      ctx.fillStyle = p.label; ctx.textAlign = 'center'; ctx.font = '9px Segoe UI, sans-serif';
      ctx.fillText(periodoLabel(d.periodo), cx, PAD.top + chartH + 16);
    }
  });

  // Línea neto
  ctx.beginPath(); ctx.strokeStyle = p.ok; ctx.lineWidth = 2; ctx.setLineDash([]);
  igvMensual.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2, cy = yScale(d.neto);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  });
  ctx.stroke();
  igvMensual.forEach((d, i) => {
    const cx = PAD.left + gap * i + gap / 2, cy = yScale(d.neto);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.ok; ctx.fill(); ctx.strokeStyle = p.bgCard; ctx.lineWidth = 1.5; ctx.stroke();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRÁFICO: Gastos por Rubro (donut simple con leyenda)
// ═══════════════════════════════════════════════════════════════════════════════
function _drawGastosDonut(gastos) {
  const canvas = document.getElementById('db-gastos-donut');
  if (!canvas || !gastos || gastos.length === 0) {
    if (canvas) { const parent = canvas.parentElement; canvas.remove(); const d = document.createElement('div'); d.className = 'db-empty'; d.textContent = 'Sin gastos en el período'; parent.appendChild(d); }
    return;
  }
  const p = getPaleta(), dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 40 || 580, H = 220;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

  const colors = [p.accent, p.err, p.warn, p.ok, '#6f6788', p.muted, '#9a6847', '#47786d', '#8a5261', '#817f79'];
  const total = gastos.reduce((s, g) => s + g.importe, 0);
  const cx = 90, cy = H / 2, r = 70, inner = 42;

  let angle = -Math.PI / 2;
  gastos.forEach((g, i) => {
    const slice = (g.importe / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.arc(cx, cy, inner, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    angle += slice;
  });

  // Leyenda a la derecha
  const lx = 190;
  gastos.forEach((g, i) => {
    const ly = 16 + i * 22;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = p.tx; ctx.font = '11px Segoe UI, sans-serif'; ctx.textAlign = 'left';
    const label = `${g.rubro} ${g.descripcion.length > 18 ? g.descripcion.substring(0,18)+'…' : g.descripcion}`;
    ctx.fillText(label, lx + 16, ly + 9);
    ctx.fillStyle = p.tx2; ctx.font = '10px Segoe UI, sans-serif';
    ctx.fillText(`S/ ${fmtK(g.importe)} (${g.pct}%)`, lx + 16 + ctx.measureText(label).width + 6, ly + 9);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════
function _rrect(ctx, x, y, w, h, r) {
  if (h <= 0 || w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _animarKPIs() {
  const DURATION = 900, start = performance.now();
  document.querySelectorAll('.db-kpi-val').forEach(el => {
    const target = parseFloat(el.dataset.target || 0);
    const isMoney = el.dataset.money === '1';
    const isInt = el.dataset.int === '1';
    const numEl = el.querySelector('.db-kpi-num');
    if (!numEl) return;
    function tick(now) {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const val = ease * target;
      numEl.textContent = isMoney ? fmtK(val) : (isInt ? Math.round(val).toLocaleString('es-PE') : fmt(val));
      if (t < 1) requestAnimationFrame(tick);
      else numEl.textContent = isMoney ? fmtK(target) : (isInt ? Math.round(target).toLocaleString('es-PE') : fmt(target));
    }
    requestAnimationFrame(tick);
  });
}

function _skeletonHTML() {
  return `<div class="ndb-wrap">
    <div class="ndb-skeleton" style="height:120px;"></div>
    <div class="ndb-grid-4">${Array(4).fill('<div class="ndb-skeleton" style="height:122px;"></div>').join('')}</div>
    <div class="ndb-grid-2">
      <div class="ndb-skeleton" style="height:180px;"></div>
      <div class="ndb-skeleton" style="height:180px;"></div>
    </div>
    <div class="ndb-grid-2">
      <div class="ndb-skeleton" style="height:280px;"></div>
      <div class="ndb-skeleton" style="height:280px;"></div>
    </div>
    <div class="ndb-grid-3x">
      <div class="ndb-skeleton" style="height:280px;"></div>
      <div class="ndb-skeleton" style="height:280px;"></div>
      <div class="ndb-skeleton" style="height:280px;"></div>
    </div>
  </div>${_styles()}`;
}

function _errorHTML(msg) {
  return `<div class="ndb-error">
    <div class="ndb-error__icon"><i class="fa-solid fa-chart-line"></i></div>
    <h3>Dashboard ejecutivo</h3>
    <p>${escapeHTML(msg)}</p>
  </div>${_styles()}`;
}

function _styles() {
  return `<style>
    .ndb-wrap{padding:0 0 28px;display:flex;flex-direction:column;gap:16px;min-height:100%;font-family:'Segoe UI',system-ui,sans-serif;}
    .ndb-hero{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px 28px;border-radius:8px;background:var(--brand-grad);box-shadow:0 14px 30px rgba(28,39,51,.16);color:#fff;position:relative;overflow:hidden;}
    .ndb-hero::after{display:none;}
    .ndb-hero__brand{display:flex;align-items:center;gap:18px;position:relative;z-index:1;}
    .ndb-hero__logo{width:58px;height:58px;border-radius:8px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);}
    .ndb-kicker{font-size:11px;text-transform:uppercase;letter-spacing:0;color:rgba(255,255,255,.68);margin-bottom:6px;font-weight:700;}
    .ndb-title{font-size:24px;font-weight:800;letter-spacing:0;line-height:1.1;}
    .ndb-subtitle{margin-top:5px;font-size:12.5px;color:rgba(255,255,255,.82);}
    .ndb-hero__meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;}
    .ndb-chip{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.18);font-size:11px;font-weight:700;backdrop-filter:blur(4px);}
    .ndb-chip.ok{background:rgba(var(--ok-rgb),.18);border-color:rgba(var(--ok-rgb),.30);color:#e7f7f1;}
    .ndb-chip.err{background:rgba(var(--err-rgb),.18);border-color:rgba(var(--err-rgb),.30);color:#f8e7e9;}

    .ndb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
    .ndb-kpi{background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:16px;box-shadow:var(--shd);display:flex;flex-direction:column;gap:10px;min-height:124px;}
    .ndb-kpi__icon{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;}
    .ndb-kpi__label{font-size:11px;text-transform:uppercase;letter-spacing:0;color:var(--tx3);font-weight:800;}
    .ndb-kpi__value{font-size:28px;font-weight:800;color:var(--tx);letter-spacing:0;line-height:1;}
    .ndb-kpi__prefix{font-size:13px;vertical-align:super;margin-right:2px;font-weight:700;}
    .ndb-kpi__footer{margin-top:auto;}
    .ndb-kpi__helper{font-size:11px;color:var(--tx3);}
    .ndb-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;font-size:10px;font-weight:800;}
    .ndb-badge.is-good{background:rgba(var(--ok-rgb),.12);color:var(--ok);}
    .ndb-badge.is-bad{background:rgba(var(--err-rgb),.12);color:var(--err);}
    body.dark-mode .ndb-badge.is-good{background:rgba(var(--ok-rgb),.20);color:var(--ok);}
    body.dark-mode .ndb-badge.is-bad{background:rgba(var(--err-rgb),.22);color:var(--err);}

    .ndb-strip{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
    .ndb-control-tile{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:8px;background:var(--bg-card);border:1px solid var(--brd);box-shadow:var(--shd);}
    .ndb-control-tile.is-compact{background:var(--bg-block);box-shadow:none;border-color:var(--brd-lt);}
    .ndb-control-tile__icon{width:38px;height:38px;border-radius:8px;background:rgba(var(--accent-rgb),.10);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;flex:0 0 auto;}
    .ndb-control-tile__label{font-size:10.5px;text-transform:uppercase;letter-spacing:0;color:var(--tx3);font-weight:800;}
    .ndb-control-tile__value{margin-top:4px;font-size:20px;font-weight:800;color:var(--tx);line-height:1.1;}
    .ndb-control-tile__help{margin-top:5px;font-size:11px;line-height:1.4;color:var(--tx2);}
    .ndb-open-cartera{margin-top:8px;padding:0;border:0;background:transparent;color:var(--accent);font-size:10.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.ndb-open-cartera:hover{text-decoration:underline}.ndb-alert__action{font-size:11px;margin-top:8px}

    .ndb-summary-grid,.ndb-chart-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.95fr);gap:16px;align-items:start;}
    .ndb-core-layout{display:flex;flex-direction:column;gap:16px;}
    .ndb-analytics-layout{display:grid;grid-template-columns:1fr 1fr minmax(300px,.95fr);gap:16px;align-items:start;}
    .ndb-analytics-layout--clean{grid-template-columns:1fr 1fr minmax(320px,.9fr);} 
    .ndb-chart-grid--equal{grid-template-columns:1fr 1fr;}
    .ndb-grid-3x{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start;}
    .ndb-bottom-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;align-items:start;}
    .ndb-panel{background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:18px 20px;box-shadow:var(--shd);width:100%;box-sizing:border-box;overflow:hidden;}
    .ndb-panel--chart canvas{display:block;}
    .ndb-panel--compact-block{padding-bottom:16px;}
    .ndb-panel--hero-chart{min-height:420px;}
    .ndb-panel--accent{background:linear-gradient(180deg,var(--bg-card) 0%, var(--bg-block) 100%);}
    .ndb-panel__header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--brd-lt);}.ndb-panel__header--compact{margin-bottom:12px;padding-bottom:10px;}
    .ndb-panel__title{font-size:15px;font-weight:800;color:var(--tx);}
    .ndb-panel__sub{margin-top:4px;font-size:11.5px;color:var(--tx3);}
    .ndb-mini-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
    .ndb-op-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px;}
    .ndb-summary-list{display:flex;flex-direction:column;gap:8px;}
    .ndb-summary-list__item{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--brd-lt);border-radius:8px;background:var(--bg-block);font-size:12px;color:var(--tx2);}
    .ndb-summary-list__item strong{color:var(--tx);font-size:12px;}

    .ndb-mini{display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:8px;background:var(--bg-block);border:1px solid var(--brd-lt);}
    .ndb-mini__icon{width:38px;height:38px;border-radius:8px;background:rgba(var(--accent-rgb),.10);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;flex:0 0 auto;}
    .ndb-mini__label{font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:0;font-weight:700;}
    .ndb-mini__value{margin-top:5px;font-size:18px;font-weight:800;color:var(--tx);}
    .ndb-inline-block{margin-top:16px;padding-top:14px;border-top:1px solid var(--brd-lt);}
    .ndb-inline-title{font-size:11px;text-transform:uppercase;letter-spacing:0;color:var(--tx3);font-weight:800;margin-bottom:10px;}
    .ndb-status-box{margin-top:16px;padding:14px;border-radius:8px;border:1px solid var(--brd-lt);background:var(--bg-card);}
    .ndb-status-box.is-ok{border-color:rgba(var(--ok-rgb),.20);background:rgba(var(--ok-rgb),.06);}
    .ndb-status-box.is-warn{border-color:rgba(var(--err-rgb),.20);background:rgba(var(--err-rgb),.06);}
    .ndb-status-box__title{font-size:12px;font-weight:800;color:var(--tx);margin-bottom:5px;}
    .ndb-status-box__text{font-size:12px;line-height:1.55;color:var(--tx2);}

    .ndb-heatmap-wrap{display:flex;flex-direction:column;gap:8px;}
    .ndb-heatmap__days,.ndb-heatmap{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;}
    .ndb-heatmap__days span{font-size:10px;text-transform:uppercase;color:var(--tx3);text-align:center;font-weight:700;}
    .ndb-heatmap__blank{min-height:34px;}
    .ndb-heatmap__cell{min-height:34px;border-radius:7px;border:1px solid var(--brd-lt);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--tx2);background:var(--bg-block);}
    .ndb-heatmap__cell.lvl-0{background:var(--bg-block);color:var(--tx3);}
    .ndb-heatmap__cell.lvl-1{background:rgba(var(--accent-rgb),.10);border-color:rgba(var(--accent-rgb),.14);color:var(--accent);}
    .ndb-heatmap__cell.lvl-2{background:rgba(var(--accent-rgb),.18);border-color:rgba(var(--accent-rgb),.18);color:var(--accent-h);}
    .ndb-heatmap__cell.lvl-3{background:rgba(var(--accent-rgb),.28);border-color:rgba(var(--accent-rgb),.28);color:var(--accent-h);}
    .ndb-heatmap__cell.lvl-4{background:var(--btn-primary);border-color:var(--accent);color:#fff;}
    .ndb-heatmap__legend{display:flex;align-items:center;gap:8px;justify-content:flex-end;font-size:10px;color:var(--tx3);}
    .ndb-heatmap__legend i{display:inline-block;width:12px;height:12px;border-radius:4px;border:1px solid var(--brd-lt);}
    .ndb-heatmap__legend i.lvl-0{background:var(--bg-block);} .ndb-heatmap__legend i.lvl-1{background:rgba(var(--accent-rgb),.10);} .ndb-heatmap__legend i.lvl-2{background:rgba(var(--accent-rgb),.18);} .ndb-heatmap__legend i.lvl-3{background:rgba(var(--accent-rgb),.28);} .ndb-heatmap__legend i.lvl-4{background:var(--btn-primary);}

    .ndb-origin-list{display:flex;flex-direction:column;gap:10px;}
    .ndb-origin-item__head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
    .ndb-origin-item__head strong{margin-left:auto;color:var(--tx);font-size:12px;}
    .ndb-origin-item__code{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:22px;padding:0 8px;border-radius:999px;background:rgba(var(--accent-rgb),.10);color:var(--accent);font-size:10px;font-weight:800;}
    .ndb-origin-item__label{font-size:12px;color:var(--tx2);}
    .ndb-origin-item__bar{height:8px;border-radius:999px;background:var(--bg-block);overflow:hidden;border:1px solid var(--brd-lt);}
    .ndb-origin-item__bar span{display:block;height:100%;border-radius:999px;background:var(--btn-primary);}

    .ndb-gasto-list{display:flex;flex-direction:column;gap:10px;margin-top:10px;}
    .ndb-panel--chart .ndb-empty-inline{margin-top:10px;}
    .ndb-gasto-item{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:8px;background:var(--bg-block);border:1px solid var(--brd-lt);}
    .ndb-gasto-item strong{color:var(--tx);font-size:12px;white-space:nowrap;}
    .ndb-gasto-item__title{font-size:12px;font-weight:700;color:var(--tx);}
    .ndb-gasto-item__sub{margin-top:4px;font-size:11px;color:var(--tx3);}

    .ndb-rank-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .ndb-rank-card{padding:13px;border-radius:8px;background:var(--bg-block);border:1px solid var(--brd-lt);align-self:start;}
    .ndb-rank-card__head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--tx);margin-bottom:12px;}
    .ndb-rank-card__head i{color:var(--accent);}
    .ndb-rank-list{display:flex;flex-direction:column;gap:9px;}
    .ndb-rank-item__line{display:flex;align-items:center;gap:12px;justify-content:space-between;}
    .ndb-rank-item__name{font-size:12px;color:var(--tx2);max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ndb-rank-item__line strong{font-size:12px;color:var(--tx);white-space:nowrap;}
    .ndb-rank-item__bar{margin-top:6px;height:8px;border-radius:999px;background:var(--bg-card);border:1px solid var(--brd-lt);overflow:hidden;}
    .ndb-rank-item__bar span{display:block;height:100%;border-radius:999px;background:var(--btn-primary);}

    .ndb-alert-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
    .ndb-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px;color:var(--tx2);}
    .ndb-legend span{display:inline-flex;align-items:center;gap:6px;}
    .ndb-dot{display:inline-block;width:10px;height:10px;border-radius:50%;}
    .ndb-line{display:inline-block;width:20px;height:0;border-top:2px solid;border-radius:4px;}

    .ndb-alert-list{display:flex;flex-direction:column;gap:10px;}
    .ndb-alert{display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:8px;border:1px solid var(--brd-lt);background:var(--bg-block);}
    .ndb-alert--error{border-color:rgba(var(--err-rgb),.28);background:rgba(var(--err-rgb),.06);}
    .ndb-alert--warning{border-color:rgba(var(--warn-rgb),.30);background:rgba(var(--warn-rgb),.07);}
    .ndb-alert--info{border-color:rgba(var(--accent-rgb),.22);background:rgba(var(--accent-rgb),.06);}
    .ndb-alert__icon{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--accent);flex:0 0 auto;}
    body.dark-mode .ndb-alert__icon{background:#101824;color:var(--accent);}
    .ndb-alert--error .ndb-alert__icon{color:var(--err);}
    .ndb-alert--warning .ndb-alert__icon{color:var(--warn);}
    .ndb-alert__title{font-size:13px;font-weight:800;color:var(--tx);}
    .ndb-alert__detail{font-size:11.5px;line-height:1.5;color:var(--tx2);margin-top:4px;}


    .ndb-panel--alerts{min-height:0;}
    .ndb-alert-count{min-width:32px;height:26px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex:0 0 auto;}
    .ndb-alert-count.is-clear{background:rgba(var(--ok-rgb),.12);color:var(--ok);}
    .ndb-alert-count.has-alerts{background:rgba(var(--err-rgb),.12);color:var(--err);}
    body.dark-mode .ndb-alert-count.is-clear{background:rgba(var(--ok-rgb),.20);color:var(--ok);}
    body.dark-mode .ndb-alert-count.has-alerts{background:rgba(var(--err-rgb),.22);color:var(--err);}
    .ndb-clear-state{display:flex;align-items:center;gap:13px;padding:14px 15px;border-radius:8px;background:rgba(var(--ok-rgb),.06);border:1px solid rgba(var(--ok-rgb),.18);}
    .ndb-clear-state__icon{width:38px;height:38px;border-radius:8px;background:rgba(var(--ok-rgb),.12);color:var(--ok);display:flex;align-items:center;justify-content:center;font-size:16px;flex:0 0 auto;}
    .ndb-clear-state__title{font-size:13px;font-weight:800;color:var(--tx);}
    .ndb-clear-state__text{margin-top:3px;font-size:11.5px;line-height:1.45;color:var(--tx2);}
    body.dark-mode .ndb-clear-state{background:rgba(var(--ok-rgb),.09);border-color:rgba(var(--ok-rgb),.20);}
    body.dark-mode .ndb-clear-state__icon{background:rgba(var(--ok-rgb),.20);color:var(--ok);}
    .ndb-empty-inline{padding:16px;border-radius:8px;background:var(--bg-block);border:1px dashed var(--brd-lt);font-size:12px;color:var(--tx2);text-align:center;}

    .ndb-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:2px 2px 0;color:var(--tx3);font-size:11px;}
    .ndb-footer i{margin-right:6px;}

    .ndb-skeleton{background:var(--bg-block);border:1px solid var(--brd-lt);border-radius:8px;animation:ndbPulse 1.35s ease-in-out infinite;}
    .ndb-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
    .ndb-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;}
    .ndb-error{min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;}
    .ndb-error__icon{width:78px;height:78px;border-radius:8px;background:rgba(var(--accent-rgb),.10);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:16px;}
    .ndb-error h3{margin:0;font-size:18px;color:var(--tx);}
    .ndb-error p{max-width:380px;margin:8px 0 0;color:var(--tx2);line-height:1.6;font-size:13px;}
    @keyframes ndbPulse {0%,100%{opacity:1}50%{opacity:.42}}

    @media (max-width: 1440px){
      .ndb-strip{grid-template-columns:repeat(3,1fr);} 
      .ndb-analytics-layout,.ndb-analytics-layout--clean{grid-template-columns:1fr 1fr;}
      .ndb-analytics-layout--clean > :last-child{grid-column:1 / -1;}
    }
    @media (max-width: 1200px){
      .ndb-kpis,.ndb-grid-4{grid-template-columns:repeat(2,1fr);} 
      .ndb-summary-grid,.ndb-chart-grid,.ndb-grid-2,.ndb-chart-grid--equal,.ndb-bottom-grid,.ndb-grid-3x,.ndb-analytics-layout,.ndb-analytics-layout--clean{grid-template-columns:1fr;}
      .ndb-rank-grid,.ndb-alert-summary,.ndb-op-grid{grid-template-columns:1fr;display:grid;}
      .ndb-panel--hero-chart{min-height:auto;}
    }
    @media (max-width: 760px){
      .ndb-hero{padding:20px;flex-direction:column;align-items:flex-start;}
      .ndb-hero__meta{justify-content:flex-start;}
      .ndb-title{font-size:20px;}
      .ndb-kpis,.ndb-grid-4,.ndb-mini-grid,.ndb-strip,.ndb-op-grid{grid-template-columns:1fr;}
      .ndb-footer{flex-direction:column;align-items:flex-start;}
      .ndb-heatmap__cell{min-height:30px;font-size:10px;}
      .ndb-panel{padding:16px;}
    }
  </style>`;
}
