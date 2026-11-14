import { msg } from '../i18n';

/* Colori dei filamenti che si trovano in commercio, con nomi generici (niente nomi di marca).
   Ogni colore ha una famiglia (tinta) e, se serve, una finitura (pastello, metallizzato…):
   le categorie del wizard filtrano per l'una o per l'altra. I 13 colori «comuni» mantengono
   nome ed esadecimale di sempre: le configurazioni salvate li ritrovano. */

export type ColorFamily = 'neutri' | 'rossi' | 'gialli' | 'verdi' | 'blu' | 'viola' | 'marroni' | 'pelle';
export type ColorFinish = 'pastello' | 'metallizzato' | 'traslucido' | 'fluo' | 'effetto';
export type ColorCategory = 'comuni' | 'tutti' | ColorFamily | ColorFinish;

export interface FilamentColor {
  /** Nome italiano (chiave di traduzione). */
  name: string;
  hex: string;
  family: ColorFamily;
  finish?: ColorFinish;
  /** Tra i più comuni: categoria iniziale. */
  common?: boolean;
  /** Materiali in cui si trova davvero (assente = tutti). */
  materials?: string[];
}

const SHINY = ['PLA', 'PLA-Silk', 'PETG'];
const BRIGHT = ['PLA', 'PLA-Matte', 'PETG'];

