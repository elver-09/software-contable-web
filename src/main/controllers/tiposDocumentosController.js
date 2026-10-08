const tiposDocumentosRepository = require('../repositories/tiposDocumentosRepository.js');
const {
  getCatalogContext,
  resolveWriteTarget,
  getMergedCatalog,
  getByCode,
  validateRename
} = require('../services/catalogos/catalogoScope');

function getDocumentos() {
  try {
    return getMergedCatalog('tipos_documentos');
  } catch (error) {
    console.error('Error obteniendo tipos de documentos:', error);
    return [];
  }
}

function addDocumento(data) {
  try {
    let codigo = String(data.codigo || '').trim();
    const descripcion = String(data.descripcion || '').trim();
    if (!codigo || !descripcion) return { success: false, error: 'Código y descripción son obligatorios.' };
    if (codigo.length === 1) codigo = `0${codigo}`;

    const context = getCatalogContext();
    const localExisting = context.localDb ? getByCode(context.localDb, 'tipos_documentos', codigo) : null;
    const globalExisting = getByCode(context.globalDb, 'tipos_documentos', codigo);

    if (localExisting) {
      return { success: false, error: 'Este código ya existe en los documentos de la empresa. Use Editar para modificarlo.' };
    }
    if (globalExisting) {
      return {
        success: false,
        error: context.hasCompany
          ? 'Este código ya existe en el catálogo global. Selecciónelo y use Editar para personalizar su descripción únicamente para esta empresa.'
          : 'Este código ya existe en el catálogo global.'
      };
    }

    tiposDocumentosRepository.addDocumento_run_tipos_documentos(context.writeDb, codigo, descripcion);
    return { success: true, scope: context.writeScope };
  } catch (error) {
    console.error('Error agregando documento:', error);
    return { success: false, error: error.message };
  }
}

function updateDocumento(data) {
  try {
    let oldCodigo = String(data.old_codigo || data.codigo || '').trim();
    let codigo = String(data.codigo || '').trim();
    const descripcion = String(data.descripcion || '').trim();
    if (oldCodigo.length === 1) oldCodigo = `0${oldCodigo}`;
    if (codigo.length === 1) codigo = `0${codigo}`;
    if (!oldCodigo || !codigo || !descripcion) return { success: false, error: 'Código y descripción son obligatorios.' };

    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'tipos_documentos', oldCodigo) : null;
    const globalRow = getByCode(context.globalDb, 'tipos_documentos', oldCodigo);
    if (!localRow && !globalRow) return { success: false, error: 'El documento no existe.' };

    const renameError = validateRename({
      context,
      tableName: 'tipos_documentos',
      oldCodigo,
      newCodigo: codigo,
      localExists: Boolean(localRow),
      globalExists: Boolean(globalRow)
    });
    if (renameError) return { success: false, error: renameError };

    if (context.hasCompany) {
      if (localRow) {
        tiposDocumentosRepository.updateDocumento_run_tipos_documentos(context.localDb, codigo, descripcion, oldCodigo);
        return { success: true, scope: 'Local', override: Boolean(globalRow) };
      }

      tiposDocumentosRepository.updateDocumento_run_tipos_documentos_2(context.localDb, oldCodigo, descripcion);
      return { success: true, scope: 'Local', override: true, createdOverride: true };
    }

    tiposDocumentosRepository.updateDocumento_run_tipos_documentos_3(context.globalDb, codigo, descripcion, oldCodigo);
    return { success: true, scope: 'Global' };
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { success: false, error: 'El nuevo código ya está en uso.' };
    console.error('Error actualizando documento:', error);
    return { success: false, error: error.message };
  }
}

function deleteDocumento(codigoInput) {
  try {
    let codigo = String(codigoInput || '').trim();
    if (codigo.length === 1) codigo = `0${codigo}`;
    const context = getCatalogContext();
    const localRow = context.localDb ? getByCode(context.localDb, 'tipos_documentos', codigo) : null;
    const globalRow = getByCode(context.globalDb, 'tipos_documentos', codigo);

    if (context.hasCompany) {
      if (localRow) {
        tiposDocumentosRepository.deleteDocumento_run_tipos_documentos(context.localDb, codigo);
        return {
          success: true,
          scope: 'Local',
          restoredGlobal: Boolean(globalRow),
          message: globalRow
            ? 'Se eliminó la personalización de esta empresa y se restauró el documento del catálogo global.'
            : 'El documento fue eliminado del catálogo de esta empresa.'
        };
      }
      if (globalRow) {
        return {
          success: false,
          code: 'GLOBAL_READONLY',
          error: 'Este documento pertenece al catálogo global y no puede eliminarse desde una empresa. El catálogo global se administra sin una empresa activa.'
        };
      }
      return { success: false, error: 'El documento no existe.' };
    }

    const info = tiposDocumentosRepository.deleteDocumento_run_tipos_documentos_2(context.globalDb, codigo);
    if (info.changes === 0) return { success: false, error: 'El documento no existe.' };
    return { success: true, scope: 'Global' };
  } catch (error) {
    console.error('Error eliminando documento:', error);
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
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    let headerRowIndex = -1;
    let colCodigo = -1;
    let colDesc = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      for (let j = 0; j < row.length; j++) {
        const cellVal = String(row[j] || '').toUpperCase().trim();
        if (cellVal === 'N°' || cellVal === 'Nº' || cellVal === 'N' || cellVal === 'CÓDIGO' || cellVal === 'CODIGO') colCodigo = j;
        if (cellVal.includes('DESCRIPCIÓN') || cellVal.includes('DESCRIPCION') || cellVal.includes('DOCUMENTO')) colDesc = j;
      }

      if (colCodigo !== -1 && colDesc !== -1) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return { success: false, error: "No se encontraron las columnas 'N°' y 'DESCRIPCIÓN' en el Excel." };
    }

    let imported = 0;
    let overrides = 0;
    const insert = tiposDocumentosRepository.importFromExcel_prepare_tipos_documentos(db);

    db.transaction((dataRows) => {
      for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        let codigo = String(row[colCodigo] || '').trim();
        const descripcion = String(row[colDesc] || '').trim();
        if (!codigo || !descripcion) continue;
        if (codigo.length === 1) codigo = `0${codigo}`;

        if (context.writeScope === 'Local' && getByCode(context.globalDb, 'tipos_documentos', codigo)) overrides++;
        insert.run(codigo, descripcion);
        imported++;
      }
    })(rows);

    return { success: true, count: imported, overrides, scope: context.writeScope };
  } catch (error) {
    console.error('Error importando Excel (Documentos):', error);
    return { success: false, error: error.message };
  }
}

module.exports = { getDocumentos, addDocumento, updateDocumento, deleteDocumento, importFromExcel };
