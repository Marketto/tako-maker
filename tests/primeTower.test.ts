import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { fitsWithTower, overlaps, placeAvoiding, towerSpec, towerZone } from '../src/core/plate/primeTower';
import { plateKeepFree } from '../src/core/plate';
import { build3MF } from '../src/core/export/threemf';
import { estimateStrategies } from '../src/core/analysis/estimate';
import { printer, printers, setup } from './fixtures';
import type { RawMesh } from '../src/core/geometry/evaluate';
import type { Design } from '../src/core/types';

const cube = (w: number, d: number, h: number): RawMesh => ({
  positions: new Float32Array([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]),
});

describe('torre di spurgo', () => {
  it('ogni stampante multicolore ha una zona dentro il piatto', () => {
    for (const p of printers.filter((x) => x.multi)) {
      const z = towerZone(p, 4);
      if (towerSpec(p) === null) continue;
      expect(z, p.id).not.toBeNull();
      expect(z!.x >= 0 && z!.y >= 0 && z!.x + z!.w <= p.bed[0] + 0.01 && z!.y + z!.d <= p.bed[1] + 0.01, p.id).toBe(true);
    }
    expect(towerZone(printer('bambu-a1'), 1)).toBeNull();
  });

  it('sposta il modello accanto alla torre senza sovrapporlo', () => {
    const bed: [number, number, number] = [256, 256, 256];
    const zone = { x: 150, y: 150, w: 106, d: 106 };
    const spot = placeAvoiding(120, 120, bed, zone)!;
    expect(overlaps({ ...spot, w: 120, d: 120 }, zone)).toBe(false);
    expect(placeAvoiding(250, 250, bed, zone)).toBeNull();
    expect(fitsWithTower([250, 250, 10], bed, zone)).toBe(false);
    expect(fitsWithTower([250, 250, 10], bed, null)).toBe(true);
  });

  it('il 3MF multicolore lascia libera la zona della torre', () => {
    const p = printer('bambu-a1');
    const zone = towerZone(p, 2)!;
    const data = build3MF(
      [
        { name: 'A', mesh: cube(150, 150, 10), extruder: 1 },
        { name: 'B', mesh: cube(150, 150, 2), extruder: 2 },
      ],
      { title: 'T', flavor: 'orca', strategy: 'multicolor', bed: p.bed, keepFree: zone },
    );
    const model = strFromU8(unzipSync(data)['3D/3dmodel.model']);
    const xs = [...model.matchAll(/x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    // Le coordinate sono relative al centro dell'oggetto con la traslazione nel build item: controlla dal transform.
    const tr = model.match(/transform="1 0 0 0 1 0 0 0 1 ([-\d.]+) ([-\d.]+)/);
    const ox = tr ? Number(tr[1]) : 0;
    const oy = tr ? Number(tr[2]) : 0;
    const minX = Math.min(...xs.map((v) => v[0])) + ox, maxX = Math.max(...xs.map((v) => v[0])) + ox;
    const minY = Math.min(...xs.map((v) => v[1])) + oy, maxY = Math.max(...xs.map((v) => v[1])) + oy;
    expect(overlaps({ x: minX, y: minY, w: maxX - minX, d: maxY - minY }, zone)).toBe(false);
  });

  it('la stampa multicolore non è possibile se modello e torre non entrano insieme', () => {
    const p = printer('bambu-a1-mini');
    const part = (id: string, fil: string) => ({ id, filamentId: fil, volume: 1000, bbox: { min: [0, 0, 0] as [number, number, number], max: [175, 175, 10] as [number, number, number] } });
    const est = estimateStrategies([part('a', 'f1'), part('b', 'f2')], { ...setup, hasMulti: true }, p);
    expect(est.find((e) => e.strategy === 'multicolor')!.feasible).toBe(false);
  });

  it('serve solo con più colori nello stesso piatto', () => {
    const d = (strategy: Design['printPlan']['strategy'], fils: string[]): Design => ({
      version: 1, name: 'x', intendedUse: { children: false }, joints: [],
      parts: fils.map((f, i) => ({ id: `p${i}`, name: `P${i}`, filamentId: f, shape: { op: 'box', size: [10, 10, 10] } })),
      printPlan: { strategy, connection: 'none' },
    });
    const s = { ...setup, printerId: 'bambu-a1', hasMulti: true };
    expect(plateKeepFree(d('multicolor', ['f1', 'f2']), s, printer('bambu-a1'))).not.toBeNull();
    expect(plateKeepFree(d('layer-swap', ['f1', 'f2']), s, printer('bambu-a1'))).toBeNull();
    expect(plateKeepFree(d('multicolor', ['f1', 'f1']), s, printer('bambu-a1'))).toBeNull();
  });
});
