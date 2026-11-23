// Trh – ceny v mincovní míře (část rozdělených pravidel, rozcestník je rules.ts).

/**
 * markets.md – Rozhodnutí plánu 2, bod 3 (návrh Clauda; markets.md – Pravidla 4 nechává „o kolik
 * se posune, meze“ na staviteli): cena je v mincích za kg, kus nebo m³.
 * - Výchozí cena = hodnota zboží v kg obilí (`TRADE_GOOD_VALUES`) ÷ `grainKgPerCoin` – 15 kg obilí
 *   za minci. Rešerše research/2026-10-18-trade-values.md: Frankfurt 794 – žito 3 denáry za modius
 *   ≈ 37–49 kg, tedy ≈ 12–16 kg za denár; Ibráhím ibn Jákúb – za minci jídlo na měsíc.
 * - Po každém tržním dni P' = P × (1 + `priceStep` × (D − S) / (D + S)), D = kolik se zboží žádalo,
 *   S = kolik se ho nabízelo: za den nejvýš ±10 %, nikdy na nulu, jiné meze nejsou; zboží bez
 *   nabídky i poptávky cenu nemění.
 */
export const MARKET = {
  grainKgPerCoin: 15,
  priceStep: 0.1,
} as const;
