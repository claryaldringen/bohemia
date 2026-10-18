import { describe, expect, it } from 'vitest';
import { selectionDetails } from '../selection-details';
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

const view = {
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
    },
  ],
  constructions: [
    {
      id: 9,
      kind: 'dwelling',
      label: 'Polozemnice',
      progress: 0.4,
      dwellingType: 'polozemnice',
      dwellingId: null,
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
      crops: { spring: 2, winter: 4 },
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
      freeGraves: 40,
      yearsLeft: 12.2,
    },
    {
      id: 31,
      squares: 1,
      built: false,
      progress: 0.5,
      capacity: 56,
      graves: 0,
      freeGraves: 56,
      yearsLeft: null,
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
    oaks: [{ id: 700, happiness: 5 }],
    groves: [{ id: 800, oaks: 11, squares: 9, happiness: 12 }],
    buildings: [
      { id: 40, kind: 'idol', built: true, happiness: 8, progress: 1, oaksToFell: 0 },
      { id: 41, kind: 'shrine', built: false, happiness: 25, progress: 0.35, oaksToFell: 2 },
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
      trainBlocked: 'Na výcvik chybí telata – stádo potřebuje aspoň 3 krávy.',
      cows: 4,
      oxen: 2,
    },
    {
      id: 91,
      built: false,
      progress: 0.45,
      team: null,
      training: null,
      trainBlocked: 'Ohrada se ještě staví.',
      cows: 0,
      oxen: 0,
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
    });
    expect(selectionDetails(null, scene, { kind: 'dwelling', id: 9 })).toEqual({
      kind: 'site',
      id: 9,
      type: 'polozemnice',
      craft: null,
      progress: 0.1,
      treesToFell: 0,
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
      crops: [
        { crop: 'winter', count: 4 },
        { crop: 'spring', count: 2 },
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

describe('selectionDetails – hřbitov', () => {
  it('hroby a odhad v letech; zakládaný jen s průběhem založení', () => {
    expect(selectionDetails(view, scene, { kind: 'cemetery', id: 30 })).toEqual({
      kind: 'cemetery',
      id: 30,
      squares: 2,
      capacity: 112,
      graves: 72,
      freeGraves: 40,
      yearsLeft: 12.2,
      built: true,
      building: null,
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
  it('posvátný dub a háj: kolik přidávají štěstí, háj i počet dubů', () => {
    expect(selectionDetails(view, scene, { kind: 'sacred-oak', id: 700 })).toEqual({
      kind: 'sacred-oak',
      id: 700,
      happiness: 5,
    });
    expect(selectionDetails(view, scene, { kind: 'grove', id: 800 })).toEqual({
      kind: 'grove',
      id: 800,
      oaks: 11,
      happiness: 12,
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
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: 41 })).toEqual({
      kind: 'sacred',
      id: 41,
      type: 'shrine',
      happiness: 25,
      building: 0.35,
      oaksToFell: 2,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: -1 })).toEqual({
      kind: 'sacred',
      id: -1,
      type: 'idol',
      happiness: 8,
      building: 0,
      oaksToFell: 0,
    });
    expect(selectionDetails(view, scene, { kind: 'sacred', id: 99 })).toBeNull();
  });

  it('ohrada: zvířata, seno, stáda vsi s pastvou, spřežení a důvod, proč výcvik nejde', () => {
    expect(selectionDetails(view, scene, { kind: 'pen', id: 90 })).toEqual({
      kind: 'pen',
      id: 90,
      built: true,
      progress: 1,
      oxen: 2,
      cows: 4,
      herds: { sheep: 9, goat: 3, pig: 7, cow: 4 },
      chickens: 6,
      pastureHa: 41.5,
      grazingHa: 8.4,
      milkLPerDay: 14.2,
      team: { ageYears: 3, yearsLeft: 7 },
      training: null,
      hayKg: 3200,
      trainBlocked: 'Na výcvik chybí telata – stádo potřebuje aspoň 3 krávy.',
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
