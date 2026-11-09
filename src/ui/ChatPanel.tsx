import { useEffect, useRef, useState } from 'react';
import type { ProjectSession, Snapshot } from '../app/session';
import { LICENSE_NO_DERIVATIVES } from '../app/session';
import type { Question } from '../core/types';
import type { SearchResult } from '../agent/tools';
import { t } from '../i18n';
import { CHAT_LINKS } from '../agent/manual';
import { useStore } from '../app/store';
import { SeaChoice, SeaError, SeaGlass } from './sea/controls';
import { GLOW } from './sea/shapes';
import { connectorBase, mcpUrl } from '../app/connector';

export function ChatPanel({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const empty = snap.project.design.parts.length === 0;
  const { settings } = useStore();
  useEffect(() => {
    void endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [snap.project.chat.length, snap.busy, snap.questions.length]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    void session.send(t);
  };

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {snap.project.chat.length === 0 && !empty && (
          <div className="chat-empty">
            <p><strong>{t('Come vuoi migliorarlo?')}</strong></p>
            <p className="muted">{t('Ad esempio: “rendi lo schermo più grande” o “quanto tempo ci vuole a stamparlo?”. Ruota l’anteprima con un dito, zoom con due.')}</p>
          </div>
        )}
        {snap.project.chat.length === 0 && empty && (
          <div className="chat-empty">
            <p><strong>{t('Cosa vuoi stampare?')}</strong></p>
            <p className="muted">{t('Ad esempio: “un portatile giocattolo per una bambina di 4 anni”. Cerco prima modelli gratuiti con licenza libera; se preferisci, lo creo da zero.')}</p>
          </div>
        )}
        {snap.project.chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.text && <div className="bubble">{m.text}</div>}
            {m.results && <Results session={session} results={m.results} />}
            {m.role === 'assistant' && m.costUsd !== undefined && m.costUsd > 0 && <div className="cost">${m.costUsd.toFixed(4)}</div>}
          </div>
        ))}
        {snap.questions.map((q) => (
          <QuestionCard key={q.id} q={q} onAnswer={(ids) => session.answer(q, ids)} disabled={!!snap.busy} />
        ))}
        {snap.busy && (
          <div className="msg assistant">
            <div className="bubble busy">
              <span className="spinner" /> {snap.busy}
              <button className="link" onClick={() => session.stop()}>{t('Ferma')}</button>
            </div>
          </div>
        )}
        {snap.manual && <ManualCard session={session} snap={snap} />}
        {snap.error && <SeaError>{snap.error}</SeaError>}
        <div ref={endRef} />
      </div>

      {settings.aiMode === 'connector' ? (
        <ConnectorPanel session={session} snap={snap} />
      ) : (
      <form className="composer" onSubmit={submit}>
        <textarea
          rows={1}
          value={text}
          placeholder={empty ? t('Descrivi l’oggetto…') : t('Chiedi una modifica…')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
          aria-label={t('Messaggio')}
        />
        <button className="btn primary" type="submit" disabled={!text.trim() || !!snap.busy}>{t('Invia')}</button>
      </form>
      )}
      {settings.aiMode !== 'connector' && empty && text.trim() && (
        <button className="link small center" disabled={!!snap.busy} onClick={() => { const txt = text; setText(''); void session.send(txt, 'crea-modello'); }}>
          {t('Salta la ricerca e crealo da zero')}
        </button>
      )}
    </div>
  );
}

