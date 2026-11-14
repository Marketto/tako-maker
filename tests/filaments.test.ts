import { describe, expect, it } from 'vitest';
import { reassignMissingFilaments } from '../src/core/design/filaments';
import { emptyDesign, type Design, type Filament } from '../src/core/types';

const pla: Filament = { id: 'f1', material: 'PLA', colorName: 'Rosso', hex: '#f00' };
const petg: Filament = { id: 'f2', material: 'PETG', colorName: 'Nero', hex: '#000' };
const petgBlu: Filament = { id: 'f3', material: 'PETG', colorName: 'Blu', hex: '#00f' };

function design(ids: (string | undefined)[]): Design {
  const d = emptyDesign('prova');
  d.parts = ids.map((filamentId, i) => ({ id: `p${i}`, name: `p${i}`, filamentId, shape: { op: 'box', size: [1, 1, 1] } }));
  return d;
}

describe('reassignMissingFilaments', () => {
  it('non cambia nulla se tutti i filamenti esistono', () => {
    expect(reassignMissingFilaments(design(['f1', 'f2', undefined]), [pla, petg])).toBeNull();
  });

  it('preferisce lo stesso materiale del filamento tolto', () => {
    const d = reassignMissingFilaments(design(['f1', 'f2']), [pla, petgBlu], [petg])!;
    expect(d.parts.map((p) => p.filamentId)).toEqual(['f1', 'f3']);
  });

  it('altrimenti usa il primo filamento rimasto', () => {
    const d = reassignMissingFilaments(design(['f2']), [pla])!;
    expect(d.parts[0].filamentId).toBe('f1');
  });

  it('senza filamenti non tocca il progetto', () => {
    expect(reassignMissingFilaments(design(['f2']), [])).toBeNull();
  });
});
