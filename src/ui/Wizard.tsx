import { useEffect, useMemo, useState } from 'react';
import { PRINTERS, store, uid, useStore } from '../app/store';
import { COMMON_COLORS, MATERIALS } from '../data/materials';
import type { Filament, UserSetup, Vec3 } from '../core/types';
import { Takotta } from './mascot/Takotta';
import { MusicButton } from './MusicButton';
import { AiModePicker } from './AiModePicker';
import { msg, t } from '../i18n';
import { LanguagePicker } from './LanguagePicker';
import { useInstall } from './Install';
import { seaGo } from './sea/transition';
import { PearlProgress, SeaBackdrop, SeaButton, SeaChoice, SeaGlass, SeaPebble } from './sea/controls';

// Nomi della stampante personalizzata (da printers.json), da tradurre.
void [msg('Altro'), msg('Stampante personalizzata')];
// Sistemi multicolore con un nome descrittivo (gli altri sono nomi commerciali).
void [msg('AMS + doppio ugello'), msg('Cambio utensile')];

/* Prima configurazione: (installazione dell'app, se il dispositivo la supporta) → benvenuto →
   marca → modello → sistema multicolore → filamenti → chiave API. */

type Step = 'install' | 'welcome' | 'brand' | 'model' | 'multi' | 'filaments' | 'key';

