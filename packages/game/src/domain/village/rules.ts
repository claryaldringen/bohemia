import type { ObstacleKind } from '../landscape';
import type {
  Bounds,
  Craft,
  Crop,
  DwellingType,
  FallowStage,
  FieldSurface,
  FieldTask,
  OvergrowthStage,
  PlotVariant,
  TaskName,
} from './types';

// Meze produktivity (Martin, oprava podle rešerše 17. 10. 2026 – docs/design/research/): práce
// a ztráty, pro které literatura dává rozpětí, mají dvojici { worst, best }. Ves bez řemesel
// platí `worst`, s plně pokrytou potřebou výrobků řemeslníků `best`, mezi tím lineárně podle
// pokrytí (productivity.ts). Kovář posouvá práci (nástroje), hrnčíř ztráty zásob a denní
// minimum (nádoby). Kde literatura dává jedno číslo, platí obojí. Pokrytí počítá ze zásob
// výrobků `craftCoverage` (crafts.ts); ves bez řemesel má pokrytí 0 (NO_CRAFTS), tedy `worst`.

/** Úsek okna prací – od měsíce do měsíce včetně (1–12). */
export type WindowSegment = readonly [number, number];

// population.md – Pojmy (tabulka obydlí: kapacita, cena, životnost), Chátrání a přestavba (opravy, dětská úmrtnost)
// Životnost zemnice 18 let (oprava podle rešerše, bylo 15): potřeba oprav roste s (věk / životnost)²,
// takže se s životností sama roztáhne – roční potřeba na konci zůstává 15, za celý život 90
// člověkodní (bylo 75).
// population.md – Prázdné obydlí (Martin, 18. 10. 2026: neobydlené budovy chátrají rychleji; čísla
// návrh Clauda): prázdnému obydlí ubývá k chátrání podle stáří pevný podíl stavu, aby nové spadlo
// z plného stavu na nulu za `emptyLifespanYears` (dřív jen bez oprav: zemnice ≈ 16, polozemnice
// ≈ 26 let).
export const DWELLINGS = {
  zemnice: {
    capacity: 6,
    cost: 60,
    lifespanYears: 18,
    repairAtEndOfLifePerYear: 15, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 1,
    emptyLifespanYears: 5,
  },
  polozemnice: {
    capacity: 8,
    cost: 220,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 17, // kalibrace: ≈ ½ společné práce domácnosti (measure-village)
    childDeathFactor: 0.8,
    emptyLifespanYears: 8,
  },
} as const;
// population.md – Nové obydlí (obyvatelé staví vždy lepší obydlí)
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
};
// population.md – Pojmy a Práce (věkové hranice, pracovní síla), Růst populace (porody od 16 let –
// oprava podle rešerše, dospělý pro práci a odemčení zůstává 14–44); START_AGES: Založení vsi (4 lidé)
export const AGE = { olderChild: 7, adult: 14, fertile: 16, elder: 45 } as const;
export const LABOR_PER_DAY = { olderChild: 0.3, adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
// population.md – Růst populace (porodnost, úmrtnost dětí a dospělých, štěstí)
export const BIRTHS_PER_PAIR_PER_YEAR = 1 / 3;
export const CHILD_DEATH_BEFORE_ADULT = 0.4; // → ročně 1 − 0,6^(1/14)
export const ADULT_DEATHS_PER_YEAR = 0.02; // oprava podle rešerše (bylo 0,015; Lahovice)
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
// population.md – Nové obydlí, Prázdné obydlí (návrh Clauda): dospělé děti = lidé 14–44 kromě
// dvou nejstarších od 14 let výš (rodiče / hlava domácnosti); nová domácnost má aspoň dva lidi –
// jediný člověk by se hned rozpadl (Rozpad domácnosti)
export const HOUSEHOLD_HEADS = 2;
export const NEW_HOUSEHOLD_MIN_PEOPLE = 2;
// fields.md – Zásoby a nasycení (roční potřeba jídla podle věku)
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
// fields.md – Zásoby a nasycení (ztráty při skladování – meze: s hrnčířem 5 %, start se zásobami)
export const STORAGE_LOSS_PER_YEAR: Bounds = { worst: 0.1, best: 0.05 };
export const START_STORES_MONTHS = 18;
// fields.md – Kolik ves oseje (potřeba + rezerva 15 %, nad 1,5 roční potřeby jen potřeba)
export const SOW_RESERVE = 0.15;
export const STORES_HIGH_YEARS = 1.5;
// fields.md – Kolik ves oseje (návrh Clauda)
export const PEAK_CAPACITY_SHARE = 1; // ve špičce smí jít na pole všechna práce po denním minimu (kalibrace z 0,8)
// fields.md – Úroda (hrubá úroda na hektar podle úrodnosti)
export const YIELD_BASE_KG_PER_HA = 760; // × (0,4 + 0,6 × úrodnost / 100)
// fields.md – Úroda (osivo na hektar)
export const SEED_KG_PER_HA = 175;
// fields.md – Úroda (neopletený díl), Zarůstání
export const UNWEEDED_YIELD = 0.6; // neopletý díl dá 60 % (návrh Clauda, kalibrace)
// fields.md – Přílohová soustava (osev, příloh), Úroda (úrodnost). Obnova v přílohu 2,5 %
// přirozené za rok (oprava podle rešerše, bylo 5 %): z 0,64 na 0,95 za 13 let.
export const FERTILITY = {
  sowDepletion: 0.12,
  fallowRecovery: 0.025,
  sowableMin: 0.7,
  fallowReady: 0.95,
} as const;
// fields.md – Úroda (vymýcený les; oprava podle rešerše, bylo +20 na 3 roky): bonus úrodnosti
// podle sezóny osevu po vymýcení (1. +40, 2. +20, pak 0) a první sezónu se neplete. Bonus platí
// jen do `windowYears` let od vymýcení – díl, který ves do té doby neoseje, o popel přijde.
export const FOREST_BONUS = { bySeason: [40, 20], windowYears: 3 } as const;
// fields.md – Práce: sklizeň srpem a vázání 30 (s řemesly 15) + odnos úrody v nůších 20 člověkodní
// na hektar – meze (simulace je počítá jako jednu úlohu sklizně, rozdělení práce pro scénu je
// dělí – postavy)
export const HARVEST_WORK_PER_HA: Record<'reap' | 'carry', Bounds> = {
  reap: { worst: 30, best: 15 },
  carry: { worst: 20, best: 20 },
};
// fields.md – Práce (člověkodny na osetý hektar – meze)
export const FIELD_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: { worst: 100, best: 50 },
  sow: { worst: 10, best: 10 },
  weed: { worst: 30, best: 15 },
  harvest: {
    worst: HARVEST_WORK_PER_HA.reap.worst + HARVEST_WORK_PER_HA.carry.worst,
    best: HARVEST_WORK_PER_HA.reap.best + HARVEST_WORK_PER_HA.carry.best,
  },
  thresh: { worst: 15, best: 10 },
};
// fields.md – Založení pole (povrch dílu za hektar – meze)
export const FOUNDING_COST_PER_HA: Record<FieldSurface, Bounds> = {
  meadow: { worst: 100, best: 90 },
  shrub: { worst: 100, best: 60 },
  forest: { worst: 250, best: 150 },
};
// fields.md – Práce, Zarůstání (Martin, 18. 10. 2026: „Ano udělej to tak“ – nepasený a nesečený
// příloh zarůstá; čísla návrh Clauda podle rešerše 2026-10-18-overgrowth.md): vrácení přílohu do
// osevu podle stadia – mladý příloh bez práce navíc, louka drn louky, křoviny jako křoviny,
// mladý les jako les (meze)
export const RECLAIM_COST_PER_HA: Readonly<Record<FallowStage, Bounds>> = {
  'young-fallow': { worst: 0, best: 0 },
  meadow: FOUNDING_COST_PER_HA.meadow,
  shrubs: FOUNDING_COST_PER_HA.shrub,
  'young-forest': FOUNDING_COST_PER_HA.forest,
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
// paths.md – Pěšiny a práce (Martin 18. 10. 2026: „Tam, kde bude vyšlapaná cesta, ať se chodí
// o něco lépe než tam, kde není.“): po vyšlapané pěšině se chodí o čtvrtinu rychleji – úsek
// pěšiny síly s se do vzdálenosti dílu (fields.md – Vzdálenost) počítá (1 − speedup × s) × délka
export const PATH_WALK = { speedup: 0.25 } as const;
// roads.md – Dvě vrstvy cest (návrh Clauda, schváleno 18. 10. 2026): pevné cesty se počítají
// jednou za rok k 1. 11. (po sklizni jablek) z celoroční práce; úsek, kudy se dva roky po sobě
// chodí aspoň 3× denně (roční průměr), se stane pevnou cestou; vyšlapaná cesta, kudy se 5 let po
// sobě chodí pod polovinu prahu, zaroste
export const ROADS = {
  yearDay: { month: 11, day: 1 },
  tripsPerDay: 3,
  years: 2,
  overgrowYears: 5,
  overgrowShare: 0.5,
} as const;
// roads.md – Stromy u pevných cest (Martin: napřed keř, stojí, dokud samy neodumřou; čísla návrh
// Clauda): místa po 12–20 m střídavě po stranách 2,5–4 m od osy, stromy nejméně 8 m od sebe;
// uchycení 10 % ročně na volném místě u cesty starší 5 let; polovina dubů, zbytek jilmy a topoly;
// keř 8 let, pak mladý strom 30 % velikosti, plná velikost ve 40 letech; kládu při stavbě dá
// strom od 20 let (mladší je mladý stromek); život topol 60–100, jilm 100–200, dub 200–400 let,
// pak souš 10 let a pařez 10 let
export const ROAD_TREES = {
  spacingM: { from: 12, to: 20 },
  offsetM: { from: 2.5, to: 4 },
  gapM: 8,
  rootAfterYears: 5,
  rootChancePerYear: 0.1,
  speciesShare: { oak: 0.5, elm: 0.28 },
  shrubYears: 8,
  youngScale: 0.3,
  fullYears: 40,
  logFromYears: 20,
  lifeYears: {
    poplar: { from: 60, to: 100 },
    elm: { from: 100, to: 200 },
    oak: { from: 200, to: 400 },
  },
  snagYears: 10,
  stumpYears: 10,
} as const;
// roads.md – Vylepšení cesty (návrh Clauda, schváleno 18. 10. 2026): upravená cesta 15 člověkodní
// na 100 m; hať 1 strom a 2 člověkodny na 2 m mokřiny; lávka přes brod 4 stromy a 15 člověkodní
export const ROAD_UPGRADES = {
  improvedManDaysPer100M: 15,
  causewayPer2M: { trees: 1, manDays: 2 },
  footbridge: { trees: 4, manDays: 15 },
} as const;
// roads.md – Vysazení jabloní (Martin; čísla návrh Clauda): podél úseku po obou stranách po 10 m
// střídavě (2,6–3,4 m od osy), jabloně nejméně 8 m od sebe a 6 m od stromu u cesty; jako sad na
// strom – ≈ 180 stromů na hektar (výsadba 80 čd/ha ≈ 0,45 čd na strom, péče a sklizeň jako v sadu,
// plná úroda ≈ 17 kg na strom), plody od 6. roku, život ≈ 60 let; souš pak stojí 10 let
export const ROAD_APPLES = {
  spacingM: 10,
  offsetM: { from: 2.6, to: 3.4 },
  gapM: 8,
  treeClearM: 6,
  treesPerHa: 180,
  snagYears: 10,
  logFromYears: 20,
} as const;
// roads.md – Rychlejší chůze (návrh Clauda, schváleno): rychlost chůze proti louce – vyšlapaná
// cesta 1,2×, upravená 1,5× (hať a lávka jen přes mokřinu a brod, jinde jako upravená); mokřina
// 0,5× (bahno), po hati 1,5×; brod + 30 m (zout se, přebrodit), po lávce bez zdržení
export const ROAD_WALK = {
  speed: { trodden: 1.2, improved: 1.5, causeway: 1.5 },
  wetSpeed: 0.5,
  causewayWetSpeed: 1.5,
  fordExtraM: 30,
} as const;
// fields.md – Založení pole (nejdál 800 m od obydlí, nejmenší výměra 0,1 ha)
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
// fields.md – Práce (denní minimum domácností – meze: s hrnčířem 0,45); population.md – Práce
export const DAILY_MIN_PER_HOUSEHOLD: Bounds = { worst: 0.5, best: 0.45 };
// fields.md – Práce (domácí výroba, přenos nedodělané práce nejvýš 60 dní)
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.15, backlogMaxDays: 60 } as const;
// population.md – Nové obydlí (společná práce za posledních 30 dní pro „má na to“)
export const COMMON_LABOR_HISTORY_DAYS = 30;
// population.md – Chátrání a přestavba (oprava podle hlášení Martina 18. 10. 2026): přestavba na
// lepší obydlí podle ročního průměru společné práce – klouzavý (exponenciální) průměr s časovou
// konstantou jednoho roku, aby výmlat v zimě ani žně ves nezchudly
export const COMMON_LABOR_YEAR_DAYS = 365;
// population.md – Chátrání a přestavba, Po zániku (Martin 18. 10. 2026, číslo návrh Clauda): zbytek
// jámy po zaniklém obydlí (zarostlá prohlubeň s kopřivami a pár trámy) zarůstá ≈ 10 let, pak zmizí
export const RUIN_YEARS = 10;
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

