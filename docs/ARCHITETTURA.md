# Architettura

App statica (nessun backend proprio): React + TypeScript + Vite, PWA con service worker,
geometria con [manifold-3d](https://github.com/elalish/manifold) (WebAssembly) in un Web Worker,
anteprima con three.js.

```
src/
├─ main.tsx, App.tsx          avvio, registrazione service worker, navigazione via hash (#/p/<id>)
├─ app/
│  ├─ store.ts                configurazione, impostazioni, chiave; progetti/mesh/cache in IndexedDB
│  ├─ cloud/                  backup facoltativo su Dropbox o Google Drive e su file → docs/BACKUP.md
│  └─ session.ts              orchestratore di un progetto aperto (UI ⇄ agente ⇄ geometria ⇄ analisi)
├─ agent/                     tutto ciò che parla con Claude → docs/AGENTI.md
│  ├─ config.ts               modelli, prezzi, limiti
│  ├─ client.ts               Messages API via fetch (chiave personale o proxy)
│  ├─ budget.ts               costo per chiamata e tetto mensile
│  ├─ router.ts               regole locali + fallback Haiku
│  ├─ skills/<nome>/SKILL.md  istruzioni, modello e strumenti di ogni skill
│  ├─ tools.ts                definizioni ed esecuzione degli strumenti
│  ├─ context.ts              prompt di sistema a blocchi (cache) + contesto variabile
│  ├─ runner.ts               ciclo agente con pausa/ripresa
│  ├─ manual.ts               modalità copia e incolla (richiesta e lettura della risposta)
│  └─ prompts/                prompt condiviso e specifica DSL inviata al modello
├─ core/                      logica pura, testata senza browser
│  ├─ types.ts                Design, Part, Joint, Question…
│  ├─ design/ops.ts           operazioni atomiche e validazione → docs/DESIGN-DSL.md
│  ├─ geometry/               valutazione CSG, cerniere, scatti, perni, import STL/3MF, worker
│  ├─ analysis/               stime e domande automatiche → docs/ANALISI.md
│  ├─ assembly/plan.ts        guida di montaggio
│  ├─ hardware/               elementi da comprare a parte: etichette e lista della spesa
│  └─ export/                 3MF (Orca/Bambu e PrusaSlicer) e STL
├─ data/                      stampanti, materiali, colori dei filamenti (colors.ts), linee guida, catalogo dei dettagli (→ docs/CATALOGO.md), modello d'esempio
├─ i18n/                      t(), msg(), fmtNum(), elenco lingue → docs/TRADUZIONI.md
│  ├─ source.json             tutte le frasi italiane (generato da npm run i18n:extract)
│  └─ locales/<codice>.json   una traduzione per lingua, caricata solo se scelta
├─ connector/                 server MCP e stato condiviso con la chat → docs/CONNETTORE.md
├─ ui/                        componenti React (wizard, home, area di lavoro, pannelli, anteprima)
│  └─ mascot/                 Takotta: sprite generati, umori, fumetto, frasi, bus di eventi
└─ app/music.ts               musica di sottofondo generata con Web Audio
tools/mascot/takotta.py      generatore di Takotta (sprite SVG + icone PWA)
connector/                   configurazione e build del Worker del connettore (wrangler)
tools/i18n/                  estrazione delle frasi e controllo delle traduzioni
```

## Flusso di un messaggio

```
Utente scrive ──► router (regole) ──► [se incerto: Haiku, ~10 token]
                       │
                       ▼
                 skill scelta ──► runner ──► Messages API
                                     ▲            │ tool_use
                                     │            ▼
                                     └── strumenti locali (edit_design, print_report…)
                                                  │
                                                  ▼
                               Design aggiornato ──► Worker manifold ──► mesh
                                                  │
                                                  ▼
                       analisi locali (strategia, incastri, scatti, bambini, piatto)
                                                  │
                                                  ▼
                          domande in chat (risposta = modifiche locali, zero token)
```

Principio guida: **l’AI decide cosa costruire, il codice fa i conti**. L’AI non genera mesh
e non calcola tempi o costi: modifica un documento JSON piccolo e valida, il resto è deterministico.

## Persistenza

| Dove | Cosa |
|---|---|
| localStorage | configurazione stampante/filamenti, impostazioni (lingua inclusa), spesa del mese, chiavi API (se “ricorda”) |
| sessionStorage | chiave API se “ricorda” è disattivato |
| IndexedDB | progetti (design, cronologia per annulla, chat), mesh importate, cache delle ricerche (7 giorni) |

## PWA

`vite-plugin-pwa` genera manifest e service worker (precache di app e WASM). L’app funziona offline
per tutto ciò che non richiede l’AI: anteprima, analisi, montaggio, esportazione. Quando esce una
nuova versione compare una barra “Aggiorna”.

## Takotta e atmosfera

- **Sprite**: `tools/mascot/takotta.py` genera `src/ui/mascot/sprites.ts` (un corpo comune + un viso per umore, ~7 KB compressi) e le icone in `public/icons/`. Le punte dei tentacoli usano le variabili CSS `--tip0…--tip6`, impostate con i colori dei filamenti dell'utente.
- **Umori**: `MascotDock` deriva l'espressione dallo stato del progetto (in attesa dell'AI → pensierosa, calcolo → concentrata, errore → confusa, modifica riuscita/esportazione → felice).
- **Frasi**: `ui/mascot/phrases.ts`, scelte localmente senza ripetizioni consecutive.

## Transizioni tra le schermate

`ui/sea/transition.ts` espone `seaGo(cambio)`: copre lo schermo con una transizione scelta a caso (inchiostro dal punto
toccato, onda, bolle; mai la stessa due volte di fila), esegue il cambio quando è coperto e poi scopre. Il disegno è in
`ui/sea/SeaTransitionLayer.tsx`, gli stili `.sea-*` in `styles.css` (durate allineate a `COVER_MS` e `REVEAL_MS`).
La usano i passi del wizard e la navigazione di `App.tsx`; i cambi automatici e il tasto Indietro del browser restano
immediati. Con «riduci movimento» il cambio è immediato.
- **Backup**: `app/cloud/` carica ogni progetto salvato nel cloud dell'utente (Dropbox o Google Drive, dal browser con OAuth) e all'avvio scarica quelli mancanti o più recenti; senza cloud si scarica e ripristina un file `.zip`. Dettagli in [BACKUP.md](BACKUP.md).
- **Musica**: `app/music.ts` sintetizza in tempo reale accordi e carillon pentatonico; parte solo dopo un gesto dell'utente e si sospende quando la scheda è nascosta.
- **Riduci movimento**: animazioni della mascotte, coriandoli e rimbalzi si disattivano se il sistema lo richiede.
- **Font**: M PLUS Rounded 1c (licenza OFL) incluso nel bundle con i sottoinsiemi latino, latino esteso, cirillico e greco; per arabo, cinese, giapponese e coreano si usano i font di sistema. Il tema marino (`.sea`) usa Fredoka variabile (OFL, latino e latino esteso) con `font-size-adjust` per non rimpicciolire i testi; per gli altri alfabeti ricade su M PLUS.
