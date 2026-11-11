import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  surfaceAt,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { applyBuildIntent } from '../../buildings/build-intent';
import { streamHeights } from '../../disasters/part-protection';
import { waterDistanceM } from '../../placement/placement-squares';
import { ROTATION_FACTOR } from '../../fields/field-capacity';
import { NO_CRAFTS } from '../../core/productivity';
import { CEMETERY_DISTANCE_M } from '../../rules/rules-people';
import { STEWARD } from '../../rules/rules-steward';
import { newSteward } from '../steward-state';
import { fieldTiles, HOUSE_FLOOD_M } from '../steward-land';
import {
  cellRuns,
  checkPlanSlot,
  farmCells,
  needsReplan,
  planSettlement,
  planStamp,
  STEWARD_PLAN_VERSION,
} from '../steward-plan';
import { stewardOutlook } from '../steward-outlook';
import type { Person, StewardFarm, StewardPlan, StewardSlotKind, VillageState } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

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
      // bloky podle práce bez stropu podle jídla jsou větší (6. 11. 2026): řidší šablona smí
      // vyhrát, když ušetří víc než `templateMargin`
      expect(['cluster', 'scattered']).toContain(flat.template);
      if (extra === 0) expect(flat.template).toBe('cluster');
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

  it('nejdřív za replanYears let, nebo když došly sloty druhu – ne dřív než za exhaustedReplanDays', () => {
    expect(needsReplan(done, DAY + (STEWARD.replanYears - 1) * YEAR)).toBe(false);
    expect(needsReplan(done, DAY + (STEWARD.replanYears + 1) * YEAR)).toBe(true);
    const plan = { ...planned(done), exhausted: true as const };
    const exhausted = { ...done, steward: { ...done.steward!, plan } };
    const doneDay = plan.doneDay!;
    expect(needsReplan(exhausted, doneDay + STEWARD.exhaustedReplanDays - 1)).toBe(false);
    expect(needsReplan(exhausted, doneDay + STEWARD.exhaustedReplanDays)).toBe(true);
  });

  it('přepočet se počítá vedle platného plánu – správce má dál sloty, hotový ho nahradí', () => {
    const day = DAY + (STEWARD.replanYears + 1) * YEAR;
    const old = planned(done);
    const run = (roundTrip: boolean): VillageState => {
      let s = done;
      for (let k = 0; k < 20; k++) {
        s = planSettlement(s, day + k, plain, obstaclesOf(plain));
        if (roundTrip) s = JSON.parse(JSON.stringify(s)) as VillageState;
        if (!s.steward?.nextPlan) break;
        // rozpracovaný přepočet: platný plán beze změny, se sloty hřbitova i domů
        expect(planned(s)).toEqual(old);
        expect(s.steward.nextPlan.stage).not.toBe('done');
        expect(planned(s).slots.cemetery?.length).toBeGreaterThan(0);
        expect(planned(s).slots.dwelling?.length).toBeGreaterThan(0);
        expect(needsReplan(s, day + k + 1)).toBe(false);
      }
      return s;
    };
    const after = run(false);
    expect(after.steward?.nextPlan).toBeUndefined();
    expect(planned(after).startDay).toBe(day);
    expect(planned(after).stage).toBe('done');
    expect(JSON.stringify(run(true).steward)).toBe(JSON.stringify(after.steward));
  });

  it('plán starého tvaru (bloky jako seznam políček) se zahodí a počítá znovu', () => {
    const plan = planned(done);
    const oldFarms = plan.farms.map((f) => ({ house: f.house, cells: farmCells(f, plain.size) }));
    const oldPlan = { ...plan, farms: oldFarms as unknown as StewardFarm[] };
    const old = { ...done, steward: { ...done.steward!, plan: oldPlan } };
    expect(needsReplan(old, DAY + 30)).toBe(true);
    const again = planSettlement(old, DAY + 30, plain, obstaclesOf(plain));
    expect(planned(again).stage).toBe('checks');
    expect(planned(again).startDay).toBe(DAY + 30);
    for (const f of planned(again).farms) expect(Array.isArray(f.runs)).toBe(true);
    expect(again.steward?.nextPlan).toBeUndefined();
  });
});

