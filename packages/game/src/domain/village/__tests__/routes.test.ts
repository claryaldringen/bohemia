import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  INITIAL_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { foundField, foundVillage } from '../actions';
import { NO_OBSTACLE_CHANGES } from '../obstacles';
import { type GridWindow } from '../paths/network-grid';
import {
  computePathNetwork,
  pathBounds,
  type PathNetwork,
  type PathVillage,
} from '../paths/network';
import { encodeRoute, routeCells, routeLine, routePoints, storedRoutes } from '../paths/routes';
import { obstaclePosition, pathTerrainOf, pathWindowFor, withObstacles } from '../paths/terrain';
import {
  refreshWalkDistances,
  routeMapKey,
  routeTreesDay,
  withoutWalkStages,
  withRoutes,
} from '../paths/village';
import { advanceVillage } from '../simulate';
import type { LaborShare, Person, StoredRoute, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const YEAR = 365.25;

/** Okno 10 × 8 buněk po 2,5 m s počátkem ve světě (−20, 7,5) – buňka světa (−8, 3). */
const WINDOW: GridWindow = { width: 10, height: 8, originX: -20, originZ: 7.5, cellM: 2.5 };

/** Buňky okna z kroků po 8 směrech (dx, dz) od buňky (x, z). */
function walk(grid: GridWindow, x: number, z: number, steps: [number, number][]): number[] {
  const cells = [z * grid.width + x];
  for (const [dx, dz] of steps) {
    x += dx;
    z += dz;
    cells.push(z * grid.width + x);
  }
  return cells;
}

describe('kódování trasy (routes.ts)', () => {
  const all: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  it('tam a zpět – sudý i lichý počet kroků, všech 8 směrů, jediná buňka', () => {
    for (const steps of [[], all.slice(0, 1), all.slice(0, 2), all, all.slice(0, 7)]) {
      const cells = walk(WINDOW, 3, 3, steps);
      const route = { ...encodeRoute(cells, WINDOW), from: 'd:1', to: 'water' };
      expect(route.start).toEqual([3 - 8, 3 + 3]);
      expect(route.steps.length).toBe(Math.ceil(steps.length / 2) + (steps.length % 2));
      expect(routeCells(route)).toEqual(
        cells.map((c) => [(c % WINDOW.width) - 8, Math.floor(c / WINDOW.width) + 3]),
      );
      // středy buněk ve světě – stejně jako mřížka okna
      expect(routePoints(route, WINDOW.cellM)).toEqual(
        cells.map((c) => ({
          x: WINDOW.originX + (c % WINDOW.width) * WINDOW.cellM,
          z: WINDOW.originZ + Math.floor(c / WINDOW.width) * WINDOW.cellM,
        })),
      );
    }
  });

  it('dlouhá trasa – 3 bity na krok, znaky base64', () => {
    const steps = Array.from({ length: 101 }, (_, i) => all[(i * 5) % 8]!);
    const big: GridWindow = { ...WINDOW, width: 400, height: 400 };
    const cells = walk(big, 200, 200, steps);
    const route = encodeRoute(cells, big);
    expect(route.steps).toMatch(/^[A-Za-z0-9+/]+=$/);
    expect(route.steps.length).toBe(52);
    expect(routeCells(route)).toHaveLength(102);
  });

  it('nesousední buňky trasa být nemůžou', () => {
    expect(() => encodeRoute([0, 2], WINDOW)).toThrow();
  });

  it('okna různých rozložení dají stejné buňky světa (mřížka je vůči krajině pevná)', () => {
    const landscape = generateLandscape(42, INITIAL_LAYER_VERSIONS);
    const small = pathTerrainOf(
      landscape,
      pathWindowFor(landscape, { minX: -40, minZ: -30, maxX: 40, maxZ: 30 }),
    );
    const large = pathTerrainOf(
      landscape,
      pathWindowFor(landscape, { minX: -97, minZ: -61, maxX: 113, maxZ: 88 }),
    );
    const cellOf = (t: GridWindow, x: number, z: number): number =>
      Math.round((z - t.originZ) / t.cellM) * t.width + Math.round((x - t.originX) / t.cellM);
    for (const [x, z] of [
      [0, 0],
      [-31.2, 17.4],
      [25, -25],
    ] as const) {
      const a = encodeRoute([cellOf(small, x, z)], small);
      const b = encodeRoute([cellOf(large, x, z)], large);
      expect(a.start).toEqual(b.start);
      expect(routePoints({ ...a }, small.cellM)[0]!.x).toBeCloseTo(
        small.originX + (cellOf(small, x, z) % small.width) * small.cellM,
        9,
      );
    }
  });
});

/** Ves golden testu sítě (paths-nearest) – tři obydlí a pole 12 × 9 dílů s prací. */
function goldenNetwork(keepRoutes: boolean): {
  network: PathNetwork;
  village: PathVillage;
} {
  const landscape = generateLandscape(42, INITIAL_LAYER_VERSIONS);
  const layer = obstaclesOf(landscape);
  const site = landscape.villageSite;
  const home = tileCenterWorld(landscape, site.x, site.y);
  const stages = ['sown', 'young-fallow', 'ready', 'meadow', 'founding'] as const;
  const parts = [];
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 12; i++) {
      const cell = { x: site.x + 2 + i, y: site.y - 4 + j };
      const c = tileCenterWorld(landscape, cell.x, cell.y);
      const stage = stages[(i * 3 + j * 2 + Math.floor(i / 4)) % stages.length]!;
      parts.push({ cell, x: c.x, z: c.z, size: landscape.cellSizeM, stage });
    }
  }
  const village: PathVillage = {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: home.x, z: home.z, rotation: 0 }, built: true },
      {
        id: 2,
        type: 'polozemnice',
        position: { x: home.x - 14, z: home.z + 6, rotation: 1.2 },
        built: true,
      },
      {
        id: 3,
        type: 'zemnice',
        position: { x: home.x + 4, z: home.z - 16, rotation: 3 },
        built: true,
      },
    ],
    fields: [{ id: 7, parts }],
    labor: {
      day: 40000,
      month: 4,
      people: { children: 5, adults: 9, elders: 2 },
      shares: [{ target: { kind: 'field', id: 7 }, manDays: 7.5 }],
    },
  };
  const terrain = withObstacles(
    pathTerrainOf(landscape, pathWindowFor(landscape, pathBounds(village)!)),
    layer,
    NO_OBSTACLE_CHANGES,
  );
  const network = computePathNetwork({
    village,
    terrain,
    tree: (id) => obstaclePosition(layer, id),
    ...(keepRoutes ? { keepRoutes } : {}),
  });
  return { network, village };
}

