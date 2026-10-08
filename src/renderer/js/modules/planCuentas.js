import { escapeHTML, escapeAttr } from '../utils/security.js';
// src/renderer/js/modules/planCuentas.js

let planCuentasInitialized = false;
let selectedCuenta = null; // Guardará la cuenta seleccionada en la tabla

export async function initPlanCuentas() {
  await renderTablaCuentas();

  if (planCuentasInitialized) return;
  planCuentasInitialized = true;

  // Botón Importar Excel
  const btnImportarExcel = document.getElementById('btnImportarExcel');
  if (btnImportarExcel) {
    btnImportarExcel.addEventListener('click', async () => {
      btnImportarExcel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
      btnImportarExcel.disabled = true;
      
      const result = await window.api.importarExcelCuentas();
      
      btnImportarExcel.innerHTML = '<i class="fa-solid fa-file-excel"></i> Importar Excel';
      btnImportarExcel.disabled = false;

      if (result.canceled) return;

      if (result.success) {
        const destino = result.scope === 'Local' ? 'esta empresa' : 'el catálogo global';
        const extra = Number(result.overrides || 0) > 0 ? `\n${result.overrides} cuenta(s) personalizan una base global.` : '';
        alert(`¡Importación exitosa! Se procesaron ${result.count} cuentas en ${destino}.${extra}`);
        await renderTablaCuentas();
      } else {
        alert('Error al importar Excel: ' + result.error);
      }
    });
  }

  // Botón Exportar Excel
  const btnExportarExcel = document.getElementById('btnExportarExcel');
  if (btnExportarExcel) {
    btnExportarExcel.addEventListener('click', async () => {
      btnExportarExcel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
      btnExportarExcel.disabled = true;
      
      const result = await window.api.exportarExcelCuentas();
      
      btnExportarExcel.innerHTML = '<i class="fa-solid fa-file-export"></i> Exportar';
      btnExportarExcel.disabled = false;

      if (result && result.canceled) return;
      if (result && result.success) {
        alert('¡Exportación exitosa!');
      } else {
        alert('Error al exportar Excel: ' + (result ? result.error : 'Error desconocido'));
      }
    });
  }

  // Barra de Búsqueda
  const inputBuscarCuenta = document.getElementById('inputBuscarCuenta');
  if (inputBuscarCuenta) {
    inputBuscarCuenta.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#tabla-plan-cuentas tr');

      if (term === '') {
        renderTablaCuentas(); // Restablece el árbol al borrar la búsqueda
        return;
      }

      rows.forEach(row => {
        const text1 = row.cells[0].textContent.toLowerCase();
        const text2 = row.cells[1].textContent.toLowerCase();
        row.style.display = (text1.includes(term) || text2.includes(term)) ? '' : 'none';
      });
    });
  }

  // Botón Editar Cuenta (Global)
  const btnEditarCuenta = document.getElementById('btnEditarCuenta');
  if (btnEditarCuenta) {
    btnEditarCuenta.addEventListener('click', () => {
      if (!selectedCuenta) {
        alert('Por favor, seleccione una cuenta de la tabla primero.');
        return;
      }
      if (selectedCuenta.codigo.length <= 3) {
        alert('Las cuentas principales de 3 dígitos o menos son estructurales y no pueden ser editadas.');
        return;
      }
      const titulo = selectedCuenta.modo_edicion === 'crear_override'
        ? 'Personalizar Cuenta para esta Empresa'
        : selectedCuenta.modo_edicion === 'override'
          ? 'Editar Personalización de Cuenta'
          : selectedCuenta.modo_edicion === 'global'
            ? 'Editar Cuenta Global'
            : 'Editar Cuenta';
      document.getElementById('modalCuentaTitle').textContent = titulo;
      document.getElementById('cuenta_codigo').value = selectedCuenta.codigo;
      document.getElementById('cuenta_old_codigo').value = selectedCuenta.codigo;
      document.getElementById('cuenta_descripcion').value = selectedCuenta.descripcion;
      document.getElementById('cuenta_tipo').value = selectedCuenta.tipo || '';
      document.getElementById('cuenta_is_edit').value = 'true';
      document.getElementById('cuenta_codigo').readOnly = !selectedCuenta.puede_cambiar_codigo;
      document.getElementById('modalCuenta').style.display = 'flex';
    });
  }

  // Botón Eliminar Cuenta (Global)
  const btnEliminarCuenta = document.getElementById('btnEliminarCuenta');
  if (btnEliminarCuenta) {
    btnEliminarCuenta.addEventListener('click', async () => {
      if (!selectedCuenta) {
        alert('Por favor, seleccione una cuenta de la tabla primero.');
        return;
      }
      if (selectedCuenta.codigo.length <= 3) {
        alert('Las cuentas principales de 3 dígitos o menos son estructurales y no pueden ser eliminadas.');
        return;
      }
      if (!selectedCuenta.puede_eliminar) {
        alert('Esta cuenta pertenece al catálogo global. Desde una empresa puede personalizarla con Editar, pero no eliminar la base compartida.');
        return;
      }
      const pregunta = selectedCuenta.es_override
        ? `¿Eliminar la personalización de ${selectedCuenta.codigo}? Se restaurará la versión del catálogo global para esta empresa.`
        : selectedCuenta.origen === 'Global'
          ? `¿Eliminar la cuenta global ${selectedCuenta.codigo}? Este cambio afectará a todas las empresas que la heredan.`
          : `¿Estás seguro de eliminar la cuenta ${selectedCuenta.codigo} de esta empresa?`;
      if (confirm(pregunta)) {
        const result = await window.api.deleteCuenta(selectedCuenta.codigo);
        if (result.success) {
          await renderTablaCuentas();
          if (result.restoredGlobal && result.message) alert(result.message);
        } else alert('Error al eliminar: ' + result.error);
      }
    });
  }

  // Botón Nueva Cuenta
  document.getElementById('btnNuevaCuenta').addEventListener('click', () => {
    document.getElementById('modalCuentaTitle').textContent = 'Nueva Cuenta';
    document.getElementById('formCuenta').reset();
    document.getElementById('cuenta_is_edit').value = 'false';
    document.getElementById('cuenta_old_codigo').value = '';
    document.getElementById('cuenta_codigo').readOnly = false;
    document.getElementById('modalCuenta').style.display = 'flex';
  });

  // Cerrar Modal
  document.getElementById('btnCerrarModalCuenta').addEventListener('click', () => {
    document.getElementById('modalCuenta').style.display = 'none';
  });


  // Auto-completar Tipo según el Elemento (primer dígito)
  document.getElementById('cuenta_codigo').addEventListener('input', (e) => {
    const isEdit = document.getElementById('cuenta_is_edit').value === 'true';
    if (isEdit) return; // No auto-cambiar si estamos editando
    
    const val = e.target.value.trim();
    const tipoSelect = document.getElementById('cuenta_tipo');
    if (val.length > 0) {
      const elemento = val.charAt(0);
      switch (elemento) {
        case '1': case '2': case '3': tipoSelect.value = 'Activo'; break;
        case '4': tipoSelect.value = 'Pasivo'; break;
        case '5': tipoSelect.value = 'Patrimonio'; break;
        case '6': tipoSelect.value = 'Gastos'; break;
        case '7': tipoSelect.value = 'Ingresos'; break;
        case '8': tipoSelect.value = 'Resultados'; break;
        case '9': tipoSelect.value = 'Gestión'; break;
        case '0': tipoSelect.value = 'Cuentas de Orden'; break;
      }
    } else {
      tipoSelect.value = '';
    }
  });

  // Enviar Formulario
  document.getElementById('formCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEdit = document.getElementById('cuenta_is_edit').value === 'true';
    const data = {
      old_codigo: document.getElementById('cuenta_old_codigo').value,
      codigo: document.getElementById('cuenta_codigo').value.trim(),
      descripcion: document.getElementById('cuenta_descripcion').value.trim(),
      tipo: document.getElementById('cuenta_tipo').value,
      nivel: document.getElementById('cuenta_codigo').value.trim().length, // Auto-calcula el nivel por longitud de dígitos
      estado_resultados: isEdit && selectedCuenta?.estado_resultados ? 1 : 0
    };

    // Validación: No permitir crear cuentas de 1 o 2 dígitos manualmente
    if (!isEdit && data.codigo.length <= 2) {
      alert('No está permitido crear cuentas principales de 1 o 2 dígitos manualmente. Estas deben provenir del formato estándar.');
      return;
    }

    let result = isEdit ? await window.api.updateCuenta(data) : await window.api.addCuenta(data);

    if (result.success) {
      document.getElementById('modalCuenta').style.display = 'none';
      await renderTablaCuentas();
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Switch ER directo desde la tabla: no obliga a abrir Editar cuenta.
  document.getElementById('tabla-plan-cuentas').addEventListener('change', async (e) => {
    const sw = e.target.closest('.plan-er-switch');
    if (!sw) return;
    const codigo = sw.dataset.code || '';
    const desired = sw.checked;
    sw.disabled = true;
    const result = await window.api.setCuentaEstadoResultados({ codigo, enabled: desired ? 1 : 0 });
    if (!result?.success) {
      sw.checked = !desired;
      sw.disabled = false;
      alert('No se pudo actualizar Estado de Resultados: ' + (result?.error || 'Error desconocido'));
      return;
    }
    // No redibujar toda la tabla: el switch ER no modifica la jerarquía.
    // Mantener intactos expansión/contracción, selección, búsqueda y scroll.
    const row = sw.closest('tr');
    if (row) {
      row.dataset.estadoResultados = desired ? 'true' : 'false';

      // Si al modificar una cuenta Global se creó un override Local, reflejar
      // únicamente su etiqueta visual sin reconstruir el árbol completo.
      if (result.scope === 'Local') {
        row.dataset.origen = 'Local';
        if (result.override || result.createdOverride) {
          row.dataset.override = 'true';
          const badge = row.querySelector('.catalog-scope-badge');
          if (badge) {
            badge.classList.remove('global', 'local');
            badge.classList.add('override');
            badge.textContent = 'Personalizado';
          }
        }
      }
    }

    if (selectedCuenta && String(selectedCuenta.codigo) === codigo) {
      selectedCuenta.estado_resultados = desired ? 1 : 0;
      if (result.scope === 'Local') {
        selectedCuenta.origen = 'Local';
        if (result.override || result.createdOverride) {
          selectedCuenta.es_override = true;
          selectedCuenta.modo_edicion = 'override';
        }
      }
    }

    sw.disabled = false;
  });

  // Delegación de eventos para editar y eliminar en la tabla
  document.getElementById('tabla-plan-cuentas').addEventListener('click', async (e) => {
    const btnEdit = e.target.closest('.btn-edit-cuenta');
    const btnDelete = e.target.closest('.btn-delete-cuenta');
    const btnToggle = e.target.closest('.toggle-btn');
    if (e.target.closest('.plan-er-switch')) return;

    // --- Lógica para Desplegar/Contraer Subcuentas ---
    if (btnToggle) {
      const code = btnToggle.dataset.code;
      const isExpanded = btnToggle.dataset.expanded === 'true';

      if (isExpanded) {
        // Contraer: ocultar todos los descendientes (subcuentas)
        btnToggle.dataset.expanded = 'false';
        btnToggle.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        const allRows = document.querySelectorAll('#tabla-plan-cuentas tr');
        allRows.forEach(row => {
          const rowCode = row.dataset.code;
          if (rowCode && rowCode !== code && rowCode.startsWith(code)) {
            row.style.display = 'none';
            const childToggle = row.querySelector('.toggle-btn');
            if (childToggle) {
              childToggle.dataset.expanded = 'false';
              childToggle.innerHTML = '<i class="fa-solid fa-chevron-right"></i>'; // Reiniciar iconos hijos
            }
          }
        });
      } else {
        // Expandir: mostrar solo los hijos directos
        btnToggle.dataset.expanded = 'true';
        btnToggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        const childRows = document.querySelectorAll(`#tabla-plan-cuentas tr[data-parent="${code}"]`);
        childRows.forEach(row => {
          row.style.display = '';
        });
      }
      return; // Detener la ejecución si fue un clic de despliegue
    }

    // --- Lógica para Seleccionar Fila ---
    const tr = e.target.closest('tr');
    if (tr) {
      // Desmarcar todas las filas
      document.querySelectorAll('#tabla-plan-cuentas tr').forEach(row => {
        row.style.backgroundColor = '';
      });
      
      // Marcar fila seleccionada
      tr.style.backgroundColor = 'var(--accent-lt)';

      selectedCuenta = {
        codigo: tr.dataset.code,
        descripcion: tr.dataset.descripcion,
        tipo: tr.dataset.tipo,
        origen: tr.dataset.origen || '',
        es_override: tr.dataset.override === 'true',
        puede_eliminar: tr.dataset.canDelete === 'true',
        puede_cambiar_codigo: tr.dataset.canRename === 'true',
        modo_edicion: tr.dataset.editMode || '',
        estado_resultados: tr.dataset.estadoResultados === 'true'
      };
    }
  });
}

async function renderTablaCuentas() {
  // Resetear estado y botones globales al redibujar
  selectedCuenta = null;

  const cuentas = await window.api.getPlanCuentas() || [];
  const tbody = document.getElementById('tabla-plan-cuentas');
  
  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--tx3);">No hay cuentas registradas. Empieza agregando una.</td></tr>`;
    return;
  }

  // 1. Mapear jerarquías: Buscar qué cuenta es padre de quién basándonos en el prefijo del código
  const cuentasMap = new Map();
  cuentas.forEach(c => cuentasMap.set(String(c.codigo), c));

  // Limpiar metadatos calculados por renders anteriores. El mismo objeto puede
  // reutilizarse desde el bridge y no queremos arrastrar hasChildren obsoleto.
  cuentas.forEach(c => {
    c.parentCode = '';
    c.hasChildren = false;
  });

  const childrenMap = new Map();
  const roots = [];

  cuentas.forEach(c => {
    const cod = String(c.codigo);
    let parentCode = '';

    // Buscar como padre el prefijo EXISTENTE más largo. Ej.: si existen
    // 88, 881 y 8811, entonces 8811 depende de 881 y no directamente de 88.
    for (let i = cod.length - 1; i > 0; i--) {
      const prefix = cod.substring(0, i);
      if (cuentasMap.has(prefix)) {
        parentCode = prefix;
        break;
      }
    }

    c.parentCode = parentCode;

    if (parentCode) {
      const parent = cuentasMap.get(parentCode);
      if (parent) parent.hasChildren = true;

      if (!childrenMap.has(parentCode)) childrenMap.set(parentCode, []);
      childrenMap.get(parentCode).push(c);
    } else {
      roots.push(c);
    }
  });

  // La respuesta del backend no tiene por qué venir en orden jerárquico
  // (especialmente después de combinar Global + Local). Si renderizamos ese
  // array directamente, un hijo oculto conserva su posición original y al
  // expandir puede aparecer al final de la tabla. Construimos explícitamente
  // un recorrido preorden: PADRE -> todos sus descendientes -> siguiente raíz.
  const compareCodigo = (a, b) => String(a.codigo).localeCompare(
    String(b.codigo),
    'es',
    { numeric: true, sensitivity: 'base' }
  );

  roots.sort(compareCodigo);
  childrenMap.forEach(children => children.sort(compareCodigo));

  const cuentasOrdenadas = [];
  const depthMap = new Map();
  const visitedCodes = new Set();

  const appendSubtree = (cuenta, depth = 0) => {
    const codigo = String(cuenta.codigo);
    if (visitedCodes.has(codigo)) return;

    visitedCodes.add(codigo);
    cuentasOrdenadas.push(cuenta);
    depthMap.set(codigo, depth);

    const children = childrenMap.get(codigo) || [];
    children.forEach(child => appendSubtree(child, depth + 1));
  };

  roots.forEach(root => appendSubtree(root, 0));

  // Defensa adicional: si por datos anómalos alguna cuenta no quedó enlazada,
  // no la perdemos. La añadimos como raíz independiente una sola vez.
  if (cuentasOrdenadas.length !== cuentas.length) {
    cuentas
      .filter(c => !visitedCodes.has(String(c.codigo)))
      .sort(compareCodigo)
      .forEach(c => appendSubtree(c, 0));
  }

  tbody.innerHTML = cuentasOrdenadas.map(c => {
    // 2. Elementos visuales: Sangría, ocultamiento y botón de flecha (Toggle)
    const cod = String(c.codigo);
    const parentAttr = c.parentCode ? `data-parent="${escapeAttr(c.parentCode)}"` : '';
    const displayStyle = c.parentCode ? 'display: none;' : ''; // Ocultar si tiene padre
    
    const depth = depthMap.get(cod) || 0;
    const indent = depth * 20; // 20px de sangría por cada nivel hacia adentro
    
    const toggleIcon = c.hasChildren 
      ? `<span class="toggle-btn" data-code="${escapeAttr(cod)}" data-expanded="false" style="cursor: pointer; display: inline-block; width: 20px; text-align: center; color: var(--tx); font-weight: bold; user-select: none;"><i class="fa-solid fa-chevron-right"></i></span>`
      : `<span style="display: inline-block; width: 20px;"></span>`; // Espacio vacío si no tiene hijos

    // Estilos para hacer la tabla más compacta (menor alto de fila)
    const tdStyle = "padding: 6px 10px; font-size: 13px; line-height: 1.2; border-bottom: 1px solid var(--brd-lt);";

    const scopeLabel = c.es_override ? 'Personalizado' : c.origen === 'Local' ? 'Empresa' : 'Global';
    const scopeClass = c.es_override ? 'override' : c.origen === 'Local' ? 'local' : 'global';
    const erAllowed = ['6','7','8'].includes(cod.charAt(0));
    const erChecked = Number(c.estado_resultados || 0) === 1;
    const erSwitch = `<input class="plan-er-switch" type="checkbox" data-code="${escapeAttr(cod)}" aria-label="Incluir ${escapeAttr(cod)} en Estado de Resultados" ${erChecked ? 'checked' : ''} ${erAllowed ? '' : 'disabled'} title="${erAllowed ? 'Habilitar esta cuenta para Config. ER' : 'Solo disponible para elementos 6, 7 y 8'}">`;
    return `<tr data-code="${escapeAttr(cod)}" data-descripcion="${escapeAttr(c.descripcion)}" data-tipo="${escapeAttr(c.tipo || '')}" data-origen="${escapeAttr(c.origen || '')}" data-override="${c.es_override ? 'true' : 'false'}" data-can-delete="${c.puede_eliminar ? 'true' : 'false'}" data-can-rename="${c.puede_cambiar_codigo ? 'true' : 'false'}" data-edit-mode="${escapeAttr(c.modo_edicion || '')}" data-estado-resultados="${Number(c.estado_resultados || 0) === 1 ? 'true' : 'false'}" ${parentAttr} style="${displayStyle} cursor: pointer; transition: background-color 0.2s;">
      <td style="${tdStyle} font-weight: ${c.hasChildren ? '600' : 'normal'};">
        <div style="padding-left: ${indent}px; display: flex; align-items: center;">
          ${toggleIcon} ${escapeHTML(c.codigo)}
        </div>
      </td>
      <td style="${tdStyle}">${escapeHTML(c.descripcion)} <span class="catalog-scope-badge ${scopeClass}">${scopeLabel}</span></td>
      <td style="${tdStyle}">${escapeHTML(c.tipo || '')}</td>
      <td style="${tdStyle} text-align:center;">${erSwitch}</td>
    </tr>`;
  }).join('');
}
