import { describe, expect, it } from 'vitest';
import {
  checkDwellingPlacement,
  dayIndexOf,
  foundCemetery,
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
  obstacleLayer: null,
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
/** Ves s dostavěnou první zemnicí (id domácnosti zakladatelů) – jako starší uložené vsi. */
const settled = (): VillageState => {
  const s = state();
  const site = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null)!;
  s.constructions = s.constructions.filter((c) => c !== site);
  s.dwellings.push({
    id: site.dwellingId!,
    type: 'zemnice',
    builtDay: DAY,
    condition: 1,
    position: site.position!,
  });
  return s;
};
const record = (s: VillageState = state()): VillageRecord => ({
  settlementId: 's-1',
  name: 'Libice',
  state: s,
  version: 1,
});

describe('buildVillageView', () => {
  it('čerstvá ves: lidé, zásoby, stavba zemnice zakladatelů a pole', () => {
    const view = buildVillageView(record(), landscape, DAY);
    expect(view).toMatchObject({
      name: 'Libice',
      dayIndex: DAY,
      people: { children: 2, adults: 2, elders: 0 },
      fullHousehold: false,
    });
    // obydlí nemá kdo osídlit (zakladatelé si staví vlastní zemnici) ani z čeho ho postavit
    // (krajina testu nemá stromy, klády nejsou) – pole a hřbitov jdou
    const noSettlers = { resource: 'settlers', amount: 1, missing: 1 };
    expect(view.build).toEqual({
      zemnice: {
        laborManDays: 60,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 7, missing: 7 }, noSettlers],
        affordable: false,
      },
      polozemnice: {
        laborManDays: 220,
        perHa: false,
        perSquare: false,
        upfront: [{ resource: 'wood', amount: 18, missing: 18 }, noSettlers],
        affordable: false,
      },
      field: { laborManDays: 40, perHa: true, perSquare: false, upfront: [], affordable: true },
      cemetery: { laborManDays: 10, perHa: false, perSquare: true, upfront: [], affordable: true },
    });
    // zakladatelé bydlí na staveništi – domácnost s obydlím přibude s dostavěním zemnice
    expect(view.households).toEqual([]);
    expect(view.storesMonths).toBeCloseTo(18, 0);
    const fieldId = view.fields[0]?.id;
    expect(view.constructions).toEqual([
      {
        id: expect.any(Number),
        kind: 'dwelling',
        label: 'Zemnice',
        progress: 0,
        dwellingType: 'zemnice',
        dwellingId: null,
        fieldId: null,
        cemeteryId: null,
        treesToFell: 7,
      },
      {
        id: expect.any(Number),
        kind: 'field',
        label: 'Pole 0,11 ha',
        progress: 0,
        dwellingType: null,
        dwellingId: null,
        fieldId,
        cemeteryId: null,
        treesToFell: 0,
      },
    ]);
    expect(view.woodLogs).toBe(0);
    expect(view.fields).toEqual([
      { id: fieldId, areaM2: 5 * 225, fertility: 50, stages: { founding: 5 } },
    ]);
    expect(view.hungry).toBe(false);
    expect(view.constructionsStalled).toBe(false);
  });

  it('plná domácnost se 4 dospělými dá lidi k osídlení – obydlí jde stavět', () => {
    const s = settled();
    for (const [i, years] of [20, 19].entries()) {
      s.people.push({ id: 90 + i, bornDay: DAY - Math.ceil(years * 365.25), dwellingId: 1 });
    }
    s.people.forEach((p) => (p.bornDay = Math.min(p.bornDay, DAY - Math.ceil(16 * 365.25))));
    s.lastDay = DAY;
    s.woodLogs = 20.3;
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.build.polozemnice).toEqual({
      laborManDays: 220,
      perHa: false,
      perSquare: false,
      upfront: [
        { resource: 'wood', amount: 18, missing: 0 },
        { resource: 'settlers', amount: 1, missing: 0 },
      ],
      affordable: true,
    });
    expect(view.fullHousehold).toBe(true);
    expect(view.woodLogs).toBe(20);
    expect(view.scene.woodLogs).toBe(20);
    // bez klád (a bez stromů v krajině) chybí dřevo
    s.woodLogs = 5;
    const short = buildVillageView(record(s), landscape, DAY).build.zemnice;
    expect(short.affordable).toBe(false);
    expect(short.upfront[0]).toEqual({ resource: 'wood', amount: 7, missing: 2 });
  });

  it('s dostavěnou zemnicí: domácnost s věky obyvatel', () => {
    const view = buildVillageView(record(settled()), landscape, DAY);
    expect(view.households).toEqual([
      {
        dwellingId: 1,
        type: 'zemnice',
        occupants: 4,
        capacity: 6,
        full: false,
        overcrowded: false,
        condition: 1,
        ages: [25, 25, 13, 12],
        ageYears: 0,
      },
    ]);
  });

  it('scéna: zemnice zakladatelů je do dostavění staveniště', () => {
    const s = state();
    const site = s.constructions[0]!;
    // bez vrstvy překážek kácí zemnice 7 stromů bez polohy (14 čd), pak staví (46 čd) – scéna
    // ukazuje jen stavbu
    expect(site.cost).toBe(60);
    site.done = 14 + 11.5;
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings).toEqual([
      {
        id: site.id,
        type: 'zemnice',
        position: { x: -50, z: -50, rotation: 0.5 },
        built: false,
        progress: 0.25,
      },
    ]);
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
    const s = settled();
    s.people = [];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings[0]?.inhabited).toBe(false);
  });

  it('scéna: obydlí, díly pole ve středech políček a rozestavěné obydlí', () => {
    const s = settled();
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
      dwellingType: 'polozemnice',
      dwellingId: null,
      fieldId: null,
      cemeteryId: null,
      treesToFell: 0,
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

  it('staveniště ve scéně ukazuje stavbu bez kácení, panel celý průběh a stromy ke skácení', () => {
    const s = settled();
    const fell = [3, 3, 3, 3].map((cost, i) => ({ id: 500 + i, cost }));
    s.constructions.push({
      id: 99,
      kind: 'dwelling',
      startedDay: DAY,
      cost: 100 + 12,
      done: 6 + 25,
      dwellingType: 'polozemnice',
      position: { x: 30, z: 40, rotation: 0 },
      dwellingId: null,
      fieldId: null,
      wood: { trees: 18, fromPile: 14, fell, felled: 2 },
    });
    const { scene, constructions } = buildVillageView(record(s), landscape, DAY);
    expect(scene.dwellings.find((d) => d.id === 99)?.progress).toBeCloseTo(0.19, 9);
    const c = constructions.find((x) => x.id === 99)!;
    expect(c.progress).toBeCloseTo(31 / 112, 9);
    expect(c.treesToFell).toBe(2);
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

  it('scéna nese odstraněné a pokácené překážky – i do kontroly umístění v prohlížeči', () => {
    const s = state();
    s.clearedObstacles = [{ id: 7, day: DAY }];
    s.felledTrees = [
      { id: 9, day: DAY },
      { id: 11, day: DAY - 12_000 },
    ];
    const { scene } = buildVillageView(record(s), landscape, DAY);
    // strom 11 je pokácený přes 30 let – roste z náletu
    expect(scene.obstacles).toEqual({ removed: [7], stumps: [9], saplings: [11] });
    expect(placementVillageFromScene(scene).obstacleChanges).toEqual(scene.obstacles);
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

describe('hřbitov v pohledu na ves', () => {
  const withCemetery = (): VillageState =>
    foundCemetery(state(), DAY - 1, {
      squares: [
        { cell: { x: 0, y: 0 }, x: -112.5, z: -112.5, waterDistanceM: 500, obstacleCost: 0 },
        { cell: { x: 1, y: 0 }, x: -97.5, z: -112.5, waterDistanceM: 500, obstacleCost: 0 },
      ],
      squareSizeM: 15,
    });

  it('zakládaný hřbitov: stavba, místo, scéna a cena za čtverec', () => {
    const view = buildVillageView(record(withCemetery()), landscape, DAY);
    const cemeteryId = view.cemeteries[0]?.id;
    expect(view.build.cemetery).toMatchObject({ laborManDays: 10, perSquare: true });
    expect(view.constructions.at(-1)).toMatchObject({
      kind: 'cemetery',
      label: 'Hřbitov (2 čtverce)',
      cemeteryId,
    });
    expect(view.cemeteries).toEqual([
      {
        id: cemeteryId,
        squares: 2,
        built: false,
        progress: 0,
        capacity: 112,
        graves: 0,
        freeGraves: 112,
        yearsLeft: null,
      },
    ]);
    expect(view.scene.cemeteries).toEqual([
      {
        id: cemeteryId,
        squares: [
          { cell: { x: 0, y: 0 }, x: -112.5, z: -112.5, size: 15 },
          { cell: { x: 1, y: 0 }, x: -97.5, z: -112.5, size: 15 },
        ],
        built: false,
        progress: 0,
        graves: 0,
      },
    ]);
    expect(placementVillageFromScene(view.scene).cemeteries).toEqual([
      { squares: [{ cell: { x: 0, y: 0 } }, { cell: { x: 1, y: 0 } }] },
    ]);
  });

  it('hotový hřbitov s hroby: obsazené hroby a zbývající místo', () => {
    const s = withCemetery();
    s.constructions = s.constructions.filter((c) => c.kind !== 'cemetery');
    s.cemeteries![0]!.builtDay = DAY - 1;
    s.cemeteries![0]!.graves = 100;
    const view = buildVillageView(record(s), landscape, DAY);
    expect(view.cemeteries[0]).toMatchObject({ built: true, progress: 1, freeGraves: 12 });
    expect(view.cemeteries[0]).not.toHaveProperty('spaceLabel');
    expect(view.scene.cemeteries?.[0]).toMatchObject({ built: true, graves: 100 });
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
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: true },
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: false },
    { day: DAY, kind: 'cemetery-full', cemeteryId: 5, othersFree: false, othersBuilding: true },
    {
      day: DAY,
      kind: 'construction-finished',
      constructionKind: 'cemetery',
      dwellingId: null,
      fieldId: null,
    },
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

describe('kronika – zaplněný hřbitov', () => {
  const full = (othersFree: boolean, othersBuilding?: boolean): ChronicleEvent => ({
    day: DAY,
    kind: 'cemetery-full',
    cemeteryId: 5,
    othersFree,
    ...(othersBuilding === undefined ? {} : { othersBuilding }),
  });

  it('„není kam pohřbívat“ jen když se žádný hřbitov nestaví ani nemá místo', () => {
    expect(chronicleText(full(true, false), 'X')).toBe(
      'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.',
    );
    expect(chronicleText(full(false, true), 'X')).toBe('Hřbitov se zaplnil.');
    expect(chronicleText(full(false, false), 'X')).toBe(
      'Hřbitov se zaplnil – mrtvé není kam pohřbívat.',
    );
    expect(chronicleText(full(false), 'X')).toMatch(/není kam/);
  });
});
