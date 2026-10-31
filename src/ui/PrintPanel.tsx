import type { ProjectSession, Snapshot } from '../app/session';
import { printerById, useStore } from '../app/store';
import { fmtTime, STRATEGY_LABEL } from '../core/analysis/estimate';
import type { Connection, PrintStrategy } from '../core/types';

export function PrintPanel({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const { setup } = useStore();
  const d = snap.project.design;
  const printer = printerById(setup!.printerId);
  const report = snap.report;
  const download = (f: { blob: Blob; filename: string }) => {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (!d.parts.length) return <div className="panel-empty muted">Qui vedrai tempi, consumi ed esportazione quando il modello sarà pronto.</div>;

  return (
    <div className="print-panel">
      {report?.summary && <div className="summary">{report.summary}</div>}

      <h3>Strategie a confronto</h3>
      <table className="estimates">
        <thead>
          <tr><th>Come</th><th>Tempo</th><th>Filamento</th><th>Scarto</th></tr>
        </thead>
        <tbody>
          {report?.estimates.map((e) => (
            <tr key={e.strategy} className={`${e.feasible ? '' : 'off'} ${e.strategy === d.printPlan.strategy ? 'current' : ''}`}>
              <td>
                <label>
                  <input type="radio" name="strategy" checked={e.strategy === d.printPlan.strategy} disabled={!e.feasible}
                    onChange={() => session.applyLocal([{ op: 'set_plan', strategy: e.strategy as PrintStrategy }])} />
                  {STRATEGY_LABEL[e.strategy]}
                </label>
                {!e.feasible && <div className="muted small">{e.reason}</div>}
              </td>
              <td>{e.feasible ? fmtTime(e.timeS) : '—'}</td>
              <td>{e.feasible ? `${e.filamentG.toFixed(0)} g` : '—'}</td>
              <td>{e.feasible ? `${e.wasteG.toFixed(0)} g` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Stime indicative: lo slicer darà i valori precisi.</p>

      {d.printPlan.strategy === 'separate' && (
        <>
          <h3>Unione delle parti</h3>
          <div className="segmented">
            {(['snap', 'glue', 'none'] as Connection[]).map((c) => (
              <button key={c} className={d.printPlan.connection === c ? 'on' : ''} onClick={() => session.applyLocal([{ op: 'set_plan', connection: c }])}>
                {c === 'snap' ? 'A incastro' : c === 'glue' ? 'Da incollare' : 'Nessun perno'}
              </button>
            ))}
          </div>
        </>
      )}

      <h3>Colori delle parti</h3>
      <ul className="part-list">
        {d.parts.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <select value={p.filamentId ?? ''} onChange={(e) => session.applyLocal([{ op: 'update_part', id: p.id, filamentId: e.target.value }])} aria-label={`Filamento per ${p.name}`}>
              {setup!.filaments.map((f) => (
                <option key={f.id} value={f.id}>{f.material} {f.colorName}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      {(report?.warnings.length ?? 0) + snap.geometryErrors.length > 0 && (
        <div className="warnings">
          {[...snap.geometryErrors, ...(report?.warnings ?? [])].map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {d.source && (
        <div className="attribution small">
          Remix di <a href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}</a>{d.source.author ? ` di ${d.source.author}` : ''} · {d.source.license}. L’attribuzione viene inclusa nel file esportato.
        </div>
      )}

      <div className="export">
        <button className="btn primary big" disabled={!snap.parts.length} onClick={() => download(session.export3MF())}>
          Esporta per {printer.slicer} (3MF)
        </button>
        <button className="btn" disabled={!snap.parts.length} onClick={() => download(session.exportSTL())}>STL per ogni parte (zip)</button>
      </div>
    </div>
  );
}
