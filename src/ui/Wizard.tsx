import { useMemo, useState } from 'react';
import { PRINTERS, store, uid, useStore } from '../app/store';
import { COMMON_COLORS, MATERIALS } from '../data/materials';
import type { Filament, UserSetup, Vec3 } from '../core/types';
import { Takotta } from './mascot/Takotta';
import { MusicButton } from './MusicButton';
import { KeysEditor } from './KeysEditor';

/* Prima configurazione: marca → modello → sistema multicolore → filamenti → chiave API. */

type Step = 'welcome' | 'brand' | 'model' | 'multi' | 'filaments' | 'key';

export function Wizard({ initial, onDone }: { initial?: UserSetup | null; onDone?: () => void }) {
  const [step, setStep] = useState<Step>(initial ? 'brand' : 'welcome');
  const { keys } = useStore();
  const hasKey = keys.some((k) => k.enabled && (k.key || k.baseUrl));
  const brands = useMemo(() => [...new Set(PRINTERS.map((p) => p.brand))], []);
  const initPrinter = PRINTERS.find((p) => p.id === initial?.printerId);
  const [brand, setBrand] = useState(initPrinter?.brand ?? '');
  const [printerId, setPrinterId] = useState(initial?.printerId ?? '');
  const [hasMulti, setHasMulti] = useState(initial?.hasMulti ?? false);
  const [customBed, setCustomBed] = useState<Vec3>(initial?.customBed ?? [220, 220, 250]);
  const [filaments, setFilaments] = useState<Filament[]>(initial?.filaments ?? []);
  const [mat, setMat] = useState('PLA');
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
          <div className="hero-mascot">
            <div className="speech static">Ciao! Sono Takotta ♡</div>
            <Takotta mood="felice" size={210} />
          </div>
          <h1>Printopus</h1>
          <p>Descrivi l’oggetto che vuoi stampare: troviamo un modello libero o lo creiamo, e lo adattiamo alla tua stampante e ai tuoi filamenti.</p>
          <p className="muted">Prima due domande veloci sulla tua attrezzatura.</p>
          <button className="btn primary big" onClick={() => setStep('brand')}>Iniziamo!</button>
          <div className="row gap center-row"><MusicButton /><span className="muted small">Musica rilassante</span></div>
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
          <div className="row gap">
            <Takotta mood={filaments.length ? 'felice' : 'normale'} size={84} tips={filaments.map((f) => f.hex)} />
            <h2>Quali filamenti hai?</h2>
          </div>
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
          <h2>Chiavi AI</h2>
          <p className="muted">
            Servono per l’assistente. Puoi usare <strong>Claude</strong>, <strong>GPT</strong> o <strong>Gemini</strong>, anche più di una chiave: se una finisce il credito l’app passa alla successiva.
            Restano solo su questo dispositivo. Puoi aggiungerle anche dopo, dalle impostazioni.
          </p>
          <KeysEditor compact />
          <p className="tip">Consiglio: nella console di ogni provider imposta un limite di spesa sulla chiave.</p>
          <Nav back={back} next={finish} nextLabel={hasKey ? 'Fine' : 'Salta per ora'} />
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
