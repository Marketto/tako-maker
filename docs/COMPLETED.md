# Completate

Attività concluse, le più recenti in alto. Quelle ancora aperte sono in [TODO.md](TODO.md).

## Novembre 2026

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
