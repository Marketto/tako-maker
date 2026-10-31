import { useMemo, useState } from 'react';
import { PRINTERS, store, uid } from '../app/store';
import { COMMON_COLORS, MATERIALS } from '../data/materials';
import type { Filament, UserSetup, Vec3 } from '../core/types';

/* Prima configurazione: marca → modello → sistema multicolore → filamenti → chiave API. */

type Step = 'welcome' | 'brand' | 'model' | 'multi' | 'filaments' | 'key';

export function Wizard({ initial, onDone }: { initial?: UserSetup | null; onDone?: () => void }) {
  const [step, setStep] = useState<Step>(initial ? 'brand' : 'welcome');
  const brands = useMemo(() => [...new Set(PRINTERS.map((p) => p.brand))], []);
  const initPrinter = PRINTERS.find((p) => p.id === initial?.printerId);
  const [brand, setBrand] = useState(initPrinter?.brand ?? '');
  const [printerId, setPrinterId] = useState(initial?.printerId ?? '');
  const [hasMulti, setHasMulti] = useState(initial?.hasMulti ?? false);
  const [customBed, setCustomBed] = useState<Vec3>(initial?.customBed ?? [220, 220, 250]);
  const [filaments, setFilaments] = useState<Filament[]>(initial?.filaments ?? []);
  const [mat, setMat] = useState('PLA');
  const [key, setKey] = useState(store.get().apiKey);
  const printer = PRINTERS.find((p) => p.id === printerId);
  const steps: Step[] = ['brand', 'model', ...(printer?.multi ? (['multi'] as Step[]) : []), 'filaments', 'key'];
  const idx = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(idx + 1, steps.length - 1)]);
  const back = () => setStep(idx <= 0 ? 'welcome' : steps[idx - 1]);

  const toggleColor = (c: { name: string; hex: string }) => {
    const exists = filaments.find((f) => f.material === mat && f.colorName === c.name);
    setFilaments(exists ? filaments.filter((f) => f !== exists) : [...filaments, { id: `f${uid().slice(0, 4)}`, material: mat, colorName: c.name, hex: c.hex }]);
  };

  const finish = () => {
    const setup: UserSetup = { printerId, hasMulti: !!printer?.multi && hasMulti, filaments, customBed: printerId === 'custom' ? customBed : undefined };
    store.setSetup(setup);
    if (key !== store.get().apiKey) store.setApiKey(key);
    onDone?.();
  };

  return (
    <div className="wizard">
      {step !== 'welcome' && (
        <div className="wizard-progress" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={i <= idx ? 'on' : ''} />
          ))}
        </div>
      )}

      {step === 'welcome' && (
        <section className="wizard-card hero">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={72} height={72} />
          <h1>Tako Maker</h1>
          <p>Descrivi l’oggetto che vuoi stampare: troviamo un modello libero o lo creiamo, e lo adattiamo alla tua stampante e ai tuoi filamenti.</p>
          <p className="muted">Prima due domande veloci sulla tua attrezzatura.</p>
          <button className="btn primary big" onClick={() => setStep('brand')}>Iniziamo</button>
        </section>
      )}

      {step === 'brand' && (
        <section className="wizard-card">
          <h2>Che marca è la tua stampante?</h2>
          <div className="choice-grid">
            {brands.map((b) => (
              <button key={b} className={`choice ${brand === b ? 'selected' : ''}`} onClick={() => { setBrand(b); setPrinterId(''); setStep('model'); }}>
                {b}
              </button>
            ))}
          </div>
          <Nav back={initial ? undefined : back} />
        </section>
      )}

      {step === 'model' && (
        <section className="wizard-card">
          <h2>Quale modello?</h2>
          <div className="choice-list">
            {PRINTERS.filter((p) => p.brand === brand).map((p) => (
              <button key={p.id} className={`choice row ${printerId === p.id ? 'selected' : ''}`} onClick={() => setPrinterId(p.id)}>
                <strong>{p.model}</strong>
                <span className="muted">
                  {p.id === 'custom' ? 'Inserisci le misure' : `${p.bed.join('×')} mm${p.multi ? ` · compatibile ${p.multi.system}` : ''}${p.enclosed ? ' · chiusa' : ''}`}
                </span>
              </button>
            ))}
          </div>
          {printerId === 'custom' && (
            <div className="bed-input">
              <label>Volume di stampa (mm)</label>
              <div className="row gap">
                {customBed.map((v, i) => (
                  <input key={i} type="number" min={50} max={1000} value={v} aria-label={['Larghezza', 'Profondità', 'Altezza'][i]}
                    onChange={(e) => setCustomBed(customBed.map((x, k) => (k === i ? Number(e.target.value) : x)) as Vec3)} />
                ))}
              </div>
            </div>
          )}
          <Nav back={back} next={printerId ? next : undefined} />
        </section>
      )}

      {step === 'multi' && printer?.multi && (
        <section className="wizard-card">
          <h2>Hai il sistema {printer.multi.system}?</h2>
          <p className="muted">Permette di stampare fino a {printer.multi.slots} colori nello stesso pezzo.</p>
          <div className="choice-grid two">
            <button className={`choice ${hasMulti ? 'selected' : ''}`} onClick={() => { setHasMulti(true); next(); }}>Sì, ce l’ho</button>
            <button className={`choice ${!hasMulti ? 'selected' : ''}`} onClick={() => { setHasMulti(false); next(); }}>No</button>
          </div>
          <Nav back={back} />
        </section>
      )}

      {step === 'filaments' && (
        <section className="wizard-card">
          <h2>Quali filamenti hai?</h2>
          <p className="muted">Scegli il materiale, poi tocca i colori che possiedi.</p>
          <div className="segmented" role="tablist">
            {MATERIALS.slice(0, 7).map((m) => (
              <button key={m.id} role="tab" aria-selected={mat === m.id} className={mat === m.id ? 'on' : ''} onClick={() => setMat(m.id)}>
                {m.label.replace(' (flessibile)', '')}
              </button>
            ))}
          </div>
          <div className="swatches">
            {COMMON_COLORS.map((c) => {
              const on = filaments.some((f) => f.material === mat && f.colorName === c.name);
              return (
                <button key={c.name} className={`swatch ${on ? 'on' : ''}`} onClick={() => toggleColor(c)} aria-pressed={on}>
                  <span className="dot" style={{ background: c.hex }} />
                  {c.name}
                </button>
              );
            })}
          </div>
          {filaments.length > 0 && (
            <div className="chips">
              {filaments.map((f) => (
                <span key={f.id} className="chip">
                  <span className="dot" style={{ background: f.hex }} /> {f.material} {f.colorName}
                  <button aria-label={`Rimuovi ${f.material} ${f.colorName}`} onClick={() => setFilaments(filaments.filter((x) => x !== f))}>×</button>
                </span>
              ))}
            </div>
          )}
          <Nav back={back} next={filaments.length ? next : undefined} nextLabel={filaments.length ? 'Avanti' : 'Scegli almeno un filamento'} />
        </section>
      )}

      {step === 'key' && (
        <section className="wizard-card">
          <h2>Chiave API di Claude</h2>
          <p className="muted">
            Serve per l’assistente. Resta solo su questo dispositivo e viene inviata soltanto ad Anthropic. Puoi crearla su{' '}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com</a>. Puoi anche aggiungerla dopo, dalle impostazioni.
          </p>
          <input className="text" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <p className="tip">Consiglio: nella console imposta un limite di spesa sulla chiave, per stare tranquillo.</p>
          <Nav back={back} next={finish} nextLabel={key ? 'Fine' : 'Salta per ora'} />
        </section>
      )}
    </div>
  );
}

function Nav({ back, next, nextLabel = 'Avanti' }: { back?: () => void; next?: () => void; nextLabel?: string }) {
  return (
    <div className="wizard-nav">
      {back ? <button className="btn ghost" onClick={back}>Indietro</button> : <span />}
      {next !== undefined || nextLabel !== 'Avanti' ? (
        <button className="btn primary" disabled={!next} onClick={next}>{nextLabel}</button>
      ) : null}
    </div>
  );
}
