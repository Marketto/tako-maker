/* Copertina per la pubblicazione: il visualizzatore 3D registra qui la sua funzione di cattura. */

type Capture = () => Promise<Uint8Array | undefined>;
let capture: Capture | null = null;

export const setViewerCapture = (c: Capture | null) => { capture = c; };

/** Immagine PNG 1200×900 del modello, senza piatto; `undefined` se l'anteprima non è disponibile. */
export const captureCover = (): Promise<Uint8Array | undefined> => (capture ? capture().catch(() => undefined) : Promise.resolve(undefined));
