import { DIRECTIONS, type TrailOption } from '@bohemia/game';
import type { VillageManor, VillageNeighbour } from '@/lib/manor-view';
import type { SelectionDetails, SelectionLeave } from '@/lib/selection-details';
import type { VillageListItem } from '@/lib/village-list';
import type { BuildOption } from '@/lib/village-view';

// Ukázková data panelu výběru pro vývojovou stránku /dev/panels – nejbohatší objekty (dvorec
// s vylepšeními a obchodem, obydlí s rodinami a přestavbou, víc obydlí, dílny, ohrada, pole a díly
// pole, sad a čtverec sadu, cesta, rudiště kováře)
// i malé (posvátný dub, staveniště) vedle sebe, ať jde rozvržení panelu zkontrolovat bez hry.

const option = (affordable: boolean, wood: number, missing = 0): BuildOption => ({
  laborManDays: 64,
  perHa: false,
  perSquare: false,
  upfront: [{ resource: 'wood', amount: wood, missing }],
  blocked: null,
  affordable,
});

const relocate = { zemnice: option(true, 7), polozemnice: option(false, 18, 6) };

const leave: SelectionLeave = {
  households: [3],
  people: 9,
  foodKg: 175,
  directions: DIRECTIONS.map((direction) => ({
    direction,
    days: direction === 'E' ? 1 : 2,
    blocked: direction === 'W' ? 'Tím směrem leží tvoje ves Budeč.' : null,
  })),
};

const trails: TrailOption[] = DIRECTIONS.map((direction) => ({
  direction,
  status: direction === 'E' ? 'built' : direction === 'S' ? 'building' : 'none',
  progress: direction === 'E' ? 1 : direction === 'S' ? 0.45 : 0,
  lengthM: direction === 'N' ? null : 820,
  laborManDays: 131.4,
  trees: 6,
  treesToFell: 2,
  swathTrees: direction === 'W' ? 37 : 0,
  tripDays: direction === 'N' ? null : 5,
  blocked:
    direction === 'N'
      ? 'Ke kraji mapy tudy cesta nevede – zahrazuje ji voda nebo sráz.'
      : direction === 'E'
        ? 'Stezka tímto směrem už vede.'
        : direction === 'S'
          ? 'Stezka tímto směrem se už staví.'
          : null,
}));

const NOBODY = { families: 0, men: 0, women: 0 };

const neighbours: VillageNeighbour[] = [
  {
    direction: 'E',
    name: 'Stará Boleslav',
    lengthM: 820,
    tripDays: 5,
    offers: [
      { good: 'pottery', price: 2.88, left: 400 },
      { good: 'tools', price: 57.6, left: 20 },
    ],
    demands: [
      { good: 'grain', price: 1, left: 1500, have: 12400 },
      { good: 'cheese', price: 4, left: 300, have: 1450 },
      { good: 'logs', price: 40, left: 40, have: 26 },
    ],
    // soused má letos lidi navíc – rodinu se dvěma dětmi, svobodného muže a dvě svobodné ženy
    // (trade.md – Výměna lidí, muži a ženy zvlášť)
    people: {
      offers: { families: [{ people: 4, price: 1036.8 }], men: 1, women: 2, adultPrice: 345.6 },
      takes: NOBODY,
      have: { families: [], men: 0, women: 0, adultCredit: 360 },
    },
    expedition: null,
    // ves má čtyřkolák a spřežení doma – náklad jde na vůz (wagons.md – Obchod)
    carts: ['four-wheel'],
  },
  {
    direction: 'S',
    name: 'Kouřim',
    lengthM: 1200,
    tripDays: 7,
    offers: [
      { good: 'cattle', price: 576, left: 2 },
      { good: 'meat', price: 2.88, left: 350 },
    ],
    demands: [{ good: 'grain', price: 1, left: 1800, have: 12400 }],
    // soused lidi shání – ves by dala rodinu ze tří a svobodnou ženu
    people: {
      offers: { families: [], men: 0, women: 0, adultPrice: 345.6 },
      takes: { families: 1, men: 1, women: 1 },
      have: { families: [{ people: 3, credit: 900 }], men: 0, women: 1, adultCredit: 360 },
    },
    // výprava stojí – po denním minimu nezbyl nikdo, kdo by šel (výjimka – malá ves)
    expedition: {
      give: { meat: 289 },
      get: {},
      givePeople: NOBODY,
      getPeople: { families: 0, men: 1, women: 1 },
      porters: 12,
      carts: 0,
      days: 5,
      progress: 0.6,
      daysLeft: null,
      pace: 'waiting',
      today: 0,
    },
    carts: [],
  },
  {
    direction: 'W',
    name: 'Mokrá',
    lengthM: 960,
    tripDays: 6,
    offers: [{ good: 'tools', price: 57.6, left: 20 }],
    demands: [{ good: 'grain', price: 1, left: 1200, have: 12400 }],
    people: {
      offers: { families: [], men: 0, women: 0, adultPrice: 345.6 },
      takes: NOBODY,
      have: { families: [], men: 0, women: 0, adultCredit: 360 },
    },
    // výprava s vozem jde pomaleji – volné práce je míň, než je lidí výpravy
    expedition: {
      give: { grain: 900 },
      get: { tools: 15 },
      givePeople: { families: 1, men: 0, women: 0 },
      getPeople: NOBODY,
      porters: 4,
      carts: 1,
      days: 6,
      progress: 0.35,
      daysLeft: 6,
      pace: 'slow',
      today: 2.6,
    },
    carts: [],
  },
];

