import { describe, expect, it } from 'vitest';
import type { LaborShare, SceneVillage } from '../../village-view';
import { DWELLING_GARDEN_M } from '@bohemia/game';
import { chickenBox } from '../livestock-placement';
import { localToWorld } from '../village-layout';
import { createVillagerPose, type HerdView, type VillagerPose } from '../villager-motion';
import {
  MAX_ELDERS,
  MAX_WORKERS,
  crewSplit,
  elderCount,
  figureCounts,
  shareCounts,
  planVillagers,
  walkRoute,
  type PlannedVillager,
  type VillagerGround,
} from '../villager-plan';

/** Potok v pásu z ∈ (60, 70) – jinak všude suchá schůdná louka; strom 501 a 502 v lese. */
const GROUND: VillagerGround = {
  walkable: (x, z) => !(z > 60 && z < 70) && Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: (id) => (id === 501 ? { x: -40, z: -30 } : id === 502 ? { x: -44, z: -33 } : null),
  treesIn: () => [],
};

const square = (cx: number, cy: number, stage: 'sown' | 'founding' | 'ready' = 'sown') => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage,
});

const house = (
  id: number,
  x: number,
  z: number,
  rotation = 0,
  built = true,
  type: 'zemnice' | 'polozemnice' = 'zemnice',
) => ({
  id,
  type,
  position: { x, z, rotation },
  built,
  progress: built ? 1 : 0.6,
  inhabited: built,
});

function village(
  shares: LaborShare[],
  month = 7,
  people = { children: 4, adults: 6, elders: 2 },
): SceneVillage {
  return {
    dwellings: [
      house(1, 0, 0),
      house(2, 14, 3, 0.5),
      house(3, -12, 6, Math.PI),
      house(90, 0, 30, 0, false),
    ],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    cemeteries: [
      {
        id: 8,
        squares: [{ cell: { x: -3, y: -3 }, x: -37.5, z: -37.5, size: 15 }],
        built: true,
        progress: 1,
        graves: 10,
      },
    ],
    labor: { day: 1000, month, people, shares },
  };
}

const SHARES: LaborShare[] = [
  { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 3 },
  { activity: 'carry', target: { kind: 'field', id: 7 }, manDays: 2 },
  { activity: 'build', target: { kind: 'site', id: 90 }, manDays: 1.5 },
  { activity: 'fell', target: { kind: 'trees', ids: [501, 502] }, manDays: 2 },
  { activity: 'domestic', target: { kind: 'village' }, manDays: 4 },
  { activity: 'thresh', target: { kind: 'village' }, manDays: 0.2 },
  { activity: 'idle', target: { kind: 'village' }, manDays: 1 },
];

const HERDS: HerdView[] = [
  { x: 120, z: 120, radiusM: 6, moving: 0, headingX: 1, headingZ: 0 },
  { x: -150, z: 100, radiusM: 6, moving: 1, headingX: 0, headingZ: 1 },
];

/** Póza postavy v čase t (s). */
const at = (person: PlannedVillager, t: number): VillagerPose =>
  person.pose(t, HERDS, createVillagerPose());

/** Bod v obdélníku domu se šíjí (jako slepice – livestock-placement.chickenBox). */
function inHouse(v: SceneVillage, x: number, z: number): boolean {
  return v.dwellings.some((d) => {
    if (!d.built) return false;
    const box = chickenBox(d.type);
    const c = Math.cos(d.position.rotation);
    const s = Math.sin(d.position.rotation);
    const lx = (x - d.position.x) * c - (z - d.position.z) * s;
    const lz = (x - d.position.x) * s + (z - d.position.z) * c;
    const garden = DWELLING_GARDEN_M[d.type];
    const inGarden =
      garden !== undefined &&
      lx > garden.minX &&
      lx < garden.maxX &&
      lz > garden.minZ &&
      lz < garden.maxZ;
    return inGarden || (Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ);
  });
}

