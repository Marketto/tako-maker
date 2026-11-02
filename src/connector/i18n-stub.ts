/* Versione minima di src/i18n per il Worker del connettore: i testi dell'analisi
   restano in italiano (li legge l'assistente, che risponde nella lingua dell'utente).
   Così il Worker non include le 41 traduzioni. */

export interface LocaleInfo {
  code: string;
  name: string;
  english: string;
  dir?: 'rtl';
}

export const LOCALES: LocaleInfo[] = [{ code: 'it', name: 'Italiano', english: 'Italian' }];
export const locale = () => 'it';
export const localeInfo = (_code?: string): LocaleInfo => LOCALES[0];
export const msg = (s: string): string => s;
export function t(s: string, vars?: Record<string, string | number>): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
export async function setLocale(_code: string): Promise<void> {}
export function onLocaleChange(_l: () => void): () => void {
  return () => undefined;
}
export const detectLocale = (): string => 'it';
export function fmtNum(n: number, digits = 1, minDigits = digits): string {
  return new Intl.NumberFormat('it', { minimumFractionDigits: minDigits, maximumFractionDigits: digits }).format(n);
}
