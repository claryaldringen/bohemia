import { describe, expect, it } from 'vitest';
import type { Person, VillageState } from '../../village/types';
import type { AlarmFlight, AlarmMessenger } from '../alarm-types';
import type { CampaignState } from '../campaign-types';
import { marchGrid } from '../march-grid';
import { sceneFolkOf, warSceneView, type WarSceneFolk, type WarSceneInput } from '../scene-view';
import type { ShelterReport } from '../stance';
import { campaignView } from '../view';
import { wallPosts } from '../wall-defense';
import { attacker, battle, defender, field, land, palisade } from './battle-fixtures';
import { campaign, member } from './campaign-fixtures';

// Válka ve scéně (war.md – Ve scéně): padlí do konce dne, útěk vsi do lesa se stády, odehnané
// stádo s vojskem – vše po mlze války.

/** Les severně od vsi (z ≈ 75–135 m) – mřížka pochodu mapy cíle. */
const GRID = marchGrid(
  land((tx, ty) => tx >= 58 && tx <= 70 && ty >= 69 && ty <= 72),
  null,
  null,
);

const none = { sheep: 0, goat: 0, pig: 0, cow: 0 };

/** Útok p1 na Kněžice: útočníci u (0, 0), obránci podle `defenders`, skupiny na mapě cíle. */
function raiding(defenders: ReturnType<typeof defender>[]): CampaignState {
  const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
  return {
    ...base,
    phase: 'raiding',
    groups: base.groups.map((g) => ({ ...g, cell: { ...base.target.cell }, pos: { x: 0, z: 0 } })),
    battle: battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, mounted: true }),
        attacker(1, { x: 5, z: 0 }),
      ],
      defenders,
      commander: 0,
    }),
  };
}

/** Boj rozhodnutý v taktu dne `state.day` – d:101 padl, d:102 raněný, útočníci drží bojiště. */
function decided(): CampaignState {
  const s = raiding([defender(101, { x: 20, z: 0 }), defender(102, { x: 30, z: 0 })]);
  const b = s.battle!;
  for (const f of b.fighters) {
    if (f.id === 'd:101') Object.assign(f, { state: 'down', killed: true, health: 0 });
    if (f.id === 'd:102') Object.assign(f, { state: 'down', killed: false, health: 20 });
  }
  b.outcome = 'attackers';
  return { ...s, phase: 'returning', raidDay: s.day };
}

const defend = (state: CampaignState, o: Partial<WarSceneInput> = {}): WarSceneInput => ({
  cell: state.target.cell,
  side: 'defend',
  grid: GRID,
  eyes: [{ x: 0, z: -20 }],
  forts: [],
  ...o,
});

describe('warSceneView – padlí do konce dne', () => {
  it('po rozhodnutí boje leží padlí a sedí ranění vedle pochodu, stojící ne', () => {
    const s = decided();
    const view = warSceneView(s, defend(s))!;
    expect(view.battle?.outcome).toBe('attackers');
    expect(view.battle?.fighters.map((f) => [f.id, f.killed])).toEqual([
      ['d:101', true],
      ['d:102', false],
    ]);
    // raněný obránce sedí u domu (vlastní strana – domov se pošle)
    expect(view.battle?.fighters[1]?.home).toEqual({ x: 30, z: 0 });
    expect(view.battle?.groups).toEqual([]);
    expect(view.march?.members).toHaveLength(2);
  });

  it('další herní den padlí zmizí – zbude pochod', () => {
    const s = { ...decided(), day: decided().day + 1 };
    const view = warSceneView(s, defend(s))!;
    expect(view.battle).toBeNull();
    expect(view.march).not.toBeNull();
  });

  it('padlí druhé strany mimo dohled se nepošlou (mlha)', () => {
    const s = decided();
    const a1 = s.battle!.fighters.find((f) => f.id === 'a:1')!;
    Object.assign(a1, { state: 'down', killed: true, pos: { x: 600, z: 600 } });
    const view = warSceneView(s, defend(s))!;
    expect(view.battle?.fighters.map((f) => f.id)).not.toContain('a:1');
    // útočník své padlé vidí vždy
    const own = warSceneView(s, { ...defend(s), side: 'attack', eyes: [] })!;
    expect(own.battle?.fighters.map((f) => f.id)).toContain('a:1');
  });
});