const manor: VillageManor = { dwellingId: 3, trails, neighbours };

const dwelling = (
  over: Partial<Extract<SelectionDetails, { kind: 'dwelling' }>> = {},
): SelectionDetails => ({
  kind: 'dwelling',
  id: 3,
  type: 'polozemnice',
  occupants: 8,
  family: { men: 2, women: 3, boys: 1, girls: 1, elderMen: 0, elderWomen: 1, couples: 2 },
  capacity: 8,
  ages: [61, 34, 31, 27, 24, 11, 6, 2],
  condition: 0.72,
  ageYears: 23,
  full: true,
  overcrowded: false,
  rebuild: null,
  workshop: null,
  relocation: null,
  relocate,
  manor: null,
  leave,
  ...over,
});

const pen = (over: Partial<Extract<SelectionDetails, { kind: 'pen' }>> = {}): SelectionDetails => ({
  kind: 'pen',
  id: 90,
  species: 'team',
  squares: 1,
  places: 6,
  animals: 4,
  herdPlaces: null,
  extension: null,
  built: true,
  progress: 1,
  oxen: 4,
  oxenVillage: {
    trained: 2,
    training: 2,
    places: 6,
    wanted: 8,
    overRoom: true,
    ploughPairs: 2,
    teams: 1,
    ards: 2,
    carts: { 'two-wheel': 2, 'four-wheel': 1 },
    cartTargets: { 'two-wheel': 4, 'four-wheel': 1 },
  },
  cows: 11,
  herds: { sheep: 128, goat: 37, pig: 64, cow: 22 },
  chickens: 146,
  pastureHa: 141.5,
  grazingHa: 98.4,
  milkLPerDay: 186,
  team: { ageYears: 8, yearsLeft: 2 },
  training: { progress: 0.35, daysLeft: 438 },
  hayKg: 41_200,
  condition: 0.62,
  abandoned: false,
  repair: null,
  ...over,
});

