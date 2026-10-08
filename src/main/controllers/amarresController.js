const amarresRepository = require('../repositories/amarresRepository.js');
// src/main/controllers/amarresController.js
const { getDB } = require('../database/db');

// Normaliza y valida los datos que llegan del formulario.
function normalizar(data) {
  const tipo = String(data.tipo || '').toUpperCase().trim();
  const clean = (v) => String(v || '').trim() || null;
  return {
    nombre:         String(data.nombre || '').trim(),
    tipo:           tipo === 'VENTA' ? 'VENTA' : 'COMPRA',
    prefijo:        String(data.prefijo || '').trim(),
    doc_tipo:       String(data.doc_tipo || '').trim(),
    moneda:         String(data.moneda || 'PEN').trim(),
    cuenta_igv:     clean(data.cuenta_igv),       // GRAVADO (18%)
    cuenta_igv_exo: clean(data.cuenta_igv_exo),   // EXONERADO
    cuenta_igv_ina: clean(data.cuenta_igv_ina),   // INAFECTO
    cuenta_destino: String(data.cuenta_destino || '').trim(),
    activo:         Number(data.activo) === 0 ? 0 : 1,
  };
}

// Valida que un código de cuenta tenga entre 3 y 8 dígitos (sólo números).
// Devuelve null si está vacío (campos opcionales), o un string de error si no cumple.
function validarCuenta(codigo, etiqueta) {
  if (codigo === null || codigo === undefined || String(codigo).trim() === '') return null;
  const v = String(codigo).trim();
  if (!/^\d+$/.test(v)) return `La ${etiqueta} debe contener sólo dígitos.`;
  if (v.length < 3)     return `La ${etiqueta} debe tener mínimo 3 dígitos.`;
  if (v.length > 8)     return `La ${etiqueta} debe tener máximo 8 dígitos.`;
  return null;
}

function validarAmarre(a) {
  if (!a.nombre)         return "Ingrese un nombre para el amarre.";
  if (!a.prefijo)        return "Ingrese el prefijo de cuenta (ej. 6).";
  if (!a.cuenta_destino) return "Ingrese la cuenta destino (contrapartida).";
  const errores = [
    validarCuenta(a.cuenta_destino, 'cuenta destino'),
    validarCuenta(a.cuenta_igv,     'cuenta IGV gravado'),
    validarCuenta(a.cuenta_igv_exo, 'cuenta IGV exonerado'),
    validarCuenta(a.cuenta_igv_ina, 'cuenta IGV inafecto'),
  ].filter(Boolean);
  return errores[0] || null;
}

function getAmarres() {
  try {
    const db = getDB();
    return amarresRepository.getAmarres_all_amarres_asistente(db);
  } catch (error) {
    console.error("Error obteniendo amarres:", error);
    return [];
  }
}

function addAmarre(data) {
  try {
    const a = normalizar(data);
    const err = validarAmarre(a);
    if (err) return { success: false, error: err };

    const db = getDB();
    amarresRepository.addAmarre_run_amarres_asistente(db, a.nombre, a.tipo, a.prefijo, a.doc_tipo, a.moneda, a.cuenta_igv, a.cuenta_igv_exo, a.cuenta_igv_ina, a.cuenta_destino, a.activo);
    return { success: true };
  } catch (error) {
    console.error("Error agregando amarre:", error);
    return { success: false, error: error.message };
  }
}

function updateAmarre(data) {
  try {
    const a = normalizar(data);
    if (!data.id) return { success: false, error: "Amarre no identificado." };
    const err = validarAmarre(a);
    if (err) return { success: false, error: err };

    const db = getDB();
    const info = amarresRepository.updateAmarre_run_amarres_asistente(db, a.nombre, a.tipo, a.prefijo, a.doc_tipo, a.moneda, a.cuenta_igv, a.cuenta_igv_exo, a.cuenta_igv_ina, a.cuenta_destino, a.activo, data.id);

    if (info.changes === 0) return { success: false, error: "El amarre no existe." };
    return { success: true };
  } catch (error) {
    console.error("Error actualizando amarre:", error);
    return { success: false, error: error.message };
  }
}

function deleteAmarre(id) {
  try {
    const db = getDB();
    const info = amarresRepository.deleteAmarre_run_amarres_asistente(db, id);
    if (info.changes === 0) return { success: false, error: "El amarre no existe." };
    return { success: true };
  } catch (error) {
    console.error("Error eliminando amarre:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { getAmarres, addAmarre, updateAmarre, deleteAmarre };