describe('trasy sítě pěšin (keepRoutes)', () => {
  const { network, village } = goldenNetwork(true);
  const routes = network.routes ?? [];
  const grid = network.traffic;

  it('nemění čáry, provoz ani pochůzky', () => {
    const plain = goldenNetwork(false).network;
    expect(plain.routes).toBeUndefined();
    expect(network.lines).toEqual(plain.lines);
    expect(network.traffic).toEqual(plain.traffic);
    expect(network.trips).toBe(plain.trips);
    expect([...network.errands]).toEqual([...plain.errands]);
  }, 30_000);

  it('každá trasa posledního kola – provoz po buňkách z tras je týž (bit po bitu)', () => {
    expect(routes.length).toBe(network.trips);
    const cells = new Float32Array(grid.width * grid.height);
    for (const route of routes) {
      for (const c of route.cells) cells[c] = cells[c]! + route.trips;
    }
    expect(cells).toEqual(network.traffic.raw);
  });

  it('trasa začíná v bráně domácnosti a končí v cíli', () => {
    const starts = new Map<string, number>();
    for (const route of routes) {
      const first = route.cells[0]!;
      expect(starts.get(route.from) ?? first).toBe(first);
      starts.set(route.from, first);
      const d = village.dwellings.find((w) => `d:${w.id}` === route.from)!;
      const x = grid.originX + (first % grid.width) * grid.cellM;
      const z = grid.originZ + Math.floor(first / grid.width) * grid.cellM;
      // brána je kus před vchodem domu (polozemnice je největší)
      expect(Math.abs(x - d.position.x) + Math.abs(z - d.position.z)).toBeLessThan(12);
      const last = route.cells[route.cells.length - 1]!;
      const end = {
        x: grid.originX + (last % grid.width) * grid.cellM,
        z: grid.originZ + Math.floor(last / grid.width) * grid.cellM,
      };
      if (route.purpose === 'water' || route.purpose === 'wood') {
        expect(network.errands.get(d.id)?.[route.purpose]).toEqual(end);
      }
      if (route.to === 'field:7') {
        const parts = village.fields[0]!.parts;
        const near = parts.some(
          (p) => Math.abs(p.x - end.x) <= p.size / 2 + 3 && Math.abs(p.z - end.z) <= p.size / 2 + 3,
        );
        expect(near).toBe(true);
      }
    }
    expect(new Set(routes.map((r) => r.purpose))).toEqual(
      new Set(['water', 'wood', 'work', 'neighbour']),
    );
  });

  it('stálé cesty k poli nesou base (stálá část), nikdy víc než trips', () => {
    const stored = storedRoutes(network);
    const field = stored.filter((s) => s.to === 'field:7');
    expect(field.length).toBeGreaterThan(0);
    for (const s of field) {
      expect(s.base).toBeGreaterThan(0);
      expect(s.base).toBeLessThanOrEqual(s.trips);
      expect(Number.isInteger(s.base)).toBe(true);
    }
    expect(stored.filter((s) => s.purpose !== 'work').every((s) => s.base === undefined)).toBe(
      true,
    );
  });

  it('uložené trasy – setiny, bez tras pod MIN_TRIP, buňky tam a zpět', () => {
    const stored = storedRoutes(network);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.length).toBeLessThanOrEqual(routes.length);
    const kept = routes.filter((r) => r.trips >= 0.02);
    expect(stored.length).toBe(kept.length);
    stored.forEach((s, k) => {
      const r = kept[k]!;
      expect(s.trips).toBe(Math.round(r.trips * 100));
      expect(Number.isInteger(s.trips)).toBe(true);
      expect(routePoints(s, grid.cellM)).toEqual(
        r.cells.map((c) => ({
          x: grid.originX + (c % grid.width) * grid.cellM,
          z: grid.originZ + Math.floor(c / grid.width) * grid.cellM,
        })),
      );
      const line = routeLine(s, grid.cellM);
      expect(line[0]).toEqual(routePoints(s, grid.cellM)[0]);
      expect(line.length).toBeGreaterThanOrEqual(Math.min(2, r.cells.length));
    });
  });
});

