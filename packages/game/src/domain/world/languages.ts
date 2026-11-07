// Jazyková skupina hráče a rodu (newcomers.md – Jazyková skupina): zatím jen příznak, podle kterého
// se řadí nabídka pánů a umisťuje svobodný nováček; rozhraní zůstává česky.

/** Jazyková skupina: čeština, angličtina, němčina, polština, italština, francouzština, španělština. */
export type LanguageGroup = 'cs' | 'en' | 'de' | 'pl' | 'it' | 'fr' | 'es';

/** Všechny jazyky v pořadí nabídky při registraci; první je výchozí. */
export const LANGUAGE_GROUPS: readonly LanguageGroup[] = ['cs', 'en', 'de', 'pl', 'it', 'fr', 'es'];

/** Jazyk, který dostanou dosavadní účty a výchozí volba. */
export const DEFAULT_LANGUAGE: LanguageGroup = 'cs';

export function isLanguageGroup(value: unknown): value is LanguageGroup {
  return typeof value === 'string' && (LANGUAGE_GROUPS as readonly string[]).includes(value);
}
