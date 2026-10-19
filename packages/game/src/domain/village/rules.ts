import type { ObstacleKind } from '../landscape';
import type {
  Bounds,
  CartKind,
  ConstructionKind,
  Craft,
  GraveRank,
  MoundSize,
  Crop,
  DwellingType,
  FallowStage,
  FieldSurface,
  FieldTask,
  OvergrowthStage,
  PlotVariant,
  TaskName,
  TradeGood,
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
  // trade.md – Dvorec vojvody (návrh Clauda, schváleno 18. 10. 2026): delší a vyšší polozemnice,
  // kapacita 10, cena a dřevo jako polozemnice × 1,5 (opravy taky × 1,5), jinak jako polozemnice
  dvorec: {
    capacity: 10,
    cost: 330,
    lifespanYears: 22,
    repairAtEndOfLifePerYear: 25.5,
    childDeathFactor: 0.8,
    emptyLifespanYears: 8,
  },
} as const;
// trade.md – Dvorec vojvody: cena a dřevo dvorce = polozemnice × MANOR.costFactor; pozemek dvou
// políček (dům a dvůr) se hledá při přestavbě jako u polozemnice do PLOT_RELOCATION_M
export const MANOR = { costFactor: 1.5 } as const;
// population.md – Nové obydlí (obyvatelé staví vždy lepší obydlí)
export const BETTER_DWELLING: Record<DwellingType, DwellingType> = {
  zemnice: 'polozemnice',
  polozemnice: 'polozemnice',
  dvorec: 'dvorec',
};
// population.md – Pojmy a Práce (věkové hranice, pracovní síla – Martin 19. 10. 2026: na polích
// a stavbách jen dospělí; výrostci 7–13 let pasou, starší kryjí `elder` čd denní minimum své
// domácnosti), Růst populace (porody od 16 let – oprava podle rešerše, dospělý pro práci
// a odemčení zůstává 14–44); START_AGES: Založení vsi (4 lidé)
export const AGE = { olderChild: 7, adult: 14, fertile: 16, elder: 45 } as const;
export const LABOR_PER_DAY = { adult: 1, elder: 0.5 } as const;
export const START_AGES = [25, 25, 13, 12] as const;
// kinship.md – Pohlaví (návrh Clauda): zakladatelé jsou dva páry – muž a žena 25 let (manželé)
// a chlapec 13 a dívka 12 let (nepříbuzní, rodiče neznámí – vezmou se, až dorostou); pohlaví
// v pořadí START_AGES
export const START_SEXES = ['male', 'female', 'male', 'female'] as const;
// population.md – Růst populace (porodnost podle věku ženy a rozestup porodů – rešerše
// research/2026-10-19-population-growth.md, návrh Clauda 19. 10. 2026; dřív 1/3 porodu ročně
// v každém věku a bez rozestupu): přirozená manželská plodnost (Coale a Trussell 1974 – Henryho
// průměr 13 populací bez plánování rodiny; 16–19 let ≈ 0,9 × 20–24 kvůli nižší plodnosti
// dospívajících) × MARITAL_FERTILITY_LEVEL – manželská plodnost 20–44 let ≈ 7,5 dítěte jako ve
// středoevropských vsích před plánováním rodiny (Henryho průměr ≈ 8,9). Porody na vdanou ženu za
// rok od věku `fromAge` do dalšího pásma, od AGE.elder žádné.
export const NATURAL_MARITAL_FERTILITY = [
  { fromAge: 16, perYear: 0.41 },
  { fromAge: 20, perYear: 0.46 },
  { fromAge: 25, perYear: 0.431 },
  { fromAge: 30, perYear: 0.395 },
  { fromAge: 35, perYear: 0.322 },
  { fromAge: 40, perYear: 0.167 },
] as const;
export const MARITAL_FERTILITY_LEVEL = 0.85;
// Rozestup porodů: po porodu nejdřív za 21 měsíců (9 měsíců těhotenství + rok neplodnosti při
// kojení – kojilo se 2–3 roky), po svatbě za 9 měsíců (těhotenství); mezitím žena nerodí, potom
// rodí s denní šancí, při které průměrný odstup porodů vyjde 1 / plodnost věku (při 20–24 letech
// ≈ 31 měsíců – Macfarlane 2002: 24–39 měsíců).
export const BIRTH_SPACING = { afterBirthDays: 639, afterWeddingDays: 274 } as const;
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
// kinship.md – Pohlaví (návrh Clauda): chlapců se rodí 105 na 100 dívek; rodit může žena 16–44
// s manželem, muž je plodný od 16 let bez horní meze (AGE.fertile, AGE.elder)
export const BOY_SHARE = 105 / 205;
// kinship.md – Sňatky (návrh Clauda): věkový rozdíl snoubenců nejvýš 15 let, když je jeden z nich
// vdovec nebo vdova (už má děti), nejvýš 20 let (Martin, 19. 10. 2026: „Vdova by se měla snažit co
// nejdříve vdát, ideálně ve vesnici.“ – vdovec si bral mladší ženu, mladý muž se přiženil
// k vdově). Z okolí (Martin – varianta c, čísla návrh Clauda): svobodný muž od 18 let bez možné
// nevěsty ve vsi si přivede ženu (16–22 let, starší muž nejvýš o povolený rozdíl mladší, ale do
// 44 let) s pravděpodobností 30 % ročně. Ke svobodné ženě od 18 let bez možného ženicha ve vsi se
// přižení muž z okolí (o 2 roky mladší až o 8 let starší, od 18 let) s 10 % ročně, nebo se s 20 %
// ročně vdá pryč; k vdově, dědičce, která drží dům, nebo k ženě z domu bez mužů se přižení
// s 50 % ročně a pryč se nevdává (Martin, 19. 10. 2026: „aby se populace co nejvíce rozrůstala“ –
// dřív 30 % ročně jen pryč).
export const MARRIAGE = {
  maxAgeGapYears: 15,
  maxAgeGapWidowedYears: 20,
  outsideFromAge: 18,
  brideAge: { from: 16, to: 22 },
  groomAge: { below: 2, above: 8 },
  outside: { bridePerYear: 0.3, groomPerYear: 0.1, awayPerYear: 0.2, favouredGroomPerYear: 0.5 },
} as const;
// kinship.md – Sňatky z okolí (návrh Clauda, kvůli válce – war.md): nevěsta z okolí si pamatuje,
// ze které sousední vsi přišla, a dcera, kam se vdala – směr je los z osmi sousedů
export const NEIGHBOR_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
// fields.md – Zásoby a nasycení (roční potřeba jídla podle věku)
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
// fields.md – Zásoby a nasycení (ztráty při skladování – meze: s hrnčířem 5 %, start se zásobami)
export const STORAGE_LOSS_PER_YEAR: Bounds = { worst: 0.1, best: 0.05 };
export const START_STORES_MONTHS = 18;
// fields.md – Kolik ves oseje, Osev podle stravy (návrh Clauda, Martin schválil směr 19. 10. 2026):
// potřeba z pole = podíl energie, který ves za uplynulý hospodářský rok potřebovala z obilí
// a luštěnin, × dnešní roční potřeba; podíl nejméně minShare = 1 − strop masa (0,4) − strop
// mléka a sýra (0,3) z diet.md – ovoce, vejce a med se do pojistky nepočítají (hlídá test)
export const FIELD_FOOD = { minShare: 0.3 } as const;
// fields.md – Kolik ves oseje, Osev podle zásob (Martin 19. 10. 2026: „Ať se osev řídí také
// zásobami“ a „Ano“ ke zkrácení plánu uprostřed sezóny; čísla návrh Clauda): po příští sklizni má
// ves zásoby z pole na rok spotřeby a k tomu pojistku, která zbude před další sklizní – 0,5 roční
// potřeby celé energie (≈ půl roku celé stravy; se stády podle bílkovin – maso ≈ 11 %, mléko ≈ 10 %
// energie – rostoucí ves, které nestačí práce, ji vybere; kalibrace 20 × 20: hráč staví nasycení
// ≥ 0,95 v 97,1 % let, s 0,3 v 94,2 %); rozjetý plán zkrátí, když převyšuje cíl o víc než desetinu
// roční potřeby z pole (ať ho podzimní mléko a ovoce neubírají po kouscích).
// Plynulejší osev (Martin 19. 10. 2026: „Ano, plynulejší osev určitě.“; čísla návrh Clauda): ves
// seje podle dlouhodobého podílu jídla z pole (každý rok o třetinu rozdílu – balanceYears) na
// cílovou zásobu = pojistka + třetina roční potřeby z pole (cushionYears); odchylku od ní vyrovná
// po třetinách za rok (balanceYears), pod pojistkou doplní chybějící do pojistky hned
export const FIELD_STORES = {
  bufferEnergyYears: 0.5,
  balanceYears: 3,
  cushionYears: 1 / 3,
  trimMarginYears: 0.1,
} as const;
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
// paths.md – Pěšiny a práce, roads.md – Rychlejší chůze (Martin 19. 10. 2026: „berme louku za
// výchozí: 1 vyšlapaná denní cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které zrovna neleží
// ladem: 0.5. Upravená cesta: 1.7 – tyhle hodnoty se týkají chůze.“): po plně prošlapané pěšině
// dne se chodí 1,3× rychleji než po louce, slabší pěšina úměrně méně (návrh Clauda, jako dřív) –
// úsek pěšiny síly s stojí (1 − (1 − 1 / speed) × s) × délka; přes díl pole v osevu pěšina
// nezrychlí (platí FIELD_WALK). Stejná cena v síti pěšin i ve vzdálenosti chůze (fields.md –
// Vzdálenost).
export const PATH_WALK = { speed: 1.3 } as const;
// fields.md – Vzdálenost, paths.md – ceny buněk (Martin 19. 10. 2026: „Pole, které zrovna neleží
// ladem: 0.5.“ a „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“):
// rychlost chůze přes díl pole proti louce – v osevu od orby nebo kopání po sklizeň (zoraný,
// osetý, rostoucí, zralý, ve žni) 0,5, strniště po sklizni 0,8; úhor, příloh a zakládaný díl jako
// louka. Pole není zákaz, jen cena – síť pěšin hledá nejrychlejší cestu („nejkratší cesta je ta
// nejrychlejší“), přes pole jde, když je obcházení delší
export const FIELD_WALK = { crop: 0.5, stubble: 0.8 } as const;
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
  // roads.md – Zarůstá jen nepoužívaný kus (Martin, 19. 10. 2026: „ano“; délka kusu návrh Clauda):
  // provoz se v roční kontrole posuzuje po kusech osy ≈ 25 m
  pieceM: 25,
} as const;
// wagons.md – Vozová síť a vyjeté cesty (Martin, 19. 10. 2026: „Vozy mohou cestu vyjezdit, ale
// nemají takovou prostupnost jako lidé … ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset
// vyjezdit serpentiny.“; čísla návrh Clauda – rešerše fáze 1 je ověří): sklon ve směru jízdy nad
// `maxGrade` vůz nevyjede, pod ním stoupání zdražuje se čtvercem (`gradeCost` při mezi – nejlevnější
// stoupání je polovina meze, proto serpentiny); louka, úhor a strniště 1 (pomaleji než po pevné
// cestě – `roadCost`), zoraný díl a mokřina ještě pomaleji, brod pomalu. Vůz je široký `widthM` –
// kolem domů a plotů se vejde jen tam, kde je místo. Dvoukolák zatočí na krok mřížky o 2 směry ze
// 16 (≤ 53°, poloměr ≈ 4–5 m), čtyřkolák o 1 (≤ 27°, ≈ 8–11 m); každá změna směru trochu stojí
// (`turnCost` m za směr).
// oxen.md – Co nejdelší brázda (Martin, 19. 10. 2026: „Volské spřežení chce rýt co nejdelší
// brázdu – otáčení zabírá čas a snižuje produktivitu.“; čísla návrh Clauda podle rešerše):
// voli s rádlem jdou ≈ 0,64 m/s (pokusy s tažnými voly v Burkině Faso a Etiopii); obrat na
// souvrati ≈ 45 s (vytáhnout rádlo, otočit pár, zarovnat – měření pro voly rešerše nenašla,
// traktory jsou jinde); výkon 0,3 ha za den (PLOUGH_HA_PER_DAY) platí pro brázdu 100 m – kratší
// brázda víc obratů, delší (středověká brázda „furlong“ ≈ 200 m) nejvýš o 15 % víc
export const FURROW = { speedMps: 0.64, turnS: 45, referenceM: 100, maxGain: 1.15 } as const;
// oxen.md – Co nejdelší brázda (Martin, 19. 10. 2026: „na místo se dostane ideálně po nějaké už
// hotové cestě“; návrh Clauda): spřežení jde ráno z ohrady k bloku a večer zpět vozovou sítí jako
// dvoukolák bez nákladu ≈ 0,8 m/s po louce (cesta rychleji); orá se ≈ 6 h denně – cesta tam
// a zpět ubírá orbě dne poměrný díl (nejvýš polovinu)
export const TEAM_TRAVEL = { speedMps: 0.8, dayS: 6 * 3600, maxShare: 0.5 } as const;
export const CART_ROUTES = {
  maxGrade: 0.1,
  gradeCost: 4,
  ploughedCost: 1.6,
  wetCost: 1.8,
  fordCost: 3,
  roadCost: 0.6,
  widthM: 2.5,
  turnSteps: { 'two-wheel': 2, 'four-wheel': 1 },
  turnCost: 1.5,
  /** Hledání končí za takovou cenou (m chůze volů po louce) – dál vůz nevozí. */
  maxCost: 4000,
} as const;
// wagons.md – Vyjeté cesty (návrh Clauda): úsek, kudy vozy dva roky po sobě jezdí aspoň
// `tripsPerDay` jízd denně (roční průměr – ≈ 90 jízd za rok), se stane vozovou cestou; vozová cesta,
// kudy 5 let po sobě jezdí pod polovinou, je zas jen pěší (zaroste podle provozu lidí)
export const CART_ROADS = {
  tripsPerDay: 0.25,
  years: 2,
  dropYears: 5,
  dropShare: 0.5,
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
/**
 * roads.md a fields.md – Cesta ubírá poli plochu (Martin, 19. 10. 2026: „Ano má. Ono to stejně ve
 * výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout
 * takový růžek…“; čísla návrh Clauda): pás pevné cesty v šířce obtisku (vyšlapaná 1,9 m, vozová
 * 2,6 m, upravená a hať 3 m) a plácek rozcestí (poloměr 1,3 × šířka nejširší cesty) se neorou.
 * Kus pole, který cesty oddělí od zbytku, se obdělává, jen když se do něj vejde obrat spřežení
 * (kruh o poloměru ≈ 5 m – plocha `cornerMinM2`) a není to jen proužek užší než `stripMinM` podél
 * cesty – jinak zůstane loukou (mez u cesty). Počítá se po buňkách `cells` × `cells` na čtverec.
 */
export const ROAD_LAND = {
  widthM: { trodden: 1.9, cart: 2.6, improved: 3, causeway: 3 },
  junctionScale: 1.3,
  turnRadiusM: 5,
  cornerMinM2: 80,
  stripMinM: 3,
  cells: 30,
} as const;
/**
 * roads.md – Průsek lesem a trade.md – Zemská stezka (Martin, 19. 10. 2026: „Tam, kde zemská
 * stezka prochází lesem, ať se les vykácí.“; čísla návrh Clauda): kde upravená cesta nebo stezka
 * vede lesem (i lemem do 6 m před ním), vykácí se pruh `halfM` od osy na každou stranu – pás
 * upravené cesty 3 m a 2 m z každé strany, ať se vůz i lidé vejdou a nejdou pod větvemi. V pásu
 * cesty (`roadbedM` od osy) se vyklučí i pařezy a vyberou kameny, po stranách zůstanou pařezy.
 */
export const ROAD_SWATH = { halfM: 3.5, roadbedM: 1.5 } as const;
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
// roads.md – Rychlejší chůze (Martin 19. 10. 2026: „stálá vyšlapaná cesta 1.5“, „Upravená cesta:
// 1.7“): rychlost chůze proti louce – stálá vyšlapaná i vyježděná cesta 1,5×, upravená 1,7×, hať
// a lávka 1,7× i přes mokřinu (návrh Clauda); mokřina bez cesty i po vyšlapané či upravené cestě
// 0,5× (bahno); brod + 30 m (zout se, přebrodit), po lávce bez zdržení. Pevná cesta přes pole jde
// rychlostí cesty (pás cesty se neorá – roads.md, Cesta přes pole)
export const ROAD_WALK = {
  speed: { trodden: 1.5, improved: 1.7, causeway: 1.7 },
  wetSpeed: 0.5,
  causewayWetSpeed: 1.7,
  fordExtraM: 30,
} as const;
// fields.md – Založení pole (nejdál 800 m od obydlí, nejmenší výměra 0,1 ha)
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
// fields.md – Práce (denní minimum domácností – meze: s hrnčířem 0,45); population.md – Práce
export const DAILY_MIN_PER_HOUSEHOLD: Bounds = { worst: 0.5, best: 0.45 };
// population.md – Práce (domácí výroba – obstarají ji z většiny ženy bokem, z práce vsi nebere:
// Martin 19. 10. 2026; čísla jen pro postavy žen u domů – labor-report.ts); oděv z vlny a lnu
// – praní, česání, předení, tkaní a šití – je její součástí (diet.md – Oděv: vlna ≈ 21 čd na
// dospělého a rok z 55 čd `perPerson`), stříž ovcí taky
export const DOMESTIC = { perHousehold: 0.3, perPerson: 0.15 } as const;
/**
 * diet.md – Oděv, Vlna (Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé mohli vůbec
 * oblékat.“; čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md – Vlna):
 * surové (nepráné) vlny na oděv za rok – dospělý a starší 1,6 kg, dítě 0,8 kg (kabátec, kalhoty
 * nebo sukně, plášť, onuce, kápě a díl přikrývek s dobou nošení; spodní oděv je ze lnu); chovná
 * ovce dá za rok 0,8 kg (malé ovce raného středověku, stříž nebo vyčesání v květnu); bez vlny
 * ubere štěstí až 6 (jako ovoce přidá); kronika a upozornění až pod 95 % oděvu (ovce průběžně
 * hynou – stádo právě na hranici by hlásilo drobnosti).
 */
export const WOOL = {
  kgPerYear: { child: 0.8, adult: 1.6, elder: 1.6 },
  kgPerSheep: 0.8,
  unhappiness: 6,
  noticeBelow: 0.95,
} as const;
/**
 * diet.md – Nouzová porážka (Martin 19. 10. 2026: „Ano, udělej to všechno“; podrobnosti návrh
 * Clauda): když výhled jídla do sklizně nevychází, ves dřív, než ubere z přídělu, porazí zvířata
 * navíc v pořadí `order` – prasata (žerou les, ne seno), kozy, krávy nad chovné, ovce nad ovce na
 * vlnu. Porazí tolik, aby výhled vyšel i s rezervou `reserveShare` potřeby energie do sklizně
 * (ztráty zásob skladováním a uzením výhled nezná – bez rezervy by ves porážela den co den po
 * kouscích), a nejvýš tolik, kolik pod stropem masa ve stravě (DIET.caps.meat) pomůže. Když
 * schodek celý nepokryje (málo zvířat navíc, strop masa), porazí jen tehdy, zvedne-li příděl
 * aspoň o `minGain` (2 procentní body) – jinak by po každém úmrtí (méně ovcí na vlnu) porážela
 * po kusech. Letošní mláďata na nouzovou porážku nejdou – kromě selat od `pigletsFromMonth`
 * (1. 9.; diet.md – Nouzová porážka, Martin 19. 10. 2026: „Ano ke všem návrhům“ na „letošní selata
 * smějí od 1. 9. na nouzovou porážku“ – maso se 1. 9. kazí a do podzimní porážky ves hladoví;
 * selata mají v září ≈ 5 měsíců a prasata se na podzim porážela tak jako tak).
 * Chovné prasnice (diet.md – Nouzová porážka; Martin 19. 10. 2026: „Spodní hranice chovných
 * prasnic: v nouzi se smí porážet jen do poloviny toho, kolik prasat uživí les.“): prasata jen nad
 * `pigForestShare` nosnosti lesa pro prasata (tatáž nosnost jako u podzimní porážky –
 * `winterTargets`), aspoň chovný pár – na jaře se stádo zdvojnásobí a obnoví se.
 */
export const EMERGENCY_SLAUGHTER = {
  order: ['pig', 'goat', 'cow', 'sheep'],
  reserveShare: 0.05,
  minGain: 0.02,
  pigForestShare: 0.5,
  pigletsFromMonth: 9,
} as const;
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
// 4 m², na čtverec 15 × 15 m se vejde 56 míst na hroby)
export const CEMETERY = { costPerSquare: 10, graveM2: 4, gravesPerSquare: 56 } as const;
// cemetery.md – Mohyly podle významu (Martin 19. 10. 2026: „Významnější lidé budou mít větší
// mohyly a na prominentnějších místech… Největší mohyly bude mít vojvodova rodina.“; velikosti
// „Ano, udělej to tak.“): místa na hroby ve čtverci po řadách 7 × 8 (= CEMETERY.gravesPerSquare)
// s okrajem 0,5 m od plotu; mohyla zabere `MOUND_SIZES` míst – 2 × 2 (`great`), 2 místa za sebou
// (`large`), 1 (`normal`), 1 malá (`small`).
export const GRAVE_PLACES = { columns: 7, rows: 8, marginM: 0.5 } as const;
export const MOUND_SIZES = {
  great: { columns: 2, rows: 2 },
  large: { columns: 1, rows: 2 },
  normal: { columns: 1, rows: 1 },
  small: { columns: 1, rows: 1 },
} as const;
// cemetery.md – Mohyly podle významu (návrh Clauda): zasloužilá hlava rodiny = nejstarší muž
// domácnosti (bez muže nejstarší žena) nebo jeho manželka, od 35 let a s dítětem; prominence místa
// = hloubka od branky + 2 × vzdálenost od hlavní osy (m – menší je prominentnější); pruh podél osy
// do 2 m (dvě místa) drží běžní dospělí volný pro velké mohyly, dokud mají místo jinde.
export const GRAVE_RANKS = {
  headMinAgeYears: 35,
  lateralWeight: 2,
  laneHalfWidthM: 2,
  manorFrontM: 4,
} as const;
// cemetery.md – Mohyly podle významu, Vojvodova rodina (Martin 19. 10. 2026: „I ve vojvodově
// rodině jsou významnější a méně významní členové.“): velikost mohyly podle druhu pohřbeného
// a menší náhrady, když se nevejde. Vojvoda a jeho žena 2 × 2 s kůlem, ostatní dospělí z dvorce
// 2 místa (jako hlava rodiny), děti z dvorce běžná mohyla na 1 místo, hlava rodiny 2 místa, ostatní
// dospělí 1, děti 1 malá; `manor` – celá vojvodova rodina podle prvního pravidla (jen staré mohyly)
// a pruh podél osy do `manorFrontM` od branky drží vojvodově rodině, dokud mají hlavy rodin jinde.
export const GRAVE_RANK_MOUNDS: Readonly<Record<GraveRank, readonly MoundSize[]>> = {
  voivode: ['great', 'large', 'normal'],
  'manor-adult': ['large', 'normal'],
  'manor-child': ['normal'],
  manor: ['great', 'large', 'normal'],
  head: ['large', 'normal'],
  adult: ['normal'],
  child: ['small'],
};
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
// fields.md – Len (rešerše 2026-10-19-flax.md): jarní len se seje v dubnu (okno jaře březen–duben),
// trhá se po ≈ 100 dnech koncem července – okna jako luštěniny; nemlátí se (semena se drhnou
// v domácí práci)
export const FLAX_WINDOWS: Record<TaskName, readonly WindowSegment[]> = LEGUME_WINDOWS;
/** Okna prací podle plodiny (fields.md – Ozim a jař, Luštěniny, Len). */
export const CROP_WINDOWS: Record<Crop, Record<TaskName, readonly WindowSegment[]>> = {
  winter: WINTER_WINDOWS,
  spring: WINDOWS,
  legume: LEGUME_WINDOWS,
  flax: FLAX_WINDOWS,
};
/**
 * Pořadí plodin při shodě konce okna – len první (je ho málo a bez něj chybí oděv – trhá se
 * v červenci se ozimem a luštěninami), pak ozim (sklízí se dřív), luštěniny před jaří.
 */
export const CROP_ORDER: readonly Crop[] = ['flax', 'winter', 'legume', 'spring'];
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
/**
 * fields.md – Len a diet.md – Oděv (Martin 19. 10. 2026: „A to mi připomíná, že na částech pole
 * musí být zasetý len.“; čísla návrh Clauda podle rešerše 2026-10-19-flax.md): len na plátno –
 * spodní oděv (košile), šátky, ručníky, plachty. Potřeba třeného lnu (vlákno po lámání a třepení)
 * za rok – dospělý a starší 2 kg (≈ 3 m² hrubého plátna ≈ 1 kg látky), dítě 1 kg; výnos 550 kg
 * třeného lnu na hektar při plné úrodnosti (× 0,4 + 0,6 × úrodnost jako obilí – při úrodnosti 70
 * ≈ 450 kg, Skotsko 18. st. 440–550, Irsko 1892 429 kg/ha); osivo je lněné semeno z vlastní
 * úrody (sedmina dílu dozraje) – zásoby neubírá; neopletý díl dá 50 % (len snáší plevel špatně);
 * osev ubere úrodnost dílu 0,18 přirozené (obilí 0,12 – len vysiluje půdu); bez lnu na oděv ubere
 * štěstí až 4 podle chybějícího podílu (vlna až 6). Máčení, lámání, třepení, vochlování, předení
 * a tkaní jsou součástí domácí výroby (`DOMESTIC` – přerozdělení, ne práce navíc: ≈ 20 čd na
 * dospělého za rok, s vlnou ≈ 45 z ≈ 125 čd domácí výroby na dospělého).
 */
export const FLAX = {
  kgPerYear: { child: 1, adult: 2, elder: 2 },
  fiberKgPerHa: 550,
  unweededYield: 0.5,
  sowDepletion: 0.18,
  unhappiness: 4,
} as const;
// fields.md – Len (rešerše: len se vytrhává i s kořenem a váže do hrstí – pokus Ribe ≈ 68 čd/ha
// začátečníků, nástroje nepomohou; pletí jako luštěniny – v pokusu 4×; příprava půdy a setí jako
// jař; nemlátí se) – člověkodny na osetý hektar, meze
export const FLAX_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: FIELD_WORK_PER_HA.dig,
  sow: FIELD_WORK_PER_HA.sow,
  weed: { worst: 40, best: 20 },
  harvest: { worst: 55, best: 55 },
  thresh: { worst: 0, best: 0 },
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

// population.md – Růst populace (porodnost podle věku ženy, NATURAL_MARITAL_FERTILITY)
/** Porody na vdanou ženu věku `age` za rok (0 mimo 16–44 let). */
export function maritalFertility(age: number): number {
  if (age < AGE.fertile || age >= AGE.elder) return 0;
  let perYear = 0;
  for (const band of NATURAL_MARITAL_FERTILITY) if (age >= band.fromAge) perYear = band.perYear;
  return perYear * MARITAL_FERTILITY_LEVEL;
}

// population.md – Umístění obydlí (půdorys zemnice ≈ 4 × 4 m, polozemnice 5 × 5 m, rovina ≤ 0,5 m)
export const DWELLING_FOOTPRINT_M: Record<DwellingType, { width: number; depth: number }> = {
  zemnice: { width: 4, depth: 4 },
  polozemnice: { width: 5, depth: 5 },
  // trade.md – Dvorec (návrh Clauda): srub 5 × 8,4 m s valy – tools/blender/dwellings.py
  dvorec: { width: 6, depth: 9.6 },
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
  dvorec: { minX: -5.4, maxX: 5.4, minZ: -6.4, maxZ: 9.5 },
};
// population.md – Umístění obydlí, Stavba v lese (Martin, 19. 10. 2026: „obydlí může jít postavit
// i v lese – les se prostě vyklučí“; šířka návrh Clauda): v lese osadníci kolem volně stojící
// stavby (obydlí, dílna, modla, svatyně) vyklučí i pruh, nad který by sahaly koruny okolních
// stromů – koruna ≈ 50 m² jako u posvátného dubu (SACRED_OAK.crownM2), poloměr ≈ 4 m. Dům pod
// korunami by stál ve stínu a vlhku a hráč by ho ve scéně neviděl.
export const FOREST_CROWN_MARGIN_M = 4;
// population.md – Umístění obydlí (Martin, 18. 10. 2026): polozemnice stojí na pozemku velkém
// jako jedno políčko pole (15 × 15 m, v mřížce políček), obehnaném polským plotem; dům uprostřed
// nebo v jednom ze čtyř rohů (5 variant), vchodem vždy k brance na přední straně (−z světa,
// natočení π), zbytek pozemku jsou záhony. Zemnice pozemek nemá (volná poloha).
export const PLOT_TYPES: Readonly<Record<DwellingType, boolean>> = {
  zemnice: false,
  polozemnice: true,
  dvorec: true,
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
 * fields.md – Pole jako krajina (Martin, 18. 10. 2026: „Pole by se mělo chovat jako normální
 * krajina. Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“; číslo návrh Clauda):
 * jabloň nebo strom u cesty vezme dílu pole tolik m² – pod korunou (≈ 5 m) se neorá ani neseje.
 */
export const TAKEN_LAND_TREE_M2 = 20;
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
export const DWELLING_TREES: Record<DwellingType, number> = {
  zemnice: 7,
  polozemnice: 18,
  // trade.md – Dvorec: dřevo polozemnice × 1,5
  dvorec: 27,
};
// forest.md – Kácení: skácení a dovoz 2 člověkodny za strom, +1 % za každých 10 m nad 100 m od
// staveniště (vzdálenost jako u polí – DISTANCE). U blízkého lesa stojí stavba práci jako dřív –
// cena obydlí (DWELLINGS.cost) v sobě kácení blízkého lesa už má (dwellingBuildLabor).
export const FELLING_MAN_DAYS_PER_TREE = 2;
// forest.md – Mýcení a hromada klád: dospělý strom z mýcení (pole, hřbitov, staveniště) = 1 kláda
export const LOGS_PER_CLEARED_TREE = 1;
// forest.md – Klády hnijí (Martin – oprava podle rešerše 17. 10. 2026): ≈ 4 % ročně
export const LOG_ROT_PER_YEAR = 0.04;

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
// nebo milíř. Umisťuje se volně jako zemnice (bez pozemku). Tesař (wagons.md – Tesař, návrh
// Clauda): polozemnice s předsazenou střechou jako hrnčíř a kovář.
export const CRAFT_BASE: Readonly<Record<Craft, DwellingType>> = {
  potter: 'polozemnice',
  smith: 'polozemnice',
  burner: 'zemnice',
  carpenter: 'polozemnice',
};
export const WORKSHOP_EXTRA = 0.3;
/**
 * Pořadí řemesel – nabídka staveb a výroba dne (uhlíř první, jeho uhlí může kovář hned použít;
 * tesař poslední – jeho pomoc stavbám se rozdělí už před stavbami dne).
 */
export const CRAFTS: readonly Craft[] = ['burner', 'potter', 'smith', 'carpenter'];
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
// chůzi z dílny platí přirážku vzdálenosti (DISTANCE) na veškerou práci u něj.
// crafts.md – Milíř stojí vždy (Martin 19. 10. 2026; podrobnosti návrh Clauda): uhlíř má vždy
// jeden milíř – vypálený se rozebírá podle odběru kovářů: když uhlí u kováře nestačí na dnešní
// kování, uhlíř donese uhlí na `drawBatchDays` dní kování všech kovářů na plný úvazek; zbytek,
// který stačí jen na dobu přípravy a pálení dalšího milíře, vytahá celý; nový milíř začne, až je
// starý rozebraný.
export const CHARCOAL_KILN = {
  trees: 15,
  prepManDaysPerTree: 6,
  buildManDaysPerTree: 2,
  burnDays: 8,
  drawManDaysPerTree: 2,
  homeReachM: 150,
  drawBatchDays: 30,
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
  // wagons.md – Tesař: předsazená střecha jako u hrnčíře a kováře (pod ní kozlíky a rozdělaný vůz)
  carpenter: 3.2,
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

// wagons.md – Tesař (Martin 19. 10. 2026: tesař vyrábí vozy, dřevěné nářadí a výrazně zrychlí
// dřevěné části staveb; čísla návrh Clauda podle rešerše research/2026-10-19-carts-carpentry.md):
// - výroba: dvoukolák 25 čd a 1 kláda, čtyřkolák 50 čd a 2 klády; dřevěné nářadí 0,5 čd na kg,
//   100 kg ze stromu (klády bere z hromady, bez nich si skácí strom sám jako hrnčíř),
// - práce tesaře (výroba i pomoc stavbám) podle pokrytí nástroji od kováře – meze 1,5 → 1,
// - pomoc stavbám: člověkoden tesaře vede `crew` člověkodny dřevěné práce (tesařská parta, i jeho
//   vlastní); dřevěná část práce stavby podle pokrytí tesařem – meze 1 → 0,6 (WOODWORK_LABOR),
// - podíl dřevěné práce na ceně stavby (i s kácením) podle druhu stavby (`woodShare`; obydlí
//   a dílny podle typu obydlí); pole, sad, hřbitov a jabloně u cest dřevo neopracovávají.
export const CARPENTRY = {
  cartManDays: { 'two-wheel': 25, 'four-wheel': 50 },
  cartLogs: { 'two-wheel': 1, 'four-wheel': 2 },
  woodToolsManDaysPerKg: 0.5,
  woodToolsKgPerLog: 100,
  crew: 4,
  dwellingWoodShare: { zemnice: 0.4, polozemnice: 0.5, dvorec: 0.6 },
  woodShare: { pen: 0.4, ard: 1, idol: 0.8, shrine: 0.3, road: 0.3, repair: 0.3 },
} as const satisfies {
  cartManDays: Record<CartKind, number>;
  cartLogs: Record<CartKind, number>;
  dwellingWoodShare: Record<DwellingType, number>;
  woodShare: Partial<Record<ConstructionKind, number>>;
} & Record<string, unknown>;
// wagons.md – Tesař, Účinek (návrh Clauda podle rešerše): dřevěná část práce stavby s plným
// pokrytím tesařem o 40 % levnější
export const WOODWORK_LABOR: Bounds = { worst: 1, best: 0.6 };
// wagons.md – Tesař (návrh Clauda podle rešerše): práce tesaře bez nástrojů od kováře o polovinu
// pomalejší (sekery, tesly, nebozezy, dláta jsou železné)
export const CARPENTER_TOOLS_WORK: Bounds = { worst: 1.5, best: 1 };
// wagons.md – Tesař, dřevěné nářadí (návrh Clauda podle rešerše): hrábě, vidle, lopaty, cepy,
// násady, kádě – 4 kg na pracujícího od 14 let, 30 % ročně se opotřebí; tesař vyrábí do zásoby =
// potřeba + opotřebení za `reserveYears` (jako kovář – crafts.md, Podle potřeby). Práce vsi podle
// pokrytí – meze 1 → 0,95 (mírně, o jednotky procent – Martin).
export const WOOD_TOOLS = { kgPerWorker: 4, wearPerYear: 0.3, reserveYears: 1 } as const;
export const WOOD_TOOLS_LABOR: Bounds = { worst: 1, best: 0.95 };
// crafts.md – Nákup u sousedů (Martin 19. 10. 2026: „Nástroje ať vesničané obchodují individuálně…
// Sami si spočítají, jestli se jim to vyplatí. Až bude kovář u nás, budou pravděpodobněji nakupovat
// u něj, protože si ušetří cestu. S ostatními řemesly to bude stejné.“; čísla návrh Clauda podle
// rešerše research/2026-10-19-craft-buying.md):
// - `day` – ves se rozhoduje jednou za rok po sklizni, kdy je volno a přebytek (15. 11. – po ozimu,
//   sklizni jablek a porážce),
// - `crafts` – řemeslníci souseda podle toho, čím se živí (trade.md – Sousedé): řemeslníci mají
//   kováře, hrnčíře i tesaře jistě, ostatní někdy (pravděpodobnost, ze seedu vsi a směru),
// - `woodToolsValueKg` – hodnota kg dřevěného nářadí v kg obilí (≈ 0,5 čd na kg – rešerše vozů;
//   nástroje 60 a keramika 3 – TRADE_GOOD_VALUES),
// - cesta po hotové zemské stezce `trailTripDays`, bez stezky lidé jdou krajinou ke kraji mapy –
//   delší cesta (× `offTrailFactor`) a den navíc (`offTrailExtraDays`),
// - jde malá skupina – nejvýš `groupShare` dospělých vsi (aspoň 1, nejvýš `maxGroup`); kdo nese
//   víc, jde vícekrát (dny × kola), ale nejvýš `maxDays` dní (přes zimu) – víc ves koupí příští
//   rok; nosič unese TRADE.porterKg,
// - výrobek slouží 1 ÷ opotřebení let – ves porovná práci ušetřenou za ty roky s prací za platbu
//   (obilí a luštěniny – cena jídla v práci, economy.ts) a cestu (lidé × dny tam a zpět),
// - `minKg` – menší nákup nemá smysl.
export const CRAFT_BUYING = {
  day: { month: 11, day: 15 },
  crafts: {
    crafters: { smith: 1, potter: 1, carpenter: 1 },
    farmers: { smith: 0.5, potter: 0.4, carpenter: 0.3 },
    herders: { smith: 0.3, potter: 0.4, carpenter: 0.2 },
    woodsmen: { smith: 0.4, potter: 0.2, carpenter: 0.6 },
  },
  woodToolsValueKg: 2,
  offTrailFactor: 1.5,
  offTrailExtraDays: 1,
  groupShare: 0.5,
  maxGroup: 8,
  maxDays: 60,
  minKg: 0.5,
} as const;
// wagons.md – Vůz (Martin 19. 10. 2026: vozy vozí seno, snopy, klády a zboží výprav místo nosičů;
// jeden vůz na spřežení – návrh Clauda; čísla návrh Clauda podle rešerše): dvoukolák 400 kg,
// čtyřkolák 800 kg (jen po stezce – obchod), vůz slouží 10 let. Vůz za den odveze tolik jako
// `carrierManDays` nosičů a jdou s ním `crew` lidé (honák a nakladač) – kde dojede, ušetří 6 čd.
// Převezme odnos snopů (podíl odnosu na sklizni – HARVEST_WORK_PER_HA), `haulShare.hay` seče
// (svoz a stohování) a `haulShare.logs` kácení a dovozu klád ke stavbám. Ves s vycvičeným spřežením
// chce dvoukolák na každé spřežení a s hotovou zemskou stezkou navíc jeden čtyřkolák.
// Kládu z lesa ke kraji, kam vůz dojede, vlečou lidé – `dragM`; k dílu pole a louce vůz dojede,
// když je do `reachM` od středu čtverce (kraj dílu – jako roční síť vozů). Vůz za den udělá
// `loadsPerCartDay` jízd (rešerše: nakládka a jízda ≈ 50 min na náklad) – jízdy svozu jdou do
// ročního provozu cest (vyjeté cesty – roads.md, Vozové cesty).
export const CARTS = {
  loadKg: { 'two-wheel': 400, 'four-wheel': 800 },
  lifespanYears: 10,
  carrierManDays: 8,
  crew: 2,
  haulShare: { hay: 0.25, logs: 0.5 },
  dragM: 30,
  reachM: 9,
  loadsPerCartDay: 8,
  tradeCrew: 2,
} as const satisfies { loadKg: Record<CartKind, number> } & Record<string, unknown>;

// migration.md – Odchod do nové vsi (návrh Clauda): první zemnice nové vsi na téže mapě stojí
// nejméně 300 m od staveb jiných vsí.
export const NEW_VILLAGE_MIN_DISTANCE_M = 300;

// trade.md – Zemská stezka (návrh Clauda): trasa od dvorce ke kraji mapy nejlevnější chůzí po
// terénu pěšin (svahy, brody, les, překážky) – cíl do TRAIL.edgeBandM od kraje schůdné krajiny
// v rozmezí ±coneDeg od směru (když tudy cesta nevede, ±wideConeDeg); po pevné cestě poloviční
// cena chůze jako v síti pěšin (trasa se k ní stáhne a vede po ní)
export const TRAIL = { coneDeg: 22.5, wideConeDeg: 45, edgeBandM: 20, roadDiscount: 0.5 } as const;
// trade.md – Obchod (návrh Clauda, schváleno 18. 10. 2026): výměna podle hodnot v kg obilí. Soused
// bere s přirážkou ≈ 20 % (prodává o ni dráž, kupuje o ni levněji), co shání, za to dá o 20 % víc,
// co nabízí, dá o 20 % levněji: ves za sháněné zboží dostane hodnotu ÷ 1,2 × 1,2 = 1 × hodnota,
// nabízené zboží platí hodnotou × 1,2 × 0,8 = 0,96. Nosič unese 25 kg (dobytek se žene – honák na
// 10 kusů, návrh Clauda); cesta tam a zpět 2–6 dní podle délky stezky (2 dny do 400 m, každých
// dalších 250 m den navíc – návrh Clauda) + 1 den za krajem mapy. Zásoby a poptávka sousedů se
// doplní 1. 11. Ves si nechá aspoň 2 krávy (chovný pár – návrh Clauda).
export const TRADE = {
  markup: 0.2,
  demandBonus: 0.2,
  offerDiscount: 0.2,
  porterKg: 25,
  headsPerDrover: 10,
  tripDays: { min: 2, max: 6, fromM: 400, perDayM: 250 },
  beyondEdgeDays: 1,
  restockDay: { month: 11, day: 1 },
  keepCows: 2,
} as const;
// trade.md – Sousedé (Martin 19. 10. 2026: „Nech jen společné suroviny, nezaváděj nové.“ – soused
// obchoduje jen se zbožím, které má i ves; druhy sousedů návrh Clauda): soused se něčím živí – to
// nabízí (2–3 druhy ze své nabídky `offers`, je-li jich tolik) – a shání, čeho sám nemá dost (2–3
// druhy: `always` vždy, zbytek ze svých potřeb `needs`); nabízené a sháněné se nepřekrývají. Kolem
// vsi je každý druh souseda dvakrát (8 směrů), takže co ves potřebuje, to některý soused nabízí,
// a co jí přebývá (obilí, maso, sýr, klády po mýcení), to některý shání. Roční zásoba každého
// nabízeného zboží v hodnotě 600–1 500 kg obilí, poptávka po sháněném 800–2 000 kg obilí.
export const NEIGHBOURS = {
  offers: { min: 2, max: 3 },
  demands: { min: 2, max: 3 },
  supplyKg: { from: 600, to: 1500 },
  demandKg: { from: 800, to: 2000 },
  kinds: {
    // obilnáři z bezlesé roviny – obilí, luštěniny, dobytek; klády vždy
    farmers: {
      offers: ['grain', 'legumes', 'cattle'],
      always: 'logs',
      needs: ['meat', 'cheese', 'pottery', 'tools', 'charcoal'],
    },
    // pastevci – dobytek, maso, sýr; obilí vždy
    herders: {
      offers: ['cattle', 'meat', 'cheese'],
      always: 'grain',
      needs: ['legumes', 'logs', 'pottery', 'tools'],
    },
    // lesní ves (dřevaři a uhlíři) – klády, uhlí, maso; obilí vždy
    woodsmen: {
      offers: ['logs', 'charcoal', 'meat'],
      always: 'grain',
      needs: ['legumes', 'cheese', 'pottery', 'tools'],
    },
    // řemeslníci (hrnčíři a kováři) – keramika, nástroje; obilí vždy
    crafters: {
      offers: ['pottery', 'tools'],
      always: 'grain',
      needs: ['legumes', 'meat', 'cheese', 'logs', 'charcoal', 'cattle'],
    },
  },
} as const satisfies Record<string, unknown> & {
  kinds: Record<
    string,
    { offers: readonly TradeGood[]; always: TradeGood; needs: readonly TradeGood[] }
  >;
};
// trade.md – Obchod, hodnoty zboží v kg obilí (rešerše research/2026-10-18-trade-values.md, návrh
// Clauda): obilí 1, luštěniny 1, maso 3, sýr 4, keramika 3, uhlí 0,5, nástroje 60 (kg), kráva 600,
// kláda 40 (kus). `carryKg` – kolik váží kus pro nosiče (kláda vleče 4 nosiči = 100 kg; dobytek se
// žene – `TRADE.headsPerDrover`)
export const TRADE_GOOD_VALUES = {
  grain: { valueKg: 1, carryKg: 1 },
  legumes: { valueKg: 1, carryKg: 1 },
  meat: { valueKg: 3, carryKg: 1 },
  cheese: { valueKg: 4, carryKg: 1 },
  pottery: { valueKg: 3, carryKg: 1 },
  charcoal: { valueKg: 0.5, carryKg: 1 },
  tools: { valueKg: 60, carryKg: 1 },
  cattle: { valueKg: 600, carryKg: 0 },
  logs: { valueKg: 40, carryKg: 100 },
} as const satisfies Record<TradeGood, { valueKg: number; carryKg: number }>;
// trade.md – Výměna lidí (Martin 19. 10. 2026: „Se sousedem půjde vyměnit i lidi... např. když on
// jich bude mít moc a nebude je moci uživit, může jich pár vyměnit s námi za nějaké suroviny
// a opačně.“, „Mohou se stěhovat celé rodiny i jen dospělí. Podle toho, co je v nabídce.“; čísla
// návrh Clauda): dospělý má hodnotu ≈ dvouleté spotřeby jídla (2 × 180 kg obilí), dítě do 14 let
// polovinu, přirážky jako u zboží. Rok obchodu: soused má s pravděpodobností 40 % lidi navíc
// (0–2 rodiny a 0–3 svobodné dospělé, aspoň jednoho člověka), s 30 % lidi shání (vezme 0–2 rodiny
// a 0–3 dospělé, aspoň jednoho), jinak lidi nemění. Rodina souseda: muž 24–38 let, žena o 0–6 let
// mladší (nejméně 18 + 3 roky na dítě), 0–3 děti – nejmladší 0–2 roky, mezi dětmi 2–3 roky;
// svobodný dospělý muž nebo žena 16–26 let. Muži a ženy zvlášť (Martin 19. 10. 2026): pohlaví
// každého svobodného dospělého souseda se losuje 1 : 1 už v nabídce a poptávce.
export const PEOPLE_TRADE = {
  adultValueKg: 360,
  childShare: 0.5,
  surplusChance: 0.4,
  shortageChance: 0.3,
  families: { min: 0, max: 2 },
  adults: { min: 0, max: 3 },
  children: { min: 0, max: 3 },
  husbandAge: { from: 24, to: 38 },
  wifeYounger: { from: 0, to: 6 },
  wifeMinAge: 18,
  wifeYearsPerChild: 3,
  youngestChildAge: { from: 0, to: 2 },
  childSpacing: { from: 2, to: 3 },
  adultAge: { from: 16, to: 26 },
} as const;
// abandonment.md – Chátrání (Martin 18. 10. 2026: „stavby, kam nikdo nechodí, budou postupně
// chátrat a rozpadnou se“; čísla návrh Clauda podle rešerše research/2026-10-18-abandonment.md):
// opuštěná stavba spadne za `fallYears` let od plného stavu – modla (dubový kůl Ø 0,5 m v zemi)
// 20, svatyně (kůl ×1,55) 30, pletený plot hřbitova 10, ohrada bez zvířat (přístřešek s došky,
// pletený plot) 10; zbytek padlé modly leží 10 let, zarostlý příkop svatyně 20 let. Stavba
// dokončená za poslední rok opuštěná není – lidé k ní chodili stavět.
export const ABANDONMENT = {
  fallYears: { idol: 20, shrine: 30, 'cemetery-fence': 10, pen: 10 },
  remnantYears: { idol: 10, shrine: 20 },
  graceDays: 365,
} as const;
// abandonment.md – Oprava (Martin 19. 10. 2026: vesničané plot hřbitova opraví sami, jakmile se
// ke hřbitovu zase chodí – postupně z práce vsi, spadlý postaví znovu; „ano“ i pro modlu, svatyni
// a ohradu; podíly návrh Clauda): stavba, ke které se zase chodí, se opraví stavbou ze společné
// práce – práce = `share` z ceny stavby bez kácení × chybějící stav. Opravuje se jen to, co
// chátrá: plot hřbitova je třetina vytyčení a ohrazení (10 čd na čtverec → 3 čd na čtverec
// i u spadlého plotu); u modly a svatyně řezba, kůl z dubu a příkop vydrží – oprava je znovu
// usadit a zaklínovat modlu, očistit ji, vyčistit příkop a založit ohniště (čtvrtina); ohrada je
// z poloviny pletený plot a došky, které hnijí (plot 7–8 let, sláma bez údržby 15–20) – sloupy
// a jesle vydrží (polovina). Dřevo oprava nebere (pruty, sláma a drn nejsou surovina).
export const STRUCTURE_REPAIR = {
  share: { idol: 0.25, shrine: 0.25, 'cemetery-fence': 0.3, pen: 0.5 },
} as const;

// migration.md – Odchod do nové vsi (návrh Clauda): s sebou jídlo, které unesou – 25 kg na
// člověka od 7 let, nejvýš poměrný díl zásob vsi podle počtu lidí; cesta na novou mapu 1–3 dny
// podle vzdálenosti ke kraji mapy (každých `perDayM` metrů den), po hotové zemské stezce 1 den.
export const LEAVING = {
  carryKgPerPerson: 25,
  carryFromAge: 7,
  travelDays: { min: 1, max: 3, perDayM: 400 },
} as const;

// oxen.md – Seno (Martin 19. 10. 2026: „Nezdá se mi, že bychom sklízeli tolik sena, že by to stáda
// uživilo“; čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md): seč kosou
// ≈ akr (0,4 ha) za den, krátkou kosou a srpem méně, obracení, sušení, hrabání do kup, svoz
// a stohování – celkem 10–15 člověkodní na hektar louky. Nejlepší mez s nástroji od kováře (kosy),
// nejhorší bez nich. Dřív 6 člověkodní (jen seč).
export const HAY_WORK_PER_HA: Bounds = { worst: 15, best: 10 };
