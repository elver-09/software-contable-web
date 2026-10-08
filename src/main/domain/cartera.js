'use strict';

function parseISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function daysBetween(fromISO, toISO) {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  if (!from || !to) return 0;
  const MS_DAY = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS_DAY);
}

function clasificar(fechaVenc, hoyISO) {
  const dias = daysBetween(hoyISO, fechaVenc);
  if (dias < 0) return { estado: 'VENCIDO', dias, etiqueta: `Vencido hace ${Math.abs(dias)} día(s)` };
  if (dias === 0) return { estado: 'HOY', dias, etiqueta: 'Vence hoy' };
  if (dias <= 7) return { estado: 'PROXIMO', dias, etiqueta: `Vence en ${dias} día(s)` };
  return { estado: 'PENDIENTE', dias, etiqueta: `Vence en ${dias} día(s)` };
}

module.exports = { parseISO, daysBetween, clasificar };
