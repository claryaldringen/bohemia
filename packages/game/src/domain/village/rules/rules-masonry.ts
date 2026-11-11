// Kamenné zdivo a kostely (číselná pravidla; návrhy: docs/design/stone-masonry.md,
// docs/design/churches.md). Čísla bez Martina jsou návrh Clauda (11. 11. 2026).

import type { ChurchType, ChurchWork, MasonCraft, MasonryCircle } from '../types/types-masonry';

export const LODGE = {
  // stone-masonry.md – Stavební huť (Příchod): huť dorazí za 60 dní od pozvání
  arrivalDays: 60,
  // stone-masonry.md – Příchod: mistr je svobodný muž kolem 30 let
  masterAge: { min: 26, max: 34 },
  // stone-masonry.md – Svoboda, rodina a odchod: hlad 30 dní, štěstí pod 30 na 60 dní,
  // s manželkou a dětmi ve vsi čtvrtinová šance
  leaving: {
    satietyBelow: 0.8,
    hungryDays: 30,
    happinessBelow: 30,
    unhappyDays: 60,
    familyChance: 0.25,
  },
  // stone-masonry.md – Svoboda, rodina a odchod: syn mistra se učí od 12 let
  apprenticeFromAge: 12,
  // stone-masonry.md – Zkušenost a noví mistři: nový mistr od 600 čd zkušenosti v oboru
  masterXpManDays: 600,
} as const;

/** Všechny obory huti – pořadí příchodu a zobrazení (stone-masonry.md – Stavební huť). */
export const MASON_CRAFTS: readonly MasonCraft[] = [
  'builder',
  'limeBurner',
  'stonemason',
  'mason',
  'plasterer',
];

/**
 * Jména mistrů huti podle okruhu (stone-masonry.md – Stavební huť, Příchod; návrh Clauda): adriatický
 * okruh latinsko-dalmatská jména 9. století, karolinský bavorská. Jen písmena (jména osob se
 * kontrolují jako jména mužů rodu).
 */
export const MASTER_NAMES: Readonly<Record<MasonryCircle, readonly string[]>> = {
  adriatic: [
    'Dominicus',
    'Mauro',
    'Petrus',
    'Stefanus',
    'Iohannes',
    'Martinus',
    'Valentinus',
    'Gregorius',
    'Basilius',
    'Laurentius',
    'Theodorus',
    'Vitalis',
  ],
  carolingian: [
    'Adalbert',
    'Heimo',
    'Ratold',
    'Wolfhart',
    'Engelschalk',
    'Odalrich',
    'Hartwig',
    'Reginbert',
    'Liutpold',
    'Gundakar',
    'Ellenhard',
    'Sigimar',
  ],
};

/** Směr, odkud mistři huti přicházejí (`Person.origin`; návrh Clauda): adriatický jih, karolinský západ. */
export const MASTER_ORIGIN = { adriatic: 'S', carolingian: 'W' } as const;

export const LIME = {
  // stone-masonry.md – Vápno a malta: z 1,8 t vápence ≈ 1 t páleného vápna
  limestonePerLimeT: 1.8,
  // stone-masonry.md – Vápno a malta: lámaný vápenec, t na m³ lomu
  limestoneTPerM3: 2.5,
  // stone-masonry.md – Vápno a malta: dřevo 0,5–1 t na t vápna (střed)
  woodKgPerLimeT: 750,
  // stone-masonry.md – Vápno a malta: pálení ≈ týden, dávka zahloubené pece
  kilnBatchLimeT: 3,
  kilnBurnDays: 7,
  // stone-masonry.md – Vápno a malta: stavba pece u staveniště
  kilnBuildManDays: 20,
  // stone-masonry.md – Vápno a malta: drcení, nakládání, pálení a hašení, čd na t vápna
  manDaysPerLimeT: 8,
} as const;

