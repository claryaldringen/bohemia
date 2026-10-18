import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  generateLandscape,
  obstacleKind,
  obstaclesOf,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../landscape';
import { foundCemetery, foundField, foundVillage, startNewDwelling } from '../actions';
import { dwellingLaborManDays, villageStock } from '../costs';
import { allocateDay } from '../labor';
import {
  countMatureTrees,
  matureTreesByDistance,
  obstacleChangesAt,
  obstacleStatus,
  NO_OBSTACLE_CHANGES,
} from '../obstacles';
import {
  checkDwellingPlacement,
  fieldPartsFromCells,
  forestEdgeDistanceM,
  placementVillageOf,
  withForestDistances,
} from '../placement';
import {
  DOMESTIC,
  DWELLING_TREES,
  FELLING_MAN_DAYS_PER_TREE,
  LOG_ROT_PER_YEAR,
  dwellingBuildLabor,
} from '../rules';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import type { Person, VillageState } from '../types';
import {
  availableTrees,
  claimedObstacles,
  fellAsWorked,
  fellingCost,
  fuelExtraPerDay,
  nearestMatureTrees,
  planDwellingWood,
  planDwellingWoodFrom,
  reservedTrees,
  treesToFell,
  wholeLogs,
  woodFellingCost,
} from '../wood';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 10, 1);
const YEAR = 365.25;
const SITE = { x: 0, z: 0, rotation: 0 };

const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
  id,
  kind: 'tree',
  look: 'oak-1',
  x,
  z,
  rotation: 0,
  scale: 1,
});

/**
 * Les na východ od počátku: dospělé stromy po 4 m v řadách od x = 60 m do 340 m (krajina 64 ×
 * 15 m = ±480 m). Id roste s pořadím.
 */
function forestLayer(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = 60; x <= 340; x += 4)
    for (let z = -100; z <= 100; z += 4) trees.push(tree(id++, x, z));
  return packObstacles(trees, 64, 15);
}
const forest = forestLayer();

/** Ves s hotovou zemnicí (id 1) a plnou domácností – jeden pár k osídlení, bez polí a staveb. */
function fullVillage(day = DAY): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: SITE }));
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 20), adult(5, 19), adult(6, 5), adult(7, 3)];
  s.constructions = [];
  s.storesKg = 5000;
  s.lastDay = day;
  return s;
}

describe('nejbližší dospělé stromy', () => {
  const real = generateLandscape(3);
  const layer = obstaclesOf(real);

  it('hledání po políčkách dá totéž co projití celé vrstvy (i s vyloučenými stromy)', () => {
    for (const [x, z, count] of [
      [0, 0, 7],
      [120, -80, 18],
      [-300, 250, 30],
      [900, 900, 5],
    ] as const) {
      const all = matureTreesByDistance(layer, NO_OBSTACLE_CHANGES, { x, z });
      const exclude = new Set(all.slice(0, 3).map((t) => t.id));
      expect(nearestMatureTrees(layer, NO_OBSTACLE_CHANGES, { x, z }, count)).toEqual(
        all.slice(0, count),
      );
      expect(nearestMatureTrees(layer, NO_OBSTACLE_CHANGES, { x, z }, count, exclude)).toEqual(
        all.filter((t) => !exclude.has(t.id)).slice(0, count),
      );
    }
  });

  it('počet stromů ke skácení (mezipaměť vrstvy + změny vsi) sedí s projitím celé vrstvy', () => {
    const s = fullVillage();
    const near = matureTreesByDistance(layer, NO_OBSTACLE_CHANGES, SITE, { limit: 10 });
    const stone = Array.from({ length: layer.count }, (_, i) => i).find(
      (i) => obstacleKind(layer, i) === 'stone',
    )!;
    s.felledTrees = [
      { id: near[0]!.id, day: DAY - 10 },
      { id: near[1]!.id, day: DAY - 40 * 366 }, // dorůstá z náletu
      { id: near[2]!.id, day: DAY - 80 * 366 }, // už zase dospělý
    ];
    s.clearedObstacles = [
      { id: near[3]!.id, day: DAY },
      { id: layer.id[stone]!, day: DAY },
    ];
    s.parts = [
      {
        id: 90,
        fieldId: 89,
        areaM2: 225,
        distanceM: 50,
        naturalFertility: 50,
        fertilityShare: 1,
        bonusUntilDay: null,
        state: 'founding',
        sownYears: 0,
        fallowSinceDay: null,
        foundingCost: 10,
        foundingDone: 0,
        surface: 'meadow',
        obstacles: [near[4]!.id, near[0]!.id],
      },
    ];
    s.constructions = [
      {
        id: 91,
        kind: 'dwelling',
        startedDay: DAY,
        cost: 60,
        done: 0,
        dwellingType: 'zemnice',
        position: SITE,
        dwellingId: null,
        fieldId: null,
        wood: { trees: 7, fromPile: 5, fell: [{ id: near[5]!.id, cost: 2 }], felled: 0 },
      },
    ];
    const changes = obstacleChangesAt(s, DAY);
    const status = obstacleStatus(changes);
    const claimed = new Set([near[4]!.id, near[0]!.id, near[5]!.id]);
    let brute = 0;
    for (let i = 0; i < layer.count; i++) {
      if (status.kindOf(layer, i) === 'tree' && !claimed.has(layer.id[i]!)) brute++;
    }
    expect(availableTrees(layer, s, DAY)).toBe(brute);
    expect(availableTrees(layer, s, DAY)).toBe(countMatureTrees(layer, changes) - 2);
  });

  it('když stromů není dost, vrátí všechny; pokácené a odstraněné vynechá', () => {
    const few = packObstacles([tree(1, 10, 0), tree(2, 20, 0), tree(3, 30, 0)], 16, 15);
    const changes = { removed: [2], stumps: [3], saplings: [] };
    expect(nearestMatureTrees(few, changes, { x: 0, z: 0 }, 5).map((t) => t.id)).toEqual([1]);
    expect(nearestMatureTrees(few, NO_OBSTACLE_CHANGES, { x: 0, z: 0 }, 0)).toEqual([]);
  });
});

