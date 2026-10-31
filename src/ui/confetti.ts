/* Coriandoli all'esportazione: puro DOM + CSS, rispettano "riduci movimento". */

const DEFAULT = ['#ff6fb5', '#ffd23f', '#7c4dff', '#3fb8ff', '#3ccf7a', '#ff8a3d'];

export function confetti(colors: string[] = DEFAULT, count = 46) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const palette = colors.length ? colors : DEFAULT;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const shape = i % 3;
    p.className = `confetto s${shape}`;
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 120}vw`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--d', `${0.9 + Math.random() * 0.9}s`);
    p.style.left = `${40 + Math.random() * 20}%`;
    p.style.background = palette[i % palette.length];
    p.style.animationDelay = `${Math.random() * 0.15}s`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 2200);
}
