import type { Design, ShapeNode, StylePrefs, UserSetup, Vec3 } from '../types';
import { walkShape } from './ops';
import { ROUND_RADIUS_MM, SMOOTH_RADIUS_MM } from '../../data/guidelines';

/* Rifinitura delle forme: angoli e spigoli vivi arrotondati, forme armonizzate.
   La preferenza si chiede una volta sola e vale per tutti i progetti (UserSetup.style);
   un progetto può cambiarla per sé (Design.style). L'arrotondamento si applica al calcolo
   della geometria: il disegno resta quello dell'AI, senza riscriverlo a ogni modifica. */

/** Preferenza effettiva: quella del progetto, altrimenti quella generale. */
export function effectiveStyle(design: Design, setup: Pick<UserSetup, 'style'>): StylePrefs {
  const round = design.style?.round ?? setup.style?.round;
  const smooth = design.style?.smooth ?? setup.style?.smooth;
  return { round, smooth: round ? smooth : undefined };
}

/** Copia del design con la preferenza effettiva scritta dentro (per il calcolo della geometria). */
export function withStyle(design: Design, setup: Pick<UserSetup, 'style'>): Design {
  const style = effectiveStyle(design, setup);
  return style.round === design.style?.round && style.smooth === design.style?.smooth ? design : { ...design, style };
}

/** Raggio usato con la preferenza data (0 = non arrotondare). */
export function styleRadius(style: StylePrefs | undefined): number {
  return style?.round ? (style.smooth ? SMOOTH_RADIUS_MM : ROUND_RADIUS_MM) : 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Raggio ottenibile su un box (limitato dallo spessore). */
function boxRadius(size: Vec3, radius: number): number {
  return r1(Math.min(radius, Math.min(...size) / 4));
}

/** Raggio ottenibile sui bordi di un cilindro (limitato da altezza e raggio; niente sulle punte dei coni). */
function cylinderRadius(node: { h: number; r: number; r2?: number }, radius: number): number {
  const rMin = Math.min(node.r, node.r2 ?? node.r);
  return r1(Math.min(radius, node.h / 4, rMin / 2));
}

type Roundable = Extract<ShapeNode, { op: 'box' | 'cylinder' }>;

function target(node: Roundable, radius: number): number {
  return node.op === 'box' ? boxRadius(node.size, radius) : cylinderRadius(node, radius);
}

function isSharp(node: Roundable, radius: number): boolean {
  const t = target(node, radius);
  return t >= 0.3 && (node.radius ?? 0) < t - 0.05;
}

/** Numero di box e cilindri esterni con spigoli vivi. */
export function sharpBoxes(shape: ShapeNode, radius = ROUND_RADIUS_MM): number {
  let n = 0;
  walkShape(shape, (node, ctx) => {
    if ((node.op === 'box' || node.op === 'cylinder') && !ctx.subtractive && isSharp(node, radius)) n++;
  });
  return n;
}

/** Copia della forma con gli spigoli esterni arrotondati (i fori e le tasche restano vivi). */
export function roundShape(shape: ShapeNode, radius = ROUND_RADIUS_MM, subtractive = false): ShapeNode {
  if (shape.op === 'box' || shape.op === 'cylinder') {
    if (subtractive || !isSharp(shape, radius)) return shape;
    return { ...shape, radius: target(shape, radius) };
  }
  if ('children' in shape) {
    return { ...shape, children: shape.children.map((c, i) => roundShape(c, radius, subtractive || (shape.op === 'difference' && i > 0))) };
  }
  return shape;
}
