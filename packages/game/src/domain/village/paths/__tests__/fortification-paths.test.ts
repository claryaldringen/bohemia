import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../actions';
import {
  addGate,
  fortificationArea,
  fortificationOutline,
  fortSegments,
  fortWalls,
  type FortGate,
  type FortOutline,
} from '../../fortification';
import type { FortBuildWork, Fortification } from '../../fortification/types';
import { gateRoadCrossings } from '../../fortifications';
import { NO_OBSTACLE_CHANGES } from '../../obstacles';
import type { Road, VillageState } from '../../types';
import { house, LANDSCAPE, part, pathTestTerrain } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { cartGrid, cartRoutes } from '../cart';
import { cartWorldOf } from '../cart-world';
import { computePathNetwork } from '../network';
import type { NetworkRoute, PathVillage } from '../network-types';
import { fortWallCells, villageGrid } from '../network-grid';
import { villageBuildings } from '../network-search';
import { emptyRoads } from '../roads-form';
import { fortLayoutKey, pathFortificationsOf, pathVillageOf, routeMapKey } from '../village';
import { wagonRoadGrid } from '../wagon-route';

// Brány opevnění v síti cest (fortifications.md – Obvod, Brány, Pro implementaci): hotové úseky
// i celý obvod rozestavěného opevnění (Martin 6. 11. 2026) jsou pro chodce, vůz i stádo
// neprůchodné, projde se jen branou; mezera po zrušené stavbě, mezera po chátrání a průlom jsou
// průchozí. Ves bez opevnění má mřížky sítě pěšin i vozů bit po bitu stejné jako před branami.

