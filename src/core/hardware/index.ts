import type { Design, Hardware } from '../types';
import { t } from '../../i18n';

/* Elementi da comprare a parte (viti, magneti, molle, cuscinetti…).
   L'AI li dichiara con add_hardware; l'app chiede all'utente, per ognuno,
   se comprarlo o cercare un'alternativa stampata (vedi core/analysis). */

export const hardwareOf = (d: Design): Hardware[] => d.hardware ?? [];

/** "4 × Magnete al neodimio (6×2 mm)" */
export function hardwareLabel(h: Hardware): string {
  return `${h.qty} × ${h.name}${h.spec ? ` (${h.spec})` : ''}`;
}

/** Elementi che l'utente dovrà procurarsi (confermati o non ancora decisi). */
export function toBuy(d: Design): Hardware[] {
  return hardwareOf(d).filter((h) => h.decision !== 'printed');
}

/** Lista della spesa da allegare ai file esportati. */
export function shoppingListText(d: Design): string | undefined {
  const items = toBuy(d);
  if (!items.length) return undefined;
  return [
    t('DA ACQUISTARE A PARTE – {name}', { name: d.name }),
    '',
    ...items.map((h) => `- ${hardwareLabel(h)}${h.purpose ? ` — ${h.purpose}` : ''}`),
    '',
  ].join('\n');
}
