# Backup dei progetti

I progetti vivono in IndexedDB, nel browser: se l’utente ne pulisce i dati, spariscono. Per non perderli
ci sono due strade, entrambe in **Impostazioni → Backup dei progetti**:

- **File**: «Scarica un backup» crea un `.zip` con tutti i progetti, le mesh importate e la stampante;
  «Ripristina da file» lo rilegge (anche un singolo `.printopus`). Funziona sempre, senza configurazione.
- **Cloud (facoltativo)**: Dropbox o Google Drive. Ogni modifica viene caricata dopo qualche secondo;
  all’avvio e all’apertura della home l’app scarica i progetti che mancano o sono più recenti nel cloud.
  Dopo aver pulito il browser (o su un altro dispositivo) basta ricollegare lo stesso account, anche dal
  benvenuto del wizard: tornano stampante, filamenti e progetti.

## Come funziona

- Tutto avviene nel browser, con il token dell’utente: l’app non ha un server e non vede i file.
- Un file per progetto, `<id>.printopus` (JSON compresso con gzip, mesh in base64), più l’indice
  `progetti.json` con nomi, date e la configurazione della stampante (`src/app/cloud/archive.ts`).
- Dropbox usa una **cartella dell’app** (`Apps/<nome app>`): l’app vede solo quella. Google Drive usa il
  permesso `drive.file` e una cartella «Printopus»: l’app vede solo i file che ha creato.
- In caso di conflitto vince la versione più recente; le modifiche locali non ancora caricate non vengono
  mai sovrascritte (`toDownload`). Eliminare un progetto lo toglie anche dal cloud.
- Dropbox: codice + PKCE con token di rinnovo, il collegamento resta finché non lo togli. Google: token
  diretto valido un’ora; quando scade la home mostra «Ricollega Google Drive» e le modifiche restano in
  coda (`m3d.cloud.pending`) finché non ricolleghi.
- I token stanno in `localStorage` (`m3d.cloud`), come le chiavi API: pulendo il browser si perdono e
  basta ricollegarsi.

## Attivarlo (una volta, per chi pubblica il sito)

Gli id delle app sono pubblici (non sono segreti) e arrivano dalla build. Senza id l’opzione non compare.

### Dropbox

1. Su [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → *Create app* →
   *Scoped access* → *App folder*. Il nome scelto diventa la cartella `Apps/<nome>` dell’utente.
2. Scheda *Permissions*: spunta `files.metadata.read`, `files.content.read`, `files.content.write`, poi *Submit*.
3. Scheda *Settings*:
   - *Redirect URIs*: `https://marketto.github.io/tako-maker/` e, per lo sviluppo, `http://localhost:5173/`;
   - *Allow public clients (Implicit Grant & PKCE)*: *Allow*.
4. Copia l’*App key* e salvala come variabile del repository: `gh variable set DROPBOX_APP_KEY`.
5. Finché l’app è in *Development* la possono collegare pochi utenti; per aprirla a tutti usa *Apply for production*.

### Google Drive

1. Su [console.cloud.google.com](https://console.cloud.google.com) crea un progetto e abilita la **Google Drive API**.
2. *Google Auth Platform* (schermata di consenso): tipo *Esterno*, nome dell’app ed email di supporto;
   tra gli ambiti aggiungi solo `.../auth/drive.file` (non sensibile).
3. *Client* → *Crea client* → *Applicazione web*:
   - *Origini JavaScript autorizzate*: `https://marketto.github.io` e `http://localhost:5173`;
   - *URI di reindirizzamento autorizzati*: `https://marketto.github.io/tako-maker/` e `http://localhost:5173/`.
4. Copia l’*ID client* e salvalo: `gh variable set GOOGLE_CLIENT_ID`.
5. In modalità *Test* possono collegarsi solo gli utenti di prova che aggiungi (massimo 100). Per tutti, pubblica
   l’app: con il solo ambito `drive.file` non serve la verifica di sicurezza, al più quella del marchio.

### Icona delle app

`python3 tools/mascot/takotta.py --backup-icon` crea `tools/mascot/branding/backup-icon.svg` (Takotta che esce da uno
scatolone generico: niente loghi di Dropbox o Google). I PNG `backup-icon-64/120/256.png` si ricavano con `sharp`:
64 e 256 per la scheda *Branding* di Dropbox (c’è anche la variante blu `backup-icon-blu-*.png`, più vicina allo stile di Dropbox), 120 per il logo nella schermata di consenso di Google.

### Sviluppo in locale

Crea `.env.local` (ignorato da Git) con `VITE_DROPBOX_APP_KEY=…` e/o `VITE_GOOGLE_CLIENT_ID=…`, poi `npm run dev`.
