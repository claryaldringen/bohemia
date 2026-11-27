import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import { GOLD, JEWELLER } from '../../rules';
import type {
  ArmsGood,
  ChronicleEvent,
  MarketArrival,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGood,
  TradeGoods,
  VillageState,
} from '../../types';
import { isPieceGood } from '../goods';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { coinClearing, jewelledPayment, type CoinParty } from '../market-coins';
import { coinPriceOf, roundGold } from '../market-prices';
import { marketStance } from '../market-stance';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import { D, marketVillage, report } from './market-fixtures';

// Šperkař v mincovní fázi (gold.md – Pravidla 4; Rozhodnutí plánu 6, body 3 a 5): kdo má kapacitu
// šperkaře, prodá prvních tolik gramů zlata za 1,5násobek a mincemi zaplatí zboží (ne zlato) jako
// 1,5násobkem; nad kapacitu 1:1. Výměna u hostitele je bez výhody. Objednanou zbroj hostitel kupcům
// doplatí po mincích celými gramy svého zlata. Mince váží 2,4 g (Mince 2,4 g, body 4–6): kapacita je v gramech, zlato jde jen po celých mincích.
// Ceny testu: nástroje 2 mince za kg, meč 20 mincí.

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po D. */
const DAY = nextMerchantVisit([STOP], D)!.day;
const TOOLS = { tools: 2 };

/** Strana mincovní fáze – bez mincí, zboží i seznamu, dokud je `fields` nedoplní. */
function party(key: string, fields: Partial<CoinParty> = {}): CoinParty {
  return { key, coins: 0, stock: {}, wants: {}, ...fields };
}

interface HostFields {
  coins?: number;
  gold?: number;
  jewelleryG?: number;
  armsOrder?: Partial<Record<ArmsGood, number>>;
}

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců, s mincemi, zlatem, kapacitou
 * šperkaře a objednávkou (vzor `market-gold.test.ts`) – na trhu jinak nic nenabízí.
 */
function host({ coins = 0, gold = 0, jewelleryG = 0, armsOrder }: HostFields = {}): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain!;
  s.merchantStops = [{ ...STOP }];
  if (coins > 0) s.coins = coins;
  if (gold > 0) s.gold = gold;
  if (jewelleryG > 0) s.jewelleryG = jewelleryG;
  if (armsOrder) s.armsOrder = { ...armsOrder };
  return s;
}

/** Výprava z vsi `key` s nákladem `goods`, která nic neshání. */
function trip(key: string, goods: TradeGoods): MarketArrival {
  return {
    key,
    fromVillageId: key.split(':')[1]!,
    fromName: 'Vlkov',
    stayDays: 1,
    travelDays: 0,
    goods,
    horses: [],
    wants: {},
    report,
  };
}

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const merchants = (s.market?.visitors ?? []).filter((v) => v.merchant);
  if (merchants.length !== 1) throw new Error('Na trhu není právě jeden kupec.');
  return merchants[0]!;
}

