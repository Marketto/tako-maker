/* Forme marine in stile cartoon per i controlli del tema «B2» (porting in TypeScript di tools/mockup/).
   Funzioni pure che restituiscono il contenuto SVG come stringa: niente DOM, testabili in Node.
   Le classi CSS (glowline, cirri, wiggle, crawl, sparkle…) sono le micro-animazioni in styles.css (.sea-art). */

export type Pt = [number, number];

/** Contorno scuro comune a tutte le forme. */
export const INK = '#0b1026';
/** Il ciano luminoso che segna ciò che è attivo o si può toccare. */
export const GLOW = '#7ff0f2';

const f = (v: number) => (Math.round(v * 10) / 10).toString();

/** Generatore pseudo-casuale con seme (mulberry32): stesse forme a ogni rendering. */
export function rng(seed: number): (a?: number, b?: number) => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return (a = 0, b = 1) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return a + (b - a) * (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

/** Superellisse irregolare che sta nel rettangolo w×h. */
export function blob(w: number, h: number, seed: number, n = 4, amp = 3, N = 72): Pt[] {
  const r = rng(seed);
  const ph = Array.from({ length: 5 }, () => r(0, 6.28));
  // l'increspatura arriva al massimo a 1.85·amp: si lascia quel margine per restare nel rettangolo
  const a = w / 2 - amp * 1.85;
  const b = h / 2 - amp * 1.85;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = b * Math.sign(s) * Math.abs(s) ** (2 / n);
    const e = amp * (0.6 * Math.sin(2 * t + ph[0]) + 0.5 * Math.sin(3 * t + ph[1]) + 0.35 * Math.sin(5 * t + ph[2]) + 0.25 * Math.sin(7 * t + ph[3]) + 0.15 * Math.sin(11 * t + ph[4]));
    const rr = Math.hypot(x, y) || 1;
    pts.push([w / 2 + x + (x / rr) * e, h / 2 + y + (y / rr) * e]);
  }
  return pts;
}

export const polyPath = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

/** Contorno morbido che passa per i punti medi (vetro di mare, stella). */
function smoothClosed(pts: Pt[]): string {
  const N = pts.length;
  const mid = (i: number): Pt => [(pts[i][0] + pts[(i + 1) % N][0]) / 2, (pts[i][1] + pts[(i + 1) % N][1]) / 2];
  const last = mid(N - 1);
  let d = `M${f(last[0])} ${f(last[1])}`;
  for (let i = 0; i < N; i++) {
    const m = mid(i);
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d} Z`;
}

export type RockKind = 'basalt' | 'sand' | 'slab' | 'pebble' | 'pebbleDark' | 'dead';
// base, ombra, luce, macchie
const PAL: Record<RockKind, [string, string, string, string]> = {
  basalt: ['#55638a', '#36406a', '#8d9cc4', '#2a3358'],
  sand: ['#f2d79a', '#d4aa62', '#fff3cf', '#b98a48'],
  slab: ['#3f4b70', '#2b3456', '#66759e', '#222a4a'],
  pebble: ['#c3cde4', '#8c99b9', '#f4f7ff', '#7d8aab'],
  pebbleDark: ['#46527a', '#323c62', '#6b78a0', '#283052'],
  dead: ['#363c55', '#262b40', '#4c5372', '#20243a'],
};

export function star(cx: number, cy: number, r: number, rot = 0, color = '#ff9f43'): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  let dots = '';
  for (let i = 0; i < 5; i++) {
    const a = ((rot - 90 + i * 72) * Math.PI) / 180;
    dots += `<circle cx="${f(cx + r * 0.55 * Math.cos(a))}" cy="${f(cy + r * 0.55 * Math.sin(a))}" r="${f(r * 0.1)}" fill="#ffe0b0"/>`;
  }
  return `<g class="wiggle" style="transform-box:fill-box;transform-origin:center"><path d="${smoothClosed(pts)}" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>${dots}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.14)}" fill="#ffe0b0"/></g>`;
}

