import { fechaInicialPeriodo } from '../utils/periodoTrabajo.mjs';
import { evaluarDetalleTributario, resumirTributarioAsistente } from '../utils/tributario.mjs';
// src/renderer/js/modules/voucher.js
import { initEntidades } from './entidades.js';
import { escapeHTML, escapeAttr } from '../utils/security.js';

let voucherInitialized = false;
let mesDeTrabajo = null;
let anoDeTrabajo = null;

// Período contable de trabajo en formato 'YYYY-MM' (independiente de la fecha de hoy)
function _periodoTrabajo() {
  if (!anoDeTrabajo || !mesDeTrabajo) return '';
  return `${anoDeTrabajo}-${String(mesDeTrabajo).padStart(2, '0')}`;
}
let lastLineData = null; // Recuerda los datos de la última línea para pre-llenar el modal
let tributarioPendiente = null; // Borrador tributario explícito (Asistente o ingreso manual)

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETADO DE CLIENTE / PROVEEDOR / EMPLEADO (Código RUC/DNI)
// Mientras se escribe, sugiere coincidencias de la tabla de entidades. Al elegir,
// rellena el código y la razón social. Si no existe, ofrece "Registrar nuevo" que
// redirige a la pantalla de Clientes/Proveedores con el código pre-llenado.
// ─────────────────────────────────────────────────────────────────────────────
function _inyectarEstilosAutocomplete() {
  if (document.getElementById('ent-ac-styles')) return;
  const s = document.createElement('style');
  s.id = 'ent-ac-styles';
  s.textContent = `
    .ent-ac-dropdown{position:fixed;z-index:2200;max-height:260px;overflow-y:auto;
      background:var(--bg-modal,#fff);border:1px solid var(--brd,#c0ccd8);border-radius:8px;
      box-shadow:0 12px 30px rgba(5,12,22,0.28);font-size:13px;}
    .ent-ac-item{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;
      border-bottom:1px solid var(--brd-lt,#eef2f6);}
    .ent-ac-item:hover{background:var(--accent-lt,#e8f0fa);}
    .ent-ac-cod{font-weight:700;color:var(--accent,#2f6f8f);min-width:88px;}
    .ent-ac-razon{flex:1;color:var(--tx,#182433);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .ent-ac-tipo{font-size:10px;font-weight:700;text-transform:uppercase;color:#fff;
      background:var(--tx2);border-radius:8px;padding:2px 8px;}
    .ent-ac-empty{padding:10px 12px;color:var(--tx2,#7898b0);font-style:italic;}
    .ent-ac-registrar{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;
      font-weight:700;color:var(--ok);background:var(--bg-mftr,#f4f8fd);border-top:1px solid var(--brd,#c0ccd8);}
    .ent-ac-registrar:hover{background:rgba(var(--ok-rgb),.12);}
  `;
  document.head.appendChild(s);
}

// Abre el modal "Nuevo Registro" ENCIMA del voucher (sin salir de él). Al guardar,
// el voucher recibe el cliente recién creado vía window.__voucherEntCallback.
function _irARegistrarEntidad(codigoPrefill, codigoInput, razonInput) {
  // Asegura que los manejadores del formulario de entidades estén activos.
  try { initEntidades(); } catch (_) {}

  const modalEnt = document.getElementById('modalEnt');
  if (!modalEnt) return;

  // El modal vive dentro de la sección "view-entidades", que está oculta cuando
  // no es la vista activa. Lo movemos al <body> para que se muestre sobre el
  // voucher sin importar la vista actual (es un overlay de posición fija).
  if (modalEnt.parentElement !== document.body) document.body.appendChild(modalEnt);

  // Preparar el formulario en modo "Nuevo" con el código pre-llenado.
  const form = document.getElementById('formEnt');
  if (form) form.reset();
  const title = document.getElementById('modalEntTitle');
  if (title) title.textContent = 'Nuevo Registro';
  const isEdit = document.getElementById('ent_is_edit'); if (isEdit) isEdit.value = 'false';
  const oldCod = document.getElementById('ent_old_codigo'); if (oldCod) oldCod.value = '';
  const entCod = document.getElementById('ent_codigo');
  if (entCod) { entCod.readOnly = false; entCod.value = codigoPrefill || ''; }
  const entRazon = document.getElementById('ent_razon_social'); if (entRazon) entRazon.value = '';

  // Al guardar: rellenar el voucher con el cliente registrado.
  window.__voucherEntCallback = (saved) => {
    if (codigoInput) codigoInput.value = saved.codigo;
    if (razonInput)  razonInput.value  = saved.razon_social;
  };

  // Mostrar el modal por encima del modal del voucher.
  modalEnt.style.zIndex = '1200';
  modalEnt.style.display = 'flex';
  // Foco al primer campo vacío (Razón Social, ya que el código viene lleno).
  setTimeout(() => { if (entRazon) entRazon.focus(); }, 50);
}

function attachEntidadAutocomplete(codigoInput, razonInput) {
  if (!codigoInput || codigoInput.dataset.acReady === '1') return;
  codigoInput.dataset.acReady = '1';
  _inyectarEstilosAutocomplete();

  let dropdown = null;
  let cache = null;

  const cerrar = () => { if (dropdown) { dropdown.remove(); dropdown = null; } };
  const posicionar = () => {
    if (!dropdown) return;
    const r = codigoInput.getBoundingClientRect();
    dropdown.style.left = `${r.left}px`;
    dropdown.style.top = `${r.bottom + 2}px`;
    dropdown.style.width = `${Math.max(r.width, 340)}px`;
  };

  const render = (matches, termino) => {
    cerrar();
    dropdown = document.createElement('div');
    dropdown.className = 'ent-ac-dropdown';
    let html = '';
    if (matches.length) {
      html += matches.slice(0, 8).map(e => `
        <div class="ent-ac-item" data-codigo="${escapeAttr(e.codigo)}" data-razon="${escapeAttr(e.razon_social || '')}">
          <span class="ent-ac-cod">${escapeHTML(e.codigo)}</span>
          <span class="ent-ac-razon">${escapeHTML(e.razon_social || '')}</span>
          <span class="ent-ac-tipo">${escapeHTML(e.tipo || '')}</span>
        </div>`).join('');
    } else {
      html += `<div class="ent-ac-empty">Sin coincidencias para "${escapeHTML(termino)}"</div>`;
    }
    html += `<div class="ent-ac-registrar" data-action="registrar"><i class="fa-solid fa-user-plus"></i> Registrar nuevo cliente/proveedor</div>`;
    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);
    posicionar();

    dropdown.querySelectorAll('.ent-ac-item').forEach(it => {
      it.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        codigoInput.value = it.dataset.codigo;
        if (razonInput) razonInput.value = it.dataset.razon;
        cerrar();
      });
    });
    dropdown.querySelector('[data-action="registrar"]').addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const cod = codigoInput.value.trim();
      cerrar();
      _irARegistrarEntidad(cod, codigoInput, razonInput);
    });
  };

  const buscar = async () => {
    const term = codigoInput.value.trim().toLowerCase();
    if (!term) { cerrar(); return; }
    if (!cache) cache = await window.api.getEntidades() || [];
    const matches = cache.filter(e =>
      String(e.codigo).toLowerCase().includes(term) ||
      String(e.razon_social || '').toLowerCase().includes(term)
    );
    render(matches, codigoInput.value.trim());
  };

  codigoInput.addEventListener('focus', () => { cache = null; });
  codigoInput.addEventListener('input', buscar);
  codigoInput.addEventListener('blur', () => setTimeout(cerrar, 180));
  window.addEventListener('scroll', posicionar, true);
  window.addEventListener('resize', posicionar);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETADO DE CUENTAS CONTABLES (Plan de Cuentas)
// Mientras se escribe el código o el nombre de la cuenta, sugiere coincidencias
// del Plan de Cuentas. Al elegir, rellena código + nombre de la cuenta.
// ─────────────────────────────────────────────────────────────────────────────
function attachCuentaAutocomplete(cuentaInput, nombreInput) {
  if (!cuentaInput || cuentaInput.dataset.acReady === '1') return;
  cuentaInput.dataset.acReady = '1';
  _inyectarEstilosAutocomplete();

  let dropdown = null;
  let cache = null;

  const cerrar = () => { if (dropdown) { dropdown.remove(); dropdown = null; } };
  const posicionar = () => {
    if (!dropdown) return;
    const r = cuentaInput.getBoundingClientRect();
    dropdown.style.left = `${r.left}px`;
    dropdown.style.top = `${r.bottom + 2}px`;
    dropdown.style.width = `${Math.max(r.width, 340)}px`;
  };

  const render = (matches, termino) => {
    cerrar();
    dropdown = document.createElement('div');
    dropdown.className = 'ent-ac-dropdown';
    dropdown.innerHTML = matches.length
      ? matches.slice(0, 8).map(c => `
        <div class="ent-ac-item" data-codigo="${escapeAttr(c.codigo)}" data-nombre="${escapeAttr(c.descripcion || '')}">
          <span class="ent-ac-cod">${escapeHTML(c.codigo)}</span>
          <span class="ent-ac-razon">${escapeHTML(c.descripcion || '')}</span>
        </div>`).join('')
      : `<div class="ent-ac-empty">Sin cuentas que coincidan con "${escapeHTML(termino)}"</div>`;
    document.body.appendChild(dropdown);
    posicionar();

    dropdown.querySelectorAll('.ent-ac-item').forEach(it => {
      it.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        cuentaInput.value = it.dataset.codigo;
        if (nombreInput) nombreInput.value = it.dataset.nombre;
        cerrar();
      });
    });
  };

  const buscar = async () => {
    const term = cuentaInput.value.trim().toLowerCase();
    if (!term) { cerrar(); return; }
    if (!cache) cache = await window.api.getPlanCuentas() || [];
    // Prioriza coincidencia por inicio de código, luego por contenido / nombre.
    const matches = cache.filter(c =>
      String(c.codigo).toLowerCase().startsWith(term) ||
      String(c.codigo).toLowerCase().includes(term) ||
      String(c.descripcion || '').toLowerCase().includes(term)
    ).sort((a, b) => {
      const ac = String(a.codigo).toLowerCase().startsWith(term) ? 0 : 1;
      const bc = String(b.codigo).toLowerCase().startsWith(term) ? 0 : 1;
      return ac - bc || String(a.codigo).localeCompare(String(b.codigo));
    });
    render(matches, cuentaInput.value.trim());
  };

  cuentaInput.addEventListener('focus', () => { cache = null; });
  cuentaInput.addEventListener('input', buscar);
  cuentaInput.addEventListener('blur', () => setTimeout(cerrar, 180));
  window.addEventListener('scroll', posicionar, true);
  window.addEventListener('resize', posicionar);
}