describe('plán dřeva obydlí', () => {
  it('nejdřív celé klády z hromady, zbytek nejbližší dospělé stromy ke staveništi', () => {
    const s = fullVillage();
    s.woodLogs = 3.4; // nahnilá hromada – kus se počítá, dokud zbývá aspoň polovina
    const plan = planDwellingWood(s, 'zemnice', SITE, DAY, { obstacles: forest });
    expect(plan.fromPile).toBe(3);
    expect(plan.missing).toBe(0);
    const nearest = matureTreesByDistance(forest, NO_OBSTACLE_CHANGES, SITE, { limit: 4 });
    expect(plan.fell.map((t) => t.id)).toEqual(nearest.map((t) => t.id));
    plan.fell.forEach((t, i) => {
      expect(t.distanceM).toBeCloseTo(nearest[i]!.distanceM, 9);
      expect(t.cost).toBeCloseTo(fellingCost(t.distanceM), 12);
    });
  });

  it('kácení: 2 čd za strom do 100 m, dál o 1 % za každých 10 m dráž', () => {
    expect(fellingCost(0)).toBe(FELLING_MAN_DAYS_PER_TREE);
    expect(fellingCost(100)).toBe(2);
    expect(fellingCost(150)).toBeCloseTo(2 * 1.05, 12);
    expect(fellingCost(300)).toBeCloseTo(2 * 1.2, 12);
  });

  it('dost klád: žádné kácení; stromy z vyklízené plochy jdou nejdřív na hromadu', () => {
    const s = fullVillage();
    s.woodLogs = 20;
    expect(planDwellingWood(s, 'polozemnice', SITE, DAY, { obstacles: forest })).toEqual({
      clearedTrees: 0,
      fromPile: 18,
      fell: [],
      missing: 0,
    });
    s.woodLogs = 2;
    const plan = planDwellingWood(s, 'zemnice', SITE, DAY, {
      obstacles: forest,
      clearedTrees: 3,
      clearedIds: [1, 2, 3],
    });
    expect(plan.fromPile).toBe(5);
    expect(plan.fell).toHaveLength(2);
    // stromy z vyklízené plochy se pro stavbu nekácí
    for (const t of plan.fell) expect([1, 2, 3]).not.toContain(t.id);
  });

  it('stromy vyhrazené jinou stavbou se nekácí podruhé', () => {
    const s = fullVillage();
    s.people.push(
      { id: 8, bornDay: DAY - 20 * 366, dwellingId: 1 },
      { id: 9, bornDay: DAY - 20 * 366, dwellingId: 1 },
    );
    s.dwellings.push({
      id: 60,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: -50, z: 0, rotation: 0 },
    });
    // domácnost 60: čtyři dospělí – druhý pár k osídlení
    for (let i = 0; i < 4; i++)
      s.people.push({ id: 70 + i, bornDay: DAY - 25 * 366, dwellingId: 60 });
    s.woodLogs = 0;
    const first = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
    const reserved = reservedTrees(first);
    expect(reserved.size).toBe(DWELLING_TREES.zemnice);
    const second = planDwellingWood(first, 'zemnice', { x: 40, z: 0 }, DAY, { obstacles: forest });
    for (const t of second.fell) expect(reserved.has(t.id!)).toBe(false);
    expect(availableTrees(forest, first, DAY)).toBe(forest.count - DWELLING_TREES.zemnice);
  });

  it('když klády ani stromy nestačí, chybí dřevo – stavba nejde (RangeError)', () => {
    const s = fullVillage();
    s.woodLogs = 1.4;
    const sparse = packObstacles([tree(1, 50, 0), tree(2, 60, 0)], 16, 15);
    const plan = planDwellingWood(s, 'zemnice', SITE, DAY, { obstacles: sparse });
    expect(plan).toMatchObject({ fromPile: 1, missing: 4 });
    expect(plan.fell.map((t) => t.id)).toEqual([1, 2]);
    expect(villageStock(s, sparse).wood).toBe(3);
    expect(() =>
      startNewDwelling(s, DAY, 'zemnice', { x: 0, z: 0, rotation: 0 }, 0, [], {
        obstacles: sparse,
      }),
    ).toThrow(RangeError);
  });

  it('bez vrstvy překážek se dřevo, které nestačí z hromady, kácí bez polohy za cenu blízkého lesa', () => {
    const s = fullVillage();
    s.woodLogs = 5;
    const plan = planDwellingWood(s, 'zemnice', SITE, DAY);
    expect(plan.fromPile).toBe(5);
    expect(plan.fell).toEqual([
      { id: null, distanceM: 0, cost: 2 },
      { id: null, distanceM: 0, cost: 2 },
    ]);
    const built = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0);
    const c = built.constructions.at(-1)!;
    expect(c.cost).toBe(dwellingBuildLabor('zemnice') + 4);
    expect(built.woodLogs).toBe(0);
  });

  it('plán z pohledu na ves (prohlížeč při umisťování) dá totéž co ze stavu vsi', () => {
    const s = fullVillage();
    s.woodLogs = 2.6;
    s.clearedObstacles = [{ id: 30, day: DAY }];
    const options = { obstacles: forest, clearedTrees: 1, clearedIds: [5] };
    const position = { x: 20, z: 10 };
    const fromState = planDwellingWood(s, 'polozemnice', position, DAY, options);
    const fromView = planDwellingWoodFrom(
      'polozemnice',
      position,
      {
        logs: wholeLogs(s.woodLogs), // VillageView.woodLogs – celé kusy
        changes: () => obstacleChangesAt(s, DAY),
        claimed: () => claimedObstacles(s),
      },
      options,
    );
    expect(fromView).toEqual(fromState);
    expect(fromView.fell.map((t) => t.id)).not.toContain(30);
  });

  it('práce na obydlí z plánu dřeva = cena zahájené stavby i první zemnice', () => {
    const s = fullVillage();
    s.woodLogs = 3;
    const position = { x: 40, z: 0, rotation: 0 };
    const plan = planDwellingWood(s, 'zemnice', position, DAY, { obstacles: forest });
    expect(plan.fell).toHaveLength(4);
    const labor = dwellingLaborManDays('zemnice', 6.5, plan);
    expect(labor).toBeCloseTo(
      dwellingBuildLabor('zemnice') +
        6.5 +
        woodFellingCost({
          trees: 4,
          fromPile: 3,
          fell: plan.fell,
          felled: 0,
        }),
      12,
    );
    const built = startNewDwelling(s, DAY, 'zemnice', position, 6.5, [], { obstacles: forest });
    expect(built.constructions.at(-1)!.cost).toBe(labor);
    // dost klád – kácení nic nestojí
    expect(dwellingLaborManDays('zemnice', 0, { fell: [] })).toBe(dwellingBuildLabor('zemnice'));

    const founded = foundVillage({
      seed: 5,
      day: DAY,
      dwellingPosition: position,
      dwellingObstacleCost: 4,
      obstacles: forest,
    });
    const foundingPlan = planDwellingWoodFrom(
      'zemnice',
      position,
      { logs: 0, changes: () => NO_OBSTACLE_CHANGES, claimed: () => new Set() },
      { obstacles: forest },
    );
    expect(founded.constructions[0]!.cost).toBe(dwellingLaborManDays('zemnice', 4, foundingPlan));
  });

  it('u blízkého lesa stojí obydlí práci jako dřív (cena obydlí obsahuje kácení)', () => {
    expect(dwellingBuildLabor('zemnice') + 7 * 2).toBe(60);
    expect(dwellingBuildLabor('polozemnice') + 18 * 2).toBe(220);
  });
});

