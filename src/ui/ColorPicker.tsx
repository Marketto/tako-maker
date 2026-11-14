import { useMemo, useState } from 'react';
import { categoriesFor, filterColors, type ColorCategory } from '../data/colors';
import { t } from '../i18n';
import { SeaGlass } from './sea/controls';

/** Scelta dei colori di un materiale: ricerca, categorie, campioni e colore personalizzato. */
export function ColorPicker({ material, isOn, onToggle }: { material: string; isOn: (name: string) => boolean; onToggle: (c: { name: string; hex: string }) => void }) {
  const [cat, setCat] = useState<ColorCategory>('comuni');
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customHex, setCustomHex] = useState('#3aa6a0');
  const cats = useMemo(() => categoriesFor(material), [material]);
  const current = cats.some((k) => k.id === cat) ? cat : 'comuni';
  const list = useMemo(() => filterColors(material, current, query, t), [material, current, query]);

  const addCustom = () => {
    const name = customName.trim() || t('Personalizzato {hex}', { hex: customHex });
    if (!isOn(name)) onToggle({ name, hex: customHex });
    setCustomName('');
  };

  return (
    <div className="color-picker">
      <input
        className="text color-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Cerca un colore (es. oro, pastello, legno)')}
        aria-label={t('Cerca un colore')}
      />
      {!query && (
        <div className="color-cats" role="tablist" aria-label={t('Categorie di colori')}>
          {cats.map((k) => (
            <button key={k.id} role="tab" aria-selected={current === k.id} className={current === k.id ? 'on' : ''} onClick={() => setCat(k.id)}>
              {t(k.label)}
            </button>
          ))}
        </div>
      )}
      <div className="swatches">
        {list.map((c) => (
          <SeaGlass key={c.name} color={c.hex} on={isOn(c.name)} onClick={() => onToggle(c)}>
            {t(c.name)}
          </SeaGlass>
        ))}
      </div>
      {!list.length && <p className="muted small">{t('Nessun colore trovato: prova un’altra parola o aggiungilo qui sotto.')}</p>}
      <details className="color-custom">
        <summary>{t('Non trovi il tuo colore? Aggiungilo')}</summary>
        <div className="row gap">
          <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)} aria-label={t('Colore')} />
          <input className="text" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t('Nome (es. Verde bosco)')} aria-label={t('Nome del colore')} />
          <button className="btn" onClick={addCustom}>{t('Aggiungi')}</button>
        </div>
      </details>
    </div>
  );
}
