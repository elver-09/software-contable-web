import { obtenerPeriodoTrabajo } from './periodoTrabajo.js';
import { evaluarDetalleTributario, resumirTributarioAsistente, sincronizarTributarioLineas } from '../utils/tributario.mjs';
import { escapeHTML, escapeAttr } from '../utils/security.js';
// src/renderer/js/modules/editarRegistros.js
'use strict';

function fmt(n) { return Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtFecha(iso) { if(!iso)return''; const[y,m,d]=iso.split('-'); return`${d}/${m}/${y}`; }

const ORIGENES_SUNAT = [
  ['1','CAJA Y BANCOS'],
  ['5','DIARIO'],
  ['8','COMPRAS'],
  ['14','VENTAS E INGRESOS'],
  ['31','PLANILLAS'],
  ['50','PROVISIONES'],
  ['90','OTROS'],
];

let _root = null;
let _voucherActual = null;      // Borrador editable en memoria
let _voucherOriginal = null;    // Copia exacta de lo último persistido en SQLite
let _cambiosPendientes = new Set();
let _tributarioModificado = false;
let _tributarioManual = false;
let _tributarioAviso = null;
let _tributarioExpandido = false;

const CAMPOS_EDITABLES = [
  'cuenta','nombre_cuenta','debe','haber','moneda','tc','doc_tipo','doc_numero',
  'fecha_doc','fecha_venc','codigo','razon_social','glosa'
];

function _clonar(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function _iniciarEdicionVoucher(resultado) {
  _voucherActual = _clonar(resultado);
  _voucherOriginal = _clonar(resultado);
  _cambiosPendientes.clear();
  _tributarioModificado = false;
  _tributarioManual = false;
  _tributarioAviso = null;
  _tributarioExpandido = false;
}

function _limpiarEdicion() {
  _voucherActual = null;
  _voucherOriginal = null;
  _cambiosPendientes.clear();
  _tributarioModificado = false;
  _tributarioManual = false;
  _tributarioAviso = null;
  _tributarioExpandido = false;
}

function _hayCambiosPendientes() {
  return _cambiosPendientes.size > 0 || _tributarioModificado;
}

function _valorComparable(campo, valor) {
  if (campo === 'debe' || campo === 'haber' || campo === 'tc') return Number(valor || 0);
  return valor == null ? '' : String(valor);
}

function _actualizarEstadoLinea(id) {
  const actual = _voucherActual?.detalles?.find(d => Number(d.id) === Number(id));
  const original = _voucherOriginal?.detalles?.find(d => Number(d.id) === Number(id));
  if (!actual || !original) return;
  const cambio = CAMPOS_EDITABLES.some(c => _valorComparable(c, actual[c]) !== _valorComparable(c, original[c]));
  if (cambio) _cambiosPendientes.add(Number(id));
  else _cambiosPendientes.delete(Number(id));
}

function _calcularTotales(detalles = []) {
  const debe = detalles.reduce((s,d) => s + (Number.parseFloat(d.debe) || 0), 0);
  const haber = detalles.reduce((s,d) => s + (Number.parseFloat(d.haber) || 0), 0);
  return { debe, haber, diferencia: debe - haber, cuadrado: Math.abs(debe - haber) <= 0.01 };
}

export function hayCambiosEditarRegistros() { return _hayCambiosPendientes(); }
export function initEditarRegistros() {
  if (_hayCambiosPendientes() && _root?.isConnected) {
    _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
    return;
  }
  _root = document.getElementById('editar-registros-root');
  if (!_root) return;
  _limpiarEdicion();
  _root.innerHTML = _buildHTML();
  document.getElementById('er-periodo').value = obtenerPeriodoTrabajo();
  _bindEvents();
}

function _buildHTML() {
  return `
  <div class="er-wrap">
    <div class="er-hero">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="er-hero-icon"><i class="fa-solid fa-pen-to-square"></i></div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#fff;">Editar Registros Contables</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">Busque un asiento por período para editar sus líneas. Puede filtrar por comprobante u origen.</div>
        </div>
      </div>
    </div>

    <!-- Búsqueda -->
    <div class="er-card" style="padding:18px 22px;">
      <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;">
        <div style="width:170px;">
          <label class="er-lbl"><i class="fa-solid fa-calendar"></i> Período <span style="color:var(--err);">*</span></label>
          <input type="month" id="er-periodo" required style="width:100%;" />
        </div>
        <div style="min-width:200px;flex:1;">
          <label class="er-lbl"><i class="fa-solid fa-file-invoice"></i> N° Comprobante <span style="font-weight:400;text-transform:none;opacity:.7;">(opcional)</span></label>
          <input type="text" id="er-factura" placeholder="Vacío = mostrar todos" style="width:100%;" />
        </div>
        <div style="width:100px;">
          <label class="er-lbl"><i class="fa-solid fa-hashtag"></i> N° Asiento <span style="font-weight:400;text-transform:none;opacity:.7;">(opc.)</span></label>
          <input type="number" id="er-num-asiento" placeholder="N°" style="width:100%;" />
        </div>
        <div style="min-width:180px;">
          <label class="er-lbl"><i class="fa-solid fa-tag"></i> Origen <span style="font-weight:400;text-transform:none;opacity:.7;">(opcional)</span></label>
          <select id="er-origen" style="width:100%;">
            <option value="">Todos los orígenes</option>
            ${ORIGENES_SUNAT.map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <button class="er-btn-primary" id="er-btn-buscar"><i class="fa-solid fa-magnifying-glass"></i> Buscar</button>
      </div>
      <div id="er-status" style="display:none;margin-top:10px;"></div>
    </div>

    <!-- Resultado -->
    <div id="er-resultado" style="display:none;"></div>

    <!-- ═══ MODAL DE EDICIÓN (estilo del proyecto) ═══ -->
    <div id="er-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;">
      <div style="background:var(--bg-modal);border-radius:6px;width:900px;max-width:90%;max-height:90vh;box-shadow:var(--shd-modal);border:1px solid var(--brd);display:flex;flex-direction:column;overflow:hidden;">

        <!-- Cabecera del modal -->
        <div style="background:var(--bg-mhdr);padding:14px 22px;border-bottom:2px solid var(--sb-active);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
          <h3 style="margin:0;color:var(--modal-title);font-size:15px;font-weight:700;display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-pen-to-square" style="color:var(--accent);"></i> Editar Línea del Asiento
          </h3>
          <button type="button" id="er-modal-close-x" style="background:transparent;border:none;font-size:16px;color:var(--sb-sub);cursor:pointer;padding:0;">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>

        <!-- Cuerpo del modal -->
        <div style="padding:20px 22px;overflow-y:auto;flex-grow:1;display:flex;flex-direction:column;gap:18px;background:var(--bg-modal);">
          <input type="hidden" id="er-edit-id">

          <!-- Bloque 1: Cuenta y Montos -->
          <div style="background:var(--bg-block);border:1px solid var(--brd);border-radius:5px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:var(--accent);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-light);padding-bottom:7px;">
              <i class="fa-solid fa-book" style="color:var(--tx3);"></i> 1. Cuenta y Montos
            </h4>
            <div class="form-grid" style="grid-template-columns:1fr 2fr 1fr 1fr;gap:15px;">
              <div>
                <label class="er-lbl">Cuenta</label>
                <input type="text" id="er-edit-cuenta" placeholder="Ej. 1212" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Nombre Cuenta</label>
                <input type="text" id="er-edit-nombre" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Debe</label>
                <input type="number" step="0.01" id="er-edit-debe" value="0.00" style="background:var(--bg-input);font-weight:600;color:var(--ok);">
              </div>
              <div>
                <label class="er-lbl">Haber</label>
                <input type="number" step="0.01" id="er-edit-haber" value="0.00" style="background:var(--bg-input);font-weight:600;color:var(--err);">
              </div>
            </div>
          </div>

          <!-- Bloque 2: Documento y Entidad -->
          <div style="background:var(--bg-block);border:1px solid var(--brd);border-radius:5px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:var(--accent);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-light);padding-bottom:7px;">
              <i class="fa-solid fa-file-invoice" style="color:var(--tx3);"></i> 2. Documento y Entidad
            </h4>
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr 2fr;gap:15px;margin-bottom:15px;">
              <div>
                <label class="er-lbl">Fecha Doc.</label>
                <input type="date" id="er-edit-fecha-doc" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Fecha Venc.</label>
                <input type="date" id="er-edit-fecha-venc" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Tipo Doc.</label>
                <input type="text" id="er-edit-doc-tipo" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Número Doc.</label>
                <input type="text" id="er-edit-doc-numero" placeholder="Ej: F001-456" style="background:var(--bg-input);">
              </div>
            </div>
            <div class="form-grid" style="grid-template-columns:1fr 2fr 1fr 1fr;gap:15px;margin-bottom:15px;">
              <div>
                <label class="er-lbl">Código (RUC)</label>
                <input type="text" id="er-edit-codigo" placeholder="RUC/DNI" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Razón Social</label>
                <input type="text" id="er-edit-razon" style="background:var(--bg-input);">
              </div>
              <div>
                <label class="er-lbl">Moneda</label>
                <select id="er-edit-moneda" style="background:var(--bg-input);">
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label class="er-lbl">T/C</label>
                <input type="number" step="0.001" id="er-edit-tc" value="1.000" style="background:var(--bg-input);">
              </div>
            </div>
            <div>
              <label class="er-lbl">Glosa</label>
              <input type="text" id="er-edit-glosa" placeholder="Glosa específica..." style="width:100%;background:var(--bg-input);">
            </div>
          </div>
        </div>

        <!-- Footer del modal -->
        <div style="background:var(--bg-mftr);padding:14px 24px;border-top:1px solid var(--brd);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
          <button type="button" id="er-modal-cancelar" style="background:var(--bg-ro);color:var(--tx2);padding:8px 18px;border-radius:3px;font-weight:600;cursor:pointer;border:1px solid var(--brd-in);">Cancelar</button>
          <button type="button" id="er-modal-guardar" style="background:var(--btn-ok);color:white;padding:8px 18px;border-radius:3px;font-weight:600;cursor:pointer;border:none;display:flex;align-items:center;gap:8px;">
            <i class="fa-solid fa-check"></i> Aplicar cambio
          </button>
        </div>
      </div>
    </div>
  </div>
  ${_styles()}`;
}

function _bindEvents() {
  // Back button. Si existe un borrador, no se pierde sin confirmación.
  document.addEventListener('click', (e) => {
    if (e.target.closest('#er-btn-volver')) _buscar();
  });

  // ── Autocomplete para Cuenta y RUC en modal de edición ──
  let _acPlanCuentas = [], _acEntidades = [];
  (async () => {
    try { _acPlanCuentas = await window.api.getPlanCuentas() || []; } catch(_) {}
    try { _acEntidades = await window.api.getEntidades() || []; } catch(_) {}
  })();

  function _setupAutocomplete(inputId, descId, items, codeField, descField) {
    const input = document.getElementById(inputId);
    const descInput = document.getElementById(descId);
    if (!input) return;
    
    let listEl = input.parentElement.querySelector('.er-ac-list');
    if (!listEl) {
      input.parentElement.style.position = 'relative';
      listEl = document.createElement('div');
      listEl.className = 'er-ac-list';
      listEl.style.cssText = 'position:absolute;top:100%;left:0;right:0;max-height:150px;overflow-y:auto;background:var(--bg-modal,#fff);border:1px solid var(--brd);border-radius:0 0 6px 6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:50;display:none;';
      input.parentElement.appendChild(listEl);
    }

    input.addEventListener('input', () => {
      const val = input.value.trim().toLowerCase();
      if (!val) { listEl.style.display = 'none'; return; }
      const filtered = items.filter(i => 
        (i[codeField]||'').toLowerCase().startsWith(val) ||
        (i[descField]||'').toLowerCase().includes(val)
      ).slice(0, 10);
      if (!filtered.length) { listEl.style.display = 'none'; return; }
      listEl.innerHTML = filtered.map(i => 
        '<div style="padding:5px 8px;font-size:11px;cursor:pointer;border-bottom:1px solid var(--brd-lt);display:flex;gap:8px;" data-code="'+escapeAttr(i[codeField])+'" data-desc="'+escapeAttr(i[descField]||'')+'">' +
        '<strong style="color:var(--accent);min-width:50px;">'+escapeHTML(i[codeField])+'</strong>' +
        '<span style="color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHTML(i[descField]||'')+'</span></div>'
      ).join('');
      listEl.style.display = 'block';
      listEl.querySelectorAll('div').forEach(d => {
        d.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = d.dataset.code;
          if (descInput) descInput.value = d.dataset.desc;
          listEl.style.display = 'none';
        });
        d.addEventListener('mouseover', () => d.style.background = 'var(--accent-lt,#e8f0fa)');
        d.addEventListener('mouseout', () => d.style.background = '');
      });
    });
    input.addEventListener('blur', () => setTimeout(() => listEl.style.display = 'none', 200));
    input.addEventListener('focus', () => { if (input.value.trim()) input.dispatchEvent(new Event('input')); });
  }

  // Setup when modal opens
  const observer = new MutationObserver(() => {
    const modal = document.getElementById('er-modal-overlay');
    if (modal && modal.style.display === 'flex') {
      _setupAutocomplete('er-edit-cuenta', 'er-edit-nombre', _acPlanCuentas, 'codigo', 'descripcion');
      _setupAutocomplete('er-edit-codigo', 'er-edit-razon', _acEntidades, 'codigo', 'razon_social');
    }
  });
  const modalEl = document.getElementById('er-modal-overlay');
  if (modalEl) observer.observe(modalEl, { attributes: true, attributeFilter: ['style'] });

  document.getElementById('er-btn-buscar').addEventListener('click', _buscar);
  document.getElementById('er-factura').addEventListener('keydown', e => { if(e.key==='Enter') _buscar(); });
  document.getElementById('er-num-asiento')?.addEventListener('keydown', e => { if(e.key==='Enter') _buscar(); });
  document.getElementById('er-modal-close-x').addEventListener('click', _cerrarModal);
  document.getElementById('er-modal-cancelar').addEventListener('click', _cerrarModal);
  document.getElementById('er-modal-guardar').addEventListener('click', _guardar);
}

