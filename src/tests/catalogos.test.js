const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeCatalogRows } = require('../main/services/catalogos/catalogoScope');

test('catálogo local prevalece sobre global sin duplicar códigos', () => {
  const rows = mergeCatalogRows(
    [
      { codigo: '01', descripcion: 'Factura global' },
      { codigo: '03', descripcion: 'Boleta global' },
    ],
    [
      { codigo: '01', descripcion: 'Factura personalizada' },
      { codigo: '99', descripcion: 'Documento empresa' },
    ],
    true
  );

  assert.equal(rows.length, 3);
  const factura = rows.find(r => r.codigo === '01');
  assert.equal(factura.descripcion, 'Factura personalizada');
  assert.equal(factura.es_override, true);
  assert.equal(factura.modo_edicion, 'override');
  assert.equal(rows.find(r => r.codigo === '03').origen, 'Global');
  assert.equal(rows.find(r => r.codigo === '99').origen, 'Local');
});
