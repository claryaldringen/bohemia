import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../landscape/random';
import { advanceVillage } from '../../core/simulate';
import { toolNeedKg } from '../../crafts/iron';
import { isVillageDormant } from '../../people/departure';
import { MERCHANTS } from '../../rules';
import type {
  ArmsGood,
  ChronicleEvent,
  MarketArrival,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGoods,
  VillageMarket,
  VillageState,
} from '../../types';
import {
  ARMS_BAD_ORDER,
  ARMS_NO_MERCHANTS,
  armsBuyer,
  reduceArmsOrder,
  setArmsOrder,
} from '../arms-order';
import { ARMS_GOODS, COIN_GOOD, TRADE_GOODS, isArmsGood, isPieceGood } from '../goods';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { totalGoods } from '../market-clearing';
import { coinClearing, type CoinClearing, type CoinParty } from '../market-coins';
import { marketStance } from '../market-stance';
import { merchantVisits, nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import { D, marketVillage, report, withWorkshop } from './market-fixtures';

// Objednávka zbroje u cizích kupců ve vlastní vsi (markets.md – Rozhodnutí plánu 4, bod 15; Martin
// 25. 11. 2026: „Hráč zadá počet“): v mincovní fázi dne kupců ji ves koupí za své mince, jen od
// kupců, po kusech, dokud na ni má; jinak za mince nekupuje nic („Mince utrácí jen
// vojvoda/správce“). Výchozí ceny v mincích: meč 120, helma 240, kroužková košile 480.

type ArmsOrder = Partial<Record<ArmsGood, number>>;

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** Druhé spojení křižovatky – průjezdy týchž dnů jako `STOP`. */
const CROSSING: MerchantStop = { ...STOP, key: '0,0,N' };
/** První příjezd kupců po D a den dalšího. */
const DAY = nextMerchantVisit([STOP], D)!.day;
const NEXT_DAY = nextMerchantVisit([STOP], DAY + 1)!.day;

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců, s mincemi a objednávkou. Přebytky
 * nemá (chovné jádro krav, obilí právě na pojistku) – na trhu nic nenabízí.
 */
function host(coins: number, order?: ArmsOrder): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain!;
  s.merchantStops = [{ ...STOP }];
  if (coins > 0) s.coins = coins;
  if (order) s.armsOrder = { ...order };
  return s;
}

/** Trh bez návštěvníků s hladinou `level`. */
function market(level: number): VillageMarket {
  return { prices: {}, visitors: [], nextOrder: 1, arrivals: [], level };
}

/**
 * Kupci dne přijedou s nákladem `loads` (jeden průjezd = jeden náklad) a nic neshánějí – odkazy
 * platí i po odjezdu.
 */
function merchants(s: VillageState, loads: TradeGoods[], day = DAY): MarketVisitor[] {
  merchantsArrive(s, day);
  const list = s.market!.visitors.filter((v) => v.merchant);
  if (list.length !== loads.length) throw new Error(`Kupců přijelo ${list.length}.`);
  list.forEach((v, i) => {
    v.goods = { ...loads[i] };
    v.wants = {};
  });
  return list;
}

/** Jediný kupec dne s nákladem `goods`, který nic neshání. */
function merchant(s: VillageState, goods: TradeGoods, day = DAY): MarketVisitor {
  return merchants(s, [goods], day)[0]!;
}

/** Výprava z vsi `key` s nákladem `goods`, která shání `wants`. */
function trip(
  key: string,
  goods: TradeGoods,
  wants: TradeGoods,
  fields: Partial<MarketArrival> = {},
): MarketArrival {
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
    ...fields,
  };
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const mail = (s.outbox ?? []).find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`Výsledek ${key} chybí.`);
  return mail.body.result;
}

/** Zápisy kroniky o obchodech vsi. */
function heldEvents(s: VillageState): ChronicleEvent[] {
  return s.chronicle.filter((e) => e.kind === 'market-held');
}

/** Ves bez objednávky (kopie). */
function withoutOrder(s: VillageState): VillageState {
  const copy = structuredClone(s);
  delete copy.armsOrder;
  return copy;
}

