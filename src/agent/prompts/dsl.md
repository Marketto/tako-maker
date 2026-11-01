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

Operazioni per `edit_design.ops`:
- `{"op":"set_meta","name":"...","description":"...","children":true|false,"notes":"..."}`
- `{"op":"add_part","part":{...}}`, `{"op":"update_part","id":"...","name"?,"filamentId"?,"shape"?}` (shape sostituisce tutta la forma)
- `{"op":"move_part","id":"...","at":[...],"rot":[...]}`, `{"op":"remove_part","id":"..."}`
- `{"op":"add_joint","joint":{...}}`, `{"op":"update_joint","id":"...","patch":{...}}`, `{"op":"remove_joint","id":"..."}`
- `{"op":"set_plan","strategy":"single|multicolor|separate|layer-swap","connection":"glue|snap|none"}` (di solito lo decide l'app con l'utente)

Regole di stampabilità:
- Pareti spesse almeno 1,6 mm (2,4 mm per giocattoli). Dettagli sporgenti almeno 1 mm.
- Appoggio piatto e ampio sul piano z=0. Sporgenze oltre 45° richiedono supporti: evitale.
- Le parti di colore diverso che vanno stampate insieme devono toccarsi (facce combacianti), non compenetrarsi molto.
- Tutto deve stare nel volume di stampa indicato nel contesto.
- Parti da assemblare: facce di contatto piane e con la stessa sagoma (bordi che combaciano), niente compenetrazioni né piccoli spazi tra parti che devono toccarsi. Lungo i bordi di contatto lascia pareti di almeno 6 mm: l'app ci mette i perni di incastro (almeno due, vicino ai bordi). Se una parte si incastra dentro un'altra, ricava la sede con `difference` usando la stessa forma.
- Mantieni il modello semplice: pochi nodi, forme pulite. Massimo ~40 parti e ~600 nodi in totale.
- Usa id brevi e leggibili in minuscolo (es. "base", "schermo", "tasti").
