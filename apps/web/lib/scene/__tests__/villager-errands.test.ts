import { describe, expect, it } from 'vitest';
import {
  createVillagerPose,
  route,
  shuttle,
  shuttleCycle,
  stand,
  type Route,
  type ShuttleOptions,
  type VillagerPose,
} from '../villager-motion';
import { carryErrands } from '../villager-errands';
import { errandPath, groveSpots, WOOD_GROVE } from '../villager-plan-traffic';
import type { Context, PlannedVillager, VillagerPaths } from '../villager-plan-types';

// trasa k vodě 100 m, chůze 1 m/s: tam 0–100 s, nabírá 100–105, zpět 105–205, doma 205–211
const WATER = route([
  [0, 0],
  [100, 0],
]);
const OTHER = route([
  [0, 0],
  [0, 60],
]);

function options(phase: number): ShuttleOptions {
  return {
    outClip: 'carry-water',
    outSpeed: 1,
    endClip: 'water-idle',
    endS: 5,
    backClip: 'carry-water',
    backSpeed: 1,
    restClip: 'idle',
    restS: 6,
    restHidden: true,
    phase,
  };
}

function walker(key: string, person: number, r: Route, phase = 0, sig = key): PlannedVillager {
  const o = options(phase);
  return {
    key,
    kind: 'woman',
    scale: 1,
    phase: 0,
    look: { cloth: [1, 1, 1], hair: 'natural' },
    pose: shuttle(r, o),
    person,
    job: { kind: 'traffic', traffic: 'water' },
    errand: { ...shuttleCycle(r, o), sig },
  };
}

function worker(key: string, person: number, x: number, z: number): PlannedVillager {
  return {
    key,
    kind: 'woman',
    scale: 1,
    phase: 0,
    look: { cloth: [1, 1, 1], hair: 'natural' },
    pose: stand(x, z, 0, 1, 'idle'),
    person,
    job: { kind: 'elder' },
  };
}

function poseOf(p: PlannedVillager, t: number): VillagerPose {
  const out = createVillagerPose();
  out.hidden = false;
  return p.pose(t, [], out);
}

function shown(people: readonly PlannedVillager[], t: number, person: number): VillagerPose[] {
  return people
    .filter((p) => p.person === person)
    .map((p) => poseOf(p, t))
    .filter((pose) => !pose.hidden);
}

