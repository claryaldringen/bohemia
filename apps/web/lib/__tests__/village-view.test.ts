import { describe, expect, it } from 'vitest';
import {
  checkDwellingPlacement,
  dayIndexOf,
  foundVillage,
  type ChronicleEvent,
  type Landscape,
  type PartInput,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import {
  CHRONICLE_LENGTH,
  buildVillageView,
  chronicleText,
  foundingSceneVillage,
  placementVillageFromScene,
} from '../village-view';

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const SIZE = 16;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: new Uint8Array(SIZE * SIZE).fill(2),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 8, y: 8 },
  stream: [],
};
const parts: PartInput[] = [0, 1, 2, 3, 4].map((i) => ({
  areaM2: 225,
  distanceM: 50,
  naturalFertility: 50,
  surface: 'meadow',
  obstacleCost: 0,
  cell: { x: 8 + i, y: 8 },
}));
const state = (): VillageState =>
  foundVillage({
    seed: 5,
    day: DAY,
    dwellingPosition: { x: -50, z: -50, rotation: 0.5 },
    firstField: { parts },
  });
const record = (s: VillageState = state()): VillageRecord => ({
  settlementId: 's-1',
  name: 'Libice',
  state: s,
  version: 1,
});

describe('buildVillageView', () => {
  it('panel čerstvé vsi: lidé, domácnost, zásoby, ceny a důvod, proč zatím stavět nejde', () => {
    const view = buildVillageView(record(), landscape, DAY);
    expect(view).toMatchObject({
      name: 'Libice',
      dayIndex: DAY,
      people: { children: 2, adults: 2, elders: 0 },
      costs: { zemnice: 60, polozemnice: 220, fieldPerHa: 40 },
    });
    expect(view.households).toEqual([
      {
        dwellingId: 1,
        type: 'zemnice',
        occupants: 4,
        capacity: 6,
        full: false,
        overcrowded: false,
        condition: 1,
      },
    ]);
    expect(view.storesMonths).toBeCloseTo(18, 0);
    expect(view.canBuildDwelling.ok).toBe(false);
    expect(view.canBuildDwelling.reason).toMatch(/4 dospělí/);
    expect(view.constructions).toEqual([
      { id: expect.any(Number), kind: 'field', label: 'Pole 0,11 ha', progress: 0 },
    ]);
    expect(view.hungry).toBe(false);
    expect(view.constructionsStalled).toBe(false);
  });

  it('hlad a stojící stavby přejdou ze souhrnu vsi', () => {
    const s = state();
    s.hungry = true;
    s.commonLaborHistory = [0, 0, 0];
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.hungry).toBe(true);
    expect(view.constructionsStalled).toBe(true);
  });

  it('scéna: obydlí bez obyvatel není obývané', () => {
    const s = state();
    s.people = [];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings[0]?.inhabited).toBe(false);
  });

  it('scéna: obydlí, díly pole ve středech políček a rozestavěné obydlí', () => {
    const s = state();
    // stavba obydlí rovnou do stavu – pravidla odemčení tu netestujeme
    s.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 220,
      done: 55,
      dwellingType: 'polozemnice',
      position: { x: 30, z: 40, rotation: 0 },
      dwellingId: null,
      fieldId: null,
    });
    const { scene, constructions } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings).toEqual([
      {
        id: 1,
        type: 'zemnice',
        position: { x: -50, z: -50, rotation: 0.5 },
        built: true,
        progress: 1,
        inhabited: true,
      },
      {
        id: 99,
        type: 'polozemnice',
        position: { x: 30, z: 40, rotation: 0 },
        built: false,
        progress: 0.25,
      },
    ]);
    expect(constructions.find((c) => c.id === 99)).toEqual({
      id: 99,
      kind: 'dwelling',
      label: 'Polozemnice',
      progress: 0.25,
    });
    expect(scene.fields).toHaveLength(1);
    expect(scene.fields[0]?.parts).toEqual([
      { cell: { x: 8, y: 8 }, x: 7.5, z: 7.5, size: 15, stage: 'founding' },
      { cell: { x: 9, y: 8 }, x: 22.5, z: 7.5, size: 15, stage: 'founding' },
      { cell: { x: 10, y: 8 }, x: 37.5, z: 7.5, size: 15, stage: 'founding' },
      { cell: { x: 11, y: 8 }, x: 52.5, z: 7.5, size: 15, stage: 'founding' },
      { cell: { x: 12, y: 8 }, x: 67.5, z: 7.5, size: 15, stage: 'founding' },
    ]);
  });

  it('ze scény jde složit data pro kontrolu umístění v prohlížeči', () => {
    const { scene } = buildVillageView(record(), landscape, DAY);
    const village = placementVillageFromScene(scene);
    const onHouse = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: -48,
      z: -50,
      rotation: 0,
    });
    expect(onHouse.ok).toBe(false);
    const inField = checkDwellingPlacement(landscape, village, 'zemnice', {
      x: 30,
      z: 7,
      rotation: 0,
    });
    expect(inField.reason).toMatch(/polem/);
  });

  it('kronika: nejnovější první, s datem „12. dubna 503“, nejvýš CHRONICLE_LENGTH událostí', () => {
    const s = state();
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.chronicle).toEqual([
      { day: DAY, dateLabel: '12. dubna 503', text: 'Osadníci založili ves Libice.' },
    ]);
    s.chronicle.push(
      ...Array.from({ length: 20 }, (_, i) => ({ day: DAY + i + 1, kind: 'birth' as const })),
    );
    const long = buildVillageView(record(s), landscape, DAY + 20);
    expect(long.chronicle).toHaveLength(CHRONICLE_LENGTH);
    expect(long.chronicle[0]?.day).toBe(DAY + 20);
    expect(long.chronicle[0]?.dateLabel).toBe('2. května 503');
  });
});

