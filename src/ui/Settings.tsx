import { useEffect, useState } from 'react';
import { store, useStore, type ProjectUsage } from '../app/store';
import { Budget } from '../agent/budget';
import { MODELS } from '../agent/config';
import { AiModePicker } from './AiModePicker';
import { fmtNum, t } from '../i18n';
import { LanguagePicker } from './LanguagePicker';
import { SeaButton, SeaIconButton, SeaSwitch } from './sea/controls';

function useSpend() {
  const { settings } = useStore();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);
  return { rec: new Budget(localStorage, settings.monthlyCapUsd).current(), cap: settings.monthlyCapUsd };
}

/** Token in forma breve: 850, 12,4k, 1,2M. */
export function fmtTokens(n: number): string {
  if (n < 1000) return fmtNum(n, 0);
  if (n < 1_000_000) return `${fmtNum(n / 1000, n < 10_000 ? 1 : 0, 0)}k`;
  return `${fmtNum(n / 1_000_000, 1, 0)}M`;
}

/** Riepilogo del consumo di un progetto, una riga per modalità usata. */
export function projectUsageText(u: ProjectUsage | undefined): string {
  const lines: string[] = [];
  if (u?.api?.calls) lines.push(t('Chiavi API: {tokens} token, {usd} dollari ({calls} richieste)', { tokens: fmtTokens(u.api.inputTokens + u.api.outputTokens), usd: fmtNum(u.api.usd, 3, 2), calls: u.api.calls }));
  if (u?.manual?.calls) lines.push(t('Copia e incolla: circa {tokens} token ({calls} risposte)', { tokens: fmtTokens(u.manual.inputTokens + u.manual.outputTokens), calls: u.manual.calls }));
  if (u?.connector?.calls) lines.push(t('Connettore: circa {tokens} token ({calls} chiamate)', { tokens: fmtTokens(u.connector.inputTokens + u.connector.outputTokens), calls: u.connector.calls }));
  return lines.length ? lines.join('\n') : t('Nessun consumo di token in questo progetto.');
}

/** Spesa del mese (chiavi API) o token stimati del progetto (copia e incolla, connettore). */
export function BudgetBadge({ usage }: { usage?: ProjectUsage }) {
  const { settings } = useStore();
  const { rec, cap } = useSpend();
  const detail = `${t('Questo progetto:')}\n${projectUsageText(usage)}`;
  if (settings.aiMode !== 'api') {
    const est = settings.aiMode === 'manual' ? usage?.manual : usage?.connector;
    const n = (est?.inputTokens ?? 0) + (est?.outputTokens ?? 0);
    return (
      <span className="budget" title={detail} aria-label={t('Token stimati per questo progetto: {tokens}', { tokens: fmtTokens(n) })}>
        ≈{fmtTokens(n)}
      </span>
    );
  }
  const pct = Math.min(100, (rec.usd / cap) * 100);
  return (
    <span className={`budget ${pct > 80 ? 'hot' : ''}`} title={`${t('Spesa del mese: ${spent} su ${cap}', { spent: rec.usd.toFixed(3), cap })}\n\n${detail}`}>
      ${rec.usd.toFixed(2)}
    </span>
  );
}

