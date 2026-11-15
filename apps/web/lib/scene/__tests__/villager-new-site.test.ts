import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneLaborShare, SceneVillage } from '../../village-view';
import { createVillagerPose } from '../villager-motion';
import { planVillagersWithCrew } from '../villager-plan';
import { withNewSites } from '../villager-plan-sites';
import { activityStage, GRID_S } from '../villager-schedule';
import { Timetable } from '../villager-timetable';
import type { VillagerGround } from '../villager-plan-types';

// D68 (Martin 15. 11. 2026): „Dal jsem postavit hrnčířskou dílnu, ale tihle dva místo aby se
// okamžitě rozešli směrem ke staveništi, dál odpočívají.“ – jádro dá stavbě práci až od dalšího
// dne; scéna na ni pošle hned dnešní volnou práci mužů a stavitelé se vydají z místa, kde jsou.
// D71: totéž u ohrady, humna a dalších staveb – a založení ani zrušení stavby nikoho neodvolá od
// jiné práce (ke stavbě jdou jen nečinní muži, ostatní postavy i jejich klíče zůstanou).

const DAY = 1000;
const T0 = 100_000;
const HOMES = [1, 2, 3, 4, 5, 6, 7, 8];

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: () => null,
  treesIn: () => [],
};

const house = (id: number) => ({
  id,
  type: 'zemnice' as const,
  position: { x: (id - 4) * 20, z: 0, rotation: 0 },
  built: true,
  progress: 1,
  inhabited: true,
  // kovárna – kovář kuje koně (horses.md – Kování)
  ...(id === 5 ? { craft: 'smith' as const } : {}),
});

/** Hrnčířská dílna ve stavbě (staveniště, 60 m od domů). */
const SITE = {
  id: 90,
  type: 'srub' as const,
  position: { x: 0, z: -60, rotation: 0 },
  built: false,
  progress: 0,
  inhabited: false,
  craft: 'potter' as const,
};

/** Ohrada ve stavbě (60 m na sever od domů). */
const PEN = {
  id: 3,
  cell: { x: 0, y: 4 },
  x: 0,
  z: 60,
  size: 12,
  built: false,
  progress: 0,
  oxen: 0,
  trainees: 0,
  cows: 0,
};

/** Humno ve stavbě. */
const FLOOR = { id: 95, position: { x: 90, z: 50, rotation: 0 }, built: false, progress: 0 };

/** Místo první práce stavby založené dnes z jádra (`SceneLabor.starting`), 0 člověkodní. */
const start = (
  target: SceneLaborShare['target'],
  construction: number,
  activity: LaborShare['activity'] = 'build',
): SceneLaborShare => ({ activity, target, manDays: 0, construction });

const STARTS = {
  site: start({ kind: 'site', id: 90 }, 90),
  pen: start({ kind: 'pen', id: 3 }, 93, 'pen'),
  floor: start({ kind: 'site', id: 95 }, 95),
};

