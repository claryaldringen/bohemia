import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import { JEWELLER } from '../../rules';
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
import { joinMarket, marketDay, marketResultRef } from '../market';
import { coinClearing, jewelledPayment, type CoinParty } from '../market-coins';
import { coinPriceOf } from '../market-prices';
import { marketStance } from '../market-stance';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import { D, marketVillage, report } from './market-fixtures';

// Šperkař v mincovní fázi (gold.md – Pravidla 4; Rozhodnutí plánu 6, body 3 a 5): kdo má kapacitu
// šperkaře, prodá prvních tolik gramů zlata za 1,5násobek a mincemi zaplatí zboží (ne zlato) jako
// 1,5násobkem; nad kapacitu 1:1. Výměna u hostitele je bez výhody. Objednanou zbroj hostitel kupcům
// doplatí po mincích celými gramy svého zlata. Ceny testu: nástroje 2 mince za kg, meč 120 mincí.

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
  it.each([
    [40, 100, 40 / 1.5, 40 / 1.5],
    [90, 60, 60, 60],
    [100, 40, 80, 40],
    [120, 60, 90, 60],
    [50, 0, 50, 0],
    [0, 30, 0, 0],
  ])('účet %s s kapacitou %s: %s mincí, kapacita %s', (bill, budget, coins, used) => {
    const paid = jewelledPayment(bill, budget);
    expect(paid.coins).toBeCloseTo(coins, 12);
    expect(paid.used).toBeCloseTo(used, 12);
  });

  it('násobek je z pravidel – 1,5 v obou směrech', () => {
    expect(JEWELLER.factor).toBe(1.5);
  });
});

