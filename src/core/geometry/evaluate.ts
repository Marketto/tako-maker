import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import type { Design, Joint, Part, ShapeNode, Tolerances, Vec3 } from '../types';
import { BASE_TOLERANCES } from '../../data/guidelines';

/* Trasforma il Design in mesh triangolari usando manifold-3d (WASM).
   Gira in un Web Worker nel browser e direttamente in Node nei test. */

export interface RawMesh {
  positions: Float32Array; // xyz per vertice
  indices: Uint32Array; // 3 indici per triangolo
}

export interface PartResult {
  id: string;
  name: string;
  filamentId?: string;
  mesh: RawMesh;
  volume: number; // mm³
  bbox: { min: Vec3; max: Vec3 };
  /** Bounding box della forma di base, prima di cerniere e perni: usato per i contatti. */
  contactBox: { min: Vec3; max: Vec3 };
  /** false se la mesh importata non è "chiusa": niente booleane, solo visualizzazione/esportazione. */
  manifold: boolean;
  warnings: string[];
}

export interface EvalResult {
  parts: PartResult[];
  errors: string[];
}

/** Tolleranze di base (le effettive dipendono dal materiale: core/calibration/tolerances.ts). */
export const TOL: Tolerances = BASE_TOLERANCES;

const SEG = 32;

class Ctx {
  created: Manifold[] = [];
  constructor(public w: ManifoldToplevel, public meshes: Record<string, RawMesh>) {}
  keep<T extends Manifold>(m: T): T {
    this.created.push(m);
    return m;
  }
  dispose() {
    for (const m of this.created) {
      try {
        m.delete();
      } catch {
        /* già liberato */
      }
    }
    this.created = [];
  }
}

class NonManifoldMesh extends Error {}

function meshToManifold(ctx: Ctx, raw: RawMesh): Manifold {
  const { Mesh, Manifold } = ctx.w;
  const mesh = new Mesh({ numProp: 3, vertProperties: raw.positions, triVerts: raw.indices });
  mesh.merge();
  try {
    return ctx.keep(new Manifold(mesh));
  } catch {
    throw new NonManifoldMesh('La mesh importata non è chiusa (non-manifold)');
  }
}

function roundedBox(ctx: Ctx, size: Vec3, radius: number, center: boolean): Manifold {
  const { Manifold } = ctx.w;
  const r = Math.min(radius, Math.min(...size) / 2 - 0.01);
  if (r <= 0.05) return ctx.keep(Manifold.cube(size, center));
  const off: Vec3 = center ? [-size[0] / 2, -size[1] / 2, -size[2] / 2] : [0, 0, 0];
  const pts: Manifold[] = [];
  for (const x of [r, size[0] - r])
    for (const y of [r, size[1] - r])
      for (const z of [r, size[2] - r]) pts.push(ctx.keep(Manifold.sphere(r, 16).translate([x + off[0], y + off[1], z + off[2]])));
  return ctx.keep(Manifold.hull(pts));
}

function build(ctx: Ctx, node: ShapeNode): Manifold {
  const { Manifold } = ctx.w;
  let m: Manifold;
  switch (node.op) {
    case 'box':
      m = node.radius ? roundedBox(ctx, node.size, node.radius, !!node.center) : ctx.keep(Manifold.cube(node.size, !!node.center));
      break;
    case 'cylinder':
      m = ctx.keep(Manifold.cylinder(node.h, node.r, node.r2 ?? node.r, node.segments ?? SEG, !!node.center));
      break;
    case 'sphere':
      m = ctx.keep(Manifold.sphere(node.r, SEG));
      break;
    case 'mesh': {
      const raw = ctx.meshes[node.ref];
      if (!raw) throw new Error(`Mesh importata "${node.ref}" non trovata`);
      m = meshToManifold(ctx, raw);
      if (node.scale && node.scale !== 1) m = ctx.keep(m.scale(node.scale));
      break;
    }
    case 'union':
      m = ctx.keep(Manifold.union(node.children.map((c) => build(ctx, c))));
      break;
    case 'difference':
      m = ctx.keep(Manifold.difference(node.children.map((c) => build(ctx, c))));
      break;
    case 'intersection':
      m = ctx.keep(Manifold.intersection(node.children.map((c) => build(ctx, c))));
      break;
    case 'hull':
      m = ctx.keep(Manifold.hull(node.children.map((c) => build(ctx, c))));
      break;
  }
  if (node.rot) m = ctx.keep(m.rotate(node.rot));
  if (node.at) m = ctx.keep(m.translate(node.at));
  return m;
}

