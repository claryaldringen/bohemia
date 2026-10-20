import { describe, expect, it } from 'vitest';
import { fieldPartName, orchardSquareName, selectionDetails } from '../selection-details';
import type { SceneVillage, VillageView } from '../village-view';

const scene: SceneVillage = {
  dwellings: [
    { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    {
      id: 2,
      type: 'polozemnice',
      craft: 'smith',
      position: { x: -20, z: 0, rotation: 0 },
      built: true,
      progress: 1,
    },
    {
      id: 9,
      type: 'polozemnice',
      position: { x: 20, z: 0, rotation: 0 },
      built: false,
      // staveniště ve scéně ukazuje samotnou stavbu – dřevo se ještě kácí
      progress: 0.1,
    },
  ],
  fields: [{ id: 5, parts: [] }],
  sacred: {
    oaks: [{ id: 700, x: 40, z: 40 }],
    groves: [{ id: 800, x: -100, z: 60, squares: [] }],
    buildings: [
      { id: 40, kind: 'idol', position: { x: 10, z: 30, rotation: 0 }, built: true, progress: 1 },
      {
        id: 41,
        kind: 'shrine',
        position: { x: 80, z: 0, rotation: 0 },
        built: false,
        progress: 0.2,
      },
      // staveniště čeká na odpověď serveru – je jen ve scéně
      { id: -1, kind: 'idol', position: { x: 0, z: 50, rotation: 0 }, built: false, progress: 0 },
    ],
  },
};

const RELOCATE_OPTION = {
  laborManDays: 60,
  perHa: false,
  perSquare: false,
  upfront: [{ resource: 'wood', amount: 7, missing: 0 }],
  blocked: null,
  affordable: true,
};

const LEAVE_DIRECTIONS = [{ direction: 'N' as const, days: 2, blocked: null }];

const view = {
  people: { children: 2, adults: 4, elders: 0 },
  storesKg: 1000,
  meatKg: 0,
  cheeseKg: 0,
  legumesKg: 0,
  applesKg: 0,
  leave: { directions: LEAVE_DIRECTIONS, cart: null, allCart: null },
  extinct: null,
  abandoned: null,
  journey: null,
  crafts: {
    present: true,
    stocks: { charcoalKg: 40, toolsKg: 6, potteryKg: 12.4 },
    needs: { toolsKg: 12, potteryKg: 30 },
    coverage: { tools: 0.5, pottery: 0.41 },
    workshops: [
      {
        dwellingId: 2,
        craft: 'smith',
        activity: 'no-charcoal',
        occupants: 2,
        laborPerDay: 0.9,
        outputPerDayKg: 0.09,
        kiln: null,
        toPlant: 0,
      },
    ],
  },
  households: [
    {
      dwellingId: 1,
      type: 'zemnice',
      occupants: 4,
      capacity: 6,
      full: false,
      overcrowded: false,
      condition: 0.8,
      ages: [27, 26, 15, 3],
      ageYears: 2,
      relocation: null,
      relocationBlock: null,
    },
    {
      dwellingId: 2,
      type: 'polozemnice',
      craft: 'smith',
      occupants: 2,
      capacity: 8,
      full: false,
      overcrowded: false,
      condition: 1,
      ages: [24, 22],
      ageYears: 1,
      // kovářova domácnost si staví nový dům (stavba 9 – migration.md)
      relocation: { constructionId: 9, type: 'polozemnice', progress: 0.4, treesToFell: 5 },
      relocationBlock: 'relocating',
    },
  ],
  relocation: {
    zemnice: RELOCATE_OPTION,
    polozemnice: { ...RELOCATE_OPTION, affordable: false },
  },
  constructions: [
    {
      id: 9,
      kind: 'dwelling',
      label: 'Polozemnice',
      progress: 0.4,
      dwellingType: 'polozemnice',
      dwellingId: null,
      relocates: 2,
      fieldId: null,
      treesToFell: 5,
    },
    {
      id: 12,
      kind: 'field',
      label: 'Pole',
      progress: 0.25,
      dwellingType: null,
      dwellingId: null,
      fieldId: 5,
    },
  ],
  fields: [
    {
      id: 5,
      areaM2: 2250,
      fertility: 61.4,
      stages: { sown: 6, founding: 4 },
      surfaces: { meadow: 10 },
      crops: { spring: 1, legume: 1, winter: 4 },
      ashParts: 0,
      ashBonus: 0,
    },
    {
      id: 6,
      areaM2: 1350,
      fertility: 80,
      stages: { ready: 6 },
      surfaces: { forest: 4, meadow: 1, shrub: 1 },
      crops: {},
      ashParts: 4,
      ashBonus: 40,
    },
  ],
  cemeteries: [
    {
      id: 30,
      squares: 2,
      built: true,
      progress: 1,
      capacity: 112,
      graves: 72,
      usedPlaces: 72,
      freePlaces: 40,
      yearsLeft: 12.2,
      fenceCondition: 0.62,
      abandoned: true,
      repair: null,
    },
    {
      id: 31,
      squares: 1,
      built: false,
      progress: 0.5,
      capacity: 56,
      graves: 0,
      usedPlaces: 0,
      freePlaces: 56,
      yearsLeft: null,
      fenceCondition: 1,
      abandoned: false,
      repair: null,
    },
  ],
  orchards: [
    {
      id: 60,
      areaM2: 900,
      squares: 4,
      ageYears: 7,
      expectedYieldKg: 81,
      planting: null,
      plantingWaits: false,
    },
    {
      id: 61,
      areaM2: 225,
      squares: 1,
      ageYears: null,
      expectedYieldKg: 0,
      planting: 0.3,
      plantingWaits: true,
    },
  ],
  sacred: {
    oaks: [
      { id: 700, happiness: 5, ageYears: 312, snag: false },
      { id: 701, happiness: 1, ageYears: 1180, snag: true },
    ],
    groves: [{ id: 800, oaks: 11, squares: 9, happiness: 12, ageYears: 254 }],
    buildings: [
      {
        id: 40,
        kind: 'idol',
        built: true,
        happiness: 8,
        progress: 1,
        oaksToFell: 0,
        condition: 0.4,
        abandoned: true,
        repair: null,
      },
      {
        id: 41,
        kind: 'shrine',
        built: false,
        happiness: 25,
        progress: 0.35,
        oaksToFell: 2,
        condition: 1,
        abandoned: false,
        repair: null,
      },
    ],
  },
  hayKg: 3200,
  livestock: {
    herds: { sheep: 9, goat: 3, pig: 7, cow: 4 },
    chickens: 6,
    oxen: 2,
    pastureHa: 41.5,
    grazingHa: 8.4,
    pigForestHa: 30,
    meatNeedKg: 560,
    milkLPerDay: 14.2,
    milkLPerYear: 2900,
  },
  pens: [
    {
      id: 90,
      built: true,
      progress: 1,
      team: { ageYears: 3, yearsLeft: 7 },
      training: null,
      cows: 4,
      oxen: 2,
      condition: 0.7,
      abandoned: false,
      repair: 0.25,
    },
    {
      id: 91,
      built: false,
      progress: 0.45,
      team: null,
      training: null,
      cows: 0,
      oxen: 0,
      condition: 1,
      abandoned: false,
      repair: null,
    },
  ],
} as unknown as VillageView;

describe('selectionDetails', () => {
  it('bez výběru nic, zaniklý cíl nic', () => {
    expect(selectionDetails(view, scene, null)).toBeNull();
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 77 })).toBeNull();
    expect(selectionDetails(view, scene, { kind: 'field', id: 77 })).toBeNull();
  });

  it('hotové obydlí: obyvatelé s věkem, stav, stáří', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 1 })).toEqual({
      kind: 'dwelling',
      id: 1,
      type: 'zemnice',
      occupants: 4,
      capacity: 6,
      ages: [27, 26, 15, 3],
      condition: 0.8,
      ageYears: 2,
      full: false,
      overcrowded: false,
      rebuild: null,
      workshop: null,
      relocation: null,
      relocate: view.relocation,
      manor: null,
      // odejít smí: 4 lidé, unesou 3 od 7 let (75 kg), díl zásob 4/6 by byl víc
      leave: { households: [1], people: 4, foodKg: 75, cart: null, directions: LEAVE_DIRECTIONS },
    });
  });

  it('odchod s vozem s voly: vůz uveze víc jídla (migration.md – Vůz při odchodu)', () => {
    const withCart = {
      ...view,
      storesKg: 10_000,
      leave: { directions: LEAVE_DIRECTIONS, cart: 'two-wheel' as const, allCart: null },
    };
    // 3 nosiči po 25 kg + dvoukolák 400 kg; díl zásob 4/6 je víc
    expect(selectionDetails(withCart, scene, { kind: 'dwelling', id: 1 })).toMatchObject({
      leave: { cart: 'two-wheel', foodKg: 475 },
    });
  });

  it('obydlí, jehož domácnost se stěhuje: průběh stavby nového domu, přestěhovat znovu nejde', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 2 })).toMatchObject({
      kind: 'dwelling',
      relocation: { constructionId: 9, progress: 0.4 },
      relocate: null,
    });
  });

  it('víc obydlí: domácnosti, lidé a kdo se může přestěhovat (migration.md)', () => {
    expect(selectionDetails(view, scene, { kind: 'dwellings', ids: [1, 2, 77] })).toEqual({
      kind: 'dwellings',
      ids: [1, 2],
      households: 2,
      people: 6,
      relocatable: [1],
      relocate: view.relocation,
      // domácnost, která si staví nový dům, zůstává
      leave: { households: [1], people: 4, foodKg: 75, cart: null, directions: LEAVE_DIRECTIONS },
    });
    expect(selectionDetails(view, scene, { kind: 'dwellings', ids: [77, 78] })).toBeNull();
    // jen stěhující se domácnost – přestěhovat nejde
    expect(selectionDetails(view, scene, { kind: 'dwellings', ids: [2, 9] })).toMatchObject({
      relocatable: [],
      relocate: null,
    });
  });

  it('dílna: co dělá, práce za den, zásoba výrobku a pokrytí potřeby vsi (crafts.md)', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 2 })).toMatchObject({
      kind: 'dwelling',
      id: 2,
      type: 'polozemnice',
      workshop: {
        craft: 'smith',
        activity: 'no-charcoal',
        laborPerDay: 0.9,
        outputPerDayKg: 0.09,
        kiln: null,
        toPlant: 0,
        stockKg: 6,
        coverage: 0.5,
      },
    });
  });

  it('staveniště: typ, celý průběh i s kácením a stromy ke skácení (bez vsi ze scény)', () => {
    expect(selectionDetails(view, scene, { kind: 'dwelling', id: 9 })).toEqual({
      kind: 'site',
      id: 9,
      type: 'polozemnice',
      craft: null,
      progress: 0.4,
      treesToFell: 5,
      // nový dům kovářovy domácnosti – jde zrušit
      relocates: 2,
    });
    expect(selectionDetails(null, scene, { kind: 'dwelling', id: 9 })).toEqual({
      kind: 'site',
      id: 9,
      type: 'polozemnice',
      craft: null,
      progress: 0.1,
      treesToFell: 0,
      relocates: null,
    });
  });

  it('pole: výměra, úrodnost, díly podle stadia v pořadí, ozim a jař a zakládání', () => {
    expect(selectionDetails(view, scene, { kind: 'field', id: 5 })).toEqual({
      kind: 'field',
      id: 5,
      areaM2: 2250,
      fertility: 61.4,
      stages: [
        { stage: 'founding', count: 4 },
        { stage: 'sown', count: 6 },
      ],
      surfaces: [],
      // pořadí ozim, jař, luštěniny (CROP_ORDER)
      crops: [
        { crop: 'winter', count: 4 },
        { crop: 'spring', count: 1 },
        { crop: 'legume', count: 1 },
      ],
      ashParts: 0,
      ashBonus: 0,
      founding: 0.25,
    });
  });

  it('pole z vymýceného lesa: díly podle povrchu v pořadí louka, křoviny, les a popel', () => {
    const details = selectionDetails(view, scene, { kind: 'field', id: 6 });
    expect(details).toMatchObject({
      kind: 'field',
      surfaces: [
        { surface: 'meadow', count: 1 },
        { surface: 'shrub', count: 1 },
        { surface: 'forest', count: 4 },
      ],
      crops: [],
      ashParts: 4,
      ashBonus: 40,
      founding: null,
    });
  });
});

