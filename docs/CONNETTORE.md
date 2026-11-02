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
4. **Modifiche.** Arrivano nell'app (anteprima, domande, esportazione). Le risposte date nell'app tornano alla chat.

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

### Prova in locale

`npm run build:connettore`, poi `cd connector && npx wrangler dev --local`, infine inserisci `http://localhost:8787` in Impostazioni → Assistente AI → indirizzo del connettore. Claude però raggiunge solo indirizzi pubblici.

### Limiti e privacy

- **Dati salvati:** nel KV restano solo stampante, filamenti, modello e ultimi messaggi, per 7 giorni dall'ultima modifica, sotto un codice casuale. Nessuna chiave e nessun dato personale.
- **Piano gratuito di Cloudflare KV:** 1.000 scritture al giorno. Ogni modifica è una scrittura.
- **Mesh importate da file:** non vengono inviate al connettore. Per modificarle si usa la chiave API o il copia e incolla.
