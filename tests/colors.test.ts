import { describe, expect, it } from 'vitest';
import { categoriesFor, COLOR_CATEGORIES, filterColors, FILAMENT_COLORS } from '../src/data/colors';
import { MATERIALS } from '../src/data/materials';

describe('colori dei filamenti', () => {
  it('nomi unici, esadecimali validi, materiali esistenti', () => {
    expect(new Set(FILAMENT_COLORS.map((c) => c.name)).size).toBe(FILAMENT_COLORS.length);
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const c of FILAMENT_COLORS) {
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      for (const m of c.materials ?? []) expect(ids.has(m)).toBe(true);
    }
    expect(FILAMENT_COLORS.length).toBeGreaterThan(60);
  });

  it('i colori di sempre restano con lo stesso nome e colore (configurazioni salvate)', () => {
    const legacy: Record<string, string> = {
      Bianco: '#f4f4f0', Nero: '#222222', Grigio: '#8a8d91', Rosso: '#d63a32', Arancione: '#f08a24', Giallo: '#f5cf2d', Verde: '#3aa655',
      Azzurro: '#4fb3e8', Blu: '#2a55c9', Viola: '#8b52c7', Rosa: '#f39ac0', Marrone: '#8a5a3b', Trasparente: '#d9eef2',
    };
    const common = filterColors('PLA', 'comuni', '');
    expect(Object.fromEntries(common.map((c) => [c.name, c.hex]))).toEqual(legacy);
  });

  it('ogni categoria ha colori nel PLA; un materiale mostra solo quelli che esistono', () => {
    expect(categoriesFor('PLA').map((k) => k.id)).toEqual(COLOR_CATEGORIES.map((k) => k.id));
    for (const k of COLOR_CATEGORIES) expect(filterColors('PLA', k.id, '').length).toBeGreaterThan(0);
    const tpu = categoriesFor('TPU').map((k) => k.id);
    expect(tpu).not.toContain('effetto');
    expect(tpu).not.toContain('fluo');
    expect(filterColors('TPU', 'tutti', '').some((c) => c.name === 'Oro')).toBe(false);
    expect(filterColors('PLA-Silk', 'effetto', '').map((c) => c.name)).toContain('Seta bicolore');
  });

  it('la ricerca ignora maiuscole e accenti e cerca anche nella famiglia e nella finitura', () => {
    expect(filterColors('PLA', 'comuni', 'VERDE').map((c) => c.name)).toContain('Verde salvia');
    expect(filterColors('PLA', 'comuni', 'tonalita').map((c) => c.name)).toEqual(['Pelle chiara', 'Pelle media', 'Pelle scura']);
    expect(filterColors('PLA', 'comuni', 'metallizz').map((c) => c.name)).toContain('Rame');
    // Con la traduzione: si trova il colore scrivendo nella lingua dell'utente.
    const en: Record<string, string> = { 'Effetto legno': 'Wood effect' };
    expect(filterColors('PLA', 'comuni', 'wood', (s) => en[s] ?? s).map((c) => c.name)).toEqual(['Effetto legno']);
  });
});
