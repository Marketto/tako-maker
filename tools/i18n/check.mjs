// Controlla le traduzioni in src/i18n/locales/*.json rispetto a src/i18n/source.json:
// frasi mancanti, frasi in più, segnaposti {nome} diversi, traduzioni vuote.
// Uso: npm run i18n:check-locales [codice…]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = JSON.parse(readFileSync(join(root, 'src/i18n/source.json'), 'utf8'));
const dir = join(root, 'src/i18n/locales');
const wanted = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && (!wanted.length || wanted.includes(f.slice(0, -5))));

const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let bad = 0;
for (const f of files) {
  const dict = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const problems = [];
  for (const k of Object.keys(source)) {
    if (!(k in dict)) problems.push(`manca: ${JSON.stringify(k)}`);
    else if (typeof dict[k] !== 'string' || !dict[k].trim()) problems.push(`vuota: ${JSON.stringify(k)}`);
    else if (holes(dict[k]) !== holes(k)) problems.push(`segnaposti diversi: ${JSON.stringify(k)} → ${JSON.stringify(dict[k])}`);
  }
  for (const k of Object.keys(dict)) if (!(k in source)) problems.push(`in più: ${JSON.stringify(k)}`);
  if (problems.length) {
    bad++;
    console.error(`✗ ${f}: ${problems.length} problemi`);
    for (const p of problems.slice(0, 20)) console.error('   ' + p);
  } else console.log(`✓ ${f}`);
}
process.exit(bad ? 1 : 0);
