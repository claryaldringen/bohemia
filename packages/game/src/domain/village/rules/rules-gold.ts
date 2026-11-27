// Čísla zlata (plán 6, issue #13; rešerše docs/design/research/2026-11-26-gold.md, pravidla v
// gold.md – Pravidla N, Rozhodnutí plánu 6 – návrh Clauda, oddíl dopíše Úloha 14). Zlato je zboží
// (`TRADE_GOOD_VALUES.gold`), stav nese gramy (`VillageState.gold`).

/**
 * Mince a zlato (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 1; rešerše – ražba): mince váží
 * 2,4 g zlata (Martin 27. 11. 2026: „1 mince = 2.4g zlata = 90 kg obilí“), „1:1 váhově“ – gram zlata
 * stojí 1 ÷ 2,4 mince. Za mince se zlato mění jen po celých mincích (bod 4).
 */
export const GOLD = { coinGrams: 2.4 } as const;

/**
 * Rýžování zlata (gold.md – Pravidla 1; rešerše – rýžování): měsíce, kdy teče voda bez ledu
 * (duben až říjen), gramy na muže a den a zásoba náplavu v gramech.
 */
export const PANNING = { months: { from: 4, to: 10 }, gPerManDay: 1, placerG: 1_500 } as const;

/**
 * Šperkař (gold.md – Pravidla 4 a Mince 2,4 g, bod 6; rešerše – zlatnictví): gramy kovu za muže
 * a den (mince do nich po `GOLD.coinGrams`) a násobek ceny.
 */
export const JEWELLER = { gPerManDay: 1.5, factor: 1.5 } as const;

/**
 * Mincovna (gold.md – Pravidla 3 a Mince 2,4 g, bod 5; rešerše – ražba): od roku `fromYear`, gramy
 * za muže a den – razí celé mince (200 g = 83 mincí), zbytek zlata počká.
 */
export const MINT = { fromYear: 950, gPerManDay: 200 } as const;
