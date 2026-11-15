import {
  churchFootprintWorld,
  defaultChurchDims,
  type ChurchWork,
  type MasonCraft,
} from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneChurch } from '../../church-view';
import type { Activity } from '../villager-schedule';
import { activityPhases } from '../villager-phases';
import { personActivity } from '../../person-activity';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneVillage } from '../../village-view';
import { distToSegment, insidePolygon, KILN_M, stoneHeapAt } from '../church-site-layout';
import { createVillagerPose } from '../villager-motion';
import { planVillagersWithCrew, planWeddings, type VillagerGround } from '../villager-plan';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { churchWallSpots, MASTER_M } from '../villager-plan-masons';

// Mistři huti při práci na staveništi kostela (churches.md – Mistři huti při práci;
// villager-plan-masons.ts): u své práce, jen když na ni dnes došlo, jinak u domu – nikdy na poli.

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

const MASTERS: Record<MasonCraft, number> = {
  builder: 601,
  limeBurner: 602,
  stonemason: 603,
  mason: 604,
  plasterer: 605,
};
const CRAFT_OF = new Map(Object.entries(MASTERS).map(([craft, id]) => [id, craft as MasonCraft]));

const PEOPLE: RolePerson[] = [
  { id: 101, age: 35, sex: 'male', home: 1, spouse: 102 },
  { id: 102, age: 33, sex: 'female', home: 1, spouse: 101 },
  { id: 201, age: 30, sex: 'male', home: 2, spouse: 202 },
  { id: 202, age: 28, sex: 'female', home: 2, spouse: 201 },
  { id: 301, age: 40, sex: 'male', home: 3 },
  ...Object.values(MASTERS).map((id) => ({ id, age: 38, sex: 'male' as const, home: 4 })),
];

function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
    ...(CRAFT_OF.has(p.id) ? { mason: CRAFT_OF.get(p.id)! } : {}),
  }));
}

const square = (cx: number, cy: number) => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown' as const,
});

const QUARRY = {
  outcropId: 42,
  x: 140,
  z: -60,
  rotation: 0.4,
  rock: { x: 140, z: -72, hx: 0, hz: -1, r: 3 },
};

const church = (burning: boolean): SceneChurch => ({
  id: 8,
  type: 'rotunda',
  dims: defaultChurchDims('rotunda'),
  position: { x: 60, z: 40, rotation: 0 },
  progress: { foundation: 1, walls: 0.4, roof: 0, decor: 0 },
  decorated: false,
  built: false,
  priest: false,
  graves: 0,
  site: {
    kiln: { x: 80, z: 40 },
    sandPit: { x: 70, z: 62 },
    limeT: 0.5,
    burning,
    kilnBuilt: true,
    stone: 0.5,
    sand: 0.3,
    quarryId: QUARRY.outcropId,
  },
});

// hodně práce na poli i nečinných – mistr bez přednosti by šel na pole
const FIELD: LaborShare[] = [
  { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 8 },
  { activity: 'idle', target: { kind: 'village' }, manDays: 4 },
];

function village(work: ChurchWork[] | null, burning = false, lord = false): SceneVillage {
  const build: LaborShare[] =
    work === null
      ? []
      : [{ activity: 'build', target: { kind: 'site', id: 8 }, manDays: 3, churchWork: work }];
  return {
    dwellings: [house(1, 0, 0), house(2, 20, 0), house(3, -20, 0), house(4, 0, 80)],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    churches: [church(burning)],
    quarries: [QUARRY],
    labor: {
      day: 1000,
      month: 8,
      people: { children: 0, adults: 10, elders: 0 },
      shares: [...build, ...FIELD],
      homes: [1, 2, 3, 4].map((id) => ({ id, people: 2 })),
      persons: persons(),
      ...(lord ? { lord: { home: 1, trainees: [], household: [] } } : {}),
    },
  };
}

