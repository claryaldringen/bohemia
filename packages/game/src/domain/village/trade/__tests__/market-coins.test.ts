import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import type { MarketPrices, TradeGoods } from '../../types';
import { COIN_GOOD, TRADE_GOODS, isPieceGood } from '../goods';
import { coinClearing, type CoinClearing, type CoinParty } from '../market-coins';
import { coinPriceOf, initialPrice, nextLevel } from '../market-prices';

// Mincovní fáze tržního dne (markets.md – Rozhodnutí plánu 4, body 2 a 3): co zápočty nechaly
// neuspokojené, koupí za mince, kdo je má – celé mince, celé kusy, součet plateb nula. Výchozí ceny
// v mincích: obilí 1/15 za kg, kráva 40, kožešina 8/15, muž 24. „Kupec“ je cizí kupec (`merchant`).

/** Strana mincovní fáze – bez mincí, zboží i seznamu, dokud je `fields` nedoplní. */
function party(key: string, fields: Partial<CoinParty> = {}): CoinParty {
  return { key, coins: 0, stock: {}, wants: {}, ...fields };
}

/** Měšec strany `p` po platbách dne. */
function purse(clearing: CoinClearing, p: CoinParty): number {
  return clearing.payments.reduce(
    (sum, x) => sum + (x.seller === p.key ? x.coins : 0) - (x.buyer === p.key ? x.coins : 0),
    p.coins,
  );
}

/** Hodnota zboží obchodů dvojice za ceny dne a hladinu (mince). */
function worth(
  clearing: CoinClearing,
  buyer: string,
  seller: string,
  prices: MarketPrices,
  level: number,
): number {
  return clearing.trades
    .filter((t) => t.buyer === buyer && t.seller === seller)
    .reduce((sum, t) => sum + t.amount * coinPriceOf(prices, level, t.good), 0);
}

