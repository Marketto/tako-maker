import { useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { GLOW, bottle, crabShell, fish, pearl, rock, sandDollar, scallop, seaGlass, shellPearl, tentacle, type RockOpts } from './shapes';

/* Controlli del tema marino «B2»: ogni controllo è un vero <button> con disegnato dietro un oggetto marino
   (roccia, ciottolo, lastra, vetro di mare). Le forme si ridisegnano quando cambia la misura del controllo. */

function useBox(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/** Seme e prefisso per gli id SVG, stabili per tutta la vita del componente. */
function useSeed(): { seed: number; id: string } {
  const raw = useId();
  return useMemo(() => {
    let h = 7;
    for (const ch of raw) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { seed: (h % 997) + 1, id: `sea${raw.replace(/[^a-zA-Z0-9]/g, '')}` };
  }, [raw]);
}

/** Disegno decorativo: posizionato dietro (o davanti) al contenuto, non riceve tocchi. */
function Art({ w, h, svg, className = '', viewBox }: { w: number; h: number; svg: string; className?: string; viewBox?: string }) {
  if (!w || !h || !svg) return null;
  return <svg className={`sea-art ${className}`} width={w} height={h} viewBox={viewBox ?? `0 0 ${w} ${h}`} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: svg }} />;
}

type Variant = 'primary' | 'secondary';

/** Pulsante principale (roccia di basalto con alghe luminose, balani, stella marina e tentacolo)
    o secondario (ciottolo di arenaria con la lumachina). Disattivo: roccia spenta con il pesce che dorme. */
export function SeaButton({ variant = 'primary', big, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useBox(ref);
  const { seed, id } = useSeed();
  const off = !!rest.disabled;
  const art = useMemo(() => {
    if (!w || !h) return { back: '', rock: '', front: '' };
    let o: RockOpts;
    if (variant === 'secondary') o = { kind: off ? 'dead' : 'sand', n: 3.2, amp: 2.5, snail: !off && w > 90 };
    else if (off) o = { kind: 'dead', n: 3.6, sleepingFish: w > 110 };
    else o = { kind: 'basalt', n: 3.6, glow: GLOW, barnacles: w > 150 ? 2 : w > 110 ? 1 : 0, starfish: w > 170, moss: w > 200 ? 1 : 0 };
    const body = rock(w, h, seed, id, o);
    if (variant !== 'primary' || off || w < 120) return { back: '', rock: body, front: '' };
    // Il tentacolo sale da dietro la roccia, passa davanti al bordo sinistro e si arriccia sopra.
    const t = tentacle(
      [[-4, h + 10], [w * 0.05, h * 0.78], [w * 0.035, h * 0.3], [w * 0.1, -5], [w * 0.19, -9], [w * 0.22, -1]],
      Math.min(16, h * 0.28),
      3,
      [[0, 1]],
    );
    return { back: t.back, rock: body, front: t.front };
  }, [w, h, seed, id, variant, off]);
  return (
    <button ref={ref} className={`sea-btn sea-${variant} ${big ? 'big' : ''} ${className}`} {...rest}>
      <Art w={w} h={h} svg={art.back} />
      <Art w={w} h={h} svg={art.rock} />
      <span className="sea-label">{children}</span>
      <Art w={w} h={h} svg={art.front} className="front" />
    </button>
  );
}

/** Scelta su lastra di pietra: quella scelta si illumina e mostra la conchiglia con la perla. */
export function SeaChoice({ selected, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useBox(ref);
  const { seed, id } = useSeed();
  const svg = useMemo(
    () => (w && h ? rock(w, h, seed, id, { kind: 'slab', n: 5, amp: 1.8, thick: 5, glow: selected ? GLOW : undefined }) + (selected ? shellPearl(22, (h - 5) / 2, true) : '') : ''),
    [w, h, seed, id, selected],
  );
  return (
    <button ref={ref} className={`sea-choice ${selected ? 'selected' : ''} ${className}`} aria-pressed={selected} {...rest}>
      <Art w={w} h={h} svg={svg} />
      <span className="sea-label">{children}</span>
    </button>
  );
}

/** Ciottolo sulla sabbia per le schede e le opzioni brevi. */
export function SeaPebble({ on, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useBox(ref);
  const { seed, id } = useSeed();
  const svg = useMemo(() => (w && h ? rock(w, h, seed, id, { kind: on ? 'pebble' : 'pebbleDark', n: 2.6, amp: 1.6, thick: 4, glow: on ? GLOW : undefined }) : ''), [w, h, seed, id, on]);
  return (
    <button ref={ref} className={`sea-pebble ${on ? 'on' : ''} ${className}`} aria-pressed={rest.role ? undefined : on} {...rest}>
      <Art w={w} h={h} svg={svg} />
      <span className="sea-label">{children}</span>
    </button>
  );
}

/** Colore chiaro (luminanza alta): sopra ci va il testo scuro. */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.35;
}

/** Vetro di mare del colore del filamento: acceso se scelto (scelta multipla). */
export function SeaGlass({ color, on, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { color: string; on?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useBox(ref);
  const { seed } = useSeed();
  const svg = useMemo(() => (w && h ? seaGlass(w, h, seed, color, !!on) : ''), [w, h, seed, color, on]);
  return (
    <button ref={ref} className={`sea-glass ${on ? 'on' : ''} ${on && isLight(color) ? 'pale' : ''} ${className}`} aria-pressed={on} style={{ ['--glass' as string]: color }} {...rest}>
      <Art w={w} h={h} svg={svg} className={on ? 'lit' : ''} />
      <span className="sea-label">{children}</span>
    </button>
  );
}

/** Avanzamento: un filo di perle, il pesce nuota sopra il passo attuale. */
export function PearlProgress({ count, index }: { count: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w } = useBox(ref);
  const h = 34;
  const svg = useMemo(() => {
    if (!w || count < 1) return '';
    const pad = 14;
    const step = count > 1 ? (w - 2 * pad) / (count - 1) : 0;
    const y = 22;
    const x = (i: number) => pad + i * step;
    let s = `<path d="M${pad} ${y} Q${w / 2} ${y + 6} ${w - pad} ${y}" stroke="#3a4a7e" stroke-width="1.5" fill="none"/>`;
    if (index > 0) s += `<path d="M${pad} ${y} L${x(index)} ${y + 1}" stroke="${GLOW}" stroke-width="1.6" stroke-dasharray="4 5" class="glowline" fill="none"/>`;
    for (let i = 0; i < count; i++) s += pearl(x(i), y, i < index ? 'done' : i === index ? 'now' : 'todo');
    s += fish(x(index), 6, 0.7);
    return s;
  }, [w, count, index]);
  return (
    <div ref={ref} className="sea-progress" aria-hidden="true">
      <Art w={w} h={h} svg={svg} />
    </div>
  );
}

/** Sfondo del mare: raggi di luce, plancton e colonne di bolle. Tutto fermo con «riduci movimento». */
export function SeaBackdrop({ children }: { children?: ReactNode }) {
  const bits = useMemo(() => {
    let s = 4242;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const colors = ['#ff7ab8', '#7ff0f2', '#ffffff'];
    const plankton = Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 100, size: 1.6 + r() * 2, c: colors[Math.floor(r() * 3)], o: 0.3 + r() * 0.4, d: -r() * 14 }));
    const bubbles = Array.from({ length: 10 }, (_, i) => ({ x: i < 5 ? 1 + r() * 3 : 95 + r() * 3, size: 4 + r() * 3, d: -r() * 6 }));
    return { plankton, bubbles };
  }, []);
  return (
    <div className="sea-backdrop" aria-hidden="true">
      {[8, 38, 67].map((x, i) => <span key={x} className="sea-ray" style={{ left: `${x}%`, animationDelay: `${-i * 2.3}s` }} />)}
      {bits.plankton.map((p, i) => (
        <span key={i} className="sea-plankton" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: p.c, opacity: p.o, animationDelay: `${p.d}s` }} />
      ))}
      {bits.bubbles.map((b, i) => <span key={i} className="sea-rise" style={{ left: `${b.x}%`, width: b.size, height: b.size, animationDelay: `${b.d}s` }} />)}
      {children}
    </div>
  );
}

