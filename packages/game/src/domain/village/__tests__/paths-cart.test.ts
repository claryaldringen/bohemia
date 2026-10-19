import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { axisCartCheck, cartRoutes, cartTraffic, type CartRoute } from '../paths/cart';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { addRoadCartTrips, roadLengthM, updateRoads, villageCartRoutes } from '../paths/roads';
import { CART_ROUTES } from '../rules';
import { advanceVillage } from '../simulate';
import type { CartKind, Dwelling, Person, Road, VillageState } from '../types';
import { house, part, pathLandscape, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vozová síť (wagons.md – Vozová síť a vyjeté cesty; Martin, 19. 10. 2026: „ve svahu, kde lidé
// zvládnou chodit rovně, vůz bude muset vyjezdit serpentiny“). Krajina testů: louka 300 × 300 m,
// potok (vodní políčka bez osy – bez brodů) z ∈ (75, 90), les x < −90.

/** Svah 20 % mezi políčky y = 3 a 7 (z ≈ −97,5 … −37,5), jinak rovina. */
const SLOPE = pathLandscape((_x, y) => Math.min(7, Math.max(3, y)) * 15 * 0.2);
const slopeTerrain = pathTestTerrain(SLOPE);
const flatTerrain = pathTestTerrain();

const village = (extra: Partial<PathVillage> = {}): PathVillage => ({
  dwellings: [],
  fields: [],
  ...extra,
});

/** Úhel kroku trasy po buňkách (rad, přesně – jen pro test). */
function headings(route: CartRoute, width: number): number[] {
  const out: number[] = [];
  for (let k = 1; k < route.cells.length; k++) {
    const a = route.cells[k - 1]!;
    const b = route.cells[k]!;
    const di = (b % width) - (a % width);
    const dj = Math.floor(b / width) - Math.floor(a / width);
    out.push(Math.atan2(dj, di));
  }
  return out;
}

const turnOf = (a: number, b: number): number => {
  let d = Math.abs(b - a) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
};

/** Trasa vozu z dola (z = −130) nahoru (z = −20) přes svah. */
function upTheSlope(kind: CartKind): { route: CartRoute; width: number } {
  const { grid, routes } = cartRoutes({
    village: village(),
    terrain: slopeTerrain,
    kind,
    depots: [{ x: 20, z: -130 }],
    targets: [{ x: 20, z: -20, reachM: 5 }],
  });
  return { route: routes[0]!, width: grid.width };
}

describe('vůz ve svahu (wagons.md – Vozová síť)', () => {
  it('serpentiny: vůz jede šikmo, sklon ve směru jízdy nejvýš mez; pěšák jde rovně', () => {
    const { route, width } = upTheSlope('two-wheel');
    expect(route.reached).toBe(true);
    // přímo 110 m – vůz jede šikmo (20 % svah, mez 12 %) a otáčí se
    expect(route.lengthM).toBeGreaterThan(110 * 1.8);
    const xs = route.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    // stoupání každého kroku nejvýš mez
    const h = slopeTerrain.heights!;
    for (let k = 1; k < route.cells.length; k++) {
      const a = route.cells[k - 1]!;
      const b = route.cells[k]!;
      const run = Math.hypot(
        (b % width) - (a % width),
        Math.floor(b / width) - Math.floor(a / width),
      );
      expect(Math.abs(h[b]! - h[a]!) / (run * slopeTerrain.cellM)).toBeLessThanOrEqual(
        CART_ROUTES.maxGrade + 1e-9,
      );
    }
    // pěšák jde z domu dole na pole nahoře rovně (svah 20 % pěšina zvládne)
    const network = computePathNetwork({
      village: {
        dwellings: [house(1, 20, -135)],
        fields: [{ id: 5, parts: [part(22.5, -22.5, 'young-fallow')] }],
        labor: {
          day: 4000,
          month: 7,
          people: { children: 0, adults: 6, elders: 0 },
          shares: [{ target: { kind: 'field', id: 5 }, manDays: 6 }],
        },
      },
      terrain: slopeTerrain,
    });
    const onSlope = network.lines.flatMap((l) =>
      l.points.filter((p) => p.z > -90 && p.z < -45 && Math.abs(p.x - 20) < 60),
    );
    expect(onSlope.length).toBeGreaterThan(0);
    expect(Math.max(...onSlope.map((p) => Math.abs(p.x - 21)))).toBeLessThan(12);
  });

  it('čtyřkolák má širší oblouk – zatočí na krok nejvýš o 27°, dvoukolák o 53°', () => {
    const two = upTheSlope('two-wheel');
    const four = upTheSlope('four-wheel');
    expect(four.route.reached).toBe(true);
    const maxTurn = (r: { route: CartRoute; width: number }): number => {
      const hs = headings(r.route, r.width);
      return Math.max(...hs.slice(1).map((h, k) => turnOf(hs[k]!, h)));
    };
    expect(maxTurn(two)).toBeLessThanOrEqual(0.9273 + 1e-3);
    expect(maxTurn(four)).toBeLessThanOrEqual(0.4637 + 1e-3);
    expect(maxTurn(two)).toBeGreaterThan(0.47);
    // obrat čtyřkoláku zabere víc místa – trasa je delší
    expect(four.route.lengthM).toBeGreaterThan(two.route.lengthM);
  });

  it('do svahu nad mez bez šikmé cesty vůz nevyjede vůbec', () => {
    // svah 40 % – ani šikmo (skok 2:1) nevyjde pod 12 %
    const steep = pathTestTerrain(pathLandscape((_x, y) => Math.min(7, Math.max(3, y)) * 15 * 0.4));
    const { routes } = cartRoutes({
      village: village(),
      terrain: steep,
      kind: 'two-wheel',
      depots: [{ x: 20, z: -130 }],
      targets: [{ x: 20, z: -20, reachM: 5 }],
    });
    expect(routes[0]!.reached).toBe(false);
  });
});

describe('kudy vůz projede', () => {
  const route = (extra: Partial<PathVillage>, target: { x: number; z: number }): CartRoute =>
    cartRoutes({
      village: village(extra),
      terrain: flatTerrain,
      kind: 'two-wheel',
      depots: [{ x: 0, z: 0 }],
      targets: [{ ...target, reachM: 4 }],
    }).routes[0]!;

  it('lesem jen po pevné (vykácené) cestě', () => {
    const into = { x: -130, z: 0 };
    expect(route({}, into).reached).toBe(false);
    const axis = [
      { x: 0, z: 0 },
      { x: -135, z: 0 },
    ];
    expect(route({ roads: [{ id: 1, points: axis, grade: 'trodden' }] }, into).reached).toBe(true);
    // cesta končí na kraji lesu – dál ne
    const edge = [
      { x: 0, z: 0 },
      { x: -95, z: 0 },
    ];
    expect(route({ roads: [{ id: 1, points: edge, grade: 'trodden' }] }, into).reached).toBe(false);
  });

  it('přes vodu bez brodu ani po cestě s lávkou (lávka je jen pro pěší)', () => {
    const across = { x: 0, z: 110 };
    expect(route({}, across).reached).toBe(false);
    const bridge = [
      { x: 0, z: 0 },
      { x: 0, z: 115 },
    ];
    expect(route({ roads: [{ id: 1, points: bridge, grade: 'causeway' }] }, across).reached).toBe(
      false,
    );
  });

  it('přes osetý díl ne – objede ho; přes úhor rovně', () => {
    const fields = (stage: 'sown' | 'young-fallow'): PathVillage['fields'] => [
      { id: 2, parts: [-15, 0, 15].map((x) => part(x - 7.5 + 7.5, 52.5, stage)) },
    ];
    const target = { x: 0, z: 70 };
    const sown = route({ fields: fields('sown') }, target);
    const fallow = route({ fields: fields('young-fallow') }, target);
    expect(sown.reached && fallow.reached).toBe(true);
    expect(sown.lengthM).toBeGreaterThan(fallow.lengthM + 10);
  });

  it('mezi domy jen kudy se vůz vejde (≈ 2,5 m)', () => {
    // dva domy 7 m od sebe (mezera mezi střechami ≈ 1,2 m) – vůz kolem, pěšák mezi
    const tight = [house(1, -3.5, 30, Math.PI / 2), house(2, 3.5, 30, Math.PI / 2)];
    const wide = [house(1, -12, 30, Math.PI / 2), house(2, 12, 30, Math.PI / 2)];
    const target = { x: 0, z: 60 };
    const between = (r: CartRoute): boolean =>
      r.points.some((p, k) => k > 0 && Math.abs(p.x) < 2 && Math.abs(p.z - 30) < 4);
    expect(between(route({ dwellings: tight }, target))).toBe(false);
    expect(route({ dwellings: wide }, target).lengthM).toBeLessThan(65);
  });
});

describe('axisCartCheck – stezka pro vozy', () => {
  it('po rovině projede, přímo do svahu 20 % ne, šikmo pod mezí ano', () => {
    expect(
      axisCartCheck(
        [
          { x: 0, z: 0 },
          { x: 100, z: 0 },
        ],
        flatTerrain,
      ).passable,
    ).toBe(true);
    const straight = axisCartCheck(
      [
        { x: 20, z: -130 },
        { x: 20, z: -20 },
      ],
      slopeTerrain,
    );
    expect(straight.passable).toBe(false);
    expect(straight.steepM).toBeGreaterThan(40);
    expect(straight.maxGrade).toBeGreaterThan(0.19);
  });
});

const YEAR = 365.25;
const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });

