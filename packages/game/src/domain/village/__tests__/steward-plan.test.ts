import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import { foundVillage } from '../actions';
import { streamHeights } from '../part-protection';
import { waterDistanceM } from '../placement-squares';
import { CEMETERY_DISTANCE_M } from '../rules-people';
import { STEWARD } from '../rules-steward';
import { newSteward } from '../steward-state';
import { HOUSE_FLOOD_M } from '../steward-land';
import { needsReplan, planSettlement, planStamp } from '../steward-plan';
import type { Person, StewardPlan, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';

// Plán sídla správce (steward.md – Plán sídla, Výpočetní rozpočet).

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365;

function village(landscape: Landscape, at: { x: number; y: number }, extra = 0): VillageState {
  const c = tileCenterWorld(landscape, at.x, at.y);
  const state = foundVillage({
    seed: 4242,
    day: DAY,
    dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
  });
  const first = state.people[0]!;
  const people: Person[] = [...state.people];
  for (let i = 0; i < extra; i++) people.push({ ...first, id: 100_000 + i });
  return { ...state, people, steward: newSteward(DAY, true) };
}

/** Plán po etapách v po sobě jdoucích dnech; `roundTrip` uloží a načte stav mezi etapami. */
function planOf(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  roundTrip = false,
  times: number[] = [],
): VillageState {
  let next = state;
  for (let k = 0; k < 20 && next.steward?.plan?.stage !== 'done'; k++) {
    const start = performance.now();
    next = planSettlement(next, DAY + k, landscape, obstacles);
    times.push(performance.now() - start);
    if (roundTrip) next = JSON.parse(JSON.stringify(next)) as VillageState;
  }
  return next;
}

function planned(state: VillageState): StewardPlan {
  const plan = state.steward?.plan;
  if (!plan) throw new Error('bez plánu');
  return plan;
}

// rovina s tůní u středu vsi; úzké údolí – potok v ose, louka ±10 políček, dál les do svahu
const pond = (x: number, y: number): boolean => Math.abs(x - 64) <= 1 && Math.abs(y - 61) <= 1;
const plain = makeLandscape({
  size: 128,
  surface: (x, y) => (pond(x, y) ? 'water' : 'meadow'),
  height: (x, y) => (pond(x, y) ? 0 : 5),
  fertility: () => 60,
});
const valley = makeLandscape({
  size: 128,
  surface: (_x, y) => (y === 64 ? 'water' : Math.abs(y - 64) <= 10 ? 'meadow' : 'forest'),
  height: (_x, y) => {
    const d = Math.abs(y - 64);
    return d === 0 ? 0 : d <= 10 ? 3 + d * 0.1 : 4 + (d - 10) * 2;
  },
  fertility: () => 60,
});

describe('plán sídla na syntetických krajinách', () => {
  it('na rovině s tůní vyjde shluk, v úzkém údolí řadová ves', () => {
    for (const extra of [0, 12]) {
      const flat = planned(
        planOf(village(plain, { x: 64, y: 64 }, extra), plain, obstaclesOf(plain)),
      );
      expect(flat.template).toBe('cluster');
      const narrow = planned(
        planOf(village(valley, { x: 64, y: 62 }, extra), valley, obstaclesOf(valley)),
      );
      expect(narrow.template).toBe('row');
      // řadová ves: domy u vody a rozložené podél potoka
      const xs = (narrow.slots.dwelling ?? []).map((i) => i % valley.size);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);
    }
  });

  it('hotový plán bez změn se nepřepočítá – vrací týž stav', () => {
    const state = planOf(village(plain, { x: 64, y: 64 }), plain, obstaclesOf(plain));
    expect(needsReplan(state, DAY + 30)).toBe(false);
    expect(planSettlement(state, DAY + 30, plain, obstaclesOf(plain))).toBe(state);
  });

  it('ves bez správce nebo bez obydlí nechá být', () => {
    const state = village(plain, { x: 64, y: 64 });
    const off = { ...state };
    delete off.steward;
    expect(planSettlement(off, DAY, plain, obstaclesOf(plain))).toBe(off);
    const empty = { ...state, dwellings: [], constructions: [] };
    expect(planSettlement(empty, DAY, plain, obstaclesOf(plain))).toBe(empty);
  });
});

