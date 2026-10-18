import type { ObstacleKind } from '../landscape';
import type { DwellingType, FieldSurface, PlotVariant, TaskName } from './types';

/** Úsek okna prací – od měsíce do měsíce včetně (1–12). */
export type WindowSegment = readonly [number, number];

// population.md – Pojmy (tabulka obydlí: kapacita, cena, životnost), Chátrání a přestavba (opravy, dětská úmrtnost)
export const DWELLINGS = {
  zemnice: {
    capacity: 6,
    cost: 60,
    lifespanYears: 15,
    repairAtEndOfLifePerYear: 15, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 1,
  },
  polozemnice: {
    capacity: 8,
    cost: 220,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 17, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 0.8,
  },
} as const;
// population.md – Nové obydlí (obyvatelé staví vždy lepší obydlí)
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
};
// population.md – Pojmy a Práce (věkové hranice, pracovní síla); START_AGES: Založení vsi (4 lidé)
export const AGE = { olderChild: 7, adult: 14, elder: 45 } as const;
export const LABOR_PER_DAY = { olderChild: 0.3, adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
// population.md – Růst populace (porodnost, úmrtnost dětí a dospělých, štěstí)
export const BIRTHS_PER_PAIR_PER_YEAR = 1 / 3;
export const CHILD_DEATH_BEFORE_ADULT = 0.4; // → ročně 1 − 0,6^(1/14)
export const ADULT_DEATHS_PER_YEAR = 0.015;
export const ELDER_DEATHS_PER_YEAR = 0.08;
// population.md – Růst populace (přeplněnost)
export const CROWDED_BIRTH_FACTOR = 0.3;
export const CROWDED_DEATH_FACTOR = 1.5;
export const LUCKY_YEARS = 30;
export const LUCKY_CHILD_DEATH_FACTOR = 0.5;
// population.md – Růst populace (hlad tlumí porody a zvyšuje úmrtnost); fields.md – Zásoby a nasycení
export const HUNGER = { birthsStopAt: 0.5, birthsFullAt: 0.95, deathExtraAtZero: 3 } as const;
// population.md – Hlad a vymření (Martin, 18. 10. 2026; čísla návrh Clauda): nahromaděný hlad
// vsi ve „dnech bez jídla“ – pod `fedFrom` přibude za den (fedFrom − nasycení) / fedFrom (bez
// jídla den, při 80 % ≈ 0,11), od `fedFrom` (90 %) ubude recoveryPerDay (do nuly) – jedna hranice,
// žádné pásmo, kde by hlad stál. Víc než maxDays nemá vliv. V hájení má skupina nejvýš práh − luckyMarginDays (dospělí
// 19, děti a starší 11), aby po jeho konci lidé umírali postupně. Denní riziko úmrtí hladem je 0
// do prahu `threshold` a pak strmě roste ((hlad − práh) / (jistá smrt − práh))^curve až
// k jistotě v `certainDeath` – bez jídla vymřou do 60 dní všichni (děti a starší do 45).
export const STARVATION = {
  fedFrom: 0.9,
  recoveryPerDay: 1,
  maxDays: 60,
  luckyMarginDays: 1,
  threshold: { child: 12, adult: 20, elder: 12 },
  certainDeath: { child: 45, adult: 60, elder: 45 },
  curve: 3,
} as const;
// population.md – Nové obydlí (do nového obydlí se stěhuje pár z domácnosti s aspoň 4 dospělými)
export const NEW_HOUSEHOLD_MIN_ADULTS = 4;
// fields.md – Zásoby a nasycení (roční potřeba jídla podle věku)
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
// fields.md – Zásoby a nasycení (ztráty při skladování, start se zásobami)
export const STORAGE_LOSS_PER_YEAR = 0.1;
export const START_STORES_MONTHS = 18;
// fields.md – Kolik ves oseje (potřeba + rezerva 15 %, nad 1,5 roční potřeby jen potřeba)
export const SOW_RESERVE = 0.15;
export const STORES_HIGH_YEARS = 1.5;
// fields.md – Kolik ves oseje (návrh Clauda)
export const PEAK_CAPACITY_SHARE = 1; // ve špičce smí jít na pole všechna práce po denním minimu (kalibrace z 0,8)
export const SPRING_DIG_SHARE = 0.5; // polovina kopání připadne na jaro (zbytek na podzim)
// fields.md – Úroda (hrubá úroda na hektar podle úrodnosti)
export const YIELD_BASE_KG_PER_HA = 760; // × (0,4 + 0,6 × úrodnost / 100)
// fields.md – Úroda (osivo na hektar)
export const SEED_KG_PER_HA = 175;
// fields.md – Úroda (neopletený díl), Zarůstání
export const UNWEEDED_YIELD = 0.6; // neopletý díl dá 60 % (návrh Clauda, kalibrace)
// fields.md – Přílohová soustava (osev, úhor), Úroda (úrodnost, vymýcený les), Založení pole
export const FERTILITY = {
  sowDepletion: 0.12,
  fallowRecovery: 0.05,
  sowableMin: 0.7,
  fallowReady: 0.95,
  forestBonus: 20,
  forestBonusYears: 3,
} as const;
// fields.md – Práce: sklizeň srpem a vázání 30 + odnos úrody v nůších 20 člověkodní na hektar
// (simulace je počítá jako jednu úlohu sklizně, rozdělení práce pro scénu je dělí – postavy)
export const HARVEST_WORK_PER_HA = { reap: 30, carry: 20 } as const;
// fields.md – Práce (člověkodny na hektar)
export const FIELD_WORK_PER_HA = {
  dig: 80,
  sow: 10,
  weed: 30,
  harvest: HARVEST_WORK_PER_HA.reap + HARVEST_WORK_PER_HA.carry,
  thresh: 30,
} as const;
// fields.md – Založení pole (vymýcení lesa podle stáří zarůstání)
export const RECLAIM_COST_PER_HA = [
  { maxYears: 2, cost: 0 },
  { maxYears: 5, cost: 40 },
  { maxYears: 10, cost: 60 },
  { maxYears: 15, cost: 150 },
  { maxYears: Infinity, cost: 250 },
] as const;
// fields.md – Zarůstání (víc než 15 let přílohu: z dílu je les)
export const FOREST_AFTER_YEARS = 16;
// fields.md – Založení pole (povrch dílu za hektar)
export const FOUNDING_COST_PER_HA: Record<FieldSurface, number> = {
  meadow: 40,
  shrub: 150,
  forest: 250,
};
// fields.md – Založení pole (sazba povrchu za hektar v sobě má, co povrch tvoří: v lese stromy
// i se suchými, padlými a pařezy a podrost – „stromy v ceně“, v křovinách keře; po kusech se
// na takovém čtverci platí jen ostatní překážky – kameny, balvany, v křovinách i stromy)
export const SURFACE_INCLUDED_OBSTACLES: Record<FieldSurface, readonly ObstacleKind[]> = {
  meadow: [],
  shrub: ['shrub'],
  forest: ['tree', 'youngTree', 'snag', 'fallenTree', 'stump', 'shrub'],
};
// fields.md – Založení pole (překážky na díle, práce navíc)
export const OBSTACLE_COST = {
  stone: 1,
  boulder: 8,
  tree: 3,
  youngTree: 1,
  snag: 3,
  fallenTree: 2,
  stump: 2,
  shrub: 0.5,
} as const;
// fields.md – Práce (vzdálenost od obydlí, +1 % za každých 10 m nad 100 m)
export const DISTANCE = { freeM: 100, percentPer10M: 1 } as const;
// fields.md – Založení pole (nejdál 800 m od obydlí, nejmenší výměra 0,1 ha)
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
// fields.md – Práce (denní minimum domácností); population.md – Práce
export const DAILY_MIN_PER_HOUSEHOLD = 0.5;
// fields.md – Práce (domácí výroba, přenos nedodělané práce nejvýš 60 dní)
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.15, backlogMaxDays: 60 } as const;
// population.md – Nové obydlí (společná práce za posledních 30 dní pro „má na to“)
export const COMMON_LABOR_HISTORY_DAYS = 30;
// cemetery.md – Pravidla (stavba: vytyčení a ohrazení 10 člověkodní na čtverec; hrob i s uličkami
// 4 m², na čtverec 15 × 15 m se vejde 56 hrobů)
export const CEMETERY = { costPerSquare: 10, graveM2: 4, gravesPerSquare: 56 } as const;
// cemetery.md – Hygiena (pohřebiště s volným místem: od nejbližšího obydlí v pořádku od 150 m,
// nejhorší pod 50 m; od vody v pořádku od 100 m, nejhorší pod 30 m; mezi tím plynule, násobí se)
export const CEMETERY_DISTANCE_M = {
  dwelling: { worst: 50, ok: 150 },
  water: { worst: 30, ok: 100 },
} as const;
// cemetery.md – Vliv na úmrtnost (roční riziko × 1 + extra × (1 − hygiena); hájení chrání)
export const HYGIENE_DEATH_EXTRA = { child: 0.5, adult: 0.3, elder: 0.3 } as const;
// population.md – Kronika (ves drží posledních 500 událostí, starší se zahazují)
export const CHRONICLE_MAX_EVENTS = 500;

