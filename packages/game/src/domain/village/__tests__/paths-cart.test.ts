import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  axisCartCheck,
  cartGrid,
  cartPartSpeed,
  cartRoadSpeed,
  cartRoutes,
  cartTraffic,
  cartVillageOf,
  type CartGrid,
  type CartRoad,
  type CartRoute,
} from '../paths/cart';
import { computePathNetwork, type PathVillage } from '../paths/network';
import { addRoadCartTrips, roadLengthM, updateRoads, villageCartRoutes } from '../paths/roads';
import { CART_ROUTES, CART_SPEED, WEAR } from '../rules';
import { wearAt, wearMap } from '../paths/wear';
import { advanceVillage } from '../simulate';
import type { CartKind, Dwelling, Person, Road, VillageState } from '../types';
import { PATH_WETLAND, type PathTerrain } from '../paths/terrain';
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

  it('lesem i po šikmé cestě a jejím ohybu (pás cesty, úhlopříčka po cestě přes roh)', () => {
    // Vlkov 23. 10. 2026: šikmá cesta lesem byla na mřížce řetěz buněk spojených rohy – vůz
    // úhlopříčkou přes roh lesa nejel a k vodě po vozové cestě nedojel
    const bends = [
      [
        { x: 0, z: 0 },
        { x: -95, z: 0 },
        { x: -135, z: -40 },
      ],
      [
        { x: 0, z: 0 },
        { x: -95, z: 0 },
        { x: -112, z: -30 },
        { x: -138, z: -42 },
      ],
    ];
    for (const axis of bends) {
      const end = axis[axis.length - 1]!;
      expect(route({}, end).reached).toBe(false);
      const road = { id: 1, points: axis, grade: 'trodden' as const };
      expect(route({ roads: [road] }, end).reached).toBe(true);
    }
  });

  it('čtyřkolák po louce a poli kamkoli, pole jako dvoukolák (paths.md – Stálé trasy)', () => {
    const four = (extra: Partial<PathVillage>, target: { x: number; z: number }): CartRoute =>
      cartRoutes({
        village: village(extra),
        terrain: flatTerrain,
        kind: 'four-wheel',
        depots: [{ x: 0, z: 0 }],
        targets: [{ ...target, reachM: 4 }],
      }).routes[0]!;
    // Martin: „Po strništích a loukách může libovolně“ – daleko od ohrady i bez cesty
    const far = { x: 60, z: 40 };
    expect(route({}, far).reached).toBe(true);
    expect(four({}, far).reached).toBe(true);
    // stadium dílu nerozhoduje – přes strniště i zakládaný díl táž trasa (Martin 25. 10. 2026:
    // „Ať je stejná cena jako u dvoukoláku.“)
    const fields = (stage: 'ready' | 'founding'): PathVillage['fields'] => [
      { id: 2, parts: [-15, 0, 15].map((x) => part(x, 52.5, stage)) },
    ];
    const behind = { x: 0, z: 70 };
    const stubble = four({ fields: fields('ready') }, behind);
    const ploughed = four({ fields: fields('founding') }, behind);
    expect(stubble.reached && ploughed.reached).toBe(true);
    expect(ploughed.cells).toEqual(stubble.cells);
    expect(ploughed.cost).toBe(stubble.cost);
  });

  it('přes vodu bez brodu ani po cestě s lávkou (lávka je jen pro pěší)', () => {
    const across = { x: 0, z: 110 };
    expect(route({}, across).reached).toBe(false);
    const bridge = [
      { x: 0, z: 0 },
      { x: 0, z: 115 },
    ];
    expect(route({ roads: [{ id: 1, points: bridge, grade: 'improved' }] }, across).reached).toBe(
      false,
    );
  });

  it('osetý díl i úhor stejně – stálá cena pole (paths.md – Stálé trasy)', () => {
    const fields = (stage: 'sown' | 'young-fallow'): PathVillage['fields'] => [
      { id: 2, parts: [-15, 0, 15].map((x) => part(x, 52.5, stage)) },
    ];
    const target = { x: 0, z: 70 };
    const sown = route({ fields: fields('sown') }, target);
    const fallow = route({ fields: fields('young-fallow') }, target);
    expect(sown.reached && fallow.reached).toBe(true);
    expect(sown.cells).toEqual(fallow.cells);
    expect(sown.cost).toBe(fallow.cost);
  });

  it('vůz bez jiné cesty projede pole – metr jako 4 m louky (Martin 25. 10. 2026)', () => {
    // pás dílů přes celou šířku krajiny – objížďka není
    const wall: PathVillage['fields'] = [
      {
        id: 2,
        parts: Array.from({ length: 42 }, (_, k) =>
          part(-150 + (k % 21) * 15, 37.5 + Math.floor(k / 21) * 15, 'sown'),
        ),
      },
    ];
    const target = { x: 0, z: 70 };
    const across = route({ fields: wall }, target);
    expect(across.reached).toBe(true);
    // přes ≈ 30 m pole – každý metr o 3 dráž než louka
    expect(across.cost).toBeGreaterThan(route({}, target).cost + 60);
  });

  it('humno vůz objede jako stavbu (production-chains.md – Humno)', () => {
    // humno 8 × 10 m přes přímou trasu na sever
    const floor = { id: 5, position: { x: 0, z: 30, rotation: 0 }, built: true };
    const target = { x: 0, z: 60 };
    const straight = route({}, target);
    const around = route({ threshingFloors: [floor] }, target);
    expect(straight.reached && around.reached).toBe(true);
    // body trasy po metru (osa má body jen v lomech)
    const onFloor = (r: CartRoute): boolean =>
      r.points.slice(1).some((b, k) => {
        const a = r.points[k]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
        return Array.from({ length: n + 1 }, (_, i) => ({
          x: a.x + ((b.x - a.x) * i) / n,
          z: a.z + ((b.z - a.z) * i) / n,
        })).some((p) => Math.abs(p.x) < 4 && Math.abs(p.z - 30) < 5);
      });
    expect(onFloor(straight)).toBe(true);
    expect(onFloor(around)).toBe(false);
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

describe('rychlost vozu podle povrchu a cesty (wagons.md – Vozová síť, rychlosti; návrh Clauda)', () => {
  /** Mokřina v pásu x ∈ [30, 60] přes celou krajinu (příznak terénu), jinak louka. */
  const wetTerrain: PathTerrain = {
    ...flatTerrain,
    flags: flatTerrain.flags.map((f, c) => {
      const x = flatTerrain.originX + (c % flatTerrain.width) * flatTerrain.cellM;
      return x >= 30 && x <= 60 ? f | PATH_WETLAND : f;
    }),
  };
  const at = (grid: CartGrid, x: number, z: number): number =>
    grid.cost[
      Math.round((z - grid.originZ) / grid.cellM) * grid.width +
        Math.round((x - grid.originX) / grid.cellM)
    ]!;
  const axis = (z: number): { x: number; z: number }[] => [
    { x: -60, z },
    { x: 120, z },
  ];

  it('ceny buněk = 1 / rychlost podle tabulky', () => {
    const roads: CartRoad[] = [
      { id: 1, points: axis(-120), grade: 'trodden' },
      { id: 2, points: axis(-105), grade: 'trodden', cart: true },
      { id: 3, points: axis(-90), grade: 'improved' },
      { id: 4, points: axis(-75), grade: 'improved' },
      // přes mokřinu (ground.wet 90–120 m od začátku osy = x ∈ [30, 60])
      { id: 5, points: axis(-45), grade: 'trodden', ground: { wet: [[90, 120]], fords: [] } },
      { id: 6, points: axis(-30), grade: 'improved', ground: { wet: [[90, 120]], fords: [] } },
      {
        id: 7,
        points: axis(-15),
        grade: 'improved',
        unbridged: true,
        ground: { wet: [[90, 120]], fords: [] },
      },
      // vyšlapaná přes zakládaný díl (x = 97,5, z = 7,5) – cesta přebije díl
      { id: 8, points: axis(7.5), grade: 'trodden' },
    ];
    const fields: PathVillage['fields'] = [
      {
        id: 1,
        parts: [
          part(97.5, 7.5, 'founding'),
          part(-37.5, 37.5, 'founding'),
          part(-37.5, 52.5, 'ready'),
          part(-22.5, 37.5, 'young-fallow'),
          part(-22.5, 52.5, 'meadow'),
          part(-7.5, 37.5, 'sown'),
          part(45, 37.5, 'founding'),
        ],
      },
    ];
    const grid = cartGrid({ village: village({ roads, fields }), terrain: wetTerrain });
    const close = (cost: number, speed: number): void => expect(cost).toBeCloseTo(1 / speed, 5);
    close(at(grid, 0, 20), 1); // louka
    close(at(grid, 45, 20), CART_SPEED.wet); // mokřina bez cesty
    close(at(grid, 0, -120), CART_SPEED.road.trodden);
    close(at(grid, 0, -105), CART_SPEED.road.cart);
    close(at(grid, 0, -90), CART_SPEED.road.improved);
    close(at(grid, 0, -75), CART_SPEED.road.improved);
    // cesta přes mokřinu: vyšlapaná a upravená bahnem jako bez cesty, hať rychle
    close(at(grid, 45, -45), CART_SPEED.wet);
    close(at(grid, 45, -15), CART_SPEED.wet);
    close(at(grid, 45, -30), CART_SPEED.road.improved);
    // táž cesta mimo mokřinu na ose
    close(at(grid, 0, -45), CART_SPEED.road.trodden);
    // díly polí – stálá cena v každém stadiu (paths.md – Stálé trasy)
    close(at(grid, -37.5, 37.5), CART_SPEED.field);
    close(at(grid, -37.5, 52.5), CART_SPEED.field);
    close(at(grid, -22.5, 37.5), CART_SPEED.field);
    close(at(grid, -22.5, 52.5), CART_SPEED.field);
    close(at(grid, -7.5, 37.5), CART_SPEED.field);
    // okraj dílu (úvrať) v mokřině – jako louka v mokřině
    close(at(grid, 45, 37.5), CART_SPEED.wet);
    // cesta přes zakládaný díl – rychlost cesty
    close(at(grid, 97.5, 7.5), CART_SPEED.road.trodden);
    // pořadí rychlostí (CART_SPEED)
    expect(cartRoadSpeed('trodden', true, false)).toBeGreaterThan(
      cartRoadSpeed('trodden', false, false),
    );
    expect(cartRoadSpeed('improved', false, false)).toBeGreaterThan(
      cartRoadSpeed('trodden', true, false),
    );
    expect(cartRoadSpeed('improved', true, false)).toBe(CART_SPEED.road.improved);
    expect(cartRoadSpeed('improved', false, true)).toBe(CART_SPEED.road.improved);
    // upravená bez hatě (`unbridged`) v mokřině jako vyšlapaná – bahno
    expect(cartRoadSpeed('improved', false, true, 0, true)).toBe(CART_SPEED.wet);
    expect(cartRoadSpeed('trodden', true, true)).toBe(CART_SPEED.wet);
    expect(cartPartSpeed('sown')).toBe(CART_SPEED.field);
    expect(cartPartSpeed('shrubs')).toBe(0);
    expect(cartPartSpeed('young-forest')).toBe(0);
  });

  /** Trasa vozu podél cesty z = 0 z x = 0 do x = 120 (louka kolem, mokřina podle terénu). */
  const along = (road: CartRoad | null, terrain: PathTerrain = flatTerrain): CartRoute =>
    cartRoutes({
      village: village(road ? { roads: [road] } : {}),
      terrain,
      kind: 'two-wheel',
      depots: [{ x: 0, z: 0 }],
      targets: [{ x: 120, z: 0, reachM: 4 }],
    }).routes[0]!;
  const line = [
    { x: -20, z: 0 },
    { x: 140, z: 0 },
  ];

  it('po vyježděné cestě vůz jede rychleji než po vyšlapané, po upravené nejrychleji', () => {
    const meadow = along(null);
    const trodden = along({ id: 1, points: line, grade: 'trodden' });
    const cart = along({ id: 1, points: line, grade: 'trodden', cart: true });
    const improved = along({ id: 1, points: line, grade: 'improved' });
    for (const r of [meadow, trodden, cart, improved]) expect(r.reached).toBe(true);
    expect(cart.cost).toBeLessThan(trodden.cost);
    expect(improved.cost).toBeLessThan(cart.cost);
    expect(trodden.cost).toBeLessThan(meadow.cost);
    // po rovné cestě poměr cen = poměr rychlostí
    expect(cart.cost / trodden.cost).toBeCloseTo(CART_SPEED.road.trodden / CART_SPEED.road.cart, 2);
  });

  it('hať přes mokřinu je rychlá, vyšlapaná cesta přes mokřinu pomalá (bahno)', () => {
    // mokřina na ose 50–80 m od začátku osy (x ∈ [30, 60])
    const ground = { wet: [[50, 80]] as [number, number][], fords: [] };
    const dry = along({ id: 1, points: line, grade: 'trodden' }, wetTerrain);
    const muddy = along({ id: 1, points: line, grade: 'trodden', ground }, wetTerrain);
    const causeway = along({ id: 1, points: line, grade: 'improved', ground }, wetTerrain);
    const none = along(null, wetTerrain);
    expect(causeway.cost).toBeLessThan(muddy.cost);
    expect(muddy.cost).toBeGreaterThan(dry.cost);
    // vyšlapaná přes mokřinu stojí v mokřině jako bez cesty – mimo ni je rychlejší
    expect(muddy.cost).toBeLessThan(none.cost);
    expect(muddy.cost - dry.cost).toBeCloseTo(
      30 * (1 / CART_SPEED.wet - 1 / CART_SPEED.road.trodden),
      -1,
    );
  });

  it('cartVillageOf přidá cestám mokřinu z úseků stavu podle id', () => {
    const ground = { wet: [[50, 80]] as [number, number][], fords: [] };
    const v = village({
      roads: [
        { id: 1, points: line, grade: 'trodden' },
        { id: 2, points: axis(30), grade: 'trodden' },
      ],
    });
    const out = cartVillageOf(v, [{ id: 1, ground }, { id: 2 }]);
    expect(out.roads?.[0]?.ground).toBe(ground);
    expect(out.roads?.[1]?.ground).toBeUndefined();
    expect(cartVillageOf(v, [])).toBe(v);
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
  it('jízdy vozů vyšlapou pěšinu (cesta pak vznikne z vyšlapanosti); bez vozů nic', () => {
    const s = withCarts();
    updateRoads(s, NOV1(600), pathLandscape(), null);
    s.roads!.wear = { day: NOV1(600), cells: '', labor: [] };
    const run = (year: number): void => {
      s.roads!.labor.days = 365;
      addRoadCartTrips(s.roads!, [{ x: 100, z: -110, kind: 'two-wheel', trips: 200 }]);
      updateRoads(s, NOV1(year), pathLandscape(), null);
    };
    run(601);
    // roční síť vozů už nové cesty nezakládá – jízdy jdou do vyšlapanosti (× WEAR.cartWeight)
    expect(s.roads!.roads.some((r) => r.cart)).toBe(false);
    expect(s.roads!.cartCandidates?.length).toBeGreaterThan(0);
    const worn = [...wearMap(s.roads!.wear!).values()];
    expect(worn.length).toBeGreaterThan(0);
    expect(Math.max(...worn)).toBeGreaterThan(WEAR.visibleFrom);
    run(602);
    expect(Math.max(...wearMap(s.roads!.wear!).values())).toBeGreaterThan(WEAR.extendFrom);
    expect(s.roads!.roads.some((r) => r.cart)).toBe(false);
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
  s.roads!.wear = { day: NOV1(600), cells: '', labor: [] };
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

/**
 * Body trasy vozů, které nevedou po žádné cestě (do 12 m) ani po vyšlapané ploše – vozy cesty
 * nezakládají, jejich jízdy tedy musí aspoň vyšlapat pěšinu nebo vést po cestě.
 */
function lostRoute(state: VillageState, route: CartRoute, from: number, to: number): number {
  const roads = state.roads!.roads;
  const worn = wearMap(state.roads!.wear!);
  return axisSamples(route).filter(
    (p) =>
      p.x >= from &&
      p.x <= to &&
      roads.every((r) => axisGap(r, p) > 12) &&
      wearAt(worn, p.x, p.z) <= 0,
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

  it('vozy objíždějí sad kus vedle vyšlapané cesty – cesty nepřebírají, pěšina se vyšlape po ose vozu', () => {
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
    // vozy novou cestu nezakládají (vznikne z vyšlapanosti), cestu sadem nepřebírají – souběžný
    // kus je dlouhý; jízdy kus vedle cesty vyšlapou pěšinu po ose vozů
    const roads = state.roads!.roads;
    expect(roads.some((r) => r.cart)).toBe(false);
    expect(roads.map((r) => r.id)).toContain(50);
    const mid = beside[Math.floor(beside.length / 2)]!;
    expect(wearAt(wearMap(state.roads!.wear!), mid.x, mid.z)).toBeGreaterThan(0);
    // trasa vozů nezůstala bez cesty: každý její bod leží u cesty (do 12 m) nebo na vyšlapané ploše
    expect(lostRoute(state, route, 55, 100)).toBe(0);
    // vozy nezaložily souběžnou dvojici cest
    expect(longestParallel(roads)).toBeLessThan(25);
  }, 60_000);

  it('ve svahu vede pěšina rovně a vozy serpentinou – vozová cesta nevznikne hned, pěšina zůstane', () => {
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
    expect(roads.some((r) => r.cart)).toBe(false);
  }, 60_000);
});

describe('ulička mezi ohradami a hřbitovem (oxen.md – plot je menší než čtverec)', () => {
  // dvě ohrady vedle sebe: políčka x = 8 a 9 (středy −22,5 a −7,5), hranice na x = −15
  const penAt = (x: number, id: number): NonNullable<PathVillage['pens']>[number] => ({
    ...part(x, -7.5),
    id,
    built: true,
  });
  const costAt = (grid: CartGrid, x: number, z: number): number => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    return grid.cost[j * grid.width + i]!;
  };

  it('řada buněk na hranici mezi dvěma ohradami je sjízdná, buňky pod plotem ne', () => {
    const grid = cartGrid({
      village: village({ pens: [penAt(-22.5, 1), penAt(-7.5, 2)] }),
      terrain: flatTerrain,
    });
    // uvnitř ohrad (plot 1,5 m od okraje) vůz nejede
    expect(costAt(grid, -22.5, -7.5)).toBe(Infinity);
    expect(costAt(grid, -7.5, -7.5)).toBe(Infinity);
    expect(costAt(grid, -18.75, -7.5)).toBe(Infinity);
    expect(costAt(grid, -11.25, -7.5)).toBe(Infinity);
    // ulička 3 m na hranici políček: celou délkou ohrad (z −15 … 0) sjízdná
    for (const z of [-15, -11.25, -7.5, -3.75, 0]) {
      expect(Number.isFinite(costAt(grid, -15, z)), `z = ${z}`).toBe(true);
    }
  });

  it('hřbitov a ohrada vedle sebe mají také uličku; sama ohrada se objíždí jako dřív', () => {
    const grid = cartGrid({
      village: village({
        cemeteries: [{ id: 3, built: true, squares: [part(-22.5, -7.5)] }],
        pens: [penAt(-7.5, 2)],
      }),
      terrain: flatTerrain,
    });
    expect(costAt(grid, -22.5, -7.5)).toBe(Infinity);
    expect(Number.isFinite(costAt(grid, -15, -7.5))).toBe(true);
    // za vnější stranou plotu je volno (jen 1,5 m pruh u plotu)
    expect(Number.isFinite(costAt(grid, -30, -7.5))).toBe(true);
  });

  it('natočené ohrady (30°) mají souvislou uličku, i když mřížka vozů nesedí na hranici', () => {
    const turn = Math.PI / 6;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    // dva hřbitovy vedle sebe v natočené mřížce; několik posunů, aby střed buňky nepadl vždy stejně
    for (const shift of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7]) {
      const x0 = -22.5 + shift;
      const z0 = -7.5 + shift / 2;
      const sq = (k: number): ReturnType<typeof part> => ({
        ...part(x0 + 15 * k * c, z0 - 15 * k * sn),
        cell: { x: 8 + k, y: 9 },
        rotation: turn,
      });
      const grid = cartGrid({
        village: village({
          cemeteries: [
            { id: 1, built: true, squares: [sq(0)] },
            { id: 2, built: true, squares: [sq(1)] },
          ],
        }),
        terrain: flatTerrain,
      });
      // hranice: bod mezi středy a směr podél ní
      const mx = x0 + 7.5 * c;
      const mz = z0 - 7.5 * sn;
      const near = new Set<number>();
      for (let j = 0; j < grid.height; j++) {
        for (let i = 0; i < grid.width; i++) {
          const x = grid.originX + i * grid.cellM;
          const z = grid.originZ + j * grid.cellM;
          const across = Math.abs((x - mx) * c - (z - mz) * sn);
          const along = (x - mx) * sn + (z - mz) * c;
          if (
            across <= 2.7 &&
            Math.abs(along) <= 7 &&
            Number.isFinite(grid.cost[j * grid.width + i]!)
          )
            near.add(j * grid.width + i);
        }
      }
      // průchod 8 sousedů z jednoho konce uličky na druhý
      const ends = [...near].sort((a, b) => {
        const f = (q: number): number =>
          (grid.originX + (q % grid.width) * grid.cellM - mx) * sn +
          (grid.originZ + Math.floor(q / grid.width) * grid.cellM - mz) * c;
        return f(a) - f(b);
      });
      const start = ends[0]!;
      const goal = ends[ends.length - 1]!;
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        const q = queue.pop()!;
        for (const dj of [-1, 0, 1]) {
          for (const di of [-1, 0, 1]) {
            const n = q + dj * grid.width + di;
            if (near.has(n) && !seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
      }
      expect(seen.has(goal), `posun ${shift}`).toBe(true);
    }
  });
});
