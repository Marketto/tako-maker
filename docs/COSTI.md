# Costi API e ottimizzazioni

Prezzi usati dal contatore (USD per milione di token, `src/agent/config.ts`, da
[platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)):

| Modello | Input | Output | Scrittura cache | Lettura cache |
|---|---|---|---|---|
| Claude Haiku 5.5 (prompt ≤100K) | 0,10 | 0,50 | 0,125 | 0,01 |
| Claude Sonnet 5.5 | 2 | 10 | 2,50 | 0,10 |
| Ricerca web | $10 ogni 1000 ricerche + token dei risultati |

### Altri provider

| Provider | Veloce | Intelligente | Ricerca web |
|---|---|---|---|
| OpenAI | GPT-6 Luna: 0,10 / 0,50 (cache 0,01) | GPT-6.1 Sol: 2 / 10 (cache 0,10) | $10 ogni 1000 |
| Gemini | 3.5 Flash-Lite: 0,30 / 2,50 (cache 0,03) | 3.8 Flash: 0,75 / 3,75 (cache 0,075) fino al 31/12/2026 | 5000 gratis/mese, poi $14 ogni 1000 |

OpenAI e Gemini usano la cache dei prompt in automatico: la struttura dei prompt (parti fisse prima, variabili dopo) funziona anche con loro.

## Cosa fa l’app per risparmiare

1. **Router a regole**: quasi tutti i messaggi vengono instradati senza chiamate.
2. **Modello giusto per ogni compito**: Haiku per ricerca, consigli e spiegazioni; Sonnet solo per creare e modificare la geometria. Modalità risparmio = sempre Haiku.
3. **Prompt caching**: istruzioni, specifica DSL, skill, stampante e strumenti sono statici e marcati per la cache; le chiamate successive li leggono al 5% del prezzo (Sonnet) o a un decimo (Haiku).
4. **Modifiche come operazioni** invece di riscrivere il modello: poche centinaia di token in uscita.
5. **Risposte degli strumenti compatte** (ingombri e numeri essenziali, niente mesh).
6. **Domande automatiche a costo zero**: strategia, incastri, scatti, spigoli sono calcolati in locale.
7. **`show_results` chiude il ciclo** senza una chiamata in più; massimo 3 ricerche per richiesta.
8. **Cache delle ricerche** per 7 giorni in IndexedDB.
9. **Cronologia corta**: solo gli ultimi 6 messaggi di testo; il design viaggia sempre aggiornato a parte.
10. **Limiti duri**: massimo 6 iterazioni per messaggio, `max_tokens` per skill, tetto di spesa mensile.

## Ordini di grandezza (stime, variano con la complessità)

| Operazione | Costo tipico |
|---|---|
| Instradamento con Haiku (raro) | < $0,0002 |
| Ricerca modelli (Haiku + 1-3 ricerche) | $0,01 – $0,04 |
| Creazione modello (Sonnet) | $0,03 – $0,10 |
| Modifica (Sonnet, con cache) | $0,01 – $0,04 |
| Consiglio di stampa (Haiku) | < $0,005 |

Con $100 di credito restano disponibili migliaia di modifiche. Il valore esatto di ogni risposta
compare sotto il messaggio e nel riepilogo delle impostazioni.

Consiglio: imposta anche un limite di spesa sulla chiave nella Claude Console, in aggiunta al tetto dell’app.
