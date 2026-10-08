const {
  getCatalogContext,
  resolveWriteTarget,
  getMergedCatalog,
  getByCode,
  validateRename
} = require('../services/catalogos/catalogoScope');

function determinarTipoPorElemento(codigo) {
  const elemento = String(codigo).trim().charAt(0);
  switch (elemento) {
    case '1': case '2': case '3': return 'Activo';
    case '4': return 'Pasivo';
    case '5': return 'Patrimonio';
    case '6': return 'Gastos';
    case '7': return 'Ingresos';
    case '8': return 'Resultados';
    case '9': return 'Gestión';
    case '0': return 'Cuentas de Orden';
    default: return 'Desconocido';
  }
}

function getPlanCuentas() {
  try {
    // Catálogo efectivo: la empresa hereda la base global y cualquier fila
    // local con el mismo código la reemplaza visual y funcionalmente.
    return getMergedCatalog('plan_cuentas');
  } catch (error) {
    console.error("Error obteniendo plan de cuentas:", error);
    return [];
  }
}

function addCuenta(data) {
  try {
    const codigo = String(data.codigo || '').trim();
    const descripcion = String(data.descripcion || '').trim();
    if (!codigo || !descripcion) return { success: false, error: 'Código y descripción son obligatorios.' };

    // Restricción histórica del módulo.
    if (codigo.length <= 2) {
      return { success: false, error: "No se pueden crear cuentas de 1 o 2 dígitos manualmente." };
    }

    const context = getCatalogContext();
    const localExisting = context.localDb ? getByCode(context.localDb, 'plan_cuentas', codigo) : null;
    const globalExisting = getByCode(context.globalDb, 'plan_cuentas', codigo);

    if (localExisting) {
      return { success: false, error: 'Este código ya existe en el catálogo de la empresa. Use Editar para modificarlo.' };
    }
    if (globalExisting) {
      return {
        success: false,
        error: context.hasCompany
          ? 'Este código ya existe en el catálogo global. Selecciónelo y use Editar para crear una personalización exclusiva de esta empresa.'
          : 'Este código ya existe en el catálogo global.'
      };
    }

    const estadoResultados = Number(data.estado_resultados || 0) === 1 ? 1 : 0;
    if (estadoResultados && !['6', '7', '8'].includes(codigo.charAt(0))) {
      return { success: false, error: 'Solo las cuentas de los elementos 6, 7 y 8 pueden habilitarse para Estado de Resultados. Estas cuentas alimentan las columnas NATURALEZA del Balance de Comprobación.' };
    }
    const stmt = context.writeDb.prepare(`
      INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(codigo, descripcion, data.tipo || determinarTipoPorElemento(codigo), Number(data.nivel) || codigo.length, estadoResultados);
    return { success: true, scope: context.writeScope };
  } catch (error) {
    console.error("Error agregando cuenta:", error);
    return { success: false, error: error.message };
  }
}

function updateCuenta(data) {
  try {
    const oldCodigo = String(data.old_codigo || data.codigo || '').trim();
    const codigo = String(data.codigo || '').trim();
    const descripcion = String(data.descripcion || '').trim();
    if (!oldCodigo || !codigo || !descripcion) return { success: false, error: 'Código y descripción son obligatorios.' };

    if (oldCodigo.length <= 3) {
      return { success: false, error: "Las cuentas principales de 3 dígitos o menos no pueden ser editadas." };
    }

    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'plan_cuentas', oldCodigo) : null;
    const globalRow = getByCode(context.globalDb, 'plan_cuentas', oldCodigo);
    if (!localRow && !globalRow) return { success: false, error: 'La cuenta no existe.' };

    const renameError = validateRename({
      context,
      tableName: 'plan_cuentas',
      oldCodigo,
      newCodigo: codigo,
      localExists: Boolean(localRow),
      globalExists: Boolean(globalRow)
    });
    if (renameError) return { success: false, error: renameError };

    const tipo = data.tipo || determinarTipoPorElemento(codigo);
    const nivel = Number(data.nivel) || codigo.length;
    const estadoResultados = Number(data.estado_resultados || 0) === 1 ? 1 : 0;
    if (estadoResultados && !['6', '7', '8'].includes(codigo.charAt(0))) {
      return { success: false, error: 'Solo las cuentas de los elementos 6, 7 y 8 pueden habilitarse para Estado de Resultados. Estas cuentas alimentan las columnas NATURALEZA del Balance de Comprobación.' };
    }

    if (context.hasCompany) {
      if (localRow) {
        context.localDb.prepare(`
          UPDATE plan_cuentas
          SET codigo = ?, descripcion = ?, tipo = ?, nivel = ?, estado_resultados = ?
          WHERE codigo = ?
        `).run(codigo, descripcion, tipo, nivel, estadoResultados, oldCodigo);
        return { success: true, scope: 'Local', override: Boolean(globalRow) };
      }

      // Una fila global heredada nunca se modifica desde una empresa. Se crea
      // una copia local con la misma clave que pasa a tener prioridad.
      context.localDb.prepare(`
        INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
        VALUES (?, ?, ?, ?, ?)
      `).run(oldCodigo, descripcion, tipo, nivel, estadoResultados);
      return { success: true, scope: 'Local', override: true, createdOverride: true };
    }

    context.globalDb.prepare(`
      UPDATE plan_cuentas
      SET codigo = ?, descripcion = ?, tipo = ?, nivel = ?, estado_resultados = ?
      WHERE codigo = ?
    `).run(codigo, descripcion, tipo, nivel, estadoResultados, oldCodigo);
    return { success: true, scope: 'Global' };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { success: false, error: "El nuevo código de cuenta ya está en uso." };
    console.error("Error actualizando cuenta:", error);
    return { success: false, error: error.message };
  }
}


function setEstadoResultados(codigoInput, enabledInput) {
  try {
    const codigo = String(codigoInput || '').trim();
    const enabled = Number(enabledInput) === 1 || enabledInput === true ? 1 : 0;
    if (!codigo) return { success: false, error: 'Código de cuenta obligatorio.' };
    if (enabled && !['6', '7', '8'].includes(codigo.charAt(0))) {
      return { success: false, error: 'Solo las cuentas de los elementos 6, 7 y 8 pueden habilitarse para Estado de Resultados.' };
    }

    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'plan_cuentas', codigo) : null;
    const globalRow = getByCode(context.globalDb, 'plan_cuentas', codigo);
    if (!localRow && !globalRow) return { success: false, error: 'La cuenta no existe.' };

    if (context.hasCompany) {
      if (localRow) {
        context.localDb.prepare('UPDATE plan_cuentas SET estado_resultados=? WHERE codigo=?').run(enabled, codigo);
        return { success: true, scope: 'Local', override: Boolean(globalRow), estado_resultados: enabled };
      }

      // La cuenta heredada global no se modifica desde una empresa. Crear un
      // override local idéntico cambiando solo la habilitación ER.
      context.localDb.prepare(`
        INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        codigo,
        globalRow.descripcion || '',
        globalRow.tipo || determinarTipoPorElemento(codigo),
        Number(globalRow.nivel) || codigo.length,
        enabled
      );
      return { success: true, scope: 'Local', override: true, createdOverride: true, estado_resultados: enabled };
    }

    context.globalDb.prepare('UPDATE plan_cuentas SET estado_resultados=? WHERE codigo=?').run(enabled, codigo);
    return { success: true, scope: 'Global', estado_resultados: enabled };
  } catch (error) {
    console.error('Error actualizando switch ER:', error);
    return { success: false, error: error.message };
  }
}