describe('kácení prací stavby', () => {
  it('stromy padají postupně, jak stavba dostává práci – po nich pařezy', () => {
    const s = fullVillage();
    s.woodLogs = 0;
    const started = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
    const c = started.constructions.at(-1)!;
    const fell = c.wood!.fell;
    expect(fell).toHaveLength(7);
    expect(c.cost).toBeCloseTo(dwellingBuildLabor('zemnice') + woodFellingCost(c.wood), 12);
    // práce za první dva stromy a kousek třetího
    c.done = fell[0]!.cost + fell[1]!.cost + 0.5;
    fellAsWorked(started, c, DAY + 3);
    expect(c.wood!.felled).toBe(2);
    expect(treesToFell(c)).toBe(5);
    expect(started.felledTrees).toEqual([
      { id: fell[0]!.id, day: DAY + 3 },
      { id: fell[1]!.id, day: DAY + 3 },
    ]);
    c.done = c.cost;
    fellAsWorked(started, c, DAY + 9);
    expect(treesToFell(c)).toBe(0);
    expect(obstacleChangesAt(started, DAY + 9).stumps).toEqual(
      fell.map((t) => t.id).sort((a, b) => a! - b!),
    );
  });

  it('vyhrazený strom, který mezitím zmizel, se počítá jako pokácený – bez klády z hromady', () => {
    const s = fullVillage();
    s.woodLogs = 0;
    const started = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
    const c = started.constructions.at(-1)!;
    const gone = c.wood!.fell[0]!.id!;
    started.clearedObstacles!.push({ id: gone, day: DAY + 1 });
    started.woodLogs = 1; // jiná kláda na hromadě
    c.done = c.wood!.fell[0]!.cost;
    fellAsWorked(started, c, DAY + 2);
    expect(started.woodLogs).toBe(1);
    expect(started.felledTrees).toEqual([]);
    expect(c.wood!.felled).toBe(1);
  });

  it('ves dopočítaná s vrstvou překážek dostaví obydlí a pokácí jeho stromy', () => {
    const s = fullVillage();
    s.woodLogs = 2;
    const started = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
    const ids = started.constructions.at(-1)!.wood!.fell.map((t) => t.id);
    expect(ids).toHaveLength(5);
    const later = advanceVillage(started, DAY + 365, forest);
    expect(later.dwellings).toHaveLength(2);
    expect(obstacleChangesAt(later, later.lastDay).stumps).toEqual(
      [...ids].sort((a, b) => a! - b!),
    );
  });
});

