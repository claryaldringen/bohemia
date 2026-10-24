// Čísla pravidel vojvodovy rodiny (docs/design/lord.md). Změna čísla = i text v návrhu.

/** Podíl denní doby výcviku na luk / boj / jízdu (hodiny dne jsou v `LORD.hours`). */
interface TrainingSplit {
  bow: number;
  combat: number;
  riding: number;
}

export const LORD = {
  /**
   * lord.md – Zakládání vsi (Martin 24. 10. 2026: „Až má ves ≥ 4 dospělé mimo rodinu“): rodina
   * začne cvičit, až má ves tolik dospělých mimo vojvodovu rodinu (domácnost dvorce – cvičící
   * i ženy); do té doby pracuje jako ostatní.
   */
  minVillageAdults: 4,
  /**
   * lord.md – Zakládání vsi (hystereze, návrh Clauda): cvičící rodina se vrací k práci až pod
   * tolik dospělých mimo rodinu, ať nekmitá mezi prací a cvičením.
   */
  keepVillageAdults: 3,
  /** lord.md – Den rodiny: od tohoto věku cvičí chlapec jako výrostek (10–13 let – luk, boj, jízda). */
  youthFrom: 10,
  /**
   * lord.md – Den rodiny: hodin výcviku denně podle věku (chlapec 7–9 / 10–13, muž 14–44, vojvoda
   * v každém věku a muži od 45 let – zbytek dne vojvoda vsi vládne).
   */
  hours: { boy: 2, youth: 4, man: 6, older: 3 },
  /** lord.md – Den rodiny: rozdělení hodin na luk / boj / jízdu (podíly dne), s koněm a bez. */
  split: {
    boy: {
      withHorse: { bow: 1, combat: 0, riding: 0 },
      noHorse: { bow: 1, combat: 0, riding: 0 },
    },
    youth: {
      withHorse: { bow: 0.5, combat: 0.25, riding: 0.25 },
      noHorse: { bow: 0.5, combat: 0.5, riding: 0 },
    },
    man: {
      withHorse: { bow: 1 / 3, combat: 1 / 3, riding: 1 / 3 },
      noHorse: { bow: 0.5, combat: 0.5, riding: 0 },
    },
    older: {
      withHorse: { bow: 1 / 3, combat: 1 / 3, riding: 1 / 3 },
      noHorse: { bow: 0.5, combat: 0.5, riding: 0 },
    },
  } satisfies Record<string, { withHorse: TrainingSplit; noHorse: TrainingSplit }>,
  /** lord.md – Výcvik a zkušenost: podíl chybějícího do stropu za hodinu výcviku (0,047 %). */
  gainPerHour: 0.00047,
  /** lord.md – Výcvik a zkušenost: strop dovednosti (do 13 let 40, 14–44 let 100, pak −3 ročně). */
  cap: { boy: 40, man: 100, declinePerYear: 3 },
  /** lord.md – Výcvik a zkušenost: úbytek bez výcviku za rok (5 %). */
  decayPerYear: 0.05,
  /** lord.md – Výcvik a zkušenost: úbytek se zastaví na tomto podílu nejvyšší dosažené. */
  floorShare: 0.5,
  /** lord.md – Kdy jde rodina na pole: dní s plným přídělem po sobě do návratu k výcviku. */
  backToTrainingDays: 30,
  /** lord.md – Rod vojvody, Manželky: muž rodu má nejvýš tolik žijících manželek (Martin). */
  maxWives: 4,
  /** lord.md – Manželky: další manželka z okolí přijde s touto pravděpodobností ročně (≈ 30 %). */
  extraWifePerYear: 0.3,
  /** lord.md – Manželky: další manželku si bere muž rodu od tohoto věku. */
  extraWifeFromAge: 18,
  /** lord.md – Manželky: věk další manželky z okolí (16–22 let). */
  extraWifeAge: { from: 16, to: 22 },
} as const;