/** FNV-1a nad bajty pole – otisk mřížky (bit po bitu). */
function digest(a: Float32Array | Uint8Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Testovací ves bez opevnění – obydlí, pole, hřbitov, ohrada a pevná cesta (ploty i branky). */
const PLAIN: PathVillage = {
  dwellings: [house(1, 0, 0), house(2, 20, -10, 1)],
  fields: [{ id: 7, parts: [part(52.5, 7.5), part(52.5, 22.5), part(67.5, 7.5, 'young-fallow')] }],
  cemeteries: [{ id: 3, squares: [{ cell: { x: 7, y: 12 }, x: -37.5, z: 37.5, size: 15 }] }],
  pens: [{ id: 4, cell: { x: 11, y: 8 }, x: 22.5, z: -22.5, size: 15, built: true }],
  roads: [
    {
      id: 1,
      points: [
        { x: -60, z: -60 },
        { x: 60, z: -60 },
      ],
      grade: 'trodden',
    },
  ],
};

/** Otisky mřížek ves `v`: chodci, vozová cesta (neprůchodné a u plotu), vůz. */
function gridDigests(v: PathVillage): Record<string, string> {
  const terrain = pathTestTerrain();
  const walk = villageGrid({ village: v, terrain }, villageBuildings(v).all);
  const wagon = wagonRoadGrid({ village: v, terrain, layer: null, changes: NO_OBSTACLE_CHANGES });
  const cart = cartGrid({ village: v, terrain });
  return {
    walk: digest(walk.base),
    wagonBlocked: digest(wagon.blocked),
    wagonNear: digest(wagon.nearFence),
    cart: digest(cart.cost),
  };
}

const DAY = 40000;

function plainState(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 7, day: DAY - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
}

describe('ves bez opevnění – zlatý otisk sítě beze změny', () => {
  it('mřížky chodců, vozové cesty a vozu testovací vsi', () => {
    expect(gridDigests(PLAIN)).toEqual({
      walk: '395a8d57',
      wagonBlocked: '5903de3d',
      wagonNear: '8ca6b1b4',
      cart: 'a7975dae',
    });
  });

  it('ves ze stavu: ves pro pěšiny bez opevnění a klíč mapy tras', () => {
    const state = plainState();
    const village = pathVillageOf(state, DAY, LANDSCAPE);
    expect('fortifications' in village).toBe(false);
    expect(digest(new TextEncoder().encode(JSON.stringify(village)))).toBe('f22456db');
    expect(routeMapKey(state, DAY)).toBe('a2ab2147a191f420');
  });
});

// Opevnění testu: palisáda kolem 4 × 4 čtverců (políčka 8–11 – plocha x, z ∈ [−30, 30]), brána
// na severní straně (z = −30) a podle testu i na východní (x = 30); pole a pastva vně na východě.
const CELLS = Array.from({ length: 16 }, (_, k) => ({ x: 8 + (k % 4), y: 8 + Math.floor(k / 4) }));
const AREA = fortificationArea(CELLS, null, LANDSCAPE);
if ('error' in AREA) throw new Error('plocha opevnění testu');
const OUTLINE: FortOutline = fortificationOutline(AREA, 'palisade');
const NORTH = { x: -7.5, z: -30 };
const EAST = { x: 30, z: 7.5 };
const EAST_SIDE = OUTLINE.sides.flatMap((s, i) => (s.x === 30 && s.dx === 0 ? [i] : []));
/** Úsek východní strany přes z. */
const eastAt = (z: number): number =>
  EAST_SIDE.find((i) => {
    const s = OUTLINE.sides[i]!;
    return Math.min(s.z, s.z + s.dz * 15) <= z && z <= Math.max(s.z, s.z + s.dz * 15);
  })!;

function gatesAt(points: readonly { x: number; z: number }[]): FortGate[] {
  let gates: FortGate[] = [];
  for (const p of points) {
    const next = addGate(OUTLINE, gates, p);
    if ('error' in next) throw new Error(next.error);
    gates = next;
  }
  return gates;
}

function fort(
  gates: readonly { x: number; z: number }[],
  segment: (index: number) => Partial<Fortification['segments'][number]> = () => ({}),
): Fortification {
  return {
    id: 900,
    grid: null,
    cells: CELLS,
    kind: 'palisade',
    segments: fortSegments(OUTLINE).map((s) => ({
      index: s.index,
      builtDay: 1,
      state: 1,
      ...segment(s.index),
    })),
    gates: gatesAt(gates),
  };
}

const TERRAIN = pathTestTerrain();

/** Stavby vsi testu – na opevnění `f` běží práce `work` (bez ní žádná stavba). */
function works(
  f: Fortification,
  work: FortBuildWork | null,
): { kind: string; fortificationId: number; fortWork: FortBuildWork }[] {
  return work ? [{ kind: 'fortification', fortificationId: f.id, fortWork: work }] : [];
}

/** Ves uvnitř opevnění, pole a úhor vně na východě, práce na poli a stádo krav. */
function fortVillage(f: Fortification | null, work: FortBuildWork | null = null): PathVillage {
  return {
    dwellings: [house(1, -15, -15)],
    fields: [
      {
        id: 7,
        parts: [part(52.5, 7.5), part(67.5, 7.5), part(52.5, 22.5, 'young-fallow')],
      },
    ],
    labor: {
      day: DAY,
      month: 4,
      people: { children: 0, adults: 4, elders: 0 },
      shares: [{ target: { kind: 'field', id: 7 }, manDays: 3 }],
    },
    livestock: { cow: 6 },
    ...(f
      ? {
          fortifications: pathFortificationsOf(
            { fortifications: [f], constructions: works(f, work) },
            LANDSCAPE,
          ),
        }
      : {}),
  };
}

function cellsOf(f: Fortification): { wall: Set<number>; gate: Set<number> } {
  const { wall, gate } = fortWallCells(TERRAIN, fortWalls(LANDSCAPE, f));
  return { wall: new Set(wall), gate };
}

/** Leží buňka mimo plochu opevnění (s rezervou pásu)? */
function outside(c: number): boolean {
  const x = TERRAIN.originX + (c % TERRAIN.width) * TERRAIN.cellM;
  const z = TERRAIN.originZ + Math.floor(c / TERRAIN.width) * TERRAIN.cellM;
  return Math.max(Math.abs(x), Math.abs(z)) > 32;
}

function routes(v: PathVillage): NetworkRoute[] {
  return computePathNetwork({ village: v, terrain: TERRAIN, keepRoutes: true }).routes ?? [];
}

const hits = (cells: readonly number[], set: ReadonlySet<number>): boolean =>
  cells.some((c) => set.has(c));

describe('brány opevnění v síti pěšin (fortifications.md – Brány)', () => {
  it('stěny: pás stojících úseků bez otvorů bran, brána přes celý pás', () => {
    const f = fort([NORTH, EAST]);
    const walls = fortWalls(LANDSCAPE, f);
    expect(walls.gates).toHaveLength(2);
    const { wall, gate } = cellsOf(f);
    expect(wall.size).toBeGreaterThan(0);
    expect(gate.size).toBeGreaterThan(0);
    expect([...gate].some((c) => wall.has(c))).toBe(false);
    // staveniště na 0 % blokuje celým obvodem kromě bran jako hotové opevnění (Martin 6. 11. 2026)
    const site = fort([NORTH, EAST], () => ({ builtDay: null }));
    expect(fortWalls(LANDSCAPE, site, 'build')).toEqual(walls);
    // nehotové úseky zrušené stavby (bez běžící stavby) stěny nemají – síť jako bez opevnění
    expect(
      pathFortificationsOf({ fortifications: [site], constructions: works(site, null) }, LANDSCAPE),
    ).toEqual([]);
  });

  it('domácnost uvnitř chodí na pole vně nejbližší branou, stěnou nikdy', () => {
    const f = fort([NORTH, EAST]);
    const { wall } = cellsOf(f);
    const north = cellsOf(fort([NORTH])).gate;
    const east = cellsOf(fort([EAST])).gate;
    const out = routes(fortVillage(f)).filter((r) => r.cells.some(outside));
    expect(out.map((r) => r.to).sort()).toEqual(['field:7', 'pasture', 'water', 'wood']);
    for (const r of out) {
      expect(hits(r.cells, wall)).toBe(false);
      // pole, pastva a voda na východě a jihu – východní branou; les na západě – severní
      const west = r.to === 'wood';
      expect(hits(r.cells, east)).toBe(!west);
      expect(hits(r.cells, north)).toBe(west);
    }
    // jen se severní branou jde oklikou přes ni
    const viaNorth = routes(fortVillage(fort([NORTH]))).filter((r) => r.cells.some(outside));
    expect(viaNorth.length).toBeGreaterThan(0);
    for (const r of viaNorth) expect(hits(r.cells, north)).toBe(true);
  });

  it('stádo na pastvu jde branou', () => {
    const f = fort([NORTH, EAST]);
    const { wall, gate } = cellsOf(f);
    const herd = routes(fortVillage(f)).filter((r) => r.purpose === 'herd');
    expect(herd.length).toBeGreaterThan(0);
    for (const r of herd) {
      expect(hits(r.cells, wall)).toBe(false);
      expect(hits(r.cells, gate)).toBe(true);
    }
  });

  it('rozestavěný obvod blokuje celý kromě bran (0 % i rozpracovaný)', () => {
    const builtWall = cellsOf(fort([NORTH])).wall;
    const north = cellsOf(fort([NORTH])).gate;
    const sites = [
      fort([NORTH], () => ({ builtDay: null })),
      fort([NORTH], (i) => (EAST_SIDE.includes(i) ? { builtDay: null } : {})),
    ];
    for (const f of sites) {
      const out = routes(fortVillage(f, 'build')).filter((r) => r.to === 'field:7');
      expect(out.length).toBeGreaterThan(0);
      // staveniště na východě neprojde – oklikou severní branou, stěnou nikdy
      for (const r of out) {
        expect(hits(r.cells, north)).toBe(true);
        expect(hits(r.cells, builtWall)).toBe(false);
      }
    }
  });

  it('mezera po zrušené stavbě, po chátrání a průlom jsou průchozí', () => {
    const builtWall = cellsOf(fort([NORTH])).wall;
    const north = cellsOf(fort([NORTH])).gate;
    for (const open of [{ builtDay: null }, { state: 0 }, { breachedDay: 5 }] as const) {
      const f = fort([NORTH], (i) => (EAST_SIDE.includes(i) ? open : {}));
      const out = routes(fortVillage(f)).filter((r) => r.to === 'field:7');
      expect(out.length).toBeGreaterThan(0);
      // jde rovnou přes mezeru na východě (buňky, kde by stála stěna), ne oklikou severní branou
      for (const r of out) {
        expect(hits(r.cells, north)).toBe(false);
        expect(hits(r.cells, builtWall)).toBe(true);
      }
    }
    // mezera po chátrání a průlom zůstanou průchozí i při přestavbě
    const gap = fort([NORTH], (i) => (EAST_SIDE.includes(i) ? { state: 0 } : {}));
    expect(fortWalls(LANDSCAPE, gap, 'rebuild')).toEqual(fortWalls(LANDSCAPE, gap));
  });
});

describe('brány opevnění pro vozy', () => {
  /** Vozová cesta z vnitřku přes východní stranu k louce vně. */
  const WAGON: NonNullable<PathVillage['roads']>[number] = {
    id: 5,
    points: [
      { x: 0, z: 7.5 },
      { x: 90, z: 7.5 },
    ],
    grade: 'wagon',
    cart: true,
  };

  function hayCart(f: Fortification): ReturnType<typeof cartRoutes>['routes'][number] {
    const v = { ...fortVillage(f), roads: [WAGON] };
    return cartRoutes({
      village: v,
      terrain: TERRAIN,
      kind: 'two-wheel',
      depots: [{ x: 0, z: 7.5 }],
      targets: [{ x: 85, z: 7.5, reachM: 5 }],
    }).routes[0]!;
  }

  it('vůz pro seno jede po vozové cestě branou, stěnou ne', () => {
    const f = fort([EAST]);
    const { wall, gate } = cellsOf(f);
    const route = hayCart(f);
    expect(route.reached).toBe(true);
    expect(hits(route.cells, gate)).toBe(true);
    expect(hits(route.cells, wall)).toBe(false);
    // brána jen na severu: vůz cestu přes stěnu nepojede, objede severní branou
    const north = fort([NORTH]);
    const detour = hayCart(north);
    expect(detour.reached).toBe(true);
    expect(hits(detour.cells, cellsOf(north).wall)).toBe(false);
    expect(hits(detour.cells, cellsOf(north).gate)).toBe(true);
    expect(detour.lengthM).toBeGreaterThan(route.lengthM);
  });

  it('mřížka vozové cesty: stěna neprůchodná, brána průchozí', () => {
    const f = fort([EAST]);
    const { wall, gate } = cellsOf(f);
    const grid = wagonRoadGrid({
      village: fortVillage(f),
      terrain: TERRAIN,
      layer: null,
      changes: NO_OBSTACLE_CHANGES,
    });
    for (const c of wall) expect(grid.blocked[c]).toBe(1);
    expect([...gate].some((c) => grid.blocked[c] === 0)).toBe(true);
  });
});

describe('cesta přes hotové opevnění dostane bránu', () => {
  function road(id: number, points: { x: number; z: number }[]): Road {
    return { id, points, bornDay: DAY, grade: 'trodden', traffic: [], spots: [] };
  }

  /** Cesty z vnitřku na východ přes z = 7,5 a z = −22,5. */
  function roadsAcross(): NonNullable<VillageState['roads']> {
    const roads = emptyRoads(DAY);
    roads.roads.push(
      road(1, [
        { x: 0, z: 7.5 },
        { x: 60, z: 7.5 },
      ]),
      road(2, [
        { x: 0, z: -22.5 },
        { x: 60, z: -22.5 },
      ]),
    );
    return roads;
  }

  it('pevná cesta přes stojící úsek bez brány – brána u průsečíku; přes mezeru ne', () => {
    const state = plainState();
    const f = fort([NORTH], (i) => (i === eastAt(-22.5) ? { builtDay: null } : {}));
    state.fortifications = [f];
    state.roads = roadsAcross();
    const before = routeMapKey(state, DAY);
    gateRoadCrossings(state, LANDSCAPE);
    const gates = state.fortifications[0]!.gates;
    // severní brána zůstala, východní stojící úsek přes cestu 1 bránu dostal na z = 7,5
    expect(gates).toHaveLength(2);
    const added = gates.find((g) => g.segment === eastAt(7.5))!;
    expect(added.x).toBeCloseTo(30, 6);
    expect(added.z).toBeCloseTo(7.5, 6);
    // cesta 2 vede přes mezeru po zrušené stavbě (bez běžící stavby) – je průchozí, bránu nedostane
    expect(gates.some((g) => g.segment === eastAt(-22.5))).toBe(false);
    // brána mění mapu tras (klíč) – ves s opevněním se přepočítá
    expect(routeMapKey(state, DAY)).not.toBe(before);
    // podruhé nic (jednou a idempotentně)
    gateRoadCrossings(state, LANDSCAPE);
    expect(state.fortifications[0]!.gates).toBe(gates);
  });

  it('cesta přes staveniště běžící stavby dostane bránu hned (obvod blokuje od zahájení)', () => {
    const state = plainState();
    const f = fort([NORTH], () => ({ builtDay: null }));
    state.fortifications = [f];
    state.roads = roadsAcross();
    state.constructions.push({
      id: 77,
      kind: 'fortification',
      startedDay: DAY,
      cost: 100,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      fortificationId: f.id,
      fortWork: 'build',
    });
    gateRoadCrossings(state, LANDSCAPE);
    const gates = state.fortifications[0]!.gates;
    expect(gates.some((g) => g.segment === eastAt(7.5))).toBe(true);
    expect(gates.some((g) => g.segment === eastAt(-22.5))).toBe(true);
  });
});

describe('dokončení úseku nemění klíč mapy tras (Martin 6. 11. 2026)', () => {
  it('0 %, rozpracované a hotové opevnění – tytéž stěny, klíč opevnění i mapy tras', () => {
    const state = plainState();
    const f = fort([NORTH, EAST], () => ({ builtDay: null }));
    state.fortifications = [f];
    state.constructions.push({
      id: 77,
      kind: 'fortification',
      startedDay: DAY,
      cost: 100,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      fortificationId: f.id,
      fortWork: 'build',
    });
    const key = fortLayoutKey(state);
    const route = routeMapKey(state, DAY);
    const walls = pathFortificationsOf(state, LANDSCAPE);
    expect(walls).toHaveLength(1);
    // úsek po úseku – stav, stáří ani průběh blokování nemění
    for (const s of f.segments) {
      s.builtDay = DAY + s.index;
      state.constructions[0]!.done += 5;
      expect(fortLayoutKey(state)).toBe(key);
      expect(routeMapKey(state, DAY)).toBe(route);
    }
    // stavba skončila – hotové opevnění blokuje stejně; chátrání nad nulou taky
    state.constructions = [];
    f.segments[0]!.state = 0.4;
    expect(fortLayoutKey(state)).toBe(key);
    expect(routeMapKey(state, DAY)).toBe(route);
    expect(pathFortificationsOf(state, LANDSCAPE)).toEqual(walls);
    // mezera po chátrání blokování mění
    f.segments[0]!.state = 0;
    expect(fortLayoutKey(state)).not.toBe(key);
  });
});

describe('stejné opevnění na serveru i v prohlížeči', () => {
  it('vstup vozových tras prohlížeče nese tytéž stěny jako ves pro pěšiny serveru', () => {
    const state = plainState();
    state.fortifications = [fort([EAST])];
    const village = pathVillageOf(state, DAY, LANDSCAPE);
    expect(village.fortifications).toEqual(pathFortificationsOf(state, LANDSCAPE));
    expect(village.fortifications).toHaveLength(1);
    // prohlížeč počítá trasy vozů z `CartWorld` (cart-routes.worker.ts) – týž údaj
    expect(cartWorldOf(state, DAY, LANDSCAPE, null).village.fortifications).toEqual(
      village.fortifications,
    );
    expect(fortLayoutKey(state)).not.toBeNull();
    expect(fortLayoutKey(plainState())).toBeNull();
  });
});