export const FILAMENT_COLORS: FilamentColor[] = [
  // Bianchi, grigi e neri
  { name: msg('Bianco'), hex: '#f4f4f0', family: 'neutri', common: true },
  { name: msg('Bianco avorio'), hex: '#f1ead2', family: 'neutri' },
  { name: msg('Grigio chiaro'), hex: '#c4c7c9', family: 'neutri' },
  { name: msg('Grigio'), hex: '#8a8d91', family: 'neutri', common: true },
  { name: msg('Grigio scuro'), hex: '#54585c', family: 'neutri' },
  { name: msg('Nero'), hex: '#222222', family: 'neutri', common: true },
  // Rossi e rosa
  { name: msg('Rosso'), hex: '#d63a32', family: 'rossi', common: true },
  { name: msg('Rosso scuro'), hex: '#a3162b', family: 'rossi' },
  { name: msg('Bordeaux'), hex: '#6e1a2b', family: 'rossi' },
  { name: msg('Corallo'), hex: '#f26b5b', family: 'rossi' },
  { name: msg('Salmone'), hex: '#f4a28c', family: 'rossi' },
  { name: msg('Rosa'), hex: '#f39ac0', family: 'rossi', common: true },
  { name: msg('Fucsia'), hex: '#d61f8c', family: 'rossi' },
  // Arancioni e gialli
  { name: msg('Arancione'), hex: '#f08a24', family: 'gialli', common: true },
  { name: msg('Arancione scuro'), hex: '#d9601a', family: 'gialli' },
  { name: msg('Giallo'), hex: '#f5cf2d', family: 'gialli', common: true },
  { name: msg('Giallo limone'), hex: '#f2e64a', family: 'gialli' },
  { name: msg('Senape'), hex: '#c99a2e', family: 'gialli' },
  // Verdi
  { name: msg('Verde'), hex: '#3aa655', family: 'verdi', common: true },
  { name: msg('Verde scuro'), hex: '#1f5e3b', family: 'verdi' },
  { name: msg('Verde lime'), hex: '#9bd13c', family: 'verdi' },
  { name: msg('Verde oliva'), hex: '#6b7a3a', family: 'verdi' },
  { name: msg('Verde salvia'), hex: '#9cae94', family: 'verdi' },
  { name: msg('Verde acqua'), hex: '#2bb5a8', family: 'verdi' },
  // Blu e azzurri
  { name: msg('Azzurro'), hex: '#4fb3e8', family: 'blu', common: true },
  { name: msg('Turchese'), hex: '#1fb0c9', family: 'blu' },
  { name: msg('Blu'), hex: '#2a55c9', family: 'blu', common: true },
  { name: msg('Blu notte'), hex: '#1f2f5c', family: 'blu' },
  { name: msg('Petrolio'), hex: '#1d5b6b', family: 'blu' },
  // Viola
  { name: msg('Viola'), hex: '#8b52c7', family: 'viola', common: true },
  { name: msg('Viola scuro'), hex: '#4b2a63', family: 'viola' },
  // Marroni e beige
  { name: msg('Marrone'), hex: '#8a5a3b', family: 'marroni', common: true },
  { name: msg('Cioccolato'), hex: '#4e3326', family: 'marroni' },
  { name: msg('Terracotta'), hex: '#b8573a', family: 'marroni' },
  { name: msg('Beige'), hex: '#d8c4a0', family: 'marroni' },
  { name: msg('Sabbia'), hex: '#c9b38a', family: 'marroni' },
  // Tonalità pelle (figure e personaggi)
  { name: msg('Pelle chiara'), hex: '#f1c9a5', family: 'pelle' },
  { name: msg('Pelle media'), hex: '#c68e63', family: 'pelle' },
  { name: msg('Pelle scura'), hex: '#7b4b2e', family: 'pelle' },
  // Pastello
  { name: msg('Rosa pastello'), hex: '#f8c8d8', family: 'rossi', finish: 'pastello' },
  { name: msg('Pesca'), hex: '#f9c6a0', family: 'gialli', finish: 'pastello' },
  { name: msg('Giallo pastello'), hex: '#f7e8a0', family: 'gialli', finish: 'pastello' },
  { name: msg('Verde menta'), hex: '#a8e0c4', family: 'verdi', finish: 'pastello' },
  { name: msg('Azzurro pastello'), hex: '#a9d4f2', family: 'blu', finish: 'pastello' },
  { name: msg('Lilla'), hex: '#c3a6e0', family: 'viola', finish: 'pastello' },
  // Metallizzati (anche seta)
  { name: msg('Oro'), hex: '#c9a443', family: 'gialli', finish: 'metallizzato', materials: SHINY },
  { name: msg('Argento'), hex: '#c0c4c8', family: 'neutri', finish: 'metallizzato', materials: SHINY },
  { name: msg('Rame'), hex: '#b8733e', family: 'marroni', finish: 'metallizzato', materials: SHINY },
  { name: msg('Bronzo'), hex: '#8c6a3b', family: 'marroni', finish: 'metallizzato', materials: SHINY },
  { name: msg('Oro rosa'), hex: '#e0a99a', family: 'rossi', finish: 'metallizzato', materials: SHINY },
  { name: msg('Blu metallizzato'), hex: '#3a5fa0', family: 'blu', finish: 'metallizzato', materials: SHINY },
  { name: msg('Verde metallizzato'), hex: '#2f7d5a', family: 'verdi', finish: 'metallizzato', materials: SHINY },
  // Trasparenti e traslucidi
  { name: msg('Trasparente'), hex: '#d9eef2', family: 'neutri', finish: 'traslucido', common: true },
  { name: msg('Rosso traslucido'), hex: '#e0505a', family: 'rossi', finish: 'traslucido' },
  { name: msg('Arancione traslucido'), hex: '#f39a4a', family: 'gialli', finish: 'traslucido' },
  { name: msg('Verde traslucido'), hex: '#5cc47a', family: 'verdi', finish: 'traslucido' },
  { name: msg('Blu traslucido'), hex: '#5a86e0', family: 'blu', finish: 'traslucido' },
  { name: msg('Viola traslucido'), hex: '#a07ad6', family: 'viola', finish: 'traslucido' },
  // Fluo e fosforescenti
  { name: msg('Giallo fluo'), hex: '#e3f23a', family: 'gialli', finish: 'fluo', materials: BRIGHT },
  { name: msg('Verde fluo'), hex: '#5be33d', family: 'verdi', finish: 'fluo', materials: BRIGHT },
  { name: msg('Arancione fluo'), hex: '#ff7a1a', family: 'gialli', finish: 'fluo', materials: BRIGHT },
  { name: msg('Rosa fluo'), hex: '#ff4fa3', family: 'rossi', finish: 'fluo', materials: BRIGHT },
  { name: msg('Fosforescente verde'), hex: '#cfeeb0', family: 'verdi', finish: 'fluo', materials: BRIGHT },
  { name: msg('Fosforescente azzurro'), hex: '#c4e4f0', family: 'blu', finish: 'fluo', materials: BRIGHT },
  // Effetti speciali
  { name: msg('Effetto marmo'), hex: '#d9d6d0', family: 'neutri', finish: 'effetto', materials: ['PLA', 'PLA-Matte'] },
  { name: msg('Effetto granito'), hex: '#8f8b85', family: 'neutri', finish: 'effetto', materials: ['PLA', 'PLA-Matte'] },
  { name: msg('Effetto legno'), hex: '#a77b52', family: 'marroni', finish: 'effetto', materials: ['PLA'] },
  { name: msg('Nero glitter'), hex: '#2a2a35', family: 'neutri', finish: 'effetto', materials: ['PLA', 'PETG'] },
  { name: msg('Arcobaleno (sfumato)'), hex: '#e66a6a', family: 'rossi', finish: 'effetto', materials: SHINY },
  { name: msg('Seta bicolore'), hex: '#c39b56', family: 'gialli', finish: 'effetto', materials: ['PLA-Silk'] },
];

