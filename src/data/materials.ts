/** Proprietà indicative dei materiali più comuni (densità in g/cm³). */
export interface MaterialInfo {
  id: string;
  label: string;
  density: number;
  /** Serve una camera chiusa per stampare in modo affidabile. */
  needsEnclosure: boolean;
  /** Funziona bene nei sistemi multicolore standard (AMS, MMU, CFS...). */
  multiFriendly: boolean;
  notes: string;
}

export const MATERIALS: MaterialInfo[] = [
  { id: 'PLA', label: 'PLA', density: 1.24, needsEnclosure: false, multiFriendly: true, notes: 'Facile, rigido, ideale per giocattoli e oggetti decorativi.' },
  { id: 'PLA-Silk', label: 'PLA Silk', density: 1.24, needsEnclosure: false, multiFriendly: true, notes: 'Effetto lucido; leggermente meno resistente del PLA base.' },
  { id: 'PLA-Matte', label: 'PLA Matte', density: 1.3, needsEnclosure: false, multiFriendly: true, notes: 'Finitura opaca che nasconde le linee di strato.' },
  { id: 'PETG', label: 'PETG', density: 1.27, needsEnclosure: false, multiFriendly: true, notes: 'Più tenace e resistente al calore del PLA; buono per parti a scatto.' },
  { id: 'ABS', label: 'ABS', density: 1.04, needsEnclosure: true, multiFriendly: true, notes: 'Resistente al calore; richiede camera chiusa e ventilazione.' },
  { id: 'ASA', label: 'ASA', density: 1.07, needsEnclosure: true, multiFriendly: true, notes: 'Come ABS ma resistente ai raggi UV, adatto all’esterno.' },
  { id: 'TPU', label: 'TPU (flessibile)', density: 1.21, needsEnclosure: false, multiFriendly: false, notes: 'Gommoso: ottimo per paracolpi e parti morbide. Spesso non adatto ai sistemi multicolore.' },
  { id: 'PA', label: 'Nylon (PA)', density: 1.14, needsEnclosure: true, multiFriendly: false, notes: 'Molto resistente; assorbe umidità, va essiccato.' },
  { id: 'PC', label: 'Policarbonato (PC)', density: 1.2, needsEnclosure: true, multiFriendly: false, notes: 'Molto resistente e termoresistente; difficile da stampare.' },
];

export function material(id: string): MaterialInfo {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}

/** Colori proposti nel wizard (nome italiano → esadecimale). */
export const COMMON_COLORS: { name: string; hex: string }[] = [
  { name: 'Bianco', hex: '#f4f4f0' },
  { name: 'Nero', hex: '#222222' },
  { name: 'Grigio', hex: '#8a8d91' },
  { name: 'Rosso', hex: '#d63a32' },
  { name: 'Arancione', hex: '#f08a24' },
  { name: 'Giallo', hex: '#f5cf2d' },
  { name: 'Verde', hex: '#3aa655' },
  { name: 'Azzurro', hex: '#4fb3e8' },
  { name: 'Blu', hex: '#2a55c9' },
  { name: 'Viola', hex: '#8b52c7' },
  { name: 'Rosa', hex: '#f39ac0' },
  { name: 'Marrone', hex: '#8a5a3b' },
  { name: 'Trasparente', hex: '#d9eef2' },
];
