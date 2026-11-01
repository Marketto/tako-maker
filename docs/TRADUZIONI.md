# Traduzioni

Printopus è disponibile in 42 lingue: italiano (lingua di partenza), inglese, tutte le altre lingue
europee (bulgaro, bosniaco, catalano, ceco, gallese, danese, tedesco, greco, spagnolo, estone, basco,
finlandese, francese, irlandese, galiziano, croato, ungherese, islandese, lussemburghese, lituano,
lettone, macedone, maltese, norvegese, olandese, polacco, portoghese, rumeno, slovacco, sloveno,
albanese, serbo, svedese, turco, ucraino), più russo, arabo, cinese semplificato, giapponese e coreano.

## Come funziona

- La **frase italiana è la chiave**: `t('Nuovo modello')`. Non ci sono identificatori da inventare.
- `t('Ho trovato {n} punti di contatto.', { n })` sostituisce i segnaposti `{nome}`.
- `msg('…')` marca una frase usata più avanti (costanti, etichette, testi creati nel worker della geometria) e la restituisce così com'è; la traduzione avviene con `t(valore)` dove viene mostrata.
- `fmtNum(0.25, 2)` scrive i numeri con il separatore della lingua (0,25 · 0.25 · ٠٫٢٥).
- Le traduzioni sono file JSON in `src/i18n/locales/<codice>.json`, caricati **solo** quando si sceglie quella lingua. Se manca una frase si usa l'inglese, poi l'italiano.
- L'arabo imposta `dir="rtl"` sulla pagina; gli stili usano proprietà logiche (`text-align: start`, `padding-inline-start`) così il layout si specchia da solo.
- La lingua iniziale è quella del dispositivo (se disponibile); si cambia dal primo schermo o nelle impostazioni.
- L'assistente AI riceve la lingua dell'utente nel blocco in cache della stampante e risponde in quella lingua. I prompt e le skill restano in italiano: il modello li capisce comunque e così non si moltiplicano i token in cache.

## Aggiungere o cambiare una frase

1. Scrivi la frase nel codice con `t()` o `msg()`. Frasi intere: non comporre pezzi (`'punt' + (n === 1 ? 'o' : 'i')`), usa due frasi per singolare e plurale.
2. `npm run i18n:extract` aggiorna `src/i18n/source.json`.
3. Aggiungi la traduzione in ogni file di `src/i18n/locales/`.
4. `npm run i18n:check-locales` segnala frasi mancanti, in più o con segnaposti diversi. Gli stessi controlli girano in `npm test`.

## Correggere una traduzione

Le traduzioni iniziali sono state scritte con l'aiuto dell'AI: possono contenere imprecisioni, soprattutto
nei termini tecnici di stampa 3D. Le correzioni da parte di chi parla la lingua sono benvenute: basta
modificare il valore nel JSON della lingua (mai la chiave italiana).

## Aggiungere una lingua

1. Aggiungi la lingua a `LOCALES` in `src/i18n/index.ts` (codice, nome nella lingua stessa, nome in inglese, `dir: 'rtl'` se serve).
2. Crea `src/i18n/locales/<codice>.json` con tutte le chiavi di `source.json`.
3. Se l'alfabeto non è latino, cirillico o greco, verifica che i font di sistema lo mostrino bene.