const PEOPLE: RolePerson[] = HOMES.flatMap((home) => [
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

const IDLE: SceneLaborShare = { activity: 'idle', target: { kind: 'village' }, manDays: 10 };

/**
 * Ves dne `DAY` se staveništěm, ohradou a humnem ve scéně: rozdělení práce z jádra je spočítané
 * před založením staveb (`shares`), `starting` = stavby založené dnes bez práce dne.
 */
function village(
  options: {
    shares?: SceneLaborShare[];
    starting?: SceneLaborShare[];
    menBuild?: number | null;
    site?: boolean;
  } = {},
): SceneVillage {
  const { shares = [IDLE], starting = [], menBuild = 4, site = true } = options;
  return {
    dwellings: [...HOMES.map(house), ...(site ? [SITE] : [])],
    fields: [],
    pens: [PEN],
    threshingFloors: [FLOOR],
    labor: {
      day: DAY,
      month: 5,
      people: { children: 0, adults: PEOPLE.length, elders: 0 },
      shares,
      ...(menBuild !== null ? { menBuild } : {}),
      ...(starting.length > 0 ? { starting } : {}),
      herders: { children: 0 },
      homes: HOMES.map((id) => ({ id, people: 2 })),
      persons: persons(),
    },
  } as SceneVillage;
}

const plan = (
  v: SceneVillage,
  cancelled?: ReadonlySet<number>,
): ReturnType<typeof planVillagersWithCrew> =>
  planVillagersWithCrew(v, GROUND, { seed: 7, herds: 0, ...(cancelled ? { cancelled } : {}) });

const MALE = new Set(PEOPLE.filter((p) => p.sex === 'male').map((p) => p.id));

/** Lidé s úlohou, jejíž klíč začíná `prefix`. */
const withKey = (tasks: ReturnType<typeof plan>['tasks'], prefix: string): number[] =>
  [...tasks].filter(([, t]) => t.key.startsWith(prefix)).map(([id]) => id);

describe('stavby založené dnes – podíl práce scény (withNewSites)', () => {
  it('díl mužů na stavby jde z nečinných na nové stavby stejným dílem, před nečinné', () => {
    const { shares, fresh } = withNewSites(village({ starting: [STARTS.site, STARTS.pen] }).labor!);
    expect(shares.map((s) => s.activity)).toEqual(['build', 'pen', 'idle']);
    expect(shares[0]).toMatchObject({
      target: { kind: 'site', id: 90 },
      manDays: 2,
      construction: 90,
    });
    expect(shares[1]).toMatchObject({ target: { kind: 'pen', id: 3 }, manDays: 2 });
    expect(shares[2]!.manDays).toBe(6);
    expect(fresh.size).toBe(2);
  });

  it('nejvýš nečinné; bez dílu mužů, bez nové stavby nebo bez nečinných beze změny', () => {
    const most = withNewSites(village({ starting: [STARTS.site], menBuild: 25 }).labor!);
    expect(most.shares.map((s) => s.manDays)).toEqual([10, 0]);
    const none = (v: SceneVillage): number => withNewSites(v.labor!).fresh.size;
    expect(none(village({ starting: [STARTS.site], menBuild: null }))).toBe(0);
    expect(none(village())).toBe(0);
    expect(none(village({ starting: [STARTS.site], shares: [] }))).toBe(0);
  });
});

describe('plán dne postav – stavba založená uprostřed dne (D68, D71)', () => {
  it.each([
    ['dílna', STARTS.site, 'build:site-90:'],
    ['ohrada', STARTS.pen, 'pen:pen-3:'],
    ['humno', STARTS.floor, 'build:site-95:'],
  ])('%s: nečinní muži hned staví, ostatní postavy beze změny', (_, share, prefix) => {
    const before = plan(village());
    const after = plan(village({ starting: [share] }));
    const builders = withKey(after.tasks, prefix);
    expect(builders.length).toBe(4);
    for (const id of builders) {
      expect(MALE.has(id)).toBe(true);
      // byl nečinný (nebo bez postavy doma) – přeruší, co dělá
      expect(before.tasks.get(id)?.key.startsWith('idle:') ?? true).toBe(true);
      expect(after.tasks.get(id)!.interrupt).toBe('all');
    }
    expect(builders.some((id) => after.tasks.get(id)!.kind === 'hold')).toBe(true);
    for (const [id, t] of before.tasks) {
      if (builders.includes(id)) continue;
      expect(after.tasks.get(id)?.key).toBe(t.key);
      expect(after.tasks.get(id)?.interrupt).toBeUndefined();
    }
    // bez nové stavby nikdo nestaví
    expect(withKey(before.tasks, prefix)).toEqual([]);
  });

  it('ves se dvěma stavbami: založení třetí neodvolá jejich stavitele ani kováře u kování', () => {
    const shares: SceneLaborShare[] = [
      { activity: 'horse-shoeing', target: { kind: 'village' }, manDays: 1 },
      { activity: 'build', target: { kind: 'site', id: 90 }, manDays: 2, construction: 90 },
      { activity: 'build', target: { kind: 'site', id: 95 }, manDays: 2, construction: 95 },
      { ...IDLE, manDays: 6 },
    ];
    const before = plan(village({ shares, menBuild: 8 }));
    const after = plan(village({ shares, menBuild: 8, starting: [STARTS.pen] }));
    expect(withKey(before.tasks, 'build:site-90:').length).toBeGreaterThan(0);
    expect(withKey(before.tasks, 'build:site-95:').length).toBeGreaterThan(0);
    expect(withKey(before.tasks, 'horse-shoeing:').length).toBe(1);
    // ke stavbě jdou jen muži, na které jiná práce nezbyla (osm mužů, šest jich pracuje)
    const builders = withKey(after.tasks, 'pen:pen-3:');
    expect(builders.length).toBe(2);
    for (const id of builders) {
      expect(MALE.has(id)).toBe(true);
      expect(before.tasks.get(id)?.key.startsWith('idle:') ?? true).toBe(true);
    }
    for (const [id, t] of before.tasks) {
      if (!builders.includes(id)) expect(after.tasks.get(id)?.key).toBe(t.key);
    }
  });

  it('zrušená stavba: její stavitelé zůstanou bez úlohy, ostatní beze změny', () => {
    const shares: SceneLaborShare[] = [
      { activity: 'build', target: { kind: 'site', id: 90 }, manDays: 2, construction: 90 },
      { activity: 'build', target: { kind: 'site', id: 95 }, manDays: 2, construction: 95 },
      { ...IDLE, manDays: 6 },
    ];
    const before = plan(village({ shares }));
    const gone = withKey(before.tasks, 'build:site-90:');
    expect(gone.length).toBeGreaterThan(0);
    expect(withKey(before.tasks, 'build:site-95:').length).toBeGreaterThan(0);
    const after = plan(village({ shares, site: false }), new Set([90]));
    for (const [id, t] of before.tasks) {
      if (gone.includes(id)) expect(after.tasks.get(id)).toBeUndefined();
      else expect(after.tasks.get(id)?.key).toBe(t.key);
    }
  });

  it.each([
    ['dílna', STARTS.site, SITE.position],
    ['ohrada', STARTS.pen, { x: PEN.x, z: PEN.z }],
  ])('%s: stavitelé jdou ke stavbě z místa, kde jsou; zrušená – hned odejdou', (_, share, at) => {
    const before = plan(village());
    const after = plan(village({ starting: [share] }));
    const tt = new Timetable(7, 1.25);
    tt.setDoors(new Map(PEOPLE.map((p) => [p.id, before.doors.get(p.home) ?? null])));
    tt.setEstimate(before.length);
    tt.setDay(DAY, T0, before.tasks);
    const builder = [...after.tasks].find(
      ([id, t]) => t.interrupt === 'all' && before.tasks.has(id),
    )!;
    const id = builder[0];
    // okamžik, kdy stavitel ještě nečinně stojí venku (práce na místě, ne cesta)
    let mid = T0 + 600;
    for (let n = 0; n < 5000; n++, mid += 7) {
      const a = tt.activity(id, mid);
      if (a.kind === 'bout' && activityStage(a, mid) === 'work') break;
    }
    expect(activityStage(tt.activity(id, mid), mid)).toBe('work');
    const out = createVillagerPose();
    const was = { ...tt.pose(id, mid - 0.1, [], out) };
    // pohled vsi přinese stavbu uprostřed dne – obsazení platí od `mid`
    tt.setDay(DAY, T0, after.tasks, mid);
    const now = { ...tt.pose(id, mid + 0.1, [], out) };
    expect(Math.hypot(now.x - was.x, now.z - was.z)).toBeLessThan(0.5);
    const act = tt.activity(id, mid + 0.1);
    expect(act).toMatchObject({ kind: 'hold', start: mid, end: Infinity });
    expect(act.task?.key).toBe(builder[1].key);
    // u stavby (ne doma) – v dosahu stavby
    const there = tt.pose(id, act.arrive + 1, [], out);
    expect(Math.hypot(there.x - at.x, there.z - at.z)).toBeLessThan(15);
    // stavbu hráč týž den zruší – stavitel od ní hned odejde domů
    const cancel = act.arrive + 30;
    tt.setDay(DAY, T0, before.tasks, cancel);
    const left = tt.activity(id, cancel - 1);
    expect(left.kind).toBe('hold');
    expect(left.leave).toBeGreaterThanOrEqual(cancel);
    expect(left.leave).toBeLessThan(cancel + GRID_S);
  });
});
