import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneVillage } from '../../village-view';
import { createVillagerPose, type VillagerPose } from '../villager-motion';
import { planVillagersWithCrew } from '../villager-plan';
import { IDLE_LOG_CLEAR_M } from '../villager-plan-folk';
import type { PlannedVillager, VillagerGround } from '../villager-plan-types';

// D60 (Martin 15. 11. 2026): „u klád stojí 2 rolníci a nic nedělají… a jeden teď navíc jde domů“,
// „Proč jde tenhle rolník domů? Měl by stavět.“ – kdo dnes na stavbě pracuje, pracuje (nosí, tesá,
// staví) a drží úlohu u stavby; kdo práci na stavbě nemá, u klád nepostává.

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: () => null,
  treesIn: () => [],
};

const house = (id: number, x: number, z: number) => ({
  id,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built: true,
  progress: 1,
  inhabited: true,
});

/** Roubená dílna tesaře ve stavbě (nadzemní srub – bez jámy). */
const SRUB = {
  id: 90,
  type: 'srub' as const,
  position: { x: 0, z: -40, rotation: 0 },
  built: false,
  progress: 0.1,
  inhabited: false,
  craft: 'carpenter' as const,
};

/** Hromady klád: u stavby (25 m) a u každého domu na straně, kde by stála první dvojice nečinných. */
const STACKS = [
  { id: 1, x: 25, z: -40, logs: 40 },
  ...[-40, -20, 0, 20, 40].map((x, i) => ({ id: 10 + i, x: x + 4.6, z: 0.5, logs: 60 })),
];

const PEOPLE: RolePerson[] = [1, 2, 3, 4, 5].flatMap((home) => [
  { id: home * 100 + 1, age: 30, sex: 'male' as const, home, spouse: home * 100 + 2 },
  { id: home * 100 + 2, age: 28, sex: 'female' as const, home, spouse: home * 100 + 1 },
]);

function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
  }));
}

function village(shares: LaborShare[]): SceneVillage {
  return {
    dwellings: [
      house(1, 0, 0),
      house(2, 20, 0),
      house(3, -20, 0),
      house(4, 40, 0),
      house(5, -40, 0),
      SRUB,
    ],
    fields: [],
    logStacks: STACKS,
    labor: {
      day: 1000,
      month: 4,
      people: { children: 0, adults: PEOPLE.length, elders: 0 },
      shares,
      herders: { children: 0 },
      homes: [1, 2, 3, 4, 5].map((id) => ({ id, people: 2 })),
      persons: persons(),
    },
  } as SceneVillage;
}

const BUILD: LaborShare = {
  activity: 'build',
  target: { kind: 'site', id: 90 },
  manDays: 3,
  construction: 90,
};
const IDLE: LaborShare = { activity: 'idle', target: { kind: 'village' }, manDays: 6 };

const plan = (shares: LaborShare[]): ReturnType<typeof planVillagersWithCrew> =>
  planVillagersWithCrew(village(shares), GROUND, { seed: 7, herds: 0 });

/** Póza postavy v čase t (s). */
const poseAt = (p: PlannedVillager, t: number): VillagerPose => p.pose(t, [], createVillagerPose());

const nearStack = (pose: VillagerPose): boolean =>
  STACKS.some((s) => Math.hypot(s.x - pose.x, s.z - pose.z) < IDLE_LOG_CLEAR_M);

describe('stavitelé a nečinní u klád (D60)', () => {
  it('stavitelé srubu nekopou, ale staví, nosí klády z hromady a tesají – a drží úlohu', () => {
    const { people, tasks } = plan([BUILD, IDLE]);
    const builders = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'build');
    expect(builders.length).toBe(3);
    const clips = new Set<string>();
    for (const b of builders) for (let t = 0; t < 120; t += 0.5) clips.add(poseAt(b, t).clip);
    // srub nemá jámu – motyka ne; staví, nese kládu a tesá
    expect(clips.has('hoe')).toBe(false);
    expect(clips.has('build')).toBe(true);
    expect(clips.has('carry-wood')).toBe(true);
    expect(clips.has('split')).toBe(true);
    // nosič dojde až k hromadě u stavby
    const reached = builders.some((b) =>
      Array.from({ length: 240 }, (_, k) => poseAt(b, k * 0.5)).some(
        (pose) => Math.hypot(pose.x - STACKS[0]!.x, pose.z - STACKS[0]!.z) < 8,
      ),
    );
    expect(reached).toBe(true);
    // stavitelé mezi dávkami nechodí domů (Martin: „Měl by stavět.“)
    for (const b of builders) expect(tasks.get(b.person!)?.kind).toBe('hold');
  });

  it('bez práce na stavbách nikdo nepostává u klád – nečinní stojí u domu na straně bez hromady', () => {
    const { people } = plan([IDLE]);
    const idle = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'idle');
    expect(idle.length).toBeGreaterThan(0);
    for (const p of people) expect(nearStack(poseAt(p, 0)), p.key).toBe(false);
  });
});