async function _buscar() {
  if (_hayCambiosPendientes()) {
    const descartar = confirm('Hay cambios pendientes sin guardar en este asiento. ¿Desea descartarlos y continuar?');
    if (!descartar) return;
    _limpiarEdicion();
  }

  const periodo = document.getElementById('er-periodo').value;
  const factura = document.getElementById('er-factura').value.trim();
  const origen  = document.getElementById('er-origen').value;
  const numAsiento = document.getElementById('er-num-asiento')?.value.trim();
  if (!periodo) { _status('warn','Seleccione un período para buscar.'); return; }

  _status('loading','Buscando...');
  try {
    // Si busca por N° de asiento, ir directo a ese voucher
    if (numAsiento) {
      const r = await window.api.buscarVoucher({ periodo, numero_voucher: parseInt(numAsiento), origen: origen || undefined });
      if (!r.success) { _status('error', r.error || 'No se encontró el asiento N° ' + numAsiento); document.getElementById('er-resultado').style.display='none'; return; }
      _iniciarEdicionVoucher(r);
      _hideStatus();
      _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
      return;
    }

    const r = await window.api.buscarVoucherPorFactura({ periodo, docNumero: factura, origen });
    if (!r.success) { _status('error', r.error); document.getElementById('er-resultado').style.display='none'; return; }

    if (!factura && r.listaVouchers && r.listaVouchers.length > 1) {
      _limpiarEdicion();
      _renderListaVouchers(r.listaVouchers);
      _status('info', `${r.listaVouchers.length} asiento(s) encontrados en ${periodo}. Seleccione uno.`);
    } else {
      _iniciarEdicionVoucher(r);
      if (r.multiples > 1 && factura) _status('warn', `Se encontraron ${r.multiples} asientos; se muestra el más reciente.`);
      else _hideStatus();
      _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
    }
  } catch(e) { _status('error', e.message); }
}