/* ---------- Cerniere e scatti generati automaticamente ---------- */

/** Ruota una geometria costruita lungo Z sull'asse richiesto e la porta nell'origine del giunto. */
function placeOnAxis(ctx: Ctx, m: Manifold, j: Joint): Manifold {
  const rot: Vec3 = j.axis === 'x' ? [0, 90, 0] : j.axis === 'y' ? [-90, 0, 0] : [0, 0, 0];
  return ctx.keep(ctx.keep(m.rotate(rot)).translate(j.origin));
}

interface JointGeometry {
  addA: Manifold[];
  subA: Manifold[];
  addB: Manifold[];
  subB: Manifold[];
}

/** Cerniera stampabile già montata: nocche A-B-A con perno integrato in A. */
export function hingeGeometry(ctx: Ctx, j: Joint, tol: Tolerances = TOL): JointGeometry {
  const { Manifold } = ctx.w;
  const L = j.length ?? 30;
  const R = j.radius ?? 4;
  const g = tol.hingeGap;
  const seg = (L - 2 * g) / 3;
  const pinR = R * 0.45;
  const z0 = -L / 2;
  const cyl = (h: number, r: number, z: number) => ctx.keep(ctx.keep(Manifold.cylinder(h, r, r, SEG)).translate([0, 0, z]));

  const kA1 = cyl(seg, R, z0);
  const kB = cyl(seg, R, z0 + seg + g);
  const kA2 = cyl(seg, R, z0 + 2 * (seg + g));
  const pin = cyl(L - 0.2, pinR, z0 + 0.1);

  const out: JointGeometry = { addA: [], subA: [], addB: [], subB: [] };
  out.addA.push(placeOnAxis(ctx, kA1, j), placeOnAxis(ctx, kA2, j), placeOnAxis(ctx, pin, j));
  // Spazio libero attorno alle nocche dell'altra parte.
  out.subA.push(placeOnAxis(ctx, cyl(seg + 2 * g, R + g, z0 + seg), j));
  out.subB.push(
    placeOnAxis(ctx, cyl(seg + g, R + g, z0 - 0.01), j),
    placeOnAxis(ctx, cyl(seg + g, R + g, z0 + 2 * seg + g + 0.01), j),
    placeOnAxis(ctx, cyl(L + 1, pinR + tol.pinClearance, z0 - 0.5), j),
  );
  out.addB.push(placeOnAxis(ctx, kB, j));

  if (j.detent?.enabled) {
    // Sfere sporgenti sulle facce della nocca B, incavi sulle facce delle nocche A.
    const bumpR = Math.max(0.6, R * 0.15);
    const ring = (pinR + R) / 2;
    const angles = j.detent.anglesDeg?.length ? j.detent.anglesDeg : [0, 90];
    const faces = [z0 + seg + g, z0 + 2 * seg + g];
    for (const fz of faces) {
      out.addB.push(placeOnAxis(ctx, ctx.keep(ctx.keep(Manifold.sphere(bumpR, 16)).translate([ring, 0, fz])), j));
      for (const a of angles) {
        const rad = (a * Math.PI) / 180;
        const dimple = ctx.keep(ctx.keep(Manifold.sphere(bumpR + tol.detentClearance, 16)).translate([ring * Math.cos(rad), ring * Math.sin(rad), fz]));
        out.subA.push(placeOnAxis(ctx, dimple, j));
      }
    }
  }
  return out;
}

