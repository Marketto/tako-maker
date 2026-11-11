# Assistente senza API a consumo

Printopus può lavorare in tre modi, scelti dall'utente in **Impostazioni → Assistente AI** (o al
primo avvio):

| Modo | Costo | Come funziona |
|---|---|---|
| **Chiave AI** | gratis con Gemini (piano gratuito di Google AI Studio, con limiti giornalieri), oppure a consumo con Claude, GPT o Gemini | tutto automatico nell'app (vedi docs/AGENTI.md) |
| **Copia e incolla** | gratis | l'app prepara la richiesta, l'utente la incolla nella chat che preferisce e incolla qui la risposta |
| **Connettore per Claude** | incluso nell'account Claude dell'utente (anche gratuito) | la conversazione avviene in Claude, che usa gli strumenti di Printopus tramite MCP |

## Chiave Gemini gratuita

- **Come:** nella guida dell'app l'utente crea la chiave su <https://aistudio.google.com/apikey> e la segna come **Piano gratuito**.
- **Costo:** le chiamate fatte con quella chiave non entrano nella spesa e non sono bloccate dal tetto mensile.
- **Limite giornaliero:** se lo supera, il router delle chiavi la mette in pausa e passa alla successiva.
- **Privacy:** nel piano gratuito Google può usare i contenuti inviati per migliorare i propri prodotti. L'app lo dice all'utente.

## Copia e incolla (`src/agent/manual.ts`)

1. **La richiesta.** L'app instrada la richiesta con le sole regole locali e prepara un testo completo: regole, Design DSL, istruzioni della skill, stampante, filamenti, modello attuale, analisi, conversazione recente e formato della risposta.
2. **La risposta.** Dev'essere un solo blocco JSON con i campi `message`, `ops`, `summary`, `question` e `results`. Questi campi corrispondono agli strumenti `edit_design`, `ask_user` e `show_results`.
3. **Le modifiche.** Passano dalla stessa validazione del ciclo agente. Se non si possono applicare, l'app prepara una **richiesta di correzione** con l'errore.
4. **Le domande.** Una domanda della chat diventa una domanda nell'app; la risposta genera la richiesta successiva.

## Connettore MCP (`src/connector/`)

Un Cloudflare Worker (`connector/`) espone:

- `POST /mcp`: server MCP (trasporto streamable HTTP con risposte JSON, senza stato). Gli strumenti sono:
  - `printopus_apri`: regole, stampante, modello, analisi e domande aperte;
  - `printopus_modifica`: operazioni del Design DSL, validate e calcolate con manifold nel Worker;
  - `printopus_rispondi`: risposta a una domanda automatica dell'app;
  - `printopus_mostra_risultati`: modelli trovati con la ricerca web della chat.
- `POST /sessione`, `GET` e `PUT /sessione/<codice>`: la PWA crea la sessione condivisa e la sincronizza ogni 4 secondi mentre è aperta.

### Flusso per l'utente

1. **Collegamento.** In un progetto preme **Collega alla chat**: l'app mostra un codice (es. `K7QM-2XPA-9D`).
2. **Connettore in Claude (solo la prima volta).** Impostazioni → Connettori → **Aggiungi connettore personalizzato** con l'indirizzo `https://<worker>/mcp`. Su claude.ai i connettori personalizzati sono disponibili anche con l'account gratuito (uno solo).
3. **Chat.** In una chat con il connettore attivo scrive cosa vuole stampare e «Usa Printopus con il codice …».
4. **Modifiche.** Arrivano nell'app (anteprima, domande, esportazione). Le risposte date nell'app tornano alla chat. Quando la chat
   apre il progetto (`printopus_apri` segna `openedAt`) il pannello del codice si riduce a «Scollega» ed «Espandi».

Il link `#/collega/<codice>` apre il progetto collegato anche su un altro dispositivo.

Il server MCP è standard: funziona anche con altri client MCP. ChatGPT accetta connettori personalizzati con
scrittura solo nei piani Business, Enterprise ed Edu (in developer mode). Sui piani Plus e Pro, se il modo
sviluppatore è disponibile, solo in lettura.

### Pubblicazione

1. **Account e KV.** Account Cloudflare gratuito. Crea il KV con `npx wrangler kv namespace create SESSIONS` e annota l'id.
2. **Impostazioni del repository GitHub.**
   - Secret `CLOUDFLARE_API_TOKEN` (permesso *Workers Scripts: Edit* e *Workers KV Storage: Edit*) e `CLOUDFLARE_ACCOUNT_ID`.
   - Variabile `CONNECTOR_KV_ID` con l'id del KV.
   - Variabile `CONNECTOR_URL` con l'indirizzo del Worker (es. `https://printopus-connettore.<nome>.workers.dev`), così la PWA lo conosce.