function _renderListaVouchers(vouchers) {
  const el = document.getElementById('er-resultado');
  el.innerHTML = `<div class="er-card" style="overflow:hidden;">
    <div style="padding:12px 22px 8px;font-size:12px;font-weight:700;color:var(--tx2);display:flex;align-items:center;gap:8px;">
      <i class="fa-solid fa-list"></i> Asientos del Período
      <span style="font-weight:400;color:var(--tx3);font-size:10px;margin-left:auto;">Clic en una fila para ver sus líneas</span>
    </div>
    <div style="overflow-x:auto;max-height:60vh;overflow-y:auto;">
      <table class="er-table"><thead><tr>
        <th style="width:30px">#</th><th style="width:50px">Origen</th><th>Libro</th><th style="width:45px">N°</th><th>Comprobante</th>
        <th style="width:90px">Fecha</th><th style="text-align:right;width:100px">Debe</th>
        <th style="text-align:right;width:100px">Haber</th><th style="width:80px">Estado</th><th>Glosa</th>
      </tr></thead><tbody>
        ${vouchers.map((v,i)=>{const cuadre=Math.abs(v.total_debe-v.total_haber)<0.01;const orN=ORIGENES_SUNAT.find(o=>o[0]===v.origen)?.[1]||v.origen;
          return '<tr class="er-voucher-row" data-id="'+escapeAttr(v.id)+'" style="cursor:pointer;"><td style="text-align:center;color:var(--tx3)">'+(i+1)+'</td><td style="font-weight:700;color:var(--accent);font-size:11px;">'+escapeHTML(v.origen)+'</td><td style="font-size:11px;">'+escapeHTML(orN)+'</td><td style="text-align:center;font-weight:600;">'+escapeHTML(v.numero_voucher)+'</td><td style="font-weight:600;color:var(--accent);font-size:11px;">'+escapeHTML(v.doc_numero||'')+'</td><td style="font-size:11px;">'+escapeHTML(fmtFecha(v.fecha))+'</td><td style="text-align:right;color:var(--ok);font-weight:600;">'+fmt(v.total_debe)+'</td><td style="text-align:right;color:var(--err);font-weight:600;">'+fmt(v.total_haber)+'</td><td><span class="er-badge '+(cuadre?'ok':'err')+'" style="font-size:10px;"><i class="fa-solid '+(cuadre?'fa-check':'fa-exclamation')+'"></i> '+(cuadre?'OK':'Desc.')+'</span></td><td style="font-size:10px;color:var(--tx3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHTML(v.glosa_cabecera||'')+'</td></tr>';}).join('')}
      </tbody></table>
    </div>
  </div>`;
  el.style.display='block';
  el.querySelectorAll('.er-voucher-row').forEach(row=>{
    row.addEventListener('click',async()=>{
      const id=+row.dataset.id;_status('loading','Cargando...');
      try{const r=await window.api.buscarVoucher({id});if(r.success){_iniciarEdicionVoucher(r);_renderResultado(_voucherActual.cabecera,_voucherActual.detalles);_hideStatus();}else _status('error',r.error);}
      catch(e){_status('error',e.message);}
    });
  });
}


function _nTrib(v) { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; }

function _evaluarTributarioEditor(t = _voucherActual?.tributario) {
  if (!t) return { estado:'PENDIENTE', ok:true, texto:'Datos tributarios pendientes de completar' };
  if (_tributarioAviso && !_tributarioManual) return {estado:"REVISION",ok:false,texto:_tributarioAviso};
  const detalle = evaluarDetalleTributario(t);
  if (!detalle.ok) return detalle;
  const datos = t.tipo_registro === 'VENTA' ? t.venta : t.compra;
  const totalTrib = Number(datos.importe_total);
  const tot = _calcularTotales(_voucherActual?.detalles||[]);
  const totalAsiento = Math.max(Math.abs(tot.debe),Math.abs(tot.haber));
  if (Math.abs(Math.abs(totalTrib) - totalAsiento) > 0.010001) return { estado:'DIFERENCIA', ok:false, texto:'El total del comprobante no coincide con el asiento', totalTrib };
  if(Number(t.comprobante?.requiere_revision||0)===1) return {estado:'REVISION',ok:true,texto:'Datos completados, pendientes de revisión'};
  return {estado:'LISTO',ok:true,texto:'Datos tributarios completos'};
}