/** Návštěvník `key` na trhu – odkaz platí i po odjezdu. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
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

describe('platba se šperkařem (jewelledPayment)', () => {
  // kapacita v gramech, mince do ní po 2,4 g (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 6):
  // 240 g = 100 mincí, 144 g = 60, 96 g = 40
  it.each([
    [40, 240, 40 / 1.5, (40 / 1.5) * 2.4],
    [90, 144, 60, 144],
    [100, 96, 80, 96],
    [120, 144, 90, 144],
    [50, 0, 50, 0],
    [0, 30, 0, 0],
    [10, 1.5, 10 - 0.5 * 0.625, 1.5],
  ])('účet %s s kapacitou %s g: %s mincí, kapacita %s g', (bill, budget, coins, used) => {
    const paid = jewelledPayment(bill, budget);
    expect(paid.coins).toBeCloseTo(coins, 12);
    expect(paid.used).toBeCloseTo(used, 12);
  });

  it('násobek je z pravidel – 1,5 v obou směrech', () => {
    expect(JEWELLER.factor).toBe(1.5);
  });
});

describe('mincovní fáze se šperkařem (coinClearing, hladina 1)', () => {
  it('E s 50 g a kapacitou 20 prodá kupci 20 g po 1,6 g (12,5) a 30 g po 2,4 g (12,5): 25 mincí', () => {
    const c = coinClearing(
      [
        party('host'),
        party('e', { stock: { gold: 50 }, jewelleryG: 20 }),
        party('kupec', { coins: 60, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'e', buyer: 'kupec', good: 'gold', amount: 50 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'e', coins: 25 }]);
    expect(c.jewelleryUsed).toEqual({ e: 20 });
  });

  it('hostitel se 100 g a kapacitou 30: kupec s měšcem 30 koupí 57 g (30 g za 18,75, 27 g za 11,25)', () => {
    const c = coinClearing(
      [
        party('host', { stock: { gold: 100 }, jewelleryG: 30 }),
        party('kupec', { coins: 30, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 57 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 30 }]);
    expect(c.jewelleryUsed).toEqual({ host: 30 });
  });

  it('E se 100 mincemi a kapacitou 96 g (40 mincí) zaplatí 50 kg nástrojů (100) 80 mincemi', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 50 } }),
        party('e', { coins: 100, wants: { tools: 50 }, jewelleryG: 96 }),
      ],
      TOOLS,
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'e', good: 'tools', amount: 50 }]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 80 }]);
    expect(c.jewelleryUsed).toEqual({ e: 96 });
  });

  it('kapacita zvětší, co se do měšce vejde: 100 mincí a kapacita 96 g koupí 60 kg (120)', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 80 } }),
        party('e', { coins: 100, wants: { tools: 80 }, jewelleryG: 96 }),
      ],
      TOOLS,
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'e', good: 'tools', amount: 60 }]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 100 }]);
    expect(c.jewelleryUsed).toEqual({ e: 96 });
  });

  it('smíšený košík: nástroje za 39 (26 mincí) a zlato za 73 mincí (175,2 g) – 99 mincí dolů', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 20, gold: 300 } }),
        party('e', { coins: 100, wants: { tools: 20, gold: 300 }, jewelleryG: 100 }),
      ],
      TOOLS,
      1,
    );
    // nástroje 20 kg za 40 = 26,67 mince, na zlato zbude 73,33 → 73 celých; 73 + 26,67 = 99,67 – za
    // celé mince dolů 99 (gold.md – Mince 2,4 g, bod 9): nástroje jen za 26 mincí = 39 (19,5 kg), zlato
    // bez výhody, kapacitu ubere kov za nástroje (99 − 73) × 2,4 g
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'e', good: 'tools', amount: expect.closeTo(19.5, 9) },
      { seller: 'host', buyer: 'e', good: 'gold', amount: 175.2 },
    ]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 99 }]);
    expect(c.jewelleryUsed).toEqual({ e: 62.4 });
  });

  it('smíšený košík od šperkaře: zlato platí kupující dráž i se svou kapacitou', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 20, gold: 300 }, jewelleryG: 30 }),
        party('e', { coins: 100, wants: { tools: 20, gold: 300 }, jewelleryG: 100 }),
      ],
      TOOLS,
      1,
    );
    // na zlato zbude 73,33 mince → 73 celých: 30 g po 1,6 g (18,75) a 130,2 g po 2,4 g (54,25)
    // nástroje jako výš za celé mince dolů: 26 mincí = 19,5 kg, platba 99
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'e', good: 'tools', amount: expect.closeTo(19.5, 9) },
      { seller: 'host', buyer: 'e', good: 'gold', amount: 160.2 },
    ]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 99 }]);
    expect(c.jewelleryUsed).toEqual({ host: 30, e: 62.4 });
  });

  it('výměna u hostitele je bez výhody v obou směrech: 72 g za 30 mincí', () => {
    const c = coinClearing(
      [
        party('host', { coins: 50, exchangesGold: true, jewelleryG: 40 }),
        party('e', { stock: { gold: 72 }, jewelleryG: 20 }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'e', buyer: 'host', good: 'gold', amount: 72 }]);
    expect(c.payments).toEqual([{ buyer: 'host', seller: 'e', coins: 30 }]);
    expect(c).not.toHaveProperty('jewelleryUsed');
  });

  it('spotřebovaná kapacita je na setiny: 3 mince za nástroje ubere 7,2 g, ne 7,199999999999999', () => {
    // 2,25 kg nástrojů za 4,5 – se šperkařem 3 mince; 3 × 2,4 = 7,199999999999999
    const c = coinClearing(
      [
        party('host', { stock: { tools: 10 } }),
        party('e', { coins: 10, wants: { tools: 2.25 }, jewelleryG: 20 }),
      ],
      TOOLS,
      1,
    );
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 3 }]);
    expect(c.jewelleryUsed).toEqual({ e: 7.2 });
  });

  it('bez kapacity, nebo když ji nikdo nepoužije, `jewelleryUsed` chybí', () => {
    const parties = [
      party('host', { stock: { gold: 200 } }),
      party('e', { stock: { gold: 50 }, jewelleryG: 20 }),
      party('kupec', { coins: 60, wants: { gold: 1_000 }, merchant: true }),
    ];
    const c = coinClearing(parties, {}, 1);
    // kupec utratí měšec u hostitele (bez šperkaře) dřív, než přijde na řadu E – 60 × 2,4 g
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 144 }]);
    expect(c).not.toHaveProperty('jewelleryUsed');
    expect(coinClearing(parties.slice(0, 1), {}, 1)).not.toHaveProperty('jewelleryUsed');
  });

  describe('objednaná zbroj placená zlatem (goldPurse)', () => {
    /** Hostitel s objednaným mečem, `coins` mincemi a `gold` gramy zlata (celé k doplacení). */
    const arms = (coins: number, gold: number, fields: Partial<CoinParty> = {}): CoinParty =>
      party('host', {
        coins,
        stock: { gold },
        goldPurse: gold,
        wants: { swords: 1 },
        fromMerchants: true,
        ...fields,
      });
    const seller = party('kupec', { stock: { swords: 1 }, merchant: true });

    it('0 mincí a 50 g: meč (20) zaplatí 48 g po 2,4 g za minci, kupec je odveze jako koupené', () => {
      const c = coinClearing([arms(0, 50), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 48 },
      ]);
      expect(c.payments).toEqual([]);
      expect(c).not.toHaveProperty('jewelleryUsed');
    });

    it('napřed mince: 8 mincí a 30 g zaplatí 8 mincí a 28,8 g (12 mincí)', () => {
      const c = coinClearing([arms(8, 30), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 28.8 },
      ]);
      expect(c.payments).toEqual([{ buyer: 'host', seller: 'kupec', coins: 8 }]);
    });

    it('se šperkařem (kapacita 24 g = 10 mincí) zaplatí meč (20) jen 15 mincemi – 36 g', () => {
      const c = coinClearing([arms(0, 50, { jewelleryG: 24 }), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 36 },
      ]);
      expect(c.payments).toEqual([]);
      expect(c.jewelleryUsed).toEqual({ host: 24 });
    });

    it('zlatem prodaným kupci už neplatí: ze 130 g prodá 60 g, na třetí meč nemá – dva doplatí 36 g', () => {
      const c = coinClearing(
        [
          arms(0, 130, { wants: { swords: 3 } }),
          party('kupec', {
            coins: 25,
            stock: { swords: 3 },
            wants: { gold: 1_000 },
            merchant: true,
          }),
        ],
        {},
        1,
      );
      // hostitel má 25 mincí a 70 g (29 mincí) – na třetí meč (60) nemá; s celými 130 g by měl
      expect(c.trades).toEqual([
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 60 },
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 2 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 36 },
      ]);
      expect(c.payments).toEqual([
        { buyer: 'kupec', seller: 'host', coins: 25 },
        { buyer: 'host', seller: 'kupec', coins: 25 },
      ]);
    });

    it('kapacita hostitele je jedna pro celou fázi: po prodeji zlata kupci platí meč 1:1', () => {
      const c = coinClearing(
        [
          arms(60, 100, { jewelleryG: 30 }),
          party('kupec', {
            coins: 20,
            stock: { swords: 1 },
            wants: { gold: 1_000 },
            merchant: true,
          }),
        ],
        {},
        1,
      );
      // 30 g dráž za 18,75 mince a 3 g za 1,25 – kapacita je pryč, meč (20) za 20
      expect(c.trades).toEqual([
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 33 },
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
      ]);
      expect(c.payments).toEqual([
        { buyer: 'kupec', seller: 'host', coins: 20 },
        { buyer: 'host', seller: 'kupec', coins: 20 },
      ]);
      expect(c.jewelleryUsed).toEqual({ host: 30 });
    });
  });

  it('dvě strany se šperkaři prodávají zlato dokola: mince i zlato stojí, zisk jen do kapacity', () => {
    interface Holder {
      key: string;
      coins: number;
      gold: number;
      jewelleryG: number;
    }
    const a: Holder = { key: 'a', coins: 0, gold: 100, jewelleryG: 50 };
    const b: Holder = { key: 'b', coins: 200, gold: 0, jewelleryG: 100 };
    /** Den trhu: `seller` nabízí všechno zlato, `buyer` ho shání – výsledek se zapíše oběma. */
    const round = (seller: Holder, buyer: Holder): void => {
      const c = coinClearing(
        [
          party(seller.key, { stock: { gold: seller.gold }, jewelleryG: seller.jewelleryG }),
          party(buyer.key, {
            coins: buyer.coins,
            wants: { gold: 1_000 },
            jewelleryG: buyer.jewelleryG,
          }),
        ],
        {},
        1,
      );
      const grams = c.trades.reduce((sum, t) => sum + t.amount, 0);
      const coins = c.payments.reduce((sum, p) => sum + p.coins, 0);
      seller.gold = roundGold(seller.gold - grams);
      buyer.gold = roundGold(buyer.gold + grams);
      seller.coins += coins;
      buyer.coins -= coins;
      for (const holder of [seller, buyer]) holder.jewelleryG -= c.jewelleryUsed?.[holder.key] ?? 0;
    };
    const holdings = (): number[] => [a.coins, a.gold, b.coins, b.gold].map(roundGold);
    const seen: number[][] = [];
    for (let day = 0; day < 6; day++) {
      if (day % 2 === 0) round(a, b);
      else round(b, a);
      expect([a.coins + b.coins, roundGold(a.gold + b.gold)]).toEqual([200, 100]);
      seen.push(holdings());
    }
    // Mince = 2,4 g, se šperkařem 1,5 mince za 2,4 g (0,625 mince za gram). 1. A prodá 100 g: 50 g po
    // 0,625 (31,25 mince) a zbytek po 1/2,4; celých mincí je 52 (31,25 + 20,75) = 50 + 49,8 = 99,8 g.
    // 2. B (kapacita 100 g) vrací za 52 mincí 83,2 g po 0,625. 3. A bez kapacity: 83,4 g, B koupí 34
    // celých mincí = 81,6 g. 4. B s kapacitou 16,8 g: A za 34 mincí koupí 16,8 g za 10,5 mince a
    // zbylých 23,5 mince po 2,4 g (56,4 g) = 73,2 g; kapacita nákupem zlata neubývá, prodejem ano
    expect(seen.slice(0, 4)).toEqual([
      [52, 0.2, 148, 99.8],
      [0, 83.4, 200, 16.6],
      [34, 1.8, 166, 98.2],
      [0, 75, 200, 25],
    ]);
    expect([a.jewelleryG, b.jewelleryG]).toEqual([0, 0]);
    // bez kapacity jde zlato 1:1 – další kolo nikomu nic nepřidá
    expect(seen[5]).toEqual(seen[3]);
  });

  it('náhodné košíky: platba = účet se šperkařem nahoru – nikdy nad měšec ani pod účet', () => {
    const goods: readonly TradeGood[] = ['pottery', 'tools', 'stone', 'gold', 'honey', 'swords'];
    const random = createRandom(61);
    const some = (max: number): number => Math.floor(random.next() * max);
    let jewelled = 0;
    for (let i = 0; i < 300; i++) {
      const level = 1 + random.next();
      const stock: TradeGoods = {};
      const wants: TradeGoods = {};
      for (const good of goods) {
        const most = good === 'gold' ? 200 : 40;
        if (random.next() < 0.7) stock[good] = some(most) + 1;
        if (random.next() < 0.7) wants[good] = some(most) + (good === 'tools' ? 0.37 : 1);
      }
      const sellerJ = random.next() < 0.5 ? random.next() * 80 : 0;
      const buyerJ = random.next() < 0.7 ? random.next() * 150 : 0;
      const purse = some(400);
      const c = coinClearing(
        [
          party('a', { stock, ...(sellerJ > 0 ? { jewelleryG: sellerJ } : {}) }),
          party('b', { coins: purse, wants, ...(buyerJ > 0 ? { jewelleryG: buyerJ } : {}) }),
        ],
        {},
        level,
      );
      const paid = c.payments.reduce((sum, p) => sum + p.coins, 0);
      expect(Number.isInteger(paid)).toBe(true);
      expect(paid).toBeLessThanOrEqual(purse);
      if (c.trades.length === 0) {
        expect(paid).toBe(0);
        continue;
      }
      const goldG = c.trades.find((t) => t.good === 'gold')?.amount ?? 0;
      expect(goldG).toBe(roundGold(goldG)); // gramy na setiny
      const dearG = Math.min(goldG, sellerJ);
      // účet za zlato v mincích: gram stojí 1 ÷ 2,4 mince, ve šperkaři 1,5krát víc; zlato se platí
      // po celých mincích, z gramů na setiny vyjde celé číslo bez setiny mince
      const rawGoldBill = (dearG * JEWELLER.factor + (goldG - dearG)) / GOLD.coinGrams;
      const goldBill = Math.round(rawGoldBill);
      expect(Math.abs(rawGoldBill - goldBill)).toBeLessThan(0.01);
      const otherBill = c.trades
        .filter((t) => t.good !== 'gold')
        .reduce((sum, t) => sum + t.amount * coinPriceOf({}, level, t.good), 0);
      const bill = jewelledPayment(otherBill, buyerJ);
      const due = goldBill + bill.coins;
      // pojistka proti šumu podplacení neschová, přeplatí se nejvýš do celé mince
      expect(paid).toBeGreaterThanOrEqual(due - 1e-6);
      expect(paid).toBeLessThan(due + 1);
      // zboží v kg za celé mince dolů (gold.md – Mince 2,4 g, bod 9): nad účet zaplatí kupující jen
      // za kusy a zlato, které samy stojí přes celé mince
      const pieceBill = c.trades
        .filter((t) => t.good !== 'gold' && isPieceGood(t.good))
        .reduce((sum, t) => sum + t.amount * coinPriceOf({}, level, t.good), 0);
      if (pieceBill < otherBill - 1e-6) {
        const pieces = goldBill + jewelledPayment(pieceBill, buyerJ).coins;
        expect(paid).toBeLessThan(Math.max(due, Math.ceil(pieces - 1e-6)) + 1e-6);
      }
      expect(c.jewelleryUsed?.a ?? 0).toBeCloseTo(dearG, 9);
      // kupující: aspoň kapacita, kterou účet potřeboval, nejvýš kov za zboží mimo zlato (mince po
      // 2,4 g) a kapacita
      const used = c.jewelleryUsed?.b ?? 0;
      expect(used).toBeGreaterThanOrEqual(bill.used - 1e-9);
      expect(used).toBeLessThanOrEqual(Math.min(buyerJ, (paid - goldBill) * GOLD.coinGrams) + 1e-9);
      if (used > 0 || dearG > 0) jewelled++;
    }
    expect(jewelled).toBeGreaterThan(100);
  });
});