describe('selectionDetails – díl pole a čtverec sadu (klik – fields.md, Co hráč vidí)', () => {
  const partScene: SceneVillage = {
    dwellings: [
      {
        id: 1,
        type: 'polozemnice',
        position: { x: 0, z: 0, rotation: 0 },
        built: true,
        progress: 1,
      },
    ],
    fields: [
      {
        id: 5,
        parts: [
          {
            id: 51,
            cell: { x: 2, y: 0 },
            x: 37.5,
            z: 7.5,
            size: 15,
            stage: 'sown',
            look: 'ripe',
            crop: 'legume',
          },
          {
            id: 52,
            cell: { x: 3, y: 0 },
            x: 52.5,
            z: 7.5,
            size: 15,
            stage: 'meadow',
            look: 'meadow',
            overgrowth: 2,
            grazed: true,
          },
        ],
      },
    ],
    orchards: [
      {
        id: 60,
        squares: [
          { cell: { x: 0, y: 4 }, x: 7.5, z: 67.5, size: 15, planting: 1, growth: 1, fruit: false },
        ],
      },
    ],
  };
  const partView = {
    fields: [
      {
        id: 5,
        parts: [
          {
            id: 51,
            fertility: 48,
            naturalFertility: 64,
            ashBonus: 20,
            walkM: 85,
            holding: 1,
            sownYears: 1,
            work: {
              crop: {
                crop: 'legume',
                prep: { task: 'plough', share: 1 },
                sow: 1,
                harvest: 0.4,
              },
            },
          },
          { id: 52, areaM2: 180, fertility: 70, walkM: 120, fallowYears: 6, work: { mow: 0.25 } },
        ],
      },
    ],
    orchards: [
      {
        id: 60,
        cells: [
          {
            cell: { x: 0, y: 4 },
            areaM2: 225,
            ageYears: 53,
            expectedYieldKg: 40,
            planting: null,
            plantingWaits: false,
            renewal: true,
            walkM: 40,
          },
        ],
      },
    ],
  } as unknown as VillageView;

  it('osetý díl: co je vidět ze scény, čísla dílu z pohledu, dům hospodářství', () => {
    const details = selectionDetails(partView, partScene, {
      kind: 'field-part',
      id: 5,
      cell: { x: 2, y: 0 },
    });
    expect(details).toEqual({
      kind: 'field-part',
      id: 5,
      cell: { x: 2, y: 0 },
      look: 'ripe',
      stage: 'sown',
      legume: true,
      flax: false,
      bloom: false,
      ploughed: false,
      // celý čtverec – výměra ze strany čtverce ve scéně
      areaM2: 225,
      fertility: 48,
      naturalFertility: 64,
      ashBonus: 20,
      surface: 'meadow',
      walkM: 85,
      holding: { dwellingId: 1, type: 'polozemnice' },
      sownYears: 1,
      fallowYears: null,
      overgrowthYears: 0,
      grazed: null,
      crop: { crop: 'legume', prep: { task: 'plough', share: 1 }, sow: 1, harvest: 0.4 },
      mow: null,
      founding: null,
    });
    expect(fieldPartName(details as Extract<typeof details, { kind: 'field-part' }>)).toBe(
      'Zralé luštěniny',
    );
  });

  it('příloh: roky ladem, zarůstání a pastva ze scény, seč; bez hospodářství', () => {
    const details = selectionDetails(partView, partScene, {
      kind: 'field-part',
      id: 5,
      cell: { x: 3, y: 0 },
    });
    expect(details).toMatchObject({
      areaM2: 180,
      naturalFertility: 70,
      holding: null,
      fallowYears: 6,
      overgrowthYears: 2,
      grazed: true,
      crop: null,
      mow: 0.25,
    });
  });

  it('zaniklý díl, díl bez údajů v pohledu a ves bez pohledu nic', () => {
    const gone = { kind: 'field-part', id: 5, cell: { x: 9, y: 9 } } as const;
    expect(selectionDetails(partView, partScene, gone)).toBeNull();
    const part = { kind: 'field-part', id: 5, cell: { x: 2, y: 0 } } as const;
    expect(selectionDetails(null, partScene, part)).toBeNull();
    const empty = { fields: [{ id: 5, parts: [] }], orchards: [] } as unknown as VillageView;
    expect(selectionDetails(empty, partScene, part)).toBeNull();
  });

  it('čtverec sadu: výměra, stáří, úroda čtverce, obnova', () => {
    const target = { kind: 'orchard-square', id: 60, cell: { x: 0, y: 4 } } as const;
    expect(selectionDetails(partView, partScene, target)).toEqual({
      kind: 'orchard-square',
      id: 60,
      cell: { x: 0, y: 4 },
      areaM2: 225,
      ageYears: 53,
      expectedYieldKg: 40,
      planting: null,
      plantingWaits: false,
      renewal: true,
      walkM: 40,
    });
    expect(selectionDetails(partView, partScene, { ...target, cell: { x: 1, y: 4 } })).toBeNull();
  });

  it('název dílu podle vzhledu, zakládaný a připravený podle stadia; čtverec sadu podle stáří', () => {
    const name = (over: Partial<Parameters<typeof fieldPartName>[0]>): string =>
      fieldPartName({
        look: 'green',
        stage: 'sown',
        legume: false,
        flax: false,
        ploughed: false,
        ...over,
      });
    expect(name({})).toBe('Zelené obilí');
    expect(name({ look: 'plowed' })).toBe('Zkopáno');
    // len (fields.md – Len): zelený, v červnu kvetoucí, zralý, trhání
    expect(name({ flax: true })).toBe('Zelený len');
    expect(name({ flax: true, bloom: true })).toBe('Kvetoucí len');
    expect(name({ flax: true, look: 'ripe' })).toBe('Zralý len');
    expect(name({ flax: true, look: 'harvesting' })).toBe('Trhání lnu');
    expect(name({ look: 'plowed', ploughed: true })).toBe('Zoráno');
    expect(name({ look: 'bare', stage: 'founding' })).toBe('Zakládá se');
    expect(name({ look: 'bare', stage: 'ready' })).toBe('Připraveno k osevu');
    expect(name({ look: null, stage: 'meadow' })).toBe('Příloh – pastvina');
    expect(name({ look: 'young-forest', stage: 'young-forest' })).toBe('Mladý les');
    const square = (over: Partial<Parameters<typeof orchardSquareName>[0]>): string =>
      orchardSquareName({ planting: null, renewal: false, ageYears: 20, ...over });
    expect(square({})).toBe('Jabloně');
    expect(square({ ageYears: 3 })).toBe('Mladé jabloně');
    expect(square({ ageYears: 51 })).toBe('Staré jabloně');
    expect(square({ renewal: true })).toBe('Staré jabloně');
    expect(square({ planting: 0.2, ageYears: null })).toBe('Výsadba jabloní');
    expect(square({ planting: 0.2, renewal: true, ageYears: null })).toBe('Obnova jabloní');
  });
});

