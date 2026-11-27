// Čísla zlata (plán 6, issue #13; rešerše docs/design/research/2026-11-26-gold.md, pravidla v
// gold.md – Pravidla N, Rozhodnutí plánu 6 – návrh Clauda, oddíl dopíše Úloha 14). Zlato je zboží
// (`TRADE_GOOD_VALUES.gold`), stav nese gramy (`VillageState.gold`).

/** Mince a zlato (gold.md – Pravidla 2; rešerše – ražba): mince váží gram, „1:1 váhově“. */
export const GOLD = { coinGrams: 1 } as const;

/**
 * Rýžování zlata (gold.md – Pravidla 1; rešerše – rýžování): měsíce, kdy teče voda bez ledu
 * (duben až říjen), gramy na muže a den a zásoba náplavu v gramech.
 */
export const PANNING = { months: { from: 4, to: 10 }, gPerManDay: 1, placerG: 1_500 } as const;

/** Šperkař (gold.md – Pravidla 4; rešerše – zlatnictví): gramy za muže a den a násobek ceny. */
export const JEWELLER = { gPerManDay: 1.5, factor: 1.5 } as const;

/** Mincovna (gold.md – Pravidla 3; rešerše – ražba): od roku `fromYear`, gramy za muže a den. */
export const MINT = { fromYear: 950, gPerManDay: 200 } as const;