// fields.md – Práce, tabulka Kdy (okna prací v měsících včetně; kopání, které se na podzim nestihne, pokračuje v březnu–dubnu)
export const WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  reclaim: [[9, 11]],
  dig: [
    [9, 11],
    [3, 4],
  ],
  sow: [[3, 4]],
  weed: [[5, 6]],
  harvest: [[7, 8]],
  thresh: [
    [11, 12],
    [1, 2],
  ],
};
// orchard.md – Pravidla (Martin – oprava podle rešerše 17. 10. 2026): výsadba 80 člověkodní/ha
// (+ překážky jako u pole), péče v zimě 10 člověkodní/ha ročně, sklizeň 8 člověkodní/ha při plné
// úrodě (při menší úrodě poměrně méně); první jablka 6. rok po výsadbě, úroda lineárně do plné
// úrody 25. rok, plná do 50. roku, pak lineárně k nule v 60. roce – tehdy se sad vrátí v louku;
// plná úroda ≈ 3 t jablek/ha ročně
export const ORCHARD = {
  plantingPerHa: 80,
  carePerHa: 10,
  harvestPerHa: 8,
  fullYieldKgPerHa: 3000,
  firstFruitYear: 6,
  fullYieldYear: 25,
  declineAfterYear: 50,
  endYear: 60,
} as const;
// orchard.md – Úroda (jablka mají asi 1/7 výživy obilí na kg: 3 t jablek ≈ 430 kg obilí)
export const APPLE_FOOD_VALUE = 1 / 7;
// orchard.md – okna prací v měsících včetně: výsadba na jaře nebo na podzim jako kopání (návrh
// Clauda), péče (prořezávání) v zimě, sklizeň v září–říjnu. Sezóny péče a sklizně začínají
// prvním dnem prvního měsíce a končí prvním dnem po posledním měsíci (péče 1. 12. – 1. 3.).
export const ORCHARD_PLANTING_WINDOWS = WINDOWS.dig;
export const ORCHARD_WINDOWS: Record<'harvest' | 'care', readonly WindowSegment[]> = {
  harvest: [[9, 10]],
  care: [
    [12, 12],
    [1, 2],
  ],
};
// orchard.md – Jídlo (jablka se jí přednostně; co zbude k 1. 3., shnije – před jídlem dne)
export const APPLE_ROT_DAY = { month: 3, day: 1 } as const;
// orchard.md – Rok sadu (návrh Clauda): hospodářský rok sadu začíná na jaře 1. 3. – jarní
// výsadba je 1. rokem sadu hned, podzimní (od září) až od příštího jara
export const ORCHARD_SEASON = { startMonth: 3, autumnPlantingFromMonth: 9 } as const;

