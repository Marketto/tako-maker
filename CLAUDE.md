# CLAUDE.md

Istruzioni per sviluppare questo progetto con Claude Code.

## Comandi

- `npm run dev`: server di sviluppo
- `npm test`: Vitest (core e agente con API simulata, nessuna chiamata reale)
- `npm run typecheck`, `npm run build`

Esegui sempre `npm test && npm run build` prima di proporre un commit.

## Regole del progetto

- **Lingua**: UI, prompt, documentazione e messaggi in italiano semplice; identificatori del codice in inglese.
- **L’AI modifica, il codice calcola**: nuove funzioni geometriche o di analisi vanno in `src/core` (puro, testabile in Node), non nei prompt.
- **Zero token quando possibile**: se una decisione si può prendere con una regola o una domanda con opzioni, falla in `core/analysis` con le `ops` sulla `QuestionOption`.
- **Skill**: una cartella in `src/agent/skills/` con `SKILL.md`. Tieni le istruzioni brevi: finiscono nel prompt (in cache, ma pur sempre token).
- **DSL**: se aggiungi un nodo o un’operazione, aggiorna insieme `core/types.ts`, `core/design/ops.ts` (validazione), `core/geometry/evaluate.ts`, `agent/prompts/dsl.md`, `docs/DESIGN-DSL.md` e i test.
- **Prezzi e modelli** di tutti i provider solo in `src/agent/config.ts` (`PROVIDERS`).
- **Provider AI**: il formato interno resta quello della Messages API di Claude; per un nuovo provider scrivi un adattatore in `src/agent/providers/` (build/parse/classify) con i suoi test, senza toccare runner e skill.
- **Linee guida di stampa** (materiali, tolleranze, temperature) solo in `src/data/guidelines.ts`; le tolleranze effettive passano sempre da `core/calibration/tolerances.ts`, mai valori fissi nella geometria.
- **Mai** chiavi, token o dati personali nel codice, nei test o nei fixture. Il sito è pubblico.
- **Licenze**: non aggiungere al repository modelli 3D di terzi. Il modello d’esempio è originale.
- **Takotta**: non modificare a mano `src/ui/mascot/sprites.ts` né le icone; cambia `tools/mascot/takotta.py` e rigenera con `python3 tools/mascot/takotta.py` (poi riconverti le PNG delle icone). Frasi nuove in `ui/mascot/phrases.ts`, brevi e gentili.
- **Accessibilità e mobile**: bersagli tattili ≥ 40 px, etichette `aria-label` sui pulsanti a icona, layout verificato a 390 px di larghezza.

## Struttura

Vedi `docs/ARCHITETTURA.md`. File chiave: `app/session.ts` (orchestrazione), `agent/runner.ts`
(ciclo agente), `core/analysis/index.ts` (domande automatiche), `core/geometry/evaluate.ts` (CSG).
