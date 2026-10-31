import type { Design } from '../core/types';
import type { ClaudeClient } from './client';
import { SKILLS, type SkillName } from './skills';

/* Router a due livelli:
   1. regole locali (gratis, istantanee) che coprono la maggior parte dei casi;
   2. solo se le regole non sono sicure, una chiamata minuscola a Haiku
      (~300 token in ingresso, 10 in uscita) che sceglie la skill. */

export interface RouteDecision {
  skill: SkillName;
  confidence: 'high' | 'low';
  /** Indizi rilevati localmente, applicati senza chiedere all'AI. */
  hints: { children?: boolean };
  via: 'rules' | 'ai';
}

/** Parole intere anche con lettere accentate (\b in JS considera solo ASCII). */
const words = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'iu');

const RX = {
  search: words('cerca|trova|cercami|trovami|altri modelli|alternativ\\p{L}*|qualcosa di gi[aà] fatto|online'),
  create: words('crea|creami|fai|fammi|disegna|progetta|nuovo modello|da zero'),
  advice: words('colori?|filament[oi]|material[ei]|pla|petg|tpu|abs|multicolor[ei]?|ams|mmu|quanto tempo|quanti grammi|consum[oi]|stampar(?:e|lo|la) (?:separat\\p{L}*|insieme)|strategia|slicer'),
  question: /^(come|perch[eé]|cosa|che cos\p{L}*|quale|quali|quando|dove|posso|si pu[oò]|è possibile)(?!\p{L}).*\?\s*$/iu,
  edit: words('rendi|rendil[oa]|aumenta|diminuisci|allarga|stringi|allunga|accorcia|sposta|aggiungi|togli|rimuovi|cambia|metti|sostituisci|arrotonda|ingrandisci|rimpicciolisci|ruota|più|meno'),
  children: words('bambin[aoie]|bimb[aoie]|figli[aoe]?|nipot[ei]|neonat\\p{L}*|asilo|kids?|toddler'),
};

export function routeByRules(text: string, design: Design | null, opts: { searchFirst: boolean }): RouteDecision {
  const hints = RX.children.test(text) ? { children: true } : {};
  const hasModel = !!design && design.parts.length > 0;
  const pick = (skill: SkillName, confidence: 'high' | 'low' = 'high'): RouteDecision => ({ skill, confidence, hints, via: 'rules' });

  if (RX.search.test(text)) return pick('cerca-modelli');
  if (!hasModel) {
    if (RX.question.test(text) && !RX.create.test(text)) return pick('spiega', 'low');
    return pick(opts.searchFirst ? 'cerca-modelli' : 'crea-modello');
  }
  if (RX.question.test(text) && !RX.edit.test(text)) return pick(RX.advice.test(text) ? 'consiglia-stampa' : 'spiega');
  if (RX.advice.test(text) && !RX.edit.test(text)) return pick('consiglia-stampa', 'low');
  if (RX.edit.test(text)) return pick('modifica-modello');
  return pick('modifica-modello', 'low');
}

export async function route(
  text: string,
  design: Design | null,
  opts: { searchFirst: boolean; smartRouting: boolean; client: ClaudeClient | null },
): Promise<RouteDecision> {
  const byRules = routeByRules(text, design, opts);
  if (byRules.confidence === 'high' || !opts.smartRouting || !opts.client?.isConfigured()) return byRules;

  const candidates = (Object.keys(SKILLS) as SkillName[]).filter((s) => (design?.parts.length ? true : s !== 'modifica-modello'));
  try {
    const res = await opts.client.send({
      tier: 'fast',
      max_tokens: 10,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: `Scegli la skill giusta per il messaggio dell'utente. Rispondi solo con il nome.\n${candidates.map((s) => `- ${s}: ${SKILLS[s].description}`).join('\n')}`,
        },
      ],
      messages: [{ role: 'user', content: `${design?.parts.length ? '[c’è già un modello aperto]\n' : ''}${text.slice(0, 500)}` }],
    });
    const out = res.content.find((b) => b.type === 'text');
    const name = out && 'text' in out ? out.text.trim().toLowerCase() : '';
    const skill = candidates.find((c) => name.includes(c));
    if (skill) return { skill, confidence: 'high', hints: byRules.hints, via: 'ai' };
  } catch {
    /* in caso di errore restano le regole */
  }
  return byRules;
}
