'use strict';
const estadoResultadosRepository = require('../repositories/estadoResultadosRepository.js');

const { getDB } = require('../database/db');
const planCuentasController = require('./planCuentasController');
const {
  ER_BLOCKS,
  ER_DEFAULT_BY_KEY,
  calcularEstadoResultados,
} = require('../domain/estadoResultados');

function _parseCuentas(value) {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
  try { return _parseCuentas(JSON.parse(value || '[]')); } catch (_) { return []; }
}

function _normalizeNota(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function _getNotas(db) {
  return estadoResultadosRepository._getNotas_all_config_notas_er(db);
}

function getConfig() {
  try {
    const db = getDB();
    const plan = planCuentasController.getPlanCuentas();
    const disponibles = plan
      .filter(c => Number(c.estado_resultados || 0) === 1)
      .map(c => ({ codigo: String(c.codigo), descripcion: c.descripcion || '', tipo: c.tipo || '', origen: c.origen || '' }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
    const habilitadasSet = new Set(disponibles.map(c => c.codigo));

    const notas = _getNotas(db).map(n => {
      const cuentasGuardadas = _parseCuentas(n.cuentas);
      return {
        ...n,
        cuentas: cuentasGuardadas.filter(c => habilitadasSet.has(c)),
        cuentas_deshabilitadas: cuentasGuardadas.filter(c => !habilitadasSet.has(c)),
        preestablecida: Number(n.preestablecida || 0) === 1,
      };
    });

    return {
      success: true,
      bloques: ER_BLOCKS,
      notas,
      cuentasDisponibles: disponibles,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function saveNota(data) {
  try {
    const db = getDB();
    const id = Number(data?.id || 0);
    const numero = String(data?.numero || '').trim().replace(/\s+/g, ' ');
    const cuentas = _parseCuentas(data?.cuentas);

    if (!id) return { success: false, error: 'Seleccione una nota preestablecida de la Configuración ER.' };
    if (!numero) return { success: false, error: 'El número de nota es obligatorio.' };

    const current = estadoResultadosRepository.saveNota_get_config_notas_er(db, id);
    if (!current) return { success: false, error: 'La nota de Estado de Resultados ya no existe.' };

    const def = current.concepto_key ? ER_DEFAULT_BY_KEY[String(current.concepto_key)] : null;
    if (!def || Number(current.preestablecida || 0) !== 1) {
      return { success: false, error: 'Solo se pueden editar las notas preestablecidas del Estado de Resultados.' };
    }

    // El número de nota debe ser único aunque cambien mayúsculas, minúsculas o espacios.
    const duplicate = _getNotas(db).find(n => Number(n.id) !== id && _normalizeNota(n.numero) === _normalizeNota(numero));
    if (duplicate) {
      return { success: false, error: `La nota “${numero}” ya está utilizada por “${duplicate.nombre}”. Cada número de nota debe ser único.` };
    }

    const plan = planCuentasController.getPlanCuentas();
    const habilitadas = new Map(plan.filter(c => Number(c.estado_resultados || 0) === 1).map(c => [String(c.codigo), c]));
    for (const cuenta of cuentas) {
      if (!habilitadas.has(cuenta)) return { success: false, error: `La cuenta ${cuenta} no está habilitada para Estado de Resultados.` };
      if (!['6', '7', '8'].includes(cuenta.charAt(0))) {
        return { success: false, error: `La cuenta ${cuenta} no alimenta NATURALEZA en el Balance de Comprobación. Solo se admiten elementos 6, 7 y 8.` };
      }
    }

    // Una cuenta exacta solo puede formar parte de una nota ER para evitar doble conteo.
    const otras = _getNotas(db).filter(n => Number(n.id) !== id);
    const usadas = new Map();
    for (const n of otras) {
      for (const c of _parseCuentas(n.cuentas)) usadas.set(c, n.nombre);
    }
    for (const c of cuentas) {
      if (usadas.has(c)) return { success: false, error: `La cuenta ${c} ya está asignada a “${usadas.get(c)}”.` };
    }

    estadoResultadosRepository.saveNota_run_config_notas_er(db, numero, def.nombre, def.bloque, JSON.stringify(cuentas), def.orden, id);
    return { success: true, id };
  } catch (error) {
    if (/idx_config_notas_er_numero_unique|UNIQUE constraint failed/i.test(String(error.message || ''))) {
      return { success: false, error: 'Ese número de nota ya existe. Las notas del Estado de Resultados deben ser únicas.' };
    }
    return { success: false, error: error.message };
  }
}

function deleteNota(idInput) {
  try {
    const db = getDB();
    const id = Number(idInput || 0);
    if (!id) return { success: false, error: 'Nota no válida.' };
    const row = estadoResultadosRepository.deleteNota_get_config_notas_er(db, id);
    if (!row) return { success: false, error: 'La nota ya no existe.' };
    if (Number(row.preestablecida || 0) === 1) {
      return { success: false, error: 'Las notas base del Estado de Resultados son preestablecidas y no pueden eliminarse. Puede cambiar su número o sus cuentas.' };
    }
    estadoResultadosRepository.deleteNota_run_config_notas_er(db, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function _queryBalanceNaturaleza(desde, hasta) {
  const db = getDB();
  const rows = estadoResultadosRepository._queryBalanceNaturaleza_all_voucher_detalles(db, desde, hasta);

  return rows.map(r => {
    const elem = String(r.cuenta || '').charAt(0);
    return {
      ...r,
      nat_perdida: (elem === '6' || elem === '8') ? Number(r.saldo_deudor || 0) : 0,
      nat_ganancia: (elem === '7' || elem === '8') ? Number(r.saldo_acreedor || 0) : 0,
    };
  });
}

function getData({ desde, hasta }) {
  try {
    if (!desde || !hasta) return { success: false, error: 'Debe indicar el período.' };
    const db = getDB();
    const plan = planCuentasController.getPlanCuentas();
    const planMap = new Map(plan.map(c => [String(c.codigo), c]));
    const habilitadas = new Set(plan.filter(c => Number(c.estado_resultados || 0) === 1).map(c => String(c.codigo)));
    const omitidas = [];
    const config = _getNotas(db).map(n => {
      const cuentas = _parseCuentas(n.cuentas);
      const validas = cuentas.filter(c => habilitadas.has(c));
      cuentas.filter(c => !habilitadas.has(c)).forEach(c => omitidas.push({ nota: n.nombre, cuenta: c }));
      return { ...n, cuentas: validas };
    });

    // Enriquecer cada cuenta con el Plan de Cuentas efectivo (Local > Global).
    // De esta forma Notas ER siempre recibe la denominación aunque no exista
    // movimiento de esa cuenta durante el período consultado.
    const balanceMap = new Map(_queryBalanceNaturaleza(desde, hasta).map(b => [String(b.cuenta), b]));
    for (const nota of config) {
      for (const codigo of nota.cuentas) {
        const planRow = planMap.get(codigo);
        const current = balanceMap.get(codigo) || { cuenta: codigo, nat_perdida: 0, nat_ganancia: 0 };
        current.nombre = String(planRow?.descripcion || current.nombre || 'Cuenta sin denominación');
        balanceMap.set(codigo, current);
      }
    }

    const data = calcularEstadoResultados(config, [...balanceMap.values()]);
    data.cuentas_omitidas = omitidas;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getConfig, saveNota, deleteNota, getData };