describe('objednávka ve stavu vsi (setArmsOrder, reduceArmsOrder)', () => {
  it('počet se zapíše a přepíše; nula položku smaže a prázdná objednávka ze stavu zmizí', () => {
    const s = host(50);
    const before = structuredClone(s);
    expect(setArmsOrder(s, 'helmets', 1)).toEqual({ ok: true });
    expect(setArmsOrder(s, 'swords', 2)).toEqual({ ok: true });
    expect(s).toStrictEqual({ ...before, armsOrder: { swords: 2, helmets: 1 } });
    expect(Object.keys(s.armsOrder!)).toEqual(['swords', 'helmets']);
    setArmsOrder(s, 'swords', 5);
    expect(s.armsOrder).toEqual({ swords: 5, helmets: 1 });
    setArmsOrder(s, 'swords', 0);
    expect(s.armsOrder).toStrictEqual({ helmets: 1 });
    // nula toho, co objednané není, nic nezmění
    setArmsOrder(s, 'mailShirts', 0);
    expect(s.armsOrder).toStrictEqual({ helmets: 1 });
    setArmsOrder(s, 'helmets', 0);
    expect(s).toStrictEqual(before);
    setArmsOrder(s, 'swords', 0);
    expect(s).toStrictEqual(before);
  });

  it.each([1.5, -1, -0.5, NaN, Infinity, -Infinity])('%s kusů objednat nejde', (amount) => {
    for (const s of [host(50), host(50, { swords: 2 })]) {
      const before = structuredClone(s);
      expect(setArmsOrder(s, 'swords', amount)).toEqual({ ok: false, reason: ARMS_BAD_ORDER });
      expect(s).toStrictEqual(before);
    }
    expect(ARMS_BAD_ORDER).toBe('Počet kusů musí být celé nezáporné číslo.');
  });

  it('ve vsi bez zastávky kupců objednat nejde – ani nulu', () => {
    const dry = host(50);
    dry.merchantStops = [];
    const unknown = host(50);
    delete unknown.merchantStops;
    for (const s of [dry, unknown]) {
      const before = structuredClone(s);
      for (const amount of [2, 0, 1.5]) {
        expect(setArmsOrder(s, 'swords', amount)).toEqual({ ok: false, reason: ARMS_NO_MERCHANTS });
      }
      expect(s).toStrictEqual(before);
    }
    expect(ARMS_NO_MERCHANTS).toBe('Do téhle vsi cizí kupci nejezdí.');
  });

  it('o koupené se zmenší, nula ze stavu zmizí; jiné zboží ani mince ji nemění', () => {
    const s = host(0, { swords: 3, helmets: 1 });
    reduceArmsOrder(s, {});
    reduceArmsOrder(s, { coins: 32, grain: 100, mailShirts: 1 });
    expect(s.armsOrder).toStrictEqual({ swords: 3, helmets: 1 });
    reduceArmsOrder(s, { swords: 2, coins: 5 });
    expect(s.armsOrder).toStrictEqual({ swords: 1, helmets: 1 });
    reduceArmsOrder(s, { helmets: 1 });
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    reduceArmsOrder(s, { swords: 1 });
    expect(s).not.toHaveProperty('armsOrder');
    reduceArmsOrder(s, { swords: 1 });
    expect(s).not.toHaveProperty('armsOrder');
  });
});

describe('hostitel jako kupující (armsBuyer)', () => {
  it('dá mince vsi a objednanou zbroj, jen od kupců – i bez mincí, týž den je smí utržit', () => {
    const s = host(130, { helmets: 1, swords: 2 });
    merchant(s, { coins: 60 });
    const before = structuredClone(s);
    const buyer = armsBuyer(s, DAY, s.market!.visitors);
    expect(buyer).toStrictEqual({
      coins: 130,
      wants: { swords: 2, helmets: 1 },
      fromMerchants: true,
    });
    buyer!.wants.swords = 99;
    expect(s).toStrictEqual(before);
    delete s.coins;
    expect(armsBuyer(s, DAY, s.market!.visitors)).toMatchObject({ coins: 0, fromMerchants: true });
  });

  it('bez objednávky, nebo bez kupce na trhu null', () => {
    const none = host(500);
    merchant(none, { swords: 2, coins: 60 });
    expect(armsBuyer(none, DAY, none.market!.visitors)).toBeNull();
    const alone = host(500, { swords: 1 });
    expect(armsBuyer(alone, DAY, [])).toBeNull();
    joinMarket(alone, DAY, trip('market:a:1', { swords: 1 }, {}));
    expect(armsBuyer(alone, DAY, alone.market!.visitors)).toBeNull();
    merchant(alone, {});
    expect(armsBuyer(alone, DAY, alone.market!.visitors)).not.toBeNull();
  });
});

