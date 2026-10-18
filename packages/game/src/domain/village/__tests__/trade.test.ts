import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { neighbourOf, neighbourStock } from '../neighbours';
import { TRADE } from '../rules';
import { advanceVillage } from '../simulate';
import {
  EXPEDITION_AWAY,
  NOT_OFFERED,
  NOT_WANTED,
  NO_TRAIL,
  OVER_STOCK,
  OVER_SUPPLY,
  UNFAIR,
  buyPrice,
  finishExpeditions,
  sellPrice,
  startExpedition,
  tradeQuote,
  villageGoodStock,
  workExpeditions,
} from '../trade';
import { finishTrail, startTrail, trailTripDays } from '../trail';
import type { Direction8, TradeGood, TradeGoods, VillageState } from '../types';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Obchod se sousedy (trade.md – Obchod): ceny s přirážkou, bilance pro souseda, nosiči po 25 kg,
// dny cesty podle stezky, práce ze společné práce vsi, zboží po návratu, jedna výprava naráz.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });

/** Ves s hotovou stezkou na jih a zásobami všeho, co sousedé můžou chtít. */
function trading(direction: Direction8 = 's'): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  const next = startTrail(s, DAY, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, DAY);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 5000;
  next.meatKg = 300;
  next.cheeseKg = 200;
  next.legumesKg = 300;
  next.woodLogs = 20;
  next.crafts = { charcoalKg: 500, toolsKg: 30, potteryKg: 80 };
  next.livestock!.herds.cow = 6;
  return next;
}

/** Výměna, kterou soused vezme: kus jeho nabídky za sháněné zboží v hodnotě s rezervou. */
function fairOffer(
  state: VillageState,
  direction: Direction8,
): { give: TradeGoods; get: TradeGoods } {
  const n = neighbourOf(state.seed, direction);
  const want = n.offers[0]!;
  const get = { [want]: 1 } as TradeGoods;
  const need = buyPrice(want);
  const pay = n.demands.find((g) => villageGoodStock(state, g) * sellPrice(g) >= need)!;
  const give = { [pay]: Math.ceil(need / sellPrice(pay)) } as TradeGoods;
  return { give, get };
}

describe('ceny výměny', () => {
  it('sháněné zboží soused bere za hodnotu, nabízené prodá za 0,96 hodnoty', () => {
    expect(sellPrice('cheese')).toBeCloseTo(4);
    expect(buyPrice('salt')).toBeCloseTo(8 * 1.2 * 0.8);
    expect(buyPrice('iron')).toBeCloseTo(30 * 0.96);
    expect(TRADE.markup).toBe(0.2);
  });
});

describe('ocenění a kontrola výměny', () => {
  it('bez hotové stezky nejde', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
    );
    expect(tradeQuote(s, { direction: 's', give: {}, get: {} }, DAY).blocked).toBe(NO_TRAIL);
  });

  it('nosiči po 25 kg, dny podle délky stezky, práce = nosiči × dny', () => {
    const s = trading();
    const { give, get } = fairOffer(s, 's');
    const quote = tradeQuote(s, { direction: 's', give, get }, DAY);
    expect(quote.blocked).toBeNull();
    expect(quote.balance).toBeGreaterThanOrEqual(0);
    expect(quote.days).toBe(trailTripDays(s.trails![0]!.lengthM));
    expect(quote.manDays).toBe(quote.porters * quote.days);
    const n = neighbourOf(s.seed, 's');
    const heavy = n.demands.find((g) => g === 'grain' || g === 'legumes' || g === 'meat');
    if (heavy) {
      const q = tradeQuote(s, { direction: 's', give: { [heavy]: 60 }, get: {} }, DAY);
      expect(q.porters).toBe(3);
    }
  });

  it('jen sháněné a nabízené zboží, nejvýš zásoby; bilance pro souseda ≥ 0', () => {
    const s = trading();
    const n = neighbourOf(s.seed, 's');
    const offered = n.offers[0]!;
    const notWanted = (['grain', 'meat', 'cheese', 'legumes', 'logs'] as TradeGood[]).find(
      (g) => !n.demands.includes(g),
    )!;
    expect(tradeQuote(s, { direction: 's', give: { [notWanted]: 1 }, get: {} }, DAY).blocked).toBe(
      NOT_WANTED,
    );
    const notOffered = n.demands[0]!;
    expect(tradeQuote(s, { direction: 's', give: {}, get: { [notOffered]: 1 } }, DAY).blocked).toBe(
      NOT_OFFERED,
    );
    const supply = neighbourStock(s, 's', DAY).supply[offered]!;
    expect(
      tradeQuote(s, { direction: 's', give: {}, get: { [offered]: supply + 1 } }, DAY).blocked,
    ).toBe(OVER_SUPPLY);
    expect(tradeQuote(s, { direction: 's', give: {}, get: { [offered]: 1 } }, DAY).blocked).toBe(
      UNFAIR,
    );
    const pay = n.demands[0]!;
    const tooMuch = villageGoodStock(s, pay) + 1;
    const over = tradeQuote(s, { direction: 's', give: { [pay]: tooMuch }, get: {} }, DAY);
    expect([OVER_STOCK, 'Tolik soused letos nevezme.']).toContain(over.blocked);
  });
});

