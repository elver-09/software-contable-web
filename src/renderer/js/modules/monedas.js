import { escapeHTML, escapeAttr } from '../utils/security.js';
// src/renderer/js/modules/monedas.js

let monedasInitialized = false;
let selectedMoneda = null;

export async function initMonedas() {
  await renderTablaMonedas();

  if (monedasInitialized) return;
  monedasInitialized = true;

  // Get static elements
  const view = document.getElementById('view-monedas');
  const modal = document.getElementById('modalMoneda');
  const form = document.getElementById('formMoneda');
  const inputBuscar = document.getElementById('inputBuscarMoneda');
  const tablaBody = document.getElementById('tabla-monedas');

  // --- Main Event Listener using Delegation for all clicks inside the view ---
  view.addEventListener('click', async (e) => {
    const btnGetTC = e.target.closest('#btnGetTC');
    const btnNueva = e.target.closest('#btnNuevaMoneda');
    const btnEditar = e.target.closest('#btnEditarMoneda');
    const btnEliminar = e.target.closest('#btnEliminarMoneda');
    const btnCancelarModal = e.target.closest('#btnCancelarModalMoneda'); // Botón "Cancelar" en el footer
    const btnCerrarModalX = e.target.closest('#btnCerrarModalMonedaX'); // Botón "X" en la cabecera
    const tr = e.target.closest('#tabla-monedas tr');

    // --- Obtener T.C. ---
    if (btnGetTC) {
      _abrirModalObtenerTC();
      return;
    }

    // --- Open "New" Modal ---
    if (btnNueva) {
      selectedMoneda = null;
      form.reset();
      document.getElementById('modalMonedaTitle').textContent = 'Nueva Moneda y T.C.';
      document.getElementById('moneda_is_edit').value = 'false';
      document.getElementById('moneda_fecha').value = new Date().toISOString().split('T')[0];
      modal.style.display = 'flex';
      return;
    }

    // --- Open "Edit" Modal ---
    if (btnEditar) {
      if (!selectedMoneda) {
        alert('Por favor, seleccione un registro de la tabla primero.');
        return;
      }
      document.getElementById('modalMonedaTitle').textContent = 'Editar Moneda y T.C.';
      document.getElementById('moneda_is_edit').value = 'true';
      document.getElementById('moneda_old_codigo').value = JSON.stringify({ fecha: selectedMoneda.fecha, nombre: selectedMoneda.nombre });
      document.getElementById('moneda_fecha').value = selectedMoneda.fecha;
      document.getElementById('moneda_nombre').value = selectedMoneda.nombre;
      document.getElementById('moneda_tc').value = selectedMoneda.tipo_cambio;
      modal.style.display = 'flex';
      return;
    }

    // --- Delete ---
    if (btnEliminar) {
      if (!selectedMoneda) {
        alert('Por favor, seleccione un registro de la tabla primero.');
        return;
      }
      if (confirm(`¿Estás seguro de eliminar el tipo de cambio para ${selectedMoneda.nombre} del día ${selectedMoneda.fecha}?`)) {
        const result = await window.api.deleteMoneda({ fecha: selectedMoneda.fecha, nombre: selectedMoneda.nombre });
        if (result.success) {
          await renderTablaMonedas();
        } else {
          alert('Error al eliminar: ' + result.error);
        }
      }
      return;
    }

    // --- Close Modal ---
    // Ambos botones de cerrar/cancelar deben ocultar el modal
    if (btnCancelarModal || btnCerrarModalX) {
      modal.style.display = 'none';
      return;
    }

    // --- Row selection ---
    if (tr && tr.dataset.fecha && !e.target.closest('input[type="checkbox"]')) {
      tablaBody.querySelectorAll('tr').forEach(row => row.style.backgroundColor = '');
      tr.style.backgroundColor = 'var(--accent-lt)';

      selectedMoneda = {
        fecha: tr.dataset.fecha,
        nombre: tr.dataset.nombre,
        tipo_cambio: parseFloat(tr.dataset.tc)
      };
    }
  });

  // --- Other Listeners (not click-based) ---

  inputBuscar.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    tablaBody.querySelectorAll('tr').forEach(row => {
      const fecha = (row.cells[1]?.textContent || '').toLowerCase();
      const moneda = (row.cells[2]?.textContent || '').toLowerCase();
      row.style.display = (fecha.includes(term) || moneda.includes(term)) ? '' : 'none';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('moneda_is_edit').value === 'true';

    const data = {
      fecha: document.getElementById('moneda_fecha').value,
      nombre: document.getElementById('moneda_nombre').value.toUpperCase().trim(),
      tipo_cambio: parseFloat(document.getElementById('moneda_tc').value)
    };

    if (!data.fecha || !data.nombre || isNaN(data.tipo_cambio)) {
      alert('Todos los campos son obligatorios.');
      return;
    }

    let result;
    if (isEdit) {
      const oldData = JSON.parse(document.getElementById('moneda_old_codigo').value);
      result = await window.api.updateMoneda({ newData: data, oldData: oldData });
    } else {
      result = await window.api.addMoneda(data);
    }

    if (result.success) {
      modal.style.display = 'none';
      await renderTablaMonedas();
    } else {
      alert('Error: ' + result.error);
    }
  });
}


