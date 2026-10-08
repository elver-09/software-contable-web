import { escapeHTML, escapeAttr } from '../utils/security.js';
// src/renderer/js/modules/amarres.js
let amarresInitialized = false;
let selectedAmarre = null;

// Rellena el <select> de tipo de documento del modal con los documentos disponibles.
async function poblarSelectDocAmarre(valorSeleccionado = '') {
  const sel = document.getElementById('amarre_doc_tipo');
  if (!sel) return;
  let docs = [];
  try { docs = await window.api.getDocumentos() || []; } catch (_) { docs = []; }
  sel.innerHTML = '<option value="">—</option>' +
    docs.map(d => `<option value="${escapeAttr(d.codigo)}">${escapeHTML(d.codigo)} - ${escapeHTML(d.descripcion)}</option>`).join('');
  sel.value = valorSeleccionado || '';
}

export async function initAmarres() {
  await renderTablaAmarres();

  if (amarresInitialized) return;
  amarresInitialized = true;

  // Búsqueda
  document.getElementById('inputBuscarAmarre').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#tabla-amarres tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  // Nuevo
  document.getElementById('btnNuevoAmarre').addEventListener('click', async () => {
    document.getElementById('formAmarre').reset();
    document.getElementById('modalAmarreTitle').textContent = 'Nuevo Amarre';
    document.getElementById('amarre_is_edit').value = 'false';
    document.getElementById('amarre_id').value = '';
    document.getElementById('amarre_activo').checked = true;
    limpiarNombresCuenta();
    await poblarSelectDocAmarre('');
    document.getElementById('modalAmarre').style.display = 'flex';
  });

  // Editar
  document.getElementById('btnEditarAmarre').addEventListener('click', async () => {
    if (!selectedAmarre) return alert('Seleccione un amarre primero.');
    document.getElementById('modalAmarreTitle').textContent = 'Editar Amarre';
    document.getElementById('amarre_is_edit').value = 'true';
    document.getElementById('amarre_id').value = selectedAmarre.id;
    document.getElementById('amarre_nombre').value = selectedAmarre.nombre;
    document.getElementById('amarre_tipo').value = selectedAmarre.tipo;
    document.getElementById('amarre_prefijo').value = selectedAmarre.prefijo;
    const monedaSel = document.getElementById('amarre_moneda');
    if (monedaSel) monedaSel.value = selectedAmarre.moneda || 'PEN';
    document.getElementById('amarre_cuenta_igv').value = selectedAmarre.cuenta_igv || '';
    document.getElementById('amarre_cuenta_igv_exo').value = selectedAmarre.cuenta_igv_exo || '';
    document.getElementById('amarre_cuenta_igv_ina').value = selectedAmarre.cuenta_igv_ina || '';
    document.getElementById('amarre_cuenta_destino').value = selectedAmarre.cuenta_destino || '';
    document.getElementById('amarre_activo').checked = Number(selectedAmarre.activo) === 1;
    limpiarNombresCuenta();
    await poblarSelectDocAmarre(selectedAmarre.doc_tipo || '');
    document.getElementById('modalAmarre').style.display = 'flex';
    // Refrescar nombres de cuenta
    ['amarre_cuenta_igv','amarre_cuenta_igv_exo','amarre_cuenta_igv_ina','amarre_cuenta_destino']
      .forEach(id => document.getElementById(id).dispatchEvent(new Event('blur')));
  });

  // Eliminar
  document.getElementById('btnEliminarAmarre').addEventListener('click', async () => {
    if (!selectedAmarre) return alert('Seleccione un amarre primero.');
    if (confirm(`¿Eliminar el amarre "${selectedAmarre.nombre}"?`)) {
      const result = await window.api.deleteAmarre(selectedAmarre.id);
      if (result.success) await renderTablaAmarres();
      else alert('Error: ' + result.error);
    }
  });

  document.getElementById('btnCerrarModalAmarre').addEventListener('click', () => {
    document.getElementById('modalAmarre').style.display = 'none';
  });

  // Autocompletar nombre de cuenta al perder el foco (para cada input de cuenta)
  const pares = [
    ['amarre_cuenta_igv',     'amarre_cuenta_igv_nombre'],
    ['amarre_cuenta_igv_exo', 'amarre_cuenta_igv_exo_nombre'],
    ['amarre_cuenta_igv_ina', 'amarre_cuenta_igv_ina_nombre'],
    ['amarre_cuenta_destino', 'amarre_cuenta_destino_nombre'],
  ];
  pares.forEach(([inputId, labelId]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    input.addEventListener('blur', async () => {
      const val = input.value.trim();
      if (!val) { label.textContent = ''; return; }
      const cuentas = await window.api.getPlanCuentas() || [];
      const found = cuentas.find(c => String(c.codigo) === val);
      label.textContent = found ? found.descripcion : '⚠ Cuenta no encontrada en el plan';
      label.style.color = found ? 'var(--tx2)' : 'var(--warn)';
    });
  });

  // Guardar
  document.getElementById('formAmarre').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('amarre_is_edit').value === 'true';
    const data = {
      id:             document.getElementById('amarre_id').value,
      nombre:         document.getElementById('amarre_nombre').value.trim(),
      tipo:           document.getElementById('amarre_tipo').value,
      prefijo:        document.getElementById('amarre_prefijo').value.trim(),
      moneda:         (document.getElementById('amarre_moneda')?.value) || 'PEN',
      doc_tipo:       document.getElementById('amarre_doc_tipo').value,
      cuenta_igv:     document.getElementById('amarre_cuenta_igv').value.trim(),
      cuenta_igv_exo: document.getElementById('amarre_cuenta_igv_exo').value.trim(),
      cuenta_igv_ina: document.getElementById('amarre_cuenta_igv_ina').value.trim(),
      cuenta_destino: document.getElementById('amarre_cuenta_destino').value.trim(),
      activo:         document.getElementById('amarre_activo').checked ? 1 : 0,
    };

    const result = isEdit ? await window.api.updateAmarre(data) : await window.api.addAmarre(data);
    if (result.success) {
      document.getElementById('modalAmarre').style.display = 'none';
      await renderTablaAmarres();
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Selección de fila
  document.getElementById('tabla-amarres').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.id) {
      document.querySelectorAll('#tabla-amarres tr').forEach(r => r.style.backgroundColor = '');
      tr.style.backgroundColor = 'var(--accent-lt)';
      selectedAmarre = {
        id:             tr.dataset.id,
        nombre:         tr.dataset.nombre,
        tipo:           tr.dataset.tipo,
        prefijo:        tr.dataset.prefijo,
        moneda:         tr.dataset.moneda,
        doc_tipo:       tr.dataset.docTipo,
        cuenta_igv:     tr.dataset.cuentaIgv,
        cuenta_igv_exo: tr.dataset.cuentaIgvExo,
        cuenta_igv_ina: tr.dataset.cuentaIgvIna,
        cuenta_destino: tr.dataset.cuentaDestino,
        activo:         tr.dataset.activo,
      };
    }
  });
}