/** Ves s hotovou zemnicí v (−60, −40), dvěma páry dospělých a polem na východě. */
function withField(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: -60, z: -40, rotation: 0 } }),
  );
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: DAY - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 22), adult(5, 21)];
  s.constructions = [];
  s.storesKg = 4000;
  s.dwellings[0]!.builtDay = DAY - 20 * 365;
  const cells = [12, 13, 14, 15, 16].map((x) => ({ x, y: 7 }));
  return foundField(s, DAY, {
    parts: cells.map((cell) => {
      const cx = -142.5 + cell.x * 15;
      const cz = -142.5 + cell.y * 15;
      return {
        cell,
        areaM2: 225,
        distanceM: Math.hypot(cx + 60, cz + 40),
        naturalFertility: 60,
        surface: 'meadow' as const,
        obstacleCost: 0,
      };
    }),
  });
}

describe('trasy ve stavu vsi (refreshWalkDistances, withRoutes)', () => {
  it('přepočet chůze uloží trasy pro otisk rozložení; dopočet po kouscích dá stejné trasy', () => {
    const start = withField();
    const whole = advanceVillage(start, DAY + 60, null, LANDSCAPE);
    expect(whole.routes).toBeDefined();
    expect(whole.routes!.key).toBe(whole.walkLayoutKey);
    expect(whole.routes!.list.length).toBeGreaterThan(0);
    expect(whole.routes!.list.some((r) => r.to.startsWith('field:'))).toBe(true);
    for (const chunk of [1, 7, 30]) {
      let s = start;
      for (let day = DAY + chunk; ; day = Math.min(DAY + 60, day + chunk)) {
        s = advanceVillage(s, day, null, LANDSCAPE);
        if (day === DAY + 60) break;
      }
      expect(s.routes).toEqual(whole.routes);
    }
  }, 60_000);

  it('withRoutes doplní trasy staré vsi jednou a idempotentně, bez posunu dne', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const routes = s.routes!;
    const old: VillageState = { ...s };
    delete old.routes;
    const done = withRoutes(old, LANDSCAPE, null);
    expect(done).not.toBe(old);
    expect(done.lastDay).toBe(old.lastDay);
    expect(done.routes!.key).toBe(s.walkLayoutKey);
    expect(done.routes!.day).toBe(s.lastDay);
    // síť dne `lastDay` (práce toho dne) – cíle jako při přepočtu chůze, práce dne může přibýt
    const targets = new Set(done.routes!.list.map((r) => r.to));
    for (const r of routes.list) expect(targets.has(r.to)).toBe(true);
    expect(withRoutes(done, LANDSCAPE, null)).toBe(done);
    // jiný otisk – přepočítá je
    const stale = withRoutes({ ...s, routes: { ...routes, key: 'jiny' } }, LANDSCAPE, null);
    expect(stale.routes!.key).toBe(s.walkLayoutKey);
    // ves bez přepočtu chůze (simulace bez krajiny) se nemění
    const bare: VillageState = { ...old };
    delete bare.walkLayoutKey;
    expect(withRoutes(bare, LANDSCAPE, null)).toBe(bare);
  }, 30_000);
});