describe('mincovní fáze – nákup za mince (markets.md – Rozhodnutí plánu 4, bod 2)', () => {
  it('300 kg obilí za 20 mincí, výpravě s 50 zbude 30', () => {
    const host = party('host', { stock: { grain: 1000 } });
    const trip = party('a', { coins: 50, wants: { grain: 300 } });
    const c = coinClearing([host, trip], {}, 1);
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'a', good: 'grain', amount: 300 }]);
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 20 }]);
    expect(purse(c, trip)).toBe(30);
    expect(purse(c, host)).toBe(20);
  });

  it('na víc, než má v měšci, výprava nekoupí: 7 mincí je 105 kg obilí', () => {
    const c = coinClearing(
      [party('host', { stock: { grain: 1000 } }), party('a', { coins: 7, wants: { grain: 300 } })],
      {},
      1,
    );
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'a', good: 'grain', amount: expect.closeTo(105, 9) },
    ]);
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 7 }]);
  });

  it('kus jen celý a platba nahoru na celou minci: kupec za 10 mincí 18 kožešin (9,6)', () => {
    const c = coinClearing(
      [
        party('host', { stock: { furs: 30 } }),
        party('kupec', { coins: 10, wants: { furs: 60 }, merchant: true }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'furs', amount: 18 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 10 }]);
  });

  it('hostitel bez mincí a seznamu nic nekoupí; prodá i lidi, koně, vozy a klády', () => {
    const goods: TradeGoods = { families: 1, men: 1, mares: 1, twoWheelCarts: 1, logs: 4 };
    const host = party('host', { stock: goods });
    const trip = party('a', { coins: 500, stock: { cows: 3, grain: 900 }, wants: goods });
    const c = coinClearing([host, trip], {}, 1);
    // pořadí TRADE_GOODS: koně, klády, vozy, lidé
    expect(c.trades.map((t) => [t.seller, t.buyer, t.good, t.amount])).toEqual([
      ['host', 'a', 'mares', 1],
      ['host', 'a', 'logs', 4],
      ['host', 'a', 'twoWheelCarts', 1],
      ['host', 'a', 'families', 1],
      ['host', 'a', 'men', 1],
    ]);
    // klisna 106,67 + 4 klády 10,67 + dvoukolák 21,33 + rodina 48 + muž 24 = 210,67 → 211
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 211 }]);
    expect(purse(c, trip)).toBe(289);
  });

  it('prodává napřed hostitel, pak výpravy podle příjezdu: 10 kožešin za 6 a 26 za 14 mincí', () => {
    const host = party('host', { stock: { furs: 10 } });
    const trip = party('a', { stock: { furs: 30 } });
    const merchant = party('kupec', { coins: 20, wants: { furs: 60 }, merchant: true });
    const c = coinClearing([host, trip, merchant], {}, 1);
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'kupec', good: 'furs', amount: 10 },
      { seller: 'a', buyer: 'kupec', good: 'furs', amount: 26 },
    ]);
    expect(c.payments).toEqual([
      { buyer: 'kupec', seller: 'host', coins: 6 },
      { buyer: 'kupec', seller: 'a', coins: 14 },
    ]);
    expect(purse(c, merchant)).toBe(0);
  });

  it('nákup dvojice pod jednu minci se zruší celý; přesně mince stačí', () => {
    const buy = (furs: number): CoinClearing =>
      coinClearing(
        [
          party('host', { stock: { furs } }),
          party('kupec', { coins: 10, wants: { furs }, merchant: true }),
        ],
        {},
        1,
      );
    expect(buy(1)).toMatchObject({ trades: [], payments: [] });
    expect(buy(2).payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 2 }]);
    const grain = coinClearing(
      [party('host', { stock: { grain: 15 } }), party('a', { coins: 1, wants: { grain: 15 } })],
      {},
      1,
    );
    expect(grain.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 1 }]);
  });

  it('pod minci u jednoho prodávajícího: kupující jde k dalšímu a zboží nezmizí', () => {
    const merchant = party('kupec', { coins: 10, wants: { furs: 3 }, merchant: true });
    const c = coinClearing(
      [party('host', { stock: { furs: 1 } }), party('a', { stock: { furs: 3 } }), merchant],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'a', buyer: 'kupec', good: 'furs', amount: 3 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'a', coins: 2 }]);
  });

  it('cena je cena × hladina: s hladinou 2 stojí 300 kg 40 mincí a za 30 mincí je 225 kg', () => {
    const buy = (coins: number): CoinClearing =>
      coinClearing(
        [party('host', { stock: { grain: 1000 } }), party('a', { coins, wants: { grain: 300 } })],
        {},
        2,
      );
    expect(buy(50).payments).toEqual([{ buyer: 'a', seller: 'host', coins: 40 }]);
    expect(buy(50).trades[0]!.amount).toBe(300);
    expect(buy(30).payments).toEqual([{ buyer: 'a', seller: 'host', coins: 30 }]);
    expect(buy(30).trades[0]!.amount).toBeCloseTo(225, 9);
  });

  it('ceny trhu platí i za mince: obilí za dvojnásobek', () => {
    const c = coinClearing(
      [party('host', { stock: { grain: 1000 } }), party('a', { coins: 50, wants: { grain: 300 } })],
      { grain: 2 / 15 },
      1,
    );
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 40 }]);
  });

  it('kupec kupuje první, i když přijel později – mince se týž den dostanou k výpravě', () => {
    const host = party('host', { stock: { grain: 1000 } });
    const trip = party('a', { stock: { furs: 100 }, wants: { grain: 75 } });
    const merchant = party('kupec', { coins: 60, wants: { furs: 60 }, merchant: true });
    const c = coinClearing([host, trip, merchant], {}, 1);
    expect(c.payments).toEqual([
      { buyer: 'kupec', seller: 'a', coins: 32 },
      { buyer: 'a', seller: 'host', coins: 5 },
    ]);
    expect(purse(c, trip)).toBe(27);
    expect(purse(c, merchant)).toBe(28);
    // bez kupce nemá výprava za co koupit – nekupuje a hladina stojí
    expect(coinClearing([host, trip], {}, 1)).toEqual({
      trades: [],
      payments: [],
      available: 0,
      sought: 0,
    });
  });

  it('dva kupci kupují v pořadí příjezdu, výprava až po nich', () => {
    const parties = [
      party('host', { stock: { grain: 450 } }),
      party('a', { coins: 50, wants: { grain: 300 } }),
      party('k1', { coins: 10, wants: { grain: 900 }, merchant: true }),
      party('k2', { coins: 15, wants: { grain: 900 }, merchant: true }),
    ];
    expect(coinClearing(parties, {}, 1).payments).toEqual([
      { buyer: 'k1', seller: 'host', coins: 10 },
      { buyer: 'k2', seller: 'host', coins: 15 },
      { buyer: 'a', seller: 'host', coins: 5 },
    ]);
  });

  it('zboží v kg pod 1 mg se neobchoduje a mince se za mince neprodávají', () => {
    const c = coinClearing(
      [
        party('host', { stock: { grain: 1000, pottery: 1e-7, coins: 40 } }),
        party('a', { coins: 50, wants: { grain: 300, pottery: 5, coins: 10 } }),
      ],
      {},
      1,
    );
    expect(c.trades.map((t) => t.good)).toEqual(['grain']);
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 20 }]);
  });

  it('šum plovoucí čárky nezvedne platbu ani neubere kus', () => {
    const buy = (coins: number, goods: TradeGoods): CoinClearing =>
      coinClearing([party('host', { stock: goods }), party('a', { coins, wants: goods })], {}, 1.1);
    // 50 kg × 0,22 vyjde 11,000000000000002 – 11 mincí, ne 12
    expect(50 * coinPriceOf({}, 1.1, 'meat')).toBeGreaterThan(11);
    expect(buy(50, { meat: 50 }).payments).toEqual([{ buyer: 'a', seller: 'host', coins: 11 }]);
    // 176 ÷ 58,67 vyjde 2,9999999999999996 – tři hříbata, ne dvě
    expect(176 / coinPriceOf({}, 1.1, 'foals')).toBeLessThan(3);
    expect(buy(176, { foals: 3 }).trades).toEqual([
      { seller: 'host', buyer: 'a', good: 'foals', amount: 3 },
    ]);
    expect(buy(176, { foals: 3 }).payments).toEqual([{ buyer: 'a', seller: 'host', coins: 176 }]);
  });

  it('měšec neklesne pod 0 ani o šum ceny: tři košile za 1440 mincí, i když účet vyjde o vlas víc', () => {
    const price = 480 * (1 + 1e-11);
    expect(3 * price).toBeGreaterThan(1440 + 1e-9);
    const trip = party('a', { coins: 1440, wants: { mailShirts: 3 } });
    const c = coinClearing(
      [party('host', { stock: { mailShirts: 3 } }), trip],
      { mailShirts: price },
      1,
    );
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 1440 }]);
    expect(purse(c, trip)).toBe(0);
  });

  it('vstup nemění a podruhé vyjde totéž', () => {
    const parties = [
      party('host', { stock: { furs: 10, grain: 500 } }),
      party('a', { coins: 5, stock: { furs: 30 }, wants: { grain: 75 } }),
      party('kupec', { coins: 20, wants: { furs: 60 }, merchant: true }),
    ];
    const before = structuredClone(parties);
    const first = coinClearing(parties, {}, 1.3);
    expect(parties).toEqual(before);
    expect(coinClearing(parties, {}, 1.3)).toEqual(first);
  });

  it('50 náhodných trhů: nikdo nekupuje od sebe, součet plateb je nula, měšec celý a ≥ 0', () => {
    const rnd = createRandom(1);
    const int = (from: number, to: number): number =>
      from + Math.floor(rnd.next() * (to - from + 1));
    const goodsOf = (most: number): TradeGoods => {
      const goods: TradeGoods = {};
      for (const good of TRADE_GOODS) {
        if (good === COIN_GOOD || rnd.next() < 0.6) continue;
        goods[good] = isPieceGood(good) ? int(0, most) : rnd.next() * most;
      }
      return goods;
    };
    let payments = 0;
    let trades = 0;
    for (let market = 0; market < 50; market++) {
      const merchants = int(0, 3);
      const trips = int(0, 4);
      const parties: CoinParty[] = [
        party('host', { stock: goodsOf(500) }),
        ...Array.from({ length: trips + merchants }, (_, i) => {
          const merchant = i >= trips ? { merchant: true as const } : {};
          return party(`v${i}`, {
            coins: rnd.next() < 0.3 ? 0 : int(0, 500),
            stock: goodsOf(int(0, 500)),
            wants: goodsOf(int(0, 500)),
            ...merchant,
          });
        }),
      ];
      const prices: MarketPrices = {};
      for (const good of TRADE_GOODS) {
        if (rnd.next() < 0.3) prices[good] = initialPrice(good) * (1 + rnd.next());
      }
      const level = rnd.next() < 0.4 ? 1 : 1 + 2 * rnd.next();
      const c = coinClearing(parties, prices, level);
      payments += c.payments.length;
      trades += c.trades.length;

      // mince: každá platba celá a kladná, měšec po každé z nich celý a nezáporný, součet stejný
      const purses = new Map(parties.map((p) => [p.key, p.coins]));
      for (const { buyer, seller, coins } of c.payments) {
        expect(buyer).not.toBe(seller);
        expect(buyer).not.toBe('host');
        expect(Number.isInteger(coins)).toBe(true);
        expect(coins).toBeGreaterThanOrEqual(1);
        purses.set(buyer, purses.get(buyer)! - coins);
        purses.set(seller, purses.get(seller)! + coins);
        expect(purses.get(buyer)).toBeGreaterThanOrEqual(0);
      }
      const total = (sum: number, n: number): number => sum + n;
      expect([...purses.values()].reduce(total, 0)).toBe(
        parties.map((p) => p.coins).reduce(total, 0),
      );
      for (const p of parties) expect(purse(c, p)).toBe(purses.get(p.key));

      // dvojice: nejvýš jedna platba, ne pod cenou a přeplatek nejvýš mince, pod minci nic
      const pairs = c.payments.map((x) => `${x.buyer}|${x.seller}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(new Set(c.trades.map((t) => `${t.buyer}|${t.seller}`))).toEqual(new Set(pairs));
      for (const { buyer, seller, coins } of c.payments) {
        const value = worth(c, buyer, seller, prices, level);
        expect(value).toBeGreaterThan(1 - 1e-6);
        expect(coins).toBeGreaterThan(value - 1e-6);
        expect(coins).toBeLessThan(value + 1);
      }

      // zboží: kus celý, zlato na setiny gramu (po celých mincích – gold.md, Mince 2,4 g, bod 4),
      // nikdo neprodá víc, než má, ani nekoupí víc, než chce
      for (const { seller, buyer, good, amount } of c.trades) {
        expect(seller).not.toBe(buyer);
        expect(good).not.toBe(COIN_GOOD);
        expect(amount).toBeGreaterThan(0);
        if (good === 'gold') expect(Math.round(amount * 100) / 100).toBe(amount);
        else if (isPieceGood(good)) expect(Number.isInteger(amount)).toBe(true);
      }
      for (const p of parties) {
        for (const good of TRADE_GOODS) {
          const moved = (side: 'seller' | 'buyer'): number =>
            c.trades
              .filter((t) => t[side] === p.key && t.good === good)
              .reduce((sum, t) => sum + t.amount, 0);
          expect(moved('seller')).toBeLessThanOrEqual((p.stock[good] ?? 0) + 1e-6);
          expect(moved('buyer')).toBeLessThanOrEqual((p.wants[good] ?? 0) + 1e-6);
        }
      }
    }
    // trhy opravdu obchodovaly
    expect(payments).toBeGreaterThan(100);
    expect(trades).toBeGreaterThan(300);
  });
});

describe('mince a zboží na trhu (markets.md – Rozhodnutí plánu 4, bod 3)', () => {
  it('C je měšec nejvýš do hodnoty seznamu, W chtěné zboží, které na trhu je', () => {
    const c = coinClearing(
      [party('host', { stock: { furs: 20 } }), party('e', { coins: 60, wants: { furs: 60 } })],
      {},
      1,
    );
    expect(c.available).toBeCloseTo(32, 9);
    expect(c.sought).toBeCloseTo(10 + 2 / 3, 9);
    expect(nextLevel(1, c.available, c.sought)).toBeCloseTo(1.05, 9);
  });

  it('počítá se z měšců, seznamů a nabídek na začátku fáze, za cenu × hladinu', () => {
    // výprava bez mincí má seznam, ale mince by dostala až od výpravy E – do C a W nepatří;
    // výprava s mincemi bez seznamu také ne
    const parties = [
      party('host', { stock: { grain: 1000 } }),
      party('a', { stock: { furs: 100 }, wants: { grain: 75 } }),
      party('b', { coins: 40 }),
      party('e', { coins: 60, wants: { furs: 60 } }),
    ];
    const c = coinClearing(parties, {}, 1);
    expect(c.available).toBeCloseTo(32, 9);
    expect(c.sought).toBeCloseTo(32, 9);
    const twice = coinClearing(parties, {}, 2);
    expect(twice.available).toBeCloseTo(60, 9); // měšec 60 < seznam 64
    expect(twice.sought).toBeCloseTo(64, 9);
  });

  it('seznamy kupujících a nabídky všech stran se sčítají po zboží', () => {
    const c = coinClearing(
      [
        party('host', { stock: { furs: 10, grain: 150 } }),
        party('a', { coins: 5, stock: { furs: 30 }, wants: { grain: 300 } }),
        party('e1', { coins: 100, wants: { furs: 60 } }),
        party('e2', { coins: 4, wants: { furs: 15, honey: 10 } }),
      ],
      {},
      1,
    );
    // C = min(5, 20) + min(100, 32) + min(4, 12); W = kožešiny min(75, 40) × 8/15 + obilí 150 ÷ 15
    expect(c.available).toBeCloseTo(5 + 32 + 4, 9);
    expect(c.sought).toBeCloseTo((40 * 8) / 15 + 10, 9);
  });

  it('na trhu není nic z toho, co výprava shání: W = 0 a hladina se nehne', () => {
    const c = coinClearing(
      [party('host', { stock: { grain: 1000 } }), party('e', { coins: 60, wants: { furs: 60 } })],
      {},
      1.5,
    );
    expect(c).toMatchObject({ trades: [], payments: [], sought: 0 });
    expect(c.available).toBeCloseTo(48, 9);
    expect(nextLevel(1.5, c.available, c.sought)).toBe(1.5);
  });

  it('kupec s měšcem bez dna do C ani W nepatří – jeho zboží v nabídce zůstává', () => {
    // markets.md – Měšec kupců bez dna, bod 4: hladinu hýbou jen mince hostitele (objednaná zbroj)
    const c = coinClearing(
      [
        party('host', {
          coins: 500,
          stock: { furs: 20 },
          wants: { swords: 1 },
          fromMerchants: true,
        }),
        party('kupec', {
          coins: Infinity,
          stock: { swords: 2 },
          wants: { furs: 60 },
          merchant: true,
        }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'kupec', good: 'furs', amount: 20 },
      { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
    ]);
    expect(c.payments).toEqual([
      { buyer: 'kupec', seller: 'host', coins: 11 },
      { buyer: 'host', seller: 'kupec', coins: 120 },
    ]);
    // C = hostitel min(500, 120), W = meč z nabídky kupce
    expect([c.available, c.sought]).toEqual([120, 120]);
    const alone = coinClearing(
      [
        party('host', { stock: { furs: 20 } }),
        party('kupec', { coins: Infinity, wants: { furs: 60 }, merchant: true }),
      ],
      {},
      1,
    );
    expect([alone.available, alone.sought]).toEqual([0, 0]);
  });
});
