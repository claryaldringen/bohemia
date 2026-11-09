import { describe, expect, it } from 'vitest';
import type { Person, VillageState } from '../../village/types';
import type { CampaignState } from '../campaign-types';
import { marchGrid } from '../march-grid';
import { sceneFolkOf, warSceneView, type WarSceneFolk, type WarSceneInput } from '../scene-view';
import type { ShelterReport } from '../stance';
import { attacker, battle, defender, land } from './battle-fixtures';
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