/** Giunto rotante semplice: base A con perno, B ruota sopra con foro. */
export function rotaryGeometry(ctx: Ctx, j: Joint, tol: Tolerances = TOL): JointGeometry {
  const { Manifold } = ctx.w;
  const L = j.length ?? 10;
  const R = j.radius ?? 5;
  const pinR = R * 0.5;
  const pin = ctx.keep(ctx.keep(Manifold.cylinder(L, pinR, pinR * 0.9, SEG)).translate([0, 0, -L / 2]));
  const hole = ctx.keep(ctx.keep(Manifold.cylinder(L + 1, pinR + tol.pinClearance, pinR + tol.pinClearance, SEG)).translate([0, 0, -L / 2]));
  const out: JointGeometry = { addA: [placeOnAxis(ctx, pin, j)], subA: [], addB: [], subB: [placeOnAxis(ctx, hole, j)] };
  if (j.detent?.enabled) {
    const bumpR = Math.max(0.6, R * 0.12);
    const ring = pinR + tol.pinClearance + bumpR * 1.5;
    out.addA.push(placeOnAxis(ctx, ctx.keep(ctx.keep(Manifold.sphere(bumpR, 16)).translate([ring, 0, -L / 2])), j));
    for (const a of j.detent.anglesDeg?.length ? j.detent.anglesDeg : [0, 90, 180, 270]) {
      const rad = (a * Math.PI) / 180;
      out.subB.push(
        placeOnAxis(ctx, ctx.keep(ctx.keep(Manifold.sphere(bumpR + tol.detentClearance, 16)).translate([ring * Math.cos(rad), ring * Math.sin(rad), -L / 2])), j),
      );
    }
  }
  return out;
}

/* ---------- Perni di collegamento tra parti separate ---------- */

export interface Contact {
  a: string;
  b: string;
  axis: 0 | 1 | 2;
  /** Centro della zona di contatto. */
  center: Vec3;
  /** Lato minore della zona di contatto (mm). */
  span: number;
  /** +1 se B sta "sopra" A lungo l'asse. */
  dir: 1 | -1;
  depthA: number;
  depthB: number;
}

type Box = { min: Vec3; max: Vec3 };

/** Trova le coppie di parti che si toccano su una faccia (dai bounding box). */
export function findContacts(boxes: { id: string; box: Box }[], tol = 0.3): Contact[] {
  const out: Contact[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let k = i + 1; k < boxes.length; k++) {
      const A = boxes[i].box;
      const B = boxes[k].box;
      for (const axis of [2, 0, 1] as const) {
        const o1 = ((axis + 1) % 3) as 0 | 1 | 2;
        const o2 = ((axis + 2) % 3) as 0 | 1 | 2;
        const ov = (d: 0 | 1 | 2) => Math.min(A.max[d], B.max[d]) - Math.max(A.min[d], B.min[d]);
        if (ov(o1) <= 2 || ov(o2) <= 2) continue;
        let dir: 1 | -1 | 0 = 0;
        if (Math.abs(A.max[axis] - B.min[axis]) <= tol) dir = 1;
        else if (Math.abs(B.max[axis] - A.min[axis]) <= tol) dir = -1;
        if (!dir) continue;
        const center: Vec3 = [0, 0, 0];
        center[axis] = dir === 1 ? A.max[axis] : A.min[axis];
        for (const d of [o1, o2]) center[d] = (Math.max(A.min[d], B.min[d]) + Math.min(A.max[d], B.max[d])) / 2;
        out.push({
          a: boxes[i].id,
          b: boxes[k].id,
          axis,
          center,
          span: Math.min(ov(o1), ov(o2)),
          dir,
          depthA: A.max[axis] - A.min[axis],
          depthB: B.max[axis] - B.min[axis],
        });
        break;
      }
    }
  return out;
}