function deleteCuenta(codigoInput) {
  try {
    const codigo = String(codigoInput || '').trim();
    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'plan_cuentas', codigo) : null;
    const globalRow = getByCode(context.globalDb, 'plan_cuentas', codigo);

    if (context.hasCompany) {
      if (localRow) {
        context.localDb.prepare('DELETE FROM plan_cuentas WHERE codigo = ?').run(codigo);
        return {
          success: true,
          scope: 'Local',
          restoredGlobal: Boolean(globalRow),
          message: globalRow
            ? 'Se eliminó la personalización de esta empresa y se restauró la cuenta del catálogo global.'
            : 'La cuenta fue eliminada del catálogo de esta empresa.'
        };
      }
      if (globalRow) {
        return {
          success: false,
          code: 'GLOBAL_READONLY',
          error: 'Esta cuenta pertenece al catálogo global y no puede eliminarse desde una empresa. El catálogo global se administra sin una empresa activa.'
        };
      }
      return { success: false, error: 'La cuenta no existe.' };
    }

    const info = context.globalDb.prepare('DELETE FROM plan_cuentas WHERE codigo = ?').run(codigo);
    if (info.changes === 0) return { success: false, error: 'La cuenta no existe.' };
    return { success: true, scope: 'Global' };
  } catch (error) {
    console.error("Error eliminando cuenta:", error);
    return { success: false, error: error.message };
  }
}

