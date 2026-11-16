import { describe, expect, it } from 'vitest';
import { dwelling, kin, village } from '../../village/__tests__/kin-fixtures';
import type { NewVillageEvent } from '../../village/core/inbox';
import type { Road, VillageState, Workshop } from '../../village/types';
import { isWarned } from '../alarm';
import type { AlarmVillage } from '../alarm-types';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignStep, CampaignWorld } from '../campaign-types';
import { marchGrid, MarchGridMemo } from '../march-grid';
import { runTicks } from '../lookouts';
import { dayOfTick } from '../ticks';
import { land } from './battle-fixtures';
import { campaign, MEADOW, stepInChunks, SUMMER, world } from './campaign-fixtures';

// Oči vsi a varování během do vsi (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 2, Review Focus 1, 3): vojsko na mapě Vlkova jde na východ k Kněžicím (políčko 2, 0);
// Vlkov se o něm dozví, až ho spatří vesničan, a teprve pak přestane pracovat (`raid-day`).

const PASSED = { x: 1, y: 0 };
const KILN = { x: -600, z: 0 };
/** Pruh hustého lesa přes celou mapu kolem milíře (x −660 … −540 m). */
const strip = (tx: number): boolean => tx >= 20 && tx <= 28;
/**
 * Průsek pruhem lesa v ose pochodu vojska (z = 80) – hustým lesem jinudy vojsko neprojde
 * (forest.md – Hustý les); dohled na stezce v lese zůstává 50 m.
 */
const LANE: Road = {
  id: 1,
  points: [
    { x: -700, z: 80 },
    { x: -480, z: 80 },
  ],
  bornDay: 0,
  grade: 'improved',
  traffic: [],
  spots: [],
};

/** Vlkov: jeden muž, dům ve středu mapy; volitelně uhlíř s milířem 600 m na západ. */
function vlkov(kiln: boolean): VillageState {
  const dwellings = [dwelling(1)];
  if (kiln) {
    const burner = { ...dwelling(2), position: { x: 10, z: 10, rotation: 0 } };
    burner.workshop = { craft: 'burner', kilns: [{ id: 5, site: KILN }] } as unknown as Workshop;
    dwellings.push(burner);
  }
  return village([kin({ id: 1, age: 30, sex: 'male', home: 1 }, SUMMER)], dwellings, {
    lastDay: SUMMER + 20,
  });
}

function worldWith(
  opts: { kiln?: boolean; forest?: boolean } = {},
  overrides: Partial<CampaignWorld> = {},
): CampaignWorld {
  const map: CampaignMap = {
    landscape: opts.forest ? land(strip) : MEADOW.landscape,
    obstacles: null,
    villageIds: ['vlkov'],
  };
  const base = vlkov(opts.kiln ?? false);
  const state: VillageState = opts.forest
    ? {
        ...base,
        roads: { nextId: 2, roads: [LANE], trees: [], labor: { from: 0, days: 0, shares: [] } },
      }
    : base;
  return {
    clock: world,
    landscapeOf: (c) => (c.x === PASSED.x && c.y === PASSED.y ? map : MEADOW),
    villageAt: (id) => (id === 'vlkov' ? state : null),
    watcherOf: (id) => (id === 'vlkov' ? { playerId: 'p2', name: 'Vlkov' } : null),
    grids: new MarchGridMemo(),
    ...overrides,
  };
}

/** Vojsko na pochodu stojí na západě mapy Vlkova (z = `z`) a míří dál na Kněžice. */
function passing(z: number): CampaignState {
  const s = campaign({
    liveCommand: false,
    foodKg: 200,
    target: { villageId: 'knezice', cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
  });
  s.phase = 'marching';
  for (const g of s.groups) {
    g.cell = { ...PASSED };
    g.pos = { x: -900, z };
    g.goal = { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } };
    g.route = [{ x: 2, y: 0 }];
    g.arrived = false;
  }
  return s;
}

const kinds = (events: readonly NewVillageEvent[]): string[] =>
  events.filter((e) => e.villageId === 'vlkov').map((e) => `${e.body.kind}@${e.day}`);

function warnedVlkov(step: CampaignStep): AlarmVillage {
  const v = step.state.alarm?.villages.find((x) => x.villageId === 'vlkov');
  if (!v) throw new Error('Vlkov vojsko nespatřil');
  return v;
}

