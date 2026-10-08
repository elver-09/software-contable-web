import { escapeHTML, escapeAttr } from '../utils/security.js';
let entInitialized = false;
let selectedEnt = null;

export async function initEntidades() {
  if (!entInitialized) {
    entInitialized = true;
    _bindEntidadesEventos();
  }
  await renderTablaEntidades();
}

function _bindEntidadesEventos() {
  document.getElementById('btnExportarExcelEnt').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';

    try {
      const result = await window.api.exportarExcelEntidades();
      if (result && result.success) {
        const count = Number(result.count || 0);
        alert(`¡Exportación exitosa! Se exportaron ${count} registro${count === 1 ? '' : 's'}.`);
      } else if (result && !result.canceled) {
        alert('Error: ' + (result.error || 'No se pudo exportar el archivo.'));
      }
    } catch (error) {
      alert('Error: ' + (error?.message || 'No se pudo exportar el archivo.'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-file-export"></i> Exportar';
    }
  });

  // Importar
  document.getElementById('btnImportarExcelEnt').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
    const result = await window.api.importarExcelEntidades();
    btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> Importar';
    if (result && result.success) {
      const destino = result.scope === 'Local' ? 'esta empresa' : 'el catálogo global';
      const extra = Number(result.overrides || 0) > 0 ? `\n${result.overrides} registro(s) personalizan datos globales.` : '';
      alert(`¡Importación exitosa! Se procesaron ${result.count} registros en ${destino}.${extra}`);
      await renderTablaEntidades();
    } else if (result && !result.canceled) alert('Error: ' + result.error);
  });

  // Buscar
  document.getElementById('inputBuscarEnt').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#tabla-entidades tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  // Editar
  document.getElementById('btnEditarEnt').addEventListener('click', () => {
    if (!selectedEnt) return alert('Seleccione un registro primero.');
    const titulo = selectedEnt.modo_edicion === 'crear_override'
      ? 'Personalizar Entidad para esta Empresa'
      : selectedEnt.modo_edicion === 'override'
        ? 'Editar Personalización de Entidad'
        : selectedEnt.modo_edicion === 'global'
          ? 'Editar Entidad Global'
          : 'Editar Registro';
    document.getElementById('modalEntTitle').textContent = titulo;
    document.getElementById('ent_codigo').value = selectedEnt.codigo;
    document.getElementById('ent_old_codigo').value = selectedEnt.codigo;
    document.getElementById('ent_razon_social').value = selectedEnt.razon_social;
    document.getElementById('ent_tipo').value = selectedEnt.tipo;
    document.getElementById('ent_tipo_documento').value = selectedEnt.tipo_documento || '';
    document.getElementById('ent_is_edit').value = 'true';
    document.getElementById('ent_codigo').readOnly = !selectedEnt.puede_cambiar_codigo;
    document.getElementById('modalEnt').style.display = 'flex';
  });

  // Eliminar
  document.getElementById('btnEliminarEnt').addEventListener('click', async () => {
    if (!selectedEnt) return alert('Seleccione un registro primero.');
    if (!selectedEnt.puede_eliminar) {
      alert('Esta entidad pertenece al catálogo global. Desde una empresa puede personalizarla con Editar, pero no eliminar la base compartida.');
      return;
    }
    const pregunta = selectedEnt.es_override
      ? `¿Eliminar la personalización de ${selectedEnt.codigo}? Se restaurarán los datos globales para esta empresa.`
      : selectedEnt.origen === 'Global'
        ? `¿Eliminar la entidad global ${selectedEnt.codigo}? Este cambio afectará a todas las empresas que la heredan.`
        : `¿Eliminar el registro ${selectedEnt.codigo} de esta empresa?`;
    if (confirm(pregunta)) {
      const result = await window.api.deleteEntidad(selectedEnt.codigo);
      if (result.success) {
        await renderTablaEntidades();
        if (result.restoredGlobal && result.message) alert(result.message);
      } else alert('Error: ' + result.error);
    }
  });

  // Nuevo
  document.getElementById('btnNuevaEnt').addEventListener('click', () => {
    document.getElementById('formEnt').reset();
    document.getElementById('modalEntTitle').textContent = 'Nuevo Registro';
    document.getElementById('ent_is_edit').value = 'false';
    document.getElementById('ent_old_codigo').value = '';
    document.getElementById('ent_codigo').readOnly = false;
    document.getElementById('modalEnt').style.display = 'flex';
  });

  // Cerrar Modal
  document.getElementById('btnCerrarModalEnt').addEventListener('click', () => {
    const modalEnt = document.getElementById('modalEnt');
    modalEnt.style.display = 'none';
    modalEnt.style.zIndex = '';
    window.__voucherEntCallback = null;
  });

  // ── Auto-consulta DNI/RUC ──
  const codigoInput = document.getElementById('ent_codigo');
  const razonInput = document.getElementById('ent_razon_social');
  const tipoDocSel = document.getElementById('ent_tipo_documento');
  const btnBuscar = document.getElementById('ent-btn-buscar-doc');
  const searchMsg = document.getElementById('ent-search-msg');

  const buscarDoc = async () => {
    const num = codigoInput.value.trim();
    if (!num || num.length < 8) { if (searchMsg) searchMsg.innerHTML = '<div style="padding:6px 10px;background:rgba(var(--err-rgb),.08);color:var(--err);border-radius:4px;font-size:11px;">Ingrese al menos 8 dígitos.</div>'; return; }

    const tipoDoc = tipoDocSel.value;
    const tipo = (tipoDoc === '1' || num.length === 8) ? 'dni' : 'ruc';

    if (btnBuscar) { btnBuscar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando...'; btnBuscar.disabled = true; }
    if (searchMsg) searchMsg.innerHTML = '';

    try {
      const r = await window.api.consultarDocumento({ tipo, numero: num });
      if (r.success) {
        if (tipo === 'dni') {
          razonInput.value = r.nombre || '';
          if (!tipoDocSel.value || tipoDocSel.value === '') tipoDocSel.value = '1';
        } else {
          razonInput.value = r.razonSocial || '';
          if (!tipoDocSel.value || tipoDocSel.value === '') tipoDocSel.value = '6';
        }
        if (searchMsg) searchMsg.innerHTML = `<div style="padding:6px 10px;background:rgba(var(--ok-rgb),.08);color:var(--ok);border-radius:4px;font-size:11px;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-check-circle"></i> ${tipo==='dni'?'DNI':'RUC'} encontrado: <strong>${escapeHTML(razonInput.value)}</strong></div>`;
      } else {
        if (searchMsg) searchMsg.innerHTML = '<div style="padding:6px 10px;background:rgba(var(--err-rgb),.08);color:var(--err);border-radius:4px;font-size:11px;">No se encontró información.</div>';
      }
    } catch(_) {
      if (searchMsg) searchMsg.innerHTML = '<div style="padding:6px 10px;background:rgba(var(--err-rgb),.08);color:var(--err);border-radius:4px;font-size:11px;">Error de conexión.</div>';
    }
    if (btnBuscar) { btnBuscar.innerHTML = '<i class="fa-solid fa-search"></i> Buscar'; btnBuscar.disabled = false; }
  };

  if (btnBuscar) btnBuscar.addEventListener('click', buscarDoc);
  if (codigoInput) codigoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarDoc(); } });

  // Guardar
  document.getElementById('formEnt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('ent_is_edit').value === 'true';
    const data = {
      old_codigo: document.getElementById('ent_old_codigo').value,
      codigo: document.getElementById('ent_codigo').value.trim(),
      razon_social: document.getElementById('ent_razon_social').value.trim(),
      tipo: document.getElementById('ent_tipo').value,
      tipo_documento: document.getElementById('ent_tipo_documento').value
    };

    let result = isEdit ? await window.api.updateEntidad(data) : await window.api.addEntidad(data);
    if (result.success) {
      const modalEnt = document.getElementById('modalEnt');
      modalEnt.style.display = 'none';
      modalEnt.style.zIndex = '';
      await renderTablaEntidades();
      // Si el registro se inició desde el voucher, devolver el cliente al voucher.
      if (typeof window.__voucherEntCallback === 'function') {
        const cb = window.__voucherEntCallback;
        window.__voucherEntCallback = null;
        cb(data);
      }
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Seleccionar fila
  document.getElementById('tabla-entidades').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) {
      document.querySelectorAll('#tabla-entidades tr').forEach(r => r.style.backgroundColor = '');
      tr.style.backgroundColor = 'var(--accent-lt)';
      selectedEnt = { 
        codigo: tr.dataset.code, 
        razon_social: tr.dataset.razon,
        tipo: tr.dataset.tipo,
        tipo_documento: tr.dataset.tdoc || '',
        origen: tr.dataset.origen || '',
        es_override: tr.dataset.override === 'true',
        puede_eliminar: tr.dataset.canDelete === 'true',
        puede_cambiar_codigo: tr.dataset.canRename === 'true',
        modo_edicion: tr.dataset.editMode || ''
      };
    }
  });
}