describe('chronicleText', () => {
  const events: ChronicleEvent[] = [
    { day: DAY, kind: 'village-founded' },
    { day: DAY, kind: 'birth' },
    { day: DAY, kind: 'death', group: 'child' },
    { day: DAY, kind: 'death', group: 'adult' },
    { day: DAY, kind: 'death', group: 'elder' },
    { day: DAY, kind: 'household-founded', dwellingId: 2 },
    { day: DAY, kind: 'household-merged', fromDwellingId: 2, toDwellingId: 1 },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'field',
      dwellingId: null,
      fieldId: 3,
    },
    { day: DAY, kind: 'rebuild-decided', dwellingId: 1, type: 'polozemnice' },
    { day: DAY, kind: 'harvest', kg: 1250 },
    { day: DAY, kind: 'hunger-began' },
    { day: DAY, kind: 'hunger-ended' },
    { day: DAY, kind: 'part-became-forest', partId: 4 },
  ];

  it('každá událost má český text', () => {
    for (const event of events) expect(chronicleText(event, 'Libice')).toMatch(/\S.*\.$/);
  });

  it('sklizeň s tisíci a přestavba ve 4. pádě', () => {
    expect(chronicleText({ day: DAY, kind: 'harvest', kg: 1250 }, 'X')).toBe(
      'Sklizeň: 1 250 kg obilí.',
    );
    expect(
      chronicleText({ day: DAY, kind: 'rebuild-decided', dwellingId: 1, type: 'polozemnice' }, 'X'),
    ).toBe('Obyvatelé se rozhodli přestavět dožilé obydlí na polozemnici.');
  });
});

describe('foundingSceneVillage', () => {
  it('bez zemnice a pole je ves prázdná', () => {
    expect(foundingSceneVillage(landscape, null, null)).toEqual({ dwellings: [], fields: [] });
  });

  it('zemnice stojí a díly pole se zakládají na středech políček', () => {
    const position = { x: 3, z: -4, rotation: 1 };
    const village = foundingSceneVillage(landscape, position, { parts: parts.slice(0, 2) });
    expect(village.dwellings).toEqual([
      { id: -1, type: 'zemnice', position, built: true, progress: 1 },
    ]);
    expect(village.fields).toEqual([
      {
        id: -2,
        parts: [
          { cell: { x: 8, y: 8 }, x: 7.5, z: 7.5, size: 15, stage: 'founding' },
          { cell: { x: 9, y: 8 }, x: 22.5, z: 7.5, size: 15, stage: 'founding' },
        ],
      },
    ]);
  });
});
