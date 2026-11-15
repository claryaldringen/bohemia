import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneExpedition, SceneVillage } from '../../village-view';
import type { SceneWedding } from '../../wedding-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { personActivity } from '../../person-activity';
import { createVillagerPose, villagerSeconds, walkSpeed, type HerdView } from '../villager-motion';
import { LORD_CYCLE_S } from '../lord-day';
import { COOK_SHARE, doorChore, SNARE_EDGE, SPIN_SHARE, WEAVE_SHARE } from '../villager-plan-folk';
import { pickPerson } from '../villager-pick';
import {
  LEADER_AGE,
  planFunerals,
  planVillagers,
  planVillagersWithCrew,
  planWeddings,
  type PlannedVillager,
  type VillagerGround,
  type VillagerPaths,
} from '../villager-plan';
import { ADULTS, DayRoster, YOUNGSTERS, type PersonJob } from '../villager-roster';
import { FIGURE_SCALE, type DraftCrew } from '../villager-plan-types';
import { activities, castTimeline, type ScheduleInput } from '../villager-schedule';

// Postava = konkrétní člověk (villagers.md – Výběr postavy): kdo je která postava dne.

const GROUND: VillagerGround = {
  walkable: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400,
  tree: (id) => (id === 501 ? { x: -40, z: -30 } : null),
  treesIn: () => [],
};

const square = (cx: number, cy: number) => ({
  cell: { x: cx, y: cy },
  x: cx * 15 + 7.5,
  z: cy * 15 + 7.5,
  size: 15,
  stage: 'sown' as const,
});

const house = (id: number, x: number, z: number, built = true) => ({
  id,
  type: 'zemnice' as const,
  position: { x, z, rotation: 0 },
  built,
  progress: built ? 1 : 0.6,
  inhabited: built,
});

/** Lidé: dvorec (1), dva rolníci (2, 3), kovárna (31) se syny 11 a 15 let. */
const PEOPLE: RolePerson[] = [
  { id: 101, age: 35, sex: 'male', home: 1, spouse: 102 },
  { id: 102, age: 33, sex: 'female', home: 1, spouse: 101 },
  { id: 103, age: 10, sex: 'male', home: 1, father: 101, mother: 102 },
  { id: 104, age: 5, sex: 'female', home: 1, father: 101, mother: 102 },
  { id: 105, age: 61, sex: 'male', home: 3 },
  { id: 201, age: 30, sex: 'male', home: 2, spouse: 202 },
  { id: 202, age: 28, sex: 'female', home: 2, spouse: 201 },
  { id: 203, age: 12, sex: 'male', home: 2, father: 201, mother: 202 },
  { id: 204, age: 9, sex: 'female', home: 2, father: 201, mother: 202 },
  { id: 301, age: 40, sex: 'male', home: 3, spouse: 302 },
  { id: 302, age: 38, sex: 'female', home: 3, spouse: 301 },
  { id: 303, age: 17, sex: 'female', home: 3, father: 301, mother: 302 },
  { id: 304, age: 50, sex: 'female', home: 3 },
  { id: 401, age: 36, sex: 'male', home: 31, spouse: 402, practice: { smith: 5 } },
  { id: 402, age: 34, sex: 'female', home: 31, spouse: 401 },
  { id: 403, age: 11, sex: 'male', home: 31, father: 401, mother: 402 },
  { id: 404, age: 15, sex: 'male', home: 31, father: 401, mother: 402 },
];

function persons(people: readonly RolePerson[] = PEOPLE): ScenePerson[] {
  const roles = personRoles(people, {
    manor: 1,
    craft: (home) => (home === 31 ? 'smith' : null),
  });
  return people.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
  }));
}

const KILN = { x: -30, z: -20 };

const SHARES: LaborShare[] = [
  { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 3 },
  { activity: 'build', target: { kind: 'site', id: 90 }, manDays: 1.5, construction: 90 },
  { activity: 'craft', target: { kind: 'dwelling', id: 31 }, manDays: 1 },
  {
    activity: 'fetch',
    target: { kind: 'kiln', id: 21, x: KILN.x, z: KILN.z, from: 31 },
    manDays: 0.2,
    ages: [11],
  },
  { activity: 'domestic', target: { kind: 'village' }, manDays: 4 },
  { activity: 'idle', target: { kind: 'village' }, manDays: 2 },
];

function village(shares: LaborShare[] = SHARES, list = persons()): SceneVillage {
  return {
    dwellings: [
      house(1, 0, 0),
      house(2, 20, 0),
      house(3, -20, 0),
      { ...house(31, -45, 0), craft: 'smith' as const },
      house(90, 0, -40, false),
    ],
    fields: [{ id: 7, parts: [square(2, 0), square(3, 0), square(2, 1)] }],
    labor: {
      day: 1000,
      month: 7,
      people: { children: 6, adults: 11, elders: 3 },
      shares,
      herders: { children: 2 },
      homes: [1, 2, 3, 31].map((id) => ({ id, people: 4 })),
      persons: list,
    },
  };
}

const HERDS: HerdView[] = [
  { x: 120, z: 120, radiusM: 6, moving: 0, headingX: 1, headingZ: 0, species: 'sheep' },
  { x: -150, z: 100, radiusM: 6, moving: 1, headingX: 0, headingZ: 1, species: 'pig' },
];

/** Pěšiny ke vodě na sever – lidé chodí pro vodu od svých dveří rovně. */
const WATER_X: Record<number, number> = { 1: 0, 2: 20, 3: -20, 31: -45 };
const PATHS: VillagerPaths = {
  route: (a, b) => ({
    points: [
      [a.x, a.z],
      [b.x, b.z],
    ],
    pace: [1],
  }),
  errand: (id, kind) => (kind === 'water' ? { x: WATER_X[id] ?? 0, z: 200 } : null),
};

const byId = new Map(PEOPLE.map((p) => [p.id, p]));
const personOf = (figure: PlannedVillager): RolePerson => byId.get(figure.person!)!;

