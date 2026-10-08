import { escapeHTML, escapeAttr } from '../utils/security.js';
'use strict';

const CATEGORIAS_ESF = [
  { value:'ACTIVO_CORRIENTE', label:'Activo Corriente', icon:'fa-building', color:'var(--ok)', background:'rgba(var(--ok-rgb),.08)' },
  { value:'ACTIVO_NO_CORRIENTE', label:'Activo No Corriente', icon:'fa-city', color:'var(--accent)', background:'var(--accent-lt)' },
  { value:'PASIVO_CORRIENTE', label:'Pasivo Corriente', icon:'fa-file-invoice-dollar', color:'var(--err)', background:'rgba(var(--err-rgb),.08)' },
  { value:'PASIVO_NO_CORRIENTE', label:'Pasivo No Corriente', icon:'fa-file-contract', color:'var(--warn)', background:'rgba(var(--warn-rgb),.08)' },
  { value:'PATRIMONIO', label:'Patrimonio', icon:'fa-landmark', color:'var(--tx2)', background:'var(--bg-ro)' },
];
export async function initConfigEEFF() { _initConfig('config-eeff-root', CATEGORIAS_ESF, 'Estado de Situación Financiera', 'fa-building-columns', '#223247'); }
export async function initConfigER() { return _initConfigERSeparada(); }

