import { describe, expect, it } from 'vitest';
import { SURFACE_CODES } from '../../landscape';
import { applyInboxDay, type VillageEvent } from '../../village/core/inbox';
import { isInjured } from '../../village/people/people';
import { dynastyDay } from '../../village/people/succession';
import { HUNT_RISK } from '../../village/rules/rules-wildlife';
import type { VillageState } from '../../village/types';
import { freshWildlife, wildlifeOfEmptyMap } from '../../village/wildlife/wildlife';
import { DAY, kin, trackedVillage, village } from '../../village/__tests__/kin-fixtures';
import type { CampaignMap, CampaignWorld } from '../campaign-types';
import { MarchGridMemo } from '../march-grid';
import { newJourney, stepJourney } from '../journey';
import { predatorDay, wildlifeOfMap } from '../journey-predators';
import type { JourneyMember, JourneyState } from '../journey-types';
import { msOfTick } from '../ticks';
import { flat, LAUNCH, MEADOW, world as clock } from './campaign-fixtures';

// Šelmy v hustém lese (lord-control.md – Nebezpečí, bod 3; plán 2026-11-13 – Úloha 13): čísla
// zranění a smrti jsou čísla lovu (`HUNT_RISK`), losuje se jednou za den ze seedu výjezdu a dne.

function man(index: number, extra: Partial<JourneyMember> = {}): JourneyMember {
  return {
    ref: { villageId: 'lhota', personId: index + 1 },
    lord: index === 0,
    mounted: true,
    strength: 2,
    fight: 50,
    health: 100,
    wounded: false,
    status: 'active',
    group: 0,
    ...extra,
  };
}

const BEAR = { bear: true, wolves: false };
const WOLVES = { bear: false, wolves: true };

/** Kolikrát z `seeds` losů dopadl `outcome`, na jednoho (prvního) muže. */
function frequency(
  members: readonly JourneyMember[],
  wildlife: { bear: boolean; wolves: boolean },
  outcome: 'wounded' | 'dead',
  seeds = 20_000,
): number {
  let hits = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const out = predatorDay({ members, inForest: true, wildlife, seed, day: 100 });
    if (out.some((o) => o.index === 0 && o.outcome === outcome)) hits++;
  }
  return hits / seeds;
}

/** Tolerance ≈ 5 směrodatných odchylek binomického pokusu. */
function near(actual: number, p: number, n = 20_000): void {
  expect(Math.abs(actual - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / n));
}