describe('výprava', () => {
  it('zboží odejde, soused ho odepíše; druhá výprava k témuž sousedovi nejde', () => {
    const s = trading();
    const { give, get } = fairOffer(s, 's');
    const [pay, amount] = Object.entries(give)[0] as [TradeGood, number];
    const before = villageGoodStock(s, pay);
    const next = startExpedition(s, DAY, { direction: 's', give, get });
    expect(villageGoodStock(next, pay)).toBe(before - amount);
    const stock = neighbourStock(next, 's', DAY);
    expect(stock.demand[pay]).toBe(neighbourOf(s.seed, 's').demand[pay]! - amount);
    expect(next.trade!.expeditions).toHaveLength(1);
    expect(next.chronicle.at(-1)).toMatchObject({ kind: 'trade-departed', direction: 's' });
    expect(tradeQuote(next, { direction: 's', give, get }, DAY).blocked).toBe(EXPEDITION_AWAY);
    expect(() => startExpedition(next, DAY, { direction: 's', give, get })).toThrow(
      EXPEDITION_AWAY,
    );
  });

  it('nosiči berou nejvýš svůj počet za den; zboží dorazí po návratu', () => {
    const s = startExpedition(trading(), DAY, { direction: 's', ...fairOffer(trading(), 's') });
    const e = s.trade!.expeditions[0]!;
    const work = workExpeditions(s, 100);
    expect(work.used).toBe(Math.min(e.porters, e.cost));
    expect(work.shares).toEqual([{ trailId: e.trailId, manDays: work.used }]);
    // málo společné práce – cesta trvá déle
    const slow = structuredClone(s);
    expect(workExpeditions(slow, 0.5).used).toBe(0.5);
    // dokončená práce – zboží dorazí
    e.done = e.cost;
    const [good, amount] = Object.entries(e.get)[0] as [TradeGood, number];
    const before = villageGoodStock(s, good);
    const events = finishExpeditions(s, DAY + 9);
    expect(events).toEqual([{ day: DAY + 9, kind: 'trade-returned', direction: 's', get: e.get }]);
    expect(villageGoodStock(s, good)).toBe(before + amount);
    expect(s.trade!.expeditions).toHaveLength(0);
  });

  it('v simulaci se výprava vrátí po dnech cesty a nezávisí na kouscích dopočtu', () => {
    const s = startExpedition(trading(), DAY, { direction: 's', ...fairOffer(trading(), 's') });
    const days = s.trade!.expeditions[0]!.days;
    const whole = advanceVillage(s, DAY + 40, null, LANDSCAPE);
    const returned = whole.chronicle.find((ev) => ev.kind === 'trade-returned');
    expect(returned).toBeDefined();
    expect(returned!.day).toBeGreaterThanOrEqual(DAY + days);
    expect(whole.labor).toBeDefined();
    let parts = s;
    for (const step of [1, 2, 5, 40]) parts = advanceVillage(parts, DAY + step, null, LANDSCAPE);
    expect(parts).toEqual(whole);
  });

  it('nosiči jsou v rozdělení práce dne u stezky', () => {
    const s = startExpedition(trading(), DAY, { direction: 's', ...fairOffer(trading(), 's') });
    const next = advanceVillage(s, DAY + 1, null, LANDSCAPE);
    const share = next.labor!.shares.find((x) => x.activity === 'trade');
    expect(share?.target).toEqual({ kind: 'trail', id: s.trails![0]!.id });
  });
});