function _tributarioEditorHTML() {
  const t = _voucherActual?.tributario;
  if (!t) {
    const origen=String(_voucherActual?.cabecera?.origen||'');
    if (origen!=='8' && origen!=='14') return '';
    return `<div class="er-taxbox"><div class="er-taxhead"><div><i class="fa-solid fa-triangle-exclamation" style="color:var(--warn)"></i> Datos tributarios pendientes de completar</div><span class="er-taxpill warn">Pendiente</span></div>
      <div style="padding:10px 12px;font-size:10px;color:var(--tx2);line-height:1.5;"><b>Este asiento todavía no tiene el detalle tributario del comprobante.</b> Puede completar base, IGV, exonerado/inafecto u otros conceptos sin modificar las cuentas ni el Debe/Haber. Esta información mejora los Registros de Compras/Ventas y la comparación con SIRE.</div>
      <div style="padding:0 12px 10px;"><button id="er-btn-crear-tributario" class="er-btn-secondary"><i class="fa-solid fa-receipt"></i> Completar datos tributarios</button></div></div>`;
  }
  const tipo = String(t.tipo_registro || '').toUpperCase();
  const datos = tipo === 'VENTA' ? (t.venta || {}) : (t.compra || {});
  const campos = tipo === 'VENTA'
    ? [
        ['valor_exportacion','Valor exportación','Ventas destinadas a exportación.'],['base_gravada','Base gravada','Base imponible de operaciones gravadas.'],['descuento_base','Dscto. base','Descuento que afecta la base imponible.'],
        ['igv','IGV','IGV / IPM de operaciones gravadas.'],['descuento_igv','Dscto. IGV','Descuento del IGV / IPM.'],['importe_exonerado','Exonerado','Importe de operaciones exoneradas.'],
        ['importe_inafecto','Inafecto','Importe de operaciones inafectas.'],['isc','ISC','Impuesto Selectivo al Consumo.'],['base_ivap','Base IVAP','Base imponible gravada con IVAP.'],['ivap','IVAP','Impuesto a la Venta de Arroz Pilado.'],
        ['icbper','ICBPER','Impuesto al consumo de bolsas plásticas.'],['otros_tributos','Otros tributos','Otros tributos o cargos.'],['importe_total','Importe total','Debe coincidir en valor absoluto con el total del asiento.']
      ]
    : [
        ['g1_base','G1 Base','Crédito fiscal: destinada a operaciones gravadas y/o exportación.'],['g1_igv','G1 IGV','IGV correspondiente a G1.'],['g2_base','G2 Base','Destino conjunto a operaciones gravadas/exportación y no gravadas.'],['g2_igv','G2 IGV','IGV correspondiente a G2.'],
        ['g3_base','G3 Base','Destinada a operaciones no gravadas, sin derecho a crédito fiscal.'],['g3_igv','G3 IGV','IGV correspondiente a G3.'],['valor_no_gravado','No gravado','Valor de adquisiciones no gravadas.'],['isc','ISC','Impuesto Selectivo al Consumo.'],
        ['icbper','ICBPER','Impuesto al consumo de bolsas plásticas.'],['otros_tributos','Otros tributos','Otros tributos o cargos.'],['importe_total','Importe total','Debe coincidir en valor absoluto con el total del asiento.']
      ];
  const simple = resumirTributarioAsistente(t);
  const automatico = !_tributarioManual && sincronizarTributarioLineas(_voucherOriginal?.tributario, _voucherOriginal?.detalles || [], _voucherActual.detalles).ok;
  const fuente = t.comprobante?.fuente || 'MANUAL';
  const rev = Number(t.comprobante?.requiere_revision || 0) === 1;
  const comp = t.comprobante || {};
  const metaCompra = tipo === 'COMPRA' ? (t.compra || {}) : {};
  const estadoTrib = _evaluarTributarioEditor(t);
  const estadoPill = estadoTrib.estado==='LISTO' ? '<span class="er-taxpill ok"><i class="fa-solid fa-check"></i> Completo</span>'
    : estadoTrib.estado==='REVISION' ? '<span class="er-taxpill warn"><i class="fa-solid fa-magnifying-glass"></i> Pendiente de revisión</span>'
    : '<span class="er-taxpill err"><i class="fa-solid fa-triangle-exclamation"></i> Incompleto</span>';
  return `<div class="er-taxbox">
    <div class="er-taxhead">
      <div><i class="fa-solid fa-receipt"></i> Datos tributarios del comprobante — ${tipo}</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="er-taxpill">Fuente: ${escapeHTML(fuente)}</span>${estadoPill}
      </div>
    </div>
    <div style="padding:12px;font-size:12px;line-height:1.6;">
      ${simple ? `<b>${tipo==='COMPRA'&&simple.afectacion==='GRAVADO'?simple.grupo+' · ':''}${escapeHTML(simple.afectacion)}</b> · Base / valor: S/ ${fmt(simple.base)} · IGV: S/ ${fmt(simple.igv)} · <b>Total: S/ ${fmt(datos.importe_total)}</b><br>` : '<b>Distribución especial del comprobante.</b><br>'}
      ${automatico ? 'Los importes se actualizan al editar las líneas. Se conserva la clasificación tributaria.' : 'La distribución requiere revisión manual si cambia los importes o las cuentas.'}
      ${!estadoTrib.ok ? `<div role="alert" style="color:var(--warn);">${escapeHTML(estadoTrib.texto)}</div>` : ''}
    </div>
    <details id="er-tax-especiales" ${_tributarioExpandido||!estadoTrib.ok?'open':''}>
    <summary style="cursor:pointer;padding:10px 12px;font-weight:700;">Datos especiales y clasificación tributaria</summary>
    <label style="display:block;padding:10px 12px;font-size:11px;"><input id="er-tax-manual" type="checkbox" ${_tributarioManual?'checked':''}> Editar manualmente la distribución de importes</label>
    ${tipo==='COMPRA'?'<div style="margin:8px 12px 0;padding:7px 9px;background:rgba(var(--accent-rgb),.07);border:1px solid rgba(var(--accent-rgb),.18);border-radius:5px;font-size:9px;color:var(--tx2);line-height:1.45;"><b>G1:</b> operaciones con derecho a crédito fiscal destinadas a gravadas/exportación · <b>G2:</b> destino conjunto a gravadas y no gravadas · <b>G3:</b> destino a no gravadas, sin derecho a crédito fiscal.</div>':''}
    <div class="er-taxgrid">
      ${campos.map(([k,l,ayuda])=>`<label title="${ayuda}"><span>${l} <i class="fa-regular fa-circle-question" style="opacity:.65"></i></span><input class="er-tax-input" data-tax-field="${k}" type="number" step="0.01" ${_tributarioManual?'':'disabled'} value="${Number(datos[k]||0)}"></label>`).join('')}
    </div>
    <div style="padding:0 12px 10px;">
      <div style="font-size:9px;text-transform:uppercase;color:var(--tx3);font-weight:800;margin:2px 0 6px;">Documento modificado / referencia</div>
      <div class="er-taxgrid" style="padding:0;">
        <label><span>Fecha referencia</span><input class="er-tax-meta" data-tax-meta="ref_fecha" type="date" value="${escapeAttr(comp.ref_fecha||'')}"></label>
        <label><span>Tipo CP referencia</span><input class="er-tax-meta" data-tax-meta="ref_tipo_documento" type="text" maxlength="2" value="${escapeAttr(comp.ref_tipo_documento||'')}"></label>
        <label><span>Serie referencia</span><input class="er-tax-meta" data-tax-meta="ref_serie" type="text" maxlength="20" value="${escapeAttr(comp.ref_serie||'')}"></label>
        <label><span>Número referencia</span><input class="er-tax-meta" data-tax-meta="ref_numero" type="text" maxlength="20" value="${escapeAttr(comp.ref_numero||'')}"></label>
      </div>
      ${tipo==='COMPRA'?`<div style="font-size:9px;text-transform:uppercase;color:var(--tx3);font-weight:800;margin:10px 0 6px;">Datos adicionales de compra</div>
      <div class="er-taxgrid" style="padding:0;">
        <label><span>Fecha detracción</span><input class="er-tax-extra" data-tax-extra="detraccion_fecha" type="date" value="${escapeAttr(metaCompra.detraccion_fecha||'')}"></label>
        <label><span>N° detracción</span><input class="er-tax-extra" data-tax-extra="detraccion_numero" type="text" value="${escapeAttr(metaCompra.detraccion_numero||'')}"></label>
        <label><span>Marca retención</span><input class="er-tax-extra" data-tax-extra="marca_retencion" type="text" maxlength="1" value="${escapeAttr(metaCompra.marca_retencion||'')}"></label>
      </div>`:''}
    </div>
    <label style="margin:0 12px 10px;display:flex;gap:7px;align-items:flex-start;font-size:9.5px;color:var(--tx2);line-height:1.4;"><input id="er-tax-revision" type="checkbox" ${rev?'checked':''} style="margin-top:2px;"><span><b>Dejar pendiente de revisión tributaria</b><br><span style="color:var(--tx3);">Puede guardar los datos y mantener esta marca hasta que sean verificados.</span></span></label>
    </details>
    <div class="er-taxnote"><i class="fa-solid fa-circle-info"></i> Los cambios tributarios quedan en el mismo borrador y se guardan junto con el asiento en una sola transacción.</div>
  </div>`;
}

