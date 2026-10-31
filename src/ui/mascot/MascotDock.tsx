import { useCallback, useEffect, useRef, useState } from 'react';
import { Polpetta, type Mood } from './Polpetta';
import { pickPhrase, type PhraseKind } from './phrases';
import { onCheer } from './bus';
import type { Snapshot } from '../../app/session';

/* Polpetta nell'area di lavoro: cambia espressione in base a cosa succede
   e ogni tanto dice una frase di incitamento nel fumetto. */

const BUBBLE_MS = 4500;
const HAPPY_MS = 3000;
const IDLE_MS = 90_000;

function busyMood(label: string): Mood {
  return /modifico|calcolo|importo/i.test(label) ? 'concentrata' : 'pensierosa';
}

export function MascotDock({ snap, tips, compact }: { snap: Snapshot; tips: string[]; compact: boolean }) {
  const [bubble, setBubble] = useState<string | null>(null);
  const [happy, setHappy] = useState(false);
  const [jump, setJump] = useState(0);
  const timers = useRef<{ bubble?: number; happy?: number }>({});

  const say = useCallback((kind: PhraseKind, smile = false) => {
    setBubble(pickPhrase(kind));
    window.clearTimeout(timers.current.bubble);
    timers.current.bubble = window.setTimeout(() => setBubble(null), BUBBLE_MS);
    if (smile) {
      setHappy(true);
      window.clearTimeout(timers.current.happy);
      timers.current.happy = window.setTimeout(() => setHappy(false), HAPPY_MS);
    }
  }, []);

  // Benvenuto all'apertura del progetto
  useEffect(() => {
    say(snap.project.design.parts.length ? 'benvenuto' : 'nuovo');
    const t = timers.current;
    return () => {
      window.clearTimeout(t.bubble);
      window.clearTimeout(t.happy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reazioni allo stato del progetto
  const prev = useRef(snap);
  const designAtBusy = useRef(snap.project.design);
  useEffect(() => {
    const p = prev.current;
    prev.current = snap;
    if (snap.busy && !p.busy) {
      designAtBusy.current = p.project.design;
      say('pensa');
      return;
    }
    if (snap.error && snap.error !== p.error) return say('errore');
    const finished = !snap.busy && p.busy;
    const changed = finished ? snap.project.design !== designAtBusy.current : !snap.busy && snap.project.design !== p.project.design;
    if (changed && snap.project.design.parts.length) return say('modifica', true);
    if (snap.questions.length > p.questions.length && !snap.busy) say('domanda');
  }, [snap, say]);

  // Eventi esterni (esportazione, montaggio)
  useEffect(() => onCheer((kind) => say(kind, kind !== 'montaggio' || Math.random() < 0.5)), [say]);

  // Una frase gentile ogni tanto se l'utente è fermo
  useEffect(() => {
    let t = window.setTimeout(function idle() {
      if (!document.hidden) say('ozio');
      t = window.setTimeout(idle, IDLE_MS * 2);
    }, IDLE_MS);
    const reset = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => say('ozio'), IDLE_MS);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [say]);

  const mood: Mood = snap.error ? 'confusa' : snap.busy ? busyMood(snap.busy) : happy ? 'felice' : 'normale';

  return (
    <div className={`mascot-dock ${compact ? 'compact' : ''}`}>
      {bubble && (
        <div className="speech" role="status" key={bubble}>
          {bubble}
        </div>
      )}
      <button
        className={`mascot-btn ${jump ? 'jump' : ''}`}
        key={jump}
        onClick={() => {
          setJump((n) => n + 1);
          say('coccola', true);
        }}
        aria-label="Coccola Polpetta"
      >
        <Polpetta mood={mood} size={compact ? 92 : 132} tips={tips} />
      </button>
    </div>
  );
}
