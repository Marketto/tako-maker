import { describe, expect, it } from 'vitest';
import { printers } from './fixtures';
import { printerOf } from '../src/app/printers';

describe('elenco stampanti', () => {
  it('dati coerenti per ogni stampante', () => {
    const ids = new Set<string>();
    for (const p of printers) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.bed.every((v) => v >= 100 && v <= 1000), p.id).toBe(true);
      expect(['corexy', 'bedslinger']).toContain(p.kinematics);
      expect(p.flowMm3s).toBeGreaterThan(0);
      if (p.multi) expect(p.multi.slots >= 2 && p.multi.purgeMm3 > 0 && p.multi.changeS > 0, p.id).toBe(true);
    }
    expect(printers.at(-1)!.id).toBe('custom');
  });
  it('contiene i modelli recenti', () => {
    const kobraX = printers.find((p) => p.id === 'anycubic-kobra-x')!;
    expect(kobraX.bed).toEqual([260, 260, 260]);
    expect(kobraX.multi?.slots).toBe(4);
  });
  it('stampante personalizzata con chiusura, movimento e colori', () => {
    const p = printerOf({ printerId: 'custom', hasMulti: true, filaments: [], customBed: [300, 300, 300], custom: { enclosed: true, kinematics: 'corexy', multiSlots: 4 } });
    expect(p.enclosed).toBe(true);
    expect(p.kinematics).toBe('corexy');
    expect(p.multi?.slots).toBe(4);
    expect(printerOf({ printerId: 'custom', hasMulti: false, filaments: [], custom: { enclosed: false, kinematics: 'bedslinger', multiSlots: 1 } }).multi).toBeNull();
  });
});
