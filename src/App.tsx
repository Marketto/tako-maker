import { useEffect, useState } from 'react';
import { useStore } from './app/store';
import { Wizard } from './ui/Wizard';
import { Home } from './ui/Home';
import { Workspace } from './ui/Workspace';
import { SettingsDialog } from './ui/Settings';

/* Navigazione minimale basata sull'hash (#/p/<id>), compatibile con GitHub Pages. */

function useHashRoute(): [string, (h: string) => void] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [hash, (h) => (location.hash = h)];
}

export function App() {
  const { setup } = useStore();
  const [hash, go] = useHashRoute();
  const [settings, setSettings] = useState(false);
  const [editSetup, setEditSetup] = useState(false);

  if (!setup || editSetup) return <Wizard initial={setup} onDone={() => setEditSetup(false)} />;

  const projectId = hash.match(/^#\/p\/(\w+)/)?.[1];
  return (
    <>
      {projectId ? (
        <Workspace key={projectId} projectId={projectId} onBack={() => go('')} onSettings={() => setSettings(true)} />
      ) : (
        <Home onOpen={(id) => go(`/p/${id}`)} onSettings={() => setSettings(true)} />
      )}
      {settings && (
        <SettingsDialog
          onClose={() => setSettings(false)}
          onEditSetup={() => {
            setSettings(false);
            setEditSetup(true);
          }}
        />
      )}
    </>
  );
}
