import { useEffect, useState } from 'react';
import { listProjects, saveProject, store, uid, type Project } from '../app/store';
import { getSession } from '../app/connector';
import { normalizeCode } from '../connector/state';
import { t } from '../i18n';

/** Link #/collega/<codice> dalla chat: apre il progetto collegato (o lo crea su questo dispositivo). */
export function ConnectRoute({ code, onOpen, onFail }: { code: string; onOpen: (id: string) => void; onFail: () => void }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = normalizeCode(code);
      const existing = (await listProjects()).find((p) => p.connector?.code === c);
      if (existing) return alive && onOpen(existing.id);
      try {
        const remote = await getSession(c);
        if (!remote) return alive && setError(t('Il collegamento con la chat è scaduto: premi «Collega alla chat» per crearne uno nuovo.'));
        const now = Date.now();
        const p: Project = {
          id: uid(),
          name: remote.design.name,
          design: remote.design,
          undo: [],
          chat: [],
          answered: remote.answered,
          meshIds: [],
          connector: { code: c, v: remote.v, notesAt: 0 },
          createdAt: now,
          updatedAt: now,
        };
        await saveProject(p);
        store.setSettings({ aiMode: 'connector' });
        if (alive) onOpen(p.id);
      } catch (e) {
        if (alive) setError(t('Non riesco a raggiungere il connettore: {error}', { error: (e as Error).message }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  if (error) return <div className="center-msg"><p>{error}</p><button className="btn" onClick={onFail}>{t('Torna indietro')}</button></div>;
  return <div className="center-msg"><span className="spinner" /> {t('Apro il progetto collegato…')}</div>;
}