// ─────────────────────────────────────────────────────────────────────────────
// validarCuentaContable
// Regla: la cuenta debe tener entre 3 y 8 dígitos (sólo números). Si no cumple,
// muestra una alerta y devuelve false. Se usa al registrar por Asistente y por
// "Agregar línea".
// ─────────────────────────────────────────────────────────────────────────────
function validarCuentaContable(codigo) {
  const v = String(codigo || '').trim();
  if (!/^\d+$/.test(v)) {
    alert('La cuenta debe contener sólo dígitos (sin letras ni espacios).');
    return false;
  }
  if (v.length < 3) {
    alert('La cuenta debe tener mínimo 3 dígitos. No se permite registrar cuentas más cortas.');
    return false;
  }
  if (v.length > 8) {
    alert('La cuenta debe tener máximo 8 dígitos.');
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// mostrarConfirmacionAsistente
// Modal de confirmación — usa variables CSS para respetar el tema activo
// ─────────────────────────────────────────────────────────────────────────────
function mostrarConfirmacionAsistente(onConfirm) {
  // Leer variables CSS del tema activo en tiempo de ejecución
  const cs = getComputedStyle(document.body);
  const bgModal  = cs.getPropertyValue('--bg-modal').trim();
  const bgMhdr   = cs.getPropertyValue('--bg-mhdr').trim();
  const sbActive = cs.getPropertyValue('--sb-active').trim();
  const bgBlock  = cs.getPropertyValue('--bg-block').trim();
  const brd      = cs.getPropertyValue('--brd').trim();
  const brdIn    = cs.getPropertyValue('--brd-in').trim();
  const accent   = cs.getPropertyValue('--accent').trim();
  const buttonBg = cs.getPropertyValue('--btn-primary').trim();
  const accentLt = cs.getPropertyValue('--accent-lt').trim();
  const tx       = cs.getPropertyValue('--tx').trim();
  const tx2      = cs.getPropertyValue('--tx2').trim();
  const bgRo     = cs.getPropertyValue('--bg-ro').trim();
  const shdModal = cs.getPropertyValue('--shd-modal').trim();

  // ── Overlay ──
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(5,12,22,0.75)', backdropFilter: 'blur(4px)',
    zIndex: '9999', display: 'flex', justifyContent: 'center', alignItems: 'center',
    opacity: '0', transition: 'opacity 0.2s ease'
  });

  // ── Wrapper del modal ──
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    background: bgModal, borderRadius: '6px',
    boxShadow: shdModal || '0 20px 50px rgba(0,0,0,0.35)',
    maxWidth: '400px', width: '90%',
    transform: 'scale(0.95)', transition: 'transform 0.2s ease',
    border: `1px solid ${brd}`, overflow: 'hidden',
    display: 'flex', flexDirection: 'column'
  });

  // ── Cabecera azul (igual que los demás modales) ──
  const hdr = document.createElement('div');
  Object.assign(hdr.style, {
    background: bgMhdr, padding: '14px 22px',
    borderBottom: `2px solid ${sbActive}`,
    display: 'flex', alignItems: 'center', gap: '10px'
  });
  const hdrIcon = document.createElement('i');
  hdrIcon.className = 'fa-solid fa-wand-magic-sparkles';
  Object.assign(hdrIcon.style, { fontSize: '16px', color: accent });
  const hdrTitle = document.createElement('h3');
  hdrTitle.textContent = '¿Usar el Asistente?';
  Object.assign(hdrTitle.style, {
    margin: '0', color: '#e0f0ff', fontSize: '15px', fontWeight: '700'
  });
  hdr.appendChild(hdrIcon);
  hdr.appendChild(hdrTitle);
  wrap.appendChild(hdr);

  // ── Cuerpo ──
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '22px 24px', background: bgModal });

  // Ícono central
  const iconBox = document.createElement('div');
  Object.assign(iconBox.style, {
    background: accentLt, width: '52px', height: '52px', borderRadius: '6px',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    margin: '0 auto 16px', border: `1px solid ${brdIn}`
  });
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-wand-magic-sparkles';
  Object.assign(icon.style, { fontSize: '22px', color: accent });
  iconBox.appendChild(icon);

  const msg = document.createElement('p');
  msg.textContent = 'Se generarán automáticamente las líneas del asiento contable según el tipo de operación.';
  Object.assign(msg.style, {
    color: tx2, margin: '0', fontSize: '13px', lineHeight: '1.6', textAlign: 'center'
  });

  body.appendChild(iconBox);
  body.appendChild(msg);
  wrap.appendChild(body);

  // ── Footer con botones ──
  const ftr = document.createElement('div');
  Object.assign(ftr.style, {
    background: cs.getPropertyValue('--bg-mftr').trim(),
    padding: '12px 22px', borderTop: `1px solid ${brd}`,
    display: 'flex', justifyContent: 'flex-end', gap: '10px'
  });

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Cancelar';
  Object.assign(btnCancel.style, {
    background: bgRo, color: tx2, border: `1px solid ${brdIn}`,
    padding: '8px 18px', borderRadius: '3px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600'
  });

  const btnConfirm = document.createElement('button');
  btnConfirm.textContent = 'Sí, continuar';
  Object.assign(btnConfirm.style, {
    background: buttonBg, color: '#ffffff', border: 'none',
    padding: '8px 18px', borderRadius: '3px', cursor: 'pointer',
    fontSize: '13px', fontWeight: '600'
  });

  const closeModal = () => {
    overlay.style.opacity = '0';
    wrap.style.transform = 'scale(0.95)';
    setTimeout(() => { if (overlay.parentNode) document.body.removeChild(overlay); }, 200);
  };

  btnCancel.addEventListener('click', closeModal);
  btnConfirm.addEventListener('click', () => { closeModal(); onConfirm(); });

  ftr.appendChild(btnCancel);
  ftr.appendChild(btnConfirm);
  wrap.appendChild(ftr);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; wrap.style.transform = 'scale(1)'; });
}

