import { describe, expect, it } from 'vitest';
import { dwelling, village, kin } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent } from '../../village/core/inbox';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignWorld } from '../campaign-types';
import { campaign, flat, MEADOW, stepInChunks, SUMMER, world } from './campaign-fixtures';

// Dny nájezdu (Ú6.7 – war.md, Ves během nájezdu nepracuje): vojsko na mapě cizí vsi posílá
// `raid-day` na každý den – war.md – Varování, 9. 11. 2026: až od chvíle, kdy ves o vojsku ví
// (spatřil ho vesničan – `sightAlarms`), signál hrozby jednou s varováním. Automatický posel
// z prošlé vsi do cíle (Ú6.7) zmizel – posla posílá hráč nebo správce (plán 2026-11-09 – Úloha 5).

const PASSED = { x: 1, y: 0 };
// dům ve středu mapy – odtud vesničan vojsko spatří (war.md – Varování, 9. 11. 2026)
const vlkov = village([kin({ id: 1, age: 30, sex: 'male', home: 1 }, SUMMER)], [dwelling(1)], {
  lastDay: SUMMER,
});
const vlkovMap: CampaignMap = { landscape: flat(), obstacles: null, villageIds: ['vlkov'] };

function worldWith(overrides: Partial<CampaignWorld> = {}): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (c) => (c.x === PASSED.x && c.y === PASSED.y ? vlkovMap : MEADOW),
    villageAt: (id) => (id === 'vlkov' || id === 'knezice' ? vlkov : null),
    ...overrides,
  };
}

/**
 * Vojsko na pochodu stojí na mapě Vlkova (dům ve 0, 0) v bodě `x` a míří dál na Kněžice (políčko
 * 2, 0); z −200 m ho vesničan u domu spatří hned (war.md – Varování, 9. 11. 2026).
 */
function passing(x = -200): CampaignState {
  const s = campaign({
    liveCommand: false,
    target: { villageId: 'knezice', cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
  });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...PASSED };
    g.pos = { x, z: 0 };
    g.goal = { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } };
    g.route = [{ x: 2, y: 0 }];
    g.arrived = false;
  }
  return s;
}

const kinds = (events: readonly NewVillageEvent[], villageId: string): string[] =>
  events.filter((e) => e.villageId === villageId).map((e) => `${e.body.kind}@${e.day}`);

describe('dny nájezdu (raid-day)', () => {
  it('ves na mapě vojska dostane raid-day na každý den až od varování, signál hrozby jednou', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 400, [], worldWith());
    expect(step.waiting).toBeNull();
    const day = start.day;
    expect(kinds(step.villageEvents, 'vlkov')).toEqual([
      `threat-signal@${day}`,
      `raid-day@${day}`,
      `raid-day@${day + 1}`,
    ]);
    expect(step.state.raidDays).toEqual({ vlkov: day + 1 });
    // ref = camp:<id>:<takt>:<n> – jedinečný; první v taktu spatření
    const refs = step.villageEvents.map((e) => e.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const seen = step.state.alarm!.villages[0]!.warnTick;
    expect(refs[0]).toBe(`camp:c1:${seen}:0`);
  });

  it('vojsko na mapě, které ještě nikdo nespatřil – ves pracuje dál (žádný raid-day)', () => {
    // war.md – Varování, 9. 11. 2026: „Do té doby lidé pracují dál“
    const start = passing(-900);
    const step = stepCampaign(start, start.tick + 400, [], worldWith());
    expect(step.waiting).toBeNull();
    expect(step.villageEvents).toEqual([]);
    expect(step.state.raidDays).toBeUndefined();
  });

  it('po kouscích taktů i přes JSON stejné události', () => {
    const start = passing();
    const whole = stepCampaign(start, start.tick + 400, [], worldWith());
    const { state: s, villageEvents: events } = stepInChunks(start, start.tick + 400, {
      chunk: 37,
      world: worldWith(),
    });
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

describe('posel z prošlé vsi (Ú6.7) zmizel', () => {
  // war.md – Varování, 9. 11. 2026: posla do hradiště posílá hráč nebo správce (Úloha 5)
  it('ves téhož rodu jako cíl do cíle nic neposílá a takt na rod nečeká', () => {
    const start = passing();
    const step = stepCampaign(start, start.tick + 400, [], worldWith());
    expect(kinds(step.villageEvents, 'knezice')).toEqual([]);
    expect(step.state.messengerSent).toBeUndefined();
    // port `messengerTo` zmizel s porty varování (plán 2026-11-09 – Úloha 6)
    expect(step.waiting).toBeNull();
    expect(step.state.tick).toBe(start.tick + 400);
  });
});