describe('selectionDetails – hřbitov', () => {
  it('hroby a odhad v letech; zakládaný jen s průběhem založení', () => {
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 30 })).toEqual({
      kind: 'cemetery',
      id: 30,
      squares: 2,
      capacity: 112,
      graves: 72,
      usedPlaces: 72,
      freePlaces: 40,
      yearsLeft: 12.2,
      built: true,
      building: null,
      condition: 0.62,
      abandoned: true,
      repair: null,
    });
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 31 })).toMatchObject({
      built: false,
      building: 0.5,
    });
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 99 })).toBeNull();
  });
});

describe('selectionDetails – sad', () => {
  it('výměra, stáří, úroda příští sklizně; vysazovaný s průběhem výsadby', () => {
    expect(selectionDetails(view, scene, { kind: 'orchard', id: 60 })).toEqual({
      kind: 'orchard',
      id: 60,
      areaM2: 900,
      ageYears: 7,
      expectedYieldKg: 81,
      planting: null,
      plantingWaits: false,
    });
    expect(selectionDetails(view, scene, { kind: 'orchard', id: 61 })).toMatchObject({
      ageYears: null,
      planting: 0.3,
      plantingWaits: true,
    });
    expect(selectionDetails(view, scene, { kind: 'orchard', id: 99 })).toBeNull();
  });
});

