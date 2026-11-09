/**
 * Origine da rimandare in Access-Control-Allow-Origin, o null se non è ammessa.
 * Il browser manda l'origine in minuscolo, mentre la configurazione può contenere maiuscole
 * (es. il nome del proprietario GitHub): il confronto ignora maiuscole e minuscole.
 */
export function matchOrigin(origin: string, allowedList: string | undefined): string | null {
  const allowed = (allowedList ?? '*').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.includes('*')) return origin || '*';
  return origin && allowed.includes(origin.toLowerCase()) ? origin : null;
}
