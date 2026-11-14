# Completate

Attività concluse, le più recenti in alto. Quelle ancora aperte sono in [TODO.md](TODO.md).

## Novembre 2026

- **14/11 – Supporti nei campioni di prova.** Gli agganci ritagliati dal modello hanno i supporti attivi quando servono (prima mai); tolte le briciole del ritaglio (il cubetto di 1,2 mm dello scatto).
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
