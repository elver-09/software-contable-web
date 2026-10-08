// src/renderer/js/modules/sire.js
// ═══════════════════════════════════════════════════════════════════════════════
// SIRE — Sistema Integrado de Registros Electrónicos (SUNAT)
//
// SECCIONES:
//   1. Configuración     — Credenciales SUNAT API (RUC, SOL, client_id/secret)
//   2. SIRE SUNAT        — Descargar propuesta, consultar ticket y archivos
//   3. Registros locales — Consultar ventas/compras contables + diagnóstico TXT
//   4. Comparación       — Local vs propuesta SUNAT (diferencias)
//   5. Codificación      — Cuentas para contabilización
//   6. Contabilizar      — Crear vouchers desde SIRE
//   7. Actividad         — Operaciones y logs técnicos
// ═══════════════════════════════════════════════════════════════════════════════
import { escapeHTML, escapeAttr } from '../utils/security.js';

'use strict';

let _root = null;
let _seccion = 'config';
let _localTab = 'ventas';   // sub-tab dentro de SIRE Local
let _sunatTipo = 'ventas';  // tipo seleccionado en SIRE SUNAT
let _sireStyles = false;

// ── Helpers ──────────────────────────────────────────────────────────────────
function _fmt(n) {
  return Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fmtFecha(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-');
  return d ? `${d}/${m}/${y}` : s;
}
function _rango(periodo) {
  const p = String(periodo).includes('-') ? periodo : `${periodo.substring(0,4)}-${periodo.substring(4,6)}`;
  const [y, m] = p.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { desde: `${p}-01`, hasta: `${p}-${String(ultimo).padStart(2, '0')}` };
}
function _periodoDefault() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}
function _esc(s) { return escapeHTML(s); }
function fmt(n) { return Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// ── Estilos ──────────────────────────────────────────────────────────────────
function _inyectarEstilos() {
  if (_sireStyles) return; _sireStyles = true;
  const s = document.createElement('style'); s.id = 'sire-styles';
  s.textContent = `
.sire-wrap{padding:0 4px;}
.sire-hero{background:var(--brand-grad);border-radius:8px;padding:18px 22px;margin-bottom:14px;display:flex;align-items:center;gap:14px;}
.sire-hero-ic{width:42px;height:42px;border-radius:8px;background:rgba(255,255,255,.13);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;}
.sire-hero h2{color:#fff;font-size:17px;font-weight:800;margin:0;}
.sire-hero p{color:rgba(255,255,255,.7);font-size:11px;margin:2px 0 0;}

/* Navegación principal */
.sire-nav{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}
.sire-nav-btn{padding:8px 16px;border:1px solid var(--brd,#dde5ef);border-radius:8px;background:var(--bg-card,#fff);cursor:pointer;font-weight:700;font-size:12px;color:var(--tx2,#5a7088);display:flex;align-items:center;gap:7px;transition:all .15s;}
.sire-nav-btn:hover{border-color:var(--accent);color:var(--accent);}
.sire-nav-btn.active{background:var(--btn-primary,#2f6f8f);color:#fff;border-color:var(--accent);}

/* Sub-tabs */
.sire-tabs{display:flex;gap:6px;margin-bottom:12px;}
.sire-tab{padding:7px 14px;border:1px solid var(--brd,#dde5ef);border-radius:8px;background:var(--bg-card,#fff);cursor:pointer;font-weight:700;font-size:12px;color:var(--tx2,#5a7088);display:flex;align-items:center;gap:6px;}
.sire-tab.active{background:var(--btn-primary,#2f6f8f);color:#fff;border-color:var(--accent);}

/* Cards y toolbar */
.sire-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;padding:14px 16px;margin-bottom:12px;}
.sire-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0;color:var(--tx-lbl,#5a7088);display:block;margin-bottom:4px;}
.sire-cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.sire-kpi{flex:1;min-width:130px;background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;padding:10px 14px;}
.sire-kpi .k{font-size:10px;color:var(--tx2,#5a7088);font-weight:700;text-transform:uppercase;}
.sire-kpi .v{font-size:16px;font-weight:800;margin-top:2px;}

/* Tablas */
.sire-table-wrap{background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;overflow:auto;max-height:55vh;}
table.sire-table{width:100%;border-collapse:collapse;font-size:11px;}
table.sire-table thead th{position:sticky;top:0;background:var(--bg-th);color:var(--tx-th);font-size:10px;padding:8px 6px;text-align:center;white-space:nowrap;}
table.sire-table tbody td{padding:6px;border-bottom:1px solid var(--brd-lt,#eef2f6);white-space:nowrap;}
table.sire-table tbody tr:hover{background:var(--accent-lt,#eef5fc);}
table.sire-table tfoot td{padding:8px 6px;font-weight:800;border-top:2px solid var(--brd,#c0ccd8);background:var(--bg-mftr,#f4f8fd);}

/* Botones */
.sire-btn{padding:8px 16px;border:none;border-radius:8px;font-weight:700;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s;}
.sire-btn-primary{background:var(--btn-primary);color:#fff;}.sire-btn-primary:hover{background:var(--btn-primary-h);}
.sire-btn-success{background:var(--btn-ok);color:#fff;}.sire-btn-success:hover{background:var(--btn-ok-h);}
.sire-btn-warn{background:var(--btn-warn);color:#fff;}.sire-btn-warn:hover{background:var(--btn-warn-h);}
.sire-btn-outline{background:transparent;border:1px solid var(--brd);color:var(--tx2);}.sire-btn-outline:hover{border-color:var(--accent);color:var(--accent);}
.sire-btn:disabled{opacity:.5;cursor:not-allowed;}

/* Config form */
.sire-cfg-card{background:var(--bg-card,#fff);border:1px solid var(--brd,#dde5ef);border-radius:8px;padding:18px 20px;margin-bottom:14px;}
.sire-cfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;}
.sire-cfg-full{grid-column:1/-1;}
.sire-cfg-card input,.sire-cfg-card select{width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:6px;font-size:12px;background:var(--bg-input,#fff);color:var(--tx);}
.sire-cfg-card input:focus{border-color:var(--accent);outline:none;box-shadow:0 0 0 2px rgba(var(--accent-rgb),.15);}
.sire-estado{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;font-size:11px;font-weight:700;}
.sire-estado.ok{background:rgba(var(--ok-rgb),.12);color:var(--ok);}.sire-estado.error{background:rgba(var(--err-rgb),.12);color:var(--err);}.sire-estado.pending{background:rgba(var(--warn-rgb),.12);color:var(--warn);}.sire-estado.none{background:var(--bg-ro);color:var(--tx2);}

/* Comparación */
.sire-cmp-badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;}
.sire-cmp-ok{background:rgba(var(--ok-rgb),.12);color:var(--ok);}.sire-cmp-local{background:rgba(var(--accent-rgb),.12);color:var(--accent);}.sire-cmp-sunat{background:rgba(var(--warn-rgb),.12);color:var(--warn);}.sire-cmp-diff{background:rgba(var(--err-rgb),.12);color:var(--err);}

.sire-empty{padding:30px;text-align:center;color:var(--tx3,#7898b0);font-size:13px;}
.sire-msg{padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:10px;}
.sire-msg-ok{background:rgba(var(--ok-rgb),.12);color:var(--ok);}.sire-msg-err{background:rgba(var(--err-rgb),.12);color:var(--err);}.sire-msg-warn{background:rgba(var(--warn-rgb),.12);color:var(--warn);}
`;
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
export function initSire() {
  _root = document.getElementById('sire-root');
  if (!_root) return;
  _inyectarEstilos();
  _seccion = 'config';
  _localTab = 'ventas';
  _renderMain();
}

function _renderMain() {
  _root.innerHTML = `
  <div class="sire-wrap">
    <div class="sire-hero">
      <div class="sire-hero-ic"><i class="fa-solid fa-file-shield"></i></div>
      <div>
        <h2>SIRE — Registros Electrónicos SUNAT</h2>
      </div>
    </div>
    <div class="sire-nav" id="sire-nav">
      <button class="sire-nav-btn ${_seccion==='config'?'active':''}" data-sec="config"><i class="fa-solid fa-gear"></i> Configuración SUNAT</button>
      <button class="sire-nav-btn ${_seccion==='sunat'?'active':''}" data-sec="sunat"><i class="fa-solid fa-cloud-arrow-down"></i> SIRE SUNAT</button>
      <button class="sire-nav-btn ${_seccion==='local'?'active':''}" data-sec="local"><i class="fa-solid fa-database"></i> Registros locales</button>
      <button class="sire-nav-btn ${_seccion==='comparar'?'active':''}" data-sec="comparar"><i class="fa-solid fa-code-compare"></i> Comparación</button>
      <button class="sire-nav-btn ${_seccion==='codificar'?'active':''}" data-sec="codificar"><i class="fa-solid fa-tags"></i> Codificación</button>
      <button class="sire-nav-btn ${_seccion==='contabilizar'?'active':''}" data-sec="contabilizar"><i class="fa-solid fa-book-open-reader"></i> Contabilizar</button>
      <button class="sire-nav-btn ${_seccion==='actividad'?'active':''}" data-sec="actividad"><i class="fa-solid fa-clock-rotate-left"></i> Actividad</button>
    </div>
    <div id="sire-seccion"></div>
  </div>`;

  _root.querySelectorAll('.sire-nav-btn').forEach(b => b.addEventListener('click', () => {
    _seccion = b.dataset.sec;
    _renderMain();
  }));

  const cont = document.getElementById('sire-seccion');
  switch (_seccion) {
    case 'config':      _renderConfig(cont); break;
    case 'sunat':       _renderSunat(cont); break;
    case 'local':       _renderLocal(cont); break;
    case 'comparar':    _renderComparar(cont); break;
    case 'codificar':   _renderCodificar(cont); break;
    case 'contabilizar':_renderContabilizar(cont); break;
    case 'actividad':   _renderLogs(cont); break;
    default:            _renderConfig(cont); break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTROS LOCALES — consulta contable y diagnóstico interno
// ═══════════════════════════════════════════════════════════════════════════════
function _renderLocal(cont) {
  const per = _periodoDefault();
  cont.innerHTML = `
    <div class="sire-tabs">
      <button class="sire-tab ${_localTab==='ventas'?'active':''}" data-tab="ventas"><i class="fa-solid fa-file-invoice-dollar"></i> Ventas (RVIE)</button>
      <button class="sire-tab ${_localTab==='compras'?'active':''}" data-tab="compras"><i class="fa-solid fa-cart-shopping"></i> Compras (RCE)</button>
    </div>
    <div class="sire-toolbar">
      <div style="width:170px;"><label class="sire-lbl"><i class="fa-solid fa-calendar"></i> Período</label>
        <input type="month" id="sire-local-periodo" value="${escapeAttr(per)}" style="width:100%;"></div>
      <button class="sire-btn sire-btn-primary" id="sire-local-cargar"><i class="fa-solid fa-magnifying-glass"></i> Consultar</button>
      <button class="sire-btn sire-btn-success" id="sire-local-txt"><i class="fa-solid fa-file-arrow-down"></i> Exportar diagnóstico TXT</button>
    </div>
    <div class="sire-msg sire-msg-warn"><i class="fa-solid fa-circle-info"></i> Esta vista muestra la información tributaria registrada en la contabilidad local. El TXT generado es de diagnóstico interno y <strong>no es un archivo oficial de reemplazo SUNAT</strong>.</div>
    <div class="sire-cards" id="sire-local-cards"></div>
    <div id="sire-local-contenido"></div>`;

  cont.querySelectorAll('.sire-tab').forEach(t => t.addEventListener('click', () => {
    _localTab = t.dataset.tab; _renderLocal(cont);
  }));
  document.getElementById('sire-local-cargar').addEventListener('click', () => _cargarLocal());
  document.getElementById('sire-local-periodo').addEventListener('change', () => _cargarLocal());
  document.getElementById('sire-local-txt').addEventListener('click', () => _exportarTxtLocal());
  _cargarLocal();
}

async function _cargarLocal() {
  const periodo = document.getElementById('sire-local-periodo')?.value;
  const cont = document.getElementById('sire-local-contenido');
  const cards = document.getElementById('sire-local-cards');
  if (!periodo || !cont) return;
  cont.innerHTML = '<div class="sire-empty"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</div>';
  cards.innerHTML = '';
  const { desde, hasta } = _rango(periodo);
  try {
    const r = await window.api.getDatosSire({ tipo: _localTab, desde, hasta });
    if (!r.success || !r.filas.length) {
      cont.innerHTML = `<div class="sire-empty"><i class="fa-solid fa-inbox"></i><br>No hay comprobantes de ${_esc(_localTab)} en ${_esc(periodo)}.</div>`;
      return;
    }
    cards.innerHTML = _cardsHTML(r, _localTab);
    cont.innerHTML = _localTab === 'ventas' ? _tablaVentas(r.filas) : _tablaCompras(r.filas);
  } catch (e) { cont.innerHTML = `<div class="sire-empty">Error: ${_esc(e.message)}</div>`; }
}

async function _exportarTxtLocal() {
  const periodo = document.getElementById('sire-local-periodo')?.value;
  if (!periodo) return;
  const { desde, hasta } = _rango(periodo);
  const btn = document.getElementById('sire-local-txt');
  const prev = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
  try {
    const gen = await window.api.exportarSireTxt({ tipo: _localTab, desde, hasta });
    if (!gen.success) { alert(gen.error); return; }
    const save = await window.api.guardarSireTxt({ filePath: gen.filePath, defaultName: gen.defaultName });
    if (save.success) alert(`Diagnóstico TXT generado (${gen.filas} comprobantes):\n${save.savedPath}`);
  } catch (e) { alert('Error: ' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = prev; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CONFIGURACIÓN SUNAT API
// ═══════════════════════════════════════════════════════════════════════════════
async function _renderConfig(cont) {
  cont.innerHTML = '<div class="sire-empty"><i class="fa-solid fa-spinner fa-spin"></i> Cargando configuración...</div>';
  let cfg = {};
  try {
    const r = await window.api.getSireConfig();
    if (r.success) cfg = r.config;
  } catch (_) {}

  const estadoClass = cfg.estado_conexion === 'CONECTADO' ? 'ok' : cfg.estado_conexion === 'CONFIGURADO' ? 'pending' : cfg.estado_conexion?.startsWith('ERROR') ? 'error' : 'none';
  const estadoIcon = { CONECTADO:'fa-circle-check', CONFIGURADO:'fa-clock', ERROR_AUTH:'fa-circle-xmark', ERROR_CONEXION:'fa-wifi-slash', ERROR_CREDENCIALES:'fa-shield-halved', NO_CONFIGURADO:'fa-circle-minus' }[cfg.estado_conexion] || 'fa-circle-minus';
  const estadoTxt = { CONECTADO:'Conectado', CONFIGURADO:'Configurado (sin probar)', ERROR_AUTH:'Error de autenticación', ERROR_CONEXION:'Error de conexión', ERROR_CREDENCIALES:'Reingresar credenciales', NO_CONFIGURADO:'No configurado' }[cfg.estado_conexion] || 'No configurado';

  const _campoPassword = (id, label, guardado, placeholder) => `
    <div>
      <label class="sire-lbl">${_esc(label)} ${guardado ? '<span style="color:var(--ok);font-size:9px;">● Guardada</span>' : '<span style="color:var(--warn);font-size:9px;">● Pendiente</span>'}</label>
      <div style="display:flex;gap:6px;">
        <input type="password" id="${escapeAttr(id)}" placeholder="${guardado ? '••••••••' : escapeAttr(placeholder)}" style="flex:1;" ${guardado ? 'disabled' : ''}>
        ${guardado ? `<button type="button" class="sire-btn sire-btn-outline sire-clave-toggle" data-target="${escapeAttr(id)}" style="padding:6px 10px;font-size:10px;" title="Cambiar"><i class="fa-solid fa-pencil"></i> Cambiar</button>` : ''}
      </div>
    </div>`;

  cont.innerHTML = `
    <div class="sire-cfg-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <h3 style="margin:0 0 4px;font-size:15px;"><i class="fa-solid fa-key"></i> Credenciales SUNAT API</h3>
          <p style="font-size:11px;color:var(--tx3);margin:0;">Ingrese sus credenciales SOL y del API SUNAT para conectarse al SIRE.</p>
        </div>
        <span class="sire-estado ${estadoClass}" id="cfg-estado"><i class="fa-solid ${estadoIcon}" style="font-size:8px;"></i> ${estadoTxt}</span>
      </div>
      <div id="sire-cfg-msg"></div>

      ${cfg.credenciales_requieren_reingreso ? `
        <div class="sire-msg sire-msg-err" style="margin-bottom:12px;line-height:1.55;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <strong>Debe volver a ingresar sus credenciales sensibles.</strong><br>
          Una versión anterior guardó la Clave SOL o el Client Secret con un esquema que ya no puede recuperarse de forma segura.
          Esto no afecta sus vouchers ni su información contable.
        </div>` : ''}

      <div style="background:${cfg.seguridad_credenciales?.secure ? 'rgba(var(--ok-rgb),.07)' : 'rgba(var(--warn-rgb),.08)'};border:1px solid ${cfg.seguridad_credenciales?.secure ? 'rgba(var(--ok-rgb),.18)' : 'rgba(var(--warn-rgb),.22)'};border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:10.5px;line-height:1.55;color:var(--tx2);">
        <div style="font-weight:700;margin-bottom:3px;"><i class="fa-solid fa-shield-halved"></i> Protección de credenciales</div>
        <div>${_esc(cfg.seguridad_credenciales?.message || 'Estado de protección no disponible.')}</div>
        <div style="margin-top:4px;color:var(--tx3);"><i class="fa-solid fa-lock"></i> Las conexiones SIRE están restringidas a los hosts oficiales de SUNAT; las URLs no son editables desde esta pantalla.</div>
      </div>

      <div style="background:var(--bg-block,#f4f8fc);border-radius:8px;padding:16px 18px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;margin-bottom:10px;"><i class="fa-solid fa-building"></i> Datos del Contribuyente</div>
        <div class="sire-cfg-grid">
          <div><label class="sire-lbl">RUC (11 dígitos)</label><input type="text" id="cfg-ruc" value="${escapeAttr(cfg.ruc)}" maxlength="11" placeholder="20123456789"></div>
          <div><label class="sire-lbl">Usuario SOL</label><input type="text" id="cfg-usuario" value="${escapeAttr(cfg.usuario_sol)}" placeholder="Ej: MODDATOS"></div>
          ${_campoPassword('cfg-clave', 'Clave SOL', cfg.tiene_clave_sol, 'Ingrese su clave SOL')}
        </div>
      </div>

      <div style="background:var(--bg-block,#f4f8fc);border-radius:8px;padding:16px 18px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;margin-bottom:10px;"><i class="fa-solid fa-plug"></i> Credenciales API</div>
        <div class="sire-cfg-grid">
          <div class="sire-cfg-full"><label class="sire-lbl">Client ID</label><input type="text" id="cfg-clientid" value="${escapeAttr(cfg.client_id)}" placeholder="Ej: e1729458-98cb-4ac5-b1d4-a031005cef89"></div>
          ${_campoPassword('cfg-secret', 'Client Secret', cfg.tiene_client_secret, 'Ingrese el Client Secret')}
        </div>
        <div style="margin-top:8px;font-size:10px;color:var(--tx3);line-height:1.5;">
          <i class="fa-solid fa-info-circle"></i> Obtenga sus credenciales en el Portal SOL: Empresas → Credenciales de API SUNAT → Gestión de Credenciales. Seleccione la URI <strong>"MIGE RCE y RVIE - SIRE"</strong>.
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button class="sire-btn sire-btn-primary" id="cfg-guardar" ${cfg.seguridad_credenciales?.secure === false ? 'disabled title="No hay almacenamiento seguro disponible"' : ''}><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
        <button class="sire-btn sire-btn-warn" id="cfg-probar" ${cfg.credenciales_requieren_reingreso ? 'disabled title="Reingrese y guarde primero las credenciales"' : ''}><i class="fa-solid fa-plug"></i> Probar Conexión</button>
      </div>
    </div>`;

  cont.querySelectorAll('.sire-clave-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target || '');
      if (!input) return;
      const editando = input.disabled;
      input.disabled = !editando;
      input.value = '';
      input.placeholder = editando ? 'Ingrese la nueva...' : '••••••••';
      btn.replaceChildren();
      const icon = document.createElement('i');
      icon.className = editando ? 'fa-solid fa-xmark' : 'fa-solid fa-pencil';
      btn.append(icon, document.createTextNode(editando ? ' Cancelar' : ' Cambiar'));
      btn.title = editando ? 'Cancelar' : 'Cambiar';
      if (editando) input.focus();
    });
  });

  document.getElementById('cfg-guardar').addEventListener('click', async () => {
    const msg = document.getElementById('sire-cfg-msg');
    msg.innerHTML = '<div class="sire-msg sire-msg-warn"><i class="fa-solid fa-spinner fa-spin"></i> Guardando...</div>';
    const data = {
      ruc: document.getElementById('cfg-ruc').value,
      usuario_sol: document.getElementById('cfg-usuario').value,
      clave_sol: document.getElementById('cfg-clave').disabled ? '' : document.getElementById('cfg-clave').value,
      client_id: document.getElementById('cfg-clientid').value,
      client_secret: document.getElementById('cfg-secret').disabled ? '' : document.getElementById('cfg-secret').value,
    };
    try {
      const r = await window.api.saveSireConfig(data);
      msg.innerHTML = r.success
        ? `<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-check"></i> ${_esc(r.mensaje)}</div>`
        : `<div class="sire-msg sire-msg-err"><i class="fa-solid fa-xmark"></i> ${_esc(r.error)}</div>`;
      if (r.success) setTimeout(() => _renderConfig(cont), 1500);
    } catch (e) { msg.innerHTML = `<div class="sire-msg sire-msg-err">Error: ${_esc(e.message)}</div>`; }
  });

  document.getElementById('cfg-probar').addEventListener('click', async () => {
    const estado = document.getElementById('cfg-estado');
    const msg = document.getElementById('sire-cfg-msg');
    estado.className = 'sire-estado pending'; estado.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando...';
    msg.innerHTML = '';
    try {
      const r = await window.api.testSireConnection();
      const ok = r.success;
      estado.className = `sire-estado ${ok ? 'ok' : 'error'}`;
      estado.innerHTML = `<i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}" style="font-size:8px;"></i> ${_esc(r.estado || (ok ? 'Conectado' : 'Error'))}`;
      msg.innerHTML = ok
        ? `<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-check"></i> ${_esc(r.mensaje)}</div>`
        : `<div class="sire-msg sire-msg-err"><i class="fa-solid fa-xmark"></i> ${_esc(r.mensaje || r.error)}</div>`;
    } catch (e) {
      estado.className = 'sire-estado error'; estado.innerHTML = '<i class="fa-solid fa-circle-xmark" style="font-size:8px;"></i> Error';
      msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(e.message)}</div>`;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SIRE SUNAT (operaciones contra la API)
// ═══════════════════════════════════════════════════════════════════════════════
function _renderSunat(cont) {
  cont.innerHTML = `
    <div class="sire-tabs">
      <button class="sire-tab ${_sunatTipo==='ventas'?'active':''}" data-st="ventas"><i class="fa-solid fa-file-invoice-dollar"></i> Ventas (RVIE)</button>
      <button class="sire-tab ${_sunatTipo==='compras'?'active':''}" data-st="compras"><i class="fa-solid fa-cart-shopping"></i> Compras (RCE)</button>
    </div>
    <div class="sire-toolbar">
      <div style="width:140px;"><label class="sire-lbl">Período (YYYYMM)</label><input type="text" id="sunat-periodo" maxlength="6" placeholder="202606" style="width:100%;"></div>
      <button class="sire-btn sire-btn-primary" id="sunat-periodos"><i class="fa-solid fa-calendar-check"></i> Consultar Períodos</button>
      <button class="sire-btn sire-btn-warn" id="sunat-propuesta"><i class="fa-solid fa-cloud-arrow-down"></i> Descargar Propuesta</button>
    </div>
    <div class="sire-toolbar">
      <div style="width:200px;"><label class="sire-lbl">N° de Ticket</label><input type="text" id="sunat-ticket" placeholder="Ej: 20260300000011" style="width:100%;"></div>
      <button class="sire-btn sire-btn-primary" id="sunat-consultar-ticket"><i class="fa-solid fa-magnifying-glass"></i> Consultar Ticket</button>
    </div>
    <div class="sire-toolbar">
      <div style="flex:1;min-width:260px;"><label class="sire-lbl">Nombre del Archivo (se obtiene al consultar ticket)</label><input type="text" id="sunat-nom-archivo" placeholder="Ej: 20614939509-CPF-20260701.zip" style="width:100%;"></div>
      <button class="sire-btn sire-btn-success" id="sunat-descargar-archivo"><i class="fa-solid fa-file-zipper"></i> Descargar Archivo</button>
      <button class="sire-btn sire-btn-outline" id="sunat-ver-descargas"><i class="fa-solid fa-folder-open"></i> Ver descargas</button>
    </div>
    <div id="sunat-msg"></div>
    <div id="sunat-resultado"></div>`;

  cont.querySelectorAll('.sire-tab').forEach(t => t.addEventListener('click', () => {
    _sunatTipo = t.dataset.st; _renderSunat(cont);
  }));

  const _msg = (tipo, txt) => { document.getElementById('sunat-msg').innerHTML = `<div class="sire-msg sire-msg-${tipo}">${txt}</div>`; };
  const _loading = (btn, txt) => { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${txt}`; };
  const _restore = (btn, html) => { btn.disabled = false; btn.innerHTML = html; };

  // Extrae info del ticket para la descarga
  function _extraerInfoArchivo(data) {
    if (!data) return { nom: '', codTipo: '00', codProceso: '', perTributario: '', numTicket: '' };
    const regs = data.registros || [];
    if (regs.length > 0) {
      const reg = regs[0];
      const ar = (reg.archivoReporte && reg.archivoReporte.length > 0) ? reg.archivoReporte[0] : {};
      return {
        nom: ar.nomArchivoReporte || ar.nomArchivoContenido || reg.nomArchivoImportacion || '',
        codTipo: ar.codTipoAchivoReporte || ar.codTipoArchivoReporte || '00',
        codProceso: reg.codProceso || '',
        perTributario: reg.perTributario || '',
        numTicket: reg.numTicket || '',
        estado: reg.desEstadoProceso || '',
      };
    }
    return { nom: '', codTipo: '00', codProceso: '', perTributario: '', numTicket: '' };
  }

  document.getElementById('sunat-periodos').addEventListener('click', async function() {
    const prev = this.innerHTML; _loading(this, 'Consultando...');
    try {
      const r = await window.api.consultarPeriodosSire({ tipo: _sunatTipo });
      if (!r.success) { _msg('err', `<i class="fa-solid fa-xmark"></i> ${_esc(r.error)}`); _restore(this, prev); return; }
      _msg('ok', '<i class="fa-solid fa-check"></i> Períodos obtenidos correctamente.');
      document.getElementById('sunat-resultado').innerHTML = _renderPeriodos(r.data);
      // Al hacer clic en un período, lo pone en el campo y puede descargar directo
      document.getElementById('sunat-resultado').querySelectorAll('[data-periodo]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('sunat-periodo').value = btn.dataset.periodo;
        });
      });
    } catch (e) { _msg('err', _esc(e.message)); } finally { _restore(this, prev); }
  });

  function _renderTicket(data) {
    if (!data) return '<div class="sire-empty">Sin datos del ticket.</div>';
    const regs = data.registros || [];
    if (regs.length === 0) return '<div class="sire-empty">No se encontraron registros para este ticket.</div>';

    const reg = regs[0];
    const det = reg.detalleTicket || {};
    const archivos = reg.archivoReporte || [];
    const subs = reg.subProcesos || [];

    const terminado = String(reg.codEstadoProceso) === '06';
    const enProceso = String(reg.codEstadoProceso) === '03' || String(reg.codEstadoProceso) === '04';
    const estadoColor = terminado ? '#2f745c' : enProceso ? '#a16d24' : '#a0444f';
    const estadoBg = terminado ? 'rgba(var(--ok-rgb),.12)' : enProceso ? 'rgba(var(--warn-rgb),.12)' : 'rgba(var(--err-rgb),.12)';
    const estadoIcon = terminado ? 'fa-circle-check' : enProceso ? 'fa-spinner fa-spin' : 'fa-circle-xmark';

    let html = `<div style="background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:18px 20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <i class="fa-solid fa-ticket" style="font-size:18px;color:var(--accent);"></i>
          <span style="font-weight:800;font-size:15px;color:var(--tx);">Ticket ${_esc(reg.numTicket)}</span>
        </div>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;background:${estadoBg};color:${estadoColor};">
          <i class="fa-solid ${estadoIcon}"></i> ${_esc(reg.desEstadoProceso || 'Desconocido')}
        </span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 18px;margin-bottom:14px;">
        <div><div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;">Período</div><div style="font-weight:600;color:var(--tx);">${_esc(reg.perTributario || '—')}</div></div>
        <div><div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;">Proceso</div><div style="font-weight:600;color:var(--tx);">${_esc(reg.desProceso || '—')}</div></div>
        <div><div style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;">Fecha Inicio</div><div style="font-weight:600;color:var(--tx);">${_esc(reg.fecInicioProceso || '—')}</div></div>
      </div>`;

    if (det.numTicket) {
      html += `<div style="background:var(--bg-block,#f4f8fc);border-radius:8px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;margin-bottom:8px;"><i class="fa-solid fa-circle-info"></i> Detalle del Envío</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 16px;font-size:12px;">
          <div><span style="color:var(--tx3);">Estado:</span> <strong>${_esc(det.desEstadoEnvio || '—')}</strong></div>
          <div><span style="color:var(--tx3);">Fecha carga:</span> <strong>${_esc(det.fecCargaImportacion || '—')}</strong></div>
          <div><span style="color:var(--tx3);">Hora:</span> <strong>${_esc(det.horaCargaImportacion || '—')}</strong></div>
          <div><span style="color:var(--tx3);">Filas validadas:</span> <strong>${det.cntFilasvalidada || 0}</strong></div>
          <div><span style="color:var(--tx3);">CP con error:</span> <strong style="color:${det.cntCPError > 0 ? '#a0444f' : 'inherit'}">${det.cntCPError || 0}</strong></div>
          <div><span style="color:var(--tx3);">CP informados:</span> <strong>${det.cntCPInformados || 0}</strong></div>
        </div>
      </div>`;
    }

    if (archivos.length > 0) {
      html += `<div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;margin-bottom:6px;"><i class="fa-solid fa-file-zipper"></i> Archivos Disponibles</div>
        ${archivos.map(ar => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(var(--ok-rgb),.06);border:1px solid rgba(var(--ok-rgb),.2);border-radius:8px;margin-bottom:4px;">
            <i class="fa-solid fa-file-arrow-down" style="color:var(--ok);font-size:14px;"></i>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:12px;color:var(--tx);">${_esc(ar.nomArchivoReporte || 'Sin nombre')}</div>
              <div style="font-size:10px;color:var(--tx3);">Tipo: ${_esc(ar.codTipoAchivoReporte || ar.codTipoArchivoReporte || '—')}</div>
            </div>
          </div>`).join('')}
      </div>`;
    }

    html += '</div>';
    return html;
  }

  function _renderPeriodos(data) {
    if (!data || !Array.isArray(data) || data.length === 0) return '<div class="sire-empty">No se encontraron períodos.</div>';
    const meses = {
      '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio',
      '07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
    };
    let html = '';
    data.forEach(ej => {
      const periodos = ej.lisPeriodos || [];
      html += `<div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:16px;font-weight:800;color:var(--tx);">${_esc(ej.numEjercicio)}</span>
          <span class="sire-estado ${ej.desEstado === 'Presentado' ? 'ok' : 'pending'}" style="font-size:10px;">${_esc(ej.desEstado)}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;">
          ${periodos.map(p => {
            const mes = meses[p.perTributario.substring(4, 6)] || p.perTributario.substring(4, 6);
            const presentado = p.codEstado === '01';
            const iconClass = presentado ? 'fa-circle-check' : 'fa-circle-xmark';
            const colorClass = presentado ? 'ok' : 'pending';
            return `<button data-periodo="${escapeAttr(p.perTributario)}" class="sire-periodo-card" style="
              display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;
              border:1px solid ${presentado ? 'rgba(var(--ok-rgb),.25)' : 'rgba(var(--warn-rgb),.3)'};
              background:${presentado ? 'rgba(var(--ok-rgb),.06)' : 'rgba(var(--warn-rgb),.06)'};
              transition:all .15s;text-align:left;width:100%;">
              <i class="fa-solid ${iconClass}" style="font-size:16px;color:${presentado ? 'var(--ok)' : 'var(--warn)'};"></i>
              <div style="flex:1;">
                <div style="font-weight:700;font-size:13px;color:var(--tx);">${_esc(mes)}</div>
                <div style="font-size:10px;color:var(--tx3);">${_esc(p.perTributario)}</div>
              </div>
              <span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:6px;
                background:${presentado ? 'rgba(var(--ok-rgb),.12)' : 'rgba(var(--warn-rgb),.12)'};color:${presentado ? 'var(--ok)' : 'var(--warn)'};">
                ${presentado ? 'Presentado' : 'Pendiente'}
              </span>
            </button>`;
          }).join('')}
        </div>
      </div>`;
    });
    return html;
  }

  document.getElementById('sunat-propuesta').addEventListener('click', async function() {
    const periodo = document.getElementById('sunat-periodo').value;
    if (!periodo || periodo.length !== 6) { _msg('err', 'Ingrese el período en formato YYYYMM.'); return; }
    const prev = this.innerHTML; _loading(this, 'Descargando...');
    try {
      const r = await window.api.descargarPropuestaSire({ tipo: _sunatTipo, periodo });
      if (r.success) {
        _msg('ok', `<i class="fa-solid fa-check"></i> Propuesta descargada. Ticket: <strong>${_esc(r.data?.numTicket || '—')}</strong>. Ahora consulte el ticket para obtener el nombre del archivo.`);
        document.getElementById('sunat-resultado').innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:16px 18px;display:flex;align-items:center;gap:14px;">
          <div style="width:42px;height:42px;border-radius:8px;background:var(--accent-lt);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;"><i class="fa-solid fa-ticket"></i></div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--tx);">Ticket generado: ${_esc(r.data?.numTicket || '—')}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:2px;">Presione "Consultar Ticket" para ver el estado y obtener el archivo.</div>
          </div>
        </div>`;
        if (r.data?.numTicket) document.getElementById('sunat-ticket').value = r.data.numTicket;
      } else { _msg('err', `<i class="fa-solid fa-xmark"></i> ${_esc(r.error)}`); }
    } catch (e) { _msg('err', _esc(e.message)); } finally { _restore(this, prev); }
  });

  document.getElementById('sunat-consultar-ticket').addEventListener('click', async function() {
    const ticket = document.getElementById('sunat-ticket').value.trim();
    if (!ticket) { _msg('err', 'Ingrese el N° de ticket.'); return; }
    const prev = this.innerHTML; _loading(this, 'Consultando...');
    try {
      const r = await window.api.consultarTicketSire({ tipo: _sunatTipo, ticket, periodo: document.getElementById('sunat-periodo').value });
      if (r.success) {
        const info = _extraerInfoArchivo(r.data);
        document.getElementById('sunat-resultado').innerHTML = _renderTicket(r.data);
        if (info.nom) {
          const el = document.getElementById('sunat-nom-archivo');
          el.value = info.nom;
          el.dataset.codTipo = info.codTipo;
          el.dataset.codProceso = info.codProceso;
          el.dataset.perTributario = info.perTributario;
          el.dataset.numTicket = info.numTicket;
          _msg('ok', `<i class="fa-solid fa-check"></i> Archivo listo para descargar.`);
        } else {
          _msg('warn', '<i class="fa-solid fa-clock"></i> El archivo aún no está listo. Espere unos segundos e intente de nuevo.');
        }
      } else {
        _msg('err', `<i class="fa-solid fa-xmark"></i> ${_esc(r.error)}`);
      }
    } catch (e) { _msg('err', _esc(e.message)); } finally { _restore(this, prev); }
  });

  function _renderDescargas(archivos) {
    if (!archivos?.length) return '<div class="sire-empty"><i class="fa-solid fa-folder-open"></i><br>No hay archivos descargados para este período.</div>';
    return `<div style="background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;padding:14px 16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:800;color:var(--tx);"><i class="fa-solid fa-folder-open" style="color:var(--accent);"></i> Archivos descargados</div>
      <div class="sire-table-wrap" style="max-height:35vh;"><table class="sire-table"><thead><tr><th>Archivo</th><th>Tamaño</th><th>Fecha</th></tr></thead><tbody>
        ${archivos.map(a => `<tr><td>${_esc(a.nombre)}</td><td style="text-align:right">${_fmt((Number(a.size)||0)/1024)} KB</td><td>${_esc(a.fecha ? new Date(a.fecha).toLocaleString('es-PE') : '')}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }

  document.getElementById('sunat-ver-descargas').addEventListener('click', async function() {
    const periodo = document.getElementById('sunat-periodo').value.trim();
    if (!/^\d{6}$/.test(periodo)) { _msg('err', 'Ingrese un período YYYYMM para listar sus descargas.'); return; }
    const prev = this.innerHTML; _loading(this, 'Consultando...');
    try {
      const r = await window.api.listarArchivosSire({ tipo: _sunatTipo, periodo });
      if (!r.success) { _msg('err', `<i class="fa-solid fa-xmark"></i> ${_esc(r.error)}`); return; }
      document.getElementById('sunat-resultado').innerHTML = _renderDescargas(r.archivos || []);
      _msg('ok', `<i class="fa-solid fa-check"></i> ${Number(r.archivos?.length || 0)} archivo(s) encontrado(s).`);
    } catch (e) { _msg('err', _esc(e.message)); }
    finally { _restore(this, prev); }
  });

  document.getElementById('sunat-descargar-archivo').addEventListener('click', async function() {
    const el = document.getElementById('sunat-nom-archivo');
    const nomArchivo = el.value.trim();
    const periodo = document.getElementById('sunat-periodo').value;
    const numTicket = document.getElementById('sunat-ticket').value.trim();
    if (!nomArchivo) { _msg('err', 'Ingrese el nombre del archivo. Primero consulte el ticket para obtenerlo.'); return; }
    const prev = this.innerHTML; _loading(this, 'Descargando...');
    try {
      const r = await window.api.descargarArchivoSire({
        tipo: _sunatTipo,
        nomArchivoReporte: nomArchivo,
        codTipoArchivoReporte: el.dataset.codTipo || '00',
        periodo: el.dataset.perTributario || periodo,
        codProceso: el.dataset.codProceso || '10',
        numTicket: el.dataset.numTicket || numTicket,
      });
      r.success ? _msg('ok', `<i class="fa-solid fa-check"></i> Archivo descargado: ${_esc(r.nombre)} (${(r.size/1024).toFixed(1)} KB)`) : _msg('err', `<i class="fa-solid fa-xmark"></i> ${_esc(r.error)}`);
    } catch (e) { _msg('err', _esc(e.message)); } finally { _restore(this, prev); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CODIFICACIÓN — Configurar cuentas contables para SIRE
// ═══════════════════════════════════════════════════════════════════════════════
async function _renderCodificar(cont) {
  let config = {};
  try { config = await window.api.getSireCodificacion() || {}; } catch(_) {}

  cont.innerHTML = `
    <div class="sire-cfg-card">
      <h3 style="margin:0 0 6px;font-size:14px;"><i class="fa-solid fa-tags"></i> Codificación de Cuentas SIRE</h3>
      <p style="font-size:11px;color:var(--tx3);margin:0 0 16px;">
        Configure las cuentas contables que se usarán al contabilizar automáticamente los registros del SIRE.
        Estas cuentas se aplicarán a todas las operaciones importadas desde el ZIP de SUNAT.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div style="border:1px solid var(--brd);border-radius:8px;padding:14px;background:var(--bg-block,#f8fafc);">
          <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-cart-shopping"></i> COMPRAS (RCE)
          </div>
          <div style="margin-bottom:8px;">
            <label class="sire-lbl">Cuenta Gasto</label>
            <input type="text" id="cod-cuenta-gasto" value="${escapeAttr(config.cuenta_gasto || '')}" placeholder="Ej. 6011 (Mercaderías)" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Cuenta del elemento 6 donde se registra el gasto</small>
          </div>
          <div style="margin-bottom:8px;">
            <label class="sire-lbl">Cuenta IGV Compras</label>
            <input type="text" id="cod-cuenta-igv-compras" value="${escapeAttr(config.cuenta_igv_compras || '')}" placeholder="Ej. 40111" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Cuenta de crédito fiscal IGV</small>
          </div>
          <div>
            <label class="sire-lbl">Cuenta Por Pagar</label>
            <input type="text" id="cod-cuenta-cxp" value="${escapeAttr(config.cuenta_cxp || '')}" placeholder="Ej. 4212 (Emitidas)" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Contrapartida: cuenta por pagar al proveedor</small>
          </div>
        </div>

        <div style="border:1px solid var(--brd);border-radius:8px;padding:14px;background:var(--bg-block,#f8fafc);">
          <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-file-invoice-dollar"></i> VENTAS (RVIE)
          </div>
          <div style="margin-bottom:8px;">
            <label class="sire-lbl">Cuenta Ingreso</label>
            <input type="text" id="cod-cuenta-ingreso" value="${escapeAttr(config.cuenta_ingreso || '')}" placeholder="Ej. 7011 (Mercaderías)" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Cuenta del elemento 7 donde se registra el ingreso</small>
          </div>
          <div style="margin-bottom:8px;">
            <label class="sire-lbl">Cuenta IGV Ventas</label>
            <input type="text" id="cod-cuenta-igv-ventas" value="${escapeAttr(config.cuenta_igv_ventas || '')}" placeholder="Ej. 40111" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Cuenta de débito fiscal IGV</small>
          </div>
          <div>
            <label class="sire-lbl">Cuenta Por Cobrar</label>
            <input type="text" id="cod-cuenta-cxc" value="${escapeAttr(config.cuenta_cxc || '')}" placeholder="Ej. 1212 (Emitidas)" maxlength="8" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
            <small style="color:var(--tx3);font-size:10px;">Contrapartida: cuenta por cobrar al cliente</small>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;display:flex;justify-content:flex-end;">
        <button class="sire-btn sire-btn-primary" id="cod-guardar"><i class="fa-solid fa-floppy-disk"></i> Guardar Configuración</button>
      </div>
      <div id="cod-msg" style="margin-top:8px;"></div>
    </div>`;

  // ── Autocomplete para campos de cuenta ──────────────────────────────────
  let _planCuentas = [];
  try { _planCuentas = await window.api.getPlanCuentas(); } catch(_) {}

  if (!document.getElementById('cod-ac-styles')) {
    const ss = document.createElement('style'); ss.id = 'cod-ac-styles';
    ss.textContent = `
      .cod-ac-wrap{position:relative;}
      .cod-ac-list{position:absolute;top:100%;left:0;right:0;max-height:180px;overflow-y:auto;background:var(--bg-modal,#fff);
        border:1px solid var(--brd,#c0ccd8);border-radius:0 0 6px 6px;box-shadow:0 6px 16px rgba(0,0,0,.12);z-index:50;display:none;}
      .cod-ac-list.show{display:block;}
      .cod-ac-item{padding:6px 10px;font-size:11px;cursor:pointer;display:flex;justify-content:space-between;border-bottom:1px solid var(--brd-lt,#eef2f6);}
      .cod-ac-item:hover,.cod-ac-item.selected{background:var(--accent-lt,#e8f0fa);}
      .cod-ac-code{font-weight:700;color:var(--accent,#2f6f8f);min-width:50px;}
      .cod-ac-desc{color:var(--tx2,#5a7088);flex:1;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    `;
    document.head.appendChild(ss);
  }

  const camposCuenta = ['cod-cuenta-gasto','cod-cuenta-igv-compras','cod-cuenta-cxp','cod-cuenta-ingreso','cod-cuenta-igv-ventas','cod-cuenta-cxc'];
  camposCuenta.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    // Wrap input in relative container
    const wrapper = document.createElement('div');
    wrapper.className = 'cod-ac-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('div');
    list.className = 'cod-ac-list';
    wrapper.appendChild(list);

    // Add description label below
    const descLabel = document.createElement('small');
    descLabel.style.cssText = 'color:var(--tx3);font-size:10px;display:block;margin-top:2px;min-height:14px;';
    const currentVal = input.value.trim();
    if (currentVal) {
      const match = _planCuentas.find(c => c.codigo === currentVal);
      if (match) descLabel.textContent = match.descripcion;
    }
    wrapper.parentNode.insertBefore(descLabel, wrapper.nextSibling?.nextSibling || null);

    const filtrar = () => {
      const val = input.value.trim().toLowerCase();
      if (!val) { list.classList.remove('show'); return; }
      const filtered = _planCuentas.filter(c =>
        c.codigo.toLowerCase().startsWith(val) ||
        c.descripcion.toLowerCase().includes(val)
      ).slice(0, 15);
      if (!filtered.length) { list.classList.remove('show'); return; }
      list.innerHTML = filtered.map(c =>
        `<div class="cod-ac-item" data-codigo="${escapeAttr(c.codigo)}" data-desc="${escapeAttr(c.descripcion || '')}">
          <span class="cod-ac-code">${_esc(c.codigo)}</span>
          <span class="cod-ac-desc">${_esc(c.descripcion || '')}</span>
        </div>`
      ).join('');
      list.classList.add('show');
    };

    input.addEventListener('input', filtrar);
    input.addEventListener('focus', filtrar);
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 200));

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.cod-ac-item');
      if (!item) return;
      input.value = item.dataset.codigo;
      descLabel.textContent = item.dataset.desc;
      list.classList.remove('show');
    });
  });

  document.getElementById('cod-guardar').addEventListener('click', async () => {
    const data = {
      cuenta_gasto: document.getElementById('cod-cuenta-gasto').value.trim(),
      cuenta_ingreso: document.getElementById('cod-cuenta-ingreso').value.trim(),
      cuenta_igv_compras: document.getElementById('cod-cuenta-igv-compras').value.trim(),
      cuenta_igv_ventas: document.getElementById('cod-cuenta-igv-ventas').value.trim(),
      cuenta_cxp: document.getElementById('cod-cuenta-cxp').value.trim(),
      cuenta_cxc: document.getElementById('cod-cuenta-cxc').value.trim(),
    };
    const r = await window.api.saveSireCodificacion(data);
    const msg = document.getElementById('cod-msg');
    msg.innerHTML = r.success
      ? '<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-check"></i> Configuración guardada correctamente.</div>'
      : `<div class="sire-msg sire-msg-err">${_esc(r.error)}</div>`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CONTABILIZAR — Subir ZIP SIRE y registrar vouchers automáticamente
// ═══════════════════════════════════════════════════════════════════════════════
async function _renderContabilizar(cont) {
  let config = {};
  try { config = await window.api.getSireCodificacion() || {}; } catch(_) {}
  const tieneConfig = (config.cuenta_gasto || config.cuenta_ingreso) && (config.cuenta_cxp || config.cuenta_cxc);

  cont.innerHTML = `
    <div class="sire-cfg-card">
      <h3 style="margin:0 0 6px;font-size:14px;"><i class="fa-solid fa-book-open-reader"></i> Contabilizar desde archivo SIRE</h3>
      <p style="font-size:11px;color:var(--tx3);margin:0 0 14px;">
        Suba el archivo ZIP descargado del SIRE de SUNAT. El sistema analizará si es compras o ventas,
        y registrará automáticamente los vouchers usando las cuentas configuradas en Codificación.
      </p>
      ${!tieneConfig ? '<div class="sire-msg sire-msg-err" style="margin-bottom:12px;"><i class="fa-solid fa-triangle-exclamation"></i> Debe configurar las cuentas en la pestaña <strong>Codificación</strong> antes de contabilizar.</div>' : ''}

      <div class="sire-cfg-grid">
        <div><label class="sire-lbl">Tipo</label>
          <select id="ctb-tipo" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:6px;font-size:12px;">
            <option value="compras">Compras (RCE)</option><option value="ventas">Ventas (RVIE)</option></select></div>
        <div><label class="sire-lbl">Glosa para todos los asientos</label>
          <input type="text" id="ctb-glosa" placeholder="Ej. Registro de compras julio 2026" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:6px;font-size:12px;"></div>
      </div>

      <div style="margin-top:12px;">
        <label class="sire-lbl"><i class="fa-solid fa-file-zipper"></i> Archivo SIRE (ZIP o TXT)</label>
        <input type="file" id="ctb-archivo" accept=".zip,.txt,.csv" style="width:100%;padding:8px;border:1px solid var(--brd);border-radius:6px;font-size:12px;background:var(--bg-input,#fff);">
      </div>

      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
        <button class="sire-btn sire-btn-primary" id="ctb-analizar" ${!tieneConfig?'disabled style="opacity:.5;"':''}><i class="fa-solid fa-magnifying-glass-chart"></i> Analizar Archivo</button>
        <span style="font-size:10px;color:var(--tx3);">Primero analice el archivo para ver las operaciones antes de contabilizar.</span>
      </div>
      <div id="ctb-msg" style="margin-top:8px;"></div>
    </div>
    <div id="ctb-contenido"></div>`;

  document.getElementById('ctb-analizar').addEventListener('click', async () => {
    const archivo = document.getElementById('ctb-archivo').files[0];
    const tipo = document.getElementById('ctb-tipo').value;
    const glosa = document.getElementById('ctb-glosa').value.trim();
    const msg = document.getElementById('ctb-msg');
    const contenido = document.getElementById('ctb-contenido');

    if (!archivo) { msg.innerHTML = '<div class="sire-msg sire-msg-err">Seleccione un archivo ZIP o TXT.</div>'; return; }
    if (!glosa) { msg.innerHTML = '<div class="sire-msg sire-msg-err">Ingrese una glosa para los asientos.</div>'; return; }

    // Auto-detectar tipo desde el nombre del archivo SUNAT
    // Formato: LE + RUC(11) + YYYYMM(6) + 00 + LIBRO(4) + ...
    // LIBRO: 1404/1400 = Ventas, 0801/0800 = Compras
    let tipoDetectado = tipo;
    const fname = archivo.name.replace(/\.[^.]+$/, ''); // sin extensión
    if (fname.startsWith('LE') && fname.length >= 25) {
      const libroCode = fname.substring(21, 23); // posición 21-22 = primeros 2 dígitos del libro
      if (libroCode === '14') { tipoDetectado = 'ventas'; }
      else if (libroCode === '08') { tipoDetectado = 'compras'; }
      // Actualizar el select si se detectó
      if (tipoDetectado !== tipo) {
        document.getElementById('ctb-tipo').value = tipoDetectado;
        msg.innerHTML = `<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-wand-magic-sparkles"></i> Detectado automáticamente: <strong>${tipoDetectado === 'ventas' ? 'VENTAS (RVIE)' : 'COMPRAS (RCE)'}</strong> desde el nombre del archivo.</div>`;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    msg.innerHTML = '<div class="sire-msg sire-msg-warn"><i class="fa-solid fa-spinner fa-spin"></i> Analizando archivo...</div>';

    try {
      const text = await _leerArchivoSIRE(archivo);
      const registros = _parsearSIRE(text, tipoDetectado);

      if (!registros.length) { msg.innerHTML = '<div class="sire-msg sire-msg-err">No se encontraron registros válidos en el archivo.</div>'; return; }
      msg.innerHTML = `<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-check"></i> ${registros.length} registro(s) encontrados. Revise y presione Contabilizar.</div>`;

      contenido.innerHTML = `
      <div class="sire-cfg-card" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="margin:0;font-size:13px;"><i class="fa-solid fa-list-ol"></i> ${registros.length} operación(es) — ${tipoDetectado === 'ventas' ? 'Ventas (RVIE)' : 'Compras (RCE)'}</h4>
          <button class="sire-btn sire-btn-primary" id="ctb-procesar"><i class="fa-solid fa-gears"></i> Contabilizar ${registros.length} registro(s)</button>
        </div>
        <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;">
          Cuentas: ${_esc(tipoDetectado==='compras' ? config.cuenta_gasto+' / '+(config.cuenta_igv_compras||'—')+' / '+config.cuenta_cxp : config.cuenta_ingreso+' / '+(config.cuenta_igv_ventas||'—')+' / '+config.cuenta_cxc)}
          &nbsp;|&nbsp; Glosa: "${_esc(glosa)}" &nbsp;|&nbsp; Tipo: ${tipoDetectado === 'ventas' ? 'Ventas (origen 14)' : 'Compras (origen 8)'}
        </div>
        <div class="sire-table-wrap">
          <table class="sire-table">
            <thead><tr>
              <th>#</th><th>T/D</th><th>Número</th><th>Fecha Doc.</th><th>Fecha Venc.</th><th>RUC/DNI</th><th>Razón Social</th>
              <th style="text-align:right">Base Imp.</th><th style="text-align:right">Exon./Inaf.</th><th style="text-align:right">IGV</th><th style="text-align:right">Total</th><th>Mon.</th><th>T/C</th>
            </tr></thead>
            <tbody>
              ${registros.map((r, i) => `<tr>
                <td style="text-align:center;">${i+1}</td>
                <td style="text-align:center;">${_esc(r.tipo_doc || '')}</td>
                <td style="font-weight:600;color:var(--accent);">${_esc(r.serie || '')}${r.serie ? '-' : ''}${_esc(r.numero || '')}</td>
                <td>${_esc(r.fecha_emision || '')}</td>
                <td>${_esc(r.fecha_venc || r.fecha_emision || '')}</td>
                <td>${_esc(r.ruc_dni || '')}</td>
                <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(r.razon_social || '')}</td>
                <td style="text-align:right;">${fmt(r.base_gravada||0)}</td>
                <td style="text-align:right;">${fmt((r.exonerado||0)+(r.inafecto||0))}</td>
                <td style="text-align:right;">${fmt(r.igv||0)}</td>
                <td style="text-align:right;font-weight:600;">${fmt(r.total||0)}</td>
                <td style="text-align:center;">${_esc(r.moneda || 'PEN')}</td>
                <td style="text-align:right;">${_esc(r.tc || '1.000')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

      document.getElementById('ctb-procesar').addEventListener('click', async () => {
        const btn = document.getElementById('ctb-procesar');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        try {
          const r = await window.api.contabilizarZip({ registros, tipo: tipoDetectado, glosa, config });
          if (r.success) {
            msg.innerHTML = `<div class="sire-msg sire-msg-ok"><i class="fa-solid fa-check-double"></i> <strong>${r.registrados} asiento(s) registrados correctamente.</strong>${r.errores.length ? ' Errores: ' + r.errores.length : ''}</div>`;
            if (r.errores.length) {
              msg.innerHTML += `<div style="margin-top:6px;font-size:10px;color:var(--err);max-height:100px;overflow-y:auto;">${r.errores.map(e=>'• '+_esc(e)).join('<br>')}</div>`;
            }
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Completado';
          } else {
            msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(r.error)}</div>`;
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gears"></i> Reintentar';
          }
        } catch(e) { msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(e.message)}</div>`; btn.disabled=false; btn.innerHTML='Reintentar'; }
      });
    } catch(e) { msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(e.message)}</div>`; }
  });
}

// Parser de archivos SIRE (ZIP con TXT pipe-delimited o TXT directo)
async function _leerArchivoSIRE(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Detectar si es ZIP (PK header)
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const fullText = textDecoder.decode(bytes);
      const lines = fullText.split('\n').filter(l => l.includes('|') && l.split('|').length > 5);
      if (lines.length > 0) return lines.join('\n');
      throw new Error('No se pudo leer el contenido del ZIP');
    } catch(_) {
      throw new Error('No se pudo procesar el ZIP. Extraiga el TXT y súbalo directamente.');
    }
  }
  // TXT directo — probar UTF-8 primero, luego latin1
  try {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('|')) return text;
  } catch(_) {}
  return new TextDecoder('latin1').decode(bytes);
}

function _parsearSIRE(text, tipo) {
  // Limpiar BOM y normalizar saltos de línea
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawLines = text.split('\n');
  const joined = [];
  let i = 0;

  // Saltar header si existe
  if (rawLines.length > 0 && rawLines[0].toLowerCase().includes('ruc') && rawLines[0].toLowerCase().includes('razon')) {
    i = 1;
  }

  // Los archivos SIRE de SUNAT tienen registros en 2 líneas:
  // Línea 1: "RUC|RAZÓN SOCIAL"
  // Línea 2: "|PERIODO|CAR|FECHA|..." (empieza con |)
  while (i < rawLines.length) {
    const line = rawLines[i].trim();
    if (!line) { i++; continue; }

    // Si la siguiente línea empieza con |, unir ambas
    if (i + 1 < rawLines.length && rawLines[i + 1].trim().startsWith('|')) {
      joined.push(line + rawLines[i + 1].trim());
      i += 2;
    } else if (line.split('|').length > 20) {
      joined.push(line); // línea completa en una sola
      i++;
    } else {
      i++;
    }
  }

  // Convertir fecha DD/MM/YYYY → YYYY-MM-DD
  const parseFecha = (f) => {
    if (!f || !f.includes('/')) return f || '';
    const p = f.split('/');
    return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : f;
  };

  const registros = [];
  for (const line of joined) {
    const cols = line.split('|');
    if (cols.length < 20) continue;

    // SUNAT usa estructuras distintas para Ventas (RVIE, Anexo 3) y
    // Compras (RCE, Anexo 11). Las posiciones no se comparten.
    const monto = (idx) => { const n=Number.parseFloat(String(cols[idx]||'0').replace(/,/g,'')); return Number.isFinite(n)?n:0; };
    const esCompras = String(tipo||'').toLowerCase()==='compras';
    let reg;

    if (esCompras) {
      // RCE: 0:RUC|1:Razón generador|2:Periodo|3:CAR|4:Fecha|5:Vcto|6:Tipo|
      // 7:Serie|8:Año|9:Nro inicial|10:Nro final|11:Tipo Id|12:Nro Id|13:Proveedor|
      // 14:G1 BI|15:G1 IGV|16:G2 BI|17:G2 IGV|18:G3 BI|19:G3 IGV|20:No gravado|
      // 21:ISC|22:ICBPER|23:Otros|24:Total|25:Moneda|26:TC|27..31:referencia.
      reg = {
        ruc_empresa:(cols[0]||'').trim(), razon_social_emp:(cols[1]||'').trim(),
        periodo:(cols[2]||'').trim(), car_sunat:(cols[3]||'').trim(),
        fecha_emision:parseFecha((cols[4]||'').trim()), fecha_venc:parseFecha((cols[5]||'').trim()),
        tipo_doc:(cols[6]||'').trim(), serie:(cols[7]||'').trim(), anio_documento:(cols[8]||'').trim(),
        numero:(cols[9]||'').trim(), numero_final:(cols[10]||'').trim(),
        tipo_doc_id:(cols[11]||'').trim(), ruc_dni:(cols[12]||'').trim(), razon_social:(cols[13]||'').trim(),
        g1_base:monto(14), g1_igv:monto(15), g2_base:monto(16), g2_igv:monto(17),
        g3_base:monto(18), g3_igv:monto(19), valor_no_gravado:monto(20), isc:monto(21),
        icbper:monto(22), otros_tributos:monto(23), total:monto(24),
        moneda:(cols[25]||'PEN').trim(), tc:(cols[26]||'1.000').trim(),
        ref_fecha:parseFecha((cols[27]||'').trim()), ref_tipo_documento:(cols[28]||'').trim(),
        ref_serie:(cols[29]||'').trim(), cod_dam_dsi:(cols[30]||'').trim(), ref_numero:(cols[31]||'').trim(),
        clasificacion_bienes_servicios:(cols[32]||'').trim(), proyecto_operadores:(cols[33]||'').trim(),
        porcentaje_participacion:monto(34), imb:monto(35), car_original:(cols[36]||'').trim(),
      };
      reg.base_gravada=reg.g1_base+reg.g2_base+reg.g3_base;
      reg.base_imponible=reg.base_gravada;
      reg.igv=reg.g1_igv+reg.g2_igv+reg.g3_igv;
      reg.exonerado=0; reg.inafecto=0;
    } else {
      // RVIE: 13 exportación, 14 BI, 15 descuento BI, 16 IGV, 17 descuento IGV,
      // 18 exonerado, 19 inafecto, 20 ISC, 21 BI IVAP, 22 IVAP, 23 ICBPER,
      // 24 otros, 25 total, 26 moneda, 27 TC, 28..31 referencia.
      reg = {
        ruc_empresa:(cols[0]||'').trim(), razon_social_emp:(cols[1]||'').trim(),
        periodo:(cols[2]||'').trim(), car_sunat:(cols[3]||'').trim(),
        fecha_emision:parseFecha((cols[4]||'').trim()), fecha_venc:parseFecha((cols[5]||'').trim()),
        tipo_doc:(cols[6]||'').trim(), serie:(cols[7]||'').trim(), numero:(cols[8]||'').trim(), numero_final:(cols[9]||'').trim(),
        tipo_doc_id:(cols[10]||'').trim(), ruc_dni:(cols[11]||'').trim(), razon_social:(cols[12]||'').trim(),
        valor_exportacion:monto(13), base_gravada:monto(14), descuento_base:monto(15), igv:monto(16),
        descuento_igv:monto(17), exonerado:monto(18), inafecto:monto(19), isc:monto(20),
        base_ivap:monto(21), ivap:monto(22), icbper:monto(23), otros_tributos:monto(24), total:monto(25),
        moneda:(cols[26]||'PEN').trim(), tc:(cols[27]||'1.000').trim(),
        ref_fecha:parseFecha((cols[28]||'').trim()), ref_tipo_documento:(cols[29]||'').trim(),
        ref_serie:(cols[30]||'').trim(), ref_numero:(cols[31]||'').trim(), proyecto_operadores:(cols[32]||'').trim(),
      };
      reg.base_imponible=reg.base_gravada;
    }


    const importes = esCompras
      ? [reg.total,reg.g1_base,reg.g1_igv,reg.g2_base,reg.g2_igv,reg.g3_base,reg.g3_igv,reg.valor_no_gravado,reg.isc,reg.icbper,reg.otros_tributos]
      : [reg.total,reg.valor_exportacion,reg.base_gravada,reg.descuento_base,reg.igv,reg.descuento_igv,reg.exonerado,reg.inafecto,reg.isc,reg.ivap,reg.icbper,reg.otros_tributos];
    if (reg.tipo_doc && reg.numero && importes.some(v=>Math.abs(Number(v)||0)>0.00001)) registros.push(reg);
  }
  return registros;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. COMPARACIÓN LOCAL vs SUNAT
// ═══════════════════════════════════════════════════════════════════════════════
function _renderComparar(cont) {
  cont.innerHTML = `
    <div class="sire-cfg-card">
      <h3 style="margin:0 0 6px;font-size:14px;"><i class="fa-solid fa-code-compare"></i> Comparar Registros Locales vs Propuesta SUNAT</h3>
      <p style="font-size:11px;color:var(--tx3);margin:0 0 12px;">Seleccione el archivo ZIP descargado de SUNAT o pegue los datos para comparar con sus registros locales.</p>
      <div class="sire-cfg-grid">
        <div><label class="sire-lbl">Tipo</label>
          <select id="cmp-tipo" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:6px;font-size:12px;">
            <option value="ventas">Ventas (RVIE)</option><option value="compras">Compras (RCE)</option></select></div>
        <div><label class="sire-lbl">Período (YYYYMM)</label><input type="text" id="cmp-periodo" maxlength="6" placeholder="202607"></div>
        <div class="sire-cfg-full">
          <label class="sire-lbl"><i class="fa-solid fa-file-zipper"></i> Archivo SUNAT (ZIP descargado)</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="file" id="cmp-archivo" accept=".zip,.txt,.csv" style="flex:1;padding:6px;border:1px solid var(--brd);border-radius:6px;font-size:11px;">
            <span id="cmp-archivo-info" style="font-size:10px;color:var(--tx3);"></span>
          </div>
        </div>
        <div class="sire-cfg-full" style="display:flex;gap:10px;align-items:center;">
          <button class="sire-btn sire-btn-primary" id="cmp-ejecutar"><i class="fa-solid fa-code-compare"></i> Comparar</button>
          <span style="font-size:10px;color:var(--tx3);">Se compararán sus registros locales contra el contenido del archivo SUNAT.</span>
        </div>
      </div>
      <div id="cmp-msg"></div>
    </div>
    <div id="cmp-resultado"></div>`;

  // Auto-detectar tipo y período desde el nombre del archivo
  document.getElementById('cmp-archivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fname = file.name.replace(/\.[^.]+$/, '');
    const info = document.getElementById('cmp-archivo-info');

    if (fname.startsWith('LE') && fname.length >= 25) {
      // Formato: LE + RUC(11) + YYYYMM(6) + 00 + LIBRO(2)...
      const periodo = fname.substring(13, 19); // YYYYMM
      const libroCode = fname.substring(21, 23); // 14=ventas, 08=compras

      let tipoDetectado = '';
      if (libroCode === '14') tipoDetectado = 'ventas';
      else if (libroCode === '08') tipoDetectado = 'compras';

      const msgs = [];
      if (tipoDetectado) {
        document.getElementById('cmp-tipo').value = tipoDetectado;
        msgs.push(tipoDetectado === 'ventas' ? 'VENTAS (RVIE)' : 'COMPRAS (RCE)');
      }
      if (periodo && periodo.length === 6) {
        document.getElementById('cmp-periodo').value = periodo;
        msgs.push(`Período ${periodo.slice(0,4)}-${periodo.slice(4,6)}`);
      }
      if (msgs.length > 0) {
        info.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--ok);"></i> <strong style="color:var(--ok);">Detectado:</strong> ${_esc(msgs.join(' · '))}`;
      }
    }
  });

  document.getElementById('cmp-ejecutar').addEventListener('click', async () => {
    const tipo = document.getElementById('cmp-tipo').value;
    const periodo = document.getElementById('cmp-periodo').value;
    const fileInput = document.getElementById('cmp-archivo');
    const msg = document.getElementById('cmp-msg');
    const resultado = document.getElementById('cmp-resultado');

    if (!periodo || periodo.length !== 6) { msg.innerHTML = '<div class="sire-msg sire-msg-err">Período inválido (YYYYMM).</div>'; return; }

    msg.innerHTML = '<div class="sire-msg sire-msg-warn"><i class="fa-solid fa-spinner fa-spin"></i> Comparando...</div>';

    try {
      // Leer el archivo si se seleccionó
      let propuestaSunat = [];
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        // Enviar al backend para que lo parsee (ZIP → TXT → registros)
        const parseResult = await window.api.compararSireLocalSunat({
          tipo, periodo, archivoBase64: base64, nombreArchivo: file.name
        });
        if (!parseResult.success) { msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(parseResult.error)}</div>`; return; }
        msg.innerHTML = '';
        resultado.innerHTML = _renderCmpResultado(parseResult, tipo, periodo);
        _attachRegistrarBtns(resultado, tipo);
        return;
      }

      // Sin archivo → comparar solo local
      const r = await window.api.compararSireLocalSunat({ tipo, periodo, propuestaSunat: [] });
      if (!r.success) { msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(r.error)}</div>`; return; }
      msg.innerHTML = '';
      resultado.innerHTML = _renderCmpResultado(r, tipo, periodo);
    } catch (e) { msg.innerHTML = `<div class="sire-msg sire-msg-err">${_esc(e.message)}</div>`; }
  });
}

// Attach botones "Registrar" — crea voucher usando config de Codificación
function _attachRegistrarBtns(container, tipo) {
  // Registrar individual
  container.querySelectorAll('.cmp-btn-registrar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = JSON.parse(decodeURIComponent(btn.dataset.registro));
      const glosa = container.querySelector('#cmp-glosa')?.value.trim() || 'Registro desde comparación SIRE';
      const config = await window.api.getSireCodificacion() || {};
      const cuentaBase = tipo === 'ventas' ? config.cuenta_ingreso : config.cuenta_gasto;
      const cuentaDest = tipo === 'ventas' ? config.cuenta_cxc : config.cuenta_cxp;
      if (!cuentaBase || !cuentaDest) { alert('Configure las cuentas en Codificación primero.'); return; }
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        const r = await window.api.contabilizarZip({ registros: [data], tipo, glosa, config });
        if (r.success && r.registrados > 0) {
          btn.innerHTML = '<i class="fa-solid fa-check"></i> OK'; btn.style.background = 'var(--btn-ok)';
          btn.closest('tr').style.opacity = '0.5';
        } else {
          btn.innerHTML = '<i class="fa-solid fa-xmark"></i>'; btn.style.background = 'var(--btn-err)';
          alert(r.errores?.join('\n') || r.error || 'Error'); btn.disabled = false;
        }
      } catch(e) { alert(e.message); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Registrar'; }
    });
  });
  // Registrar todos
  const btnTodos = container.querySelector('#cmp-registrar-todos');
  if (btnTodos) {
    btnTodos.addEventListener('click', async () => {
      const glosa = container.querySelector('#cmp-glosa')?.value.trim();
      if (!glosa) { alert('Ingrese una glosa para los asientos.'); return; }
      const config = await window.api.getSireCodificacion() || {};
      if (!(tipo==='ventas'?config.cuenta_ingreso:config.cuenta_gasto)) { alert('Configure las cuentas en Codificación primero.'); return; }
      if (!confirm('¿Registrar todos los comprobantes faltantes?')) return;
      const btns = container.querySelectorAll('.cmp-btn-registrar:not(:disabled)');
      btnTodos.disabled = true; btnTodos.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
      let ok = 0;
      for (const b of btns) {
        const data = JSON.parse(decodeURIComponent(b.dataset.registro));
        try {
          const r = await window.api.contabilizarZip({ registros: [data], tipo, glosa, config });
          if (r.success && r.registrados > 0) { ok++; b.innerHTML = '<i class="fa-solid fa-check"></i>'; b.style.background = 'var(--btn-ok)'; b.disabled = true; b.closest('tr').style.opacity = '0.5'; }
        } catch(_) {}
      }
      btnTodos.innerHTML = '<i class="fa-solid fa-check-double"></i> ' + ok + ' registrados';
    });
  }
}