/** Ves s ohradou se spřežením stranou a jízdami vozů k cíli na louce. */
function withCarts(day = NOV1(600) - 30): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const at = (id: number, x: number, z: number): Dwelling => ({
    id,
    type: 'zemnice',
    builtDay: day - 30 * 365,
    condition: 1,
    position: { x, z, rotation: 0 },
  });
  s.dwellings = [at(1, 0, 0), at(2, 18, -4)];
  s.people = [1, 2].flatMap((d) =>
    [30, 28, 22].map((years, k): Person => ({
      id: d * 10 + k,
      bornDay: day - Math.ceil(years * YEAR),
      dwellingId: d,
    })),
  );
  s.nextId = 100;
  s.constructions = [];
  s.storesKg = 20_000;
  s.lastDay = day;
  s.pens = [
    {
      id: 60,
      cell: { x: 8, y: 9 },
      x: -142.5 + 8 * 15,
      z: -142.5 + 9 * 15,
      builtDay: day - 3000,
      team: { readyDay: day - 1000 },
      training: null,
    },
  ];
  return s;
}

describe('vyjeté vozové cesty (roční kontrola)', () => {
  it('kudy vozy dva roky jezdí, vznikne vozová cesta; bez vozů nic', () => {
    const s = withCarts();
    updateRoads(s, NOV1(600), pathLandscape(), null);
    const run = (year: number): void => {
      s.roads!.labor.days = 365;
      addRoadCartTrips(s.roads!, [{ x: 100, z: -110, kind: 'two-wheel', trips: 200 }]);
      updateRoads(s, NOV1(year), pathLandscape(), null);
    };
    run(601);
    expect(s.roads!.roads.some((r) => r.cart)).toBe(false);
    expect(s.roads!.cartCandidates?.length).toBeGreaterThan(0);
    run(602);
    const carts = s.roads!.roads.filter((r) => r.cart);
    expect(carts.length).toBeGreaterThan(0);
    expect(carts.every((r) => (r.cartTraffic?.at(-1) ?? 0) > 0)).toBe(true);
    // bez vozů (ani ohrady se spřežením) žádná vozová cesta ani stopa ve stavu
    const none = withCarts();
    none.pens = [];
    updateRoads(none, NOV1(600), pathLandscape(), null);
    none.roads!.labor.days = 365;
    addRoadCartTrips(none.roads!, [{ x: 100, z: -110, kind: 'two-wheel', trips: 200 }]);
    updateRoads(none, NOV1(601), pathLandscape(), null);
    expect(none.roads!.cartCandidates).toBeUndefined();
    expect(none.roads!.roads.every((r) => r.cartTraffic === undefined)).toBe(true);
  }, 60_000);

  it('v rovině vozy jezdí po pěší cestě – dostane příznak vozová, nová cesta nevznikne', () => {
    const s = withCarts();
    updateRoads(s, NOV1(600), pathLandscape(), null);
    s.roads!.roads.push({
      id: 50,
      points: [
        { x: -10, z: -12 },
        { x: 100, z: -110 },
      ],
      bornDay: NOV1(590),
      grade: 'trodden',
      traffic: [5],
      spots: [],
    });
    for (const year of [601, 602]) {
      s.roads!.labor.days = 365;
      addRoadCartTrips(s.roads!, [{ x: 100, z: -110, kind: 'two-wheel', trips: 200 }]);
      updateRoads(s, NOV1(year), pathLandscape(), null);
    }
    const carts = s.roads!.roads.filter((r) => r.cart);
    expect(carts.map((r) => r.id)).toContain(50);
    expect(s.roads!.roads.filter((r) => r.cart && r.id !== 50)).toEqual([]);
  }, 60_000);

  it('dosah vozů vsi – trasa od ohrady ke cíli, bez spřežení null', () => {
    const s = withCarts();
    const landscape = pathLandscape();
    const routes = villageCartRoutes(s, s.lastDay, landscape, null, 'two-wheel', [
      { x: 100, z: -110, reachM: 9 },
      { x: -130, z: 0, reachM: 4 },
    ])!;
    expect(routes[0]!.reached).toBe(true);
    expect(routes[0]!.lengthM).toBeGreaterThan(50);
    // do lesu bez cesty ne
    expect(routes[1]!.reached).toBe(false);
    const traffic = cartTraffic({ width: 1, height: 1, originX: 0, originZ: 0, cellM: 1 }, [], []);
    expect(traffic.raw.length).toBe(1);
    const noTeam = withCarts();
    noTeam.pens![0]!.team = null;
    expect(
      villageCartRoutes(noTeam, s.lastDay, landscape, null, 'two-wheel', [
        { x: 100, z: -110, reachM: 9 },
      ]),
    ).toBeNull();
  });

  it('výsledek nezávisí na kouscích dopočtu (s jízdami vozů přes 1. 11.)', () => {
    const start = withCarts(NOV1(601) - 12);
    start.roads = {
      nextId: 1,
      roads: [],
      trees: [],
      candidates: [],
      labor: {
        from: NOV1(600),
        days: 353,
        shares: [],
        cart: [{ x: 100, z: -110, kind: 'two-wheel', trips: 150 }],
      },
      cartCandidates: [
        [
          { x: -20, z: -10 },
          { x: 60, z: -90 },
        ],
      ],
    };
    const landscape = pathLandscape();
    const end = NOV1(601) + 3;
    const whole = advanceVillage(start, end, null, landscape);
    const viaJson = (v: VillageState): VillageState =>
      JSON.parse(JSON.stringify(v)) as VillageState;
    let chunked = viaJson(start);
    for (const step of [5, 1, 4, 3, 2]) {
      chunked = viaJson(
        advanceVillage(chunked, Math.min(end, chunked.lastDay + step), null, landscape),
      );
    }
    expect(chunked).toEqual(viaJson(whole));
  }, 60_000);
});

