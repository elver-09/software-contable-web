'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('switch ER actualiza la fila sin re-renderizar el árbol del Plan de Cuentas', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../renderer/js/modules/planCuentas.js'),
    'utf8'
  );
  const start = source.indexOf('// Switch ER directo desde la tabla');
  const end = source.indexOf('// Delegación de eventos para editar y eliminar en la tabla', start);
  assert.ok(start >= 0 && end > start, 'Debe existir el handler del switch ER');
  const handler = source.slice(start, end);
  assert.equal(handler.includes('await renderTablaCuentas()'), false,
    'El switch ER no debe re-renderizar la tabla ni cerrar nodos expandidos');
  assert.equal(handler.includes("row.dataset.estadoResultados"), true,
    'Debe actualizar localmente el estado ER de la fila');
  assert.equal(handler.includes('sw.disabled = false'), true,
    'El switch debe rehabilitarse tras guardar');
});
