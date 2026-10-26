import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { fellTrees, matureTreesByDistance, NO_OBSTACLE_CHANGES } from '../obstacles';
import {
  cartGrid,
  cartRoutes,
  cartRoutesOn,
  type CartTarget,
  type CartVillage,
} from '../paths/cart';
import { cartGridKey, forgetCartRoutes, memoCartRoutes } from '../paths/cart-memo';
import { villageCartRoutes } from '../paths/roads';
import type { PathSquare } from '../paths/network';
import { pathWindowFor } from '../paths/terrain';
import { advanceVillage } from '../simulate';
import type { Person, Position, VillageState } from '../types';
import { house, part, pathLandscape, pathTestTerrain } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Mřížka a trasy vozu v paměti (docs/code/village-roads.md – Trasy v paměti): jen zrychlení –
// výsledek bit po bitu týž jako bez paměti, i po studeném startu uprostřed dopočtu

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
const DAY = at(601, 1, 10);

const person = (id: number, years: number, day: number): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId: 1,
});

/** Ves s plnou domácností (obydlí 1 v `home`), ohradou se spřežením a dvoukolákem. */
function village(day = DAY, home: Position = { x: 0, z: 0, rotation: 0 }): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: home }));
  s.people = [25, 25, 20, 19, 5].map((age, i) => person(2 + i, age, day));
  s.constructions = [];
  s.storesKg = 5_000;
  s.lastDay = day;
  s.nextId = 100;
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: -22.5,
      z: -7.5,
      builtDay: day - 800,
      team: { readyDay: day - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: day - 10 }];
  return s;
}

const TARGETS: CartTarget[] = [
  { x: 60, z: 22.5, reachM: 2 },
  { x: -52.5, z: 45, reachM: 2 },
  { x: 45, z: -60, reachM: 9 },
];