describe('role lidí (person-roles.ts)', () => {
  it('vojvoda a jeho rodina, kovář a jeho rodina, rolník, starší, dítě', () => {
    const roles = personRoles(PEOPLE, { manor: 1, craft: (h) => (h === 31 ? 'smith' : null) });
    expect(roles.get(101)).toBe('voivode');
    expect(roles.get(102)).toBe('voivode-wife');
    expect(roles.get(103)).toBe('voivode-son');
    expect(roles.get(104)).toBe('child');
    expect(roles.get(105)).toBe('old-man');
    expect(roles.get(303)).toBe('farmer-daughter');
    expect(roles.get(201)).toBe('farmer');
    expect(roles.get(202)).toBe('farmer-wife');
    expect(roles.get(204)).toBe('farmer-daughter');
    expect(roles.get(304)).toBe('old-woman');
    expect(roles.get(401)).toBe('smith');
    expect(roles.get(402)).toBe('smith-wife');
    expect(roles.get(404)).toBe('smith-son');
  });

  it('vdova, snacha, nevěsta z okolí, vojvoda i ve stáří', () => {
    const roles = personRoles(
      [
        { id: 1, age: 58, sex: 'male', home: 5, spouse: 2 },
        { id: 2, age: 50, sex: 'female', home: 5, spouse: 1 },
        { id: 3, age: 30, sex: 'female', home: 6 },
        { id: 4, age: 8, sex: 'male', home: 6, mother: 3 },
        { id: 5, age: 40, sex: 'male', home: 7, spouse: 6 },
        { id: 6, age: 38, sex: 'female', home: 7, spouse: 5 },
        { id: 7, age: 20, sex: 'male', home: 7, father: 5, mother: 6, spouse: 8 },
        { id: 8, age: 19, sex: 'female', home: 7, spouse: 7, origin: true },
        { id: 9, age: 22, sex: 'female', home: 8, origin: true },
      ],
      { manor: 5, craft: () => null },
    );
    expect(roles.get(1)).toBe('voivode');
    expect(roles.get(2)).toBe('voivode-wife');
    expect(roles.get(3)).toBe('widow');
    expect(roles.get(4)).toBe('farmer-son');
    expect(roles.get(8)).toBe('daughter-in-law');
    expect(roles.get(9)).toBe('bride');
  });

  it('ves s rodem: vojvodou je dynasty.lordId, i chlapec – ne nejstarší muž dvorce', () => {
    const people: RolePerson[] = [
      { id: 1, age: 10, sex: 'male', home: 5, mother: 2 },
      { id: 2, age: 35, sex: 'female', home: 5, spouse: 3 },
      { id: 3, age: 40, sex: 'male', home: 5, spouse: 2 },
    ];
    const roles = personRoles(people, { manor: 5, lordId: 1, craft: () => null });
    expect(roles.get(1)).toBe('voivode');
    expect(personRoles(people, { manor: 5, craft: () => null }).get(3)).toBe('voivode');
  });

  it('vedlejší manželka vojvody (lord.md – Manželky) – v dvorci i ve vlastním domě', () => {
    const people: RolePerson[] = [
      { id: 1, age: 40, sex: 'male', home: 5, spouse: 2 },
      { id: 2, age: 35, sex: 'female', home: 5, spouse: 1 },
      { id: 3, age: 30, sex: 'female', home: 5, spouse: 1 },
      { id: 4, age: 38, sex: 'female', home: 6, spouse: 1 },
      { id: 5, age: 18, sex: 'male', home: 6, mother: 4, father: 1 },
    ];
    const roles = personRoles(people, { manor: 5, lordId: 1, craft: () => null });
    expect(roles.get(1)).toBe('voivode');
    expect(roles.get(2)).toBe('voivode-wife');
    expect(roles.get(3)).toBe('voivode-secondary-wife');
    expect(roles.get(4)).toBe('voivode-secondary-wife');
  });
});

describe('DayRoster – lidé dne k postavám', () => {
  it('nikdo dvakrát, preferovaná domácnost a pohlaví, dílna jen ke své práci', () => {
    const roster = new DayRoster(persons(), 3, new Set([31]));
    const first = roster.take({ ...ADULTS, sex: 'female', preferHome: 2 })!;
    expect(first.id).toBe(202);
    expect(roster.takeId(202)).toBeNull();
    // z kovárny do práce vsi jen ženy (lehčí polní práce – crafts.md), muži ne
    const taken: { home: number; sex: string }[] = [];
    for (let p = roster.take(ADULTS); p; p = roster.take(ADULTS)) {
      taken.push({ home: p.home, sex: p.sex });
    }
    expect(taken.filter((p) => p.home === 31 && p.sex === 'male')).toEqual([]);
    expect(roster.take({ ...ADULTS, homes: new Set([31]), onlySex: 'male' })).not.toBeNull();
    // syn podle věku
    expect(roster.take({ ...YOUNGSTERS, homes: new Set([31]), age: 11 })!.id).toBe(403);
  });

  it('pořadí je los ze seedu vsi – stejné napříč dny (herec je člověk napříč dny), jiná ves jiné', () => {
    const order = (seed: number): number[] => {
      const roster = new DayRoster(persons(), seed);
      const out: number[] = [];
      for (let p = roster.take(ADULTS); p; p = roster.take(ADULTS)) out.push(p.id);
      return out;
    };
    expect(order(3)).toEqual(order(3));
    const seeds = [4, 5, 6, 7].map((s) => order(s).join());
    expect(seeds.some((o) => o !== order(3).join())).toBe(true);
  });
});

describe('žena u dveří, oka na zajíce (villagers.md – Fáze činností; úloha 12)', () => {
  it('ženy u dveří předou, vaří, tkají u stavu; s malým dítětem v domě ho hlídají', () => {
    expect(doorChore(0.1, false)).toEqual({ clip: 'spin', stage: 'spin' });
    expect(doorChore(SPIN_SHARE + 0.01, false)).toEqual({ clip: 'cook', stage: 'cook' });
    expect(doorChore(SPIN_SHARE + COOK_SHARE + 0.01, false)).toEqual({
      clip: 'weave',
      stage: 'weave',
    });
    const rest = SPIN_SHARE + COOK_SHARE + WEAVE_SHARE + 0.01;
    expect(doorChore(rest, true)).toEqual({ clip: 'idle', stage: 'mind' });
    expect(doorChore(rest, false)).toEqual({ clip: 'idle', stage: null });
    // malé dítě (pod 7 let) má jen dvorec – dcera 5 let; v domě 2 je nejmladší 9 let
    const roster = new DayRoster(persons(), 3);
    expect(roster.hasSmallChild(1)).toBe(true);
    expect(roster.hasSmallChild(2)).toBe(false);
    // panel řekne práci u domu podle úseku pózy
    const job: PersonJob = { kind: 'share', activity: 'domestic', target: { kind: 'village' } };
    const text = (stage: 'weave' | 'mind' | null): string =>
      personActivity({ id: 1, job, stage, hidden: false, herd: null }, village());
    expect(text('weave')).toBe('tká na stavu před domem');
    expect(text('mind')).toBe('hlídá děti u domu');
    expect(text(null)).toBe('pracuje u domu');
  });

  it('oka na zajíce: v zimě klečí s okem na okraji lesa nejblíž vsi, čelem k lesu', () => {
    const trees = Array.from({ length: 40 }, (_, i) => ({ x: 60 + (i % 8) * 4, z: (i >> 3) * 4 }));
    const ground: VillagerGround = { ...GROUND, treesIn: () => trees };
    const shares: LaborShare[] = [{ activity: 'snare', target: { kind: 'village' }, manDays: 4 }];
    const people = planVillagers(village(shares), ground, { seed: 5, herds: 0, paths: PATHS });
    const snarers = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'snare');
    expect(snarers.length).toBeGreaterThan(0);
    expect(snarers.length).toBeLessThanOrEqual(SNARE_EDGE.figures);
    for (const figure of snarers) {
      const pose = figure.pose(100, [], createVillagerPose());
      expect(pose.clip).toBe('snare');
      const tree = [...trees].sort(
        (a, b) => Math.hypot(a.x - pose.x, a.z - pose.z) - Math.hypot(b.x - pose.x, b.z - pose.z),
      )[0]!;
      expect(Math.hypot(tree.x - pose.x, tree.z - pose.z)).toBeLessThan(SNARE_EDGE.fromTreeM + 2.5);
      // čelem ke kmeni (k lesu), od vsi na kraji lesa
      expect((tree.x - pose.x) * pose.headingX + (tree.z - pose.z) * pose.headingZ).toBeGreaterThan(
        0,
      );
      expect(pose.x).toBeLessThan(tree.x);
    }
    // bez stromů nikdo
    const none = planVillagers(village(shares), GROUND, { seed: 5, herds: 0, paths: PATHS });
    expect(none.some((p) => p.job?.kind === 'share' && p.job.activity === 'snare')).toBe(false);
  });
});