export function barnacle(x: number, y: number, r: number, delay = 0): string {
  let cirri = '';
  for (let i = 0; i < 5; i++) cirri += `<path d="M${f(x)} ${f(y - r * 0.3)} q${f((i - 2) * r * 0.35)} ${f(-r * 0.9)} ${f((i - 2) * r * 0.6)} ${f(-r * 1.5)}" stroke="#ffe7c2" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  return (
    `<g class="cirri" style="transform-box:fill-box;transform-origin:50% 100%;animation-delay:${delay.toFixed(1)}s">${cirri}</g>` +
    `<path d="M${f(x - r)} ${f(y + r * 0.5)} L${f(x - r * 0.45)} ${f(y - r * 0.55)} L${f(x + r * 0.45)} ${f(y - r * 0.55)} L${f(x + r)} ${f(y + r * 0.5)} Z" fill="#e9e1cc" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M${f(x - r * 0.6)} ${f(y + r * 0.2)} L${f(x - r * 0.35)} ${f(y - r * 0.4)} M${f(x + r * 0.6)} ${f(y + r * 0.2)} L${f(x + r * 0.35)} ${f(y - r * 0.4)}" stroke="#b7ad94" stroke-width="1"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y - r * 0.55)}" rx="${f(r * 0.45)}" ry="${f(r * 0.18)}" fill="#3a3326" stroke="${INK}" stroke-width="1"/>`
  );
}

export function snail(x: number, y: number, s = 1): string {
  return (
    `<g class="crawl" style="transform-box:fill-box">` +
    `<path d="M${f(x - 10 * s)} ${f(y)} q${f(4 * s)} ${f(-5 * s)} ${f(14 * s)} ${f(-3 * s)} l${f(6 * s)} ${f(-5 * s)} m${f(-6 * s)} ${f(5 * s)} l${f(4 * s)} ${f(-7 * s)} M${f(x - 10 * s)} ${f(y)} h${f(22 * s)}" fill="#b7f0c9" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<circle cx="${f(x - s)}" cy="${f(y - 7 * s)}" r="${f(7 * s)}" fill="#ffb86b" stroke="${INK}" stroke-width="1.4"/>` +
    `<path d="M${f(x - s)} ${f(y - 7 * s)} m${f(-4 * s)} 0 a${f(4 * s)} ${f(4 * s)} 0 1 1 ${f(4 * s)} ${f(4 * s)} a${f(2.4 * s)} ${f(2.4 * s)} 0 1 1 ${f(-s)} ${f(-4 * s)}" stroke="${INK}" stroke-width="1" fill="none"/></g>`
  );
}

