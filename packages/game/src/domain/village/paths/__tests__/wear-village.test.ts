import { describe, expect, it } from 'vitest';
import { obstaclesOf } from '../../../landscape';
import { emptyRoads } from '../roads-form';
import { type GridWindow } from '../network-grid';
import { routePaths, wearStrengthAt } from '../route-paths';
import { encodeRoute, routeCells } from '../routes';
import {
  addWearLabor,
  decodeWear,
  encodeWear,
  flushWear,
  settleWear,
  trafficField,
  wearAt,
  wearCellAt,
  wearKey,
  wearMap,
  wearStrengths,
  withWearCells,
  withWearSeed,
} from '../wear';
import { WEAR } from '../../rules/rules-roads';
import { walkDistancesTo } from '../village';
import { advanceVillage } from '../../core/simulate';
import type {
  LegacyRoadFields,
  RoadWear,
  StoredRoute,
  VillageRoads,
  VillageState,
} from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { Y1, json, pen, village } from '../../__tests__/abandonment-fixtures';

const LAYER = obstaclesOf(LANDSCAPE);
const CELL = 3.75;
const WINDOW: GridWindow = { width: 200, height: 200, originX: -375, originZ: -375, cellM: CELL };

/** Trasa po buňkách světa z (x0, z) do (x1, z) – vodorovně. */
function route(x0: number, z: number, x1: number, trips: number, to = 'w'): StoredRoute {
  const at = (x: number): number => (z + 100) * WINDOW.width + (x + 100);
  const cells: number[] = [];
  for (let x = x0; x <= x1; x++) cells.push(at(x));
  return { from: 'd:1', to, purpose: 'water', trips, ...encodeRoute(cells, WINDOW) };
}

function withCandidates(roads: VillageRoads): VillageState {
  const s = village();
  s.roads = roads;
  return s;
}

describe('withWearCells – vyšlapanost 7,5 m do buněk 3,75 m (paths.md – Stálé trasy, pravidlo 4)', () => {
  const sorted = (cells: ReadonlyMap<number, number>): [number, number][] =>
    [...cells].sort((a, b) => a[0] - b[0]);

  function oldVillage(cells: Map<number, number>, day = 50): VillageState {
    const s = village();
    s.roads = emptyRoads(0);
    s.roads.wear = { day, cells: encodeWear(cells), labor: [] };
    return s;
  }

  it('každé staré políčko do 4 buněk s toutéž hodnotou, se značkou, jen jednou', () => {
    const s = oldVillage(
      new Map([
        [wearKey(0, 0), 90_000],
        [wearKey(-1, 2), 7_000],
      ]),
    );
    const converted = withWearCells(s);
    expect(converted).not.toBe(s);
    expect(s.roads!.wear!.cellM).toBeUndefined();
    const wear = converted.roads!.wear!;
    expect(wear.cellM).toBe(WEAR.cellM);
    expect(wear.day).toBe(50);
    const expected = new Map<number, number>();
    for (const [i, j, v] of [
      [0, 0, 90_000],
      [-2, 4, 7_000],
    ] as const) {
      for (const a of [0, 1]) for (const b of [0, 1]) expected.set(wearKey(i + a, j + b), v);
    }
    expect(sorted(decodeWear(wear.cells))).toEqual(sorted(expected));
    // druhé načtení nic nezmění; ves bez vyšlapanosti zůstane
    expect(withWearCells(converted)).toBe(converted);
    const bare = village();
    delete bare.roads?.wear;
    expect(withWearCells(bare)).toBe(bare);
  });

  it('cesta vznikne po převodu ve stejný den jako před ním – tatáž trasa, práh 1 000', () => {
    // stará vyšlapanost podél trasy (políčko 7,5 m = buňky 2i a 2i + 1) těsně pod prahem
    const r = route(0, 0, 20, 300);
    const old = new Map<number, number>();
    for (let x = 0; x <= 20; x++) old.set(wearKey(Math.floor(x / 2), 0), 90_000);
    const wear = withWearCells(oldVillage(old, 0)).roads!.wear!;
    const field = trafficField({ key: 'wear-cells', list: [r] }, CELL);
    // před převodem: 90 000 + (300 − 100) × dny – práh za 50 dní, po převodu na buňkách trasy totéž
    settleWear(wear, field, 0, 49);
    flushWear(wear);
    for (let x = 0; x <= 20; x++) expect(wearAt(decodeWear(wear.cells), x * CELL, 0)).toBe(99_800);
    settleWear(wear, field, 49, 50);
    flushWear(wear);
    for (let x = 0; x <= 20; x++) {
      expect(wearAt(decodeWear(wear.cells), x * CELL, 0)).toBe(WEAR.roadAt);
    }
  });
});

