const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function matches(text, regex) {
  return [...text.matchAll(regex)].map(m => m[1]);
}

test('contrato IPC Main ↔ Preload permanece sincronizado', () => {
  const main = read('main', 'main.js');
  const preload = read('preload.js');
  const handlers = new Set(matches(main, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g));
  const invokes = new Set(matches(preload, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g));

  assert.ok(handlers.size > 0);
  assert.deepEqual([...handlers].sort(), [...invokes].sort());
});

test('renderer mantiene CSP estricta para scripts y sin handlers inline', () => {
  const html = read('renderer', 'index.html');
  const csp = html.match(/Content-Security-Policy[^>]*content="([^"]+)"/i)?.[1] || '';
  assert.ok(csp.includes("script-src 'self'"), 'falta script-src self');
  assert.equal(csp.includes("script-src 'self' 'unsafe-inline'"), false, 'unsafe-inline no debe habilitarse para scripts');
  assert.equal(csp.includes('unsafe-eval'), false, 'unsafe-eval no debe habilitarse');
  assert.equal(/\son[a-z]+\s*=\s*["']/i.test(html), false, 'no debe haber eventos inline onclick/onerror/etc.');
});

test('index mantiene los estilos en la hoja CSS externa', () => {
  const html = read('renderer', 'index.html');
  assert.equal(/\sstyle\s*=/i.test(html), false, 'no debe haber atributos style en index.html');
  assert.equal(/<style\b/i.test(html), false, 'los estilos deben permanecer en archivos CSS');
  assert.match(html, /<link\b[^>]*href="\.\/css\/styles\.css"[^>]*>/);
});

test('BrowserWindow mantiene aislamiento y sandbox', () => {
  const main = read('main', 'main.js');
  assert.match(main, /nodeIntegration\s*:\s*false/);
  assert.match(main, /contextIsolation\s*:\s*true/);
  assert.match(main, /sandbox\s*:\s*true/);
  assert.match(main, /webSecurity\s*:\s*true/);
  assert.match(main, /webviewTag\s*:\s*false/);
});
