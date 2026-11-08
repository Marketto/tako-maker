import { useEffect, useState } from 'react';
import { t } from '../i18n';

/* Installazione della PWA: usa beforeinstallprompt dove disponibile (Chrome, Edge,
   Android); su iOS mostra le istruzioni "Condividi → Aggiungi a Home". */

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Lo script in index.html cattura l'evento anche se arriva prima di questo modulo.
let deferred: BIPEvent | null = (window as { __installPrompt?: BIPEvent }).__installPrompt ?? null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
});

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 'prompt' = il browser può installare con un tocco; 'ios' = istruzioni a mano; null = non disponibile o già installata. */
export type InstallMode = 'prompt' | 'ios' | null;

const currentMode = (): InstallMode => (isStandalone() ? null : deferred ? 'prompt' : isIOS() ? 'ios' : null);

export function useInstall(): { mode: InstallMode; install: () => Promise<boolean> } {
  const [mode, setMode] = useState<InstallMode>(currentMode);
  useEffect(() => {
    const on = () => setMode(currentMode());
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', on);
    on(); // l'evento può essere arrivato tra il primo disegno e questo effetto
    return () => {
      window.removeEventListener('beforeinstallprompt', on);
      window.removeEventListener('appinstalled', on);
    };
  }, []);
  const install = async () => {
    const e = deferred;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null;
    setMode(currentMode());
    return outcome === 'accepted';
  };
  return { mode, install };
}

export function InstallButton() {
  const { mode, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (mode === 'prompt')
    return (
      <button className="btn small" onClick={() => void install()}>
        {t('Installa')}
      </button>
    );
  if (mode === 'ios')
    return (
      <>
        <button className="btn small" onClick={() => setHelp(!help)}>{t('Installa')}</button>
        {help && <div className="popover">{t('Tocca «Condividi» e poi «Aggiungi alla schermata Home».')}</div>}
      </>
    );
  return null;
}