export const COLOR_CATEGORIES: { id: ColorCategory; label: string }[] = [
  { id: 'comuni', label: msg('Più comuni') },
  { id: 'tutti', label: msg('Tutti') },
  { id: 'neutri', label: msg('Bianchi, grigi e neri') },
  { id: 'rossi', label: msg('Rossi e rosa') },
  { id: 'gialli', label: msg('Arancioni e gialli') },
  { id: 'verdi', label: msg('Verdi') },
  { id: 'blu', label: msg('Blu e azzurri') },
  { id: 'viola', label: msg('Viola') },
  { id: 'marroni', label: msg('Marroni e beige') },
  { id: 'pelle', label: msg('Tonalità pelle') },
  { id: 'pastello', label: msg('Pastello') },
  { id: 'metallizzato', label: msg('Metallizzati') },
  { id: 'traslucido', label: msg('Trasparenti') },
  { id: 'fluo', label: msg('Fluo e fosforescenti') },
  { id: 'effetto', label: msg('Effetti speciali') },
];

/** Colori che si trovano in quel materiale. */
export function colorsFor(material: string): FilamentColor[] {
  return FILAMENT_COLORS.filter((c) => !c.materials || c.materials.includes(material));
}

function inCategory(c: FilamentColor, cat: ColorCategory): boolean {
  return cat === 'tutti' || (cat === 'comuni' ? !!c.common : c.family === cat || c.finish === cat);
}

/** Categorie con almeno un colore per quel materiale. */
export function categoriesFor(material: string): typeof COLOR_CATEGORIES {
  const list = colorsFor(material);
  return COLOR_CATEGORIES.filter((k) => list.some((c) => inCategory(c, k.id)));
}

/** Minuscole e senza accenti, per cercare «rosa» anche scrivendo «Rosà». */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Colori da mostrare: materiale, categoria e testo cercato. La ricerca vale su tutte le categorie
 * e confronta il nome (tradotto e italiano) e le etichette della sua famiglia e finitura.
 * `tr` traduce (t dell'interfaccia; l'identità nei test).
 */
export function filterColors(material: string, cat: ColorCategory, query: string, tr: (s: string) => string = (s) => s): FilamentColor[] {
  const q = fold(query);
  const label = (id?: ColorCategory) => COLOR_CATEGORIES.find((k) => k.id === id)?.label ?? '';
  return colorsFor(material).filter((c) =>
    q
      ? [c.name, tr(c.name), tr(label(c.family)), c.finish ? tr(label(c.finish)) : ''].some((s) => fold(s).includes(q))
      : inCategory(c, cat),
  );
}
