import { describe, expect, it } from 'vitest';
import { MERCHANTS } from '../../rules';
import type {
  ArmsGood,
  ChronicleEvent,
  MarketArrival,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGoods,
  VillageState,
} from '../../types';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { coinClearing, type CoinParty } from '../market-coins';
import { marketStance } from '../market-stance';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import { D, marketVillage, report } from './market-fixtures';

// Zlato v mincovní fázi (gold.md – Pravidla 2; Rozhodnutí plánu 6, body 2, 3 a 8; Mince 2,4 g, bod 4): mince
// váží 2,4 g a zlato se za mince mění jen po celých mincích; kupují ho cizí kupci (`MERCHANTS.wants.gold`) a hostitel ho přespolním výpravám
// vymění za své mince 1:1 – po objednané zbroji a nejvýš za měšec (`exchangesGold`). Zlato není
// v zápočtu ani v C a W hladiny; trh bez zlata je bit po bitu jako po plánu 5. Trh bez cen.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po D. */
const DAY = nextMerchantVisit([STOP], D)!.day;

/** Strana mincovní fáze – bez mincí, zboží i seznamu, dokud je `fields` nedoplní. */
function party(key: string, fields: Partial<CoinParty> = {}): CoinParty {
  return { key, coins: 0, stock: {}, wants: {}, ...fields };
}

interface HostFields {
  coins?: number;
  gold?: number;
  /** Obilí nad pojistkou – bez něj ves nic nenabízí. */
  spareKg?: number;
  armsOrder?: Partial<Record<ArmsGood, number>>;
}

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců, s mincemi, zlatem a objednávkou
 * (vzor `host` plánů 4 a 5) – bez `spareKg` nic nenabízí.
 */
function host({ coins = 0, gold = 0, spareKg = 0, armsOrder }: HostFields = {}): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain! + spareKg;
  s.merchantStops = [{ ...STOP }];
  if (coins > 0) s.coins = coins;
  if (gold > 0) s.gold = gold;
  if (armsOrder) s.armsOrder = { ...armsOrder };
  return s;
}

/** Výprava z vsi `key` s nákladem `goods`, která shání `wants`. */
function trip(key: string, goods: TradeGoods, wants: TradeGoods = {}): MarketArrival {
  return {
    key,
    fromVillageId: key.split(':')[1]!,
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods,
    horses: [],
    wants,
    report,
  };
}

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  if (merchants.length !== 1) throw new Error('Na trhu není právě jeden kupec.');
  return merchants[0]!;
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Co ves za tržní den prodala a koupila (kronika `market-held`), bez zápisu null. */
function heldOf(
  chronicle: readonly ChronicleEvent[],
): { sold: TradeGoods; bought: TradeGoods } | null {
  const held = chronicle.find((e) => e.kind === 'market-held');
  return held?.kind === 'market-held' ? { sold: held.sold, bought: held.bought } : null;
}

