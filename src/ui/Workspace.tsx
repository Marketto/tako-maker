import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ProjectSession } from '../app/session';
import { loadProject, printerById, useStore } from '../app/store';
import { bedOf } from '../core/analysis/estimate';
import { Viewer3D } from './Viewer3D';
import { ChatPanel } from './ChatPanel';
import { PrintPanel } from './PrintPanel';
import { AssemblyPanel } from './AssemblyPanel';
import { BudgetBadge } from './Settings';
import { MusicButton } from './MusicButton';
import { MascotDock } from './mascot/MascotDock';

type Tab = 'chat' | 'print' | 'assembly';

export function Workspace({ projectId, onBack, onSettings }: { projectId: string; onBack: () => void; onSettings: () => void }) {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadProject(projectId).then(async (p) => {
      if (!p) return setFailed(true);
      const s = await ProjectSession.open(p);
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  if (failed) return <div className="center-msg">Progetto non trovato. <button className="link" onClick={onBack}>Torna indietro</button></div>;
  if (!session) return <div className="center-msg"><span className="spinner" /> Carico il progetto…</div>;
  return <WorkspaceInner session={session} onBack={onBack} onSettings={onSettings} />;
}

function WorkspaceInner({ session, onBack, onSettings }: { session: ProjectSession; onBack: () => void; onSettings: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { setup, settings } = useStore();
  const [tab, setTab] = useState<Tab>('chat');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const printer = printerById(setup!.printerId);
  const bed = bedOf(setup!, printer);

  const colors = useMemo(() => {
    const byId = new Map(setup!.filaments.map((f) => [f.id, f.hex]));
    return Object.fromEntries(snap.project.design.parts.map((p) => [p.id, byId.get(p.filamentId ?? '') ?? '#c9c4b8']));
  }, [snap.project.design, setup]);

  const tips = useMemo(() => setup!.filaments.map((f) => f.hex), [setup]);
  const compact = useMediaQuery('(max-width: 760px)');
  const hasAssembly = (snap.assembly?.steps.length ?? 0) > 1;
  useEffect(() => {
    if (step >= (snap.assembly?.steps.length ?? 0)) setStep(0);
  }, [snap.assembly, step]);
  useEffect(() => {
    if (tab === 'assembly' && hasAssembly) {
      setStep(0);
      setPlaying(true);
    } else setPlaying(false);
  }, [tab, hasAssembly]);

  const assemblyView = tab === 'assembly' && snap.assembly ? { steps: snap.assembly.steps, step } : null;
  const pendingQuestions = snap.questions.length;

  return (
    <div className="workspace">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Torna ai modelli">‹</button>
        <div className="title" title={snap.project.design.name}>{snap.project.design.name}</div>
        <div className="row gap">
          <BudgetBadge />
          <MusicButton />
          <button className="icon-btn" disabled={!snap.project.undo.length || !!snap.busy} onClick={() => session.undo()} aria-label="Annulla ultima modifica" title="Annulla">↶</button>
          <button className="icon-btn" onClick={onSettings} aria-label="Impostazioni">⚙</button>
        </div>
      </header>

      <div className="ws-body">
        <div className="ws-viewer">
          <Viewer3D parts={snap.parts} colors={colors} bed={bed} assembly={assemblyView} />
          {!snap.parts.length && <div className="viewer-hint">L’anteprima 3D comparirà qui</div>}
          {settings.mascotOn && <MascotDock snap={snap} tips={tips} compact={compact} />}
          {snap.parts.length > 0 && (
            <div className="viewer-legend">
              {snap.parts.map((p) => (
                <span key={p.id}><span className="dot" style={{ background: colors[p.id] }} />{p.name}</span>
              ))}
            </div>
          )}
        </div>

        <aside className="ws-panel">
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
              Assistente{pendingQuestions > 0 && tab !== 'chat' && <span className="pill">{pendingQuestions}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'print'} className={tab === 'print' ? 'on' : ''} onClick={() => setTab('print')}>Stampa</button>
            <button role="tab" aria-selected={tab === 'assembly'} className={tab === 'assembly' ? 'on' : ''} onClick={() => setTab('assembly')} disabled={!hasAssembly} title={hasAssembly ? '' : 'Disponibile con parti separate'}>
              Montaggio
            </button>
          </nav>
          <div className="tab-body">
            {tab === 'chat' && <ChatPanel session={session} snap={snap} />}
            {tab === 'print' && <PrintPanel session={session} snap={snap} />}
            {tab === 'assembly' && <AssemblyPanel snap={snap} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
