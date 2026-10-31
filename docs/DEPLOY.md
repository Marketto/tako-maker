# Pubblicazione e gestione delle chiavi

## GitHub Pages (obbligatorio)

1. Repository pubblico, branch `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Ogni push su `main` esegue `.github/workflows/deploy.yml`: `npm ci` → test → build con `BASE_PATH=/<repo>/` → pubblicazione.
4. Le pull request eseguono solo test e build (nessuna pubblicazione).

Nessun secret richiesto.

## Perché la chiave API non va nei secret del sito

GitHub Pages pubblica file statici. Qualsiasi valore inserito durante la build (anche da un secret)
finisce nel JavaScript scaricato da chiunque visiti il sito: la chiave sarebbe pubblica e il credito
potrebbe essere consumato da altri.

Per questo l’app offre due modalità.

### A. Chiave personale nel browser (predefinita)

Ogni utente inserisce la propria chiave nelle impostazioni. Resta nel `localStorage` (o solo nella
sessione) del suo dispositivo e viene inviata soltanto a `api.anthropic.com`, con l’header
`anthropic-dangerous-direct-browser-access: true` che abilita le chiamate dal browser.
Adatta a uso personale e familiare.

Consigli:
- crea una chiave dedicata nella [Claude Console](https://platform.claude.com/settings/keys) con un limite di spesa;
- imposta il tetto mensile anche nell’app (Impostazioni → Spesa).

### B. Proxy su Cloudflare Worker (opzionale)

Se vuoi far usare l’app ad altri senza dare loro la chiave, pubblica il proxy in `proxy/`.
Qui i secret di GitHub servono davvero, perché finiscono **nel Worker**, non nel sito.

Secret del repository (**Settings → Secrets and variables → Actions**):

| Secret | Valore |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token Cloudflare con permesso “Edit Workers” |
| `CLOUDFLARE_ACCOUNT_ID` | id dell’account Cloudflare |
| `ANTHROPIC_API_KEY` | la tua chiave API |
| `PROXY_ACCESS_CODE` | un codice lungo e casuale da dare solo a chi può usare l’app |
| `PROXY_ALLOWED_ORIGIN` | `https://marketto.github.io` |

Al push, `.github/workflows/proxy.yml` pubblica il Worker (se `CLOUDFLARE_API_TOKEN` manca, il job
viene saltato). Poi nell’app: Impostazioni → “Usa un proxy” → URL del Worker e codice d’accesso.

Il proxy accetta solo `/v1/messages`, i modelli previsti, `max_tokens` ≤ 8000, la sola ricerca web
come strumento lato server (max 3 usi), e rifiuta richieste senza codice o da altre origini.
L’header Origin si può falsificare fuori dal browser: la protezione vera è il codice d’accesso, insieme
al limite di spesa sulla chiave.