function _bindTributarioEditor() {
  document.getElementById('er-tax-especiales')?.addEventListener('toggle', ev => { _tributarioExpandido = ev.target.open; });
  document.getElementById('er-tax-manual')?.addEventListener('change', ev => {
    _tributarioManual = ev.target.checked;
    _tributarioExpandido = true;
    if (_tributarioManual) {
      _tributarioAviso = null;
      _voucherActual.tributario.comprobante ||= {};
      _voucherActual.tributario.comprobante.requiere_revision = 1;
    } else { _sincronizarTributarioEditor(); }
    _tributarioModificado = JSON.stringify(_voucherActual.tributario) !== JSON.stringify(_voucherOriginal.tributario);
    _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
  });
  document.getElementById('er-btn-crear-tributario')?.addEventListener('click', () => {
    const origen=String(_voucherActual?.cabecera?.origen||'');
    const total=_calcularTotales(_voucherActual?.detalles||[]).debe;
    const comprobante={fuente:'MANUAL',requiere_revision:1};
    _voucherActual.tributario = origen==='14'
      ? {tipo_registro:'VENTA',comprobante,venta:{valor_exportacion:0,base_gravada:0,descuento_base:0,igv:0,descuento_igv:0,importe_exonerado:0,importe_inafecto:0,isc:0,base_ivap:0,ivap:0,icbper:0,otros_tributos:0,importe_total:total}}
      : {tipo_registro:'COMPRA',comprobante,compra:{g1_base:0,g1_igv:0,g2_base:0,g2_igv:0,g3_base:0,g3_igv:0,valor_no_gravado:0,isc:0,icbper:0,otros_tributos:0,importe_total:total,detraccion_numero:'',detraccion_fecha:'',marca_retencion:''}};
    _tributarioModificado=true;
    _renderResultado(_voucherActual.cabecera,_voucherActual.detalles);
    _status('warn','Datos tributarios creados en el borrador. Complete al menos una base, importe o impuesto además del total antes de guardar.');
  });
  const marcarCambioTrib = () => {
    _tributarioModificado = JSON.stringify(_voucherActual?.tributario || null) !== JSON.stringify(_voucherOriginal?.tributario || null);
    _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
    _status('info','Cambio tributario aplicado al borrador. Se guardará junto con el asiento.');
  };
  document.querySelectorAll('.er-tax-input').forEach(inp => inp.addEventListener('change', () => {
    const t = _voucherActual?.tributario;
    if (!t) return;
    const tipo = String(t.tipo_registro || '').toUpperCase();
    const target = tipo === 'VENTA' ? t.venta : t.compra;
    target[inp.dataset.taxField] = _nTrib(inp.value);
    marcarCambioTrib();
  }));
  document.querySelectorAll('.er-tax-meta').forEach(inp => inp.addEventListener('change', () => {
    const t = _voucherActual?.tributario; if (!t) return;
    if (!t.comprobante) t.comprobante={};
    t.comprobante[inp.dataset.taxMeta] = String(inp.value||'').trim();
    marcarCambioTrib();
  }));
  document.querySelectorAll('.er-tax-extra').forEach(inp => inp.addEventListener('change', () => {
    const t = _voucherActual?.tributario; if (!t || !t.compra) return;
    t.compra[inp.dataset.taxExtra] = String(inp.value||'').trim();
    marcarCambioTrib();
  }));
  document.getElementById('er-tax-revision')?.addEventListener('change', (ev) => {
    const t=_voucherActual?.tributario; if(!t) return;
    if(!t.comprobante) t.comprobante={};
    t.comprobante.requiere_revision = ev.target.checked ? 1 : 0;
    marcarCambioTrib();
  });
}

