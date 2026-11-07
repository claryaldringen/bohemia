import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import {
  MAP_HALF_M,
  inTornadoTrack,
  tornadoTrackHitsSquare,
  yearTornadoes,
} from '../disaster-schedule';
import { dayPartLosses } from '../disasters';
import { obstacleChangesAt, obstacleStatus } from '../obstacles';
import { TORNADO } from '../rules-disasters';
import { advanceVillage } from '../simulate';
import { tornadoDay } from '../tornado';
import type { TornadoPlan, TornadoStrength } from '../types-disasters';
import type { FarmSeason, FieldPart, Orchard, SeasonCrop, VillageState } from '../types';
import { logsFromClearedTrees, pileLogs } from '../wood';
import { withBuiltFirstDwelling } from './village-fixtures';

// Smršť (disasters.md – Smršť (tornádo)): četnost přes mapu a přes jádro vsi, tatáž stopa pro vsi
// téže mapy, škody podle síly, vývraty, sad a jabloně, ochrana nové vsi, ves bez počasí, dopočet
// po kouscích.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const FOUNDED = at(500, 9, 2);
const DAY = at(510, 7, 10);
/** Políčko krajiny (128 × 15 m) se středem v `z` = −960 + (y + 0,5) × 15 m; x = 7,5 m. */
const cellAtZ = (y: number): { x: number; y: number } => ({ x: 64, y });

function part(id: number, y: number): FieldPart {
  return {
    id,
    fieldId: id,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 50,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: cellAtZ(y),
  };
}