function pegGeometry(ctx: Ctx, c: Contact, snap: boolean, tol: Tolerances = TOL): { addA: Manifold; subB: Manifold } | null {
  const { Manifold } = ctx.w;
  const d = Math.min(8, Math.max(3, c.span * 0.25));
  const depth = Math.min(6, c.depthB * 0.6, c.depthA * 0.6);
  if (depth < 2 || c.span < d + 2) return null;
  const clearance = snap ? tol.pegSnap : tol.pegGlue;
  const rot: Vec3 = c.axis === 0 ? [0, 90, 0] : c.axis === 1 ? [-90, 0, 0] : [0, 0, 0];
  const make = (r: number, h: number) => {
    let m = ctx.keep(Manifold.cylinder(h, r, snap ? r : r * 0.9, SEG));
    if (c.dir === -1) m = ctx.keep(m.rotate([180, 0, 0]));
    return ctx.keep(ctx.keep(m.rotate(rot)).translate(c.center));
  };
  // Il perno parte 1 mm dentro A per una buona fusione.
  const pegBase = ctx.keep(make(d / 2, depth - 0.3 + 1).translate(axisVec(c.axis, -c.dir)));
  const hole = make(d / 2 + clearance, depth);
  return { addA: pegBase, subB: hole };
}

function axisVec(axis: 0 | 1 | 2, s: number): Vec3 {
  const v: Vec3 = [0, 0, 0];
  v[axis] = s;
  return v;
}

/* ---------- Valutazione completa ---------- */

/** Per ogni coppia usa la tolleranza più larga tra i due materiali (più sicuro). */
function mergeTol(a?: Tolerances, b?: Tolerances): Tolerances {
  if (!a && !b) return TOL;
  if (!a || !b) return (a ?? b)!;
  return Object.fromEntries(Object.keys(a).map((k) => [k, Math.max(a[k as keyof Tolerances], b[k as keyof Tolerances])])) as unknown as Tolerances;
}

