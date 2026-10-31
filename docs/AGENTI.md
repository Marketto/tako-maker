# Soluzione agentica: router, skill, strumenti

## Router (`src/agent/router.ts`)

Due livelli, per non spendere token solo per capire cosa vuole l’utente:

1. **Regole locali** (espressioni regolari in italiano, gestiscono le lettere accentate):
   - parole come “cerca”, “trova”, “alternative” → `cerca-modelli`;
   - nessun modello aperto → `cerca-modelli` (o `crea-modello` se nelle impostazioni la ricerca iniziale è disattivata);
   - domande su colori, materiali, tempi, strategia → `consiglia-stampa`;
   - verbi di modifica (“rendi”, “aggiungi”, “sposta”, “più”, “meno”…) → `modifica-modello`;
   - altre domande → `spiega`.
   Le regole rilevano anche indizi come “bambina”, “figlio”, “nipote”: l’app imposta subito `children: true` nel design, senza AI.
2. **Fallback con Haiku** solo se le regole hanno confidenza bassa e l’opzione è attiva: prompt di poche righe con le descrizioni delle skill, `max_tokens: 10`, risposta = nome della skill.

L’utente può forzare una skill (es. “Salta la ricerca e crealo da zero”, “Crealo ispirandoti a questo”).

## Skill (`src/agent/skills/<nome>/SKILL.md`)

Ogni skill è un file Markdown con frontmatter, nello stile delle Agent Skills di Claude:

```markdown
---
name: modifica-modello
description: …              # usata dal router AI
tier: smart                 # fast = Haiku 5.5, smart = Sonnet 5.5
tools: edit_design, ask_user
max_tokens: 4000
---
Istruzioni…
```

| Skill | Modello | Strumenti | Scopo |
|---|---|---|---|
| `cerca-modelli` | Haiku | `web_search`, `show_results` | trovare 3-6 modelli gratuiti con licenza che permette modifiche |
| `crea-modello` | Sonnet | `edit_design`, `ask_user` | costruire un modello parametrico nuovo |
| `modifica-modello` | Sonnet | `edit_design`, `ask_user` | migliorie mirate al modello corrente |
| `consiglia-stampa` | Haiku | `print_report`, `edit_design` | colori, materiali, strategia, tempi |
| `spiega` | Haiku | — | domande generali |

In **modalità risparmio** tutte le skill usano Haiku.

Per aggiungere una skill: crea la cartella con `SKILL.md`, aggiungi il nome al tipo `SkillName`
in `skills/index.ts`, eventualmente una regola nel router e gli strumenti in `tools.ts`.

## Strumenti (`src/agent/tools.ts`)

| Strumento | Dove gira | Cosa fa |
|---|---|---|
| `web_search` | server Anthropic | ricerca limitata ai domini dei repository di modelli, max 3 usi per richiesta |
| `show_results` | browser | mostra le schede risultato; **termina il ciclo** senza un’altra chiamata |
| `edit_design` | browser | applica operazioni DSL in modo atomico, calcola la geometria nel worker, risponde con ingombri e analisi compatta, oppure con un errore da correggere |
| `ask_user` | browser | mette in pausa il ciclo e mostra una domanda con opzioni |
| `print_report` | browser | stime per strategia + avvisi |

## Ciclo agente (`src/agent/runner.ts`)

1. Prompt di sistema a blocchi: regole generali + specifica DSL (solo se la skill modifica) + istruzioni della skill + stampante e filamenti. **L’ultimo blocco e l’ultimo strumento sono marcati per il prompt caching.**
2. Messaggio utente = `<contesto>` (design attuale compatto, analisi, mesh importate, riferimento scelto) + richiesta. Della chat precedente vengono inviati solo gli ultimi 6 messaggi di testo.
3. Ciclo fino a 6 iterazioni: risposta → esecuzione strumenti → `tool_result` → nuova chiamata.
4. `ask_user` salva lo stato (messaggi + id della chiamata) e la UI riprende con `resumeAgent` quando l’utente risponde.
5. `pause_turn` (ricerca web lunga) viene gestito proseguendo il ciclo.

## Domande che NON passano dall’AI

Le domande delle user story (strategia multicolore/separata, incastro/colla, scatti, spigoli per bambini)
sono generate da `core/analysis` dopo ogni modifica. Ogni opzione porta con sé le operazioni DSL da
applicare: rispondere costa zero token. Ogni domanda ha una chiave stabile e non viene riproposta
finché il modello non cambia in modo rilevante.
