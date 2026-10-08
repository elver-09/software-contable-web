// src/main/services/sunat/sireTicketService.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio centralizado de consulta de tickets SIRE.
// Delega al servicio de ventas o compras según el tipo, y actualiza
// el estado en sire_operaciones.
// ─────────────────────────────────────────────────────────────────────────────
const { getDB } = require('../../database/db');
const ventasService = require('./sireVentasService');
const comprasService = require('./sireComprasService');

/**
 * Consulta un ticket y actualiza su estado en sire_operaciones.
 * @param {{ tipo: 'VENTAS'|'COMPRAS', ticket: string }}
 * @returns {Promise<{ ok: boolean, data?: any, error?: string }>}
 */
async function consultarTicket({ tipo, ticket, periodo }) {
  if (!ticket) return { ok: false, error: 'Debe indicar el número de ticket.' };

  const service = String(tipo).toUpperCase() === 'COMPRAS' ? comprasService : ventasService;
  const r = await service.consultarTicket(ticket, periodo);

  // Actualizar la operación en BD si existe
  if (r.ok && r.data) {
    try {
      const db = getDB();
      const estado = r.data.codEstado || r.data.estado || 'DESCONOCIDO';
      const mensaje = r.data.desEstado || r.data.message || '';
      db.prepare(`
        UPDATE sire_operaciones SET estado = ?, mensaje = ?
        WHERE ticket = ? AND tipo = ?
      `).run(estado, mensaje, ticket, String(tipo).toUpperCase());
    } catch (_) {}
  }

  return r;
}


/**
 * Obtiene las operaciones registradas, opcionalmente filtradas.
 * @param {{ tipo?: string, periodo?: string, limit?: number }}
 */
function getOperaciones({ tipo, periodo, limit } = {}) {
  try {
    const db = getDB();
    let sql = 'SELECT * FROM sire_operaciones WHERE 1=1';
    const params = [];
    if (tipo)    { sql += ' AND tipo = ?'; params.push(String(tipo).toUpperCase()); }
    if (periodo) { sql += ' AND periodo = ?'; params.push(periodo); }
    sql += ' ORDER BY id DESC';
    if (limit)   { sql += ' LIMIT ?'; params.push(limit); }
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('sireTicketService.getOperaciones:', err.message);
    return [];
  }
}

/**
 * Obtiene los logs técnicos, opcionalmente filtrados.
 * @param {{ tipo?: string, periodo?: string, limit?: number }}
 */
function getLogs({ tipo, periodo, limit } = {}) {
  try {
    const db = getDB();
    let sql = 'SELECT * FROM sire_logs WHERE 1=1';
    const params = [];
    if (tipo)    { sql += ' AND tipo = ?'; params.push(String(tipo).toUpperCase()); }
    if (periodo) { sql += ' AND periodo = ?'; params.push(periodo); }
    sql += ' ORDER BY id DESC';
    if (limit)   { sql += ' LIMIT ?'; params.push(limit || 100); }
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('sireTicketService.getLogs:', err.message);
    return [];
  }
}

module.exports = { consultarTicket, getOperaciones, getLogs };