describe('predatorDay', () => {
  it('tři muži nikdy, mimo hustý les nikdy, bez šelem nikdy', () => {
    const three = [man(0), man(1), man(2)];
    const two = [man(0), man(1)];
    for (let seed = 1; seed <= 3000; seed++) {
      const base = { seed, day: 5 };
      expect(predatorDay({ ...base, members: three, inForest: true, wildlife: BEAR })).toEqual([]);
      expect(predatorDay({ ...base, members: two, inForest: false, wildlife: BEAR })).toEqual([]);
      const none = { bear: false, wolves: false };
      expect(predatorDay({ ...base, members: two, inForest: true, wildlife: none })).toEqual([]);
    }
  });

  it('padlí se do počtu nepočítají a nikoho z nich šelma nezraní', () => {
    const members = [man(0), man(1), man(2, { status: 'fallen' })];
    let hits = 0;
    for (let seed = 1; seed <= 20_000; seed++) {
      const out = predatorDay({ members, inForest: true, wildlife: BEAR, seed, day: 3 });
      hits += out.length;
      expect(out.every((o) => o.index !== 2)).toBe(true);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('medvěd: zranění 5 % × (1 − boj ÷ 200), smrt 0,3 % × (2 − boj ÷ 100); pěšky smrt × 2', () => {
    const mounted = [man(0, { fight: 50 }), man(1)];
    const foot = [man(0, { fight: 50, mounted: false }), man(1)];
    const injury = HUNT_RISK.bear.injury * (1 - 50 / 200);
    const death = HUNT_RISK.bear.death * (2 - 50 / 100);
    near(frequency(mounted, BEAR, 'dead'), death);
    near(frequency(foot, BEAR, 'dead'), death * HUNT_RISK.footDeathFactor);
    // zranění jen tam, kde se nevylosovala smrt
    near(frequency(mounted, BEAR, 'wounded'), injury * (1 - death));
  });

  it('jen vlci: čísla lovu prasat (0,5 % a 0,02 %)', () => {
    const members = [man(0, { fight: 80 }), man(1)];
    const death = HUNT_RISK.boar.death * (2 - 80 / 100);
    near(frequency(members, WOLVES, 'dead', 60_000), death, 60_000);
    near(frequency(members, WOLVES, 'wounded', 60_000), HUNT_RISK.boar.injury, 60_000);
    const out = predatorDay({ members, inForest: true, wildlife: WOLVES, seed: 1, day: 1 });
    expect(out.every((o) => o.by === 'wolves')).toBe(true);
  });

  it('medvěd i vlci: útočí medvěd', () => {
    const both = { bear: true, wolves: true };
    for (let seed = 1; seed <= 20_000; seed++) {
      const out = predatorDay({
        members: [man(0), man(1)],
        inForest: true,
        wildlife: both,
        seed,
        day: 9,
      });
      expect(out.every((o) => o.by === 'bear')).toBe(true);
    }
  });

  it('los nezávisí na ničem než na seedu, dni a muži', () => {
    const a = predatorDay({ members: [man(0)], inForest: true, wildlife: BEAR, seed: 7, day: 4 });
    const b = predatorDay({ members: [man(0)], inForest: true, wildlife: BEAR, seed: 7, day: 4 });
    expect(a).toEqual(b);
  });
});

// --- Zvěř mapy ---------------------------------------------------------------------------------

/** Mapa celá z lesa. */
function forestMap(villageIds: readonly string[] = []): CampaignMap {
  const landscape = flat();
  landscape.surface.fill(SURFACE_CODES.forest);
  return { landscape, obstacles: null, villageIds };
}

function homeVillage(): VillageState {
  return village([1, 2, 3].map((id) => kin({ id, age: 30, sex: 'male' })));
}

describe('wildlifeOfMap', () => {
  it('prázdná mapa: zvěř na stropu podle krajiny (les = medvěd i vlci, louka nic)', () => {
    expect(wildlifeOfMap(forestMap(), null)).toEqual({ bear: true, wolves: true });
    expect(wildlifeOfMap(MEADOW, null)).toEqual({ bear: false, wolves: false });
    const fresh = wildlifeOfEmptyMap(forestMap().landscape);
    expect(fresh.bear.present).toBe(true);
    expect(fresh.wolves).toBeGreaterThan(0);
  });

  it('mapa se vsí: stav zvěře té vsi (ulovený medvěd = bezpečno)', () => {
    const v = homeVillage();
    v.wildlife = freshWildlife({ forestHa: 300, openHa: 100, waterHa: 2, pools: 1 }, 0);
    expect(wildlifeOfMap(forestMap(['x']), v)).toEqual({ bear: true, wolves: true });
    v.wildlife.bear = { present: false, backDay: 999 };
    v.wildlife.wolves = 0;
    expect(wildlifeOfMap(forestMap(['x']), v)).toEqual({ bear: false, wolves: false });
  });

  it('ves bez údajů o zvěři se bere jako prázdná mapa', () => {
    expect(wildlifeOfMap(forestMap(['x']), homeVillage())).toEqual({ bear: true, wolves: true });
  });
});

// --- Výjezd ------------------------------------------------------------------------------------

const HOME = { villageId: 'lhota', name: 'Lhota', cell: { x: 0, y: 0 }, pos: { x: 5, z: 5 } };
/** Deset dní v taktech. */
const DAYS = Math.ceil((8 * 86.4) / 0.25);

/**
 * Mapa celá z lesa a mřížky pochodu sdílené všemi výjezdy testů (jako worker – jemná mřížka
 * i pole lesa nové krajiny se staví desítky ms).
 */
const FOREST = forestMap();
const GRIDS = new MarchGridMemo();

function worldOf(map: CampaignMap, home: VillageState = homeVillage()): CampaignWorld {
  return {
    clock,
    grids: GRIDS,
    landscapeOf: () => map,
    villageAt: (id) => (id === 'lhota' ? home : null),
    villageGone: (id) => id !== 'lhota',
  };
}

/** Výprava – lidé `members` jako nováčci skupiny 0 (boj a kůň z nich). */
function journey(seed: number, members: JourneyMember[]): JourneyState {
  return newJourney(
    {
      id: 'j' + seed,
      seed,
      playerId: 'p1',
      houseId: 'h1',
      home: HOME,
      recruits: members.map((m) => ({
        ref: m.ref,
        lord: m.lord,
        strength: m.strength,
        fight: m.fight,
        ...(m.mounted ? { mounted: true as const } : {}),
      })),
      startMs: msOfTick(LAUNCH, clock),
      order: { kind: 'go', pos: { x: 305, z: 5 } },
    },
    clock,
  );
}

describe('výjezd a šelmy', { timeout: 180_000 }, () => {
  it('v lese se časem někdo zraní nebo padne, na louce nikdy', () => {
    let casualties = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const step = stepJourney(
        journey(seed, [man(0, { fight: 0 }), man(1, { fight: 0 })]),
        LAUNCH + DAYS,
        [],
        worldOf(FOREST),
      );
      const events = step.villageEvents.filter((e) => e.body.kind === 'journey-casualty');
      casualties += events.length;
      for (const e of events) {
        const body = e.body;
        if (body.kind !== 'journey-casualty') continue;
        // stav v taktu útoku – kdo doma dojde, ze stavu zmizí; hlouček bez živých taky
        const tick = Number(e.ref!.split(':')[2]);
        const at = stepJourney(
          journey(seed, [man(0, { fight: 0 }), man(1, { fight: 0 })]),
          tick,
          [],
          worldOf(FOREST),
        ).state;
        const m = at.members.find((x) => x.ref.personId === body.personId);
        if (m === undefined) {
          expect(body.outcome).toBe('dead');
          expect(at.members.some((x) => x.status === 'active')).toBe(false);
        } else if (body.outcome === 'dead') expect(m.status).toBe('fallen');
        else {
          expect(m.wounded).toBe(true);
          expect(m.woundedDay).toBeGreaterThan(0);
        }
        expect(e.villageId).toBe('lhota');
        expect(body.journeyId).toBe('j' + seed);
      }
      const meadow = stepJourney(
        journey(seed, [man(0, { fight: 0 }), man(1)]),
        LAUNCH + DAYS,
        [],
        worldOf(MEADOW),
      );
      expect(meadow.villageEvents.some((e) => e.body.kind === 'journey-casualty')).toBe(false);
    }
    expect(casualties).toBeGreaterThan(0);
  });

  it('tři muži v lese nikdy', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const step = stepJourney(
        journey(seed, [man(0, { fight: 0 }), man(1), man(2)]),
        LAUNCH + DAYS,
        [],
        worldOf(FOREST),
      );
      expect(step.villageEvents.some((e) => e.body.kind === 'journey-casualty')).toBe(false);
    }
  });

  it('po kouscích přes JSON = vcelku', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const members = (): JourneyMember[] => [man(0, { fight: 0 }), man(1, { fight: 0 })];
      const whole = stepJourney(journey(seed, members()), LAUNCH + DAYS, [], worldOf(FOREST));
      let current = journey(seed, members());
      const events = [];
      while (current.tick < LAUNCH + DAYS && current.phase !== 'done') {
        const step = stepJourney(
          current,
          Math.min(LAUNCH + DAYS, current.tick + 97),
          [],
          worldOf(FOREST),
        );
        events.push(...step.villageEvents);
        current = JSON.parse(JSON.stringify(step.state)) as JourneyState;
      }
      expect(events).toEqual(whole.villageEvents);
      expect(current.members).toEqual(whole.state.members);
    }
  });

  it('padne-li vojvoda, zbytek se vrací sám', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const step = stepJourney(
        journey(seed, [man(0, { fight: 0, mounted: false }), man(1)]),
        LAUNCH + DAYS,
        [],
        worldOf(FOREST),
      );
      // lidé, kteří doma dojdou, ze stavu zmizí – kdo padl, říkají události vsi
      const dead = (personId: number): boolean =>
        step.villageEvents.some(
          (e) =>
            e.body.kind === 'journey-casualty' &&
            e.body.personId === personId &&
            e.body.outcome === 'dead',
        );
      if (!dead(1) || dead(2)) continue;
      const phase = step.state.phase === 'done' ? 'done' : step.state.parties[0]!.phase;
      expect(phase === 'returning' || phase === 'done').toBe(true);
      return;
    }
    throw new Error('vojvoda nepadl ani při 3000 seedech');
  });
});