// fields.md – Kolik ves oseje (k 1. září), Práce a Včasnost (sklizeň do konce srpna, výmlat do
// konce února). Musí souhlasit s WINDOWS: sklizeň je poslední den okna harvest, plán den po ní,
// konec výmlatu den po konci okna thresh (hlídá rules.test.ts).
export const HARVEST_DAY = { month: 8, day: 31 } as const;
export const PLANNING_DAY = { month: 9, day: 1 } as const;
export const THRESH_END_DAY = { month: 3, day: 1 } as const;

// population.md – Růst populace (roční úmrtnost dětí: za AGE.adult let vymře CHILD_DEATH_BEFORE_ADULT dětí)
/** Roční úmrtnost dětí – za AGE.adult let vymře CHILD_DEATH_BEFORE_ADULT dětí. */
export function childDeathsPerYear(): number {
  return 1 - (1 - CHILD_DEATH_BEFORE_ADULT) ** (1 / AGE.adult);
}

// population.md – Umístění obydlí (půdorys zemnice ≈ 4 × 4 m, polozemnice 5 × 5 m, rovina ≤ 0,5 m)
export const DWELLING_FOOTPRINT_M: Record<DwellingType, { width: number; depth: number }> = {
  zemnice: { width: 4, depth: 4 },
  polozemnice: { width: 5, depth: 5 },
};
export const DWELLING_MAX_HEIGHT_DIFF_M = 0.5;
// population.md – Umístění obydlí (překážky na místě osadníci odstraní), fields.md – Co je
// překážka (obydlí: kusy na ploše ≈ 10 × 10 m kolem půdorysu). Plocha v souřadnicích modelu
// (x napříč, z k vchodu, m) – staveniště s hromadou hlíny a střecha předsazená před štíty;
// scéna podle ní kreslí staveniště (DWELLING_CLEARANCE_M). Obydlí na pozemku (PLOT_TYPES)
// vyklízí místo toho celé políčko pozemku – jako čtverec pole.
export const DWELLING_CLEARING_M: Record<
  DwellingType,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = {
  zemnice: { minX: -4.8, maxX: 4.8, minZ: -4.4, maxZ: 7.5 },
  polozemnice: { minX: -5.1, maxX: 5.1, minZ: -4.7, maxZ: 7.5 },
};
// population.md – Umístění obydlí (Martin, 18. 10. 2026): polozemnice stojí na pozemku velkém
// jako jedno políčko pole (15 × 15 m, v mřížce políček), obehnaném polským plotem; dům uprostřed
// nebo v jednom ze čtyř rohů (5 variant), vchodem vždy k brance na přední straně (−z světa,
// natočení π), zbytek pozemku jsou záhony. Zemnice pozemek nemá (volná poloha).
export const PLOT_TYPES: Readonly<Record<DwellingType, boolean>> = {
  zemnice: false,
  polozemnice: true,
};
/** Pořadí variant při přepínání klávesami [ a ]. */
export const PLOT_VARIANTS: readonly PlotVariant[] = [
  'center',
  'back-left',
  'back-right',
  'front-right',
  'front-left',
];
/**
 * Střed domu od středu pozemku (m, osy světa): v rozích tak, aby dům i se střechou, valy a trsy
 * trávy u okapu zůstal uvnitř plotu (plot ≈ 0,5 m od okraje políčka) a před vchodem rohového domu
 * vpředu zbyla cestička k brance.
 */