function QuestionCard({ q, onAnswer, disabled }: { q: Question; onAnswer: (ids: string[]) => void; disabled: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <div className="question" role="group" aria-label={q.text}>
      <div className="q-text">{q.text}</div>
      {q.detail && <div className="muted small">{q.detail}</div>}
      <div className="q-options">
        {q.options.map((o) =>
          q.multi ? (
            <SeaGlass key={o.id} className="opt" color={GLOW} on={sel.includes(o.id)} title={o.hint} onClick={() => setSel(sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id])}>
              {o.label}
            </SeaGlass>
          ) : (
            <SeaChoice key={o.id} className="row opt" disabled={disabled} onClick={() => onAnswer([o.id])} title={o.hint}>
              <strong>{o.label}</strong>
              {o.hint && <span className="hint muted small">{o.hint}</span>}
            </SeaChoice>
          ),
        )}
      </div>
      {q.multi && (
        <div className="row gap">
          <button className="btn primary small" disabled={disabled} onClick={() => onAnswer(sel)}>{sel.length ? t('Conferma') : t('Nessuna')}</button>
          <button className="btn small" disabled={disabled} onClick={() => onAnswer(q.options.map((o) => o.id))}>{t('Tutte')}</button>
        </div>
      )}
    </div>
  );
}

function Results({ session, results }: { session: ProjectSession; results: SearchResult[] }) {
  return (
    <div className="results">
      {results.map((r) => (
        <ResultCard key={r.url} session={session} r={r} />
      ))}
    </div>
  );
}

function ResultCard({ session, r }: { session: ProjectSession; r: SearchResult }) {
  const [importing, setImporting] = useState(false);
  const [ok, setOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const noDeriv = LICENSE_NO_DERIVATIVES.test(r.license);
  const unknown = /verific|\?/i.test(r.license);
  return (
    <article className="result">
      <div className="result-head">
        <strong>{r.title}</strong>
        <span className={`license ${noDeriv ? 'bad' : unknown ? 'warn' : 'good'}`}>{r.license === '?' ? t('da verificare') : r.license}</span>
      </div>
      <div className="muted small">{r.site}{r.author ? ` · ${r.author}` : ''}{r.printInPlace ? ` · ${t('stampa già montata')}` : ''}</div>
      <p>{r.summary}</p>
      <div className="row gap wrap">
        <a className="btn small" href={r.url} target="_blank" rel="noreferrer">{t('Apri pagina')}</a>
        <button className="btn small primary" onClick={() => session.useAsInspiration(r)}>{t('Crealo ispirandoti a questo')}</button>
        {!noDeriv && <button className="btn small" onClick={() => setImporting(!importing)}>{t('Ho scaricato il file')}</button>}
      </div>
      {importing && (
        <div className="import-box">
          <label className="check">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            {t('Ho verificato sulla pagina che la licenza permette di modificarlo per uso personale.')}
          </label>
          <input ref={fileRef} type="file" accept=".stl,.3mf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void session.importFile(f, r); }} />
          <button className="btn small primary" disabled={!ok} onClick={() => fileRef.current?.click()}>{t('Scegli file STL o 3MF')}</button>
        </div>
      )}
    </article>
  );
}

/** Modalità copia e incolla: richiesta da copiare nella chat e risposta da incollare. */
function ManualCard({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const m = snap.manual!;
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.prompt);
      setCopied(true);
    } catch {
      const el = document.getElementById('manual-prompt') as HTMLTextAreaElement | null;
      el?.select();
    }
  };
  const share = async () => {
    try {
      await navigator.share({ text: m.prompt });
    } catch {
      /* annullato */
    }
  };
  return (
    <div className="manual">
      <p className="q-text">{m.correction ? t('Serve una correzione') : t('Copia e incolla con la tua chat')}</p>
      <ol className="manual-steps">
        <li>
          <span>{m.correction ? t('Copia la richiesta di correzione e incollala nella stessa chat.') : t('Copia la richiesta e incollala in una chat (anche gratuita).')}</span>
          <div className="row gap wrap">
            <button className="btn small primary" onClick={() => void copy()}>{copied ? t('Copiata ✓') : t('Copia la richiesta')}</button>
            {'share' in navigator && <button className="btn small" onClick={() => void share()}>{t('Condividi')}</button>}
            {!m.correction &&
              CHAT_LINKS.map((c) => (
                <a key={c.name} className="btn small ghost" href={c.url} target="_blank" rel="noreferrer">{c.name} ↗</a>
              ))}
          </div>
          <details>
            <summary className="small">{t('Mostra la richiesta ({n} caratteri)', { n: m.prompt.length })}</summary>
            <textarea id="manual-prompt" className="text manual-prompt" readOnly value={m.prompt} rows={6} aria-label={t('Richiesta da copiare')} />
          </details>
        </li>
        <li>
          <span>{t('Incolla qui tutta la risposta della chat:')}</span>
          <textarea className="text" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Incolla la risposta…')} aria-label={t('Risposta della chat')} />
          <div className="row gap">
            <button className="btn small primary" disabled={!reply.trim() || !!snap.busy} onClick={() => { void session.applyManual(reply); setReply(''); setCopied(false); }}>{t('Applica la risposta')}</button>
            <button className="btn small ghost" onClick={() => session.cancelManual()}>{t('Annulla')}</button>
          </div>
        </li>
      </ol>
    </div>
  );
}

