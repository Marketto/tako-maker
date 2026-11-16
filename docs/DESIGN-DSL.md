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
- Nodi: `box` (con `radius` per arrotondare), `cylinder` (con `radius` per arrotondare i bordi in alto e in basso), `sphere`, `mesh` (import), `union`, `difference`, `intersection`, `hull`. Ogni nodo accetta `at` (traslazione) e `rot` (gradi, applicata prima di `at`).

## Operazioni (`src/core/design/ops.ts`)

`set_meta`, `add_part`, `update_part`, `move_part`, `remove_part`, `add_joint`, `update_joint`,
`remove_joint`, `set_plan`, `add_hardware`, `update_hardware`, `remove_hardware`, `add_sample`, `remove_sample`. Sono **atomiche**: si applicano a una copia, poi si valida tutto
(id unici, filamenti esistenti, misure tra 0,2 e 1000 mm, max 40 parti e 600 nodi, profondità max 12).
Se qualcosa non va, il design resta invariato e l’AI riceve il messaggio d’errore.

`style` (rifinitura delle forme): `round` arrotonda angoli e spigoli vivi di box e cilindri non sottratti (raggio 2 mm), `smooth`
armonizza le forme (raggio fino a 5 mm, sempre limitato dallo spessore) e chiede all'AI forme morbide e raccordate. L'utente sceglie
una volta sola e la scelta vale per tutti i progetti (`UserSetup.style`); `design.style` la cambia per un solo progetto e si imposta
con `set_meta` e `"round"`/`"smooth"` (`null` torna alla preferenza generale). L'arrotondamento si applica nel calcolo della geometria
(`core/design/style.ts`): il disegno salvato non cambia. Con l'arrotondamento attivo l'app aggiunge anche i **raccordi** dove due
forme della stessa parte si toccano (`core/geometry/fillets.ts`): ogni box, cilindro, sfera o `hull` è convesso, quindi il raccordo è
l'inviluppo delle due fasce vicine al contatto, calcolato sulle forme disegnate (riempie anche il solco che lascerebbero gli spigoli
arrotondati). Due smussi con lati r e 0,41·r approssimano il quarto di cerchio. Raggio al massimo quello della preferenza e 0,35 volte lo
spessore della forma più sottile (`FILLET`): anche i pezzi piccoli hanno raccordi piccoli. Il raccordo non riempie mai i fori e le tasche
disegnati né lo spazio delle altre parti allargato del gioco delle cerniere; giunti, perni, pulsanti e agganci si generano dopo, esatti.
`intersection` e `mesh` non hanno raccordi.