describe('pochůzka se dokončí (villagers.md – Pochůzka se dokončí)', () => {
  it('žena v půli cesty s vodou při změně plánu dojde domů a zmizí až u vchodu', () => {
    const before = [walker('w:0', 1, WATER)];
    // v čase 150 s nese vodu zpět, je 55 m od domu; nový plán ji nemá (proud klesl)
    expect(poseOf(before[0]!, 150).x).toBeCloseTo(55, 5);
    const people = carryErrands(before, [], 150);
    const at = (t: number): VillagerPose[] => shown(people, t, 1);
    expect(at(150)[0]?.x).toBeCloseTo(55, 5);
    expect(at(150)[0]?.stage).toBe('back');
    expect(at(200)[0]?.x).toBeCloseTo(5, 5);
    // těsně před vchodem ještě vidět, ve dveřích zmizí a už nevyjde
    expect(at(204.9)[0]?.x).toBeLessThan(0.2);
    expect(at(205.1)).toHaveLength(0);
    for (let t = 205.1; t < 900; t += 7) expect(at(t)).toHaveLength(0);
  });

  it('mrtvý nebo odstěhovaný člověk pochůzku nedokončí – zmizí hned a nezůstane vybratelný', () => {
    const before = [walker('w:0', 1, WATER), walker('w:1', 2, WATER, 0.3)];
    const people = carryErrands(before, [], 150, new Set([2]));
    expect(people.some((p) => p.person === 1)).toBe(false);
    expect(shown(people, 150, 1)).toHaveLength(0);
    expect(shown(people, 150, 2)).toHaveLength(1);
  });

  it('zbořený dům: živý člověk dojde k místu, kde dveře stály, a tam zmizí', () => {
    const before = [walker('w:0', 1, WATER)];
    // nový plán dům (a tedy postavu) nemá, člověk ale žije
    const people = carryErrands(before, [], 150, new Set([1]));
    expect(shown(people, 204.9, 1)[0]?.x).toBeLessThan(0.2);
    expect(shown(people, 205.1, 1)).toHaveLength(0);
  });

  it('stejný plán pokračuje plynule – nic nezmizí ani neskočí', () => {
    const before = [walker('w:0', 1, WATER)];
    const people = carryErrands(before, [walker('w:0', 1, WATER)], 150);
    expect(people).toHaveLength(1);
    for (let t = 150; t < 700; t += 3) {
      expect(poseOf(people[0]!, t)).toEqual(poseOf(before[0]!, t));
    }
  });

  it('nový člověk v proudu vyjde z domu, ne uprostřed cesty', () => {
    const before = [walker('w:0', 1, WATER)];
    // fáze 0,5 – podle rozběhnutého proudu by teď byla 44,5 m od domu
    const added = walker('w:1', 2, WATER, 0.5);
    expect(poseOf(added, 150).hidden).toBeFalsy();
    const people = carryErrands(before, [walker('w:0', 1, WATER), added], 150);
    const at = (t: number): VillagerPose[] => shown(people, t, 2);
    for (let t = 150; t < 316.4; t += 2) expect(at(t)).toHaveLength(0);
    // vyjde ve dveřích, až na ni podle fáze přijde řada
    const out = at(317)[0];
    expect(out?.x).toBeLessThan(1);
    expect(out?.stage).toBe('out');
  });

  it('první zobrazení ukáže proud rozběhnutý', () => {
    const people = carryErrands([], [walker('w:0', 1, WATER, 0.5)], 150);
    expect(shown(people, 150, 1)).toHaveLength(1);
  });

  it('nikdo dvakrát – kdo dokončuje cestu, se jinde ukáže až po návratu', () => {
    const before = [walker('w:0', 1, WATER), walker('w:1', 2, WATER, 0.3)];
    // nový den: postavu w:0 dostal člověk 3, člověk 1 jde jinou trasou (w:5) a člověk 2 stojí
    // u domu (jiná práce); trasa w:1 je teď jiná
    const next = [
      walker('w:0', 3, WATER),
      walker('w:5', 1, OTHER, 0.9),
      worker('elder:2', 2, 20, 20),
      walker('w:1', 4, OTHER, 0.3, 'jiná trasa'),
    ];
    const people = carryErrands(before, next, 150);
    for (let t = 150; t < 1200; t += 0.5) {
      for (const person of [1, 2, 3, 4]) expect(shown(people, t, person).length).toBeLessThan(2);
    }
    // člověk 1 dojde domů v 205 s, na novou trasu vyjde až s dalším cyklem (ne dřív)
    expect(shown(people, 204, 1)[0]?.x).toBeGreaterThan(0);
    expect(shown(people, 206, 1)).toHaveLength(0);
    // člověk 2 (v čase 150 s 2,3 m od domu na cestě k vodě – posun fáze 63,3 s) cestu dojde
    // (doma v 150 + 205 − 2,3 = 352,7 s) a pak od dveří dojde ke své nové práci u domu
    expect(shown(people, 352.2, 2)[0]?.stage).toBe('back');
    expect(shown(people, 352.2, 2)[0]?.x).toBeLessThan(1);
    expect(shown(people, 412, 2)[0]).toMatchObject({ x: 20, z: 20 });
    // člověk 3 v postavě w:0 vyjde až s dalším cyklem (fáze 0 – v 211 s)
    expect(shown(people, 210, 3)).toHaveLength(0);
    expect(shown(people, 212, 3)[0]?.x).toBeLessThan(2);
  });
});

