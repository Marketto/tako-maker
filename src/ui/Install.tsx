import { useEffect, useState } from 'react';
import { t } from '../i18n';

/* Pulsante "Installa": usa beforeinstallprompt dove disponibile (Chrome, Edge,
   Android); su iOS mostra le istruzioni "Condividi → Aggiungi a Home". */

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BIPEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
});

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallButton() {
  const [can, setCan] = useState(!!deferred);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const on = () => setCan(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (isStandalone()) return null;
  if (can)
    return (
      <button
        className="btn small"
        onClick={async () => {
          await deferred?.prompt();
          deferred = null;
          setCan(false);
        }}
      >
        {t('Installa')}
      </button>
    );
  if (isIOS())
    return (
      <>
        <button className="btn small" onClick={() => setHelp(!help)}>{t('Installa')}</button>
        {help && <div className="popover">{t('Tocca «Condividi» e poi «Aggiungi alla schermata Home».')}</div>}
      </>
    );
  return null;
}