describe('vyhrazený strom patří své stavbě', () => {
  // ruční krajina 64 × 64 políček po 15 m (jako vrstva `forest`), celá louka
  const land = makeLandscape({ size: 64 });
  /** Políčko světa (x, z) v krajině 64 × 15 m se středem v počátku. */
  const tileOf = (x: number, z: number): { x: number; y: number } => ({
    x: Math.floor((x + 480) / 15),
    y: Math.floor((z + 480) / 15),
  });
  const started = (): VillageState => {
    const s = fullVillage();
    s.woodLogs = 0;
    return startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
  };
  /** Pět čtverců pole přes sloupec stromů x = 60 m kolem z = 0 (tam jsou vyhrazené stromy). */
  const cells = (): { x: number; y: number }[] => {
    const t = tileOf(60, 0);
    return [-2, -1, 0, 1, 2].map((dy) => ({ x: t.x, y: t.y + dy }));
  };

  it('stavba napřed, pole potom: díly nepočítají vyhrazené stromy do klád', () => {
    const s = started();
    const reserved = reservedTrees(s);
    const village = placementVillageOf(s, DAY);
    const preview = fieldPartsFromCells(
      land,
      village,
      cells(),
      [{ x: 0, z: 0, rotation: 0 }],
      forest,
    );
    expect(preview.check.ok).toBe(true);
    const listed = preview.parts.flatMap((p) => p.obstacleIds ?? []);
    for (const id of reserved) expect(listed).toContain(id);
    const trees = preview.parts.reduce((sum, p) => sum + (p.trees ?? 0), 0);
    expect(trees).toBe((preview.obstacleCounts.tree ?? 0) - reserved.size);
    // pole a obydlí se postaví – klády jen za nevyhrazené stromy, nic se nebere z hromady
    const withField = foundField(s, DAY, { parts: preview.parts });
    const later = advanceVillage(withField, DAY + 365, forest);
    expect(later.constructions).toEqual([]);
    expect(later.woodLogs).toBeLessThanOrEqual(trees);
    expect(later.woodLogs).toBeGreaterThan(trees * (1 - LOG_ROT_PER_YEAR) - 1e-9);
  });

  it('pole napřed, stavba potom: stromy zakládaných dílů stavba nevyhradí', () => {
    const s = fullVillage();
    s.woodLogs = 0;
    const preview = fieldPartsFromCells(
      land,
      placementVillageOf(s, DAY),
      cells(),
      [{ x: 0, z: 0, rotation: 0 }],
      forest,
    );
    const withField = foundField(s, DAY, { parts: preview.parts });
    const onField = new Set(preview.parts.flatMap((p) => p.obstacleIds ?? []));
    const built = startNewDwelling(withField, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
    });
    const fell = built.constructions.at(-1)!.wood!.fell;
    expect(fell).toHaveLength(7);
    for (const t of fell) expect(onField.has(t.id!)).toBe(false);
    expect(availableTrees(forest, built, DAY)).toBe(forest.count - onField.size - fell.length);
  });

  it('první zemnice při založení vsi nevyhradí stromy prvního pole', () => {
    const preview = fieldPartsFromCells(
      land,
      null,
      cells(),
      [{ x: 40, z: 0, rotation: 0 }],
      forest,
    );
    const s = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 40, z: 0, rotation: 0 },
      firstField: { parts: preview.parts },
      obstacles: forest,
    });
    const onField = new Set(preview.parts.flatMap((p) => p.obstacleIds ?? []));
    const fell = s.constructions[0]!.wood!.fell;
    expect(fell).toHaveLength(7);
    for (const t of fell) expect(onField.has(t.id!)).toBe(false);
  });

  it('staveniště jiného obydlí přes vyhrazený strom: klády jen za nevyhrazené stromy', () => {
    const s = started();
    // druhá plná domácnost (6 dospělých) – další pár k osídlení
    s.dwellings.push({
      id: 60,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: -60, z: 0, rotation: 0 },
    });
    s.people.push(
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: 300 + i, bornDay: DAY - 25 * 366, dwellingId: 60 })),
    );
    const reserved = reservedTrees(s);
    const position = { x: 62, z: 0, rotation: 0 };
    const check = checkDwellingPlacement(
      land,
      placementVillageOf(s, DAY),
      'zemnice',
      position,
      forest,
    );
    expect(check.ok).toBe(true);
    const covered = check.obstacleIds.filter((id) => reserved.has(id));
    expect(covered.length).toBeGreaterThan(0);
    expect(check.clearedTrees).toBe((check.obstacleCounts.tree ?? 0) - covered.length);
    const second = startNewDwelling(
      s,
      DAY,
      'zemnice',
      position,
      check.obstacleCost,
      check.obstacleIds,
      {
        obstacles: forest,
        clearedTrees: check.clearedTrees,
      },
    );
    // první stavba svůj zmizelý strom „pokácí“ bez klády – hromada nejde do minusu ani nepřibude
    const first = second.constructions.find((c) => c.position?.x === 40)!;
    first.done = first.cost;
    const logs = second.woodLogs;
    fellAsWorked(second, first, DAY + 1);
    expect(second.woodLogs).toBe(logs);
    expect(first.wood!.felled).toBe(7);
  });
});

