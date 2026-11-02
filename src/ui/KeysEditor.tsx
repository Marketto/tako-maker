import { useMemo, useState } from 'react';
import { store, uid, useStore } from '../app/store';
import { makeClient } from '../app/session';
import { PROVIDERS, type ProviderId } from '../agent/config';
import { FAIL_LABEL } from '../agent/providers/keyRouter';
import type { KeyEntry } from '../agent/providers/types';
import { t } from '../i18n';

/* Gestione delle chiavi AI: più chiavi per provider, ordinate per priorità.
   Il router prova la prima disponibile e passa alla successiva se finisce
   il credito, va in pausa o non risponde. */

const ORDER: ProviderId[] = ['anthropic', 'openai', 'gemini'];

export function KeysEditor({ compact = false }: { compact?: boolean }) {
  const { keys } = useStore();
  const [, refresh] = useState(0);
  const router = useMemo(() => makeClient(), []);
  const states = router.states();

  const update = (id: string, patch: Partial<KeyEntry>) => store.setKeys(keys.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const move = (i: number, d: -1 | 1) => {
    const next = keys.slice();
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    store.setKeys(next);
  };
  const add = (provider: ProviderId, free = false) => {
    const n = keys.filter((k) => k.provider === provider).length + 1;
    const label = free ? t('Gemini gratuito') : `${PROVIDERS[provider].label.split(' ')[0]}${n > 1 ? ` ${n}` : ''}`;
    store.setKeys([...keys, { id: uid(), provider, label, key: '', enabled: true, free: free || undefined }]);
  };
  const hasFree = keys.some((k) => k.free);

  return (
    <div className="keys">
      {!hasFree && <FreeGeminiGuide onAdd={() => add('gemini', true)} />}
      {keys.length === 0 && <p className="muted small">{t('Nessuna chiave. Aggiungine almeno una: puoi usare Claude, GPT o Gemini, anche più di una.')}</p>}
      <ol className="key-list">
        {keys.map((k, i) => {
          const st = states[k.id];
          const available = router.isAvailable(k, states);
          const status = !k.enabled ? t('disattivata') : !(k.key || k.baseUrl) ? t('da completare') : st?.reason && !available ? t(FAIL_LABEL[st.reason]) : st?.lastOk ? t('funziona') : t('pronta');
          const tone = !k.enabled || !(k.key || k.baseUrl) ? 'off' : st?.reason && !available ? 'bad' : 'good';
          const info = PROVIDERS[k.provider];
          return (
            <li key={k.id} className={`key-item ${tone}`}>
              <div className="key-head">
                <span className="key-prio" aria-label={t('Priorità {n}', { n: i + 1 })}>{i + 1}</span>
                <select value={k.provider} aria-label={t('Provider')} onChange={(e) => update(k.id, { provider: e.target.value as ProviderId })}>
                  {ORDER.map((p) => (
                    <option key={p} value={p}>{PROVIDERS[p].label}</option>
                  ))}
                </select>
                <span className={`key-status ${tone}`}>{status}</span>
                {k.free && <span className="key-status free">{t('gratis')}</span>}
                {st?.reason && !available && (
                  <button className="link small" onClick={() => { router.reset(k.id); refresh((n) => n + 1); }}>{t('Riprova')}</button>
                )}
              </div>
              <div className="key-fields">
                <input className="text" aria-label={t('Nome della chiave')} placeholder={t('Nome (es. Personale)')} value={k.label} onChange={(e) => update(k.id, { label: e.target.value })} />
                <input className="text" type="password" autoComplete="off" aria-label={t('Chiave {provider}', { provider: info.label })} placeholder={info.keyPlaceholder} value={k.key} onChange={(e) => update(k.id, { key: e.target.value })} />
              </div>
              {!compact && k.provider === 'anthropic' && (
                <details>
                  <summary className="small">{t('Usa un proxy al posto della chiave')}</summary>
                  <div className="key-fields">
                    <input className="text" aria-label={t('URL del proxy')} placeholder="https://printopus-proxy.tuonome.workers.dev" value={k.baseUrl ?? ''} onChange={(e) => update(k.id, { baseUrl: e.target.value.trim() || undefined })} />
                    <input className="text" type="password" aria-label={t('Codice di accesso del proxy')} placeholder={t('Codice di accesso')} value={k.accessCode ?? ''} onChange={(e) => update(k.id, { accessCode: e.target.value || undefined })} />
                  </div>
                </details>
              )}
              <div className="key-actions">
                <label className="check small">
                  <input type="checkbox" checked={k.enabled} onChange={(e) => update(k.id, { enabled: e.target.checked })} />
                  {t('Attiva')}
                </label>
                {k.provider === 'gemini' && (
                  <label className="check small">
                    <input type="checkbox" checked={!!k.free} onChange={(e) => update(k.id, { free: e.target.checked || undefined })} />
                    {t('Piano gratuito')}
                  </label>
                )}
                <a className="small" href={info.keyUrl} target="_blank" rel="noreferrer">{t('Crea una chiave')}</a>
                <span className="spacer" />
                <button className="icon-btn" aria-label={t('Sposta su (più priorità)')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" aria-label={t('Sposta giù (meno priorità)')} disabled={i === keys.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon-btn" aria-label={t('Elimina {name}', { name: k.label })} onClick={() => store.setKeys(keys.filter((x) => x.id !== k.id))}>🗑</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="row gap wrap">
        {ORDER.map((p) => (
          <button key={p} className="btn small" onClick={() => add(p)}>+ {PROVIDERS[p].label}</button>
        ))}
      </div>
      {!compact && keys.length > 1 && (
        <p className="muted small">{t('L’app usa la prima chiave disponibile; se finisce il credito, è in pausa o non risponde passa automaticamente alla successiva.')}</p>
      )}
    </div>
  );
}

/** Guida per ottenere una chiave Gemini gratuita da Google AI Studio. */
export function FreeGeminiGuide({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="free-guide">
      <strong>{t('Gratis con Gemini')}</strong>
      <ol>
        <li>
          {t('Apri Google AI Studio e accedi con il tuo account Google:')}{' '}
          <a href={PROVIDERS.gemini.keyUrl} target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>
        </li>
        <li>{t('Premi “Create API key” (crea chiave API) e copiala.')}</li>
        <li>{t('Torna qui, premi il pulsante qui sotto e incolla la chiave.')}</li>
      </ol>
      <p className="muted small">
        {t('Il piano gratuito ha un limite di richieste al giorno: se lo superi, l’app aspetta o passa a un’altra chiave. Google può usare i testi inviati per migliorare i suoi prodotti: non scrivere dati personali.')}
      </p>
      <button className="btn small primary" onClick={onAdd}>{t('Aggiungi la chiave gratuita')}</button>
    </div>
  );
}
