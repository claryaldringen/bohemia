import { describe, expect, it } from 'vitest';
import { refugeCapacity } from '../../village/fortification';
import type { Fortification } from '../../village/fortification/types';
import { applyInboxDay, type VillageEventBody } from '../../village/core/inbox';
import type { Dwelling, HerdSpecies, Person, VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { defenderRoster, type GuardGuest } from '../defenders';
import { guardPrisonerKey } from '../raid-apply';
import { planDefense, type Sighted, type StancePlan } from '../stance';
import { DAY, field, fortOf, palisade } from './battle-fixtures';
import { campaign, flat, LAUNCH, member, SET_OUT, SUMMER, world } from './campaign-fixtures';

// Pobyt v hradišti – místo v útočišti a obrana (war.md – Varování, poslové a útěk do hradiště –
// Místo v hradišti; plán 2026-11-09, Úloha 9): muži uprchlíků od 16 let brání hradiště jako hosté
// z ochrany, ženy, děti a jejich dobytek zabírají útočiště až za domácími (stáda první venku).

const house = (id: number, x: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z: 0, rotation: 0 },
});

const REF = 'c0:a1';
const herd = (sheep: number, cow: number): Record<HerdSpecies, number> => ({
  sheep,
  goat: 0,
  pig: 0,
  cow,
});
const foes = (n: number): Sighted[] =>
  Array.from({ length: n }, (_, i) => ({ pos: { x: 0, z: -800 + i }, mounted: false }));

/** Hradiště: 5 mužů, 8 žen a 7 dětí v domě 70 m od středu. */
function hradiste(): VillageState {
  const people = [
    ...[1, 2, 3, 4, 5].map((id) => kin({ id, age: 30, sex: 'male', home: 1 }, DAY)),
    ...Array.from({ length: 15 }, (_, i) =>
      kin({ id: 10 + i, age: i < 8 ? 28 : 6, sex: 'female', home: 1 }, DAY),
    ),
  ];
  return village(people, [house(1, 70)], { lastDay: DAY, storesKg: 500 });
}

/** Muži uprchlíků z Lhotky – hosté druhu `refuge` pod čísly −1, −2, … */
function refugeeMen(n: number): GuardGuest[] {
  return Array.from({ length: n }, (_, i) => ({
    id: -(i + 1),
    person: {
      ...kin({ id: 100 + i, age: 25 + i, sex: 'male' }, DAY),
      away: { kind: 'refuge' as const, hostVillageId: 'hradiste', refId: REF },
    },
    refugee: true as const,
  }));
}

function plan(
  state: VillageState,
  fort: Fortification,
  guests: GuardGuest[] = [],
  load?: { people: number; herd: Record<HerdSpecies, number> },
): StancePlan {
  return planDefense({
    state,
    day: DAY,
    stance: 'defend',
    defenders: defenderRoster(state, DAY, { guests }),
    attackers: foes(3),
    field: field([fort]),
    ...(load ? { refugeLoad: load } : {}),
  });
}

describe('muži uprchlíků na hradbě', () => {
  it('(a) 20 domácích a 15 uprchlíků (6 mužů) – muži uprchlíků obsadí hradbu, obsazenost roste', () => {
    const fort = fortOf('walkway');
    const alone = plan(hradiste(), fort);
    const posted = alone.fighters.filter((f) => f.post !== undefined);
    expect(posted.map((f) => f.personId)).toEqual([1, 2, 3, 4, 5]);

    const r = plan(hradiste(), fort, refugeeMen(6), { people: 9, herd: herd(0, 0) });
    const refugees = r.fighters.filter((f) => f.personId < 0);
    expect(refugees.map((f) => f.personId).sort((a, b) => b - a)).toEqual([-1, -2, -3, -4, -5, -6]);
    for (const f of refugees) {
      expect(f.post).toEqual(f.pos);
      expect(f.onWall).toBe(true);
      // vesničan uprchlíků bojuje silou vesničana, bez luku
      expect(f.line).toBe(false);
      expect(f.bow).toBe(false);
      expect(f.refugee).toBe(true);
    }
    expect(r.fighters.filter((f) => f.post !== undefined)).toHaveLength(11);
    expect(r.shelter.refuge).toHaveLength(20 + 6);
    expect(r.shelter.refugees).toEqual({
      inside: 9,
      outside: 0,
      herdInside: herd(0, 0),
      herdOutside: herd(0, 0),
    });
  });

  it('muž rodu mezi uprchlíky bojuje jako muž rodu s lukem', () => {
    const [guest] = refugeeMen(1);
    guest!.person.line = true;
    const [d] = defenderRoster(village([], [house(1, 70)], { lastDay: DAY }), DAY, {
      guests: [guest!],
    });
    expect(d).toMatchObject({ personId: -1, line: true, bow: true, guest: true, refugee: true });
  });
});

