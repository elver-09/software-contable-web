const { normalizarPeriodo, esPeriodoValido, esPeriodoDisponible } = require('../../renderer/js/utils/periodoTrabajo.mjs');
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
    stmt.run(data.nombre, data.ruc, data.direccion, data.telefono, data.correo, data.periodo ?? empresaRepository.obtenerPerfil(db)?.periodo_contable ?? null, data.logo);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
}

function getPeriodoTrabajo() {
  try {
    const perfil = empresaRepository.obtenerPerfil(getDB());
    return {success:true, periodo:normalizarPeriodo(perfil?.periodo_contable)};
  } catch (error) { return {success:false, error:error.message}; }
}
function setPeriodoTrabajo(data) {
  try {
    if (!esPeriodoValido(data?.periodo)) throw new Error('Seleccione un mes válido y un ejercicio entre 1900 y 9999.');
    if (!esPeriodoDisponible(data.periodo)) throw new Error('No se puede seleccionar un período posterior al mes actual.');
    empresaRepository.guardarPeriodo(getDB(), data.periodo);
    return {success:true, periodo:data.periodo};
  } catch (error) { return {success:false, error:error.message}; }
}
module.exports = { getInfoEmpresa, updateInfoEmpresa, getPeriodoTrabajo, setPeriodoTrabajo };