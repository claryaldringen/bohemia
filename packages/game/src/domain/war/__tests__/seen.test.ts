import { describe, expect, it } from 'vitest';
import { areaOutline, fortificationArea, fortSegments } from '../../village';
import type { Fortification } from '../../village/fortification/types';
import { horse, horsePen } from '../../village/__tests__/horse-fixtures';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type {
  Church,
  Construction,
  Dwelling,
  SacredBuilding,
  TileCell,
  VillageState,
  Workshop,
} from '../../village/types';
import type { MarchGrid, Pos } from '../march-grid';
import { JOURNEY } from '../rules-war';
import { lookAround, sightingsOf, type SeenCell } from '../seen';
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
  return village(
    [kin({ id: 1, age: 30, sex: 'male' }), kin({ id: 4, age: 8, sex: 'female', home: 2 })],
    [house(1, 0, 0), smithy],
    {
      storesKg: 900,
      constructions: [site],
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
    expect(cell).toEqual({ trail: [[0, 0]], parts: [] });
    expect('villageId' in cell).toBe(false);
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
      new Set(['dwelling', 'site', 'pen', 'sacred', 'church']),
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
