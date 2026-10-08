const {
  getCatalogContext,
  resolveWriteTarget,
  getMergedCatalog,
  getByCode,
  validateRename
} = require('../services/catalogos/catalogoScope');

function getEntidades(options = {}) {
  try {
    return getMergedCatalog('entidades');
  } catch (error) {
    console.error("Error obteniendo entidades:", error);
    if (options && options.throwOnError) throw error;
    return [];
  }
}

function addEntidad(data) {
  try {
    const codigo = String(data.codigo || '').trim();
    const razonSocial = String(data.razon_social || '').trim();
    if (!codigo || !razonSocial) return { success: false, error: 'Código y razón social son obligatorios.' };

    const context = getCatalogContext();
    const localExisting = context.localDb ? getByCode(context.localDb, 'entidades', codigo) : null;
    const globalExisting = getByCode(context.globalDb, 'entidades', codigo);

    if (localExisting) {
      return { success: false, error: 'Este código ya existe en las entidades de la empresa. Use Editar para modificarlo.' };
    }
    if (globalExisting) {
      return {
        success: false,
        error: context.hasCompany
          ? 'Esta entidad ya existe en el catálogo global. Selecciónela y use Editar para crear una personalización exclusiva de esta empresa.'
          : 'Esta entidad ya existe en el catálogo global.'
      };
    }

    context.writeDb.prepare(`
      INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento)
      VALUES (?, ?, ?, ?)
    `).run(codigo, razonSocial, data.tipo || 'Cliente', data.tipo_documento || '');

    return { success: true, scope: context.writeScope };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function updateEntidad(data) {
  try {
    const oldCodigo = String(data.old_codigo || data.codigo || '').trim();
    const codigo = String(data.codigo || '').trim();
    const razonSocial = String(data.razon_social || '').trim();
    const td = String(data.tipo_documento || '').trim();
    if (!oldCodigo || !codigo || !razonSocial) return { success: false, error: 'Código y razón social son obligatorios.' };

    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'entidades', oldCodigo) : null;
    const globalRow = getByCode(context.globalDb, 'entidades', oldCodigo);
    if (!localRow && !globalRow) return { success: false, error: 'El registro no existe.' };

    const renameError = validateRename({
      context,
      tableName: 'entidades',
      oldCodigo,
      newCodigo: codigo,
      localExists: Boolean(localRow),
      globalExists: Boolean(globalRow)
    });
    if (renameError) return { success: false, error: renameError };

    if (context.hasCompany) {
      if (localRow) {
        context.localDb.prepare(`
          UPDATE entidades
          SET codigo = ?, razon_social = ?, tipo = ?, tipo_documento = ?
          WHERE codigo = ?
        `).run(codigo, razonSocial, data.tipo || 'Cliente', td, oldCodigo);
        return { success: true, scope: 'Local', override: Boolean(globalRow) };
      }

      context.localDb.prepare(`
        INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento)
        VALUES (?, ?, ?, ?)
      `).run(oldCodigo, razonSocial, data.tipo || 'Cliente', td);
      return { success: true, scope: 'Local', override: true, createdOverride: true };
    }

    context.globalDb.prepare(`
      UPDATE entidades
      SET codigo = ?, razon_social = ?, tipo = ?, tipo_documento = ?
      WHERE codigo = ?
    `).run(codigo, razonSocial, data.tipo || 'Cliente', td, oldCodigo);
    return { success: true, scope: 'Global' };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { success: false, error: 'El nuevo código ya está en uso.' };
    return { success: false, error: error.message };
  }
}

function deleteEntidad(codigoInput) {
  try {
    const codigo = String(codigoInput || '').trim();
    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'entidades', codigo) : null;
    const globalRow = getByCode(context.globalDb, 'entidades', codigo);

    if (context.hasCompany) {
      if (localRow) {
        context.localDb.prepare('DELETE FROM entidades WHERE codigo = ?').run(codigo);
        return {
          success: true,
          scope: 'Local',
          restoredGlobal: Boolean(globalRow),
          message: globalRow
            ? 'Se eliminó la personalización de esta empresa y se restauró la entidad del catálogo global.'
            : 'La entidad fue eliminada del catálogo de esta empresa.'
        };
      }
      if (globalRow) {
        return {
          success: false,
          code: 'GLOBAL_READONLY',
          error: 'Esta entidad pertenece al catálogo global y no puede eliminarse desde una empresa. El catálogo global se administra sin una empresa activa.'
        };
      }
      return { success: false, error: 'El registro no existe.' };
    }

    const info = context.globalDb.prepare('DELETE FROM entidades WHERE codigo = ?').run(codigo);
    if (info.changes === 0) return { success: false, error: 'El registro no existe.' };
    return { success: true, scope: 'Global' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function importFromExcel(filePath, options = {}) {
  try {
    const xlsx = require('xlsx');
    const context = resolveWriteTarget(options.scope || 'Auto');
    const targetDb = context.writeDb;
    
    const workbook = xlsx.readFile(filePath);
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    let headerRowIndex = -1, colCodigo = -1, colRazon = -1, colTipo = -1;

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || rows[i].length === 0) continue;
      for (let j = 0; j < rows[i].length; j++) {
        const cellVal = String(rows[i][j] || '').toUpperCase().trim();
        if (cellVal.includes('CÓDIGO') || cellVal.includes('CODIGO') || cellVal.includes('RUC') || cellVal.includes('DNI')) colCodigo = j;
        if (cellVal.includes('RAZÓN') || cellVal.includes('RAZON') || cellVal.includes('NOMBRE')) colRazon = j;
        if (cellVal === 'TIPO') colTipo = j;
      }
      if (colCodigo !== -1 && colRazon !== -1) { headerRowIndex = i; break; }
    }

    if (headerRowIndex === -1) return { success: false, error: "No se encontraron las columnas (RUC/DNI y RAZÓN SOCIAL)." };
    
    let imported = 0;
    let overrides = 0;
    const insert = targetDb.prepare(`INSERT INTO entidades (codigo, razon_social, tipo, tipo_documento) VALUES (?, ?, ?, ?) ON CONFLICT(codigo) DO UPDATE SET razon_social=excluded.razon_social, tipo=excluded.tipo, tipo_documento=excluded.tipo_documento`);
    // Detecta el tipo de documento de identidad por la longitud del código
    const detectarTipoDoc = (cod) => {
      const c = String(cod || '').replace(/\D/g, '');
      if (c.length === 11) return '6'; // RUC
      if (c.length === 8)  return '1'; // DNI
      return '0';                       // Otros
    };

    targetDb.transaction((dataRows) => {
      for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
        let codigo = String(dataRows[i][colCodigo] || '').trim();
        let razon = String(dataRows[i][colRazon] || '').trim();
        let tipo = colTipo !== -1 ? String(dataRows[i][colTipo] || '').trim() : 'Cliente';
        if (!codigo || !razon) continue;
        if (context.writeScope === 'Local' && getByCode(context.globalDb, 'entidades', codigo)) overrides++;
        insert.run(codigo, razon, tipo, detectarTipoDoc(codigo));
        imported++;
      }
    })(rows);
    return { success: true, count: imported, overrides, scope: context.writeScope };
  } catch (error) { return { success: false, error: error.message }; }
}

