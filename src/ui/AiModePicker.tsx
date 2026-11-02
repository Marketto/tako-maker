import { store, useStore, type AiMode } from '../app/store';
import { connectorBase, mcpUrl } from '../app/connector';
import { KeysEditor } from './KeysEditor';
import { msg, t } from '../i18n';

/* Scelta di come lavora l'assistente: chiavi API (gratis con Gemini o a pagamento),
   copia e incolla con una chat qualsiasi, connettore MCP per Claude. */

const MODES: { id: AiMode; title: string; text: string; badge: string }[] = [
  { id: 'api', title: msg('Chiave AI'), text: msg('Tutto automatico nell’app. Gratis con una chiave Gemini (con un limite al giorno) o a pagamento con Claude, GPT o Gemini.'), badge: msg('gratis o a consumo') },
  { id: 'manual', title: msg('Copia e incolla'), text: msg('Con la chat che usi già (ChatGPT, Claude, Gemini…), anche gratuita: copi la richiesta preparata dall’app e incolli qui la risposta.'), badge: msg('gratis') },
  { id: 'connector', title: msg('Connettore per Claude'), text: msg('Parli con Claude (anche con l’account gratuito) e l’app riceve le modifiche: qui vedi anteprima e domande.'), badge: msg('con il tuo account') },
];

export function AiModePicker({ compact = false }: { compact?: boolean }) {
  const { settings } = useStore();
  const mode = settings.aiMode;
  return (
    <div className="ai-modes">
      <div className="choice-list ai-mode-list" role="radiogroup" aria-label={t('Come vuoi usare l’assistente?')}>
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className={`choice row ${mode === m.id ? 'selected' : ''}`} onClick={() => store.setSettings({ aiMode: m.id })}>
            <span className="ai-mode-head">
              {t(m.title)} <span className="badge">{t(m.badge)}</span>
            </span>
            <span className="muted">{t(m.text)}</span>
          </button>
        ))}
      </div>

      {mode === 'api' && (
        <>
          <KeysEditor compact={compact} />
          {!compact && (
            <label className="check">
              <input type="checkbox" checked={settings.rememberKey} onChange={(e) => store.setSettings({ rememberKey: e.target.checked })} />
              {t('Ricorda le chiavi su questo dispositivo (altrimenti solo fino alla chiusura della scheda)')}
            </label>
          )}
          <p className="tip">{t('Consiglio: nella console di ogni provider imposta un limite di spesa sulla chiave.')}</p>
        </>
      )}

      {mode === 'manual' && (
        <p className="tip">{t('Quando chiedi qualcosa, l’app prepara il testo da copiare: incollalo nella chat, poi incolla qui tutta la risposta. L’app controlla le modifiche prima di applicarle.')}</p>
      )}

      {mode === 'connector' && (
        <>
          <p className="tip">
            {connectorBase()
              ? t('In un progetto premi «Collega alla chat»: l’app ti mostra l’indirizzo da aggiungere in Claude (una volta sola) e il codice da scrivere in chat.')
              : t('Il connettore per la chat non è configurato in questa versione dell’app.')}
          </p>
          {!compact && (
            <details>
              <summary className="small">{t('Indirizzo del connettore (avanzato)')}</summary>
              <label className="field">
                {t('Indirizzo del tuo connettore Printopus (Cloudflare Worker)')}
                <input className="text" placeholder="https://printopus-connettore.tuonome.workers.dev" value={settings.connectorUrl ?? ''} onChange={(e) => store.setSettings({ connectorUrl: e.target.value.trim() || undefined })} />
              </label>
              {mcpUrl() && <p className="muted small">{t('Indirizzo MCP da aggiungere in Claude: {url}', { url: mcpUrl() })}</p>}
            </details>
          )}
        </>
      )}
    </div>
  );
}