describe('varování vesničanem (sightAlarms)', () => {
  it('vojsko 140 m od domu – ves ví v taktu spatření', () => {
    const start = passing(140);
    const step = stepCampaign(start, start.tick + 1200, [], worldWith());
    expect(step.waiting).toBeNull();
    const v = step.state.alarm!.villages[0]!;
    expect(v).toMatchObject({
      villageId: 'vlkov',
      owner: { playerId: null, npc: true, houseId: null },
      by: 'villager',
      seenAt: { cell: PASSED },
    });
    expect(v.warnTick).toBe(v.seenTick);
    const { x, z } = v.seenAt.pos;
    expect(x * x + z * z).toBeLessThanOrEqual(150 * 150);
    expect(isWarned(step.state, 'vlkov', v.warnTick)).toBe(true);
    expect(isWarned(step.state, 'vlkov', v.warnTick - 1)).toBe(false);
  });

  it('uhlíř u milíře 600 m od vsi – varování o doběh dřív, než vojsko dojde na dohled domů', () => {
    const start = passing(40);
    const withKiln = warnedVlkov(
      stepCampaign(start, start.tick + 1200, [], worldWith({ kiln: true })),
    );
    const homesOnly = warnedVlkov(stepCampaign(start, start.tick + 1200, [], worldWith()));
    const grid = marchGrid(MEADOW.landscape, null, vlkov(true), { day: SUMMER });
    // středem vsi je dvorec (nejstarší obydlí – dům 1 ve 0, 0)
    const run = runTicks(grid, KILN, { x: 0, z: 0 });
    expect(run).toBeGreaterThan(300);
    expect(withKiln.warnTick).toBe(withKiln.seenTick + run);
    // milíř vojsko spatří ≈ 155 m po startu (jezdci 5,25 m/s ≈ 120 taktů)
    expect(withKiln.seenTick).toBeLessThan(start.tick + 200);
    expect(withKiln.warnTick).toBeLessThan(homesOnly.seenTick);
  });

  it('v lese je dohled 50 m – vojsko 80 m od milíře v lese ves nevaruje', () => {
    const start = passing(80);
    const step = stepCampaign(
      start,
      start.tick + 1600,
      [],
      worldWith({ kiln: true, forest: true }),
    );
    expect(step.waiting).toBeNull();
    const v = warnedVlkov(step);
    // varoval až dům – bez doběhu
    expect(v.warnTick).toBe(v.seenTick);
    expect(v.seenAt.pos.x).toBeGreaterThan(-200);
  });

  it('dny nájezdu až od varování – dřív ves pracuje', () => {
    const start = passing(140);
    const step = stepCampaign(start, start.tick + 2600, [], worldWith());
    const v = warnedVlkov(step);
    const warnDay = dayOfTick(v.warnTick, world);
    expect(warnDay).toBeGreaterThan(start.day);
    const events = kinds(step.villageEvents);
    expect(events[0]).toBe(`threat-signal@${warnDay}`);
    expect(events[1]).toBe(`raid-day@${warnDay}`);
    const raidDays = events.filter((e) => e.startsWith('raid-day@')).map((e) => Number(e.slice(9)));
    expect(Math.min(...raidDays)).toBe(warnDay);
    expect(raidDays.length).toBeGreaterThan(1);
    expect(events.filter((e) => e.startsWith('threat-signal@'))).toHaveLength(1);
  });

  it('neškodné vojsko (vlastní, pán, vazal) nikoho nevaruje', () => {
    const start = passing(140);
    const step = stepCampaign(
      start,
      start.tick + 1200,
      [],
      worldWith({}, { harmless: () => true }),
    );
    expect(step.state.alarm).toBeUndefined();
    expect(step.villageEvents).toEqual([]);
    expect(step.notices).toEqual([]);
  });

  it('po 1, 7 a 40 taktech a přes JSON = vcelku', { timeout: 30_000 }, () => {
    const start = passing(40);
    const end = start.tick + 700;
    const whole = stepCampaign(start, end, [], worldWith({ kiln: true }));
    expect(whole.state.alarm?.villages).toHaveLength(1);
    for (const chunk of [1, 7, 40]) {
      const w = worldWith({ kiln: true });
      const {
        state: s,
        villageEvents: events,
        notices,
      } = stepInChunks(start, end, {
        chunk,
        world: w,
      });
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      expect(events).toEqual(whole.villageEvents);
      expect(notices).toEqual(whole.notices);
    }
  });

  it('upozornění army-warned majiteli jednou', () => {
    const start = passing(40);
    const step = stepCampaign(start, start.tick + 2600, [], worldWith({ kiln: true }));
    const warned = step.notices.filter((n) => n.kind === 'army-warned');
    const v = warnedVlkov(step);
    expect(warned).toEqual([
      {
        playerId: 'p2',
        kind: 'army-warned',
        payload: { villageId: 'vlkov', name: 'Vlkov', campaignId: 'c1' },
        gameDay: dayOfTick(v.warnTick, world),
        ref: expect.any(String),
      },
    ]);
  });

  it('nenačtený vlastník (port alarmOf) zastaví takt; po načtení stejný výsledek', () => {
    const start = passing(140);
    const waiting = stepCampaign(
      start,
      start.tick + 1200,
      [],
      worldWith({}, { alarmOf: () => null }),
    );
    expect(waiting.waiting?.villageIds).toEqual(['vlkov']);
    const owner = { playerId: 'p2', npc: false, houseId: 'h2' };
    const step = stepCampaign(
      start,
      start.tick + 1200,
      [],
      worldWith({}, { alarmOf: () => owner }),
    );
    expect(step.state.alarm?.villages[0]?.owner).toEqual(owner);
  });

  describe('vojvoda doma (plán 2026-11-14 – Úloha 4)', () => {
    const owner = { playerId: 'p2', npc: false, houseId: 'h2', lordId: 1 };

    /** Vlkov s mužem 1 (vojvoda) doma, nebo na výjezdu (`away`). */
    function lordWorld(away: boolean): CampaignWorld {
      const man = kin({ id: 1, age: 30, sex: 'male', home: 1 }, SUMMER);
      if (away)
        man.away = { kind: 'service', untilDay: SUMMER + 1000 } as unknown as typeof man.away;
      const other = kin({ id: 2, age: 30, sex: 'male', home: 1 }, SUMMER);
      const state = village([man, other], [dwelling(1)], { lastDay: SUMMER + 20 });
      return worldWith(
        {},
        { alarmOf: () => owner, villageAt: (id) => (id === 'vlkov' ? state : null) },
      );
    }

    /** Vojsko stojí na okraji mapy (−900 m), dům je dál než 150 m. */
    const far = (): CampaignState => passing(40);

    it('vojvoda doma – ves ví v taktu, kdy vojsko vstoupí na její mapu', () => {
      const start = far();
      const step = stepCampaign(start, start.tick + 60, [], lordWorld(false));
      const v = warnedVlkov(step);
      expect(v.by).toBe('lord');
      expect(v.warnTick).toBe(v.seenTick);
      expect(v.seenTick).toBeLessThanOrEqual(start.tick + 1);
      expect(step.notices.filter((n) => n.kind === 'army-warned')).toHaveLength(1);
      expect(step.notices.find((n) => n.kind === 'army-warned')?.gameDay).toBe(
        dayOfTick(v.warnTick, world),
      );
    });

    it('vojvoda na výjezdu – varuje vesničan jako dřív', () => {
      const start = far();
      const away = warnedVlkov(stepCampaign(start, start.tick + 1200, [], lordWorld(true)));
      const plain = warnedVlkov(stepCampaign(start, start.tick + 1200, [], worldWith()));
      expect(away.by).toBe('villager');
      expect(away.warnTick).toBe(plain.warnTick);
      expect(away.seenTick).toBe(plain.seenTick);
    });

    it('ves varovaná poslem: vstup s vojvodou doma varování jen uspíší', () => {
      const start = far();
      const late = start.tick + 5000;
      start.alarm = {
        villages: [
          {
            villageId: 'vlkov',
            owner,
            seenTick: start.tick,
            seenAt: { cell: { ...PASSED }, pos: { x: -900, z: 40 } },
            warnTick: late,
            by: 'messenger',
          },
        ],
        messengers: [],
        flights: [],
        nextRef: 0,
      };
      const step = stepCampaign(start, start.tick + 60, [], lordWorld(false));
      const v = warnedVlkov(step);
      expect(v.by).toBe('lord');
      expect(v.warnTick).toBeLessThan(late);
      expect(v.seenTick).toBe(start.tick);
    });

    it('po 1, 7 a 40 taktech přes JSON = vcelku', { timeout: 30_000 }, () => {
      const start = far();
      const end = start.tick + 200;
      const whole = stepCampaign(start, end, [], lordWorld(false));
      expect(whole.state.alarm?.villages[0]?.by).toBe('lord');
      for (const chunk of [1, 7, 40]) {
        const { state: s } = stepInChunks(start, end, { chunk, world: lordWorld(false) });
        expect(JSON.stringify(s)).toBe(JSON.stringify(whole.state));
      }
    });
  });
});
