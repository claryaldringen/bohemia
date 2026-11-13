import { describe, expect, it } from 'vitest';
import { areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import { horse, horsePen } from '../../village/__tests__/horse-fixtures';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type {
  Church,
  Construction,
  Dwelling,
  KilnRemnant,
  SacredBuilding,
  SacredRuin,
  ThreshingFloor,
  TileCell,
  VillageState,
  Workshop,
} from '../../village/types';
import type { MarchGrid, Pos } from '../march-grid';
import { JOURNEY } from '../rules-war';
import { lookAround, mergeKnowledge, sightingsOf, type SeenCell, type SeenPart } from '../seen';
import { field } from './battle-fixtures';

// Objevování za jízdy (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 6): dohled
// 150 m, z lesa a do lesa 50 m; viděné stavby zůstanou jako „stará zpráva“, stopa po 20 m.

const DAY = 1000;
/** Les v pásu kolem z ≈ 100 m (jako v sight.test.ts). */
const forest = (tx: number, ty: number): boolean => tx >= 58 && tx <= 70 && ty >= 69 && ty <= 72;
const GRID = field([], forest).grid;
const MEADOW_GRID = field().grid;
const EYE: Pos = { x: 0, z: 0 };
const FAR: Pos = { x: 600, z: 600 };

function house(id: number, x: number, z: number, extra: Partial<Dwelling> = {}): Dwelling {
  return { ...dwelling(id), position: { x, z, rotation: 0.5 }, ...extra };
}

/** Ves s domy `dwellings` – jeden muž bydlí v domě 1. */
function villageOf(dwellings: Dwelling[], extra: Partial<VillageState> = {}): VillageState {
  return village([kin({ id: 1, age: 30, sex: 'male' })], dwellings, extra);
}

function look(
  prev: SeenCell | undefined,
  v: VillageState | null,
  eyes: readonly Pos[] = [EYE],
  day = DAY,
  grid: MarchGrid | null = GRID,
): SeenCell {
  return lookAround(prev, { village: v, eyes, grid, day });
}

const keys = (cell: SeenCell): string[] => cell.parts.map((p) => p.key);

/** Palisáda 20 × 20 políček kolem středu mapy (svět ≈ −150…150 m), postavená měsíc předem. */
function bigFort(): Fortification {
  const cells: TileCell[] = [];
  for (let y = 54; y < 74; y++) for (let x = 54; x < 74; x++) cells.push({ x, y });
  const area = fortificationArea(cells, null, { size: 128, cellSizeM: 15 });
  if ('error' in area) throw new Error(area.error);
  const outline = areaOutline(area, 'palisade');
  return {
    id: 4,
    points: outline.points.map((p) => [p[0], p[1]] as const),
    kind: 'palisade',
    segments: fortSegments(outline).map((s) => ({
      index: s.index,
      builtDay: DAY - 30,
      state: 1,
    })),
    gates: [],
  };
}

/** Ves se vším, co ves má: lidé, zásoby, dílna se dřívím, zahrada, koně, kněz a hroby. */
function richVillage(): VillageState {
  const smithy = house(2, 20, 10, {
    workshop: { craft: 'smith', felling: null, fuelKg: 40 } as unknown as Workshop,
    garden: { legumeKg: 12 },
  });
  const site: Construction = {
    id: 50,
    kind: 'rebuild',
    startedDay: DAY - 5,
    cost: 10,
    done: 4,
    dwellingType: 'srub',
    position: { x: -20, z: 15, rotation: 0 },
    dwellingId: 1,
    fieldId: null,
  };
  const idol: SacredBuilding = {
    id: 80,
    kind: 'idol',
    position: { x: -30, z: 0, rotation: 0 },
    builtDay: 5,
  };
  const church: Church = {
    id: 90,
    type: 'rotunda',
    dims: { kind: 'round', diameter: 8, height: 6 },
    position: { x: 30, z: -10, rotation: 0 },
    finishedDay: DAY - 100,
    priestId: 1,
    graves: [{ personId: 3, day: DAY - 50 }],
  };
  const fortWithWork: Fortification = { ...bigFort(), id: 6 };
  const fortSite: Construction = {
    id: 51,
    kind: 'fortification',
    fortificationId: 6,
    fortWork: 'build',
    startedDay: DAY - 5,
    cost: 10,
    done: 3,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
  } as unknown as Construction;
  return village(
    [kin({ id: 1, age: 30, sex: 'male' }), kin({ id: 4, age: 8, sex: 'female', home: 2 })],
    [house(1, 0, 0), smithy],
    {
      storesKg: 900,
      constructions: [site, fortSite],
      fortifications: [fortWithWork],
      pens: [horsePen(5, [horse(6, 5)])],
      sacredBuildings: [idol],
      churches: [church],
    },
  );
}

describe('lookAround – stavby v dohledu', () => {
  it('dům do 150 m od muže přibude, dům za lesem dál než 50 m ne', () => {
    const v = villageOf([house(1, 140, 0), house(2, 0, 100), house(3, 160, 0)]);
    const cell = look(undefined, v);
    expect(cell.parts).toEqual([
      {
        key: 'dwelling:1',
        pos: { x: 140, z: 0 },
        day: DAY,
        data: {
          kind: 'dwelling',
          id: 1,
          type: 'zemnice',
          position: { x: 140, z: 0, rotation: 0.5 },
          condition: 1,
        },
      },
    ]);
    // z lesa do 50 m už ano; dům 1 mimo dohled zůstane
    expect(keys(look(cell, v, [{ x: 0, z: 70 }]))).toEqual(['dwelling:1', 'dwelling:2']);
  });

  it('dům, na který muži znovu vidí, má dnešní stav; týž den se znovu nepřepisuje', () => {
    const first = look(undefined, villageOf([house(1, 140, 0)]));
    const later = villageOf([house(1, 140, 0, { condition: 0.4 })]);
    const again = look(first, later, [EYE], DAY + 3);
    expect(again.parts).toHaveLength(1);
    expect(again.parts[0]).toMatchObject({ key: 'dwelling:1', day: DAY + 3 });
    expect(again.parts[0]!.data).toMatchObject({ kind: 'dwelling', condition: 0.4 });
    expect(look(again, later, [EYE], DAY + 3)).toBe(again);
  });

  it('dům, který mezitím zmizel a jeho místo je v dohledu, zmizí', () => {
    const first = look(undefined, villageOf([house(1, 140, 0), house(2, 100, 0)]));
    expect(keys(first)).toEqual(['dwelling:1', 'dwelling:2']);
    const gone = look(first, villageOf([house(2, 100, 0)]), [EYE], DAY + 1);
    expect(keys(gone)).toEqual(['dwelling:2']);
    // ves z mapy zmizela celá – co je v dohledu, zmizí taky
    expect(keys(look(gone, null, [EYE], DAY + 2))).toEqual([]);
  });

  it('dům mimo dohled zůstane, jak byl („stará zpráva“)', () => {
    const first = look(undefined, villageOf([house(1, 140, 0), house(2, 100, 0)]));
    // dům 1 zchátral, dům 2 zmizel – muži jsou daleko, rod to neví
    const later = look(first, villageOf([house(1, 140, 0, { condition: 0.2 })]), [FAR], DAY + 5);
    expect(later.parts).toEqual(first.parts);
  });

  it('opevnění celé prvním dohledem – na kterýkoli bod obvodu; dům uvnitř mimo dohled ne', () => {
    const fort = bigFort();
    const v = villageOf([house(1, 0, 120)], { fortifications: [fort] });
    const eye: Pos = { x: 0, z: -250 };
    const cell = look(undefined, v, [eye], DAY, MEADOW_GRID);
    expect(keys(cell)).toEqual(['fortification:4']);
    expect(cell.parts[0]!.data).toEqual({ kind: 'fortification', fort, works: [] });
    // kontrola: na bod obvodu je vidět, na celý obvod ne
    const inReach = ([x, z]: readonly [number, number]): boolean =>
      (x - eye.x) * (x - eye.x) + (z - eye.z) * (z - eye.z) <= 150 * 150;
    expect([fort.points!.some(inReach), fort.points!.every(inReach)]).toEqual([true, false]);
  });

  it('mapa bez vsi nese jen stopu', () => {
    const cell = look(undefined, null, [{ x: 3, z: 4 }]);
    expect(cell).toEqual({ since: DAY, trail: [[0, 0]], parts: [] });
    expect('villageId' in cell).toBe(false);
  });
});

/** Ves s humny, milířem, milířištěm a rozvalinami – i s tím, co se o lidech nesmí prozradit. */
function buildingsVillage(): VillageState {
  const burner = house(3, 10, 40, {
    workshop: {
      craft: 'charcoal',
      felling: null,
      fuelKg: 7,
      kilns: [
        {
          id: 60,
          site: { x: 30, z: 60 },
          trees: [{ id: 1, cost: 2 }],
          stage: 'draw',
          prepared: 1,
          done: 0,
          charcoalKg: 50,
        },
      ],
    } as unknown as Workshop,
  });
  const floors: ThreshingFloor[] = [
    { id: 70, position: { x: -40, z: 20, rotation: 0.3 }, builtDay: 5, threshed: true },
    { id: 71, position: { x: -60, z: 20, rotation: 0 }, builtDay: null },
  ];
  const site: Construction = {
    id: 71,
    kind: 'threshing-floor',
    startedDay: DAY - 3,
    cost: 10,
    done: 5,
    dwellingType: null,
    position: { x: -60, z: 20, rotation: 0 },
    dwellingId: null,
    fieldId: null,
  };
  const remnant: KilnRemnant = { id: 61, burnerId: 3, x: 50, z: 50, day: DAY - 100 };
  const sacredRuin: SacredRuin = {
    id: 81,
    kind: 'shrine',
    position: { x: -30, z: -30, rotation: 0 },
    day: DAY - 20,
  };
  return village([kin({ id: 1, age: 30, sex: 'male' })], [house(1, 0, 0), burner], {
    threshingFloors: floors,
    constructions: [site],
    kilnRemnants: [remnant],
    sacredRuins: [sacredRuin],
    ruins: [
      {
        id: 9,
        type: 'srub',
        position: { x: 70, z: 10, rotation: 0 },
        craft: 'smith',
        day: DAY - 10,
        charred: true,
      },
    ],
  });
}

describe('sightingsOf – humna, milíře a rozvaliny', () => {
  it('humna, milíř, milířiště a rozvaliny jsou ve znalosti', () => {
    const data = Object.fromEntries(
      sightingsOf(buildingsVillage(), DAY).map((s) => [s.key, s.data]),
    );
    expect(data['threshing:70']).toEqual({
      kind: 'threshing',
      id: 70,
      position: { x: -40, z: 20, rotation: 0.3 },
      built: true,
      progress: 1,
    });
    expect(data['threshing:71']).toMatchObject({ kind: 'threshing', built: false, progress: 0.5 });
    expect(data['kiln:60']).toEqual({
      kind: 'kiln',
      id: 60,
      burnerId: 3,
      x: 30,
      z: 60,
      stage: 'draw',
      progress: expect.any(Number),
      charcoal: expect.any(Number),
    });
    expect(data['kilnRemnant:61']).toEqual({
      kind: 'kilnRemnant',
      id: 61,
      burnerId: 3,
      x: 50,
      z: 50,
      overgrowth: expect.any(Number),
    });
    expect(data['ruin:9']).toMatchObject({
      kind: 'ruin',
      id: 9,
      type: 'srub',
      craft: 'smith',
      charred: true,
    });
    expect(data['sacredRuin:81']).toMatchObject({ kind: 'sacredRuin', type: 'shrine' });
  });

  it('dům, který shořel, je po pohledu na jeho místo ve znalosti rozvalina', () => {
    const before = look(undefined, villageOf([house(1, 70, 10)]), [EYE], DAY, MEADOW_GRID);
    expect(keys(before)).toEqual(['dwelling:1']);
    const burned = villageOf([], {
      ruins: [
        {
          id: 1,
          type: 'zemnice',
          position: { x: 70, z: 10, rotation: 0.5 },
          day: DAY + 1,
          charred: true,
        },
      ],
    });
    const after = look(before, burned, [EYE], DAY + 1, MEADOW_GRID);
    expect(keys(after)).toEqual(['ruin:1']);
  });

  it('v serializované znalosti nejsou lidé, domácnosti ani zásoby ani u nových druhů', () => {
    const cell = look(undefined, buildingsVillage(), [EYE], DAY, MEADOW_GRID);
    expect(new Set(cell.parts.map((p) => p.data.kind))).toEqual(
      new Set(['dwelling', 'threshing', 'kiln', 'kilnRemnant', 'ruin', 'sacredRuin']),
    );
    const seenKeys = new Set<string>();
    JSON.stringify(cell, (k: string, v: unknown) => {
      seenKeys.add(k);
      return v;
    });
    const forbidden = [
      'people',
      'fuelKg',
      'charcoalKg',
      'trees',
      'threshed',
      'idleSince',
      'builtDay',
      'felling',
    ];
    expect([...seenKeys].filter((k) => forbidden.includes(k))).toEqual([]);
  });

  it('vcelku = po kouscích přes JSON', () => {
    const v = buildingsVillage();
    const whole = look(undefined, v, [EYE], DAY, MEADOW_GRID);
    let pieces: SeenCell | undefined;
    for (const eye of [EYE, { x: 20, z: 20 }, { x: -30, z: 10 }]) {
      pieces = look(
        pieces && (JSON.parse(JSON.stringify(pieces)) as SeenCell),
        v,
        [eye],
        DAY,
        MEADOW_GRID,
      );
    }
    expect(pieces!.parts).toEqual(whole.parts);
  });
});

describe('lookAround – stopa', () => {
  it('stopa přibývá po 20 m, neopakuje body a je seřazená', () => {
    expect(JOURNEY.trailStepM).toBe(20);
    let cell = look(undefined, null, [{ x: 3, z: -4 }]);
    expect(cell.trail).toEqual([[0, 0]]);
    // muži do půl kroku od bodu stopy – nic nového, týž objekt
    expect(look(cell, null, [{ x: 9, z: 9 }])).toBe(cell);
    for (let x = 0; x <= 100; x += 5) cell = look(cell, null, [{ x, z: 0 }]);
    const line = [0, 20, 40, 60, 80, 100].map((x) => [x, 0]);
    expect(cell.trail).toEqual(line);
    for (let x = 100; x >= 0; x -= 5) cell = look(cell, null, [{ x, z: 0 }]);
    expect(cell.trail).toEqual(line);
    // pořadí podle x, pak z – ne podle pořadí příchodu
    cell = look(cell, null, [
      { x: 0, z: 40 },
      { x: 0, z: -40 },
    ]);
    expect(cell.trail.slice(0, 3)).toEqual([
      [0, -40],
      [0, 0],
      [0, 40],
    ]);
  });
});

describe('sightingsOf – co je ve vsi vidět', () => {
  it('v serializovaném SeenCell nejsou klíče people, storesKg ani id domácností', () => {
    const cell = look(undefined, richVillage(), [EYE], DAY, MEADOW_GRID);
    expect(new Set(cell.parts.map((p) => p.data.kind))).toEqual(
      new Set(['dwelling', 'site', 'pen', 'sacred', 'church', 'fortification']),
    );
    const seenKeys = new Set<string>();
    JSON.stringify(cell, (k: string, v: unknown) => {
      seenKeys.add(k);
      return v;
    });
    const forbidden = [
      'people',
      'storesKg',
      'dwellingId',
      'householdId',
      'households',
      'horses',
      'oxen',
      'priestId',
      'graves',
      'fuelKg',
      'garden',
      'legumeKg',
    ];
    expect([...seenKeys].filter((k) => forbidden.includes(k))).toEqual([]);
  });

  it('staveniště nese průběh, dílna řemeslo; kostel typ, rozměry a průběh', () => {
    const list = sightingsOf(richVillage(), DAY);
    const data = Object.fromEntries(list.map((s) => [s.key, s.data]));
    expect(data['site:50']).toEqual({
      kind: 'site',
      id: 50,
      type: 'srub',
      position: { x: -20, z: 15, rotation: 0 },
      progress: 0.4,
    });
    expect(data['dwelling:2']).toMatchObject({ kind: 'dwelling', craft: 'smith' });
    expect(data['church:90']).toEqual({
      kind: 'church',
      id: 90,
      type: 'rotunda',
      dims: { kind: 'round', diameter: 8, height: 6 },
      position: { x: 30, z: -10, rotation: 0 },
      built: true,
      decorated: false,
      progress: { foundation: 1, walls: 1, roof: 1, decor: 0 },
    });
    expect(data['pen:5']).toMatchObject({ kind: 'pen', species: 'horse', built: true });
    expect(data['sacred:80']).toMatchObject({ kind: 'sacred', type: 'idol', built: true });
  });

  it('pro tutéž ves a den z paměti; výsledek jako bez paměti', () => {
    const v = richVillage();
    const a = sightingsOf(v, DAY);
    const b = sightingsOf(v, DAY);
    expect(b[0]).toBe(a[0]);
    expect(sightingsOf(structuredClone(v), DAY)).toEqual(a);
  });
});

describe('lookAround – zánik', () => {
  it('stavba, která v dohledu zmizela, se zapíše do gone s dnešním dnem; nová znalost bez zániku gone nemá', () => {
    const first = look(undefined, villageOf([house(1, 140, 0), house(2, 100, 0)]));
    expect(first.gone).toBeUndefined();
    const after = look(first, villageOf([house(2, 100, 0)]), [EYE], DAY + 1);
    expect(keys(after)).toEqual(['dwelling:2']);
    expect(after.gone).toEqual([{ key: 'dwelling:1', day: DAY + 1 }]);
    // dům mimo dohled nezmizel – nic se nezapíše
    const far = look(first, villageOf([house(2, 100, 0)]), [FAR], DAY + 1);
    expect(far.gone).toBeUndefined();
  });
});

describe('mergeKnowledge', () => {
  const dwellingPart = (n: number, day: number, condition = 1): SeenPart => ({
    key: `dwelling:${n}`,
    pos: { x: n, z: 0 },
    day,
    data: { kind: 'dwelling', condition } as unknown as SeenPart['data'],
  });
  const ruinPart = (n: number, day: number): SeenPart => ({
    key: `ruin:${n}`,
    pos: { x: n, z: 0 },
    day,
    data: { kind: 'ruin' } as unknown as SeenPart['data'],
  });
  const cell = (
    parts: SeenPart[],
    trail: [number, number][] = [],
    extra: Partial<SeenCell> = {},
  ): SeenCell => ({ villageId: 'v', trail, parts, ...extra });

  it('bez staré znalosti je výsledek fresh; stopy se sjednotí seřazeně bez opakování', () => {
    const fresh = cell([dwellingPart(1, 5)], [[0, 0]]);
    expect(mergeKnowledge(null, fresh)).toEqual(fresh);
    const merged = mergeKnowledge(
      cell(
        [],
        [
          [0, 20],
          [20, 0],
        ],
      ),
      cell(
        [],
        [
          [0, 0],
          [20, 0],
        ],
      ),
    );
    expect(merged.trail).toEqual([
      [0, 0],
      [0, 20],
      [20, 0],
    ]);
  });

  it('část z novějšího dne přepíše starší, starší fresh starou nepřepíše', () => {
    const old = cell([dwellingPart(1, 5, 1), dwellingPart(2, 9, 0.5)]);
    const fresh = cell([dwellingPart(1, 7, 0.4), dwellingPart(2, 6, 1)]);
    const merged = mergeKnowledge(old, fresh);
    expect(merged.parts.map((p) => [p.key, p.day])).toEqual([
      ['dwelling:1', 7],
      ['dwelling:2', 9],
    ]);
    expect(merged.parts[0]!.data).toMatchObject({ condition: 0.4 });
  });

  it('stavba, která ve fresh nebyla a zánik nemá, zůstane', () => {
    const old = cell([dwellingPart(1, 5), dwellingPart(2, 5)]);
    const merged = mergeKnowledge(old, cell([dwellingPart(2, 8)]));
    expect(merged.parts.map((p) => p.key)).toEqual(['dwelling:1', 'dwelling:2']);
    expect(merged.gone).toBeUndefined();
  });

  it('shořelý dům se po novém pohledu nevrátí, rozvalina zůstane', () => {
    const old = cell([dwellingPart(1, 5), dwellingPart(2, 5)]);
    const fresh = cell([ruinPart(1, 9)], [], { gone: [{ key: 'dwelling:1', day: 9 }] });
    const merged = mergeKnowledge(old, fresh);
    expect(merged.parts.map((p) => p.key)).toEqual(['dwelling:2', 'ruin:1']);
    expect(merged.gone).toEqual([{ key: 'dwelling:1', day: 9 }]);
    // zánik z dřívějška starší stavbu odstraní jen do svého dne
    const later = mergeKnowledge(cell([dwellingPart(1, 12)]), fresh);
    expect(later.parts.map((p) => p.key)).toEqual(['dwelling:1', 'ruin:1']);
  });

  it('záznamy gone se sloučí na nejnovější den každého klíče', () => {
    const merged = mergeKnowledge(
      cell([], [], {
        gone: [
          { key: 'dwelling:1', day: 4 },
          { key: 'dwelling:3', day: 8 },
        ],
      }),
      cell([], [], { gone: [{ key: 'dwelling:1', day: 6 }] }),
    );
    expect(merged.gone).toEqual([
      { key: 'dwelling:1', day: 6 },
      { key: 'dwelling:3', day: 8 },
    ]);
  });

  it('jiná ves na mapě – staré stavby a zánik se zahodí, stopa zůstane', () => {
    const old = cell([dwellingPart(1, 5)], [[0, 0]], { gone: [{ key: 'dwelling:9', day: 3 }] });
    const merged = mergeKnowledge(old, cell([dwellingPart(2, 6)], [[20, 0]], { villageId: 'w' }));
    expect(merged.villageId).toBe('w');
    expect(merged.parts.map((p) => p.key)).toEqual(['dwelling:2']);
    expect(merged.gone).toBeUndefined();
    expect(merged.trail).toEqual([
      [0, 0],
      [20, 0],
    ]);
  });

  it('je idempotentní a nezávislý na pořadí částí; vstupy nemění', () => {
    const old = cell([dwellingPart(3, 5), dwellingPart(1, 5)], [[0, 0]]);
    const fresh = cell([ruinPart(1, 9), dwellingPart(2, 9)], [[20, 0]], {
      gone: [{ key: 'dwelling:1', day: 9 }],
    });
    const frozen = JSON.stringify([old, fresh]);
    const once = mergeKnowledge(old, fresh);
    expect(JSON.stringify([old, fresh])).toBe(frozen);
    expect(mergeKnowledge(once, fresh)).toEqual(once);
    const shuffled = cell([...fresh.parts].reverse(), fresh.trail, { gone: fresh.gone! });
    expect(mergeKnowledge({ ...old, parts: [...old.parts].reverse() }, shuffled)).toEqual(once);
    expect(once.parts.map((p) => p.key)).toEqual(['dwelling:2', 'dwelling:3', 'ruin:1']);
  });

  // pokrytí (kolo oprav Úlohy 11): čerstvý záznam je v dohledu své stopy od `since` úplný
  it('výjezd projede kolem shořelého domu ze staré znalosti – dům zmizí, rozvalina zůstane', () => {
    // den 5: rod viděl domy 1 a 2; den 25 jiný výjezd dům 3 (postavený až po průjezdu níž)
    const early = look(
      undefined,
      villageOf([house(1, 30, 0), house(2, 30, 120)]),
      [EYE],
      5,
      MEADOW_GRID,
    );
    const late = look(undefined, villageOf([house(3, -300, 0)]), [{ x: -300, z: 40 }], 25);
    const known = mergeKnowledge(early, late);
    expect(keys(known)).toEqual(['dwelling:1', 'dwelling:2', 'dwelling:3']);
    // den 20: dům 1 shořel, dům 2 zmizel, dům 3 ještě nestojí; výjezd jede 20 m od místa domu 1
    // i domu 3, od místa domu 2 je 100 m (otevřená krajina – dál než lesní dohled)
    const burned = villageOf([], {
      ruins: [{ id: 1, type: 'zemnice', position: { x: 30, z: 0, rotation: 0 }, day: 19 }],
    });
    const path = [-300, -200, -100, 0, 30].map((x) => ({ x, z: 20 }));
    const passing = look(undefined, burned, path, 20, MEADOW_GRID);
    expect(passing.since).toBe(20);
    expect(keys(passing)).toEqual(['ruin:1']);
    const merged = mergeKnowledge(known, passing);
    // dům 2 je stará zpráva, dům 3 viděl jiný záznam až po since
    expect(keys(merged)).toEqual(['dwelling:2', 'dwelling:3', 'ruin:1']);
    expect(merged.since).toBe(5);
    // zánik zjištěný pokrytím zůstane v záznamu (dům 2 je dál než lesní dohled)
    expect(merged.gone).toEqual([{ key: 'dwelling:1', day: 20 }]);
  });

  it('pokrytí jen do lesního dohledu odkudkoli z bodu stopy; bez since nic neodstraní', () => {
    // bod stopy [0, 0] je zaokrouhlený po 20 m – muž stál nejvýš 10 m od něj v každé ose
    const old = cell([dwellingPart(35, 5), dwellingPart(40, 5)]);
    const fresh = cell([], [[0, 0]], { since: 8 });
    expect(mergeKnowledge(old, fresh).parts.map((p) => p.key)).toEqual(['dwelling:40']);
    const legacy = cell([], [[0, 0]]);
    expect(mergeKnowledge(old, legacy).parts.map((p) => p.key)).toEqual([
      'dwelling:35',
      'dwelling:40',
    ]);
  });

  it('s since a pokrytím je idempotentní a nezávislý na pořadí částí; since je nejmenší z obou', () => {
    const old = cell([dwellingPart(3, 5), dwellingPart(1, 5), dwellingPart(60, 5)], [[0, 0]], {
      since: 4,
    });
    const fresh = cell([ruinPart(1, 9), dwellingPart(3, 9)], [[0, 20]], { since: 8 });
    const frozen = JSON.stringify([old, fresh]);
    const once = mergeKnowledge(old, fresh);
    expect(JSON.stringify([old, fresh])).toBe(frozen);
    expect(once.parts.map((p) => [p.key, p.day])).toEqual([
      ['dwelling:3', 9],
      ['dwelling:60', 5],
      ['ruin:1', 9],
    ]);
    expect(once.since).toBe(4);
    expect(mergeKnowledge(once, fresh)).toEqual(once);
    const shuffled = cell([...fresh.parts].reverse(), fresh.trail, { since: 8 });
    expect(mergeKnowledge({ ...old, parts: [...old.parts].reverse() }, shuffled)).toEqual(once);
    expect(mergeKnowledge(cell([], [], { since: 2 }), fresh).since).toBe(2);
    expect(mergeKnowledge(cell([]), fresh).since).toBe(8);
  });

  describe('pořadí doručení', () => {
    // A: dům viděný den 5 (since 1); B: místo v jistém dohledu je prázdné (since 20)
    const A = cell([dwellingPart(5, 5)], [[0, 20]], { since: 1 });
    const B = cell([], [[0, 20]], { since: 20 });
    const K = cell([], [], {});

    it('dům zaniklý před průjezdem se nevrátí v žádném pořadí; gone nese den 20', () => {
      const results = [
        mergeKnowledge(mergeKnowledge(K, A), B),
        mergeKnowledge(mergeKnowledge(K, B), A),
        mergeKnowledge(K, mergeKnowledge(A, B)),
        mergeKnowledge(mergeKnowledge(null, B), A),
      ];
      for (const r of results) {
        expect(r.parts).toEqual([]);
        expect(r.gone).toEqual([{ key: 'dwelling:5', day: 20 }]);
        expect(r).toEqual(results[0]);
      }
    });

    it('dům postavený znovu a viděný den 30 zůstane a záznam o zániku se zahodí', () => {
      const rebuilt = cell([dwellingPart(5, 30)], [[0, 20]], { since: 28 });
      for (const r of [
        mergeKnowledge(mergeKnowledge(A, B), rebuilt),
        mergeKnowledge(mergeKnowledge(rebuilt, A), B),
        mergeKnowledge(rebuilt, mergeKnowledge(B, A)),
      ]) {
        expect(r.parts.map((p) => [p.key, p.day])).toEqual([['dwelling:5', 30]]);
        expect(r.gone).toBeUndefined();
      }
    });

    // sloučený záznam nese jediné `since` (nejmenší z obou), takže pokrytí pozdějšího záznamu se po
    // sloučení s dřívějším zeslabí – scénáře jsou proto z téhož místa a bez cizích `since` mezi nimi
    it('je symetrické, asociativní a idempotentní na pevných scénářích', () => {
      const cells = [A, B, cell([dwellingPart(5, 30)], [[0, 20]], { since: 28 })];
      for (const x of cells) {
        const once = mergeKnowledge(x, x);
        expect(mergeKnowledge(once, x)).toEqual(once);
        for (const y of cells) {
          expect(mergeKnowledge(x, y)).toEqual(mergeKnowledge(y, x));
          for (const z of cells) {
            expect(mergeKnowledge(mergeKnowledge(x, y), z)).toEqual(
              mergeKnowledge(x, mergeKnowledge(y, z)),
            );
          }
        }
      }
    });
  });
});

describe('lookAround – since', () => {
  it('první pohled do mapy zapíše since, další ho drží; bez očí ani u stopy bez since se nezapíše', () => {
    const first = look(undefined, villageOf([house(1, 70, 10)]), [EYE], DAY);
    expect(first.since).toBe(DAY);
    expect(look(first, villageOf([house(1, 70, 10)]), [{ x: 40, z: 0 }], DAY + 3).since).toBe(DAY);
    expect(look(undefined, null, [], DAY).since).toBeUndefined();
    // záznam z doby před since (stopa bez since) – od kdy se díval, nevíme
    const legacy: SeenCell = { trail: [[0, 0]], parts: [] };
    expect(look(legacy, null, [{ x: 40, z: 0 }], DAY).since).toBeUndefined();
  });
});