describe('pro dřevo k větší skupince stromů nebo k okraji lesa', () => {
  const lone = [{ x: 20, z: 0 }];
  const pair = [
    { x: 0, z: 30 },
    { x: 3, z: 31 },
  ];
  const grove = Array.from({ length: 8 }, (_, i) => ({ x: -80 - (i % 3) * 4, z: (i - 4) * 3 }));
  const forest = Array.from({ length: 300 }, (_, i) => ({
    x: 150 + (i % 10) * 5,
    z: (Math.floor(i / 10) - 15) * 5,
  }));
  const trees = [...lone, ...pair, ...grove, ...forest];

  it('osamělý strom ani dvojice nejsou skupinka – nejbližší je háj, pak les', () => {
    const spots = groveSpots(trees, { x: 0, z: 0 });
    expect(WOOD_GROVE.trees).toBeGreaterThan(2);
    expect(spots[0]!.x).toBeLessThanOrEqual(-80);
    expect(spots.some((s) => s.x > -50 && s.x < 100)).toBe(false);
    expect(spots.some((s) => s.x >= 150)).toBe(true);
  });

  it('trasa pro dřevo vede k háji a postava se zastaví na jeho kraji', () => {
    const paths: VillagerPaths = {
      route: (a, b) => ({
        points: [
          [a.x, a.z],
          [b.x, b.z],
        ],
        pace: [1],
      }),
      // konec pěšiny pro dřevo z jádra – okraj lesa
      errand: () => ({ x: 148, z: 0 }),
    };
    const ctx = {
      houses: [],
      homes: [{ id: 1, box: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } }],
      center: { x: 0, z: 0 },
      graves: [],
      paths,
      ground: {
        walkable: () => true,
        tree: () => null,
        treesIn: (x: number, z: number, half: number, max: number) =>
          trees.filter((t) => Math.abs(t.x - x) <= half && Math.abs(t.z - z) <= half).slice(0, max),
      },
    } as unknown as Context;
    const home = { id: 1, x: 0, z: 0 } as unknown as Parameters<typeof errandPath>[1];
    const path = errandPath(ctx, home, { x: 0, z: 0 }, 'wood');
    const end = path!.points[path!.points.length - 1]!;
    // na kraji háje (stromy od x = −80), ne u osamělého stromu ani u vzdálenějšího lesa
    expect(end[0]).toBeLessThan(-74);
    expect(end[0]).toBeGreaterThan(-82);
    expect(path!.length).toBeLessThan(90);
  });

  it('skupinky stromů se při stejné značce stromů nepočítají znovu', () => {
    let calls = 0;
    const make = (token?: object): Context =>
      ({
        houses: [],
        homes: [{ id: 1, box: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } }],
        center: { x: 0, z: 0 },
        graves: [],
        paths: {
          route: (a: { x: number; z: number }, b: { x: number; z: number }) => ({
            points: [
              [a.x, a.z],
              [b.x, b.z],
            ],
            pace: [1],
          }),
          errand: () => ({ x: 148, z: 0 }),
        },
        ground: {
          walkable: () => true,
          tree: () => null,
          treesToken: token,
          treesIn: (x: number, z: number, half: number, max: number) => {
            calls++;
            return trees
              .filter((t) => Math.abs(t.x - x) <= half && Math.abs(t.z - z) <= half)
              .slice(0, max);
          },
        },
      }) as unknown as Context;
    const home = { id: 1, x: 0, z: 0 } as unknown as Parameters<typeof errandPath>[1];
    const token = {};
    errandPath(make(token), home, { x: 0, z: 0 }, 'wood');
    const first = calls;
    expect(first).toBeGreaterThan(0);
    // nový plán (nový kontext), stejná značka → žádné nové čtení stromů
    errandPath(make(token), home, { x: 0, z: 0 }, 'wood');
    expect(calls).toBe(first);
    // změna stromů (nová značka) → počítá se znovu
    errandPath(make({}), home, { x: 0, z: 0 }, 'wood');
    expect(calls).toBeGreaterThan(first);
  });
});
