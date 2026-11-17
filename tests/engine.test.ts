import { describe, expect, it, vi } from 'vitest';

/** Worker finto: registra le istanze per poter simulare errori e risposte. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string; preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  sent: { id: number }[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: { id: number }) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('evaluateInWorker', () => {
  it('un worker che non parte rifiuta le richieste invece di lasciarle in attesa, e il successivo è nuovo', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { evaluateInWorker, GeometryWorkerError } = await import('../src/core/geometry/engine');
    const design = { parts: [] } as never;

    const first = evaluateInWorker(design, {});
    const w1 = FakeWorker.all[0];
    w1.onerror!({ message: 'Failed to fetch worker', preventDefault: () => {} });
    await expect(first).rejects.toBeInstanceOf(GeometryWorkerError);
    expect(w1.terminated).toBe(true);

    const second = evaluateInWorker(design, {});
    const w2 = FakeWorker.all[1];
    expect(w2).toBeDefined();
    w2.onmessage!({ data: { id: w2.sent[0].id, result: { parts: [] } } });
    await expect(second).resolves.toEqual({ parts: [] });
    vi.unstubAllGlobals();
  });
});