describe('withWearSeed – vyšlapanost staré vsi', () => {
  it('podél loňských kandidátů založí polovinu prahu (i sousední políčka), jednou', () => {
    const roads = emptyRoads(100);
    (roads as VillageRoads & LegacyRoadFields).candidates = [
      [
        { x: 0, z: 0 },
        { x: 40, z: 0 },
      ],
    ];
    const s = withCandidates(roads);
    const seeded = withWearSeed(s);
    expect(seeded).not.toBe(s);
    expect(s.roads!.wear).toBeUndefined();
    const wear = seeded.roads!.wear!;
    expect(wear.day).toBe(s.lastDay + 1);
    expect(wear.labor).toEqual([]);
    const cells = decodeWear(wear.cells);
    expect(WEAR.seed).toBe(WEAR.roadAt / 2);
    for (const x of [0, 10, 20, 30, 40]) expect(wearAt(cells, x, 0)).toBe(WEAR.seed);
    // osa staré cesty je přibližná – založí se i sousední buňky (± 1), dál ne
    expect(wear.cellM).toBe(WEAR.cellM);
    expect(wearAt(cells, 20, CELL)).toBe(WEAR.seed);
    expect(wearAt(cells, 20, 2 * CELL)).toBe(0);
    expect(wearAt(cells, 80, 0)).toBe(0);
    // druhé načtení nic nezmění
    expect(withWearSeed(seeded)).toBe(seeded);
  });

  it('ves bez kandidátů má prázdnou vyšlapanost, ves bez cest žádnou', () => {
    const seeded = withWearSeed(withCandidates(emptyRoads(100)));
    expect(seeded.roads!.wear!.cells).toBe('');
    const bare = village();
    delete bare.roads;
    expect(withWearSeed(bare)).toBe(bare);
  });
});