function _renderCmpResultado(r, tipo, periodo) {
  const s = r.resumen;
  let html = `
    <div class="sire-cards" style="margin-bottom:12px;">
      <div class="sire-kpi"><div class="k">Registros Locales</div><div class="v" style="color:var(--accent)">${s.totalLocal}</div></div>
      <div class="sire-kpi"><div class="k">Registros SUNAT</div><div class="v" style="color:var(--warn)">${s.totalSunat}</div></div>
      <div class="sire-kpi"><div class="k"><i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> Coinciden</div><div class="v" style="color:var(--ok)">${s.enAmbos}</div></div>
      <div class="sire-kpi"><div class="k"><i class="fa-solid fa-arrow-right" style="color:var(--accent)"></i> Solo en Local</div><div class="v" style="color:var(--accent)">${s.soloLocal}</div></div>
      <div class="sire-kpi"><div class="k"><i class="fa-solid fa-arrow-left" style="color:var(--warn)"></i> Solo en SUNAT</div><div class="v" style="color:var(--warn)">${s.soloSunat}</div></div>
      <div class="sire-kpi"><div class="k"><i class="fa-solid fa-not-equal" style="color:var(--err)"></i> Con Diferencia</div><div class="v" style="color:var(--err)">${s.conDiferencia}</div></div>
    </div>`;

  // Solo en SUNAT (faltantes en local) — con botón registrar
  if (s.soloSunat > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="sire-cmp-badge sire-cmp-sunat" style="font-size:12px;padding:5px 12px;"><i class="fa-solid fa-triangle-exclamation"></i> FALTANTES EN TU SISTEMA</span>
        <span style="font-size:11px;color:var(--tx3);">${s.soloSunat} comprobante(s) que SUNAT tiene y tú no has registrado</span>
      </div>
      ${_cmpTableConRegistrar(r.soloSunat)}
    </div>`;
  }

  // Solo en Local (sobran respecto a SUNAT)
  if (s.soloLocal > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="sire-cmp-badge sire-cmp-local" style="font-size:12px;padding:5px 12px;"><i class="fa-solid fa-info-circle"></i> SOLO EN TU SISTEMA</span>
        <span style="font-size:11px;color:var(--tx3);">${s.soloLocal} comprobante(s) que tienes tú pero SUNAT no</span>
      </div>
      ${_cmpTable(r.soloLocal)}
    </div>`;
  }

  // Con diferencias de monto
  if (s.conDiferencia > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="sire-cmp-badge sire-cmp-diff" style="font-size:12px;padding:5px 12px;"><i class="fa-solid fa-not-equal"></i> CON DIFERENCIAS</span>
        <span style="font-size:11px;color:var(--tx3);">${s.conDiferencia} comprobante(s) con montos distintos entre tu sistema y SUNAT</span>
      </div>
      ${_cmpDiffTable(r.conDiferencia)}
    </div>`;
  }

  // Coinciden
  if (s.enAmbos > 0 && s.soloSunat === 0 && s.conDiferencia === 0) {
    html += `<div style="background:rgba(var(--ok-rgb),.12);border:1px solid rgba(var(--ok-rgb),.25);border-radius:8px;padding:16px 20px;text-align:center;margin-top:10px;">
      <i class="fa-solid fa-circle-check" style="font-size:24px;color:var(--ok);"></i>
      <div style="font-weight:700;font-size:14px;color:var(--ok);margin-top:6px;">¡Todo coincide!</div>
      <div style="font-size:12px;color:var(--ok-h);">Tus ${s.enAmbos} registros locales coinciden con SUNAT.</div>
    </div>`;
  }

  if (s.totalSunat === 0) {
    html += '<div class="sire-msg sire-msg-warn" style="margin-top:10px;"><i class="fa-solid fa-info-circle"></i> No se cargó archivo SUNAT. Se muestran solo los registros locales. Descargue la propuesta desde "SIRE SUNAT" y seleccione el archivo ZIP aquí.</div>';
  }

  return html;
}

// Tabla de faltantes con botón "Registrar"
function _cmpTableConRegistrar(items) {
  if (!items.length) return '';
  const m = (n) => `<td style="text-align:right">${_fmt(n)}</td>`;
  const c = (v) => `<td style="text-align:center">${_esc(v ?? '')}</td>`;
  return `<div class="sire-table-wrap" style="max-height:40vh;margin-bottom:10px;">
    <div style="padding:8px 12px;background:var(--bg-block,#f4f8fc);border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <label style="font-size:10px;font-weight:700;color:var(--tx-lbl);margin-right:6px;">GLOSA:</label>
        <input type="text" id="cmp-glosa" placeholder="Ej. Registro de ventas junio 2026" style="width:280px;padding:5px 8px;border:1px solid var(--brd);border-radius:4px;font-size:11px;">
      </div>
      <button id="cmp-registrar-todos" class="sire-btn sire-btn-primary" style="font-size:11px;padding:5px 12px;"><i class="fa-solid fa-gears"></i> Registrar todos (${items.length})</button>
    </div>
    <table class="sire-table"><thead><tr>
    <th>#</th><th>T/D</th><th>Número</th><th>Fecha</th><th>RUC/DNI</th><th>Razón Social</th>
    <th style="text-align:right">Base</th><th style="text-align:right">IGV</th><th style="text-align:right">Total</th><th>Mon.</th><th>Acción</th></tr></thead><tbody>
    ${items.map((i, idx) => {
      const docNum = `${i.serie||''}${i.serie?'-':''}${i.numero||''}`;
      const data = encodeURIComponent(JSON.stringify({
        tipo_doc: i.tipo_documento||'', serie: i.serie||'', numero: i.numero||'',
        fecha_emision: i.fecha_emision||'', fecha_venc: i.fecha_vencimiento||i.fecha_emision||'',
        ruc_dni: i.ruc_entidad||'', razon_social: i.razon_social||i.ruc_entidad||'',
        valor_exportacion:i.valor_exportacion||0, base_gravada:i.base_gravada??i.base_imponible??0,
        descuento_base:i.descuento_base||0, igv:i.igv||0, descuento_igv:i.descuento_igv||0,
        exonerado:i.exonerado||0, inafecto:i.inafecto||0, isc:i.isc||0, base_ivap:i.base_ivap||0,
        ivap:i.ivap||0, icbper:i.icbper||0, otros_tributos:i.otros_tributos||0,
        g1_base:i.g1_base||0,g1_igv:i.g1_igv||0,g2_base:i.g2_base||0,g2_igv:i.g2_igv||0,
        g3_base:i.g3_base||0,g3_igv:i.g3_igv||0,valor_no_gravado:i.valor_no_gravado||0,
        total:i.importe_total||0, moneda:i.moneda||'PEN', tc:i.tipo_cambio||'1.000', periodo:i.periodo||'',
        car_sunat:i.car_sunat||'', tipo_doc_id:i.tipo_doc_identidad||'', requiere_revision:i.requiere_revision||0
      }));
      return `<tr>
        ${c(idx+1)}${c(i.tipo_documento)}
        <td style="font-weight:600;color:var(--accent);">${_esc(docNum)}</td>
        ${c(i.fecha_emision)}${c(i.ruc_entidad)}
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(i.razon_social||'')}</td>
        ${m(i.base_imponible)}${m(i.igv)}${m(i.importe_total)}${c(i.moneda||'PEN')}
        <td style="text-align:center"><button class="cmp-btn-registrar sire-btn sire-btn-primary" style="padding:4px 10px;font-size:10px;" data-registro="${escapeAttr(data)}"><i class="fa-solid fa-plus"></i> Registrar</button></td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}

function _cmpTable(items) {
  if (!items.length) return '';
  const c = (v) => `<td style="text-align:center">${_esc(v ?? '')}</td>`;
  const m = (n) => `<td style="text-align:right">${_fmt(n)}</td>`;
  return `<div class="sire-table-wrap" style="max-height:30vh;margin-bottom:10px;"><table class="sire-table"><thead><tr>
    <th>Tipo Doc</th><th>Serie</th><th>Número</th><th>RUC/DNI</th><th>F. Emisión</th><th>Base</th><th>IGV</th><th>Total</th></tr></thead><tbody>
    ${items.map(i => `<tr>${c(i.tipo_documento)}${c(i.serie)}${c(i.numero)}${c(i.ruc_entidad)}${c(i.fecha_emision)}${m(i.base_imponible)}${m(i.igv)}${m(i.importe_total)}</tr>`).join('')}
  </tbody></table></div>`;
}

function _cmpDiffTable(items) {
  if (!items.length) return '';
  return `<div class="sire-table-wrap" style="max-height:30vh;margin-bottom:10px;"><table class="sire-table"><thead><tr>
    <th>Tipo</th><th>Serie</th><th>Número</th><th>Total Local</th><th>Total SUNAT</th><th>IGV Local</th><th>IGV SUNAT</th><th>Base Local</th><th>Base SUNAT</th><th>Campos distintos</th></tr></thead><tbody>
    ${items.map(d => {
      const l = d.local, s = d.sunat;
      const hi = (a,b) => Math.abs(a-b) > 0.01 ? 'color:var(--err);font-weight:800;' : '';
      return `<tr>
        <td style="text-align:center">${_esc(l.tipo_documento)}</td><td style="text-align:center">${_esc(l.serie)}</td><td style="text-align:center">${_esc(l.numero)}</td>
        <td style="text-align:right;${hi(l.importe_total,s.importe_total)}">${_fmt(l.importe_total)}</td><td style="text-align:right;${hi(l.importe_total,s.importe_total)}">${_fmt(s.importe_total)}</td>
        <td style="text-align:right;${hi(l.igv,s.igv)}">${_fmt(l.igv)}</td><td style="text-align:right;${hi(l.igv,s.igv)}">${_fmt(s.igv)}</td>
        <td style="text-align:right;${hi(l.base_imponible,s.base_imponible)}">${_fmt(l.base_imponible)}</td><td style="text-align:right;${hi(l.base_imponible,s.base_imponible)}">${_fmt(s.base_imponible)}</td>
        <td style="font-size:9px;color:var(--err);max-width:220px;">${_esc((d.diffs?.campos||[]).join(', '))}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVIDAD — operaciones y logs técnicos
// ═══════════════════════════════════════════════════════════════════════════════
async function _renderLogs(cont) {
  cont.innerHTML = `
    <div class="sire-tabs" style="margin-bottom:10px;">
      <button class="sire-tab active" id="logs-tab-ops">Operaciones</button>
      <button class="sire-tab" id="logs-tab-tech">Logs Técnicos</button>
    </div>
    <div id="logs-contenido"><div class="sire-empty"><i class="fa-solid fa-spinner fa-spin"></i></div></div>`;

  const _loadOps = async () => {
    const c = document.getElementById('logs-contenido');
    try {
      const r = await window.api.getSireOperaciones({ limit: 50 });
      const ops = r.operaciones || [];
      if (!ops.length) { c.innerHTML = '<div class="sire-empty">Sin operaciones registradas.</div>'; return; }
      c.innerHTML = `<div class="sire-table-wrap"><table class="sire-table"><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Período</th><th>Operación</th><th>Ticket</th><th>Estado</th><th>Mensaje</th></tr></thead><tbody>
        ${ops.map(o => `<tr><td>${_esc(o.created_at)}</td><td style="text-align:center">${_esc(o.tipo)}</td><td style="text-align:center">${_esc(o.periodo)}</td><td>${_esc(o.operacion)}</td><td style="text-align:center">${_esc(o.ticket || '')}</td><td style="text-align:center">${_esc(o.estado || '')}</td><td style="font-size:10px">${_esc(o.mensaje || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
    } catch (e) { c.innerHTML = `<div class="sire-empty">Error: ${_esc(e.message)}</div>`; }
  };

  const _loadTech = async () => {
    const c = document.getElementById('logs-contenido');
    try {
      const r = await window.api.getSireLogs({ limit: 80 });
      const logs = r.logs || [];
      if (!logs.length) { c.innerHTML = '<div class="sire-empty">Sin logs registrados.</div>'; return; }
      c.innerHTML = `<div class="sire-table-wrap"><table class="sire-table"><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Período</th><th>Operación</th><th>Método</th><th>Endpoint</th><th>HTTP</th><th>OK</th><th>Mensaje</th></tr></thead><tbody>
        ${logs.map(l => `<tr><td style="font-size:10px">${_esc(l.fecha)}</td><td style="text-align:center">${_esc(l.tipo)}</td><td style="text-align:center">${_esc(l.periodo || '')}</td><td>${_esc(l.operacion)}</td><td style="text-align:center">${_esc(l.metodo)}</td><td style="font-size:9px;max-width:180px;overflow:hidden;text-overflow:ellipsis;" title="${escapeAttr(l.endpoint)}">${_esc(l.endpoint)}</td><td style="text-align:center">${_esc(l.status_code || '')}</td><td style="text-align:center;color:${l.success?'#2f745c':'#a0444f'}">${l.success ? '✓' : '✗'}</td><td style="font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;" title="${escapeAttr(l.mensaje)}">${_esc(l.mensaje || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
    } catch (e) { c.innerHTML = `<div class="sire-empty">Error: ${_esc(e.message)}</div>`; }
  };

  document.getElementById('logs-tab-ops').addEventListener('click', function() {
    cont.querySelectorAll('.sire-tab').forEach(t => t.classList.remove('active')); this.classList.add('active'); _loadOps();
  });
  document.getElementById('logs-tab-tech').addEventListener('click', function() {
    cont.querySelectorAll('.sire-tab').forEach(t => t.classList.remove('active')); this.classList.add('active'); _loadTech();
  });
  _loadOps();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLAS COMUNES (ventas / compras locales)
// ═══════════════════════════════════════════════════════════════════════════════
function _cardsHTML(r, tab) {
  const t = r.totalGeneral || {};
  const base = tab === 'ventas' ? (t.base_gravada || 0) : ((t.g1_base||0)+(t.g2_base||0)+(t.g3_base||0));
  const igv = tab === 'ventas' ? (t.igv || 0) : ((t.g1_igv||0)+(t.g2_igv||0)+(t.g3_igv||0));
  const inferidos = Number(r.resumen?.registrosInferidos || 0);
  const revision = Number(r.resumen?.registrosRevision || 0);
  return `
    <div class="sire-kpi"><div class="k">Comprobantes</div><div class="v" style="color:var(--accent)">${r.filas.length}</div></div>
    <div class="sire-kpi"><div class="k">Base Imponible</div><div class="v" style="color:var(--ok)">S/ ${_fmt(base)}</div></div>
    <div class="sire-kpi"><div class="k">I.G.V.</div><div class="v" style="color:var(--warn)">S/ ${_fmt(igv)}</div></div>
    <div class="sire-kpi"><div class="k">Importe Total</div><div class="v" style="color:var(--err)">S/ ${_fmt(t.importe_total || 0)}</div></div>
    ${(inferidos||revision)?`<div style="grid-column:1/-1;padding:8px 11px;border-radius:6px;background:rgba(var(--warn-rgb),.12);color:var(--warn);font-size:10px;"><i class="fa-solid fa-triangle-exclamation"></i> ${inferidos?`${inferidos} comprobante(s) histórico(s) usan clasificación tributaria inferida. `:''}${revision?`${revision} comprobante(s) están marcados para revisión.`:''}</div>`:''}`;
}

function _tablaVentas(filas) {
  const c=(v)=>`<td style="text-align:center">${_esc(v ?? '')}</td>`, m=(n)=>`<td style="text-align:right">${Math.abs(Number(n)||0)>0.00001?_fmt(n):'0.00'}</td>`;
  let tb=0,ti=0,tt=0;
  const rows=filas.map(f=>{tb+=f.base_gravada||0;ti+=f.igv||0;tt+=f.importe_total||0;return `<tr>${c(f.numero)}${c(f.td)}${c(f.serie)}${c(f.num_comprobante)}${c(_fmtFecha(f.fecha_emision))}${c(f.fecha_venc?_fmtFecha(f.fecha_venc):'')}${c(f.cli_doc_tipo)}${c(f.cli_doc_num)}<td>${_esc(f.razon_social || '')}</td>${m(f.valor_exportacion)}${m(f.base_gravada)}${m(f.exonerada)}${m(f.inafecta)}${m(f.igv)}${m(f.isc)}${m(f.icbper)}${m(f.otros_tributos)}${m(f.importe_total)}${c(f.tc||1)}</tr>`;}).join('');
  return `<div class="sire-table-wrap"><table class="sire-table"><thead><tr><th>N°</th><th>Tipo</th><th>Serie</th><th>Número</th><th>F. Emisión</th><th>F. Venc.</th><th>T. Doc</th><th>N° Doc</th><th>Cliente / Razón Social</th><th>Export.</th><th>Base Gravada</th><th>Exonerada</th><th>Inafecta</th><th>IGV</th><th>ISC</th><th>ICBPER</th><th>Otros</th><th>Importe Total</th><th>T/C</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="10" style="text-align:right">TOTALES</td><td style="text-align:right">${_fmt(tb)}</td><td colspan="2"></td><td style="text-align:right">${_fmt(ti)}</td><td colspan="3"></td><td style="text-align:right">${_fmt(tt)}</td><td></td></tr></tfoot></table></div>`;
}

function _tablaCompras(filas) {
  const c=(v)=>`<td style="text-align:center">${_esc(v ?? '')}</td>`, m=(n)=>`<td style="text-align:right">${Math.abs(Number(n)||0)>0.00001?_fmt(n):'0.00'}</td>`;
  let tb=0,ti=0,tt=0;
  const rows=filas.map(f=>{tb+=(f.g1_base||0)+(f.g2_base||0)+(f.g3_base||0);ti+=(f.g1_igv||0)+(f.g2_igv||0)+(f.g3_igv||0);tt+=f.importe_total||0;return `<tr>${c(f.numero)}${c(f.td)}${c(f.serie)}${c(f.num_comprobante)}${c(_fmtFecha(f.fecha_emision))}${c(f.fecha_venc?_fmtFecha(f.fecha_venc):'')}${c(f.prov_doc_tipo)}${c(f.prov_doc_num)}<td>${_esc(f.razon_social || '')}</td>${m(f.g1_base)}${m(f.g1_igv)}${m(f.g2_base)}${m(f.g2_igv)}${m(f.g3_base)}${m(f.g3_igv)}${m(f.valor_no_grav)}${m(f.isc)}${m(f.icbper)}${m(f.otros_tributos)}${m(f.importe_total)}${c(f.tc||1)}</tr>`;}).join('');
  return `<div class="sire-table-wrap"><table class="sire-table"><thead><tr><th>N°</th><th>Tipo</th><th>Serie</th><th>Número</th><th>F. Emisión</th><th>F. Venc.</th><th>T. Doc</th><th>N° Doc</th><th>Proveedor / Razón Social</th><th>G1 Base</th><th>G1 IGV</th><th>G2 Base</th><th>G2 IGV</th><th>G3 Base</th><th>G3 IGV</th><th>No Gravada</th><th>ISC</th><th>ICBPER</th><th>Otros</th><th>Importe Total</th><th>T/C</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="9" style="text-align:right">TOTALES</td><td colspan="6" style="text-align:center">Base: ${_fmt(tb)} · IGV: ${_fmt(ti)}</td><td colspan="4"></td><td style="text-align:right">${_fmt(tt)}</td><td></td></tr></tfoot></table></div>`;
}