/** Pesciolino che dorme sulla roccia spenta (pulsante disattivo). */
export function sleepingFish(x: number, y: number): string {
  return (
    `<g class="jsleep">` +
    `<path d="M${f(x - 13)} ${f(y - 5)} l6 5 l-6 5 z" fill="#c9a94a" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="6" fill="#c9a94a" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M${f(x + 3)} ${f(y - 1.5)} q2 1.6 4 0" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
    `<text x="${f(x + 10)}" y="${f(y - 8)}" font-size="9" font-weight="700" fill="#a9b8e0">z</text>` +
    `<text x="${f(x + 15)}" y="${f(y - 15)}" font-size="7" font-weight="700" fill="#a9b8e0">z</text></g>`
  );
}

export interface RockOpts {
  kind?: RockKind;
  /** Esponente della superellisse: più alto = più squadrata. */
  n?: number;
  amp?: number;
  /** Colore delle alghe luminose sul bordo (ciano per gli elementi attivi). */
  glow?: string;
  barnacles?: number;
  moss?: number;
  thick?: number;
  starfish?: boolean;
  snail?: boolean;
  sleepingFish?: boolean;
}

/** Roccia irregolare w×h (spessore compreso) con texture, riflesso e decorazioni. `id` rende unici i clipPath. */
export function rock(w: number, h: number, seed: number, id: string, o: RockOpts = {}): string {
  const { kind = 'basalt', n = 4, amp = 3, glow, barnacles = 0, moss = 0, thick = 6 } = o;
  const [base, shade, light, spot] = PAL[kind];
  const r = rng(seed * 7 + 3);
  const hh = h - thick;
  const pts = blob(w, hh, seed, n, amp);
  const d = polyPath(pts);
  const cp = `${id}c`;
  const out = [
    `<defs><clipPath id="${cp}"><path d="${d}"/></clipPath></defs>`,
    `<path d="${d}" transform="translate(0 ${thick})" fill="${shade}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="${base}"/>`,
  ];
  const tex = [`<path d="M-5 ${f(hh * 0.62)} Q${f(w * 0.22)} ${f(hh * 0.5)} ${f(w * 0.45)} ${f(hh * 0.64)} T${f(w + 5)} ${f(hh * 0.56)} V${f(hh + 5)} H-5 Z" fill="${shade}"/>`];
  for (let i = 0; i < Math.max(4, Math.floor(w / 28)); i++) {
    const x = r(w * 0.08, w * 0.92);
    const y = r(hh * 0.2, hh * 0.85);
    const rx = r(2.5, 6);
    tex.push(
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.7)}" fill="${spot}" opacity=".55"/>` +
        `<path d="M${f(x - rx * 0.6)} ${f(y - rx * 0.3)} q${f(rx * 0.6)} ${f(-rx * 0.5)} ${f(rx * 1.2)} 0" stroke="${light}" stroke-width="1" fill="none" opacity=".6"/>`,
    );
  }
  const crackX = w - r(14, Math.min(w * 0.2, 40));
  if (w > 150) tex.push(`<path d="M${f(crackX)} ${f(hh * 0.3)} l-4 6 l5 3 l-3 7" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`);
  // riflesso pieno in alto a sinistra
  const hl = pts.filter(([x, y]) => y < hh * 0.42 && x < w * 0.55).sort((a, b) => a[0] - b[0]);
  if (hl.length > 3) {
    const dd = `M${hl.map(([px, py]) => `${f(px + (w / 2 - px) * 0.08)} ${f(py + (hh / 2 - py) * 0.25)}`).join(' L')}`;
    tex.push(`<path d="${dd}" stroke="${light}" stroke-width="${f(Math.min(5, hh * 0.08))}" fill="none" stroke-linecap="round" opacity=".9"/>`);
  }
  tex.push(`<circle cx="${f(w * 0.62)}" cy="${f(hh * 0.18)}" r="${f(Math.min(3, hh * 0.05))}" fill="${light}" opacity=".9"/>`);
  const mossColors = ['#5fa84a', '#77c05a', '#4a8f3e'];
  for (let i = 0; i < moss; i++) {
    const [mx, my] = pts[Math.floor(pts.length * (0.28 + 0.06 * i))];
    for (let k = 0; k < 6; k++) {
      const rr = r(2, 3.8);
      tex.push(`<circle cx="${f(mx + r(-9, 9))}" cy="${f(my + r(-7, 0))}" r="${f(rr)}" fill="${mossColors[Math.floor(r(0, 3))]}" stroke="${INK}" stroke-width="1"/>`);
    }
  }
  out.push(`<g clip-path="url(#${cp})">${tex.join('')}</g>`);
  out.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`);
  if (glow) {
    out.push(`<path class="glowline" d="${d}" fill="none" stroke="${glow}" stroke-width="2" stroke-dasharray="6 9" style="filter:drop-shadow(0 0 4px ${glow})"/>`);
    let k = 0;
    pts.forEach(([x, y], i) => {
      if (y > hh * 0.5 && i % 4 === 0) {
        out.push(`<circle class="glowdot" cx="${f(x)}" cy="${f(y)}" r="${f(r(1.4, 2.6))}" fill="${glow}" style="animation-delay:${((k * 0.23) % 2).toFixed(2)}s;filter:drop-shadow(0 0 3px ${glow})"/>`);
        k++;
      }
    });
  }
  for (let i = 0; i < barnacles; i++) {
    const bx = w * (0.84 - 0.07 * i) + r(-2, 2);
    const by = hh * (0.22 + 0.12 * (i % 2));
    out.push(barnacle(bx, by + 2, r(6, 7.5), i * 0.9));
  }
  if (o.starfish) out.push(star(w - Math.min(w * 0.12, 30), hh * 0.8, 12, 12));
  if (o.snail) out.push(snail(w * 0.7, 2, 0.9));
  if (o.sleepingFish) out.push(sleepingFish(w * 0.78, 1));
  return out.join('');
}

/** Ciottolo di vetro di mare levigato dal mare (scelta multipla, filamenti). */
export function seaGlass(w: number, h: number, seed: number, color: string, on: boolean): string {
  // il colore finisce dentro l'SVG come testo: si accetta solo un esadecimale
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) color = '#9aa4c4';
  const r = rng(seed);
  const N = 7;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * (i + r(-0.2, 0.2))) / N;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push([w / 2 + (w / 2 - 2) * Math.sign(c) * Math.abs(c) ** 0.6 * r(0.9, 1), h / 2 + (h / 2 - 2) * Math.sign(s) * Math.abs(s) ** 0.6 * r(0.85, 1)]);
  }
  const d = smoothClosed(pts);
  const op = on ? 0.75 : 0.3;
  const hi = on ? 0.85 : 0.4;
  const spark = on
    ? `<path class="sparkle" d="M${f(w * 0.8)} ${f(h * 0.12)} l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="#fff" style="transform-box:fill-box;transform-origin:center;animation-delay:${r(0, 2).toFixed(1)}s"/>`
    : '';
  return (
    `<path d="${d}" transform="translate(0 4)" fill="#000" opacity=".35"/>` +
    `<path d="${d}" fill="${color}" opacity="${op}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M${f(w * 0.14)} ${f(h * 0.42)} Q${f(w * 0.2)} ${f(h * 0.18)} ${f(w * 0.45)} ${f(h * 0.16)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="${hi}"/>` +
    `<circle cx="${f(w * 0.55)}" cy="${f(h * 0.2)}" r="1.6" fill="#fff" opacity="${hi}"/>${spark}`
  );
}

