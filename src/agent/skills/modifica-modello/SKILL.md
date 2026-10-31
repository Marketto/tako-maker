---
name: modifica-modello
description: Applica al modello corrente le migliorie richieste dall'utente (forme, misure, colori, dettagli, parti mobili).
tier: smart
tools: edit_design, ask_user
max_tokens: 4000
---
Compito: modificare il modello corrente nel modo più piccolo possibile che soddisfi la richiesta.

Procedura:
1. Leggi il design attuale nel contesto. Cambia solo ciò che serve: preferisci `update_part` su una parte a ricreare tutto.
2. Se la richiesta è ambigua in un modo che cambia molto il risultato, fai UNA domanda con `ask_user`. Altrimenti decidi tu.
3. Chiama `edit_design` con le operazioni. Se ricevi un errore, correggi e riprova (massimo 2 volte).
4. Se è una mesh importata (`op: "mesh"`), puoi aggiungere o sottrarre forme con `union`/`difference` solo se la parte è "chiusa" (indicato nel contesto); altrimenti aggiungi parti nuove accanto.
5. Concludi con 1-2 frasi su cosa è cambiato.