describe('hromada klád', () => {
  it('klády hnijí ≈ 4 % ročně, den po dni', () => {
    const s = fullVillage();
    s.woodLogs = 100;
    const after = advanceVillage(s, DAY + 365, null);
    expect(after.woodLogs).toBeCloseTo(100 * (1 - LOG_ROT_PER_YEAR), 9);
    expect(wholeLogs(after.woodLogs!)).toBe(96);
  });

  it('opuštěná přestavba vrátí klády z hromady', () => {
    const s = fullVillage();
    s.woodLogs = 2;
    s.dwellings.push({
      id: 60,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: -50, z: 0, rotation: 0 },
    });
    s.constructions.push({
      id: 61,
      kind: 'rebuild',
      startedDay: DAY,
      cost: 100,
      done: 0,
      dwellingType: 'zemnice',
      position: null,
      dwellingId: 60,
      fieldId: null,
      wood: {
        trees: 7,
        fromPile: 5,
        fell: [
          { id: 3, cost: 2 },
          { id: 4, cost: 2 },
        ],
        felled: 0,
      },
    });
    const after = advanceVillage(s, DAY + 1, forest);
    expect(after.constructions.some((c) => c.id === 61)).toBe(false);
    expect(after.woodLogs).toBeCloseTo(7, 2);
    expect(reservedTrees(after).size).toBe(0);
  });

  it('ves uložená před dřevem (bez klád) se dopočítá s nulou', () => {
    const s = fullVillage();
    delete s.woodLogs;
    const after = advanceVillage(s, DAY + 30, null);
    expect(after.woodLogs).toBeUndefined();
    expect(summarizeVillage(after, after.lastDay).woodLogs).toBe(0);
  });

  it('založené díly pole dají za každý dospělý strom jednu kládu', () => {
    const s = fullVillage();
    s.woodLogs = 0;
    const part = {
      areaM2: 225,
      distanceM: 60,
      naturalFertility: 60,
      surface: 'meadow' as const,
      obstacleCost: 9,
      obstacleIds: [11, 12, 13, 14],
      trees: 3,
    };
    const bare = { ...part, obstacleCost: 0, obstacleIds: [], trees: 0 };
    const founded = foundField(s, DAY, {
      parts: [part, { ...part, obstacleIds: [15], trees: 1 }, bare, bare, bare],
    });
    expect(founded.parts.map((p) => p.trees)).toEqual([3, 1, undefined, undefined, undefined]);
    const done = advanceVillage(founded, DAY + 200, null);
    expect(done.parts.every((p) => p.state !== 'founding')).toBe(true);
    // 4 klády, od založení dílů do dne 200 nahnilé nejvýš o roční 4 %
    expect(done.woodLogs).toBeGreaterThan(4 * (1 - LOG_ROT_PER_YEAR));
    expect(done.woodLogs).toBeLessThan(4);
    expect(done.parts.every((p) => p.trees === undefined)).toBe(true);
  });

  it('ohrazený čtverec hřbitova dá klády ze svých stromů', () => {
    const s = fullVillage();
    s.woodLogs = 0;
    const founded = foundCemetery(s, DAY, {
      squareSizeM: 15,
      squares: [
        {
          cell: { x: 20, y: 0 },
          x: 307.5,
          z: 7.5,
          waterDistanceM: 150,
          obstacleCost: 6,
          obstacleIds: [21, 22],
          trees: 2,
        },
      ],
    });
    const done = advanceVillage(founded, DAY + 60, null);
    expect(done.cemeteries![0]!.builtDay).not.toBeNull();
    expect(done.woodLogs).toBeGreaterThan(1.95);
    expect(done.woodLogs).toBeLessThan(2);
  });

  it('stromy ze staveniště obydlí jdou na hromadu a stavba je hned spotřebuje', () => {
    const s = fullVillage();
    s.woodLogs = 1;
    const built = startNewDwelling(s, DAY, 'zemnice', { x: 40, z: 0, rotation: 0 }, 4, [1, 2], {
      obstacles: forest,
      clearedTrees: 2,
    });
    const wood = built.constructions.at(-1)!.wood!;
    expect(wood.fromPile).toBe(3);
    expect(wood.fell).toHaveLength(4);
    expect(built.woodLogs).toBe(0);
  });
});