// ─────────────────────────────────────────────────────────────────────────────
// mostrarToast
// Notificación flotante no intrusiva (reemplaza al alert de éxito)
// ─────────────────────────────────────────────────────────────────────────────
function mostrarToast({ mensaje, tipo = 'success', duracion = 4000 }) {
  const colores = {
    success: { bg: 'var(--ok)', border: 'var(--ok-h)', icon: 'fa-circle-check' },
    error:   { bg: 'var(--err)', border: 'var(--err-h)', icon: 'fa-circle-xmark' },
    info:    { bg: 'var(--accent)', border: 'var(--accent-h)', icon: 'fa-circle-info'  },
  };
  const c = colores[tipo] || colores.info;

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '28px', right: '28px', zIndex: '99999',
    background: c.bg, color: '#fff', padding: '12px 20px', borderRadius: '4px',
    fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    borderLeft: `4px solid ${c.border}`,
    display: 'flex', alignItems: 'center', gap: '10px',
    maxWidth: '380px', lineHeight: '1.4',
    transform: 'translateY(20px)', opacity: '0',
    transition: 'all 0.25s ease'
  });

  toast.innerHTML = `<i class="fa-solid ${c.icon}" style="font-size:16px;flex-shrink:0;"></i><span>${escapeHTML(mensaje)}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)'; toast.style.opacity = '0';
    setTimeout(() => { if (toast.parentNode) document.body.removeChild(toast); }, 300);
  }, duracion);
}

// ─────────────────────────────────────────────────────────────────────────────
// findExchangeRateForDate
// Busca el tipo de cambio USD más cercano anterior o igual a la fecha dada.
// Si el origen es '8' (Compras) usa el T.C. COMPRA; si es '14' (Ventas) usa VENTA.
// Para otros orígenes usa VENTA por convención contable.
// ─────────────────────────────────────────────────────────────────────────────
async function findExchangeRateForDate(fecha, origen) {
  try {
    const allMonedas = await window.api.getMonedas();
    if (!allMonedas || allMonedas.length === 0) return null;
    const m = allMonedas.find(m => m.nombre === 'USD' && m.fecha <= fecha);
    if (!m) return null;

    // Origen 8 = Registro de Compras → tipo de cambio COMPRA
    // Origen 14 = Registro de Ventas → tipo de cambio VENTA
    // Otros → VENTA (convención contable)
    if (String(origen) === '8' && m.compra > 0) {
      return m.compra;
    }
    // Para ventas y otros orígenes: usar venta; si no hay, caer a tipo_cambio
    return m.venta > 0 ? m.venta : m.tipo_cambio;
  } catch (error) {
    console.error("Error al buscar tipo de cambio:", error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// actualizarNumeroVoucher
// Consulta al backend el próximo número de voucher para el origen y fecha
// actuales, y lo refleja en el campo (solo lectura) de la UI.
//
// Se llama cada vez que cambia el origen o la fecha contable.
// El número mostrado es ESTIMADO; el definitivo lo asigna el servidor al
// guardar dentro de la transacción atómica.
// ─────────────────────────────────────────────────────────────────────────────
async function actualizarNumeroVoucher() {
  const origenSelect   = document.getElementById('voucher_origen');
  const fechaInput     = document.getElementById('voucher_fecha');
  const numeroDisplay  = document.getElementById('voucher_numero');

  if (!origenSelect || !fechaInput || !numeroDisplay) return;

  const origen = origenSelect.value;
  const fecha  = fechaInput.value;

  if (!origen || !fecha) {
    numeroDisplay.value = '---';
    return;
  }

  try {
    numeroDisplay.value = '...';
    const resp = await window.api.getSiguienteNumeroVoucher({ origen, periodo: _periodoTrabajo(), fechaContable: fecha });
    if (resp && resp.success) {
      numeroDisplay.value = resp.numero;
    } else {
      numeroDisplay.value = '?';
    }
  } catch (err) {
    // Si no hay empresa conectada, el campo muestra guiones
    numeroDisplay.value = '---';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// limpiarFormularioVoucher
// Tras guardar: limpia SOLO las líneas del asiento y el número de voucher.
// El ORIGEN y la FECHA CONTABLE se conservan para facilitar el ingreso
// de múltiples asientos del mismo tipo sin tener que re-seleccionarlos.
// ─────────────────────────────────────────────────────────────────────────────
function limpiarFormularioVoucher() {
  // Conservar origen y fecha antes de reset
  const origenActual = document.getElementById('voucher_origen').value;
  // Limpiar tabla de detalles
  document.getElementById('tabla-voucher-detalle').innerHTML = '';
  // Limpiar totales
  document.getElementById('voucher_total_debe').textContent  = '0.00';
  document.getElementById('voucher_total_haber').textContent = '0.00';
  // Restaurar origen (la fecha es readonly, no se toca)
  document.getElementById('voucher_origen').value = origenActual;
  // El número se actualiza vía actualizarNumeroVoucher() después del guardado
  lastLineData = null;
  tributarioPendiente = null;
  _actualizarBotonTributario();
}

// ─────────────────────────────────────────────────────────────────────────────
// leerDetallesDesdeTabla
// Extrae los datos de cada fila de la tabla del voucher para enviarlos al backend
// ─────────────────────────────────────────────────────────────────────────────
function leerDetallesDesdeTabla() {
  const rows = document.querySelectorAll('#tabla-voucher-detalle tr');
  return Array.from(rows).map(tr => ({
    cuenta:       tr.cells[0].textContent.trim(),
    nombre_cuenta:tr.cells[1].textContent.trim(),
    debe:         parseFloat(tr.cells[2].textContent) || 0,
    haber:        parseFloat(tr.cells[3].textContent) || 0,
    moneda:       tr.cells[4].textContent.trim(),
    tc:           parseFloat(tr.cells[5].textContent) || 1,
    equivalente:  parseFloat(tr.cells[6].textContent) || 0,
    doc_tipo:     tr.cells[7].textContent.trim(),
    doc_numero:   tr.cells[8].textContent.trim(),
    fecha_doc:    tr.cells[9].textContent.trim(),
    fecha_venc:   tr.cells[10].textContent.trim(),
    codigo:       tr.cells[11].textContent.trim(),
    razon_social: tr.cells[12].textContent.trim(),
    glosa:        tr.cells[13].textContent.trim(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// initVoucher (export principal)
// ─────────────────────────────────────────────────────────────────────────────

function _totalVoucherVisible() {
  const debe = Number.parseFloat(document.getElementById('voucher_total_debe')?.textContent || 0) || 0;
  const haber = Number.parseFloat(document.getElementById('voucher_total_haber')?.textContent || 0) || 0;
  return Math.max(Math.abs(debe), Math.abs(haber));
}

function _evaluarTributarioBorrador(t = tributarioPendiente, totalAsiento = _totalVoucherVisible()) {
  if (!t) return { estado:'PENDIENTE', ok:false, texto:'Datos tributarios pendientes' };
  const detalle = evaluarDetalleTributario(t);
  if (!detalle.ok) return detalle;
  const datos = t.tipo_registro === 'VENTA' ? t.venta : t.compra;
  const totalTrib = Number(datos.importe_total);
  if (Math.abs(Math.abs(totalTrib) - totalAsiento) > 0.010001) return { estado:'DIFERENCIA', ok:false, texto:'El total del comprobante no coincide con el asiento', totalTrib };
  if (Number(t.comprobante?.requiere_revision || 0) === 1) {
    return { estado:'REVISION', ok:true, texto:'Datos tributarios por revisar', totalTrib };
  }
  return { estado:'LISTO', ok:true, texto:'Datos tributarios listos', totalTrib };
}

function _actualizarBotonTributario() {
  const btn = document.getElementById('voucher-comprobante-estado');
  if (!btn) return;
  const origen = String(document.getElementById('voucher_origen')?.value || '');
  const aplica = origen === '8' || origen === '14';
  btn.hidden = !aplica;
  if (!aplica) return;
  const estado = _evaluarTributarioBorrador();
  const visual = {
    PENDIENTE:  ['warn','fa-receipt','Complete el comprobante con el Asistente'],
    INCOMPLETO: ['warn','fa-triangle-exclamation','Tributarios incompletos'],
    DIFERENCIA: ['err','fa-circle-exclamation','Revisar total tributario'],
    REVISION:   ['warn','fa-magnifying-glass','Revisar datos tributarios'],
    LISTO:      ['ok','fa-circle-check','Datos tributarios listos ✓'],
  }[estado.estado] || ['warn','fa-receipt','Completar datos tributarios'];
  btn.innerHTML = `<i class="fa-solid ${visual[1]}"></i> ${visual[2]}`;
  btn.style.background = `rgba(var(--${visual[0]}-rgb),.08)`;
  btn.style.color = `var(--${visual[0]})`;
  btn.style.borderColor = `rgba(var(--${visual[0]}-rgb),.25)`;
  btn.title = estado.texto;
}

function _renderDatosEspecialesAsistente() {
  const host = document.getElementById('asistente-datos-especiales');
  const tipo = document.getElementById('voucher_origen').value === '14' ? 'VENTA' : 'COMPRA';
  const aplica = ['8','14'].includes(document.getElementById('voucher_origen').value);
  host.hidden = !aplica;
  const previo = tributarioPendiente?.tipo_registro === tipo ? tributarioPendiente : null;
  const datos = tipo === 'VENTA' ? (previo?.venta || {}) : (previo?.compra || {});
  const compPrev = previo?.comprobante || {};
  const simple = resumirTributarioAsistente(previo);
  const especial = !!previo && !simple;
  if (simple) {
    document.getElementById('asistente_base').value=simple.base;
    document.getElementById('asistente_igv').value=simple.igv;
    document.getElementById('asistente_afectacion').value=simple.afectacion;
    document.getElementById('asistente_grupo_compra').value=simple.grupo;
    document.getElementById('asistente_tasa_igv').value=simple.tasa;
  }
  const campos = tipo === 'VENTA' ? [
    ['valor_exportacion','Valor exportación','Ventas destinadas a exportación.'],
    ['base_gravada','Base gravada','Base imponible de operaciones gravadas con IGV.'],
    ['descuento_base','Descuento base','Descuento que afecta la base imponible, cuando corresponda.'],
    ['igv','IGV','IGV / IPM de las operaciones gravadas.'],
    ['descuento_igv','Descuento IGV','Descuento del IGV / IPM, cuando corresponda.'],
    ['importe_exonerado','Exonerado','Importe de operaciones exoneradas.'],
    ['importe_inafecto','Inafecto','Importe de operaciones inafectas.'],
    ['isc','ISC','Impuesto Selectivo al Consumo, cuando corresponda.'],
    ['base_ivap','Base IVAP','Base imponible gravada con IVAP.'],
    ['ivap','IVAP','Impuesto a la Venta de Arroz Pilado.'],
    ['icbper','ICBPER','Impuesto al consumo de bolsas plásticas.'],
    ['otros_tributos','Otros tributos','Otros tributos o cargos incluidos en el comprobante.'],
    ['importe_total','Importe total','Total tributario del comprobante; debe coincidir en valor absoluto con el total del asiento.']
  ] : [
    ['g1_base','G1 Base gravada','Adquisiciones gravadas que dan derecho a crédito fiscal y se destinan a operaciones gravadas y/o exportación.'],
    ['g1_igv','G1 IGV','IGV correspondiente a la base G1.'],
    ['g2_base','G2 Base mixta','Adquisiciones gravadas destinadas conjuntamente a operaciones gravadas/exportación y no gravadas.'],
    ['g2_igv','G2 IGV','IGV correspondiente a la base G2.'],
    ['g3_base','G3 Base sin crédito','Adquisiciones gravadas destinadas a operaciones no gravadas, sin derecho a crédito fiscal.'],
    ['g3_igv','G3 IGV','IGV correspondiente a la base G3.'],
    ['valor_no_gravado','Adquisición no gravada','Valor de adquisiciones no gravadas.'],
    ['isc','ISC','Impuesto Selectivo al Consumo, cuando corresponda.'],
    ['icbper','ICBPER','Impuesto al consumo de bolsas plásticas.'],
    ['otros_tributos','Otros conceptos','Otros tributos o cargos incluidos en el comprobante.'],
    ['importe_total','Importe total','Total tributario del comprobante; debe coincidir en valor absoluto con el total del asiento.']
  ];

  host.innerHTML = `<details ${especial || Object.keys(compPrev).some(k=>k.startsWith('ref_')&&compPrev[k]) || datos.detraccion_numero || datos.detraccion_fecha || datos.marca_retencion ? 'open' : ''}>
    <summary>Datos especiales del comprobante (opcional)</summary>
    <p>Para operaciones mixtas, otros impuestos, notas de crédito/débito o detracciones. Los importes habituales se completan con Base, IGV y Total.</p>
    <label class="assistant-tax-check"><input id="asistente-desglose-manual" type="checkbox" ${especial ? 'checked' : ''}> Usar una distribución especial de importes</label>
    <div id="asistente-desglose-campos" class="assistant-tax-grid" ${especial ? '' : 'hidden'}>
      ${campos.filter(([k])=>k !== 'importe_total').map(([k,l,ayuda])=>`<label title="${ayuda}">${l}<input data-at="${k}" type="number" step="0.01" value="${Number(datos[k]||0)}"></label>`).join('')}
    </div>
    <details ${Object.keys(compPrev).some(k=>k.startsWith('ref_')&&compPrev[k]) ? 'open' : ''}><summary>Documento de referencia</summary><div class="assistant-tax-grid">
      ${[['ref_fecha','Fecha','date'],['ref_tipo_documento','Tipo de documento','text'],['ref_serie','Serie','text'],['ref_numero','Número','text']].map(([k,l,t])=>`<label>${l}<input data-atc="${k}" type="${t}" value="${escapeAttr(compPrev[k]||'')}"></label>`).join('')}
    </div></details>
    ${tipo === 'COMPRA' ? `<details ${datos.detraccion_numero || datos.detraccion_fecha || datos.marca_retencion ? 'open' : ''}><summary>Detracción y retención</summary><div class="assistant-tax-grid">
      ${[['detraccion_fecha','Fecha detracción','date'],['detraccion_numero','Número detracción','text'],['marca_retencion','Marca retención','text']].map(([k,l,t])=>`<label>${l}<input data-atp="${k}" type="${t}" value="${escapeAttr(datos[k]||'')}"></label>`).join('')}
    </div></details>` : ''}
    <label class="assistant-tax-check"><input id="asistente-revision" type="checkbox" ${compPrev.requiere_revision ? 'checked' : ''}> Dejar pendiente de revisión</label>
  </details>`;
  document.getElementById('asistente_afectacion').dispatchEvent(new Event('change'));
}

function _leerTributarioAsistente() {
  const tipo = document.getElementById('voucher_origen').value === '14' ? 'VENTA' : 'COMPRA';
  const base = Number(document.getElementById('asistente_base').value || 0);
  const igv = Number(document.getElementById('asistente_igv').value || 0);
  const total = Number(document.getElementById('asistente_total').value || 0);
  const afectacion = document.getElementById('asistente_afectacion').value;
  const grupo = document.getElementById('asistente_grupo_compra').value.toLowerCase();
  let datos = tipo === 'VENTA' ? {
    valor_exportacion:afectacion==='EXPORTACION'?base:0,
    base_gravada:afectacion==='GRAVADO'?base:0, igv:afectacion==='GRAVADO'?igv:0,
    importe_exonerado:afectacion==='EXONERADO'?base:0, importe_inafecto:afectacion==='INAFECTO'?base:0,
  } : { [grupo+'_base']:afectacion==='GRAVADO'?base:0, [grupo+'_igv']:afectacion==='GRAVADO'?igv:0,
    valor_no_gravado:afectacion==='GRAVADO'?0:base };
  const host = document.getElementById('asistente-datos-especiales');
  if (host.querySelector('#asistente-desglose-manual')?.checked) {
    datos={}; host.querySelectorAll('[data-at]').forEach(i=>datos[i.dataset.at]=Number(i.value||0));
  }
  datos.importe_total=total;
  host.querySelectorAll('[data-atp]').forEach(i=>datos[i.dataset.atp]=i.value.trim());
  const comprobante={...tributarioPendiente?.comprobante,fuente:'ASISTENTE',requiere_revision:host.querySelector('#asistente-revision')?.checked?1:0};
  host.querySelectorAll('[data-atc]').forEach(i=>comprobante[i.dataset.atc]=i.value.trim());
  return tipo==='VENTA'?{tipo_registro:tipo,comprobante,venta:datos}:{tipo_registro:tipo,comprobante,compra:datos};
}

export function hayBorradorVoucher() {
  return !!document.getElementById('tabla-voucher-detalle')?.children.length;
}
export function initVoucher(mesSeleccionado, anoSeleccionado) {
  const previo = _periodoTrabajo();
  mesDeTrabajo  = mesSeleccionado;
  anoDeTrabajo  = anoSeleccionado;

  const fechaInput = document.getElementById('voucher_fecha');
  if (fechaInput && (!fechaInput.value || (previo !== _periodoTrabajo() && !hayBorradorVoucher()))) {
    fechaInput.value = fechaInicialPeriodo(_periodoTrabajo());
  }
  // Actualizar número estimado al entrar a la vista (con origen y fecha actuales)
  actualizarNumeroVoucher();

  if (voucherInitialized) return; // No re-adjuntar listeners
  voucherInitialized = true;

  // ── Referencias a elementos del DOM ───────────────────────────────────────
  const btnAsistente          = document.getElementById('btnVoucherAsistente');
  const soloDatosInput = document.getElementById('asistente-solo-datos');
  const modalAsistente        = document.getElementById('modalVoucherAsistente');
  const btnVoucherAgregarLinea= document.getElementById('btnVoucherAgregarLinea');
  const modalVoucherLinea     = document.getElementById('modalVoucherLinea');
  const btnCerrarModalLinea   = document.getElementById('btnCerrarModalLinea');
  const formVoucherLinea      = document.getElementById('formVoucherLinea');
  const lineaCuentaInput      = document.getElementById('linea_cuenta');
  const lineaCuentaNombreInput= document.getElementById('linea_cuenta_nombre');
  const lineaDebeInput        = document.getElementById('linea_debe');
  const lineaHaberInput       = document.getElementById('linea_haber');
  const lineaCodigoInput      = document.getElementById('linea_codigo');
  const lineaRazonSocialInput = document.getElementById('linea_razon_social');
  const lineaDocTipoSelect    = document.getElementById('linea_doc_tipo');
  const origenSelect          = document.getElementById('voucher_origen');

  // ── Actualizar número de voucher cuando cambian origen o fecha ────────────
  if (origenSelect) {
    origenSelect.addEventListener('change', () => {
      tributarioPendiente = null;
      _actualizarBotonTributario();
      actualizarNumeroVoucher();
    });
  }
  if (fechaInput) {
    fechaInput.addEventListener('change', actualizarNumeroVoucher);
  }
  _actualizarBotonTributario();

  // ── Actualizar totales (Debe / Haber) ─────────────────────────────────────
  function actualizarTotales() {
    let totalDebe = 0, totalHaber = 0;
    document.querySelectorAll('#tabla-voucher-detalle tr').forEach(tr => {
      totalDebe  += parseFloat(tr.cells[2].textContent) || 0;
      totalHaber += parseFloat(tr.cells[3].textContent) || 0;
    });
    document.getElementById('voucher_total_debe').textContent  = totalDebe.toFixed(2);
    document.getElementById('voucher_total_haber').textContent = totalHaber.toFixed(2);
    _actualizarBotonTributario();
  }

  // ── Selector de tipo de cambio con desplegable ────────────────────────────
  // Cuando la moneda es USD, muestra un desplegable con la lista de T/C
  // disponibles (fecha + compra o venta según el origen) para que el usuario
  // elija cuál quiere usar. Si la moneda es PEN → siempre 1.000.
  // ─────────────────────────────────────────────────────────────────────────
  const asistenteFechaDocInput = document.getElementById('asistente_fecha_doc');
  const asistenteMonedaSelect  = document.getElementById('asistente_moneda');
  const asistenteTcInput       = document.getElementById('asistente_tc');
  const lineaFechaDocInput     = document.getElementById('linea_fecha_doc');
  const lineaMonedaSelect      = document.getElementById('linea_moneda');
  const lineaTcInput           = document.getElementById('linea_tc');

  // Inyectar estilos del desplegable de T/C (una sola vez)
  if (!document.getElementById('tc-picker-styles')) {
    const st = document.createElement('style'); st.id = 'tc-picker-styles';
    st.textContent = `
      .tc-picker{position:fixed;z-index:2200;max-height:240px;overflow-y:auto;
        background:var(--bg-modal,#fff);border:1px solid var(--brd,#c0ccd8);border-radius:8px;
        box-shadow:0 12px 30px rgba(5,12,22,0.28);font-size:12px;min-width:260px;}
      .tc-picker-hdr{padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;
        color:var(--tx2,#5a7088);border-bottom:1px solid var(--brd-lt,#eef2f6);
        background:var(--bg-mftr,#f4f8fd);position:sticky;top:0;z-index:1;
        display:flex;justify-content:space-between;}
      .tc-picker-item{display:flex;align-items:center;gap:10px;padding:7px 10px;cursor:pointer;
        border-bottom:1px solid var(--brd-lt,#eef2f6);}
      .tc-picker-item:hover{background:var(--accent-lt,#e8f0fa);}
      .tc-picker-fecha{font-weight:600;color:var(--tx,#182433);min-width:80px;}
      .tc-picker-val{font-family:monospace;font-weight:700;font-size:13px;}
      .tc-picker-val.compra{color:var(--ok);}
      .tc-picker-val.venta{color:var(--err);}
      .tc-picker-tipo{font-size:9px;font-weight:700;text-transform:uppercase;
        color:#fff;border-radius:4px;padding:2px 6px;}
      .tc-picker-tipo.compra{background:var(--btn-ok);}
      .tc-picker-tipo.venta{background:var(--btn-err);}
      .tc-picker-empty{padding:12px;text-align:center;color:var(--tx3,#7898b0);font-style:italic;}
    `;
    document.head.appendChild(st);
  }

  function _getTipoTC() {
    const origen = document.getElementById('voucher_origen').value;
    return String(origen) === '8' ? 'compra' : 'venta';
  }

  function _showTCPicker(tcInput) {
    // Cerrar cualquier picker anterior
    document.querySelectorAll('.tc-picker').forEach(p => p.remove());

    const tipoTC = _getTipoTC();
    const label = tipoTC === 'compra' ? 'T.C. Compra' : 'T.C. Venta';

    window.api.getMonedas().then(monedas => {
      const usd = (monedas || []).filter(m => m.nombre === 'USD');
      if (!usd.length) {
        // Sin datos: no mostrar picker
        return;
      }

      const picker = document.createElement('div');
      picker.className = 'tc-picker';

      let html = `<div class="tc-picker-hdr"><span>${label}</span><span>Seleccione una fecha</span></div>`;

      if (usd.length === 0) {
        html += '<div class="tc-picker-empty">No hay tipos de cambio registrados.</div>';
      } else {
        html += usd.map(m => {
          const val = tipoTC === 'compra' ? (m.compra || m.tipo_cambio) : (m.venta || m.tipo_cambio);
          return `<div class="tc-picker-item" data-tc="${val.toFixed(3)}" data-fecha="${escapeAttr(m.fecha)}">
            <span class="tc-picker-fecha">${escapeHTML(m.fecha)}</span>
            <span class="tc-picker-tipo ${tipoTC}">${tipoTC}</span>
            <span class="tc-picker-val ${tipoTC}">${val.toFixed(3)}</span>
          </div>`;
        }).join('');
      }

      picker.innerHTML = html;
      document.body.appendChild(picker);

      // Posicionar debajo del input
      const rect = tcInput.getBoundingClientRect();
      picker.style.left = `${rect.left}px`;
      picker.style.top = `${rect.bottom + 2}px`;
      picker.style.width = `${Math.max(rect.width, 260)}px`;

      // Al elegir una opción
      picker.querySelectorAll('.tc-picker-item').forEach(item => {
        item.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          tcInput.value = item.dataset.tc;
          picker.remove();
        });
      });

      // Cerrar al perder foco
      const cerrar = () => setTimeout(() => picker.remove(), 180);
      tcInput.addEventListener('blur', cerrar, { once: true });
    });
  }

  // Al hacer clic o focus en el campo T/C cuando moneda es USD → mostrar picker
  function _attachTCPicker(tcEl, monedaEl) {
    tcEl.addEventListener('focus', () => {
      if (monedaEl.value === 'USD') _showTCPicker(tcEl);
    });
    tcEl.addEventListener('click', () => {
      if (monedaEl.value === 'USD') _showTCPicker(tcEl);
    });
  }

  _attachTCPicker(asistenteTcInput, asistenteMonedaSelect);
  _attachTCPicker(lineaTcInput, lineaMonedaSelect);

  // Cuando cambia la moneda: PEN → 1.000, USD → limpiar para que elija
  const handleMonedaChange = (monedaEl, tcEl) => {
    if (monedaEl.value === 'PEN') {
      tcEl.value = '1.000';
    } else if (monedaEl.value === 'USD') {
      tcEl.value = '';
      tcEl.placeholder = 'Seleccione...';
      _showTCPicker(tcEl);
    }
  };

  asistenteMonedaSelect.addEventListener('change', () => handleMonedaChange(asistenteMonedaSelect, asistenteTcInput));
  lineaMonedaSelect.addEventListener('change', () => handleMonedaChange(lineaMonedaSelect, lineaTcInput));

  // ── Borrar fila / editar fila ─────────────────────────────────────────────
  document.getElementById('tabla-voucher-detalle').addEventListener('click', (e) => {
    const btnDel = e.target.closest('.btn-eliminar-fila');
    if (btnDel) { btnDel.closest('tr').remove(); actualizarTotales(); return; }
    const btnEdit = e.target.closest('.btn-editar-fila');
    if (btnEdit) _editarFilaPreGuardado(btnEdit.closest('tr'));
  });
  document.getElementById('tabla-voucher-detalle').addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr'); if (tr) _editarFilaPreGuardado(tr);
  });

  function _editarFilaPreGuardado(tr) {
    if (!tr) return;
    const d = { cuenta:tr.cells[0].textContent.trim(), nombreCuenta:tr.cells[1].textContent.trim(),
      debe:tr.cells[2].textContent.trim(), haber:tr.cells[3].textContent.trim(),
      moneda:tr.cells[4].textContent.trim(), tc:tr.cells[5].textContent.trim(),
      docTipo:tr.cells[7].textContent.trim(), docNumero:tr.cells[8].textContent.trim(),
      fechaDoc:tr.cells[9].textContent.trim(), fechaVenc:tr.cells[10].textContent.trim(),
      codigo:tr.cells[11].textContent.trim(), razonSocial:tr.cells[12].textContent.trim(),
      glosa:tr.cells[13].textContent.trim() };
    (async()=>{
      try { const docs=await window.api.getDocumentos(); lineaDocTipoSelect.innerHTML='<option value="">-</option>';
        docs.forEach(doc=>{const o=document.createElement('option');o.value=doc.codigo;o.textContent=doc.codigo;lineaDocTipoSelect.appendChild(o);}); } catch(_){}
      lineaCuentaInput.value=d.cuenta; lineaCuentaNombreInput.value=d.nombreCuenta;
      lineaDebeInput.value=d.debe; lineaHaberInput.value=d.haber;
      document.getElementById('linea_moneda').value=d.moneda||'PEN';
      document.getElementById('linea_tc').value=d.tc||'1.000';
      lineaDocTipoSelect.value=d.docTipo;
      document.getElementById('linea_doc_numero').value=d.docNumero;
      document.getElementById('linea_fecha_doc').value=d.fechaDoc;
      document.getElementById('linea_fecha_venc').value=d.fechaVenc;
      lineaCodigoInput.value=d.codigo; lineaRazonSocialInput.value=d.razonSocial;
      document.getElementById('linea_glosa').value=d.glosa;
      formVoucherLinea._editTr=tr; modalVoucherLinea.style.display='flex'; lineaCuentaInput.focus();
    })();
  }

  // ── MODAL BUSCAR DOCUMENTOS PENDIENTES ─────────────────────────────────
  if(!document.getElementById('vch-pend-styles')){const ss=document.createElement('style');ss.id='vch-pend-styles';ss.textContent=`
    .vch-pend-overlay{position:fixed;inset:0;background:rgba(5,12,22,.72);z-index:1100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);}
    .vch-pend-box{background:var(--bg-modal,#fff);border-radius:6px;width:860px;max-width:92%;max-height:85vh;box-shadow:var(--shd-modal);border:1px solid var(--brd);overflow:hidden;display:flex;flex-direction:column;}
    .vch-pend-hdr{background:var(--bg-mhdr,#223247);padding:14px 20px;border-bottom:2px solid var(--sb-active,#2f6f8f);display:flex;justify-content:space-between;align-items:center;}
    .vch-pend-hdr h3{margin:0;color:var(--modal-title);font-size:15px;font-weight:700;display:flex;align-items:center;gap:10px;}
    .vch-pend-body{padding:14px 20px;overflow-y:auto;flex:1;}
    .vch-pend-filter{display:flex;gap:10px;margin-bottom:12px;align-items:flex-end;flex-wrap:wrap;}
    .vch-pend-filter input,.vch-pend-filter select{padding:6px 10px;font-size:12px;border:1px solid var(--brd-in,#c0ccd8);border-radius:4px;background:var(--bg-input,#fff);}
    .vch-pend-filter label{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl,#5a7088);display:block;margin-bottom:4px;}
    .vch-pend-tbl{width:100%;border-collapse:collapse;font-size:11px;}
    .vch-pend-tbl thead th{background:var(--bg-th);color:var(--tx-th);font-size:10px;font-weight:700;text-transform:uppercase;padding:7px 8px;position:sticky;top:0;}
    .vch-pend-tbl tbody td{padding:6px 8px;border-bottom:1px solid var(--brd-lt,#eef2f6);}
    .vch-pend-tbl tbody tr{cursor:pointer;} .vch-pend-tbl tbody tr:hover{background:var(--accent-lt,#e8f0fa);}
    .vch-pend-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;}
    .vch-pend-badge.cxc{background:rgba(var(--accent-rgb),.12);color:var(--accent);}
    .vch-pend-badge.cxp{background:rgba(var(--warn-rgb),.12);color:var(--warn);}
    .vch-pend-ftr{padding:10px 20px;border-top:1px solid var(--brd);background:var(--bg-mftr,#f4f8fd);display:flex;justify-content:flex-end;}`;
    document.head.appendChild(ss);}

  function _abrirBusquedaPendientes(targetFields){
    const ov=document.createElement('div');ov.className='vch-pend-overlay';
    ov.innerHTML=`<div class="vch-pend-box"><div class="vch-pend-hdr"><h3><i class="fa-solid fa-file-circle-exclamation" style="color:var(--sb-text);"></i> Documentos Pendientes</h3><button type="button" class="vch-pend-close" style="background:transparent;border:none;font-size:16px;color:var(--sb-sub);cursor:pointer;"><i class="fa-solid fa-times"></i></button></div><div class="vch-pend-body"><div style="font-size:11px;color:var(--tx3);margin-bottom:10px;">Comprobantes con saldo pendiente: compras sin pagar y ventas sin cobrar.</div><div class="vch-pend-filter"><div><label>Buscar</label><input type="text" id="vch-pend-term" placeholder="N° factura, RUC, razón social..." style="width:220px;"></div><div><label>Tipo</label><select id="vch-pend-tipo"><option value="">Todos</option><option value="COMPRA">Por pagar</option><option value="VENTA">Por cobrar</option></select></div><button id="vch-pend-btn" style="padding:6px 14px;background:var(--btn-primary);color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;"><i class="fa-solid fa-search"></i> Buscar</button></div><div style="max-height:400px;overflow-y:auto;"><table class="vch-pend-tbl"><thead><tr><th>Tipo</th><th>Comprobante</th><th>Fecha</th><th>RUC/DNI</th><th>Razón Social</th><th style="text-align:right">Saldo Pend.</th><th>Venc.</th></tr></thead><tbody id="vch-pend-results"><tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px;">Presione Buscar</td></tr></tbody></table></div></div><div class="vch-pend-ftr"><button type="button" class="vch-pend-close" style="background:var(--bg-ro);color:var(--tx2);border:1px solid var(--brd-in);padding:7px 16px;border-radius:3px;font-weight:600;cursor:pointer;">Cerrar</button></div></div>`;
    document.body.appendChild(ov);
    const cerrar=()=>ov.remove();
    ov.querySelectorAll('.vch-pend-close').forEach(b=>b.addEventListener('click',cerrar));
    ov.addEventListener('click',e=>{if(e.target===ov)cerrar();});
    const tbody=ov.querySelector('#vch-pend-results'),termIn=ov.querySelector('#vch-pend-term'),tipoSel=ov.querySelector('#vch-pend-tipo');
    const buscar=async()=>{
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
      try{const r=await window.api.getDocumentosPendientes({tipo:tipoSel.value,termino:termIn.value.trim()});
        if(!r.success||!r.documentos.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--tx3);padding:20px;">No hay documentos pendientes.</td></tr>';return;}
        tbody.innerHTML=r.documentos.map(d=>`<tr data-doc-tipo="${escapeAttr(d.doc_tipo||'')}" data-doc-numero="${escapeAttr(d.doc_numero||'')}" data-fecha-doc="${escapeAttr(d.fecha_doc||'')}" data-fecha-venc="${escapeAttr(d.fecha_venc||'')}" data-codigo="${escapeAttr(d.codigo||'')}" data-razon="${escapeAttr(d.razon_social||'')}"><td><span class="vch-pend-badge ${d.tipo_cxc==='CXC'?'cxc':'cxp'}">${d.tipo_cxc==='CXC'?'Por cobrar':'Por pagar'}</span></td><td style="font-weight:600;color:var(--accent);">${escapeHTML(d.doc_tipo?d.doc_tipo+' ':'')}${escapeHTML(d.doc_numero||'—')}</td><td>${escapeHTML(d.fecha_doc||'—')}</td><td>${escapeHTML(d.codigo||'')}</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(d.razon_social||'—')}</td><td style="text-align:right;font-weight:700;color:${d.tipo_cxc==='CXC'?'var(--accent)':'var(--warn)'};">S/ ${Number(d.saldo_pendiente||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</td><td>${escapeHTML(d.fecha_venc||'—')}</td></tr>`).join('');
        tbody.querySelectorAll('tr').forEach(row=>{row.addEventListener('click',()=>{
          if(targetFields.docTipo)targetFields.docTipo.value=row.dataset.docTipo;
          if(targetFields.docNumero)targetFields.docNumero.value=row.dataset.docNumero;
          if(targetFields.fechaDoc)targetFields.fechaDoc.value=row.dataset.fechaDoc;
          if(targetFields.fechaVenc)targetFields.fechaVenc.value=row.dataset.fechaVenc;
          if(targetFields.codigo)targetFields.codigo.value=row.dataset.codigo;
          if(targetFields.razonSocial)targetFields.razonSocial.value=row.dataset.razon;
          cerrar();});});
      }catch(err){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--err);">${escapeHTML(err?.message || err)}</td></tr>`;}};
    ov.querySelector('#vch-pend-btn').addEventListener('click',buscar);
    termIn.addEventListener('keydown',e=>{if(e.key==='Enter')buscar();});
    setTimeout(()=>{buscar();termIn.focus();},100);
  }

  if(formVoucherLinea){const b=document.createElement('button');b.type='button';b.innerHTML='<i class="fa-solid fa-file-circle-exclamation"></i> Buscar Doc. Pendiente';b.style.cssText='background:var(--bg-mhdr);color:#fff;border:none;padding:6px 14px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px;display:inline-flex;align-items:center;gap:6px;';b.addEventListener('click',()=>{_abrirBusquedaPendientes({docTipo:lineaDocTipoSelect,docNumero:document.getElementById('linea_doc_numero'),fechaDoc:document.getElementById('linea_fecha_doc'),fechaVenc:document.getElementById('linea_fecha_venc'),codigo:lineaCodigoInput,razonSocial:lineaRazonSocialInput});});formVoucherLinea.prepend(b);}
  const fAE=document.getElementById('formVoucherAsistente');
  if(fAE){const b=document.createElement('button');b.type='button';b.innerHTML='<i class="fa-solid fa-file-circle-exclamation"></i> Buscar Doc. Pendiente';b.style.cssText='background:var(--bg-mhdr);color:#fff;border:none;padding:6px 14px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px;display:inline-flex;align-items:center;gap:6px;';b.addEventListener('click',()=>{_abrirBusquedaPendientes({docTipo:document.getElementById('asistente_doc_tipo'),docNumero:document.getElementById('asistente_doc_numero'),fechaDoc:document.getElementById('asistente_fecha_doc'),fechaVenc:document.getElementById('asistente_fecha_venc'),codigo:document.getElementById('asistente_codigo'),razonSocial:document.getElementById('asistente_razon_social')});});fAE.prepend(b);}

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL ASISTENTE: abrir, cerrar
  // ─────────────────────────────────────────────────────────────────────────
  if (btnAsistente && modalAsistente) {
    btnAsistente.addEventListener('click', () => {
      const origen = document.getElementById('voucher_origen').value;
      const fecha  = document.getElementById('voucher_fecha').value;

      if (!origen || !fecha) {
        return alert("Por favor, complete el Origen del asiento y la Fecha contable antes de usar el Asistente.");
      }

      (async () => {
        try {
          const estadoEmpresa = await window.api.getEmpresaEstado();
          if (!estadoEmpresa?.connected) throw new Error('No hay ninguna empresa seleccionada.');

          const selectDoc = document.getElementById('asistente_doc_tipo');
          const documentos = await window.api.getDocumentos();
          selectDoc.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';
          documentos.forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc.codigo; opt.textContent = doc.codigo;
            selectDoc.appendChild(opt);
          });

          const lineas = leerDetallesDesdeTabla();
          const aplica = ['8','14'].includes(origen);
          const solo = aplica && lineas.length > 0;
          document.getElementById('asistente-modo-datos').hidden = !solo;
          soloDatosInput.checked = solo;
          const primero = lineas.find(d=>d.doc_numero) || lineas[0];
          const campos = {asistente_doc_tipo:'doc_tipo',asistente_doc_numero:'doc_numero',asistente_codigo:'codigo',asistente_razon_social:'razon_social',asistente_moneda:'moneda',asistente_tc:'tc',asistente_fecha_doc:'fecha_doc',asistente_fecha_venc:'fecha_venc',asistente_glosa:'glosa'};
          for (const [id,k] of Object.entries(campos)) {
            const input=document.getElementById(id);
            input.disabled=solo;
            if(solo && primero) input.value=primero[k] || (k==='moneda'?'PEN':k==='tc'?1:'');
          }
          document.getElementById('asistente_glosa').required=!solo;
          document.getElementById('asistente_cuenta').required=!solo;
          document.getElementById('asistente_cuenta').disabled=solo;
          document.querySelector('#formVoucherAsistente button[type="submit"]').textContent = solo ? 'Completar comprobante del borrador' : 'Generar Asiento';
          _renderDatosEspecialesAsistente();
          if (!solo) asistenteFechaDocInput.value = fecha;
          modalAsistente.style.display = 'flex';
          if (!solo) asistenteFechaDocInput.dispatchEvent(new Event('change'));
          updateIgvAndTotal();
        } catch (error) {
          alert("Acción denegada: No hay ninguna empresa seleccionada.");
        }
      })();
    });
  }

  const cerrarAsistente = () => { if (modalAsistente) modalAsistente.style.display = 'none'; };
  document.getElementById('btnCerrarModalAsistente')?.addEventListener('click', cerrarAsistente);
  document.getElementById('btnCerrarModalAsistenteX')?.addEventListener('click', cerrarAsistente);

  // ─────────────────────────────────────────────────────────────────────────
  // ASISTENTE: cálculos IGV
  // ─────────────────────────────────────────────────────────────────────────
  const inputBase  = document.getElementById('asistente_base');
  const inputIgv   = document.getElementById('asistente_igv');
  const inputTotal = document.getElementById('asistente_total');
  const asistenteAfectacionSelect = document.getElementById('asistente_afectacion');
  const asistenteTasaIgvInput = document.getElementById('asistente_tasa_igv');

  const updateIgvAndTotal = () => {
    const manual = document.getElementById('asistente-desglose-manual')?.checked;
    if (inputBase) { inputBase.required=!manual; inputBase.disabled=!!manual; inputBase.closest('div').hidden=!!manual; }
    if (inputIgv) { inputIgv.disabled=!!manual; inputIgv.closest('div').hidden=!!manual; }
    if (inputTotal) inputTotal.readOnly=true;
    document.getElementById('asistente-desglose-campos')?.toggleAttribute('hidden', !manual);
    if (manual) {
      const valores=[...document.querySelectorAll('#asistente-datos-especiales [data-at]')].map(i=>Number(i.value||0));
      inputTotal.value=valores.every(Number.isFinite)?valores.reduce((a,b)=>a+b,0).toFixed(2):'';
      return;
    }
    const base = parseFloat(inputBase?.value) || 0;
    const tasa = Math.max(0, parseFloat(asistenteTasaIgvInput?.value) || 0);
    let igv = 0, total = base;
    // La tasa ya no está fijada en 18% en código: el usuario puede indicar la
    // tasa que legalmente corresponda a su operación. Exonerado/Inafecto/Exportación no generan IGV.
    if (asistenteAfectacionSelect?.value === 'GRAVADO') { igv = base * (tasa / 100); total = base + igv; }
    if (inputIgv)   inputIgv.value   = igv.toFixed(2);
    if (inputTotal) inputTotal.value = total.toFixed(2);
  };

  const grupoCompraSelect = document.getElementById('asistente_grupo_compra');
  const actualizarGrupoCompra = () => {
    const compra = document.getElementById('voucher_origen')?.value === '8';
    document.getElementById('asistente-grupo-compra')?.toggleAttribute('hidden', !compra || asistenteAfectacionSelect?.value !== 'GRAVADO');
  };
  document.getElementById('voucher_origen')?.addEventListener('change', actualizarGrupoCompra);
  asistenteAfectacionSelect?.addEventListener('change', actualizarGrupoCompra);
  actualizarGrupoCompra();
  document.getElementById('asistente-datos-especiales').addEventListener('input', updateIgvAndTotal);
  document.getElementById('asistente-datos-especiales').addEventListener('change', updateIgvAndTotal);
  inputBase?.addEventListener('input', updateIgvAndTotal);
  asistenteAfectacionSelect?.addEventListener('change', updateIgvAndTotal);
  asistenteTasaIgvInput?.addEventListener('input', updateIgvAndTotal);
  updateIgvAndTotal();

  // ─────────────────────────────────────────────────────────────────────────
  // ASISTENTE: autocompletar cuenta y razón social
  // ─────────────────────────────────────────────────────────────────────────
  const inputCuenta     = document.getElementById('asistente_cuenta');
  const inputNombreCuenta = document.getElementById('asistente_cuenta_nombre');

  attachCuentaAutocomplete(inputCuenta, inputNombreCuenta);

  inputCuenta?.addEventListener('blur', async (e) => {
    const val = e.target.value.trim();
    if (!val) { inputNombreCuenta.value = ''; return; }
    const cuentas = await window.api.getPlanCuentas();
    const found = cuentas.find(c => String(c.codigo) === val);
    inputNombreCuenta.value = found ? found.descripcion : 'Cuenta no encontrada';

    // Preseleccionar el Tipo de Documento configurado en el amarre que calce.
    try {
      const amarres = await window.api.getAmarres() || [];
      const amarre = amarres
        .filter(a => Number(a.activo) === 1 && a.prefijo && val.startsWith(String(a.prefijo)))
        .sort((a, b) => String(b.prefijo).length - String(a.prefijo).length)[0];
      if (amarre && amarre.doc_tipo) {
        const selDoc = document.getElementById('asistente_doc_tipo');
        // Sólo preseleccionar si esa opción existe en el combo de documentos
        if (selDoc && [...selDoc.options].some(o => o.value === String(amarre.doc_tipo))) {
          selDoc.value = String(amarre.doc_tipo);
        }
      }
    } catch (_) { /* sin amarres, no pasa nada */ }
  });

  const inputCodigo     = document.getElementById('asistente_codigo');
  const inputRazonSocial= document.getElementById('asistente_razon_social');

  attachEntidadAutocomplete(inputCodigo, inputRazonSocial);

  inputCodigo?.addEventListener('blur', async (e) => {
    const val = e.target.value.trim();
    if (val.length < 8) { inputRazonSocial.value = ''; return; }
    const entidades = await window.api.getEntidades();
    const found = entidades.find(ent => String(ent.codigo) === val);
    inputRazonSocial.value = found ? found.razon_social : 'Entidad no encontrada';
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ASISTENTE: submit → genera las filas del asiento
  // ─────────────────────────────────────────────────────────────────────────
  const formAsistente = document.getElementById('formVoucherAsistente');
  if (formAsistente) {
    formAsistente.addEventListener('submit', async (e) => {
      e.preventDefault();

      const cuenta      = document.getElementById('asistente_cuenta').value.trim();
      const nombreCuenta= document.getElementById('asistente_cuenta_nombre').value;
      let base          = parseFloat(document.getElementById('asistente_base').value)  || 0;
      let igv           = parseFloat(inputIgv.value)   || 0;
      let total         = parseFloat(inputTotal.value) || 0;
      const moneda      = document.getElementById('asistente_moneda').value;
      const tc          = parseFloat(document.getElementById('asistente_tc').value)    || 1;
      const docTipo     = document.getElementById('asistente_doc_tipo').value;
      const docNumero   = document.getElementById('asistente_doc_numero').value;
      const fechaDoc    = document.getElementById('asistente_fecha_doc').value;
      const fechaVenc   = document.getElementById('asistente_fecha_venc').value;
      const codigo      = document.getElementById('asistente_codigo').value;
      const razonSocial = document.getElementById('asistente_razon_social').value;
      const glosa       = document.getElementById('asistente_glosa').value;
      const afectacion  = document.getElementById('asistente_afectacion')?.value || 'GRAVADO';
      const tbody       = document.getElementById('tabla-voucher-detalle');

      const origenActual = String(document.getElementById('voucher_origen').value);
      const aplicaTrib = ['8','14'].includes(origenActual);
      const tributarioNuevo = aplicaTrib ? _leerTributarioAsistente() : null;
      if (tributarioNuevo) {
        const estado=evaluarDetalleTributario(tributarioNuevo);
        if(!estado.ok) return alert(estado.texto);
        if(!docTipo || !docNumero.trim()) return alert('Complete tipo y número del comprobante.');
      }
      if (aplicaTrib && soloDatosInput.checked) {
        const lineas=leerDetallesDesdeTabla();
        const documentos=new Set(lineas.filter(d=>d.doc_numero&&d.doc_numero!=='-').map(d=>[d.doc_tipo,d.doc_numero.toUpperCase(),d.codigo].join('|')));
        if(documentos.size>1) return alert('Complete un comprobante por voucher. Separe los documentos antes de continuar.');
        const estado=_evaluarTributarioBorrador(tributarioNuevo);
        if(!estado.ok) return alert(estado.texto);
        tributarioPendiente=tributarioNuevo;
        _actualizarBotonTributario(); cerrarAsistente(); return;
      }
      if (!validarCuentaContable(cuenta)) return;
      if (aplicaTrib && tbody.children.length) return alert('El borrador ya contiene líneas. Complete sus datos con el Asistente o empiece un voucher nuevo para generar otro asiento.');

      let invertir = false;
      if (tributarioNuevo) {
        const d = tributarioNuevo.venta || tributarioNuevo.compra;
        invertir = d.importe_total < 0;
        total = Math.abs(d.importe_total);
        igv = Math.abs(tributarioNuevo.venta ? Number(d.igv||0)+Number(d.descuento_igv||0) : Number(d.g1_igv||0)+Number(d.g2_igv||0)+Number(d.g3_igv||0));
        if (igv > total) return alert('El IGV no puede superar el total del comprobante.');
        base = total - igv;
      }
      // Genera una fila de la tabla a partir de cuenta/monto
      const crearFila = (acc, accName, debe, haber) => {
        if (invertir) [debe,haber] = [haber,debe];
        const tr = document.createElement('tr');
        const equiv = (debe > 0 ? debe : haber) * tc;
        const estiloTd = 'padding:6px 10px;font-size:12px;border-bottom:1px solid var(--border-light,#dde5ef);';
        tr.innerHTML = `
          <td style="${estiloTd}">${escapeHTML(acc)}</td>
          <td style="${estiloTd}">${escapeHTML(accName)}</td>
          <td class="col-debe"  style="${estiloTd}text-align:right;">${debe.toFixed(2)}</td>
          <td class="col-haber" style="${estiloTd}text-align:right;">${haber.toFixed(2)}</td>
          <td style="${estiloTd}">${escapeHTML(moneda)}</td>
          <td style="${estiloTd}">${tc.toFixed(3)}</td>
          <td style="${estiloTd}text-align:right;">${equiv.toFixed(2)}</td>
          <td style="${estiloTd}">${escapeHTML(docTipo)}</td>
          <td style="${estiloTd}">${escapeHTML(docNumero)}</td>
          <td style="display:none;">${escapeHTML(fechaDoc)}</td>
          <td style="display:none;">${escapeHTML(fechaVenc)}</td>
          <td style="${estiloTd}">${escapeHTML(codigo)}</td>
          <td style="${estiloTd}">${escapeHTML(razonSocial)}</td>
          <td style="${estiloTd}">${escapeHTML(glosa)}</td>
          <td style="${estiloTd}text-align:center;">
            <button type="button" class="btn-eliminar-fila"
              style="background:transparent;border:none;color:var(--danger,#a0444f);cursor:pointer;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        `;
        return tr;
      };

      // ── Buscar el AMARRE configurado que coincide con la cuenta ingresada ──
      // Los amarres se definen en "Tablas → Amarres del Asistente". Se elige el
      // amarre ACTIVO cuyo prefijo calce con el inicio de la cuenta; si varios
      // calzan, gana el prefijo más largo (el más específico).
      let amarres = [];
      try { amarres = await window.api.getAmarres() || []; } catch (_) { amarres = []; }

      const amarre = amarres
        .filter(a => Number(a.activo) === 1 && a.prefijo && cuenta.startsWith(String(a.prefijo)))
        .sort((a, b) => String(b.prefijo).length - String(a.prefijo).length)[0];

      if (aplicaTrib && (!amarre || (origenActual==='8' ? 'COMPRA' : 'VENTA') !== amarre.tipo)) {
        return alert('Configure un amarre de Compra/Venta para esta cuenta en Tablas → Amarres del Asistente.');
      }
      if (amarre) {
        const allCuentas = await window.api.getPlanCuentas();
        const nombreDe = (cod, fallback) => {
          const c = allCuentas.find(x => String(x.codigo) === String(cod));
          return c ? c.descripcion : fallback;
        };
        // La cuenta de IGV se elige según la AFECTACIÓN seleccionada:
        //   GRAVADO   → cuenta_igv      (usa la tasa ingresada y genera línea de IGV)
        //   EXONERADO → cuenta_igv_exo
        //   INAFECTO  → cuenta_igv_ina
        const cuentaIgvAmarre =
          afectacion === 'EXONERADO' ? amarre.cuenta_igv_exo :
          afectacion === 'INAFECTO'  ? amarre.cuenta_igv_ina  :
                                       amarre.cuenta_igv;
        // La línea de IGV sólo se crea si HAY IGV (> 0) y hay una cuenta configurada
        // para esa afectación. Si está exonerado/inafecto (igv = 0) NO se genera la
        // línea de la cuenta 40 → se evita la fila en blanco.
        if (aplicaTrib && igv > 0 && !cuentaIgvAmarre) return alert('Configure la cuenta de IGV del amarre antes de generar el asiento.');
        const aplicaIgv  = igv > 0 && !!cuentaIgvAmarre;
        const nomIgv     = nombreDe(cuentaIgvAmarre,       'IGV');
        const nomDestino = nombreDe(amarre.cuenta_destino, 'CUENTA DESTINO');

        if (amarre.tipo === 'VENTA') {
          // VENTA: destino (por cobrar) al DEBE por el total · IGV al HABER · ingreso al HABER por la base
          tbody.appendChild(crearFila(amarre.cuenta_destino, nomDestino, total, 0));
          if (aplicaIgv) tbody.appendChild(crearFila(cuentaIgvAmarre, nomIgv, 0, igv));
          tbody.appendChild(crearFila(cuenta, nombreCuenta, 0, base));
        } else {
          // COMPRA: gasto al DEBE por la base · IGV al DEBE · destino (por pagar) al HABER por el total
          tbody.appendChild(crearFila(cuenta, nombreCuenta, base, 0));
          if (aplicaIgv) tbody.appendChild(crearFila(cuentaIgvAmarre, nomIgv, igv, 0));
          tbody.appendChild(crearFila(amarre.cuenta_destino, nomDestino, 0, total));
        }

      // Sin amarre que calce → una sola línea genérica en DEBE
      } else {
        tbody.appendChild(crearFila(cuenta, nombreCuenta, base, 0));
      }

      tributarioPendiente = tributarioNuevo;
      _actualizarBotonTributario();

      actualizarTotales();
      modalAsistente.style.display = 'none';
      formAsistente.reset();
      if (asistenteAfectacionSelect) asistenteAfectacionSelect.value = 'GRAVADO';
      updateIgvAndTotal();
      actualizarNumeroVoucher(); // el período/número ahora refleja la FECHA DOC
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GUARDAR VOUCHER EN BASE DE DATOS
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Valida empresa conectada
  // 2. Valida cabecera (Origen, Fecha)
  // 3. Valida que haya líneas
  // 4. Valida cuadre (Debe == Haber)
  // 5. Envía al backend; el número de voucher lo asigna el servidor
  // 6. Muestra el número asignado y limpia el formulario
  // ─────────────────────────────────────────────────────────────────────────
  const btnGuardarVoucher = document.getElementById('btnGuardarVoucher');
  if (btnGuardarVoucher) {
    btnGuardarVoucher.addEventListener('click', async () => {

      // 1. Verificar empresa conectada mediante el estado explícito del backend
      try {
        const estadoEmpresa = await window.api.getEmpresaEstado();
        if (!estadoEmpresa?.connected) throw new Error('No hay ninguna empresa seleccionada.');
      } catch (error) {
        return alert("Acción denegada: No hay ninguna empresa seleccionada.");
      }

      // 2. Validar cabecera
      const origen = document.getElementById('voucher_origen').value;
      const fecha  = document.getElementById('voucher_fecha').value;

      if (!origen) return alert("Seleccione el Origen del asiento antes de guardar.");
      if (!fecha)  return alert("Ingrese la Fecha contable antes de guardar.");

      // 3. Validar líneas
      const detalles = leerDetallesDesdeTabla();
      if (detalles.length === 0) {
        return alert("El voucher debe tener al menos una línea de detalle.");
      }

      // 4. Validar cuadre contable
      const totalDebe  = detalles.reduce((s, d) => s + d.debe,  0);
      const totalHaber = detalles.reduce((s, d) => s + d.haber, 0);
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        return alert(
          `El asiento no está cuadrado.\nDebe: ${totalDebe.toFixed(2)} | Haber: ${totalHaber.toFixed(2)}\n` +
          `Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}`
        );
      }

      if ((String(origen) === '8' || String(origen) === '14') && tributarioPendiente) {
        const estadoTrib = _evaluarTributarioBorrador(tributarioPendiente, Math.max(Math.abs(totalDebe),Math.abs(totalHaber)));
        if (!estadoTrib.ok) {
          alert(estadoTrib.estado === 'DIFERENCIA'
            ? 'Revise Datos tributarios: el importe total tributario no coincide con el total del asiento.'
            : 'Los Datos tributarios están incompletos. Complete al menos una base, importe o impuesto además del total.');
          btnAsistente.click();
          return;
        }
      }
      if ((String(origen) === '8' || String(origen) === '14') && !tributarioPendiente) {
        const continuar = confirm('Este comprobante aún no tiene datos tributarios detallados. Puede completarlos ahora con el Asistente, o guardarlo pendiente y completarlos después en Editar Registros. Si continúa, los reportes usarán una clasificación inferida. ¿Guardar pendiente?');
        if (!continuar) return;
      }

      // 5. Deshabilitar botón para evitar doble envío
      btnGuardarVoucher.disabled = true;
      btnGuardarVoucher.textContent = 'Guardando...';

      try {
        const result = await window.api.addVoucher({
          origen,
          fechaContable: fecha,
          periodo: _periodoTrabajo(),
          glosa: `Asiento ${origen} - ${fecha}`,
          detalles,
          tributario: tributarioPendiente
        });

        if (result.success) {
          // 6. Éxito: mostrar número asignado y limpiar
          mostrarToast({
            mensaje: `Voucher guardado correctamente. Número asignado: ${result.numero_voucher}`,
            tipo: 'success'
          });
          limpiarFormularioVoucher();
          // Actualizar el número estimado del siguiente voucher
          await actualizarNumeroVoucher();
        } else {
          mostrarToast({ mensaje: `Error al guardar: ${result.error}`, tipo: 'error', duracion: 6000 });
        }
      } catch (err) {
        mostrarToast({ mensaje: `Error inesperado: ${err.message}`, tipo: 'error', duracion: 6000 });
      } finally {
        // Restaurar botón siempre
        btnGuardarVoucher.disabled = false;
        btnGuardarVoucher.innerHTML = '<i class="fa-solid fa-save"></i> Guardar Asiento';
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL AGREGAR LÍNEA: abrir, cerrar, submit
  // ─────────────────────────────────────────────────────────────────────────
  if (btnVoucherAgregarLinea) {

    // Abrir modal de línea
    btnVoucherAgregarLinea.addEventListener('click', async () => {
      const origen = document.getElementById('voucher_origen').value;
      const fecha  = document.getElementById('voucher_fecha').value;

      if (!origen || !fecha) {
        return alert("Complete el Origen del asiento y la Fecha contable antes de agregar una línea.");
      }

      // Poblar tipos de documento
      try {
        const documentos = await window.api.getDocumentos();
        lineaDocTipoSelect.innerHTML = '<option value="">-</option>';
        documentos.forEach(doc => {
          const opt = document.createElement('option');
          opt.value = doc.codigo; opt.textContent = doc.codigo;
          lineaDocTipoSelect.appendChild(opt);
        });
      } catch (err) {
        console.error('Error al cargar tipos de documentos:', err);
      }

      formVoucherLinea.reset();
      formVoucherLinea._editTr = null;

      // Pre-llenar con datos de la línea anterior
      if (lastLineData) {
        document.getElementById('linea_fecha_doc').value  = lastLineData.fecha_doc;
        document.getElementById('linea_fecha_venc').value = lastLineData.fecha_venc;
        lineaDocTipoSelect.value = lastLineData.doc_tipo;
        document.getElementById('linea_doc_numero').value = lastLineData.doc_numero;
        document.getElementById('linea_codigo').value     = lastLineData.codigo;
        document.getElementById('linea_razon_social').value = lastLineData.razon_social;
        document.getElementById('linea_moneda').value     = lastLineData.moneda;
        document.getElementById('linea_tc').value         = lastLineData.tc.toFixed(3);
        document.getElementById('linea_glosa').value      = lastLineData.glosa;
      } else {
        document.getElementById('linea_fecha_doc').value  = fecha;
      }

      modalVoucherLinea.style.display = 'flex';
      lineaCuentaInput.focus();
      document.getElementById('linea_fecha_doc').dispatchEvent(new Event('change'));
    });

    // Cerrar modal
    const cerrarLinea = () => { modalVoucherLinea.style.display = 'none'; };
    btnCerrarModalLinea.addEventListener('click', cerrarLinea);
    document.getElementById('btnCerrarModalLineaX')?.addEventListener('click', cerrarLinea);

    // Submit: agregar fila a la tabla
    formVoucherLinea.addEventListener('submit', (e) => {
      e.preventDefault();

      const cuenta      = lineaCuentaInput.value.trim();
      const nombreCuenta= lineaCuentaNombreInput.value.trim();
      const debe        = parseFloat(lineaDebeInput.value)  || 0;
      const haber       = parseFloat(lineaHaberInput.value) || 0;
      const moneda      = document.getElementById('linea_moneda').value;
      const tc          = parseFloat(document.getElementById('linea_tc').value) || 1;
      const docTipo     = lineaDocTipoSelect.value;
      const docNumero   = document.getElementById('linea_doc_numero').value.trim();
      const fechaDoc    = document.getElementById('linea_fecha_doc').value;
      const fechaVenc   = document.getElementById('linea_fecha_venc').value;
      const codigo      = lineaCodigoInput.value.trim();
      const razonSocial = lineaRazonSocialInput.value.trim();
      const glosa       = document.getElementById('linea_glosa').value.trim();

      if (!cuenta || (debe === 0 && haber === 0)) {
        return alert('Ingrese una cuenta y un monto en Debe o Haber.');
      }
      if (!validarCuentaContable(cuenta)) return;
      if (debe > 0 && haber > 0) {
        return alert('Un asiento no puede tener montos en Debe y Haber simultáneamente.');
      }

      // Guardar para pre-llenar la próxima línea
      lastLineData = { fecha_doc: fechaDoc, fecha_venc: fechaVenc, doc_tipo: docTipo,
                       doc_numero: docNumero, codigo, razon_social: razonSocial,
                       moneda, tc, glosa };

      const equivalente = moneda === 'PEN' ? (debe + haber) : (debe + haber) * tc;
      const estiloTd    = 'padding:6px 10px;font-size:12px;border-bottom:1px solid var(--brd);';
      const tr          = document.createElement('tr');
      tr.innerHTML = `
        <td style="${estiloTd}">${escapeHTML(cuenta)}</td>
        <td style="${estiloTd}">${escapeHTML(nombreCuenta)}</td>
        <td class="col-debe"  style="${estiloTd}text-align:right;">${debe.toFixed(2)}</td>
        <td class="col-haber" style="${estiloTd}text-align:right;">${haber.toFixed(2)}</td>
        <td style="${estiloTd}">${escapeHTML(moneda)}</td>
        <td style="${estiloTd}">${tc.toFixed(3)}</td>
        <td style="${estiloTd}text-align:right;">${equivalente.toFixed(2)}</td>
        <td style="${estiloTd}">${escapeHTML(docTipo)}</td>
        <td style="${estiloTd}">${escapeHTML(docNumero)}</td>
        <td style="display:none;">${escapeHTML(fechaDoc)}</td>
        <td style="display:none;">${escapeHTML(fechaVenc)}</td>
        <td style="${estiloTd}">${escapeHTML(codigo)}</td>
        <td style="${estiloTd}">${escapeHTML(razonSocial)}</td>
        <td style="${estiloTd}">${escapeHTML(glosa)}</td>
        <td style="${estiloTd}text-align:center;">
          <button type="button" class="btn-editar-fila"
            style="background:transparent;border:none;color:var(--accent,#2f6f8f);cursor:pointer;margin-right:2px;" title="Editar">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <button type="button" class="btn-eliminar-fila"
            style="background:transparent;border:none;color:var(--danger,#a0444f);cursor:pointer;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;
      if (formVoucherLinea._editTr) {
        formVoucherLinea._editTr.replaceWith(tr);
        formVoucherLinea._editTr = null;
      } else {
        document.getElementById('tabla-voucher-detalle').appendChild(tr);
      }
      actualizarTotales();
      actualizarNumeroVoucher(); // el período/número ahora refleja la FECHA DOC
      modalVoucherLinea.style.display = 'none';
    });

    // Autocompletar nombre de cuenta
    attachCuentaAutocomplete(lineaCuentaInput, lineaCuentaNombreInput);

    lineaCuentaInput.addEventListener('blur', async (e) => {
      const val = e.target.value.trim();
      if (!val) { lineaCuentaNombreInput.value = ''; return; }
      const cuentas = await window.api.getPlanCuentas();
      const found = cuentas.find(c => String(c.codigo) === val);
      lineaCuentaNombreInput.value = found ? found.descripcion : 'Cuenta no encontrada';
    });

    // Autocompletar razón social
    attachEntidadAutocomplete(lineaCodigoInput, lineaRazonSocialInput);

    lineaCodigoInput.addEventListener('blur', async (e) => {
      const val = e.target.value.trim();
      if (!val) { lineaRazonSocialInput.value = ''; return; }
      const entidades = await window.api.getEntidades();
      const found = entidades.find(ent => String(ent.codigo) === val);
      lineaRazonSocialInput.value = found ? found.razon_social : 'Entidad no encontrada';
    });

    // Sincronizar Debe ↔ Haber (solo uno puede tener valor)
    lineaDebeInput.addEventListener('input', () => {
      if (parseFloat(lineaDebeInput.value) > 0) lineaHaberInput.value = '0.00';
    });
    lineaHaberInput.addEventListener('input', () => {
      if (parseFloat(lineaHaberInput.value) > 0) lineaDebeInput.value = '0.00';
    });
  }
}