// fields.md – Práce, tabulka Kdy, a Ozim a jař (okna prací v měsících včetně). WINDOWS = jař:
// kopá se na podzim, co se nestihne, v březnu–dubnu; seje se na jaře, sklízí v srpnu.
export const WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  reclaim: [[9, 11]],
  dig: [
    [9, 11],
    [3, 4],
  ],
  sow: [[3, 4]],
  weed: [[5, 6]],
  harvest: [[8, 8]],
  thresh: [
    [11, 12],
    [1, 2],
  ],
};
// fields.md – Ozim a jař (návrh Clauda, Martin schválil směr 18. 10. 2026): ozim se vrací
// z přílohu, kope a seje v září–říjnu, plete v květnu–červnu jako jař, sklízí v červenci
// a mlátí v zimě
export const WINTER_WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  reclaim: [[9, 10]],
  dig: [[9, 10]],
  sow: [[9, 10]],
  weed: [[5, 6]],
  harvest: [[7, 7]],
  thresh: [
    [11, 12],
    [1, 2],
  ],
};
// fields.md – Luštěniny (rešerše 2026-10-18-legumes.md): luštěniny jsou jař – kopou se na podzim
// nebo na jaře, sejí v březnu–dubnu, pletou v květnu–červnu, sklízejí (trhají) v červenci a mlátí
// v zimě jako obilí
export const LEGUME_WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  ...WINDOWS,
  harvest: [[7, 7]],
};
/** Okna prací podle plodiny (fields.md – Ozim a jař, Luštěniny). */
export const CROP_WINDOWS: Record<Crop, Record<TaskName, readonly WindowSegment[]>> = {
  winter: WINTER_WINDOWS,
  spring: WINDOWS,
  legume: LEGUME_WINDOWS,
};
/** Pořadí plodin při shodě konce okna – ozim (sklízí se dřív) první, luštěniny před jaří. */
export const CROP_ORDER: readonly Crop[] = ['winter', 'legume', 'spring'];
/**
 * diet.md a fields.md – Luštěniny (Martin 18. 10. 2026: bílkoviny 1,6 g/kg zůstávají, přidají se
 * luštěniny; čísla rešerše 2026-10-18-legumes.md, odhady návrh Clauda): hrách a čočka jako jedna
 * plodina – hrubá úroda jako 0,8 úrody obilí při stejné úrodnosti (≈ 600 kg/ha při plné), osivo
 * 150 kg/ha, 22 % bílkovin, energie jako obilí (3 400 kcal/kg); ztráta skladováním jako obilí
 * (STORAGE_LOSS_PER_YEAR – zrnokaz se ve skladu nemnoží); neopletý díl dá 50 % (obilí 60 %);
 * osev úrodnost neubere, ale vrátí 0,03 (`fertilityGain` – poutá dusík, ≈ rok přílohu); strop
 * podílu energie z luštěnin ve stravě 25 % (dospělý ≈ 45 kg ročně).
 */
