# Printopus

**Prova l’app:** https://marketto.github.io/printopus/

Web app installabile (PWA) per preparare oggetti da stampare in 3D a casa, con l'aiuto di Claude.
Descrivi cosa vuoi stampare: l'app cerca modelli gratuiti con licenza libera oppure lo crea da zero,
lo adatta alla **tua stampante** e ai **tuoi filamenti**, e lo esporta pronto per lo slicer.

Funziona su telefono, tablet e computer. Tutti i dati restano sul dispositivo.

## Cosa fa

- **Configurazione guidata**: marca → modello di stampante → sistema multicolore (AMS, MMU, CFS…) → filamenti posseduti (materiale e colore).
- **Ricerca di modelli liberi** su Printables, Thingiverse, MakerWorld e MyMiniFactory, escludendo le licenze che vietano le modifiche (ND) e i modelli a pagamento.
- **Creazione e modifica in linguaggio naturale** (“rendi lo schermo più grande”, “tasti gialli”) con anteprima 3D che puoi ruotare e ingrandire.
- **Controlli automatici dopo ogni modifica**, senza consumare credito:
  - confronto tra stampa multicolore, parti separate e cambio colore manuale a quota (tempo, grammi, scarto); se la strategia migliore cambia, l’app ti chiede se vuoi passare a quella nuova;
  - con parti separate chiede se le vuoi **a incastro** o **da incollare** e genera i perni;
  - con parti mobili chiede se vuoi lo **scatto** che le blocca in posizione;
  - per oggetti da **bambini** propone di arrotondare gli spigoli esterni e segnala le parti piccole.
- **Linee guida per stampante e materiale**, sempre applicate: tolleranze consigliate per materiale, spessori minimi in base all'ugello, avvisi su deformazione (ABS/ASA), pezzi alti su stampanti a piatto mobile, materiali che non aderiscono tra loro (es. PLA e PETG), TPU nei sistemi multicolore, orientamento delle cerniere; consigli di temperatura, brim e ritiro. Le stesse regole guidano l'AI quando crea i modelli.
- **Campioni di prova**: con parti mobili o incastri l'app propone di stampare serie di campioni con giochi diversi (cerniera, scatto, incastro a pressione, perno da incollare), un piatto per materiale (più piatti se non ci stanno). Dopo la stampa scegli il campione migliore: quei valori vengono usati per tutti i modelli successivi con quel materiale.
- **Guida di montaggio animata** passo passo per le parti separate.
- **Esportazione 3MF** per Bambu Studio, OrcaSlicer, Creality Print, ElegooSlicer, Anycubic Slicer Next e PrusaSlicer (colori/estrusori assegnati quando lo slicer li legge), oppure **STL per ogni parte**.
- **Takotta, la mascotte**: un polpo kawaii in stile anime anni 2000 che cambia espressione mentre lavori (pensa, si concentra, si confonde, festeggia), dice frasi di incitamento e ha le punte dei tentacoli dei colori dei tuoi filamenti. Toccala per una coccola.
- **Musica rilassante** generata dal browser (accordi morbidi e carillon), spenta di default, con volume regolabile.
- **Più provider AI**: Claude, GPT e Gemini, anche più chiavi per provider con una priorità; se una chiave finisce il credito, va in pausa o non risponde, l'app passa automaticamente alla successiva.
- **42 lingue**: italiano, inglese e tutte le altre lingue europee, più russo, cinese, arabo (da destra a sinistra), giapponese e coreano. La lingua si sceglie al primo avvio o nelle impostazioni (di default quella del dispositivo); anche l’AI risponde nella lingua scelta.
- **Spesa sotto controllo**: contatore dei costi, tetto mensile, modalità risparmio, cache delle ricerche.

Senza chiave puoi già provare il **modello d’esempio**: analisi, scatti, montaggio ed esportazione non usano l’API.

## Avvio in locale

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # test di geometria, analisi, export, router e ciclo agente (API simulata)
npm run build      # build di produzione in dist/
```

Requisiti: Node 22+.

## Pubblicazione su GitHub Pages

1. Crea un repository pubblico e carica il progetto sul branch `main`.
2. In **Settings → Pages** scegli **Source: GitHub Actions**.
3. Al primo push la Action `deploy.yml` esegue i test, compila e pubblica su `https://<utente>.github.io/<repo>/`.

**Non serve nessun secret** per il sito: ognuno inserisce la propria chiave API nell’app.
Leggi [docs/DEPLOY.md](docs/DEPLOY.md) per capire perché la chiave **non** va messa nei secret del sito,
e per l’alternativa opzionale con un proxy che la tiene sul server.

## Documentazione

| Documento | Contenuto |
|---|---|
| [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) | Struttura del codice e flusso dei dati |
| [docs/AGENTI.md](docs/AGENTI.md) | Router, skill, strumenti e ciclo agente |
| [docs/DESIGN-DSL.md](docs/DESIGN-DSL.md) | Formato JSON del modello e operazioni di modifica |
| [docs/ANALISI.md](docs/ANALISI.md) | Stime di tempo e scarto, domande automatiche, montaggio |
| [docs/COSTI.md](docs/COSTI.md) | Come l’app risparmia credito API, con stime per operazione |
| [docs/LICENZE-E-DIRITTI.md](docs/LICENZE-E-DIRITTI.md) | Licenze dei modelli, attribuzione, cosa fa e non fa l’app |
| [docs/TRADUZIONI.md](docs/TRADUZIONI.md) | Come funzionano le lingue e come aggiungere o correggere una traduzione |
| [docs/DEPLOY.md](docs/DEPLOY.md) | GitHub Pages, chiavi, proxy opzionale |
| [CLAUDE.md](CLAUDE.md) | Istruzioni per chi sviluppa il progetto con Claude Code |

## Limiti noti

- Le stime di tempo e consumo sono indicative: servono a confrontare le strategie, i valori precisi li dà lo slicer.
- Il formato 3MF con colori assegnati è “best effort”: se uno slicer ignora l’assegnazione, le parti arrivano comunque separate e con il nome del filamento.
- Le mesh importate non chiuse (non-manifold) si possono visualizzare ed esportare, ma non modificare con operazioni booleane.
- I dati delle stampanti sono indicativi: correzioni e nuove stampanti sono benvenute (`src/data/printers.json`).

## Licenza

Codice sotto licenza [MIT](LICENSE). I modelli trovati online restano dei rispettivi autori e con le loro licenze.
