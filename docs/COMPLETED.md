# Completate

Attività concluse, le più recenti in alto. Quelle ancora aperte sono in [TODO.md](TODO.md).

## Novembre 2026

- **16/11 – Area di lavoro meno affollata sul telefono.** Sotto 760 px la legenda delle parti sta in una riga sola in alto, scorrevole di lato: prima, con 6 parti, copriva metà del modello. Il titolo va su due righe invece di essere troncato e Takotta è più piccola (76 px).
- **16/11 – Perni rotanti che girano davvero.** Nato da un volante stampato: è uscito saldato al piantone, con il braccio a L sospeso sopra il volante e pieno di supporti. Prima il giunto `rotary` era solo un perno Ø5 in un foro: le facce si toccavano senza gioco e niente tratteneva il pezzo. Ora l'app toglie ad A il corpo di B allargato del gioco e trova da sola il mozzo lungo l'asse. Già montato, il perno finisce con una testa conica nella svasatura. Se così servirebbero molti più supporti, l'app sceglie due pezzi separati con perno spaccato a scatto e propone le parti separate. La guida di montaggio spiega lo scatto. Dettagli in [DESIGN-DSL.md](DESIGN-DSL.md) e [ANALISI.md](ANALISI.md).
- **15/11 – Arrotondare e armonizzare le forme, chiesto una volta sola.** L'app chiede se arrotondare angoli e spigoli vivi e, se sì, se armonizzare le forme; la risposta vale per tutti i progetti e si cambia nelle Impostazioni («Forme»). L'arrotondamento (box e cilindri, fori esclusi) si applica nel calcolo della geometria (`core/design/style.ts`), l'assistente riceve la preferenza nel contesto. Prima l'utente doveva chiederlo in ogni progetto.
- **15/11 – Posizione sul piatto.** L'app prova le posizioni del pezzo (sei facce e facce piatte grandi), stima i grammi di supporto e segnala i supporti alti sotto zone strette, che possono cedere. Sceglie la migliore, la mostra nella scheda Stampa e esporta il 3MF già girato (`core/geometry/orient.ts`, [ANALISI.md](ANALISI.md)). Nato da una stampa fallita: cruscotto capovolto a mano nello slicer, con alberi alti 8 cm sotto i bordi delle ali.
- **14/11 – Modifica dei filamenti senza wizard.** Pulsante «Modifica filamenti» in Home e in Impostazioni (`ui/FilamentsEditor.tsx`, condiviso con il wizard). Se si toglie un filamento usato, i pezzi passano a uno rimasto dello stesso materiale (`core/design/filaments.ts`), nei progetti salvati e in quello aperto. Prima un progetto con un filamento tolto non accettava più modifiche.
- **14/11 – Più colori di filamento.** Circa 70 colori del mercato in `src/data/colors.ts` (famiglie e finiture, limitati ai materiali in cui esistono), con ricerca, categorie e colore personalizzato nel wizard (`ui/ColorPicker.tsx`).
- **14/11 – Supporti, ponti e istruzioni dei campioni di prova.** I ponti corti (cielo di un foro, tasca, arco) non chiedono più supporti, nel modello e nei campioni; i campioni hanno i supporti quando servono (prima mai); tolte le briciole del ritaglio; ogni pezzo dice ruolo e parte d'origine e ogni prova elenca i suoi pezzi.
- **14/11 – Campioni senza regioni fluttuanti** (PR #48). I pezzi sospesi di un ritaglio si posano accanto; gli oggetti nello slicer hanno il nome del campione.
- **13/11 – Tolto il KV del connettore.** Le sessioni stanno solo nei Durable Object; tolti il recupero dal vecchio archivio e la variabile `CONNECTOR_KV_ID`.
- **13/11 – Campioni di prova ritagliati dal modello** (PR #44, #45, #46).
  - Una serie per tipo di giunto (cerniera, rotazione, scatto) e materiale, con 3 varianti di gioco.
  - Un campione per ogni incastro progettato e per i campioni chiesti alla chat (`add_sample`).
  - Un solo pezzo con il perno per serie, dove il perno non cambia.
  - Dettagli in [ANALISI.md](ANALISI.md).
- **13/11 – Meno token in chat** (PR #43).
- **12/11 – Connettore su Durable Object** (PR #42). Provato con una conversazione vera: funziona.
- **Tema marino «B2».** Interfaccia marina, scura e bioluminescente, in stile cartoon, dal wizard alla home, all'area di lavoro e alle impostazioni (da PR #21).
  - Il mockup è nel canvas privato https://claude.ai/artifact/PRxoi9523Yt1dEnNkMH7Qx (riga «B2»).
  - I generatori delle forme sono in `tools/mockup/` e sono portati in TypeScript in `src/ui/sea/shapes.ts`.
  - Lo stile vale dentro ogni elemento con la classe `sea` e si ferma con «riduci movimento».
- **8/11 – Connettore Cloudflare attivo.** Si ripubblica da solo a ogni push su `main` ([CONNETTORE.md](CONNETTORE.md)).
