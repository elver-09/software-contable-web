import { escapeHTML, escapeAttr } from '../utils/security.js';
let docInitialized = false;
let selectedDoc = null;

export async function initTiposDocumentos() {
  await renderTablaDocumentos();

  if (docInitialized) return;
  docInitialized = true;

  // Importar Excel
  const btnImportarExcelDoc = document.getElementById('btnImportarExcelDoc');
  if (btnImportarExcelDoc) {
    btnImportarExcelDoc.addEventListener('click', async () => {
      btnImportarExcelDoc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
      const result = await window.api.importarExcelDocumentos();
      btnImportarExcelDoc.innerHTML = '<i class="fa-solid fa-file-excel"></i> Importar';
      if (result && result.success) {
        const destino = result.scope === 'Local' ? 'esta empresa' : 'el catálogo global';
        const extra = Number(result.overrides || 0) > 0 ? `\n${result.overrides} documento(s) personalizan la base global.` : '';
        alert(`¡Importación exitosa! Se procesaron ${result.count} documentos en ${destino}.${extra}`);
        await renderTablaDocumentos();
      } else if (result && !result.canceled) {
        alert('Error al importar: ' + result.error);
      }
    });
  }

  // Búsqueda
  document.getElementById('inputBuscarDoc').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#tabla-tipos-documentos tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  });

  // Editar
  document.getElementById('btnEditarDoc').addEventListener('click', () => {
    if (!selectedDoc) return alert('Seleccione un documento primero.');
    const titulo = selectedDoc.modo_edicion === 'crear_override'
      ? 'Personalizar Documento para esta Empresa'
      : selectedDoc.modo_edicion === 'override'
        ? 'Editar Personalización de Documento'
        : selectedDoc.modo_edicion === 'global'
          ? 'Editar Documento Global'
          : 'Editar Documento';
    document.getElementById('modalDocTitle').textContent = titulo;
    document.getElementById('doc_codigo').value = selectedDoc.codigo;
    document.getElementById('doc_old_codigo').value = selectedDoc.codigo;
    document.getElementById('doc_descripcion').value = selectedDoc.descripcion;
    document.getElementById('doc_is_edit').value = 'true';
    document.getElementById('doc_codigo').readOnly = !selectedDoc.puede_cambiar_codigo;
    document.getElementById('modalDoc').style.display = 'flex';
  });

  // Eliminar
  document.getElementById('btnEliminarDoc').addEventListener('click', async () => {
    if (!selectedDoc) return alert('Seleccione un documento primero.');
    if (!selectedDoc.puede_eliminar) {
      alert('Este documento pertenece al catálogo global. Desde una empresa puede personalizar su descripción con Editar, pero no eliminar la base compartida.');
      return;
    }
    const pregunta = selectedDoc.es_override
      ? `¿Eliminar la personalización del documento ${selectedDoc.codigo}? Se restaurará su descripción global para esta empresa.`
      : selectedDoc.origen === 'Global'
        ? `¿Eliminar el documento global ${selectedDoc.codigo}? Este cambio afectará a todas las empresas que lo heredan.`
        : `¿Eliminar el documento ${selectedDoc.codigo} de esta empresa?`;
    if (confirm(pregunta)) {
      const result = await window.api.deleteDocumento(selectedDoc.codigo);
      if (result.success) {
        await renderTablaDocumentos();
        if (result.restoredGlobal && result.message) alert(result.message);
      } else alert('Error: ' + result.error);
    }
  });

  // Nuevo
  document.getElementById('btnNuevaDoc').addEventListener('click', () => {
    document.getElementById('formDoc').reset();
    document.getElementById('modalDocTitle').textContent = 'Nuevo Documento';
    document.getElementById('doc_is_edit').value = 'false';
    document.getElementById('doc_old_codigo').value = '';
    document.getElementById('doc_codigo').readOnly = false;
    document.getElementById('modalDoc').style.display = 'flex';
  });

  document.getElementById('btnCerrarModalDoc').addEventListener('click', () => {
    document.getElementById('modalDoc').style.display = 'none';
  });

  // Guardar Formulario
  document.getElementById('formDoc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('doc_is_edit').value === 'true';
    const data = {
      old_codigo: document.getElementById('doc_old_codigo').value,
      codigo: document.getElementById('doc_codigo').value.trim(),
      descripcion: document.getElementById('doc_descripcion').value.trim()
    };

    let result = isEdit ? await window.api.updateDocumento(data) : await window.api.addDocumento(data);
    if (result.success) {
      document.getElementById('modalDoc').style.display = 'none';
      await renderTablaDocumentos();
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Selección de fila
  document.getElementById('tabla-tipos-documentos').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) {
      document.querySelectorAll('#tabla-tipos-documentos tr').forEach(r => r.style.backgroundColor = '');
      tr.style.backgroundColor = 'var(--accent-lt)';
      selectedDoc = {
        codigo: tr.dataset.code,
        descripcion: tr.dataset.desc,
        origen: tr.dataset.origen || '',
        es_override: tr.dataset.override === 'true',
        puede_eliminar: tr.dataset.canDelete === 'true',
        puede_cambiar_codigo: tr.dataset.canRename === 'true',
        modo_edicion: tr.dataset.editMode || ''
      };
    }
  });
}

async function renderTablaDocumentos() {
  selectedDoc = null;
  const docs = await window.api.getDocumentos() || [];
  const tbody = document.getElementById('tabla-tipos-documentos');
  
  if (docs.length === 0) return tbody.innerHTML = `<tr><td colspan="2" style="text-align: center;">No hay documentos registrados.</td></tr>`;

  tbody.innerHTML = docs.map(d => {
    const scopeLabel = d.es_override ? 'Personalizado' : d.origen === 'Local' ? 'Empresa' : 'Global';
    const scopeClass = d.es_override ? 'override' : d.origen === 'Local' ? 'local' : 'global';
    return `<tr data-code="${escapeAttr(d.codigo)}" data-desc="${escapeAttr(d.descripcion)}" data-origen="${escapeAttr(d.origen || '')}" data-override="${d.es_override ? 'true' : 'false'}" data-can-delete="${d.puede_eliminar ? 'true' : 'false'}" data-can-rename="${d.puede_cambiar_codigo ? 'true' : 'false'}" data-edit-mode="${escapeAttr(d.modo_edicion || '')}" style="cursor: pointer;">
      <td>${escapeHTML(d.codigo)}</td><td>${escapeHTML(d.descripcion)} <span class="catalog-scope-badge ${scopeClass}">${scopeLabel}</span></td>
    </tr>`;
  }).join('');
}
