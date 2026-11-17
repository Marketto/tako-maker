import type { Design, Tolerances } from '../types';
import type { EvalResult, OrientInput, RawMesh } from './evaluate';

/* Interfaccia del thread principale verso il Web Worker della geometria. */

/** Il worker non è partito o si è fermato (per esempio il suo file non c'è più dopo un aggiornamento dell'app). */
export class GeometryWorkerError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'GeometryWorkerError';
  }
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: EvalResult) => void; reject: (e: Error) => void }>();

/** Rifiuta le richieste in attesa e butta il worker: la prossima richiesta ne crea uno nuovo. */
function fail(detail: string) {
  worker?.terminate();
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const p of waiting) p.reject(new GeometryWorkerError(detail));
}

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
    // Senza questi, un worker che non si carica lascia le richieste in attesa per sempre.
    worker.onerror = (ev) => {
      ev.preventDefault();
      fail(ev.message || 'worker non avviato');
    };
    worker.onmessageerror = () => fail('messaggio del worker illeggibile');
  }
  return worker;
}

export function evaluateInWorker(design: Design, meshes: Record<string, RawMesh>, tol: Record<string, Tolerances> = {}, orient?: OrientInput): Promise<EvalResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // Le mesh importate vengono copiate (non trasferite) perché servono ancora qui.
    getWorker().postMessage({ id, design, meshes, tol, orient });
  });
}