describe('tržní den se šperkařem (marketDay)', () => {
  it('hostitel se 100 g a kapacitou 30: kupec koupí 97,8 g za 47 mincí (30 g dráž)', () => {
    const s = host({ gold: 100, jewelleryG: 30 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    const chronicle = marketDay(s, DAY);
    // 30 g po 1,5 ÷ 2,4 = 18,75 mince + 70 g ÷ 2,4 = 29,17 → 47 celých mincí za 30 + 67,8 = 97,8 g
    expect(merchant.bought).toEqual({ gold: 97.8 });
    expect([s.gold, s.coins, s.jewelleryG]).toEqual([2.2, 47, undefined]);
    expect(heldOf(chronicle)).toEqual({ sold: { gold: 97.8 }, bought: { coins: 47 } });
  });

  it('objednaný meč (20) se 100 mincemi a kapacitou 60: zaplatí 14, zbude 86 mincí', () => {
    const s = host({ coins: 100, jewelleryG: 60, armsOrder: { swords: 1 } });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    merchant.goods = { swords: 1 };
    const chronicle = marketDay(s, DAY);
    // mince za meč u kupce zanikly (měšec bez dna)
    expect(merchant.goods).toEqual({});
    // 20 ÷ 1,5 = 13,33 → 14 celých mincí; kapacita ubude o 14 × 2,4 = 33,6 g ze 60
    expect([s.coins, s.jewelleryG, s.arms, s.armsOrder]).toEqual([
      86,
      26.4,
      { swords: 1 },
      undefined,
    ]);
    expect(heldOf(chronicle)).toEqual({ sold: { coins: 14 }, bought: { swords: 1 } });
  });

  it.each([
    // mince, zlato, kapacita → mince kupci, zlato kupci, zlato vsi, kapacita vsi
    [0, 130, 0, 0, 48, 82, undefined],
    [8, 100, 0, 8, 28.8, 71.2, undefined],
    [0, 100, 60, 0, 33.6, 66.4, 26.4],
  ])(
    'zbroj zlatem: %s mincí, %s g a kapacita %s → kupci %s mincí a %s g, vsi zbude %s g',
    (coins, gold, jewelleryG, paidCoins, paidGold, goldLeft, jewelleryLeft) => {
      const s = host({ coins, gold, jewelleryG, armsOrder: { swords: 1 } });
      merchantsArrive(s, DAY);
      const merchant = merchantOf(s);
      merchant.goods = { swords: 1 };
      merchant.wants = {}; // zlato vsi nekoupí – zbroj ves doplatí zlatem
      const chronicle = marketDay(s, DAY);
      expect([s.arms, s.armsOrder]).toEqual([{ swords: 1 }, undefined]);
      // meč za 20 mincí: napřed mince, zbytek celé mince ze zlata po 2,4 g; se šperkařem 20 ÷ 1,5 →
      // 14 mincí = 33,6 g
      expect([s.coins, s.gold, s.jewelleryG]).toEqual([undefined, goldLeft, jewelleryLeft]);
      // mince u kupce zanikly (měšec bez dna), zlato odveze
      expect(merchant.goods).toEqual({});
      expect(merchant.bought).toEqual({ gold: paidGold });
      expect(heldOf(chronicle)).toEqual({
        sold: { gold: paidGold, ...(paidCoins > 0 ? { coins: paidCoins } : {}) },
        bought: { swords: 1 },
      });
      // kov jen přešel (mince po 2,4 g) – co ves dala, dostal kupec
      expect(paidCoins * GOLD.coinGrams + paidGold + goldLeft).toBeCloseTo(
        coins * GOLD.coinGrams + gold,
        9,
      );
    },
  );

  it('po zbroji se šperkařem vymění hostitel zlato výpravy jen za zbylé 4 mince', () => {
    const s = host({ coins: 18, jewelleryG: 60, armsOrder: { swords: 1 } });
    joinMarket(s, DAY, trip('market:e:1', { gold: 50 }));
    merchantsArrive(s, DAY);
    merchantOf(s).goods = { swords: 1 };
    merchantOf(s).wants = {}; // zlato výpravy nekoupí – vymění ho hostitel
    const chronicle = marketDay(s, DAY);
    const e = resultOf(s, 'market:e:1');
    // meč: 14 mincí (20 ÷ 1,5, kapacita ubude o 33,6 g), zbývají 4 mince = 9,6 g zlata výpravy
    expect(e).toMatchObject({ sold: { gold: 9.6 }, bought: {}, coinsGot: 4 });
    expect(e.unsold).toEqual({ gold: 40.4, coins: 4 });
    expect([s.coins, s.gold, s.jewelleryG, s.arms]).toEqual([undefined, 9.6, 26.4, { swords: 1 }]);
    expect(heldOf(chronicle)).toEqual({ sold: { coins: 18 }, bought: { swords: 1, gold: 9.6 } });
  });

  it.each([
    // 9,6 g po 0,625 mince = 6 mincí; kapacita 30 − 9,6 = 20,4 g
    [{ gold: 9.6, coins: 30 }, 30, { coins: 36 }, 6, 20.4],
    // 20 g po 0,625 (12,5 mince) + 30 g ÷ 2,4 (12,5) = 25 mincí
    [{ gold: 50 }, 20, { coins: 25 }, 25, undefined],
  ])(
    'kapacita výpravy: náklad %o s kapacitou %s → domů %o, utrženo %s, kapacita %s',
    (goods, jewelleryG, unsold, coinsGot, left) => {
      const s = host();
      joinMarket(s, DAY, trip('market:e:1', goods));
      const e = visitorOf(s, 'market:e:1');
      e.jewelleryG = jewelleryG;
      merchantsArrive(s, DAY);
      marketDay(s, DAY);
      expect(resultOf(s, 'market:e:1')).toMatchObject({ sold: { gold: goods.gold }, coinsGot });
      expect(resultOf(s, 'market:e:1').unsold).toEqual(unsold);
      if (left !== undefined) expect(e.jewelleryG).toBeCloseTo(left, 9);
      if (left === undefined) expect(e).not.toHaveProperty('jewelleryG');
    },
  );

  it('šperkař bez kovu: trh jako bez šperkaře a kapacita ve vsi zůstane', () => {
    const s = host({ jewelleryG: 30 });
    joinMarket(s, DAY, trip('market:e:1', { gold: 50 }));
    merchantsArrive(s, DAY);
    const plain = structuredClone(s);
    delete plain.jewelleryG;
    expect(marketDay(s, DAY)).toEqual(marketDay(plain, DAY));
    expect(s.outbox).toEqual(plain.outbox);
    expect(s.market).toEqual(plain.market);
    expect(s.jewelleryG).toBe(30);
  });
});