// Vyježděná cesta (wagons.md – Vyjeté cesty; Martin, 19. 10. 2026: „pokud nějakou cestu vyjezdí
// vůz, bude to vyježděná cesta. Pokud vůz takhle vyjezdí vyšlapanou cestu, tak to vozová cesta
// přebije.“)

/** Vzdálenost bodu od osy cesty (m, přesně – jen pro test). */
function axisGap(road: Road, p: { x: number; z: number }): number {
  let best = Infinity;
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}

/** Body osy po 2 m. */
function axisSamples(road: Pick<Road, 'points'>): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let s = k === 1 ? 0 : 1; s <= n; s++) {
      out.push({ x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n });
    }
  }
  return out;
}

/** Nejdelší souběžný kus dvou různých cest (do 12 m, směr do ≈ 37°) – m. */
function longestParallel(roads: readonly Road[]): number {
  let longest = 0;
  for (const a of roads) {
    for (const b of roads) {
      if (a === b) continue;
      const pts = axisSamples(a);
      let run = 0;
      pts.forEach((p, k) => {
        const before = pts[Math.max(0, k - 1)]!;
        const after = pts[Math.min(pts.length - 1, k + 1)]!;
        const tx = after.x - before.x;
        const tz = after.z - before.z;
        const along = b.points.some((q, j) => {
          if (j === 0) return false;
          const s = b.points[j - 1]!;
          const sx = q.x - s.x;
          const sz = q.z - s.z;
          const gap = axisGap({ ...b, points: [s, q] }, p);
          const cos = Math.abs(tx * sx + tz * sz) / (Math.hypot(tx, tz) * Math.hypot(sx, sz) || 1);
          return gap <= 12 && cos >= 0.8;
        });
        run = along ? run + 2 : 0;
        longest = Math.max(longest, run);
      });
    }
  }
  return longest;
}