/** Ves Kněžice: dva domy daleko od sebe (dvě skupiny domů), žena, muž, dítě 10 let a batole. */
function knezice(day: number): VillageState {
  const year = 365;
  const person = (id: number, dwellingId: number, age: number, sex: 'male' | 'female'): Person =>
    ({ id, dwellingId, bornDay: day - age * year - 10, sex }) as Person;
  return {
    dwellings: [
      { id: 1, position: { x: 0, z: -20, rotation: 0 } },
      { id: 2, position: { x: 100, z: -20, rotation: 0 } },
    ],
    people: [
      person(11, 1, 30, 'female'),
      person(12, 1, 32, 'male'),
      person(13, 1, 10, 'female'),
      person(14, 1, 3, 'male'),
      person(21, 2, 40, 'male'),
    ],
  } as unknown as VillageState;
}

describe('sceneFolkOf', () => {
  it('postava, dítě, nesení zásob a skupina domů jako v planDefense', () => {
    const s = raiding([]);
    const folk = sceneFolkOf(knezice(s.day), s.day);
    expect(folk.map((p) => [p.id, p.kind, p.child, p.carries, p.group])).toEqual([
      [11, 'woman', false, true, 0],
      [12, 'man', false, true, 0],
      [13, 'woman', true, true, 0],
      [14, 'man', true, false, 0],
      [21, 'man', false, true, 1],
    ]);
    expect(folk[4]?.home).toEqual({ x: 100, z: -20 });
  });
});

describe('warSceneView – útěk vsi do lesa', () => {
  const fled = (s: CampaignState, ids: number[], sheep = 0): CampaignState => {
    const shelter: ShelterReport = {
      stance: 'flee',
      refuge: [],
      forest: ids,
      surrendered: [],
      carriedKg: 50,
      livestockRefuge: none,
      livestockForest: { ...none, sheep },
    };
    s.battle!.shelter = shelter;
    s.battle!.openTick = s.tick - 3;
    return s;
  };
  const folkOf = (s: CampaignState): WarSceneFolk[] => sceneFolkOf(knezice(s.day), s.day);

  it('obránce vidí, kdo utekl, k jakému okraji lesa, od kdy a kolik dobytka hnali', () => {
    const s = fled(raiding([]), [11, 13, 21], 8);
    const view = warSceneView(s, defend(s, { folk: folkOf(s) }))!;
    const flight = view.flight!;
    expect(flight.startTick).toBe(s.tick - 3);
    expect(flight.herd).toBe(8);
    expect(flight.people.map((p) => [p.id, p.kind, p.child, p.carries, p.forest])).toEqual([
      [11, 'woman', false, true, 0],
      [13, 'woman', true, true, 0],
      [21, 'man', false, true, 1],
    ]);
    // okraj lesa severně od domu (les z ≈ 75–135 m)
    for (const f of flight.forests) expect(f.z).toBeGreaterThan(60);
    expect(flight.forests).toHaveLength(2);
    expect(flight.people[0]).not.toHaveProperty('group');
  });

  it('i po rozhodnutí boje (vedle pochodu); bez takt otevření u rozhodnutého neznámo', () => {
    const s = fled(decided(), [11]);
    expect(warSceneView(s, defend(s, { folk: folkOf(s) }))!.flight?.startTick).toBe(s.tick - 3);
    delete s.battle!.openTick;
    expect(warSceneView(s, defend(s, { folk: folkOf(s) }))!.flight?.startTick).toBeNull();
    // starší stav s běžícím bojem – z počtu taktů boje
    const old = fled(raiding([defender(101, { x: 20, z: 0 })]), [11]);
    delete old.battle!.openTick;
    old.battle!.ticks = 5;
    expect(warSceneView(old, defend(old, { folk: folkOf(old) }))!.flight?.startTick).toBe(
      old.tick - 4,
    );
  });

  it('útočník útěk nedostane; bez mřížky (les neznámý) ani bez utečených nic', () => {
    const s = fled(raiding([]), [11, 12]);
    const folk = folkOf(s);
    expect(warSceneView(s, { ...defend(s, { folk }), side: 'attack' })!.flight).toBeUndefined();
    expect(warSceneView(s, defend(s, { folk, grid: null }))!.flight).toBeUndefined();
    expect(warSceneView(fled(raiding([]), []), defend(s, { folk }))!.flight).toBeUndefined();
  });
});

