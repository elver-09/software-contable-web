const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = path.join(__dirname, '..', 'renderer');
const css = fs.readFileSync(path.join(renderer, 'css', 'styles.css'), 'utf8');
const configER = fs.readFileSync(path.join(renderer, 'js', 'modules', 'configEEFF.js'), 'utf8');

test('tema global mantiene paletas claro/oscuro y color-scheme nativo', () => {
  assert.match(css, /:root\s*\{/);
  assert.match(css, /body\.dark-mode\s*\{/);
  assert.match(css, /:root\s*\{\s*color-scheme:\s*light;/);
  assert.match(css, /body\.dark-mode\s*\{\s*color-scheme:\s*dark;/);
  assert.match(css, /--bg-card:/);
  assert.match(css, /--tx:/);
});

test('selector ER es escalable y responsive para listas extensas', () => {
  assert.match(configER, /config-er-filter-selected/);
  assert.match(configER, /config-er-visible-count/);
  assert.match(configER, /filtroVista\s*=\s*'seleccionadas'/);
  assert.match(css, /\.config-er-account-list\s*\{[\s\S]*height:\s*clamp\(/);
  assert.match(css, /@media \(max-width:\s*700px\)/);
  assert.match(css, /@media \(max-height:\s*700px\)/);
});
