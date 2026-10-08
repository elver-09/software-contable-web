'use strict';

import { escapeHTML } from '../utils/security.js';

let root = null;
let state = { page: 1, pageSize: 50, tipo: 'TODOS', estado: 'TODOS', buscar: '', desde: '', hasta: '' };
let searchTimer = null;

function fmt(n) {
  return Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n) { return Math.round(Number(n || 0)).toLocaleString('es-PE'); }
function fechaPE(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function initCartera() {
  root = document.getElementById('cartera-root');
  if (!root) return;
  if (!root.dataset.initialized) {
    root.dataset.initialized = '1';
    root.innerHTML = _shell();
    _bindEvents();
  }
  await _cargar();
}

function _shell() {
  return `<div class="crt-wrap">
    <div class="crt-hero">
      <div class="crt-hero__icon"><i class="fa-solid fa-wallet"></i></div>
      <div>
        <div class="crt-kicker">GESTIÓN DE CARTERA</div>
        <h1>Cartera y Vencimientos</h1>
      </div>
    </div>

    <div id="crt-kpis" class="crt-kpis">${_skeletonKpis()}</div>

    <section class="crt-card">
      <div class="crt-card__head">
        <div>
          <h2>Documentos pendientes</h2>
        </div>
        <button id="crt-limpiar" class="crt-btn crt-btn--secondary" type="button"><i class="fa-solid fa-rotate-left"></i> Limpiar</button>
      </div>

      <div class="crt-filters">
        <label><span>TIPO</span><select id="crt-tipo"><option value="TODOS">Todos</option><option value="CXC">Por cobrar</option><option value="CXP">Por pagar</option></select></label>
        <label><span>ESTADO</span><select id="crt-estado"><option value="TODOS">Todos</option><option value="VENCIDO">Vencidos</option><option value="PROXIMO">Próximos 7 días</option><option value="HOY">Vencen hoy</option><option value="PENDIENTE">Pendientes</option></select></label>
        <label><span>DESDE</span><input id="crt-desde" type="date"></label>
        <label><span>HASTA</span><input id="crt-hasta" type="date"></label>
        <label class="crt-search"><span>BUSCAR</span><div><i class="fa-solid fa-magnifying-glass"></i><input id="crt-buscar" type="search" placeholder="Documento, RUC o entidad..."></div></label>
      </div>
    </section>

    <section class="crt-card crt-card--table">
      <div class="crt-table-meta"><span id="crt-resultados">Cargando...</span><span id="crt-corte"></span></div>
      <div class="crt-table-wrap">
        <table class="crt-table">
          <thead><tr><th>Tipo</th><th>Documento</th><th>Entidad</th><th>Emisión</th><th>Vencimiento</th><th>Estado</th><th class="num">Saldo</th></tr></thead>
          <tbody id="crt-tbody"><tr><td colspan="7" class="crt-empty">Cargando cartera...</td></tr></tbody>
        </table>
      </div>
      <div id="crt-pagination" class="crt-pagination"></div>
    </section>
  </div>${_styles()}`;
}

function _skeletonKpis() {
  return Array(4).fill('<div class="crt-kpi crt-skeleton"></div>').join('');
}

function _bindEvents() {
  root.querySelector('#crt-tipo')?.addEventListener('change', e => { state.tipo = e.target.value; state.page = 1; _cargar(); });
  root.querySelector('#crt-estado')?.addEventListener('change', e => { state.estado = e.target.value; state.page = 1; _cargar(); });
  root.querySelector('#crt-desde')?.addEventListener('change', e => { state.desde = e.target.value; state.page = 1; _cargar(); });
  root.querySelector('#crt-hasta')?.addEventListener('change', e => { state.hasta = e.target.value; state.page = 1; _cargar(); });
  root.querySelector('#crt-buscar')?.addEventListener('input', e => {
    state.buscar = e.target.value;
    state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(_cargar, 220);
  });
  root.querySelector('#crt-limpiar')?.addEventListener('click', () => {
    state = { page: 1, pageSize: 50, tipo: 'TODOS', estado: 'TODOS', buscar: '', desde: '', hasta: '' };
    root.querySelector('#crt-tipo').value = 'TODOS';
    root.querySelector('#crt-estado').value = 'TODOS';
    root.querySelector('#crt-desde').value = '';
    root.querySelector('#crt-hasta').value = '';
    root.querySelector('#crt-buscar').value = '';
    _cargar();
  });
  root.querySelector('#crt-pagination')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page) || 1;
    _cargar().then(() => root.querySelector('.crt-card--table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
}

async function _cargar() {
  if (!root) return;
  try {
    const data = await window.api.getCarteraVencimientos(state);
    _renderKPIs(data.resumen || {});
    _renderTable(data);
  } catch (err) {
    console.error('Cartera:', err);
    const tbody = root.querySelector('#crt-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="crt-empty crt-empty--error">No se pudo cargar la cartera: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function _renderKPIs(r) {
  const target = root.querySelector('#crt-kpis');
  if (!target) return;
  target.innerHTML = `
    ${_kpi('Cuentas por cobrar', `S/ ${fmt(r.cxc_saldo)}`, `${fmtInt(r.cxc_documentos)} documento(s)`, 'fa-hand-holding-dollar', 'blue')}
    ${_kpi('Cuentas por pagar', `S/ ${fmt(r.cxp_saldo)}`, `${fmtInt(r.cxp_documentos)} documento(s)`, 'fa-file-circle-check', 'violet')}
    ${_kpi('Documentos vencidos', fmtInt(r.vencidos), `S/ ${fmt(r.vencidos_saldo)}`, 'fa-calendar-xmark', 'red')}
    ${_kpi('Vencen en 7 días', fmtInt(r.proximos_7), `S/ ${fmt(r.proximos_7_saldo)}`, 'fa-clock', 'amber')}`;
}

function _kpi(label, value, sub, icon, tone) {
  return `<div class="crt-kpi crt-kpi--${tone}"><div class="crt-kpi__icon"><i class="fa-solid ${icon}"></i></div><div><div class="crt-kpi__label">${label}</div><div class="crt-kpi__value">${value}</div><div class="crt-kpi__sub">${sub}</div></div></div>`;
}

function _renderTable(data) {
  const docs = data.documentos || [];
  const pag = data.paginacion || { page:1, total:0, totalPages:1, pageSize:50 };
  const tbody = root.querySelector('#crt-tbody');
  root.querySelector('#crt-resultados').textContent = `${fmtInt(pag.total)} documento(s) encontrado(s)`;
  root.querySelector('#crt-corte').textContent = `Fecha de corte: ${fechaPE(data.fecha_corte)}`;

  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="crt-empty"><i class="fa-regular fa-folder-open"></i><strong>Sin documentos</strong><span>No existen registros que coincidan con los filtros aplicados.</span></td></tr>';
  } else {
    tbody.innerHTML = docs.map(d => `<tr>
      <td data-label="Tipo"><span class="crt-type crt-type--${d.tipo.toLowerCase()}">${d.tipo === 'CXC' ? 'Por cobrar' : 'Por pagar'}</span></td>
      <td data-label="Documento"><strong class="crt-doc">${escapeHTML(`${d.doc_tipo || ''} ${d.doc_numero || ''}`.trim())}</strong></td>
      <td data-label="Entidad"><div class="crt-entity"><strong>${escapeHTML(d.razon_social || 'Sin entidad')}</strong>${d.codigo ? `<span>${escapeHTML(d.codigo)}</span>` : ''}</div></td>
      <td data-label="Emisión">${fechaPE(d.fecha_emision)}</td>
      <td data-label="Vencimiento"><strong>${fechaPE(d.fecha_venc)}</strong></td>
      <td data-label="Estado"><span class="crt-status crt-status--${String(d.estado).toLowerCase()}">${escapeHTML(d.estado_etiqueta)}</span></td>
      <td data-label="Saldo" class="num crt-balance">S/ ${fmt(d.saldo)}</td>
    </tr>`).join('');
  }
  _renderPagination(pag);
}

function _renderPagination(p) {
  const el = root.querySelector('#crt-pagination');
  if (!el) return;
  if (p.totalPages <= 1) { el.innerHTML = ''; return; }
  const pages = [];
  const start = Math.max(1, p.page - 2);
  const end = Math.min(p.totalPages, p.page + 2);
  for (let i=start; i<=end; i++) pages.push(`<button type="button" data-page="${i}" class="${i===p.page?'active':''}">${i}</button>`);
  el.innerHTML = `<button type="button" data-page="${p.page-1}" ${p.page<=1?'disabled':''}><i class="fa-solid fa-chevron-left"></i></button>${pages.join('')}<button type="button" data-page="${p.page+1}" ${p.page>=p.totalPages?'disabled':''}><i class="fa-solid fa-chevron-right"></i></button><span>Página ${p.page} de ${p.totalPages}</span>`;
}

function _styles() {
  return `<style>
    .crt-wrap{display:flex;flex-direction:column;gap:10px;padding:0 0 28px;color:var(--tx);font-family:'Segoe UI',system-ui,sans-serif;}
    .crt-hero{display:flex;align-items:center;gap:18px;padding:12px 16px;border-radius:8px;background:var(--brand-grad);color:#fff;box-shadow:var(--shd);}
    .crt-hero__icon{width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex:0 0 auto;}
    .crt-kicker{font-size:10px;font-weight:800;letter-spacing:0;color:rgba(255,255,255,.68);}
    .crt-hero h1{font-size:17px;margin:2px 0 1px;line-height:1.15;}.crt-hero p{margin:0;color:rgba(255,255,255,.78);font-size:10.5px;line-height:1.35;}
    .crt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    .crt-kpi{min-height:68px;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--brd);background:var(--bg-card);border-radius:8px;box-shadow:var(--shd);}
    .crt-kpi__icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:rgba(var(--accent-rgb),.10);color:var(--accent);}
    .crt-kpi--red .crt-kpi__icon{background:rgba(var(--err-rgb),.10);color:var(--err)}.crt-kpi--amber .crt-kpi__icon{background:rgba(var(--warn-rgb),.10);color:var(--warn)}.crt-kpi--violet .crt-kpi__icon{background:rgba(101,114,127,.10);color:#65727f}
    .crt-kpi__label{font-size:9px;text-transform:uppercase;letter-spacing:0;font-weight:800;color:var(--tx3)}.crt-kpi__value{font-size:14px;font-weight:800;margin-top:2px;line-height:1.1;color:var(--tx)}.crt-kpi__sub{font-size:10px;margin-top:2px;color:var(--tx2)}
    .crt-card{background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;box-shadow:var(--shd);padding:18px 20px;}.crt-card--table{padding:0;overflow:hidden;}
    .crt-card__head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--brd-lt)}.crt-card__head h2{font-size:14px;margin:0;color:var(--tx)}.crt-card__head p{font-size:10.5px;color:var(--tx3);margin:3px 0 0}
    .crt-btn{border:none;border-radius:9px;padding:9px 13px;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;cursor:pointer}.crt-btn--secondary{background:var(--bg-ro);border:1px solid var(--brd-in);color:var(--tx2)}
    .crt-filters{display:grid;grid-template-columns:150px 170px 150px 150px minmax(220px,1fr);gap:12px;align-items:end}.crt-filters label{display:flex;flex-direction:column;gap:6px}.crt-filters label>span{font-size:9.5px;letter-spacing:0;font-weight:800;color:var(--tx3)}
    .crt-filters input,.crt-filters select{height:38px;background:var(--bg-input);color:var(--tx);border:1px solid var(--brd-in);border-radius:8px;padding:0 11px;font-size:11px;min-width:0}.crt-search>div{position:relative}.crt-search i{position:absolute;left:12px;top:12px;color:var(--tx3);font-size:12px}.crt-search input{width:100%;padding-left:34px}
    .crt-table-meta{display:flex;justify-content:space-between;gap:12px;padding:13px 18px;background:var(--bg-block);border-bottom:1px solid var(--brd-lt);font-size:11px;color:var(--tx2)}.crt-table-wrap{overflow:auto;max-height:55vh}.crt-table{width:100%;border-collapse:collapse;min-width:900px}.crt-table thead{position:sticky;top:0;z-index:2}.crt-table th{background:var(--bg-mhdr);color:#fff;text-align:left;padding:11px 13px;font-size:9.5px;letter-spacing:0;text-transform:uppercase}.crt-table th.num,.crt-table td.num{text-align:right}.crt-table td{padding:12px 13px;border-bottom:1px solid var(--brd-lt);font-size:12px;color:var(--tx2);vertical-align:middle}.crt-table tbody tr:hover{background:var(--bg-ro)}
    .crt-doc,.crt-balance{font-weight:800;color:var(--tx)}.crt-entity{display:flex;flex-direction:column;gap:3px}.crt-entity strong{font-size:12px;color:var(--tx)}.crt-entity span{font-size:10px;color:var(--tx3)}
    .crt-type,.crt-status{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:800}.crt-type--cxc{background:rgba(var(--accent-rgb),.10);color:var(--accent)}.crt-type--cxp{background:rgba(101,114,127,.10);color:#65727f}.crt-status--vencido{background:rgba(var(--err-rgb),.11);color:var(--err)}.crt-status--proximo,.crt-status--hoy{background:rgba(var(--warn-rgb),.11);color:var(--warn)}.crt-status--pendiente{background:rgba(var(--accent-rgb),.09);color:var(--accent)}
    body.dark-mode .crt-type--cxc{color:var(--accent)}body.dark-mode .crt-type--cxp{color:#a8b1bb}body.dark-mode .crt-status--vencido{color:var(--err)}body.dark-mode .crt-status--proximo,body.dark-mode .crt-status--hoy{color:var(--warn)}body.dark-mode .crt-status--pendiente{color:var(--accent)}
    .crt-empty{text-align:center!important;padding:34px!important;color:var(--tx3)!important}.crt-empty i{display:block;font-size:24px;margin-bottom:8px}.crt-empty strong,.crt-empty span{display:block;margin-top:4px}.crt-empty--error{color:#b54747!important}
    .crt-pagination{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:8px 12px;background:var(--bg-block);border-top:1px solid var(--brd-lt)}.crt-pagination button{min-width:34px;height:32px;border:1px solid var(--brd-in);background:var(--bg-card);color:var(--tx2);border-radius:7px;cursor:pointer}.crt-pagination button.active{background:var(--btn-primary);border-color:var(--accent);color:#fff}.crt-pagination button:disabled{opacity:.45;cursor:not-allowed}.crt-pagination span{font-size:10.5px;color:var(--tx3);margin-left:7px}.crt-skeleton{animation:crtPulse 1.2s ease-in-out infinite}@keyframes crtPulse{50%{opacity:.45}}
    @media(max-width:1200px){.crt-kpis{grid-template-columns:repeat(2,1fr)}.crt-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.crt-search{grid-column:1/-1}}
    @media(max-width:760px){.crt-hero{align-items:flex-start;padding:15px}.crt-hero h1{font-size:19px}.crt-kpis,.crt-filters{grid-template-columns:1fr}.crt-search{grid-column:auto}.crt-card{padding:12px}.crt-card--table{padding:0}.crt-card__head{flex-direction:column}.crt-table-meta{flex-direction:column}.crt-table-wrap{max-height:none;overflow:visible;padding:10px;background:var(--bg-block)}.crt-table{min-width:0;display:block}.crt-table thead{display:none}.crt-table tbody{display:flex;flex-direction:column;gap:10px}.crt-table tr{display:grid!important;grid-template-columns:1fr 1fr;background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:12px;box-shadow:var(--shd)}.crt-table td{display:flex;flex-direction:column;gap:4px;border:0!important;padding:7px!important;text-align:left!important;min-width:0}.crt-table td::before{content:attr(data-label);font-size:9px;text-transform:uppercase;letter-spacing:0;color:var(--tx3);font-weight:800}.crt-table td:nth-child(3){grid-column:1/-1}.crt-empty{grid-column:1/-1!important}.crt-pagination{justify-content:center;flex-wrap:wrap}.crt-pagination span{width:100%;text-align:center;margin:4px 0 0}}
  </style>`;
}
