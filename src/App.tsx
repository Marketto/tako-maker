import { useEffect, useState, useSyncExternalStore } from 'react';
import { locale, onLocaleChange } from './i18n';
import { useStore } from './app/store';
import { Wizard } from './ui/Wizard';
import { Home } from './ui/Home';
import { Workspace } from './ui/Workspace';
import { SettingsDialog } from './ui/Settings';
import { ConnectRoute } from './ui/ConnectRoute';
import { SeaTransitionLayer } from './ui/sea/SeaTransitionLayer';
import { seaGo } from './ui/sea/transition';

/* Navigazione minimale basata sull'hash (#/p/<id>), compatibile con GitHub Pages. */

function useHashRoute(): [string, (h: string) => void] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [hash, (h) => seaGo(() => (location.hash = h))];
}

/** Ridisegna tutta l'app quando cambia la lingua (anche testi calcolati come analisi e guida). */
export function LocaleRoot() {
  const code = useSyncExternalStore(onLocaleChange, locale);
  return (
    <>
      <App key={code} />
      <SeaTransitionLayer />
    </>
  );
}

export function App() {
  const { setup } = useStore();
  const [hash, go] = useHashRoute();
  const [settings, setSettings] = useState(false);
  const [editSetup, setEditSetup] = useState(false);

  if (!setup || editSetup) return <Wizard initial={setup} onDone={() => setEditSetup(false)} />;

  const projectId = hash.match(/^#\/p\/(\w+)/)?.[1];
  const linkCode = hash.match(/^#\/collega\/([A-Za-z0-9-]+)/)?.[1];
  return (
    <>
      {linkCode ? (
        <ConnectRoute code={linkCode} onOpen={(id) => go(`/p/${id}`)} onFail={() => go('')} />
      ) : projectId ? (
        <Workspace key={projectId} projectId={projectId} onBack={() => go('')} onSettings={() => setSettings(true)} />
      ) : (
        <Home onOpen={(id) => go(`/p/${id}`)} onSettings={() => setSettings(true)} />
      )}
      {settings && (
        <SettingsDialog
          onClose={() => setSettings(false)}
          onEditSetup={() =>
            seaGo(() => {
              setSettings(false);
              setEditSetup(true);
            })
          }
        />
      )}
    </>
  );
}
