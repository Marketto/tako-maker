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
