# Ripresa del lavoro dal PC

Note per proseguire con Claude Code dal PC (dove `gh` e `wrangler` usano i tuoi accessi).
Situazione all'8 novembre 2026: le PR sono unite e il connettore Cloudflare è attivo (si ripubblica da solo a ogni push su `main`). Quando un punto è fatto, toglilo da qui; quando è tutto fatto, cancella il file
e la riga che lo cita in `CLAUDE.md`.

## 1. Da verificare

- I file di prova `printopus-*-kobra-x.3mf` (4 piatti, parti separate, multicolore) vanno aperti in
  Anycubic Slicer Next: controllare piatti, posizione degli oggetti, colori, supporti e orecchie anti-sollevamento.
  Le regole del formato sono in [3MF.md](3MF.md); `tests/bambu3mf.test.ts` fissa le posizioni attese.
- Chat: con «prima cerca modelli già fatti» attivo, dopo i risultati le richieste successive devono andare alla
  progettazione (`routeByRules` con `searched`).
- Connettore per Claude, prova completa: in un progetto «Collega alla chat», in Claude aggiungi il connettore
  personalizzato `…workers.dev/mcp` (vedi [CONNETTORE.md](CONNETTORE.md)) e scrivi in chat il codice mostrato dall'app.
- Takotta: il battito di ciglia ora mostra una palpebra chiusa (`.lid` in `tools/mascot/takotta.py`).

## 2. Come sono state fatte le traduzioni

Le frasi nuove si traducono così:

1. Esegui `npm run i18n:extract`.
2. Ricava le chiavi mancanti confrontando `src/i18n/source.json` con `src/i18n/locales/en.json`.
3. Fai aggiungere le chiavi mancanti a tutti i file in `src/i18n/locales/` da sotto-agenti, divisi in due gruppi di lingue. Per ogni frase dai una breve nota di contesto con:
   - i termini di stampa 3D da usare;
   - i segnaposto da lasciare invariati.
4. Controlla con `node tools/i18n/check.mjs`.

Vedi anche [TRADUZIONI.md](TRADUZIONI.md).
