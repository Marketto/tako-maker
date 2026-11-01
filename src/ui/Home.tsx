import { useEffect, useState } from 'react';
import { deleteProject, listProjects, printerById, saveProject, uid, useStore, type Project } from '../app/store';
import { emptyDesign } from '../core/types';
import { InstallButton } from './Install';
import { MusicButton } from './MusicButton';
import { demoDesign } from '../data/demo';

export function Home({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const { setup, keys } = useStore();
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);
  const printer = setup ? printerById(setup.printerId) : null;

  const create = async (demo = false) => {
    const now = Date.now();
    const design = demo && setup ? demoDesign(setup.filaments) : emptyDesign();
    const p: Project = { id: uid(), name: design.name, design, undo: [], chat: [], answered: [], meshIds: [], createdAt: now, updatedAt: now };
    await saveProject(p);
    onOpen(p.id);
  };

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
          <span>Printopus</span>
        </div>
        <div className="row gap">
          <InstallButton />
          <MusicButton />
          <button className="icon-btn" onClick={onSettings} aria-label="Impostazioni">⚙</button>
        </div>
      </header>

      <main className="home-main">
        <section className="setup-summary">
          <div>
            <div className="muted small">La tua stampante</div>
            <strong>{printer?.brand} {printer?.model}</strong>
            {setup?.hasMulti && printer?.multi && <span className="badge">{printer.multi.system}</span>}
          </div>
          <div className="chips">
            {setup?.filaments.map((f) => (
              <span key={f.id} className="chip small"><span className="dot" style={{ background: f.hex }} />{f.material} {f.colorName}</span>
            ))}
          </div>
        </section>

        {!keys.some((k) => k.enabled && (k.key || k.baseUrl)) && (
          <button className="notice" onClick={onSettings}>Aggiungi una chiave AI (Claude, GPT o Gemini) per usare l’assistente →</button>
        )}

        <button className="new-project" onClick={() => create()}>
          <span className="plus">+</span>
          <span>
            <strong>Nuovo modello</strong>
            <span className="muted">Descrivi cosa vuoi stampare</span>
          </span>
        </button>

        <button className="link small" onClick={() => create(true)}>Oppure apri un modello d’esempio (non serve la chiave)</button>

        <h2 className="section-title">I tuoi modelli</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="muted">Ancora nessun modello.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button className="project" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.design.parts.length} parti · {new Date(p.updatedAt).toLocaleDateString('it-IT')}</span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Elimina ${p.name}`}
                  onClick={async () => {
                    if (!confirm(`Eliminare "${p.name}"?`)) return;
                    await deleteProject(p);
                    setProjects(await listProjects());
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