/** Ves s vyšlapanou cestou `points` a jízdami vozů k `target` dva roky (601, 602). */
function cartYears(
  points: { x: number; z: number }[],
  target: { x: number; z: number },
  setup: (s: VillageState) => void = () => {},
): { state: VillageState; route: CartRoute } {
  const s = withCarts();
  setup(s);
  const landscape = pathLandscape();
  updateRoads(s, NOV1(600), landscape, null);
  s.roads!.roads.push({
    id: 50,
    points,
    bornDay: NOV1(590),
    grade: 'trodden',
    traffic: [5],
    spots: [],
  });
  s.roads!.nextId = 51;
  const route = villageCartRoutes(s, NOV1(601), landscape, null, 'two-wheel', [
    { ...target, reachM: 9 },
  ])![0]!;
  for (const year of [601, 602]) {
    s.roads!.labor.days = 365;
    addRoadCartTrips(s.roads!, [{ ...target, kind: 'two-wheel', trips: 200 }]);
    updateRoads(s, NOV1(year), landscape, null);
  }
  return { state: s, route };
}

/** Body trasy vozů, které nevedou po cestě, kterou vozy mají (do 5 m, nebo souběžně do 12 m). */
function lostRoute(state: VillageState, route: CartRoute, from: number, to: number): number {
  const carts = state.roads!.roads.filter((r) => r.cart || r.grade !== 'trodden');
  return axisSamples(route).filter(
    (p) => p.x >= from && p.x <= to && carts.every((r) => axisGap(r, p) > 12),
  ).length;
}

