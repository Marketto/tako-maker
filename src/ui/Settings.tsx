import { useEffect, useState } from 'react';
import { store, useStore } from '../app/store';
import { Budget } from '../agent/budget';
import { MODELS } from '../agent/config';

function useSpend() {
  const { settings } = useStore();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);
  return { rec: new Budget(localStorage, settings.monthlyCapUsd).current(), cap: settings.monthlyCapUsd };
}

export function BudgetBadge() {
  const { rec, cap } = useSpend();
  const pct = Math.min(100, (rec.usd / cap) * 100);
  return (
    <span className={`budget ${pct > 80 ? 'hot' : ''}`} title={`Spesa del mese: $${rec.usd.toFixed(3)} su $${cap}`}>
      ${rec.usd.toFixed(2)}
    </span>
  );
}

export function SettingsDialog({ onClose, onEditSetup }: { onClose: () => void; onEditSetup: () => void }) {
  const { settings, apiKey } = useStore();
  const [key, setKey] = useState(apiKey);
  const { rec } = useSpend();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Impostazioni" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>Impostazioni</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">×</button>
        </header>

        <section>
          <h3>Accesso a Claude</h3>
          <label className="field">
            Chiave API personale
            <input className="text" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => store.setApiKey(key)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.rememberKey} onChange={(e) => store.setSettings({ rememberKey: e.target.checked })} />
            Ricorda su questo dispositivo (altrimenti solo fino alla chiusura della scheda)
          </label>
          <details>
            <summary>Usa un proxy al posto della chiave</summary>
            <p className="muted small">Se hai pubblicato il proxy opzionale (cartella <code>proxy/</code>), la chiave resta sul server e qui serve solo l’indirizzo.</p>
            <label className="field">
              URL del proxy
              <input className="text" placeholder="https://printopus-proxy.tuonome.workers.dev" value={settings.proxyUrl} onChange={(e) => store.setSettings({ proxyUrl: e.target.value.trim() })} />
            </label>
            <label className="field">
              Codice di accesso
              <input className="text" type="password" value={settings.accessCode} onChange={(e) => store.setSettings({ accessCode: e.target.value })} />
            </label>
          </details>
        </section>

        <section>
          <h3>Spesa</h3>
          <div className="spend">
            <div><strong>${rec.usd.toFixed(3)}</strong> spesi questo mese</div>
            <div className="muted small">{rec.calls} chiamate · {rec.searches} ricerche web · {(rec.cacheReadTokens / 1000).toFixed(0)}k token letti dalla cache</div>
          </div>
          <label className="field">
            Tetto mensile (USD)
            <input className="text" type="number" min={0.5} step={0.5} value={settings.monthlyCapUsd} onChange={(e) => store.setSettings({ monthlyCapUsd: Math.max(0.5, Number(e.target.value)) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.economy} onChange={(e) => store.setSettings({ economy: e.target.checked })} />
            Modalità risparmio: usa sempre {MODELS.fast.label} (più economico, modelli un po’ meno curati)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.smartRouting} onChange={(e) => store.setSettings({ smartRouting: e.target.checked })} />
            Se non è chiaro cosa vuoi, lascia decidere a {MODELS.fast.label} quale assistente usare
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.searchFirst} onChange={(e) => store.setSettings({ searchFirst: e.target.checked })} />
            Per un nuovo modello cerca prima online modelli gratuiti
          </label>
        </section>

        <section>
          <h3>Atmosfera</h3>
          <label className="check">
            <input type="checkbox" checked={settings.mascotOn} onChange={(e) => store.setSettings({ mascotOn: e.target.checked })} />
            Mostra Takotta e le frasi di incitamento
          </label>
          <label className="field">
            Volume della musica
            <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} onChange={(e) => store.setSettings({ musicVolume: Number(e.target.value) })} />
          </label>
        </section>

        <section>
          <h3>Attrezzatura</h3>
          <button className="btn" onClick={onEditSetup}>Cambia stampante o filamenti</button>
        </section>

        <p className="muted small">
          Tutti i dati restano su questo dispositivo. Il codice è open source (licenza MIT).
        </p>
      </div>
    </div>
  );
}
