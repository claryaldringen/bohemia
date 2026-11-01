import { describe, expect, it } from 'vitest';
import type { ScenePerson } from '../../person-view';
import type { SceneShoeing, SceneVillage } from '../../village-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { isAway, isTied, rideHorsePose, createRideState, ridingHorseIds } from '../riders';
import { SHOE_HORSE_S, shoeingSchedule, shoeingSpots, tiedSpans } from '../shoeing-plan';
import { createVillagerPose, type VillagerPose } from '../villager-motion';
import { planVillagersWithCrew, type PlannedVillager, type VillagerGround } from '../villager-plan';
import { SHOEING_KEY } from '../villager-plan-shoeing';
import type { LivestockPose } from '../livestock-motion';

// Kování koní ve scéně (horses.md – Kování, Ve scéně; Martin 27. 10. 2026: „Jen každý kovář musí
// fyzicky dojít do té ohrady a koně okovat“).

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 600 && Math.abs(z) < 600,
  tree: () => null,
  treesIn: () => [],
};

/** Den 1000 začíná v epoše postav (t = 0 s) a trvá 86,4 s – kování jde ve skutečném čase dál. */
const DAY = 1000;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + 86_400 };

const PEN = { x: -52.5, z: 22.5 };
/** Kraj mapy, odkud přichází cizí kovář (čára krajinou od vsi). */
const EDGE = { x: 480, z: 0 };

const house = (id: number, x: number, z: number, craft?: 'smith') => ({
  id,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  inhabited: true,
  ...(craft ? { craft } : {}),
});

const person = (id: number, home: number, sex: 'male' | 'female', role: string): ScenePerson => ({
  id,
  age: 35,
  sex,
  home,
  role: role as ScenePerson['role'],
});

function village(shoeing: SceneShoeing, smithy: boolean): SceneVillage {
  return {
    dwellings: [house(1, 0, 0), house(2, 14, 3), ...(smithy ? [house(31, 40, -20, 'smith')] : [])],
    fields: [],
    pens: [
      {
        id: 61,
        species: 'horse',
        cell: { x: -4, y: 1 },
        x: PEN.x,
        z: PEN.z,
        size: 15,
        built: true,
        progress: 1,
        oxen: 0,
        trainees: 0,
        cows: 0,
        horses: [
          { id: 3, kind: 'riding' },
          { id: 4, kind: 'riding' },
        ],
      },
    ],
    labor: {
      day: DAY,
      month: 6,
      people: { children: 0, adults: 6, elders: 0 },
      shares: [
        { activity: 'horse-shoeing', target: { kind: 'pen', id: 61 }, manDays: 1 },
        { activity: 'domestic', target: { kind: 'village' }, manDays: 2 },
      ],
      persons: [
        person(10, 1, 'male', 'farmer'),
        person(11, 1, 'female', 'farmer-wife'),
        person(12, 2, 'male', 'farmer'),
        person(13, 2, 'female', 'farmer-wife'),
        ...(smithy ? [person(30, 31, 'male', 'smith')] : []),
      ],
      shoeing,
    },
  };
}

const HORSES = [
  { pen: 61, id: 3 },
  { pen: 61, id: 4 },
];

function plan(v: SceneVillage, nowMs?: number): ReturnType<typeof planVillagersWithCrew> {
  return planVillagersWithCrew(v, GROUND, {
    seed: 3,
    herds: 0,
    dayWindow: () => window,
    ...(nowMs !== undefined ? { nowMs } : {}),
  });
}

/** První okamžik (s od začátku dne kování), kdy kovář kuje. */
function firstBuild(smith: PlannedVillager): number {
  for (let t = 0; t < 3600; t += 0.5) if (at(smith, t).clip === 'build') return t;
  return Infinity;
}

const at = (p: PlannedVillager, t: number): VillagerPose => p.pose(t, [], createVillagerPose());
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('rozvrh kování', () => {
  it('ve skutečném čase: běžnou chůzí ke koním, každý kůň SHOE_HORSE_S, zpět chůzí', () => {
    const s = shoeingSchedule(100, 2, 1000, 1.2);
    expect(s.departMs).toBe(1000);
    expect(s.arriveMs).toBeCloseTo(1000 + (100 / 1.2) * 1000, 6);
    expect(s.doneMs - s.arriveMs).toBeCloseTo(2 * SHOE_HORSE_S * 1000, 6);
    expect(s.backMs - s.doneMs).toBeCloseTo(s.arriveMs - s.departMs, 6);
    expect(s.speed).toBe(1.2);
    const spans = tiedSpans(s, 2);
    expect(spans[0]![0]).toBe(s.arriveMs);
    expect(spans[0]![1]).toBeCloseTo(s.arriveMs + SHOE_HORSE_S * 1000, 6);
    expect(spans[1]![0]).toBe(spans[0]![1]);
    expect(spans[1]![1]).toBeCloseTo(s.doneMs, 6);
  });

  it('kůň stojí u kůlu vně branky, kovář u něj čelem k ohradě', () => {
    const gate = { x: 0, z: 0, outX: 0, outZ: 1 };
    const { hitch, smith } = shoeingSpots(gate);
    expect(hitch.z).toBeGreaterThan(0.5);
    expect(smith.z).toBeGreaterThan(hitch.z);
    expect(smith.headingZ).toBe(-1);
    expect(dist(hitch, smith)).toBeLessThan(1.5);
  });
});