describe('pole blízko a podle práce (verze pravidel rozvrhu)', () => {
  const done = planOf(village(plain, { x: 64, y: 64 }), plain, obstaclesOf(plain));

  it('nový plán nese verzi pravidel; hotový plán starší verze se přepočítá vedle platného', () => {
    expect(planned(done).version).toBe(STEWARD_PLAN_VERSION);
    const oldPlan = { ...planned(done) };
    delete oldPlan.version;
    const old = { ...done, steward: { ...done.steward!, plan: oldPlan } };
    expect(needsReplan(old, DAY + 30)).toBe(true);
    const run = (roundTrip: boolean): VillageState => {
      let s: VillageState = old;
      for (let k = 0; k < 20; k++) {
        s = planSettlement(s, DAY + 30 + k, plain, obstaclesOf(plain));
        if (roundTrip) s = JSON.parse(JSON.stringify(s)) as VillageState;
        // starý plán platí, dokud nový není hotový
        if (s.steward?.nextPlan) expect(planned(s)).toEqual(oldPlan);
        else break;
      }
      return s;
    };
    const after = run(false);
    expect(planned(after).version).toBe(STEWARD_PLAN_VERSION);
    expect(planned(after).startDay).toBe(DAY + 30);
    expect(needsReplan(after, DAY + 60)).toBe(false);
    // po kouscích s uložením stavu vyjde bit po bitu stejně; převod je jednorázový
    expect(JSON.stringify(run(true).steward)).toBe(JSON.stringify(after.steward));
    expect(planSettlement(after, DAY + 60, plain, obstaclesOf(plain))).toBe(after);
  });

  it('rozpracovaný přepočet starší verze se zahodí a začne znovu', () => {
    const day = DAY + (STEWARD.replanYears + 1) * YEAR;
    const started = planSettlement(done, day, plain, obstaclesOf(plain));
    const stale = { ...started.steward!.nextPlan! };
    delete stale.version;
    const s = { ...started, steward: { ...started.steward!, nextPlan: stale } };
    expect(needsReplan(s, day + 1)).toBe(true);
    const next = planSettlement(s, day + 1, plain, obstaclesOf(plain));
    expect(next.steward?.nextPlan?.version).toBe(STEWARD_PLAN_VERSION);
    expect(next.steward?.nextPlan?.startDay).toBe(day + 1);
  });

  it('blok domácnosti nepřesáhne, co domácnost oseje – ves s dětmi má menší blok', () => {
    const ha = (plain.cellSizeM * plain.cellSizeM) / 10_000;
    const adults = village(plain, { x: 64, y: 64 }, 12);
    const first = adults.people[0]!;
    const kids: Person[] = adults.people.map((p, k) =>
      k < 5 ? p : { ...first, id: p.id, bornDay: DAY - 3 * YEAR },
    );
    const withKids = { ...adults, people: kids };
    const big = planned(planOf(adults, plain, obstaclesOf(plain)));
    const small = planned(planOf(withKids, plain, obstaclesOf(plain)));
    const laborHa = stewardOutlook(withKids, DAY, NO_CRAFTS).laborHa;
    const sownPerPerson = laborHa / withKids.people.length;
    const laborCells = Math.ceil(
      (STEWARD.householdPeople * sownPerPerson * ROTATION_FACTOR * STEWARD.blockReserve) / ha,
    );
    expect(small.blockCells).toBeLessThanOrEqual(laborCells);
    expect(small.blockCells).toBeLessThan(big.blockCells);
  });
});

