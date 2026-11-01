# Design DSL

Il modello è un documento JSON (`Design` in `src/core/types.ts`). La specifica inviata all’AI è in
`src/agent/prompts/dsl.md`; qui il riferimento per chi sviluppa.

```jsonc
{
  "version": 1,
  "name": "Portatile giocattolo",
  "intendedUse": { "children": true },
  "source": { "kind": "remix", "title": "…", "url": "…", "author": "…", "license": "CC BY 4.0" },
  "parts": [
    { "id": "base", "name": "Base", "filamentId": "f1", "shape": { "op": "box", "size": [150, 100, 12], "radius": 2 } }
  ],
  "joints": [
    { "id": "cerniera", "type": "hinge", "partA": "base", "partB": "schermo", "axis": "x",
      "origin": [75, 96, 14], "length": 40, "radius": 4, "detent": { "enabled": true, "anglesDeg": [0, 100] } }
  ],
  "printPlan": { "strategy": "separate", "connection": "snap" }
}
```

## Convenzioni

- Millimetri, Z verso l’alto, piatto di stampa a z = 0.
- Ogni parte ha **un solo filamento**: più colori = più parti.
- Nodi: `box` (con `radius` per arrotondare), `cylinder`, `sphere`, `mesh` (import), `union`, `difference`, `intersection`, `hull`. Ogni nodo accetta `at` (traslazione) e `rot` (gradi, applicata prima di `at`).

## Operazioni (`src/core/design/ops.ts`)

`set_meta`, `add_part`, `update_part`, `move_part`, `remove_part`, `add_joint`, `update_joint`,
`remove_joint`, `set_plan`, `add_hardware`, `update_hardware`, `remove_hardware`. Sono **atomiche**: si applicano a una copia, poi si valida tutto
(id unici, filamenti esistenti, misure tra 0,2 e 1000 mm, max 40 parti e 600 nodi, profondità max 12).
Se qualcosa non va, il design resta invariato e l’AI riceve il messaggio d’errore.

## Elementi da comprare a parte (`hardware`)

```json
{ "id": "magneti", "name": "Magnete al neodimio", "qty": 4, "spec": "6×2 mm", "purpose": "chiusura del coperchio" }
```

L'AI dichiara così tutto ciò che non si stampa (viti, magneti, molle, cuscinetti, pile…). Il campo
`decision` lo imposta **solo l'utente** (l'app lo toglie dalle operazioni dell'AI):

- assente → l'app chiede, per ogni elemento, «Va bene, lo compro» o «Cerca un'alternativa stampata»;
- `buy` → resta nella lista «Da acquistare a parte» e nel file `DA-ACQUISTARE.txt` allegato all'esportazione;
- `printed` → l'assistente riceve la richiesta di sostituirlo con una soluzione stampata e poi lo rimuove.

Se l'AI cambia nome, quantità o misure di un elemento, la conferma viene richiesta di nuovo. Max 20 elementi, quantità 1-100.

## Geometria generata automaticamente (`src/core/geometry/evaluate.ts`)

| Elemento | Come |
|---|---|
| Cerniera (`hinge`) | tre nocche A-B-A con perno integrato in A, gioco 0,4 mm, stampabile già montata |
| Rotazione (`rotary`) | perno su A, foro con gioco su B |
| Scatto (`detent`) | sfere sporgenti su B e incavi su A agli angoli indicati (default 0° e 90°) |
| Perni tra parti separate | sulle facce di contatto (dai bounding box), diametro 3-8 mm; gioco 0,1 mm a incastro, 0,3 mm per colla; saltati se il foro non cadrebbe nel pieno |

Le tolleranze dipendono dal materiale di ogni parte (`src/data/guidelines.ts`) e dai valori calibrati con i campioni di prova (`src/core/calibration/`); vedi docs/ANALISI.md.