describe('planVillagers s lidmi vsi – kdo je která postava', () => {
  const plan = (v: SceneVillage = village()): PlannedVillager[] =>
    planVillagers(v, GROUND, { seed: 5, herds: 2, paths: PATHS });
  /** S hodinami světa – karavany jdou ve skutečném čase od dne, kdy cesta začala. */
  const planAt = (v: SceneVillage): PlannedVillager[] =>
    planVillagers(v, GROUND, {
      seed: 5,
      herds: 2,
      paths: PATHS,
      dayWindow: (day) => ({ startMs: day * 86_400, endMs: (day + 1) * 86_400 }),
    });

  it('každá postava je jiný člověk, pohlaví a velikost podle něj', () => {
    const people = plan();
    expect(people.length).toBeGreaterThan(5);
    const ids = people.map((p) => p.person);
    expect(ids.every((id) => id !== undefined)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const figure of people) {
      const person = personOf(figure);
      expect(figure.kind).toBe(person.sex === 'female' ? 'woman' : 'man');
      if (person.age < 14) expect(figure.scale).toBeLessThan(1);
      expect(figure.job).toBeDefined();
    }
  });

  it('sedí s fakty dne: pasáci výrostci, syn kováře nese uhlí, dílna v dílně, starší doma', () => {
    const people = plan();
    const herders = people.filter((p) => p.job?.kind === 'herd');
    expect(herders.length).toBe(2);
    for (const h of herders) expect(personOf(h).age).toBeGreaterThanOrEqual(7);
    for (const h of herders) expect(personOf(h).age).toBeLessThan(14);
    const fetch = people.filter((p) => p.job?.kind === 'fetch');
    expect(fetch.map((p) => p.person)).toEqual([403]);
    const craft = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'craft');
    expect(craft.length).toBeGreaterThan(0);
    for (const c of craft) expect(personOf(c).home).toBe(31);
    // řemeslo dělá jen kovář a synové, kovářova žena ne (crafts.md – Kdo dělá řemeslo)
    for (const c of craft) expect(personOf(c).sex).toBe('male');
    // z kovářovy rodiny na poli nanejvýš ženy – lehčí polní práce se vsí (crafts.md)
    const field = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'harvest');
    for (const f of field) if (personOf(f).home === 31) expect(personOf(f).sex).toBe('female');
    const elders = people.filter((p) => p.job?.kind === 'elder');
    expect(elders.length).toBeGreaterThan(0);
    for (const e of elders) expect(personOf(e).age).toBeGreaterThanOrEqual(45);
    // pro vodu jde člověk z domu, od jehož dveří proud vychází
    const water = people.filter((p) => p.key.startsWith('traffic:water:'));
    expect(water.length).toBeGreaterThan(0);
    for (const w of water) {
      expect(String(personOf(w).home)).toBe(w.key.split(':')[2]);
    }
    // stavba má vždy někoho
    expect(people.some((p) => p.job?.kind === 'share' && p.job.activity === 'build')).toBe(true);
  });

  it('deterministické v rámci dne – dvakrát stejně, nezávisle na čase', () => {
    const a = plan();
    const b = plan();
    expect(a.map((p) => `${p.key}=${p.person}`)).toEqual(b.map((p) => `${p.key}=${p.person}`));
  });

  it('ves s málo lidmi: postav není víc než lidí (domácí práce a nečinní napřed odpadnou)', () => {
    const few = persons(PEOPLE.filter((p) => p.home === 2));
    const people = plan(village(SHARES, few));
    expect(people.length).toBeLessThanOrEqual(few.length);
    expect(people.some((p) => p.job?.kind === 'share' && p.job.activity === 'build')).toBe(true);
  });

  it('bez lidí ve scéně jako dřív – postavy bez lidí', () => {
    const v = village();
    const labor = { ...v.labor! };
    delete labor.persons;
    const people = planVillagers({ ...v, labor }, GROUND, { seed: 5, herds: 2, paths: PATHS });
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((p) => p.person === undefined && p.job === undefined)).toBe(true);
  });

  it('cesta pro kování: tesař jde s karavanou, nosiči jsou dospělí vsi, nikdo jinde', () => {
    const iron: SceneExpedition = {
      id: 'iron:31:900',
      trailId: null,
      line: [
        { x: 0, z: -8 },
        { x: 0, z: -300 },
      ],
      porters: 2,
      carts: [],
      cartCrew: 1,
      leaving: [{ sex: 'male', age: 15 }],
      coming: [{ sex: 'male', age: 15 }],
      carriesOut: true,
      carriesBack: false,
      progress: 0.05,
      rate: 0.1,
      day: 1000,
      onMap: 0.6,
      trip: { kind: 'iron', to: 'Olšany', travellerId: 404 },
    };
    const people = planAt({ ...village(), expeditions: [iron] });
    const caravan = people.filter((p) => p.key.startsWith('caravan:'));
    const traveller = caravan.filter((p) => p.person === 404);
    expect(traveller.length).toBe(2); // tam a zpátky – vidět je vždy nejvýš jedna
    expect(traveller.every((p) => p.job?.kind === 'caravan' && !p.job.porter)).toBe(true);
    const porters = caravan.filter((p) => p.person !== 404);
    expect(new Set(porters.map((p) => p.person)).size).toBe(2);
    for (const p of porters) expect(personOf(p).age).toBeGreaterThanOrEqual(14);
    // nosiči a tesař nejsou v žádné jiné postavě
    const away = new Set(caravan.map((p) => p.person));
    expect(
      people.filter((p) => !p.key.startsWith('caravan:')).some((p) => away.has(p.person)),
    ).toBe(false);
  });

  it('lidé, kteří odcházejí k sousedovi, nejsou lidé vsi – postava bez člověka', () => {
    const trade: SceneExpedition = {
      id: 7,
      trailId: null,
      line: [
        { x: 0, z: -8 },
        { x: 0, z: -300 },
      ],
      porters: 1,
      carts: [],
      cartCrew: 1,
      leaving: [{ sex: 'female', age: 20 }],
      coming: [],
      carriesOut: true,
      carriesBack: true,
      progress: 0.05,
      rate: 0.1,
      day: 1000,
      onMap: 0.6,
      trip: { kind: 'trade', to: 'Olšany' },
    };
    const caravan = planAt({ ...village(), expeditions: [trade] }).filter((p) =>
      p.key.startsWith('caravan:'),
    );
    expect(caravan.filter((p) => p.person === undefined)).toHaveLength(1);
    expect(caravan.filter((p) => p.person !== undefined)).toHaveLength(2);
  });

  it('pohřeb: za márami jdou lidé z jádra (id), máry nesou muži vsi', () => {
    const DAY = 1000;
    const START = LIVESTOCK_EPOCH_MS + 5_000_000;
    const dayWindow = (day: number): { startMs: number; endMs: number } => ({
      startMs: START + (day - DAY) * 86_000,
      endMs: START + (day - DAY + 1) * 86_000,
    });
    const v: SceneVillage = {
      ...village(),
      cemeteries: [
        {
          id: 8,
          squares: [{ cell: { x: -3, y: -3 }, x: -37.5, z: -37.5, size: 15 }],
          built: true,
          progress: 1,
          graves: 10,
        },
      ],
      funerals: [
        {
          key: '8:-3:-3:3:4',
          cemeteryId: 8,
          cell: { x: -3, y: -3 },
          column: 3,
          row: 4,
          size: 'normal',
          rank: 'adult',
          day: DAY,
          x: -37,
          z: -36,
          from: 2,
          mourners: [202, 203, 204].map((id) => ({
            id,
            sex: byId.get(id)!.sex,
            age: byId.get(id)!.age,
            home: 2,
          })),
        },
      ],
    };
    const funerals = planFunerals(v, GROUND, { seed: 3, dayWindow });
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0, dayWindow, funerals });
    const funeral = people.filter((p) => p.job?.kind === 'funeral');
    const mourners = funeral.filter((p) => p.job?.kind === 'funeral' && !p.job.bearer);
    expect(mourners.map((p) => p.person).sort()).toEqual([202, 203, 204]);
    const bearers = funeral.filter((p) => p.job?.kind === 'funeral' && p.job.bearer);
    expect(bearers).toHaveLength(4);
    for (const b of bearers) expect(personOf(b).sex).toBe('male');
  });
});

