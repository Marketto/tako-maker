# Analisi locali

Dopo ogni modifica `core/analysis/index.ts` esegue controlli deterministici e produce domande e avvisi.

## Stime (`estimate.ts`)

Modello volutamente semplice e trasparente, per **confrontare** le strategie:

- filamento estruso ≈ volume pieno × 0,35 (pareti + ~15% di riempimento);
- tempo ≈ volume estruso / (flusso tipico della stampante × 0,5) + 5 minuti per piatto;
- **multicolore**: per ogni strato da 0,2 mm, cambi = colori presenti − 1; ogni cambio aggiunge il tempo e lo spurgo tipici del sistema (`multi.changeS`, `multi.purgeMm3` in `printers.json`);
- **parti separate**: un piatto per colore (di più se l’area non basta), 2 minuti per cambio bobina manuale, nessuno scarto, penalità per il montaggio;
- **cambio a quota**: possibile solo se ogni colore occupa una fascia di altezza distinta; una pausa per colore.

Punteggio = ore + grammi di scarto / 20 + penalità (montaggio, attenzione richiesta). Vince il più basso.

## Domande automatiche

| Quando | Domanda | Effetto |
|---|---|---|
| La strategia migliore è diversa da quella attuale | “Conviene passare a …?” con il confronto dei numeri | `set_plan.strategy` |
| Strategia “parti separate” e parti a contatto | “Come vuoi unire le parti?” A incastro / Da incollare | `set_plan.connection` → perni generati |
| Giunti senza scelta sullo scatto | “Ci sono parti mobili. Vuoi che si fermino a scatto?” (scelta per giunto se più di uno) | `update_joint.detent` |
| Oggetto per bambini con spigoli vivi | “Arrotondo gli spigoli esterni (2 mm)?” | `radius` sui box non sottrattivi |

## Avvisi

- parti piccole (prova del cilindro “small parts”, Ø 31,7 mm) staccabili, per bambini sotto i 3 anni;
- parti che non entrano nel piatto;
- materiali che richiedono camera chiusa su stampanti aperte;
- articolazioni stampate già montate con strategia a parti separate.

## Guida di montaggio (`core/assembly/plan.ts`)

Parte dalla parte più voluminosa, poi aggiunge per ampiezza le parti che toccano quelle già montate,
scegliendo ogni volta quella con più contatti. Ogni passo ha testo, consigli (colla, pressione, scatti)
e una direzione d’arrivo usata dall’anteprima per l’animazione.

## Linee guida per stampante e materiale (`src/data/guidelines.ts`)

Per ogni materiale: temperature indicative, ritiro, sbalzo e ponte massimi, delta sulle tolleranze,
idoneità a scatti/incastri, tendenza a deformarsi, consigli pratici. Per la stampante: cinematica
(CoreXY o piatto mobile), camera chiusa, ugello (`printers.json`).

| Controllo | Quando |
|---|---|
| Elementi sottili | box non sottrattivi più sottili di 3 linee di estrusione (2,4 mm per bambini) |
| Pezzi alti e stretti | stampante a piatto mobile, altezza > 60 mm e > 3 volte il lato minore |
| Deformazione | materiali come ABS/ASA/PA/PC con pezzi più lunghi di 100 mm → brim |
| Materiali incompatibili | parti a contatto nella stessa stampa che aderiscono male (PLA/PETG, PLA/ABS…) |
| Scatti fragili | incastri o scatti in PLA → suggerisce PETG se disponibile |
| Ritiro | materiali con ritiro > 0,4% e pezzi da incastrare → compensare la scala |
| Cerniere | asse verticale o parti in TPU |

Le stesse regole, con le tolleranze effettive, sono nel blocco “Linee guida da rispettare” del prompt
(in cache), così l'AI crea modelli già conformi.

## Tolleranze e campioni di prova (`src/core/calibration/`)

Tolleranza effettiva = base → delta del materiale → valore calibrato dall'utente (`UserSetup.tolerances[materiale]`).
Per ogni coppia di parti si usa la tolleranza più larga dei due materiali.

Con giunti o incastri (e materiali non ancora calibrati) l'app chiede se stampare i campioni:

| Prova | Campione | Valori |
|---|---|---|
| Cerniera | due placchette con cerniera stampata montata | consigliato ±0,1 mm (5 valori) |
| Scatto | come sopra, con scatti a 0°, 90°, 180° | consigliato ±0,1 mm |
| Incastro a pressione | perno + blocco con foro | consigliato ±0,1 mm (min 0) |
| Perno da incollare | perno + blocco con foro | consigliato ±0,1 mm |

Il numero di puntini in rilievo (1–5) identifica il campione. Un 3MF per piatto, un materiale per piatto;
con più piatti si scarica uno zip con `LEGGIMI.txt`. La scelta del campione migliore si fa nella scheda
Stampa → Campioni di prova.