describe('warSceneView – odehnané stádo', () => {
  /** Vojsko se vrací s kořistí: skupina 0 u (0, 0), skupina 1 daleko (600, 600). */
  function returning(herd: number): CampaignState {
    const base = campaign({ members: [member(1, 0, true), member(2, 1, false)] });
    const groups = [
      { ...base.groups[0]!, id: 0, cell: { ...base.target.cell }, pos: { x: 0, z: 0 } },
      { ...base.groups[0]!, id: 1, cell: { ...base.target.cell }, pos: { x: 600, z: 600 } },
    ];
    return { ...base, phase: 'returning', groups, loot: { foodKg: 30, herd } };
  }

  it('jde se skupinou vojska – útočník ho vidí vždy', () => {
    const s = returning(12);
    const view = warSceneView(s, { ...defend(s), side: 'attack', eyes: [] })!;
    expect(view.march?.herd).toEqual({ group: 0, count: 12 });
  });

  it('obránce jen v dohledu jeho skupiny; bez kořisti nic', () => {
    const s = returning(12);
    expect(warSceneView(s, defend(s))!.march?.herd).toEqual({ group: 0, count: 12 });
    // skupina se stádem mimo dohled, druhá v něm – stádo se nepošle
    const far: CampaignState = {
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        pos: g.id === 0 ? { x: 600, z: 600 } : { x: 0, z: 0 },
      })),
    };
    const hidden = warSceneView(far, defend(far))!;
    expect(hidden.march?.groups.map((g) => g.id)).toEqual([1]);
    expect(hidden.march?.herd).toBeUndefined();
    const empty = returning(0);
    expect(warSceneView(empty, defend(empty))!.march?.herd).toBeUndefined();
  });
});

describe('warSceneView – kryt, vzdaní a rozkaz „Probít se“', () => {
  // palisáda s ochozem a bránou kolem počátku (60 × 60 m); obránci na stanovištích hradby
  const forts = field([{ ...palisade(true), kind: 'walkway' }]).forts;
  function walled(): CampaignState {
    const posts = wallPosts(forts, 3);
    const s = raiding([
      ...posts.map((p, i) => defender(201 + i, p, { post: p, onWall: true })),
      defender(299, { x: 900, z: 900 }),
    ]);
    const men = new Map(s.battle!.fighters.map((f) => [f.id, f]));
    men.get('d:201')!.cover = true;
    Object.assign(men.get('d:202')!, { state: 'fled', surrendered: true });
    Object.assign(men.get('d:299')!, { state: 'fled', surrendered: true });
    return s;
  }

  it('obránce vidí své muže v krytu i vzdané a smí rozkázat „Probít se“', () => {
    const s = walled();
    const view = warSceneView(s, defend(s, { forts }))!;
    const seen = new Map(view.battle!.fighters.map((f) => [f.id, f]));
    expect(seen.get('d:201')).toMatchObject({ cover: true, onWall: true });
    expect(seen.get('d:202')).toMatchObject({ state: 'fled', surrendered: true });
    expect(seen.get('d:203')).not.toHaveProperty('cover');
    expect(view.breakout).toEqual({ blocked: null });
    // bez brány tlačítko není; rozhodnutý boj – „Boj neběží“
    expect(warSceneView(s, defend(s))!.breakout).toBeUndefined();
    s.battle!.outcome = 'attackers';
    s.raidDay = s.day;
    expect(warSceneView(s, defend(s, { forts }))!.breakout).toEqual({ blocked: 'over' });
  });

  it('útočník vidí cizí kryjící se a vzdané jen v dohledu; rozkaz obráncům nedostane', () => {
    const s = walled();
    const view = warSceneView(s, { ...defend(s, { forts }), side: 'attack', eyes: [] })!;
    const seen = new Map(view.battle!.fighters.map((f) => [f.id, f]));
    expect(seen.get('d:201')?.cover).toBe(true);
    expect(seen.get('d:202')?.surrendered).toBe(true);
    // vzdaný daleko mimo dohled se nepošle
    expect(seen.has('d:299')).toBe(false);
    expect(view.breakout).toBeUndefined();
  });
});

// Ú14 – průvod uprchlíků a posel ve scéně (war.md – Varování, poslové a útěk do hradiště)

const YEAR = 365;