describe('kovář v den kování (villager-plan-shoeing.ts)', () => {
  it('vlastní kovář je člověk z kovárny, jde od kovárny k ohradě, kuje a vrací se', () => {
    const { people, crew } = plan(village({ day: DAY, own: true, horses: HORSES }, true));
    const smiths = people.filter((p) => p.key === SHOEING_KEY.own);
    expect(smiths).toHaveLength(1);
    const smith = smiths[0]!;
    expect(smith.person).toBe(30);
    expect(smith.kind).toBe('man');
    // podíl kování už postavu u plotu nemá
    expect(people.some((p) => p.key.startsWith('horse-shoeing:'))).toBe(false);
    // před dnem kování v kovárně (není vidět), cestou chůzí, u ohrady kuje, pak zase v kovárně
    expect(at(smith, -1).hidden).toBe(true);
    const before = at(smith, 2);
    expect(before.hidden).toBe(false);
    expect(before.clip).toBe('walk');
    expect(before.pace).toBe(1);
    expect(before.stage).toBe('out');
    expect(dist(before, { x: 40, z: -20 })).toBeLessThan(dist({ x: 40, z: -20 }, PEN));
    const build = firstBuild(smith);
    // ≈ 100 m chůzí – víc než jeden herní den by trvala jen delší cesta
    expect(build).toBeGreaterThan(60);
    expect(build).toBeLessThan(200);
    const shoeing = at(smith, build + SHOE_HORSE_S / 2);
    expect(shoeing.clip).toBe('build');
    expect(dist(shoeing, PEN)).toBeLessThan(15);
    expect(at(smith, build + 2 * SHOE_HORSE_S + 5).stage).toBe('back');
    expect(at(smith, build * 2 + 2 * SHOE_HORSE_S + 5).hidden).toBe(true);
    const rides = crew.rides ?? [];
    expect(rides.map((r) => r.horseId)).toEqual([3, 4]);
  });

  it('koně stojí u kůlu jeden po druhém, jinak jsou v ohradě', () => {
    const v = village({ day: DAY, own: true, horses: HORSES }, true);
    const { people, crew } = plan(v);
    const build = firstBuild(people.find((p) => p.key === SHOEING_KEY.own)!);
    const [first, second] = crew.rides!;
    const t1 = build + SHOE_HORSE_S / 2;
    const t2 = build + SHOE_HORSE_S * 1.5;
    expect(isTied(first!, t1)).toBe(true);
    expect(isTied(second!, t1)).toBe(false);
    expect(isTied(second!, t2)).toBe(true);
    expect(isAway(first!, 1)).toBe(false);
    expect([...ridingHorseIds(crew.rides!, LIVESTOCK_EPOCH_MS + t1 * 1000)]).toEqual([3]);
    const pose: LivestockPose = {
      x: 0,
      z: 0,
      forwardX: 0,
      forwardZ: 1,
      head: 0,
      stride: 0,
    } as LivestockPose;
    rideHorsePose(first!, t1, createRideState(), pose);
    expect(dist(pose, PEN)).toBeLessThan(15);
    expect(pose.stride).toBe(0);
  });

  it('cizí kovář je cizí postava, přichází z kraje mapy chůzí a odchází tam', () => {
    const line = [{ x: 0, z: 0 }, EDGE];
    const { people, crew } = plan(village({ day: DAY, own: false, horses: HORSES, line }, false));
    const smith = people.find((p) => p.key === SHOEING_KEY.foreign)!;
    expect(smith).toBeDefined();
    expect(smith.person).toBeUndefined();
    expect(crew.rides).toHaveLength(2);
    // na začátku cesty u kraje mapy, u ohrady kuje, na konci zase u kraje
    const start = at(smith, 0.01);
    expect(start.hidden).toBe(false);
    expect(start.pace).toBe(1);
    expect(dist(start, EDGE)).toBeLessThan(10);
    const build = firstBuild(smith);
    // přes půl mapy (≈ 540 m) chůzí – několik herních dní
    expect(build).toBeGreaterThan(400);
    expect(dist(at(smith, build + 10), PEN)).toBeLessThan(15);
    // kovář napřed koně přivede (stojí 15 % času koně), pak kuje
    const end = (build - 0.15 * SHOE_HORSE_S) * 2 + 2 * SHOE_HORSE_S;
    expect(dist(at(smith, end - 0.5), EDGE)).toBeLessThan(10);
    expect(at(smith, end - 0.5).stage).toBe('back');
    expect(at(smith, end + 0.5).hidden).toBe(true);
    expect(at(smith, -0.5).hidden).toBe(true);
  });

  it('po návratu kováře ho plán nemá (kování skončilo ve skutečném čase)', () => {
    const v = village({ day: DAY, own: true, horses: HORSES }, true);
    const during = plan(v, LIVESTOCK_EPOCH_MS + 60_000).people;
    expect(during.some((p) => p.key === SHOEING_KEY.own)).toBe(true);
    const after = plan(v, LIVESTOCK_EPOCH_MS + 3_600_000).people;
    expect(after.some((p) => p.key === SHOEING_KEY.own)).toBe(false);
  });

  it('bez kování nikdo nekuje u brány, plán je deterministický', () => {
    const v = village({ day: DAY, own: true, horses: HORSES }, true);
    const labor = { ...v.labor! };
    delete labor.shoeing;
    const none = plan({ ...v, labor });
    expect(none.people.some((p) => p.key.startsWith('shoeing:'))).toBe(false);
    expect(none.crew.rides ?? []).toHaveLength(0);
    const a = plan(v).people.find((p) => p.key === SHOEING_KEY.own)!;
    const b = plan(v).people.find((p) => p.key === SHOEING_KEY.own)!;
    for (const t of [1, 30, 90, 200, 300, 450]) {
      expect(at(a, t)).toEqual(at(b, t));
    }
  });
});
