/**
 * Změna účtu přes Better Auth (`/api/auth/update-user`) jazyk nemění – jazykovou skupinu volí jen
 * registrace a `chooseLanguage` (newcomers.md – Jazyk); pole `language` se ze změny zahodí.
 */
export function withoutLanguage<T extends Record<string, unknown>>(data: T): Omit<T, 'language'> {
  const rest: Record<string, unknown> = { ...data };
  delete rest.language;
  return rest as Omit<T, 'language'>;
}