function limpiarNombresCuenta() {
  ['amarre_cuenta_igv_nombre','amarre_cuenta_igv_exo_nombre',
   'amarre_cuenta_igv_ina_nombre','amarre_cuenta_destino_nombre']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
}

async function renderTablaAmarres() {
  selectedAmarre = null;
  const amarres = await window.api.getAmarres() || [];
  const tbody = document.getElementById('tabla-amarres');

  if (amarres.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No hay amarres registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = amarres.map(a => {
    const activoBadge = Number(a.activo) === 1
      ? '<span style="color:var(--ok);font-weight:600;">Sí</span>'
      : '<span style="color:var(--err);font-weight:600;">No</span>';
    return `<tr data-id="${escapeAttr(a.id)}" data-nombre="${escapeAttr(a.nombre)}" data-tipo="${escapeAttr(a.tipo)}"
                data-prefijo="${escapeAttr(a.prefijo)}" data-moneda="${escapeAttr(a.moneda||'PEN')}" data-doc-tipo="${escapeAttr(a.doc_tipo)}"
                data-cuenta-igv="${escapeAttr(a.cuenta_igv)}" data-cuenta-igv-exo="${escapeAttr(a.cuenta_igv_exo)}"
                data-cuenta-igv-ina="${escapeAttr(a.cuenta_igv_ina)}" data-cuenta-destino="${escapeAttr(a.cuenta_destino)}"
                data-activo="${escapeAttr(a.activo)}" style="cursor: pointer;">
      <td>${escapeHTML(a.nombre)}</td>
      <td>${escapeHTML(a.tipo)}</td>
      <td>${escapeHTML(a.prefijo)}</td>
      <td>${escapeHTML(a.moneda || 'PEN')}</td>
      <td>${escapeHTML(a.cuenta_igv || '—')}</td>
      <td>${escapeHTML(a.cuenta_destino)}</td>
      <td style="text-align:center;">${activoBadge}</td>
    </tr>`;
  }).join('');
}
