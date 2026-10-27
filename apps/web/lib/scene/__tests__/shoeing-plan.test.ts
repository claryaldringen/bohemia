import { describe, expect, it } from 'vitest';
import type { ScenePerson } from '../../person-view';
import type { SceneShoeing, SceneVillage } from '../../village-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { isAway, isTied, rideHorsePose, createRideState, ridingHorseIds } from '../riders';
import {
  SHOE_HORSE_H,
  SHOE_NOON_H,
  SHOEING_TRIP_H,
  shoeingSchedule,
  shoeingSpots,
  shoeingWalked,
  tiedHours,
} from '../shoeing-plan';
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

/** Den 1000 začíná v epoše postav a trvá 86,4 s – hodina = 3,6 s. */
const DAY = 1000;
const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + 86_400 };
const hour = (h: number): number => h * 3.6;

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

function plan(v: SceneVillage): ReturnType<typeof planVillagersWithCrew> {
  return planVillagersWithCrew(v, GROUND, { seed: 3, herds: 0, dayWindow: () => window });
}

const at = (p: PlannedVillager, t: number): VillagerPose => p.pose(t, [], createVillagerPose());
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('rozvrh kování', () => {
  it('kuje se kolem poledne, na koně 1,5 h; krátká cesta běžnou chůzí, dlouhá časosběrem', () => {
    const near = shoeingSchedule(15, 2, true, 3.6, 1.2);
    expect(near.arrive).toBeCloseTo(SHOE_NOON_H - SHOE_HORSE_H, 9);
    expect(near.done).toBeCloseTo(SHOE_NOON_H + SHOE_HORSE_H, 9);
    expect(near.pace).toBe(1);
    expect(near.depart).toBeCloseTo(near.arrive - 15 / 1.2 / 3.6, 9);
    const far = shoeingSchedule(700, 2, false, 3.6, 1.2);
    expect(far.depart).toBe(SHOEING_TRIP_H.foreign[0]);
    expect(far.back).toBeCloseTo(SHOEING_TRIP_H.foreign[1], 9);
    expect(far.pace).toBeGreaterThan(1);
    // u ohrady mírnější časosběr, daleko rychleji – celá cesta se vejde přesně do výpravy
    expect(far.nearM).toBeGreaterThan(0);
    expect(far.nearSpeed).toBeLessThan(far.speed);
    const legS = (far.arrive - far.depart) * 3.6;
    expect(shoeingWalked(far, 700, legS).d).toBeCloseTo(700, 6);
    expect(shoeingWalked(far, 700, legS - 0.1).pace).toBe(far.nearPace);
    expect(tiedHours(near, 2)).toEqual([
      [near.arrive, SHOE_NOON_H],
      [SHOE_NOON_H, near.done],
    ]);
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
    const { people, crew } = plan(village({ own: true, horses: HORSES }, true));
    const smiths = people.filter((p) => p.key === SHOEING_KEY.own);
    expect(smiths).toHaveLength(1);
    const smith = smiths[0]!;
    expect(smith.person).toBe(30);
    expect(smith.kind).toBe('man');
    // podíl kování už postavu u plotu nemá
    expect(people.some((p) => p.key.startsWith('horse-shoeing:'))).toBe(false);
    // ráno v kovárně (není vidět), v poledne u ohrady kuje, večer zase v kovárně
    expect(at(smith, hour(4.5)).hidden).toBe(true);
    const noon = at(smith, hour(SHOE_NOON_H - 0.5));
    expect(noon.hidden).toBe(false);
    expect(noon.clip).toBe('build');
    expect(dist(noon, PEN)).toBeLessThan(15);
    expect(at(smith, hour(20)).hidden).toBe(true);
    // cestou – mezi kovárnou a ohradou, chůze
    const rides = crew.rides ?? [];
    expect(rides.map((r) => r.horseId)).toEqual([3, 4]);
    const before = at(smith, hour(SHOE_NOON_H - SHOE_HORSE_H) - 1);
    expect(before.clip).toBe('walk');
    expect(before.stage).toBe('out');
    expect(dist(before, { x: 40, z: -20 })).toBeLessThan(dist({ x: 40, z: -20 }, PEN));
  });

  it('koně stojí u kůlu jeden po druhém, jinak jsou v ohradě', () => {
    const { crew } = plan(village({ own: true, horses: HORSES }, true));
    const [first, second] = crew.rides!;
    const t1 = hour(SHOE_NOON_H - 0.5);
    const t2 = hour(SHOE_NOON_H + 0.5);
    expect(isTied(first!, t1)).toBe(true);
    expect(isTied(second!, t1)).toBe(false);
    expect(isTied(second!, t2)).toBe(true);
    expect(isAway(first!, hour(8))).toBe(false);
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

  it('cizí kovář je cizí postava, přichází z kraje mapy a odchází tam', () => {
    const line = [{ x: 0, z: 0 }, EDGE];
    const { people, crew } = plan(village({ own: false, horses: HORSES, line }, false));
    const smith = people.find((p) => p.key === SHOEING_KEY.foreign)!;
    expect(smith).toBeDefined();
    expect(smith.person).toBeUndefined();
    expect(crew.rides).toHaveLength(2);
    const [from, to] = SHOEING_TRIP_H.foreign;
    // na začátku cesty u kraje mapy, v poledne u ohrady, na konci zase u kraje
    const start = at(smith, hour(from) + 0.01);
    expect(start.hidden).toBe(false);
    expect(dist(start, EDGE)).toBeLessThan(10);
    expect(dist(at(smith, hour(SHOE_NOON_H)), PEN)).toBeLessThan(15);
    const end = at(smith, hour(to) - 0.01);
    expect(dist(end, EDGE)).toBeLessThan(10);
    expect(end.stage).toBe('back');
    expect(at(smith, hour(to) + 0.5).hidden).toBe(true);
    expect(at(smith, hour(from) - 0.5).hidden).toBe(true);
  });

  it('bez kování dne nikdo nekuje u brány, plán je deterministický', () => {
    const v = village({ own: true, horses: HORSES }, true);
    const labor = { ...v.labor! };
    delete labor.shoeing;
    const none = plan({ ...v, labor });
    expect(none.people.some((p) => p.key.startsWith('shoeing:'))).toBe(false);
    expect(none.crew.rides ?? []).toHaveLength(0);
    const a = plan(v).people.find((p) => p.key === SHOEING_KEY.own)!;
    const b = plan(v).people.find((p) => p.key === SHOEING_KEY.own)!;
    for (const h of [6, 9, 10.7, 12, 13.4, 16]) {
      expect(at(a, hour(h))).toEqual(at(b, hour(h)));
    }
  });
});
