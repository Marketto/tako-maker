import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { detectLocale, fmtNum, LOCALES, locale, setLocale, t } from '../src/i18n';

const root = join(__dirname, '..');
const source: Record<string, string> = JSON.parse(readFileSync(join(root, 'src/i18n/source.json'), 'utf8'));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('traduzioni', () => {
  afterEach(() => setLocale('it'));

  it('source.json è aggiornato con le frasi del codice', () => {
    expect(() => execFileSync('node', ['tools/i18n/extract.mjs', '--check'], { cwd: root, stdio: 'pipe' })).not.toThrow();
  });

  for (const l of LOCALES.filter((x) => x.code !== 'it')) {
    it(`${l.code}: tutte le frasi tradotte, con gli stessi segnaposti`, () => {
      const file = join(root, `src/i18n/locales/${l.code}.json`);
      expect(existsSync(file)).toBe(true);
      const dict: Record<string, string> = JSON.parse(readFileSync(file, 'utf8'));
      const missing = Object.keys(source).filter((k) => !dict[k]?.trim());
      const wrong = Object.keys(source).filter((k) => dict[k] && holes(dict[k]) !== holes(k));
      expect(missing).toEqual([]);
      expect(wrong).toEqual([]);
    });
  }

  it('sostituisce i segnaposti e cambia lingua', async () => {
    expect(t('Ho trovato {n} punti di contatto.', { n: 3 })).toBe('Ho trovato 3 punti di contatto.');
    await setLocale('en');
    expect(locale()).toBe('en');
    expect(t('Ho trovato {n} punti di contatto.', { n: 3 })).toMatch(/3/);
    expect(t('Ho trovato {n} punti di contatto.', { n: 3 })).not.toMatch(/Ho trovato/);
    expect(t('frase che non esiste')).toBe('frase che non esiste');
  });

  it('arabo da destra a sinistra', async () => {
    const g = globalThis as { document?: unknown };
    g.document ??= { documentElement: {} };
    await setLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await setLocale('it');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('numeri con il separatore della lingua', async () => {
    expect(fmtNum(0.25, 2)).toBe('0,25');
    expect(fmtNum(1.2, 2, 0)).toBe('1,2');
    await setLocale('en');
    expect(fmtNum(0.25, 2)).toBe('0.25');
  });

  it('riconosce la lingua del dispositivo', () => {
    expect(detectLocale(['de-AT', 'en'])).toBe('de');
    expect(detectLocale(['no-NO'])).toBe('nb');
    expect(detectLocale(['xx'])).toBe('it');
  });
});
