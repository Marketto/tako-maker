import { useEffect, useState } from 'react';
import { store, uid, useStore } from '../app/store';
import { saveSetup } from '../app/filaments';
import { MATERIALS } from '../data/materials';
import type { Filament } from '../core/types';
import { ColorPicker } from './ColorPicker';
import { t } from '../i18n';
import { SeaButton, SeaIconButton, SeaPebble } from './sea/controls';

/** Scelta dei filamenti: materiale, colori posseduti ed elenco con «togli». Usata dal wizard e dalla finestra di modifica. */
export function FilamentsEditor({ filaments, onChange }: { filaments: Filament[]; onChange: (f: Filament[]) => void }) {
  const [mat, setMat] = useState('PLA');
  const toggleColor = (c: { name: string; hex: string }) => {
    const exists = filaments.find((f) => f.material === mat && f.colorName === c.name);
    onChange(exists ? filaments.filter((f) => f !== exists) : [...filaments, { id: `f${uid().slice(0, 4)}`, material: mat, colorName: c.name, hex: c.hex }]);
  };
  return (
    <>
      <div className="segmented" role="tablist">
        {MATERIALS.slice(0, 7).map((m) => (
          <SeaPebble key={m.id} role="tab" aria-selected={mat === m.id} on={mat === m.id} onClick={() => setMat(m.id)}>
            {m.short}
          </SeaPebble>
        ))}
      </div>
      <ColorPicker material={mat} isOn={(name) => filaments.some((f) => f.material === mat && f.colorName === name)} onToggle={toggleColor} />
      {filaments.length > 0 && (
        <div className="chips">
          {filaments.map((f) => (
            <span key={f.id} className="chip">
              <span className="dot" style={{ background: f.hex }} /> {f.material} {t(f.colorName)}
              <button aria-label={t('Rimuovi {name}', { name: `${f.material} ${t(f.colorName)}` })} onClick={() => onChange(filaments.filter((x) => x !== f))}>×</button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Finestra per aggiungere o togliere filamenti senza ripassare dal wizard. */
export function FilamentsDialog({ onClose }: { onClose: () => void }) {
  const { setup } = useStore();
  const [filaments, setFilaments] = useState<Filament[]>(setup?.filaments ?? []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const save = () => {
    const current = store.get().setup;
    if (current) void saveSetup({ ...current, filaments });
    onClose();
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sea" role="dialog" aria-modal="true" aria-label={t('I tuoi filamenti')} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{t('I tuoi filamenti')}</h2>
          <SeaIconButton shell="dollar" small onClick={onClose} aria-label={t('Chiudi')}>×</SeaIconButton>
        </header>
        <p className="muted">{t('Scegli il materiale, poi tocca i colori che possiedi.')}</p>
        <FilamentsEditor filaments={filaments} onChange={setFilaments} />
        <p className="muted small">{t('Se togli un filamento usato in un progetto, i suoi pezzi passano a un altro filamento, dello stesso materiale se c’è.')}</p>
        <div className="row gap">
          <SeaButton variant="secondary" onClick={onClose}>{t('Annulla')}</SeaButton>
          <SeaButton onClick={save} disabled={!filaments.length}>{filaments.length ? t('Salva') : t('Scegli almeno un filamento')}</SeaButton>
        </div>
      </div>
    </div>
  );
}
