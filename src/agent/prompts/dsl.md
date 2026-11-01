## Formato del modello (Design DSL)

Il modello è un JSON. Tu non scrivi mesh: lo modifichi con lo strumento `edit_design` inviando una lista di operazioni.

Unità: millimetri. Asse Z verso l'alto. Il piatto di stampa è il piano z=0. Le forme si costruiscono con l'angolo in (0,0,0) e poi si spostano con `at`, salvo `center: true`.

Nodi forma (`shape`):
- `{"op":"box","size":[x,y,z],"radius":r?}` parallelepipedo; `radius` arrotonda spigoli e angoli.
- `{"op":"cylinder","h":h,"r":r,"r2":r2?,"center":bool?}` cilindro o cono lungo Z.
- `{"op":"sphere","r":r}` sfera centrata in (0,0,0).
- `{"op":"mesh","ref":"id","scale":s?}` mesh importata dall'utente (vedi contesto).
- `{"op":"union"|"difference"|"intersection"|"hull","children":[...]}`. In `difference` il primo figlio è il pezzo, gli altri vengono sottratti.
- Ogni nodo accetta `"at":[x,y,z]` (spostamento) e `"rot":[gx,gy,gz]` (gradi, applicata prima dello spostamento).

Parte: `{"id":"base","name":"Base","filamentId":"<id filamento>","shape":{...}}`. Ogni parte ha UN solo filamento. Più colori = più parti.

Giunti (parti mobili), l'app genera da sola la geometria:
- `{"id":"j1","type":"hinge","partA":"base","partB":"schermo","axis":"x","origin":[x,y,z],"length":40,"radius":4}` cerniera stampata già montata: lascia nella parte A e nella parte B lo spazio attorno all'asse; il cilindro della cerniera sta nell'origine.
- `type:"rotary"`: perno su A, B ruota attorno all'asse. `type:"slider"`: solo segnalazione (geometria a tuo carico).
- Non impostare `detent`: lo chiede l'app all'utente.

Pulsanti: una parte con `"button":{"housing":"<id del guscio>"}` diventa un tasto stampato già montato. La sua forma (box o cylinder) indica solo l'impronta del tasto, posata sulla superficie del guscio; foro, gambo, flangia, molla e sporgenza li genera l'app. Il guscio sotto il tasto deve essere pieno per almeno 8 mm. Non impostare `protrusionMm` né `feel`: li chiede l'app all'utente.

Operazioni per `edit_design.ops`:
- `{"op":"set_meta","name":"...","description":"...","children":true|false,"notes":"..."}`
- `{"op":"add_part","part":{...}}`, `{"op":"update_part","id":"...","name"?,"filamentId"?,"shape"?,"button"?}` (shape sostituisce tutta la forma; `button:null` toglie il pulsante)
- `{"op":"move_part","id":"...","at":[...],"rot":[...]}`, `{"op":"remove_part","id":"..."}`
- `{"op":"add_joint","joint":{...}}`, `{"op":"update_joint","id":"...","patch":{...}}`, `{"op":"remove_joint","id":"..."}`
- `{"op":"add_hardware","item":{"id":"magneti","name":"Magnete al neodimio","qty":4,"spec":"6×2 mm","purpose":"chiusura del coperchio"}}`, `{"op":"update_hardware","id":"...","patch":{...}}`, `{"op":"remove_hardware","id":"..."}`
- `{"op":"set_plan","strategy":"single|multicolor|separate|layer-swap","connection":"glue|snap|none"}` (di solito lo decide l'app con l'utente)

Elementi da comprare a parte:
- Preferisci soluzioni tutte stampate (incastri, cerniere, scatti, filettature grosse, molle stampate).
- Se la soluzione richiede qualcosa che non si stampa (viti, dadi, magneti, molle metalliche, cuscinetti, elastici, pile, elettronica…), dichiaralo con `add_hardware` (uno per tipo, con misure e scopo) e lascia nel modello le sedi giuste. Non nominarlo solo nel testo: l'app chiede all'utente, per ognuno, se comprarlo o cercare un'alternativa stampata. La colla per le parti da incollare non va dichiarata.
- Se un elemento ha `"decision":"printed"`, sostituiscilo con una soluzione stampata (aggiorna le parti) e poi rimuovilo con `remove_hardware`.

Regole di stampabilità:
- Pareti spesse almeno 1,6 mm (2,4 mm per giocattoli). Dettagli sporgenti almeno 1 mm.
- Appoggio piatto e ampio sul piano z=0. Sporgenze oltre 45° richiedono supporti: evitale.
- Le parti di colore diverso che vanno stampate insieme devono toccarsi (facce combacianti), non compenetrarsi molto.
- Tutto deve stare nel volume di stampa indicato nel contesto.
- Parti da assemblare: facce di contatto piane e con la stessa sagoma (bordi che combaciano), niente compenetrazioni né piccoli spazi tra parti che devono toccarsi. Lungo i bordi di contatto lascia pareti di almeno 6 mm su tutta la lunghezza: l'app ci mette i perni di incastro vicino ai bordi, con ganci intermedi ogni 40 mm circa sui bordi lunghi. Se disegni tu ganci o clip (es. coperchi a scatto), mettine anche a metà dei lati lunghi: uno ogni 40 mm al massimo. Se una parte si incastra dentro un'altra, ricava la sede con `difference` usando la stessa forma.
- Mantieni il modello semplice: pochi nodi, forme pulite. Massimo ~40 parti e ~600 nodi in totale.
- Usa id brevi e leggibili in minuscolo (es. "base", "schermo", "tasti").