describe('bloky, náhrada domu a stojící pole', () => {
  it('běhy políček – seřazené, bez opakování, rozbalí se od nejbližšího k domu', () => {
    expect(cellRuns([5, 3, 4, 10, 11, 4])).toEqual([3, 3, 10, 2]);
    const size = 10;
    const farm: StewardFarm = { house: 55, runs: cellRuns([57, 54, 45, 66, 75]) };
    expect(farmCells(farm, size)).toEqual([45, 54, 66, 57, 75]);
  });

  it('dům, kam kontrola nepustí, nahradí místo kolem a jeho dvůr vypadne z bloků', () => {
    const start = planSettlement(
      withBuiltFirstDwelling(village(plain, { x: 64, y: 64 })),
      DAY,
      plain,
      obstaclesOf(plain),
    );
    const first = planned(start).slots.dwelling![0]!;
    // mezi etapami hráč postavil na plánovaném místě humno
    const c = tileCenterWorld(plain, first % plain.size, Math.floor(first / plain.size));
    const floor = applyBuildIntent(start, DAY, plain, obstaclesOf(plain), {
      kind: 'threshing-floor',
      position: { x: c.x, z: c.z, rotation: 0 },
    });
    if (!floor.ok) throw new Error(floor.reason);
    const blocked = floor.state;
    expect(checkPlanSlot(blocked, DAY + 1, plain, obstaclesOf(plain), 'dwelling', first)).toBe(
      false,
    );
    const plan = planned(planOf(blocked, plain, obstaclesOf(plain)));
    const houses = plan.slots.dwelling ?? [];
    expect(houses).not.toContain(first);
    const moved = houses[0]!;
    const dx = (moved % plain.size) - (first % plain.size);
    const dy = Math.floor(moved / plain.size) - Math.floor(first / plain.size);
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(3);
    for (const h of houses) {
      expect(checkPlanSlot(blocked, plan.doneDay!, plain, obstaclesOf(plain), 'dwelling', h)).toBe(
        true,
      );
    }
    const farm = plan.farms.find((f) => f.house === moved)!;
    expect(farm).toBeDefined();
    const mx = moved % plain.size;
    const my = Math.floor(moved / plain.size);
    for (const f of plan.farms) {
      for (const i of farmCells(f, plain.size)) {
        const near =
          Math.abs((i % plain.size) - mx) <= 1 && Math.abs(Math.floor(i / plain.size) - my) <= 1;
        expect(near).toBe(false);
      }
    }
  });

  it('stojící dům s poli si blok nerezervuje znovu celý', () => {
    const base = village(plain, { x: 64, y: 64 });
    const cells: { x: number; y: number }[] = [];
    for (let y = 63; y <= 66; y++) for (let x = 67; x <= 72; x++) cells.push({ x, y });
    const built = applyBuildIntent(base, DAY, plain, obstaclesOf(plain), { kind: 'field', cells });
    if (!built.ok) throw new Error(built.reason);
    const owned = fieldTiles(built.state, DAY, plain).length;
    expect(owned).toBe(cells.length);
    const existing = (s: VillageState): number => {
      const plan = planned(planSettlement(s, DAY, plain, obstaclesOf(plain)));
      return farmCells(
        plan.farms.find((f) => f.dwellingId !== undefined)!,
        plain.size,
      ).length;
    };
    const plan = planned(planSettlement(base, DAY, plain, obstaclesOf(plain)));
    expect(existing(base)).toBe(plan.blockCells);
    expect(existing(built.state)).toBe(plan.blockCells - owned);
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
    const all = [
      ...Object.values(plan.slots).flat(),
      ...plan.farms.flatMap((f) => farmCells(f, landscape.size)),
    ];
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

  it('sloty všech druhů prošly kontrolou umístění jako u hráče', () => {
    const kinds: StewardSlotKind[] = [
      'dwelling',
      'cemetery',
      'threshing-floor',
      'workshop',
      'orchard',
      'pen',
    ];
    for (const kind of kinds) {
      const slots = plan.slots[kind] ?? [];
      expect(slots.length).toBeGreaterThan(0);
      for (const t of slots) {
        expect(checkPlanSlot(state, plan.doneDay!, landscape, obstacles, kind, t)).toBe(true);
      }
    }
    expect(plan.candidates).toBeUndefined();
  });

  it('plán je malý – nejvýš ≈ 1 kB na domácnost', () => {
    // bloky podle práce bez stropu podle jídla (6. 11. 2026) jsou větší, běhů je víc
    expect(JSON.stringify(plan).length).toBeLessThanOrEqual(1500 * plan.households);
  });

  it('bloky polí se nepřekrývají a nejsou pod domy ani ostatními sloty', () => {
    const cells = plan.farms.flatMap((f) => farmCells(f, landscape.size));
    expect(new Set(cells).size).toBe(cells.length);
    const extras = new Set(Object.values(plan.slots).flat());
    for (const i of cells) expect(extras.has(i)).toBe(false);
    for (const h of houses) expect(cells.includes(h)).toBe(false);
  });
});
