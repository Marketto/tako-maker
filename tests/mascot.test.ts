import { describe, expect, it } from 'vitest';
import { BODY, FACES } from '../src/ui/mascot/sprites';
import { PHRASES, pickPhrase } from '../src/ui/mascot/phrases';

describe('Takotta', () => {
  it('ha un viso per ogni umore e il segnaposto nel corpo', () => {
    expect(BODY).toContain('<!--FACE-->');
    expect(Object.keys(FACES).sort()).toEqual(['concentrata', 'confusa', 'felice', 'normale', 'pensierosa']);
  });
  it('gli id interni sono tutti con il prefisso sostituibile', () => {
    const ids = [...(BODY + Object.values(FACES).join('')).matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.every((id) => id.startsWith('__UID__-'))).toBe(true);
  });
  it('le punte dei tentacoli usano i colori dei filamenti', () => {
    expect(BODY).toMatch(/var\(--tip\d,/);
  });
});

describe('frasi di incitamento', () => {
  it('non ripete la stessa frase due volte di fila', () => {
    let prev = '';
    for (let i = 0; i < 30; i++) {
      const p = pickPhrase('modifica');
      expect(p).not.toBe(prev);
      expect(PHRASES.modifica).toContain(p);
      prev = p;
    }
  });
});
