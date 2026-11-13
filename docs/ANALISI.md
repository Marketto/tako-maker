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
| Elemento da comprare a parte non ancora confermato (uno per domanda) | “Serve un elemento da comprare a parte: 4 × Magnete (6×2 mm). Va bene o cerco un’alternativa stampata?” | `update_hardware.decision`; con «alternativa stampata» parte una richiesta all’assistente (skill modifica-modello) |
| Pulsanti senza sporgenza scelta | “Quanto devono sporgere i pulsanti?” 1 / 2 / 3 mm (con i bambini consiglia almeno 2 mm) | `update_part.button.protrusionMm` |
| Pulsanti senza risposta scelta | “Devono fare click o essere morbidi?” | `update_part.button.feel` |
| Pulsante di colore diverso dal guscio senza multicolore | “Usiamo lo stesso colore?” | `update_part.filamentId` |
| Oggetto per bambini con spigoli vivi | “Arrotondo gli spigoli esterni (2 mm)?” | `radius` sui box non sottrattivi |

## Avvisi

- parti piccole (prova del cilindro “small parts”, Ø 31,7 mm) staccabili, per bambini sotto i 3 anni;
- parti che non entrano nel piatto;
- materiali che richiedono camera chiusa su stampanti aperte;
- articolazioni stampate già montate con strategia a parti separate;
- tratti di bordo lunghi senza ganci tra parti a incastro (oltre 1,5 volte la distanza tra i perni);
- pulsanti che non si possono generare (guscio troppo sottile, tasto troppo piccolo, tasto non sopra il guscio);
- elementi acquistati in oggetti per bambini (fissarli bene; magneti e pile a bottone);
- elementi da sostituire con una soluzione stampata non ancora sostituiti.

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

Con giunti o incastri (e materiali non ancora calibrati) l'app chiede se stampare i campioni.
Si propongono solo le prove dei giunti presenti nel modello:

| Prova | Quando | Campione | Valori |
|---|---|---|---|
| Cerniera | giunti `hinge` | due placchette con cerniera stampata montata | consigliato ±0,1 mm (5 valori) |
| Perno rotante | giunti `rotary` | base con perno e blocco forato stampato accanto, da infilare (stessa geometria del giunto) | `pinClearance` consigliato ±0,1 mm |
| Scatto | giunti con scatto | come la cerniera con scatti a 0°, 90°, 180°; se il modello non ha cerniere con scatto, come il perno rotante con scatti ogni 90° | consigliato ±0,1 mm |
| Incastro a pressione | collegamento a incastro | perno + blocco con foro | consigliato ±0,1 mm (min 0) |
| Perno da incollare | collegamento a colla | perno + blocco con foro | consigliato ±0,1 mm |

Il numero di puntini in rilievo (1–5) identifica il campione. Un 3MF per piatto, un materiale per piatto;
con più piatti si scarica uno zip con `LEGGIMI.txt`. La scelta del campione migliore si fa nella scheda
Stampa → Campioni di prova.

## Coerenza della forma e perni di incastro

Dopo ogni modifica, per le parti che vanno montate:

| Controllo | Proposta (zero token) |
|---|---|
| Parti che si compenetrano | ricavare nella parte più grande la sede esatta della più piccola (`difference`) |
| Spazio di 0,05–2 mm tra parti che dovrebbero toccarsi | avvicinarle (`move_part`) |
| Facce a contatto con la stessa sagoma ma sfalsate | allinearle (`move_part`) |
| Sagome quasi uguali (differenza ≤ 3 mm) | avviso: si vedrà un gradino |

**Perni** (parti separate a incastro o da incollare, `core/geometry/evaluate.ts → placePegs`):
1. il contatto viene ruotato su +Z e i due pezzi “affettati” appena sotto e sopra il piano: l'intersezione è la sagoma reale della faccia comune (anche i bordi sottili delle scatole cave);
2. la sagoma si restringe di raggio + gioco + 1,2 mm di parete: dove resta spazio il perno ha materiale tutto intorno;
3. i punti si scelgono sul contorno ristretto, quindi **vicino ai bordi**, il più distanti tra loro (almeno 2, fino a 6; diametro da 6 a 3 mm);
4. ogni perno è verificato: il foro deve stare tutto nel materiale della parte superiore e il perno poggiare sul pieno.