/** Conchiglia aperta con la perla: segna la lastra scelta. Centro in (cx, cy). */
export function shellPearl(cx: number, cy: number, on: boolean): string {
  const shell = `<path d="M${f(cx - 13)} ${f(cy + 4)} Q${f(cx - 14)} ${f(cy - 12)} ${f(cx)} ${f(cy - 13)} Q${f(cx + 14)} ${f(cy - 12)} ${f(cx + 13)} ${f(cy + 4)} Z" fill="${on ? '#ffb8a3' : '#5a6488'}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const ribs = [-8, -3, 3, 8].map((dx) => `<path d="M${f(cx)} ${f(cy + 3)} L${f(cx + dx)} ${f(cy - 10)}" stroke="${on ? '#d0705c' : '#454e72'}" stroke-width="1"/>`).join('');
  const lip = `<path d="M${f(cx - 14)} ${f(cy + 4)} Q${f(cx)} ${f(cy + 12)} ${f(cx + 14)} ${f(cy + 4)} Z" fill="${on ? '#f08f78' : '#4a5378'}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const pearl = on
    ? `<g class="pulse"><circle cx="${f(cx)}" cy="${f(cy + 1)}" r="5.5" fill="#f4fbff" stroke="${INK}" stroke-width="1.3"/><circle cx="${f(cx - 1.8)}" cy="${f(cy - 0.8)}" r="1.6" fill="#fff"/></g>`
    : '';
  return shell + ribs + lip + pearl;
}

/** Perla della barra di avanzamento: piena se il passo è fatto, il pesce nuota sopra quella attuale. */
export function pearl(cx: number, cy: number, state: 'done' | 'now' | 'todo'): string {
  if (state === 'todo') return `<circle cx="${f(cx)}" cy="${f(cy)}" r="5" fill="#1b2a55" stroke="#3a4a7e" stroke-width="1.5"/>`;
  const glow = state === 'now' ? ` class="pulse"` : '';
  return `<g${glow}><circle cx="${f(cx)}" cy="${f(cy)}" r="${state === 'now' ? 8 : 6.5}" fill="#eaf6ff" stroke="${INK}" stroke-width="1.5"/><circle cx="${f(cx - 2)}" cy="${f(cy - 2)}" r="2" fill="#fff"/></g>`;
}