describe('palivo', () => {
  it('palivová třetina domácí výroby: +1 % za 10 m nad 100 m od obydlí k lesu', () => {
    const s = fullVillage();
    expect(fuelExtraPerDay(s)).toBe(0);
    s.dwellings[0]!.forestDistanceM = 300;
    const domestic = DOMESTIC.perHousehold + DOMESTIC.perPerson * s.people.length;
    expect(fuelExtraPerDay(s)).toBeCloseTo((domestic / 3) * 0.2, 12);
    s.dwellings[0]!.forestDistanceM = 80;
    expect(fuelExtraPerDay(s)).toBe(0);
  });

  it('zakladatelé na staveništi se počítají od staveniště první zemnice', () => {
    const s = foundVillage({ seed: 1, day: DAY, dwellingPosition: SITE, forestDistanceM: 200 });
    const domestic = DOMESTIC.perHousehold + DOMESTIC.perPerson * 4;
    expect(fuelExtraPerDay(s)).toBeCloseTo((domestic / 3) * 0.1, 12);
  });

  it('práce na palivu navíc ubere společnou práci', () => {
    const base = {
      capacity: 5,
      households: 1,
      people: 6,
      tasks: [],
      repairNeed: 0,
      domesticBacklog: 0,
    };
    const near = allocateDay(base);
    const far = allocateDay({ ...base, fuelExtra: 0.1 });
    expect(far.domestic).toBeCloseTo(near.domestic + 0.1, 12);
    expect(far.common).toBeCloseTo(near.common - 0.1, 12);
  });

  it('vzdálenost k okraji lesa – k nejbližšímu políčku lesa, v lese 0', () => {
    // ruční krajina 16 × 16 po 15 m, střed v počátku; les jen ve sloupci x = 12 (svět 60–75 m)
    const l = makeLandscape({ surface: (x) => (x === 12 ? 'forest' : 'meadow') });
    expect(forestEdgeDistanceM(l, 0, 0)).toBeCloseTo(60, 9);
    expect(forestEdgeDistanceM(l, 65, 10)).toBe(0);
    expect(forestEdgeDistanceM(l, 100, 0)).toBeCloseTo(25, 9);
    expect(forestEdgeDistanceM(makeLandscape(), 0, 0)).toBe(2 * 16 * 15);
  });

  it('obydlí z doby před palivem dostanou vzdálenost k lesu z krajiny', () => {
    const l = makeLandscape({ surface: (x) => (x === 12 ? 'forest' : 'meadow') });
    const s = fullVillage();
    delete s.dwellings[0]!.forestDistanceM;
    const filled = withForestDistances(s, l);
    expect(filled.dwellings[0]!.forestDistanceM).toBeCloseTo(60, 9);
    expect(withForestDistances(filled, l)).toBe(filled);
  });
});