export function evaluateDesign(
  w: ManifoldToplevel,
  design: Design,
  meshes: Record<string, RawMesh> = {},
  tolByPart: Record<string, Tolerances> = {},
): EvalResult {
  const ctx = new Ctx(w, meshes);
  const errors: string[] = [];
  const base = new Map<string, Manifold>();
  const rawFallback = new Map<string, RawMesh>();
  const warnings = new Map<string, string[]>();

  for (const p of design.parts) {
    warnings.set(p.id, []);
    try {
      base.set(p.id, build(ctx, p.shape));
    } catch (e) {
      if (e instanceof NonManifoldMesh && p.shape.op === 'mesh') {
        rawFallback.set(p.id, transformRaw(meshes[p.shape.ref], p.shape));
        warnings.get(p.id)!.push('Mesh non chiusa: le modifiche geometriche su questa parte non sono disponibili.');
      } else {
        errors.push(`Parte "${p.name}": ${(e as Error).message}`);
      }
    }
  }

  const add = new Map<string, Manifold[]>();
  const sub = new Map<string, Manifold[]>();
  const push = (m: Map<string, Manifold[]>, id: string, list: Manifold[]) => m.set(id, [...(m.get(id) ?? []), ...list]);

  for (const j of design.joints) {
    if (!base.has(j.partA) || !base.has(j.partB)) continue;
    try {
      const t = mergeTol(tolByPart[j.partA], tolByPart[j.partB]);
      const g = j.type === 'hinge' ? hingeGeometry(ctx, j, t) : j.type === 'rotary' ? rotaryGeometry(ctx, j, t) : null;
      if (!g) continue;
      push(add, j.partA, g.addA);
      push(sub, j.partA, g.subA);
      push(add, j.partB, g.addB);
      push(sub, j.partB, g.subB);
    } catch (e) {
      errors.push(`Giunto "${j.id}": ${(e as Error).message}`);
    }
  }

  const { strategy, connection } = design.printPlan;
  if (strategy === 'separate' && connection !== 'none') {
    const jointPairs = new Set(design.joints.map((j) => [j.partA, j.partB].sort().join('|')));
    const boxes = [...base.entries()].map(([id, m]) => ({ id, box: m.boundingBox() as Box }));
    for (const c of findContacts(boxes)) {
      if (jointPairs.has([c.a, c.b].sort().join('|'))) continue;
      const g = pegGeometry(ctx, c, connection === 'snap', mergeTol(tolByPart[c.a], tolByPart[c.b]));
      if (!g) continue;
      // Il foro deve cadere nel materiale di B (es. non tra due tasti) e il perno deve poggiare su A.
      const inB = ctx.keep(base.get(c.b)!.intersect(g.subB)).volume();
      const holeVol = g.subB.volume();
      if (inB < holeVol * 0.9) continue;
      push(add, c.a, [g.addA]);
      push(sub, c.b, [g.subB]);
    }
  }

  const parts: PartResult[] = [];
  for (const p of design.parts) {
    const raw = rawFallback.get(p.id);
    if (raw) {
      parts.push(resultFromRaw(p, raw, warnings.get(p.id)!));
      continue;
    }
    let m = base.get(p.id);
    if (!m) continue;
    const a = add.get(p.id);
    if (a?.length) m = ctx.keep(w.Manifold.union([m, ...a]));
    const s = sub.get(p.id);
    if (s?.length) m = ctx.keep(w.Manifold.difference([m, ...s]));
    if (m.isEmpty()) {
      errors.push(`Parte "${p.name}": la geometria risultante è vuota`);
      continue;
    }
    const mesh = m.getMesh();
    const bb = m.boundingBox() as Box;
    const cb = base.get(p.id)!.boundingBox() as Box;
    parts.push({
      id: p.id,
      name: p.name,
      filamentId: p.filamentId,
      mesh: positionsOnly(mesh.vertProperties, mesh.numProp, mesh.triVerts),
      volume: m.volume(),
      bbox: { min: [...bb.min] as Vec3, max: [...bb.max] as Vec3 },
      contactBox: { min: [...cb.min] as Vec3, max: [...cb.max] as Vec3 },
      manifold: true,
      warnings: warnings.get(p.id)!,
    });
  }
  ctx.dispose();
  return { parts, errors };
}

function positionsOnly(vp: Float32Array, numProp: number, tri: Uint32Array): RawMesh {
  if (numProp === 3) return { positions: new Float32Array(vp), indices: new Uint32Array(tri) };
  const n = vp.length / numProp;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = vp[i * numProp + k];
  return { positions: pos, indices: new Uint32Array(tri) };
}

/** Applica scala/rotazione/traslazione a una mesh grezza (per mesh non-manifold). */
function transformRaw(raw: RawMesh, node: ShapeNode): RawMesh {
  const pos = new Float32Array(raw.positions);
  const s = node.op === 'mesh' && node.scale ? node.scale : 1;
  const [rx, ry, rz] = (node.rot ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const [tx, ty, tz] = node.at ?? [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i] * s, y = pos[i + 1] * s, z = pos[i + 2] * s;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    pos[i] = x + tx; pos[i + 1] = y + ty; pos[i + 2] = z + tz;
  }
  return { positions: pos, indices: raw.indices };
}

function resultFromRaw(p: Part, raw: RawMesh, warnings: string[]): PartResult {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < raw.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], raw.positions[i + k]);
      max[k] = Math.max(max[k], raw.positions[i + k]);
    }
  return { id: p.id, name: p.name, filamentId: p.filamentId, mesh: raw, volume: meshVolume(raw), bbox: { min, max }, contactBox: { min, max }, manifold: false, warnings };
}

/** Volume con segno (formula del tetraedro), valido anche per mesh "quasi" chiuse. */
export function meshVolume(raw: RawMesh): number {
  const p = raw.positions;
  const t = raw.indices;
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return Math.abs(v / 6);
}