export const PLOT_HOUSE_OFFSET_M: Readonly<Record<PlotVariant, { x: number; z: number }>> = {
  center: { x: 0, z: 0 },
  'back-left': { x: -3.3, z: 3.2 },
  'back-right': { x: 3.3, z: 3.2 },
  'front-right': { x: 3.3, z: -2.3 },
  'front-left': { x: -3.3, z: -2.3 },
};
/** Natočení domu na pozemku – vchod k brance (−z světa). */
export const PLOT_HOUSE_ROTATION = Math.PI;
// fields.md – Překážka na louce (skalní výchoz se neodstraní, plocha pod ním se nepočítá):
// poloměr výchozu (m) na jednotku velikosti modelu (modely skal 0 A.D. mají půdorys ≈ 6 m)
export const OUTCROP_RADIUS_M = 3;
// forest.md – Les ustupuje (oprava podle rešerše, schválil Martin): z pařezu vyroste nálet
// a pokácený strom je ≈ za 30 let mladý stromek, za ≈ 70 let zase dospělý strom (dá se kácet)
export const TREE_SAPLING_AFTER_YEARS = 30;
export const TREE_REGROWTH_YEARS = 70;
// forest.md – Stavby a kácení (Martin – oprava podle rešerše 17. 10. 2026): strom = velký strom;
// zemnice ≈ 7 stromů, polozemnice ≈ 18 stromů; přestavba stejně jako nová stavba
export const DWELLING_TREES: Record<DwellingType, number> = { zemnice: 7, polozemnice: 18 };
// forest.md – Kácení: skácení a dovoz 2 člověkodny za strom, +1 % za každých 10 m nad 100 m od
// staveniště (vzdálenost jako u polí – DISTANCE). U blízkého lesa stojí stavba práci jako dřív –
// cena obydlí (DWELLINGS.cost) v sobě kácení blízkého lesa už má (dwellingBuildLabor).
export const FELLING_MAN_DAYS_PER_TREE = 2;
// forest.md – Mýcení a hromada klád: dospělý strom z mýcení (pole, hřbitov, staveniště) = 1 kláda
export const LOGS_PER_CLEARED_TREE = 1;
// forest.md – Klády hnijí (Martin – oprava podle rešerše 17. 10. 2026): ≈ 4 % ročně
export const LOG_ROT_PER_YEAR = 0.04;
// forest.md – Palivo: palivová část domácí výroby (návrh Clauda: třetina) je o 1 % dražší za
// každých 10 m nad 100 m od obydlí k nejbližšímu okraji lesa (vzdálenost jako u polí – DISTANCE)
export const FUEL_DOMESTIC_SHARE = 1 / 3;

