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

## 2. Prossimo lavoro: tema marino «B2»

Scelta fatta: l'interfaccia diventa marina, scura e bioluminescente, in stile cartoon. Mockup nel canvas privato
https://claude.ai/artifact/PRxoi9523Yt1dEnNkMH7Qx (riga «B2»: wizard, componenti, transizioni). Generatori delle forme
in `tools/mockup/`, portati in TypeScript in `src/ui/sea/shapes.ts`.

- Fatto: transizioni casuali tra le schermate (inchiostro, onda, bolle) ed entrata a cascata degli elementi,
  in `src/ui/sea/` (PR #21).
- Fatto nel wizard: sfondo (raggi, plancton, bolle), pulsante principale in basalto con tentacolo, secondario
  in arenaria, disattivo con il pesce che dorme, scelte su lastre con conchiglia e perla, schede a ciottoli, filamenti
  in vetro di mare, avanzamento a perle, fumetto a bolla d'aria, campi a solco (`src/ui/sea/controls.tsx`).
  Gli altri componenti dentro il wizard (modo dell'assistente, chiavi) prendono i colori marini dalle variabili CSS.
- Fatto nella home: barra in alto scura, capasanta (musica) e dollaro della sabbia (impostazioni), riepilogo su lastra,
  avviso in bottiglia, «Nuovo modello» in basalto, modelli su lastre ed elimina con il granchio.
  Lo stile marino vale dentro qualsiasi elemento con la classe `sea`.
- Fatto nell'area di lavoro e nelle impostazioni: barra con dollari della sabbia e capasanta, schede a ciottoli, pannello
  e chat scuri, finestra delle impostazioni marina. Il resto (domande, tabella di stampa, montaggio) prende i colori
  marini dalle variabili CSS.
- Fatto: interruttori a medusa (impostazioni, «ricorda le chiavi»), cursore a tentacolo con il pesce, errori della chat
  con il pesce palla, risposte alle domande su lastre (singola) e vetro di mare (multipla), kelp sul fondale, piatto 3D
  scuro.
- Fatto: caselle a ciottolo di vetro di mare (chiavi, licenza dei modelli trovati) e menu a tendina a solco con la
  conchiglia come freccia (scheda Stampa, chiavi), solo CSS dentro `.sea`.
- Resta da decidere: il font Fredoka dei mockup (non adottato).
  - Pulsante principale: roccia di basalto con alghe luminose, balani e stella marina, avvolta da tentacoli che passano
    davanti e dietro.
  - Secondario: ciottolo di arenaria con kelp e lumachina. Disattivo: roccia spenta con il pesce che dorme.
  - Elimina: carapace di granchio con la chela. Pulsanti a icona: capasanta e dollaro della sabbia.
  - Schede: ciottoli sulla sabbia. Scelta singola: lastre di pietra con conchiglia e perla, tenute da un tentacolo.
  - Scelta multipla e filamenti: vetro di mare. Interruttore: medusa in una scanalatura.
  - Cursore: tentacolo con il pesce come maniglia. Campi: solchi scolpiti nella pietra, pesce palla per gli errori.
  - Avanzamento: perle, pesce e bolle. Avvisi: messaggio in bottiglia. Fumetto di Takotta: bolla d'aria.
  - Micro-animazioni lente e sfondo con raggi di luce, plancton e bolle. Tutto fermo con «riduci movimento».
  - Il ciano luminoso segna sempre ciò che è attivo o si può toccare; bersagli tattili ≥ 40 px.

## 3. Come sono state fatte le traduzioni

Le frasi nuove si traducono così:

1. Esegui `npm run i18n:extract`.
2. Ricava le chiavi mancanti confrontando `src/i18n/source.json` con `src/i18n/locales/en.json`.
3. Fai aggiungere le chiavi mancanti a tutti i file in `src/i18n/locales/` da sotto-agenti, divisi in due gruppi di lingue. Per ogni frase dai una breve nota di contesto con:
   - i termini di stampa 3D da usare;
   - i segnaposto da lasciare invariati.
4. Controlla con `node tools/i18n/check.mjs`.

Vedi anche [TRADUZIONI.md](TRADUZIONI.md).
