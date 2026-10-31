import type { ProjectSession, Snapshot } from '../app/session';
import { printerById, useStore } from '../app/store';
import { fmtTime, STRATEGY_LABEL } from '../core/analysis/estimate';
import type { Connection, PrintStrategy } from '../core/types';
import { cheer } from './mascot/bus';
import { confetti } from './confetti';
import { centerValue, materialsToTest, neededTests, TEST_HOWTO, TEST_KEYS, TEST_LABEL, testValues } from '../core/calibration/coupons';
import { isCalibrated, tolerancesFor } from '../core/calibration/tolerances';

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
    cheer('export');
    confetti(setup!.filaments.map((x) => x.hex));
  };

  const kinds = neededTests(d);
  const mats = setup ? materialsToTest(d, setup) : [];

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

      {report && (report.tips.length > 0 || report.materialNotes.length > 0) && (
        <>
          <h3>Consigli per {printer.brand} {printer.model}</h3>
          <ul className="tips-list">
            {report.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {report.materialNotes.map((m) => (
            <details key={m.material} className="material-note">
              <summary>
                <strong>{m.material}</strong> · ugello {m.nozzleC[0]}–{m.nozzleC[1]} °C · piatto {m.bedC[0]}–{m.bedC[1]} °C
              </summary>
              <ul>
                {m.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </details>
          ))}
          <p className="muted small">Temperature indicative: segui l’etichetta della bobina e il profilo dello slicer.</p>
        </>
      )}

      {kinds.length > 0 && (
        <>
          <h3>Campioni di prova</h3>
          <p className="small">Stampa piccoli campioni con giochi diversi per trovare quello giusto per la tua stampante. Un piatto per materiale.</p>
          <button className="btn" disabled={!!snap.busy} onClick={() => session.downloadCalibration()}>Scarica i campioni di prova</button>
          {mats.map(({ material }) => (
            <div key={material} className="calib">
              <div className="calib-head">
                <strong>{material}</strong>
                <span className={`badge ${kinds.every((k) => isCalibrated(material, setup!, TEST_KEYS[k])) ? '' : 'off'}`}>
                  {kinds.every((k) => isCalibrated(material, setup!, TEST_KEYS[k])) ? 'calibrato' : 'valori consigliati'}
                </span>
              </div>
              {kinds.map((k) => {
                const current = centerValue(k, tolerancesFor(material, setup!));
                return (
                  <label key={k} className="calib-row">
                    <span>
                      {TEST_LABEL[k]}
                      <span className="muted small"> · {TEST_HOWTO[k]}</span>
                    </span>
                    <select
                      aria-label={`Campione migliore ${TEST_LABEL[k]} ${material}`}
                      value={String(current)}
                      onChange={(e) => session.saveCalibration(material, k, Number(e.target.value))}
                    >
                      {!testValues(k, material).includes(current) && <option value={String(current)}>in uso: {fmtMm(current)}</option>}
                      {testValues(k, material).map((v, i) => (
                        <option key={v} value={String(v)}>{'●'.repeat(i + 1)} {fmtMm(v)}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          ))}
        </>
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

const fmtMm = (v: number) => `${v.toFixed(2).replace('.', ',')} mm`;