function _renderResultado(cab, det) {
  const el = document.getElementById('er-resultado');
  const tot = _calcularTotales(det);
  const cuadre = tot.cuadrado;
  const diferencia = Math.abs(tot.diferencia);
  const cambiosLineas = _cambiosPendientes.size;
  const cambios = cambiosLineas + (_tributarioModificado ? 1 : 0);
  const estadoTrib = _voucherActual?.tributario ? _evaluarTributarioEditor(_voucherActual.tributario) : null;
  const tributarioValido = !estadoTrib || estadoTrib.ok;
  const listoGuardar = cuadre && tributarioValido;
  const orNombre = ORIGENES_SUNAT.find(o=>o[0]===cab.origen)?.[1] || cab.origen;

  el.innerHTML = `
  <div class="er-card" style="overflow:hidden;">
    <div style="padding:10px 22px 0;display:flex;align-items:center;">
      <button id="er-btn-volver" style="padding:5px 12px;background:var(--bg-block,#f4f8fc);border:1px solid var(--brd);border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;color:var(--tx2);display:flex;align-items:center;gap:4px;">
        <i class="fa-solid fa-arrow-left"></i> Volver a la lista
      </button>
      ${cambios ? `<span style="margin-left:auto;font-size:10px;font-weight:700;color:var(--warn);background:rgba(var(--warn-rgb),.12);padding:4px 9px;border-radius:12px;"><i class="fa-solid fa-pen"></i> ${cambios} cambio${cambios===1?'':'s'} pendiente${cambios===1?'':'s'}</span>` : ''}
    </div>
    <div style="padding:12px 22px;border-bottom:1px solid var(--brd-lt);display:flex;flex-wrap:wrap;gap:18px;align-items:center;">
      <div class="er-tag"><span class="er-tag-lbl">Origen</span> ${escapeHTML(cab.origen)} - ${escapeHTML(orNombre)}</div>
      <div class="er-tag"><span class="er-tag-lbl">N°</span> ${escapeHTML(cab.numero_voucher)}</div>
      <div class="er-tag"><span class="er-tag-lbl">Fecha</span> ${escapeHTML(fmtFecha(cab.fecha))}</div>
      <div class="er-badge ${cuadre?'ok':'err'}"><i class="fa-solid ${cuadre?'fa-circle-check':'fa-triangle-exclamation'}"></i> ${cuadre?'Cuadrado':'Descuadrado'}${cambios?' (borrador)':''}</div>
      <div style="margin-left:auto;display:flex;gap:14px;font-size:13px;align-items:center;flex-wrap:wrap;">
        <span>Debe: <b style="color:var(--ok)">S/ ${fmt(tot.debe)}</b></span>
        <span>Haber: <b style="color:var(--err)">S/ ${fmt(tot.haber)}</b></span>
        ${!cuadre ? `<span style="color:var(--err);font-weight:700;">Dif.: S/ ${fmt(diferencia)}</span>` : ''}
      </div>
    </div>
    <div style="padding:10px 22px 6px;font-size:12px;font-weight:700;color:var(--tx2);display:flex;align-items:center;gap:8px;">
      <i class="fa-solid fa-list"></i> Líneas del Asiento
      <span style="font-weight:400;color:var(--tx3);font-size:10px;margin-left:auto;">Doble clic o <i class="fa-solid fa-pencil"></i> para editar</span>
    </div>
    <div style="overflow-x:auto;">
      <table class="er-table er-lines-table">
        <colgroup>
          <col style="width:3%"><col style="width:7%"><col style="width:24%">
          <col style="width:9%"><col style="width:9%"><col style="width:5%">
          <col style="width:10%"><col style="width:29%"><col style="width:4%">
        </colgroup>
        <thead><tr>
          <th>#</th>
          <th>Cuenta</th>
          <th>Denominación</th>
          <th style="text-align:right">Debe</th>
          <th style="text-align:right">Haber</th>
          <th>Mon.</th>
          <th>N° Doc.</th>
          <th>Glosa</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${det.map((d,i) => { const mod = _cambiosPendientes.has(Number(d.id)); return `
          <tr class="er-row ${mod?'er-row-dirty':''}" data-id="${escapeAttr(d.id)}">
            <td style="text-align:center;color:var(--tx3)">${mod?'<i class="fa-solid fa-pen" title="Cambio pendiente" style="color:var(--warn);font-size:9px;"></i>':i+1}</td>
            <td style="font-weight:700;color:var(--accent);font-size:11px;">${escapeHTML(d.cuenta)}</td>
            <td>${escapeHTML(d.nombre_plan||d.nombre_cuenta||'')}</td>
            <td style="text-align:right;color:var(--ok);font-weight:${d.debe>0?'700':'400'}">${d.debe>0?fmt(d.debe):''}</td>
            <td style="text-align:right;color:var(--err);font-weight:${d.haber>0?'700':'400'}">${d.haber>0?fmt(d.haber):''}</td>
            <td style="text-align:center;font-size:10px">${escapeHTML(d.moneda||'PEN')}</td>
            <td style="font-size:10px">${escapeHTML(d.doc_numero||'')}</td>
            <td style="font-size:10px;color:var(--tx3)">${escapeHTML(d.glosa||'')}</td>
            <td style="text-align:center">
              <button class="er-btn-edit" data-id="${escapeAttr(d.id)}" title="Editar"><i class="fa-solid fa-pencil"></i></button>
            </td>
          </tr>`; }).join('')}
        </tbody>
      </table>
    </div>
    ${_tributarioEditorHTML()}
    ${cambios ? `
    <div class="er-savebar">
      <div>
        <div style="font-size:11px;font-weight:800;color:var(--tx2);"><i class="fa-solid fa-layer-group"></i> Cambios pendientes: ${cambios}</div>
        <div style="font-size:10px;color:${listoGuardar?'#2f745c':'#a0444f'};margin-top:3px;">
          ${!cuadre ? `Falta cuadrar S/ ${fmt(diferencia)} antes de guardar.` : !tributarioValido ? estadoTrib.texto + '. Revise la sección Datos tributarios.' : 'El asiento y sus datos asociados están listos para guardar.'}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-left:auto;">
        <button type="button" id="er-btn-descartar" class="er-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Descartar cambios</button>
        <button type="button" id="er-btn-guardar-asiento" class="er-btn-save" ${listoGuardar?'':'disabled'} title="${listoGuardar?'Guardar todas las líneas y datos tributarios en una sola transacción':!cuadre?'El asiento debe estar cuadrado':'Complete o corrija los datos tributarios'}">
          <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
        </button>
      </div>
    </div>` : ''}
  </div>`;

  el.style.display = 'block';
  el.querySelectorAll('.er-row').forEach(r => r.addEventListener('dblclick', () => _abrirModal(+r.dataset.id)));
  el.querySelectorAll('.er-btn-edit').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); _abrirModal(+b.dataset.id); }));
  el.querySelector('#er-btn-descartar')?.addEventListener('click', _descartarCambios);
  el.querySelector('#er-btn-guardar-asiento')?.addEventListener('click', _guardarAsientoCompleto);
  _bindTributarioEditor();
}

