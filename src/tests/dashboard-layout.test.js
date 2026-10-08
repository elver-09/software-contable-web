'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardPath = path.join(__dirname, '../renderer/js/modules/dashboard.js');
const source = fs.readFileSync(dashboardPath, 'utf8');

test('dashboard usa paneles a ancho completo y estado vacío compacto', () => {
  assert.match(source, /\.ndb-panel\{[^}]*width:100%/);
  assert.match(source, /\.ndb-panel\{[^}]*box-sizing:border-box/);
  assert.doesNotMatch(source, /ndb-empty-state\{height:100%;min-height:280px/);
  assert.match(source, /class=\\?"ndb-clear-state/);
});

test('panel de alertas no repite Debe/Haber', () => {
  const alertsStart = source.indexOf('<div class="ndb-panel ndb-panel--alerts');
  const footerStart = source.indexOf('<div class="ndb-footer">', alertsStart);
  assert.ok(alertsStart >= 0 && footerStart > alertsStart);
  const alertsHtml = source.slice(alertsStart, footerStart);
  assert.doesNotMatch(alertsHtml, /Debe del mes/);
  assert.doesNotMatch(alertsHtml, /Haber del mes/);
  assert.match(alertsHtml, /Alertas y seguimiento/);
});