async function _abrirModalObtenerTC() {
  document.getElementById('tc-range-modal')?.remove();

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const primerDiaMes = `${y}-${m}-01`;
  const hoyStr = `${y}-${m}-${d}`;

  const modal = document.createElement('div');
  modal.id = 'tc-range-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(5,12,22,.72);z-index:1100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
  modal.innerHTML = `
    <div style="background:var(--bg-modal,#fff);border-radius:8px;width:520px;max-width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;">
      <div style="background:var(--bg-mhdr,#223247);padding:16px 22px;border-bottom:2px solid var(--sb-active,#2f6f8f);">
        <h3 style="margin:0;color:var(--modal-title);font-size:15px;font-weight:700;display:flex;align-items:center;gap:10px;">
          <i class="fa-solid fa-dollar-sign"></i> Obtener Tipo de Cambio
        </h3>
      </div>
      <div style="padding:20px 22px;">
        <div style="padding:10px 12px;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.18);border-radius:6px;margin-bottom:16px;font-size:11px;line-height:1.5;color:var(--tx2);">
          <strong style="color:var(--tx);">Fuentes oficiales:</strong> para el día actual se intenta SUNAT directamente. Para históricos y rangos se usan las series SBS publicadas por BCRP aplicando el criterio SUNAT del cierre del día anterior. En días sin publicación se arrastra el último T.C. disponible.
        </div>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:5px;">Fecha Desde</label>
            <input type="date" id="tc-desde" value="${primerDiaMes}" max="${hoyStr}" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;font-size:13px;">
          </div>
          <div style="flex:1;">
            <label style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--tx-lbl);display:block;margin-bottom:5px;">Fecha Hasta</label>
            <input type="date" id="tc-hasta" value="${hoyStr}" max="${hoyStr}" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;font-size:13px;">
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" id="tc-btn-hoy" style="flex:1;padding:6px;background:var(--bg-block,#f4f8fc);border:1px solid var(--brd);border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;color:var(--tx2);"><i class="fa-solid fa-calendar-day"></i> Solo hoy</button>
          <button type="button" id="tc-btn-mes" style="flex:1;padding:6px;background:var(--bg-block,#f4f8fc);border:1px solid var(--brd);border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;color:var(--tx2);"><i class="fa-solid fa-calendar-week"></i> Mes actual</button>
          <button type="button" id="tc-btn-mesant" style="flex:1;padding:6px;background:var(--bg-block,#f4f8fc);border:1px solid var(--brd);border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;color:var(--tx2);"><i class="fa-solid fa-calendar"></i> Mes anterior</button>
        </div>

        <div id="tc-msg" style="margin-bottom:12px;"></div>
        <div id="tc-progress" style="display:none;margin-bottom:8px;">
          <div style="background:var(--bg-block);border-radius:4px;height:6px;overflow:hidden;">
            <div id="tc-progress-bar" style="height:100%;background:var(--btn-primary);border-radius:4px;width:0%;transition:width .3s;"></div>
          </div>
          <div id="tc-progress-text" style="font-size:10px;color:var(--tx3);margin-top:5px;text-align:center;">Consultando fuentes oficiales...</div>
        </div>
      </div>
      <div style="padding:12px 22px;border-top:1px solid var(--brd);background:var(--bg-mftr,#f4f8fd);display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" id="tc-cancelar" style="padding:8px 18px;background:var(--bg-ro);color:var(--tx2);border:1px solid var(--brd-in);border-radius:5px;font-weight:600;cursor:pointer;">Cancelar</button>
        <button type="button" id="tc-obtener" style="padding:8px 18px;background:var(--btn-primary);color:#fff;border:none;border-radius:5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-download"></i> Obtener T.C.</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const desdeInput = modal.querySelector('#tc-desde');
  const hastaInput = modal.querySelector('#tc-hasta');
  const msg = modal.querySelector('#tc-msg');
  const progress = modal.querySelector('#tc-progress');
  const progressBar = modal.querySelector('#tc-progress-bar');
  const progressText = modal.querySelector('#tc-progress-text');
  const btn = modal.querySelector('#tc-obtener');

  const mostrarMensaje = (texto, tipo = 'error') => {
    const div = document.createElement('div');
    div.style.cssText = tipo === 'ok'
      ? 'padding:10px;background:rgba(var(--ok-rgb),.08);color:var(--ok);border-radius:4px;font-size:12px;font-weight:600;line-height:1.5;'
      : tipo === 'warning'
        ? 'padding:10px;background:rgba(var(--warn-rgb),.09);color:var(--warn);border-radius:4px;font-size:12px;font-weight:600;line-height:1.5;'
        : 'padding:10px;background:rgba(var(--err-rgb),.08);color:var(--err);border-radius:4px;font-size:12px;font-weight:600;line-height:1.5;';
    div.textContent = texto;
    msg.replaceChildren(div);
  };

  const cerrar = () => modal.remove();
  modal.querySelector('#tc-cancelar').addEventListener('click', cerrar);
  modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

  modal.querySelector('#tc-btn-hoy').addEventListener('click', () => {
    desdeInput.value = hoyStr;
    hastaInput.value = hoyStr;
  });
  modal.querySelector('#tc-btn-mes').addEventListener('click', () => {
    desdeInput.value = primerDiaMes;
    hastaInput.value = hoyStr;
  });
  modal.querySelector('#tc-btn-mesant').addEventListener('click', () => {
    const inicio = new Date(y, today.getMonth() - 1, 1);
    const fin = new Date(y, today.getMonth(), 0);
    desdeInput.value = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`;
    hastaInput.value = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
  });

  btn.addEventListener('click', async () => {
    const desde = desdeInput.value;
    const hasta = hastaInput.value;
    if (!desde || !hasta) return mostrarMensaje('Seleccione ambas fechas.');
    if (desde > hasta) return mostrarMensaje('La fecha "desde" debe ser anterior o igual a "hasta".');
    if (hasta > hoyStr) return mostrarMensaje('No se pueden descargar tipos de cambio de fechas futuras.');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Obteniendo...';
    progress.style.display = 'block';
    progressBar.style.width = '20%';
    progressText.textContent = `Consultando ${desde} a ${hasta} en una sola operación...`;
    msg.replaceChildren();

    try {
      const result = await window.api.fetchTipoCambioRango({ desde, hasta });
      progressBar.style.width = '100%';

      if (!result?.success) {
        mostrarMensaje(result?.error || 'No se pudo obtener el tipo de cambio.');
        progressText.textContent = 'No se completó la consulta.';
        return;
      }

      const partes = [
        `${result.guardados || 0} fecha(s) guardadas`,
        `${result.insertados || 0} nuevas`,
        `${result.actualizados || 0} actualizadas`
      ];
      if (result.sunat_directo) partes.push(`${result.sunat_directo} desde SUNAT directo`);
      if (result.bcrp_derivados) partes.push(`${result.bcrp_derivados} desde BCRP/SBS`);
      if (result.sin_dato?.length) partes.push(`${result.sin_dato.length} sin dato`);

      mostrarMensaje(partes.join(' · '), result.sin_dato?.length ? 'warning' : 'ok');
      progressText.textContent = 'Consulta completada.';
      await renderTablaMonedas();

      // Si la descarga terminó completamente, cerrar el modal automáticamente.
      // Cuando quedan fechas sin dato lo mantenemos abierto para mostrar la advertencia.
      if (!result.sin_dato?.length) {
        cerrar();
      }
    } catch (error) {
      mostrarMensaje(error?.message || 'Error inesperado obteniendo el tipo de cambio.');
      progressText.textContent = 'No se completó la consulta.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-download"></i> Obtener T.C.';
    }
  });
}



