import { useMemo, useState } from 'react';
import type { ProjectSession, Snapshot } from '../app/session';
import type { PrinterSpec } from '../core/types';
import { allowedLicenses, type License } from '../core/export/publish';
import { MARKETPLACES, marketplaceById, marketplaceFor, officialMarketplace } from '../data/marketplaces';
import { downloadBlob } from '../app/download';
import { captureCover } from './viewerCapture';
import { t } from '../i18n';

/* Pubblicazione sulla piattaforma del produttore della stampante usata nel progetto.
   Nessuna piattaforma ha un'API per caricare: si scarica il pacchetto pronto e si apre il sito,
   con titolo, descrizione e tag da copiare. */

export function PublishPanel({ session, snap, printer }: { session: ProjectSession; snap: Snapshot; printer: PrinterSpec }) {
  const d = snap.project.design;
  const licenses = allowedLicenses(d.source);
  const official = officialMarketplace(printer.brand);
  const [marketId, setMarketId] = useState(() => marketplaceFor(printer.brand).id);
  const [license, setLicense] = useState<License | undefined>(licenses?.[0]);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [noCover, setNoCover] = useState(false);
  const [copied, setCopied] = useState('');
  const market = marketplaceById(marketId);
  const lic = license && licenses?.includes(license) ? license : licenses?.[0];
  const listing = useMemo(() => (lic ? session.listing(lic) : null), [session, lic, snap.report, d]);

  if (!licenses || !listing) {
    return (
      <section className="publish">
        <h3>{t('Pubblica')}</h3>
        <p className="muted small">{t('La licenza del modello originale non permette di ripubblicarlo, oppure va verificata.')}</p>
      </section>
    );
  }

  const publish = async () => {
    // Il sito si apre subito, finché il clic dell'utente lo permette; il pacchetto arriva dopo.
    window.open(market.url, '_blank', 'noopener');
    setState('busy');
    const cover = await captureCover();
    setNoCover(!cover);
    const f = session.publishPackage(listing, cover);
    downloadBlob(f.blob, f.filename);
    setState('done');
  };

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      /* il testo resta visibile da copiare a mano */
    }
  };

  const fields: [string, string][] = [
    [t('Titolo'), listing.title],
    [t('Descrizione'), listing.description],
    [t('Tag'), listing.tags.join(', ')],
  ];

  return (
    <section className="publish">
      <h3>{t('Pubblica')}</h3>
      {!official && <p className="muted small">{t('{brand} non ha una piattaforma propria: scegli dove pubblicare.', { brand: printer.brand })}</p>}
      <label className="calib-row">
        <span>{t('Piattaforma')}</span>
        <select value={marketId} onChange={(e) => setMarketId(e.target.value)}>
          {MARKETPLACES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label className="calib-row">
        <span>{t('Licenza')}</span>
        <select value={lic} onChange={(e) => setLicense(e.target.value as License)} disabled={licenses.length < 2}>
          {licenses.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <button className="btn primary" disabled={!snap.parts.length || state === 'busy'} onClick={publish}>
        {t('Prepara e apri {name}', { name: market.name })}
      </button>
      {state === 'done' && (
        <>
          <ol className="publish-steps small">
            <li>{t('Accedi a {name} e premi «Upload».', { name: market.name })}</li>
            <li>{t('Carica dallo zip il file 3MF e la copertina, e gli STL se il sito li chiede.')}</li>
            <li>{t('Copia titolo, descrizione e tag qui sotto e scegli la licenza {license}.', { license: listing.license })}</li>
          </ol>
          {noCover && <p className="muted small">{t('Copertina non disponibile: aggiungi una foto della stampa.')}</p>}
          {fields.map(([label, value]) => (
            <div key={label} className="publish-field">
              <div className="publish-field-head">
                <span>{label}</span>
                <button className="btn small" onClick={() => copy(label, value)}>{copied === label ? t('Copiato ✓') : t('Copia')}</button>
              </div>
              <textarea readOnly value={value} rows={label === fields[1][0] ? 8 : 2} aria-label={label} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