describe('objednaná zbroj v den kupců (marketDay)', () => {
  it('ze dvou mečů koupí jeden, který kupec veze, za 120 mincí – druhý až od dalšího kupce', () => {
    const s = host(130, { swords: 2 });
    expect(marketStance(s, DAY).offer).toEqual({});
    const first = merchant(s, { swords: 1, coins: 60 });
    expect(marketDay(s, DAY)).toEqual([
      { day: DAY, kind: 'market-held', sold: { coins: 120 }, bought: { swords: 1 } },
    ]);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(10);
    expect(first.goods).toStrictEqual({ coins: 180 });
    expect(first.sold).toStrictEqual({ swords: 1 });
    expect(first.bought).toStrictEqual({});
    // seznam se počítá jen do jednoho meče, který kupec veze: C = 120, W = 120 → hladina 1
    expect(s.market!.level).toBeUndefined();
    // platba odjela s kupcem, v odchozí schránce nic není
    expect(s.market!.visitors).toEqual([]);
    expect(s).not.toHaveProperty('outbox');

    s.coins = 130;
    const second = merchant(s, { swords: 1, coins: 60 }, NEXT_DAY);
    expect(marketDay(s, NEXT_DAY)).toEqual([
      { day: NEXT_DAY, kind: 'market-held', sold: { coins: 120 }, bought: { swords: 1 } },
    ]);
    expect(s.arms).toStrictEqual({ swords: 2 });
    expect(s).not.toHaveProperty('armsOrder');
    expect(s.coins).toBe(10); // meč za 120 (hladina 1)
    expect(second.goods).toStrictEqual({ coins: 180 });
    expect(s.market!.level).toBeUndefined(); // C = W
  });

  it('po splnění objednávky ves dalšímu kupci nic nekoupí, i když na to má', () => {
    const s = host(500, { swords: 1 });
    merchant(s, { swords: 2, coins: 60 });
    marketDay(s, DAY);
    expect(s.coins).toBe(380);
    const next = merchant(s, { swords: 2, helmets: 2, coins: 60 }, NEXT_DAY);
    expect(marketDay(s, NEXT_DAY)).toEqual([]);
    expect(next.goods).toStrictEqual({ swords: 2, helmets: 2, coins: 60 });
    expect(s.coins).toBe(380);
    expect(s.arms).toStrictEqual({ swords: 1 });
  });

  it('koupená zbroj přibude k té, kterou ves už má', () => {
    const s = host(240, { helmets: 1 });
    s.arms = { swords: 4, helmets: 1 };
    merchant(s, { ...MERCHANTS.goods, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms).toStrictEqual({ swords: 4, helmets: 2 });
    expect(s).not.toHaveProperty('coins');
  });

  it('nemá-li na ni, nekoupí nic: 119 mincí, meč za 120', () => {
    const s = host(119, { swords: 1 });
    const visitor = merchant(s, { swords: 1, coins: 60 });
    expect(marketDay(s, DAY)).toEqual([]);
    expect(s).not.toHaveProperty('arms');
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(119);
    expect(visitor.goods).toStrictEqual({ swords: 1, coins: 60 });
    expect(s.market).not.toHaveProperty('level'); // méně mincí než zboží, ale dno je 1
  });

  it('kupec zbroj nemá: objednávka čeká, hladina stojí', () => {
    const s = host(500, { swords: 1 });
    s.market = market(1.5);
    const visitor = merchant(s, { helmets: 2, coins: 60 });
    expect(marketDay(s, DAY)).toEqual([]);
    expect(s).not.toHaveProperty('arms');
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(500);
    expect(visitor.goods).toStrictEqual({ helmets: 2, coins: 60 });
    expect(s.market.level).toBe(1.5);
  });

  it('od výpravy ji nekoupí: meč veze výprava, kupec jen helmu', () => {
    const s = host(500, { swords: 1 });
    joinMarket(s, DAY, trip('market:a:1', { swords: 1 }, {}));
    const visitor = merchant(s, { helmets: 1, coins: 60 });
    expect(marketDay(s, DAY)).toEqual([]);
    expect(resultOf(s, 'market:a:1')).toMatchObject({ sold: {}, unsold: { swords: 1 } });
    expect(s).not.toHaveProperty('arms');
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(500);
    expect(visitor.goods).toStrictEqual({ helmets: 1, coins: 60 });
  });

  it.each([
    // [mince, objednávka, koupí, zbude mincí, zbude objednávky]
    [250, { helmets: 1, swords: 1 }, { swords: 1 }, 130, { helmets: 1 }],
    [360, { helmets: 1, swords: 1 }, { swords: 1, helmets: 1 }, 0, undefined],
    [500, { helmets: 1, mailShirts: 1 }, { mailShirts: 1 }, 20, { helmets: 1 }],
    // na košili nemá – helmu za ní v pořadí koupí
    [479, { helmets: 1, mailShirts: 1 }, { helmets: 1 }, 239, { mailShirts: 1 }],
    [
      2_000,
      { swords: 9, mailShirts: 9, helmets: 9 },
      { swords: 2, mailShirts: 1, helmets: 2 },
      800,
      { swords: 7, mailShirts: 8, helmets: 7 },
    ],
  ] as [number, ArmsOrder, ArmsOrder, number, ArmsOrder | undefined][])(
    'v pořadí ARMS_GOODS, dokud má mince: %s mincí, objednávka %o',
    (coins, order, bought, coinsLeft, orderLeft) => {
      const s = host(coins, order);
      const visitor = merchant(s, { ...MERCHANTS.goods, coins: 60 });
      expect(marketDay(s, DAY)).toEqual([
        { day: DAY, kind: 'market-held', sold: { coins: coins - coinsLeft }, bought },
      ]);
      expect(s.arms).toStrictEqual(bought);
      expect(s.coins ?? 0).toBe(coinsLeft);
      expect(s.armsOrder).toStrictEqual(orderLeft);
      expect(visitor.goods.coins).toBe(60 + coins - coinsLeft);
    },
  );

  it('dva kupci (křižovatka) po jednom meči: od každého jeden za 120', () => {
    const s = host(240, { swords: 2 });
    s.merchantStops = [CROSSING, STOP];
    const [first, second] = merchants(s, [
      { swords: 1, coins: 60 },
      { swords: 1, coins: 60 },
    ]) as [MarketVisitor, MarketVisitor];
    expect(marketDay(s, DAY)).toEqual([
      { day: DAY, kind: 'market-held', sold: { coins: 240 }, bought: { swords: 2 } },
    ]);
    expect(first.goods).toStrictEqual({ coins: 180 });
    expect(second.goods).toStrictEqual({ coins: 180 });
    expect(s.arms).toStrictEqual({ swords: 2 });
    expect(s).not.toHaveProperty('coins');
    expect(s).not.toHaveProperty('armsOrder');
    expect(s.market).not.toHaveProperty('level'); // C = W = 240
  });

  it('rušný trh: kupec zůstane a zbytek objednávky mu ves koupí druhý den', () => {
    const s = host(200, { swords: 2 });
    for (const i of [1, 2, 3]) {
      joinMarket(s, DAY, trip(`market:p${i}:1`, {}, {}, { stayDays: 1 }));
    }
    const visitor = merchant(s, { swords: 2, coins: 60 });
    marketDay(s, DAY);
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(80);
    expect(visitor.lastDay).toBe(DAY + 1);
    s.coins = 200;
    marketDay(s, DAY + 1);
    expect(s.arms).toStrictEqual({ swords: 2 });
    expect(s).not.toHaveProperty('armsOrder');
    expect(visitor.goods.coins! + s.coins).toBe(60 + 120 + 200);
  });

  it('cena dne je cena × hladina trhu: s hladinou 1,05 stojí meč 126 mincí', () => {
    const s = host(130, { swords: 1 });
    s.market = market(1.05);
    const visitor = merchant(s, { swords: 1, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(4);
    expect(visitor.goods).toStrictEqual({ coins: 186 });
  });

  it('s hladinou 2 stojí meč 240 a 130 mincí nestačí – hladina klesne (C = 130, W = 240)', () => {
    const s = host(130, { swords: 1 });
    s.market = market(2);
    const visitor = merchant(s, { swords: 1, coins: 60 });
    expect(marketDay(s, DAY)).toEqual([]);
    expect(s).not.toHaveProperty('arms');
    expect(s.coins).toBe(130);
    expect(s.armsOrder).toStrictEqual({ swords: 1 });
    expect(visitor.goods).toStrictEqual({ swords: 1, coins: 60 });
    expect(s.market.level).toBeCloseTo(2 * (1 - 11 / 370), 12);
  });

  it('podle ceny trhu: meč zdražený na 150 mincí', () => {
    const s = host(160, { swords: 1 });
    s.market = { ...market(1), prices: { swords: 150 } };
    merchant(s, { swords: 1, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(s.coins).toBe(10);
  });

  it.each([
    // [mince, objednaných mečů, koupených mečů, zaplaceno] – meč za 120,48
    [121, 1, 1, 121],
    [120, 1, 0, 0],
    [241, 2, 2, 241],
    [240, 2, 1, 121],
  ])('zlomková cena: %s mincí, %s objednané meče → %s za %s', (coins, ordered, bought, paid) => {
    const s = host(coins, { swords: ordered });
    s.market = market(1.004);
    const visitor = merchant(s, { swords: 2, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms?.swords ?? 0).toBe(bought);
    expect(s.coins ?? 0).toBe(coins - paid);
    expect(s.armsOrder?.swords ?? 0).toBe(ordered - bought);
    expect(visitor.goods.coins).toBe(60 + paid);
    // poslední mince ze stavu zmizí
    if (paid === coins) expect(s).not.toHaveProperty('coins');
  });

  it('smí utratit i mince, které týž den od kupce utržila – napřed kupuje kupec', () => {
    const s = host(0, { swords: 1 });
    s.crafts = { charcoalKg: 0, potteryKg: 1_000 };
    expect(marketStance(s, DAY).offer.pottery).toBeGreaterThanOrEqual(600);
    const visitor = merchant(s, { swords: 1, coins: 130 });
    visitor.wants = { pottery: 600 };
    expect(marketDay(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'market-held',
        sold: { pottery: 600, coins: 120 },
        bought: { swords: 1, coins: 120 },
      },
    ]);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(s).not.toHaveProperty('coins');
    expect(s).not.toHaveProperty('armsOrder');
    expect(visitor.goods).toStrictEqual({ coins: 130 });
    expect(visitor.bought).toStrictEqual({ pottery: 600 });
  });

  it('mince od výprav utrží až po svém nákupu – meč koupí až od dalšího kupce', () => {
    const s = host(100, { swords: 1 });
    s.crafts = { charcoalKg: 0, potteryKg: 1_000 };
    joinMarket(s, DAY, trip('market:a:1', { coins: 50 }, { pottery: 250 }));
    const visitor = merchant(s, { swords: 1, coins: 60 });
    marketDay(s, DAY);
    expect(s).not.toHaveProperty('arms');
    expect(s.coins).toBe(150);
    expect(visitor.goods).toStrictEqual({ swords: 1, coins: 60 });
    merchant(s, { swords: 1, coins: 60 }, NEXT_DAY);
    marketDay(s, NEXT_DAY);
    expect(s.arms).toStrictEqual({ swords: 1 });
  });

  it('kupuje před výpravami: jediný meč kupce dostane ves, výpravě s mincemi nezbude', () => {
    const s = host(130, { swords: 1 });
    joinMarket(s, DAY, trip('market:a:1', { coins: 130 }, { swords: 1 }));
    merchant(s, { swords: 1, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(resultOf(s, 'market:a:1')).toMatchObject({ bought: {}, unsold: { coins: 130 } });
  });

  it('za mince koupí jen objednanou zbroj – nic, co shání podle výpočtu potřeby', () => {
    const s = host(500, { swords: 1 });
    s.livestock!.herds.cow = 1;
    s.storesKg -= 900;
    const { wants } = marketStance(s, DAY);
    expect(wants.cows).toBeGreaterThanOrEqual(2);
    expect(wants.grain).toBeGreaterThanOrEqual(600);
    joinMarket(s, DAY, trip('market:a:1', { cows: 2, grain: 600, helmets: 1 }, {}));
    merchant(s, { swords: 1, helmets: 2, coins: 60 });
    marketDay(s, DAY);
    expect(s.coins).toBe(380);
    expect(s.arms).toStrictEqual({ swords: 1 });
    expect(s.livestock!.herds.cow).toBe(1);
    expect(resultOf(s, 'market:a:1')).toMatchObject({
      sold: {},
      unsold: { cows: 2, grain: 600, helmets: 1 },
    });
  });

  it('bez mincí vsi a prodeje kupcům je trh bit po bitu jako bez objednávky', () => {
    /** Trh se zápočtem, zakázkou u kováře, výpravou s mincemi a mečem a kupcem. */
    const busy = (order?: ArmsOrder): VillageState => {
      const s = host(0, order);
      withWorkshop(s, 'potter', 600);
      withWorkshop(s, 'smith', 700, { oreKg: 500 });
      s.crafts = { charcoalKg: 5_000, potteryKg: 500 };
      s.toolEquipmentKg = toolNeedKg(s, DAY);
      s.market = { ...market(1.2), prices: { swords: 131, pottery: 0.3 } };
      joinMarket(s, DAY, trip('market:a:1', { grain: 300 }, { pottery: 50, tools: 10, swords: 1 }));
      joinMarket(
        s,
        DAY,
        trip('market:b:1', { coins: 40, swords: 1 }, { pottery: 100 }, { stayDays: 2 }),
      );
      merchantsArrive(s, DAY);
      return s;
    };
    const order = { swords: 3, mailShirts: 1, helmets: 2 };
    const plain = busy();
    const ordered = busy(order);
    expect(marketStance(ordered, DAY)).toStrictEqual(marketStance(plain, DAY));
    const events = marketDay(plain, DAY);
    expect(marketDay(ordered, DAY)).toStrictEqual(events);
    expect(ordered.armsOrder).toStrictEqual(order);
    expect(withoutOrder(ordered)).toStrictEqual(plain);
    // trh opravdu obchodoval zápočtem i za mince (100 kg × 0,3 × 1,2), hnul cenami i hladinou
    // a zapsal zakázku
    expect(events).toMatchObject([{ kind: 'market-held', bought: { coins: 36 } }]);
    expect(resultOf(plain, 'market:a:1').bought).toEqual({ pottery: 50 });
    expect(plain.market!.orders).toMatchObject([{ villageId: 'a', good: 'tools', amount: 10 }]);
    expect(plain.market!.level).not.toBe(1.2);
    expect(plain.market!.prices.pottery).not.toBe(0.3);
    expect(plain.market!.prices.swords).toBeLessThan(131);
    // objednanou košili a helmy nikdo jiný neshání – cena stojí na dně
    expect(ordered.market!.prices).toMatchObject({ mailShirts: 480, helmets: 240 });
  });

  it('přání zbroje cenu meče nezvedne – jen kupec ho nabízí a cena stojí na dně', () => {
    const s = host(5_000, { swords: 50 });
    merchant(s, { swords: 2, coins: 60 });
    marketDay(s, DAY);
    expect(s.arms).toStrictEqual({ swords: 2 });
    expect(s.market!.prices).toStrictEqual({ swords: 120 });
  });

  it('bez kupce na trhu objednávka nic nezmění – ani hladinu, i když má meč výprava', () => {
    const day = (order?: ArmsOrder): VillageState => {
      const s = host(5_000, order);
      s.market = market(1.5);
      joinMarket(s, DAY, trip('market:a:1', { swords: 1 }, {}));
      joinMarket(s, DAY, trip('market:b:1', { coins: 60 }, { swords: 2 }));
      marketDay(s, DAY);
      return s;
    };
    const ordered = day({ swords: 2 });
    expect(ordered.armsOrder).toStrictEqual({ swords: 2 });
    expect(withoutOrder(ordered)).toStrictEqual(day());
    expect(ordered.coins).toBe(5_000);
  });

  it('náhodné trhy: zbroj i mince jen přecházejí, objednávka se zmenší právě o koupené', () => {
    const goods = ['grain', 'pottery', 'honey', 'wax', 'furs', ...ARMS_GOODS] as const;
    /** Kolik zboží drží ves – jen druhy, se kterými se v testu obchoduje. */
    const held = (s: VillageState): TradeGoods => ({
      grain: s.storesKg,
      pottery: s.crafts?.potteryKg ?? 0,
      honey: s.wares?.honeyKg ?? 0,
      wax: s.wares?.waxKg ?? 0,
      furs: (s.wares?.sheepFurs ?? 0) + (s.wares?.wildFurs ?? 0),
      ...s.arms,
      coins: s.coins ?? 0,
    });
    const random = createRandom(23);
    const some = (max: number): number => Math.floor(random.next() * max);
    const list = (share: number, max: number): TradeGoods =>
      Object.fromEntries(
        goods.filter(() => random.next() < share).map((good) => [good, some(max) + 1]),
      );
    let bought = 0;
    let waiting = 0;
    for (let i = 0; i < 80; i++) {
      const s = host(some(1_500));
      s.merchantStops = [STOP, CROSSING];
      s.crafts = { charcoalKg: 0, potteryKg: some(2_000) };
      if (random.next() < 0.5) s.market = market(1 + random.next());
      for (const good of ARMS_GOODS) {
        if (random.next() < 0.6) setArmsOrder(s, good, some(4));
      }
      for (let n = some(4); n > 0; n--) {
        const purse = random.next() < 0.5 ? { coins: some(900) + 1 } : {};
        const load = { ...list(0.4, 40), ...purse };
        joinMarket(s, DAY, trip(`market:p${n}:1`, load, list(0.4, 20)));
      }
      merchantsArrive(s, DAY);
      for (const v of s.market!.visitors.filter((x) => x.merchant)) {
        v.wants = { ...v.wants, ...list(0.3, 300) };
      }
      const visitors = [...s.market!.visitors]; // odkazy platí i po odjezdu
      const sums = (): TradeGoods[] => [held(s), ...visitors.flatMap((v) => [v.goods, v.bought])];
      const before = totalGoods(sums());
      // rušný trh kupce zdrží do druhého dne – nejpozději pak odjedou všichni
      for (const day of [DAY, DAY + 1]) {
        const order = { ...s.armsOrder };
        const arms = { ...s.arms };
        const onMarket = s.market!.visitors.filter((v) => v.merchant);
        const soldBefore = totalGoods(onMarket.map((v) => v.sold));
        marketDay(s, day);
        const sold = totalGoods(onMarket.map((v) => v.sold));
        for (const good of ARMS_GOODS) {
          const gained = (s.arms?.[good] ?? 0) - (arms[good] ?? 0);
          expect(Number.isInteger(gained)).toBe(true);
          expect(gained).toBeGreaterThanOrEqual(0);
          expect((order[good] ?? 0) - (s.armsOrder?.[good] ?? 0)).toBe(gained);
          // jen od kupců – tolik jich aspoň prodali
          expect(gained).toBeLessThanOrEqual((sold[good] ?? 0) - (soldBefore[good] ?? 0));
          bought += gained;
        }
        for (const left of Object.values(s.armsOrder ?? {})) {
          expect(left).toBeGreaterThan(0);
          waiting += left;
        }
        if (s.armsOrder) expect(Object.keys(s.armsOrder).length).toBeGreaterThan(0);
        expect(Number.isInteger(s.coins ?? 0)).toBe(true);
        expect(s.coins ?? 0).toBeGreaterThanOrEqual(0);
        const after = totalGoods(sums());
        for (const good of goods) expect(after[good] ?? 0).toBeCloseTo(before[good] ?? 0, 6);
        expect(after.coins).toBe(before.coins);
      }
      expect(s.market!.visitors).toEqual([]);
    }
    expect(bought).toBeGreaterThan(40);
    expect(waiting).toBeGreaterThan(40);
  });
});

describe('kupující jen od kupců (coinClearing, fromMerchants)', () => {
  const party = (key: string, fields: Partial<CoinParty> = {}): CoinParty => ({
    key,
    coins: 0,
    stock: {},
    wants: {},
    ...fields,
  });
  /** Měšec strany `p` po platbách dne. */
  const purse = (c: CoinClearing, p: CoinParty): number =>
    c.payments.reduce(
      (sum, x) => sum + (x.seller === p.key ? x.coins : 0) - (x.buyer === p.key ? x.coins : 0),
      p.coins,
    );

  it('mince utržené týž den: kupec zaplatí 32 za kožešiny, hostitel mu 120 za meč', () => {
    const own = party('host', {
      coins: 100,
      stock: { furs: 60 },
      wants: { swords: 1 },
      fromMerchants: true,
    });
    const buyer = party('kupec', {
      coins: 60,
      stock: { swords: 2 },
      wants: { furs: 60 },
      merchant: true,
    });
    const c = coinClearing([own, buyer], {}, 1);
    expect(c.trades).toEqual([
      { seller: 'host', buyer: 'kupec', good: 'furs', amount: 60 },
      { seller: 'kupec', buyer: 'host', good: 'swords', amount: 1 },
    ]);
    expect(c.payments).toEqual([
      { buyer: 'kupec', seller: 'host', coins: 32 },
      { buyer: 'host', seller: 'kupec', coins: 120 },
    ]);
    expect(purse(c, own)).toBe(12);
    expect(purse(c, buyer)).toBe(148);
    expect(purse(c, own) + purse(c, buyer)).toBe(160);
    // C = hostitel min(100, 120) + kupec min(60, 32), W = meč 120 + kožešiny 32
    expect(c.available).toBeCloseTo(132, 9);
    expect(c.sought).toBeCloseTo(152, 9);
  });

  it('přeskočí výpravy před kupcem i za ním; strana bez příznaku kupuje od všech', () => {
    const buy = (fields: Partial<CoinParty>): CoinClearing =>
      coinClearing(
        [
          party('host', { coins: 1_000, wants: { swords: 5 }, ...fields }),
          party('a', { stock: { swords: 1 } }),
          party('kupec', { coins: 60, stock: { swords: 1 }, merchant: true }),
          party('b', { stock: { swords: 1 } }),
        ],
        {},
        1,
      );
    expect(buy({ fromMerchants: true }).trades.map((t) => t.seller)).toEqual(['kupec']);
    expect(buy({ fromMerchants: true }).payments).toEqual([
      { buyer: 'host', seller: 'kupec', coins: 120 },
    ]);
    expect(buy({}).trades.map((t) => t.seller)).toEqual(['a', 'kupec', 'b']);
  });

  it('prodává i výpravám – omezuje jen nákup', () => {
    const c = coinClearing(
      [
        party('host', { stock: { grain: 300 }, wants: { swords: 1 }, fromMerchants: true }),
        party('a', { coins: 20, wants: { grain: 300 } }),
      ],
      {},
      1,
    );
    expect(c.payments).toEqual([{ buyer: 'a', seller: 'host', coins: 20 }]);
  });

  it('bez mincí nekoupí nic a do C a W nepatří', () => {
    const c = coinClearing(
      [
        party('host', { wants: { swords: 1 }, fromMerchants: true }),
        party('kupec', { stock: { swords: 2 }, merchant: true }),
      ],
      {},
      1,
    );
    expect(c).toEqual({ trades: [], payments: [], available: 0, sought: 0 });
  });

  it('hladina počítá z objednávky jen zbroj, kterou kupci mají', () => {
    const level = (ordered: number, onMarket: number | null): number => {
      const c = coinClearing(
        [
          party('host', { coins: 1_000, wants: { swords: ordered }, fromMerchants: true }),
          party('kupec', {
            coins: 60,
            stock: onMarket === null ? {} : { swords: onMarket },
            merchant: true,
          }),
        ],
        {},
        1,
      );
      return c.available;
    };
    // 2 meče po 120: host min(1 000, 240) + kupec min(60, 0) – 50 mečů nezvedne nic navíc
    expect(level(2, 2)).toBeCloseTo(240, 9);
    expect(level(50, 2)).toBeCloseTo(level(2, 2), 9);
    expect(level(1, 2)).toBeCloseTo(120, 9);
    expect(level(50, null)).toBe(0);
  });

  it('60 náhodných trhů: hostitel kupuje jen zbroj a jen od kupců, měšec celý a ≥ 0', () => {
    const rnd = createRandom(5);
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
    let bought = 0;
    for (let i = 0; i < 60; i++) {
      const trips = int(0, 4);
      const parties: CoinParty[] = [
        party('host', {
          coins: int(0, 3_000),
          stock: goodsOf(300),
          wants: { swords: int(0, 4), mailShirts: int(0, 2), helmets: int(0, 4) },
          fromMerchants: true,
        }),
        ...Array.from({ length: trips + int(0, 3) }, (_, n) =>
          party(`v${n}`, {
            coins: rnd.next() < 0.3 ? 0 : int(0, 800),
            stock: goodsOf(int(0, 6)),
            wants: goodsOf(int(0, 300)),
            ...(n >= trips ? { merchant: true as const } : {}),
          }),
        ),
      ];
      const merchantKeys = parties.filter((p) => p.merchant).map((p) => p.key);
      const level = rnd.next() < 0.4 ? 1 : 1 + 2 * rnd.next();
      const c = coinClearing(parties, {}, level);
      for (const t of c.trades.filter((x) => x.buyer === 'host')) {
        expect(isArmsGood(t.good)).toBe(true);
        expect(Number.isInteger(t.amount)).toBe(true);
        expect(merchantKeys).toContain(t.seller);
        bought += t.amount;
      }
      const purses = new Map(parties.map((p) => [p.key, p.coins]));
      for (const { buyer, seller, coins } of c.payments) {
        expect(Number.isInteger(coins)).toBe(true);
        purses.set(buyer, purses.get(buyer)! - coins);
        purses.set(seller, purses.get(seller)! + coins);
        expect(purses.get(buyer)).toBeGreaterThanOrEqual(0);
      }
      const total = (sum: number, n: number): number => sum + n;
      expect([...purses.values()].reduce(total, 0)).toBe(
        parties.map((p) => p.coins).reduce(total, 0),
      );
    }
    expect(bought).toBeGreaterThan(40);
  });
});

describe('objednávka v dopočtu vsi (advanceVillage)', () => {
  /** Ves se zastávkou, obilím nad pojistkou, 400 mincemi a objednávkou tří mečů. */
  const start = (): VillageState => {
    const s = host(400, { swords: 3 });
    s.storesKg += 1_000;
    return s;
  };
  const end = DAY - 1 + 400;

  it('první kupci přivezou dva meče, další třetí – pak už ves nekupuje', () => {
    const whole = advanceVillage(start(), end, null);
    expect(isVillageDormant(whole)).toBe(false);
    const days = merchantVisits([STOP], DAY, end).map((visit) => visit.day);
    expect(days).toHaveLength(5);
    // meč za 120, po prvním nákupu hladina nad 1 (C = 240 – třetí meč kupci nevezli – + měšec kupce,
    // W = 240) a třetí meč za 122; ves kupcům prodává i přebytek medu a vosku (plán 4, bod 6)
    expect(heldEvents(whole)).toEqual([
      { day: days[0], kind: 'market-held', sold: { coins: 240 }, bought: { swords: 2 } },
      {
        day: days[1],
        kind: 'market-held',
        sold: { coins: 122, honey: 7 },
        bought: { coins: 3, swords: 1 },
      },
      { day: days[4], kind: 'market-held', sold: { wax: 1 }, bought: { coins: 3 } },
    ]);
    expect(whole.arms).toStrictEqual({ swords: 3 });
    expect(whole).not.toHaveProperty('armsOrder');
    expect(whole.coins).toBe(44);
  });

  it('400 dní vcelku a po kouscích dá týž stav i kroniku', () => {
    const initial = start();
    const before = structuredClone(initial);
    const whole = JSON.parse(JSON.stringify(advanceVillage(initial, end, null))) as VillageState;
    expect(initial).toStrictEqual(before);
    for (const splits of [[DAY - 1 + 100], [DAY], [DAY - 1], [NEXT_DAY - 1, NEXT_DAY]]) {
      let parts = initial;
      for (const to of [...splits, end]) {
        parts = advanceVillage(parts, to, null);
        // uložení do DB a načtení
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(whole);
    }
    // objednávka na hranici dávek opravdu čekala
    expect(advanceVillage(initial, NEXT_DAY - 1, null).armsOrder).toStrictEqual({ swords: 1 });
  });

  it('ves, kam kupci nejezdí, s objednávkou žije bit po bitu jako bez ní', () => {
    const s = start();
    s.merchantStops = [];
    const plain = withoutOrder(s);
    expect(advanceVillage(s, DAY + 90, null)).toStrictEqual({
      ...advanceVillage(plain, DAY + 90, null),
      armsOrder: { swords: 3 },
    });
  });
});
