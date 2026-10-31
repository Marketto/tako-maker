import type { Design, Joint, Part, ShapeNode, Vec3, PrintStrategy, Connection } from '../types';

/* Operazioni di modifica del Design. L'agente invia una lista di queste
   operazioni (tool "edit_design") invece di riscrivere tutto il documento:
   meno token in uscita e modifiche più facili da validare. */

export type DesignOp =
  | { op: 'set_meta'; name?: string; description?: string; children?: boolean; notes?: string }
  | { op: 'add_part'; part: Part }
  | { op: 'update_part'; id: string; name?: string; filamentId?: string; shape?: ShapeNode }
  | { op: 'move_part'; id: string; at?: Vec3; rot?: Vec3 }
  | { op: 'remove_part'; id: string }
  | { op: 'add_joint'; joint: Joint }
  | { op: 'update_joint'; id: string; patch: Partial<Omit<Joint, 'id'>> }
  | { op: 'remove_joint'; id: string }
  | { op: 'set_plan'; strategy?: PrintStrategy; connection?: Connection };

export const LIMITS = {
  maxParts: 40,
  maxNodes: 600,
  maxDepth: 12,
  maxSizeMm: 1000,
  minSizeMm: 0.2,
};

export class DesignError extends Error {}

const SHAPE_OPS = new Set(['box', 'cylinder', 'sphere', 'mesh', 'union', 'difference', 'intersection', 'hull']);

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function checkDim(n: unknown, what: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new DesignError(`${what}: numero non valido`);
  if (n < LIMITS.minSizeMm || n > LIMITS.maxSizeMm) throw new DesignError(`${what}: ${n} mm fuori dai limiti`);
  return n;
}

/** Valida ricorsivamente un nodo e restituisce il numero di nodi. */
export function validateShape(node: ShapeNode, depth = 0): number {
  if (!node || typeof node !== 'object') throw new DesignError('Nodo forma mancante');
  if (depth > LIMITS.maxDepth) throw new DesignError('Albero della forma troppo profondo');
  if (!SHAPE_OPS.has(node.op)) throw new DesignError(`Operazione forma sconosciuta: ${String((node as { op: unknown }).op)}`);
  if (node.at !== undefined && !isVec3(node.at)) throw new DesignError('"at" deve essere [x,y,z]');
  if (node.rot !== undefined && !isVec3(node.rot)) throw new DesignError('"rot" deve essere [x,y,z]');
  switch (node.op) {
    case 'box':
      if (!isVec3(node.size)) throw new DesignError('box.size deve essere [x,y,z]');
      node.size.forEach((s, i) => checkDim(s, `box.size[${i}]`));
      if (node.radius !== undefined && (node.radius < 0 || !Number.isFinite(node.radius))) throw new DesignError('box.radius non valido');
      return 1;
    case 'cylinder':
      checkDim(node.h, 'cylinder.h');
      checkDim(node.r, 'cylinder.r');
      if (node.r2 !== undefined && (node.r2 < 0 || node.r2 > LIMITS.maxSizeMm)) throw new DesignError('cylinder.r2 non valido');
      return 1;
    case 'sphere':
      checkDim(node.r, 'sphere.r');
      return 1;
    case 'mesh':
      if (typeof node.ref !== 'string' || !node.ref) throw new DesignError('mesh.ref mancante');
      return 1;
    default: {
      if (!Array.isArray(node.children) || node.children.length === 0) throw new DesignError(`${node.op} senza figli`);
      return 1 + node.children.reduce((n, c) => n + validateShape(c, depth + 1), 0);
    }
  }
}

