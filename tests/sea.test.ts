import { describe, expect, it } from 'vitest';
import { SEA_KINDS, pickKind, seaGo } from '../src/ui/sea/transition';

describe('transizioni marine', () => {
  it('sceglie a caso tra tutte, senza ripetere la precedente', () => {
    for (const prev of [null, ...SEA_KINDS]) {
      const seen = new Set<string>();
      for (const r of [0, 0.2, 0.49, 0.5, 0.8, 0.999999]) {
        const k = pickKind(prev, () => r);
        expect(k).not.toBe(prev);
        seen.add(k);
      }
      expect(seen.size).toBe(prev ? SEA_KINDS.length - 1 : SEA_KINDS.length);
    }
  });

  it('senza animazioni possibili il cambio di schermata è immediato', () => {
    let changed = false;
    seaGo(() => (changed = true));
    expect(changed).toBe(true);
  });
});