function crop(name: SeasonCrop['crop'], partIds: number[]): SeasonCrop {
  const tasks = { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
  return { crop: name, partIds, required: tasks, done: { ...tasks }, harvestedKg: null };
}

/**
 * Ves s polozemnicí ve středu (0, 0); díl 1 (z 7,5 m – v pásu podél osy x), díl 2 (z 172,5 m – mimo
 * úzké stopy F0–F2). Bez seedu počasí – smršť jen vynucená.
 */
function village(seed = 7, founded = FOUNDED): VillageState {
  const base = withBuiltFirstDwelling(
    foundVillage({ seed, day: founded, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  base.dwellings = base.dwellings.map((d) => ({
    ...d,
    type: 'polozemnice',
    position: { x: 0, z: 0, rotation: 0 },
    condition: 1,
  }));
  base.parts = [part(1, 64), part(2, 75)];
  base.season = { startDay: at(509, 9, 1), crops: [crop('spring', [1, 2])] } as FarmSeason;
  return base;
}

/** Vynucená smršť podél osy x; osa stopy `offsetM` od středu vsi (kolmo, k +z). */
function force(state: VillageState, day: number, strength: TornadoStrength, offsetM = 0): void {
  state.disasters = {
    ...state.disasters,
    override: { tornado: { [day]: { strength, angle: 0, offsetM } } },
  };
}

function tornadoEvents(
  s: VillageState,
  events = s.chronicle,
): Extract<VillageState['chronicle'][number], { kind: 'tornado' }>[] {
  return events.filter((e) => e.kind === 'tornado');
}

describe('stopy přes mapu', () => {
  it('přes mapu ≈ 0,10 % let (200 000 let – 200 map po 1000 letech), květen–srpen', () => {
    let years = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (let year = 500; year < 1500; year++) {
        const plans = yearTornadoes(seed, year);
        if (plans.length === 0) continue;
        years++;
        for (const p of plans) {
          const date = dateOfDayIndex(p.day);
          expect(date.year).toBe(year);
          expect(date.month).toBeGreaterThanOrEqual(5);
          expect(date.month).toBeLessThanOrEqual(8);
          expect(tornadoTrackHitsSquare(p.track, 0, 0, MAP_HALF_M)).toBe(true);
        }
      }
    }
    expect(years / 200_000).toBeGreaterThan(0.00085);
    expect(years / 200_000).toBeLessThan(0.00115);
  });

  it('přes jádro vsi (300 × 300 m) ≈ 0,017 % let (1 000 000 let)', () => {
    let hits = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      for (let year = 500; year < 1500; year++) {
        if (yearTornadoes(seed, year).some((p) => tornadoTrackHitsSquare(p.track, 0, 0, 150))) {
          hits++;
        }
      }
    }
    expect(hits / 1_000_000).toBeGreaterThan(0.00013);
    expect(hits / 1_000_000).toBeLessThan(0.00022);
  });

  it('pás stopy: bod podél osy uvnitř délky a šířky', () => {
    const track = { x: 0, z: 0, angle: Math.PI / 2, lengthM: 1000, widthM: 100 };
    expect(inTornadoTrack(track, 0, 499)).toBe(true);
    expect(inTornadoTrack(track, 49, 0)).toBe(true);
    expect(inTornadoTrack(track, 51, 0)).toBe(false);
    expect(inTornadoTrack(track, 0, 501)).toBe(false);
  });
});

/** První smršť mapy `weatherSeed` od roku 506 (ves založená 500 už není chráněná). */
function firstTornado(weatherSeed: number): TornadoPlan {
  for (let year = 506; year < 1500; year++) {
    const plan = yearTornadoes(weatherSeed, year)[0];
    if (plan) return plan;
  }
  throw new Error('mapa bez smrště');
}

/** Body na ose stopy uvnitř mapy (krok 10 m). */
function pointsOnTrack(plan: TornadoPlan): { x: number; z: number }[] {
  const { track } = plan;
  const points: { x: number; z: number }[] = [];
  for (let t = -track.lengthM / 2; t <= track.lengthM / 2; t += 10) {
    const x = track.x + Math.cos(track.angle) * t;
    const z = track.z + Math.sin(track.angle) * t;
    if (Math.abs(x) < MAP_HALF_M - 30 && Math.abs(z) < MAP_HALF_M - 30) points.push({ x, z });
  }
  return points;
}

/** Ves se seedem počasí mapy a obydlím v bodě `p`. */
function villageAt(seed: number, weatherSeed: number, p: { x: number; z: number }): VillageState {
  const s = village(seed);
  s.weatherSeed = weatherSeed;
  s.dwellings = s.dwellings.map((d) => ({ ...d, position: { x: p.x, z: p.z, rotation: 0 } }));
  return s;
}

describe('kraj a ochrana', () => {
  it('dvě vsi téže mapy vidí tutéž stopu', () => {
    const plan = firstTornado(4242);
    const points = pointsOnTrack(plan);
    expect(points.length).toBeGreaterThan(1);
    const a = villageAt(1, 4242, points[0]!);
    const b = villageAt(2, 4242, points[points.length - 1]!);
    expect(tornadoEvents(a, tornadoDay(a, plan.day, null, null))).toHaveLength(1);
    expect(tornadoEvents(b, tornadoDay(b, plan.day, null, null))).toHaveLength(1);
    expect(a.disasters?.tornado).toEqual(plan);
    expect(b.disasters?.tornado).toEqual(plan);
  });

  it('nová ves (5 let) nic, vynucená smršť ochranu přebije', () => {
    const plan = firstTornado(4242);
    const p = pointsOnTrack(plan)[0]!;
    const young = villageAt(1, 4242, p);
    young.foundedDay = plan.day - 3 * 365;
    expect(tornadoDay(young, plan.day, null, null)).toEqual([]);
    expect(young.dwellings[0]!.condition).toBe(1);
    force(young, plan.day, 'F1');
    expect(tornadoEvents(young, tornadoDay(young, plan.day, null, null))).toHaveLength(1);
    expect(young.dwellings[0]!.condition).toBeCloseTo(0.6);
  });

  it('ves bez seedu počasí: žádná smršť, stav beze změny', () => {
    const plan = firstTornado(4242);
    const s = villageAt(1, 4242, pointsOnTrack(plan)[0]!);
    delete s.weatherSeed;
    const before = structuredClone(s);
    const year = dateOfDayIndex(plan.day).year;
    for (let day = at(year, 5, 1); day <= at(year, 8, 31); day++) {
      expect(tornadoDay(s, day, null, null)).toEqual([]);
    }
    expect(s).toEqual(before);
  });
});

describe('škody podle síly', () => {
  it('F0 jen střechy: stavba −15 %, úroda v pásu −20 %, nikdo neumírá', () => {
    const s = village();
    force(s, DAY, 'F0');
    const people = s.people.length;
    const events = tornadoDay(s, DAY, null, null);
    const [event] = tornadoEvents(s, events);
    expect(event).toMatchObject({ strength: 'F0', partIds: [1], collapsedDwellingIds: [] });
    expect(s.dwellings[0]!.condition).toBeCloseTo(0.85);
    expect(s.people).toHaveLength(people);
    expect(s.disasters?.losses?.tornado?.['1']).toBeCloseTo(0.2);
    expect(dayPartLosses(s, DAY, 'spring', [1, 2], undefined)).toEqual({
      '1': { share: expect.closeTo(0.2) as number },
      '2': { share: 0 },
    });
  });

  it('F2: dům se zřítí, zemnice −40 %, stavba mimo pás nic, seno stohů zasažených obydlí', () => {
    const s = village();
    const home = s.dwellings[0]!;
    s.dwellings.push(
      { ...home, id: 900, type: 'zemnice', position: { x: 30, z: 0, rotation: 0 } },
      { ...home, id: 901, position: { x: 0, z: 300, rotation: 0 } },
    );
    s.hay = { kg: 3000, mowing: null };
    // střed vsi z = 100 – osa stopy o 100 m níž přes z = 0
    force(s, DAY, 'F2', -100);
    const [event] = tornadoEvents(s, tornadoDay(s, DAY, null, null));
    expect(event).toMatchObject({
      dwellingIds: [home.id, 900].sort((a, b) => a - b),
      collapsedDwellingIds: [home.id],
      lostHayKg: 2000,
    });
    expect(s.dwellings.find((d) => d.id === home.id)).toBeUndefined();
    expect(s.dwellings.find((d) => d.id === 900)!.condition).toBeCloseTo(0.6);
    expect(s.dwellings.find((d) => d.id === 901)!.condition).toBe(1);
    expect(s.ruins?.length ?? 0).toBeGreaterThan(0);
    expect(s.chronicle.some((e) => e.kind === 'death')).toBe(false);
  });

  it('F3 zabíjí ≈ 1 % obyvatel zasažených obydlí, F2 nikoho', () => {
    let deaths = 0;
    let people = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = village(seed);
      force(s, DAY, seed <= 20 ? 'F2' : 'F3');
      const before = s.people.length;
      const died = tornadoDay(s, DAY, null, null).filter(
        (e) => e.kind === 'death' && e.cause === 'tornado',
      ).length;
      expect(s.people.length).toBe(before - died);
      if (seed <= 20) {
        expect(died).toBe(0);
        continue;
      }
      deaths += died;
      people += before;
    }
    expect(people).toBeGreaterThan(1500);
    expect(deaths / people).toBeGreaterThan(0.003);
    expect(deaths / people).toBeLessThan(0.02);
  });

  it('vývraty: dospělé stromy v pásu a v dosahu vsi zmizí jako pokácené a dají klády', () => {
    const placements: ObstaclePlacement[] = [];
    let id = 1;
    const add = (kind: ObstaclePlacement['kind'], x: number, z: number): void => {
      placements.push({ id: id++, kind, look: 'oak-1', x, z, rotation: 0, scale: 1 });
    };
    for (let x = -500; x <= 500; x += 10) {
      add('tree', x, 3); // v pásu
      add('tree', x, 300); // mimo pás
    }
    add('shrub', 20, 0);
    add('tree', 800, 0); // v pásu, ale dál než dosah vsi
    const layer: ObstacleLayer = packObstacles(placements, 128, 15);
    const inTrack = placements.filter((p) => p.kind === 'tree' && p.z === 3).map((p) => p.id);
    const s = village();
    s.woodLogs = 0;
    force(s, DAY, 'F3');
    const [event] = tornadoEvents(s, tornadoDay(s, DAY, null, layer));
    expect(event!.uprootedTrees).toBe(inTrack.length);
    expect(s.felledTrees!.map((f) => f.id)).toEqual(inTrack);
    // kmeny leží na místě v hromadách u lesa, u vsi nic zdarma
    expect(s.woodLogs).toBeCloseTo(logsFromClearedTrees(inTrack.length));
    expect(pileLogs(s)).toBeCloseTo(0);
    expect(s.logStacks!.length).toBeGreaterThan(1);
    expect(s.logStacks!.every((st) => Math.abs(st.z - 3) < 1)).toBe(true);
    const status = obstacleStatus(obstacleChangesAt(s, DAY));
    const index = (oid: number): number => [...layer.id].indexOf(oid);
    expect(status.kindOf(layer, index(inTrack[0]!))).toBe('stump');
    // F1 vyvrátí ≈ 30 % (los po stromech)
    const weak = village();
    force(weak, DAY, 'F1');
    // F1 je užší (82 m) – stromy v z = 3 v pásu jsou
    const fallen = tornadoEvents(weak, tornadoDay(weak, DAY, null, layer))[0]!.uprootedTrees;
    expect(fallen / inTrack.length).toBeGreaterThan(0.18);
    expect(fallen / inTrack.length).toBeLessThan(0.42);
  });

  it('sad a jabloně u cest: vyvrácený čtverec jde do obnovy, jabloň se zasadí znovu', () => {
    const s = village();
    const square = (y: number): Orchard['squares'][number] => ({
      cell: cellAtZ(y),
      areaM2: 225,
      distanceM: 50,
      plantingCost: 20,
      plantingDone: 20,
      plantedDay: FOUNDED + 30,
    });
    s.orchards = [{ id: 77, squares: [square(64), square(80)] }];
    s.roads = {
      ...s.roads,
      apples: [{ id: 5000, roadId: 1, x: 100, z: 0, distanceM: 50, plantedDay: FOUNDED + 30 }],
    } as VillageState['roads'];
    force(s, DAY, 'F3');
    const [event] = tornadoEvents(s, tornadoDay(s, DAY, null, null));
    expect(event).toMatchObject({ orchardSquares: 1, roadApples: 1 });
    const [hit, kept] = s.orchards[0]!.squares;
    expect(hit!.plantedDay).toBeNull();
    expect(hit!.renewal).toBeDefined();
    expect(kept!.plantedDay).toBe(FOUNDED + 30);
    const renewal = s.constructions.find((c) => c.id === hit!.renewal);
    expect(renewal).toMatchObject({ kind: 'orchard', orchardId: 77, renewal: true });
    expect(s.roads!.apples![0]!.plantedDay).toBe(DAY);
  });
});

describe('determinismus', () => {
  it('po kouscích přes den vynucené smrště dopadne stejně; záznam platí do konce roku', () => {
    const make = (): VillageState => {
      const state = village();
      force(state, DAY, 'F3');
      state.lastDay = DAY - 10;
      return state;
    };
    const end = DAY + 10;
    const whole = advanceVillage(make(), end, null);
    let chunked = make();
    for (let day = chunked.lastDay; day < end;) {
      day = Math.min(end, day + 3);
      chunked = advanceVillage(chunked, day, null);
    }
    expect(tornadoEvents(whole)).toHaveLength(1);
    expect(tornadoEvents(chunked)).toEqual(tornadoEvents(whole));
    expect(chunked.disasters).toEqual(whole.disasters);
    expect(chunked.dwellings).toEqual(whole.dwellings);
    expect(chunked.people).toEqual(whole.people);
    expect(whole.disasters?.tornado?.day).toBe(DAY);
    tornadoDay(whole, at(511, 1, 1), null, null);
    expect(whole.disasters?.tornado).toBeUndefined();
  });

  it('pravidla: podíly sil dají 1', () => {
    expect(TORNADO.strengths.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1);
    expect(TORNADO.months.reduce((sum, m) => sum + m.share, 0)).toBeCloseTo(1);
  });
});