/** Buňky tras (bez cest za den) – podle nich se pozná, jestli se trasy hledaly znovu. */
const cellsOf = (list: readonly StoredRoute[]): string[] =>
  list.map((r) => `${r.from}>${r.to}:${r.start.join(',')}:${r.steps}`);

const JULY = dayIndexOf({ year: 600, month: 7, day: 1 });

describe('trasy jen při změně mapy (paths.md – Stálé trasy, pravidlo 5)', () => {
  it('zasetí, sklizeň a zakládání dílu klíč ani trasy nemění; 1. den v měsíci bez změny mapy také', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const routes = s.routes!;
    const key = routeMapKey(s, DAY + 3);
    const [a, b, c] = s.parts.filter((p) => p.cell);
    a!.state = 'sown';
    b!.state = 'ready';
    c!.state = 'founding';
    expect(routeMapKey(s, DAY + 4)).toBe(key);
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    expect(s.routes).toBe(routes);
    a!.state = 'fallow';
    refreshWalkDistances(s, JULY, LANDSCAPE, null);
    // měsíční kontrola: trasy se nehledaly (den výpočtu i buňky stejné), nanejvýš se převážily
    expect(s.routes!.day).toBe(routes.day);
    expect(s.routes!.key).toBe(routes.key);
    expect(cellsOf(s.routes!.list)).toEqual(cellsOf(routes.list));
  }, 30_000);

  it('umístění pole a obydlí mění klíč hned (i v půli měsíce) a trasy se hledají znovu', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const part = s.parts.find((p) => p.cell)!;
    s.parts.push({ ...part, id: 999, cell: { x: 12, y: 8 } });
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    expect(s.routes!.day).toBe(DAY + 4);
    const house = s.dwellings[0]!;
    s.dwellings.push({ ...house, id: 998, position: { x: -30, z: -55, rotation: 0 } });
    refreshWalkDistances(s, DAY + 5, LANDSCAPE, null);
    expect(s.routes!.day).toBe(DAY + 5);
  }, 30_000);

  it('pokácený strom se do mapy tras promítne až 1. 11.', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const august = dayIndexOf({ year: 600, month: 8, day: 10 });
    const november = dayIndexOf({ year: 600, month: 11, day: 1 });
    expect(routeTreesDay(august)).toBe(dayIndexOf({ year: 599, month: 11, day: 1 }));
    expect(routeTreesDay(november)).toBe(november);
    const key = routeMapKey(s, august);
    s.felledTrees = [...(s.felledTrees ?? []), { id: 4242, day: august }];
    expect(routeMapKey(s, august + 1)).toBe(key);
    expect(routeMapKey(s, november - 1)).toBe(key);
    expect(routeMapKey(s, november)).not.toBe(key);
  }, 30_000);

  it('narození a stáří spojení změní jen cesty za den (1. dne v měsíci), buňky tras ne', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const routes = s.routes!;
    s.people.push({ id: 77, bornDay: DAY + 3, dwellingId: 1 });
    // mladé spojení (váhy podle stáří obydlí) – mapa tras ani místa se nemění
    s.dwellings[0]!.builtDay = DAY;
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    expect(s.routes).toBe(routes);
    refreshWalkDistances(s, JULY, LANDSCAPE, null);
    expect(s.routes!.day).toBe(routes.day);
    const stable = s.routes!.list;
    expect(cellsOf(stable)).toEqual(cellsOf(routes.list));
    expect(stable.map((r) => r.trips)).not.toEqual(routes.list.map((r) => r.trips));
  }, 30_000);

  // Martin 31. 10. 2026 (trasy ke kácení, na paseku a na louku jen ze stálé sítě pěšin): „ano“
  it('práce dne trasy nehledá ani 1. dne v měsíci – stálé trasy bit po bitu, nic k práci dne', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const routes = s.routes!;
    const repair = {
      activity: 'build',
      target: { kind: 'dwelling', id: 1 },
      manDays: 2,
    } as unknown as LaborShare;
    const mow = {
      activity: 'mow',
      target: { kind: 'meadow', cells: [{ x: 1, y: 3 }] },
      manDays: 2,
    } as unknown as LaborShare;
    s.labor = { ...s.labor!, shares: [...s.labor!.shares, repair, mow] };
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    expect(s.routes).toBe(routes);
    refreshWalkDistances(s, JULY, LANDSCAPE, null);
    expect(s.routes!.day).toBe(routes.day);
    expect(s.routes!.list.some((r) => r.to === 'dwelling:1' || r.to === 'meadow')).toBe(false);
    expect(cellsOf(s.routes!.list)).toEqual(cellsOf(routes.list));
  }, 30_000);

  it('otevřená obilná jáma po začátku dopočtu dostane stálou trasu (klíč mapy)', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const key = routeMapKey(s, DAY + 3);
    s.storesKg = 4000;
    s.grainPits = [
      {
        id: 7,
        x: -50,
        z: -30,
        capacityKg: 1500,
        grainKg: 1500,
        state: 'open',
        dugDay: DAY,
        filledDay: DAY + 1,
      },
    ];
    expect(routeMapKey(s, DAY + 3)).not.toBe(key);
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    expect(s.routes!.list.some((r) => r.to === 'grain-pit:7')).toBe(true);
  }, 30_000);

  // Martin 31. 10. 2026: „Ta věc (dům, ohrada, hřbitov) se prostě postaví a dál se s ní nic
  // neděje, pokud nespadne“ – obsazenost trasy nehledá, jen převáží
  it('nastěhování a vystěhování trasy nehledá – trasy z prázdného obydlí čekají s 0 cestami', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const first = s.dwellings[0]!;
    s.dwellings.push({
      ...first,
      id: 99,
      position: { ...first.position, x: first.position.x + 14 },
    });
    delete s.dwellings[1]!.plot;
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    const routes = s.routes!;
    const from99 = (list: readonly StoredRoute[]): StoredRoute[] =>
      list.filter((r) => r.from === 'd:99');
    // stálé trasy vedou i z prázdného obydlí, ale bez cest
    expect(from99(routes.list).length).toBeGreaterThan(0);
    expect(from99(routes.list).every((r) => r.trips === 0)).toBe(true);
    const walks = s.parts.map((p) => p.walkDistanceM);
    // nastěhování v půli měsíce: stejný otisk, stejné buňky, jen cesty za den
    s.people[0]!.dwellingId = 99;
    s.people[1]!.dwellingId = 99;
    refreshWalkDistances(s, DAY + 5, LANDSCAPE, null);
    expect(s.walkLayoutKey).toBe(routes.key);
    expect(s.routes!.day).toBe(routes.day);
    expect(cellsOf(s.routes!.list)).toEqual(cellsOf(routes.list));
    expect(from99(s.routes!.list).some((r) => r.trips > 0)).toBe(true);
    expect(s.routes!.placesKey).not.toBe(routes.placesKey);
    // vzdálenosti chůze se měří z nejbližšího obydlí (i prázdného) – nemění se
    expect(s.parts.map((p) => p.walkDistanceM)).toEqual(walks);
    // vystěhování – zase 0 cest, buňky tytéž
    s.people[0]!.dwellingId = 1;
    s.people[1]!.dwellingId = 1;
    refreshWalkDistances(s, DAY + 6, LANDSCAPE, null);
    expect(s.routes!.day).toBe(routes.day);
    expect(from99(s.routes!.list).every((r) => r.trips === 0)).toBe(true);
    expect(cellsOf(s.routes!.list)).toEqual(cellsOf(routes.list));
  }, 30_000);

  it('zapečetěná a otevřená jáma (jako ohrada bez zvířat a se zvířaty) trasy jen převáží', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    s.grainPits = [
      {
        id: 7,
        x: -50,
        z: -30,
        capacityKg: 1500,
        grainKg: 1500,
        state: 'sealed',
        dugDay: DAY,
        filledDay: DAY + 1,
      },
    ];
    refreshWalkDistances(s, DAY + 4, LANDSCAPE, null);
    const routes = s.routes!;
    const toPit = (list: readonly StoredRoute[]): StoredRoute[] =>
      list.filter((r) => r.to === 'grain-pit:7');
    // k zapečetěné jámě vede stálá trasa bez cest
    expect(toPit(routes.list).length).toBeGreaterThan(0);
    expect(toPit(routes.list).every((r) => r.trips === 0)).toBe(true);
    const key = routeMapKey(s, DAY + 4);
    s.grainPits[0]!.state = 'open';
    expect(routeMapKey(s, DAY + 5)).toBe(key);
    refreshWalkDistances(s, DAY + 5, LANDSCAPE, null);
    expect(s.routes!.day).toBe(routes.day);
    expect(cellsOf(s.routes!.list)).toEqual(cellsOf(routes.list));
    expect(toPit(s.routes!.list).some((r) => r.trips > 0)).toBe(true);
  }, 30_000);

  it('průběh zemních prací klíč mapy nemění, hotový úsek ano', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    s.roads = {
      nextId: 2,
      roads: [],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
      earthworks: [
        {
          id: 1,
          profile: [
            { x: 100, z: 300, y: 0 },
            { x: 100, z: 0, y: 0 },
          ],
          pieces: [{ toM: 300, manDays: 10, builtDay: null }],
          startedDay: DAY,
          constructionId: 7,
        },
      ],
    };
    const key = routeMapKey(s, DAY + 3);
    s.roads.earthworks![0]!.pieces[0]!.manDays = 80;
    expect(routeMapKey(s, DAY + 3)).toBe(key);
    s.roads.earthworks![0]!.pieces[0]!.builtDay = DAY + 3;
    expect(routeMapKey(s, DAY + 3)).not.toBe(key);
  }, 30_000);

  it('ves uložená před stálými trasami: otisk stadií zmizí, trasy se přepočítají jednou', () => {
    const s = advanceVillage(withField(), DAY + 3, null, LANDSCAPE);
    const old = { ...s, walkStages: '0123456789abcdef', walkLayoutKey: 'stary' } as VillageState;
    const loaded = withoutWalkStages(old);
    expect('walkStages' in loaded).toBe(false);
    expect(withoutWalkStages(loaded)).toBe(loaded);
    refreshWalkDistances(loaded, DAY + 4, LANDSCAPE, null);
    expect(loaded.routes!.day).toBe(DAY + 4);
    const again = loaded.routes;
    refreshWalkDistances(loaded, DAY + 5, LANDSCAPE, null);
    expect(loaded.routes).toBe(again);
  }, 30_000);
});