describe('místo v útočišti', () => {
  it('(b) malé útočiště – domácí uvnitř, uprchlíci napřed, dobytek venku (stáda první)', () => {
    const fort = palisade(true);
    const cap = refugeCapacity(field([fort]).geo, fort);
    // domácí zaberou všechno až na 30–40 m²: 2 muži uprchlíků, 1 z 5 žen a dětí, dobytek nic
    const n = Math.floor(cap / 10) - 3;
    const crowd: Person[] = Array.from({ length: n }, (_, i) =>
      kin({ id: i + 1, age: 30, sex: i % 2 ? 'female' : 'male', home: 1 }, DAY),
    );
    const livestock = { herds: herd(10, 3), young: herd(0, 0) };
    const home = (): VillageState =>
      village(structuredClone(crowd), [house(1, 70)], { lastDay: DAY, livestock });
    const without = plan(home(), fort);
    const r = plan(home(), fort, refugeeMen(2), { people: 5, herd: herd(4, 2) });
    const ids = new Set(r.shelter.refuge);
    expect(crowd.every((p) => ids.has(p.id))).toBe(true);
    expect(ids.has(-1) && ids.has(-2)).toBe(true);
    expect(r.shelter.refugees).toEqual({
      inside: 1,
      outside: 4,
      herdInside: herd(0, 0),
      herdOutside: herd(4, 2),
    });
    const heads = (h: Record<HerdSpecies, number>): number => h.sheep + h.goat + h.pig + h.cow;
    expect(heads(r.shelter.livestockRefuge)).toBeLessThan(heads(without.shelter.livestockRefuge));
    // bez uprchlíků se nic nemění
    expect(without.shelter.refugees).toBeUndefined();
  });
});

// --- boj u hradiště: ztráty mužů uprchlíků jdou do domovské vsi (jako hosté z ochrany) ---

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };

/** Lhotka – domov uprchlíků: muž rodu 20, vesničan 21 a žena 22 jsou v hradišti Kněžice. */
function lhotka(): VillageState {
  const away = { kind: 'refuge' as const, hostVillageId: 'knezice', refId: REF };
  const v = village(
    [
      { ...kin({ id: 20, age: 25, sex: 'male' }, SUMMER), line: true, name: 'Vlk', away },
      { ...kin({ id: 21, age: 30, sex: 'male' }, SUMMER), away: { ...away } },
      { ...kin({ id: 22, age: 28, sex: 'female' }, SUMMER), away: { ...away } },
      kin({ id: 23, age: 60, sex: 'female' }, SUMMER),
    ],
    undefined,
    { lastDay: SUMMER },
  );
  v.people[0]!.arms = { bow: 0, combat: 10, riding: 0 };
  return v;
}

/** Kněžice (hradiště bez opevnění – boj u dvorce): žena a dítě, tři uprchlíci z Lhotky. */
function knezice(stance: 'defend' | 'flee'): VillageState {
  const v = village(
    [
      kin({ id: 2, age: 28, sex: 'female' }, SUMMER),
      kin({ id: 3, age: 5, sex: 'male', mother: 2 }, SUMMER),
    ],
    undefined,
    { lastDay: SUMMER, storesKg: 500, defense: { stance } },
  );
  v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
  const home = lhotka();
  v.guests = [20, 21, 22].map((personId) => ({
    ref: { villageId: 'lhotka', personId },
    kind: 'refuge' as const,
    untilDay: SUMMER + 100_000,
    adult: true as const,
    bornDay: home.people.find((p) => p.id === personId)!.bornDay,
  }));
  v.refugeStays = [
    {
      refId: REF,
      fromVillageId: 'lhotka',
      fromName: 'Lhotka',
      people: [20, 21, 22],
      foodKg: 40,
      herd: herd(3, 1),
      arrivedDay: SUMMER - 1,
    },
  ];
  return v;
}

function raidWorld(target: VillageState, home: VillageState): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? TARGET : MEADOW),
    villageAt: (id) => (id === 'knezice' ? target : id === 'lhotka' ? home : null),
  };
}