describe('vyšlapanost v paměti dopočtu', () => {
  it('sčítání nekóduje – do stavu zapíše až flushWear', () => {
    const wear: RoadWear = { day: 0, cells: '', labor: [] };
    const field = trafficField({ key: 'k-flush', list: [route(0, 0, 20, 300)] }, CELL);
    settleWear(wear, field, 0, 10);
    expect(wear.cells).toBe('');
    expect(wear.day).toBe(10);
    const live = wearMap(wear);
    expect(wearAt(live, 0, 0)).toBe(2_000);
    settleWear(wear, field, 10, 20);
    expect(wearAt(wearMap(wear), 0, 0)).toBe(4_000);
    flushWear(wear);
    expect(wear.cells).toBe(encodeWear(wearMap(wear)));
    expect(wearAt(decodeWear(wear.cells), 0, 0)).toBe(4_000);
    // klon stavu (JSON) začne z kódu
    const clone = json(wear);
    expect(wearAt(wearMap(clone), 0, 0)).toBe(4_000);
  });

  it('práce dne jde do wear.labor po cílech, bez celé vsi a vozu pro vodu', () => {
    const wear: RoadWear = { day: 0, cells: '', labor: [] };
    const day = 5;
    addWearLabor(
      wear,
      {
        day,
        shares: [
          { activity: 'pen', target: { kind: 'pen', id: 1 }, manDays: 2 },
          { activity: 'build', target: { kind: 'village' }, manDays: 3 },
          { activity: 'carry', target: { kind: 'water', x: 0, z: 0 }, manDays: 1 },
          { activity: 'sow', target: { kind: 'field', id: 4, parts: [1, 2] }, manDays: 1.5 },
        ],
      },
      day,
    );
    addWearLabor(
      wear,
      { day: day + 1, shares: [{ activity: 'pen', target: { kind: 'pen', id: 1 }, manDays: 1 }] },
      day + 1,
    );
    // rozdělení jiného dne se nepočítá
    addWearLabor(
      wear,
      { day: 1, shares: [{ activity: 'pen', target: { kind: 'pen', id: 1 }, manDays: 9 }] },
      day + 2,
    );
    expect(wear.labor).toEqual([
      { target: { kind: 'pen', id: 1 }, manDays: 3 },
      { target: { kind: 'field', id: 4 }, manDays: 1.5 },
    ]);
  });

  it('stálá část trasy za prací a odvedená práce se nesčítají dvakrát', () => {
    const work: StoredRoute = { ...route(0, 0, 20, 500, 'pen:1'), purpose: 'work', base: 200 };
    const field = trafficField({ key: 'k-base', list: [work] }, CELL);
    const wear: RoadWear = { day: 0, cells: '', labor: [] };
    // bez práce: jen stálá část (2 cesty) – 1 cesta za den nad dorůstání
    settleWear(wear, field, 0, 10);
    expect(wearAt(wearMap(wear), 0, 0)).toBe(1_000);
    // práce 4 člověkodny = 4 cesty navíc (jediná trasa k cíli nese všechno)
    addWearLabor(
      wear,
      { day: 10, shares: [{ activity: 'pen', target: { kind: 'pen', id: 1 }, manDays: 4 }] },
      10,
    );
    settleWear(wear, field, 10, 20);
    expect(wearAt(wearMap(wear), 0, 0)).toBe(1_000 + 1_000 + 400);
  });
});

describe('wearStrengths – jen nenulová políčka', () => {
  it('dá totéž co průchod celým oknem', () => {
    const wear = new Map<number, number>();
    for (let k = 0; k < 400; k++) {
      const i = ((k * 37) % 61) - 30;
      const j = ((k * 53) % 47) - 23;
      wear.set(wearKey(i, j), (k * 7919) % WEAR.max);
    }
    const grid: GridWindow = { width: 97, height: 83, originX: -101.3, originZ: -77.9, cellM: 1.9 };
    const brute = new Float32Array(grid.width * grid.height);
    for (let z = 0; z < grid.height; z++) {
      for (let x = 0; x < grid.width; x++) {
        const w = wear.get(
          wearCellAt(grid.originX + x * grid.cellM, grid.originZ + z * grid.cellM),
        );
        if (w !== undefined && w >= WEAR.visibleFrom) {
          brute[z * grid.width + x] = Math.min(1, w / WEAR.roadAt);
        }
      }
    }
    expect(wearStrengths(grid, wear)).toEqual(brute);
  });
});

describe('routePaths – pěšiny z tras', () => {
  it('čáry vedou po trasách, síla je vyšlapanost / práh', () => {
    const routes = [route(0, 0, 40, 300), route(20, 0, 40, 300, 'v')];
    const none = routePaths(routes, new Map(), CELL);
    expect(none.length).toBeGreaterThan(0);
    for (const line of none) expect(line.strength.every((s) => s === 0)).toBe(true);
    const wear = new Map<number, number>();
    for (const [x, z] of routeCells(routes[0]!)) wear.set(wearCellAt(x * CELL, z * CELL), 50_000);
    const half = routePaths(routes, wear, CELL);
    const xs = half.flatMap((l) => l.points.map((p) => p.x));
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(40 * CELL, 5);
    for (const line of half) {
      line.points.forEach((p, k) => {
        expect(p.z).toBeCloseTo(0, 5);
        expect(line.strength[k]).toBe(wearStrengthAt(wear, p.x, p.z));
        expect(line.strength[k]).toBe(0.5);
      });
    }
    // pod 0,6 cesty za den čára není (jako u sítě)
    expect(routePaths([route(0, 0, 40, 40)], wear, CELL)).toEqual([]);
  });
});

