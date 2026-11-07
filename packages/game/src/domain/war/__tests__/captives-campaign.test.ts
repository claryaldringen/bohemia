import { describe, expect, it } from 'vitest';
import type { VillageEventBody } from '../../village/inbox';
import type { VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import { guestLaborToday, villageFoodNeed } from '../../village';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { applyCaptiveReturns } from '../captives';
import { applyCampaignReturn, applyRaidResult } from '../raid-apply';
import { campaign, flat, member, LAUNCH, SET_OUT, SUMMER, world } from './campaign-fixtures';

// Vzdaní muži rodu se zajmou (war.md – Vzdaní, zajetí a výkupné; plán 2026-11-03 – Úloha 6.11):
// vzdaná ves, ve které žijí dva muži rodu a šlechtic.

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };

function knezice(): VillageState {
  const people = [
    kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
    kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
    kin({ id: 3, age: 5, sex: 'male', mother: 2, father: 1 }, SUMMER),
    kin({ id: 4, age: 26, sex: 'male' }, SUMMER),
    kin({ id: 5, age: 40, sex: 'male' }, SUMMER),
  ];
  people[0]!.line = true;
  people[3]!.line = true;
  people[4]!.noble = { houseId: 'npc-rod' };
  const v = village(people, undefined, {
    lastDay: SUMMER,
    storesKg: 1000,
    defense: { stance: 'surrender' },
  });
  v.dwellings[0]!.position = { x: -860, z: 30, rotation: 0 };
  return v;
}

const TARGET_STATE = knezice();
const raidWorld: CampaignWorld = {
  clock: world,
  landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? TARGET : MEADOW),
  villageAt: (id) => (id === 'knezice' ? TARGET_STATE : null),
};

const base = {
  assembly: { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
  target: { villageId: 'knezice', name: 'Kněžice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
  ambush: true,
  // přesila: osm útočníků proti třem mužům
  members: [member(1, 0, true), ...[2, 11, 12, 13, 14, 15, 16].map((id) => member(id, 1, false))],
};
const END = LAUNCH + 3000;

const bodies = (
  out: ReturnType<typeof stepCampaign>,
  villageId: string,
  kind: VillageEventBody['kind'],
): VillageEventBody[] =>
  out.villageEvents
    .filter((e) => e.villageId === villageId && e.body.kind === kind)
    .map((e) => e.body);

describe('zajetí vzdaných mužů rodu', () => {
  it('NPC velitel zajme muže rodu i šlechtice, i když by rozkaz řekl „pobít“', () => {
    const start = campaign({ ...base, liveCommand: false });
    start.surrendered = 'kill';
    const out = stepCampaign(start, END, SET_OUT, raidWorld);
    const [raid] = bodies(out, 'knezice', 'raid-result');
    if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    expect(raid.result.captured).toEqual([1, 4, 5]);
    expect(raid.result.captorVillageId).toBe('lhota');
    // ostatní vzdaní podle rozkazu; muže rodu a šlechtice zajme vždy
    expect(raid.result.fallen).toEqual([2, 3]);
    expect(out.state.loot.prisoners?.map((p) => p.id)).toHaveLength(3);
  });

  it('živý velitel může zajatce nechat být', () => {
    const start = campaign({ ...base, liveCommand: true });
    start.surrendered = 'leave';
    const out = stepCampaign(start, END, SET_OUT, raidWorld);
    const [raid] = bodies(out, 'knezice', 'raid-result');
    if (raid?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    expect(raid.result.captured).toBeUndefined();
    expect(raid.result.led).toEqual([]);
  });

  it('zajatý muž zůstane pryč ve své vsi, ves věznitele ho živí, ale nepracuje', () => {
    const out = stepCampaign(campaign({ ...base, liveCommand: false }), END, SET_OUT, raidWorld);
    const [raid] = bodies(out, 'knezice', 'raid-result');
    const [ret] = bodies(out, 'lhota', 'campaign-return');
    if (raid?.kind !== 'raid-result' || ret?.kind !== 'campaign-return') throw new Error('chybí');
    const home = structuredClone(TARGET_STATE);
    home.dynasty = { lordId: 1 } as VillageState['dynasty'];
    applyRaidResult(home, SUMMER + 1, raid.result);
    const man = home.people.find((p) => p.id === 1)!;
    expect(man.away).toMatchObject({ kind: 'captive', hostVillageId: 'lhota' });
    expect(man.away?.untilDay).toBeUndefined();
    // vojvoda v zajetí: ves řídí formální správce
    expect(home.steward?.on).toBe(true);
    expect(home.steward?.byCaptivity).toBe(true);

    const captor = village([kin({ id: 9, age: 30, sex: 'male' }, SUMMER)], undefined, {
      lastDay: SUMMER,
      nextId: 500,
      storesKg: 0,
    });
    const before = villageFoodNeed(captor, SUMMER + 5);
    applyCampaignReturn(captor, SUMMER + 5, ret.result);
    expect(captor.prisoners).toHaveLength(3);
    expect(villageFoodNeed(captor, SUMMER + 5)).toBeGreaterThan(before);
    expect(guestLaborToday(captor, SUMMER + 5)).toBe(0);

    // propuštění: domů vrácený muž je zase doma a správce se vrátí do původního stavu
    const prisoner = captor.prisoners![0]!;
    applyCaptiveReturns(captor, SUMMER + 9, {
      role: 'captor',
      prisonerId: prisoner.id,
      personId: 1,
    });
    expect(captor.prisoners).toHaveLength(2);
    applyCaptiveReturns(home, SUMMER + 9, {
      role: 'home',
      prisonerId: man.away!.refId!,
      personId: 1,
    });
    expect(home.people.find((p) => p.id === 1)?.away).toBeUndefined();
    expect(home.steward?.on).toBe(false);
  });
});
