#!/usr/bin/env bash
# Scrive i secret di Cloudflare in .env.cloudflare (ignorato da Git) senza mostrarli,
# poi, se vuoi, li carica su GitHub per le action del connettore e del proxy.
# Da eseguire in un terminale vero (serve per leggere il token senza mostrarlo):
#   bash tools/cloudflare/token.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
FILE=.env.cloudflare

if [ ! -f "$FILE" ]; then
  printf '# Secret di Cloudflare per le GitHub Action (connettore e proxy). File ignorato da Git.\nCLOUDFLARE_ACCOUNT_ID=\nCLOUDFLARE_API_TOKEN=\n' > "$FILE"
fi
chmod 600 "$FILE"

# Aggiorna una riga CHIAVE=valore senza passare il valore sulla riga di comando.
set_key() {
  KEY="$1" VAL="$2" awk 'BEGIN{done=0} index($0, ENVIRON["KEY"] "=")==1 {print ENVIRON["KEY"] "=" ENVIRON["VAL"]; done=1; next} {print} END{if(!done) print ENVIRON["KEY"] "=" ENVIRON["VAL"]}' "$FILE" > "$FILE.tmp"
  mv "$FILE.tmp" "$FILE"
  chmod 600 "$FILE"
}

if ! grep -q '^CLOUDFLARE_ACCOUNT_ID=.' "$FILE"; then
  read -rp "Id dell'account Cloudflare (npx wrangler whoami): " ACCOUNT
  set_key CLOUDFLARE_ACCOUNT_ID "$ACCOUNT"
fi

read -rsp "Token API di Cloudflare (non viene mostrato): " TOKEN
echo
[ -n "$TOKEN" ] || { echo "Token vuoto: niente da fare."; exit 1; }
set_key CLOUDFLARE_API_TOKEN "$TOKEN"
unset TOKEN
echo "Token salvato in $FILE."

read -rp "Caricare i secret su GitHub adesso? [s/N] " OK
if [ "$OK" = "s" ] || [ "$OK" = "S" ]; then
  gh secret set -f "$FILE"
  echo "Fatto. Per pubblicare subito il connettore: gh workflow run connector.yml"
fi
