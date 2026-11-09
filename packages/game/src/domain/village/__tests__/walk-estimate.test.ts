import { describe, expect, it, vi } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cartEstimates, villageCartEstimates, type CartGround } from '../paths/cart-estimate';
import { PATH_FORD, PATH_FOREST, PATH_WATER, type PathTerrain } from '../paths/terrain';
import { fordDetour, groundWalkLength, type WalkGround } from '../paths/walking';
import { ROAD_WALK } from '../rules';
import { advanceVillage } from '../simulate';
import type { Person, Road, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Odhad vzdáleností (paths.md – Odhad vzdáleností; Martin 31. 10. 2026: „simulace bude počítat
// jen s odhadem vzdáleností a přesné trasy zůstanou prohlížeči“): úsečka po povrchu, potok
// objížďkou přes brod, síť pevných cest zrychlí; simulace mřížku ani trasy vozu nehledá.

// počítadla hledání vozu – obal skutečných funkcí (výsledek beze změny)
const calls = vi.hoisted(() => ({ grid: 0, routes: 0, cost: 0 }));
vi.mock('../paths/cart', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../paths/cart')>();
  return {
    ...mod,
    cartGrid: (...args: Parameters<typeof mod.cartGrid>) => {
      calls.grid++;
      return mod.cartGrid(...args);
    },
    cartRoutesOn: (...args: Parameters<typeof mod.cartRoutesOn>) => {
      calls.routes++;
      return mod.cartRoutesOn(...args);
    },
    cartCostOn: (...args: Parameters<typeof mod.cartCostOn>) => {
      calls.cost++;
      return mod.cartCostOn(...args);
    },
  };
});

const CELL_M = 2;
const W = 60;

/** Rovná louka 120 × 120 m s potokem napříč (sloupec i = 30) a brodem v řádku `fordJ`. */
function streamGround(fordJ: number | null, forest = false): WalkGround {
  const flags = new Uint8Array(W * W);
  const cost = new Float32Array(W * W).fill(1);
  for (let j = 0; j < W; j++) {
    const c = j * W + 30;
    flags[c] = PATH_WATER | (j === fordJ ? PATH_FORD : 0);
    if (forest) for (let i = 35; i < 45; i++) flags[j * W + i] = PATH_FOREST;
  }
  const terrain: PathTerrain = {
    width: W,
    height: W,
    originX: 0,
    originZ: 0,
    cellM: CELL_M,
    window: { i0: 0, j0: 0, i1: W - 1, j1: W - 1 },
    cost,
    flags,
  };
  return { terrain };
}

describe('odhad chůze rovně', () => {
  it('přes potok mimo brod jde objížďkou přes nejbližší brod', () => {
    const a = { x: 40, z: 20 };
    const b = { x: 80, z: 20 };
    const near = streamGround(15);
    const far = streamGround(50);
    const viaNear = groundWalkLength(near, a, b);
    const viaFar = groundWalkLength(far, a, b);
    // brod v řádku 15 (z = 30): objížďka a → brod → b, + 30 m za brodění
    const ford = fordDetour(near, a, b)!;
    expect(ford).toEqual({ x: 60, z: 30 });
    const leg = Math.hypot(20, 10);
    expect(viaNear).toBeCloseTo(2 * leg + ROAD_WALK.fordExtraM, 6);
    expect(viaFar).toBeGreaterThan(viaNear + 50);
    // bez brodu v okně se brodí kdekoli (+ 30 m)
    expect(groundWalkLength(streamGround(null), a, b)).toBeCloseTo(40 + ROAD_WALK.fordExtraM, 6);
  });

  it('lesem pomaleji (cena lesa v síti pěšin)', () => {
    const plain = groundWalkLength(streamGround(null), { x: 66, z: 10 }, { x: 94, z: 10 });
    const wood = groundWalkLength(streamGround(null, true), { x: 66, z: 10 }, { x: 94, z: 10 });
    expect(plain).toBeCloseTo(28, 6);
    expect(wood).toBeGreaterThan(plain + 5);
  });
});

describe('odhad jízdy vozu', () => {
  const ground = (fordJ: number | null, forest = false): CartGround => {
    const g = streamGround(fordJ, forest);
    const cost = new Float32Array(W * W).fill(1);
    for (let c = 0; c < cost.length; c++) {
      const f = g.terrain.flags[c]!;
      if (f & PATH_WATER) cost[c] = f & PATH_FORD ? 3 : -1;
      else if (f & PATH_FOREST) cost[c] = Infinity;
    }
    return { terrain: g.terrain, cost };
  };
  const road = (points: { x: number; z: number }[], grade: Road['grade'] = 'trodden'): Road => ({
    id: 1,
    points,
    bornDay: 0,
    grade,
    traffic: [],
    spots: [],
  });
  const target = { x: 100, z: 20, reachM: 0 };

  it('lesem jen po pevné cestě, cesta zrychlí', () => {
    // les (i = 35–44) přes celou mapu – rovně vůz neprojede
    const blocked = cartEstimates(ground(null, true), [], [{ x: 64, z: 20 }], [target]);
    expect(blocked[0]!.reached).toBe(false);
    const viaRoad = cartEstimates(
      ground(null, true),
      [
        road([
          { x: 64, z: 20 },
          { x: 100, z: 20 },
        ]),
      ],
      [{ x: 64, z: 20 }],
      [target],
    );
    expect(viaRoad[0]!.reached).toBe(true);
    expect(viaRoad[0]!.cost).toBeCloseTo(36 / 1.3, 6);
    expect(viaRoad[0]!.end).toEqual({ x: 100, z: 20 });
    // upravená cesta je rychlejší než vyšlapaná
    const improved = cartEstimates(
      ground(null, true),
      [
        road(
          [
            { x: 64, z: 20 },
            { x: 100, z: 20 },
          ],
          'improved',
        ),
      ],
      [{ x: 64, z: 20 }],
      [target],
    );
    expect(improved[0]!.cost).toBeLessThan(viaRoad[0]!.cost);
  });

  it('přes potok jen brodem – bez brodu nedojede', () => {
    const from = [{ x: 40, z: 20 }];
    const to = [{ x: 80, z: 20, reachM: 2 }];
    expect(cartEstimates(ground(null), [], from, to)[0]!.reached).toBe(false);
    const ford = cartEstimates(ground(15), [], from, to)[0]!;
    expect(ford.reached).toBe(true);
    expect(ford.cost).toBeGreaterThan(40);
    // jízda končí reachM před cílem
    expect(ford.end.x).toBeCloseTo(78, 6);
  });
});

describe('simulace bez hledání tras vozu', () => {
  const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
  const person = (id: number, years: number, day: number): Person => ({
    id,
    bornDay: day - Math.ceil(years * 365.25),
    dwellingId: 1,
  });
  /** Ves daleko od vody s ohradou se spřežením a dvoukolákem (voda vozem). */
  function village(day: number): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: -135, rotation: 0 } }),
    );
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

  it('vůz jede pro vodu podle odhadu – mřížka ani trasy vozu se nehledají', () => {
    // den bez sněhu (population.md – Skladba dne podle ročního období)
    const day = at(601, 11, 15);
    calls.grid = 0;
    calls.routes = 0;
    calls.cost = 0;
    const next = advanceVillage(village(day), day + 3, null, LANDSCAPE);
    const hauls = next.labor!.shares.filter((share) => share.activity === 'haul');
    expect(hauls.some((share) => share.job === 'water')).toBe(true);
    expect(calls).toEqual({ grid: 0, routes: 0, cost: 0 });
  }, 60_000);

  it('dopočet najednou = po dnech (odhad nezávisí na kouscích)', () => {
    const day = at(601, 1, 10);
    const whole = advanceVillage(village(day), day + 6, null, LANDSCAPE);
    let pieces = village(day);
    for (let d = day + 1; d <= day + 6; d++) pieces = advanceVillage(pieces, d, null, LANDSCAPE);
    expect(pieces).toEqual(whole);
  }, 60_000);

  it('odhad jízdy je deterministický a nezávisí na paměti půdy', () => {
    const day = at(601, 1, 10);
    const s = village(day);
    const targets = [
      { x: 60, z: -40, reachM: 5 },
      { x: -80, z: 30, reachM: 5 },
    ];
    const first = villageCartEstimates(s, day, LANDSCAPE, 'two-wheel', targets);
    // jiná ves mezitím (jiná pole) – paměť půdy vozu se přepne a zase vrátí
    villageCartEstimates({ ...s, parts: [] }, day, LANDSCAPE, 'two-wheel', targets);
    expect(villageCartEstimates(s, day, LANDSCAPE, 'two-wheel', targets)).toEqual(first);
  });
});