describe('trasy vozu po cílech (cartRoutesOn)', () => {
  const terrain = pathTestTerrain();
  const v: CartVillage = { dwellings: [], fields: [] };
  const grid = cartGrid({ village: v, terrain });
  const depots = [{ x: 0, z: 0 }];

  it('cíle po jednom = všechny najednou (bit po bitu) = cartRoutes', () => {
    const together = cartRoutesOn(grid, { kind: 'two-wheel', depots, targets: TARGETS });
    expect(together.every((r) => r.reached)).toBe(true);
    const alone = TARGETS.map(
      (t) => cartRoutesOn(grid, { kind: 'two-wheel', depots, targets: [t] })[0],
    );
    expect(alone).toEqual(together);
    expect(
      cartRoutes({ village: v, terrain, kind: 'two-wheel', depots, targets: TARGETS }).routes,
    ).toEqual(together);
  });

  it('paměť: známé cíle se nehledají, neznámé dohledá – výsledek jako jedno hledání', () => {
    const l = pathLandscape();
    let built = 0;
    const make = (): typeof grid => {
      built++;
      return grid;
    };
    const first = memoCartRoutes(l, null, 'k', make, 'two-wheel', depots, [TARGETS[0]!]);
    const all = memoCartRoutes(l, null, 'k', make, 'two-wheel', depots, TARGETS);
    expect(built).toBe(1);
    expect(all[0]).toBe(first[0]);
    expect(all).toEqual(cartRoutesOn(grid, { kind: 'two-wheel', depots, targets: TARGETS }));
    // jiný vůz – jiné hledání nad toutéž mřížkou
    const four = memoCartRoutes(l, null, 'k', make, 'four-wheel', depots, TARGETS);
    expect(built).toBe(1);
    expect(four).toEqual(cartRoutesOn(grid, { kind: 'four-wheel', depots, targets: TARGETS }));
  });

  it('mez paměti: třetí mřížka vytlačí nejstarší, 65. hledání nejstarší hledání', () => {
    const l = pathLandscape();
    let built = 0;
    const make = (): typeof grid => {
      built++;
      return grid;
    };
    const one = [TARGETS[0]!];
    memoCartRoutes(l, null, 'a', make, 'two-wheel', depots, one);
    memoCartRoutes(l, null, 'b', make, 'two-wheel', depots, one);
    memoCartRoutes(l, null, 'c', make, 'two-wheel', depots, one);
    expect(built).toBe(3);
    memoCartRoutes(l, null, 'c', make, 'two-wheel', depots, one);
    memoCartRoutes(l, null, 'b', make, 'two-wheel', depots, one);
    expect(built).toBe(3);
    memoCartRoutes(l, null, 'a', make, 'two-wheel', depots, one);
    expect(built).toBe(4);
    // hledání: 64 různých výjezdů zaplní mřížku, další vytlačí nejméně nedávno použité
    const first = memoCartRoutes(l, null, 'a', make, 'two-wheel', depots, one)[0];
    for (let n = 1; n <= 64; n++) {
      memoCartRoutes(l, null, 'a', make, 'two-wheel', [{ x: n * 0.5, z: 0 }], one);
    }
    const again = memoCartRoutes(l, null, 'a', make, 'two-wheel', depots, one)[0];
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});

describe('klíč mřížky vozu (cartGridKey)', () => {
  const window = pathWindowFor(pathLandscape(), { minX: -150, minZ: -150, maxX: 150, maxZ: 150 });
  const key = (v: CartVillage): string => cartGridKey(v, window, NO_OBSTACLE_CHANGES);
  const fields = (stage: 'sown' | 'ready' | 'meadow' | 'shrubs'): CartVillage['fields'] => [
    { id: 1, parts: [part(30, 30, stage), part(45, 30, 'sown')] },
  ];
  const base: CartVillage = { dwellings: [house(1, -60, -60)], fields: fields('sown') };

  it('stadium dílu klíč nemění (stálá cena), zarostlý díl ano', () => {
    expect(key({ ...base, fields: fields('ready') })).toBe(key(base));
    expect(key({ ...base, fields: fields('meadow') })).toBe(key(base));
    expect(key({ ...base, fields: fields('shrubs') })).not.toBe(key(base));
  });

  it('nová pevná cesta, obydlí nebo pokácený strom – nový klíč', () => {
    const road = {
      points: [
        { x: -60, z: 0 },
        { x: 60, z: 0 },
      ],
      grade: 'trodden' as const,
    };
    expect(key({ ...base, roads: [road] })).not.toBe(key(base));
    expect(key({ ...base, dwellings: [...base.dwellings, house(2, 60, -60)] })).not.toBe(key(base));
    expect(cartGridKey(base, window, { ...NO_OBSTACLE_CHANGES, stumps: [7] })).not.toBe(key(base));
  });
});

describe('klíč mřížky vozu – ostatní stavby vsi', () => {
  const window = pathWindowFor(pathLandscape(), { minX: -150, minZ: -150, maxX: 150, maxZ: 150 });
  const key = (v: CartVillage): string => cartGridKey(v, window, NO_OBSTACLE_CHANGES);
  const base: CartVillage = {
    dwellings: [house(1, -60, -60)],
    fields: [{ id: 1, parts: [part(30, 30, 'sown')] }],
  };
  const sq = (x: number, z: number): PathSquare => ({ ...part(x, z), size: 15 });

  const variants: Record<string, CartVillage> = {
    ohrada: { ...base, pens: [{ ...sq(-22.5, -7.5), id: 9, built: true }] },
    svatyně: {
      ...base,
      sacred: {
        oaks: [],
        groves: [],
        buildings: [
          { id: 5, kind: 'shrine', position: { x: 50, z: 50, rotation: 0 }, built: true },
        ],
      },
    },
    'zemní práce': { ...base, earthworks: [{ profile: [], reachedM: 12 }] },
    'les vsi': { ...base, woods: [sq(-52.5, 45)] },
    sad: { ...base, orchards: [{ id: 3, squares: [sq(60, 22.5)] }] },
    hřbitov: { ...base, cemeteries: [{ id: 4, squares: [sq(45, -60)], built: true }] },
    'díl s mladým lesem': { ...base, fields: [{ id: 1, parts: [part(30, 30, 'young-forest')] }] },
    milíř: { ...base, kilns: [{ x: 40, z: 40 }] },
    humno: {
      ...base,
      threshingFloors: [{ id: 6, position: { x: 30, z: -30, rotation: 0 }, built: true }],
    },
  };

  it.each(Object.entries(variants))('%s – nový klíč, tytéž vstupy – týž klíč', (_name, v) => {
    expect(key(v)).not.toBe(key(base));
    expect(key(structuredClone(v))).toBe(key(v));
  });
});

/** Háj dospělých stromů po 6 m na cestě vozu (krajina 20 × 20 políček po 15 m). */
function treeLayer(): ObstacleLayer {
  const trees: ObstaclePlacement[] = [];
  let id = 1;
  for (let x = -30; x <= 30; x += 6)
    for (let z = -120; z <= -20; z += 6) {
      trees.push({
        id: id++,
        kind: 'tree',
        look: 'beech-1',
        x,
        z,
        rotation: 0,
        scale: 1,
      });
    }
  return packObstacles(trees, 20, 15);
}

describe('trasy vozu vsi v paměti (villageCartRoutes)', () => {
  it('táž mapa jiný den – zásah; po zapomenutí spočítáno znovu totéž', () => {
    const l = pathLandscape();
    const s = village();
    const targets: CartTarget[] = [{ x: 60, z: 22.5, reachM: 9 }];
    const a = villageCartRoutes(s, DAY, l, null, 'two-wheel', targets)!;
    expect(a[0]!.reached).toBe(true);
    expect(villageCartRoutes(s, DAY + 1, l, null, 'two-wheel', targets)![0]).toBe(a[0]);
    forgetCartRoutes(l);
    const cold = villageCartRoutes(s, DAY + 1, l, null, 'two-wheel', targets)!;
    expect(cold[0]).not.toBe(a[0]);
    expect(cold).toEqual(a);
  });

  it('dopočet se studeným startem každý den = dopočet najednou (bit po bitu)', () => {
    const l = pathLandscape();
    const start = village(DAY, { x: 0, z: -135, rotation: 0 });
    const whole = advanceVillage(structuredClone(start), DAY + 3, null, l);
    expect((whole.roads?.labor.cart ?? []).some((t) => t.trips > 0)).toBe(true);
    let s = structuredClone(start);
    for (let d = DAY + 1; d <= DAY + 3; d++) {
      forgetCartRoutes(l);
      s = advanceVillage(s, d, null, l);
    }
    expect(s).toEqual(whole);
  }, 60_000);

  it('teplá paměť přes změnu stavu (pokácené stromy) = studený start každý den', () => {
    const l = pathLandscape();
    const layer = treeLayer();
    const start = village(DAY, { x: 0, z: -135, rotation: 0 });
    const run = (forget: boolean): VillageState => {
      let s = structuredClone(start);
      for (let d = DAY + 1; d <= DAY + 4; d++) {
        if (forget) forgetCartRoutes(l);
        if (d === DAY + 3) {
          const ids = matureTreesByDistance(
            layer,
            NO_OBSTACLE_CHANGES,
            { x: 0, z: -70 },
            { limit: 60 },
          );
          s = fellTrees(
            s,
            ids.map((t) => t.id),
            d - 1,
          );
        }
        s = advanceVillage(s, d, layer, l);
      }
      return s;
    };
    forgetCartRoutes(l);
    const warm = run(false);
    expect(run(true)).toEqual(warm);
    expect(warm.felledTrees?.length ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