/** Práce na obydlí bez dřeva – cena obydlí minus kácení jeho stromů u blízkého lesa. */
export function dwellingBuildLabor(type: DwellingType): number {
  return DWELLINGS[type].cost - DWELLING_TREES[type] * FELLING_MAN_DAYS_PER_TREE;
}
// fields.md – Zarůstání (stadia přílohu podle celých let bez péče; víc než 15 let = les)
export const OVERGROWTH_STAGES = [
  { maxYears: 2, stage: 'young-fallow' },
  { maxYears: 5, stage: 'meadow' },
  { maxYears: 10, stage: 'young-growth' },
  { maxYears: 15, stage: 'shrub' },
  { maxYears: Infinity, stage: 'forest' },
] as const;

// happiness.md – Štěstí (Martin 18. 10. 2026; čísla návrh Clauda): číslo 0–100, výchozí 50,
// k cílové hodnotě se posouvá o 10 % rozdílu za měsíc (simulace po dnech: denní podíl tak, aby
// za 1/12 roku ubylo 10 % rozdílu).
export const HAPPINESS = {
  start: 50,
  min: 0,
  max: 100,
  base: 50,
  monthlyShare: 0.1,
} as const;
// happiness.md – Co ubírá: hlad (nasycení pod 0,9 ubere až 40, lineárně k nulovému nasycení),
// úmrtí za poslední rok (dospělý i starší −3, dítě −5, dohromady nejvýš −20), přeplněnost (podíl
// lidí v přeplněných domácnostech × 15), dřina (podíl dní za posledních 60, kdy ves nestíhala
// polní práce v období, × 15)
export const HAPPINESS_PENALTY = {
  hungerFrom: 0.9,
  hungerMax: 40,
  deathPoints: { child: 5, adult: 3, elder: 3 },
  deathsMax: 20,
  deathsWindowDays: 365,
  crowdingMax: 15,
  toilMax: 15,
  toilWindowDays: 60,
} as const;
// happiness.md – Co přidává: zásoby na víc než rok +5, posvátná místa dohromady nejvýš +40
export const HAPPINESS_BONUS = { storesYears: 1, stores: 5, sacredMax: 40 } as const;
// happiness.md – Účinek na práci (Martin – „nechme to tak, doladíme později“): veškerá práce vsi
// se násobí – štěstí 0 → × 0,8, 50 → × 1, 100 → × 1,1, mezi tím lineárně
export const HAPPINESS_LABOR = { atMin: 0.8, atBase: 1, atMax: 1.1 } as const;

