# Architettura

App statica (nessun backend proprio): React + TypeScript + Vite, PWA con service worker,
geometria con [manifold-3d](https://github.com/elalish/manifold) (WebAssembly) in un Web Worker,
anteprima con three.js.

```
src/
├─ main.tsx, App.tsx          avvio, registrazione service worker, navigazione via hash (#/p/<id>)
├─ app/
│  ├─ store.ts                configurazione, impostazioni, chiave; progetti/mesh/cache in IndexedDB
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
│  └─ prompts/                prompt condiviso e specifica DSL inviata al modello
├─ core/                      logica pura, testata senza browser
│  ├─ types.ts                Design, Part, Joint, Question…
│  ├─ design/ops.ts           operazioni atomiche e validazione → docs/DESIGN-DSL.md
│  ├─ geometry/               valutazione CSG, cerniere, scatti, perni, import STL/3MF, worker
│  ├─ analysis/               stime e domande automatiche → docs/ANALISI.md
│  ├─ assembly/plan.ts        guida di montaggio
│  └─ export/                 3MF (Orca/Bambu e PrusaSlicer) e STL
├─ data/                      stampanti, materiali, modello d'esempio
└─ ui/                        componenti React (wizard, home, area di lavoro, pannelli, anteprima)
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
| localStorage | configurazione stampante/filamenti, impostazioni, spesa del mese, chiave API (se “ricorda”) |
| sessionStorage | chiave API se “ricorda” è disattivato |
| IndexedDB | progetti (design, cronologia per annulla, chat), mesh importate, cache delle ricerche (7 giorni) |

## PWA

`vite-plugin-pwa` genera manifest e service worker (precache di app e WASM). L’app funziona offline
per tutto ciò che non richiede l’AI: anteprima, analisi, montaggio, esportazione. Quando esce una
nuova versione compare una barra “Aggiorna”.
