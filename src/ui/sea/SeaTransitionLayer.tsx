import { useMemo } from 'react';
import { useSea, type SeaState } from './transition';

/* Strato sopra l'app che disegna la transizione in corso (vedi transition.ts e .sea-* in styles.css). */

/** Macchia irregolare (viewBox 0 0 200 200) per l'inchiostro. */
function splat(seed: number, r: number, amp: number): string {
  const ph = [1.3, 4.1, 2.2, 5.7, 0.6].map((p) => p + seed);
  const pts: string[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const e = amp * (0.6 * Math.sin(2 * a + ph[0]) + 0.5 * Math.sin(3 * a + ph[1]) + 0.35 * Math.sin(5 * a + ph[2]) + 0.25 * Math.sin(7 * a + ph[3]) + 0.15 * Math.sin(11 * a + ph[4]));
    pts.push(`${(100 + (r + e) * Math.cos(a)).toFixed(1)} ${(100 + (r + e) * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}
const SPLAT = [splat(0, 84, 9), splat(1.7, 50, 7), splat(3.1, 24, 5)];
const DROPS: [number, number, number][] = [[6, 40, 6], [192, 128, 5], [52, 190, 4], [168, 14, 7]];

const FISH = (
  <>
    <path d="M2 3 L8 9 L2 15 Z" fill="#ffd166" stroke="#0b1026" strokeWidth="1.2" />
    <ellipse cx="16" cy="9" rx="10" ry="7" fill="#ffd166" stroke="#0b1026" strokeWidth="1.2" />
    <circle cx="21" cy="7.5" r="1.7" fill="#0b1026" />
  </>
);

function Ink({ s }: { s: SeaState }) {
  // Il cerchio deve coprire lo schermo partendo dal punto toccato.
  const w = window.innerWidth;
  const h = window.innerHeight;
  const r = Math.hypot(Math.max(s.x, w - s.x), Math.max(s.y, h - s.y)) * 1.35;
  return (
    <svg className="sea-splat" viewBox="0 0 200 200" style={{ left: s.x - r, top: s.y - r, width: 2 * r, height: 2 * r }}>
      <path d={SPLAT[0]} fill="#2b1656" stroke="#0b1026" strokeWidth="1" />
      {DROPS.map(([x, y, rr], i) => <circle key={i} cx={x} cy={y} r={rr} fill="#2b1656" stroke="#0b1026" strokeWidth="1" />)}
      <path d={SPLAT[1]} fill="#3c2275" />
      <path d={SPLAT[2]} fill="#4d2e92" />
    </svg>
  );
}

function Wave() {
  const foam: [number, number, number][] = [[3, 44, 12], [16, 30, 9], [31, 46, 11], [41, 36, 8], [55, 44, 12], [64, 34, 9], [79, 45, 11], [90, 36, 9], [98, 44, 7]];
  return (
    <div className="sea-wave">
      <svg className="sea-wave-crest" viewBox="0 0 100 70" preserveAspectRatio="none">
        <path d="M0 60 Q 12 0 25 40 T 50 40 T 75 40 T 100 40 V 70 H0 Z" fill="#5fd6e8" stroke="#0b1026" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="sea-wave-foam" viewBox="0 0 100 70" preserveAspectRatio="none">
        {foam.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r / 4} ry={r} fill="#f4fbff" stroke="#0b1026" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="sea-wave-body">
        <svg className="sea-wave-fish" viewBox="0 0 28 18" style={{ left: '38%', top: '12%', width: 62 }}>{FISH}</svg>
        <svg className="sea-wave-fish" viewBox="0 0 28 18" style={{ left: '12%', top: '30%', width: 40 }}>{FISH}</svg>
        <svg className="sea-wave-fish" viewBox="0 0 28 18" style={{ left: '68%', top: '46%', width: 48 }}>{FISH}</svg>
      </div>
    </div>
  );
}

function Bubbles({ id }: { id: number }) {
  const list = useMemo(() => {
    let seed = id * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 42 }, () => ({ x: rnd() * 104 - 2, size: 28 + rnd() * 64, delay: rnd() * 220, dy: rnd() * 30 }));
  }, [id]);
  return (
    <>
      <div className="sea-bubbles-veil" />
      {list.map((b, i) => (
        <span key={i} className="sea-bubble" style={{ left: `${b.x}%`, width: b.size, height: b.size, marginLeft: -b.size / 2, bottom: `${-b.dy - 12}%`, animationDelay: `${b.delay}ms` }} />
      ))}
    </>
  );
}

export function SeaTransitionLayer() {
  const s = useSea();
  if (!s) return null;
  return (
    <div key={s.id} className={`sea-tr sea-${s.kind} sea-${s.phase}`} aria-hidden="true">
      {s.kind === 'ink' ? <Ink s={s} /> : s.kind === 'wave' ? <Wave /> : <Bubbles id={s.id} />}
    </div>
  );
}
