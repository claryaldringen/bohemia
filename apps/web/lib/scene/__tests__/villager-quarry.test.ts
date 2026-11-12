import { defaultChurchDims } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneChurch } from '../../church-view';
import { personActivity } from '../../person-activity';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneCart, SceneVillage } from '../../village-view';
import { heapRadius, stoneHeapAt } from '../church-site-layout';
import { stoneCartLoadSpot } from '../village-carts';
import { createVillagerPose, type VillagerStage } from '../villager-motion';
import { activityPhases } from '../villager-phases';
import { planVillagersWithCrew, type PlannedVillager, type VillagerGround } from '../villager-plan';
import { quarryPiles, QUARRY_STAND } from '../villager-plan-quarry';
import type { Activity, PersonTask } from '../villager-schedule';

// Poddaní v lomu (churches.md – Mistři huti při práci, Lom; fortifications.md – Kámen, Nošení
// kamene a vůz; villager-plan-quarry.ts): lámou u stěny, jeden odnáší kameny na hromadu u lomu,
// bez vozu nosí část z nich kámen v nůších na stavbu; kameník přisekává a ukazuje, jak lámat.

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

const STONEMASON = 603;
const PEOPLE: RolePerson[] = [
  ...[1, 2, 3, 4].flatMap((home): RolePerson[] => [
    { id: home * 100 + 1, age: 32, sex: 'male', home, spouse: home * 100 + 2 },
    { id: home * 100 + 2, age: 30, sex: 'female', home, spouse: home * 100 + 1 },
    { id: home * 100 + 3, age: 22, sex: 'male', home },
  ]),
  { id: STONEMASON, age: 40, sex: 'male', home: 4 },
];
const SEX = new Map(PEOPLE.map((p) => [p.id, p.sex]));

function persons(): ScenePerson[] {
  const roles = personRoles(PEOPLE, { manor: 1, craft: () => null });
  return PEOPLE.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
    ...(p.id === STONEMASON ? { mason: 'stonemason' as const } : {}),
  }));
}

/** Lom 200 m od kostela (hromada kamene u pece kostela). */
const FAR = { outcropId: 42, x: 230, z: -60, rotation: 0.4 };
/** Lom kousek od kostela. */
const NEAR = { outcropId: 42, x: 85, z: 25, rotation: 0.4 };

const CHURCH: SceneChurch = {
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
    limeT: 0,
    burning: false,
    kilnBuilt: true,
    stone: 0.5,
    sand: 0.3,
    quarryId: 42,
  },
};

const QUARRYING: LaborShare = {
  activity: 'quarry',
  target: { kind: 'quarry', id: 42 },
  manDays: 6,
  construction: 8,
};
const STONE_CART: LaborShare = {
  activity: 'haul',
  target: { kind: 'quarry', id: 42 },
  manDays: 1,
  carts: 1,
  job: 'stone',
  construction: 8,
};

