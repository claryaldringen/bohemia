// Čísla zboží vsi (hides-honey.md – Včelí klády; návrh Clauda, schváleno Martinem 14. 11. 2026).

/**
 * hides-honey.md – Včelí klády: klát dá za rok ≈ 6 kg medu a ≈ 0,4 kg vosku, přibývá od května do
 * září (měsíce `fromMonth`–`toMonth` včetně, `seasonDays` = 31 + 30 + 31 + 31 + 30 dní).
 */
export const HIVES = {
  honeyKgPerYear: 6,
  waxKgPerYear: 0.4,
  fromMonth: 5,
  toMonth: 9,
  seasonDays: 153,
} as const;
