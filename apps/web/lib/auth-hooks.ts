/**
 * Změna účtu přes Better Auth (`/api/auth/update-user`) jazyk nemění – jazykovou skupinu volí jen
 * registrace a `chooseLanguage` (newcomers.md – Jazyk). Better Auth výsledek hooku `update.before`
 * jen přimíchá k původním datům (`{ ...data, ...result.data }`), vynechané pole by tedy zůstalo –
 * `language` se proto smaže přímo z dat změny (hook dostává týž objekt, který se pak zapíše).
 */
export function dropLanguage<T extends Record<string, unknown>>(data: T): Omit<T, 'language'> {
  delete data.language;
  return data;
}