/** Pesce giallo (lo stesso delle transizioni) con il muso a destra, in (x, y). */
export function fish(x: number, y: number, s = 1): string {
  return (
    `<g class="swim" transform="translate(${f(x - 16 * s)} ${f(y - 9 * s)}) scale(${s})">` +
    `<path d="M2 3 L8 9 L2 15 Z" fill="#ffd166" stroke="${INK}" stroke-width="1.2"/>` +
    `<ellipse cx="16" cy="9" rx="10" ry="7" fill="#ffd166" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="21" cy="7.5" r="1.7" fill="${INK}"/></g>`
  );
}

/* ---------- Tentacolo rastremato con ventose (da forme.py) ---------- */

function spline(pts: Pt[], n = 16): Pt[] {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function frame(c: Pt[]): { s: number[]; nrm: Pt[] } {
  const L = [0];
  for (let i = 1; i < c.length; i++) L.push(L[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const nrm = c.map((_, i) => {
    const a = c[Math.max(i - 1, 0)];
    const b = c[Math.min(i + 1, c.length - 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    return [-dy / d, dx / d] as Pt;
  });
  return { s: L.map((x) => x / tot), nrm };
}

function ribbon(c: Pt[], nrm: Pt[], w: number[], i0: number, i1: number, off = 0, scale = 1, cap = false): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = i0; i <= i1; i++) {
    const ww = (w[i] * scale) / 2;
    const cx = c[i][0] + nrm[i][0] * off * w[i];
    const cy = c[i][1] + nrm[i][1] * off * w[i];
    left.push([cx + nrm[i][0] * ww, cy + nrm[i][1] * ww]);
    right.push([cx - nrm[i][0] * ww, cy - nrm[i][1] * ww]);
  }
  let d = `M${left.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}`;
  if (cap) {
    const rr = Math.max((w[i1] * scale) / 2, 0.6);
    const e = right[right.length - 1];
    d += ` A${f(rr)} ${f(rr)} 0 0 1 ${f(e[0])} ${f(e[1])}`;
  }
  return `${d} L${right.reverse().map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;
}

/** Tentacolo rosa per i punti dati, da largo `w0` a sottile `w1`.
    `behind` = tratti (indici dei punti) che passano dietro l'elemento: vanno nello strato `back`. */
export function tentacle(pts: Pt[], w0: number, w1: number, behind: [number, number][] = [], side = 1, n = 16): { back: string; front: string } {
  const [base, hi, shade, suck, ring, backCol] = ['#d9508f', '#ff9fcb', '#9c2a64', '#ffc4de', '#b8417c', '#6a1f46'];
  const c = spline(pts, n);
  const { s, nrm } = frame(c);
  const w = s.map((x) => w1 + (w0 - w1) * (1 - x) ** 1.15);
  const hidden = c.map(() => false);
  for (const [a, b] of behind) for (let i = a * n; i <= Math.min(b * n, c.length - 1); i++) hidden[i] = true;
  const back: string[] = [];
  const front: string[] = [];
  let i = 0;
  while (i < c.length) {
    let j = i;
    while (j + 1 < c.length && hidden[j + 1] === hidden[i]) j++;
    const a = Math.max(i - 1, 0);
    const b = Math.min(j + 1, c.length - 1);
    const cap = b === c.length - 1;
    if (hidden[i]) back.push(`<path d="${ribbon(c, nrm, w, a, b, 0, 1, cap)}" fill="${backCol}"/>`);
    else {
      const g = [
        `<path d="${ribbon(c, nrm, w, a, b, 0, 1, cap)}" fill="${base}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
        `<path d="${ribbon(c, nrm, w, a, b, -0.26 * side, 0.42, cap)}" fill="${shade}" opacity=".75"/>`,
        `<path d="${ribbon(c, nrm, w, a, b, 0.2 * side, 0.3, cap)}" fill="${hi}" opacity=".7"/>`,
      ];
      // ventose sul lato in ombra, distanziate in proporzione allo spessore
      let acc = 0;
      let last = -1;
      for (let k = a + 2; k < b - 1; k++) {
        if (last >= 0) acc += Math.hypot(c[k][0] - c[last][0], c[k][1] - c[last][1]);
        last = k;
        const r = w[k] * 0.22;
        if (r < 1.2 || acc < r * 4.2) continue;
        acc = 0;
        const x = c[k][0] - nrm[k][0] * side * w[k] * 0.3;
        const y = c[k][1] - nrm[k][1] * side * w[k] * 0.3;
        g.push(
          `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${suck}" opacity=".85"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.5)}" fill="${ring}"/>` +
            `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.18)}" fill="#fff" opacity=".8"/>`,
        );
      }
      front.push(g.join(''));
    }
    i = j + 1;
  }
  return { back: back.join(''), front: front.join('') };
}