export function Wizard({ initial, onDone }: { initial?: UserSetup | null; onDone?: () => void }) {
  const install = useInstall();
  const [step, setStep] = useState<Step>(initial ? 'brand' : install.mode ? 'install' : 'welcome');
  // Il browser può segnalare l'installazione qualche istante dopo l'avvio: se si è ancora al benvenuto, si propone prima.
  const [installSeen, setInstallSeen] = useState(false);
  useEffect(() => {
    if (step === 'welcome' && install.mode && !installSeen && !initial) setStep('install');
    // Installata da un'altra strada (es. menu del browser) mentre si guarda questo passo: si va avanti.
    if (step === 'install' && !install.mode) setStep('welcome');
  }, [step, install.mode, installSeen, initial]);
  // I cambi di passo voluti dall'utente passano dalla transizione marina; quelli automatici no.
  const goStep = (s: Step) => seaGo(() => setStep(s));
  const skipInstall = () => {
    setInstallSeen(true);
    goStep('welcome');
  };
  const { keys, settings } = useStore();
  const hasKey = keys.some((k) => k.enabled && (k.key || k.baseUrl));
  const brands = useMemo(() => [...new Set(PRINTERS.map((p) => p.brand))], []);
  const initPrinter = PRINTERS.find((p) => p.id === initial?.printerId);
  const [brand, setBrand] = useState(initPrinter?.brand ?? '');
  const [printerId, setPrinterId] = useState(initial?.printerId ?? '');
  const [hasMulti, setHasMulti] = useState(initial?.hasMulti ?? false);
  const [customBed, setCustomBed] = useState<Vec3>(initial?.customBed ?? [220, 220, 250]);
  const [custom, setCustom] = useState<NonNullable<UserSetup['custom']>>(initial?.custom ?? { enclosed: false, kinematics: 'bedslinger', multiSlots: 1 });
  const [filaments, setFilaments] = useState<Filament[]>(initial?.filaments ?? []);
  const [mat, setMat] = useState('PLA');
  const printer = PRINTERS.find((p) => p.id === printerId);
  // Il sistema multicolore integrato (non opzionale) non si chiede: c'è sempre.
  const askMulti = !!printer?.multi && printer.multi.optional;
  const steps: Step[] = ['brand', 'model', ...(askMulti ? (['multi'] as Step[]) : []), 'filaments', 'key'];
  const idx = steps.indexOf(step);
  const next = () => goStep(steps[Math.min(idx + 1, steps.length - 1)]);
  const back = () => goStep(idx <= 0 ? 'welcome' : steps[idx - 1]);

  const toggleColor = (c: { name: string; hex: string }) => {
    const exists = filaments.find((f) => f.material === mat && f.colorName === c.name);
    setFilaments(exists ? filaments.filter((f) => f !== exists) : [...filaments, { id: `f${uid().slice(0, 4)}`, material: mat, colorName: c.name, hex: c.hex }]);
  };

  const finish = () => seaGo(() => {
    const isCustom = printerId === 'custom';
    const setup: UserSetup = {
      printerId,
      hasMulti: isCustom ? custom.multiSlots > 1 : !!printer?.multi && (!printer.multi.optional || hasMulti),
      filaments,
      customBed: isCustom ? customBed : undefined,
      custom: isCustom ? custom : undefined,
    };
    store.setSetup(setup);
    onDone?.();
  });

  return (
    <div className="wizard sea">
      <SeaBackdrop />
      {step !== 'welcome' && step !== 'install' && <PearlProgress count={steps.length} index={Math.max(0, idx)} />}

      {step === 'install' && (
        <section className="wizard-card hero install-step">
          <div className="hero-mascot">
            <div className="speech static">{t('Prima di iniziare…')}</div>
            <Takotta mood="felice" size={170} />
          </div>
          <h2>{t('Installa Printopus sul dispositivo')}</h2>
          <p>{t('Così la apri come un’app, a tutto schermo, e funziona anche senza connessione.')}</p>
          {install.mode === 'prompt' ? (
            <SeaButton
              big
              onClick={async () => {
                await install.install();
                skipInstall();
              }}
            >
              {t('Installa')}
            </SeaButton>
          ) : (
            <ol className="install-steps">
              <li>{t('Tocca «Condividi» e poi «Aggiungi alla schermata Home».')}</li>
              <li>{t('Poi apri Printopus dalla schermata Home e continua da lì: le impostazioni dell’app installata sono separate da quelle del browser.')}</li>
            </ol>
          )}
          <SeaButton variant="secondary" onClick={skipInstall}>{install.mode === 'prompt' ? t('Non ora') : t('Continua nel browser')}</SeaButton>
        </section>
      )}

      {step === 'welcome' && (
        <section className="wizard-card hero">
          <div className="hero-mascot">
            <div className="speech static">{t('Ciao! Sono Takotta ♡')}</div>
            <Takotta mood="felice" size={210} />
          </div>
          <h1>Printopus</h1>
          <p>{t('Descrivi l’oggetto che vuoi stampare: troviamo un modello libero o lo creiamo, e lo adattiamo alla tua stampante e ai tuoi filamenti.')}</p>
          <p className="muted">{t('Prima due domande veloci sulla tua attrezzatura.')}</p>
          <SeaButton big onClick={() => goStep('brand')}>{t('Iniziamo!')}</SeaButton>
          <div className="row gap center-row"><MusicButton /><span className="muted small">{t('Musica rilassante')}</span></div>
          <LanguagePicker />
        </section>
      )}

      {step === 'brand' && (
        <section className="wizard-card">
          <h2>{t('Che marca è la tua stampante?')}</h2>
          <div className="choice-grid">
            {brands.map((b) => (
              <SeaChoice key={b} selected={brand === b} onClick={() => { setBrand(b); setPrinterId(''); goStep('model'); }}>
                {t(b)}
              </SeaChoice>
            ))}
          </div>
          <Nav back={initial ? undefined : back} />
        </section>
      )}

      {step === 'model' && (
        <section className="wizard-card">
          <h2>{t('Quale modello?')}</h2>
          <div className="choice-list">
            {PRINTERS.filter((p) => p.brand === brand).map((p) => (
              <SeaChoice key={p.id} className="row" selected={printerId === p.id} onClick={() => setPrinterId(p.id)}>
                <strong>{t(p.model)}</strong>
                <span className="muted">
                  {p.id === 'custom' ? t('Inserisci le misure') : `${p.bed.join('×')} mm${p.multi ? ` · ${t('compatibile {system}', { system: t(p.multi.system) })}` : ''}${p.enclosed ? ` · ${t('chiusa')}` : ''}`}
                </span>
              </SeaChoice>
            ))}
          </div>
          {printerId === 'custom' && (
            <div className="bed-input">
              <label>{t('Volume di stampa (mm)')}</label>
              <div className="row gap">
                {customBed.map((v, i) => (
                  <input key={i} type="number" min={50} max={1000} value={v} aria-label={[t('Larghezza'), t('Profondità'), t('Altezza')][i]}
                    onChange={(e) => setCustomBed(customBed.map((x, k) => (k === i ? Number(e.target.value) : x)) as Vec3)} />
                ))}
              </div>
              <label>{t('Com’è fatta?')}</label>
              <div className="segmented">
                <SeaPebble on={!custom.enclosed} onClick={() => setCustom({ ...custom, enclosed: false })}>{t('Aperta')}</SeaPebble>
                <SeaPebble on={custom.enclosed} onClick={() => setCustom({ ...custom, enclosed: true })}>{t('Chiusa, con sportello')}</SeaPebble>
              </div>
              <label>{t('Cosa si muove avanti e indietro?')}</label>
              <div className="segmented">
                <SeaPebble on={custom.kinematics === 'bedslinger'} onClick={() => setCustom({ ...custom, kinematics: 'bedslinger' })}>{t('Il piatto')}</SeaPebble>
                <SeaPebble on={custom.kinematics === 'corexy'} onClick={() => setCustom({ ...custom, kinematics: 'corexy' })}>{t('Solo la testina (CoreXY)')}</SeaPebble>
              </div>
              <label>{t('Quanti colori può stampare nello stesso pezzo?')}</label>
              <div className="segmented">
                {[1, 2, 4, 5, 8].map((n) => (
                  <SeaPebble key={n} on={custom.multiSlots === n} onClick={() => setCustom({ ...custom, multiSlots: n })}>{n}</SeaPebble>
                ))}
              </div>
            </div>
          )}
          <Nav back={back} next={printerId ? next : undefined} />
        </section>
      )}

      {step === 'multi' && printer?.multi && (
        <section className="wizard-card">
          <h2>{t('Hai il sistema {system}?', { system: t(printer.multi.system) })}</h2>
          <p className="muted">{t('Permette di stampare fino a {n} colori nello stesso pezzo.', { n: printer.multi.slots })}</p>
          <div className="choice-grid two">
            <SeaChoice selected={hasMulti} onClick={() => { setHasMulti(true); next(); }}>{t('Sì, ce l’ho')}</SeaChoice>
            <SeaChoice selected={!hasMulti} onClick={() => { setHasMulti(false); next(); }}>{t('No')}</SeaChoice>
          </div>
          <Nav back={back} />
        </section>
      )}

      {step === 'filaments' && (
        <section className="wizard-card">
          <div className="row gap">
            <Takotta mood={filaments.length ? 'felice' : 'normale'} size={84} tips={filaments.map((f) => f.hex)} />
            <h2>{t('Quali filamenti hai?')}</h2>
          </div>
          <p className="muted">{t('Scegli il materiale, poi tocca i colori che possiedi.')}</p>
          <div className="segmented" role="tablist">
            {MATERIALS.slice(0, 7).map((m) => (
              <SeaPebble key={m.id} role="tab" aria-selected={mat === m.id} on={mat === m.id} onClick={() => setMat(m.id)}>
                {m.short}
              </SeaPebble>
            ))}
          </div>
          <div className="swatches">
            {COMMON_COLORS.map((c) => {
              const on = filaments.some((f) => f.material === mat && f.colorName === c.name);
              return (
                <SeaGlass key={c.name} color={c.hex} on={on} onClick={() => toggleColor(c)}>
                  {t(c.name)}
                </SeaGlass>
              );
            })}
          </div>
          {filaments.length > 0 && (
            <div className="chips">
              {filaments.map((f) => (
                <span key={f.id} className="chip">
                  <span className="dot" style={{ background: f.hex }} /> {f.material} {t(f.colorName)}
                  <button aria-label={t('Rimuovi {name}', { name: `${f.material} ${t(f.colorName)}` })} onClick={() => setFilaments(filaments.filter((x) => x !== f))}>×</button>
                </span>
              ))}
            </div>
          )}
          <Nav back={back} next={filaments.length ? next : undefined} nextLabel={filaments.length ? t('Avanti') : t('Scegli almeno un filamento')} />
        </section>
      )}

      {step === 'key' && (
        <section className="wizard-card">
          <h2>{t('Come vuoi usare l’assistente?')}</h2>
          <p className="muted">{t('L’assistente crea e modifica i modelli quando glielo chiedi. Puoi cambiare scelta quando vuoi dalle impostazioni.')}</p>
          <AiModePicker compact />
          <Nav back={back} next={finish} nextLabel={settings.aiMode !== 'api' || hasKey ? t('Fine') : t('Salta per ora')} />
        </section>
      )}
    </div>
  );
}

function Nav({ back, next, nextLabel }: { back?: () => void; next?: () => void; nextLabel?: string }) {
  return (
    <div className="wizard-nav">
      {back ? <SeaButton variant="secondary" onClick={back}>{t('Indietro')}</SeaButton> : <span />}
      {next !== undefined || nextLabel !== undefined ? (
        <SeaButton disabled={!next} onClick={next}>{nextLabel ?? t('Avanti')}</SeaButton>
      ) : null}
    </div>
  );
}
