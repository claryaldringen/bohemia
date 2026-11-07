import { describe, expect, it } from 'vitest';
import type { VillageEventBody } from '../../village/inbox';
import type { ChronicleEvent, VillageState } from '../../village/types';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { applyCampaignReturn, applyRaidResult } from '../raid-apply';
import { campaign, flat, LAUNCH, SET_OUT, SUMMER, world } from './campaign-fixtures';

// Tažení pošle výsledek nájezdu do vsí (plán 2026-11-03 – Úloha 6.10): vzdaná ves (postoj „vzdát
// se při přesile“) – odvedení, kořist do nosnosti, zápis do kronik obou rodů a návrat s kořistí.

const TARGET: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['knezice'] };
const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };

/** Kněžice: rodina (muž, žena, dítě) u cíle tažení, zásoby a ovce; při přesile se vzdají. */
function knezice(): VillageState {
  const people = [
    kin({ id: 1, age: 30, sex: 'male', spouse: 2 }, SUMMER),
    kin({ id: 2, age: 28, sex: 'female', spouse: 1 }, SUMMER),
    kin({ id: 3, age: 5, sex: 'male', mother: 2, father: 1 }, SUMMER),
  ];
  const v = village(people, undefined, {
    lastDay: SUMMER,
    storesKg: 1000,
    defense: { stance: 'surrender' },
    livestock: {
      herds: { sheep: 6, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    },
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

const START = campaign({
  assembly: { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } },
  target: { villageId: 'knezice', name: 'Kněžice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
  ambush: true,
});
const END = LAUNCH + 3000;
const whole = stepCampaign(START, END, SET_OUT, raidWorld);

const bodies = (villageId: string, kind: VillageEventBody['kind']): VillageEventBody[] =>
  whole.villageEvents
    .filter((e) => e.villageId === villageId && e.body.kind === kind)
    .map((e) => e.body);

describe('nájezd na vzdanou ves', () => {
  it('výsledek do napadené vsi: odvedení, kořist do nosnosti (3 muži × 25 kg − vlastní jídlo)', () => {
    expect(whole.state.phase).toBe('done');
    // mlha války (Ú6.14): dům, ke kterému vojsko došlo, zůstane objevený
    expect(whole.state.discovered).toEqual([knezice().dwellings[0]!.id]);
    const [body] = bodies('knezice', 'raid-result');
    if (body?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    const r = body.result;
    expect(r).toMatchObject({
      leader: 'Bořivoj',
      from: 'Lhota',
      target: 'Kněžice',
      declared: false,
    });
    expect(r.led).toEqual([1, 2, 3]);
    expect(r.loot.livestock.sheep).toBe(6);
    expect(r.loot.grainKg).toBeLessThanOrEqual(3 * 25);
    expect(r.loot.grainKg).toBeGreaterThanOrEqual(3 * 25 - 20);
    expect(whole.state.loot.people?.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(whole.state.loot.herd).toBe(6);
  });

  it('kronika obou rodů – stejný věcný zápis', () => {
    const [body] = bodies('knezice', 'raid-result');
    if (body?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    const defender = structuredClone(TARGET_STATE);
    const day = whole.villageEvents.find((e) => e.body.kind === 'raid-result')!.day;
    const theirs = applyRaidResult(defender, day, structuredClone(body.result))[0];
    const ours = bodies('lhota', 'chronicle')
      .flatMap((b) => (b.kind === 'chronicle' ? [b.event] : []))
      .find((e): e is Extract<ChronicleEvent, { kind: 'raid' }> => e.kind === 'raid');
    expect(ours).toBeDefined();
    expect(theirs).toEqual(ours);
    expect(ours).toMatchObject({ fallen: 0, wounded: 0, led: 3, declared: false });
    // napadené vsi ubylo, co útočník odnesl
    expect(defender.people).toEqual([]);
    expect(defender.storesKg).toBeCloseTo(1000 - body.result.loot.grainKg, 9);
    expect(defender.livestock?.herds.sheep).toBe(0);
  });

  it('návrat: kořist a odvedení do vsi shromaždiště jako noví vesničané', () => {
    const [body] = bodies('lhota', 'campaign-return');
    if (body?.kind !== 'campaign-return') throw new Error('chybí návrat');
    expect(body.result.back).toEqual([1, 2]);
    expect(body.result.people).toHaveLength(3);
    const lhota = village([kin({ id: 1, age: 30, sex: 'male' }, SUMMER)], undefined, {
      lastDay: SUMMER,
      nextId: 500,
      storesKg: 0,
    });
    lhota.people[0]!.away = { kind: 'campaign', refId: 'c1' };
    applyCampaignReturn(lhota, SUMMER + 5, body.result);
    expect(lhota.people.map((p) => p.id)).toEqual([1, 500, 501, 502]);
    expect(lhota.people[0]!.away).toBeUndefined();
    expect(lhota.storesKg).toBeCloseTo(body.result.loot!.grainKg, 9);
    expect(lhota.livestock?.herds.sheep).toBeGreaterThanOrEqual(6);
    // druhá ves útočníka dostane jen své muže, bez kořisti
    const [brod] = bodies('brod', 'campaign-return');
    expect(brod?.kind === 'campaign-return' && brod.result.loot).toBeFalsy();
  });

  it('po kouscích taktů = vcelku', () => {
    let s = START;
    const events = [];
    while (s.tick < END && s.phase !== 'done') {
      const step = stepCampaign(s, Math.min(END, s.tick + 37), SET_OUT, raidWorld);
      s = step.state;
      events.push(...step.villageEvents);
    }
    expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
    expect(JSON.stringify(events)).toBe(JSON.stringify(whole.villageEvents));
  });
});