describe('mincovní fáze se šperkařem (coinClearing, hladina 1)', () => {
  it('E s 50 g a kapacitou 20 prodá kupci 20 g za 30 a 30 g za 30: 60 mincí za 50 g', () => {
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
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'e', coins: 60 }]);
    expect(c.jewelleryUsed).toEqual({ e: 20 });
  });

  it('hostitel se 100 g a kapacitou 30: kupec s měšcem 60 koupí 45 g (30 po 1,5, 15 po 1)', () => {
    const c = coinClearing(
      [
        party('host', { stock: { gold: 100 }, jewelleryG: 30 }),
        party('kupec', { coins: 60, wants: { gold: 1_000 }, merchant: true }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 45 }]);
    expect(c.payments).toEqual([{ buyer: 'kupec', seller: 'host', coins: 60 }]);
    expect(c.jewelleryUsed).toEqual({ host: 30 });
  });

  it('E se 100 mincemi a kapacitou 40 zaplatí 50 kg nástrojů (100) 80 mincemi', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 50 } }),
        party('e', { coins: 100, wants: { tools: 50 }, jewelleryG: 40 }),
      ],
      TOOLS,
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'e', good: 'tools', amount: 50 }]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 80 }]);
    expect(c.jewelleryUsed).toEqual({ e: 40 });
  });

  it('kapacita zvětší, co se do měšce vejde: 100 mincí a kapacita 40 koupí 60 kg (120)', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 80 } }),
        party('e', { coins: 100, wants: { tools: 80 }, jewelleryG: 40 }),
      ],
      TOOLS,
      1,
    );
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'e', good: 'tools', amount: 60 }]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 100 }]);
    expect(c.jewelleryUsed).toEqual({ e: 40 });
  });

  it('smíšený košík: nástroje za 40 (26,67 mince) a zlata jen 73 g – zaplatí celý měšec 100', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 20, gold: 100 } }),
        party('e', { coins: 100, wants: { tools: 20, gold: 100 }, jewelleryG: 100 }),
      ],
      TOOLS,
      1,
    );
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'e', good: 'tools', amount: 20 },
      { seller: 'host', buyer: 'e', good: 'gold', amount: 73 },
    ]);
    // 73 + 26,67 nahoru = 100 – zlato bez výhody, kapacitu ubere kov za nástroje (100 − 73)
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 100 }]);
    expect(c.jewelleryUsed).toEqual({ e: 27 });
  });

  it('smíšený košík od šperkaře: zlato platí kupující dráž i se svou kapacitou', () => {
    const c = coinClearing(
      [
        party('host', { stock: { tools: 20, gold: 100 }, jewelleryG: 30 }),
        party('e', { coins: 100, wants: { tools: 20, gold: 100 }, jewelleryG: 100 }),
      ],
      TOOLS,
      1,
    );
    // na zlato zbude 73,33 mince: 30 g po 1,5 (45) a 28 g po 1 – účet za zlato 73
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'e', good: 'tools', amount: 20 },
      { seller: 'host', buyer: 'e', good: 'gold', amount: 58 },
    ]);
    expect(c.payments).toEqual([{ buyer: 'e', seller: 'host', coins: 100 }]);
    expect(c.jewelleryUsed).toEqual({ host: 30, e: 27 });
  });

  it('výměna u hostitele je bez výhody v obou směrech: 30 g za 30 mincí', () => {
    const c = coinClearing(
      [
        party('host', { coins: 50, exchangesGold: true, jewelleryG: 40 }),
        party('e', { stock: { gold: 30 }, jewelleryG: 20 }),
      ],
      {},
      1,
    );
    expect(c.trades).toEqual([{ seller: 'e', buyer: 'host', good: 'gold', amount: 30 }]);
    expect(c.payments).toEqual([{ buyer: 'host', seller: 'e', coins: 30 }]);
    expect(c).not.toHaveProperty('jewelleryUsed');
  });

  it('bez kapacity, nebo když ji nikdo nepoužije, `jewelleryUsed` chybí', () => {
    const parties = [
      party('host', { stock: { gold: 100 } }),
      party('e', { stock: { gold: 50 }, jewelleryG: 20 }),
      party('kupec', { coins: 60, wants: { gold: 1_000 }, merchant: true }),
    ];
    const c = coinClearing(parties, {}, 1);
    // kupec utratí měšec u hostitele (bez šperkaře) dřív, než přijde na řadu E
    expect(c.trades).toEqual([{ seller: 'host', buyer: 'kupec', good: 'gold', amount: 60 }]);
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

    it('0 mincí a 130 g: meč zaplatí 120 g, kupec je odveze jako koupené', () => {
      const c = coinClearing([arms(0, 130), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 120 },
      ]);
      expect(c.payments).toEqual([]);
      expect(c).not.toHaveProperty('jewelleryUsed');
    });

    it('napřed mince: 40 mincí a 100 g zaplatí 40 mincí a 80 g', () => {
      const c = coinClearing([arms(40, 100), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 80 },
      ]);
      expect(c.payments).toEqual([{ buyer: 'host', seller: 'kupec', coins: 40 }]);
    });

    it('se šperkařem (kapacita 60) zaplatí 100 g zlata za meč jen 90 g', () => {
      const c = coinClearing([arms(0, 100, { jewelleryG: 60 }), seller], {}, 1);
      expect(c.trades).toEqual([
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 90 },
      ]);
      expect(c.payments).toEqual([]);
      expect(c.jewelleryUsed).toEqual({ host: 60 });
    });

    it('zlatem prodaným kupci už neplatí: ze 130 g prodá 60 g, meč doplatí jen zbylými 10 g', () => {
      const c = coinClearing(
        [
          arms(50, 130, { wants: { swords: 2 } }),
          party('kupec', {
            coins: 60,
            stock: { swords: 2 },
            wants: { gold: 1_000 },
            merchant: true,
          }),
        ],
        {},
        1,
      );
      // hostitel má 110 mincí a 70 g – na druhý meč (240) nemá
      expect(c.trades).toEqual([
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 60 },
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 10 },
      ]);
      expect(c.payments).toEqual([
        { buyer: 'kupec', seller: 'host', coins: 60 },
        { buyer: 'host', seller: 'kupec', coins: 110 },
      ]);
    });

    it('kapacita hostitele je jedna pro celou fázi: po prodeji zlata kupci platí meč 1:1', () => {
      const c = coinClearing(
        [
          arms(60, 100, { jewelleryG: 30 }),
          party('kupec', {
            coins: 60,
            stock: { swords: 1 },
            wants: { gold: 1_000 },
            merchant: true,
          }),
        ],
        {},
        1,
      );
      expect(c.trades).toEqual([
        { seller: 'host', buyer: 'kupec', good: 'gold', amount: 45 },
        { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
      ]);
      expect(c.payments).toEqual([
        { buyer: 'kupec', seller: 'host', coins: 60 },
        { buyer: 'host', seller: 'kupec', coins: 120 },
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
      seller.gold -= grams;
      buyer.gold += grams;
      seller.coins += coins;
      buyer.coins -= coins;
      for (const holder of [seller, buyer]) holder.jewelleryG -= c.jewelleryUsed?.[holder.key] ?? 0;
    };
    const holdings = (): number[] => [a.coins, a.gold, b.coins, b.gold];
    const seen: number[][] = [];
    for (let day = 0; day < 6; day++) {
      if (day % 2 === 0) round(a, b);
      else round(b, a);
      expect([a.coins + b.coins, a.gold + b.gold]).toEqual([200, 100]);
      seen.push(holdings());
    }
    // A prodá 50 g po 1,5 a 50 g po 1 (125), B vrátí 83 g za 125 (83 po 1,5), A zpět 83 g za 83,
    // B 17 g po 1,5 a 57 g po 1 (83); kapacita nákupem zlata neubývá, prodejem ano
    expect(seen.slice(0, 4)).toEqual([
      [125, 0, 75, 100],
      [0, 83, 200, 17],
      [83, 0, 117, 100],
      [0, 74, 200, 26],
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
      expect(Number.isInteger(goldG)).toBe(true);
      const dearG = Math.min(goldG, sellerJ);
      const goldBill = dearG * JEWELLER.factor + (goldG - dearG);
      const otherBill = c.trades
        .filter((t) => t.good !== 'gold')
        .reduce((sum, t) => sum + t.amount * coinPriceOf({}, level, t.good), 0);
      const bill = jewelledPayment(otherBill, buyerJ);
      const due = goldBill + bill.coins;
      // pojistka proti šumu podplacení neschová, přeplatí se nejvýš do celé mince
      expect(paid).toBeGreaterThanOrEqual(due - 1e-6);
      expect(paid).toBeLessThan(due + 1);
      expect(c.jewelleryUsed?.a ?? 0).toBeCloseTo(dearG, 9);
      // kupující: aspoň kapacita, kterou účet potřeboval, nejvýš kov za zboží mimo zlato a kapacita
      const used = c.jewelleryUsed?.b ?? 0;
      expect(used).toBeGreaterThanOrEqual(bill.used - 1e-9);
      expect(used).toBeLessThanOrEqual(Math.min(buyerJ, paid - goldBill) + 1e-9);
      if (used > 0 || dearG > 0) jewelled++;
    }
    expect(jewelled).toBeGreaterThan(100);
  });
});

describe('tržní den se šperkařem (marketDay)', () => {
  it('hostitel se 100 g a kapacitou 30: kupec koupí všech 100 g za 115 mincí (30 g dráž)', () => {
    const s = host({ gold: 100, jewelleryG: 30 });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    const chronicle = marketDay(s, DAY);
    expect(merchant.bought).toEqual({ gold: 100 });
    const coins = 30 * JEWELLER.factor + 70;
    expect([s.gold ?? 0, s.coins, s.jewelleryG]).toEqual([0, coins, undefined]);
    expect(heldOf(chronicle)).toEqual({ sold: { gold: 100 }, bought: { coins } });
  });

  it('objednaný meč (120) se 100 mincemi a kapacitou 60: zaplatí 90, zbude 10 mincí', () => {
    const s = host({ coins: 100, jewelleryG: 60, armsOrder: { swords: 1 } });
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    merchant.goods = { swords: 1 };
    const chronicle = marketDay(s, DAY);
    // mince za meč u kupce zanikly (měšec bez dna)
    expect(merchant.goods).toEqual({});
    expect([s.coins, s.jewelleryG, s.arms, s.armsOrder]).toEqual([
      10,
      undefined,
      { swords: 1 },
      undefined,
    ]);
    expect(heldOf(chronicle)).toEqual({ sold: { coins: 90 }, bought: { swords: 1 } });
  });

  it.each([
    // mince, zlato, kapacita → mince kupci, zlato kupci, zlato vsi
    [0, 130, 0, 0, 120, 10],
    [40, 100, 0, 40, 80, 20],
    [0, 100, 60, 0, 90, 10],
  ])(
    'zbroj zlatem: %s mincí, %s g a kapacita %s → kupci %s mincí a %s g, vsi zbude %s g',
    (coins, gold, jewelleryG, paidCoins, paidGold, goldLeft) => {
      const s = host({ coins, gold, jewelleryG, armsOrder: { swords: 1 } });
      merchantsArrive(s, DAY);
      const merchant = merchantOf(s);
      merchant.goods = { swords: 1 };
      merchant.wants = {}; // zlato vsi nekoupí – zbroj ves doplatí zlatem
      const chronicle = marketDay(s, DAY);
      expect([s.arms, s.armsOrder]).toEqual([{ swords: 1 }, undefined]);
      expect([s.coins, s.gold, s.jewelleryG]).toEqual([undefined, goldLeft, undefined]);
      // mince u kupce zanikly (měšec bez dna), zlato odveze
      expect(merchant.goods).toEqual({});
      expect(merchant.bought).toEqual({ gold: paidGold });
      expect(heldOf(chronicle)).toEqual({
        sold: { gold: paidGold, ...(paidCoins > 0 ? { coins: paidCoins } : {}) },
        bought: { swords: 1 },
      });
      // kov jen přešel – co ves dala, dostal kupec
      expect(paidCoins + paidGold + goldLeft).toBe(coins + gold);
    },
  );

  it('po zbroji se šperkařem vymění hostitel zlato výpravy jen za zbylých 10 mincí', () => {
    const s = host({ coins: 100, jewelleryG: 60, armsOrder: { swords: 1 } });
    joinMarket(s, DAY, trip('market:e:1', { gold: 50 }));
    merchantsArrive(s, DAY);
    merchantOf(s).goods = { swords: 1 };
    merchantOf(s).wants = {}; // zlato výpravy nekoupí – vymění ho hostitel
    const chronicle = marketDay(s, DAY);
    const e = resultOf(s, 'market:e:1');
    expect(e).toMatchObject({ sold: { gold: 10 }, bought: {}, coinsGot: 10 });
    expect(e.unsold).toEqual({ gold: 40, coins: 10 });
    expect([s.coins, s.gold, s.jewelleryG, s.arms]).toEqual([
      undefined,
      10,
      undefined,
      { swords: 1 },
    ]);
    expect(heldOf(chronicle)).toEqual({ sold: { coins: 100 }, bought: { swords: 1, gold: 10 } });
  });

  it.each([
    [{ gold: 10, coins: 30 }, 30, { coins: 45 }, 15, 20],
    [{ gold: 50 }, 20, { coins: 60 }, 60, undefined],
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
      expect(e.jewelleryG).toBe(left);
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
