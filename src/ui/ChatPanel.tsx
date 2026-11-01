import { useEffect, useRef, useState } from 'react';
import type { ProjectSession, Snapshot } from '../app/session';
import { LICENSE_NO_DERIVATIVES } from '../app/session';
import type { Question } from '../core/types';
import type { SearchResult } from '../agent/tools';
import { t } from '../i18n';

export function ChatPanel({ session, snap }: { session: ProjectSession; snap: Snapshot }) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const empty = snap.project.design.parts.length === 0;
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
        {snap.error && <div className="error" role="alert">{snap.error}</div>}
        <div ref={endRef} />
      </div>

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
      {empty && text.trim() && (
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
            <label key={o.id} className={`opt ${sel.includes(o.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(o.id)} onChange={() => setSel(sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id])} />
              {o.label}
            </label>
          ) : (
            <button key={o.id} className="opt" disabled={disabled} onClick={() => onAnswer([o.id])} title={o.hint}>
              {o.label}
              {o.hint && <span className="hint">{o.hint}</span>}
            </button>
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