function importFromExcel(filePath, options = {}) {
  try {
    const xlsx = require('xlsx');
    const context = resolveWriteTarget(options.scope || 'Auto');
    const db = context.writeDb;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    
    // Leer como array de arrays para poder saltar los títulos del principio
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    let headerRowIndex = -1;
    let colCodigo = -1;
    let colDesc = -1;
    let colTipo = -1;
    let colNivel = -1;
    let colEstadoResultados = -1;

    // 1. Buscar la fila que contiene las cabeceras reales (CÓDIGO y DESCRIPCIÓN)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      for (let j = 0; j < row.length; j++) {
        const cellVal = String(row[j] || '').toUpperCase().trim();
        if (cellVal === 'CÓDIGO' || cellVal === 'CODIGO' || cellVal === 'CUENTA') colCodigo = j;
        if (cellVal.includes('DESCRIPCIÓN') || cellVal.includes('DESCRIPCION') || cellVal.includes('NOMBRE')) colDesc = j;
        if (cellVal === 'TIPO') colTipo = j;
        if (cellVal === 'NIVEL') colNivel = j;
        if (cellVal === 'ESTADO RESULTADOS' || cellVal === 'ESTADO DE RESULTADOS' || cellVal === 'ER') colEstadoResultados = j;
      }

      if (colCodigo !== -1 && colDesc !== -1) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return { success: false, error: "No se encontraron las columnas 'CÓDIGO' y 'DESCRIPCIÓN' en el Excel." };
    }

    let imported = 0;
    let overrides = 0;
    const insert = db.prepare(`
      INSERT INTO plan_cuentas (codigo, descripcion, tipo, nivel, estado_resultados) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(codigo) DO UPDATE SET 
        descripcion=excluded.descripcion, 
        tipo=excluded.tipo, 
        nivel=excluded.nivel,
        estado_resultados=excluded.estado_resultados
    `);

    const transaction = db.transaction((dataRows) => {
      // Empezar a leer justo debajo de la fila donde encontramos los encabezados
      for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        const codigo = String(row[colCodigo] || '').trim();
        const descripcion = String(row[colDesc] || '').trim();
        
        // Ignorar si la fila está vacía
        if (!codigo || !descripcion) continue;

        let tipo = colTipo !== -1 ? String(row[colTipo] || '').trim() : '';
        if (!tipo) tipo = determinarTipoPorElemento(codigo);

        let nivel = colNivel !== -1 ? parseInt(row[colNivel], 10) : NaN;
        if (!nivel || isNaN(nivel)) nivel = codigo.length;

        let estadoResultados = 0;
        if (colEstadoResultados !== -1) {
          const rawER = String(row[colEstadoResultados] ?? '').trim().toLowerCase();
          estadoResultados = ['1','si','sí','true','x','er'].includes(rawER) ? 1 : 0;
        }
        if (estadoResultados && !['6','7','8'].includes(codigo.charAt(0))) estadoResultados = 0;

        if (context.writeScope === 'Local' && getByCode(context.globalDb, 'plan_cuentas', codigo)) overrides++;
        insert.run(codigo, descripcion, tipo, nivel, estadoResultados);
        imported++;
      }
    });

    transaction(rows);
    return { success: true, count: imported, overrides, scope: context.writeScope };
  } catch (error) {
    console.error("Error importando Excel:", error);
    return { success: false, error: error.message };
  }
}

function exportToExcel(filePath) {
  try {
    const xlsx = require('xlsx');
    const cuentas = getPlanCuentas();
    
    const data = cuentas.map(c => ({
      'Cuenta': c.codigo,
      'Nombre de la cuenta': c.descripcion,
      'Tipo': c.tipo || '',
      'Nivel': c.nivel || String(c.codigo).length,
      'Estado de Resultados': Number(c.estado_resultados || 0) === 1 ? 'Sí' : 'No'
    }));
    
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'PlanContable');
    xlsx.writeFile(workbook, filePath);
    
    return { success: true };
  } catch (error) {
    console.error("Error exportando Excel:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { getPlanCuentas, addCuenta, updateCuenta, setEstadoResultados, deleteCuenta, importFromExcel, exportToExcel };