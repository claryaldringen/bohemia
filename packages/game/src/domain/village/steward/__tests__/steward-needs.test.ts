import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { cloneState } from '../../core/clone';
import { craftCoverage } from '../../crafts/crafts';
import { neighbourOf } from '../../trade/neighbours';
import { ageGroup } from '../../people/people';
import { NEIGHBOR_DIRECTIONS } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { fieldStoresOutlook } from '../../core/simulate-plan';
import { newSteward } from '../steward-state';
import {
  constructionLogsLeft,
  grainDeal,
  grainStep,
  needSteps,
  type NeedContext,
} from '../steward-needs';
import { tradeQuote } from '../../trade/trade';
import { finishTrail, startTrail } from '../../trade/trail';
import type { Direction8, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Krok 2a dne správce – nouze (steward.md – Obilí a lov v nouzi; Martin 8. 11. 2026: „A“): obilí
// kupuje výpravou za obchodem, jen když hrozí hlad. Lov správce (hunting.md – Pravidla 8) testuje
// `wildlife/__tests__/npc-hunt.test.ts`.

const DAY = dayIndexOf({ year: 600, month: 12, day: 1 });
const SEED = 11;

/** Směr k sousedovi, který nabízí obilí. */
function grainDirection(seed: number): Direction8 {
  const dir = NEIGHBOR_DIRECTIONS.find((d) => neighbourOf(seed, d).offers.includes('grain'));
  if (!dir) throw new Error('žádný obilnář');
  return dir;
}

/** Ves se správcem, hotovou stezkou k obilnáři, bez zásob obilí a s kládami na zaplacení. */
function hungry(direction: Direction8 = grainDirection(SEED)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: SEED, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 0;
  delete next.reservedSeedKg;
  next.woodLogs = 30;
  withAdults(next, 8);
  return next;
}

/** Doplní ves na `n` dospělých (svobodní, 25 let) – dost nosičů na výpravu s kládami. */
function withAdults(state: VillageState, n: number): void {
  const home = state.people[0]!.dwellingId;
  let id = Math.max(...state.people.map((p) => p.id)) + 1;
  while (state.people.filter((p) => ageGroup(p, DAY) === 'adult').length < n) {
    state.people.push({
      id,
      bornDay: DAY - 25 * 365,
      dwellingId: home,
      sex: id % 2 === 0 ? 'male' : 'female',
    });
    id++;
  }
  state.nextId = Math.max(state.nextId, id);
}

function ctxOf(state: VillageState, day = DAY): NeedContext {
  return { day, landscape: LANDSCAPE, coverage: craftCoverage(state, day) };
}

function shortOf(state: VillageState, day = DAY): number {
  return fieldStoresOutlook(state, day, craftCoverage(state, day)).shortKg;
}

describe('obilí v nouzi – výprava za obchodem (steward.md – Obilí a lov v nouzi)', () => {
  it('hrozí hlad: výprava k obilnáři, koupí chybějící obilí a platí zbožím, které shání', () => {
    const s = hungry();
    const short = shortOf(s);
    expect(short).toBeGreaterThan(STEWARD.grainMinKg);
    expect(grainStep(s, ctxOf(s), short)).toBe(true);
    const expeditions = s.trade!.expeditions;
    expect(expeditions).toHaveLength(1);
    const e = expeditions[0]!;
    const neighbour = neighbourOf(s.seed, e.direction);
    expect(neighbour.offers).toContain('grain');
    expect(e.get.grain).toBeGreaterThanOrEqual(STEWARD.grainMinKg);
    // jen chybějící (a přeplatek posledního kusu), ne víc
    const logCredit = 50;
    expect(e.get.grain!).toBeLessThanOrEqual(Math.ceil(short) + logCredit);
    for (const g of Object.keys(e.give)) {
      expect(STEWARD.grainPayment).toContain(g);
      expect(neighbour.demands).toContain(g);
    }
    // nosičů nejvýš polovina dospělých
    const adults = s.people.filter((p) => ageGroup(p, DAY) === 'adult').length;
    expect(e.porters).toBeLessThanOrEqual(
      Math.max(1, Math.floor(adults * STEWARD.grainPorterShare)),
    );
    expect(s.chronicle.at(-1)?.kind).toBe('trade-departed');
    // stejná výměna projde kontrolou hráče
    const again = hungry();
    const deal = grainDeal(again, DAY, LANDSCAPE, short)!;
    expect(tradeQuote(again, deal.offer, DAY, LANDSCAPE).blocked).toBeNull();
  });

  it('bez hrozícího hladu výprava nevyrazí', () => {
    const s = hungry();
    s.storesKg = 50_000;
    expect(shortOf(s)).toBe(0);
    needSteps(s, ctxOf(s));
    expect(s.trade?.expeditions ?? []).toHaveLength(0);
  });

  it('bez čím platit výprava nevyrazí (jídlem ani dobytkem neplatí)', () => {
    const s = hungry();
    s.woodLogs = 0;
    s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 0 };
    s.meatKg = 500;
    s.cheeseKg = 500;
    expect(grainStep(s, ctxOf(s), shortOf(s))).toBe(false);
    expect(s.trade?.expeditions ?? []).toHaveLength(0);
  });

  it('bez hotové stezky k obilnáři nic', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: SEED, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
    );
    s.lastDay = DAY;
    s.storesKg = 0;
    s.woodLogs = 30;
    withAdults(s, 8);
    expect(grainStep(s, ctxOf(s), shortOf(s))).toBe(false);
  });

  it('malá ves, která neunese ani kládu (2 dospělí → 1 nosič), nic nekoupí', () => {
    const s = hungry();
    let kept = 0;
    s.people = s.people.filter((p) => ageGroup(p, DAY) !== 'adult' || kept++ < 2);
    expect(grainDeal(s, DAY, LANDSCAPE, shortOf(s))).toBeNull();
  });

  it('nejvýš jedna výprava naráz – ani vedle výpravy hráče', () => {
    const s = hungry();
    const ctx = ctxOf(s);
    expect(grainStep(s, ctx, shortOf(s))).toBe(true);
    expect(grainStep(s, ctx, shortOf(s))).toBe(false);
    expect(s.trade!.expeditions).toHaveLength(1);
  });

  it('nepřekročí, co soused má, ani polovinu dospělých jako nosiče', () => {
    const s = hungry();
    const deal = grainDeal(s, DAY, LANDSCAPE, 100_000)!;
    expect(deal).not.toBeNull();
    const quote = tradeQuote(s, deal.offer, DAY, LANDSCAPE);
    const adults = s.people.filter((p) => ageGroup(p, DAY) === 'adult').length;
    expect(quote.porters).toBeLessThanOrEqual(
      Math.max(1, Math.floor(adults * STEWARD.grainPorterShare)),
    );
  });

  it('deterministicky: stejný stav a den dají stejnou výpravu', () => {
    const a = hungry();
    const b = cloneState(a);
    needSteps(a, ctxOf(a));
    needSteps(b, ctxOf(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('obilí v nouzi – rezerva klád staveb', () => {
  it('klády, které rozestavěné stavby ještě vezmou, správce neprodá', () => {
    const s = hungry();
    const free = grainDeal(s, DAY, LANDSCAPE, shortOf(s))!;
    expect(free.offer.give.logs).toBeGreaterThan(0);
    // rozestavěná stavba, které chybí skácet tolik stromů, kolik je na hromadě
    const reserved = hungry();
    const logs = reserved.woodLogs ?? 0;
    reserved.constructions.push({
      id: 9000,
      kind: 'pen',
      startedDay: DAY,
      cost: 100,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
      wood: {
        trees: logs,
        fromPile: 0,
        fell: Array.from({ length: logs }, () => ({ id: null, cost: 1 })),
        felled: 0,
      },
    });
    expect(constructionLogsLeft(reserved)).toBe(logs);
    expect(grainDeal(reserved, DAY, LANDSCAPE, shortOf(reserved))?.offer.give.logs).toBeUndefined();
  });
});

describe('krok 2a v dopočtu vsi (determinismus)', () => {
  const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
  const obstacles = obstaclesOf(landscape);
  const START =
    Math.ceil(dayIndexOf({ year: 600, month: 6, day: 10 }) / STEWARD.everyDays) * STEWARD.everyDays;

  /** Ves se správcem na místě krajiny 1, se stezkou k obilnáři, bez obilí a se škodami zvěře. */
  function stewarded(): VillageState {
    const site = landscape.villageSite;
    const c = tileCenterWorld(landscape, site.x, site.y);
    // seed vsi, jejíž obilnář leží směrem, kudy na krajině 1 vede stezka ke kraji mapy
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const founded = foundVillage({
        seed,
        day: START - 1,
        dwellingPosition: { x: c.x, z: c.z, rotation: 0 },
      });
      let s: VillageState = withBuiltFirstDwelling({
        ...founded,
        steward: newSteward(START, true),
      });
      s = advanceVillage(s, START - 1, obstacles, landscape);
      for (const dir of NEIGHBOR_DIRECTIONS) {
        if (!neighbourOf(seed, dir).offers.includes('grain')) continue;
        try {
          return withNeeds(startTrail(s, START - 1, dir, landscape, obstacles));
        } catch {
          // tudy stezka nevede – další směr
        }
      }
    }
    throw new Error('žádná stezka k obilnáři');
  }

  function withNeeds(trailed: VillageState): VillageState {
    const s = trailed;
    const trail = s.constructions.find((x) => x.trail !== undefined)!;
    finishTrail(s, trail, START - 1);
    s.constructions = s.constructions.filter((x) => x !== trail);
    s.storesKg = 0;
    delete s.reservedSeedKg;
    s.woodLogs = 30;
    withAdults(s, 8);
    s.wildlife!.damage = {
      fromDay: START - 9,
      risk: [],
      parts: {},
      topPartId: null,
      totalKg: 0,
      lastYearKg: 100_000,
    };
    return s;
  }

  it('po kouscích stejně jako vcelku – výprava za obilím', { timeout: 120_000 }, () => {
    const start = stewarded();
    const to = START + 60;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let chunked = start;
    while (chunked.lastDay < to) {
      chunked = advanceVillage(chunked, Math.min(to, chunked.lastDay + 7), obstacles, landscape);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    expect(whole.chronicle.some((e) => e.kind === 'trade-departed')).toBe(true);
  });
});
