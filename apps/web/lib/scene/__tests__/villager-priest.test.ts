import { defaultChurchDims } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneChurch } from '../../church-view';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneVillage } from '../../village-view';
import { churchDoorWorld } from '../church-site-layout';
import { createVillagerPose } from '../villager-motion';
import { planVillagersWithCrew, type VillagerGround } from '../villager-plan';
import { PRIEST_DOOR_M } from '../villager-plan-priest';
import { PRIEST_CLOTH } from '../villager-plan-types';

// Kněz před vchodem kostela (churches.md – Co kostel dává; villager-plan-priest.ts).

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

const PRIEST = 501;
const PEOPLE: RolePerson[] = [
  { id: 101, age: 35, sex: 'male', home: 1, spouse: 102 },
  { id: 102, age: 33, sex: 'female', home: 1, spouse: 101 },
  { id: 201, age: 30, sex: 'male', home: 2, spouse: 202 },
  { id: 202, age: 28, sex: 'female', home: 2, spouse: 201 },
  { id: 301, age: 40, sex: 'male', home: 3 },
  { id: PRIEST, age: 32, sex: 'male', home: 3 },
];

function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
    ...(p.id === PRIEST ? { priest: true as const } : {}),
  }));
}

// dost práce na poli i nečinných, ať by se kněz bez přednosti dostal na pole
const SHARES: LaborShare[] = [
  { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 6 },
  { activity: 'idle', target: { kind: 'village' }, manDays: 4 },
];

const square = (cx: number, cy: number) => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown' as const,
});

const church = (priestId?: number): SceneChurch => ({
  id: 8,
  type: 'rotunda',
  dims: defaultChurchDims('rotunda'),
  position: { x: 60, z: 40, rotation: 0 },
  progress: { foundation: 1, walls: 1, roof: 1, decor: 1 },
  decorated: true,
  built: true,
  priest: priestId !== undefined,
  ...(priestId !== undefined ? { priestId } : {}),
  graves: 0,
});

function village(priestId?: number): SceneVillage {
  return {
    dwellings: [house(1, 0, 0), house(2, 20, 0), house(3, -20, 0)],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    churches: [church(priestId)],
    labor: {
      day: 1000,
      month: 8,
      people: { children: 0, adults: 6, elders: 0 },
      shares: SHARES,
      homes: [1, 2, 3].map((id) => ({ id, people: 2 })),
      persons: persons(),
    },
  };
}

describe('kněz před vchodem kostela', () => {
  it('stojí před vchodem čelem ven, v kutně, s úlohou kněze a fázemi modlitby', () => {
    const plan = planVillagersWithCrew(village(PRIEST), GROUND, { seed: 3, herds: 0 });
    const mine = plan.people.filter((p) => p.person === PRIEST);
    expect(mine).toHaveLength(1);
    const priest = mine[0]!;
    expect(priest.key).toBe('priest:8');
    expect(priest.job).toEqual({ kind: 'priest', church: 8 });
    expect(priest.look.cloth).toEqual(PRIEST_CLOTH);
    const c = church(PRIEST);
    const door = churchDoorWorld(c.type, c.dims, c.position);
    const pose = createVillagerPose();
    priest.pose(0, [], pose);
    const want = { x: door.x + door.outX * PRIEST_DOOR_M, z: door.z + door.outZ * PRIEST_DOOR_M };
    expect(Math.hypot(pose.x - want.x, pose.z - want.z)).toBeLessThan(2.01);
    expect(pose.clip).toBe('idle');
    const task = plan.tasks.get(PRIEST);
    expect(task?.job.kind).toBe('priest');
    expect(task?.role).toBe('priest');
  });

  it('kostel bez kněze (na cestě) – žádná postava kněze, ostatní lidé nemají kutnu', () => {
    const plan = planVillagersWithCrew(village(), GROUND, { seed: 3, herds: 0 });
    expect(plan.people.some((p) => p.key.startsWith('priest:'))).toBe(false);
    expect(
      plan.people.filter((p) => p.person !== PRIEST).map((p) => p.look.cloth),
    ).not.toContainEqual(PRIEST_CLOTH);
  });
});