describe('mincovní fáze – zlato za mince (coinClearing, hladina 1)', () => {
  it('kupec s měšcem 60 koupí od výpravy 50 g zlata jen po celých mincích: 48 g za 20 mincí', () => {
    const c = coinClearing(
      [
        party('host'),
        party('e', { stock: { gold: 50 } }),
        party('kupec', { coins: 60, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    // 50 g ÷ 2,4 = 20 celých mincí (48 g), zbylé 2 g zůstanou výpravě
    expect(c.trades).toEqual([{ seller: 'e', buyer: 'kupec', good: 'gold', amount: 48 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'e', coins: 20 }]);
  });

  it('kupec s měšcem 20 mincí koupí od hostitele 48 g ze 100', () => {
    const c = coinClearing(
      [
        party('host', { stock: { gold: 100 } }),
        party('kupec', { coins: 20, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    // 20 mincí × 2,4 g = 48 g
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 48 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 20 }]);
  });

  it('hostitel vymění zlato výpravy za své mince 1:1, nejvýš za měšec: 24 g ze 30', () => {
    const c = coinClearing(
      [party('host', { coins: 10, exchangesGold: true }), party('e', { stock: { gold: 30 } })],
      {},
      1,
    );
    // 10 mincí × 2,4 g = 24 g
    expect(c.trades).toEqual([{ seller: 'e', buyer: 'host', good: 'gold', amount: 24 }]);
    expect(c.payments).toEqual([{ buyer: 'host', seller: 'e', coins: 10 }]);
    expect([c.available, c.sought]).toEqual([0, 0]);
  });

  it('výměna jen od nekupců a jen zlato, výpravy v pořadí stran', () => {
    const c = coinClearing(
      [
        party('host', { coins: 100, exchangesGold: true }),
        party('e', { stock: { gold: 30, honey: 10 } }),
        party('f', { stock: { gold: 50 } }),
        party('kupec', { stock: { gold: 40, swords: 2 }, merchant: true }),
      ],
      {},
      1,
    );
    // e: 30 g ÷ 2,4 = 12 mincí (28,8 g); f: 50 g ÷ 2,4 = 20 mincí (48 g)
    expect(c.trades).toEqual([
      { seller: 'e', buyer: 'host', good: 'gold', amount: 28.8 },
      { seller: 'f', buyer: 'host', good: 'gold', amount: 48 },
    ]);
    expect(c.payments).toEqual([
      { buyer: 'host', seller: 'e', coins: 12 },
      { buyer: 'host', seller: 'f', coins: 20 },
    ]);
  });

  it('napřed objednaná zbroj od kupců, pak výměna zbylými mincemi, pak výpravy', () => {
    const c = coinClearing(
      [
        party('host', {
          coins: 150,
          stock: { grain: 1_000 },
          wants: { swords: 1 },
          fromMerchants: true,
          exchangesGold: true,
        }),
        party('e', { stock: { gold: 100 }, wants: { grain: 900 } }),
        party('kupec', { stock: { swords: 2 }, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    // meč 20 mincí, zbývá 130; E dá ze 100 g jen 41 celých mincí (98,4 g; 100 ÷ 2,4 = 41,67)
    // E za mince z výměny koupí obilí (900 kg = 10 mincí) – výprava kupuje až po hostiteli
    expect(c.trades).toEqual([
      { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
      { seller: 'e', buyer: 'host', good: 'gold', amount: 98.4 },
      { seller: 'host', buyer: 'e', good: 'grain', amount: 900 },
    ]);
    expect(c.payments).toEqual([
      { buyer: 'host', seller: 'kupec', coins: 20 },
      { buyer: 'host', seller: 'e', coins: 41 },
      { buyer: 'e', seller: 'host', coins: 10 },
    ]);
  });

  it('C a W zlato nevidí – seznam jen se zlatem kupujícím hladiny není', () => {
    const c = coinClearing(
      [
        party('host', { stock: { gold: 100, grain: 1_000 } }),
        party('e', { coins: 50, wants: { grain: 900, gold: 30 } }),
        party('f', { coins: 40, wants: { gold: 20 } }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'e', good: 'grain', amount: 900 },
      { seller: 'host', buyer: 'e', good: 'gold', amount: 28.8 },
      { seller: 'host', buyer: 'f', good: 'gold', amount: 19.2 },
    ]);
    // e: obilí 10 mincí + zlato 30 g ÷ 2,4 = 12 mincí (28,8 g); f: 20 g ÷ 2,4 = 8 mincí (19,2 g)
    expect(c.payments).toEqual([
      { buyer: 'e', seller: 'host', coins: 22 },
      { buyer: 'f', seller: 'host', coins: 8 },
    ]);
    // C = min(50, obilí 10), W = obilí 10 – zlato v nich není
    expect(c.available).toBeCloseTo(10, 9);
    expect(c.sought).toBeCloseTo(10, 9);
  });
});

describe('tržní den – zlato u kupců a výměna u hostitele (marketDay)', () => {
  it('hostitel se 100 g: kupec s měšcem bez dna koupí 98,4 g za 41 mincí, 1,6 g zůstane', () => {
    const s = host({ gold: 100 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(merchant.goods).not.toHaveProperty('coins');
    const chronicle = marketDay(s, DAY);
    // 100 g ÷ 2,4 = 41 celých mincí = 98,4 g; zbylých 1,6 g je pod minci a zůstane ve vsi
    expect(merchant.bought).toEqual({ gold: 98.4 });
    expect(merchant.goods).not.toHaveProperty('coins');
    expect(merchant.wants.gold).toBe(901.6);
    expect(s.gold).toBe(1.6);
    expect(s.coins).toBe(41);
    expect(heldOf(chronicle)).toEqual({ sold: { gold: 98.4 }, bought: { coins: 41 } });
    expect(s.market).not.toHaveProperty('level');
  });

  it('zlomek mince zůstane ve vsi: ze 40,75 g kupec koupí 38,4 g za 16 mincí', () => {
    const s = host({ gold: 40.75 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    // 40,75 ÷ 2,4 = 16,98 → 16 mincí = 38,4 g, ve vsi zbude 2,35 g
    expect(merchant.bought).toEqual({ gold: 38.4 });
    expect(merchant.goods).not.toHaveProperty('coins');
    expect(s.gold).toBeCloseTo(2.35, 9);
    expect(s.coins).toBe(16);
  });

  it('objednaný meč napřed, pak výměna: E má 10 mincí a 76 g, ves 0 mincí a 24 g', () => {
    const s = host({ coins: 30, armsOrder: { swords: 1 } });
    joinMarket(s, DAY, trip('market:e:1', { gold: 100 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    merchant.goods = { swords: 2 };
    merchant.wants = {}; // zlato výpravy nekoupí – vymění ho hostitel
    const chronicle = marketDay(s, DAY);
    // mince za meč u kupce zanikly (měšec bez dna)
    expect(merchant.goods).toEqual({ swords: 1 });
    expect(merchant.bought).toEqual({});
    const e = resultOf(s, 'market:e:1');
    // meč 20 mincí, zbývá 10 mincí = 24 g zlata výpravy
    expect(e).toMatchObject({ sold: { gold: 24 }, bought: {}, coinsGot: 10 });
    expect(e.unsold).toEqual({ gold: 76, coins: 10 });
    expect([s.coins, s.gold, s.arms, s.armsOrder]).toEqual([
      undefined,
      24,
      { swords: 1 },
      undefined,
    ]);
    expect(heldOf(chronicle)).toEqual({ sold: { coins: 30 }, bought: { swords: 1, gold: 24 } });
    // zlato se jen přesunulo (100 g před i po); mince: 30 − 20 za meč, které u kupce zanikly
    expect((s.coins ?? 0) + (e.unsold.coins ?? 0)).toBe(30 - 20);
    expect((s.gold ?? 0) + (e.unsold.gold ?? 0)).toBe(100);
    // C = W = meč za 20 – hladina stojí
    expect(s.market).not.toHaveProperty('level');
  });

  it.each([undefined, 1.5])(
    'jen výměna bez kupce (hladina %s): fáze se spustí, E má 8 mincí a 10,8 g, ves 19,2 g',
    (level) => {
      const s = host({ coins: 8 });
      joinMarket(s, DAY, trip('market:e:1', { gold: 30 }));
      if (level !== undefined) s.market!.level = level;
      const chronicle = marketDay(s, DAY);
      const e = resultOf(s, 'market:e:1');
      // 8 mincí × 2,4 g = 19,2 g ze 30 g
      expect(e).toMatchObject({ sold: { gold: 19.2 }, bought: {}, coinsGot: 8 });
      expect(e.unsold).toEqual({ gold: 10.8, coins: 8 });
      expect([s.coins, s.gold]).toEqual([undefined, 19.2]);
      expect(heldOf(chronicle)).toEqual({ sold: { coins: 8 }, bought: { gold: 19.2 } });
      expect(s.market!.level).toBe(level);
    },
  );

  it('zápočet zlato nebere: E se 100 g obilí nedostane, hostitel bez mincí nic nevymění', () => {
    const s = host({ spareKg: 1_000 });
    expect(marketStance(s, DAY).offer.grain).toBeGreaterThan(0);
    const stores = s.storesKg;
    joinMarket(s, DAY, trip('market:e:1', { gold: 100 }, { grain: 500 }));
    const chronicle = marketDay(s, DAY);
    const e = resultOf(s, 'market:e:1');
    expect([e.sold, e.bought, e.unsold]).toEqual([{}, {}, { gold: 100 }]);
    expect(e).not.toHaveProperty('coinsGot');
    expect(s.storesKg).toBe(stores);
    expect(heldOf(chronicle)).toBeNull();
    expect(s).not.toHaveProperty('gold');
    expect(s.market).not.toHaveProperty('level');
  });

  it.each([undefined, 1.5])('den jen se zlatem prodaným kupcům: hladina %s se nehne', (level) => {
    const s = host({ gold: 100 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    merchant.goods.coins = 200;
    if (level !== undefined) s.market!.level = level;
    marketDay(s, DAY);
    expect(merchant.bought).toEqual({ gold: 98.4 }); // 41 celých mincí
    expect([s.gold, s.coins]).toEqual([1.6, 41]);
    expect(s.market!.level).toBe(level);
  });
});

describe('trh bez zlata: bit po bitu jako po plánu 5 (Rozhodnutí plánu 6, bod 8)', () => {
  /** Trhy dne kupců bez zlata – zápočet se zbrojí, nákupy kupce za mince, zbroj za mince. */
  const MARKETS: [string, MarketArrival[], HostFields][] = [
    [
      'zápočet za meč a helma za mince',
      [
        trip('market:a:1', { honey: 100, wax: 24, furs: 60 }, { swords: 1 }),
        trip('market:b:1', { coins: 300 }, { helmets: 1 }),
      ],
      {},
    ],
    [
      'kupec kupuje med a kožešiny za mince, výprava helmu',
      [
        trip('market:a:1', { honey: 50, furs: 20 }),
        trip('market:b:1', { coins: 300 }, { helmets: 1 }),
      ],
      {},
    ],
    [
      'kupec kupuje med, ves objednaný meč',
      [trip('market:a:1', { honey: 50 })],
      { coins: 150, armsOrder: { swords: 1 } },
    ],
    ['jen kupci', [], {}],
  ];

  /** Trh `arrivals` s kupcem, který má v měšci 200 mincí a na seznamu 1 000 g zlata. */
  function goldListMarket(arrivals: readonly MarketArrival[], fields: HostFields): VillageState {
    const s = host(fields);
    for (const arrival of arrivals) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    // velký měšec (po prodeji zbroje) – min(měšec, seznam) by zlato v C zvedlo
    merchant.goods.coins = 200;
    merchant.wants = { ...merchant.wants, gold: 1_000 };
    return s;
  }

  it.each(MARKETS)(
    '%s: zlato na seznamu nezmění ceny, hladinu ani obchody',
    (_, arrivals, fields) => {
      const s = goldListMarket(arrivals, fields);
      const plan5 = structuredClone(s);
      delete merchantOf(plan5).wants.gold;
      const [merchant, merchant5] = [merchantOf(s), merchantOf(plan5)];
      const [held, held5] = [marketDay(s, DAY), marketDay(plan5, DAY)];
      expect(held).toEqual(held5);
      expect(s.market!.prices).toEqual(plan5.market!.prices);
      expect(s.market!.level).toBe(plan5.market!.level);
      expect(s.outbox).toEqual(plan5.outbox);
      expect([merchant.sold, merchant.bought, merchant.goods]).toEqual([
        merchant5.sold,
        merchant5.bought,
        merchant5.goods,
      ]);
      expect(merchant.wants).toEqual({ ...merchant5.wants, gold: 1_000 });
      expect([s.coins, s.storesKg, s.arms, s.armsOrder]).toEqual([
        plan5.coins,
        plan5.storesKg,
        plan5.arms,
        plan5.armsOrder,
      ]);
    },
  );

  it('trhy srovnání obchodují; hladina stojí, kupci ji nehýbou', () => {
    const levels = MARKETS.slice(0, 3).map(([, arrivals, fields]) => {
      const s = goldListMarket(arrivals, fields);
      marketDay(s, DAY);
      return s.market!.level;
    });
    // helma i objednaný meč: C = W (240 a 120) – hladina stojí; kupci do ní nepatří (Měšec kupců bez
    // dna, bod 4)
    expect(levels).toEqual([undefined, undefined, undefined]);
  });
});

describe('kupci kupují zlato (MERCHANTS.wants.gold – Rozhodnutí plánu 6, bod 8)', () => {
  it('seznam kupce a zápis příjezdu mají zlato, první v pořadí', () => {
    const list = { gold: 1_000, honey: 100, wax: 24, furs: 60, slaves: 10 };
    expect(MERCHANTS.wants).toEqual(list);
    expect(Object.keys(MERCHANTS.wants)[0]).toBe('gold');
    const s = host();
    const [arrived] = merchantsArrive(s, DAY);
    expect(arrived).toMatchObject({ kind: 'merchants-arrived', buys: list });
    expect(merchantOf(s).wants).toEqual(list);
  });
});