describe('přestavba a determinismus', () => {
  it('přestavba vezme klády a zbytek vyhradí mezi nejbližšími stromy k obydlí', () => {
    const s = fullVillage();
    s.people = s.people.slice(0, 4);
    s.dwellings[0]!.builtDay = DAY - 16 * 365;
    s.woodLogs = 4;
    const decided = advanceVillage(s, DAY + 1, forest);
    const rebuild = decided.constructions.find((c) => c.kind === 'rebuild')!;
    const need = DWELLING_TREES[rebuild.dwellingType!];
    expect(rebuild.wood!.fromPile).toBe(4);
    const nearest = matureTreesByDistance(forest, NO_OBSTACLE_CHANGES, SITE, { limit: need - 4 });
    expect(rebuild.wood!.fell.map((t) => t.id)).toEqual(nearest.map((t) => t.id));
    expect(rebuild.cost).toBeCloseTo(
      dwellingBuildLabor(rebuild.dwellingType!) + woodFellingCost(rebuild.wood),
      12,
    );
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (klády, kácení, přestavby)', () => {
    const s = fullVillage();
    s.woodLogs = 9.3;
    s.dwellings[0]!.builtDay = DAY - 14 * 365;
    s.dwellings[0]!.forestDistanceM = 260;
    const start = startNewDwelling(s, DAY, 'polozemnice', { x: 40, z: 0, rotation: 0 }, 0, [], {
      obstacles: forest,
      forestDistanceM: 20,
    });
    const end = DAY + 6 * 365;
    const whole = advanceVillage(start, end, forest);
    const viaJson = (v: VillageState): VillageState =>
      JSON.parse(JSON.stringify(v)) as VillageState;
    const steps = [1, 3, 30, 7, 90, 365, 2];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + steps[i % steps.length]!), forest),
      );
    }
    expect(chunked).toEqual(viaJson(whole));
    expect(whole.felledTrees!.length).toBeGreaterThan(0);
    expect(whole.constructions.length + whole.dwellings.length).toBeGreaterThan(1);
  });
});