async function renderTablaEntidades() {
  selectedEnt = null;
  const entidades = await window.api.getEntidades() || [];
  const tbody = document.getElementById('tabla-entidades');
  
  if (entidades.length === 0) return tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay clientes ni proveedores registrados.</td></tr>`;

  const TDOC = { '0':'Otros', '1':'DNI', '4':'C.E.', '6':'RUC', '7':'Pasaporte' };
  tbody.innerHTML = entidades.map(e => {
    const td = e.tipo_documento || '';
    const scopeLabel = e.es_override ? 'Personalizado' : e.origen === 'Local' ? 'Empresa' : 'Global';
    const scopeClass = e.es_override ? 'override' : e.origen === 'Local' ? 'local' : 'global';
    return `<tr data-code="${escapeAttr(e.codigo)}" data-razon="${escapeAttr(e.razon_social)}" data-tipo="${escapeAttr(e.tipo)}" data-tdoc="${escapeAttr(td)}" data-origen="${escapeAttr(e.origen || '')}" data-override="${e.es_override ? 'true' : 'false'}" data-can-delete="${e.puede_eliminar ? 'true' : 'false'}" data-can-rename="${e.puede_cambiar_codigo ? 'true' : 'false'}" data-edit-mode="${escapeAttr(e.modo_edicion || '')}" style="cursor: pointer;">
      <td>${escapeHTML(e.codigo)}</td>
      <td>${escapeHTML(TDOC[td] || '—')}</td>
      <td>${escapeHTML(e.razon_social)} <span class="catalog-scope-badge ${scopeClass}">${scopeLabel}</span></td>
      <td>${escapeHTML(e.tipo)}</td>
    </tr>`;
  }).join('');
}