describe('vyšlapanost v simulaci (s krajinou)', () => {
  /** Ves se staveništi – práce u nich jde přes `wear.labor` po trasách k cíli. */
  function start(): VillageState {
    const s = village(Y1 - 200);
    s.pens = [pen(1, { builtDay: null })];
    return s;
  }

  it('dopočet roku po kouscích dá totéž co najednou (s prací ve vyšlapanosti)', () => {
    const s = start();
    const end = s.lastDay + 380;
    const whole = advanceVillage(s, end, LAYER, LANDSCAPE);
    const wear = whole.roads!.wear!;
    expect(decodeWear(wear.cells).size).toBeGreaterThan(0);
    const steps = [1, 30, 7, 61, 3, 45];
    let chunked = json(s);
    let worked = false;
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = json(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          LAYER,
          LANDSCAPE,
        ),
      );
      worked ||= (chunked.roads?.wear?.labor.length ?? 0) > 0;
    }
    expect(worked).toBe(true);
    expect(chunked).toEqual(json(whole));
  }, 120_000);

  it('vzdálenost chůze bere sílu pěšin z vyšlapanosti tras', () => {
    const base = advanceVillage(start(), Y1 - 140, LAYER, LANDSCAPE);
    // trasy s provozem nad prahem čáry (ves z fixtur chodí málo)
    base.routes = { ...base.routes!, list: base.routes!.list.map((r) => ({ ...r, trips: 500 })) };
    const targets = base.routes.list.map((r) => {
      const [x, z] = routeCells(r).at(-1)!;
      return { x: x * CELL, z: z * CELL };
    });
    const walks = (cells: Map<number, number>): number[] => {
      const s = json(base);
      s.roads!.wear = { day: s.lastDay, cells: encodeWear(cells), labor: [] };
      return walkDistancesTo(s, s.lastDay, LANDSCAPE, LAYER, targets)!;
    };
    const bare = walks(new Map());
    const cells = new Map<number, number>();
    for (const r of base.routes.list) {
      for (const [x, z] of routeCells(r)) cells.set(wearCellAt(x * CELL, z * CELL), WEAR.max);
    }
    const trodden = walks(cells);
    trodden.forEach((w, k) => expect(w).toBeLessThanOrEqual(bare[k]!));
    expect(trodden.some((w, k) => w < bare[k]!)).toBe(true);
  }, 60_000);
});

describe('vyšlapanost – cesta vznikne jen tam, kde se chodí aspoň 2× denně (Martin 17. 11. 2026)', () => {
  const settle = (trips: number, days: number): number => {
    const wear: RoadWear = { day: 0, cells: '', labor: [] };
    const field = trafficField({ key: `k-form-${trips}`, list: [route(0, 0, 20, trips)] }, CELL);
    settleWear(wear, field, 0, days);
    return wearAt(wearMap(wear), 0, 0);
  };

  it('provoz 1,5 cesty denně: vyšlapanost nedosáhne meze vzniku nikdy (ani za 100 000 dní)', () => {
    expect(settle(150, 100_000)).toBe(WEAR.roadAt - 1);
    expect(settle(199, 100_000)).toBeLessThan(WEAR.roadAt);
  });

  it('provoz 2 cesty denně: mez vzniku za 1 000 dní', () => {
    expect(settle(200, 999)).toBeLessThan(WEAR.roadAt);
    expect(settle(200, 1_000)).toBe(WEAR.roadAt);
  });

  it('už vyšlapané políčko si vyšlapanost drží podle dosavadních pravidel', () => {
    const wear: RoadWear = { day: 0, cells: '', labor: [] };
    const field = trafficField({ key: 'k-form-kept', list: [route(0, 0, 20, 150)] }, CELL);
    settleWear(wear, field, 0, 10);
    const cells = new Map(wearMap(wear));
    cells.set(wearCellAt(0, 0), WEAR.roadAt + 5_000);
    const kept: RoadWear = { day: 10, cells: encodeWear(cells), labor: [] };
    settleWear(kept, field, 10, 20);
    expect(wearAt(wearMap(kept), 0, 0)).toBe(WEAR.roadAt + 5_000 + 50 * 10);
  });
});