const START = campaign({
  assembly: { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
  target: { villageId: 'knezice', name: 'Kněžice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
  members: [1, 2, 3, 4, 5, 6].map((id) => member(id, 0, true)),
});
const END = LAUNCH + 3000;

const run = (stance: 'defend' | 'flee'): ReturnType<typeof stepCampaign> =>
  stepCampaign(START, END, SET_OUT, raidWorld(knezice(stance), lhotka()));

const bodiesOf = (
  step: ReturnType<typeof stepCampaign>,
  villageId: string,
  kind: VillageEventBody['kind'],
): VillageEventBody[] =>
  step.villageEvents
    .filter((e) => e.villageId === villageId && e.body.kind === kind)
    .map((e) => e.body);

describe('boj u hradiště s uprchlíky', () => {
  it('(c) „bránit se“: muži uprchlíků bojují, padlí a ranění dojdou domů, padlí z hostů odejdou', () => {
    const whole = run('defend');
    expect(whole.state.phase).toBe('done');
    expect(whole.state.guards).toEqual([
      { id: -1, kind: 'refuge', ref: { villageId: 'lhotka', personId: 20 }, name: 'Vlk' },
      { id: -2, kind: 'refuge', ref: { villageId: 'lhotka', personId: 21 }, villager: true },
    ]);
    const fighters = (whole.state.battle?.fighters ?? []).filter(
      (f) => f.side === 'defend' && f.ref < 0,
    );
    expect(fighters).toHaveLength(2);
    // bez útočiště stojí žena uprchlíků a jejich stádo venku
    expect(whole.state.battle?.shelter?.refugees).toEqual({
      inside: 0,
      outside: 1,
      herdInside: herd(0, 0),
      herdOutside: herd(3, 1),
    });
    const down = fighters.filter((f) => f.state === 'down');
    expect(down.length).toBeGreaterThan(0);
    const [losses] = bodiesOf(whole, 'lhotka', 'guard-losses');
    if (losses?.kind !== 'guard-losses') throw new Error('chybí ztráty uprchlíků');
    expect(losses.fallen.length + losses.wounded.length + losses.captured.length).toBe(down.length);
    if (losses.fallen.length > 0) {
      const [leave] = bodiesOf(whole, 'knezice', 'guests-leave');
      expect(leave).toMatchObject({ kind: 'guests-leave', away: 'refuge' });
      // padlý uprchlík zemře doma bez pohřbu
      const home = lhotka();
      const day = whole.villageEvents.find((e) => e.body.kind === 'guard-losses')!.day;
      const chronicle = applyInboxDay(home, day, [
        { id: 'e1', villageId: 'lhotka', day, seq: 1, body: losses },
      ]);
      expect(chronicle.filter((e) => e.kind === 'death')).toHaveLength(losses.fallen.length);
      for (const id of losses.fallen) expect(home.people.some((p) => p.id === id)).toBe(false);
    }
    // napadená ves dostane jen své lidi
    const [raid] = bodiesOf(whole, 'knezice', 'raid-result');
    if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    const ids = [...raid.result.fallen, ...raid.result.wounded, ...(raid.result.captured ?? [])];
    expect(ids.every((id) => id > 0)).toBe(true);
  });

  it('(c) evakuace bez lesa = vzdání: muž rodu uprchlíků zajat jako host z ochrany, vesničan zůstane v hradišti', () => {
    const whole = run('flee');
    const [losses] = bodiesOf(whole, 'lhotka', 'guard-losses');
    if (losses?.kind !== 'guard-losses') throw new Error('chybí ztráty uprchlíků');
    expect(losses).toMatchObject({ fallen: [], wounded: [], captured: [20] });
    const key = guardPrisonerKey('c1', { villageId: 'lhotka', personId: 20 });
    expect(whole.state.loot.prisoners?.map((p) => p.id)).toEqual([key]);
    expect(whole.state.loot.people?.some((p) => p.id === 21) ?? false).toBe(false);
    const [leave] = bodiesOf(whole, 'knezice', 'guests-leave');
    expect(leave).toEqual({
      kind: 'guests-leave',
      away: 'refuge',
      guests: [{ villageId: 'lhotka', personId: 20 }],
    });
    // domov: muž rodu v zajetí ve Lhotě, vesničan dál v hradišti
    const home = lhotka();
    const day = whole.villageEvents.find((e) => e.body.kind === 'guard-losses')!.day;
    applyInboxDay(home, day, [{ id: 'e1', villageId: 'lhotka', day, seq: 1, body: losses }]);
    expect(home.people.find((p) => p.id === 20)!.away).toEqual({
      kind: 'captive',
      hostVillageId: 'lhota',
      refId: key,
    });
    expect(home.people.find((p) => p.id === 21)!.away?.kind).toBe('refuge');
  });

  it('po kouscích taktů a přes JSON = vcelku', () => {
    for (const stance of ['defend', 'flee'] as const) {
      const whole = run(stance);
      const w = raidWorld(knezice(stance), lhotka());
      let s = START;
      const events = [];
      while (s.tick < END && s.phase !== 'done') {
        const step = stepCampaign(s, Math.min(END, s.tick + 37), SET_OUT, w);
        s = JSON.parse(JSON.stringify(step.state)) as typeof s;
        events.push(...step.villageEvents);
      }
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(JSON.stringify(events)).toBe(JSON.stringify(whole.villageEvents));
    }
  });
});
