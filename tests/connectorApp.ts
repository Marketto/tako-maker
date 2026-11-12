import { analyze } from '../src/core/analysis';
import { evaluateDesign } from '../src/core/geometry/evaluate';
import { tolerancesByPart } from '../src/core/calibration/tolerances';
import { analysisText } from '../src/agent/tools';
import { apiReport, type ServerDeps } from '../src/connector/server';
import { designKey, memoryStore, type ConnectorState } from '../src/connector/state';
import { manifold } from './fixtures';

/** Sessione del connettore con un'«app» simulata: mentre il server aspetta, calcola e rimanda l'analisi come la PWA. */
export async function connectorSession(code: string, state: ConnectorState, opts: { appOpen?: boolean } = {}) {
  const store = memoryStore();
  await store.put(code, state, null);
  const deps: ServerDeps = { store, appUrl: 'https://example.org/app/', reportWaitMs: 3000 };
  let clock = 1_000_000;
  deps.now = () => clock;
  deps.sleep = async (ms) => {
    clock += ms;
    if (opts.appOpen !== false) await appComputes(deps, code);
  };
  return { store, deps, state: () => store.data.get(code)!.state };
}

export async function appComputes(deps: ServerDeps, code: string) {
  const cur = (await deps.store.get(code))!.state;
  const key = designKey(cur);
  if (cur.report?.key === key) return;
  const d = cur.design;
  if (!d.parts.length) return void (await apiReport(deps, code, { key, text: 'Il modello è vuoto.', questions: [], errors: [] }));
  const w = await manifold();
  const r = evaluateDesign(w, d, {}, tolerancesByPart(d, cur.setup));
  const report = analyze(d, r.parts, cur.setup, cur.printer, new Set(cur.answered), { connectors: r.connectors, overlaps: r.overlaps, buttons: r.buttons, printStats: r.printStats });
  await apiReport(deps, code, { key, text: analysisText(d, r.parts, cur.setup, report), questions: report.questions, errors: r.errors });
}