`intendedUse.rests` (si usa appoggiato su un piano: `true`; in mano o appeso: `false`) e `intendedUse.hand` (`man`, `woman`, `teen`,
`child`, `toddler`: per chi è l'impugnatura) si impostano con `set_meta`. Una parte che si impugna ha `"grip": {}`; `grip.ergonomic`
lo sceglie l'utente rispondendo alla domanda dell'app (`update_part` con `grip`, `null` lo toglie). Misure della mano in `HAND_GRIP`.

`printPlan.connection` (unione delle parti stampate separate): `snap` (perni a incastro), `glue` (perni di centraggio per la colla),
`none` (non ancora deciso: l'app chiede all'utente), `designed` (aggancio disegnato dall'AI nel modello, es. coda di rondine o binario
con scatto: l'app non aggiunge perni e non chiede). La regola per l'AI è nella sezione «Unione di parti stampate separatamente» di
`src/agent/prompts/dsl.md`.

`printPlan.orient` (posizione sul piatto): per `*` (modello montato) o per l'id di una parte separata, la direzione del disegno che
va verso il piatto, es. `[0, 0, 1]` per capovolgerlo. Si imposta con `set_plan` e `"orient": { "key": "*", "down": [0, 0, 1] }`
(`down: null` la toglie). Se manca, la sceglie l'app (`core/geometry/orient.ts`): prova le sei facce e le facce piatte grandi,
stima i grammi di supporto e scarta le posizioni con supporti alti sotto zone strette. Con cerniere o pulsanti stampati montati
resta la posizione del disegno. Il file per lo slicer esce già girato.

## Pulsanti (`button`)

```json
{ "id": "tasto1", "name": "Tasto rosso", "filamentId": "f2", "shape": { "op": "cylinder", "h": 3, "r": 6, "at": [40, 30, 20] }, "button": { "housing": "base" } }
```

`protrusionMm` (0,5-6 mm) e `feel` (`click` | `soft`) li sceglie **solo l'utente** rispondendo alle domande dell'app; l'app li toglie dalle operazioni dell'AI.

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

## Prove di misura (`samples`)

```json
{ "id": "sella", "name": "Fetta della sella", "check": "Calzala sul bracciolo: deve stringere senza forzare",
  "regions": [{ "part": "sella", "min": [-60, 20, -1], "max": [100, 35, 90] }] }
```

Ogni zona ritaglia la parte indicata (coordinate del modello, lati da 1 a 200 mm) e diventa un pezzo del
campione, stampato nel verso con meno sporgenze. Servono per ciò che l'app non trova da sola: un pezzo da
calzare su un oggetto esterno, due copie dello stesso pezzo da agganciare. Giunti e agganci tra parti diverse
li ritaglia già l'app (vedi `docs/ANALISI.md`). Max 6 prove, da 1 a 4 zone ciascuna; rimuovendo una parte
spariscono le prove che la usano.

## Geometria generata automaticamente (`src/core/geometry/evaluate.ts`)

| Elemento | Come |
|---|---|
| Cerniera (`hinge`) | tre nocche A-B-A con perno integrato in A, gioco 0,4 mm, stampabile già montata |
| Rotazione (`rotary`) | perno su A che attraversa il mozzo di B (la parte di B lungo l'asse, trovata dall'app); ad A si toglie B allargato del gioco delle cerniere, così le facce non si saldano. `print: "in-place"`: stampato già montato, testa conica nella svasatura del mozzo che impedisce di sfilarlo. `print: "snap"`: due pezzi separati, perno spaccato in due lamelle con dentino (raggio almeno 3 mm) che scatta oltre la faccia lontana del mozzo, foro con invito. Senza `print` sceglie l'app: scatto se già montato servirebbe almeno 1 g di supporti in più che con i due pezzi stampati ognuno nella posizione migliore. Lo scatto vale solo con le parti separate: con la stampa unica l'analisi propone di passare alle parti separate |
| Scatto (`detent`) | sul perno: una fessura lo divide in due lamelle a sbalzo che fanno da molla, con una costola ciascuna che sporge oltre il foro (`PIN_DETENT.reachMm` − `detentClearance`, ridotta se le lamelle sono corte per non spezzarle) ed entra nelle scanalature del foro di B. `anglesDeg`: posizioni di B in gradi dalla posizione disegnata, positivi in senso antiorario guardando dalla punta dell'asse; lo 0 scatta sempre (default 0° e 90° per le cerniere, ogni 90° per i perni rotanti). Nella cerniera il perno è diviso a metà della nocca B, ogni metà è una coppia di lamelle. Un perno rotante con scatto e parti separate si stampa sempre in due pezzi a scatto: già montato le lamelle arrivano alla testa, che tiene meno |
| Perni tra parti separate | sulle facce di contatto, vicino ai bordi, diametro 3-6 mm; uno ogni 40 mm di bordo a incastro (60 mm da incollare, max 16), quindi con ganci intermedi sui bordi lunghi; gioco 0,1 mm a incastro, 0,3 mm per colla; saltati se il foro non cadrebbe nel pieno o con `connection: designed`. Se resta un tratto di bordo troppo lungo senza perni, l'analisi lo segnala |
| Pulsante (`button`) | la forma della parte dà l'impronta del tasto (tondo se è un cilindro). L'app genera: tasto che sporge della misura scelta, gambo nel foro del guscio (gioco = tolleranza delle cerniere), flangia sotto la superficie che lo trattiene, lamella elastica sotto la flangia che lo riporta su (corsa 1,5 mm morbido, 1 mm con click). Con il click, quattro dentini sul tasto superano il bordo del foro quando lo premi. Serve un guscio pieno di circa 8 mm sotto il tasto; si stampa già montato, nello stesso piatto del guscio |

Le tolleranze dipendono dal materiale di ogni parte (`src/data/guidelines.ts`) e dai valori calibrati con i campioni di prova (`src/core/calibration/`); vedi docs/ANALISI.md.
