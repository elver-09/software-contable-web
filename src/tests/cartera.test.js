'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clasificar } = require('../main/domain/cartera');

const ROOT = path.join(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

test('cartera clasifica vencidos, hoy, próximos 7 días y pendientes', () => {
  assert.equal(clasificar('2026-08-10', '2026-08-13').estado, 'VENCIDO');
  assert.equal(clasificar('2026-08-13', '2026-08-13').estado, 'HOY');
  assert.equal(clasificar('2026-08-20', '2026-08-13').estado, 'PROXIMO');
  assert.equal(clasificar('2026-08-21', '2026-08-13').estado, 'PENDIENTE');
});

test('Cartera y Vencimientos queda conectada al sidebar y es responsive', () => {
  const html = read('renderer/index.html');
  const app = read('renderer/js/app.js');
  const cartera = read('renderer/js/modules/cartera.js');
  const dashboard = read('renderer/js/modules/dashboard.js');

  assert.match(html, /data-target="view-cartera"/);
  assert.match(html, /id="view-cartera"/);
  assert.match(app, /initCartera/);
  assert.match(cartera, /@media\(max-width:760px\)/);
  assert.match(cartera, /data-label="Estado"/);
  assert.match(cartera, /Próximos 7 días/);
  assert.match(dashboard, /Ver en Cartera y Vencimientos/);
  assert.doesNotMatch(dashboard, /db-vencidos-list/);
});
