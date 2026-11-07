// Rigenera docs/CATALOGO.md da src/data/catalog.ts.
import { writeFileSync } from 'node:fs';
const { catalogMarkdown } = await import('../../src/data/catalog.ts');
writeFileSync(new URL('../../docs/CATALOGO.md', import.meta.url), catalogMarkdown());
console.log('docs/CATALOGO.md aggiornato');
