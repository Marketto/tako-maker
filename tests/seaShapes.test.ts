import { describe, expect, it } from 'vitest';
import { blob, bottle, crabShell, jellyfish, kelp, pufferfish, rng, rock, sandDollar, scallop, seaGlass, tentacle } from '../src/ui/sea/shapes';
import { isLight } from '../src/ui/sea/controls';

describe('forme marine', () => {
  it('il generatore con seme ripete la stessa sequenza', () => {
    const a = rng(5);
    const b = rng(5);
    const xs = Array.from({ length: 5 }, () => a(2, 4));
    expect(Array.from({ length: 5 }, () => b(2, 4))).toEqual(xs);
    expect(xs.every((x) => x >= 2 && x < 4)).toBe(true);
    expect(rng(6)()).not.toBe(rng(5)());
  });

  it('la roccia resta nel suo rettangolo', () => {
    for (const seed of [1, 7, 42]) {
      for (const [x, y] of blob(200, 60, seed)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(200);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(60);
      }
    }
  });

  it('ogni roccia ha un clipPath con un id proprio e le decorazioni richieste', () => {
    const svg = rock(220, 66, 3, 'abc', { glow: '#7ff0f2', barnacles: 2, starfish: true });
    expect(svg).toContain('<clipPath id="abcc">');
    expect(svg).toContain('url(#abcc)');
    expect(svg.match(/class="cirri"/g)).toHaveLength(2);
    expect(svg).toContain('class="glowline"');
    expect(svg).toContain('class="wiggle"');
    expect(rock(220, 66, 3, 'abc')).not.toContain('glowline');
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('il tentacolo separa il tratto dietro da quello davanti', () => {
    const t = tentacle([[0, 80], [10, 50], [8, 20], [30, -5], [50, 0]], 16, 3, [[0, 1]]);
    expect(t.back).toContain('<path');
    expect(t.front).toContain('stroke="#0b1026"');
    expect(tentacle([[0, 80], [10, 50], [30, 0]], 16, 3).back).toBe('');
  });

  it('il vetro di mare acceso brilla, quello spento no', () => {
    expect(seaGlass(120, 48, 2, '#ff0000', true)).toContain('sparkle');
    expect(seaGlass(120, 48, 2, '#ff0000', false)).not.toContain('sparkle');
    expect(seaGlass(120, 48, 2, '"/><script>', true)).not.toContain('<script>');
  });

  it('riconosce i colori chiari per il testo scuro', () => {
    expect(isLight('#ffffff')).toBe(true);
    expect(isLight('#f5d90a')).toBe(true);
    expect(isLight('#1b1b1b')).toBe(false);
    expect(isLight('#2a6cd6')).toBe(false);
  });

  it('capasanta, dollaro della sabbia, granchio e bottiglia sono SVG validi', () => {
    for (const svg of [scallop(), sandDollar(), crabShell(60, 40), bottle()]) {
      expect(svg.length).toBeGreaterThan(100);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    expect(crabShell(60, 40)).toContain('class="snap"');
  });

  it('medusa accesa e spenta, pesce palla e kelp', () => {
    expect(jellyfish(true)).toContain('jbob');
    expect(jellyfish(false)).toContain('jsleep');
    const k = kelp([30, 226], [{ pts: [[34, 226], [52, 170], [38, 110]], W: 15, back: true }, { pts: [[28, 226], [14, 176], [32, 130]], W: 17 }], 'kx');
    expect(k).toContain('id="kxk0"');
    expect(k).toContain('id="kxk1"');
    for (const svg of [jellyfish(true), pufferfish(), k]) expect(svg).not.toMatch(/NaN|undefined/);
  });
});
