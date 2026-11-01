// Raccoglie le frasi marcate con t('…') e msg('…') nel codice e le scrive in src/i18n/source.json.
// Uso: npm run i18n:extract   (con --check fallisce se source.json non è aggiornato)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (!['i18n'].includes(f) || d !== join(root, 'src')) walk(p);
    } else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) files.push(p);
  }
})(join(root, 'src'));

// t('…') / msg('…') con apici singoli, doppi o backtick senza ${}
const re = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
const found = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const s = unescape(m[1] ?? m[2] ?? m[3]);
    if (!found.has(s)) found.set(s, f.replace(root + '/', ''));
  }
}
const sorted = Object.fromEntries([...found.keys()].sort((a, b) => a.localeCompare(b, 'it')).map((k) => [k, k]));
const out = JSON.stringify(sorted, null, 1) + '\n';
const target = join(root, 'src/i18n/source.json');
if (process.argv.includes('--check')) {
  const cur = readFileSync(target, 'utf8');
  if (cur !== out) {
    console.error('src/i18n/source.json non è aggiornato: esegui npm run i18n:extract');
    process.exit(1);
  }
} else {
  writeFileSync(target, out);
  console.log(`${found.size} frasi in src/i18n/source.json`);
}
