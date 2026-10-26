import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneExpedition, SceneVillage } from '../../village-view';
import type { SceneWedding } from '../../wedding-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { createVillagerPose, villagerSeconds, type HerdView } from '../villager-motion';
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
import { ADULTS, DayRoster, YOUNGSTERS } from '../villager-roster';

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
    const roster = new DayRoster(persons(), 3, 1000, new Set([31]));
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

  it('pořadí je los ze seedu a dne – stejný den stejné, jiný den jiné', () => {
    const order = (day: number): number[] => {
      const roster = new DayRoster(persons(), 3, day);
      const out: number[] = [];
      for (let p = roster.take(ADULTS); p; p = roster.take(ADULTS)) out.push(p.id);
      return out;
    };
    expect(order(1000)).toEqual(order(1000));
    const days = [1001, 1002, 1003, 1004].map((d) => order(d).join());
    expect(days.some((d) => d !== order(1000).join())).toBe(true);
  });
});

describe('planVillagers s lidmi vsi – kdo je která postava', () => {
  const plan = (v: SceneVillage = village()): PlannedVillager[] =>
    planVillagers(v, GROUND, { seed: 5, herds: 2, paths: PATHS });

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
    // kovářova rodina na poli nepracuje
    const field = people.filter((p) => p.job?.kind === 'share' && p.job.activity === 'harvest');
    for (const f of field) expect(personOf(f).home).not.toBe(31);
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
    const people = plan({ ...village(), expeditions: [iron] });
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
    const caravan = plan({ ...village(), expeditions: [trade] }).filter((p) =>
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

  it('cvičící jsou na dvorku jen ve dne a jen v hodinách výcviku, ženy rodiny u dvorce', () => {
    const people = plan(manorVillage());
    const lord = people.find((p) => p.person === 101)!;
    const boy = people.find((p) => p.person === 103)!;
    const wife = people.find((p) => p.person === 102)!;
    expect(lord.job).toEqual({ kind: 'lord', household: false });
    expect(wife.job).toEqual({ kind: 'lord', household: true });
    // 8:15 – luk na dvorku
    const shot = pose(lord, hour(8.25));
    expect(shot.hidden).toBe(false);
    expect(onManor(shot.x, shot.z)).toBe(true);
    expect(['bow-draw', 'bow-release', 'idle']).toContain(shot.clip);
    expect(shot.stage).toBe('bow');
    // 8:45 – vojvoda (luk 0,5 h v bloku) už bojuje, chlapec ještě střílí
    expect(pose(lord, hour(8.75)).stage).toBe('combat');
    expect(['sword-strike', 'shield-block', 'spear-thrust']).toContain(pose(lord, hour(8.75)).clip);
    expect(pose(boy, hour(8.75)).stage).toBe('bow');
    // mimo bloky ve dne (jízda, poledne, večer) stojí u dvorku na pozemku, skrytí jsou jen v noci
    for (const h of [10.5, 12, 17.5]) {
      for (const who of [lord, boy]) {
        const at = pose(who, hour(h));
        expect(at.hidden).toBe(false);
        expect(onManor(at.x, at.z)).toBe(true);
        expect(at.clip).toBe('idle');
        expect(at.stage).not.toBe('bow');
      }
    }
    for (const h of [2, 5, 22]) {
      expect(pose(lord, hour(h)).hidden).toBe(true);
      expect(pose(boy, hour(h)).hidden).toBe(true);
    }
    // žena rodiny ve dne u dvorce (uvnitř pozemku), v noci doma
    const home = pose(wife, hour(11));
    expect(home.hidden).toBe(false);
    expect(onManor(home.x, home.z)).toBe(true);
    expect(pose(wife, hour(23)).hidden).toBe(true);
  });

  it('vedlejší manželka (lord.md – Manželky): vojvoda večer jde k jejímu domu, přes noc tam je, ráno se vrací', () => {
    const v = manorVillage();
    v.labor!.lord!.visit = { lordId: 101, home: 2 };
    const people = plan(v);
    const lord = people.find((p) => p.person === 101)!;
    const boy = people.find((p) => p.person === 103)!;
    const dist = (x: number, z: number): number => Math.hypot(x - 20, z);
    // výcvik se nemění (8:15 luk na dvorku), poledne a odpoledne stojí u dvorku
    expect(pose(lord, hour(8.25)).stage).toBe('bow');
    expect(onManor(pose(lord, hour(12)).x, pose(lord, hour(12)).z)).toBe(true);
    // 19–20 h jde po cestě od dvorku k domu 2 (na pozemku dvorce začíná, u domu 2 končí)
    const start = pose(lord, hour(19.01));
    const mid = pose(lord, hour(19.5));
    const end = pose(lord, hour(19.99));
    expect(mid.hidden).toBe(false);
    expect(mid.clip).toBe('walk');
    expect(dist(mid.x, mid.z)).toBeLessThan(dist(start.x, start.z));
    expect(dist(end.x, end.z)).toBeLessThan(dist(mid.x, mid.z));
    expect(dist(end.x, end.z)).toBeLessThan(6);
    // v noci v domě manželky (skrytý), ráno 7–8 h jde zpět a od 8 h cvičí
    for (const h of [21, 2, 6.5]) expect(pose(lord, hour(h)).hidden).toBe(true);
    const back = pose(lord, hour(7.5));
    expect(back.hidden).toBe(false);
    expect(back.clip).toBe('walk');
    expect(dist(back.x, back.z)).toBeGreaterThan(dist(end.x, end.z));
    // ostatní se nemění – chlapec je večer skrytý jako dřív
    expect(pose(boy, hour(19.5)).hidden).toBe(true);
  });

  it('bez vedlejších manželek (bez `visit`) vojvoda večer nechodí – skrytý od 19 h jako dřív', () => {
    const lord = plan(manorVillage()).find((p) => p.person === 101)!;
    expect(pose(lord, hour(19.5)).hidden).toBe(true);
    const morning = pose(lord, hour(7.5));
    expect(onManor(morning.x, morning.z)).toBe(true);
    expect(morning.clip).toBe('idle');
  });

  it('žena rodiny dělá domácí práce – celý den nestojí na místě, z pozemku nevychází', () => {
    const wife = plan(manorVillage()).find((p) => p.person === 102)!;
    const clips = new Set<string>();
    const spots = new Set<string>();
    for (let h = 7; h < 19; h += 0.05) {
      const at = pose(wife, hour(h));
      expect(at.hidden).toBe(false);
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
