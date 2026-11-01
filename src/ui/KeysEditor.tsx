import { useMemo, useState } from 'react';
import { store, uid, useStore } from '../app/store';
import { makeClient } from '../app/session';
import { PROVIDERS, type ProviderId } from '../agent/config';
import { FAIL_LABEL } from '../agent/providers/keyRouter';
import type { KeyEntry } from '../agent/providers/types';

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
  const add = (provider: ProviderId) => {
    const n = keys.filter((k) => k.provider === provider).length + 1;
    store.setKeys([...keys, { id: uid(), provider, label: `${PROVIDERS[provider].label.split(' ')[0]}${n > 1 ? ` ${n}` : ''}`, key: '', enabled: true }]);
  };

  return (
    <div className="keys">
      {keys.length === 0 && <p className="muted small">Nessuna chiave. Aggiungine almeno una: puoi usare Claude, GPT o Gemini, anche più di una.</p>}
      <ol className="key-list">
        {keys.map((k, i) => {
          const st = states[k.id];
          const available = router.isAvailable(k, states);
          const status = !k.enabled ? 'disattivata' : !(k.key || k.baseUrl) ? 'da completare' : st?.reason && !available ? FAIL_LABEL[st.reason] : st?.lastOk ? 'funziona' : 'pronta';
          const tone = !k.enabled || !(k.key || k.baseUrl) ? 'off' : st?.reason && !available ? 'bad' : 'good';
          const info = PROVIDERS[k.provider];
          return (
            <li key={k.id} className={`key-item ${tone}`}>
              <div className="key-head">
                <span className="key-prio" aria-label={`Priorità ${i + 1}`}>{i + 1}</span>
                <select value={k.provider} aria-label="Provider" onChange={(e) => update(k.id, { provider: e.target.value as ProviderId })}>
                  {ORDER.map((p) => (
                    <option key={p} value={p}>{PROVIDERS[p].label}</option>
                  ))}
                </select>
                <span className={`key-status ${tone}`}>{status}</span>
                {st?.reason && !available && (
                  <button className="link small" onClick={() => { router.reset(k.id); refresh((n) => n + 1); }}>Riprova</button>
                )}
              </div>
              <div className="key-fields">
                <input className="text" aria-label="Nome della chiave" placeholder="Nome (es. Personale)" value={k.label} onChange={(e) => update(k.id, { label: e.target.value })} />
                <input className="text" type="password" autoComplete="off" aria-label={`Chiave ${info.label}`} placeholder={info.keyPlaceholder} value={k.key} onChange={(e) => update(k.id, { key: e.target.value })} />
              </div>
              {!compact && k.provider === 'anthropic' && (
                <details>
                  <summary className="small">Usa un proxy al posto della chiave</summary>
                  <div className="key-fields">
                    <input className="text" aria-label="URL del proxy" placeholder="https://printopus-proxy.tuonome.workers.dev" value={k.baseUrl ?? ''} onChange={(e) => update(k.id, { baseUrl: e.target.value.trim() || undefined })} />
                    <input className="text" type="password" aria-label="Codice di accesso del proxy" placeholder="Codice di accesso" value={k.accessCode ?? ''} onChange={(e) => update(k.id, { accessCode: e.target.value || undefined })} />
                  </div>
                </details>
              )}
              <div className="key-actions">
                <label className="check small">
                  <input type="checkbox" checked={k.enabled} onChange={(e) => update(k.id, { enabled: e.target.checked })} />
                  Attiva
                </label>
                <a className="small" href={info.keyUrl} target="_blank" rel="noreferrer">Crea una chiave</a>
                <span className="spacer" />
                <button className="icon-btn" aria-label="Sposta su (più priorità)" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" aria-label="Sposta giù (meno priorità)" disabled={i === keys.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon-btn" aria-label={`Elimina ${k.label}`} onClick={() => store.setKeys(keys.filter((x) => x.id !== k.id))}>🗑</button>
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
        <p className="muted small">L’app usa la prima chiave disponibile; se finisce il credito, è in pausa o non risponde passa automaticamente alla successiva.</p>
      )}
    </div>
  );
}
