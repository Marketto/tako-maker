import { useRef, useState } from 'react';
import { cloud, cloudKinds, CLOUD_NAME, exportAll, importFile, useCloud } from '../app/cloud';
import { downloadBlob } from '../app/download';
import { locale, t } from '../i18n';
import { SeaButton, SeaNotice } from './sea/controls';

/* Backup dei progetti: cloud facoltativo (Dropbox, Google Drive) e file da scaricare. */

const when = (ms: number) => new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });

/** Scelta del file di backup da ripristinare; chiama onDone con il numero di progetti importati. */
function useImport(onDone?: (n: number) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const el = (
    <input
      ref={input}
      type="file"
      accept=".zip,.printopus,application/zip"
      hidden
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
          const n = await importFile(f);
          setMsg(n === 1 ? t('Ripristinato 1 progetto.') : t('Ripristinati {n} progetti.', { n }));
          onDone?.(n);
        } catch (err) {
          setMsg(t('Non riesco a leggere il file: {error}', { error: t((err as Error).message) }));
        }
      }}
    />
  );
  return { el, open: () => input.current?.click(), msg };
}

export function CloudSettings() {
  const c = useCloud();
  const kinds = cloudKinds();
  const imp = useImport();
  const [exporting, setExporting] = useState(false);

  return (
    <section>
      <h3>{t('Backup dei progetti')}</h3>
      <p className="muted small">{t('I progetti stanno in questo browser: se ne pulisci i dati si perdono. Salvali anche fuori.')}</p>

      {kinds.length > 0 && !c.kind && (
        <div className="cloud-actions">
          {kinds.map((k) => (
            <SeaButton key={k} variant="secondary" onClick={() => void cloud.connect(k)}>
              {t('Salva su {provider}', { provider: CLOUD_NAME[k] })}
            </SeaButton>
          ))}
          <p className="muted small">{t('Facoltativo. I progetti vengono caricati da soli a ogni modifica in una cartella «Printopus» del tuo spazio; l’app vede solo quella cartella. Su un altro dispositivo, o dopo aver pulito il browser, ricollega lo stesso account per ritrovarli.')}</p>
        </div>
      )}

      {c.kind && (
        <div className="spend">
          <div>
            <strong>{t('Collegato a {provider}', { provider: CLOUD_NAME[c.kind] })}</strong>
          </div>
          <div className="muted small" role="status">
            {c.status === 'busy'
              ? t('Sincronizzo…')
              : c.status === 'auth'
                ? t('Il collegamento è scaduto: ricollegalo per continuare a salvare.')
                : c.status === 'error'
                  ? t('Ultimo tentativo non riuscito ({error}): riprovo alla prossima modifica.', { error: c.error ?? '' })
                  : c.pending
                    ? t('Ci sono modifiche da caricare: partono tra pochi secondi.')
                    : c.lastSync
                      ? t('Tutto salvato · ultima sincronizzazione {time}', { time: when(c.lastSync) })
                      : t('Pronto.')}
          </div>
          <div className="cloud-actions">
            {c.status === 'auth' ? (
              <SeaButton onClick={() => void cloud.reconnect()}>{t('Ricollega')}</SeaButton>
            ) : (
              <SeaButton variant="secondary" disabled={c.status === 'busy'} onClick={() => void cloud.refresh()}>{t('Sincronizza ora')}</SeaButton>
            )}
            <button
              className="link small"
              onClick={() => {
                if (confirm(t('Scollegare {provider}? I file già salvati restano lì.', { provider: CLOUD_NAME[c.kind!] }))) cloud.disconnect();
              }}
            >
              {t('Scollega')}
            </button>
          </div>
        </div>
      )}
      {!c.kind && c.error && <p className="muted small" role="alert">{t('Collegamento non riuscito: {error}', { error: c.error })}</p>}

      <div className="cloud-actions">
        <SeaButton
          variant="secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              downloadBlob(await exportAll(), `printopus-backup-${new Date().toISOString().slice(0, 10)}.zip`);
            } finally {
              setExporting(false);
            }
          }}
        >
          {t('Scarica un backup')}
        </SeaButton>
        <SeaButton variant="secondary" onClick={imp.open}>{t('Ripristina da file')}</SeaButton>
        {imp.el}
      </div>
      {imp.msg && <p className="muted small" role="status">{imp.msg}</p>}
    </section>
  );
}

/** Nella home: stato del cloud o invito a salvare i progetti fuori dal browser. */
export function CloudHomeNotice({ onSettings }: { onSettings: () => void }) {
  const c = useCloud();
  if (c.status === 'auth' && c.kind)
    return <SeaNotice onClick={() => void cloud.reconnect()}>{t('Ricollega {provider} per continuare a salvare i progetti →', { provider: CLOUD_NAME[c.kind] })}</SeaNotice>;
  if (c.kind)
    return (
      <p className="muted small cloud-line" role="status">
        ☁ {c.status === 'busy' ? t('Sincronizzo con {provider}…', { provider: CLOUD_NAME[c.kind] }) : t('Salvati anche su {provider}', { provider: CLOUD_NAME[c.kind] })}
      </p>
    );
  return (
    <button className="link small" onClick={onSettings}>
      {cloudKinds().length ? t('Salva i modelli su Dropbox o Google Drive per non perderli') : t('Scarica un backup dei modelli per non perderli')}
    </button>
  );
}

/** Nel benvenuto del wizard: chi ha già usato l'app può ritrovare stampante e progetti. */
export function RestoreChoices() {
  const kinds = cloudKinds();
  const imp = useImport();
  const c = useCloud();
  if (c.kind && c.status === 'busy') return <p className="muted small" role="status">☁ {t('Cerco i tuoi progetti su {provider}…', { provider: CLOUD_NAME[c.kind] })}</p>;
  return (
    <div className="restore">
      <p className="muted small">{t('Hai già usato Printopus? Ritrova stampante e progetti:')}</p>
      <div className="row gap center-row wrap">
        {kinds.map((k) => (
          <button key={k} className="link small" onClick={() => void cloud.connect(k)}>{t('da {provider}', { provider: CLOUD_NAME[k] })}</button>
        ))}
        <button className="link small" onClick={imp.open}>{t('da un file di backup')}</button>
      </div>
      {imp.el}
      {imp.msg && <p className="muted small" role="status">{imp.msg}</p>}
    </div>
  );
}
