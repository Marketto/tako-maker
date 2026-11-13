# Da fare

Attività in corso o da fare. Quando una è conclusa, spostala in [COMPLETED.md](COMPLETED.md) con la data.

## Da verificare

- **Backup nel cloud.**
  1. Registra le app Dropbox e Google.
  2. Salva `DROPBOX_APP_KEY` e `GOOGLE_CLIENT_ID` come variabili del repository ([BACKUP.md](BACKUP.md)).
  3. Prova il collegamento.
  4. Pulisci il browser e prova il ripristino dal wizard.
  5. Dopo un'ora, prova «Ricollega» di Google.

  Senza le variabili resta solo il backup su file.
- **Consumo di token con il connettore.** Badge e impostazioni devono mostrare la stima dopo `printopus_apri`.

## Da fare

- **Disposizione sul piatto in diagonale.**
  - Per la stampa del supporto Nordli lo slicer ha messo gli oggetti in diagonale: un pezzo era stretto e lungo quasi quanto la larghezza del piatto.
  - Idea: in `core`, provare la diagonale quando un pezzo lungo non entra dritto o lascia poco spazio.
- **Tema marino.** Il kelp è disegnato solo nei generatori dei mockup (`tools/mockup/`): manca in `src/ui/sea/shapes.ts`.