/* ---------- Pulsanti a icona, elimina, avvisi (da materiali.py) ---------- */

/** Capasanta che respira e fa bolle (pulsanti a icona), viewBox 0 0 52 52. */
export function scallop(): string {
  const cx = 26;
  const hy = 42;
  const R = 22;
  const ribs = 9;
  const angs = Array.from({ length: ribs + 1 }, (_, i) => ((200 + i * (140 / ribs)) * Math.PI) / 180);
  const edge: Pt[] = angs.map((a) => [cx + R * Math.cos(a), hy - 4 + R * Math.sin(a) * 1.05]);
  let d = `M17 ${hy} L${f(edge[0][0])} ${f(edge[0][1])}`;
  for (let i = 0; i < ribs; i++) {
    const am = (angs[i] + angs[i + 1]) / 2;
    d += ` Q${f(cx + (R + 3.5) * Math.cos(am))} ${f(hy - 4 + (R + 3.5) * Math.sin(am) * 1.05)} ${f(edge[i + 1][0])} ${f(edge[i + 1][1])}`;
  }
  d += ` L35 ${hy} Z`;
  const ribsSvg = edge.slice(1, -1).map(([x, y]) => `<path d="M${cx} ${hy - 1} L${f(x)} ${f(y)}" stroke="#d0705c" stroke-width="1.3"/>`).join('');
  return (
    `<g class="breathe" style="transform-box:fill-box;transform-origin:50% 100%"><path d="${d}" fill="#ffb8a3" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>${ribsSvg}` +
    `<path d="M12 22 Q18 10 30 8" stroke="#fff1ea" stroke-width="3" fill="none" stroke-linecap="round"/></g>` +
    `<path d="M15 ${hy} L37 ${hy} L34 ${hy + 7} L18 ${hy + 7} Z" fill="#f08f78" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<circle class="rise" cx="40" cy="8" r="3" fill="none" stroke="#bff6ff" stroke-width="1.4"/><circle class="rise rise2" cx="44" cy="14" r="2" fill="none" stroke="#bff6ff" stroke-width="1.2"/>`
  );
}

/** Dollaro della sabbia che dondola (pulsanti a icona), viewBox 0 0 52 52. */
export function sandDollar(): string {
  const petals = Array.from({ length: 5 }, (_, i) => `<ellipse cx="26" cy="15" rx="3.2" ry="7.5" fill="#e8d3a2" stroke="#b39463" stroke-width="1.3" transform="rotate(${i * 72} 26 26)"/>`).join('');
  return (
    `<g class="wobble" style="transform-box:fill-box;transform-origin:center"><circle cx="26" cy="28" r="23" fill="#c7aa72" stroke="${INK}" stroke-width="2"/><circle cx="26" cy="26" r="23" fill="#f6e7c1" stroke="${INK}" stroke-width="2"/>` +
    `<g opacity=".6">${petals}</g><path d="M10 18 Q16 8 28 6" stroke="#fffaf0" stroke-width="3" fill="none" stroke-linecap="round"/></g>`
  );
}

