const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularEstadoResultados } = require('../main/domain/estadoResultados');

function line(data, key) { return data.lineas.find(x => x.key === key); }
function note(data, name) { return data.lineas.find(x => x.tipo === 'nota' && x.nombre === name); }

test('ER muestra solo notas configuradas y usa la cuenta exacta de NATURALEZA', () => {
  const config = [
    { id:1, numero:'NOTA 10', nombre:'Ventas operacionales', bloque:'BRUTA', cuentas:['70111'], orden:10 },
    { id:2, numero:'NOTA 11', nombre:'Costo de ventas', bloque:'BRUTA', cuentas:['6011'], orden:20 },
  ];
  const balances = [
    { cuenta:'70111', nombre:'Terceros', nat_perdida:0, nat_ganancia:43528 },
    { cuenta:'70112', nombre:'Otra venta', nat_perdida:0, nat_ganancia:5000 },
    { cuenta:'6011', nombre:'Mercaderías', nat_perdida:32335, nat_ganancia:0 },
  ];
  const data = calcularEstadoResultados(config, balances);
  assert.equal(note(data, 'Ventas operacionales').importe, 43528, 'no debe incluir 70112 por prefijo');
  assert.equal(note(data, 'Costo de ventas').importe, -32335);
  assert.equal(line(data, 'utilidad_bruta').importe, 11193);
  assert.equal(line(data, 'utilidad_neta').importe, 11193);
  assert.equal(data.lineas.some(x => x.label === 'Gastos administrativos'), false, 'no debe inventar rubros no configurados');
});

test('ER inserta cinco subtotales automáticos entre bloques configurables', () => {
  const config = [
    { id:1, nombre:'Ventas', bloque:'BRUTA', cuentas:['7011'], orden:10 },
    { id:2, nombre:'Costo', bloque:'BRUTA', cuentas:['6011'], orden:20 },
    { id:3, nombre:'Administración', bloque:'OPERATIVA', cuentas:['6211'], orden:10 },
    { id:4, nombre:'Depósitos', bloque:'ANTES_FINANCIAMIENTO', cuentas:['7721'], orden:10 },
    { id:5, nombre:'Intereses', bloque:'ANTES_IMPUESTO', cuentas:['6711'], orden:10 },
    { id:6, nombre:'Impuesto', bloque:'NETA', cuentas:['8811'], orden:10 },
  ];
  const balances = [
    { cuenta:'7011', nat_ganancia:100000, nat_perdida:0 },
    { cuenta:'6011', nat_ganancia:0, nat_perdida:60000 },
    { cuenta:'6211', nat_ganancia:0, nat_perdida:10000 },
    { cuenta:'7721', nat_ganancia:5000, nat_perdida:0 },
    { cuenta:'6711', nat_ganancia:0, nat_perdida:2000 },
    { cuenta:'8811', nat_ganancia:0, nat_perdida:3000 },
  ];
  const data = calcularEstadoResultados(config, balances);
  assert.equal(line(data,'utilidad_bruta').importe, 40000);
  assert.equal(line(data,'utilidad_operativa').importe, 30000);
  assert.equal(line(data,'utilidad_antes_financiamiento_ir').importe, 35000);
  assert.equal(line(data,'utilidad_antes_impuesto').importe, 33000);
  assert.equal(line(data,'utilidad_neta').importe, 30000);
  assert.equal(data.lineas.filter(x => x.tipo === 'subtotal').length, 5);
  assert.equal(data.lineas.filter(x => x.tipo === 'nota').length, 6);
});

test('Notas ER conserva denominación de cada cuenta en el detalle', () => {
  const config = [
    { id:1, numero:'Nota 1', nombre:'Ingresos por ventas (operacionales)', bloque:'BRUTA', cuentas:['70111'], orden:10 },
  ];
  const balances = [
    { cuenta:'70111', nombre:'Mercaderías - venta local', nat_perdida:0, nat_ganancia:1500 },
  ];
  const data = calcularEstadoResultados(config, balances);
  const row = data.lineas.find(x => x.tipo === 'nota');
  assert.equal(row.detalle[0].nombre, 'Mercaderías - venta local');
  assert.equal(row.detalle[0].importe, 1500);
});

test('PDF ER reutiliza la cabecera corporativa de Libro Diario/Compras/Ventas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.resolve(__dirname, '../main/controllers/reportesController.js'), 'utf8');
  const m = src.match(/function construirPDFEstadoResultados\([\s\S]*?\n}\n\n\n\/\/ ═+/);
  assert.ok(m, 'no se encontró construirPDFEstadoResultados');
  const fn = m[0];
  assert.match(fn, /header:\s*buildCabeceraEmpresa\(empresa,\s*'ESTADO DE RESULTADOS'/);
  assert.match(fn, /pageMargins:\s*\[42,\s*headerHeight \+ 10,\s*42,\s*44\]/);
  assert.doesNotMatch(fn, /pdfEncabezado\(/, 'ER no debe usar la cabecera antigua independiente');
  assert.doesNotMatch(fn, /Generado por:/, 'ER no debe añadir una firma extra en el cuerpo');
  assert.doesNotMatch(fn, /Fuente:/, 'ER no debe añadir una fuente extra en el cuerpo');
});