/** Ukázky panelu – klíč (`?panel=`), popisek tlačítka na stránce a data. */
export const DEV_PANELS: readonly { key: string; label: string; details: SelectionDetails }[] = [
  {
    key: 'dvorec',
    label: 'Dvorec',
    details: dwelling({
      type: 'dvorec',
      occupants: 12,
      capacity: 10,
      full: true,
      overcrowded: true,
      family: { men: 3, women: 4, boys: 2, girls: 2, elderMen: 1, elderWomen: 0, couples: 3 },
      ages: [63, 41, 38, 35, 33, 29, 26, 14, 11, 8, 5, 1],
      rebuild: { progress: 0.3, type: 'dvorec', treesToFell: 7 },
      manor,
      // nákup u sousedů (crafts.md): nástroje a keramika u souseda, dřevěné nářadí od vlastního
      // tesaře; skupina jde pro nástroje na sever
      buying: {
        sources: [
          { product: 'toolsKg', own: false, direction: 'N', days: 6, trail: true },
          { product: 'potteryKg', own: false, direction: 'NE', days: 8, trail: false },
          { product: 'woodToolsKg', own: true, direction: null, days: null, trail: false },
        ],
        purchases: [
          {
            direction: 'N',
            get: { toolsKg: 9.1, potteryKg: 40 },
            payKg: 640,
            group: 4,
            daysLeft: 11,
            progress: 0.4,
          },
        ],
      },
    }),
  },
  {
    key: 'obydli',
    label: 'Obydlí',
    details: dwelling(),
  },
  {
    key: 'stehovani',
    label: 'Stěhování',
    details: dwelling({
      relocate: null,
      relocation: { constructionId: 12, type: 'polozemnice', progress: 0.35, treesToFell: 4 },
      rebuild: null,
    }),
  },
  {
    key: 'vic-obydli',
    label: 'Víc obydlí',
    details: {
      kind: 'dwellings',
      ids: Array.from({ length: 14 }, (_, i) => i + 1),
      households: 13,
      people: 87,
      relocatable: [1, 2, 3, 5, 8],
      relocate,
      leave: { ...leave, households: [1, 2, 3, 5, 8], people: 34, foodKg: 680 },
    },
  },
  {
    key: 'uhlir',
    label: 'Uhlíř',
    details: dwelling({
      type: 'zemnice',
      occupants: 5,
      capacity: 6,
      full: false,
      family: { men: 1, women: 1, boys: 2, girls: 0, elderMen: 1, elderWomen: 0, couples: 1 },
      ages: [58, 32, 29, 7, 3],
      workshop: {
        craft: 'burner',
        activity: 'felling',
        laborPerDay: 1.8,
        outputPerDayKg: 0,
        stockKg: 1240,
        coverage: null,
        kiln: { stage: 'wood', prepared: 3, trees: 8, progress: 0.4, charcoalKg: 0, forest: true },
        toPlant: 12,
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: null,
      },
    }),
  },
  {
    key: 'uhlir-milir',
    label: 'Uhlíř – vypálený milíř',
    details: dwelling({
      type: 'zemnice',
      occupants: 4,
      capacity: 6,
      full: false,
      family: { men: 1, women: 1, boys: 1, girls: 1, elderMen: 0, elderWomen: 0, couples: 1 },
      ages: [34, 31, 9, 6],
      workshop: {
        craft: 'burner',
        activity: 'resting',
        laborPerDay: 1.6,
        outputPerDayKg: 0,
        stockKg: 1150,
        coverage: null,
        kiln: {
          stage: 'draw',
          prepared: 15,
          trees: 15,
          progress: 0.4,
          charcoalKg: 1080,
          forest: false,
        },
        toPlant: 0,
        // nový uhlíř se teprve učí (crafts.md – Učení řemesla)
        skill: { share: 0.62, years: 1.2, apprentices: [] },
        carpenter: null,
      },
    }),
  },
  {
    key: 'kovar',
    label: 'Kovář',
    details: dwelling({
      workshop: {
        craft: 'smith',
        activity: 'no-charcoal',
        laborPerDay: 0,
        outputPerDayKg: 0.8,
        stockKg: 312,
        coverage: 0.64,
        kiln: null,
        toPlant: 0,
        // kovář vychovává nástupce – syn 11 let se učí (crafts.md – Učení řemesla)
        skill: { share: 1, years: 5, apprentices: [{ age: 11, years: 1.4 }] },
        carpenter: null,
        // kovář nemá uhlí – vesničané dokupují nástroje u souseda (crafts.md)
        buying: { direction: 'N', days: 6 },
      },
    }),
  },
  {
    // crafts.md – Uhlí a ruda kováře: rudiště pěšky – kovář se synem kopou, kovář nosí rudu
    key: 'rudiste',
    label: 'Rudiště',
    details: {
      kind: 'ore-site',
      smithId: 12,
      leftKg: 2140,
      depositKg: 3000,
      heapKg: 35,
      stockKg: 96,
      walkM: 186,
      pits: 5,
      workers: [
        { age: 41, smith: true, digs: true, carries: true, rides: false },
        { age: 15, smith: false, digs: true, carries: false, rides: false },
      ],
      cart: false,
    },
  },
  {
    // rudiště s vozem – hromada u jámy, sedlák s vozem a kovář s ním odváží rudu
    key: 'rudiste-vuz',
    label: 'Rudiště – vůz',
    details: {
      kind: 'ore-site',
      smithId: 12,
      leftKg: 380,
      depositKg: 3000,
      heapKg: 412,
      stockKg: 8,
      walkM: 342,
      pits: 9,
      workers: [{ age: 41, smith: true, digs: false, carries: false, rides: true }],
      cart: true,
    },
  },
  {
    // wagons.md – tesař: vyrábí dvoukolák, vozy vsi proti potřebě a pokrytí dřevěné práce staveb
    key: 'tesar',
    label: 'Tesař',
    details: dwelling({
      workshop: {
        craft: 'carpenter',
        activity: 'producing',
        laborPerDay: 1.6,
        outputPerDayKg: 3.2,
        stockKg: 46,
        coverage: 0.72,
        kiln: null,
        toPlant: 0,
        // nový tesař (crafts.md – Učení řemesla)
        skill: { share: 0.55, years: 0.5, apprentices: [] },
        carpenter: {
          carts: [
            { id: 1, kind: 'two-wheel', condition: 0.6, away: false },
            { id: 2, kind: 'four-wheel', condition: 0.9, away: true },
          ],
          cartTargets: { 'two-wheel': 2, 'four-wheel': 1 },
          making: { kind: 'two-wheel', progress: 0.35 },
          woodworkCoverage: 0.8,
          iron: null,
        },
      },
    }),
  },
  {
    key: 'tesar-stavby',
    label: 'Tesař pomáhá stavbám',
    details: dwelling({
      workshop: {
        craft: 'carpenter',
        activity: 'helping',
        laborPerDay: 1.6,
        outputPerDayKg: 3.2,
        stockKg: 64,
        coverage: 1,
        kiln: null,
        toPlant: 0,
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: {
          carts: [{ id: 1, kind: 'two-wheel', condition: 0.9, away: false }],
          cartTargets: { 'two-wheel': 1, 'four-wheel': 0 },
          making: null,
          woodworkCoverage: 0.45,
          iron: null,
        },
      },
    }),
  },
  {
    // wagons.md – Kování vozů: ves bez kováře – syn tesaře jde pro kování k sousedovi
    key: 'tesar-kovani',
    label: 'Tesař – syn jde pro kování',
    details: dwelling({
      workshop: {
        craft: 'carpenter',
        activity: 'producing',
        laborPerDay: 0.8,
        outputPerDayKg: 1.6,
        stockKg: 52,
        coverage: 0.8,
        kiln: null,
        toPlant: 0,
        skill: {
          share: 1,
          years: 5,
          apprentices: [
            { age: 15, years: 4.1 },
            { age: 10, years: 0.2 },
          ],
        },
        carpenter: {
          carts: [],
          cartTargets: { 'two-wheel': 1, 'four-wheel': 0 },
          making: { kind: 'two-wheel', progress: 1 },
          woodworkCoverage: 0,
          iron: {
            kg: 3,
            trip: { to: 'Lhota', direction: 'NE', daysLeft: 3, son: true, age: 15 },
          },
        },
      },
    }),
  },
  {
    key: 'tesar-ceka',
    label: 'Tesař – vůz čeká na kování',
    details: dwelling({
      workshop: {
        craft: 'carpenter',
        activity: 'resting',
        laborPerDay: 1.6,
        outputPerDayKg: 3.2,
        stockKg: 80,
        coverage: 1,
        kiln: null,
        toPlant: 0,
        skill: { share: 1, years: 5, apprentices: [] },
        carpenter: {
          carts: [],
          cartTargets: { 'two-wheel': 1, 'four-wheel': 0 },
          making: { kind: 'two-wheel', progress: 1 },
          woodworkCoverage: 0,
          iron: { kg: 3, trip: null },
        },
      },
    }),
  },
  { key: 'ohrada', label: 'Ohrada', details: pen() },
  {
    // ohrada ovcí, do které se stádo nevejde (oxen.md – Co hráč vidí)
    key: 'ohrada-ovce',
    label: 'Ohrada ovcí',
    details: pen({
      species: 'sheep',
      places: 130,
      animals: 130,
      herdPlaces: { pens: 130, home: 12, needed: 168 },
      oxen: 0,
      cows: 0,
      team: null,
      training: null,
    }),
  },
  {
    key: 'ohrada-opustena',
    label: 'Ohrada opuštěná',
    details: pen({
      oxen: 0,
      cows: 0,
      team: null,
      training: null,
      milkLPerDay: 0,
      condition: 0.31,
      abandoned: true,
    }),
  },
  {
    key: 'pole',
    label: 'Pole',
    details: {
      kind: 'field',
      id: 5,
      areaM2: 312_500,
      fertility: 64.4,
      stages: [
        { stage: 'founding', count: 12 },
        { stage: 'ready', count: 34 },
        { stage: 'sown', count: 418 },
        { stage: 'young-fallow', count: 96 },
        { stage: 'meadow', count: 210 },
        { stage: 'shrubs', count: 41 },
        { stage: 'young-forest', count: 17 },
      ],
      surfaces: [
        { surface: 'meadow', count: 604 },
        { surface: 'shrub', count: 112 },
        { surface: 'forest', count: 112 },
      ],
      crops: [
        { crop: 'winter', count: 204 },
        { crop: 'spring', count: 158 },
        { crop: 'legume', count: 56 },
      ],
      ashParts: 24,
      ashBonus: 40,
      overgrowingM2: 13_050,
      founding: 0.42,
    },
  },
  {
    key: 'pole-dil',
    label: 'Díl pole – oseto',
    details: {
      kind: 'field-part',
      id: 5,
      cell: { x: 4, y: 7 },
      look: 'ripe',
      stage: 'sown',
      legume: false,
      flax: false,
      bloom: false,
      ploughed: true,
      areaM2: 186,
      fertility: 82,
      naturalFertility: 64,
      ashBonus: 20,
      surface: 'forest',
      walkM: 1240,
      holding: { dwellingId: 3, type: 'polozemnice' },
      sownYears: 1,
      fallowYears: null,
      overgrowthYears: 0,
      grazed: null,
      crop: { crop: 'winter', prep: { task: 'plough', share: 1 }, sow: 1, harvest: 0.45 },
      mow: null,
      founding: null,
    },
  },
  {
    key: 'pole-dil-priloh',
    label: 'Díl pole – příloh',
    details: {
      kind: 'field-part',
      id: 5,
      cell: { x: 5, y: 7 },
      look: 'mown',
      stage: 'meadow',
      legume: false,
      flax: false,
      bloom: false,
      ploughed: false,
      areaM2: 225,
      fertility: 61,
      naturalFertility: 64,
      ashBonus: 0,
      surface: 'meadow',
      walkM: 385,
      holding: { dwellingId: 7, type: 'dvorec' },
      sownYears: null,
      fallowYears: 14,
      overgrowthYears: 3,
      grazed: true,
      crop: null,
      mow: 0.6,
      founding: null,
    },
  },
  {
    key: 'pole-dil-zaklada',
    label: 'Díl pole – zakládá se',
    details: {
      kind: 'field-part',
      id: 5,
      cell: { x: 6, y: 7 },
      look: 'bare',
      stage: 'founding',
      legume: false,
      flax: false,
      bloom: false,
      ploughed: false,
      areaM2: 225,
      fertility: 70,
      naturalFertility: 70,
      ashBonus: 0,
      surface: 'shrub',
      walkM: 90,
      holding: { dwellingId: 3, type: 'zemnice' },
      sownYears: null,
      fallowYears: null,
      overgrowthYears: 0,
      grazed: null,
      crop: null,
      mow: null,
      founding: { progress: 0.35, laborLeft: 12.6, trees: 4 },
    },
  },
  {
    key: 'cesta',
    label: 'Cesta',
    details: {
      kind: 'road',
      id: 4,
      segments: [4, 9, 12],
      roadKind: 'improved',
      lengthM: 1240,
      kinds: [
        { kind: 'trodden', lengthM: 240 },
        { kind: 'cart', lengthM: 140 },
        { kind: 'improved', lengthM: 860 },
      ],
      ageYears: 112,
      trees: 46,
      treeSpeed: 0.035,
      wetM: 180,
      fords: 2,
      building: { grade: 'causeway', progress: 0.55, treesToFell: 9 },
      upgrades: [
        {
          upgrade: 'causeway',
          laborManDays: 233,
          trees: 26,
          treesToFell: 11,
          swathTrees: 0,
          blocked: 'Vylepšení cesty se už staví.',
        },
      ],
      apples: {
        trees: 64,
        bearing: 41,
        planting: { trees: 22, progress: 0.3, waits: true },
        option: {
          trees: 18,
          laborManDays: 9.8,
          blocked: null,
          warning: 'Pole se zmenší',
        },
      },
    },
  },
  {
    key: 'hrbitov',
    label: 'Hřbitov',
    details: {
      kind: 'cemetery',
      id: 30,
      squares: 6,
      capacity: 336,
      graves: 251,
      usedPlaces: 287,
      freePlaces: 49,
      yearsLeft: 23,
      built: true,
      building: 0.6,
      condition: 0.38,
      abandoned: true,
      repair: null,
    },
  },
  {
    key: 'sad',
    label: 'Sad',
    details: {
      kind: 'orchard',
      id: 41,
      areaM2: 33_750,
      ageYears: 48,
      expectedYieldKg: 12_400,
      planting: 0.25,
      plantingWaits: true,
    },
  },
  {
    key: 'sad-ctverec',
    label: 'Čtverec sadu',
    details: {
      kind: 'orchard-square',
      id: 41,
      cell: { x: 2, y: 9 },
      areaM2: 225,
      ageYears: 52,
      expectedYieldKg: 54,
      planting: null,
      plantingWaits: false,
      renewal: true,
      walkM: 1180,
    },
  },
  {
    key: 'dub',
    label: 'Posvátný dub',
    details: { kind: 'sacred-oak', id: 7, happiness: 9, ageYears: 1203, snag: false },
  },
  {
    key: 'sous',
    label: 'Souš',
    details: { kind: 'sacred-oak', id: 8, happiness: 1, ageYears: 1180, snag: true },
  },
  {
    key: 'haj',
    label: 'Háj',
    details: { kind: 'grove', id: 9, oaks: 23, happiness: 14, ageYears: 387 },
  },
  {
    key: 'modla',
    label: 'Modla',
    details: {
      kind: 'sacred',
      id: 40,
      type: 'idol',
      happiness: 8,
      building: null,
      oaksToFell: 0,
      condition: 0.38,
      abandoned: true,
      repair: null,
    },
  },
  {
    key: 'svatyne',
    label: 'Svatyně',
    details: {
      kind: 'sacred',
      id: 41,
      type: 'shrine',
      happiness: 20,
      building: 0.4,
      oaksToFell: 6,
      condition: 1,
      abandoned: false,
      repair: null,
    },
  },
  {
    key: 'staveniste',
    label: 'Staveniště',
    details: {
      kind: 'site',
      id: 12,
      type: 'polozemnice',
      craft: null,
      progress: 0.2,
      treesToFell: 11,
      relocates: 3,
    },
  },
];

const village = (over: Partial<VillageListItem>): VillageListItem => ({
  id: 'v-1',
  settlementId: 's-1',
  name: 'Libice',
  people: 112,
  extinct: false,
  abandoned: false,
  travelling: false,
  hunger: 'fed',
  ...over,
});

/** Seznam vsí v liště – i jméno skoro o 40 znacích (nejvíc dovolené) a vsi na cestě a opuštěná. */
export const DEV_VILLAGES: readonly VillageListItem[] = [
  village({}),
  village({ id: 'v-2', name: 'Stará Boleslav nad Labem pod Hradištěm', people: 1240 }),
  village({ id: 'v-3', name: 'Budeč', people: 34, travelling: true }),
  village({ id: 'v-4', settlementId: 's-2', name: 'Levý Hradec', people: 0, abandoned: true }),
];