describe('figureCounts – člověkodny na postavy', () => {
  it('celkem zaokrouhlený součet, rozdělený největšími zbytky', () => {
    const counts = figureCounts(
      [
        { activity: 'harvest', manDays: 2.6 },
        { activity: 'carry', manDays: 1.7 },
        { activity: 'build', manDays: 0.7 },
      ],
      7,
    );
    expect(counts).toEqual([2, 2, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('domácí práce a nečinní jsou venku jen z části – v zimě méně', () => {
    const shares = [
      { activity: 'domestic' as const, manDays: 4 },
      { activity: 'idle' as const, manDays: 2 },
      { activity: 'thresh' as const, manDays: 2 },
    ];
    expect(figureCounts(shares, 7)).toEqual([2, 2, 2]);
    const winter = figureCounts(shares, 1);
    expect(winter[2]).toBe(2);
    expect(winter[0]! + winter[1]!).toBeLessThan(3);
  });

  it('nejvýš MAX_WORKERS – velká ves se zmenší poměrně', () => {
    const counts = figureCounts(
      [
        { activity: 'harvest', manDays: 90 },
        { activity: 'carry', manDays: 60 },
      ],
      8,
    );
    expect(counts).toEqual([36, 24]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(MAX_WORKERS);
  });

  it('bez práce nikdo', () => {
    expect(figureCounts([], 5)).toEqual([]);
    expect(figureCounts([{ activity: 'dig', manDays: 0.2 }], 5)).toEqual([0]);
  });

  it('lidé pracují pohromadě – po skupinách až čtyř tam, kde je práce nejvíc', () => {
    expect(crewSplit([0.1, 0.1, 0.3, 0.1], 5, 4)).toEqual([1, 0, 4, 0]);
    expect(crewSplit([1, 1], 8, 4)).toEqual([4, 4]);
    expect(crewSplit([1, 2], 0, 4)).toEqual([0, 0]);
    // žeň na 30 malých polích: 3 žnečky na jednom poli, ne každá na jiném
    const fields: LaborShare[] = Array.from({ length: 30 }, (_, i) => ({
      activity: 'harvest',
      target: { kind: 'field', id: i },
      manDays: 0.1 + (i === 7 ? 0.01 : 0),
    }));
    const counts = shareCounts(fields, 7);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts[7]).toBe(3);
  });

  it('starší: na dva jedna postava, nejvýš MAX_ELDERS, v zimě polovina', () => {
    expect(elderCount(0, false)).toBe(0);
    expect(elderCount(3, false)).toBe(2);
    expect(elderCount(40, false)).toBe(MAX_ELDERS);
    expect(elderCount(40, true)).toBe(MAX_ELDERS / 2);
  });
});

describe('planVillagers – kdo kde je', () => {
  const v = village(SHARES);
  const people = planVillagers(v, GROUND, { seed: 3, herds: 2 });
  const keys = people.map((p) => p.key);
  const of = (prefix: string): PlannedVillager[] => people.filter((p) => p.key.startsWith(prefix));

  it('postavy podle práce dne + starší u domů + pasáček u každého stáda', () => {
    expect(of('harvest:').length).toBe(3);
    expect(of('carry:').length).toBe(2);
    expect(of('domestic:').length).toBe(2); // v létě venku polovina
    expect(of('elder:').length).toBe(1);
    expect(of('herder:').length).toBe(2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('je deterministický – stejná ves, stejný čas = stejní lidé na stejných místech', () => {
    const again = planVillagers(v, GROUND, { seed: 3, herds: 2 });
    expect(again.map((p) => p.key)).toEqual(keys);
    for (let i = 0; i < people.length; i++) {
      expect(at(again[i]!, 12345.6)).toEqual(at(people[i]!, 12345.6));
      expect(again[i]!.look).toEqual(people[i]!.look);
    }
  });

  it('žnou na osévaných čtvercích pole', () => {
    for (const p of of('harvest:')) {
      for (const t of [0, 7, 33, 120]) {
        const pose = at(p, t);
        const on = v.fields[0]!.parts.some(
          (s) => Math.abs(pose.x - s.x) <= s.size / 2 && Math.abs(pose.z - s.z) <= s.size / 2,
        );
        expect(on).toBe(true);
        expect(['reap', 'walk']).toContain(pose.clip);
      }
    }
  });

  it('nikdo nestojí ve vodě, v domě ani na hrobech – ani při chůzi', () => {
    for (const p of people.filter((x) => !x.key.startsWith('herder:'))) {
      for (let t = 0; t < 300; t += 1.7) {
        const { x, z } = at(p, t);
        expect(GROUND.walkable(x, z), `${p.key} ve vodě v ${t}`).toBe(true);
        expect(inHouse(v, x, z), `${p.key} v domě v ${t}`).toBe(false);
        expect(Math.abs(x + 37.5) < 7.3 && Math.abs(z + 37.5) < 7.3, `${p.key} na hrobě`).toBe(
          false,
        );
      }
    }
  });

  it('nosiči chodí mezi obydlím a polem – s nůší zpět', () => {
    const carrier = of('carry:')[0]!;
    const clips = new Set<string>();
    for (let t = 0; t < 200; t += 0.5) clips.add(at(carrier, t).clip);
    expect(clips).toContain('walk');
    expect(clips).toContain('carry');
  });

  it('dřevorubci u vyhrazených stromů čelem ke kmeni, stavitelé kolem staveniště', () => {
    for (const p of of('fell:')) {
      const pose = at(p, 10);
      const tree = [GROUND.tree(501)!, GROUND.tree(502)!].find(
        (t) => Math.hypot(t.x - pose.x, t.z - pose.z) < 2.5,
      );
      expect(tree).toBeDefined();
      if (pose.clip === 'fell') {
        expect(
          pose.headingX * (tree!.x - pose.x) + pose.headingZ * (tree!.z - pose.z),
        ).toBeGreaterThan(0);
      }
    }
    for (const p of of('build:')) {
      const pose = at(p, 10);
      expect(Math.hypot(pose.x - 0, pose.z - 30)).toBeLessThan(10);
      expect(pose.clip).toBe('build');
    }
  });

  it('pasáček jde za svým stádem; vdané ženy mají šátek, starší šediny', () => {
    const herder = of('herder:')[0]!;
    const pose = at(herder, 50);
    expect(Math.hypot(pose.x - 120, pose.z - 120)).toBeLessThan(12);
    expect(herder.scale).toBeLessThan(0.8);
    expect(of('elder:').every((p) => p.look.hair === 'grey')).toBe(true);
    expect(
      people
        .filter((p) => p.kind === 'man')
        .every((p) => !['linen', 'madder'].includes(p.look.hair)),
    ).toBe(true);
  });

  it('bez rozdělení práce, bez obydlí nebo bez lidí (vymřelá ves) nikdo', () => {
    expect(planVillagers({ ...v, labor: undefined }, GROUND, { seed: 3, herds: 2 })).toEqual([]);
    expect(planVillagers({ ...v, dwellings: [] }, GROUND, { seed: 3, herds: 2 })).toEqual([]);
    const extinct = village([], 7, { children: 0, adults: 0, elders: 0 });
    expect(planVillagers(extinct, GROUND, { seed: 3, herds: 2 })).toEqual([]);
  });

  it('v zimě je venku méně lidí (domácí práce a nečinní uvnitř)', () => {
    const summer = planVillagers(village(SHARES, 7), GROUND, { seed: 3, herds: 0 });
    const winter = planVillagers(village(SHARES, 1), GROUND, { seed: 3, herds: 0 });
    const outside = (list: PlannedVillager[]): number =>
      list.filter((p) => /^(domestic|idle|elder):/.test(p.key)).length;
    expect(outside(winter)).toBeLessThan(outside(summer));
  });
});

describe('walkRoute – trasa kolem domů', () => {
  const houses = village([]).dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: d.built,
    progress: d.progress,
    inhabited: d.built,
    box: {
      minX: -chickenBox(d.type).halfX,
      maxX: chickenBox(d.type).halfX,
      minZ: chickenBox(d.type).minZ,
      maxZ: chickenBox(d.type).maxZ,
    },
  }));
  const ctx = { houses, ground: GROUND, graves: [] };

  it('obejde dům, který leží v cestě', () => {
    const [ax, az] = localToWorld(houses[0]!.position, 0, -12);
    const [bx, bz] = localToWorld(houses[0]!.position, 0, 14);
    const route = walkRoute(ctx, { x: ax, z: az }, { x: bx, z: bz })!;
    expect(route).not.toBeNull();
    expect(route.points.length).toBeGreaterThan(2);
    for (let d = 0; d <= route.length; d += 0.25) {
      const pose = createVillagerPose();
      let i = 1;
      while (i < route.points.length - 1 && route.at[i]! < d) i++;
      const [px, pz] = route.points[i - 1]!;
      const [qx, qz] = route.points[i]!;
      const u = Math.min(1, (d - route.at[i - 1]!) / (route.at[i]! - route.at[i - 1]!));
      pose.x = px + (qx - px) * u;
      pose.z = pz + (qz - pz) * u;
      expect(inHouse(village([]), pose.x, pose.z)).toBe(false);
    }
  });

  it('přes vodu cesta nevede', () => {
    expect(walkRoute(ctx, { x: 100, z: 50 }, { x: 100, z: 80 })).toBeNull();
  });
});
