/* Traduzioni.
   - La frase italiana È la chiave: t('Nuovo modello'). Nessun identificatore da inventare.
   - msg('…') marca una frase da tradurre più tardi (costanti, etichette): restituisce il testo così com'è.
   - npm run i18n:extract raccoglie tutte le frasi in src/i18n/source.json.
   - Ogni lingua è un JSON { "frase italiana": "traduzione" } in src/i18n/locales/, caricato solo se serve.
   - Ripiego: lingua scelta → inglese → italiano.
   - Segnaposti: {nome} vengono sostituiti con i valori passati. */

export interface LocaleInfo {
  code: string;
  /** Nome nella lingua stessa. */
  name: string;
  /** Nome in inglese, per l'assistente AI. */
  english: string;
  dir?: 'rtl';
}

export const LOCALES: LocaleInfo[] = [
  { code: 'it', name: 'Italiano', english: 'Italian' },
  { code: 'en', name: 'English', english: 'English' },
  { code: 'bg', name: 'Български', english: 'Bulgarian' },
  { code: 'bs', name: 'Bosanski', english: 'Bosnian' },
  { code: 'ca', name: 'Català', english: 'Catalan' },
  { code: 'cs', name: 'Čeština', english: 'Czech' },
  { code: 'cy', name: 'Cymraeg', english: 'Welsh' },
  { code: 'da', name: 'Dansk', english: 'Danish' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'el', name: 'Ελληνικά', english: 'Greek' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'et', name: 'Eesti', english: 'Estonian' },
  { code: 'eu', name: 'Euskara', english: 'Basque' },
  { code: 'fi', name: 'Suomi', english: 'Finnish' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'ga', name: 'Gaeilge', english: 'Irish' },
  { code: 'gl', name: 'Galego', english: 'Galician' },
  { code: 'hr', name: 'Hrvatski', english: 'Croatian' },
  { code: 'hu', name: 'Magyar', english: 'Hungarian' },
  { code: 'is', name: 'Íslenska', english: 'Icelandic' },
  { code: 'lb', name: 'Lëtzebuergesch', english: 'Luxembourgish' },
  { code: 'lt', name: 'Lietuvių', english: 'Lithuanian' },
  { code: 'lv', name: 'Latviešu', english: 'Latvian' },
  { code: 'mk', name: 'Македонски', english: 'Macedonian' },
  { code: 'mt', name: 'Malti', english: 'Maltese' },
  { code: 'nb', name: 'Norsk bokmål', english: 'Norwegian Bokmål' },
  { code: 'nl', name: 'Nederlands', english: 'Dutch' },
  { code: 'pl', name: 'Polski', english: 'Polish' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'ro', name: 'Română', english: 'Romanian' },
  { code: 'sk', name: 'Slovenčina', english: 'Slovak' },
  { code: 'sl', name: 'Slovenščina', english: 'Slovenian' },
  { code: 'sq', name: 'Shqip', english: 'Albanian' },
  { code: 'sr', name: 'Српски', english: 'Serbian' },
  { code: 'sv', name: 'Svenska', english: 'Swedish' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'uk', name: 'Українська', english: 'Ukrainian' },
  { code: 'ru', name: 'Русский', english: 'Russian' },
  { code: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'zh', name: '中文（简体）', english: 'Simplified Chinese' },
  { code: 'ja', name: '日本語', english: 'Japanese' },
  { code: 'ko', name: '한국어', english: 'Korean' },
];

type Dict = Record<string, string>;

const loaders = import.meta.glob<{ default: Dict }>('./locales/*.json');

let current = 'it';
let dict: Dict = {};
let fallback: Dict = {};
const listeners = new Set<() => void>();

export const locale = () => current;
export const localeInfo = (code = current) => LOCALES.find((l) => l.code === code) ?? LOCALES[0];

/** Marca una frase da tradurre (per costanti e testi usati più avanti). */
export const msg = (s: string): string => s;

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Traduce la frase italiana nella lingua corrente. */
export function t(s: string, vars?: Record<string, string | number>): string {
  if (current === 'it') return fill(s, vars);
  return fill(dict[s] || fallback[s] || s, vars);
}

async function load(code: string): Promise<Dict> {
  const l = loaders[`./locales/${code}.json`];
  return l ? (await l()).default : {};
}

export async function setLocale(code: string): Promise<void> {
  const info = localeInfo(code);
  const [d, en] = await Promise.all([info.code === 'it' ? {} : load(info.code), info.code === 'it' || info.code === 'en' ? {} : load('en')]);
  dict = d;
  fallback = en;
  current = info.code;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = info.code;
    document.documentElement.dir = info.dir ?? 'ltr';
  }
  listeners.forEach((l) => l());
}

export function onLocaleChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Lingua preferita del dispositivo tra quelle disponibili (italiano se nessuna). */
export function detectLocale(langs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): string {
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    const norm = base === 'no' || base === 'nn' ? 'nb' : base === 'hr' || base === 'sr' || base === 'bs' ? base : base;
    if (LOCALES.some((x) => x.code === norm)) return norm;
  }
  return 'it';
}

/** Numero con il separatore decimale della lingua corrente. */
export function fmtNum(n: number, digits = 1, minDigits = digits): string {
  return new Intl.NumberFormat(current, { minimumFractionDigits: minDigits, maximumFractionDigits: digits }).format(n);
}
