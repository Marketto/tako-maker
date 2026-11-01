import { msg, t } from '../../i18n';
/* Frasi di incitamento di Takotta: tutte locali, zero token.
   Ogni evento ha più frasi; non si ripete la stessa due volte di fila. */

export type PhraseKind =
  | 'benvenuto'
  | 'nuovo'
  | 'pensa'
  | 'modifica'
  | 'domanda'
  | 'errore'
  | 'export'
  | 'montaggio'
  | 'coccola'
  | 'ozio';

export const PHRASES: Record<PhraseKind, string[]> = {
  benvenuto: [
    msg('Ciao! Sono Takotta, ti aiuto a stampare ♡'),
    msg('Bentornato! Ho lucidato tutti e otto i tentacoli ✦'),
    msg('Eccoti! Cosa costruiamo oggi?'),
  ],
  nuovo: [
    msg('Un foglio bianco! Raccontami la tua idea ♪'),
    msg('Nuovo progetto, nuova avventura!'),
    msg('Dimmi cosa vuoi stampare, io prendo appunti con tutti i tentacoli!'),
  ],
  pensa: [
    msg('Ci penso un attimo… blub blub'),
    msg('Strato dopo strato, ci arriviamo!'),
    msg('Sto mescolando idee e filamenti ✦'),
    msg('Un momento, sto contando le ventose…'),
  ],
  modifica: [
    msg('Che idea carina!'),
    msg('Fatto! Ti piace? ♡'),
    msg('Sta venendo benissimo!'),
    msg('Wow, sei proprio un maker!'),
    msg('Un passo alla volta, sei bravissimo ✦'),
  ],
  domanda: [
    msg('Ho una domandina per te ♪'),
    msg('Scegli tu, io mi fido!'),
    msg('Mi serve il tuo parere, capo!'),
  ],
  errore: [
    msg('Ops! Riproviamo insieme, non è niente.'),
    msg('Mi si è annodato un tentacolo… riprova tra un attimo!'),
    msg('Anche i polpi sbagliano! Ritentiamo?'),
  ],
  export: [
    msg('Pronto per lo slicer! Sei bravissimo ♡'),
    msg('Evviva! Ora tocca alla stampante ✦'),
    msg('File pronto! Non vedo l’ora di vederlo stampato!'),
  ],
  montaggio: [
    msg('Piano piano, un pezzo alla volta!'),
    msg('Clic! Che soddisfazione ♪'),
    msg('Ce la fai, ti guardo da qui ✦'),
  ],
  coccola: [
    msg('Ehi, mi fai il solletico! ♡'),
    msg('Blub! ✦'),
    msg('Ti voglio bene anch’io!'),
    msg('Ancora! Ancora!'),
    msg('Mi sono ricordata di bere acqua. E tu?'),
  ],
  ozio: [
    msg('Fai una pausa se ti serve, io ti aspetto ♪'),
    msg('Ricordati di sgranchirti un po’!'),
    msg('Tutto bene? Sono qui se ti serve.'),
  ],
};

const last = new Map<PhraseKind, string>();

export function pickPhrase(kind: PhraseKind, rnd: () => number = Math.random): string {
  const list = PHRASES[kind];
  const prev = last.get(kind);
  const pool = list.length > 1 ? list.filter((p) => p !== prev) : list;
  const choice = pool[Math.floor(rnd() * pool.length) % pool.length];
  last.set(kind, choice);
  return t(choice);
}