async function renderTablaMonedas() {
  selectedMoneda = null;
  const tablaBody = document.getElementById('tabla-monedas');
  try {
    const monedas = await window.api.getMonedas() || [];

    // Add checkbox column to header if not already there
    const thead = tablaBody.closest('table')?.querySelector('thead tr');
    if (thead && !thead.querySelector('.chk-col')) {
      const th = document.createElement('th');
      th.className = 'chk-col';
      th.style.cssText = 'width:30px;text-align:center;';
      th.innerHTML = '<input type="checkbox" id="mon-check-all" title="Seleccionar todos">';
      thead.insertBefore(th, thead.firstChild);
    }

    // Add "Eliminar seleccionados" button if not exists
    if (!document.getElementById('btn-del-selected')) {
      const btnRef = document.getElementById('btnEliminarMoneda');
      if (btnRef) {
        const btn = document.createElement('button');
        btn.id = 'btn-del-selected';
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Eliminar Seleccionados';
        btn.style.cssText = 'padding:7px 14px;background:var(--btn-err);color:#fff;border:none;border-radius:5px;font-weight:600;cursor:pointer;font-size:12px;display:none;margin-left:6px;';
        btn.addEventListener('click', async () => {
          const checks = tablaBody.querySelectorAll('.mon-check:checked');
          if (!checks.length) return;
          if (!confirm(`¿Eliminar ${checks.length} registro(s) seleccionados?`)) return;
          for (const chk of checks) {
            const tr = chk.closest('tr');
            await window.api.deleteMoneda({ fecha: tr.dataset.fecha, nombre: tr.dataset.nombre });
          }
          await renderTablaMonedas();
        });
        btnRef.parentNode.insertBefore(btn, btnRef.nextSibling);
      }
    }

    if (monedas.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--tx3); padding: 20px;">No hay tipos de cambio registrados.</td></tr>`;
      return;
    }
    const tdStyle = "padding: 8px 15px; font-size: 13px; border-bottom: 1px solid var(--brd-lt);";
    tablaBody.innerHTML = monedas.map(m => {
      const compra = Number(m.compra || 0);
      const venta = Number(m.venta || 0);
      const tc = Number(m.tipo_cambio || 0);
      return `
      <tr data-fecha="${escapeAttr(m.fecha)}" data-nombre="${escapeAttr(m.nombre)}" data-tc="${escapeAttr(tc)}" style="cursor: pointer; transition: background-color 0.2s;">
        <td style="${tdStyle} text-align:center;width:30px;"><input type="checkbox" class="mon-check" style="cursor:pointer;"></td>
        <td style="${tdStyle}">${escapeHTML(m.fecha)}</td>
        <td style="${tdStyle} font-weight: 500;">${escapeHTML(m.nombre)}</td>
        <td style="${tdStyle} text-align: right; font-family: monospace; color: var(--ok);">${Number.isFinite(compra) ? compra.toFixed(3) : '0.000'}</td>
        <td style="${tdStyle} text-align: right; font-family: monospace; color: var(--err);">${Number.isFinite(venta) ? venta.toFixed(3) : '0.000'}</td>
        <td style="${tdStyle} text-align: right; font-family: monospace; font-weight: 600; color: var(--tx);">${Number.isFinite(tc) ? tc.toFixed(3) : '0.000'}</td>
      </tr>`;
    }).join('');

    // Check all handler (use onclick to avoid duplicate listeners)
    const checkAll = document.getElementById('mon-check-all');
    if (checkAll) {
      checkAll.checked = false;
      checkAll.onclick = () => {
        tablaBody.querySelectorAll('.mon-check').forEach(c => c.checked = checkAll.checked);
        const btnDel = document.getElementById('btn-del-selected');
        if (btnDel) btnDel.style.display = checkAll.checked ? 'inline-block' : 'none';
      };
    }

    // Show/hide delete button on individual check (use onclick on tbody)
    tablaBody.onclick = (e) => {
      if (e.target.classList.contains('mon-check')) {
        const anyChecked = tablaBody.querySelector('.mon-check:checked');
        const btnDel = document.getElementById('btn-del-selected');
        if (btnDel) btnDel.style.display = anyChecked ? 'inline-block' : 'none';
      }
    };

  } catch (error) {
    console.error("Error al renderizar monedas:", error);
    tablaBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--err); padding: 20px;">Error al cargar los datos.</td></tr>`;
  }
}
