import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../landscape';
import { foundVillage } from '../actions';
import { cloneState } from '../clone';
import { craftCoverage } from '../crafts';
import { withDynasty } from '../dynasty';
import { canDeclareHunt, declareHunt } from '../hunt';
import { updateLordTraining } from '../lord';
import { neighbourOf } from '../neighbours';
import { ageGroup } from '../people';
import { NEIGHBOR_DIRECTIONS } from '../rules';
import { STEWARD } from '../rules-steward';
import { WILDLIFE_LAND } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import { fieldStoresOutlook } from '../simulate-plan';
import { newSteward } from '../steward-state';
import {
  constructionLogsLeft,
  grainDeal,
  grainStep,
  huntWanted,
  needSteps,
  type NeedContext,
} from '../steward-needs';
import { tradeQuote } from '../trade';
import { finishTrail, startTrail } from '../trail';
import type { Direction8, VillageState } from '../types';
import { freshWildlife } from '../wildlife';
import { at, horse, horseVillage, LORD_ID, SON_ID } from './horse-fixtures';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Krok 2a dne správce – nouze (steward.md – Obilí a lov v nouzi; Martin 8. 11. 2026: „A“): obilí
// kupuje výpravou za obchodem, jen když hrozí hlad, a lov navíc vyhlásí, jen když zvěř škodí.

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

const ARMS = { bow: 85, combat: 85, riding: 85 };
const SUMMER = at(602, 7, 10);

/** Dvorec s koňmi, rodem a zvěří; škoda zvěře letos `kg` (loni `lastKg`). */
function damaged(day: number, kg: number, lastKg?: number): VillageState {
  const list = Array.from({ length: 2 }, (_, i) => ({
    ...horse(1 + i, 8, 'male', 100),
    riderId: [LORD_ID, SON_ID][i],
  }));
  const base = horseVillage(list, 2, 4);
  delete base.dynasty;
  const s = cloneState(withDynasty(base));
  s.lastDay = day - 1;
  for (const p of s.people) if (p.sex === 'male') p.arms = { ...ARMS };
  s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  s.wildlife.damage = {
    fromDay: day - 30,
    risk: [],
    parts: {},
    topPartId: null,
    totalKg: kg,
    ...(lastKg !== undefined ? { lastYearKg: lastKg } : {}),
  };
  s.horsesCaredToday = 1;
  s.horsesFed = true;
  updateLordTraining(s, day);
  return s;
}

describe('lov v nouzi – lov navíc, když zvěř škodí (steward.md – Obilí a lov v nouzi)', () => {
  const NEED = 2000;
  const OVER = STEWARD.huntDamageShare * NEED + 1;

  it('škoda nad prahem v létě: lov navíc zítra', () => {
    const s = damaged(SUMMER, OVER);
    expect(huntWanted(s, SUMMER, NEED)).toBe(true);
    expect(declareHunt(s, SUMMER)).toBeNull();
    expect(s.wildlife!.hunt!.extraDay).toBe(SUMMER + 1);
  });

  it('loňská škoda stačí – zvěř škodí známým polím od 1. 6.', () => {
    const june = at(602, 6, 5);
    expect(huntWanted(damaged(june, 0, OVER), june, NEED)).toBe(true);
  });

  it('bez škod nebo pod prahem nic', () => {
    expect(huntWanted(damaged(SUMMER, 0), SUMMER, NEED)).toBe(false);
    expect(huntWanted(damaged(SUMMER, OVER - 2), SUMMER, NEED)).toBe(false);
    const none = damaged(SUMMER, 0);
    delete none.wildlife!.damage;
    expect(huntWanted(none, SUMMER, NEED)).toBe(false);
  });

  it('mimo měsíce škod nic (podzim, hájení na jaře)', () => {
    const sept = at(602, 9, 10);
    expect(huntWanted(damaged(sept, OVER), sept, NEED)).toBe(false);
    const april = at(602, 4, 10);
    expect(huntWanted(damaged(april, OVER), april, NEED)).toBe(false);
  });

  it('nejvýš jeden lov naráz a ne častěji, než pravidla lovu dovolí', () => {
    const s = damaged(SUMMER, OVER);
    expect(declareHunt(s, SUMMER)).toBeNull();
    // zítra už vyhlášen
    expect(canDeclareHunt(s, SUMMER)).toBe('already');
    expect(huntWanted(s, SUMMER, NEED)).toBe(false);
    // pozítří příliš brzy po minulém
    expect(huntWanted(s, SUMMER + 1, NEED)).toBe(false);
  });

  it('krok 2a vyhlásí lov jen se škodou; bez zvěře ve vsi nic', () => {
    const s = damaged(SUMMER, 1_000_000);
    needSteps(s, ctxOf(s, SUMMER));
    expect(s.wildlife!.hunt?.extraDay).toBe(SUMMER + 1);
    const calm = damaged(SUMMER, 0);
    needSteps(calm, ctxOf(calm, SUMMER));
    expect(calm.wildlife!.hunt?.extraDay).toBeUndefined();
  });

  it('nejvýš STEWARD.huntsPerSummer lovů za léto, další léto znovu', () => {
    const june = at(602, 6, 10);
    const s = damaged(june, 1_000_000);
    s.steward = newSteward(june, true);
    let hunts = 0;
    for (let day = june; day <= at(602, 8, 25); day += STEWARD.everyDays) {
      needSteps(s, ctxOf(s, day));
      if (s.wildlife!.hunt?.extraDay === day + 1) hunts++;
    }
    expect(hunts).toBe(STEWARD.huntsPerSummer);
    expect(s.steward.summerHunts).toEqual({ year: 602, count: STEWARD.huntsPerSummer });
    const nextJune = at(603, 6, 10);
    expect(huntWanted(s, nextJune, NEED)).toBe(canDeclareHunt(s, nextJune) === null);
    expect(canDeclareHunt(s, nextJune)).toBeNull();
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

  it('po kouscích stejně jako vcelku – výprava za obilím i lov', { timeout: 120_000 }, () => {
    const start = stewarded();
    const to = START + 60;
    const whole = advanceVillage(start, to, obstacles, landscape);
    let chunked = start;
    while (chunked.lastDay < to) {
      chunked = advanceVillage(chunked, Math.min(to, chunked.lastDay + 7), obstacles, landscape);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
    expect(whole.chronicle.some((e) => e.kind === 'trade-departed')).toBe(true);
    expect(whole.wildlife?.hunt?.lastExtraDay).toBeGreaterThan(START);
  });
});