3. **Pubblicazione automatica.** A ogni push su `main` la action `connector.yml` costruisce (`npm run build:connettore`) e pubblica il Worker.

Cose da sapere:

- **Action verde non vuol dire Worker pubblicato.** Senza `CLOUDFLARE_API_TOKEN` o `CONNECTOR_KV_ID` la action salta la pubblicazione e finisce comunque con successo. Lo stesso controllo non guarda `CLOUDFLARE_ACCOUNT_ID`: salva anche quello.
- **L'indirizzo entra nel sito durante la build.** Dopo aver cambiato `CONNECTOR_URL`, rilancia `deploy.yml` (*Actions → Run workflow*), altrimenti il sito resta senza l'indirizzo o con quello vecchio.
- **Il token si crea sul sito di Cloudflare** (*My Profile → API Tokens → Create Token*). Il login di `wrangler` vale solo sul tuo computer, non nella action, e non può creare token.
  - Nome: libero, serve solo a riconoscerlo (es. `tako-maker-github-actions`).
  - Modello *Edit Cloudflare Workers*. Nelle risorse dell'account scegli il tuo account; per le zone, se non hai domini su Cloudflare, scegli «Tutte le zone» (altrimenti il modulo chiede una zona).
  - Cloudflare mostra il token una volta sola.
- **Salvare i secret.** Da un terminale esegui `bash tools/cloudflare/token.sh`: chiede il token senza mostrarlo, lo scrive in `.env.cloudflare` (ignorato da Git, leggibile solo da te) e, se vuoi, carica i secret su GitHub con `gh secret set -f .env.cloudflare`. Poi `gh workflow run connector.yml` pubblica subito il connettore.
- **Il proxy usa lo stesso token.** Con il secret salvato, una modifica a `proxy/` fa partire `proxy.yml`, anche se non hai configurato la chiave API del proxy.

### Pubblicazione a mano

Serve per la prima volta o quando la action non è configurata:

1. `npx wrangler login`, poi `npx wrangler whoami` per controllare l'account.
2. `npm run build:connettore`.
3. In `connector/`, crea una copia di `wrangler.toml` con l'id del KV al posto del segnaposto e pubblica con `npx wrangler deploy --config <copia>`. Poi cancella la copia: `wrangler.toml` nel repository tiene il segnaposto.

### Controllo dopo la pubblicazione

1. `POST /mcp` con il metodo `initialize` deve rispondere 200 con `serverInfo.name` uguale a `printopus`.
2. Nell'app, premi «Collega alla chat» in un nuovo modello: deve comparire il codice.
3. Chiama lo strumento `printopus_modifica` con quel codice e un `add_part`: entro pochi secondi nell'app devono comparire anteprima e messaggio.

### Dati del proprio account

Indirizzo del Worker, id del KV e id dell'account stanno in `connector/cloudflare.local`, ignorato da Git. Il token e l'id dell'account per le action stanno in `.env.cloudflare`, anch'esso ignorato da Git e con permessi `600`: non vanno mai in un file versionato. Per cambiare token, crea quello nuovo, rilancia `tools/cloudflare/token.sh` e revoca il vecchio su Cloudflare.

### Prova in locale

`npm run build:connettore`, poi `cd connector && npx wrangler dev --local`, infine inserisci `http://localhost:8787` in Impostazioni → Assistente AI → indirizzo del connettore. Claude però raggiunge solo indirizzi pubblici.

Il runtime locale di Cloudflare richiede macOS 13.5 o successivo: sulle versioni precedenti `wrangler dev` non parte, mentre `wrangler deploy` funziona.

### Limiti e privacy

- **Dati salvati:** nel KV restano solo stampante, filamenti, modello, ultimi messaggi e stima dei token scambiati, per 7 giorni dall'ultima modifica, sotto un codice casuale. Nessuna chiave e nessun dato personale.
- **Piano gratuito di Cloudflare KV:** 1.000 scritture al giorno. Ogni chiamata di uno strumento è una scrittura (anche `printopus_apri`, che aggiorna la stima dei token in `usage`), più una per ogni modifica fatta nell’app.
- **Mesh importate da file:** non vengono inviate al connettore. Per modificarle si usa la chiave API o il copia e incolla.
