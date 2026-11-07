/* Catalogo dei dettagli di progettazione: regole pratiche provate in stampa
   (PLA e PETG, ugello 0,4 mm, strato 0,2 mm). Testi destinati solo all'AI:
   restano in italiano. Le tolleranze effettive le applica l'app
   (core/calibration/tolerances.ts): qui ci sono forme, proporzioni e trucchi.
   Fonte: esperienza di stampa reale dell'autore; per aggiungere una voce
   basta una nuova riga in CATALOG (e una sezione in docs/CATALOGO.md). */

export type CatalogTopic =
  | 'giochi'
  | 'cerniere'
  | 'molle'
  | 'scatti'
  | 'perni'
  | 'fermi'
  | 'click'
  | 'guide'
  | 'pareti'
  | 'imbarcamento'
  | 'supporti'
  | 'parti-sottili'
  | 'orientamento'
  | 'multimateriale'
  | 'slicer'
  | 'diagnosi';

export interface CatalogEntry {
  topic: CatalogTopic;
  title: string;
  rules: string[];
}

export const CATALOG: CatalogEntry[] = [
  {
    topic: 'giochi',
    title: 'Giochi tra parti',
    rules: [
      'Parti che si accoppiano: circa 0,2 mm per lato; guide che scorrono: 0,15 mm; assi che ruotano: 0,1–0,15 mm di gioco radiale.',
      'PETG contro PETG: almeno 0,6 mm dove le parti sono stampate già montate, sotto si saldano.',
      'I fori verticali piccoli escono circa 0,4 mm più stretti del disegno: allargali o affidati alla calibrazione.',
      'Dove un gioco laterale dà fastidio, due spine di centraggio (Ø4 in fori Ø4,7) recuperano il gioco meglio che stringere tutto.',
    ],
  },
  {
    topic: 'cerniere',
    title: 'Cerniere e assi',
    rules: [
      'Asse parallelo al piatto per le cerniere stampate già montate.',
      'Sopra un asse orizzontale l’arco del foro cede di 0,2–0,4 mm: foro ovale, più gioco in alto (circa 0,45) che ai lati (0,15). L’app lo aggiunge da sola alle cerniere del DSL.',
      'Per una cerniera che resta in posizione: una lamella a molla che preme su scanalature (vedi fermi) invece di stringere l’asse.',
    ],
  },
  {
    topic: 'molle',
    title: 'Molle stampate',
    rules: [
      'Molle a S stampate sdraiate: la S sta nel piano del piatto, così i bracci si flettono dentro gli strati e non si delaminano.',
      'Spessore del nastro con altezza 2 mm: 0,7 mm morbida, 0,8 mm media, 0,95 mm dura.',
      'Montala con un precarico di circa 0,8 mm e falla scorrere in un canale del fondo, così non si torce.',
      'Le molle sottili (e i pettini di molle) vanno stampate su un foglio di 0,4 mm che si stacca a mano, con le orecchie fuori dall’ingombro: un brim riempirebbe le fessure.',
    ],
  },
  {
    topic: 'scatti',
    title: 'Ganci a scatto',
    rules: [
      'Gancio a sbalzo tipico: braccio 8 mm × 1,4 mm, dente 0,7 mm (1,0 è già troppo duro).',
      'Il bordo che trattiene il dente: almeno 1,1 mm; faccia di ritenuta inclinata di 25° (si serra da sola) e smusso sullo spigolo.',
      'Rampa d’ingresso lunga e precarico di 0,1 mm: entra dolce e non balla.',
      'Su incastri lunghi o larghi metti ganci intermedi, uno ogni 40 mm al massimo.',
      'Presa tipo connettore USB: dita a molla da 0,8 mm, fessura 0,6 mm, bozzetto da 0,3 mm.',
    ],
  },
  {
    topic: 'perni',
    title: 'Perni e fori',
    rules: [
      'Perni a pressione: nervature schiacciabili da 0,25 mm sul perno; con perno 2,4 mm in foro 2,9 mm la tenuta è buona.',
      'Perni lontani dai bordi: lascia almeno una parete piena attorno al foro.',
    ],
  },
  {
    topic: 'fermi',
    title: 'Fermi a scatto (detent)',
    rules: [
      'Lamella a molla fissata alle due estremità sopra una cavità, con una costola che entra in scanalature.',
      'Interferenza della costola 0,6 mm, raggio della scanalatura 1,5 mm (più largo della costola), precarico 0,1 mm.',
      'Più scanalature ad angoli diversi danno più posizioni stabili.',
    ],
  },
  {
    topic: 'click',
    title: 'Pulsanti con click',
    rules: [
      'Stelo con denti a 45° che passa tra due lamelle con 0,25 mm di interferenza: fa click alla pressione e al rilascio.',
      'Guida il pulsante con linguette sui 4 lati in canali con 0,15 mm di gioco; più è alta la zona guidata, meno si inclina.',
      'Le linguette fanno anche da fine corsa. Non vincolare due volte (spine e linguette insieme si bloccano).',
      'Per un pulsante morbido basta una molla a S sotto lo stelo, senza denti.',
    ],
  },
  {
    topic: 'guide',
    title: 'Guide e cursori',
    rules: [
      'Gioco 0,15 mm per lato nelle guide; guida lunga almeno quanto la larghezza del cursore, altrimenti si impunta.',
      'Un solo sistema di centraggio per direzione: troppi vincoli fanno bloccare il pezzo.',
    ],
  },
  {
    topic: 'pareti',
    title: 'Pareti, pelli e intarsi',
    rules: [
      'Sopra una cavità lascia una pelle di almeno 0,6 mm (3 strati).',
      'Intarsi di colore: 0,6 mm di profondità (3 strati) bastano.',
      'Niente lamelle sotto 1,7 mm stampate nel vuoto: si rompono o non si formano.',
      'Sbalzi: preferisci forme autoportanti a 45° invece dei supporti.',
    ],
  },
  {
    topic: 'imbarcamento',
    title: 'Pezzi che si sollevano dal piatto',
    rules: [
      'Pezzi grandi e piatti in PETG: piatto a 80 °C, ventola al 10–30% e spenta sui primi 5 strati, stampante coperta.',
      'Su PEI testurizzato il brim in PETG è difficile da togliere: meglio le orecchie anti-sollevamento (dischi di raggio 4–6 mm alti 0,4 mm, cioè 2 strati) agli angoli, con collo largo 4 mm e spesso 0,6 mm; con colli da 1,2 mm si strappano via la superficie.',
      'Angoli vivi grandi si sollevano: arrotonda gli spigoli in pianta.',
      'L’app imposta da sola brim o orecchie nel file per lo slicer: non disegnarli tu.',
    ],
  },
  {
    topic: 'supporti',
    title: 'Supporti',
    rules: [
      'Supporti ad albero nel file per lo slicer, impostati dall’app: non disegnarli nella geometria.',
      'Interfaccia nel materiale opposto: PETG sotto il PLA va bene; PLA sotto il PETG solo con più ugelli, perché con un ugello solo il PETG vicino diventa fragile e si spacca.',
      'Strati alternati PLA/PETG nello stesso supporto non funzionano.',
      'Un cuneo di supporto staccabile deve essere largo almeno 1,2 mm sul pezzo e 8 mm sul piatto: una striscia sottile viene buttata giù dall’ugello.',
    ],
  },
  {
    topic: 'parti-sottili',
    title: 'Parti piccole e sottili',
    rules: [
      'Parti piccole o alte e strette si staccano: brim o orecchie (l’app li imposta) oppure stampale coricate.',
      'Più pezzi sottili insieme: un foglio comune di 0,4 mm che si stacca a mano li tiene fermi.',
    ],
  },
  {
    topic: 'orientamento',
    title: 'Orientamento di stampa',
    rules: [
      'La faccia più visibile in basso sul piatto: esce liscia (per esempio i tasti con le lettere nei primi strati).',
      'Scritte sulla faccia appoggiata al piatto: disegnale specchiate.',
      'Le parti che si flettono vanno orientate in modo che la flessione stia dentro gli strati, non tra uno strato e l’altro.',
    ],
  },
  {
    topic: 'multimateriale',
    title: 'Colori e materiali diversi',
    rules: [
      'PLA e PETG non si incollano tra loro: non metterli a contatto nello stesso pezzo, ma ottimi come interfaccia dei supporti.',
      'PLA e PETG nello stesso piatto: temperature compatibili, circa 230 °C per il PETG e 225 °C per il PLA, anche nelle varianti del profilo per ugello indurito o ad alto flusso.',
      'Nei piatti multicolore la zona della torre di spurgo deve restare libera (l’app la tiene libera nella disposizione).',
    ],
  },
  {
    topic: 'slicer',
    title: 'File per lo slicer',
    rules: [
      'Un oggetto per piatto con una parte per materiale: oggetti separati a contatto fanno scattare “troppo vicino” e alcuni siti li rifiutano.',
      'Lo slicer appoggia ogni oggetto al piatto e lo centra sulla sua origine.',
      'Per rinforzare una zona debole: una parte modificatore con riempimento 100% e più pareti, invece di ingrossare il pezzo.',
      'Il file da caricare sui siti (per esempio Maker Online) va salvato dallo slicer.',
    ],
  },
  {
    topic: 'diagnosi',
    title: 'Diagnosi di una stampa venuta male',
    rules: [
      'Da foto o descrizione indica al massimo 3 cause probabili, dalla più probabile.',
      'Proponi prima il rimedio più economico (impostazione dello slicer) e solo dopo modifiche al modello.',
      'Suggerisci un test rapido: un provino della sola zona modificata prima di ristampare il pezzo grande.',
      'Ragiona con i numeri (giochi, spessori, temperature) e cambia una cosa alla volta.',
    ],
  },
];