function _abrirModal(id) {
  if (!_voucherActual) return;
  const d = _voucherActual.detalles.find(x => x.id === id);
  if (!d) return;

  document.getElementById('er-edit-id').value       = d.id;
  document.getElementById('er-edit-cuenta').value    = d.cuenta || '';
  document.getElementById('er-edit-nombre').value    = d.nombre_cuenta || '';
  document.getElementById('er-edit-debe').value      = d.debe || 0;
  document.getElementById('er-edit-haber').value     = d.haber || 0;
  document.getElementById('er-edit-fecha-doc').value = d.fecha_doc || '';
  document.getElementById('er-edit-fecha-venc').value= d.fecha_venc || '';
  document.getElementById('er-edit-doc-tipo').value  = d.doc_tipo || '';
  document.getElementById('er-edit-doc-numero').value= d.doc_numero || '';
  document.getElementById('er-edit-codigo').value    = d.codigo || '';
  document.getElementById('er-edit-razon').value     = d.razon_social || '';
  document.getElementById('er-edit-moneda').value    = d.moneda || 'PEN';
  document.getElementById('er-edit-tc').value        = d.tc || 1;
  document.getElementById('er-edit-glosa').value     = d.glosa || '';

  document.getElementById('er-modal-overlay').style.display = 'flex';
}

function _cerrarModal() { document.getElementById('er-modal-overlay').style.display = 'none'; }

function _guardar() {
  if (!_voucherActual) return;

  const id = +document.getElementById('er-edit-id').value;
  const idx = _voucherActual.detalles.findIndex(d => Number(d.id) === id);
  if (idx < 0) { alert('No se encontró la línea en el borrador.'); return; }

  const anterior = _voucherActual.detalles[idx];
  const data = {
    id,
    cuenta:        document.getElementById('er-edit-cuenta').value,
    nombre_cuenta: document.getElementById('er-edit-nombre').value,
    debe:          Number.parseFloat(document.getElementById('er-edit-debe').value) || 0,
    haber:         Number.parseFloat(document.getElementById('er-edit-haber').value) || 0,
    moneda:        document.getElementById('er-edit-moneda').value,
    tc:            Number.parseFloat(document.getElementById('er-edit-tc').value) || 1,
    doc_tipo:      document.getElementById('er-edit-doc-tipo').value,
    doc_numero:    document.getElementById('er-edit-doc-numero').value,
    fecha_doc:     document.getElementById('er-edit-fecha-doc').value,
    fecha_venc:    document.getElementById('er-edit-fecha-venc').value,
    codigo:        document.getElementById('er-edit-codigo').value,
    razon_social:  document.getElementById('er-edit-razon').value,
    glosa:         document.getElementById('er-edit-glosa').value,
  };

  _voucherActual.detalles[idx] = {
    ...anterior,
    ...data,
    // nombre_plan viene del JOIN con plan_cuentas y no es una columna editable.
    // Si cambia la cuenta, mostramos la denominación elegida en el borrador.
    nombre_plan: data.cuenta !== anterior.cuenta ? data.nombre_cuenta : anterior.nombre_plan,
  };

  _actualizarEstadoLinea(id);
  _sincronizarTributarioEditor();
  _cerrarModal();
  _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);

  const tot = _calcularTotales(_voucherActual.detalles);
  _status(
    tot.cuadrado ? 'info' : 'warn',
    tot.cuadrado
      ? 'Cambio aplicado al borrador. Use “Guardar cambios” para actualizar el asiento.'
      : `Cambio aplicado al borrador. El asiento está temporalmente descuadrado por S/ ${fmt(Math.abs(tot.diferencia))}. Edite la contrapartida antes de guardar.`
  );
}

function _sincronizarTributarioEditor() {
  if (!_voucherActual?.tributario || _tributarioManual) return;
  const sensibles = ['cuenta','debe','haber','moneda','tc','doc_tipo','doc_numero','codigo'];
  const cambio = _voucherActual.detalles.some(d => {
    const original = _voucherOriginal.detalles.find(x => Number(x.id)===Number(d.id));
    return !original || sensibles.some(k => _valorComparable(k,d[k]) !== _valorComparable(k,original[k]));
  });
  if (!cambio) {
    _tributarioAviso = null;
    // Restore amounts only, retaining edited references and review flags.
    const tipo = _voucherActual.tributario.tipo_registro === 'COMPRA' ? 'compra' : 'venta';
    for (const [k,v] of Object.entries(_voucherOriginal.tributario?.[tipo] || {})) {
      if (/^(g[123]_(base|igv)|valor_no_gravado|valor_exportacion|base_gravada|descuento_base|igv|descuento_igv|importe_exonerado|importe_inafecto|isc|base_ivap|ivap|icbper|otros_tributos|importe_total)$/.test(k)) _voucherActual.tributario[tipo][k] = v;
    }
  } else {
    const resultado = sincronizarTributarioLineas(_voucherOriginal.tributario, _voucherOriginal.detalles, _voucherActual.detalles);
    _tributarioAviso = resultado.ok ? null : resultado.texto;
    if (resultado.ok) {
      const tipo = resultado.tributario.tipo_registro === 'COMPRA' ? 'compra' : 'venta';
      for (const [k,v] of Object.entries(resultado.tributario[tipo])) {
        if (/^(g[123]_(base|igv)|valor_no_gravado|valor_exportacion|base_gravada|descuento_base|igv|descuento_igv|importe_exonerado|importe_inafecto|isc|base_ivap|ivap|icbper|otros_tributos|importe_total)$/.test(k)) _voucherActual.tributario[tipo][k] = v;
      }
    }
  }
  _tributarioModificado = JSON.stringify(_voucherActual.tributario) !== JSON.stringify(_voucherOriginal.tributario);
}

function _descartarCambios() {
  if (!_hayCambiosPendientes() || !_voucherOriginal) return;
  if (!confirm('¿Descartar todos los cambios pendientes de este asiento?')) return;
  _voucherActual = _clonar(_voucherOriginal);
  _cambiosPendientes.clear();
  _tributarioModificado = false;
  _tributarioManual = false;
  _tributarioAviso = null;
  _tributarioExpandido = false;
  _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
  _status('info', 'Cambios descartados. El asiento volvió a los valores guardados.');
}