/** Carapace di granchio con la chela che schiocca (elimina). La chela sporge a sinistra fino a x = -40, gli occhi sopra fino a y = -15. */
export function crabShell(w: number, h: number, seed = 3): string {
  const r = rng(seed);
  const body = polyPath(blob(w, h - 5, seed, 3, 2));
  let spots = '';
  for (let i = 0; i < Math.floor(w / 14); i++) spots += `<circle cx="${f(r(Math.min(30, w * 0.4), w - 12))}" cy="${f(r(10, Math.max(11, h - 16)))}" r="${f(r(1.5, 3))}" fill="#ffc29a" stroke="#b8401f" stroke-width=".8"/>`;
  const eye = (x: number) =>
    `<path d="M${f(x)} 6 v-12" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M${f(x)} 6 v-12" stroke="#ff7a4f" stroke-width="3" stroke-linecap="round"/>` +
    `<g class="blink" style="transform-box:fill-box;transform-origin:center"><circle cx="${f(x)}" cy="-9" r="5.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="${f(x + 1)}" cy="-8.5" r="2.6" fill="${INK}"/><circle cx="${f(x + 2)}" cy="-10" r=".9" fill="#fff"/></g>`;
  let teethUp = '';
  for (let i = 0; i < 4; i++) teethUp += `<path d="M${f(-30 + i * 8)} ${f(h * 0.21 + i * 1.8)} l3 4 l3 -3" fill="#fff3e6" stroke="${INK}" stroke-width=".8"/>`;
  let teethLo = '';
  for (let i = 0; i < 3; i++) teethLo += `<path d="M${f(-26 + i * 8)} ${f(h * 0.83 - i * 1.8)} l3 -4 l3 3" fill="#fff3e6" stroke="${INK}" stroke-width=".8"/>`;
  const upper =
    `<g class="snap" style="transform-box:view-box;transform-origin:14px ${f(h * 0.42)}px"><path d="M22 ${f(h * 0.26)} C 8 ${f(h * 0.02)}, -18 ${f(h * -0.02)}, -40 ${f(h * 0.14)} C -30 ${f(h * 0.24)}, -14 ${f(h * 0.32)}, 4 ${f(h * 0.46)} Z" fill="#ff7a4f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `${teethUp}<path d="M-6 ${f(h * 0.12)} Q 6 ${f(h * 0.06)} 14 ${f(h * 0.16)}" stroke="#ffc29a" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
  const lower = `<path d="M20 ${f(h * 0.78)} C 6 ${f(h * 0.98)}, -16 ${f(h * 1.02)}, -32 ${f(h * 0.86)} C -22 ${f(h * 0.78)}, -8 ${f(h * 0.66)}, 4 ${f(h * 0.56)} Z" fill="#e85d33" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>${teethLo}`;
  return (
    `${eye(Math.floor(w * 0.6))}${eye(Math.floor(w * 0.78))}` +
    `<path d="${body}" transform="translate(0 5)" fill="#a8341a" stroke="${INK}" stroke-width="2.4"/><path d="${body}" fill="#f0643a" stroke="${INK}" stroke-width="2.4"/>` +
    `<path d="M${f(Math.min(30, w * 0.4))} ${f(h * 0.3)} Q ${f(w * 0.5)} 6 ${f(w - 20)} ${f(h * 0.3)}" stroke="#ffb08a" stroke-width="3" fill="none" stroke-linecap="round"/>${spots}` +
    `${lower}<ellipse cx="16" cy="${f(h * 0.5)}" rx="20" ry="${f(h * 0.4)}" fill="#f0643a" stroke="${INK}" stroke-width="2"/><path d="M4 ${f(h * 0.36)} q8 -6 18 -2" stroke="#ffb08a" stroke-width="2.5" fill="none" stroke-linecap="round"/>${upper}`
  );
}

/** Bottiglia con il messaggio (avvisi), viewBox 0 0 96 48. */
export function bottle(): string {
  return (
    `<path d="M6 12 Q2 12 2 24 Q2 36 6 36 L52 36 Q58 36 62 31 L74 29 L74 19 L62 17 Q58 12 52 12 Z" fill="#5fc79a" fill-opacity=".7" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="14" y="17" width="40" height="14" rx="7" fill="#f6e7c1" stroke="${INK}" stroke-width="1.4"/><path d="M18 21 h30 M18 25 h24" stroke="#b49a68" stroke-width="1.2"/>` +
    `<rect x="73" y="18.5" width="9" height="11" rx="2" fill="#c98a52" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M8 16 Q30 13 52 15" stroke="#fff" stroke-width="2.5" fill="none" opacity=".75" stroke-linecap="round"/>` +
    `<circle class="rise" cx="66" cy="12" r="2.5" fill="none" stroke="#bff6ff" stroke-width="1.2"/>`
  );
}