function exportToExcel(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'No se indicó una ruta válida para exportar el archivo Excel.' };
    }

    // xlsx-js-style ya es usado por el módulo de reportes y permite conservar
    // formato visual. Si no está disponible, xlsx estándar sigue generando
    // correctamente el archivo.
    let xlsx;
    try { xlsx = require('xlsx-js-style'); } catch (_) { xlsx = require('xlsx'); }

    const entidades = getEntidades({ throwOnError: true });
    if (!Array.isArray(entidades)) {
      return { success: false, error: 'No se pudo obtener la lista de clientes y proveedores.' };
    }

    const tiposDocumento = {
      '0': 'Otros',
      '1': 'DNI',
      '4': 'Carné de Extranjería',
      '6': 'RUC',
      '7': 'Pasaporte'
    };

    // Se usa una matriz (AOA) en lugar de json_to_sheet para que el Excel
    // conserve las cabeceras aun cuando no existan registros.
    const rows = [
      ['CÓDIGO / RUC / DNI', 'TIPO DOCUMENTO', 'RAZÓN SOCIAL', 'TIPO', 'ORIGEN'],
      ...entidades.map((entidad) => {
        const tipoDocumento = String(entidad.tipo_documento || '').trim();
        return [
          String(entidad.codigo || '').trim(),
          tiposDocumento[tipoDocumento] || tipoDocumento || 'Otros',
          String(entidad.razon_social || '').trim(),
          String(entidad.tipo || '').trim(),
          entidad.es_override ? 'Empresa (personalizado)' : (entidad.origen === 'Local' ? 'Empresa' : 'Global')
        ];
      })
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(rows);

    // Mantener códigos como texto evita que Excel convierta RUC/DNI en
    // notación científica o elimine ceros a la izquierda.
    for (let row = 1; row <= entidades.length; row++) {
      const codigoCell = worksheet[xlsx.utils.encode_cell({ r: row, c: 0 })];
      if (codigoCell) {
        codigoCell.t = 's';
        codigoCell.z = '@';
      }
    }

    // Presentación básica del archivo. Los estilos se aplican cuando está
    // disponible xlsx-js-style; con xlsx estándar son ignorados sin afectar
    // el contenido del libro.
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'D9E2F3' } },
        bottom: { style: 'thin', color: { rgb: 'D9E2F3' } },
        left: { style: 'thin', color: { rgb: 'D9E2F3' } },
        right: { style: 'thin', color: { rgb: 'D9E2F3' } }
      }
    };

    for (let col = 0; col < 5; col++) {
      const cell = worksheet[xlsx.utils.encode_cell({ r: 0, c: col })];
      if (cell) cell.s = headerStyle;
    }

    worksheet['!cols'] = [
      { wch: 20 }, // Código / RUC / DNI
      { wch: 24 }, // Tipo documento
      { wch: 48 }, // Razón social
      { wch: 18 }, // Cliente / Proveedor
      { wch: 12 }  // Global / Local
    ];
    worksheet['!autofilter'] = { ref: `A1:E${Math.max(1, rows.length)}` };

    const workbook = xlsx.utils.book_new();
    if (workbook.Props) {
      workbook.Props.Title = 'Clientes y Proveedores';
      workbook.Props.Subject = 'Listado de entidades generado desde Ansorito';
    } else {
      workbook.Props = {
        Title: 'Clientes y Proveedores',
        Subject: 'Listado de entidades generado desde Ansorito'
      };
    }

    xlsx.utils.book_append_sheet(workbook, worksheet, 'ClientesProveedores');
    xlsx.writeFile(workbook, filePath, { compression: true });

    // writeFile es síncrono. Comprobar el archivo evita devolver un falso
    // positivo si por algún motivo el archivo no llegó a materializarse.
    const fs = require('fs');
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) {
      return { success: false, error: 'El archivo Excel no pudo ser creado correctamente.' };
    }

    return { success: true, count: entidades.length };
  } catch (error) {
    console.error('Error exportando entidades a Excel:', error);
    return { success: false, error: error.message };
  }
}
module.exports = { getEntidades, addEntidad, updateEntidad, deleteEntidad, importFromExcel, exportToExcel };