describe('pasák – zvíře stáda (villagers.md – Výběr postavy)', () => {
  it('postava pasáka pase stádo `herd` ve scéně', () => {
    const people = planVillagers(village(), GROUND, { seed: 5, herds: 2, paths: PATHS });
    const herder = people.find((p) => p.job?.kind === 'herd')!;
    const pose = herder.pose(100, HERDS, createVillagerPose());
    expect(pose.hidden).not.toBe(true);
  });
});

describe('svatba – svatebčané jsou lidé vsi (kinship.md – Svatba ve scéně)', () => {
  const DAY = 1000;
  const START = LIVESTOCK_EPOCH_MS + 5_000_000;
  const dayWindow = (day: number): { startMs: number; endMs: number } => ({
    startMs: START + (day - DAY) * 86_000,
    endMs: START + (day - DAY + 1) * 86_000,
  });
  const guestOf = (id: number) => ({
    id,
    sex: byId.get(id)!.sex,
    age: byId.get(id)!.age,
    home: byId.get(id)!.home,
  });
  const wedding = (bride: SceneWedding) => ({
    ...village(),
    sacred: { oaks: [{ id: 77, x: 0, z: 60 }], groves: [], buildings: [] },
    weddings: [bride],
  });

  it('nevěsta, ženich a svatebčané podle id, činnost svatby; jdou vybrat kliknutím', () => {
    // vdaná žena 302 (v ukázce nevěsta) – i tak věnec, ne šátek
    const v = wedding({
      key: `${DAY}:0`,
      day: DAY,
      bride: { id: 302, age: 38, from: 3 },
      groom: { id: 301, age: 40, from: 3 },
      home: 3,
      guests: [303, 304, 105, 201].map(guestOf),
    });
    const weddings = planWeddings(v, GROUND, { seed: 3, dayWindow });
    expect(weddings).toHaveLength(1);
    const people = planVillagers(v, GROUND, { seed: 3, herds: 0, dayWindow, weddings });
    const party = people.filter((p) => p.job?.kind === 'wedding');
    expect(party.map((p) => p.person).sort()).toEqual([105, 201, 301, 302, 303, 304]);
    const bride = party.find((p) => p.job?.kind === 'wedding' && p.job.role === 'bride')!;
    expect(bride.person).toBe(302);
    expect(bride.look.hair).toBe('wreath');
    const groom = party.find((p) => p.job?.kind === 'wedding' && p.job.role === 'groom')!;
    expect(groom.person).toBe(301);
    // nikdo není ve dvou postavách
    const ids = people.flatMap((p) => (p.person === undefined ? [] : [p.person]));
    expect(new Set(ids).size).toBe(ids.length);
    // výběr kliknutím: postava svatby je mezi postavami s člověkem
    const t = villagerSeconds(weddings[0]!.timeline.ritesMs + 1000);
    const spots = new Float32Array(people.length * 3).fill(Number.NaN);
    people.forEach((p, i) => {
      if (p !== bride) return;
      const pose = p.pose(t, [], createVillagerPose());
      spots.set([pose.x, 0, pose.z], i * 3);
    });
    const at = bride.pose(t, [], createVillagerPose());
    const project = (x: number, y: number, z: number): { x: number; y: number } => ({
      x: (x - at.x) * 10 + 100,
      y: 100 - y * 10 + (z - at.z) * 10,
    });
    expect(pickPerson(people, spots, 100, 95, project)).toBe(302);
    // u místa obřadu: úsek „u obřadu“ (panel – je oddávána)
    expect(bride.pose(t, [], createVillagerPose()).stage).toBe('ring');
  });

  it('nevěsta z okolí je člověk vsi, lidé, kteří přišli s ní, nejdou vybrat', () => {
    const v = wedding({
      key: `${DAY}:0`,
      day: DAY,
      bride: { id: 303, age: 17, from: null, outside: { direction: 'E', edge: { x: 390, z: 0 } } },
      groom: { id: 201, age: 30, from: 2 },
      home: 2,
      guests: [202, 203].map(guestOf),
      companions: [
        { sex: 'male', age: 48 },
        { sex: 'female', age: 44 },
      ],
    });
    const weddings = planWeddings(v, GROUND, { seed: 3, dayWindow });
    // den svatby: lidé z okolí jdou od kraje, svatebčané ze vsi jsou u své práce
    const first = planVillagers(v, GROUND, { seed: 3, herds: 0, dayWindow, weddings });
    const coming = first.filter((p) => p.key.startsWith('wedding:'));
    expect(coming.length).toBe(3);
    expect(coming.filter((p) => p.person === undefined)).toHaveLength(2);
    expect(coming.find((p) => p.person === 303)?.look.hair).toBe('wreath');
    expect(first.filter((p) => p.job?.kind === 'wedding' && p.job.role === 'guest')).toHaveLength(
      0,
    );
  });
});

