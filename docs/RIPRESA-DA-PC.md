# Ripresa del lavoro dal PC

Note per proseguire con Claude Code dal PC (dove `gh` e `wrangler` usano i tuoi accessi).
Situazione all'8 novembre 2026. Quando un punto è fatto, toglilo da qui; quando è tutto fatto, cancella il file
e la riga che lo cita in `CLAUDE.md`.

## 1. Unire le modifiche in `main` (pubblica l'app)

Le PR sono in fila: #14 (supporti) ← #15 (3MF con più piatti) ← #16 (catalogo, correzioni chat e mascotte).
La #16 contiene già anche le altre due, quindi basta unire quella dopo averle cambiato la base:

```bash
gh pr edit 16 --base main
gh pr merge 16 --merge --delete-branch
gh pr close 15 --comment "Inclusa nella #16"
gh pr view 14 --json state   # di solito risulta già MERGED; altrimenti: gh pr close 14 --comment "Inclusa nella #16"
gh run watch                 # "Test e pubblicazione su GitHub Pages" deve finire in verde
```

Il sito si aggiorna su https://marketto.github.io/tako-maker/ (l'app installata si aggiorna alla riapertura).

Conviene fare prima il punto 2: così la pubblicazione di `main` include già l'indirizzo del connettore.
Se l'hai già unita, dopo il punto 2 rilancia la pubblicazione con `gh workflow run deploy.yml`.

## 2. Attivare il connettore per Claude (Cloudflare, piano gratuito)

Dettagli e motivazioni in [CONNETTORE.md](CONNETTORE.md). Passi dal PC, nella cartella del progetto:

```bash
npx wrangler login                                   # apre il browser, accesso a Cloudflare
npx wrangler whoami                                  # annota l'Account ID
npx wrangler kv namespace create SESSIONS            # annota l'id del KV
```

Prima pubblicazione a mano, per conoscere l'indirizzo del Worker (senza modificare `wrangler.toml` nel repository):

```bash
npm ci && npm run build:connettore
cd connector
sed "s/SOSTITUISCI_CON_ID_DEL_KV/<ID_DEL_KV>/" wrangler.toml > wrangler.local.toml
npx wrangler deploy --config wrangler.local.toml     # stampa https://printopus-connettore.<nome>.workers.dev
rm wrangler.local.toml && cd ..
curl https://printopus-connettore.<nome>.workers.dev/   # risponde "Printopus: connettore MCP…"
```

Token per la pubblicazione automatica: in Cloudflare → My Profile → API Tokens → Create Token → modello
**Edit Cloudflare Workers**, poi aggiungi il permesso *Account → Workers KV Storage → Edit*. Il token non va mai
scritto in file del repository: incollalo solo nel comando qui sotto, che lo chiede in modo interattivo.

```bash
gh secret set CLOUDFLARE_API_TOKEN                   # incolla il token quando lo chiede
gh secret set CLOUDFLARE_ACCOUNT_ID --body "<ACCOUNT_ID>"
gh variable set CONNECTOR_KV_ID --body "<ID_DEL_KV>"
gh variable set CONNECTOR_URL --body "https://printopus-connettore.<nome>.workers.dev"
```

Da qui in poi ogni push su `main` ripubblica sia l'app sia il connettore.

Verifica: nell'app, Impostazioni → Assistente AI → «Connettore per Claude». Non deve più dire «non configurato».
In un progetto premi «Collega alla chat», aggiungi in Claude (Impostazioni → Connettori → Aggiungi connettore
personalizzato) l'indirizzo `…workers.dev/mcp` e scrivi in chat il codice mostrato dall'app.

## 3. Da verificare con la stampante

- I file di prova `printopus-*-kobra-x.3mf` (4 piatti, parti separate, multicolore) vanno aperti in
  Anycubic Slicer Next: controllare piatti, posizione degli oggetti, colori, supporti e orecchie anti-sollevamento.
  Le regole del formato sono in [3MF.md](3MF.md); `tests/bambu3mf.test.ts` fissa le posizioni attese.
- Chat: con «prima cerca modelli già fatti» attivo, dopo i risultati le richieste successive devono andare alla
  progettazione (`routeByRules` con `searched`).
- Takotta: il battito di ciglia ora mostra una palpebra chiusa (`.lid` in `tools/mascot/takotta.py`).

## 4. Come sono state fatte le traduzioni

Le frasi nuove si traducono così:

1. Esegui `npm run i18n:extract`.
2. Ricava le chiavi mancanti confrontando `src/i18n/source.json` con `src/i18n/locales/en.json`.
3. Fai aggiungere le chiavi mancanti a tutti i file in `src/i18n/locales/` da sotto-agenti, divisi in due gruppi di lingue. Per ogni frase dai una breve nota di contesto con:
   - i termini di stampa 3D da usare;
   - i segnaposto da lasciare invariati.
4. Controlla con `node tools/i18n/check.mjs`.

Vedi anche [TRADUZIONI.md](TRADUZIONI.md).
