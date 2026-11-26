// Cizí kupci na dálkových stezkách – průjezdy, měšec, zboží a pobyt (část rozdělených pravidel,
// rozcestník je rules.ts).

/**
 * markets.md – Rozhodnutí plánu 4, bod 5 (čísla návrh Clauda; na doporučení Clauda, že karavana jede
 * po stezce několikrát do roka a v každé vsi u stezky se zastaví na den, kde je víc obchodníků déle,
 * Martin 22. 11. 2026: „Ano. Postupně to povede ke vzniku trhových vsí a měst na kupeckých stezkách“).
 * - Měšec 60 mincí (= 900 kg obilí) koupí přebytek několika vsí – klát dá ročně ≈ 6 kg medu
 *   a 0,4 kg vosku (`HIVES`), kožešin je v malé vsi ≈ 20 ročně.
 * - Seznam je trochu větší než přebytek jedné vsi, kupci ho tedy zdražují; při výchozích cenách má
 *   hodnotu 120 mincí (med 40, vosk 48, kožešiny 32) – právě cenu meče.
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
  /** Mince v měšci kupce. */
  coins: 60,
  /** Co kupec prodává (kusy). */
  goods: { swords: 2, mailShirts: 1, helmets: 2 },
  /** Co kupec shání (med a vosk kg, kožešiny kusy). */
  wants: { honey: 100, wax: 24, furs: 60 },
  /** Od kolika výprav na trhu kupci zůstanou další den. */
  busyVisitors: 3,
  /** Nejvýš dní na jednom trhu – pravidlo hry (návrh Clauda – Oznámit, bod 5), ne technická mez. */
  maxStayDays: 3,
} as const;
