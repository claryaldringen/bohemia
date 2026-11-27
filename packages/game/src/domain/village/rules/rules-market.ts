// Trh – ceny v mincovní míře a dny výpravy na trh (část rozdělených pravidel, rozcestník je
// rules.ts).

/**
 * markets.md – Rozhodnutí plánu 2, bod 3 (návrh Clauda; markets.md – Pravidla 4 nechává „o kolik
 * se posune, meze“ na staviteli): cena je v mincích za kg, kus nebo m³.
 * - Výchozí cena = hodnota zboží v kg obilí (`TRADE_GOOD_VALUES`) ÷ `grainKgPerCoin` – 90 kg obilí
 *   za minci (Martin 27. 11. 2026: „1 mince = 2.4g zlata = 90 kg obilí“; gold.md – Mince 2,4 g
 *   zlata za 90 kg obilí, bod 1; markets.md – Hodnota mince). Dřív 15 kg podle stříbrného denáru
 *   (rešerše research/2026-10-18-trade-values.md: Frankfurt 794 – žito 3 denáry za modius ≈ 37–49 kg,
 *   tedy ≈ 12–16 kg za denár) – herní mince je teď zlatá a průměrná, ne denár.
 * - `legacyGrainKgPerCoin` – kurz do 27. 11. 2026 (15 kg za minci); jen pro převod cen, které si trh
 *   nebo ves pamatují bez kurzu (`VillageMarket.coinKg` chybí – převod `coin-rate`, gold.md – Mince
 *   2,4 g, bod 3), ne pravidlo hry.
 * - Po každém tržním dni P' = P × (1 + `priceStep` × (D − S) / (D + S)), D = kolik se zboží žádalo,
 *   S = kolik se ho nabízelo: za den nejvýš ±10 %, dno je výchozí cena (Martin 23. 11. 2026, markets.md – Martinova rozhodnutí, Spodní cena), nahoru bez meze (Horní cena); zboží bez
 *   nabídky i poptávky cenu nemění.
 */
export const MARKET = {
  grainKgPerCoin: 90,
  legacyGrainKgPerCoin: 15,
  priceStep: 0.1,
  /**
   * Zpráva na pivo (markets.md – Pravidla 8, Rozhodnutí plánu 2, bod 7): lidé a domy se hlásí
   * zaokrouhleně na násobek `round` (nejméně `round`, je-li aspoň jeden). `traders` je technický
   * strop paměti vsi, ne pravidlo hry (návrh Clauda): hostitel si pamatuje jen posledních
   * `traders` příjezdů obchodníků, aby stav vsi nerostl donekonečna.
   */
  report: { round: 5, traders: 10 },
  /**
   * Zakázka u řemeslníka vyprší po `orderDays` dnech od zápisu (markets.md – Rozhodnutí plánu 3,
   * bod 6). Technická mez, ne pravidlo: zakázka, kterou nikdo nevyzvedne (kupující zanikl, přestal
   * ji chtít), nesmí ve stavu hostitele zůstat navždy – stav vsi nesmí růst donekonečna; rok,
   * protože vesničané jezdí jednou ročně.
   */
  orderDays: 365,
  /**
   * Doba cesty výpravy na trh (markets.md – Rozhodnutí plánu 2, bod 2, návrh Clauda; Martin 22. 11.
   * 2026: „ráno se vyrazí a večer vrátí“): cesta tam trvá max(0, políčka − `dayTripCells`) ×
   * `daysPerCell` dní – ves na sousední mapě (i úhlopříčně, ≈ 2–4 km) je ráno tam a večer zpět,
   * každá další mapa přidá den tam a den zpět. Pobyt je celý počet dní, nejméně `minStayDays`.
   */
  dayTripCells: 1,
  daysPerCell: 1,
  minStayDays: 1,
  /**
   * Kolik dospělých je jedna rodina, kterou ves shání (markets.md – Rozhodnutí plánu 3, bod 10:
   * chybějící dospělí „jako rodiny (dva dospělí na rodinu, nahoru)“ – muž a žena; rodina stojí jako
   * dva dospělí, bod 4).
   */
  familyAdults: 2,
} as const;