function plan(work: ChurchWork[] | null, burning = false, lord = false) {
  const v = village(work, burning, lord);
  const p = planVillagersWithCrew(v, GROUND, { seed: 3, herds: 0 });
  const of = (craft: MasonCraft) => {
    const mine = p.people.filter((f) => f.person === MASTERS[craft]);
    expect(mine, craft).toHaveLength(1);
    const f = mine[0]!;
    const pose = f.pose(0, [], createVillagerPose());
    return { f, pose, task: p.tasks.get(MASTERS[craft]), village: v };
  };
  return { p, of };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

/** Mistr u domu: úloha `home`, stojí u dveří domu 4 (vchod na +z). */
function expectHome(m: ReturnType<ReturnType<typeof plan>['of']>, craft: MasonCraft): void {
  expect(m.f.job, craft).toEqual({ kind: 'master', craft, church: null, work: 'home' });
  expect(dist(m.pose, { x: 0, z: 80 }), craft).toBeLessThan(8);
  expect(m.task?.role, craft).toBe('master-home');
}

/** Vzdálenost bodu od nejbližší zdi kostela; uvnitř zdí záporná. */
function wallDistance(c: SceneChurch, p: { x: number; z: number }): number {
  const polys = churchFootprintWorld(c.type, c.dims, c.position);
  if (polys.some((q) => insidePolygon(p, q))) return -1;
  return Math.min(
    ...polys.flatMap((q) => q.map((a, k) => distToSegment(p, a, q[(k + 1) % q.length]!))),
  );
}

describe('mistři huti při práci (villager-plan-masons.ts)', () => {
  it('lámání v lomu: kameník v lomu přisekává kámen (ne krumpáč), ostatní mistři u domu', () => {
    const { of } = plan(['quarry']);
    const stone = of('stonemason');
    expect(stone.f.job).toEqual({ kind: 'master', craft: 'stonemason', church: 8, work: 'quarry' });
    expect(dist(stone.pose, QUARRY)).toBeLessThan(4);
    // lámou poddaní (villager-plan-quarry.ts) – kameník přisekává a ukazuje u stěny, jak lámat
    expect(stone.pose.clip).toBe('dress');
    expect(stone.task?.role).toBe('master-quarry');
    expect(stone.task?.places?.face).toBeDefined();
    // stavbyvedoucí je u staveniště při každé práci na kostele
    expect(of('builder').f.job).toMatchObject({ kind: 'master', work: 'site', church: 8 });
    for (const craft of ['limeBurner', 'mason', 'plasterer'] as const) expectHome(of(craft), craft);
  });

  it('vápno a zdi při pálení: vápeník u pece, zedník u zdi, kameník u hromady, nikdo v práci vsi', () => {
    const { p, of } = plan(['lime', 'walls'], true);
    const c = church(true);
    const lime = of('limeBurner');
    expect(lime.f.job).toEqual({ kind: 'master', craft: 'limeBurner', church: 8, work: 'kiln' });
    expect(dist(lime.pose, c.site!.kiln)).toBeLessThan(KILN_M.ringR + MASTER_M.kiln + 1.6);
    expect(lime.pose.clip).toBe('stoke');
    expect(lime.task?.role).toBe('master-kiln');
    // čelem k peci
    const toKiln = { x: c.site!.kiln.x - lime.pose.x, z: c.site!.kiln.z - lime.pose.z };
    expect(lime.pose.headingX * toKiln.x + lime.pose.headingZ * toKiln.z).toBeGreaterThan(0);

    const mason = of('mason');
    expect(mason.f.job).toEqual({ kind: 'master', craft: 'mason', church: 8, work: 'walls' });
    const d = wallDistance(c, mason.pose);
    expect(d).toBeGreaterThan(0.3);
    expect(d).toBeLessThan(2.5);
    expect(mason.pose.clip).toBe('lay');
    expect(mason.task?.role).toBe('master-walls');

    const stone = of('stonemason');
    expect(stone.f.job).toMatchObject({ kind: 'master', work: 'dress' });
    expect(dist(stone.pose, stoneHeapAt(c.site!))).toBeLessThan(4);
    expect(stone.task?.role).toBe('master-dress');
    // nese kámen k nejbližší zdi
    expect(stone.task?.places?.haul).toBeDefined();

    expect(of('builder').task?.role).toBe('master-site');
    expectHome(of('plasterer'), 'plasterer');
    // žádný mistr mimo svou práci – ani postava podílu práce vsi, ani úloha jiného druhu
    for (const id of Object.values(MASTERS)) {
      for (const f of p.people.filter((x) => x.person === id)) expect(f.job?.kind).toBe('master');
      expect(p.tasks.get(id)?.job.kind).toBe('master');
    }
  });

  it('mezi pálením vápeník tluče vápenec, nosí ho do pece a hasí vápno v jámě', () => {
    const { of } = plan(['lime']);
    const lime = of('limeBurner');
    expect(lime.pose.clip).toBe('break-stone');
    expect(lime.task?.role).toBe('master-lime');
    expect(lime.task?.places?.haul).toBeDefined();
    expect(lime.task?.places?.pit).toBeDefined();
  });

  it('příprava staveniště: stavbyvedoucí vyměřuje půdorys u zdí', () => {
    const { of } = plan([]);
    const b = of('builder');
    expect(b.f.job).toMatchObject({ kind: 'master', work: 'layout', church: 8 });
    expect(b.task?.role).toBe('master-layout');
    expect(b.pose.clip).toBe('measure');
    expect(b.task?.places?.wall).toBeDefined();
    expect(b.task?.places?.quarry).toBeUndefined();
  });

  it('stavbyvedoucí obchází lom, písník a dvorec vojvody; bez lámání lom vynechá', () => {
    const { of } = plan(['quarry', 'sand', 'walls'], false, true);
    const b = of('builder');
    expect(b.task?.role).toBe('master-site');
    const places = b.task!.places!;
    expect(dist(places.quarry!, QUARRY)).toBeLessThan(4);
    expect(dist(places.sand!, church(false).site!.sandPit)).toBeLessThan(3);
    // před dveřmi dvorce (dům 1 v počátku)
    expect(dist(places.manor!, { x: 0, z: 0 })).toBeLessThan(9);
    expect(places.kiln).toBeUndefined();
    const a = { ...b.task!, role: 'master-site' as const };
    const phases = activityPhases(
      {
        person: 601,
        kind: 'bout',
        task: a,
        start: 3000,
        arrive: 3020,
        leave: 3020 + 3000,
        end: 3040 + 3000,
      } as Activity,
      11,
    );
    const names = phases.map((p) => p.name);
    for (const n of ['to-quarry', 'check-quarry', 'to-sand', 'check-sand', 'to-manor', 'report']) {
      expect(names, n).toContain(n);
    }
    expect(names).not.toContain('to-kiln');
    expect(phases.find((p) => p.name === 'report')?.at).toEqual(places.manor);

    // bez lámání kamene krok k lomu není
    const none = plan(['walls'], false, true).of('builder');
    expect(none.task?.places?.quarry).toBeUndefined();
  });

  it('bez práce na kostele jsou všichni mistři u domu, i když je na poli hodně práce', () => {
    const { p, of } = plan(null);
    for (const craft of Object.keys(MASTERS) as MasonCraft[]) expectHome(of(craft), craft);
    for (const id of Object.values(MASTERS)) {
      expect(p.people.some((f) => f.person === id && f.job?.kind === 'share')).toBe(false);
    }
    // ostatní lidé jsou na poli dál
    expect(p.people.some((f) => f.job?.kind === 'share' && f.job.activity === 'harvest')).toBe(
      true,
    );
  });

  it('mistr, který se dnes žení, je na svatbě, ne u práce', () => {
    const DAY = 1000;
    const START = LIVESTOCK_EPOCH_MS + 5_000_000;
    const dayWindow = (day: number): { startMs: number; endMs: number } => ({
      startMs: START + (day - DAY) * 86_000,
      endMs: START + (day - DAY + 1) * 86_000,
    });
    const groom = MASTERS.mason;
    const v: SceneVillage = {
      ...village(['walls']),
      sacred: { oaks: [{ id: 77, x: 10, z: 60 }], groves: [], buildings: [] },
      weddings: [
        {
          key: `${DAY}:0`,
          day: DAY,
          bride: { id: 950, age: 19, from: 1 },
          groom: { id: groom, age: 30, from: 4 },
          home: 4,
          guests: [],
        },
      ],
    };
    const weddings = planWeddings(v, GROUND, { seed: 3, dayWindow });
    expect(weddings).toHaveLength(1);
    const p = planVillagersWithCrew(v, GROUND, { seed: 3, herds: 0, dayWindow, weddings });
    const mine = p.people.filter((f) => f.person === groom);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.job?.kind).toBe('wedding');
  });

  it('výzdoba: štukatér u zdi omítá; panel řekne práci mistra', () => {
    const { of } = plan(['decor']);
    const plaster = of('plasterer');
    expect(plaster.f.job).toMatchObject({ kind: 'master', work: 'decor' });
    expect(plaster.pose.clip).toBe('plaster');
    expect(plaster.task?.role).toBe('master-decor');
    const state = { id: MASTERS.plasterer, stage: null, hidden: false, herd: null };
    expect(personActivity({ ...state, job: plaster.f.job! }, plaster.village)).toBe('omítá zdi');
    expect(personActivity({ ...state, job: plaster.f.job!, leg: 'out' }, plaster.village)).toBe(
      'jde na staveniště',
    );
    expect(personActivity({ ...state, job: of('mason').f.job! }, plaster.village)).toBe(
      'postává u domu',
    );
  });

  it('body u zdí leží vně obrysu ve vzdálenosti od zdi a míří ke zdi', () => {
    const c = church(false);
    const spots = churchWallSpots(c, MASTER_M.mason);
    expect(spots.length).toBeGreaterThan(4);
    for (const s of spots) {
      expect(wallDistance(c, s)).toBeCloseTo(MASTER_M.mason, 1);
      // krok ke zdi bod přiblíží
      const step = { x: s.x + s.hx * 0.3, z: s.z + s.hz * 0.3 };
      expect(wallDistance(c, step)).toBeLessThan(wallDistance(c, s));
    }
  });
});
