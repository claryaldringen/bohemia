import { describe, expect, it } from 'vitest';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { GridCell } from '../../village/people/world-grid';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { newJourney, stepJourney } from '../journey';
import type {
  JourneyIntent,
  JourneyIntentBody,
  JourneyState,
  LegacyJourneyState,
} from '../journey-types';
import { commandOf, upgradeJourney } from '../journey-upgrade';
import type { Pos } from '../march-grid';
import { msOfTick } from '../ticks';
import { LAUNCH, MEADOW, world as clock } from './campaign-fixtures';

// Převod výjezdu vojvody na výpravu (plán 2026-11-14 – Úloha 1, Rozhodnutí 4, Review Focus 1):
// starší kontrolní bod a staré záměry se dopočtou stejně jako před výpravami.

const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
const EAST: GridCell = { x: 1, y: 0 };
const FAR: Pos = { x: -655, z: 5 };

/** Starší bod – tvar dnešního `newJourney` před výpravami: vojvoda 1 a muž 2, jedna skupina. */
function legacyPoint(extra: Partial<LegacyJourneyState> = {}): LegacyJourneyState {
  const member = (personId: number): LegacyJourneyState['members'][number] => ({
    ref: { villageId: 'lhota', personId },
    lord: personId === 1,
    mounted: true,
    strength: 2,
    fight: 50,
    health: 100,
    wounded: false,
    status: 'active',
  });
  return {
    kind: 'journey',
    id: 'j1',
    seed: 42,
    tick: 20,
    day: 3,
    throughDay: 2,
    phase: 'returning',
    playerId: 'p1',
    houseId: 'h1',
    leaderName: 'Bořivoj',
    home: HOME,
    members: [member(1), member(2)],
    groups: [
      {
        id: 0,
        order: 'follow-leader',
        cell: { x: 0, y: 0 },
        pos: { x: 40, z: 5 },
        goal: { cell: HOME.cell, pos: HOME.pos },
        route: [],
        leg: null,
        arrived: false,
      },
    ],
    arrivedTick: 12,
    ...extra,
  };
}

/** Bod nového tvaru zpět do tvaru před výpravami (jedna skupina) – jak by ho uložil starý krok. */
function toLegacy(s: JourneyState): LegacyJourneyState {
  const party = s.parties[0]!;
  return {
    kind: s.kind,
    id: s.id,
    seed: s.seed,
    tick: s.tick,
    day: s.day,
    ...(s.throughDay === undefined ? {} : { throughDay: s.throughDay }),
    phase: s.phase === 'done' ? 'done' : party.phase,
    playerId: s.playerId,
    houseId: s.houseId,
    leaderName: 'Bořivoj',
    home: s.home,
    members: s.members.map((m) => ({
      ref: m.ref,
      lord: m.lord,
      mounted: m.mounted,
      strength: m.strength,
      fight: m.fight,
      health: m.health,
      wounded: m.wounded,
      ...(m.woundedDay === undefined ? {} : { woundedDay: m.woundedDay }),
      status: m.status,
    })),
    groups: s.groups.map((g) => ({
      id: g.id,
      order: g.order,
      cell: g.cell,
      pos: g.pos,
      goal: g.goal,
      route: g.route,
      leg: g.leg,
      arrived: g.arrived,
    })),
    arrivedTick: party.arrivedTick,
    ...(s.seen ? { seen: s.seen } : {}),
  };
}

function worldOf(): CampaignWorld {
  const lhota = village([1, 2].map((id) => kin({ id, age: 30, sex: 'male' })));
  const knezice = village([kin({ id: 1, age: 30, sex: 'male' })]);
  const foreign: CampaignMap = { ...MEADOW, villageIds: ['knezice'] };
  const villages: Record<string, typeof lhota> = { lhota, knezice };
  return {
    clock,
    landscapeOf: (cell) => (cell.x === 1 ? foreign : MEADOW),
    villageAt: (id) => villages[id] ?? null,
    villageGone: (id) => !(id in villages),
  };
}

function intent(tick: number, seq: number, body: JourneyIntentBody): JourneyIntent {
  return { tick, seq, byPlayer: 'p1', body };
}

