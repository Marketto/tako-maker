import { useEffect } from 'react';
import type { Snapshot } from '../app/session';
import { cheer } from './mascot/bus';

/* Guida di montaggio: un passo per pezzo, con animazione nel visualizzatore. */

export function AssemblyPanel({ snap, step, setStep, playing, setPlaying }: {
  snap: Snapshot;
  step: number;
  setStep: (n: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
}) {
  const steps = snap.assembly?.steps ?? [];
  const n = steps.length;

  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep(step + 1), 2600);
    return () => clearTimeout(t);
  }, [playing, step, n, setStep, setPlaying]);

  useEffect(() => {
    if (n > 1 && step === n - 1) cheer('montaggio');
  }, [step, n]);

  if (!n) {
    return (
      <div className="panel-empty muted">
        La guida di montaggio compare quando il modello è diviso in parti da stampare separatamente (scheda “Stampa” → parti separate).
      </div>
    );
  }
  const s = steps[Math.min(step, n - 1)];
  return (
    <div className="assembly">
      <div className="step-head">
        <span className="badge">Passo {s.index + 1} di {n}</span>
        <strong>{s.partName}</strong>
      </div>
      <p className="step-text">{s.text}</p>
      {s.tips.length > 0 && (
        <ul className="tips">
          {s.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      <div className="step-controls">
        <button className="btn" disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1); }}>‹ Indietro</button>
        <button className="btn" onClick={() => { if (step >= n - 1) setStep(0); setPlaying(!playing); }}>{playing ? 'Pausa' : step >= n - 1 ? 'Rivedi' : 'Riproduci'}</button>
        <button className="btn primary" disabled={step >= n - 1} onClick={() => { setPlaying(false); setStep(step + 1); }}>Avanti ›</button>
      </div>
      <ol className="step-list">
        {steps.map((x, i) => (
          <li key={x.partId} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button onClick={() => { setPlaying(false); setStep(i); }}>{x.partName}</button>
          </li>
        ))}
      </ol>
    </div>
  );
}
