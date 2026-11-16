# Da fare

Attività in corso o da fare. Quando una è conclusa, spostala in [COMPLETED.md](COMPLETED.md) con la data.

## Da verificare

- **Gusci robusti (16/11):** riesportare il cruscotto e controllare nello slicer che gli oggetti abbiano 3 pareti, fondo da 7 strati con i supporti e 20%; dopo la stampa, che il riempimento non si veda e la pelle resti attaccata staccando i supporti.
- **Backup nel cloud.**
  1. Registra le app Dropbox e Google.
  2. Salva `DROPBOX_APP_KEY` e `GOOGLE_CLIENT_ID` come variabili del repository ([BACKUP.md](BACKUP.md)).
  3. Prova il collegamento.
  4. Pulisci il browser e prova il ripristino dal wizard.
  5. Dopo un'ora, prova «Ricollega» di Google.

  Senza le variabili resta solo il backup su file.
- **Perno rotante a scatto e già montato.** Stampa un volante con manovella e un piatto girevole. Controlla che:
  - lo scatto entri a mano senza spezzare le lamelle e non si sfili tirando (dentino 0,7 mm oltre il foro, `ROTARY_SNAP` in `src/data/guidelines.ts`);
  - con gli scatti (`detent`) il pezzo resti fermo nelle posizioni scelte senza cadere per il peso e scatti in modo netto (`PIN_DETENT`);
  - il pezzo già montato si stacchi e giri.
- **Raccordi, baricentro e impugnature.** Con «armonizza le forme» attivo chiedi un oggetto con più forme, per esempio una lampada con piede, stelo e braccio, o un manico. Controlla che:
  - i raccordi nascondano le giunzioni e non chiudano fori o incastri;
  - la domanda sulla stabilità esca solo per modelli davvero instabili;
  - con una maniglia arrivino le domande su ergonomia e mano, e l'assistente rispetti le misure.
- **Consumo di token con il connettore.** Badge e impostazioni devono mostrare la stima dopo `printopus_apri`.

## Da fare

- **Disposizione sul piatto in diagonale.**
  - Per la stampa del supporto Nordli lo slicer ha messo gli oggetti in diagonale: un pezzo era stretto e lungo quasi quanto la larghezza del piatto.
  - Idea: in `core`, provare la diagonale quando un pezzo lungo non entra dritto o lascia poco spazio.
- **Tema marino.** Il kelp è disegnato solo nei generatori dei mockup (`tools/mockup/`): manca in `src/ui/sea/shapes.ts`.
