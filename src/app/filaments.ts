import type { UserSetup } from '../core/types';
import { reassignMissingFilaments } from '../core/design/filaments';
import { listProjects, saveProject, store } from './store';

/** Progetti aperti in questo momento: li aggiorna la loro sessione, non il salvataggio qui sotto. */
export const openProjectIds = new Set<string>();

/**
 * Salva la configurazione. Se sono stati tolti dei filamenti, i pezzi che li usavano
 * passano a un filamento rimasto (stesso materiale se possibile) in tutti i progetti salvati.
 */
export async function saveSetup(setup: UserSetup) {
  const before = store.get().setup?.filaments ?? [];
  const removed = before.filter((f) => !setup.filaments.some((x) => x.id === f.id));
  store.setSetup(setup);
  if (!removed.length) return;
  for (const p of await listProjects()) {
    if (openProjectIds.has(p.id)) continue;
    const design = reassignMissingFilaments(p.design, setup.filaments, removed);
    if (design) await saveProject({ ...p, design });
  }
}