export const LEGUMES = {
  yieldShare: 0.8,
  seedKgPerHa: 150,
  protein: 0.22,
  energy: 1,
  unweededYield: 0.5,
  fertilityGain: 0.03,
  energyCap: 0.25,
} as const;
// fields.md – Luštěniny (rešerše: hrách hůř snáší plevel a okopával se, žeň luštěnin stála ≈ 1,2×
// víc než žeň obilí, výmlat na objem 0,6–0,8× pšenice) – člověkodny na osetý hektar, meze
export const LEGUME_HARVEST_WORK_PER_HA: Record<'reap' | 'carry', Bounds> = {
  reap: { worst: 35, best: 20 },
  carry: { worst: 20, best: 20 },
};
export const LEGUME_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: FIELD_WORK_PER_HA.dig,
  sow: FIELD_WORK_PER_HA.sow,
  weed: { worst: 40, best: 20 },
  harvest: {
    worst: LEGUME_HARVEST_WORK_PER_HA.reap.worst + LEGUME_HARVEST_WORK_PER_HA.carry.worst,
    best: LEGUME_HARVEST_WORK_PER_HA.reap.best + LEGUME_HARVEST_WORK_PER_HA.carry.best,
  },
  thresh: { worst: 10, best: 6 },
};
// orchard.md – Pravidla (Martin – oprava podle rešerše 17. 10. 2026): výsadba 80 člověkodní/ha
// (+ překážky jako u pole), péče v zimě 10 člověkodní/ha ročně, sklizeň 8 člověkodní/ha při plné
// úrodě (při menší úrodě poměrně méně); první jablka 6. rok po výsadbě, úroda lineárně do plné
// úrody 25. rok, plná do 50. roku, pak lineárně k nule v 60. roce – tehdy se čtverec vrátí
// v louku; plná úroda ≈ 3 t jablek/ha ročně.
// orchard.md – Obnova sadu (Martin 18. 10. 2026 – vesničané obnovují sami, čísla návrh Clauda):
// čtverce od 50. roku sadu (`declineAfterYear` – poslední rok plné úrody) vysadí vesničané znovu,
// za rok sadu nejvýš desetina čtverců (`renewalShareYear`, nahoru, aspoň 1) – za 10 let do konce
// (50.–59. rok) se tak obnoví celý sad
export const ORCHARD = {
  plantingPerHa: 80,
  carePerHa: 10,
  harvestPerHa: 8,
  fullYieldKgPerHa: 3000,
  firstFruitYear: 6,
  fullYieldYear: 25,
  declineAfterYear: 50,
  endYear: 60,
  renewalShareYear: 0.1,
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

// fields.md – Kolik ves oseje (k 1. září), Práce a Včasnost (sklizeň jaře do konce srpna, ozimu
// do konce července, výmlat do konce února). Musí souhlasit s okny: sklizeň je poslední den okna
// harvest své plodiny, plán den po sklizni jaře, konec výmlatu den po konci okna thresh (hlídá
// rules.test.ts).
export const HARVEST_DAY = { month: 8, day: 31 } as const;
export const WINTER_HARVEST_DAY = { month: 7, day: 31 } as const;
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
/**
 * Převod starších polozemnic na pozemky (Martin, 18. 10. 2026 – `withPlots`): dům blíž místu
 * varianty než tolik metrů se na něj posune, dál zůstane stát, kde je.
 */
export const PLOT_SNAP_M = 2;
/**
 * population.md – Obydlí na poli a v sadu (Martin, 18. 10. 2026: „Pole a sad se prostě zmenší
 * o plochu domu“; práh návrh Clauda): díl pole nebo čtverec sadu, kterému po stavbě obydlí zbude
 * méně než tento podíl políčka, zmizí celý – zbytek u domu by nikdo neobdělával.
 */
export const TAKEN_LAND_MIN_SHARE = 0.2;
/**
 * Polozemnice bez pozemku dostane při přestavbě nejbližší volné políčko – nejvýš tak daleko od
 * domu (m, ke středu políčka); dál žádné nehledá a zůstane bez pozemku.
 */
export const PLOT_RELOCATION_M = 50;
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
// fields.md – Příloh a pastva: mladý příloh 1–2 roky ladem (plevel a tráva – vrácení bez drnu)
export const YOUNG_FALLOW_YEARS = 2;
// fields.md – Zarůstání (Martin, 18. 10. 2026: „Ano udělej to tak“ – nepasený a nesečený příloh
// zarůstá, les z pole vypadne; čísla návrh Clauda podle rešerše 2026-10-18-overgrowth.md –
// Jelinčić a kol. 2023: travinné stadium 2–5 let, keře 5–15, osika 15–30, les přes 30; Prach
// 2023: trnka kolem 15. roku, zapojené dřeviny po ≈ 20 letech): roky bez pastvy a seče → stadium
// dílu přílohu. Od 30 let je na dílu les a z pole vypadne (les vsi – `VillageState.woods`).
export const OVERGROWTH_STAGES: readonly {
  readonly fromYears: number;
  readonly stage: OvergrowthStage;
}[] = [
  { fromYears: 0, stage: 'meadow' },
  { fromYears: 5, stage: 'shrubs' },
  { fromYears: 15, stage: 'young-forest' },
  { fromYears: 30, stage: 'forest' },
];
// fields.md – Zarůstání (návrh Clauda): roky bez pastvy a seče se počítají jednou za rok
// 1. 11. (po pastevní sezóně a seči, před porážkou) a jen dílům, které ležely ladem celé
// vegetační období od 1. 4.; díl se spásl, když na něj z potřeby pastvy stád připadla aspoň
// polovina jeho plochy (`fallowGrazing`)
export const OVERGROWTH = {
  yearDay: { month: 11, day: 1 },
  seasonStart: { month: 4, day: 1 },
  grazedMinShare: 0.5,
} as const;
// fields.md – Les vsi (návrh Clauda; forest.md – Les ustupuje): dospělé stromy na lese vsi
// přibývají od 15 let (osika a bříza mladého lesa) do plné hustoty v 70 letech (jako pokácený
// strom – TREE_REGROWTH_YEARS); plná hustota 240 stromů na hektar jako les krajiny (≈ 5,5
// dospělého stromu na políčko vrstvy překážek)
export const VILLAGE_WOOD = {
  matureFromYears: 15,
  fullYears: TREE_REGROWTH_YEARS,
  treesPerHa: 240,
} as const;

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

// happiness.md – Posvátná místa: posvátný dub podle stáří (`SACRED_OAK_HAPPINESS`, nejvýš 3 duby
// – ty, které přidávají nejvíc), dubový háj +10 a +1 za každé 2 duby nad 6, nejvýš +15 za háj
// (nejvýš 2 háje); pod korunou dubu na poli se neoseje ≈ 50 m²
export const SACRED_OAK = { counted: 3, crownM2: 50 } as const;
// happiness.md – Posvátný dub – stáří a štěstí (Martin 18. 10. 2026: „čím jsou starší, tím víc
// štěstí přidávají. Nejmladší 1, nejstarší 10.“): živý dub stáří `youngYears` přidá `young`,
// stáří `oldYears` (nejvyšší možná délka života) `old`; mezi tím podle logaritmu stáří, na celé
// body (návrh Clauda – každé zdvojnásobení stáří přidá stejně, ≈ 2,4 bodu: 200 let 2, 400 let 4,
// 600 let 6, 1000 let 8, 1400 let 9; lineárně by 200 a 600 let dalo 1 a 3). Posvátná souš
// (uschlý dub) přidá `snag` (návrh Clauda), padlá souš nic.
export const SACRED_OAK_HAPPINESS = {
  youngYears: 150,
  oldYears: 2000,
  young: 1,
  old: 10,
  snag: 1,
} as const;
// happiness.md – Posvátný dub – délka života (Martin 18. 10. 2026: „mohou stářím uschnout, ale ať
// je to variabilní … ať se ty nejstarší mohly dožít až 2000 let“; rozdělení návrh Clauda):
// délka života = `minYears` + (`maxYears` − `minYears`) × B, kde B je `rank`. nejmenší z `draws`
// náhodných čísel (rozdělení Beta(2, 4)) – ≈ 81 % dubů se dožije 800–1400 let (nejčastěji
// ≈ 1100, průměr 1200), ≈ 19 % déle, přes 1700 let ≈ 1,6 % a 2000 let nikdo nepřekročí. Uschne
// v létě, když přijde sucho (některý z `death.days` dní od 1. `death.month` – červen až srpen);
// souš stojí `snagYears` let (rovnoměrně) a padne v kterýkoli den roku. Náhoda je z id a polohy
// dubu ve vrstvě – stejný dub má stejný život v každé vsi.
export const SACRED_OAK_LIFE = {
  minYears: 800,
  maxYears: 2000,
  draws: 5,
  rank: 2,
  death: { month: 6, days: 92 },
  snagYears: [50, 100],
} as const;
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
// happiness.md – Co hráč vidí (stáří posvátného dubu – Martin 18. 10. 2026, rozpětí návrh
// Clauda): stáří dubu ke dni začátku světa (1. 1. 500) lineárně podle jeho velikosti (výška
// modelu × měřítko) – nejmenší posvátný dub (`minSizeM` ≈ práh horní třetiny dubů vrstvy, na
// skutečných krajinách 17,65–17,76 m) `minYears`, největší (`maxSizeM` = oak-large-3 × 1,2)
// `maxYears`, mimo rozpětí oříznuté; k tomu herní roky od začátku světa. 150 let ≈ mohutný
// dospělý solitérní dub (obvod ≈ 3 m), od 400 let je dub „starobylý“ (Woodland Trust – Ancient
// Tree Inventory, průvodce dubem; dub běžně žije ≈ 600 let, výjimečně 1000).
export const OAK_AGE = { minSizeM: 17.7, maxSizeM: 26.5, minYears: 150, maxYears: 400 } as const;
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

// crafts.md – Budovy (Martin; +30 % návrh Clauda): dílna je obydlí – hrnčíř a kovář stojí na
// polozemnici, uhlíř na zemnici – a stojí jako základní obydlí + 30 % práce i dřeva za pec, výheň
// nebo milíř. Umisťuje se volně jako zemnice (bez pozemku).
export const CRAFT_BASE: Readonly<Record<Craft, DwellingType>> = {
  potter: 'polozemnice',
  smith: 'polozemnice',
  burner: 'zemnice',
};
export const WORKSHOP_EXTRA = 0.3;
/** Pořadí řemesel – nabídka staveb a výroba dne (uhlíř první, jeho uhlí může kovář hned použít). */
export const CRAFTS: readonly Craft[] = ['burner', 'potter', 'smith'];
// crafts.md – Výroba: uhlíř 10 kg uhlí za člověkoden, ze stromu 120 kg; kovář 1 kg nástrojů za
// 10 člověkodní a 50 kg uhlí; hrnčíř 1 kg keramiky za člověkoden a 1 strom paliva na 500 kg.
// Ruda a hlína dál od vody: +1 % za 10 m nad 100 m od dílny k potoku (DISTANCE jako u polí).
export const CRAFT_PRODUCTION = {
  charcoalKgPerManDay: 10,
  charcoalKgPerTree: 120,
  toolManDaysPerKg: 10,
  toolCharcoalKgPerKg: 50,
  potteryManDaysPerKg: 1,
  potteryKgPerTree: 500,
} as const;
// crafts.md – Účinek (návrh Clauda): každý pracující od 14 let potřebuje 3 kg nástrojů, nástroje
// v užívání se opotřebují o 30 % ročně; každý člověk potřebuje 5 kg nádob, ročně se jich 40 %
// rozbije. Opotřebení a rozbití se týká jen toho, co ves používá (nejvýš potřeba) – přebytek
// v zásobě leží (Martin: přebytky později pro obchod).
// crafts.md – Podle potřeby (návrh Clauda): kovář a hrnčíř vyrábějí jen do zásoby = potřeba vsi
// + opotřebení za `reserveYears` (nástroje × 1,3, keramika × 1,4); pak jejich domácnost pracuje
// se vsí (Martin 18. 10. 2026 – volný čas na poli)
export const CRAFT_NEEDS = {
  toolsKgPerWorker: 3,
  toolWearPerYear: 0.3,
  potteryKgPerPerson: 5,
  potteryBreakagePerYear: 0.4,
  reserveYears: 1,
} as const;
// crafts.md – Uhlíř (Martin 18. 10. 2026 – uhlíř pálí buky, staví milíř, sází mladé buky;
// čísla podle rešerše 2026-10-18-charcoal.md, rozdělení práce návrh Clauda): milíř = dávka
// 15 buků (≈ 18 prm, ≈ 1,8 t uhlí – Ø ≈ 4,6 m jako model). Práce po fázích: kácení a dovoz
// k milíři (FELLING_MAN_DAYS_PER_TREE + vzdálenost), příprava dřeva (odvětvení, krácení, štípání)
// 6 čd na buk, stavba milíře 2 čd na buk, pálení 8 dní (hlídá se ve dne i v noci – celá práce
// domácnosti), vytahání, třídění a odnos uhlí 2 čd na buk. Leží-li první buk dávky do 150 m od
// milíře u dílny, pálí se doma; dál staví uhlíř milíř v lese u dávky (Szabó a kol. 2022) a za
// chůzi z dílny platí přirážku vzdálenosti (DISTANCE) na veškerou práci u něj. Uhlí pálí jen do
// zásoby na rok spotřeby kovářů (návrh Clauda) – s plnou zásobou sází buky, nebo pomáhá vsi.
export const CHARCOAL_KILN = {
  trees: 15,
  prepManDaysPerTree: 6,
  buildManDaysPerTree: 2,
  burnDays: 8,
  drawManDaysPerTree: 2,
  homeReachM: 150,
  reserveYears: 1,
} as const;
// crafts.md – Uhlíř, obnova lesa (Martin; čísla návrh Clauda podle rešerše): na pařez skáceného
// buku uhlíř zasadí mladý buk (semenáček z lesa) – 0,1 čd na sazenici, jen v oknech výsadby jako
// sad; sazenice je hned mladý stromek a za 60 let dospělý buk (dolní mez 60–80 let – na pasece
// nečeká na nálet). Pařez bez sazenice dorůstá z náletu jako dřív (TREE_REGROWTH_YEARS).
export const BEECH_PLANTING = { manDaysPerTree: 0.1, matureYears: 60 } as const;
// crafts.md – Budovy (Martin): milíř stojí kus od uhlířovy zemnice – odstup v souřadnicích modelu
// (x napříč, z k vchodu, m; totéž MILIR_OFFSET v tools/blender/crafts.py) a čtvercový půdorys
// pro kontrolu místa (kruh milíře Ø ≈ 5,3 m), vyklízí se kruh ušlapané trávy (poloměr m)
export const MILIR = { offset: { x: -9, z: 3 }, footprintM: 6, clearingRadiusM: 4.6 } as const;
// crafts.md – Budovy: přístřešek hrnčíře a kováře sahá před půdorys polozemnice o tolik (m) –
// půdorys dílny je o něj delší (vpředu, +z modelu; přední okraj přístřešku 5,7 m od středu,
// tools/blender/crafts.py PZ_O + PORCH)
export const WORKSHOP_PORCH_M: Readonly<Record<Craft, number>> = {
  potter: 3.2,
  smith: 3.2,
  burner: 0,
};
// crafts.md – Účinek, orchard.md: jablka v nádobách vydrží do 1. 5. místo 1. 3. – s plným pokrytím
// nádobami; při částečném se den zkažení posouvá poměrně (pokrytí × dny od 1. 3. do 1. 5.)
export const APPLE_POTTERY_KEEP_DAY = { month: 5, day: 1 } as const;

/** Práce na řemeslné dílně celkem (u blízkého lesa) – základní obydlí + 30 % (crafts.md). */
export function workshopCost(craft: Craft): number {
  return Math.round(DWELLINGS[CRAFT_BASE[craft]].cost * (1 + WORKSHOP_EXTRA));
}

/** Dřevo řemeslné dílny (stromy) – základní obydlí + 30 % (crafts.md, forest.md). */
export function workshopTrees(craft: Craft): number {
  return Math.round(DWELLING_TREES[CRAFT_BASE[craft]] * (1 + WORKSHOP_EXTRA));
}

/** Práce na dílně bez dřeva – cena dílny minus kácení jejích stromů u blízkého lesa. */
export function workshopBuildLabor(craft: Craft): number {
  return workshopCost(craft) - workshopTrees(craft) * FELLING_MAN_DAYS_PER_TREE;
}

// migration.md – Odchod do nové vsi (návrh Clauda): první zemnice nové vsi na téže mapě stojí
// nejméně 300 m od staveb jiných vsí.
export const NEW_VILLAGE_MIN_DISTANCE_M = 300;