Se non c'è spazio per due perni l'app avvisa (un solo perno lascia ruotare il pezzo) e indica lo spessore di parete necessario.

## Torre di spurgo (`src/core/plate/`)

Quando lo stesso piatto contiene più colori (stampa multicolore unica, o parti separate di colori
diversi esportate insieme) lo slicer stampa una torre di spurgo. L'app lascia libera la zona dove lo
slicer della stampante la mette di solito:

- **Dati:** `multi.tower` in `src/data/printers.json`.
  - Posizione iniziale e misure tratte dal codice e dai profili degli slicer ufficiali, per 4 colori.
  - `null` se lo slicer di solito non la usa (es. CORE One INDX, AD5X).
  - Se assente, si usano i valori della famiglia di slicer (`TOWER_DEFAULTS`).
- **Dimensioni:** la torre cresce con il numero di colori: quelle quadrate in lato, quella di PrusaSlicer in profondità. Alla zona si aggiungono brim e 5 mm di margine.
- **Disposizione:** il modello resta al centro se non tocca la zona, altrimenti si sposta accanto, il più vicino possibile al centro (`placeAvoiding`). Con le parti separate il riempimento a righe salta la zona.
- **Stima:** la stampa multicolore risulta impossibile se modello e torre non entrano insieme nel piatto.
- **Anteprima:** la zona compare come riquadro rosa a righe; nella scheda Stampa un consiglio ne riporta le coordinate.

Bambu Studio può spostare la torre vicino agli oggetti quando si dispone il piatto: le coordinate sono
il punto di partenza degli slicer, non una garanzia.

## Supporti e adesione al piatto

Dopo ogni modifica il Worker della geometria misura, per ogni corpo come verrebbe stampato
(`bodyStats` in `core/geometry/evaluate.ts`):

- l'**area d'appoggio** sul piatto;
- le **sporgenze**: area delle facce rivolte verso il basso, per angolo dalla verticale;
- se il corpo **non tocca il piatto**.

Quale corpo si misura dipende dalla strategia:
- **stampa unica o multicolore**: i blocchi del modello montato;
- **parti separate**: ogni parte da sola, tranne quelle stampate già montate (cerniere, pulsanti), che restano insieme.

Con le soglie di `src/data/guidelines.ts` l'analisi decide:

| Caso | Cosa fa l'app |
|---|---|
| Sporgenze oltre l'angolo massimo del materiale (> 15 mm²) o corpo sospeso | supporti ad albero attivati nel 3MF (`enable_support`, `support_type` per Bambu/Orca; `support_material` per PrusaSlicer) e consiglio |
| Appoggio < 40 mm² o pezzo snello (altezza > 6 × lato d'appoggio) | brim di 5 mm nel 3MF e avviso |
| Supporti su un pezzo in PLA e l'utente ha anche PETG | interfaccia dei supporti nel materiale opposto (non aderisce, si stacca pulita): impostata nel 3MF se c'è un sistema multicolore (`support_interface_filament` / `support_material_interface_extruder`), altrimenti solo consigliata |
| Supporti su un pezzo in PETG e l'utente ha anche PLA | interfaccia in PLA **solo** con più ugelli (doppio ugello, cambio utensile: `multi.multiNozzle`). Con un ugello solo (AMS, ACE, CFS…) negli strati in cui si alternano i materiali la temperatura scende e il PETG vicino ai supporti si salda male e si divide: l'app usa supporti in PETG e lo spiega |

Le impostazioni sono scritte per oggetto: gli slicer che non le riconoscono le ignorano. Se l'utente cambia il profilo,
restano comunque modificabili nello slicer.
