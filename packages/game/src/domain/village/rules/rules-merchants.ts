// Cizí kupci na dálkových stezkách – průjezdy, zboží, seznam a pobyt (část rozdělených pravidel,
// rozcestník je rules.ts).

/**
 * markets.md – Rozhodnutí plánu 4, bod 5 (čísla návrh Clauda; na doporučení Clauda, že karavana jede
 * po stezce několikrát do roka a v každé vsi u stezky se zastaví na den, kde je víc obchodníků déle,
 * Martin 22. 11. 2026: „Ano. Postupně to povede ke vzniku trhových vsí a měst na kupeckých stezkách“).
 * - Měšec kupce je bez dna (Martin 27. 11. 2026: „Kupcům neomezuj měšec.“ – markets.md, Měšec kupců
 *   bez dna, body 1 a 2): kupec mince nedrží a za průjezd koupí všechno ze seznamu, co je na trhu –
 *   seznam je jedinou mezí nákupu. Klát dá ročně ≈ 6 kg medu a 0,4 kg vosku (`HIVES`), kožešin je
 *   v malé vsi ≈ 20 ročně.
 * - Seznam je trochu větší než přebytek jedné vsi, kupci ho tedy zdražují; při výchozích cenách mají
 *   med, vosk a kožešiny hodnotu 20 mincí (med ≈ 6,7, vosk 8, kožešiny ≈ 5,3) – právě cenu meče.
 * - Otroci (markets.md – Rozhodnutí plánu 5, bod 7; návrh Clauda): 10 za průjezd po 4 mincích –
 *   kupec je zaplatí mincemi, nebo je vezme zápočtem za zbroj.
 * - Zlato (gold.md – Pravidla 2 a 5; Rozhodnutí plánu 6, bod 8 – návrh Clauda; rešerše
 *   2026-11-26-gold.md – herní číslo, pramen není): 1 000 g za průjezd; na seznamu první jako
 *   v Martinově výčtu (22. 11. 2026: „Cizí kupci nakupují zlato, šperky …, med, vosk, kožešiny
 *   a otroky“). Mince stojí vždy 2,4 g zlata (`GOLD.coinGrams`, po celých mincích) a zlato není
 *   v zápočtu, ceně dne ani v hladině – trh bez zlata
 *   je jako po plánu 5.
 */
export const MERCHANTS = {
  /** Průjezdů spojení stezky za rok – jednou za roční období. */
  passesPerYear: 4,
  /** Odstup oken průjezdů ve dnech (4 × 91 = 364 – vejdou se do roku). */
  passSpacingDays: 91,
  /** Průjezd začíná v losovaný den z tolika prvních dnů svého okna. */
  passWindowDays: 60,
  /** Dní cesty na políčko spojení. */
  daysPerCell: 1,
  /** Co kupec prodává (kusy). */
  goods: { swords: 2, mailShirts: 1, helmets: 2 },
  /**
   * Co kupec za průjezd shání (zlato g, med a vosk kg, kožešiny a otroci kusy) – koupí všechno, co
   * z toho na trhu je (markets.md – Měšec kupců bez dna, bod 2); otroci markets.md – Rozhodnutí
   * plánu 5, bod 7, zlato gold.md – Rozhodnutí plánu 6, bod 8.
   */
  wants: { gold: 1_000, honey: 100, wax: 24, furs: 60, slaves: 10 },
  /** Od kolika výprav na trhu kupci zůstanou další den. */
  busyVisitors: 3,
  /** Nejvýš dní na jednom trhu – pravidlo hry (návrh Clauda – Oznámit, bod 5), ne technická mez. */
  maxStayDays: 3,
} as const;
