// Ejecuta todos los *.test.js de esta carpeta sin depender de glob del shell.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const files = fs.readdirSync(__dirname)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join(__dirname, name));

if (!files.length) {
  console.error('No se encontraron archivos *.test.js');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