export function validateDesign(d: Design, filamentIds?: Set<string>): void {
  if (d.parts.length > LIMITS.maxParts) throw new DesignError(`Troppe parti (max ${LIMITS.maxParts})`);
  const ids = new Set<string>();
  let nodes = 0;
  for (const p of d.parts) {
    if (!p.id || ids.has(p.id)) throw new DesignError(`Id parte duplicato o vuoto: "${p.id}"`);
    ids.add(p.id);
    nodes += validateShape(p.shape);
    if (filamentIds && p.filamentId && !filamentIds.has(p.filamentId)) {
      throw new DesignError(`Filamento "${p.filamentId}" non disponibile per la parte "${p.id}"`);
    }
  }
  if (nodes > LIMITS.maxNodes) throw new DesignError(`Modello troppo complesso (${nodes} nodi, max ${LIMITS.maxNodes})`);
  const jids = new Set<string>();
  for (const j of d.joints) {
    if (!j.id || jids.has(j.id)) throw new DesignError(`Id giunto duplicato o vuoto: "${j.id}"`);
    jids.add(j.id);
    if (!ids.has(j.partA) || !ids.has(j.partB)) throw new DesignError(`Il giunto "${j.id}" collega parti inesistenti`);
    if (!isVec3(j.origin)) throw new DesignError(`Il giunto "${j.id}" ha un'origine non valida`);
    if (!['x', 'y', 'z'].includes(j.axis)) throw new DesignError(`Il giunto "${j.id}" ha un asse non valido`);
  }
}

function findIndex<T extends { id: string }>(list: T[], id: string, what: string): number {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new DesignError(`${what} "${id}" non trovato`);
  return i;
}

/** Applica le operazioni in modo atomico: se una fallisce, il design resta invariato. */
export function applyOps(design: Design, ops: DesignOp[], filamentIds?: Set<string>): Design {
  const d: Design = structuredClone(design);
  for (const o of ops) {
    switch (o.op) {
      case 'set_meta':
        if (o.name !== undefined) d.name = String(o.name).slice(0, 80);
        if (o.description !== undefined) d.description = String(o.description).slice(0, 500);
        if (o.children !== undefined) d.intendedUse.children = !!o.children;
        if (o.notes !== undefined) d.intendedUse.notes = String(o.notes).slice(0, 300);
        break;
      case 'add_part':
        if (d.parts.some((p) => p.id === o.part.id)) throw new DesignError(`La parte "${o.part.id}" esiste già`);
        d.parts.push(o.part);
        break;
      case 'update_part': {
        const p = d.parts[findIndex(d.parts, o.id, 'Parte')];
        if (o.name !== undefined) p.name = o.name;
        if (o.filamentId !== undefined) p.filamentId = o.filamentId;
        if (o.shape !== undefined) p.shape = o.shape;
        break;
      }
      case 'move_part': {
        const p = d.parts[findIndex(d.parts, o.id, 'Parte')];
        p.shape = { op: 'union', children: [p.shape], at: o.at, rot: o.rot };
        break;
      }
      case 'remove_part':
        d.parts.splice(findIndex(d.parts, o.id, 'Parte'), 1);
        d.joints = d.joints.filter((j) => j.partA !== o.id && j.partB !== o.id);
        break;
      case 'add_joint':
        if (d.joints.some((j) => j.id === o.joint.id)) throw new DesignError(`Il giunto "${o.joint.id}" esiste già`);
        d.joints.push(o.joint);
        break;
      case 'update_joint': {
        const j = d.joints[findIndex(d.joints, o.id, 'Giunto')];
        Object.assign(j, o.patch);
        break;
      }
      case 'remove_joint':
        d.joints.splice(findIndex(d.joints, o.id, 'Giunto'), 1);
        break;
      case 'set_plan':
        if (o.strategy) d.printPlan.strategy = o.strategy;
        if (o.connection) d.printPlan.connection = o.connection;
        break;
      default:
        throw new DesignError(`Operazione sconosciuta: ${JSON.stringify(o)}`);
    }
  }
  validateDesign(d, filamentIds);
  return d;
}

/** Visita i nodi; `subtractive` è true per i nodi che vengono sottratti (fori, tasche). */
export function walkShape(
  node: ShapeNode,
  fn: (n: ShapeNode, ctx: { subtractive: boolean; path: number[] }) => void,
  ctx: { subtractive: boolean; path: number[] } = { subtractive: false, path: [] },
): void {
  fn(node, ctx);
  if ('children' in node) {
    node.children.forEach((c, i) => {
      const subtractive = ctx.subtractive || (node.op === 'difference' && i > 0);
      walkShape(c, fn, { subtractive, path: [...ctx.path, i] });
    });
  }
}
