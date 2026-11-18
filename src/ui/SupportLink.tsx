import { SUPPORT_URL } from '../data/links';
import { t } from '../i18n';

/** Link discreto per sostenere il progetto (niente pubblicità nell'app). */
export function SupportLink() {
  return (
    <a className="support-link" href={SUPPORT_URL} target="_blank" rel="noreferrer">
      <span aria-hidden>☕</span> {t('Ti piace Printopus? Sostieni il progetto su Ko-fi').replace('Ko-fi', 'Ko\u2011fi')}
    </a>
  );
}
