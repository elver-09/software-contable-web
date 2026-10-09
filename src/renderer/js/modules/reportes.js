import { obtenerPeriodoTrabajo } from './periodoTrabajo.js';
import { rangoPeriodo } from '../utils/periodoTrabajo.mjs';
// src/renderer/js/modules/reportes.js
// ═══════════════════════════════════════════════════════════════════════════════
// Centro de Reportes Contables — Ansorito
//
// VISTAS:
//   1. Hub Central     — Tarjetas para cada tipo de reporte
//   2. Panel de Reporte — Parámetros + presets + resumen + preview + exportar
//
// REPORTES:
//   1. Libro Diario         2. Libro Mayor
//   3. Balance de Comprobación  4. Estado de Resultados
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

import { escapeHTML } from '../utils/security.js';

// ── Paletas del selector de color de cabecera (estilo Word) ─────────────────────
const RPT_THEME_COLORS = [
  '#2C3E50', '#3c607c', '#446956', '#8c4d57', '#5c6872', '#806631', '#425f6f',
  '#3f4851', '#2b3c4b', '#25292d', '#304e65', '#4b708c', '#547561', '#5c6880',
  '#70617c', '#815b67', '#806943', '#496f6c', '#586c7b',
];
const RPT_STD_COLORS = [
  '#8c4d57', '#81545b', '#826545', '#806e3c', '#5d7150',
  '#446956', '#4b708c', '#3c607c', '#2b3c4b', '#5c6872',
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return `S/ ${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `S/ ${(n/1_000).toFixed(1)}K`;
  return `S/ ${fmt(n)}`;
}
function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function origenLabel(cod) {
  const m = {
    '1':'Caja y Bancos', '5':'Opción Diario', '8':'Reg. Compras',
    '14':'Reg. Ventas e Ingresos', '31':'Planillas', '50':'Provisiones', '90':'Otros',
  };
  return m[cod] || `Origen ${cod}`;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Configuración de reportes ──────────────────────────────────────────────────
const REPORTES = {
  'libro-diario': {
    titulo:    'Libro Diario',
    subtitulo:    '',
    icono:     'fa-book-open',
    color:     'var(--accent)', lightBg: 'var(--accent-lt)',
    categoria: 'Libros Obligatorios',
    parametrosExtra: 'tipo-diario', // selector Formato 5.1 / 2.0 (sin filtro de origen)
  },
  'registro-ventas': {
    titulo:    'Registro de Ventas',
    subtitulo:    '',
    icono:     'fa-file-invoice-dollar',
    color:     'var(--err)', lightBg: 'rgba(var(--err-rgb),.08)',
    categoria: 'Libros Obligatorios',
    origenFijo: '14', // solo libro 14, renumerado desde 1
  },
  'registro-compras': {
    titulo:    'Registro de Compras',
    subtitulo:    '',
    icono:     'fa-cart-shopping',
    color:     'var(--warn)', lightBg: 'rgba(var(--warn-rgb),.08)',
    categoria: 'Libros Obligatorios',
    origenFijo: '8', // solo libro 8, renumerado desde 1
  },
  'libro-mayor': {
    titulo:    'Libro Mayor',
    subtitulo:    '',
    icono:     'fa-building-columns',
    color:     'var(--ok)', lightBg: 'rgba(var(--ok-rgb),.08)',
    categoria: 'Libros Obligatorios',
    parametrosExtra: 'cuentas', // tiene filtro por rango de cuentas
  },
  'balance-comprobacion': {
    titulo:    'Balance de Comprobación',
    subtitulo:    '',
    icono:     'fa-scale-balanced',
    color:     'var(--tx2)', lightBg: 'var(--bg-block)',
    categoria: 'Estados Financieros',
    parametrosExtra: 'nivel',
  },
  'estado-resultados': {
    titulo:    'Estado de Resultados',
    subtitulo:    '',
    icono:     'fa-chart-line',
    color:     'var(--warn)', lightBg: 'rgba(var(--warn-rgb),.08)',
    categoria: 'Estados Financieros',
  },
  'situacion-financiera': {
    titulo:    'Estado de Situación Financiera',
    subtitulo:    '',
    icono:     'fa-landmark',
    color:     'var(--accent)', lightBg: 'var(--accent-lt)',
    categoria: 'Estados Financieros',
  },
  'notas-eeff': {
    titulo:    'Notas a los Estados Financieros',
    subtitulo:    '',
    icono:     'fa-file-lines',
    color:     'var(--tx2)', lightBg: 'var(--bg-block)',
    categoria: 'Estados Financieros',
  },
  'notas-er': {
    titulo:    'Notas Estado de Resultados',
    subtitulo:    '',
    icono:     'fa-file-circle-check',
    color:     'var(--tx2)', lightBg: 'var(--bg-block)',
    categoria: 'Estados Financieros',
  },
};

// ── Estado del módulo ──────────────────────────────────────────────────────────
let _root = null;
let _vistaActual = 'hub'; // 'hub' o el key del reporte
let _previewData = null;
let _categoriasFiltro = null;   // categorías a mostrar (null = todas)
let _heroTitulo = 'Centro de Reportes';
let _heroSub = 'Seleccione un reporte para configurar, previsualizar y exportar';
let _colorOutsideBound = false;  // listener global de cierre del popover de color

// ── Entry point ────────────────────────────────────────────────────────────────
// opts: { rootId, categorias:[...], titulo, subtitulo }
export function initReportes(opts = {}) {
  const rootId = opts.rootId || 'reportes-root';
  _root = document.getElementById(rootId);
  if (!_root) return;

  _categoriasFiltro = Array.isArray(opts.categorias) ? opts.categorias : null;
  _heroTitulo = opts.titulo || 'Centro de Reportes';
  _heroSub = opts.subtitulo || 'Seleccione un reporte para configurar, previsualizar y exportar';

  _vistaActual = 'hub';
  _previewData = null;
  _renderHub();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUB CENTRAL — Tarjetas de reportes agrupadas por categoría
// ═══════════════════════════════════════════════════════════════════════════════

function _renderHub() {
  _vistaActual = 'hub';

  const categorias = {};
  Object.entries(REPORTES).forEach(([key, r]) => {
    if (_categoriasFiltro && !_categoriasFiltro.includes(r.categoria)) return;
    if (!categorias[r.categoria]) categorias[r.categoria] = [];
    categorias[r.categoria].push({ key, ...r });
  });

  let html = `
  <div class="rpt-wrap">

    <!-- Header del módulo -->
    <div class="rpt-hero">
      <div class="rpt-hero-bg"></div>
      <div class="rpt-hero-content">
        <div class="rpt-hero-left">
          <div class="rpt-hero-icon"><i class="fa-solid fa-chart-bar"></i></div>
          <div>
            <div class="rpt-hero-title">${_heroTitulo}</div>
            <div class="rpt-hero-sub">${_heroSub}</div>
          </div>
        </div>
        <div class="rpt-hero-right">
          <div class="rpt-hero-badges">
            <span class="rpt-hero-badge"><i class="fa-solid fa-file-pdf"></i> PDF</span>
            <span class="rpt-hero-badge"><i class="fa-solid fa-file-excel"></i> Excel</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tarjetas de reportes -->
    ${Object.entries(categorias).map(([cat, reportes]) => `
    <div class="rpt-categoria">
      <div class="rpt-cat-titulo"><i class="fa-solid fa-folder-open"></i> ${cat}</div>
      <div class="rpt-cards-grid">
        ${reportes.map(r => `
        <div class="rpt-card" data-tipo="${r.key}">
          <div class="rpt-card-accent" style="background:${r.color};"></div>
          <div class="rpt-card-body">
            <div class="rpt-card-icon" style="background:${r.lightBg};color:${r.color};">
              <i class="fa-solid ${r.icono}"></i>
            </div>
            <div class="rpt-card-info">
              <div class="rpt-card-title">${r.titulo}</div>
              ${r.subtitulo ? `<div class="rpt-card-desc">${r.subtitulo}</div>` : ''}
            </div>
            <div class="rpt-card-arrow"><i class="fa-solid fa-chevron-right"></i></div>
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('')}

  </div>
  ${_styles()}`;

  _root.innerHTML = html;

  // Bind clicks en tarjetas
  _root.querySelectorAll('.rpt-card').forEach(card => {
    card.addEventListener('click', () => {
      const tipo = card.dataset.tipo;
      if (REPORTES[tipo]) _renderReporte(tipo);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL DE REPORTE — Parámetros + Presets + Resumen + Preview + Exportar
// ═══════════════════════════════════════════════════════════════════════════════

function _renderReporte(tipo) {
  _vistaActual = tipo;
  _previewData = null;
  const r = REPORTES[tipo];
  const {desde, hasta} = rangoPeriodo(obtenerPeriodoTrabajo());

  let parametrosExtraHTML = '';

  if (r.parametrosExtra === 'tipo-diario') {
    parametrosExtraHTML = `
    <div>
      <label class="rpt-label"><i class="fa-solid fa-layer-group"></i> Tipo de Reporte</label>
      <select id="rpt-formato-diario">
        <option value="5.1" selected>Formato 5.1</option>
        <option value="2.0">Formato 2.0</option>
      </select>
    </div>`;
  } else if (r.parametrosExtra === 'cuentas') {
    parametrosExtraHTML = `
    <div>
      <label class="rpt-label"><i class="fa-solid fa-hashtag"></i> Cuenta Desde <span class="rpt-opt">(Opcional)</span></label>
      <input type="text" id="rpt-cuenta-desde" placeholder="Ej: 10" maxlength="12">
    </div>
    <div>
      <label class="rpt-label"><i class="fa-solid fa-hashtag"></i> Cuenta Hasta <span class="rpt-opt">(Opcional)</span></label>
      <input type="text" id="rpt-cuenta-hasta" placeholder="Ej: 79" maxlength="12">
    </div>`;
  } else if (r.parametrosExtra === 'nivel') {
    parametrosExtraHTML = `
    <div>
      <label class="rpt-label"><i class="fa-solid fa-layer-group"></i> Nivel de detalle</label>
      <select id="rpt-nivel">
        <option value="0">Detalle completo</option>
        <option value="2" selected>2 dígitos (Divisionaria)</option>
        <option value="3">3 dígitos (Subdivisionaria)</option>
        <option value="1">1 dígito (Elemento)</option>
      </select>
    </div>`;
  }

  let html = `
  <div class="rpt-wrap">

    <!-- Botón volver + Encabezado -->
    <div class="rpt-header-bar">
      <button class="rpt-btn-back" id="rpt-btn-back">
        <i class="fa-solid fa-arrow-left"></i> Centro de Reportes
      </button>
    </div>

    <div class="rpt-report-header">
      <div class="rpt-rh-icon" style="background:${r.lightBg};color:${r.color};">
        <i class="fa-solid ${r.icono}"></i>
      </div>
      <div>
        <div class="rpt-rh-title">${r.titulo}</div>
        ${r.subtitulo ? `<div class="rpt-rh-sub">${r.subtitulo}</div>` : ''}
      </div>
    </div>

    <!-- Presets de período -->
    <div class="rpt-presets-bar">
      <span class="rpt-presets-label"><i class="fa-solid fa-clock-rotate-left"></i> Período rápido:</span>
      <button class="rpt-preset active" data-preset="periodo-trabajo">Mes de trabajo</button>
      <button class="rpt-preset" data-preset="este-mes">Este Mes</button>
      <button class="rpt-preset" data-preset="hoy">Hoy</button>
      <button class="rpt-preset" data-preset="semana">Esta Semana</button>
      <button class="rpt-preset" data-preset="quincena">Quincena</button>
      <button class="rpt-preset" data-preset="mes-anterior">Mes Anterior</button>
      <button class="rpt-preset" data-preset="trimestre">Este Trimestre</button>
      <button class="rpt-preset" data-preset="anio">Este Año</button>
    </div>

    <!-- Parámetros -->
    <div class="rpt-params-card">
      <div class="rpt-params-title"><i class="fa-solid fa-sliders"></i> Parámetros del Reporte</div>
      <div class="rpt-params-grid">
        <div>
          <label class="rpt-label"><i class="fa-solid fa-calendar-day"></i> Fecha Desde</label>
          <input type="date" id="rpt-fecha-desde" value="${desde}" required>
        </div>
        <div>
          <label class="rpt-label"><i class="fa-solid fa-calendar-check"></i> Fecha Hasta</label>
          <input type="date" id="rpt-fecha-hasta" value="${hasta}" required>
        </div>
        ${parametrosExtraHTML}
      </div>

      <!-- Selector de color para cabecera del reporte (estilo Word) -->
      <div class="rpt-color-section" id="rpt-color-section">
        <label class="rpt-label"><i class="fa-solid fa-palette"></i> Color de cabecera del reporte</label>
        <button type="button" class="rpt-color-btn" id="rpt-color-btn" data-color="#2C3E50">
          <span class="rpt-color-btn-sw" id="rpt-color-btn-sw" style="background:var(--tx)"></span>
          <span class="rpt-color-btn-label" id="rpt-color-btn-label">#2C3E50</span>
          <i class="fa-solid fa-chevron-down rpt-color-btn-caret"></i>
        </button>
        <input type="color" id="rpt-color-custom" value="#2C3E50" class="rpt-color-input-hidden">
        <div class="rpt-color-popover" id="rpt-color-popover" style="display:none;">
          <div class="rpt-color-grp-title">Colores del tema</div>
          <div class="rpt-color-grid">
            ${RPT_THEME_COLORS.map(c => `<button type="button" class="rpt-color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <div class="rpt-color-grp-title">Colores estándar</div>
          <div class="rpt-color-grid">
            ${RPT_STD_COLORS.map(c => `<button type="button" class="rpt-color-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <button type="button" class="rpt-color-more" id="rpt-color-more">
            <i class="fa-solid fa-palette"></i> Más colores…
          </button>
        </div>
      </div>

      <!-- Botones de acción -->
      <div class="rpt-actions-bar">
        <button class="rpt-btn rpt-btn-preview" id="rpt-btn-preview">
          <i class="fa-solid fa-magnifying-glass"></i> Previsualizar
        </button>
        <button class="rpt-btn rpt-btn-pdf" id="rpt-btn-pdf" disabled>
          <i class="fa-solid fa-file-pdf"></i> Exportar PDF
        </button>
        <button class="rpt-btn rpt-btn-excel" id="rpt-btn-excel" disabled>
          <i class="fa-solid fa-file-excel"></i> Exportar Excel
        </button>
      </div>
    </div>

    <!-- Resumen estadístico -->
    <div id="rpt-resumen" class="rpt-resumen" style="display:none;"></div>

    <!-- Status / errores -->
    <div id="rpt-status" style="display:none;"></div>

    <!-- Preview del reporte -->
    <div id="rpt-preview" class="rpt-preview" style="display:none;"></div>

  </div>
  ${_styles()}`;

  _root.innerHTML = html;

  // ── Bind eventos ──
  document.getElementById('rpt-btn-back').addEventListener('click', _renderHub);

  // Presets
  _root.querySelectorAll('.rpt-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      _root.querySelectorAll('.rpt-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _aplicarPreset(btn.dataset.preset);
    });
  });

  // Previsualizar
  document.getElementById('rpt-btn-preview').addEventListener('click', () => _previsualizar(tipo));

  // PDF
  document.getElementById('rpt-btn-pdf').addEventListener('click', () => _exportarPDF(tipo));

  // Excel
  document.getElementById('rpt-btn-excel').addEventListener('click', () => _exportarExcel(tipo));

  // Selector de color de cabecera (estilo Word: botón → popover → más colores)
  _bindColorPicker();
}

// ── Selector de color de cabecera ───────────────────────────────────────────────
function _setHeaderColor(color) {
  const btn   = document.getElementById('rpt-color-btn');
  const sw    = document.getElementById('rpt-color-btn-sw');
  const label = document.getElementById('rpt-color-btn-label');
  const custom = document.getElementById('rpt-color-custom');
  if (btn)   btn.dataset.color = color;
  if (sw)    sw.style.background = color;
  if (label) label.textContent = color.toUpperCase();
  if (custom) custom.value = color;
  // Marca la muestra activa (si está en la paleta)
  document.querySelectorAll('#rpt-color-popover .rpt-color-swatch').forEach(s =>
    s.classList.toggle('active', (s.dataset.color || '').toLowerCase() === color.toLowerCase()));
}

function _bindColorPicker() {
  const btn     = document.getElementById('rpt-color-btn');
  const popover = document.getElementById('rpt-color-popover');
  const custom  = document.getElementById('rpt-color-custom');
  const more    = document.getElementById('rpt-color-more');
  if (!btn || !popover) return;

  const abrir  = () => { popover.style.display = 'block'; };
  const cerrar = () => { popover.style.display = 'none'; };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.style.display === 'block' ? cerrar() : abrir();
  });

  popover.addEventListener('click', (e) => {
    const swatch = e.target.closest('.rpt-color-swatch');
    if (swatch) { _setHeaderColor(swatch.dataset.color); cerrar(); }
  });

  if (more && custom) {
    more.addEventListener('click', (e) => { e.stopPropagation(); custom.click(); });
    custom.addEventListener('input', (e) => { _setHeaderColor(e.target.value); });
    custom.addEventListener('change', () => cerrar());
  }

  // Cerrar al hacer clic fuera (se enlaza una sola vez a nivel documento)
  if (!_colorOutsideBound) {
    _colorOutsideBound = true;
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('rpt-color-popover');
      const b   = document.getElementById('rpt-color-btn');
      if (pop && pop.style.display === 'block' && !pop.contains(e.target) && b && !b.contains(e.target)) {
        pop.style.display = 'none';
      }
    });
  }

  // Estado inicial
  _setHeaderColor(btn.dataset.color || '#2C3E50');
}

// ── Presets de período ─────────────────────────────────────────────────────────
function _aplicarPreset(preset) {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth(); // 0-based
  let desde, hasta;

  // Formatea un objeto Date a 'YYYY-MM-DD' en hora local
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  switch (preset) {
    case 'periodo-trabajo': {
      ({desde, hasta} = rangoPeriodo(obtenerPeriodoTrabajo()));
      break;
    }
    case 'hoy': {
      desde = iso(hoy);
      hasta = iso(hoy);
      break;
    }
    case 'semana': {
      // Semana actual de lunes a domingo
      const diaSem = (hoy.getDay() + 6) % 7; // 0 = lunes
      const lunes = new Date(anio, mes, hoy.getDate() - diaSem);
      const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
      desde = iso(lunes);
      hasta = iso(domingo);
      break;
    }
    case 'quincena': {
      // 1ra quincena (1–15) o 2da quincena (16–fin de mes) según el día de hoy
      const ultimo = new Date(anio, mes + 1, 0).getDate();
      if (hoy.getDate() <= 15) {
        desde = `${anio}-${String(mes+1).padStart(2,'0')}-01`;
        hasta = `${anio}-${String(mes+1).padStart(2,'0')}-15`;
      } else {
        desde = `${anio}-${String(mes+1).padStart(2,'0')}-16`;
        hasta = `${anio}-${String(mes+1).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;
      }
      break;
    }
    case 'este-mes': {
      const ultimo = new Date(anio, mes + 1, 0).getDate();
      desde = `${anio}-${String(mes+1).padStart(2,'0')}-01`;
      hasta = `${anio}-${String(mes+1).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;
      break;
    }
    case 'mes-anterior': {
      const d = new Date(anio, mes - 1, 1);
      const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      desde = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      hasta = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;
      break;
    }
    case 'trimestre': {
      const trimMes = Math.floor(mes / 3) * 3; // 0,3,6,9
      const ultimoMes = trimMes + 2;
      const ultimoDia = new Date(anio, ultimoMes + 1, 0).getDate();
      desde = `${anio}-${String(trimMes+1).padStart(2,'0')}-01`;
      hasta = `${anio}-${String(ultimoMes+1).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
      break;
    }
    case 'anio': {
      desde = `${anio}-01-01`;
      hasta = `${anio}-12-31`;
      break;
    }
  }

  const dInput = document.getElementById('rpt-fecha-desde');
  const hInput = document.getElementById('rpt-fecha-hasta');
  if (dInput) dInput.value = desde;
  if (hInput) hInput.value = hasta;
}

// ── Obtener parámetros actuales ────────────────────────────────────────────────
function _getParams(tipo) {
  const params = {
    tipo,
    desde: document.getElementById('rpt-fecha-desde')?.value || '',
    hasta: document.getElementById('rpt-fecha-hasta')?.value || '',
  };

  // Origen fijo según el reporte (Registro de Ventas = 14, Compras = 8). El Libro
  // Diario no filtra por origen (muestra todos los libros).
  const cfg = REPORTES[tipo];
  if (cfg && cfg.origenFijo) params.origen = cfg.origenFijo;

  // Tipo de reporte del Libro Diario (Formato 5.1 / 2.0)
  const fmtEl = document.getElementById('rpt-formato-diario');
  if (fmtEl) params.formatoDiario = fmtEl.value || '5.1';

  const cdEl = document.getElementById('rpt-cuenta-desde');
  if (cdEl) params.cuentaDesde = cdEl.value || null;

  const chEl = document.getElementById('rpt-cuenta-hasta');
  if (chEl) params.cuentaHasta = chEl.value || null;

  const nivelEl = document.getElementById('rpt-nivel');
  if (nivelEl) params.nivel = parseInt(nivelEl.value) || 0;

  // Color de cabecera seleccionado (botón estilo Word)
  const colorBtn = document.getElementById('rpt-color-btn');
  const customColor = document.getElementById('rpt-color-custom');
  params.headerColor = colorBtn?.dataset?.color || customColor?.value || '#2C3E50';

  return params;
}

// ── Status bar ─────────────────────────────────────────────────────────────────
function _setStatus(tipo, msg) {
  const el = document.getElementById('rpt-status');
  if (!el) return;
  const estilos = {
    info:    { bg:'var(--accent-lt)', brd:'var(--accent-brd)', color:'var(--accent)', icon:'fa-circle-info' },
    success: { bg:'rgba(var(--ok-rgb),.12)', brd:'rgba(var(--ok-rgb),.28)', color:'var(--ok)', icon:'fa-circle-check' },
    error:   { bg:'rgba(var(--err-rgb),.12)', brd:'rgba(var(--err-rgb),.28)', color:'var(--err)', icon:'fa-circle-xmark' },
    warn:    { bg:'rgba(var(--warn-rgb),.12)', brd:'rgba(var(--warn-rgb),.28)', color:'var(--warn)', icon:'fa-triangle-exclamation' },
    loading: { bg:'var(--bg-ro)', brd:'var(--brd)', color:'var(--accent)', icon:'fa-spinner fa-spin' },
  };
  const s = estilos[tipo] || estilos.info;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;background:${s.bg};border:1px solid ${s.brd};
      color:${s.color};border-radius:8px;padding:12px 16px;font-size:13px;font-weight:500;">
      <i class="fa-solid ${s.icon}" style="font-size:16px;flex-shrink:0;"></i>
      <span>${escapeHTML(msg)}</span>
    </div>`;
  el.style.display = 'block';
}

function _hideStatus() {
  const el = document.getElementById('rpt-status');
  if (el) el.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREVISUALIZAR — Obtiene datos y renderiza tabla + resumen
// ═══════════════════════════════════════════════════════════════════════════════

// Devuelve true (y muestra aviso) si el usuario eligió el Formato 2.0, aún no
// implementado. Evita llamar al backend y muestra un placeholder amable.
function _bloqueadoPorFormato20(tipo, params) {
  if (tipo === 'libro-diario' && String(params.formatoDiario) === '2.0') {
    _setStatus('info', 'El Formato 2.0 del Libro Diario está en construcción. Selecciona "Formato 5.1" para generar el reporte.');
    _previewData = null;
    document.getElementById('rpt-btn-pdf').disabled = true;
    document.getElementById('rpt-btn-excel').disabled = true;
    const pv = document.getElementById('rpt-preview');   if (pv) pv.style.display = 'none';
    const rs = document.getElementById('rpt-resumen');   if (rs) rs.style.display = 'none';
    return true;
  }
  return false;
}

async function _previsualizar(tipo) {
  const params = _getParams(tipo);
  if (!params.desde || !params.hasta) {
    _setStatus('warn', 'Ingrese las fechas del período.');
    return;
  }
  if (params.desde > params.hasta) {
    _setStatus('error', 'La fecha desde no puede ser mayor que hasta.');
    return;
  }
  if (_bloqueadoPorFormato20(tipo, params)) return;

  const btn = document.getElementById('rpt-btn-preview');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
  _setStatus('loading', `Consultando datos del ${fmtFecha(params.desde)} al ${fmtFecha(params.hasta)}...`);

  try {
    let result;
    
    // Config. EEFF y Config. ER son flujos independientes.
    if (tipo === 'notas-eeff' || tipo === 'situacion-financiera') {
      const esfR = await window.api.getESFData({ desde: params.desde, hasta: params.hasta });
      if (tipo === 'notas-eeff') {
        result = { success: true, tipo: 'notas-eeff', data: esfR.notas || [], resumen: { notas: (esfR.notas||[]).length } };
      } else {
        try {
          const baseResult = await window.api.previsualizarReporte(params);
          result = baseResult;
          result._esfNotas = esfR.notas || [];
        } catch(_) {
          result = { success: true, tipo: 'situacion-financiera', data: {}, resumen: {}, _esfNotas: esfR.notas || [] };
        }
      }
    } else if (tipo === 'notas-er') {
      const erR = await window.api.getEstadoResultadosData({ desde: params.desde, hasta: params.hasta });
      result = erR?.success
        ? { success:true, tipo:'notas-er', data:erR.data, resumen:{ notas:(erR.data?.lineas||[]).filter(x=>x.tipo==='nota' && x.nota_numero).length } }
        : { success:false, error:erR?.error || 'No se pudo obtener el Estado de Resultados.' };
    } else {
      result = await window.api.previsualizarReporte(params);
    }

    if (!result.success) {
      _setStatus('error', result.error);
      _previewData = null;
      document.getElementById('rpt-btn-pdf').disabled = true;
      document.getElementById('rpt-btn-excel').disabled = true;
      document.getElementById('rpt-preview').style.display = 'none';
      document.getElementById('rpt-resumen').style.display = 'none';
      return;
    }

    _previewData = result;
    _hideStatus();

    // Habilitar exportación
    document.getElementById('rpt-btn-pdf').disabled = false;
    document.getElementById('rpt-btn-excel').disabled = false;

    // Renderizar resumen
    _renderResumen(result);

    // Renderizar preview
    await _renderPreview(result);

  } catch (err) {
    _setStatus('error', `Error inesperado: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Previsualizar';
  }
}

// ── Resumen estadístico ────────────────────────────────────────────────────────
function _renderResumen(result) {
  const el = document.getElementById('rpt-resumen');
  if (!el) return;

  const r = result.resumen;
  let cards = '';

  switch (result.tipo) {
    case 'registro-ventas':
    case 'registro-compras':
      cards = `
        ${_resumenCard('fa-file-invoice-dollar', 'Comprobantes', r.asientos, '#a0444f')}
        ${_resumenCard('fa-coins', 'Base Gravada', `S/ ${fmt(r.baseGravada)}`, '#2f745c')}
        ${_resumenCard('fa-percent', 'I.G.V.', `S/ ${fmt(r.igv)}`, '#a16d24')}
        ${_resumenCard('fa-sack-dollar', 'Importe Total', `S/ ${fmt(r.importeTotal)}`, '#2f6f8f')}`;
      break;
    case 'libro-diario':
      cards = `
        ${_resumenCard('fa-file-invoice-dollar', 'Asientos', r.asientos, '#2f6f8f')}
        ${_resumenCard('fa-arrow-up', 'Total Debe', `S/ ${fmt(r.totalDebe)}`, '#2f745c')}
        ${_resumenCard('fa-arrow-down', 'Total Haber', `S/ ${fmt(r.totalHaber)}`, '#a0444f')}
        ${_resumenBadge(r.cuadre)}`;
      break;
    case 'libro-mayor':
      cards = `
        ${_resumenCard('fa-book', 'Cuentas', r.cuentas, '#2f745c')}
        ${_resumenCard('fa-list', 'Movimientos', r.movimientos, '#65727f')}
        ${_resumenCard('fa-arrow-up', 'Total Debe', `S/ ${fmt(r.totalDebe)}`, '#2f745c')}
        ${_resumenCard('fa-arrow-down', 'Total Haber', `S/ ${fmt(r.totalHaber)}`, '#a0444f')}`;
      break;
    case 'balance-comprobacion':
      cards = `
        ${_resumenCard('fa-book', 'Cuentas', r.cuentas, '#65727f')}
        ${_resumenCard('fa-arrow-up', 'Σ Debe', `S/ ${fmt(r.totalDebe)}`, '#2f745c')}
        ${_resumenCard('fa-arrow-down', 'Σ Haber', `S/ ${fmt(r.totalHaber)}`, '#a0444f')}
        ${_resumenBadge(r.cuadre)}`;
      break;
    case 'estado-resultados': {
      cards = `${_resumenCard('fa-arrow-trend-up','Ingresos',`S/ ${fmt(r.totalIngresos)}`,'#2f745c')}
        ${_resumenCard('fa-arrow-trend-down','Costos y gastos',`S/ ${fmt(r.totalGastos)}`,'#a0444f')}
        ${_resumenCard(r.resultado>=0?'fa-circle-check':'fa-circle-xmark',r.resultado>=0?'Utilidad neta':'Pérdida neta',`S/ ${fmt(Math.abs(r.resultado))}`,r.resultado>=0?'#2f745c':'#a0444f')}`;
      break;
    }
    case 'notas-er': {
      cards = `${_resumenCard('fa-file-circle-check','Notas ER',Number(r?.notas || 0),'#6b4226')}`;
      break;
    }
    case 'situacion-financiera': {
      const notas = result._esfNotas || [];
      if (notas.length > 0) {
        const cats = { ACTIVO_CORRIENTE:0, ACTIVO_NO_CORRIENTE:0, PASIVO_CORRIENTE:0, PASIVO_NO_CORRIENTE:0, PATRIMONIO:0 };
        notas.forEach(n => { if (cats[n.categoria] !== undefined) cats[n.categoria] += n.total; });
        const tA = cats.ACTIVO_CORRIENTE + cats.ACTIVO_NO_CORRIENTE;
        const tP = cats.PASIVO_CORRIENTE + cats.PASIVO_NO_CORRIENTE;
        const tPat = cats.PATRIMONIO;
        const cuadre = Math.abs(tA - (tP + tPat)) < 0.01;
        cards = `${_resumenCard('fa-building','Total Activo',`S/ ${fmt(tA)}`,'#2f745c')}
          ${_resumenCard('fa-file-invoice','Total Pasivo',`S/ ${fmt(tP)}`,'#a0444f')}
          ${_resumenCard('fa-landmark','Patrimonio',`S/ ${fmt(tPat)}`,'#65727f')}
          ${_resumenBadge(cuadre)}`;
      } else {
        cards = `${_resumenCard('fa-building','Total Activo',`S/ ${fmt(r.totalActivo)}`,'#2f745c')}
          ${_resumenCard('fa-file-invoice','Total Pasivo',`S/ ${fmt(r.totalPasivo)}`,'#a0444f')}
          ${_resumenCard('fa-landmark','Patrimonio',`S/ ${fmt(r.totalPatrimonio)}`,'#65727f')}
          ${_resumenBadge(r.cuadre)}`;
      }
      break;
    }
    case 'notas-eeff': {
      const notas = result.data || [];
      cards = `${_resumenCard('fa-file-lines','Notas',notas.length,'#6b4c8a')}`;
      break;
    }
  }

  const avisoTributario = (result.tipo === 'registro-ventas' || result.tipo === 'registro-compras') && (Number(r?.registrosInferidos||0) || Number(r?.registrosRevision||0))
    ? `<div style="margin-top:8px;padding:8px 11px;border-radius:6px;background:rgba(var(--warn-rgb),.12);color:var(--warn);font-size:10px;"><i class="fa-solid fa-triangle-exclamation"></i> ${Number(r.registrosInferidos||0)?`${r.registrosInferidos} comprobante(s) histórico(s) usan clasificación tributaria inferida. `:''}${Number(r.registrosRevision||0)?`${r.registrosRevision} comprobante(s) están marcados para revisión.`:''}</div>`
    : '';
  el.innerHTML = `<div class="rpt-resumen-grid">${cards}</div>${avisoTributario}`;
  el.style.display = 'block';
}

function _resumenCard(icon, label, value, color) {
  return `
  <div class="rpt-resumen-card">
    <div class="rpt-resumen-icon" style="color:${color}"><i class="fa-solid ${icon}"></i></div>
    <div>
      <div class="rpt-resumen-label">${label}</div>
      <div class="rpt-resumen-value">${value}</div>
    </div>
  </div>`;
}

function _resumenBadge(cuadre) {
  return `
  <div class="rpt-resumen-card" style="background:${cuadre ? 'rgba(var(--ok-rgb),0.08)' : 'rgba(var(--err-rgb),0.08)'};border-color:${cuadre ? 'rgba(var(--ok-rgb),0.2)' : 'rgba(var(--err-rgb),0.2)'};">
    <div class="rpt-resumen-icon" style="color:${cuadre ? '#2f745c' : '#a0444f'}">
      <i class="fa-solid ${cuadre ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
    </div>
    <div>
      <div class="rpt-resumen-label">Estado</div>
      <div class="rpt-resumen-value" style="color:${cuadre ? '#2f745c' : '#a0444f'}">${cuadre ? 'Cuadrado ✓' : 'Descuadrado ✗'}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW TABLE — Renderizado específico por tipo de reporte
// ═══════════════════════════════════════════════════════════════════════════════

async function _renderPreview(result) {
  const el = document.getElementById('rpt-preview');
  if (!el) return;
  const desde = document.getElementById('rpt-desde')?.value || '';
  const hasta = document.getElementById('rpt-hasta')?.value || '';

  let html = '';
  switch (result.tipo) {
    case 'registro-ventas':
      html = _previewRegistroVentas(result.data);
      break;
    case 'registro-compras':
      html = _previewRegistroCompras(result.data);
      break;
    case 'libro-diario':
      html = _previewLibroDiario(result.data);
      break;
    case 'libro-mayor':
      html = _previewLibroMayor(result.data);
      break;
    case 'balance-comprobacion':
      html = _previewBalance(result.data);
      break;
    case 'estado-resultados':
      html = _previewEstadoResultados(result.data);
      break;
    case 'situacion-financiera': {
      const esfNotas = result._esfNotas;
      if (esfNotas && esfNotas.length > 0) {
        html = _previewESFNotas(esfNotas);
      } else {
        html = _previewSituacionFinanciera(result.data);
      }
      break;
    }
    case 'notas-eeff': {
      const esfOnly = (result.data || []).filter(n => !['INGRESOS','GASTOS'].includes(n.categoria));
      html = esfOnly.length > 0 ? _previewNotasDetalle(esfOnly) : '<div class="rpt-empty">No hay notas configuradas para ESF.</div>';
      break;
    }
    case 'notas-er': {
      html = _previewNotasERConfiguradas(result.data);
      break;
    }
  }

  el.innerHTML = `
    <div class="rpt-preview-header">
      <i class="fa-solid fa-table-list"></i> Previsualización
    </div>
    <div class="rpt-preview-scroll">${html}</div>`;
  el.style.display = 'block';
}

// ── Preview: Libro Diario — FORMATO 5.1 SUNAT ────────────────────────────────
// ── Preview: Registro de Compras — FORMATO 8.1 SUNAT ─────────────────────────
function _previewRegistroCompras(data) {
  if (!data || !data.grupos || !data.grupos.length) return '<div class="rpt-empty">Sin datos</div>';
  const m = (n) => `<td style="text-align:right">${Math.abs(Number(n) || 0) > 0.00001 ? fmt(n) : '0.00'}</td>`;
  const c = (v) => `<td style="text-align:center">${escapeHTML(v ?? '')}</td>`;

  let html = '<table class="rpt-table rpt-table-sunat rpt-table-ventas rpt-table-compras">';
  html += `<thead>
    <tr class="rpt-sunat-hdr1">
      <th rowspan="3">N° Correl.</th><th rowspan="3">F. Emisión</th><th rowspan="3">F. Venc./Pago</th>
      <th colspan="3">Comprobante de Pago o Documento</th><th rowspan="3">N° del Comprobante</th>
      <th colspan="3">Información del Proveedor</th>
      <th colspan="2">Op. Gravadas</th><th colspan="2">Op. Gravadas y No Gravadas</th><th colspan="2">Op. No Gravadas</th>
      <th rowspan="3">Valor Adq. No Gravadas</th><th rowspan="3">I.S.C.</th><th rowspan="3">ICBPER</th>
      <th rowspan="3">Otros Tributos</th><th rowspan="3">Importe Total</th><th rowspan="3">N° Comp. No Domic.</th>
      <th colspan="2">Const. Depósito Detracción</th><th rowspan="3">T/C</th><th colspan="4">Referencia del Comprobante</th>
    </tr>
    <tr class="rpt-sunat-hdr2">
      <th rowspan="2">Tipo (T.10)</th><th rowspan="2">Serie / Cód. Dep.</th><th rowspan="2">Año DUA</th>
      <th colspan="2">Doc. de Identidad</th><th rowspan="2">Apellidos y Nombres o Razón Social</th>
      <th rowspan="2">Base Imp.</th><th rowspan="2">IGV</th><th rowspan="2">Base Imp.</th><th rowspan="2">IGV</th><th rowspan="2">Base Imp.</th><th rowspan="2">IGV</th>
      <th rowspan="2">Número</th><th rowspan="2">Fecha</th>
      <th rowspan="2">Fecha</th><th rowspan="2">Tipo (T.10)</th><th rowspan="2">Serie</th><th rowspan="2">N° Comp.</th>
    </tr>
    <tr class="rpt-sunat-hdr2"><th>Tipo (T.2)</th><th>Número</th></tr>
  </thead><tbody>`;

  const filaTot = (etq, t) => `<tr class="rpt-row-subtotal">
      <td colspan="10" style="text-align:right;font-weight:800">${etq}</td>
      ${m(t.g1_base)}${m(t.g1_igv)}${m(t.g2_base)}${m(t.g2_igv)}${m(t.g3_base)}${m(t.g3_igv)}${m(t.valor_no_grav)}${m(t.isc)}${m(t.icbper)}${m(t.otros_tributos)}${m(t.importe_total)}
      <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>`;

  data.grupos.forEach(g => {
    html += `<tr class="rpt-row-header"><td colspan="29">Tipo Doc.: ${escapeHTML(g.td)}&nbsp;&nbsp;&nbsp;${escapeHTML(g.desc || '')}</td></tr>`;
    g.filas.forEach(f => {
      html += `<tr>
        ${c(f.numero)}${c(fmtFecha(f.fecha_emision))}${c(f.fecha_venc ? fmtFecha(f.fecha_venc) : '')}
        ${c(f.td)}${c(f.serie)}${c(f.anio_dua)}${c(f.num_comprobante)}${c(f.prov_doc_tipo)}${c(f.prov_doc_num)}<td>${escapeHTML(f.razon_social)}</td>
        ${m(f.g1_base)}${m(f.g1_igv)}${m(f.g2_base)}${m(f.g2_igv)}${m(f.g3_base)}${m(f.g3_igv)}${m(f.valor_no_grav)}${m(f.isc)}${m(f.icbper)}${m(f.otros_tributos)}${m(f.importe_total)}
        ${c(f.num_no_domic)}${c(f.detrac_num)}${c(f.detrac_fecha ? fmtFecha(f.detrac_fecha) : '')}${c(f.tc ? Number(f.tc).toFixed(3) : '')}
        ${c(f.ref_fecha ? fmtFecha(f.ref_fecha) : '')}${c(f.ref_td)}${c(f.ref_serie)}${c(f.ref_num)}
      </tr>`;
    });
    html += filaTot('TOTALES:', g.totales);
  });
  html += '</tbody></table>';
  return html;
}

// ── Preview: Registro de Ventas — FORMATO 14.1 SUNAT ─────────────────────────
function _previewRegistroVentas(data) {
  if (!data || !data.grupos || !data.grupos.length) return '<div class="rpt-empty">Sin datos</div>';
  const m = (n) => `<td style="text-align:right">${Math.abs(Number(n) || 0) > 0.00001 ? fmt(n) : '0.00'}</td>`;
  const c = (v) => `<td style="text-align:center">${escapeHTML(v ?? '')}</td>`;

  let html = '<table class="rpt-table rpt-table-sunat rpt-table-ventas">';
  html += `<thead>
    <tr class="rpt-sunat-hdr1">
      <th rowspan="3">N° Vou.</th><th rowspan="3">F. Emisión</th><th rowspan="3">F. Venc.</th>
      <th colspan="3">Comprobante de pago</th><th colspan="3">Información del Cliente</th>
      <th rowspan="3">Valor Export.</th><th rowspan="3">Base Gravada</th><th rowspan="3">Dscto. Base</th>
      <th rowspan="3">IGV/IPM</th><th rowspan="3">Dscto. IGV</th><th rowspan="3">Exonerada</th><th rowspan="3">Inafecta</th>
      <th rowspan="3">ISC</th><th rowspan="3">Base IVAP</th><th rowspan="3">IVAP</th><th rowspan="3">ICBPER</th>
      <th rowspan="3">Otros Tributos</th><th rowspan="3">Importe Total</th><th rowspan="3">T/C</th>
      <th colspan="4">Referencia del Comprobante</th>
    </tr>
    <tr class="rpt-sunat-hdr2">
      <th rowspan="2">T/D</th><th rowspan="2">Serie</th><th rowspan="2">Número</th>
      <th colspan="2">Doc. de Identidad</th><th rowspan="2">Apellidos y Nombres o Razón Social</th>
      <th rowspan="2">Fecha</th><th rowspan="2">T/D</th><th rowspan="2">Serie</th><th rowspan="2">Número</th>
    </tr>
    <tr class="rpt-sunat-hdr2"><th>Doc</th><th>Número</th></tr>
  </thead><tbody>`;

  const filaTot = (etq, t) => `<tr class="rpt-row-subtotal">
      <td colspan="9" style="text-align:right;font-weight:800">${etq}</td>
      ${m(t.valor_export)}${m(t.base_gravada)}${m(t.descuento_base)}${m(t.igv)}${m(t.descuento_igv)}${m(t.exonerada)}${m(t.inafecta)}${m(t.isc)}${m(t.base_ivap)}${m(t.ivap)}${m(t.icbper)}${m(t.otros_tributos)}${m(t.importe_total)}
      <td></td><td></td><td></td><td></td><td></td>
    </tr>`;

  data.grupos.forEach(g => {
    html += `<tr class="rpt-row-header"><td colspan="27">Tipo Doc.: ${escapeHTML(g.td)}&nbsp;&nbsp;&nbsp;${escapeHTML(g.desc || '')}</td></tr>`;
    g.filas.forEach(f => {
      html += `<tr>
        ${c(f.numero)}${c(fmtFecha(f.fecha_emision))}${c(f.fecha_venc ? fmtFecha(f.fecha_venc) : '')}${c(f.td)}${c(f.serie)}${c(f.num_comprobante)}
        ${c(f.cli_doc_tipo)}${c(f.cli_doc_num)}<td>${escapeHTML(f.razon_social)}</td>
        ${m(f.valor_export)}${m(f.base_gravada)}${m(f.descuento_base)}${m(f.igv)}${m(f.descuento_igv)}${m(f.exonerada)}${m(f.inafecta)}${m(f.isc)}${m(f.base_ivap)}${m(f.ivap)}${m(f.icbper)}${m(f.otros_tributos)}${m(f.importe_total)}
        ${c(f.tc ? Number(f.tc).toFixed(3) : '')}${c(f.ref_fecha ? fmtFecha(f.ref_fecha) : '')}${c(f.ref_td)}${c(f.ref_serie)}${c(f.ref_num)}
      </tr>`;
    });
    html += filaTot('TOTALES:', g.totales);
  });
  html += '</tbody></table>';
  return html;
}

function _previewLibroDiario(vouchers) {
  if (!vouchers || !vouchers.length) return '<div class="rpt-empty">Sin datos</div>';

  let html = '<table class="rpt-table rpt-table-sunat">';
  html += `<thead>
    <tr class="rpt-sunat-hdr1">
      <th rowspan="2" style="width:50px">N° CORRELATIVO</th>
      <th rowspan="2" style="width:68px">FECHA DE OPERACIÓN</th>
      <th rowspan="2">GLOSA DE LA OPERACIÓN</th>
      <th colspan="3" style="text-align:center;border-bottom:1px solid var(--brd)">REFERENCIA DE LA OPERACIÓN</th>
      <th colspan="2" style="text-align:center;border-bottom:1px solid var(--brd)">CUENTA CONTABLE</th>
      <th colspan="2" style="text-align:center;border-bottom:1px solid var(--brd)">MOVIMIENTO</th>
    </tr>
    <tr class="rpt-sunat-hdr2">
      <th style="width:44px">COD. DEL LIBRO</th>
      <th style="width:48px">N° CORRELATIVO</th>
      <th style="width:60px">N° DOCUMENTO</th>
      <th style="width:50px">CÓDIGO</th>
      <th>DENOMINACIÓN</th>
      <th style="width:72px;text-align:right">DEBE</th>
      <th style="width:72px;text-align:right">HABER</th>
    </tr>
  </thead><tbody>`;

  let granDebe = 0, granHaber = 0;
  vouchers.forEach(v => {
    granDebe += v.total_debe;
    granHaber += v.total_haber;
    // *** Correlativo SIN ceros ***
    const numC = String(v.correlativo || '');
    const fechaOp = v.detalles[0]?.fecha_doc || v.fecha || '';
    // *** Glosa del usuario (detalle > cabecera) ***
    const glosa = v.detalles[0]?.glosa || v.glosa || '';
    const codLib = v.origen || '';
    const numV = String(v.numero).padStart(4, '0');

    v.detalles.forEach((d, idx) => {
      const esPrimera = idx === 0;
      html += `<tr>
        <td style="text-align:center;font-size:10px;">${escapeHTML(esPrimera ? numC : '')}</td>
        <td style="text-align:center;font-size:10px;">${escapeHTML(esPrimera ? fmtFecha(fechaOp) : '')}</td>
        <td class="rpt-td-glosa" style="font-size:10px;">${escapeHTML(esPrimera ? glosa : '')}</td>
        <td style="text-align:center;font-size:10px;">${escapeHTML(esPrimera ? codLib : '')}</td>
        <td style="text-align:center;font-size:10px;">${escapeHTML(esPrimera ? numV : '')}</td>
        <td style="text-align:center;font-size:10px;">${escapeHTML(d.doc_numero || '')}</td>
        <td class="rpt-td-cuenta">${escapeHTML(d.cuenta)}</td>
        <td style="font-size:10px;">${escapeHTML(d.nombre)}</td>
        <td class="rpt-td-debe">${d.debe > 0 ? fmt(d.debe) : ''}</td>
        <td class="rpt-td-haber">${d.haber > 0 ? fmt(d.haber) : ''}</td>
      </tr>`;
    });
  });

  // Solo TOTALES generales (sin subtotales por asiento)
  html += `<tr class="rpt-row-total">
    <td colspan="8" style="text-align:right;font-weight:800;font-size:11px;">TOTALES:</td>
    <td class="rpt-td-debe" style="font-weight:800;font-size:11px;">${fmt(granDebe)}</td>
    <td class="rpt-td-haber" style="font-weight:800;font-size:11px;">${fmt(granHaber)}</td>
  </tr>`;

  html += '</tbody></table>';
  return html;
}

// ── Preview: Libro Mayor — FORMATO 6.1 SUNAT ─────────────────────────────────
function _previewLibroMayor(cuentas) {
  if (!cuentas || !cuentas.length) return '<div class="rpt-empty">Sin datos</div>';

  let html = `
    <table class="rpt-table rpt-table-sunat rpt-table-mayor">
      <thead>
        <tr>
          <th rowspan="2" style="width:90px">FECHA DE LA OPERACIÓN</th>
          <th rowspan="2" style="width:130px">NÚMERO CORRELATIVO DEL LIBRO DIARIO (2)</th>
          <th rowspan="2">DESCRIPCIÓN O GLOSA DE LA OPERACIÓN</th>
          <th colspan="2">SALDOS Y MOVIMIENTOS</th>
        </tr>
        <tr>
          <th style="width:100px;text-align:right">DEUDOR</th>
          <th style="width:100px;text-align:right">ACREEDOR</th>
        </tr>
      </thead><tbody>`;

  cuentas.forEach(c => {
    html += `<tr class="rpt-row-header"><td colspan="5">CÓDIGO Y/O DENOMINACIÓN DE LA CUENTA CONTABLE: ${escapeHTML(c.cuenta)} - ${escapeHTML(c.nombre)}</td></tr>`;
    c.movimientos.forEach(m => {
      const ref = m.doc_numero ? `${m.doc_tipo} ${m.doc_numero}` : '';
      const glosa = (m.glosa || '') + (ref ? `  ·  ${ref}` : '');
      html += `<tr>
        <td style="text-align:center">${escapeHTML(fmtFecha(m.fecha))}</td>
        <td style="text-align:center">${escapeHTML(m.numero)}</td>
        <td class="rpt-td-glosa">${escapeHTML(glosa)}</td>
        <td style="text-align:right">${m.debe > 0 ? fmt(m.debe) : ''}</td>
        <td style="text-align:right">${m.haber > 0 ? fmt(m.haber) : ''}</td>
      </tr>`;
    });
    html += `<tr class="rpt-row-subtotal">
        <td colspan="3" style="text-align:right;font-weight:800">TOTALES</td>
        <td style="text-align:right;font-weight:800">${fmt(c.total_debe)}</td>
        <td style="text-align:right;font-weight:800">${fmt(c.total_haber)}</td>
      </tr>`;
  });

  html += '</tbody></table>';
  return html;
}

// ── Preview: Balance de Comprobación ─────────────────────────────────────────
function _previewBalance(cuentas) {
  if (!cuentas || !cuentas.length) return '<div class="rpt-empty">Sin datos</div>';
  let totD=0,totH=0,totDr=0,totAc=0,tAct=0,tPas=0,tNP=0,tNG=0,tFP=0,tFG=0;
  const v = (n) => n > 0.005 ? fmt(n) : '';
  const rs = 'text-align:right;font-size:11px;padding:5px 6px;';

  let html = `<div style="overflow-x:auto;">
  <table class="rpt-table" style="min-width:1100px;">
    <thead>
      <tr>
        <th rowspan="2" style="width:55px;">CTA.</th>
        <th rowspan="2">DENOMINACIÓN</th>
        <th colspan="2" style="text-align:center;">MOVIMIENTOS</th>
        <th colspan="2" style="text-align:center;">SALDOS</th>
        <th colspan="2" style="text-align:center;">CUENTAS</th>
        <th colspan="2" style="text-align:center;">NATURALEZA</th>
        <th colspan="2" style="text-align:center;">FUNCIÓN</th>
      </tr>
      <tr>
        <th style="width:78px;text-align:right;">Débito</th><th style="width:78px;text-align:right;">Crédito</th>
        <th style="width:78px;text-align:right;">Deudor</th><th style="width:78px;text-align:right;">Acreedor</th>
        <th style="width:78px;text-align:right;">Activo</th><th style="width:78px;text-align:right;">Pasivo</th>
        <th style="width:78px;text-align:right;">Pérdida</th><th style="width:78px;text-align:right;">Ganancia</th>
        <th style="width:78px;text-align:right;">Pérdida</th><th style="width:78px;text-align:right;">Ganancia</th>
      </tr>
    </thead><tbody>`;

  cuentas.forEach(c=>{
    totD+=c.sum_debe;totH+=c.sum_haber;totDr+=c.saldo_deudor;totAc+=c.saldo_acreedor;
    tAct+=(c.activo||0);tPas+=(c.pasivo||0);tNP+=(c.nat_perdida||0);tNG+=(c.nat_ganancia||0);tFP+=(c.fun_perdida||0);tFG+=(c.fun_ganancia||0);
    html+=`<tr><td class="rpt-td-cuenta">${escapeHTML(c.cuenta)}</td><td>${escapeHTML(c.nombre)}</td>
      <td style="${rs}">${v(c.sum_debe)}</td><td style="${rs}">${v(c.sum_haber)}</td>
      <td style="${rs}font-weight:600;color:var(--ok)">${v(c.saldo_deudor)}</td><td style="${rs}font-weight:600;color:var(--err)">${v(c.saldo_acreedor)}</td>
      <td style="${rs}">${v(c.activo||0)}</td><td style="${rs}">${v(c.pasivo||0)}</td>
      <td style="${rs}color:var(--err)">${v(c.nat_perdida||0)}</td><td style="${rs}color:var(--ok)">${v(c.nat_ganancia||0)}</td>
      <td style="${rs}color:var(--err)">${v(c.fun_perdida||0)}</td><td style="${rs}color:var(--ok)">${v(c.fun_ganancia||0)}</td></tr>`;
  });
  const gan=tNG-tNP; const ts='text-align:right;font-weight:700;font-size:11px;padding:6px 6px;';
  html+=`<tr style="background:var(--bg-block,#f4f8fc);"><td colspan="2" style="text-align:right;font-weight:800;padding:6px;">SUBTOTALES</td>
    <td style="${ts}">${fmt(totD)}</td><td style="${ts}">${fmt(totH)}</td><td style="${ts}color:var(--ok)">${fmt(totDr)}</td><td style="${ts}color:var(--err)">${fmt(totAc)}</td>
    <td style="${ts}">${fmt(tAct)}</td><td style="${ts}">${fmt(tPas)}</td><td style="${ts}color:var(--err)">${fmt(tNP)}</td><td style="${ts}color:var(--ok)">${fmt(tNG)}</td>
    <td style="${ts}color:var(--err)">${fmt(tFP)}</td><td style="${ts}color:var(--ok)">${fmt(tFG)}</td></tr>`;
  html+=`<tr style="background:#fff8e1;"><td colspan="6" style="text-align:right;font-weight:700;padding:6px;">GANANCIA O PÉRDIDA DEL EJERCICIO</td>
    <td style="${ts}">${v(tAct<tPas?tPas-tAct:0)}</td><td style="${ts}">${v(tAct>tPas?tAct-tPas:0)}</td><td style="${ts}color:var(--err)">${v(tNG>tNP?tNG-tNP:0)}</td><td style="${ts}color:var(--ok)">${v(tNP>tNG?tNP-tNG:0)}</td>
    <td style="${ts}color:var(--err)">${v(tFG>tFP?tFG-tFP:0)}</td><td style="${ts}color:var(--ok)">${v(tFP>tFG?tFP-tFG:0)}</td></tr>`;
  html+=`<tr class="rpt-row-total"><td colspan="6" style="text-align:right;font-weight:800;padding:6px;">TOTALES</td>
    <td style="${ts}">${fmt(Math.max(tAct,tPas))}</td><td style="${ts}">${fmt(Math.max(tAct,tPas))}</td>
    <td style="${ts}color:var(--err)">${fmt(Math.max(tNP,tNG))}</td><td style="${ts}color:var(--ok)">${fmt(Math.max(tNP,tNG))}</td>
    <td style="${ts}color:var(--err)">${fmt(Math.max(tFP,tFG))}</td><td style="${ts}color:var(--ok)">${fmt(Math.max(tFP,tFG))}</td></tr>`;
  html+='</tbody></table></div>';
  return html;
}

// ── Preview: Estado de Resultados ────────────────────────────────────────────
function _fmtERPreview(n) {
  const value = Number(n || 0);
  if (value < -0.005) return `(S/ ${fmt(Math.abs(value))})`;
  return `S/ ${fmt(value)}`;
}

function _previewEstadoResultados(data) {
  if (!data?.lineas?.length) return '<div class="rpt-empty">Sin estructura de Estado de Resultados.</div>';

  const rows = data.lineas.map(l => {
    if (l.tipo === 'subtotal') {
      return `<tr class="rpt-er-fixed-total ${l.final ? 'is-final' : ''}">
        <td colspan="2">${escapeHTML(l.label)}</td>
        <td class="rpt-er-money">${_fmtERPreview(l.importe)}</td>
      </tr>`;
    }
    return `<tr class="rpt-er-fixed-row">
      <td>${escapeHTML(l.nombre || l.label || '')}</td>
      <td class="rpt-er-note">${escapeHTML(l.numero || l.nota_numero || '')}</td>
      <td class="rpt-er-money ${Number(l.importe)<0?'is-negative':''}">${_fmtERPreview(l.importe)}</td>
    </tr>`;
  }).join('');

  return `<div class="rpt-er-statement">
    <div class="rpt-er-statement-head"><i class="fa-solid fa-chart-line"></i> ESTADO DE RESULTADOS</div>
    <table class="rpt-er-fixed-table">
      <thead><tr><th>RUBRO</th><th>NOTA</th><th>IMPORTE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _previewNotasERConfiguradas(data) {
  const rubros = (data?.lineas || []).filter(l => l.tipo === 'nota' && l.nota_numero && (l.cuentas || []).length);
  if (!rubros.length) return '<div class="rpt-empty">No hay notas asignadas en Config. ER.</div>';
  return `<div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">${rubros.map(r => `
    <div style="border:1px solid var(--brd);border-radius:8px;overflow:hidden;background:var(--bg-card);">
      <div style="background:#223247;color:#fff;padding:9px 12px;font-size:11px;font-weight:800;">${escapeHTML(r.nota_numero)} · ${escapeHTML(r.nombre || r.label || '')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
        <thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--brd);">Cuenta</th><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--brd);">Denominación</th><th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--brd);">Naturaleza</th></tr></thead>
        <tbody>${(r.detalle||[]).map(d => `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--brd-lt);color:var(--accent);font-weight:700;">${escapeHTML(d.cuenta)}</td><td style="padding:6px 8px;border-bottom:1px solid var(--brd-lt);">${escapeHTML(d.nombre||'Sin denominación')}</td><td style="padding:6px 8px;border-bottom:1px solid var(--brd-lt);text-align:right;">${_fmtERPreview(d.importe)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2" style="padding:7px 8px;text-align:right;font-weight:800;">TOTAL</td><td style="padding:7px 8px;text-align:right;font-weight:800;">${_fmtERPreview(r.importe)}</td></tr></tfoot>
      </table>
    </div>`).join('')}</div>`;
}

// ── Preview: Estado de Situación Financiera (EDITABLE) ──────────────────────
function _previewSituacionFinanciera(data) {
  if (!data) return '<div class="rpt-empty">Sin datos</div>';

  const editInput = (val, id) => `<input type="number" class="esf-edit" data-id="${id}" value="${Number(val||0).toFixed(2)}" step="0.01" style="width:100px;text-align:right;padding:3px 6px;border:1px solid var(--brd,#c0ccd8);border-radius:4px;font-size:11px;font-weight:600;background:var(--bg-input,#fff);">`;

  function seccion(titulo, items, totalKey, color, prefix) {
    let h = `<div style="margin-bottom:14px;">
      <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <i class="fa-solid fa-folder-open" style="font-size:11px;"></i> ${titulo}
      </div>`;
    items.forEach((item, i) => {
      h += `<div style="display:flex;align-items:center;padding:4px 0 4px 16px;border-bottom:1px solid var(--brd-lt,#eef2f6);gap:8px;">
        <span style="width:40px;font-size:11px;font-weight:600;color:var(--tx3);">${escapeHTML(item.cuenta)}</span>
        <input type="text" class="esf-edit-nombre" value="${escapeHTML(item.nombre || '')}" style="flex:1;padding:3px 6px;border:1px solid var(--brd,#c0ccd8);border-radius:4px;font-size:11px;background:var(--bg-input,#fff);">
        ${editInput(item.importe, `${prefix}_${i}`)}
      </div>`;
    });
    const total = items.reduce((s, r) => s + (Number(r.importe) || 0), 0);
    h += `<div style="display:flex;align-items:center;padding:6px 0;font-weight:700;">
      <span style="flex:1;text-align:right;font-size:11px;color:${color};padding-right:8px;">Total ${titulo}</span>
      <span class="esf-total" data-total="${totalKey}" style="width:100px;text-align:right;font-size:12px;font-weight:800;color:${color};">S/ ${fmt(total)}</span>
    </div></div>`;
    return h;
  }

  // Patrimonio con resultado del ejercicio
  const patrimonioItems = [...data.patrimonio];
  if (data.resultadoEjercicio !== 0) {
    patrimonioItems.push({ cuenta: '', nombre: data.resultadoEjercicio >= 0 ? 'Resultado del Ejercicio (Utilidad)' : 'Resultado del Ejercicio (Pérdida)', importe: data.resultadoEjercicio });
  }

  let html = `
  <div style="padding:8px 0;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(var(--accent-rgb),.06);border:1px solid rgba(var(--accent-rgb),.15);border-radius:6px;">
      <i class="fa-solid fa-pencil" style="color:var(--accent);"></i>
      <span style="font-size:11px;color:var(--accent);font-weight:600;">Los importes son editables. Modifique los valores si necesita ajustar antes de exportar.</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:0 16px;">
      <div style="padding:8px 12px;background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;">
        <div style="font-size:15px;font-weight:800;color:#223247;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #223247;">
          <i class="fa-solid fa-building"></i> ACTIVO
        </div>
        ${seccion('Activo Corriente', data.activoCorriente, 'actCorr', '#2f745c', 'ac')}
        ${seccion('Activo No Corriente', data.activoNoCorriente, 'actNoCorr', '#2f745c', 'anc')}
        <div style="display:flex;align-items:center;padding:10px 14px;background:#223247;color:#fff;border-radius:6px;margin-top:8px;">
          <span style="flex:1;text-align:right;font-weight:800;font-size:12px;padding-right:10px;">TOTAL ACTIVO</span>
          <span class="esf-total" data-total="totalActivo" style="width:110px;text-align:right;font-weight:800;font-size:13px;">S/ ${fmt(data.totalActivo)}</span>
        </div>
      </div>
      <div style="padding:8px 12px;background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;">
        <div style="font-size:15px;font-weight:800;color:#223247;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #223247;">
          <i class="fa-solid fa-file-invoice"></i> PASIVO Y PATRIMONIO
        </div>
        ${seccion('Pasivo', data.pasivo, 'pasivo', '#a0444f', 'pas')}
        ${seccion('Patrimonio', patrimonioItems, 'patrimonio', '#65727f', 'pat')}
        <div style="display:flex;align-items:center;padding:10px 14px;background:#223247;color:#fff;border-radius:6px;margin-top:8px;">
          <span style="flex:1;text-align:right;font-weight:800;font-size:12px;padding-right:10px;">TOTAL PASIVO Y PATRIMONIO</span>
          <span class="esf-total" data-total="totalPP" style="width:110px;text-align:right;font-weight:800;font-size:13px;">S/ ${fmt(data.totalPasivoPatrimonio)}</span>
        </div>
      </div>
    </div>
    <div id="esf-cuadre" style="margin-top:12px;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:700;text-align:center;
      background:${data.cuadre ? 'rgba(var(--ok-rgb),.08)' : 'rgba(var(--err-rgb),.08)'};
      color:${data.cuadre ? '#2f745c' : '#a0444f'};
      border:1px solid ${data.cuadre ? 'rgba(var(--ok-rgb),.2)' : 'rgba(var(--err-rgb),.2)'};">
      <i class="fa-solid ${data.cuadre ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
      ${data.cuadre ? 'CUADRADO' : 'DESCUADRADO'} — Activo: S/ ${fmt(data.totalActivo)} | Pasivo + Patrimonio: S/ ${fmt(data.totalPasivoPatrimonio)}
    </div>
  </div>`;

  // Después de renderizar, agregar listeners para recalcular totales al editar
  setTimeout(() => {
    document.querySelectorAll('.esf-edit').forEach(input => {
      input.addEventListener('input', () => {
        // Recalcular totales por sección
        const recalc = (prefix) => {
          let total = 0;
          document.querySelectorAll(`.esf-edit[data-id^="${prefix}_"]`).forEach(inp => {
            total += parseFloat(inp.value) || 0;
          });
          return total;
        };
        const tAC = recalc('ac'), tANC = recalc('anc'), tPas = recalc('pas'), tPat = recalc('pat');
        const tActivo = tAC + tANC;
        const tPP = tPas + tPat;
        // Actualizar displays
        const upd = (key, val) => { const el = document.querySelector(`.esf-total[data-total="${key}"]`); if (el) el.textContent = `S/ ${fmt(val)}`; };
        upd('actCorr', tAC); upd('actNoCorr', tANC); upd('totalActivo', tActivo);
        upd('pasivo', tPas); upd('patrimonio', tPat); upd('totalPP', tPP);
        // Cuadre
        const cuadre = Math.abs(tActivo - tPP) < 0.01;
        const el = document.getElementById('esf-cuadre');
        if (el) {
          el.style.background = cuadre ? 'rgba(var(--ok-rgb),.08)' : 'rgba(var(--err-rgb),.08)';
          el.style.color = cuadre ? '#2f745c' : '#a0444f';
          el.style.borderColor = cuadre ? 'rgba(var(--ok-rgb),.2)' : 'rgba(var(--err-rgb),.2)';
          el.innerHTML = `<i class="fa-solid ${cuadre?'fa-circle-check':'fa-triangle-exclamation'}"></i> ${cuadre?'CUADRADO':'DESCUADRADO'} — Activo: S/ ${fmt(tActivo)} | Pasivo + Patrimonio: S/ ${fmt(tPP)}`;
        }
      });
    });
  }, 100);

  return html;
}
// ═══════════════════════════════════════════════════════════════════════════════

async function _exportarPDF(tipo) {
  const params = _getParams(tipo);
  if (_bloqueadoPorFormato20(tipo, params)) return;
  const btn = document.getElementById('rpt-btn-pdf');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
  _setStatus('loading', 'Generando PDF...');

  try {
    const result = await window.api.generarReportePDF(params);
    if (!result.success) {
      _setStatus('error', result.error);
      return;
    }

    _setStatus('info', 'PDF generado. Seleccione dónde guardar...');
    const guardar = await window.api.guardarPDF({
      filePath: result.filePath, defaultName: result.fileName,
    });

    if (guardar.canceled) {
      _setStatus('warn', 'Guardado cancelado.');
      return;
    }
    if (!guardar.success) {
      _setStatus('error', guardar.error || 'Error al guardar.');
      return;
    }

    _setStatus('success', `✓ PDF guardado en: ${guardar.savedPath}`);
  } catch (err) {
    _setStatus('error', `Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Exportar PDF';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTAR EXCEL
// ═══════════════════════════════════════════════════════════════════════════════

async function _exportarExcel(tipo) {
  const params = _getParams(tipo);
  if (_bloqueadoPorFormato20(tipo, params)) return;
  const btn = document.getElementById('rpt-btn-excel');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
  _setStatus('loading', 'Generando archivo Excel...');

  try {
    const result = await window.api.exportarReporteExcel(params);
    if (!result.success) {
      _setStatus('error', result.error);
      return;
    }

    _setStatus('info', 'Excel generado. Seleccione dónde guardar...');
    const guardar = await window.api.guardarExcel({
      filePath: result.filePath, defaultName: result.fileName,
    });

    if (guardar.canceled) {
      _setStatus('warn', 'Guardado cancelado.');
      return;
    }
    if (!guardar.success) {
      _setStatus('error', guardar.error || 'Error al guardar.');
      return;
    }

    _setStatus('success', `✓ Excel guardado en: ${guardar.savedPath}`);
  } catch (err) {
    _setStatus('error', `Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> Exportar Excel';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS
// ═══════════════════════════════════════════════════════════════════════════════


// ── Preview: Estado de Situación Financiera basado en Notas ──────────────────
function _previewESFNotas(notas) {
  if (!notas || !notas.length) return '<div class="rpt-empty">No hay notas configuradas. Vaya a Config. EEFF para crear notas.</div>';
  const f = (n) => n !== 0 ? fmt(Math.abs(n)) : '0.00';
  const cats = {
    ACTIVO_CORRIENTE: { label: 'ACTIVO CORRIENTE', items: [], total: 0 },
    ACTIVO_NO_CORRIENTE: { label: 'ACTIVO NO CORRIENTE', items: [], total: 0 },
    PASIVO_CORRIENTE: { label: 'PASIVO CORRIENTE', items: [], total: 0 },
    PASIVO_NO_CORRIENTE: { label: 'PASIVO NO CORRIENTE', items: [], total: 0 },
    PATRIMONIO: { label: 'PATRIMONIO', items: [], total: 0 },
  };
  notas.forEach(n => { if (cats[n.categoria]) { cats[n.categoria].items.push(n); cats[n.categoria].total += n.total; } });
  const totalActCorr = cats.ACTIVO_CORRIENTE.total;
  const totalActNoCorr = cats.ACTIVO_NO_CORRIENTE.total;
  const totalActivo = totalActCorr + totalActNoCorr;
  const totalPasCorr = cats.PASIVO_CORRIENTE.total;
  const totalPasNoCorr = cats.PASIVO_NO_CORRIENTE.total;
  const totalPasivo = totalPasCorr + totalPasNoCorr;
  const totalPatrimonio = cats.PATRIMONIO.total;
  const totalPP = totalPasivo + totalPatrimonio;
  const cuadra = Math.abs(totalActivo - totalPP) < 0.01;

  const notaRow = (n) => `<tr><td style="padding:4px 14px;font-size:12px;">${escapeHTML(n.nombre)}</td><td style="padding:4px 8px;font-size:10px;color:var(--accent);white-space:nowrap;">${escapeHTML(n.numero)}</td><td style="padding:4px 14px;text-align:right;font-weight:600;font-size:12px;">${f(n.total)}</td></tr>`;
  const secHeader = (label) => `<tr><td colspan="3" style="padding:8px 14px 4px;font-weight:800;font-size:13px;color:#223247;border-bottom:2px solid var(--sb-active,#2f6f8f);">${label}</td></tr>`;
  const totalRow = (label, val, bold) => `<tr style="background:${bold?'#223247':'var(--bg-block,#f4f8fc)'};"><td colspan="2" style="padding:${bold?'10px 14px':'6px 14px'};font-weight:${bold?800:700};font-size:${bold?'13px':'12px'};color:${bold?'#fff':'var(--tx)'};text-align:right;">${label}</td><td style="padding:${bold?'10px 14px':'6px 14px'};text-align:right;font-weight:800;font-size:${bold?'13px':'12px'};color:${bold?'#fff':'var(--tx)'};">${f(val)}</td></tr>`;

  return `<div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
    <div style="border:1px solid var(--brd);border-radius:8px;overflow:hidden;background:var(--bg-card,#fff);">
      <div style="padding:10px 14px;background:#223247;color:#fff;font-weight:800;font-size:14px;"><i class="fa-solid fa-building" style="margin-right:6px;"></i> ACTIVO</div>
      <table style="width:100%;border-collapse:collapse;">
        ${secHeader('ACTIVO CORRIENTE')}
        ${cats.ACTIVO_CORRIENTE.items.map(notaRow).join('')}
        ${totalRow('TOTAL ACTIVO CORRIENTE', totalActCorr, false)}
        ${secHeader('ACTIVO NO CORRIENTE')}
        ${cats.ACTIVO_NO_CORRIENTE.items.map(notaRow).join('')}
        ${totalRow('TOTAL ACTIVO NO CORRIENTE', totalActNoCorr, false)}
        ${totalRow('TOTAL ACTIVO', totalActivo, true)}
      </table>
    </div>
    <div style="border:1px solid var(--brd);border-radius:8px;overflow:hidden;background:var(--bg-card,#fff);">
      <div style="padding:10px 14px;background:#223247;color:#fff;font-weight:800;font-size:14px;"><i class="fa-solid fa-file-invoice" style="margin-right:6px;"></i> PASIVO Y PATRIMONIO</div>
      <table style="width:100%;border-collapse:collapse;">
        ${secHeader('PASIVO CORRIENTE')}
        ${cats.PASIVO_CORRIENTE.items.map(notaRow).join('')}
        ${totalRow('TOTAL PASIVO CORRIENTE', totalPasCorr, false)}
        ${secHeader('PASIVO NO CORRIENTE')}
        ${cats.PASIVO_NO_CORRIENTE.items.map(notaRow).join('')}
        ${totalRow('TOTAL PASIVO NO CORRIENTE', totalPasNoCorr, false)}
        ${totalRow('TOTAL PASIVO', totalPasivo, false)}
        ${secHeader('PATRIMONIO')}
        ${cats.PATRIMONIO.items.map(notaRow).join('')}
        ${totalRow('TOTAL PATRIMONIO', totalPatrimonio, false)}
        ${totalRow('TOTAL PASIVO Y PATRIMONIO', totalPP, true)}
      </table>
    </div>
  </div>
  <div style="margin:8px 20px;padding:10px 16px;border-radius:6px;font-size:12px;font-weight:700;text-align:center;background:${cuadra?'rgba(var(--ok-rgb),.08);color:var(--ok)':'rgba(var(--err-rgb),.08);color:var(--err)'};">
    ${cuadra?'<i class="fa-solid fa-circle-check"></i> CUADRADO':'<i class="fa-solid fa-triangle-exclamation"></i> DESCUADRADO'} — Activo: S/ ${f(totalActivo)} | Pasivo + Patrimonio: S/ ${f(totalPP)}
  </div>`;
}

// ── Preview: Detalle de Notas ──────────────────────────────────────────────────
function _previewNotasDetalle(notas) {
  if (!notas || !notas.length) return '<div class="rpt-empty">No hay notas configuradas.</div>';
  const f = (n) => n !== 0 ? fmt(Math.abs(n)) : '0.00';
  const catLabels = { ACTIVO_CORRIENTE:'Activo Corriente', ACTIVO_NO_CORRIENTE:'Activo No Corriente', PASIVO_CORRIENTE:'Pasivo Corriente', PASIVO_NO_CORRIENTE:'Pasivo No Corriente', PATRIMONIO:'Patrimonio' };

  const notaCard = (n) => `<div style="border:1px solid var(--brd);border-radius:8px;overflow:hidden;break-inside:avoid;">
    <div style="padding:10px 14px;background:var(--bg-block,#f4f8fc);border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center;">
      <div><span style="font-weight:700;color:var(--accent);margin-right:8px;font-size:12px;">${escapeHTML(n.numero)}</span><span style="font-weight:600;font-size:12px;">${escapeHTML(n.nombre)}</span>
        <span style="font-size:9px;color:var(--tx3);margin-left:8px;">(${catLabels[n.categoria]||''})</span></div>
      <span style="font-weight:700;font-size:13px;color:#223247;">S/ ${f(n.total)}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#223247;color:#fff;">
        <th style="padding:5px 10px;text-align:left;font-size:9px;font-weight:700;">CUENTA</th>
        <th style="padding:5px 10px;text-align:left;font-size:9px;font-weight:700;">DENOMINACIÓN</th>
        <th style="padding:5px 10px;text-align:right;font-size:9px;font-weight:700;">SALDO</th>
      </tr></thead>
      <tbody>${n.detalle.map((d,i) => `<tr style="background:${i%2===0?'#fff':'var(--bg-stripe,#f8fafc)'};">
        <td style="padding:4px 10px;font-weight:600;color:var(--accent);">${escapeHTML(d.codigo)}</td>
        <td style="padding:4px 10px;color:var(--tx2);">${escapeHTML(d.nombre || '—')}</td>
        <td style="padding:4px 10px;text-align:right;font-weight:600;">${f(d.saldo)}</td>
      </tr>`).join('')}
      <tr style="background:var(--bg-block);font-weight:700;border-top:2px solid var(--brd);">
        <td colspan="2" style="padding:6px 10px;text-align:right;font-size:11px;">Total ${escapeHTML(n.nombre)}</td>
        <td style="padding:6px 10px;text-align:right;font-size:11px;">S/ ${f(n.total)}</td>
      </tr></tbody>
    </table>
  </div>`;

  // Render 2 per row
  let html = '<div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">';
  notas.forEach(n => { html += notaCard(n); });
  html += '</div>';
  return html;
}


function _styles() {
  return `<style>
/* ════════ Centro de Reportes — Estilos ════════ */
.rpt-wrap {
  padding: 0 0 32px 0; display: flex; flex-direction: column; gap: 16px;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

/* ── Hero ── */
.rpt-hero {
  position: relative; overflow: hidden; border-radius: 8px;
  background: var(--brand-grad);
  padding: 20px 26px; box-shadow: 0 12px 28px rgba(28,39,51,0.16);
}
.rpt-hero-bg {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(255,255,255,0.04), transparent);
}
.rpt-hero-content { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.rpt-hero-left { display: flex; align-items: center; gap: 16px; }
.rpt-hero-icon {
  width: 48px; height: 48px; border-radius: 8px;
  background: rgba(255,255,255,0.13); border: 1px solid rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff;
}
.rpt-hero-title { font-size: 18px; font-weight: 800; color: #fff; }
.rpt-hero-sub   { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 2px; }
.rpt-hero-badges{ display: flex; gap: 8px; }
.rpt-hero-badge {
  padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); border: 1px solid rgba(255,255,255,0.18);
  display: flex; align-items: center; gap: 6px;
}
body.dark-mode .rpt-hero { background: var(--brand-grad); }

/* ── Categorías y tarjetas del hub ── */
.rpt-categoria { display: flex; flex-direction: column; gap: 10px; }
.rpt-cat-titulo {
  font-size: 11px; font-weight: 700; color: var(--tx3); text-transform: uppercase;
  letter-spacing:0; display: flex; align-items: center; gap: 8px;
}
.rpt-cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (max-width: 900px) { .rpt-cards-grid { grid-template-columns: 1fr; } }

.rpt-card {
  background: var(--bg-card); border: 1px solid var(--brd); border-radius: 8px;
  overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: var(--shd); position: relative;
}
.rpt-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.09); }
.rpt-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.rpt-card-body { display: flex; align-items: center; gap: 16px; padding: 18px 20px; }
.rpt-card-icon {
  width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.rpt-card-info { flex: 1; min-width: 0; }
.rpt-card-title { font-size: 14px; font-weight: 700; color: var(--tx); }
.rpt-card-desc { font-size: 11px; color: var(--tx3); margin-top: 2px; line-height: 1.4; }
.rpt-card-arrow { color: var(--tx3); font-size: 12px; }

/* ── Panel de reporte ── */
.rpt-header-bar { display: flex; align-items: center; }
.rpt-btn-back {
  background: var(--bg-card); border: 1px solid var(--brd); color: var(--tx2);
  padding: 7px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; gap: 8px;
  transition: all 0.15s;
}
.rpt-btn-back:hover { color: var(--accent); border-color: var(--accent); }

.rpt-report-header {
  display: flex; align-items: center; gap: 16px;
  background: var(--bg-card); border: 1px solid var(--brd); border-radius: 8px;
  padding: 18px 22px; box-shadow: var(--shd);
}
.rpt-rh-icon {
  width: 48px; height: 48px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.rpt-rh-title { font-size: 17px; font-weight: 700; color: var(--tx); }
.rpt-rh-sub   { font-size: 12px; color: var(--tx3); margin-top: 2px; }

/* ── Presets ── */
.rpt-presets-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.rpt-presets-label { font-size: 11px; font-weight: 600; color: var(--tx3); display: flex; align-items: center; gap: 6px; }
.rpt-preset {
  padding: 5px 14px; border-radius: 20px; border: 1px solid var(--brd);
  background: var(--bg-card); color: var(--tx2); font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.rpt-preset:hover  { border-color: var(--accent); color: var(--accent); }
.rpt-preset.active { background:var(--btn-primary); color: #fff; border-color: var(--accent); }

/* ── Parámetros ── */
.rpt-params-card {
  background: var(--bg-card); border: 1px solid var(--brd); border-radius: 8px;
  padding: 20px 24px; box-shadow: var(--shd);
}
.rpt-params-title {
  font-size: 11px; font-weight: 700; color: var(--tx2); text-transform: uppercase;
  letter-spacing:0; display: flex; align-items: center; gap: 8px;
  margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--brd-lt);
}
.rpt-params-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-bottom: 18px; }
.rpt-label {
  font-size: 11px; font-weight: 700; color: var(--tx-lbl); text-transform: uppercase;
  letter-spacing:0; display: block; margin-bottom: 6px;
}
.rpt-label i { margin-right: 5px; color: var(--accent); }
.rpt-opt { font-weight: 400; text-transform: none; color: var(--tx3); font-size: 10px; }

/* ── Selector de color (estilo Word) ── */
.rpt-color-section {
  margin-bottom: 14px; padding-top: 4px; position: relative;
}
.rpt-color-btn {
  display: inline-flex; align-items: center; gap: 9px; margin-top: 6px;
  padding: 7px 12px; border: 1px solid var(--brd, #c0ccd8); border-radius: 8px;
  background: var(--bg-card, #fff); cursor: pointer; font-size: 12px; font-weight: 600;
  color: var(--tx, #182433); transition: all 0.15s; min-width: 160px;
}
.rpt-color-btn:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.rpt-color-btn-sw {
  width: 26px; height: 18px; border-radius: 4px; flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.18);
}
.rpt-color-btn-label { flex: 1; text-align: left; letter-spacing:0; }
.rpt-color-btn-caret { font-size: 10px; color: var(--tx3, #7898b0); }
.rpt-color-input-hidden {
  position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;
  border: 0; padding: 0; left: 12px; bottom: 0;
}
.rpt-color-popover {
  position: absolute; z-index: 60; top: 100%; left: 0; margin-top: 6px;
  background: var(--bg-modal, #fff); border: 1px solid var(--brd, #c0ccd8);
  border-radius: 8px; box-shadow: 0 14px 36px rgba(5,12,22,0.28);
  padding: 12px; width: 312px;
}
.rpt-color-grp-title {
  font-size: 11px; font-weight: 700; color: var(--tx2, #5a7088);
  text-transform: none; margin: 2px 0 7px;
}
.rpt-color-grid {
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin-bottom: 12px;
}
.rpt-color-swatch {
  width: 100%; aspect-ratio: 1 / 1; min-height: 22px; border-radius: 5px;
  border: 1px solid rgba(0,0,0,0.12); cursor: pointer; transition: transform 0.12s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12); padding: 0;
}
.rpt-color-swatch:hover { transform: scale(1.18); z-index: 1; }
.rpt-color-swatch.active { box-shadow: 0 0 0 2px var(--accent); transform: scale(1.1); }
.rpt-color-more {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 9px 10px; border: none; border-top: 1px solid var(--brd, #e2e8f0);
  background: transparent; cursor: pointer; font-size: 12px; font-weight: 700;
  color: var(--accent, #2f6f8f); border-radius: 0 0 6px 6px;
}
.rpt-color-more:hover { background: var(--accent-lt, #e8f0fa); }

/* ── Botones de acción ── */
.rpt-actions-bar { display: flex; gap: 10px; flex-wrap: wrap; }
.rpt-btn {
  padding: 9px 20px; border: none; border-radius: 6px; font-weight: 700;
  font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
  transition: all 0.15s; white-space: nowrap;
}
.rpt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rpt-btn-preview { background:var(--btn-primary); color: #fff; }
.rpt-btn-preview:hover:not(:disabled) { background:var(--btn-primary-h); }
.rpt-btn-pdf { background:var(--btn-err); color: #fff; }
.rpt-btn-pdf:hover:not(:disabled) { background:var(--btn-err-h); }
.rpt-btn-excel { background:var(--btn-ok); color: #fff; }
.rpt-btn-excel:hover:not(:disabled) { background:var(--btn-ok-h); }

/* ── Resumen estadístico ── */
.rpt-resumen-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.rpt-resumen-card {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-card); border: 1px solid var(--brd); border-radius: 8px;
  padding: 10px 16px; min-width: 140px; flex: 1;
}
.rpt-resumen-icon { font-size: 16px; }
.rpt-resumen-label { font-size: 9px; font-weight: 700; color: var(--tx3); text-transform: uppercase; letter-spacing:0; }
.rpt-resumen-value { font-size: 14px; font-weight: 800; color: var(--tx); margin-top: 1px; }

/* ── Preview ── */
.rpt-preview {
  background: var(--bg-card); border: 1px solid var(--brd); border-radius: 8px;
  box-shadow: var(--shd); overflow: hidden;
}
.rpt-preview-header {
  padding: 12px 20px; font-size: 12px; font-weight: 700; color: var(--tx2);
  border-bottom: 1px solid var(--brd-lt);
  display: flex; align-items: center; gap: 8px;
}
.rpt-preview-note { font-weight: 400; color: var(--tx3); font-size: 10px; margin-left: auto; }
.rpt-preview-scroll { overflow: auto; max-height: 70vh; position: relative; }

/* ── Tabla de preview ── */
.rpt-table {
  width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px;
}
.rpt-table thead th {
  background: var(--bg-th); color: var(--tx-th); font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing:0;
  padding: 8px 10px; border: none; border-bottom: 2px solid var(--sb-active,#2f6f8f);
}
.rpt-table tbody td {
  padding: 6px 10px; border-bottom: 1px solid var(--brd-lt); color: var(--tx);
  font-size: 11px; vertical-align: top;
}
.rpt-table tbody tr:nth-child(even) { background: var(--bg-stripe); }
.rpt-table tbody tr:hover { background: var(--accent-lt); }

.rpt-table-compact tbody td { padding: 4px 8px; font-size: 10px; }

.rpt-td-cuenta { font-weight: 700; color: var(--accent) !important; font-size: 10px !important; letter-spacing:0; }
.rpt-td-glosa  { font-size: 10px !important; color: var(--tx3) !important; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rpt-td-debe   { text-align: right; color: var(--ok) !important; }
.rpt-td-haber  { text-align: right; color: var(--err) !important; }

.rpt-row-header td {
  background:var(--btn-primary) !important; color: #fff !important;
  font-size: 10px !important; padding: 6px 10px !important; border: none !important;
}
.rpt-voucher-num    { font-weight: 800; margin-right: 10px; }
.rpt-voucher-fecha  { margin-right: 10px; opacity: 0.8; }
.rpt-voucher-origen { margin-right: 10px; opacity: 0.7; font-size: 10px; }
.rpt-voucher-glosa  { font-style: italic; opacity: 0.8; }
.rpt-row-subtotal td { background: var(--bg-block) !important; border-top: 1px solid var(--brd) !important; }
.rpt-row-total td { background: var(--bg-th) !important; color: var(--tx-th) !important; font-weight: 800 !important; }
body.dark-mode .rpt-row-total .rpt-td-debe,
body.dark-mode .rpt-row-total .rpt-td-haber { color: var(--tx-th) !important; }

/* ── Libro Mayor: separador por cuenta ── */
.rpt-mayor-cuenta { margin-bottom: 18px; }
.rpt-mayor-rotulo {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: 6px 2px 8px; font-size: 12px; color: var(--tx);
}
.rpt-mayor-rotulo-lbl { font-weight: 800; }
.rpt-mayor-codigo  { font-weight: 800; font-size: 13px; color: var(--accent); }
.rpt-mayor-nombre  { font-weight: 600; }
.rpt-table-mayor th { font-size: 10px; }

/* ── Estado de Resultados estructurado ── */
.rpt-er-statement{max-width:900px;margin:0 auto;padding:16px 20px;}
.rpt-er-statement-head{background:#223247;color:#fff;padding:11px 14px;border-radius:7px 7px 0 0;font-size:13px;font-weight:900;letter-spacing:0;display:flex;align-items:center;gap:7px;}
.rpt-er-fixed-table{width:100%;border-collapse:collapse;border:1px solid var(--brd,#dde5ef);background:var(--bg-card,#fff);}
.rpt-er-fixed-table thead th{padding:8px 10px;background:var(--bg-block,#f4f8fc);border-bottom:1px solid var(--brd,#dde5ef);font-size:9px;font-weight:800;letter-spacing:0;color:var(--tx3,#6d8298);text-align:left;}
.rpt-er-fixed-table thead th:nth-child(2){width:100px;text-align:center;}
.rpt-er-fixed-table thead th:nth-child(3){width:145px;text-align:right;}
.rpt-er-fixed-row td{padding:6px 10px;border-bottom:1px solid var(--brd-lt,#edf1f5);font-size:11.5px;color:var(--tx,#182433);}
.rpt-er-fixed-row:hover td{background:rgba(var(--accent-rgb),.035);}
.rpt-er-note{text-align:center;color:var(--accent)!important;font-size:10px!important;font-weight:700;white-space:nowrap;}
.rpt-er-money{text-align:right!important;font-weight:700;white-space:nowrap;}
.rpt-er-money.is-negative{color:var(--err)!important;}
.rpt-er-fixed-total td{padding:8px 10px;background:#e7f0f8;color:#223247;font-size:11.5px;font-weight:900;border-top:2px solid var(--accent);border-bottom:1px solid #c8d8e8;}
.rpt-er-fixed-total.is-final td{background:#223247;color:#fff;border-top-color:#223247;border-bottom-color:#223247;font-size:12px;}
.rpt-er-source{margin-top:9px;padding:8px 10px;border-radius:6px;background:rgba(var(--accent-rgb),.05);border:1px solid rgba(var(--accent-rgb),.12);font-size:9.5px;color:var(--tx3,#6d8298);line-height:1.45;}

.rpt-empty {
  text-align: center; color: var(--tx3); font-size: 12px; padding: 30px 0;
  font-style: italic;
}

/* ── Tabla SUNAT Formato 5.1 — Libro Diario ── */
.rpt-table-sunat thead th {
  font-size: 9px !important; padding: 11px 6px !important; line-height: 1.35;
  vertical-align: middle; text-align: center;
}
.rpt-sunat-hdr1 th { border-bottom: none !important; }
.rpt-sunat-hdr2 th { font-size: 8px !important; }

/* ── Tabla SUNAT Formato 14.1 — Registro de Ventas ── */
.rpt-table-ventas { font-size: 8px; }
.rpt-table-ventas thead th {
  font-size: 7px !important; padding: 8px 4px !important; vertical-align: middle;
  border: 1px solid rgba(255,255,255,0.25) !important;
}
/* Las LÍNEAS de datos van SIN recuadros (cada valor bajo su columna) */
.rpt-table-ventas tbody td {
  padding: 5px 4px; font-size: 8px; vertical-align: middle; border: none !important;
}
.rpt-table-ventas tbody tr:nth-child(even) { background: transparent; }
.rpt-table-ventas .rpt-row-header td {
  background: transparent !important; color: var(--tx) !important;
  font-weight: 800 !important; border: none !important; padding: 8px 4px !important;
}
.rpt-table-ventas .rpt-row-subtotal td {
  border-top: 1px solid var(--brd) !important; font-weight: 800;
}
/* Registro de Compras (28 columnas) — fuente más compacta */
.rpt-table-compras { font-size: 7px; }
.rpt-table-compras thead th { font-size: 6px !important; padding: 7px 3px !important; }
.rpt-table-compras tbody td { font-size: 7px; padding: 5px 3px; }


  </style>`;
}
