import { describe, expect, it } from 'vitest';
import { applyInboxDay, type VillageEventBody } from '../../village/inbox';
import { dynastyDay } from '../../village/succession';
import type { Person, VillageState } from '../../village/types';
import { DAY, kin, trackedVillage, village } from '../../village/__tests__/kin-fixtures';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { guardPrisonerKey } from '../raid-apply';
import { campaign, flat, LAUNCH, member, SET_OUT, SUMMER, world } from './campaign-fixtures';

// Hosté z ochrany pánem se brání se vsí podle jejího postoje (vassalage.md – Ochrana vojskem;
// plán 2026-11-03 – Úloha 6.13); jejich ztráty jdou do domovské vsi (`guard-losses`).

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };
const PROTECTION = 'protection:v1:knezice';

/** Muž pána z Hradu – host z ochrany v Kněžicích, s výcvikem boje `combat`. */
function guardMan(id: number, combat: number): Person {
  return {
    ...kin({ id, age: 25, sex: 'male' }, SUMMER),
    line: true,
    name: `Muž ${id}`,
    arms: { bow: 0, combat, riding: 0 },
    away: { kind: 'protection', hostVillageId: 'knezice', refId: PROTECTION },
  };
}

/** Hrad pána: muži 20 a 21 jsou v Kněžicích na ochraně. */
function hrad(): VillageState {
  const v = village([guardMan(20, 10), guardMan(21, 0)], undefined, { lastDay: SUMMER });
  return v;
}

/** Kněžice: jen žena a dítě, dva hosté z Hradu; postoj podle testu. */
function knezice(stance: 'defend' | 'surrender'): VillageState {
  const v = village(
    [
      kin({ id: 2, age: 28, sex: 'female' }, SUMMER),
      kin({ id: 3, age: 5, sex: 'male', mother: 2 }, SUMMER),
    ],
    undefined,
    { lastDay: SUMMER, storesKg: 500, defense: { stance } },
  );
  v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
  v.guests = [20, 21].map((personId) => ({
    ref: { villageId: 'hrad', personId },
    kind: 'protection' as const,
    untilDay: SUMMER + 100_000,
    adult: true as const,
  }));
  return v;
}

function raidWorld(target: VillageState, home: VillageState): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? TARGET : MEADOW),
    villageAt: (id) => (id === 'knezice' ? target : id === 'hrad' ? home : null),
  };
}

// šest jezdců rodu – hosté „bránit se“ neodolají
const START = campaign({
  assembly: { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
  target: { villageId: 'knezice', name: 'Kněžice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
  members: [1, 2, 3, 4, 5, 6].map((id) => member(id, 0, true)),
});
const END = LAUNCH + 3000;

function run(stance: 'defend' | 'surrender'): ReturnType<typeof stepCampaign> {
  return stepCampaign(START, END, SET_OUT, raidWorld(knezice(stance), hrad()));
}

const bodiesOf = (
  step: ReturnType<typeof stepCampaign>,
  villageId: string,
  kind: VillageEventBody['kind'],
): VillageEventBody[] =>
  step.villageEvents
    .filter((e) => e.villageId === villageId && e.body.kind === kind)
    .map((e) => e.body);

describe('hosté z ochrany v boji', () => {
  it('„bránit se“: hosté bojují pod zápornými čísly, napadená ves dostane jen své lidi', () => {
    const whole = run('defend');
    expect(whole.state.phase).toBe('done');
    expect(whole.state.guards?.map((g) => g.ref.personId)).toEqual([20, 21]);
    const guards = (whole.state.battle?.fighters ?? []).filter(
      (f) => f.side === 'defend' && f.ref < 0,
    );
    expect(guards).toHaveLength(2);
    const [raid] = bodiesOf(whole, 'knezice', 'raid-result');
    if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    const ids = [...raid.result.fallen, ...raid.result.wounded, ...(raid.result.captured ?? [])];
    expect(ids.every((id) => id > 0)).toBe(true);
    // co hosté v boji utržili, dojde do Hradu
    const down = guards.filter((f) => f.state === 'down').length;
    const losses = bodiesOf(whole, 'hrad', 'guard-losses');
    const total = losses.reduce(
      (n, b) =>
        b.kind === 'guard-losses' ? n + b.fallen.length + b.wounded.length + b.captured.length : n,
      0,
    );
    expect(down).toBeGreaterThan(0);
    expect(total).toBe(down);
  });

  it('„vzdát se při přesile“: hosté se vzdají se vsí, zajetí dojde domů i věznitelovi', () => {
    const whole = run('surrender');
    const [losses] = bodiesOf(whole, 'hrad', 'guard-losses');
    if (losses?.kind !== 'guard-losses') throw new Error('chybí ztráty hostů');
    expect(losses).toMatchObject({ fallen: [], wounded: [], captured: [20, 21] });
    expect(losses.captorVillageId).toBe('lhota');
    const [leave] = bodiesOf(whole, 'knezice', 'guests-leave');
    expect(leave).toMatchObject({ kind: 'guests-leave', away: 'protection' });
    const keys = [20, 21].map((personId) =>
      guardPrisonerKey('c1', { villageId: 'hrad', personId }),
    );
    expect(whole.state.loot.prisoners?.map((p) => p.id)).toEqual(keys);
    // napadená ves: odvedené ženu a dítě, žádní hosté
    const [raid] = bodiesOf(whole, 'knezice', 'raid-result');
    if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    expect(raid.result.led).toEqual([2, 3]);
    expect(raid.result.captured).toBeUndefined();
    // domovská ves: muži jsou v zajetí ve Lhotě
    const home = hrad();
    const day = whole.villageEvents.find((e) => e.body.kind === 'guard-losses')!.day;
    applyInboxDay(home, day, [{ id: 'e1', villageId: 'hrad', day, seq: 1, body: losses }]);
    expect(home.people.map((p) => p.away)).toEqual(
      keys.map((refId) => ({ kind: 'captive', hostVillageId: 'lhota', refId })),
    );
  });

  it('po kouscích taktů = vcelku', () => {
    for (const stance of ['defend', 'surrender'] as const) {
      const whole = run(stance);
      const w = raidWorld(knezice(stance), hrad());
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

  it('padlý host – muž rodu – zemře doma s nástupnictvím (bez pohřbu)', () => {
    const v = trackedVillage([
      { id: 10, age: 45, sex: 'male', spouse: 11 },
      { id: 11, age: 40, sex: 'female', spouse: 10 },
      { id: 20, age: 20, sex: 'male', mother: 11, father: 10 },
    ]);
    const lord = v.people.find((p) => p.id === 10)!;
    lord.name = 'Bořivoj';
    lord.away = { kind: 'protection', hostVillageId: 'knezice', refId: PROTECTION };
    const body: VillageEventBody = {
      kind: 'guard-losses',
      campaignId: 'c1',
      villageId: 'hrad',
      fallen: [10],
      wounded: [],
      captured: [],
      captorVillageId: 'lhota',
    };
    const chronicle = applyInboxDay(v, DAY + 1, [
      { id: 'e1', villageId: 'hrad', day: DAY + 1, seq: 1, body },
    ]);
    expect(chronicle).toEqual([
      expect.objectContaining({ kind: 'death', cause: 'war', name: 'Bořivoj', personId: 10 }),
    ]);
    expect(v.people.map((p) => p.id)).toEqual([11, 20]);
    dynastyDay(v, DAY + 1);
    expect(v.dynasty?.lordId).toBe(20);
  });
});
