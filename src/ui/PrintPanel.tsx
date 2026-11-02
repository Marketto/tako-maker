import type { ProjectSession, Snapshot } from '../app/session';
import { printerOf, useStore } from '../app/store';
import { fmtTime, STRATEGY_LABEL } from '../core/analysis/estimate';
import type { Connection, PrintStrategy } from '../core/types';
import { cheer } from './mascot/bus';
import { confetti } from './confetti';
import { centerValue, materialsToTest, neededTests, TEST_HOWTO, TEST_KEYS, TEST_LABEL, testValues } from '../core/calibration/coupons';
import { isCalibrated, tolerancesFor } from '../core/calibration/tolerances';
import { fmtNum, t } from '../i18n';
import { hardwareLabel, hardwareOf } from '../core/hardware';

export function PrintPanel({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const { setup } = useStore();
  const d = snap.project.design;
  const printer = printerOf(setup!);
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

  if (!d.parts.length) return <div className="panel-empty muted">{t('Qui vedrai tempi, consumi ed esportazione quando il modello sarà pronto.')}</div>;

  return (
    <div className="print-panel">
      {report?.summary && <div className="summary">{report.summary}</div>}

      <h3>{t('Strategie a confronto')}</h3>
      <table className="estimates">
        <thead>
          <tr><th>{t('Come')}</th><th>{t('Tempo')}</th><th>{t('Filamento')}</th><th>{t('Scarto')}</th></tr>
        </thead>
        <tbody>
          {report?.estimates.map((e) => (
            <tr key={e.strategy} className={`${e.feasible ? '' : 'off'} ${e.strategy === d.printPlan.strategy ? 'current' : ''}`}>
              <td>
                <label>
                  <input type="radio" name="strategy" checked={e.strategy === d.printPlan.strategy} disabled={!e.feasible}
                    onChange={() => session.applyLocal([{ op: 'set_plan', strategy: e.strategy as PrintStrategy }])} />
                  {t(STRATEGY_LABEL[e.strategy])}
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
      <p className="muted small">{t('Stime indicative: lo slicer darà i valori precisi.')}</p>

      {d.printPlan.strategy === 'separate' && (
        <>
          <h3>{t('Unione delle parti')}</h3>
          <div className="segmented">
            {(['snap', 'glue', 'none'] as Connection[]).map((c) => (
              <button key={c} className={d.printPlan.connection === c ? 'on' : ''} onClick={() => session.applyLocal([{ op: 'set_plan', connection: c }])}>
                {c === 'snap' ? t('A incastro') : c === 'glue' ? t('Da incollare') : t('Nessun perno')}
              </button>
            ))}
          </div>
        </>
      )}

      <h3>{t('Colori delle parti')}</h3>
      <ul className="part-list">
        {d.parts.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <select value={p.filamentId ?? ''} onChange={(e) => session.applyLocal([{ op: 'update_part', id: p.id, filamentId: e.target.value }])} aria-label={t('Filamento per {name}', { name: p.name })}>
              {setup!.filaments.map((f) => (
                <option key={f.id} value={f.id}>{f.material} {t(f.colorName)}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      {hardwareOf(snap.project.design).length > 0 && (
        <>
          <h3>{t('Da acquistare a parte')}</h3>
          <ul className="hardware-list">
            {hardwareOf(snap.project.design).map((h) => (
              <li key={h.id}>
                <span>
                  <strong>{hardwareLabel(h)}</strong>
                  {h.purpose && <span className="muted small"> · {h.purpose}</span>}
                </span>
                <span className={`badge ${h.decision === 'buy' ? '' : 'off'}`}>
                  {h.decision === 'buy' ? t('confermato') : h.decision === 'printed' ? t('da sostituire') : t('da confermare')}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('La lista viene inclusa nei file esportati (DA-ACQUISTARE.txt).')}</p>
        </>
      )}

      {(report?.warnings.length ?? 0) + snap.geometryErrors.length > 0 && (
        <div className="warnings">
          {[...snap.geometryErrors, ...(report?.warnings ?? [])].map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {report && (report.tips.length > 0 || report.materialNotes.length > 0) && (
        <>
          <h3>{t('Consigli per {printer}', { printer: `${t(printer.brand)} ${t(printer.model)}` })}</h3>
          <ul className="tips-list">
            {report.tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
          {report.materialNotes.map((m) => (
            <details key={m.material} className="material-note">
              <summary>
                <strong>{m.material}</strong> · {t('ugello {n0}–{n1} °C · piatto {b0}–{b1} °C', { n0: m.nozzleC[0], n1: m.nozzleC[1], b0: m.bedC[0], b1: m.bedC[1] })}
              </summary>
              <ul>
                {m.tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </details>
          ))}
          <p className="muted small">{t('Temperature indicative: segui l’etichetta della bobina e il profilo dello slicer.')}</p>
        </>
      )}

      {kinds.length > 0 && (
        <>
          <h3>{t('Campioni di prova')}</h3>
          <p className="small">{t('Stampa piccoli campioni con giochi diversi per trovare quello giusto per la tua stampante. Un piatto per materiale.')}</p>
          <button className="btn" disabled={!!snap.busy} onClick={() => session.downloadCalibration()}>{t('Scarica i campioni di prova')}</button>
          {mats.map(({ material }) => (
            <div key={material} className="calib">
              <div className="calib-head">
                <strong>{material}</strong>
                <span className={`badge ${kinds.every((k) => isCalibrated(material, setup!, TEST_KEYS[k])) ? '' : 'off'}`}>
                  {kinds.every((k) => isCalibrated(material, setup!, TEST_KEYS[k])) ? t('calibrato') : t('valori consigliati')}
                </span>
              </div>
              {kinds.map((k) => {
                const current = centerValue(k, tolerancesFor(material, setup!));
                return (
                  <label key={k} className="calib-row">
                    <span>
                      {t(TEST_LABEL[k])}
                      <span className="muted small"> · {t(TEST_HOWTO[k])}</span>
                    </span>
                    <select
                      aria-label={t('Campione migliore {test} {material}', { test: t(TEST_LABEL[k]), material })}
                      value={String(current)}
                      onChange={(e) => session.saveCalibration(material, k, Number(e.target.value))}
                    >
                      {!testValues(k, material).includes(current) && <option value={String(current)}>{t('in uso: {value}', { value: fmtMm(current) })}</option>}
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
          {t('Remix di')} <a href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}</a>{d.source.author ? ` · ${d.source.author}` : ''} · {d.source.license}. {t('L’attribuzione viene inclusa nel file esportato.')}
        </div>
      )}

      <div className="export">
        <button className="btn primary big" disabled={!snap.parts.length} onClick={() => download(session.export3MF())}>
          {t('Esporta per {slicer} (3MF)', { slicer: printer.slicer })}
        </button>
        <button className="btn" disabled={!snap.parts.length} onClick={() => download(session.exportSTL())}>{t('STL per ogni parte (zip)')}</button>
      </div>
    </div>
  );
}

const fmtMm = (v: number) => `${fmtNum(v, 2)} mm`;
