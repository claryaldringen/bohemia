// Trh – ceny v mincovní míře a dny výpravy na trh (část rozdělených pravidel, rozcestník je
// rules.ts).

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
  /**
   * Zpráva na pivo (markets.md – Pravidla 8, Rozhodnutí plánu 2, bod 7): lidé a domy se hlásí
   * zaokrouhleně na násobek `round` (nejméně `round`, je-li aspoň jeden). `traders` je technický
   * strop paměti vsi, ne pravidlo hry (návrh Clauda): hostitel si pamatuje jen posledních
   * `traders` příjezdů obchodníků, aby stav vsi nerostl donekonečna.
   */
  report: { round: 5, traders: 10 },
  /**
   * Doba cesty výpravy na trh (markets.md – Rozhodnutí plánu 2, bod 2, návrh Clauda; Martin 22. 11.
   * 2026: „ráno se vyrazí a večer vrátí“): cesta tam trvá max(0, políčka − `dayTripCells`) ×
   * `daysPerCell` dní – ves na sousední mapě (i úhlopříčně, ≈ 2–4 km) je ráno tam a večer zpět,
   * každá další mapa přidá den tam a den zpět. Pobyt je celý počet dní, nejméně `minStayDays`.
   */
  dayTripCells: 1,
  daysPerCell: 1,
  minStayDays: 1,
} as const;
