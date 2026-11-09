import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ProjectSession } from '../app/session';
import { loadProject, printerOf, useStore } from '../app/store';
import { bedOf } from '../core/analysis/estimate';
import { Viewer3D } from './Viewer3D';
import { ChatPanel } from './ChatPanel';
import { PrintPanel } from './PrintPanel';
import { AssemblyPanel } from './AssemblyPanel';
import { BudgetBadge } from './Settings';
import { MusicButton } from './MusicButton';
import { MascotDock } from './mascot/MascotDock';
import { t } from '../i18n';
import { plateKeepFree } from '../core/plate';
import { SeaBackdrop, SeaIconButton, SeaMessage, SeaPebble } from './sea/controls';

type Tab = 'chat' | 'print' | 'assembly';

export function Workspace({ projectId, onBack, onSettings }: { projectId: string; onBack: () => void; onSettings: () => void }) {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let opened: ProjectSession | null = null;
    void loadProject(projectId).then(async (p) => {
      if (!p) return setFailed(true);
      const s = await ProjectSession.open(p);
      opened = s;
      if (alive) setSession(s);
      else s.dispose();
    });
    return () => {
      alive = false;
      opened?.dispose();
    };
  }, [projectId]);
  if (failed) return <SeaMessage>{t('Progetto non trovato.')} <button className="link" onClick={onBack}>{t('Torna indietro')}</button></SeaMessage>;
  if (!session) return <SeaMessage><span className="spinner" /> {t('Carico il progetto…')}</SeaMessage>;
  return <WorkspaceInner session={session} onBack={onBack} onSettings={onSettings} />;
}

function WorkspaceInner({ session, onBack, onSettings }: { session: ProjectSession; onBack: () => void; onSettings: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { setup, settings } = useStore();
  const [tab, setTab] = useState<Tab>('chat');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const printer = printerOf(setup!);
  const bed = bedOf(setup!, printer);
  // La zona della torre si mostra quando l'anteprima coincide con il piatto (stampa multicolore unica).
  const keepFree = snap.project.design.printPlan.strategy === 'multicolor' ? plateKeepFree(snap.project.design, setup!, printer) : null;

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
    <div className="workspace sea">
      <SeaBackdrop />
      <header className="topbar">
        <SeaIconButton shell="dollar" small onClick={onBack} aria-label={t('Torna ai modelli')}>‹</SeaIconButton>
        <div className="title" title={snap.project.design.name}>{snap.project.design.name}</div>
        <div className="row gap">
          <BudgetBadge />
          <MusicButton sea small />
          <SeaIconButton shell="dollar" small disabled={!snap.project.undo.length || !!snap.busy} onClick={() => session.undo()} aria-label={t('Annulla ultima modifica')} title={t('Annulla')}>↶</SeaIconButton>
          <SeaIconButton shell="dollar" small onClick={onSettings} aria-label={t('Impostazioni')}>⚙</SeaIconButton>
        </div>
      </header>

      <div className="ws-body">
        <div className="ws-viewer">
          <Viewer3D parts={snap.parts} colors={colors} bed={bed} assembly={assemblyView} keepFree={keepFree} />
          {!snap.parts.length && <div className="viewer-hint">{t('L’anteprima 3D comparirà qui')}</div>}
          {settings.mascotOn && <MascotDock snap={snap} tips={tips} compact={compact} />}
          {snap.parts.length > 0 && (
            <div className="viewer-legend">
              {snap.parts.map((p) => (
                <span key={p.id}><span className="dot" style={{ background: colors[p.id] }} />{p.name}</span>
              ))}
              {keepFree && <span><span className="dot tower" />{t('Torre di spurgo')}</span>}
            </div>
          )}
        </div>

        <aside className="ws-panel" data-tab={tab}>
          <nav className="tabs" role="tablist">
            <SeaPebble role="tab" aria-selected={tab === 'chat'} on={tab === 'chat'} onClick={() => setTab('chat')}>
              {t('Assistente')}{pendingQuestions > 0 && tab !== 'chat' && <span className="pill">{pendingQuestions}</span>}
            </SeaPebble>
            <SeaPebble role="tab" aria-selected={tab === 'print'} on={tab === 'print'} onClick={() => setTab('print')}>{t('Stampa')}</SeaPebble>
            <SeaPebble role="tab" aria-selected={tab === 'assembly'} on={tab === 'assembly'} onClick={() => setTab('assembly')} disabled={!hasAssembly} title={hasAssembly ? '' : t('Disponibile con parti separate')}>
              {t('Montaggio')}
            </SeaPebble>
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