describe('kdy se plán přepočítá', () => {
  const done = planOf(village(plain, { x: 64, y: 64 }), plain, obstaclesOf(plain));
  const withDwellings = (state: VillageState, ids: number[]): VillageState => ({
    ...state,
    dwellings: [...state.dwellings, ...ids.map((id) => ({ ...state.dwellings[0]!, id }))],
  });

  it('bez plánu ano, rozpracovaný ne', () => {
    expect(needsReplan(village(plain, { x: 64, y: 64 }), DAY)).toBe(true);
    const half = planSettlement(village(plain, { x: 64, y: 64 }), DAY, plain, obstaclesOf(plain));
    expect(planned(half).stage).not.toBe('done');
    expect(needsReplan(half, DAY + 1)).toBe(false);
  });

  it('po víc než replanChanges stavbách hráče, správcovy se nepočítají', () => {
    const ids = Array.from({ length: STEWARD.replanChanges + 1 }, (_, i) => 90_000 + i);
    expect(planStamp(withDwellings(done, ids))).toEqual(
      [...planStamp(done), ...ids].sort((a, b) => a - b),
    );
    expect(needsReplan(withDwellings(done, ids.slice(1)), DAY + 30)).toBe(false);
    expect(needsReplan(withDwellings(done, ids), DAY + 30)).toBe(true);
    const steward = { ...done.steward!, built: ids };
    expect(needsReplan({ ...withDwellings(done, ids), steward }, DAY + 30)).toBe(false);
  });

  it('nejdřív za replanYears let, nebo když došly sloty druhu', () => {
    expect(needsReplan(done, DAY + (STEWARD.replanYears - 1) * YEAR)).toBe(false);
    expect(needsReplan(done, DAY + (STEWARD.replanYears + 1) * YEAR)).toBe(true);
    const plan = { ...planned(done), exhausted: true as const };
    expect(needsReplan({ ...done, steward: { ...done.steward!, plan } }, DAY + 30)).toBe(true);
  });
});

describe('plán sídla na skutečné krajině', () => {
  const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
  const obstacles = obstaclesOf(landscape);
  const start = village(landscape, landscape.villageSite, 12);
  const times: number[] = [];
  const state = planOf(start, landscape, obstacles, false, times);
  const plan = planned(state);
  const tiles = (list: readonly number[]): { x: number; y: number }[] =>
    list.map((i) => ({ x: i % landscape.size, y: Math.floor(i / landscape.size) }));
  const houses = plan.farms.map((f) => f.house);

  it('etapa trvá nejvýš 200 ms (test s dvojnásobnou rezervou)', () => {
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (const t of times) expect(t).toBeLessThan(400);
  });

  it('je deterministický a po etapách s uložením stavu vyjde bit po bitu stejně', () => {
    const again = planOf(start, landscape, obstacles);
    expect(JSON.stringify(again.steward)).toBe(JSON.stringify(state.steward));
    const stored = planOf(start, landscape, obstacles, true);
    expect(JSON.stringify(stored.steward)).toBe(JSON.stringify(state.steward));
  });

  it('domy, pole a sloty mimo vodu, domy nad hladinou dvousetleté vody', () => {
    expect(plan.slots.dwelling?.length).toBeGreaterThan(0);
    const all = [...Object.values(plan.slots).flat(), ...plan.farms.flatMap((f) => f.cells)];
    for (const cell of tiles(all)) expect(surfaceAt(landscape, cell.x, cell.y)).not.toBe('water');
    const heights = streamHeights(landscape);
    for (const house of plan.slots.dwelling ?? []) {
      expect(heights[house]).toBeGreaterThanOrEqual(HOUSE_FLOOD_M);
    }
  });

  it('hřbitov ≥ 150 m od domů (i plánovaných) a ≥ 100 m od vody', () => {
    const cemetery = plan.slots.cemetery ?? [];
    expect(cemetery.length).toBeGreaterThan(0);
    for (const cell of tiles(cemetery)) {
      expect(waterDistanceM(landscape, cell)).toBeGreaterThanOrEqual(CEMETERY_DISTANCE_M.water.ok);
      const c = tileCenterWorld(landscape, cell.x, cell.y);
      for (const h of tiles(houses)) {
        const p = tileCenterWorld(landscape, h.x, h.y);
        const half = landscape.cellSizeM / 2;
        const dx = Math.max(0, Math.abs(p.x - c.x) - half);
        const dz = Math.max(0, Math.abs(p.z - c.z) - half);
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(CEMETERY_DISTANCE_M.dwelling.ok - 1e-9);
      }
    }
  });

  it('bloky polí se nepřekrývají a nejsou pod domy ani ostatními sloty', () => {
    const cells = plan.farms.flatMap((f) => f.cells);
    expect(new Set(cells).size).toBe(cells.length);
    const extras = new Set(Object.values(plan.slots).flat());
    for (const i of cells) expect(extras.has(i)).toBe(false);
    for (const h of houses) expect(cells.includes(h)).toBe(false);
  });
});