export const MORTAR = {
  // churches.md – Velikost a cena: malta 0,3 m³ na m³ zdiva, vápno a písek 1 : 2
  m3PerMasonryM3: 0.3,
  sandShare: 2 / 3,
  // churches.md – Velikost a cena: t páleného vápna na m³ zdiva (≈ 0,1 m³ vápenné kaše)
  limeTPerMasonryM3: 0.065,
  // stone-masonry.md – Vápno a malta: kopání a donáška písku z písníku u vody, čd na m³
  sandDigManDaysPerM3: 1.5,
} as const;

export const CHURCH = {
  // churches.md – Typy podle okruhu huti
  types: {
    adriatic: { small: 'chancel', large: 'basilica' },
    carolingian: { small: 'apse', large: 'rotunda' },
  } as const satisfies Record<MasonryCircle, { small: ChurchType; large: ChurchType }>,
  // churches.md – Velikost a cena: poměry částí, které se dostaví k lodi
  parts: {
    // rotunda: průměr apsidy / průměr lodi, výška apsidy / výška lodi
    rotundaApseDiameter: 0.45,
    rotundaApseHeight: 0.6,
    // jednolodní: hloubka kněžiště nebo apsidy / šířka lodi, šířka / šířka lodi, výška / výška lodi
    chancelDepth: 0.4,
    chancelWidth: 0.65,
    chancelHeight: 0.8,
    // bazilika: šířka boční lodi / šířka střední lodi, výška boční lodi / výška lodi
    aisleWidth: 0.5,
    aisleHeight: 0.6,
    // bazilika: hloubka atria / délka lodi, výška zdi atria / výška lodi (atrium bez střechy)
    atriumDepth: 0.4,
    atriumHeight: 0.4,
  },
  // churches.md – Velikost a cena: meze rozměrů lodi, m
  limits: {
    diameter: { min: 4, max: 12 },
    width: { min: 4, max: 12 },
    basilicaWidth: { min: 6, max: 14 },
    length: { min: 6, max: 40 },
    height: { min: 4, max: 16 },
  },
  // churches.md – Velikost a cena: tloušťka zdi = 0,6 m + 0,03 × výška, základy 1 m hluboko
  wall: { baseM: 0.6, perHeightM: 0.03, foundationDepthM: 1 },
  // churches.md – Velikost a cena: práce a dřevo na m³ zdiva a m² střechy
  work: {
    // zdění s pomocníky včetně míchání malty a lešení
    wallsManDaysPerM3: 4,
    // opracování kamene (nároží, ostění) kameníkem
    dressingManDaysPerM3: 0.5,
    // výkop základového žlabu
    foundationDigManDaysPerM3: 1,
    roofManDaysPerM2: 1,
    roofWoodKgPerM2: 60,
    // omítky a fresky uvnitř
    decorManDaysPerM2: 0.3,
  },
  // churches.md – Stavba: zdí se (a pálí vápno) jen duben–říjen
  season: { fromMonth: 4, toMonth: 10 },
  // churches.md – Co kostel dává
  m2PerPerson: 0.75,
  happinessPerCoverage: 40,
  decorHappinessPerCoverage: 5,
  conversion: { base: 0.005, perCoverage: 0.025 },
  // churches.md – Co kostel dává: kněz přijde hned po dostavění (Martin); nový 60 dní po smrti
  priestAfterDays: 0,
  newPriestAfterDays: 60,
  // churches.md – Co kostel dává: hřbitůvek – pás kolem zdí, plocha hrobu i s cestičkami
  churchyardBeltM: 6,
  graveM2: 2.5,
} as const;

/** Který mistr vede kterou práci na kostele (churches.md – Stavba); stavbyvedoucí vždy. */
export const CHURCH_WORK_CRAFT: Readonly<Record<ChurchWork, MasonCraft>> = {
  foundation: 'mason',
  quarry: 'stonemason',
  lime: 'limeBurner',
  sand: 'builder',
  walls: 'mason',
  roof: 'builder',
  decor: 'plasterer',
};
