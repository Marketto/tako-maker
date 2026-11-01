/** Proprietà indicative dei materiali più comuni (densità in g/cm³). */
import { msg } from '../i18n';

export interface MaterialInfo {
  id: string;
  label: string;
  /** Etichetta breve per i pulsanti. */
  short: string;
  density: number;
  /** Serve una camera chiusa per stampare in modo affidabile. */
  needsEnclosure: boolean;
  /** Funziona bene nei sistemi multicolore standard (AMS, MMU, CFS...). */
  multiFriendly: boolean;
  notes: string;
}

export const MATERIALS: MaterialInfo[] = [
  { id: 'PLA', label: 'PLA', short: 'PLA', density: 1.24, needsEnclosure: false, multiFriendly: true, notes: msg('Facile, rigido, ideale per giocattoli e oggetti decorativi.') },
  { id: 'PLA-Silk', label: 'PLA Silk', short: 'PLA Silk', density: 1.24, needsEnclosure: false, multiFriendly: true, notes: msg('Effetto lucido; leggermente meno resistente del PLA base.') },
  { id: 'PLA-Matte', label: 'PLA Matte', short: 'PLA Matte', density: 1.3, needsEnclosure: false, multiFriendly: true, notes: msg('Finitura opaca che nasconde le linee di strato.') },
  { id: 'PETG', label: 'PETG', short: 'PETG', density: 1.27, needsEnclosure: false, multiFriendly: true, notes: msg('Più tenace e resistente al calore del PLA; buono per parti a scatto.') },
  { id: 'ABS', label: 'ABS', short: 'ABS', density: 1.04, needsEnclosure: true, multiFriendly: true, notes: msg('Resistente al calore; richiede camera chiusa e ventilazione.') },
  { id: 'ASA', label: 'ASA', short: 'ASA', density: 1.07, needsEnclosure: true, multiFriendly: true, notes: msg('Come ABS ma resistente ai raggi UV, adatto all’esterno.') },
  { id: 'TPU', label: msg('TPU (flessibile)'), short: 'TPU', density: 1.21, needsEnclosure: false, multiFriendly: false, notes: msg('Gommoso: ottimo per paracolpi e parti morbide. Spesso non adatto ai sistemi multicolore.') },
  { id: 'PA', label: msg('Nylon (PA)'), short: 'PA', density: 1.14, needsEnclosure: true, multiFriendly: false, notes: msg('Molto resistente; assorbe umidità, va essiccato.') },
  { id: 'PC', label: msg('Policarbonato (PC)'), short: 'PC', density: 1.2, needsEnclosure: true, multiFriendly: false, notes: msg('Molto resistente e termoresistente; difficile da stampare.') },
];

export function material(id: string): MaterialInfo {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}

/** Colori proposti nel wizard (nome italiano → esadecimale). */
export const COMMON_COLORS: { name: string; hex: string }[] = [
  { name: msg('Bianco'), hex: '#f4f4f0' },
  { name: msg('Nero'), hex: '#222222' },
  { name: msg('Grigio'), hex: '#8a8d91' },
  { name: msg('Rosso'), hex: '#d63a32' },
  { name: msg('Arancione'), hex: '#f08a24' },
  { name: msg('Giallo'), hex: '#f5cf2d' },
  { name: msg('Verde'), hex: '#3aa655' },
  { name: msg('Azzurro'), hex: '#4fb3e8' },
  { name: msg('Blu'), hex: '#2a55c9' },
  { name: msg('Viola'), hex: '#8b52c7' },
  { name: msg('Rosa'), hex: '#f39ac0' },
  { name: msg('Marrone'), hex: '#8a5a3b' },
  { name: msg('Trasparente'), hex: '#d9eef2' },
];