/** Connettore: la conversazione avviene nella chat (es. Claude), qui si vede il risultato. */
function ConnectorPanel({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const c = snap.project.connector;
  const [copied, setCopied] = useState('');
  const [help, setHelp] = useState(false);
  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      /* il testo resta visibile da copiare a mano */
    }
  };
  if (!connectorBase()) {
    return (
      <div className="connector">
        <p>{t('Il connettore per la chat non è configurato in questa versione dell’app.')}</p>
        <p className="muted small">{t('Chi pubblica l’app può attivarlo (vedi docs/CONNETTORE.md), oppure puoi indicare l’indirizzo di un connettore nelle impostazioni.')}</p>
      </div>
    );
  }
  if (!c) {
    return (
      <div className="connector">
        <p>{t('Con il connettore l’assistente è la tua chat (es. Claude, anche con l’account gratuito): niente chiavi API a consumo. Qui vedi l’anteprima e le domande dell’app.')}</p>
        <button className="btn primary" disabled={!!snap.busy} onClick={() => void session.connect()}>{t('Collega alla chat')}</button>
      </div>
    );
  }
  const starter = t('Usa Printopus con il codice {code}.', { code: c.code });
  // Dopo il primo messaggio della chat le istruzioni si chiudono: resta una riga con il codice.
  if (c.linked && !help) {
    return (
      <div className="connector compact">
        <span className="connector-dot" aria-hidden="true" />
        <span className="small">{t('Collegato alla chat con il codice {code}', { code: c.code })}</span>
        <button className="link small" onClick={() => setHelp(true)}>{t('Mostra istruzioni')}</button>
        <button className="link small" onClick={() => void session.disconnect()}>{t('Scollega')}</button>
      </div>
    );
  }
  return (
    <div className="connector">
      <div className="connector-code">
        <span className="muted small">{t('Codice di abbinamento')}</span>
        <strong>{c.code}</strong>
      </div>
      <ol className="manual-steps">
        <li>
          <span>{t('Solo la prima volta: in Claude apri Impostazioni → Connettori → «Aggiungi connettore personalizzato» e incolla questo indirizzo:')}</span>
          <div className="row gap wrap">
            <code className="connector-url">{mcpUrl()}</code>
            <button className="btn small" onClick={() => void copy('url', mcpUrl())}>{copied === 'url' ? t('Copiato ✓') : t('Copia')}</button>
          </div>
        </li>
        <li>
          <span>{t('Apri una chat, attiva il connettore Printopus e scrivi cosa vuoi stampare, insieme a questa frase:')}</span>
          <div className="row gap wrap">
            <code className="connector-url">{starter}</code>
            <button className="btn small primary" onClick={() => void copy('start', starter)}>{copied === 'start' ? t('Copiato ✓') : t('Copia')}</button>
            <a className="btn small ghost" href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude ↗</a>
          </div>
        </li>
        <li>
          <span>{t('Le modifiche compaiono qui da sole, con le domande dell’app: puoi rispondere qui o in chat.')}</span>
        </li>
      </ol>
      <div className="row gap wrap">
        {c.linked && <button className="link small" onClick={() => setHelp(false)}>{t('Nascondi istruzioni')}</button>}
        <button className="link small" onClick={() => void session.disconnect()}>{t('Scollega')}</button>
      </div>
    </div>
  );
}