function plan(quarry: typeof FAR, cart = false, wagon: SceneCart | null = null) {
  const v: SceneVillage = {
    ...(wagon ? { carts: [wagon] } : {}),
    dwellings: [house(1, 0, 0), house(2, 20, 0), house(3, -20, 0), house(4, 0, 80)],
    fields: [],
    churches: [CHURCH],
    quarries: [quarry],
    labor: {
      day: 1000,
      month: 8,
      people: { children: 0, adults: PEOPLE.length, elders: 0 },
      shares: [
        QUARRYING,
        ...(cart ? [STONE_CART] : []),
        { activity: 'idle', target: { kind: 'village' }, manDays: 2 },
      ],
      homes: [1, 2, 3, 4].map((id) => ({ id, people: 3 })),
      persons: persons(),
    },
  };
  const p = planVillagersWithCrew(v, GROUND, {
    seed: 5,
    herds: 0,
    // vůz s kamenem kreslí cart-renderer.ts, vozka je člověk vsi
    ...(wagon ? { draft: { teams: 0, carts: [wagon.id] } } : {}),
  });
  const quarrying = p.people.filter((f) => f.job?.kind === 'share' && f.job.activity === 'quarry');
  const carriers = p.people.filter((f) => f.job?.kind === 'fetch' && f.job.goods === 'stone');
  return { p, v, quarrying, carriers };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

const poseOf = (f: PlannedVillager, t = 0) => f.pose(t, [], createVillagerPose());

/** Práce na místě: 20 s ode dveří, 300 s práce, 20 s domů. */
function phasesOf(task: PersonTask, person: number) {
  return activityPhases(
    {
      person,
      kind: 'bout',
      task,
      start: 3000,
      arrive: 3020,
      leave: 3320,
      end: 3340,
    } as Activity,
    11,
  );
}

describe('poddaní v lomu (villager-plan-quarry.ts)', () => {
  it('lámou muži u stěny s krumpáčem, jeden odnáší kameny na hromadu u lomu', () => {
    const { p, v, quarrying } = plan(FAR);
    expect(quarrying.length).toBeGreaterThanOrEqual(2);
    for (const f of quarrying) expect(SEX.get(f.person!), f.key).toBe('male');
    const face = { x: -Math.sin(FAR.rotation), z: -Math.cos(FAR.rotation) };
    const breakers = quarrying.filter((f) => f.job?.kind === 'share' && !f.job.stacker);
    expect(breakers.length).toBeGreaterThan(0);
    for (const f of breakers) {
      const pose = poseOf(f);
      expect(pose.clip).toBe('quarry');
      expect(dist(pose, FAR)).toBeLessThan(4);
      // čelem ke stěně lomu
      expect(pose.headingX * face.x + pose.headingZ * face.z).toBeGreaterThan(0.99);
      expect(p.tasks.get(f.person!)?.role).toBe('quarry-break');
    }
    // lámající nestojí na sobě
    const at = breakers.map((f) => poseOf(f));
    for (let i = 0; i < at.length; i++) {
      for (let k = i + 1; k < at.length; k++) expect(dist(at[i]!, at[k]!)).toBeGreaterThan(0.9);
    }
    const stackers = quarrying.filter((f) => f.job?.kind === 'share' && f.job.stacker);
    expect(stackers).toHaveLength(1);
    const stacker = stackers[0]!;
    expect(poseOf(stacker).clip).toBe('lay');
    const task = p.tasks.get(stacker.person!)!;
    expect(task.role).toBe('quarry-stack');
    const { heap } = quarryPiles(FAR);
    expect(dist(task.places!.heap!, heap)).toBeCloseTo(heap.r + QUARRY_STAND.stack, 5);
    const phases = phasesOf(task, stacker.person!);
    expect(phases.find((ph) => ph.name === 'take-stone')?.clip).toBe('lay');
    // s kamenem v nůši k hromadě, tam ho složí
    const carry = phases.find((ph) => ph.walk?.to === task.places!.heap);
    expect(carry?.clip).toBe('carry-stone');
    expect(carry?.name).toBe('stack-stone');
    const stack = phases.find((ph) => ph.name === 'stack-stone' && ph.at);
    expect(stack?.at).toEqual(task.places!.heap);
    expect(stack?.clip).toBe('lay');
    // panel
    const state = { id: stacker.person!, stage: null, hidden: false, herd: null };
    expect(personActivity({ ...state, job: stacker.job! }, v)).toBe('odnáší kameny na hromadu');
    expect(personActivity({ ...state, job: stacker.job!, phase: 'take-stone' }, v)).toBe(
      'odebírá přisekané kameny',
    );
    expect(personActivity({ ...state, job: breakers[0]!.job! }, v)).toBe('láme kámen');
    expect(personActivity({ ...state, job: breakers[0]!.job!, leg: 'out' }, v)).toBe('jde do lomu');
  });

  it('kameník v lomu nebere krumpáč: přisekává kámen a ukazuje u lámajících, jak lámat', () => {
    const { p, v, quarrying } = plan(FAR);
    const mine = p.people.filter((f) => f.person === STONEMASON);
    expect(mine).toHaveLength(1);
    const stone = mine[0]!;
    expect(stone.job).toMatchObject({ kind: 'master', work: 'quarry', church: 8 });
    expect(poseOf(stone).clip).toBe('dress');
    const { broken } = quarryPiles(FAR);
    expect(dist(poseOf(stone), broken)).toBeLessThan(broken.r + QUARRY_STAND.dress + 0.5);
    const task = p.tasks.get(STONEMASON)!;
    expect(task.role).toBe('master-quarry');
    const show = task.places!.face!;
    // ukazuje kousek za lámajícími
    const breakers = quarrying.filter((f) => f.job?.kind === 'share' && !f.job.stacker);
    expect(Math.min(...breakers.map((f) => dist(poseOf(f), show)))).toBeLessThan(2.5);
    const phases = phasesOf(task, STONEMASON);
    const names = phases.map((ph) => ph.name);
    expect(names).toContain('show-quarry');
    expect(names).toContain('trim-stone');
    expect(phases.some((ph) => ph.clip === 'quarry')).toBe(false);
    expect(phases.find((ph) => ph.name === 'trim-stone')?.clip).toBe('dress');
    expect(phases.find((ph) => ph.name === 'show-quarry' && ph.at)?.at).toEqual(show);
    const state = { id: STONEMASON, stage: null, hidden: false, herd: null };
    expect(personActivity({ ...state, job: stone.job! }, v)).toBe('přisekává kámen');
    expect(personActivity({ ...state, job: stone.job!, phase: 'show-quarry' }, v)).toBe(
      'ukazuje, jak lámat kámen',
    );
  });

  it('bez vozu a s lomem 200 m od kostela nosí část lidí kámen v nůších k hromadě u kostela', () => {
    const { v, quarrying, carriers } = plan(FAR);
    expect(carriers.length).toBeGreaterThanOrEqual(1);
    expect(carriers.length).toBeLessThan(quarrying.length + carriers.length);
    const heap = stoneHeapAt(CHURCH.site!);
    const { heap: quarryHeap } = quarryPiles(FAR);
    for (const f of carriers) {
      expect(SEX.get(f.person!)).toBe('male');
      expect(f.errand).toBeDefined();
      const seen = new Set<VillagerStage>();
      for (let t = 0; t < f.errand!.cycleS; t += 0.25) {
        const pose = poseOf(f, t);
        if (pose.stage) seen.add(pose.stage);
        // skládá u hromady kamene u kostela, nakládá u hromady u lomu, s kamenem v nůši zpět
        if (pose.stage === 'rest') {
          expect(dist(pose, heap)).toBeLessThan(heapRadius(0.5) + QUARRY_STAND.load + 1.5);
        }
        if (pose.stage === 'end') {
          expect(dist(pose, quarryHeap)).toBeLessThan(quarryHeap.r + QUARRY_STAND.load + 1);
        }
        if (pose.stage === 'back') expect(pose.clip).toBe('carry-stone');
      }
      expect([...seen].sort()).toEqual(['back', 'end', 'out', 'rest']);
    }
    const state = { id: carriers[0]!.person!, hidden: false, herd: null };
    const job = carriers[0]!.job!;
    expect(personActivity({ ...state, stage: 'back', job }, v)).toBe('nosí kámen na stavbu');
    expect(personActivity({ ...state, stage: 'out', job }, v)).toBe('jde pro kámen do lomu');
  });

  it('s vozem s kamenem ani s lomem u kostela nosiči nejsou', () => {
    const withCart = plan(FAR, true);
    expect(withCart.carriers).toHaveLength(0);
    expect(withCart.quarrying.length).toBeGreaterThanOrEqual(2);
    // posádka vozu se nekreslí – vozka je u vozu (bez vozu ve scéně podíl postavy nemá)
    expect(
      withCart.p.people.some((f) => f.job?.kind === 'share' && f.job.activity === 'haul'),
    ).toBe(false);
    const near = plan(NEAR);
    expect(near.carriers).toHaveLength(0);
    expect(near.quarrying.length).toBeGreaterThanOrEqual(2);
  });

  it('s vozem s kamenem u lomu nosí odnášeč kameny k vozu a nakládá je, vůz vede vozka', () => {
    // trasa vozu od hromady u kostela k lomu (village-view-crafts.ts – `reverse`)
    const wagon: SceneCart = {
      id: 5,
      kind: 'two-wheel',
      x: 0,
      z: 80,
      condition: 1,
      job: { activity: 'haul', target: { kind: 'quarry', id: 42 }, load: 'stone', construction: 8 },
      // u lomu končí na kraji výchozu (≈ 9 m od středu ke vsi)
      route: [stoneHeapAt(CHURCH.site!), { x: FAR.x - 7, z: FAR.z + 6 }],
    };
    const { p, v, quarrying, carriers } = plan(FAR, true, wagon);
    expect(carriers).toHaveLength(0);
    const stacker = quarrying.find((f) => f.job?.kind === 'share' && f.job.stacker)!;
    const task = p.tasks.get(stacker.person!)!;
    expect(task.role).toBe('quarry-load');
    expect(task.places!.heap).toEqual(stoneCartLoadSpot(v, 42));
    const phases = phasesOf(task, stacker.person!);
    const carry = phases.find((ph) => ph.walk?.to === task.places!.heap);
    expect(carry?.clip).toBe('carry-stone');
    expect(carry?.name).toBe('load-stone');
    expect(phases.find((ph) => ph.name === 'load-stone' && ph.at)?.at).toEqual(task.places!.heap);
    const state = { id: stacker.person!, stage: null, hidden: false, herd: null };
    expect(personActivity({ ...state, job: stacker.job! }, v)).toBe('nakládá kámen na vůz');
    expect(personActivity({ ...state, job: stacker.job!, phase: 'load-stone' }, v)).toBe(
      'nakládá kámen na vůz',
    );
    // vozka je dospělý člověk vsi, postavu nemá – vede vůz (cart-renderer.ts)
    const crew = p.crew.carts.find((c) => c.cart === 5);
    expect(crew?.drover).not.toBeNull();
    expect(p.people.some((f) => f.person === crew!.drover)).toBe(false);
    // podíl vozu bez vozu ve scéně (nedojede) – odnášeč nosí na hromadu u lomu
    const without = plan(FAR, true);
    const alone = without.quarrying.find((f) => f.job?.kind === 'share' && f.job.stacker)!;
    expect(without.p.tasks.get(alone.person!)?.role).toBe('quarry-stack');
  });
});
