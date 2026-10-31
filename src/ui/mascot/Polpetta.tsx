import { useMemo, type CSSProperties } from 'react';
import { BODY, FACES, MASCOT_CSS, VIEWBOX, type Mood } from './sprites';

/* Polpetta, la mascotte. Le punte dei tentacoli prendono i colori dei
   filamenti dell'utente tramite le variabili CSS --tip0 … --tip6. */

let injected = false;
function injectCss() {
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.polpetta = '';
  el.textContent = MASCOT_CSS;
  document.head.appendChild(el);
  injected = true;
}

let seq = 0;

export function Polpetta({
  mood = 'normale',
  size = 160,
  tips = [],
  className = '',
  label = 'Polpetta, la mascotte di Tako Maker',
}: {
  mood?: Mood;
  size?: number;
  tips?: string[];
  className?: string;
  label?: string;
}) {
  injectCss();
  const uid = useMemo(() => `pp${++seq}`, []);
  const html = useMemo(() => BODY.replace('<!--FACE-->', FACES[mood]).replaceAll('__UID__', uid), [mood, uid]);
  const style = useMemo(() => {
    const st: Record<string, string> = {};
    if (tips.length) for (let i = 0; i < 7; i++) st[`--tip${i}`] = tips[i % tips.length];
    return st as CSSProperties;
  }, [tips]);
  return (
    <svg
      className={`polpetta ${className}`}
      viewBox={VIEWBOX}
      width={size}
      height={Math.round((size * 400) / 410)}
      role="img"
      aria-label={label}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export type { Mood };
