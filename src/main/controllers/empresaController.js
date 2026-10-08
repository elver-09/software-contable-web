const empresaRepository = require('../repositories/empresaRepository.js');
const { getDB } = require('../database/db');

function getInfoEmpresa() {
  // getDB() lanza si no existe una empresa conectada. No ocultamos ese estado
  // devolviendo {}, porque el renderer necesita distinguir 'sin empresa' de
  // 'empresa conectada pero todavía sin datos de perfil'.
  const db = getDB();
  return empresaRepository.obtenerPerfil(db) || {};
}

function updateInfoEmpresa(data) {
  try {
    const db = getDB();
    const stmt = empresaRepository.prepararGuardadoPerfil(db);
    stmt.run(data.nombre, data.ruc, data.direccion, data.telefono, data.correo, data.periodo, data.logo);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
}

module.exports = { getInfoEmpresa, updateInfoEmpresa };