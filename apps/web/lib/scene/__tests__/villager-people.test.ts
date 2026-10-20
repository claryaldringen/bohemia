import { describe, expect, it } from 'vitest';
import { personRoles, type RolePerson } from '../../person-roles';
import type { ScenePerson } from '../../person-view';
import type { LaborShare, SceneExpedition, SceneVillage } from '../../village-view';
import type { SceneWedding } from '../../wedding-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { createVillagerPose, villagerSeconds, type HerdView } from '../villager-motion';
import { pickPerson } from '../villager-pick';
import {
  planFunerals,
  planVillagers,
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
});

describe('DayRoster – lidé dne k postavám', () => {
  it('nikdo dvakrát, preferovaná domácnost a pohlaví, dílna jen ke své práci', () => {
    const roster = new DayRoster(persons(), 3, 1000, new Set([31]));
    const first = roster.take({ ...ADULTS, sex: 'female', preferHome: 2 })!;
    expect(first.id).toBe(202);
    expect(roster.takeId(202)).toBeNull();
    // z kovárny do práce vsi nikdo
    const taken: number[] = [];
    for (let p = roster.take(ADULTS); p; p = roster.take(ADULTS)) taken.push(p.home);
    expect(taken).not.toContain(31);
    expect(roster.take({ ...ADULTS, homes: new Set([31]) })).not.toBeNull();
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