describe('selectionDetails – posvátná místa', () => {
  it('posvátný dub a háj: kolik přidávají štěstí a stáří dubu, háj i počet dubů', () => {
    expect(selectionDetails(view, scene, { kind: 'sacred-oak', id: 700 })).toEqual({
      kind: 'sacred-oak',
      id: 700,
      happiness: 5,
      ageYears: 312,
      snag: false,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred-oak', id: 701 })).toEqual({
      kind: 'sacred-oak',
      id: 701,
      happiness: 1,
      ageYears: 1180,
      snag: true,
    });
    expect(selectionDetails(view, scene, { kind: 'grove', id: 800 })).toEqual({
      kind: 'grove',
      id: 800,
      oaks: 11,
      happiness: 12,
      ageYears: 254,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred-oak', id: 1 })).toBeNull();
    expect(selectionDetails(view, scene, { kind: 'grove', id: 1 })).toBeNull();
  });

  it('modla hotová, svatyně ve stavbě s průběhem i kácením, staveniště jen ve scéně', () => {
    expect(selectionDetails(view, scene, { kind: 'sacred', id: 40 })).toEqual({
      kind: 'sacred',
      id: 40,
      type: 'idol',
      happiness: 8,
      building: null,
      oaksToFell: 0,
      condition: 0.4,
      abandoned: true,
      repair: null,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: 41 })).toEqual({
      kind: 'sacred',
      id: 41,
      type: 'shrine',
      happiness: 25,
      building: 0.35,
      oaksToFell: 2,
      condition: 1,
      abandoned: false,
      repair: null,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: -1 })).toEqual({
      kind: 'sacred',
      id: -1,
      type: 'idol',
      happiness: 8,
      building: 0,
      oaksToFell: 0,
      condition: 1,
      abandoned: false,
      repair: null,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: 99 })).toBeNull();
  });

  it('ohrada: zvířata, seno, stáda vsi s pastvou, voli a důvod, proč výcvik nejde', () => {
    expect(selectionDetails(view, scene, { kind: 'pen', id: 90 })).toEqual({
      kind: 'pen',
      id: 90,
      built: true,
      progress: 1,
      oxen: 2,
      oxenVillage: null,
      cows: 4,
      herds: { sheep: 9, goat: 3, pig: 7, cow: 4 },
      chickens: 6,
      pastureHa: 41.5,
      grazingHa: 8.4,
      milkLPerDay: 14.2,
      team: { ageYears: 3, yearsLeft: 7 },
      training: null,
      hayKg: 3200,
      condition: 0.7,
      abandoned: false,
      repair: 0.25,
    });
    expect(selectionDetails(view, scene, { kind: 'pen', id: 91 })).toMatchObject({
      kind: 'pen',
      built: false,
      progress: 0.45,
    });
    expect(selectionDetails(view, scene, { kind: 'pen', id: 99 })).toBeNull();
    expect(selectionDetails(null, scene, { kind: 'pen', id: 90 })).toBeNull();
  });
});

