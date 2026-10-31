import { zipSync, strToU8 } from 'fflate';
import type { RawMesh } from '../geometry/evaluate';
import type { Attribution } from '../types';
import { attributionText } from './threemf';

/** STL binario di una mesh, appoggiata a z = 0. */
export function buildSTL(mesh: RawMesh, name = 'modello'): Uint8Array {
  const tris = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const header = strToU8(`Tako Maker - ${name}`.slice(0, 80));
  new Uint8Array(buf, 0, 80).set(header);
  dv.setUint32(80, tris, true);
  let minZ = Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) minZ = Math.min(minZ, mesh.positions[i]);
  const p = mesh.positions;
  let o = 84;
  for (let t = 0; t < tris; t++) {
    const a = mesh.indices[t * 3] * 3, b = mesh.indices[t * 3 + 1] * 3, c = mesh.indices[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const v of [nx, ny, nz]) { dv.setFloat32(o, v, true); o += 4; }
    for (const idx of [a, b, c]) {
      dv.setFloat32(o, p[idx], true);
      dv.setFloat32(o + 4, p[idx + 1], true);
      dv.setFloat32(o + 8, p[idx + 2] - minZ, true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

/** Zip con un STL per parte (alternativa universale al 3MF). */
export function buildSTLZip(parts: { name: string; mesh: RawMesh }[], attribution?: Attribution): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const p of parts) {
    let base = p.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'parte';
    while (used.has(base)) base += '_';
    used.add(base);
    files[`${base}.stl`] = buildSTL(p.mesh, p.name);
  }
  if (attribution) files['ATTRIBUZIONE.txt'] = strToU8(attributionText(attribution));
  return zipSync(files);
}
