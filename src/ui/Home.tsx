import { useEffect, useState } from 'react';
import { deleteProject, listProjects, printerOf, saveProject, uid, useStore, type Project } from '../app/store';
import { emptyDesign } from '../core/types';
import { InstallButton } from './Install';
import { MusicButton } from './MusicButton';
import { demoDesign } from '../data/demo';
import { locale, t } from '../i18n';
import { CloudHomeNotice } from './CloudBackup';
import { cloud, CLOUD_NAME, useCloud } from '../app/cloud';
import { SeaBackdrop, SeaButton, SeaChoice, SeaDelete, SeaIconButton, SeaNotice, SeaSlab } from './sea/controls';

export function Home({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const { setup, keys } = useStore();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const c = useCloud();
  // Si rilegge l'elenco anche dopo ogni sincronizzazione: possono essere arrivati progetti dal cloud.
  useEffect(() => {
    void listProjects().then(setProjects);
  }, [c.lastSync]);
  useEffect(() => {
    if (c.kind && (c.status === 'idle' || c.status === 'error')) void cloud.refresh();
  }, []); // solo all'apertura della home
  const printer = setup ? printerOf(setup) : null;

  const create = async (demo = false) => {
    const now = Date.now();
    const design = demo && setup ? demoDesign(setup.filaments) : emptyDesign(t('Nuovo modello'));
    const p: Project = { id: uid(), name: design.name, design, undo: [], chat: [], answered: [], meshIds: [], createdAt: now, updatedAt: now };
    await saveProject(p);
    onOpen(p.id);
  };

  return (
    <div className="home sea">
      <SeaBackdrop />
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
          <span>Printopus</span>
        </div>
        <div className="row gap">
          <InstallButton />
          <MusicButton sea />
          <SeaIconButton shell="dollar" onClick={onSettings} aria-label={t('Impostazioni')}>⚙</SeaIconButton>
        </div>
      </header>

      <main className="home-main">
        <SeaSlab className="setup-summary">
          <div>
            <div className="muted small">{t('La tua stampante')}</div>
            <strong>{t(printer?.brand ?? '')} {t(printer?.model ?? '')}</strong>
            {setup?.hasMulti && printer?.multi && <span className="badge">{t(printer.multi.system)}</span>}
          </div>
          <div className="chips">
            {setup?.filaments.map((f) => (
              <span key={f.id} className="chip small"><span className="dot" style={{ background: f.hex }} />{f.material} {t(f.colorName)}</span>
            ))}
          </div>
        </SeaSlab>

        {!keys.some((k) => k.enabled && (k.key || k.baseUrl)) && (
          <SeaNotice onClick={onSettings}>{t('Aggiungi una chiave AI (Claude, GPT o Gemini) per usare l’assistente →')}</SeaNotice>
        )}

        <SeaButton big className="new-project-sea" onClick={() => create()}>
          <span className="plus" aria-hidden="true">+</span>
          <span className="new-project-text">
            <strong>{t('Nuovo modello')}</strong>
            <span className="small">{t('Descrivi cosa vuoi stampare')}</span>
          </span>
        </SeaButton>

        <button className="link small" onClick={() => create(true)}>{t('Oppure apri un modello d’esempio (non serve la chiave)')}</button>

        <h2 className="section-title">{t('I tuoi modelli')}</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="muted">{t('Ancora nessun modello.')}</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <SeaChoice className="row project" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span className="muted small">{t('{n} parti', { n: p.design.parts.length })} · {new Date(p.updatedAt).toLocaleDateString(locale())}</span>
                </SeaChoice>
                <SeaDelete
                  aria-label={t('Elimina {name}', { name: p.name })}
                  onClick={async () => {
                    const ask = c.kind ? t('Eliminare "{name}"? Verrà tolto anche da {provider}.', { name: p.name, provider: CLOUD_NAME[c.kind] }) : t('Eliminare "{name}"?', { name: p.name });
                    if (!confirm(ask)) return;
                    await deleteProject(p);
                    setProjects(await listProjects());
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <CloudHomeNotice onSettings={onSettings} />
      </main>
    </div>
  );
}
