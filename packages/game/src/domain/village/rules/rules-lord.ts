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
  /** lord.md – Rod vojvody, Manželky: muž rodu má nejvýš tolik žijících manželek (Martin). */
  maxWives: 4,
  /** lord.md – Manželky: další manželka z okolí přijde s touto pravděpodobností ročně (≈ 30 %). */
  extraWifePerYear: 0.3,
  /** lord.md – Manželky: další manželku si bere muž rodu od tohoto věku. */
  extraWifeFromAge: 18,
  /** lord.md – Manželky: věk další manželky z okolí (16–22 let). */
  extraWifeAge: { from: 16, to: 22 },
  /**
   * lord.md – Zakladatelé (Martin 24. 10. 2026; věk návrh Clauda): ves zakládá vojvoda s hlavní
   * a třemi vedlejšími manželkami – věk vojvody a manželek od hlavní (první je hlavní).
   */
  founders: { lordAge: 25, wifeAges: [22, 20, 18, 16] },
  /** lord.md – Jména: jméno muže rodu má nejvýš tolik písmen (návrh Clauda). */
  nameMaxLength: 20,
  /**
   * lord.md – Dělení vsi, Kdo může vést odchod (Martin 30. 10. 2026): odchod vede syn vojvody od
   * tolika let; synové od tohoto věku jsou i dílníci poměrné části vsi (Poměrná část vsi).
   */
  leaveMinAge: 16,
} as const;

/**
 * seniorate.md – Nástupnictví hráče (Martin 2. 11. 2026: „Nástupce polovinu“; 30 dní návrh
 * Clauda): los o to, za koho hráč hraje po smrti svého muže – nástupce vsi vyhrává s podílem
 * `successorWeight`, zbytek se dělí rovným dílem mezi mladší syny od `LORD.leaveMinAge` let;
 * `departDays` = herních dní na volbu směru odchodu po pohřbu, než výprava vyrazí sama.
 */
export const PLAYER_SUCCESSION = { successorWeight: 0.5, departDays: 30 } as const;

/**
 * seniorate.md – Ves bez muže rodu – dosazení vojvody (Martin 2. 11. 2026: „Poslat muže rodu“;
 * čísla návrh Clauda): `daysPerMapStep` = herních dní cesty na každou mapu vzdálenosti (jako
 * výprava na sousední mapu), `minAge` = od kolika let muž rodu smí být dosazen vojvodou.
 */
export const APPOINT_LORD = { daysPerMapStep: 2, minAge: 16 } as const;

/**
 * war.md – Síla, Výcvik a zkušenost (Martin 2. 11. 2026: „Muž se cvičením doma může dostat max na
 * 50 % tréninku, pokud loví tak na 70 % a zbytek zkušeností může získat jedině válkou“): strop
 * dovednosti (luk, boj, jízda) podle zdroje výcviku. Rozhoduje menší z něj a stropu podle věku.
 */
export const ARMS_CAPS = { home: 50, hunt: 70, war: 100 } as const;

/** Zdroj výcviku, podle kterého platí strop z `ARMS_CAPS`. */
export type ArmsSource = keyof typeof ARMS_CAPS;

/**
 * absence.md – Jména synů (Martin 8. 11. 2026): syn muže rodu, kterému hráč do tolika dní od
 * narození nedá jméno (jeden herní rok), dostane jméno obvyklé v rodě.
 */
export const SON_NAME_GRACE_DAYS = 365;

/** absence.md – Jména synů (návrh Clauda): kolik jmen zemřelých mužů rodu si rod pamatuje. */
export const DECEASED_NAMES_MAX = 40;
