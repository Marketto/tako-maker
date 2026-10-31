/// <reference lib="webworker" />
import Module, { type ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { evaluateDesign, type RawMesh } from './evaluate';
import type { Design, Tolerances } from '../types';

let ready: Promise<ManifoldToplevel> | null = null;
function load() {
  ready ??= Module({ locateFile: () => wasmUrl }).then((w) => {
    w.setup();
    return w;
  });
  return ready;
}

self.onmessage = async (ev: MessageEvent<{ id: number; design: Design; meshes: Record<string, RawMesh>; tol?: Record<string, Tolerances> }>) => {
  const { id, design, meshes, tol } = ev.data;
  try {
    const w = await load();
    const result = evaluateDesign(w, design, meshes, tol ?? {});
    const transfer = result.parts.flatMap((p) => [p.mesh.positions.buffer, p.mesh.indices.buffer]);
    (self as unknown as Worker).postMessage({ id, result }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: (e as Error).message });
  }
};
