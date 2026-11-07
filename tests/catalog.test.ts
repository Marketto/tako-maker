import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CATALOG, CATALOG_TOPICS, catalogMarkdown, catalogText } from '../src/data/catalog';
import { runTool, TOOL_DEFS } from '../src/agent/tools';
import { SKILLS } from '../src/agent/skills';
import { routeByRules } from '../src/agent/router';

describe('catalogo dei dettagli', () => {
  it('ha argomenti unici e regole non vuote', () => {
    expect(new Set(CATALOG_TOPICS).size).toBe(CATALOG.length);
    for (const e of CATALOG) expect(e.rules.length).toBeGreaterThan(0);
  });

  it('filtra per argomento e segnala argomenti sconosciuti', () => {
    const txt = catalogText(['molle']);
    expect(txt).toContain('Molle stampate');
    expect(txt).not.toContain('Cerniere');
    expect(catalogText(['boh'])).toContain('Argomenti:');
  });

  it('lo strumento consulta_catalogo risponde senza AI né geometria', async () => {
    expect(TOOL_DEFS.consulta_catalogo).toBeDefined();
    const out = await runTool('consulta_catalogo', { argomenti: ['scatti'] }, {} as never);
    expect(out.kind).toBe('result');
    expect(out.kind === 'result' && out.content).toContain('25°');
  });

  it('le skill che progettano o consigliano possono consultarlo', () => {
    for (const s of ['crea-modello', 'modifica-modello', 'consiglia-stampa'] as const) expect(SKILLS[s].tools).toContain('consulta_catalogo');
  });

  it('docs/CATALOGO.md è allineato al catalogo', () => {
    expect(readFileSync('docs/CATALOGO.md', 'utf8')).toBe(catalogMarkdown());
  });

  it('una stampa venuta male va ai consigli di stampa', () => {
    const d = { parts: [{ id: 'a' }] } as never;
    expect(routeByRules('il pezzo si è staccato dal piatto a metà stampa', d, { searchFirst: false }).skill).toBe('consiglia-stampa');
    expect(routeByRules('gli angoli si sollevano', null, { searchFirst: false }).skill).toBe('consiglia-stampa');
  });
});