async function _guardarAsientoCompleto() {
  if (!_voucherActual || !_hayCambiosPendientes()) return;
  const tot = _calcularTotales(_voucherActual.detalles);
  if (!tot.cuadrado) {
    _status('warn', `No se puede guardar todavía. Diferencia: S/ ${fmt(Math.abs(tot.diferencia))}.`);
    return;
  }
  if (_voucherActual.tributario) {
    const estadoTrib=_evaluarTributarioEditor(_voucherActual.tributario);
    if(!estadoTrib.ok) {
      _status('warn', `${estadoTrib.texto}. Complete o corrija los Datos tributarios antes de guardar.`);
      return;
    }
  }

  const btn = document.getElementById('er-btn-guardar-asiento');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando asiento...';
  }

  try {
    const detalles = _voucherActual.detalles.map(d => ({
      id: d.id,
      cuenta: d.cuenta,
      nombre_cuenta: d.nombre_cuenta,
      debe: d.debe,
      haber: d.haber,
      moneda: d.moneda,
      tc: d.tc,
      doc_tipo: d.doc_tipo,
      doc_numero: d.doc_numero,
      fecha_doc: d.fecha_doc,
      fecha_venc: d.fecha_venc,
      codigo: d.codigo,
      razon_social: d.razon_social,
      glosa: d.glosa,
    }));

    const r = await window.api.updateVoucherCompleto({
      voucher_id: _voucherActual.cabecera.id,
      detalles,
      tributario: _voucherActual.tributario || undefined,
    });
    if (!r.success) { _status('error', r.error || 'No se pudo guardar el asiento.'); return; }

    const reload = await window.api.buscarVoucher({ id: _voucherActual.cabecera.id });
    if (!reload.success) { _status('error', reload.error || 'El asiento se guardó, pero no pudo recargarse.'); return; }

    _iniciarEdicionVoucher(reload);
    _renderResultado(_voucherActual.cabecera, _voucherActual.detalles);
    _status('success', `✓ Asiento actualizado correctamente. ${r.lineas_actualizadas || detalles.length} línea(s) validadas en una sola transacción.`);
    setTimeout(_hideStatus, 3500);
  } catch(e) {
    _status('error', e.message);
  } finally {
    const actual = document.getElementById('er-btn-guardar-asiento');
    if (actual && _hayCambiosPendientes()) {
      const c=_calcularTotales(_voucherActual.detalles).cuadrado;
      const tOk=!_voucherActual.tributario || _evaluarTributarioEditor(_voucherActual.tributario).ok;
      actual.disabled = !(c && tOk);
      actual.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar cambios';
    }
  }
}

function _status(tipo, msg) {
  const el = document.getElementById('er-status'); if(!el)return;
  const m = { info:['var(--accent-lt)','#2f6f8f','fa-circle-info'], success:['rgba(var(--ok-rgb),.12)','#2f745c','fa-circle-check'],
    error:['rgba(var(--err-rgb),.12)','#a0444f','fa-circle-xmark'], warn:['rgba(var(--warn-rgb),.12)','#a16d24','fa-triangle-exclamation'],
    loading:['var(--bg-ro)','#2f6f8f','fa-spinner fa-spin'] };
  const[bg,c,ic]=m[tipo]||m.info;
  el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;background:${bg};color:${c};border-radius:6px;padding:8px 14px;font-size:12px;font-weight:500;"><i class="fa-solid ${ic}"></i>${escapeHTML(msg)}</div>`;
  el.style.display='block';
}
function _hideStatus() { const el=document.getElementById('er-status'); if(el)el.style.display='none'; }

function _styles() {
  return `<style>
.er-wrap{padding:0 0 32px 0;display:flex;flex-direction:column;gap:16px;font-family:'Segoe UI',system-ui,sans-serif;}
.er-hero{border-radius:8px;padding:20px 26px;background:var(--brand-grad);box-shadow:0 12px 28px rgba(28,39,51,0.16);}
body.dark-mode .er-hero{background:var(--brand-grad);}
.er-hero-icon{width:48px;height:48px;border-radius:8px;background:rgba(255,255,255,0.13);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex-shrink:0;}
.er-card{background:var(--bg-card);border:1px solid var(--brd);border-radius:8px;box-shadow:var(--shd);}
.er-lbl{font-size:11px;font-weight:700;display:block;margin-bottom:6px;color:var(--tx-lbl);text-transform:uppercase;}
.er-lbl i{margin-right:4px;color:var(--accent);}
.er-btn-primary{padding:8px 18px;border:none;border-radius:6px;background:var(--btn-primary);color:#fff;font-weight:700;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:7px;white-space:nowrap;}
.er-btn-primary:hover{background:var(--btn-primary-h);}
.er-tag{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--tx);}
.er-tag-lbl{font-size:9px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:0;}
.er-badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;}
.er-badge.ok{background:rgba(var(--ok-rgb),.12);color:var(--ok);} .er-badge.err{background:rgba(var(--err-rgb),.12);color:var(--err);}
.er-table{width:100%;border-collapse:collapse;font-size:12px;}
.er-table thead th{background:var(--bg-th);color:var(--tx-th);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0;padding:8px 10px;}
.er-table tbody td{padding:8px 10px;border-bottom:1px solid var(--brd-lt);color:var(--tx);}
.er-lines-table{table-layout:fixed;min-width:1000px;}
.er-lines-table tbody td:nth-child(3),.er-lines-table tbody td:nth-child(7),.er-lines-table tbody td:nth-child(8){overflow-wrap:anywhere;}
.er-lines-table tbody td:nth-child(4),.er-lines-table tbody td:nth-child(5){white-space:nowrap;}
.er-table tbody tr:hover{background:var(--accent-lt);cursor:pointer;}
.er-btn-edit{width:28px;height:28px;border-radius:6px;border:1px solid var(--brd);background:var(--bg-block);color:var(--accent);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all 0.15s;}
.er-btn-edit:hover{background:var(--btn-primary);color:#fff;}
.er-row-dirty{background:rgba(255,193,7,.08);}
.er-row-dirty:hover{background:rgba(255,193,7,.14)!important;}
.er-savebar{padding:12px 18px;border-top:1px solid var(--brd);background:var(--bg-block);display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.er-btn-secondary{padding:7px 13px;border:1px solid var(--brd);border-radius:5px;background:var(--bg-card);color:var(--tx2);font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;}
.er-btn-save{padding:7px 15px;border:0;border-radius:5px;background:var(--btn-ok);color:#fff;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;}
.er-btn-save:disabled{background:#9aa9b7;cursor:not-allowed;opacity:.75;}
.er-taxbox{margin:12px 18px;border:1px solid var(--brd);border-radius:7px;background:var(--bg-block);overflow:hidden;}
.er-taxhead{padding:9px 12px;border-bottom:1px solid var(--brd);font-size:11px;font-weight:800;color:var(--tx2);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.er-taxpill{font-size:9px;padding:3px 7px;border-radius:10px;background:rgba(var(--accent-rgb),.10);color:var(--accent)}.er-taxpill.warn{background:rgba(var(--warn-rgb),.12);color:var(--warn)}.er-taxpill.ok{background:rgba(var(--ok-rgb),.12);color:var(--ok)}.er-taxpill.err{background:rgba(var(--err-rgb),.12);color:var(--err);}
.er-taxgrid{padding:10px 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;}
.er-taxgrid label span{display:block;font-size:9px;text-transform:uppercase;color:var(--tx3);font-weight:700;margin-bottom:4px}.er-taxgrid input{width:100%;font-size:11px;}
.er-taxnote{padding:7px 12px;border-top:1px solid var(--brd);font-size:9px;color:var(--tx3);}
  </style>`;
}