async function _initConfig(rootId, categorias, titulo, icono, headerColor) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = '<div style="text-align:center;padding:40px;color:var(--tx3);"><i class="fa-solid fa-spinner fa-spin"></i></div>';

  const allNotas = await window.api.getNotasEEFF() || [];
  const notas = allNotas.filter(n => categorias.some(c => c.value === n.categoria));
  let planCuentas = [];
  try { planCuentas = await window.api.getPlanCuentas() || []; } catch(_) {}

  const grouped = {};
  categorias.forEach(c => grouped[c.value] = []);
  notas.forEach(n => { if (grouped[n.categoria]) grouped[n.categoria].push(n); });


  root.innerHTML = `
  <div style="max-width:1000px;margin:0 auto;">
    <div style="background:var(--brand-grad);border-radius:8px;padding:20px 28px;margin-bottom:18px;color:#fff;">
      <h2 style="margin:0;font-size:18px;display:flex;align-items:center;gap:10px;"><i class="fa-solid ${icono}"></i> Configuración ${titulo}</h2>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="margin:0;font-size:14px;color:var(--tx);"><i class="fa-solid fa-list-ol"></i> Notas (${notas.length})</h3>
      <button id="${rootId}-btn-nueva" style="padding:8px 18px;background:var(--btn-primary);color:#fff;border:none;border-radius:5px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-plus"></i> Nueva Nota</button>
    </div>
    <div id="${rootId}-lista">
      ${categorias.map(cat => {
        const items = grouped[cat.value];
        return `<div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 14px;background:${cat.background};border-radius:6px;border-left:4px solid ${cat.color};">
            <i class="fa-solid ${cat.icon}" style="color:${cat.color};font-size:14px;"></i>
            <span style="font-weight:700;font-size:13px;color:${cat.color};">${cat.label}</span>
            <span style="font-size:11px;color:var(--tx3);margin-left:auto;">${items.length} nota(s)</span>
          </div>
          ${items.length === 0 ? `<div style="padding:10px 20px;font-size:11px;color:var(--tx3);font-style:italic;border:1px dashed var(--brd);border-radius:6px;text-align:center;">Sin notas.</div>` : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${items.map(n => {
            const cuentas = JSON.parse(n.cuentas || '[]');
            return `<div class="cfg-nota-card" data-id="${escapeAttr(n.id)}" style="background:var(--bg-card,#fff);border:1px solid var(--brd);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
              <div style="width:4px;height:40px;background:${cat.color};border-radius:2px;flex-shrink:0;"></div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                  <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(var(--accent-rgb),.1);color:var(--accent);">${escapeHTML(n.numero)}</span>
                  <span style="font-size:13px;font-weight:600;">${escapeHTML(n.nombre)}</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${cuentas.map(c => {
                  const desc = planCuentas.find(p => p.codigo === c)?.descripcion || '';
                  return `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:var(--bg-block);color:var(--tx2);border:1px solid var(--brd-lt);">${escapeHTML(c)}${desc?' · '+escapeHTML(desc):''}</span>`;
                }).join('')}</div>
              </div>
              <button class="cfg-btn-edit" data-id="${escapeAttr(n.id)}" style="padding:6px 10px;background:var(--bg-block);border:1px solid var(--brd);border-radius:4px;cursor:pointer;font-size:12px;color:var(--tx2);"><i class="fa-solid fa-pencil"></i></button>
              <button class="cfg-btn-delete" data-id="${escapeAttr(n.id)}" style="padding:6px 10px;background:rgba(var(--err-rgb),.06);border:1px solid rgba(var(--err-rgb),.15);border-radius:4px;cursor:pointer;font-size:12px;color:var(--err);"><i class="fa-solid fa-trash"></i></button>
            </div>`;
          }).join('')}</div>`}
        </div>`;
      }).join('')}
    </div>

    <div id="${rootId}-modal" style="display:none;position:fixed;inset:0;background:rgba(5,12,22,.72);z-index:1100;align-items:center;justify-content:center;backdrop-filter:blur(3px);">
      <div style="background:var(--bg-modal,#fff);border-radius:8px;width:620px;max-width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="background:var(--bg-mhdr);padding:14px 20px;border-bottom:2px solid var(--accent);display:flex;justify-content:space-between;align-items:center;">
          <h3 id="${rootId}-modal-title" style="margin:0;color:var(--modal-title);font-size:15px;">Nueva Nota</h3>
          <button class="cfg-modal-close" style="background:transparent;border:none;font-size:16px;color:var(--sb-sub);cursor:pointer;"><i class="fa-solid fa-times"></i></button>
        </div>
        <div style="padding:20px;">
          <input type="hidden" id="${rootId}-edit-id">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div><label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:4px;">Número</label>
              <input type="text" id="${rootId}-numero" placeholder="Ej. NOTA 01" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;"></div>
            <div><label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:4px;">Categoría</label>
              <select id="${rootId}-categoria" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
                ${categorias.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
              </select></div>
          </div>
          <div style="margin-bottom:14px;"><label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:4px;">Nombre</label>
            <input type="text" id="${rootId}-nombre" placeholder="Ej. Efectivo y equivalentes" style="width:100%;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;"></div>
          <div><label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:4px;">Cuentas Contables</label>
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <input type="text" id="${rootId}-cuenta-input" placeholder="Código de cuenta..." style="flex:1;padding:7px 10px;border:1px solid var(--brd);border-radius:4px;font-size:12px;">
              <button id="${rootId}-btn-add" style="padding:7px 12px;background:var(--btn-ok);color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer;"><i class="fa-solid fa-plus"></i></button>
            </div>
            <div id="${rootId}-ac-list" style="display:none;max-height:140px;overflow-y:auto;border:1px solid var(--brd);border-radius:4px;background:var(--bg-modal,#fff);margin-top:-6px;margin-bottom:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);"></div>
            <div id="${rootId}-tags" style="display:flex;flex-wrap:wrap;gap:6px;min-height:40px;padding:10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg-block);"></div>
          </div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px;">
            <button class="cfg-modal-close" style="padding:8px 18px;background:var(--bg-ro);color:var(--tx2);border:1px solid var(--brd-in);border-radius:5px;font-weight:600;cursor:pointer;">Cancelar</button>
            <button id="${rootId}-save" style="padding:8px 18px;background:var(--btn-primary);color:#fff;border:none;border-radius:5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // State
  let currentCuentas = [];
  const pfx = rootId;

  function renderTags() {
    const cont = document.getElementById(`${pfx}-tags`);
    if (!cont) return;
    cont.innerHTML = currentCuentas.length === 0 ? '<span style="font-size:11px;color:var(--tx3);">Sin cuentas.</span>' :
      currentCuentas.map(c => {
        const desc = planCuentas.find(p => p.codigo === c)?.descripcion || '';
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--btn-primary);color:#fff;border-radius:4px;font-size:11px;font-weight:600;">${escapeHTML(c)}${desc?' · '+escapeHTML(desc):''}<button class="cfg-rm-tag" data-c="${escapeAttr(c)}" style="background:transparent;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:12px;padding:0 0 0 4px;">×</button></span>`;
      }).join('');
    cont.querySelectorAll('.cfg-rm-tag').forEach(b => b.addEventListener('click', () => { currentCuentas = currentCuentas.filter(c => c !== b.dataset.c); renderTags(); }));
  }

  const modal = document.getElementById(`${pfx}-modal`);
  const openModal = (nota) => {
    document.getElementById(`${pfx}-edit-id`).value = nota?.id || '';
    document.getElementById(`${pfx}-numero`).value = nota?.numero || `NOTA ${String(notas.length + 1).padStart(2, '0')}`;
    document.getElementById(`${pfx}-nombre`).value = nota?.nombre || '';
    document.getElementById(`${pfx}-categoria`).value = nota?.categoria || categorias[0].value;
    currentCuentas = nota ? JSON.parse(nota.cuentas || '[]') : [];
    renderTags();
    document.getElementById(`${pfx}-modal-title`).textContent = nota ? 'Editar Nota' : 'Nueva Nota';
    modal.style.display = 'flex';
  };
  const closeModal = () => { modal.style.display = 'none'; };

  document.getElementById(`${pfx}-btn-nueva`).addEventListener('click', () => openModal(null));
  modal.querySelectorAll('.cfg-modal-close').forEach(b => b.addEventListener('click', closeModal));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Autocomplete
  const acInput = document.getElementById(`${pfx}-cuenta-input`);
  const acList = document.getElementById(`${pfx}-ac-list`);
  acInput.addEventListener('input', () => {
    const val = acInput.value.trim().toLowerCase();
    if (!val) { acList.style.display = 'none'; return; }
    const filtered = planCuentas.filter(p => p.codigo.toLowerCase().startsWith(val) || p.descripcion.toLowerCase().includes(val)).slice(0, 12);
    if (!filtered.length) { acList.style.display = 'none'; return; }
    acList.innerHTML = filtered.map(p => `<div style="padding:6px 10px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--brd-lt);display:flex;gap:8px;" data-codigo="${escapeAttr(p.codigo)}"><strong style="color:var(--accent);min-width:50px;">${escapeHTML(p.codigo)}</strong><span style="color:var(--tx2);">${escapeHTML(p.descripcion||'')}</span></div>`).join('');
    acList.style.display = 'block';
    acList.querySelectorAll('div').forEach(d => d.addEventListener('mousedown', (e) => {
      e.preventDefault(); if (!currentCuentas.includes(d.dataset.codigo)) { currentCuentas.push(d.dataset.codigo); renderTags(); }
      acInput.value = ''; acList.style.display = 'none';
    }));
  });
  acInput.addEventListener('blur', () => setTimeout(() => acList.style.display = 'none', 200));
  acInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = acInput.value.trim(); if (v && !currentCuentas.includes(v)) { currentCuentas.push(v); renderTags(); } acInput.value = ''; } });
  document.getElementById(`${pfx}-btn-add`).addEventListener('click', () => { const v = acInput.value.trim(); if (v && !currentCuentas.includes(v)) { currentCuentas.push(v); renderTags(); } acInput.value = ''; });

  // Save
  document.getElementById(`${pfx}-save`).addEventListener('click', async () => {
    const data = { id: document.getElementById(`${pfx}-edit-id`).value || null, numero: document.getElementById(`${pfx}-numero`).value.trim(), nombre: document.getElementById(`${pfx}-nombre`).value.trim(), categoria: document.getElementById(`${pfx}-categoria`).value, cuentas: currentCuentas };
    if (!data.numero || !data.nombre) { alert('Complete número y nombre.'); return; }
    if (!data.cuentas.length) { alert('Agregue cuentas.'); return; }
    const r = await window.api.saveNotaEEFF(data);
    if (r.success) { closeModal(); initConfigEEFF(); } else alert(r.error);
  });

  // Edit/Delete
  document.getElementById(`${pfx}-lista`).addEventListener('click', async (e) => {
    const eb = e.target.closest('.cfg-btn-edit');
    if (eb) { const n = notas.find(x => x.id === +eb.dataset.id); if (n) openModal(n); }
    const db = e.target.closest('.cfg-btn-delete');
    if (db) { if (!confirm('¿Eliminar?')) return; await window.api.deleteNotaEEFF(+db.dataset.id); initConfigEEFF(); }
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN ER — INDEPENDIENTE DE CONFIGURACIÓN EEFF
// El usuario crea sus propias notas/rubros y asigna cuentas habilitadas desde Plan de Cuentas.
// ═══════════════════════════════════════════════════════════════════════════════
async function _initConfigERSeparada() {
  const root = document.getElementById('config-er-root');
  if (!root) return;
  root.innerHTML = '<div style="text-align:center;padding:40px;color:var(--tx3);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando Configuración ER...</div>';

  const result = await window.api.getConfigER();
  if (!result?.success) {
    root.innerHTML = `<div style="padding:24px;border:1px solid rgba(var(--err-rgb),.2);background:rgba(var(--err-rgb),.06);border-radius:8px;color:var(--err);">${escapeHTML(result?.error || 'No se pudo cargar la Configuración ER.')}</div>`;
    return;
  }

  const bloques = result.bloques || [];
  const notas = result.notas || [];
  const disponibles = result.cuentasDisponibles || [];
  const cuentaByCode = new Map(disponibles.map(c => [String(c.codigo), c]));
  const bloqueByKey = new Map(bloques.map(b => [String(b.key), b]));
  let editing = null;
  let selectedCuentas = [];
  let filtro = '';
  let filtroVista = 'todas';

  const renderChips = (cuentas) => {
    if (!cuentas?.length) return '<span style="font-size:10px;color:var(--tx3);font-style:italic;">Pendiente de asignar cuentas</span>';
    return cuentas.map(c => {
      const pc = cuentaByCode.get(String(c));
      return `<span style="display:inline-flex;gap:4px;align-items:center;padding:3px 7px;border-radius:4px;background:rgba(var(--accent-rgb),.07);border:1px solid rgba(var(--accent-rgb),.14);font-size:9px;color:var(--tx2);"><strong style="color:var(--accent);">${escapeHTML(c)}</strong>${pc?.descripcion ? ' · '+escapeHTML(pc.descripcion) : ''}</span>`;
    }).join('');
  };

  const renderEstructura = () => bloques.map(b => {
    const blockNotes = notas.filter(n => String(n.bloque) === String(b.key));
    const noteRows = blockNotes.map(n => `<div class="config-er-note-row" data-id="${escapeAttr(n.id)}" style="display:grid;grid-template-columns:105px minmax(250px,1.15fr) minmax(300px,1.35fr) 54px;min-width:760px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--brd-lt);min-height:58px;">
      <div style="font-size:10px;font-weight:800;color:var(--accent);">${escapeHTML(n.numero || '—')}</div>
      <div style="font-size:11.5px;font-weight:700;color:var(--tx);padding-right:12px;">${escapeHTML(n.nombre || '')}</div>
      <div><div style="display:flex;flex-wrap:wrap;gap:4px;">${renderChips(n.cuentas)}</div>${(n.cuentas_deshabilitadas||[]).length ? `<div style="margin-top:4px;font-size:9px;color:var(--err);"><i class="fa-solid fa-triangle-exclamation"></i> ${(n.cuentas_deshabilitadas||[]).length} cuenta(s) ya no están habilitadas.</div>` : ''}</div>
      <div style="display:flex;justify-content:flex-end;"><button class="config-er-edit" data-id="${escapeAttr(n.id)}" type="button" title="Editar nota y cuentas" style="width:34px;height:32px;border:1px solid var(--brd);border-radius:6px;background:var(--bg-block);color:var(--accent);cursor:pointer;"><i class="fa-solid fa-pen"></i></button></div>
    </div>`).join('');
    return `${noteRows}<div style="display:grid;grid-template-columns:105px minmax(250px,1.15fr) minmax(300px,1.35fr) 54px;min-width:760px;align-items:center;padding:10px 14px;background:var(--bg-block);border-top:1px solid var(--accent);border-bottom:1px solid var(--accent);color:var(--tx);font-size:11px;font-weight:900;letter-spacing:0;"><div></div><div style="grid-column:2 / 4;">${escapeHTML(b.subtotalLabel || b.label || '')}</div><div></div></div>`;
  }).join('');

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding-bottom:30px;">
      <div style="background:var(--brand-grad);border-radius:8px;padding:22px 28px;margin-bottom:18px;color:#fff;box-shadow:0 12px 28px rgba(28,39,51,.16);">
        <h2 style="margin:0;font-size:19px;display:flex;align-items:center;gap:10px;"><i class="fa-solid fa-chart-line"></i> Configuración Estado de Resultados</h2>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
        <div style="padding:12px 14px;border:1px solid var(--brd);border-radius:8px;background:var(--bg-card);"><div style="font-size:9px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:0;">Cuentas habilitadas ER</div><div style="font-size:20px;font-weight:800;color:var(--accent);margin-top:4px;">${disponibles.length}</div></div>
        <div style="padding:12px 14px;border:1px solid var(--brd);border-radius:8px;background:var(--bg-card);"><div style="font-size:9px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:0;">Notas preestablecidas</div><div style="font-size:20px;font-weight:800;color:var(--tx);margin-top:4px;">${notas.length}</div></div>
        <div style="padding:12px 14px;border:1px solid var(--brd);border-radius:8px;background:var(--bg-card);"><div style="font-size:9px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:0;">Subtotales automáticos</div><div style="font-size:20px;font-weight:800;color:var(--info);margin-top:4px;">${bloques.length}</div></div>
      </div>

      <div style="margin-bottom:12px;">
        <h3 style="margin:0;font-size:14px;color:var(--tx);"><i class="fa-solid fa-list-ol" style="color:var(--accent);"></i> Estructura preestablecida del Estado de Resultados</h3>
      </div>

      <div style="border:1px solid var(--brd);border-radius:8px;overflow-x:auto;background:var(--bg-card);">
        <div style="display:grid;grid-template-columns:105px minmax(250px,1.15fr) minmax(300px,1.35fr) 54px;min-width:760px;background:var(--sb-bg);color:#fff;padding:10px 14px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:0;">
          <div>Nota</div><div>Concepto / rubro</div><div>Cuentas asignadas</div><div></div>
        </div>
        <div id="config-er-list">${renderEstructura()}</div>
      </div>

      ${disponibles.length === 0 ? `<div style="margin-top:12px;padding:11px 13px;border:1px solid rgba(var(--warn-rgb),.25);background:rgba(var(--warn-rgb),.07);border-radius:7px;color:var(--warning,#8a5a00);font-size:10.5px;"><i class="fa-solid fa-triangle-exclamation"></i> No hay cuentas habilitadas. Active el switch de la columna <b>Estado Resultados</b> directamente en el Plan de Cuentas.</div>` : ''}
    </div>

    <div id="config-er-modal" class="config-er-modal-overlay" style="display:none;">
      <div class="config-er-modal-shell" role="dialog" aria-modal="true" aria-labelledby="config-er-modal-title">
        <div class="config-er-modal-header">
          <div>
            <div class="config-er-modal-kicker">Configuración ER</div>
            <div id="config-er-modal-title" class="config-er-modal-title">Editar Nota</div>
          </div>
          <button id="config-er-close" class="config-er-modal-close" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="config-er-modal-body">
          <input id="config-er-id" type="hidden">
          <input id="config-er-bloque" type="hidden">

          <div class="config-er-form-grid">
            <div>
              <label for="config-er-numero">Número de nota</label>
              <input id="config-er-numero" type="text" placeholder="Ej. Nota 1">
              <div class="config-er-help">Debe ser único dentro de Config. ER.</div>
            </div>
            <div>
              <label for="config-er-nombre">Concepto / rubro preestablecido</label>
              <input id="config-er-nombre" type="text" readonly aria-readonly="true">
            </div>
          </div>

          <div class="config-er-field">
            <label>Subtotal al que pertenece</label>
            <div id="config-er-block-label" style="padding:10px 12px;border:1px solid var(--brd);border-radius:7px;background:var(--bg-block);color:var(--tx);font-size:11px;font-weight:700;"></div>
            <div id="config-er-block-help" class="config-er-help"></div>
          </div>

          <div class="config-er-picker">
            <div class="config-er-picker-head">
              <div>
                <div class="config-er-picker-title">Cuentas habilitadas en Plan de Cuentas</div>
              </div>
              <span id="config-er-count" class="config-er-selection-count">0 seleccionadas</span>
            </div>

            <div class="config-er-picker-toolbar">
              <div class="config-er-search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input id="config-er-search" type="text" placeholder="Buscar cuenta o denominación..." autocomplete="off"></div>
              <div class="config-er-filter-tabs" role="group" aria-label="Filtrar cuentas"><button id="config-er-filter-all" class="config-er-filter-tab active" type="button">Todas</button><button id="config-er-filter-selected" class="config-er-filter-tab" type="button">Seleccionadas</button></div>
            </div>

            <div class="config-er-list-head" aria-hidden="true"><span></span><span>Cuenta</span><span>Denominación</span></div>
            <div id="config-er-cuentas" class="config-er-account-list"></div>
            <div class="config-er-picker-foot"><span id="config-er-visible-count">0 cuentas</span><span>Use el buscador para listas extensas.</span></div>
          </div>

        </div>

        <div class="config-er-modal-footer"><button id="config-er-cancel" class="btn-secondary" type="button">Cancelar</button><button id="config-er-save" type="button"><i class="fa-solid fa-floppy-disk"></i> Guardar Nota</button></div>
      </div>
    </div>`;

  const modal = document.getElementById('config-er-modal');
  const idInput = document.getElementById('config-er-id');
  const numero = document.getElementById('config-er-numero');
  const nombre = document.getElementById('config-er-nombre');
  const bloque = document.getElementById('config-er-bloque');
  const blockLabel = document.getElementById('config-er-block-label');
  const blockHelp = document.getElementById('config-er-block-help');
  const search = document.getElementById('config-er-search');
  const cuentasBox = document.getElementById('config-er-cuentas');
  const count = document.getElementById('config-er-count');
  const visibleCount = document.getElementById('config-er-visible-count');
  const filterAll = document.getElementById('config-er-filter-all');
  const filterSelected = document.getElementById('config-er-filter-selected');

  function updateBlockHelp() {
    const b = bloqueByKey.get(bloque.value);
    blockLabel.textContent = b?.subtotalLabel || b?.label || '';
    blockHelp.textContent = b?.help || '';
  }

  function renderCuentas() {
    const term = filtro.trim().toLowerCase();
    const rows = disponibles.filter(c => {
      const code = String(c.codigo);
      const matchesTerm = !term || code.toLowerCase().includes(term) || String(c.descripcion || '').toLowerCase().includes(term);
      const matchesView = filtroVista !== 'seleccionadas' || selectedCuentas.includes(code);
      return matchesTerm && matchesView;
    });

    cuentasBox.innerHTML = rows.length ? rows.map(c => {
      const code = String(c.codigo);
      const checked = selectedCuentas.includes(code);
      return `<label class="config-er-account-row"><span class="config-er-account-check"><input class="config-er-check" type="checkbox" value="${escapeAttr(code)}" ${checked ? 'checked' : ''}></span><strong class="config-er-account-code">${escapeHTML(code)}</strong><span class="config-er-account-name">${escapeHTML(c.descripcion || 'Sin denominación')}</span></label>`;
    }).join('') : `<div class="config-er-account-empty"><i class="fa-solid fa-magnifying-glass"></i><span>${filtroVista === 'seleccionadas' ? 'No hay cuentas seleccionadas que coincidan.' : 'No hay cuentas que coincidan con la búsqueda.'}</span></div>`;

    count.textContent = `${selectedCuentas.length} seleccionada${selectedCuentas.length === 1 ? '' : 's'}`;
    visibleCount.textContent = `Mostrando ${rows.length} de ${filtroVista === 'seleccionadas' ? selectedCuentas.length : disponibles.length}`;
    filterAll.classList.toggle('active', filtroVista === 'todas');
    filterSelected.classList.toggle('active', filtroVista === 'seleccionadas');

    cuentasBox.querySelectorAll('.config-er-check').forEach(ch => ch.addEventListener('change', () => {
      const code = ch.value;
      if (ch.checked && !selectedCuentas.includes(code)) selectedCuentas.push(code);
      if (!ch.checked) selectedCuentas = selectedCuentas.filter(x => x !== code);
      renderCuentas();
    }));
  }

  function closeModal() {
    modal.style.display = 'none'; editing = null; selectedCuentas = []; filtro = ''; filtroVista = 'todas';
  }

  function openModal(note) {
    if (!note) return;
    editing = note;
    selectedCuentas = [...(note.cuentas || [])];
    filtro = '';
    filtroVista = 'todas';
    idInput.value = note.id || '';
    numero.value = note.numero || '';
    nombre.value = note.nombre || '';
    bloque.value = note.bloque || '';
    search.value = '';
    document.getElementById('config-er-modal-title').textContent = `Editar ${note.numero || 'Nota'}`;
    updateBlockHelp();
    renderCuentas();
    modal.style.display = 'flex';
    setTimeout(() => numero.focus(), 30);
  }

  root.querySelectorAll('.config-er-edit').forEach(btn => btn.addEventListener('click', () => openModal(notas.find(n => String(n.id) === String(btn.dataset.id)) || null)));
  document.getElementById('config-er-close').addEventListener('click', closeModal);
  document.getElementById('config-er-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  search.addEventListener('input', () => { filtro = search.value; renderCuentas(); });
  filterAll.addEventListener('click', () => { filtroVista = 'todas'; renderCuentas(); });
  filterSelected.addEventListener('click', () => { filtroVista = 'seleccionadas'; renderCuentas(); });

  document.getElementById('config-er-save').addEventListener('click', async () => {
    const btn = document.getElementById('config-er-save');
    const payload = { id: Number(idInput.value || 0), numero: numero.value.trim(), cuentas: selectedCuentas };
    if (!payload.numero) { alert('Ingrese el número de nota.'); numero.focus(); return; }
    btn.disabled = true;
    try {
      const res = await window.api.saveNotaER(payload);
      if (!res?.success) { alert(res?.error || 'No se pudo guardar la nota.'); return; }
      closeModal();
      await _initConfigERSeparada();
    } finally { btn.disabled = false; }
  });
}