// --- Schránka vsi ------------------------------------------------------------------------------

function lordVillage(): VillageState {
  const v = trackedVillage([
    { id: 10, age: 45, sex: 'male', spouse: 11 },
    { id: 11, age: 40, sex: 'female', spouse: 10 },
    { id: 20, age: 20, sex: 'male', mother: 11, father: 10 },
  ]);
  v.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  return v;
}

function casualty(outcome: 'wounded' | 'dead', by: 'bear' | 'wolves'): VillageEvent {
  return {
    id: 'e1',
    villageId: 'lhota',
    day: DAY + 1,
    seq: 1,
    body: { kind: 'journey-casualty', journeyId: 'j1', personId: 10, outcome, by },
  };
}

describe('schránka vsi – journey-casualty', () => {
  it('zranění = 60 dní bez práce jako po lovu, idempotentně', () => {
    const v = lordVillage();
    const chronicle = applyInboxDay(v, DAY + 1, [casualty('wounded', 'bear')]);
    expect(chronicle).toEqual([]);
    const p = v.people.find((x) => x.id === 10)!;
    expect(p.injuredUntilDay).toBe(DAY + 1 + 1 + HUNT_RISK.injuryDays);
    expect(isInjured(p, DAY + 60)).toBe(true);
    expect(isInjured(p, DAY + 70)).toBe(false);
  });

  it('smrt = kronika „zabil na cestě“, nástupnictví běžnou cestou', () => {
    const v = lordVillage();
    const chronicle = applyInboxDay(v, DAY + 1, [casualty('dead', 'wolves')]);
    expect(chronicle).toEqual([
      expect.objectContaining({
        kind: 'death',
        cause: 'beast',
        by: 'wolves',
        name: 'Bořivoj',
        personId: 10,
      }),
    ]);
    expect(v.people.some((p) => p.id === 10)).toBe(false);
    dynastyDay(v, DAY + 1);
    expect(v.dynasty?.lordId).toBe(20);
    // druhé doručení téhož – osoba už není, nic se nestane
    expect(applyInboxDay(v, DAY + 1, [casualty('dead', 'wolves')])).toEqual([]);
  });
});
