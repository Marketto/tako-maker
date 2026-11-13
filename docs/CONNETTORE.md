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
  - `printopus_apri`: regole, stampante, modello, analisi, domande aperte e ultimi messaggi, una volta per conversazione;
  - `printopus_stato`: solo modello, analisi e domande (leggero, per rileggere dopo un cambio nell'app);
  - `printopus_modifica`: operazioni del Design DSL, validate e salvate dal Worker;
  - `printopus_rispondi`: risposta a una domanda automatica dell'app;
  - `printopus_mostra_risultati`: modelli trovati con la ricerca web della chat.
- `POST /sessione`, `GET` e `PUT /sessione/<codice>`: la PWA crea la sessione condivisa e la sincronizza ogni 2,5 secondi mentre è aperta e in primo piano.
- `POST /sessione/<codice>/analisi`: la PWA rimanda l'analisi del modello che ha calcolato.

### Consumo di token nella chat

- **Ogni messaggio rilegge tutta la conversazione**, risposte degli strumenti comprese: il consumo cresce sempre più in fretta.
  `printopus_apri` è il pezzo più grosso (circa 30.000 caratteri tra regole, DSL, catalogo e modello).
- **Una sola apertura.** Le istruzioni dicono di chiamare `printopus_apri` una volta e poi `printopus_stato`, che contiene
  solo modello e analisi. `printopus_modifica` restituisce già l'analisi.
- **Chat nuova invece della compattazione.** Su claude.ai non c'è un comando per compattare la conversazione. Il progetto però vive
  nel connettore, quindi si può ripartire da zero:
  - dopo `LONG_CHAT_CALLS` chiamate (12) dall'ultima apertura, il connettore chiede a Claude di proporre una chat nuova, e lo ripete ogni 6;
  - `printopus_apri` riporta gli ultimi messaggi, così la chat nuova sa a che punto si era;
  - nell'app il pulsante «Nuova chat» apre claude.ai con la frase del codice già scritta (e la copia).
- **Il contatore dell'app** stima solo il testo degli strumenti, non le riletture: il consumo reale è più alto.

### Chi calcola cosa

- **La geometria la calcola l'app, non il Worker.** Nel piano gratuito un Worker ha circa 10 ms di CPU per richiesta: con manifold
  bastavano pochi pezzi per superarli (errore `1102`, «Non riuscito» nella chat).
- **Il Worker** valida e applica le operazioni (`applyOps`, leggero), salva e aspetta fino a 20 secondi l'analisi della nuova versione.
  L'attesa non consuma CPU. L'analisi è legata al modello da un'impronta (`designKey`): una vecchia viene rifiutata.
- **Se l'app è chiusa** o il telefono è in standby, la modifica resta salvata e la chat riceve «salvata, non ripeterla, apri l'app».
  Le domande automatiche (`printopus_rispondi`) servono invece l'app aperta, perché le prepara lei.

### Archivio delle sessioni

- **Ogni sessione è un Durable Object** (`SessionStore`, con SQLite, incluso nel piano gratuito): letture coerenti e scritture in fila.
- **Scrittura condizionata.** Ogni scrittura riporta la revisione letta: se nel frattempo è cambiata, si rilegge e si riprova
  (`update` in `src/connector/state.ts`). Così una modifica della chat non cancella quella appena prima.
- **Perché non KV.** Prima le sessioni stavano in Cloudflare KV, che tiene i valori in cache per circa 60 secondi in ogni sede:
  due chiamate vicine potevano leggere una versione vecchia e riscriverla sopra quella nuova.
- **Recupero dal KV.** Le sessioni create prima del passaggio si spostano dal KV al Durable Object alla prima lettura.
  Dopo il 19 novembre 2026 sono tutte scadute: si possono togliere il KV da `wrangler.toml`, da `worker.ts` e dalla action.

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

1. **Account.** Account Cloudflare gratuito. Il Durable Object si crea da solo alla prima pubblicazione (migrazione `v1` in `wrangler.toml`). La variabile `CONNECTOR_KV_ID` serve ancora alla action finché resta il recupero dal KV.
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
3. Con l'app aperta, chiama lo strumento `printopus_modifica` con quel codice e un `add_part`. Entro pochi secondi:
   - nell'app compaiono anteprima e messaggio;
   - la risposta dello strumento contiene «OK. Parti:» con l'analisi.

### Dati del proprio account

Indirizzo del Worker, id del KV e id dell'account stanno in `connector/cloudflare.local`, ignorato da Git. Il token e l'id dell'account per le action stanno in `.env.cloudflare`, anch'esso ignorato da Git e con permessi `600`: non vanno mai in un file versionato. Per cambiare token, crea quello nuovo, rilancia `tools/cloudflare/token.sh` e revoca il vecchio su Cloudflare.

### Prova in locale

`npm run build:connettore`, poi `cd connector && npx wrangler dev --local`, infine inserisci `http://localhost:8787` in Impostazioni → Assistente AI → indirizzo del connettore. Claude però raggiunge solo indirizzi pubblici.

Il runtime locale di Cloudflare richiede macOS 13.5 o successivo: sulle versioni precedenti `wrangler dev` non parte, mentre `wrangler deploy` funziona.

### Limiti e privacy

- **Dati salvati:** nel Durable Object restano solo stampante, filamenti, modello, analisi, ultimi messaggi e stima dei token scambiati, per 7 giorni dall'ultima modifica (poi un allarme cancella tutto), sotto un codice casuale. Nessuna chiave e nessun dato personale.
- **Piano gratuito dei Durable Object:** 100.000 richieste al giorno. L'app aperta ne fa circa 1.400 l'ora (una lettura ogni 2,5 secondi); ogni chiamata della chat ne fa qualcuna in più mentre aspetta l'analisi.
- **Mesh importate da file:** non vengono inviate al connettore. Per modificarle si usa la chiave API o il copia e incolla.
