import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneVillage } from '../../village-view';
import { createVillagerPose } from '../villager-motion';
import { planVillagersWithCrew } from '../villager-plan';
import { withNewSites } from '../villager-plan-sites';
import { activityStage, GRID_S } from '../villager-schedule';
import { Timetable } from '../villager-timetable';
import type { VillagerGround } from '../villager-plan-types';

// D68 (Martin 15. 11. 2026): „Dal jsem postavit hrnčířskou dílnu, ale tihle dva místo aby se
// okamžitě rozešli směrem ke staveništi, dál odpočívají.“ – jádro dá stavbě práci až od dalšího
// dne; scéna na ni pošle hned dnešní volnou práci mužů a stavitelé se vydají z místa, kde jsou.

const DAY = 1000;
const T0 = 100_000;

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

/** Hrnčířská dílna založená dnes uprostřed dne (staveniště, 60 m od domů). */
const SITE = {
  id: 90,
  type: 'srub' as const,
  position: { x: 0, z: -60, rotation: 0 },
  built: false,
  progress: 0,
  inhabited: false,
  since: DAY,
  craft: 'potter' as const,
};

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

const IDLE: LaborShare = { activity: 'idle', target: { kind: 'village' }, manDays: 10 };

/** Ves dne `DAY`: rozdělení práce z jádra je spočítané před založením stavby (jen nečinní). */
function village(site: boolean, menBuild: number | null = 4): SceneVillage {
  return {
    dwellings: [
      house(1, 0, 0),
      house(2, 20, 0),
      house(3, -20, 0),
      house(4, 40, 0),
      house(5, -40, 0),
      ...(site ? [SITE] : []),
    ],
    fields: [],
    labor: {
      day: DAY,
      month: 5,
      people: { children: 0, adults: PEOPLE.length, elders: 0 },
      shares: [IDLE],
      ...(menBuild !== null ? { menBuild } : {}),
      herders: { children: 0 },
      homes: [1, 2, 3, 4, 5].map((id) => ({ id, people: 2 })),
      persons: persons(),
    },
  } as SceneVillage;
}

const plan = (v: SceneVillage): ReturnType<typeof planVillagersWithCrew> =>
  planVillagersWithCrew(v, GROUND, { seed: 7, herds: 0 });

const isBuild = (key: string | undefined): boolean => key?.startsWith('build:site-90:') ?? false;

describe('stavba založená dnes – podíl práce scény (withNewSites)', () => {
  it('díl mužů na stavby jde z nečinných na novou stavbu, před nečinné', () => {
    const labor = village(true).labor!;
    const { shares, fresh } = withNewSites(labor, village(true).dwellings);
    expect(shares.map((s) => s.activity)).toEqual(['build', 'idle']);
    expect(shares[0]).toMatchObject({
      target: { kind: 'site', id: 90 },
      manDays: 4,
      construction: 90,
    });
    expect(shares[1]!.manDays).toBe(6);
    expect(fresh.has(shares[0]!)).toBe(true);
  });

  it('nejvýš nečinné; bez dílu mužů, se starší stavbou nebo s podílem z jádra beze změny', () => {
    const labor = village(true, 25).labor!;
    expect(withNewSites(labor, [SITE]).shares.map((s) => s.manDays)).toEqual([10, 0]);
    const none = (l: typeof labor, d: (typeof SITE)[]): number => withNewSites(l, d).fresh.size;
    expect(none(village(true, null).labor!, [SITE])).toBe(0);
    expect(none(labor, [{ ...SITE, since: DAY - 3 }])).toBe(0);
    const shared = {
      ...labor,
      shares: [
        {
          activity: 'build' as const,
          target: { kind: 'site' as const, id: 90 },
          manDays: 4,
          construction: 90,
        },
        IDLE,
      ],
    };
    expect(none(shared, [SITE])).toBe(0);
  });
});

describe('plán dne postav – přidaná stavba uprostřed dne (D68)', () => {
  it('nečinní muži staví hned a drží úlohu; ženy zůstanou nečinné', () => {
    const { tasks } = plan(village(true));
    const sex = new Map(PEOPLE.map((p) => [p.id, p.sex]));
    const builders = [...tasks].filter(([, t]) => isBuild(t.key));
    expect(builders.length).toBe(4);
    for (const [id, t] of builders) {
      expect(sex.get(id)).toBe('male');
      expect(t).toMatchObject({ kind: 'hold', interrupt: 'all' });
    }
    const idle = [...tasks].filter(([, t]) => t.key.startsWith('idle:'));
    expect(idle.length).toBeGreaterThan(0);
    for (const [, t] of idle) expect(t.interrupt).toBeUndefined();
    // bez nové stavby nikdo nestaví
    expect([...plan(village(false)).tasks.values()].some((t) => isBuild(t.key))).toBe(false);
  });

  it('stavitelé zbytku dne jdou ke staveništi z místa, kde jsou; ostatní pokračují', () => {
    const before = plan(village(false));
    const after = plan(village(true));
    const tt = new Timetable(7, 1.25);
    tt.setDoors(new Map(PEOPLE.map((p) => [p.id, before.doors.get(p.home) ?? null])));
    tt.setEstimate(before.length);
    tt.setDay(DAY, T0, before.tasks);
    const builder = [...after.tasks].find(([id, t]) => isBuild(t.key) && before.tasks.get(id))!;
    const id = builder[0];
    // okamžik, kdy stavitel ještě nečinně stojí u domu (práce na místě, ne cesta)
    let mid = T0 + 600;
    while (!(
      tt.activity(id, mid).kind === 'bout' && activityStage(tt.activity(id, mid), mid) === 'work'
    ))
      mid += 7;
    const woman = PEOPLE.find((p) => p.sex === 'female' && tt.activity(p.id, mid).kind !== 'home');
    const herBout = woman ? tt.activity(woman.id, mid) : null;
    const out = createVillagerPose();
    const was = { ...tt.pose(id, mid - 0.1, [], out) };
    // pohled vsi přinese stavbu uprostřed dne – obsazení platí od `mid`
    tt.setDay(DAY, T0, after.tasks, mid);
    const now = { ...tt.pose(id, mid + 0.1, [], out) };
    expect(Math.hypot(now.x - was.x, now.z - was.z)).toBeLessThan(0.5);
    const act = tt.activity(id, mid + 0.1);
    expect(act).toMatchObject({ kind: 'hold', start: mid, end: Infinity });
    expect(act.task?.key).toBe(builder[1].key);
    expect(Math.hypot(act.from!.x - was.x, act.from!.z - was.z)).toBeLessThan(0.5);
    // u staveniště (ne doma) – v dosahu stavby
    const there = tt.pose(id, act.arrive + 1, [], out);
    expect(Math.hypot(there.x - SITE.position.x, there.z - SITE.position.z)).toBeLessThan(15);
    // žena bez práce na stavbě v činnosti pokračuje
    if (woman && herBout) expect(tt.activity(woman.id, mid + 0.1)).toEqual(herBout);
    // stavbu hráč týž den zruší – stavitel od ní hned odejde domů
    const cancel = act.arrive + 30;
    tt.setDay(DAY, T0, before.tasks, cancel);
    const left = tt.activity(id, cancel - 1);
    expect(left.kind).toBe('hold');
    expect(left.leave).toBeGreaterThanOrEqual(cancel);
    expect(left.leave).toBeLessThan(cancel + GRID_S);
  });
});