export const CATALOG_TOPICS = CATALOG.map((e) => e.topic);

export function catalogEntry(topic: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.topic === topic);
}

/** Testo compatto delle voci richieste (tutte se nessuna). */
export function catalogText(topics?: string[]): string {
  const pick = topics?.length ? CATALOG.filter((e) => topics.includes(e.topic)) : CATALOG;
  if (!pick.length) return `Nessuna voce trovata. Argomenti: ${CATALOG_TOPICS.join(', ')}.`;
  return pick.map((e) => `### ${e.title} (${e.topic})\n${e.rules.map((r) => `- ${r}`).join('\n')}`).join('\n\n');
}

/** Riga per il prompt: dice all'AI che il catalogo esiste e come chiederlo. */
export const CATALOG_HINT = `Catalogo dei dettagli provati in stampa (consulta_catalogo): ${CATALOG_TOPICS.join(', ')}.`;

/** Pagina docs/CATALOGO.md (rigenerala con `npm run catalogo:doc`). */
export function catalogMarkdown(): string {
  const out = [
    '# Catalogo dei dettagli',
    '',
    'Regole pratiche provate in stampa (PLA e PETG, ugello 0,4 mm, strato 0,2 mm) che l’assistente consulta con lo strumento `consulta_catalogo` prima di disegnare un meccanismo o rispondere a un problema di stampa. Nella modalità copia e incolla e nel connettore il catalogo è incluso per intero nel testo.',
    '',
    'La fonte è `src/data/catalog.ts`: per aggiungere una voce modifica quel file e rigenera questa pagina con `npm run catalogo:doc`. Le tolleranze effettive restano in `core/calibration/tolerances.ts` e le linee guida dei materiali in `src/data/guidelines.ts`: il catalogo descrive forme, proporzioni e trucchi.',
    '',
  ];
  for (const e of CATALOG) out.push(`## ${e.title} (\`${e.topic}\`)`, '', ...e.rules.map((r) => `- ${r}`), '');
  return out.join('\n');
}