describe('vyježděná cesta – vůz přebije vyšlapanou', () => {
  it('vozy jedou kus po vyšlapané cestě – ten kus se stane vyježděnou, zbytek zůstane vyšlapaný', () => {
    // cesta 140 m, vozy po ní jezdí jen k cíli na první třetině – medián provozu celé cesty je 0
    const { state, route } = cartYears(
      [
        { x: -10, z: -22.5 },
        { x: 130, z: -22.5 },
      ],
      { x: 40, z: -22.5 },
    );
    expect(route.reached).toBe(true);
    const roads = state.roads!.roads;
    const cart = roads.filter((r) => r.cart);
    expect(cart.length).toBeGreaterThan(0);
    // vyježděný kus leží na ose vyšlapané cesty a nevede za cíl
    for (const r of cart) {
      for (const p of r.points) expect(Math.abs(p.z + 22.5)).toBeLessThan(0.01);
      expect(Math.max(...r.points.map((p) => p.x))).toBeLessThan(45);
    }
    // zbytek cesty (za cílem) zůstal vyšlapaný bez vozů
    const rest = roads.filter((r) => !r.cart && r.points.some((p) => p.x > 100));
    expect(rest.length).toBe(1);
    expect(rest[0]!.grade).toBe('trodden');
    // provoz vozů se neztratil a souběžná cesta nevznikla
    expect(lostRoute(state, route, -5, 30)).toBe(0);
    expect(longestParallel(roads)).toBeLessThan(25);
  }, 60_000);

  it('vozy objíždějí sad kus vedle vyšlapané cesty – osa vozu převezme, souběžná nezůstane', () => {
    // vyšlapaná cesta vede sadem (5 čtverců), vůz sadem neprojede – objede ho souběžně kus vedle
    const { state, route } = cartYears(
      [
        { x: -10, z: -22.5 },
        { x: 130, z: -22.5 },
      ],
      { x: 130, z: -22.5 },
      (s) => {
        s.orchards = [
          {
            id: 70,
            squares: [13, 14, 15, 16, 17].map((x) => ({
              cell: { x, y: 8 },
              areaM2: 225,
              distanceM: 60,
              plantingCost: 0,
              plantingDone: 0,
              plantedDay: NOV1(560),
            })),
          },
        ];
      },
    );
    expect(route.reached).toBe(true);
    // vůz jede kus vedle cesty, souběžně do 12 m
    const beside = axisSamples(route).filter((p) => p.x > 55 && p.x < 100);
    expect(beside.length).toBeGreaterThan(5);
    expect(beside.every((p) => Math.abs(p.z + 22.5) > 5 && Math.abs(p.z + 22.5) <= 12)).toBe(true);
    const roads = state.roads!.roads;
    // vyježděná cesta vede kudy vůz, vyšlapaná sadem zmizela, souběžná dvojice nezůstala
    expect(lostRoute(state, route, -5, 120)).toBe(0);
    expect(longestParallel(roads)).toBeLessThan(25);
    expect(
      roads.some((r) =>
        axisSamples(r).some((p) => p.x > 60 && p.x < 95 && Math.abs(p.z + 22.5) < 1),
      ),
    ).toBe(false);
  }, 60_000);

  it('ve svahu vede pěšina rovně a vozy serpentinou – zůstanou obě cesty', () => {
    const s = withCarts();
    const landscape = SLOPE;
    updateRoads(s, NOV1(600), landscape, null);
    s.roads!.roads.push({
      id: 50,
      points: [
        { x: -10, z: -10 },
        { x: -10, z: -130 },
      ],
      bornDay: NOV1(590),
      grade: 'trodden',
      traffic: [5],
      spots: [],
    });
    s.roads!.nextId = 51;
    for (const year of [601, 602]) {
      s.roads!.labor.days = 365;
      addRoadCartTrips(s.roads!, [{ x: -10, z: -130, kind: 'two-wheel', trips: 200 }]);
      updateRoads(s, NOV1(year), landscape, null);
    }
    const roads = s.roads!.roads;
    const straight = roads.filter(
      (r) => !r.cart && r.points.every((p) => Math.abs(p.x + 10) < 0.01),
    );
    expect(straight.reduce((sum, r) => sum + roadLengthM(r), 0)).toBeGreaterThan(40);
    expect(roads.some((r) => r.cart)).toBe(true);
  }, 60_000);
});
