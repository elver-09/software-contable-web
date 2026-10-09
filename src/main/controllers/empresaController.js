const { normalizarPeriodo, esPeriodoValido, esPeriodoDisponible } = require('../../renderer/js/utils/periodoTrabajo.mjs');
const empresaRepository = require('../repositories/empresaRepository.js');
const { getDB, renombrarEmpresa } = require('../database/db');

function getInfoEmpresa() {
  // getDB() lanza si no existe una empresa conectada. No ocultamos ese estado
  // devolviendo {}, porque el renderer necesita distinguir 'sin empresa' de
  // 'empresa conectada pero todavía sin datos de perfil'.
  const db = getDB();
  return empresaRepository.obtenerPerfil(db) || {};
}

function updateInfoEmpresa(data) {
  let restaurarDirectorio;
  try {
    const nombre=String(data?.nombre||'').trim();
    if(!nombre || nombre.length>200 || /[\/\\\x00-\x1f]/.test(nombre)) throw new Error('Ingrese un nombre de empresa válido de hasta 200 caracteres, sin barras.');
    const db = getDB();
    db.transaction(()=>{
      const stmt = empresaRepository.prepararGuardadoPerfil(db);
      stmt.run(nombre, data.ruc ?? null, data.direccion ?? null, data.telefono ?? null, data.correo ?? null, data.periodo ?? empresaRepository.obtenerPerfil(db)?.periodo_contable ?? null, data.logo ?? null);
      restaurarDirectorio=renombrarEmpresa(nombre);
    })();
    return { success: true };
  } catch (error) {
    if(restaurarDirectorio) restaurarDirectorio();
    return { success: false, error: error.message };
  }
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