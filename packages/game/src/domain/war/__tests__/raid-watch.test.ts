import { describe, expect, it } from 'vitest';
import { village, kin } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent } from '../../village/inbox';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignWorld } from '../campaign-types';
import { campaign, flat, MEADOW, SUMMER, world } from './campaign-fixtures';

// Dny nájezdu a posel (Ú6.7 – war.md, Ves během nájezdu nepracuje; Obránci – Kdy): vojsko na mapě
// cizí vsi posílá `raid-day` na každý den, poprvé i signál hrozby; ves téhož rodu jako cíl pošle do
// cíle posla na následující den.

const PASSED = { x: 1, y: 0 };
const vlkov = village([kin({ id: 1, age: 30, sex: 'male', home: 1 }, SUMMER)], [], {
  lastDay: SUMMER,
});
const vlkovMap: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['vlkov'] };

function worldWith(overrides: Partial<CampaignWorld> = {}): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (c) => (c.x === PASSED.x && c.y === PASSED.y ? vlkovMap : MEADOW),
    villageAt: (id) => (id === 'vlkov' || id === 'knezice' ? vlkov : null),
    messengerTo: (from, to) => from === 'vlkov' && to === 'knezice',
    ...overrides,
  };
}

/** Vojsko na pochodu stojí na mapě Vlkova a míří dál na Kněžice (políčko 2, 0). */
function passing(): CampaignState {
  const s = campaign({
    liveCommand: false,
    target: { villageId: 'knezice', cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
  });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...PASSED };
    g.pos = { x: -900, z: 0 };
    g.goal = { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } };
    g.route = [{ x: 2, y: 0 }];
    g.arrived = false;
  }
  return s;
}

const kinds = (events: readonly NewVillageEvent[], villageId: string): string[] =>
  events.filter((e) => e.villageId === villageId).map((e) => `${e.body.kind}@${e.day}`);

describe('dny nájezdu (raid-day)', () => {
  it('ves na mapě vojska dostane raid-day na každý den, signál hrozby jednou', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 400, [], worldWith());
    expect(step.waiting).toBeNull();
    const day = start.day;
    expect(kinds(step.villageEvents, 'vlkov')).toEqual([
      `raid-day@${day}`,
      `threat-signal@${day}`,
      `raid-day@${day + 1}`,
    ]);
    expect(step.state.raidDays).toEqual({ vlkov: day + 1 });
    // ref = camp:<id>:<takt>:<n> – jedinečný
    const refs = step.villageEvents.map((e) => e.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs[0]).toBe(`camp:c1:${start.tick + 1}:0`);
  });

  it('po kouscích taktů i přes JSON stejné události', () => {
    const start = passing();
    const whole = stepCampaign(start, start.tick + 400, [], worldWith());
    const events: NewVillageEvent[] = [];
    let s = start;
    while (s.tick < start.tick + 400) {
      const next = stepCampaign(s, Math.min(start.tick + 400, s.tick + 37), [], worldWith());
      events.push(...next.villageEvents);
      s = JSON.parse(JSON.stringify(next.state)) as CampaignState;
    }
    expect(events).toEqual(whole.villageEvents);
    expect(s).toEqual(whole.state);
  });

  it('neškodné vojsko (vlastní, pán, vazal) nic neposílá', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 400, [], worldWith({ harmless: () => true }));
    expect(step.villageEvents).toEqual([]);
  });

  it('ves bez potřebného dne zastaví takt (bariéra)', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 10, [], worldWith({ villageAt: () => null }));
    expect(step.state.tick).toBe(start.tick);
    expect(step.waiting?.villageIds).toEqual(['vlkov']);
  });
});

describe('posel (army-seen)', () => {
  it('ves téhož rodu pošle do cíle posla na následující den, jednou', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 400, [], worldWith());
    const day = start.day;
    expect(kinds(step.villageEvents, 'knezice')).toEqual([
      `army-seen@${day + 1}`,
      `threat-signal@${day + 1}`,
    ]);
    const seen = step.villageEvents.find((e) => e.body.kind === 'army-seen');
    expect(seen?.body).toEqual({ kind: 'army-seen', campaignId: 'c1', fromVillageId: 'vlkov' });
    expect(step.state.messengerSent).toBe(true);
  });

  it('ves jiného rodu posla neposílá; neznámé vsi se načtou', () => {
    const start = passing();
    const other = stepCampaign(start, start.tick + 40, [], worldWith({ messengerTo: () => false }));
    expect(kinds(other.villageEvents, 'knezice')).toEqual([]);
    const unknown = stepCampaign(
      start,
      start.tick + 40,
      [],
      worldWith({ messengerTo: () => null }),
    );
    expect(unknown.state.tick).toBe(start.tick);
    expect(unknown.waiting?.villageIds).toEqual(['vlkov', 'knezice']);
  });
});
