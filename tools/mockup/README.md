# Generatori dei mockup «tema marino»

Script Python usati per disegnare i mockup del tema B2 (canvas privato, link in
[docs/RIPRESA-DA-PC.md](../../docs/RIPRESA-DA-PC.md)). Producono stringhe SVG; servono come riferimento
per i componenti React. Rocce, balani, stella, lumachina, vetro di mare e tentacolo sono già portati in
`src/ui/sea/shapes.ts` (usati da `src/ui/sea/controls.tsx`); kelp, capasanta, dollaro della sabbia, granchio e bottiglia
sono ancora solo qui.

- `forme.py`: tentacolo rastremato con ventose, che può passare davanti e dietro a un elemento
  (`tentacle(punti, larghezza_iniziale, larghezza_finale, behind=[(da, a)])` restituisce lo strato dietro e quello davanti);
  fronde di kelp con gradiente, nervatura e vesciche d'aria (`kelp`, `kelp_blade`).
- `materiali.py`: materiali in stile cartoon con contorno scuro: roccia irregolare (`rock`, tipi basalto, arenaria,
  lastra, ciottolo), balani con i cirri, stella marina, lumachina, capasanta, dollaro della sabbia, carapace di granchio
  con chela, vetro di mare, bottiglia. Le classi CSS (`cirri`, `wiggle`, `snap`, `blink`, `sparkle`…) sono le
  micro-animazioni dei mockup.

Uso rapido: `python3 -c "import sys; sys.path.insert(0, 'tools/mockup'); import materiali; print(materiali.rock(200, 60, 1))"`.