describe('upgradeJourney', () => {
  it('starší bod: skupina 0 s hloučkem 0, čekání a fáze ve skupině, jméno u vojvody', () => {
    const old = legacyPoint();
    const frozen = JSON.stringify(old);
    const s = upgradeJourney(old);
    expect(s.phase).toBe('out');
    expect(s.parties).toEqual([{ id: 0, phase: 'returning', arrivedTick: 12 }]);
    expect(s.groups[0]!.party).toBe(0);
    expect(s.members.map((m) => m.group)).toEqual([0, 0]);
    expect(s.members[0]!.name).toBe('Bořivoj');
    expect(s.members[1]!.name).toBeUndefined();
    // jezdec na koni: kůň u sebe, ves o něm neví (bez `horseId`) – vrátí se s ním jako dřív
    expect(s.members.map((m) => [m.horse, m.horseId])).toEqual([
      ['ridden', undefined],
      ['ridden', undefined],
    ]);
    expect(s.nextId).toBe(1);
    expect('arrivedTick' in s).toBe(false);
    expect(JSON.stringify(old)).toBe(frozen);
  });

  it('převod je idempotentní; nový tvar zůstane týž objekt', () => {
    for (const old of [legacyPoint(), legacyPoint({ phase: 'out', arrivedTick: null })]) {
      const once = upgradeJourney(old);
      expect(upgradeJourney(once)).toBe(once);
      expect(upgradeJourney(JSON.parse(JSON.stringify(once)) as JourneyState)).toEqual(once);
    }
  });

  it('skupina bez živého vojvody je leaderless; na cestě přes okraj dostane crossing', () => {
    const lordless = legacyPoint();
    lordless.members[0]!.status = 'fallen';
    expect(upgradeJourney(lordless).parties[0]).toMatchObject({ leaderless: true });
    const crossing = legacyPoint({ phase: 'out', arrivedTick: null });
    crossing.groups[0]!.goal = { cell: EAST, pos: { x: -995, z: 5 } };
    crossing.groups[0]!.route = [EAST];
    expect(upgradeJourney(crossing).parties[0]).toEqual({
      id: 0,
      phase: 'out',
      arrivedTick: null,
      crossing: true,
    });
  });

  it('starší bod a staré záměry se dopočtou stejně jako nový stav (Review Focus 1)', () => {
    const start = newJourney(
      {
        id: 'j1',
        seed: 42,
        playerId: 'p1',
        houseId: 'h1',
        home: HOME,
        recruits: [1, 2].map((personId) => ({
          ref: { villageId: 'lhota', personId },
          lord: personId === 1,
          strength: 2,
          fight: 50,
          mounted: true as const,
          ...(personId === 1 ? { name: 'Bořivoj' } : {}),
        })),
        startMs: msOfTick(LAUNCH, clock),
        order: { kind: 'go', pos: { x: 305, z: 5 } },
      },
      clock,
    );
    // staré záměry: přes okraj, jdi sem, a domů dřív, než skupina doma čeká 3 dny
    const trip = [
      intent(LAUNCH + 300, 1, { kind: 'cross', cell: EAST }),
      intent(LAUNCH + 1000, 2, { kind: 'go', pos: FAR }),
      intent(LAUNCH + 1500, 3, { kind: 'home' }),
    ];
    const end = LAUNCH + 3000;
    const whole = stepJourney(start, end, trip, worldOf());
    expect(whole.state.phase).toBe('done');
    // body: na cestě přes okraj, po dojetí na sousední mapě, na cestě domů
    for (const at of [LAUNCH + 320, LAUNCH + 1200, LAUNCH + 1600]) {
      const half = stepJourney(start, at, trip, worldOf());
      for (const to of [at + 150, end]) {
        const fresh = stepJourney(half.state, to, trip, worldOf());
        const legacy = stepJourney(toLegacy(half.state), to, trip, worldOf());
        expect({ ...legacy.state, leaderName: undefined }).toEqual(fresh.state);
        expect(legacy.villageEvents).toEqual(fresh.villageEvents);
        expect(legacy.notices).toEqual(fresh.notices);
        expect(legacy.knowledge).toEqual(fresh.knowledge);
      }
    }
  });
});

describe('commandOf', () => {
  it('starý záměr je rozkaz všem; příkaz zůstane', () => {
    expect(commandOf({ kind: 'home' })).toEqual({ kind: 'order', order: { kind: 'home' } });
    expect(commandOf({ kind: 'cross', cell: EAST })).toEqual({
      kind: 'order',
      order: { kind: 'cross', cell: EAST },
    });
    const recall = { kind: 'recall' as const, cells: [EAST] };
    expect(commandOf(recall)).toBe(recall);
    const order = { kind: 'order' as const, order: { kind: 'home' as const }, people: [2] };
    expect(commandOf(order)).toBe(order);
    const saddle = { kind: 'saddle' as const, people: [1] };
    expect(commandOf(saddle)).toBe(saddle);
    const dismount = { kind: 'dismount' as const };
    expect(commandOf(dismount)).toBe(dismount);
  });
});
