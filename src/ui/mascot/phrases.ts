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
    'Ciao! Sono Takotta, ti aiuto a stampare ♡',
    'Bentornato! Ho lucidato tutti e otto i tentacoli ✦',
    'Eccoti! Cosa costruiamo oggi?',
  ],
  nuovo: [
    'Un foglio bianco! Raccontami la tua idea ♪',
    'Nuovo progetto, nuova avventura!',
    'Dimmi cosa vuoi stampare, io prendo appunti con tutti i tentacoli!',
  ],
  pensa: [
    'Ci penso un attimo… blub blub',
    'Strato dopo strato, ci arriviamo!',
    'Sto mescolando idee e filamenti ✦',
    'Un momento, sto contando le ventose…',
  ],
  modifica: [
    'Che idea carina!',
    'Fatto! Ti piace? ♡',
    'Sta venendo benissimo!',
    'Wow, sei proprio un maker!',
    'Un passo alla volta, sei bravissimo ✦',
  ],
  domanda: [
    'Ho una domandina per te ♪',
    'Scegli tu, io mi fido!',
    'Mi serve il tuo parere, capo!',
  ],
  errore: [
    'Ops! Riproviamo insieme, non è niente.',
    'Mi si è annodato un tentacolo… riprova tra un attimo!',
    'Anche i polpi sbagliano! Ritentiamo?',
  ],
  export: [
    'Pronto per lo slicer! Sei bravissimo ♡',
    'Evviva! Ora tocca alla stampante ✦',
    'File pronto! Non vedo l’ora di vederlo stampato!',
  ],
  montaggio: [
    'Piano piano, un pezzo alla volta!',
    'Clic! Che soddisfazione ♪',
    'Ce la fai, ti guardo da qui ✦',
  ],
  coccola: [
    'Ehi, mi fai il solletico! ♡',
    'Blub! ✦',
    'Ti voglio bene anch’io!',
    'Ancora! Ancora!',
    'Mi sono ricordata di bere acqua. E tu?',
  ],
  ozio: [
    'Fai una pausa se ti serve, io ti aspetto ♪',
    'Ricordati di sgranchirti un po’!',
    'Tutto bene? Sono qui se ti serve.',
  ],
};

const last = new Map<PhraseKind, string>();

export function pickPhrase(kind: PhraseKind, rnd: () => number = Math.random): string {
  const list = PHRASES[kind];
  const prev = last.get(kind);
  const pool = list.length > 1 ? list.filter((p) => p !== prev) : list;
  const choice = pool[Math.floor(rnd() * pool.length) % pool.length];
  last.set(kind, choice);
  return choice;
}
