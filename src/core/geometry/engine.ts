import type { Design, Tolerances } from '../types';
import type { EvalResult, RawMesh } from './evaluate';

/* Interfaccia del thread principale verso il Web Worker della geometria. */

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: EvalResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; result?: EvalResult; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.error) p.reject(new Error(ev.data.error));
      else p.resolve(ev.data.result!);
    };
  }
  return worker;
}

export function evaluateInWorker(design: Design, meshes: Record<string, RawMesh>, tol: Record<string, Tolerances> = {}): Promise<EvalResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // Le mesh importate vengono copiate (non trasferite) perché servono ancora qui.
    getWorker().postMessage({ id, design, meshes, tol });
  });
}