describe('oráč, honák a vozka jsou lidé vsi (villagers.md – Výběr postavy)', () => {
  const CART = {
    id: 5,
    kind: 'two-wheel' as const,
    x: 40,
    z: -20,
    condition: 1,
    job: {
      activity: 'haul' as const,
      target: { kind: 'field' as const, id: 7 },
      load: 'sheaves' as const,
    },
    route: [
      { x: 40, z: -20 },
      { x: 30, z: 7 },
    ],
  };
  const DRAFT_SHARES: LaborShare[] = [
    { activity: 'plough', target: { kind: 'field', id: 7 }, manDays: 2 },
    { activity: 'haul', target: { kind: 'field', id: 7 }, manDays: 2 },
    { activity: 'harvest', target: { kind: 'field', id: 7 }, manDays: 3 },
    { activity: 'domestic', target: { kind: 'village' }, manDays: 4 },
  ];
  const draftVillage = (list = persons()): SceneVillage => ({
    ...village(DRAFT_SHARES, list),
    carts: [CART],
  });
  const OPTIONS = { seed: 5, herds: 2, paths: PATHS };

  it('spřežení dostane oráče (dospělý muž) a honáka (výrostek), vůz vozku – nikdo dvakrát', () => {
    const { people, crew } = planVillagersWithCrew(draftVillage(), GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    expect(crew.teams).toHaveLength(1);
    const { ploughman, leader } = crew.teams[0]!;
    const man = byId.get(ploughman!)!;
    expect(man.sex).toBe('male');
    expect(man.age).toBeGreaterThanOrEqual(14);
    expect(man.age).toBeLessThan(45);
    // honák je výrostek nejblíž LEADER_AGE z lidí, kteří dnes nepasou
    const boy = byId.get(leader!)!;
    expect(Math.abs(boy.age - LEADER_AGE)).toBeLessThanOrEqual(3);
    expect(crew.carts).toEqual([{ cart: 5, drover: expect.any(Number) }]);
    const drover = byId.get(crew.carts[0]!.drover!)!;
    expect(drover.age).toBeGreaterThanOrEqual(14);
    // nikdo není ve dvou postavách ani u spřežení a zároveň jinde
    const ids = [ploughman!, leader!, crew.carts[0]!.drover!];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(people.some((p) => p.person === id)).toBe(false);
    // vozka nahradil postavu u vozu (honák svozu) – nakladači u snopů zůstali
    expect(people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'plough')).toEqual(
      [],
    );
  });

  it('bez spřežení a vozů ve scéně (draft chybí) stejné postavy jako dřív, nikdo u spřežení', () => {
    const v = draftVillage();
    const before = planVillagers(v, GROUND, OPTIONS);
    const { people, crew } = planVillagersWithCrew(v, GROUND, OPTIONS);
    expect(crew).toEqual({ teams: [], carts: [] });
    expect(people.map((p) => [p.key, p.person])).toEqual(before.map((p) => [p.key, p.person]));
  });

  it('vůz výpravy (bez podílu svozu) dostane vozku s karavanou, vůz svozu taky', () => {
    const trade = { ...CART, id: 6, job: { ...CART.job, activity: 'trade' as const } };
    const v = { ...draftVillage(), carts: [CART, trade] };
    const { crew } = planVillagersWithCrew(v, GROUND, {
      ...OPTIONS,
      draft: { teams: 0, carts: [5, 6] },
    });
    expect(crew.carts.map((c) => c.cart).sort()).toEqual([5, 6]);
    expect(crew.carts.every((c) => c.drover !== null)).toBe(true);
  });

  it('spřežení a vozy jsou vidět celý den – lidé u nich mají přednost před prací vsi', () => {
    // pletí na celou ves a svoz s nepatrnou prací (voda – podíl bez postavy): vozka stejně je
    const shares: LaborShare[] = [
      { activity: 'weed', target: { kind: 'field', id: 7 }, manDays: 30 },
      { activity: 'haul', target: { kind: 'field', id: 7 }, manDays: 0.05 },
    ];
    const v = { ...village(shares), carts: [CART] };
    const { people, crew } = planVillagersWithCrew(v, GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    expect(crew.carts[0]!.drover).not.toBeNull();
    expect(crew.teams[0]!.ploughman).not.toBeNull();
    const weeders = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'weed');
    for (const id of [crew.carts[0]!.drover, crew.teams[0]!.ploughman]) {
      expect(weeders.some((p) => p.person === id)).toBe(false);
    }
  });

  it('málo lidí: kdo není, ten u spřežení chybí (null); bez lidí ve scéně nikdo', () => {
    const one = persons().filter((p) => p.id === 201);
    const { crew } = planVillagersWithCrew(draftVillage(one), GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    // jediný dospělý muž orá – honák a vozka nejsou
    expect(crew.teams[0]).toEqual({ ploughman: 201, leader: null });
    expect(crew.carts).toEqual([{ cart: 5, drover: null }]);
    // u spřežení je jen jednou – postavu ve vsi už nemá
    const people = planVillagers(draftVillage(one), GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    expect(people.some((p) => p.person === 201)).toBe(false);
    const v = draftVillage();
    const { persons: _persons, ...labor } = v.labor!;
    void _persons;
    const none = planVillagersWithCrew({ ...v, labor }, GROUND, {
      ...OPTIONS,
      draft: { teams: 2, carts: [5] },
    }).crew;
    expect(none.teams).toEqual([
      { ploughman: null, leader: null },
      { ploughman: null, leader: null },
    ]);
  });

  it('přiřazení je stálé v rámci dne – stejná ves, stejní lidé u spřežení', () => {
    const a = planVillagersWithCrew(draftVillage(), GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    const b = planVillagersWithCrew(draftVillage(), GROUND, {
      ...OPTIONS,
      draft: { teams: 1, carts: [5] },
    });
    expect(b.crew).toEqual(a.crew);
  });
});

describe('vojvodova rodina na dvorku (lord.md – Ve scéně)', () => {
  const DAY_S = 86.4;
  const window = { startMs: LIVESTOCK_EPOCH_MS, endMs: LIVESTOCK_EPOCH_MS + DAY_S * 1000 };
  const hour = (h: number): number => (h / 24) * DAY_S;
  const MANOR = {
    cell: { x: 0, y: 0 },
    x: 0,
    z: 0,
    size: 15,
    variant: 'center' as const,
    yard: { cell: { x: 0, y: 1 }, x: 0, z: 15 },
  };
  // pozemek dvorce s dvorem: x ∈ (−7,5; 7,5), z ∈ (−7,5; 22,5)
  const onManor = (x: number, z: number): boolean => Math.abs(x) < 7.5 && z > -7.5 && z < 22.5;

  function manorVillage(): SceneVillage {
    const v = village();
    v.dwellings[0] = { ...v.dwellings[0]!, plot: MANOR };
    v.labor!.lord = {
      home: 1,
      trainees: [
        { id: 101, bow: 1, combat: 1, riding: 1 },
        { id: 103, bow: 2, combat: 1, riding: 1 },
      ],
      household: [102],
    };
    return v;
  }

  const plan = (v: SceneVillage): PlannedVillager[] =>
    planVillagers(v, GROUND, { seed: 7, herds: 2, dayWindow: () => window });
  const pose = (p: PlannedVillager, t: number) => {
    const out = createVillagerPose();
    out.hidden = false;
    return p.pose(t, HERDS, out);
  };

  // den rodiny ve skutečném čase (lord-day.ts; villagers.md – Bez časosběru; Martin 1. 11. 2026:
  // „Koukám na vojvodu a ten mezi jednotlivými činnostmi mizí a zase se objevuje. A lukostřelbu
  // i boj cvičí velice krátce, skoro to není vidět“)
  const DT = 0.25;
  /** Póza po DT od `from` do `to` (s) – kopie. */
  const track = (p: PlannedVillager, from: number, to: number) => {
    const out: {
      t: number;
      x: number;
      z: number;
      hidden: boolean;
      clip: string;
      stage?: string;
    }[] = [];
    for (let t = from; t < to; t += DT) {
      const at = pose(p, t);
      out.push({ t, x: at.x, z: at.z, hidden: at.hidden === true, clip: at.clip, stage: at.stage });
    }
    return out;
  };
  /** Nejdelší souvislý úsek (s), kdy platí `test`. */
  const longest = (
    samples: ReturnType<typeof track>,
    test: (s: (typeof samples)[number]) => boolean,
  ) => {
    let best = 0;
    let run = 0;
    for (const s of samples) {
      run = test(s) ? run + DT : 0;
      best = Math.max(best, run);
    }
    return best;
  };
  const gameHour = (t: number): number => ((((t % DAY_S) + DAY_S) % DAY_S) / DAY_S) * 24;
  const CYCLE = LORD_CYCLE_S;
  // nejrychlejší přirozená chůze rodiny (vladař) a mez 1,3×
  const FASTEST = walkSpeed('man', 'walk-lord', FIGURE_SCALE) * 1.3;

  it('luk i boj trvají ve skutečném čase minuty, ne sekundy herní hodiny', () => {
    const people = plan(manorVillage());
    const lord = people.find((p) => p.person === 101)!;
    const boy = people.find((p) => p.person === 103)!;
    expect(lord.job).toEqual({ kind: 'lord', household: false });
    for (const who of [lord, boy]) {
      const day = track(who, 10 * CYCLE, 12 * CYCLE);
      // souvislý luk i boj aspoň minutu (dřív půl herní hodiny ≈ 1,8 s)
      expect(longest(day, (s) => s.stage === 'bow')).toBeGreaterThanOrEqual(60);
      expect(longest(day, (s) => s.stage === 'combat')).toBeGreaterThanOrEqual(60);
      for (const s of day) {
        if (s.stage === 'bow')
          expect(['bow-draw', 'bow-release', 'idle', 'walk']).toContain(s.clip);
        if (s.stage === 'combat') {
          expect(onManor(s.x, s.z)).toBe(true);
          expect(['sword-strike', 'shield-block', 'spear-thrust', 'idle']).toContain(s.clip);
        }
      }
    }
    // chlapec (luk 2 h) střílí déle než vojvoda (luk 1 h) – poměr z jádra
    const bowS = (who: PlannedVillager): number =>
      track(who, 10 * CYCLE, 12 * CYCLE).filter((s) => s.stage === 'bow').length * DT;
    expect(bowS(boy)).toBeGreaterThan(bowS(lord) * 1.5);
  });

  it('vojvoda nemizí – skrytý jen doma (ve dveřích dvorce), ve dne i v noci herního dne', () => {
    const people = plan(manorVillage());
    for (const id of [101, 103, 102]) {
      const who = people.find((p) => p.person === id)!;
      const day = track(who, 10 * CYCLE, 13 * CYCLE);
      // venku je vidět i v noci herního dne
      expect(day.some((s) => !s.hidden && (gameHour(s.t) < 5 || gameHour(s.t) > 21))).toBe(true);
      // zmizí a objeví se jen ve dveřích – tam, kde je doma
      for (let i = 1; i < day.length; i++) {
        const [a, b] = [day[i - 1]!, day[i]!];
        if (a.hidden !== b.hidden)
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${id} @${b.t}`).toBeLessThan(0.5);
      }
      // doma nejvýš pár minut v kuse, venku většinu cyklu
      expect(longest(day, (s) => s.hidden)).toBeLessThan(CYCLE / 2);
      expect(day.filter((s) => !s.hidden).length).toBeGreaterThan(day.length / 2);
    }
  });

  it('mezi dvorcem, terči, místem boje a stáním u dvorku chodí – nikdy rychleji než 1,3× chůze', () => {
    const people = plan(manorVillage());
    for (const id of [101, 103, 102]) {
      const day = track(
        people.find((p) => p.person === id)!,
        10 * CYCLE,
        13 * CYCLE,
      );
      for (let i = 1; i < day.length; i++) {
        const [a, b] = [day[i - 1]!, day[i]!];
        if (a.hidden || b.hidden) continue;
        expect(Math.hypot(b.x - a.x, b.z - a.z) / DT, `${id} @${b.t}`).toBeLessThanOrEqual(FASTEST);
      }
    }
  });

  it('vedlejší manželka (lord.md – Manželky): vojvoda dojde k jejímu domu, vejde, za čas vyjde a vrátí se', () => {
    const v = manorVillage();
    v.labor!.lord!.visit = { lordId: 101, homes: [2] };
    const lord = plan(v).find((p) => p.person === 101)!;
    const dist = (s: { x: number; z: number }): number => Math.hypot(s.x - 20, s.z);
    const day = track(lord, 10 * CYCLE, 12 * CYCLE);
    // u manželky (skrytý u jejího domu) aspoň minutu v kuse
    expect(longest(day, (s) => s.hidden && dist(s) < 6)).toBeGreaterThanOrEqual(60);
    // cestou tam i zpět chůzí vladaře
    expect(
      day.some((s) => !s.hidden && s.clip === 'walk-lord' && dist(s) > 6 && !onManor(s.x, s.z)),
    ).toBe(true);
    for (let i = 1; i < day.length; i++) {
      const [a, b] = [day[i - 1]!, day[i]!];
      if (a.hidden !== b.hidden) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.5);
      if (!a.hidden && !b.hidden)
        expect(Math.hypot(b.x - a.x, b.z - a.z) / DT).toBeLessThanOrEqual(FASTEST);
    }
    // výcvik zůstává
    expect(longest(day, (s) => s.stage === 'bow')).toBeGreaterThanOrEqual(60);
  });

  it('vojvoda (`lordId`) mimo výcvik stojí jako vladař – střídá stání se založenýma rukama', () => {
    const village = manorVillage();
    village.labor!.lord!.lordId = 101;
    const lord = plan(village).find((p) => p.person === 101)!;
    const clips = (who: PlannedVillager): Set<string> => {
      const out = new Set<string>();
      for (let t = 10 * LORD_CYCLE_S; t < 11 * LORD_CYCLE_S; t += 0.5) out.add(pose(who, t).clip);
      return out;
    };
    const lordClips = [...clips(lord)].filter((c) => c.startsWith('lord-idle-'));
    expect(lordClips.length).toBeGreaterThan(1);
    for (const other of plan(village).filter((p) => p.person !== 101)) {
      expect([...clips(other)].some((c) => c.startsWith('lord-'))).toBe(false);
    }
  });

  it('žena rodiny dělá domácí práce – nestojí na místě, z pozemku nevychází', () => {
    const wife = plan(manorVillage()).find((p) => p.person === 102)!;
    expect(wife.job).toEqual({ kind: 'lord', household: true });
    const clips = new Set<string>();
    const spots = new Set<string>();
    for (const at of track(wife, 10 * LORD_CYCLE_S, 11 * LORD_CYCLE_S)) {
      if (at.hidden) continue;
      expect(onManor(at.x, at.z)).toBe(true);
      clips.add(at.clip);
      spots.add(`${at.x.toFixed(1)},${at.z.toFixed(1)}`);
    }
    expect(clips.size).toBeGreaterThan(2);
    expect(spots.size).toBeGreaterThan(5);
  });

  it('nikdo z rodiny nejde do práce vsi; ostatní postavy na pozemku dvorce dál ne', () => {
    const people = plan(manorVillage());
    for (const id of [101, 102, 103]) {
      const own = people.filter((p) => p.person === id);
      expect(own).toHaveLength(1);
      expect(own[0]!.job?.kind).toBe('lord');
    }
    const others = people.filter((p) => p.job?.kind !== 'lord');
    expect(others.length).toBeGreaterThan(3);
    for (const p of others) {
      // i trasy ze simulace (pěšiny, provoz) a místa před domem míjejí dvůr dvorce
      for (let h = 0; h < 24; h += 0.25) {
        const at = pose(p, hour(h));
        if (!at.hidden) expect(onManor(at.x, at.z)).toBe(false);
      }
    }
  });

  it('bez rodiny dne (`labor.lord` chybí) nikdo na dvorku nestojí', () => {
    const v = manorVillage();
    delete v.labor!.lord;
    for (const p of plan(v)) {
      expect(p.job?.kind).not.toBe('lord');
      const at = pose(p, hour(9));
      if (!at.hidden) expect(onManor(at.x, at.z)).toBe(false);
    }
  });
});

describe('obsazení dne jako člověk → úloha (villagers.md – Divadlo)', () => {
  const CART = {
    id: 5,
    kind: 'two-wheel' as const,
    x: 40,
    z: -20,
    condition: 1,
    job: {
      activity: 'haul' as const,
      target: { kind: 'field' as const, id: 7 },
      load: 'sheaves' as const,
    },
    route: [
      { x: 40, z: -20 },
      { x: 30, z: 7 },
    ],
  };
  const MIXED: LaborShare[] = [
    ...SHARES,
    { activity: 'plough', target: { kind: 'field', id: 7 }, manDays: 2 },
    { activity: 'haul', target: { kind: 'field', id: 7 }, manDays: 2 },
  ];
  const jobSig = (job: PersonJob): string =>
    job.kind === 'share'
      ? `share:${job.activity}`
      : job.kind === 'traffic'
        ? `traffic:${job.traffic}`
        : job.kind === 'plough'
          ? `plough:${job.role}`
          : job.kind;
  const tally = (jobs: PersonJob[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const j of jobs) out[jobSig(j)] = (out[jobSig(j)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  };
  const figureJobs = (people: PlannedVillager[], crew: DraftCrew): PersonJob[] => [
    ...people.flatMap((p) => (p.person !== undefined && p.job ? [p.job] : [])),
    ...crew.teams.flatMap((t, k) => [
      ...(t.ploughman !== null ? [{ kind: 'plough', team: k, role: 'ploughman' } as const] : []),
      ...(t.leader !== null ? [{ kind: 'plough', team: k, role: 'leader' } as const] : []),
    ]),
    ...crew.carts.flatMap((c) =>
      c.drover !== null ? [{ kind: 'cart', cart: c.cart } as const] : [],
    ),
  ];
  // víc lidí – rolnické rodiny 2 a 3 ještě dvakrát (pořadí losu pak počty nemění)
  const shift = (p: RolePerson, by: number): RolePerson => ({
    ...p,
    id: p.id + by,
    ...(p.spouse !== undefined ? { spouse: p.spouse + by } : {}),
    ...(p.father !== undefined ? { father: p.father + by } : {}),
    ...(p.mother !== undefined ? { mother: p.mother + by } : {}),
  });
  const MANY = [
    ...PEOPLE,
    ...[1000, 2000].flatMap((by) =>
      PEOPLE.filter((p) => p.home === 2 || p.home === 3).map((p) => shift(p, by)),
    ),
  ];
  const CASES: { name: string; v: () => SceneVillage }[] = [
    { name: 'víc-lidí', v: () => village(MIXED, persons(MANY)) },
    {
      name: 'víc-lidí-den-1003',
      v: () => ({
        ...village(MIXED, persons(MANY)),
        labor: { ...village(MIXED, persons(MANY)).labor!, day: 1003 },
      }),
    },
    { name: 'ves', v: () => village() },
    {
      name: 'ves-den-1003',
      v: () => ({ ...village(), labor: { ...village().labor!, day: 1003 } }),
    },
    { name: 'spřežení-a-vůz', v: () => ({ ...village(MIXED), carts: [CART] }) },
    { name: 'málo-lidí', v: () => village(SHARES, persons(PEOPLE.filter((p) => p.home === 2))) },
  ];
  const plan = (v: SceneVillage): ReturnType<typeof planVillagersWithCrew> =>
    planVillagersWithCrew(v, GROUND, {
      seed: 5,
      herds: 2,
      paths: PATHS,
      draft: { teams: 1, carts: [5] },
    });

  /** Počty po pracích z dosavadního `planVillagersWithCrew` (ddeceded, los dne) – víc lidí. */
  const BEFORE = {
    cart: 1,
    elder: 2,
    fetch: 1,
    herd: 2,
    'plough:leader': 1,
    'plough:ploughman': 1,
    'share:build': 2,
    'share:craft': 1,
    'share:domestic': 2,
    'share:harvest': 3,
    'share:idle': 2,
    'traffic:water': 2,
  };

  it('počty po pracích jako dosud – úloha každého člověka je jeho postava dne', () => {
    for (const c of CASES) {
      const { people, crew, tasks } = plan(c.v());
      expect(tally([...tasks.values()].map((t) => t.job))).toEqual(tally(figureJobs(people, crew)));
      // výběr postavy sedí s tím, co postava dělá – táž úloha i místo
      for (const f of people) {
        if (f.person === undefined) continue;
        expect(tasks.get(f.person)!.job).toBe(f.job);
        expect(tasks.get(f.person)!.key).toBe(f.key);
      }
    }
    expect(tally([...plan(CASES[0]!.v()).tasks.values()].map((t) => t.job))).toEqual(BEFORE);
    expect(tally([...plan(CASES[1]!.v()).tasks.values()].map((t) => t.job))).toEqual(BEFORE);
  });

  it('stejná práce jiný den – tíž lidé u týchž úloh (stejný začátek = stejná úloha)', () => {
    const keys = (v: SceneVillage): string[] =>
      [...plan(v).tasks].map(([id, t]) => `${id}=${t.key}`).sort();
    expect(keys(CASES[0]!.v())).toEqual(keys(CASES[1]!.v()));
    expect(keys(CASES[2]!.v())).toEqual(keys(CASES[3]!.v()));
  });

  it('druhy úloh: u objektu pasák, oráč, honák, vozka, první stavitel; pochůzka; práce na místě', () => {
    const { tasks } = plan(CASES[0]!.v());
    for (const t of tasks.values()) {
      const kind = t.job.kind;
      if (kind === 'herd' || kind === 'plough' || kind === 'cart') expect(t.kind).toBe('hold');
      if (kind === 'traffic' || kind === 'fetch') expect(t.kind).toBe('errand');
      if (kind === 'traffic') expect(t.errand).not.toBeNull();
      if (kind === 'elder') expect([t.kind, t.range]).toEqual(['bout', 'short']);
      if (kind === 'share' && t.job.activity === 'harvest') {
        expect([t.kind, t.range]).toEqual(['bout', 'long']);
      }
      if (kind === 'share' && t.job.activity === 'domestic') expect(t.range).toBe('short');
      if (kind === 'plough' || kind === 'cart') expect(t.pose).toBeNull();
      else expect(t.at).not.toBeNull();
    }
    // stavitelé u stavby drží úlohu – nechodí mezi dávkami domů (Martin 15. 11. 2026)
    const build = [...tasks.values()].filter(
      (t) => t.job.kind === 'share' && t.job.activity === 'build',
    );
    expect(build.map((t) => t.kind)).toEqual(['hold', 'hold']);
  });

  it('role fází z plánu dne (villager-phases.ts): žnec váže snopy, starší a nečinní o žních na pole', () => {
    const { tasks } = plan(CASES[0]!.v());
    const reapers = [...tasks.values()].filter(
      (t) => t.job.kind === 'share' && t.job.activity === 'harvest',
    );
    const reapAt = reapers.map((t) => t.at);
    expect(reapers.map((t) => t.role)).toEqual(reapers.map(() => 'reap'));
    for (const t of tasks.values()) {
      if (t.job.kind === 'elder' || (t.job.kind === 'share' && t.job.activity === 'idle')) {
        // dnes se žne – pomoc o žních u některého žnece (místo z pózy žnece v začátku dne)
        expect(t.role).toBe(t.job.kind === 'elder' ? 'elder' : 'idle');
        expect(reapAt).toContainEqual(t.places!.aid);
      }
      if (t.job.kind === 'herd' || t.job.kind === 'traffic' || t.job.kind === 'cart') {
        expect(t.role).toBeUndefined();
      }
    }
    // stejný plán = stejné role a místa
    const again = plan(CASES[0]!.v()).tasks;
    for (const [id, t] of tasks) {
      expect([again.get(id)!.role, again.get(id)!.places]).toEqual([t.role, t.places]);
    }
  });

  it('rozvrh z obsazení dne: kdo v něm není, je doma; úloha činnosti = obsazení dne jejího začátku', () => {
    const T = 50_000;
    const day1 = plan(CASES[0]!.v()).tasks;
    // druhý den méně lidí (jen domácnost 2) – jiné obsazení
    const day2 = plan(CASES[5]!.v()).tasks;
    const input: ScheduleInput = {
      seed: 5,
      castOf: castTimeline([
        { from: T, cast: day1 },
        { from: T + 600, cast: day2 },
      ]),
      lengthOf: (_p, t) => ({ outS: t.at ? 40 : 10, endS: 5, backS: t.at ? 40 : 10 }),
    };
    let outside = 0;
    for (const p of persons(MANY)) {
      for (const a of activities(input, p.id, T)) {
        if (a.start > T + 1800) break;
        if (a.kind === 'home') continue;
        outside++;
        expect(input.castOf(a.start).cast.get(p.id)).toBe(a.task);
      }
    }
    expect(outside).toBeGreaterThan(20);
  });
});

// Roh domu (walk-network.md – Co zbylo; villagers.md – Bez časosběru): odhad simulace domy
// neobchází, cíl hned za domem by v rozvrhu dostal čas na chůzi rovně a postava by šla rohem domu
// (nebo běžela kolem) – rozvrh dostane délku schůdné trasy kolem domu.
describe('cíl hned za domem – rozvrh dá čas na obejití domu', () => {
  it('trasa kolem domu se přijme a délka rozvrhu ji pokryje', () => {
    const plan = planVillagersWithCrew(village(), GROUND, { seed: 7, herds: 0 });
    const door = plan.doors.get(2)!;
    const behind = { x: 20, z: -7 };
    const straight = Math.hypot(behind.x - door.x, behind.z - door.z);
    const walked = plan.walk(door, behind, 2);
    expect(walked).not.toBeNull();
    // obchází dům – delší, než by se za čas rovné chůze stihlo 1,3× chůzí
    expect(walked!.length).toBeGreaterThan(straight * 1.3);
    expect(plan.length(door, behind)).toBeGreaterThanOrEqual(walked!.length - 0.5);
  });
});
