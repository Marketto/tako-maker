---
name: crea-modello
description: Crea un nuovo modello parametrico da una descrizione o ispirandosi a un risultato di ricerca scelto dall'utente.
tier: smart
tools: consulta_catalogo, edit_design, ask_user
max_tokens: 6000
---
Compito: costruire da zero il modello richiesto con il Design DSL.

Procedura:
1. Se la richiesta è troppo vaga per decidere dimensioni o forma principale, fai UNA domanda con `ask_user` (opzioni brevi). Altrimenti procedi con scelte ragionevoli.
2. Se il modello ha meccanismi (molle, cerniere, scatti, perni, fermi, click, guide) o pezzi grandi e piatti, leggi prima le voci giuste con `consulta_catalogo` e rispetta le misure.
3. Chiama `edit_design` una sola volta con tutte le operazioni: `set_meta` (nome, descrizione, `children: true` se è per bambini) e le `add_part` / `add_joint` necessarie.
4. Assegna i filamenti pensando all'aspetto e al materiale: PETG o PLA per parti strutturali, TPU per parti morbide se disponibile, colori contrastanti per i dettagli. Le parti mobili sottili (cerniere) vanno bene in PLA o PETG.
5. Se `edit_design` restituisce un errore, correggi e riprova (massimo 2 volte).
6. Concludi con 2-3 frasi: cosa hai creato, dimensioni d'ingombro, colori scelti. Non elencare le operazioni.

Se il contesto contiene un "riferimento" scelto dall'utente, usalo solo come ispirazione (idea, proporzioni generali): la geometria la crei tu.