// happiness.md – Posvátná místa: posvátný dub +5 (nejvýš 3 duby), dubový háj +10 a +1 za každé
// 2 duby nad 6, nejvýš +15 za háj (nejvýš 2 háje); pod korunou dubu na poli se neoseje ≈ 50 m²
export const SACRED_OAK = { happiness: 5, counted: 3, crownM2: 50 } as const;
export const GROVE = {
  minOaks: 6,
  radiusM: 25,
  happiness: 10,
  oaksPerPoint: 2,
  maxHappiness: 15,
  counted: 2,
} as const;
// happiness.md – Posvátný dub (definice – rozhodnutí kontroléru při implementaci, 18. 10. 2026):
// velký = horní třetina velikosti dospělých dubů vrstvy překážek (velikost = výška modelu ×
// měřítko, výšky modelů `OAK_MODEL_HEIGHT_M` z GLB); nestojí v souvislém lese = do
// `solitaryRadiusM` od něj roste nejvýš `solitaryMaxTrees` jiných dospělých stromů (v lese jich
// bývá 10–20, u osamělých dubů v loukách 0–4).
export const SACRED_OAK_DEFINITION = {
  topShare: 1 / 3,
  solitaryRadiusM: 15,
  solitaryMaxTrees: 5,
} as const;
/** Výška modelů dubů (m, z GLB v `public/models/trees`) – velikost dubu = výška × měřítko. */
export const OAK_MODEL_HEIGHT_M: Record<string, number> = {
  'oak-1': 16.95,
  'oak-2': 15.55,
  'oak-large-1': 20.7,
  'oak-large-2': 17.33,
  'oak-large-3': 22.09,
};
// happiness.md – Dubový háj (definice – rozhodnutí kontroléru při implementaci, 18. 10. 2026):
// les vrstvy překážek je z třetiny dubový, takže aspoň 6 dubů v okruhu 25 m má skoro každé
// místo lesa – háj je proto místo, kde duby převažují: aspoň `GROVE.minOaks` dospělých dubů
// v okruhu `GROVE.radiusM` a duby tvoří aspoň `oakShare` dospělých stromů v tom okruhu (≈ 7–12
// hájů na krajinu, 2–4 do 600 m od vsi). Střed háje je dub v lese (ne osamělý); háje se
// nepřekrývají (středy aspoň 2 × poloměr od sebe). Čtverce háje = políčka se středem do
// poloměru od středu háje, na kterých roste aspoň jeden dospělý strom.
export const GROVE_DEFINITION = { oakShare: 0.65 } as const;
// happiness.md – Dřevěná modla: půdorys 4 × 4 m na louce, 30 člověkodní a 1 dospělý dub, +8
// (nejvýš 2 modly); Svatyně: půdorys 30 × 30 m na louce, převýšení nejvýš 1 m, 400 člověkodní
// a 3 dospělé duby, +25, jedna na ves
export const SACRED_BUILDINGS = {
  idol: {
    footprintM: 4,
    laborManDays: 30,
    oaks: 1,
    happiness: 8,
    counted: 2,
    maxHeightDiffM: null,
  },
  shrine: {
    footprintM: 30,
    laborManDays: 400,
    oaks: 3,
    happiness: 25,
    counted: 1,
    maxHeightDiffM: 1,
  },
} as const;