/** Kněžice (hráč p9) varované; skupina uprchlíků a posel na mapě vsi; vojsko p1 u (0, 0) nebo jinde. */
function alarmed(
  o: {
    flight?: Partial<AlarmFlight>;
    messenger?: Partial<AlarmMessenger>;
    army?: 'here' | 'away';
  } = {},
): CampaignState {
  const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
  const cell = base.target.cell;
  const day = base.day;
  const flight: AlarmFlight = {
    refId: 'c1:a1',
    villageId: 'knezice',
    mode: 'all',
    hostVillageId: 'hradek',
    cell: { ...cell },
    pos: { x: 120, z: -40 },
    route: [{ x: 2, y: 0 }],
    leg: {
      points: [
        { x: 100, z: -40 },
        { x: 300, z: -40 },
      ],
      meadowM: [0, 200],
      walkedM: 20,
    },
    target: { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
    people: [
      { id: 1, bornDay: day - 30 * YEAR, man: true, line: true },
      { id: 2, bornDay: day - 28 * YEAR, man: false, line: false },
      { id: 3, bornDay: day - 9 * YEAR, man: false, line: false },
      { id: 4, bornDay: day - 4 * YEAR, man: false, line: false },
      { id: 5, bornDay: day - 40 * YEAR, man: true, line: false },
    ],
    foodKg: 300,
    herd: { sheep: 3, goat: 1, pig: 0, cow: 2 },
    carts: 1,
    status: 'marching',
    departTick: base.tick,
    lost: [5],
    ...o.flight,
  };
  const messenger: AlarmMessenger = {
    refId: 'c1:a2',
    fromVillageId: 'knezice',
    personId: 1,
    toVillageId: 'hradek',
    mounted: true,
    status: 'running',
    departTick: base.tick,
    cell: { ...cell },
    pos: { x: -200, z: 300 },
    route: [{ x: 2, y: 0 }],
    leg: null,
    target: { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
    ...o.messenger,
  };
  const armyCell = o.army === 'here' ? { ...cell } : { ...base.assembly.cell };
  return {
    ...base,
    phase: 'marching',
    groups: base.groups.map((g) => ({ ...g, cell: armyCell, pos: { x: 0, z: 0 } })),
    alarm: {
      villages: [
        {
          villageId: 'knezice',
          owner: { playerId: 'p9', npc: false, houseId: 'h9' },
          seenTick: base.tick,
          seenAt: { cell: { ...cell }, pos: { x: 0, z: 0 } },
          warnTick: base.tick,
          by: 'villager',
          messenger: 'c1:a2',
          flight: 'c1:a1',
        },
      ],
      messengers: [messenger],
      flights: [flight],
      nextRef: 3,
    },
  };
}

/** Pohled hráče `playerId` ze strany `side` na mapě Kněžic (domy daleko od skupiny). */
const onKnezice = (
  state: CampaignState,
  side: 'attack' | 'defend',
  playerId: string,
): WarSceneInput => ({
  cell: state.target.cell,
  side,
  grid: GRID,
  eyes: side === 'defend' ? [{ x: -900, z: -900 }] : [],
  forts: [],
  playerId,
});

describe('warSceneView – průvod uprchlíků a posel (Ú14)', () => {
  it('obránce vidí svou skupinu vždy – lidé, vzhled, směr, stádo a vozy; vojsko jinde', () => {
    const s = alarmed();
    const view = warSceneView(s, onKnezice(s, 'defend', 'p9'))!;
    expect(view.battle).toBeNull();
    expect(view.march).toBeNull();
    const [m] = view.refugeMarch!;
    expect(m).toMatchObject({
      refId: 'c1:a1',
      own: true,
      mode: 'all',
      pos: { x: 120, z: -40 },
      heading: { x: 1, z: 0 },
      moving: true,
      herd: 6,
      carts: 1,
    });
    // padlý (`lost`) nejde; dítě 4 let nic nenese, dívka 9 let ano (id liché = chlapec)
    expect(m!.people).toEqual([
      { kind: 'man', child: false, carries: true },
      { kind: 'woman', child: false, carries: true },
      { kind: 'man', child: true, carries: true },
      { kind: 'woman', child: true, carries: false },
    ]);
    expect(view.messengers).toEqual([
      {
        refId: 'c1:a2',
        own: true,
        pos: { x: -200, z: 300 },
        heading: { x: 0, z: 1 },
        mounted: true,
      },
    ]);
  });

  it('„jen lidé“ nic nenesou; ukrytí v lese stojí – vlastní je vidí', () => {
    const s = alarmed({ flight: { mode: 'people', status: 'hidden', leg: null } });
    const [m] = warSceneView(s, onKnezice(s, 'defend', 'p9'))!.refugeMarch!;
    expect(m!.moving).toBe(false);
    expect(m!.people.every((p) => !p.carries)).toBe(true);
  });

  it('útočník průvod a posla mimo dohled nevidí; bez vojska na mapě nic', () => {
    const away = alarmed();
    expect(warSceneView(away, onKnezice(away, 'attack', 'p1'))).toBeNull();
    const here = alarmed({ army: 'here' });
    const view = warSceneView(here, onKnezice(here, 'attack', 'p1'))!;
    expect(view.march).not.toBeNull();
    // skupina 126 m od vojska (dohled 150 m), posel 360 m – jen skupina
    expect(view.refugeMarch?.map((m) => [m.refId, m.own])).toEqual([['c1:a1', false]]);
    expect(view.messengers).toBeUndefined();
  });

  it('útočník v dohledu vidí posla; ukrytou skupinu ani na dohled ne', () => {
    const s = alarmed({
      army: 'here',
      flight: { status: 'hidden' },
      messenger: { pos: { x: 60, z: 30 } },
    });
    const view = warSceneView(s, onKnezice(s, 'attack', 'p1'))!;
    expect(view.refugeMarch).toBeUndefined();
    expect(view.messengers?.map((m) => [m.refId, m.own, m.mounted])).toEqual([
      ['c1:a2', false, true],
    ]);
  });

  it('cizí hráč na mapě vsi vidí jen v dohledu svých domů; jiná mapa, hradiště a chycení nic', () => {
    const s = alarmed();
    // jiný hráč, domy daleko – nic
    expect(warSceneView(s, onKnezice(s, 'defend', 'p7'))).toBeNull();
    // domy u skupiny – vidí ji jako cizí
    const near = { ...onKnezice(s, 'defend', 'p7'), eyes: [{ x: 100, z: -40 }] };
    expect(warSceneView(s, near)?.refugeMarch?.[0]?.own).toBe(false);
    const elsewhere = { ...onKnezice(s, 'defend', 'p9'), cell: { x: 5, y: 5 } };
    expect(warSceneView(s, elsewhere)).toBeNull();
    const done = alarmed({ flight: { status: 'arrived' }, messenger: { status: 'caught' } });
    expect(warSceneView(done, onKnezice(done, 'defend', 'p9'))).toBeNull();
  });
});

describe('campaignView – uprchlíci a poslové v dohledu (Ú14 – mapa tažení)', () => {
  const input = { playerId: 'p1', sinceTick: 0, grid: GRID, buildings: [] };

  it('útočník vidí skupinu v dohledu svých mužů – poloha, lidí, kusů; posla mimo dohled ne', () => {
    const view = campaignView(alarmed({ army: 'here' }), input)!;
    expect(view.flights).toEqual([
      {
        refId: 'c1:a1',
        kind: 'refugees',
        cell: { x: 1, y: 0 },
        pos: { x: 120, z: -40 },
        people: 4,
        herd: 6,
        mounted: false,
      },
    ]);
  });

  it('posel v dohledu; vojsko na jiné mapě ani ukrytí nic', () => {
    const near = campaignView(
      alarmed({ army: 'here', flight: { status: 'hidden' }, messenger: { pos: { x: 40, z: 0 } } }),
      input,
    )!;
    expect(near.flights?.map((f) => [f.kind, f.people, f.mounted])).toEqual([
      ['messenger', 1, true],
    ]);
    expect(campaignView(alarmed(), input)!.flights).toBeUndefined();
  });
});

describe('warSceneView – seesAll (vojvoda doma)', () => {
  /** Vojsko stojí na mapě vsi 900 m od očí obránce – mimo dohled. */
  function distant(): CampaignState {
    const base = campaign({ members: [member(1, 0, true)] });
    return {
      ...base,
      phase: 'marching',
      groups: base.groups.map((g) => ({
        ...g,
        cell: { ...base.target.cell },
        pos: { x: 900, z: 900 },
      })),
    };
  }

  it('skupinu mimo dohled domů ukáže jen se seesAll', () => {
    const s = distant();
    expect(warSceneView(s, defend(s))).toBeNull();
    expect(warSceneView(s, defend(s, { seesAll: true }))?.march?.groups.map((g) => g.id)).toEqual([
      s.groups[0]!.id,
    ]);
  });

  it('boj má dál přednost před pochodem a seesAll ukáže i vzdálené bojovníky', () => {
    const s = raiding([defender(101, { x: 20, z: 0 })]);
    s.battle!.fighters.find((f) => f.id === 'a:1')!.pos = { x: 900, z: 900 };
    const ids = (o: Partial<WarSceneInput>): string[] =>
      warSceneView(s, defend(s, o))!.battle!.fighters.map((f) => f.id);
    expect(ids({})).not.toContain('a:1');
    expect(ids({ seesAll: true })).toContain('a:1');
    expect(warSceneView(s, defend(s, { seesAll: true }))!.march).toBeNull();
  });
});