/** Riquadro su lastra di pietra (riepiloghi, pannelli): il contenuto sta sopra la pietra. */
export function SeaSlab({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useBox(ref);
  const { seed, id } = useSeed();
  const svg = useMemo(() => (w && h ? rock(w, h, seed, id, { kind: 'slab', n: 6, amp: 2.2, thick: 6, barnacles: w > 260 ? 1 : 0 }) : ''), [w, h, seed, id]);
  return (
    <div ref={ref} className={`sea-slab ${className}`} {...rest}>
      <Art w={w} h={h} svg={svg} />
      <div className="sea-label">{children}</div>
    </div>
  );
}

const SHELL_ART = { scallop: scallop(), dollar: sandDollar() };

/** Pulsante a icona: capasanta o dollaro della sabbia, con il simbolo sopra. Serve sempre un aria-label. */
export function SeaIconButton({ shell, lit, small, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { shell: 'scallop' | 'dollar'; lit?: boolean; small?: boolean; 'aria-label': string }) {
  const size = small ? 44 : 52;
  return (
    <button className={`sea-icon sea-icon-${shell} ${lit ? 'lit' : ''} ${small ? 'small' : ''} ${className}`} {...rest}>
      <Art w={size} h={size} viewBox="0 0 52 52" svg={SHELL_ART[shell]} />
      <span className="sea-label">{children}</span>
    </button>
  );
}

const CRAB = crabShell(60, 40);

/** Elimina: carapace di granchio con la chela. Solo icona, quindi serve un aria-label. */
export function SeaDelete({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return (
    <button className={`sea-delete ${className}`} {...rest}>
      <svg className="sea-art" width="65" height="40" viewBox="-44 -18 108 66" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: CRAB }} />
    </button>
  );
}

const BOTTLE = bottle();

/** Avviso: messaggio in bottiglia con il foglio srotolato. */
export function SeaNotice({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`sea-notice ${className}`} {...rest}>
      <svg className="sea-bottle" width="72" height="36" viewBox="0 0 96 48" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: BOTTLE }} />
      <span className="sea-scroll">{children}</span>
    </button>
  );
}