describe('selectionDetails – rudiště (crafts.md – Uhlí a ruda kováře)', () => {
  const site = {
    smithId: 2,
    leftKg: 2140,
    depositKg: 3000,
    heapKg: 35,
    stockKg: 96,
    walkM: 186,
    pits: 3,
    workers: [{ age: 41, smith: true, digs: true, carries: false, rides: false }],
    cart: false,
  };
  const withOre: SceneVillage = {
    ...scene,
    oreSites: [{ dwellingId: 2, x: 30, z: -40, heapKg: 35, digging: true }],
  };
  const oreView = { oreSites: [site] } as unknown as VillageView;

  it('údaje rudiště z pohledu na ves podle kovárny; bez rudiště ve scéně nebo v pohledu nic', () => {
    expect(selectionDetails(oreView, withOre, { kind: 'ore-site', id: 2 })).toEqual({
      kind: 'ore-site',
      ...site,
    });
    expect(selectionDetails(oreView, scene, { kind: 'ore-site', id: 2 })).toBeNull();
    expect(selectionDetails(null, withOre, { kind: 'ore-site', id: 2 })).toBeNull();
    expect(
      selectionDetails({} as unknown as VillageView, withOre, { kind: 'ore-site', id: 2 }),
    ).toBeNull();
  });
});