export function SettingsDialog({ onClose, onEditSetup }: { onClose: () => void; onEditSetup: () => void }) {
  const { settings } = useStore();
  const { rec } = useSpend();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sea" role="dialog" aria-modal="true" aria-label={t('Impostazioni')} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{t('Impostazioni')}</h2>
          <SeaIconButton shell="dollar" small onClick={onClose} aria-label={t('Chiudi')}>×</SeaIconButton>
        </header>

        <section>
          <h3>{t('Assistente AI')}</h3>
          <AiModePicker />
        </section>

        {(rec.manual?.calls || rec.connector?.calls || settings.aiMode !== 'api') && (
        <section>
          <h3>{t('Token con la tua chat')}</h3>
          <div className="spend">
            {rec.manual?.calls ? (
              <div>{t('Copia e incolla: circa {tokens} token questo mese ({input} letti, {output} scritti, {calls} risposte)', { tokens: fmtTokens(rec.manual.inputTokens + rec.manual.outputTokens), input: fmtTokens(rec.manual.inputTokens), output: fmtTokens(rec.manual.outputTokens), calls: rec.manual.calls })}</div>
            ) : null}
            {rec.connector?.calls ? (
              <div>{t('Connettore: circa {tokens} token questo mese ({input} letti, {output} scritti, {calls} chiamate)', { tokens: fmtTokens(rec.connector.inputTokens + rec.connector.outputTokens), input: fmtTokens(rec.connector.inputTokens), output: fmtTokens(rec.connector.outputTokens), calls: rec.connector.calls })}</div>
            ) : null}
            {!rec.manual?.calls && !rec.connector?.calls && <div>{t('Nessun consumo questo mese.')}</div>}
            <div className="muted small">{t('Sono stime: questi token li consuma la tua chat (abbonamento o piano gratuito), non l’app. Contano il testo che l’app manda e riceve; ogni nuovo messaggio nella stessa conversazione rilegge anche i precedenti, quindi il consumo reale è più alto. Per risparmiare usa una conversazione nuova per ogni progetto.')}</div>
          </div>
        </section>
        )}

        {settings.aiMode === 'api' && (
        <section>
          <h3>{t('Spesa')}</h3>
          <div className="spend">
            <div><strong>${rec.usd.toFixed(3)}</strong> {t('spesi questo mese')}</div>
            <div className="muted small">{t('{calls} chiamate · {searches} ricerche web · {cache}k token letti dalla cache', { calls: rec.calls, searches: rec.searches, cache: (rec.cacheReadTokens / 1000).toFixed(0) })}</div>
          </div>
          <label className="field">
            {t('Tetto mensile (USD)')}
            <input className="text" type="number" min={0.5} step={0.5} value={settings.monthlyCapUsd} onChange={(e) => store.setSettings({ monthlyCapUsd: Math.max(0.5, Number(e.target.value)) })} />
          </label>
          <SeaSwitch checked={settings.economy} onChange={(e) => store.setSettings({ economy: e.target.checked })}>
            {t('Modalità risparmio: usa sempre il modello veloce di ogni provider (es. {model}): più economico, modelli un po’ meno curati', { model: MODELS.fast.label })}
          </SeaSwitch>
          <SeaSwitch checked={settings.smartRouting} onChange={(e) => store.setSettings({ smartRouting: e.target.checked })}>
            {t('Se non è chiaro cosa vuoi, lascia decidere al modello veloce quale assistente usare')}
          </SeaSwitch>
          <SeaSwitch checked={settings.searchFirst} onChange={(e) => store.setSettings({ searchFirst: e.target.checked })}>
            {t('Per un nuovo modello cerca prima online modelli gratuiti')}
          </SeaSwitch>
        </section>
        )}

        <section>
          <h3>{t('Lingua e atmosfera')}</h3>
          <LanguagePicker />
          <SeaSwitch checked={settings.mascotOn} onChange={(e) => store.setSettings({ mascotOn: e.target.checked })}>
            {t('Mostra Takotta e le frasi di incitamento')}
          </SeaSwitch>
          <label className="field">
            {t('Volume della musica')}
            <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} onChange={(e) => store.setSettings({ musicVolume: Number(e.target.value) })} />
          </label>
        </section>

        <section>
          <h3>{t('Attrezzatura')}</h3>
          <SeaButton variant="secondary" onClick={onEditSetup}>{t('Cambia stampante o filamenti')}</SeaButton>
        </section>

        <p className="muted small">
          {t('Tutti i dati restano su questo dispositivo. Il codice è open source (licenza MIT).')}
        </p>
      </div>
    </div>
  );
}
