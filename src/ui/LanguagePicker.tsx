import { store } from '../app/store';
import { LOCALES, locale, setLocale, t } from '../i18n';

/** Scelta della lingua: salvata nelle impostazioni, applicata subito. */
export function LanguagePicker() {
  return (
    <label className="lang-picker">
      <span aria-hidden="true">🌐</span>
      <span className="sr-only">{t('Lingua')}</span>
      <select
        value={locale()}
        aria-label={t('Lingua')}
        onChange={async (e) => {
          store.setSettings({ language: e.target.value });
          await setLocale(e.target.value);
        }}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code} dir={l.dir ?? 'ltr'}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
