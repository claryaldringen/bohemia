import { describe, expect, it } from 'vitest';
import { dateOfDayIndex } from '../../../calendar';
import { createRandom } from '../../../landscape/random';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { abandonForLineEnd, departVillage, isVillageDormant } from '../../people/departure';
import { HONEY, MARKET, MERCHANTS } from '../../rules';
import type {
  ChronicleEvent,
  MarketArrival,
  MarketPrices,
  MarketResult,
  MarketVisitor,
  MerchantStop,
  TradeGoods,
  VillageMarket,
  VillageState,
} from '../../types';
import { ARMS_GOODS, TRADE_GOODS } from '../goods';
import { joinMarket, marketDay, marketResultRef } from '../market';
import { totalGoods } from '../market-clearing';
import { coinPriceOf, initialPrice } from '../market-prices';
import { yearlyNeed } from '../../wares/hides';
import { marketStance } from '../market-stance';
import { merchantVisits, nextMerchantVisit } from '../merchant-plan';
import { extendMerchants, merchantsArrive } from '../merchants';
import { villageReport } from '../village-report';
import { D, marketVillage, report, withWorkshop } from './market-fixtures';

// Cizí kupci ve vsi u stezky (markets.md – Rozhodnutí plánu 4, body 3 a 5): v den plánu přijedou na
// trh se zbrojí, obchodují jako strana zápočtů i mincovní fáze, na rušném trhu zůstanou déle a odjedou
// bez pošty – zbroj vzniká jen jejich příjezdem a se zbožím zaniká odjezdem. Mince kupci nedrží:
// platí z měšce bez dna (markets.md – Měšec kupců bez dna; podrobně market-merchants-purse.test.ts).

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** Druhé spojení křižovatky – průjezdy týchž dnů jako `STOP`. */
const CROSSING: MerchantStop = { ...STOP, key: '0,0,N' };
/** Křižovatka čtyř spojení – nejvíc, kolik jich uzel stezky má; každé má svoje průjezdy. */
const CROSSROADS: MerchantStop[] = ['0,0,E', '0,0,N', '-1,0,E', '0,-1,N'].map((key, index) => ({
  key,
  seed: 7 + index,
  index,
  length: 4,
}));
/** První příjezd kupců po D. */
const VISIT = nextMerchantVisit([STOP], D)!;
const DAY = VISIT.day;
const KEY = VISIT.key;
/** Ceny zbroje, kterou kupec veze – bez poptávky stojí na dně. */
const ARMS_PRICES: MarketPrices = { swords: 20, mailShirts: 80, helmets: 40 };

/** Dny prvních `n` průjezdů kupců od `DAY`. */
function visitDays(n: number): number[] {
  const days = merchantVisits([STOP], DAY, DAY + 26 * 366).map((visit) => visit.day);
  if (days.length < n) throw new Error(`Průjezdů je jen ${days.length}.`);
  return days.slice(0, n);
}

/**
 * Lhota (M) u stezky, dopočítaná do dne před příjezdem kupců: chovné jádro krav a obilí `spareKg` kg
 * nad pojistkou – bez něj nic nenabízí. Med, vosk ani kožešiny nemá.
 */
function host(spareKg = 0, stops: MerchantStop[] = [STOP]): VillageState {
  const s = marketVillage(0);
  s.lastDay = DAY - 1;
  s.livestock!.herds.cow = 3;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, DAY).wants.grain! + spareKg;
  s.merchantStops = structuredClone(stops);
  return s;
}

/** Táž ves s obilím nad pojistkou a bez zastávek – jak je uložená dnes. */
function bareHost(): VillageState {
  const s = host(1_000);
  delete s.merchantStops;
  return s;
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

/** `n` výprav na pivo – bez zboží a bez seznamu, `stayDays` dní na trhu. */
function beerTrips(n: number, stayDays: number): MarketArrival[] {
  return Array.from({ length: n }, (_, i) => trip(`market:p${i}:1`, {}, {}, { stayDays }));
}

/** Příjezd výpravy jako událost schránky vsi M v den `day`. */
function arriveEvent(arrival: MarketArrival, day: number, seq = 1): VillageEvent {
  return { id: arrival.key, seq, villageId: 'm', day, body: { kind: 'market-arrive', arrival } };
}

/** Cizí kupci na trhu. */
function merchantsOf(s: VillageState): MarketVisitor[] {
  return (s.market?.visitors ?? []).filter((v) => v.merchant);
}

/** Jediný cizí kupec na trhu – odkaz platí i po odjezdu. */
function merchantOf(s: VillageState): MarketVisitor {
  const [merchant, ...others] = merchantsOf(s);
  if (!merchant || others.length > 0) throw new Error('Na trhu není právě jeden kupec.');
  return merchant;
}

/** Výprava `key` na trhu. */
function visitorOf(s: VillageState, key: string): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Výsledky trhu v odchozí schránce vsi. */
function results(s: VillageState): MarketResult[] {
  return (s.outbox ?? []).flatMap((mail) =>
    mail.body.kind === 'market-result' ? [mail.body.result] : [],
  );
}

/** Výsledek trhu výpravy `key` v odchozí schránce. */
function resultOf(s: VillageState, key: string): MarketResult {
  const result = results(s).find((r) => r.key === key);
  if (!result) throw new Error(`Výsledek ${key} chybí.`);
  return result;
}

/** Mince všude: ve vsi, u výprav a kupců na trhu a v odchozích výsledcích. */
function allCoins(s: VillageState): number {
  const carried = [
    ...(s.market?.visitors ?? []).map((v) => v.goods),
    ...results(s).map((r) => r.unsold),
  ];
  return (s.coins ?? 0) + carried.reduce((sum, goods) => sum + (goods.coins ?? 0), 0);
}

/** Zápisy kroniky o kupcích. */
function arrivedEvents(s: VillageState): ChronicleEvent[] {
  return s.chronicle.filter((e) => e.kind === 'merchants-arrived');
}

/** Z dnů vzestupně první v každém herním roce – dny, kdy se příjezd kupců zapíše do kroniky. */
function firstsOfYears(days: readonly number[]): number[] {
  const year = (day: number): number => dateOfDayIndex(day).year;
  return days.filter((day, i) => i === 0 || year(day) !== year(days[i - 1]!));
}

describe('příjezd cizích kupců (merchantsArrive)', () => {
  it('v den plánu stojí na trhu kupec se zbrojí a seznamem, bez mincí; poznámka a kronika', () => {
    const s = host();
    expect(s).not.toHaveProperty('market');
    expect(merchantsArrive(s, DAY)).toStrictEqual([
      {
        day: DAY,
        kind: 'merchants-arrived',
        sells: { swords: 2, mailShirts: 1, helmets: 2 },
        buys: { gold: 1_000, honey: 100, wax: 24, furs: 60, slaves: 10 },
      },
    ]);
    expect(s.market).toStrictEqual({
      prices: {},
      coinKg: MARKET.grainKgPerCoin,
      visitors: [
        {
          key: KEY,
          fromVillageId: '',
          fromName: '',
          order: 1,
          arrivedDay: DAY,
          lastDay: DAY,
          travelDays: 0,
          goods: { swords: 2, mailShirts: 1, helmets: 2 },
          horses: [],
          wants: { gold: 1_000, honey: 100, wax: 24, furs: 60, slaves: 10 },
          sold: {},
          bought: {},
          boughtHorses: [],
          merchant: true,
        },
      ],
      nextOrder: 2,
      arrivals: [
        { name: '', day: DAY, goods: ['swords', 'mailShirts', 'helmets'], merchants: true },
      ],
      merchantsYear: 601,
    });
    // měšec bez dna se do stavu nezapíše – příjezdem žádné mince nevznikly
    expect(s).not.toHaveProperty('coins');
    expect(allCoins(s)).toBe(0);
  });

  it('zpráva na pivo uvádí i příjezd kupců – bez jména a bez vsi', () => {
    const s = host();
    merchantsArrive(s, DAY);
    expect(villageReport(s, DAY).traders).toStrictEqual([
      { name: '', day: DAY, goods: ['swords', 'mailShirts', 'helmets'], merchants: true },
    ]);
    // zpráva o vsi kupce nevzniká – žádnou nemá
    expect(s).not.toHaveProperty('news');
  });

  it('mimo den plánu, bez zastávek a na mapě bez stezky nic – trh nevznikne', () => {
    const dry = host(0, []);
    const unknown = host();
    delete unknown.merchantStops;
    for (const [s, day] of [
      [host(), DAY - 1],
      [host(), DAY + 1],
      [dry, DAY],
      [unknown, DAY],
    ] as const) {
      const before = structuredClone(s);
      expect(merchantsArrive(s, day)).toEqual([]);
      expect(s).toStrictEqual(before);
    }
  });

  it('týž klíč, který na trhu už stojí, se znovu nezaloží', () => {
    const s = host();
    merchantsArrive(s, DAY);
    const before = structuredClone(s);
    expect(merchantsArrive(s, DAY)).toEqual([]);
    expect(s).toStrictEqual(before);
  });

  it('na trhu, kde už někdo stojí, přijedou v pořadí za ním – ceny a hladina trhu zůstanou', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', {}, {}));
    s.market!.prices = { furs: 3 };
    s.market!.level = 1.5;
    merchantsArrive(s, DAY);
    expect(s.market!.visitors.map((v) => [v.key, v.order])).toEqual([
      ['market:a:1', 1],
      [KEY, 2],
    ]);
    expect(s.market).toMatchObject({ prices: { furs: 3 }, level: 1.5, nextOrder: 3 });
    expect(s.market!.arrivals.map((a) => a.name)).toEqual(['Vlkov', '']);
  });

  it('křižovatka: dva průjezdy téhož dne jsou dva kupci, každý se svým seznamem', () => {
    const s = host(0, [CROSSING, STOP]);
    const events = merchantsArrive(s, DAY);
    // do kroniky jen první z nich (první příjezd roku)
    expect(events.map((e) => e.kind)).toEqual(['merchants-arrived']);
    expect(merchantsOf(s).map((v) => [v.key, v.order, v.goods])).toEqual([
      ['merchants:0,0,E:601:2', 1, MERCHANTS.goods],
      ['merchants:0,0,N:601:2', 2, MERCHANTS.goods],
    ]);
    expect(s.market!.nextOrder).toBe(3);
    expect(s.market!.arrivals).toHaveLength(2);
    // výprava prodá víc, než shání první – druhý dokoupí podle svého seznamu
    joinMarket(s, DAY, trip('market:a:1', { furs: 120 }, {}));
    const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
    marketDay(s, DAY);
    expect([first.bought, first.goods]).toEqual([{ furs: 60 }, MERCHANTS.goods]);
    expect([second.bought, second.goods]).toEqual([{ furs: 60 }, MERCHANTS.goods]);
    // 120 kožešin po 8/90 mince: každý kupec platí za 60 kusů 5,33 → 6 mincí
    expect(resultOf(s, 'market:a:1').unsold).toEqual({ coins: 12 });
  });

  it('kronika zapíše jen první příjezd v herním roce – další týž rok ne, v dalším roce znovu', () => {
    const s = host();
    const visits = merchantVisits([STOP], DAY, DAY + 3 * 366).map((visit) => visit.day);
    const written: number[] = [];
    for (const day of visits) {
      const events = merchantsArrive(s, day);
      written.push(...events.map((e) => e.day));
      // přijedou pokaždé – se zbrojí, bez mincí a s poznámkou pro zprávu na pivo
      expect(merchantOf(s).goods).toEqual(MERCHANTS.goods);
      expect(s.market!.arrivals.at(-1)).toMatchObject({ day, merchants: true });
      marketDay(s, day);
    }
    const years = visits.map((day) => dateOfDayIndex(day).year);
    expect(years.filter((year) => year === 601).length).toBeGreaterThanOrEqual(2);
    expect(new Set(years).size).toBeGreaterThanOrEqual(3);
    expect(written).toEqual(firstsOfYears(visits));
    expect(s.market!.merchantsYear).toBe(years.at(-1));
  });

  it('dva příjezdy v jednom roce → jeden zápis, v dalším roce druhý; klíč na trhu rok nezapíše', () => {
    const s = host();
    const visits = merchantVisits([STOP], DAY, DAY + 2 * 366).map((visit) => visit.day);
    const [first, second] = visits as [number, number];
    const next = visits.find((day) => dateOfDayIndex(day).year === 602)!;
    expect([first, second].map((day) => dateOfDayIndex(day).year)).toEqual([601, 601]);
    expect(merchantsArrive(s, first)).toHaveLength(1);
    expect(merchantsArrive(s, first)).toEqual([]); // týž klíč podruhé
    marketDay(s, first);
    expect(merchantsArrive(s, second)).toEqual([]);
    expect(merchantsOf(s)).toHaveLength(1);
    marketDay(s, second);
    expect(merchantsArrive(s, next)).toEqual([
      expect.objectContaining({ day: next, kind: 'merchants-arrived' }),
    ]);
    expect(s.market!.merchantsYear).toBe(602);
  });

  it('obchod kupce nezmění čísla pravidel ani zápis kroniky', () => {
    const rules = structuredClone(MERCHANTS);
    const s = host();
    const [event] = merchantsArrive(s, DAY);
    joinMarket(s, DAY, trip('market:a:1', { honey: 100, coins: 300 }, { swords: 1 }));
    marketDay(s, DAY);
    expect(MERCHANTS).toEqual(rules);
    expect(event).toStrictEqual({
      day: DAY,
      kind: 'merchants-arrived',
      sells: rules.goods,
      buys: rules.wants,
    });
    // další kupec přijede zase s plným nákladem
    const next = host();
    merchantsArrive(next, DAY);
    expect(merchantOf(next).goods).toEqual(rules.goods);
    expect(merchantOf(next).wants).toEqual(rules.wants);
  });

  it('vsi si pamatuje jen posledních MARKET.report.traders příjezdů – i s kupci', () => {
    const s = host();
    for (let i = 0; i < MARKET.report.traders; i++) {
      joinMarket(s, DAY - 1, trip(`market:p${i}:1`, {}, {}, { fromName: `Ves ${i}` }));
    }
    merchantsArrive(s, DAY);
    expect(s.market!.arrivals).toHaveLength(MARKET.report.traders);
    expect(s.market!.arrivals[0]!.name).toBe('Ves 1');
    expect(s.market!.arrivals.at(-1)).toMatchObject({ name: '', merchants: true });
  });
});

describe('tržní den s kupci (marketDay)', () => {
  it('kupec koupí od výpravy 30 kožešin za 2,67 mince a 4 kg vosku za 1,33 – platí 4, výprava je odveze', () => {
    const s = host();
    expect(marketStance(s, DAY).offer).toEqual({});
    joinMarket(s, DAY, trip('market:a:1', { furs: 30, wax: 4 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(marketDay(s, DAY)).toEqual([]); // hostitel nic neprodal ani nekoupil
    const result = resultOf(s, 'market:a:1');
    expect(result.sold).toEqual({ furs: 30, wax: 4 });
    expect(result.bought).toEqual({});
    expect(result.unsold).toEqual({ coins: 4 });
    expect(merchant.bought).toEqual({ furs: 30, wax: 4 });
    expect(merchant.sold).toEqual({});
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(merchant.wants).toEqual({ gold: 1_000, honey: 100, wax: 20, furs: 30, slaves: 10 });
    expect(s).not.toHaveProperty('coins');
  });

  it('kupec večer odjede bez pošty, výprava s výsledkem; bez výprav odchozí schránka nevznikne', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    expect(s.market!.visitors).toEqual([]);
    expect(s.outbox!.map((mail) => mail.ref)).toEqual([marketResultRef('market:a:1')]);
    expect(s.market).not.toHaveProperty('orders');

    const alone = host();
    merchantsArrive(alone, DAY);
    marketDay(alone, DAY);
    expect(alone.market!.visitors).toEqual([]);
    expect(alone).not.toHaveProperty('outbox');
    expect(allCoins(alone)).toBe(0); // zbroj odjela ze světa, mince kupec nemá
    expect(alone).not.toHaveProperty('arms');

    // výprava, která zůstává, stojí na trhu dál
    const stays = host();
    joinMarket(stays, DAY, trip('market:a:1', {}, {}, { stayDays: 2 }));
    merchantsArrive(stays, DAY);
    marketDay(stays, DAY);
    expect(stays.market!.visitors.map((v) => v.key)).toEqual(['market:a:1']);
    expect(stays).not.toHaveProperty('outbox');
  });

  it('zápočtem vymění výprava plný náklad za 20 mincí za meč – mince se nehnou', () => {
    // předpoklad testu: náklad má hodnotu právě jednoho meče – po změně cen by níž selhal nesrozumitelně
    const cargo: TradeGoods = { honey: 100, wax: 24, furs: 60 };
    const cargoWorth = TRADE_GOODS.reduce(
      (sum, good) => sum + (cargo[good] ?? 0) * coinPriceOf({}, 1, good),
      0,
    );
    expect(cargoWorth, 'hodnota nákladu (med, vosk, kožešiny) = cena meče').toBeCloseTo(
      coinPriceOf({}, 1, 'swords'),
      9,
    );
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', cargo, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    // hodnota nákladu je přesně 1 800 kg obilí = 20 mincí; v kg obilí zůstává šum plovoucí čárky
    expect(Object.keys(result.sold).sort()).toEqual(['furs', 'honey', 'wax']);
    expect(result.sold.honey).toBeCloseTo(100, 9);
    expect(result.sold.wax).toBeCloseTo(24, 9);
    expect(result.sold.furs).toBeCloseTo(60, 9);
    expect(result.bought).toEqual({ swords: 1 });
    expect(result.unsold).toEqual({});
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2 });
    expect(merchant.sold).toEqual({ swords: 1 });
    expect(Object.keys(merchant.bought).sort()).toEqual(['furs', 'honey', 'wax']);
    expect(merchant.wants).toEqual({ gold: 1_000, slaves: 10 }); // zlato ani otroky nikdo nenabízel
  });

  it('náklad za 18,67 mince meč zápočtem nekoupí: kupec ho vykoupí celý za 19 mincí', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { honey: 100, wax: 20, furs: 60 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect(result.bought).toEqual({});
    // med 6,67 mince, vosk 6,67 a kožešiny 5,33 – na meč (20) výprava nemá
    expect(result.sold).toEqual({ honey: 100, wax: 20, furs: 60 });
    expect(result.unsold).toEqual({ coins: 19 }); // 18,67 nahoru
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(merchant.sold).toEqual({});
  });

  it('výprava s mincemi koupí od kupce meč za 20 a odveze ho, kupci zbude o jeden míň', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { coins: 50 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(allCoins(s)).toBe(50);
    marketDay(s, DAY);
    const result = resultOf(s, 'market:a:1');
    expect(result.bought).toEqual({ swords: 1 });
    expect(result.unsold).toEqual({ coins: 30 });
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2 });
    expect(merchant.sold).toEqual({ swords: 1 });
    // mince za meč u kupce zanikly
    expect(allCoins(s)).toBe(30);
  });

  it('součty zaplacených a přijatých mincí má jen výprava – kupec domů nic neposílá', () => {
    const s = host();
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { coins: 20 }, { swords: 1 }));
    joinMarket(s, DAY, trip('market:b:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    // meč prodal za 20 mincí, kožešiny koupil za 3 (2,67 nahoru) – mince u něj nezůstaly
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2 });
    expect(merchant.bought).toEqual({ furs: 30 });
    expect(merchant).not.toHaveProperty('coinsPaid');
    expect(merchant).not.toHaveProperty('coinsGot');
    expect(resultOf(s, 'market:a:1')).toMatchObject({ coinsPaid: 20, unsold: {} });
    expect(resultOf(s, 'market:b:1')).toMatchObject({ coinsGot: 3, unsold: { coins: 3 } });
  });

  it('součet světa: mince od kupce jdou přes výpravu k hostiteli, jinak nic nevznikne ani nezmizí', () => {
    const s = host();
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    expect(marketStance(s, DAY).offer.pottery).toBeGreaterThanOrEqual(50);
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, { pottery: 50 }, { stayDays: 2 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(allCoins(s)).toBe(0);
    expect(marketDay(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'market-held',
        sold: { pottery: expect.closeTo(30, 9) },
        bought: { coins: 1 },
      },
    ]);
    // kožešiny 3 mince od kupce (2,67 nahoru – kupec platí nahoru), výprava za 1 z nich keramiku: 50 kg
    // po 1/30 = 1,67, za celé mince dolů 1 mince = 30 kg (gold.md – Mince 2,4 g, bod 9)
    expect(merchant.goods).not.toHaveProperty('coins');
    expect(visitorOf(s, 'market:a:1').goods).toEqual({ coins: 2 });
    expect(s.coins).toBe(1);
    // odjel kupec – zbroj s ním; mince vznikly jen jeho platbou za kožešiny
    expect(allCoins(s)).toBe(3);
    expect(s).not.toHaveProperty('arms');
    expect(s.crafts.potteryKg).toBeCloseTo(470, 9);
    // druhý den: zbylých 20 kg (0,67 mince) je pod minci – nekoupí se
    marketDay(s, DAY + 1);
    expect(resultOf(s, 'market:a:1')).toMatchObject({
      sold: { furs: 30 },
      bought: { pottery: expect.closeTo(30, 9) },
      unsold: { coins: 2 },
    });
    expect(allCoins(s)).toBe(3);
  });

  it('hostitel prodá kupci med, vosk a kožešiny nad potřebu – mince vzniknou jen platbou kupce', () => {
    const s = host(1_000);
    const people = s.people.length;
    const need = yearlyNeed(s, DAY).furs;
    s.wares = {
      honeyKg: 20 + HONEY.kgPerPersonYear * people,
      waxKg: 2.5,
      sheepFurs: need + 20,
      wildFurs: 0,
      hides: 0,
    };
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(allCoins(s)).toBe(0);
    // 20 kg medu za 1,33, 2 kg vosku za 0,67, 20 kožešin za 1,78 – celkem 3,78 nahoru = 4
    expect(marketDay(s, DAY)).toEqual([
      {
        day: DAY,
        kind: 'market-held',
        sold: { honey: 20, wax: 2, furs: 20 },
        bought: { coins: 4 },
      },
    ]);
    expect(s.coins).toBe(4);
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    // kupec odjel bez mincí – ve světě jsou jen 4 mince hostitele
    expect(allCoins(s)).toBe(4);
    expect(s.wares!.honeyKg).toBeCloseTo(HONEY.kgPerPersonYear * people, 9);
    expect(s.wares!.waxKg).toBeCloseTo(0.5, 9);
    expect(s.wares!.sheepFurs + s.wares!.wildFurs).toBeCloseTo(need, 9);
  });

  it('kupec a hostitel sami: nic nevzniká – ves nemá co prodat a zbroj nekupuje', () => {
    const s = host(1_000);
    s.coins = 500;
    const before = structuredClone(s);
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    expect(marketDay(s, DAY)).toEqual([]);
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    const after: Partial<VillageState> = structuredClone(s);
    delete after.market;
    expect(after).toStrictEqual(before);
  });

  it('náhodné trhy: zboží jen přechází, mince přibudou a ubudou jen platbami na trhu', () => {
    const goods = ['grain', 'pottery', 'cows', 'honey', 'wax', 'furs', ...ARMS_GOODS] as const;
    /** Kolik zboží drží ves – jen druhy, se kterými se v testu obchoduje. */
    const held = (s: VillageState): TradeGoods => ({
      grain: s.storesKg,
      pottery: s.crafts?.potteryKg ?? 0,
      cows: s.livestock!.herds.cow,
      honey: s.wares?.honeyKg ?? 0,
      wax: s.wares?.waxKg ?? 0,
      furs: (s.wares?.sheepFurs ?? 0) + (s.wares?.wildFurs ?? 0),
      ...s.arms,
      coins: s.coins ?? 0,
    });
    const random = createRandom(11);
    const some = (max: number): number => Math.floor(random.next() * max);
    const list = (share: number, max: number): TradeGoods =>
      Object.fromEntries(
        goods.filter(() => random.next() < share).map((good) => [good, some(max) + 1]),
      );
    let sold = 0;
    let bought = 0;
    for (let i = 0; i < 60; i++) {
      const s = host(some(3_000), [STOP, CROSSING]);
      s.livestock!.herds.cow = 3 + some(5);
      s.crafts = { charcoalKg: 0, potteryKg: some(500) };
      for (let n = some(4); n >= 0; n--) {
        const purse = random.next() < 0.5 ? { coins: some(400) + 1 } : {};
        const load = { ...list(0.4, 120), ...purse };
        joinMarket(s, DAY, trip(`market:p${n}:1`, load, list(0.4, 60)));
      }
      merchantsArrive(s, DAY);
      const visitors = [...s.market!.visitors]; // odkazy platí i po odjezdu
      const sums = (): TradeGoods[] => [held(s), ...visitors.flatMap((v) => [v.goods, v.bought])];
      const before = totalGoods(sums());
      // platby hostitele (kronika `market-held`) a výprav (`coinsGot`, `coinsPaid`) – mince mezi nimi
      // se v součtu vyruší, zbude jen to, co zaplatili kupci a co se zaplatilo jim (měšec bez dna)
      let hostFlow = 0;
      // rušný trh kupce zdrží do druhého dne – nejpozději pak odjedou všichni
      for (const day of [DAY, DAY + 1]) {
        for (const e of marketDay(s, day)) {
          if (e.kind === 'market-held') hostFlow += (e.bought.coins ?? 0) - (e.sold.coins ?? 0);
        }
        const after = totalGoods(sums());
        for (const good of goods) expect(after[good] ?? 0).toBeCloseTo(before[good] ?? 0, 6);
        const tripFlow = visitors.reduce(
          (sum, v) => sum + (v.coinsGot ?? 0) - (v.coinsPaid ?? 0),
          0,
        );
        expect(after.coins).toBe((before.coins ?? 0) + hostFlow + tripFlow);
      }
      expect(s.market!.visitors).toEqual([]);
      for (const v of visitors) {
        expect(Number.isInteger(v.goods.coins ?? 0)).toBe(true);
        if (v.merchant) expect(v.goods).not.toHaveProperty('coins');
        for (const good of TRADE_GOODS) expect(v.goods[good] ?? 0).toBeGreaterThanOrEqual(0);
        if (!v.merchant) continue;
        sold += (v.sold.swords ?? 0) + (v.sold.helmets ?? 0);
        bought += (v.bought.honey ?? 0) + (v.bought.wax ?? 0) + (v.bought.furs ?? 0);
      }
    }
    expect(sold).toBeGreaterThan(0);
    expect(bought).toBeGreaterThan(0);
  });
});

describe('ceny v den kupců (marketDay)', () => {
  /** Den kupce: hladina, výpravy na trhu, hostitel a úprava trhu před obchodem. */
  interface MerchantDay {
    level?: number;
    trips?: MarketArrival[];
    s?: VillageState;
    change?: (s: VillageState) => void;
  }

  /** Cena po tržním dni podle `MARKET.priceStep`: poptávka `wanted` proti nabídce `offered`. */
  function stepped(from: number, wanted: number, offered: number): number {
    return from * (1 + (MARKET.priceStep * (wanted - offered)) / (wanted + offered));
  }

  /** Ceny po tržním dni vsi, kde stojí kupec, při uložených cenách `prices`. */
  function pricesAfter(prices: MarketPrices, setup: MerchantDay = {}): MarketPrices {
    const { level, trips = [], s = host(), change } = setup;
    s.market = {
      prices: { ...prices },
      visitors: [],
      nextOrder: 1,
      arrivals: [],
      ...(level === undefined ? {} : { level }),
    };
    for (const arrival of trips) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    change?.(s);
    marketDay(s, DAY);
    return s.market.prices;
  }

  it('co na trhu nikdo nenabízí, kupci nezdraží – sami ani v den s výpravou', () => {
    expect(pricesAfter({})).toEqual(ARMS_PRICES);
    const stored: MarketPrices = { honey: 5, wax: 10, furs: 20 };
    expect(pricesAfter(stored)).toEqual({ ...stored, ...ARMS_PRICES });
    // výprava veze jen med – kupec za 5 mincí (75 × výchozí cena) chce 100 ÷ 75 = 1,33 kg ku 50
    // (Měšec kupců bez dna, bod 6); vosk a kožešiny stojí, i když je kupec shání
    const after = pricesAfter(stored, { trips: [trip('market:a:1', { honey: 50 }, {})] });
    expect(after.honey).toBeCloseTo(stepped(5, (100 * initialPrice('honey')) / 5, 50), 12);
    expect(after).toMatchObject({ wax: 10, furs: 20 });
  });

  it('co je na trhu ke koupi, zdraží, dokud ho kupci za cenu dne chtějí víc – hladina nehraje roli', () => {
    /** Cena kožešiny po dni, kdy výprava přivezla jednu. */
    const oneFur = (prices: MarketPrices, level?: number): number =>
      pricesAfter(prices, {
        trips: [trip('market:a:1', { furs: 1 }, {})],
        ...(level === undefined ? {} : { level }),
      }).furs!;
    /** Cena po dni z ceny `price`: kupec chce 60 × výchozí cena ÷ `price` kožešin ku jedné (bod 6). */
    const fromPrice = (price: number): number =>
      stepped(price, (60 * initialPrice('furs')) / price, 1);
    // za výchozí cenu 60 kožešin ku jedné – zdraží
    expect(oneFur({})).toBeCloseTo((8 / 90) * (1 + (0.1 * 59) / 61), 12);
    // za šedesátinásobek chce právě jednu – cena stojí; za 10 mincí (112,5 ×) chce 0,53 – zlevní
    const even = 60 * initialPrice('furs');
    expect(oneFur({ furs: even })).toBeCloseTo(even, 12);
    expect(oneFur({ furs: 10 })).toBeCloseTo(fromPrice(10), 12);
    expect(oneFur({ furs: 10 })).toBeLessThan(10);
    // poptávka je z ceny trhu bez hladiny – s hladinou 2 táž
    expect(oneFur({ furs: 3 }, 2)).toBeCloseTo(fromPrice(3), 12);
    expect(oneFur({ furs: 3 }, 2)).toBeGreaterThan(3);
  });

  it('den jen s kupci: ceny zboží, které kupci nevezou ani neshánějí, stojí', () => {
    const s = host(1_000);
    expect(marketStance(s, DAY)).toEqual({
      offer: { grain: 1_000 },
      wants: { tools: 27, pottery: 70, woodTools: expect.closeTo(46.8, 9) },
    });
    // nabídka hostitele obilí nezlevní, jeho poptávka nic nezdraží
    const stored: MarketPrices = { grain: 0.2, tools: 12, pottery: 5, cows: 90, honey: 5 };
    expect(pricesAfter(stored, { s })).toEqual({ ...stored, ...ARMS_PRICES });
    expect(pricesAfter({}, { s: host(1_000) })).toEqual(ARMS_PRICES);
    // dva kupci na křižovatce totéž
    const crossing = host(1_000, [STOP, CROSSING]);
    expect(pricesAfter(stored, { s: crossing })).toEqual({ ...stored, ...ARMS_PRICES });
    expect(crossing.market!.arrivals).toHaveLength(2);
  });

  it('kovář souseda ani doprovod partnera výprava nejsou, výprava na pivo a vesničanů ano', () => {
    const stored: MarketPrices = { grain: 0.2, tools: 12 };
    const after = (fields: Partial<MarketVisitor>): MarketPrices =>
      pricesAfter(stored, {
        s: host(1_000),
        trips: beerTrips(1, 1),
        change: (s) => Object.assign(visitorOf(s, 'market:p0:1'), fields),
      });
    expect(after({ service: { kind: 'shoeing', horses: 1 } })).toMatchObject(stored);
    expect(after({ kin: { seekerId: 1 } })).toMatchObject(stored);
    for (const prices of [after({}), after({ by: 'villagers' })]) {
      expect(prices.grain).toBeCloseTo(0.18, 12);
      expect(prices.tools).toBeCloseTo(13.2, 12);
    }
  });

  it('den jen s kupci: zboží kupců se hýbe podle celé nabídky i poptávky trhu', () => {
    /** Cena obilí po dni, kdy ho kupec shání 3 t a hostitel ho nabízí `spareKg`. */
    const grain = (spareKg: number, prices: MarketPrices = {}): number =>
      pricesAfter(prices, {
        s: host(spareKg),
        change: (s) => (merchantOf(s).wants = { grain: 3_000 }),
      }).grain!;
    // za výchozí cenu shání 3 000 kg ku 100 – zdraží; za 0,2 mince (18 × výchozí) chce 3 000 ÷ 18 =
    // 166,7 kg ku 1 000 a za 61 mincí 0,55 kg – zlevní (Měšec kupců bez dna, bod 6)
    expect(grain(100)).toBeCloseTo((1 / 90) * (1 + (0.1 * 2_900) / 3_100), 9);
    expect(grain(1_000, { grain: 0.2 })).toBeCloseTo(stepped(0.2, 3_000 / 18, 1_000), 9);
    expect(grain(1_000, { grain: 61 })).toBeCloseTo(stepped(61, 3_000 / 90 / 61, 1_000), 9);
    // zbroj, kterou veze: nabídka bez poptávky
    expect(pricesAfter({ swords: 200 }).swords).toBeCloseTo(180, 12);
    // stačí, že ho shání jeden z kupců
    const crossing = pricesAfter(
      {},
      {
        s: host(100, [STOP, CROSSING]),
        change: (s) => {
          const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
          first.wants = {};
          second.wants = { grain: 3_000 };
        },
      },
    );
    expect(crossing.grain).toBeCloseTo((1 / 90) * (1 + (0.1 * 2_900) / 3_100), 9);
  });

  it('den s výpravou: hýbou se všechny ceny, jen kupci nezdraží, co na trhu není', () => {
    const stored: MarketPrices = {
      grain: 0.2,
      tools: 12,
      pottery: 5,
      cows: 90,
      logs: 4,
      honey: 5,
      wax: 10,
      furs: 20,
      swords: 200,
    };
    const after = pricesAfter(stored, {
      s: host(1_000),
      trips: [trip('market:a:1', { honey: 50, cows: 1 }, { logs: 3, furs: 2 })],
    });
    const expected: MarketPrices = {
      grain: 0.2 * 0.9, // nabízí hostitel, nikdo ho neshání
      tools: 12 * 1.1, // shání hostitel, nikdo je nenabízí
      pottery: 5 * 1.1,
      woodTools: initialPrice('woodTools') * 1.1,
      cows: 90 * 0.9, // veze výprava
      logs: 4 * 1.1, // shání výprava
      // kupec za 5 mincí (75 × výchozí cena) chce 1,33 kg, výprava veze 50
      honey: stepped(5, (100 * initialPrice('honey')) / 5, 50),
      wax: 10, // shání jen kupec a na trhu není
      furs: 20 * 1.1, // shání je i výprava – ta cenou hýbe i bez nabídky
      ...ARMS_PRICES,
      swords: 200 * 0.9,
    };
    expect(Object.keys(after).sort()).toEqual(Object.keys(expected).sort());
    for (const good of TRADE_GOODS) {
      if (expected[good] === undefined) continue;
      expect(after[good], good).toBeCloseTo(expected[good], 9);
    }
  });

  it('zbroj kupec nabízí – bez poptávky drží cenu na dně, poptávka výpravy ji zvedne', () => {
    expect(pricesAfter({ swords: 200 }).swords).toBeCloseTo(180, 12);
    expect(pricesAfter({})).toMatchObject(ARMS_PRICES);
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { coins: 1 }, { swords: 6 }));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // shání se 6 a nabízí 2 → × (1 + 0,1 × 4 ÷ 8)
    expect(s.market!.prices.swords).toBeCloseTo(21, 12); // 20 × 1,05
  });

  it('do ceny jde poptávka ráno, ne po nákupech dne – drahou kožešinu kupec nekoupí', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    marketDay(s, DAY);
    // shání 60, nabízí se 30 → × (1 + 0,1 × 30 ÷ 90)
    expect(s.market!.prices.furs).toBeCloseTo((8 / 90) * (1 + 1 / 30), 12);
    // kožešina za 59 mincí (663,75 × výchozí cena): kupec za ni chce 60 ÷ 663,75 = 0,09 kusu – celou
    // nekoupí a cena klesne (Měšec kupců bez dna, bod 6)
    const dear = host();
    dear.market = { prices: { furs: 59 }, visitors: [], nextOrder: 1, arrivals: [] };
    joinMarket(dear, DAY, trip('market:a:1', { furs: 1 }, {}));
    merchantsArrive(dear, DAY);
    marketDay(dear, DAY);
    expect(resultOf(dear, 'market:a:1').unsold).toEqual({ furs: 1 });
    expect(dear.market.prices.furs).toBeCloseTo(
      stepped(59, (60 * initialPrice('furs')) / 59, 1),
      12,
    );
  });

  it('kupec shání a kupuje svou poptávku za cenu dne – v ceně dne i v mincovní fázi', () => {
    const s = host();
    // dvojnásobek výchozí ceny medu – kupec chce půl seznamu (Měšec kupců bez dna, bod 6)
    const honey = 2 * initialPrice('honey');
    s.market = { prices: { honey }, visitors: [], nextOrder: 1, arrivals: [] };
    joinMarket(s, DAY, trip('market:a:1', { honey: 80 }, { wax: 90 }));
    joinMarket(s, DAY, trip('market:b:1', { wax: 10 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    // 50 kg medu z 80 (6,67 mince, platí 7) a všechen vosk, co je na trhu (za výchozí cenu chce 24)
    expect(merchant.bought).toEqual({ honey: 50, wax: 10 });
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(resultOf(s, 'market:a:1').unsold).toEqual({ honey: 30, coins: 7 });
    // medu se shání 50 a nabízí 80; vosku shání 90 výprava bez mincí a 24 kupec, nabízí se 10
    expect(s.market.prices.honey).toBeCloseTo(stepped(honey, 50, 80), 12);
    expect(s.market.prices.wax).toBeCloseTo((1 / 3) * (1 + (0.1 * (114 - 10)) / 124), 12); // vosk 30 kg ÷ 90
  });

  it('kupci hladinou nehýbou – jejich měšec ani seznam se do ní nepočítají', () => {
    const s = host();
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.bought).toEqual({ furs: 30 });
    expect(s.market).not.toHaveProperty('level');
    expect(resultOf(s, 'market:a:1')).not.toHaveProperty('level');

    const alone = host();
    merchantsArrive(alone, DAY);
    marketDay(alone, DAY);
    expect(alone.market).not.toHaveProperty('level');
  });

  it('den s výpravou: do poptávky patří i obilí, za které řemeslníci prodávají výrobky', () => {
    const s = host();
    withWorkshop(s, 'potter', 701);
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    s.storesKg = 0;
    s.storesKg = marketStance(s, DAY).wants.grain!;
    const { offer, wants } = marketStance(s, DAY);
    expect([offer.grain, wants.grain]).toEqual([undefined, undefined]);
    expect(offer.pottery).toBeGreaterThanOrEqual(50);
    const after = pricesAfter(
      { grain: 1 / 30 }, // uložená cena obilí: třikrát výchozí 1/90, jako keramika 1/30 za kg
      { s, trips: [trip('market:a:1', { grain: 300 }, { pottery: 50 })] },
    );
    // 50 kg keramiky za 1,67 mince = 50 kg obilí po 1/30, které hrnčíř shání, ku 300 kg výpravy
    expect(after.grain).toBeCloseTo((1 / 30) * (1 - (0.1 * 250) / 350), 9);
  });

  it('100 průjezdů do vsi bez nabídky: ceny medu, vosku, kožešin, nástrojů a krav zůstanou', () => {
    const s = host();
    s.livestock!.herds.cow = 1;
    s.storesKg = 0;
    const stored: MarketPrices = { honey: 5, wax: 10, furs: 20, tools: 12, cows: 90, grain: 0.2 };
    s.market = { prices: { ...stored }, visitors: [], nextOrder: 1, arrivals: [] };
    for (const day of visitDays(100)) {
      // hostitel nástroje, krávy i obilí pořád shání, nikdo je nenabízí
      const { offer, wants } = marketStance(s, day);
      expect(offer).toEqual({});
      expect(wants.cows).toBe(2);
      expect(wants.tools).toBeGreaterThanOrEqual(27);
      expect(wants.grain).toBeGreaterThan(0);
      merchantsArrive(s, day);
      expect(merchantsOf(s)).toHaveLength(1);
      marketDay(s, day);
      expect(s.market.visitors).toEqual([]);
      expect(s.market.prices).toEqual({ ...stored, ...ARMS_PRICES });
      expect(s.market).not.toHaveProperty('level');
    }
    // zásoby vsi ani mince se za tu dobu nehnuly
    expect(s).not.toHaveProperty('coins');
    expect(s).not.toHaveProperty('outbox');
    expect(s.market.arrivals).toHaveLength(MARKET.report.traders);
  });

  it('10 let na křižovatce (4 spojení) jen s kupci: ceny v mezích, žádné Infinity ani NaN', () => {
    const start = host(1_000, CROSSROADS);
    expect(marketStance(start, DAY)).toMatchObject({
      offer: { grain: 1_000 },
      wants: { tools: 27 },
    });
    const end = DAY - 1 + 3_652;
    expect(merchantVisits(CROSSROADS, DAY, end).length).toBeGreaterThan(150);
    const after = advanceVillage(start, end, null);
    expect(isVillageDormant(after)).toBe(false);
    for (const [good, price] of Object.entries(after.market!.prices)) {
      expect(Number.isFinite(price), good).toBe(true);
    }
    // zbroj na dně; ves prodává kupcům, co jí doma přebývá (med, vosk, kožešiny – plán 4, bod 6),
    // ostatní ceny, které by poptávka hostitele zvedla, se ani nezapsaly
    expect(after.market!.prices).toMatchObject(ARMS_PRICES);
    expect(Object.keys(after.market!.prices).sort()).toEqual([
      'furs',
      'helmets',
      'honey',
      'mailShirts',
      'swords',
      'wax',
    ]);
    expect(after.coins).toBeGreaterThan(0);
  });

  /** Průjezd: cena medu (obilí) v mincích před ním, kolik kg kupec koupil a za kolik mincí. */
  interface Passage {
    price: number;
    kg: number | undefined;
    coins: number | undefined;
  }

  /**
   * `amount` kg (výchozí 20) na průjezd proti seznamu `list` kg, od výchozí ceny `first`: kupec za cenu P
   * chce `list` × `first` ÷ P (Měšec kupců bez dna, bod 6) – víc, než je na trhu, takže koupí všechno
   * a cena roste, čím dál pomaleji, k rovnováze `list` × `first` ÷ `amount`; platí cenu dne.
   */
  function expectSettling(passages: Passage[], first: number, list: number, amount = 20): void {
    let expected = first;
    for (const { price, kg, coins } of passages) {
      expect(price).toBeCloseTo(expected, 9);
      expect(kg).toBeCloseTo(amount, 9);
      expect(coins).toBe(Math.ceil(amount * price - 1e-9));
      expected = stepped(expected, (list * first) / expected, amount);
    }
    const last = passages.at(-1)!.price;
    expect(last).toBeLessThan((list * first) / amount);
  }

  it('s nabídkou medu cena roste (D > S), až kupci chtějí právě tolik, kolik je na trhu', () => {
    const s = host();
    const passages = visitDays(100).map((day, i): Passage => {
      joinMarket(s, day, trip(`market:a:${i}`, { honey: 20 }, {}));
      merchantsArrive(s, day);
      const merchant = merchantOf(s);
      const price = coinPriceOf(s.market!.prices, s.market!.level ?? 1, 'honey');
      marketDay(s, day);
      const coins = resultOf(s, `market:a:${i}`).unsold.coins;
      return { price, kg: merchant.bought.honey, coins };
    });
    // první den: 100 kg ku 20 → × (1 + 0,1 × 80 ÷ 120); 20 kg po 1/15 = 1,33 mince, platí se 2
    expect(passages[0]).toEqual({ price: 1 / 15, kg: 20, coins: 2 });
    expectSettling(passages, 1 / 15, 100);
    // po 100 průjezdech skoro pětinásobek výchozí ceny (rovnováha 100 ÷ 20) – ne 6,7 % každý průjezd
    expect(passages.at(-1)!.price).toBeGreaterThan(4.9 / 15);
    // kupci hladinou nehýbou – mince jedou s výpravami domů
    expect(s.market).not.toHaveProperty('level');
  });

  it('totéž v den jen s kupci z nabídky hostitele', () => {
    let market: Pick<VillageMarket, 'prices' | 'level'> = { prices: {} };
    const passages = Array.from({ length: 120 }, (): Passage => {
      const s = host(90); // 90 kg obilí po 1/90 = přesně 1 mince – pod minci by se nákup zrušil
      s.market = { ...market, visitors: [], nextOrder: 1, arrivals: [] };
      merchantsArrive(s, DAY);
      const merchant = merchantOf(s);
      merchant.wants = { grain: 3_000 };
      const price = coinPriceOf(s.market.prices, s.market.level ?? 1, 'grain');
      marketDay(s, DAY);
      const { prices, level } = s.market;
      market = { prices, ...(level === undefined ? {} : { level }) };
      return { price, kg: merchant.bought.grain, coins: s.coins };
    });
    expect(passages[0]).toMatchObject({ price: 1 / 90, coins: 1 });
    // rovnováha: 3 000 kg ku 90 – za 33,3 × výchozí cenu; po 120 průjezdech 32,9 ×
    expectSettling(passages, 1 / 90, 3_000, 90);
    expect(passages.at(-1)!.price).toBeGreaterThan(32.5 / 90);
    expect(market).not.toHaveProperty('level');
  });

  it('technická mez ceny: dál neroste a dopočet po kouscích dá týž stav', () => {
    const top = 1e9 * initialPrice('tools');
    // výprava na pivo 20 dní: hostitel každý den shání nástroje, nikdo je nenabízí
    const inbox = [arriveEvent(trip('market:a:1', {}, {}, { stayDays: 20 }), DAY)];
    const end = DAY + 19;
    // i cena u konce rozsahu čísla: bez meze Infinity, v JSON null a po načtení zase výchozí
    for (const price of [top, Number.MAX_VALUE]) {
      const start = host();
      start.market = { prices: { tools: price }, visitors: [], nextOrder: 1, arrivals: [] };
      const whole = advanceVillage(start, end, null, null, inbox);
      expect(whole.market!.prices.tools).toBe(top);
      let parts: VillageState = start;
      for (const to of [DAY, DAY + 7, end]) {
        parts = advanceVillage(parts, to, null, null, inbox);
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(JSON.parse(JSON.stringify(whole)));
    }
  });
});

describe('pobyt kupců na rušném trhu (extendMerchants)', () => {
  /** Dny, kdy kupec na trhu stojí (`marketDay` po dnech od příjezdu), s výpravami `trips`. */
  function daysOnMarket(trips: MarketArrival[], change?: (s: VillageState) => void): number[] {
    const s = host();
    for (const arrival of trips) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    change?.(s);
    const days: number[] = [];
    for (let day = DAY; day < DAY + 10; day++) {
      if (merchantsOf(s).some((v) => v.key === KEY)) days.push(day);
      marketDay(s, day);
    }
    return days;
  }

  it('dvě výpravy: kupec stojí den', () => {
    expect(daysOnMarket([])).toEqual([DAY]);
    expect(daysOnMarket(beerTrips(2, 10))).toEqual([DAY]);
  });

  it('tři výpravy v den příjezdu: dva dny; stále tři: tři dny a odjede', () => {
    expect(daysOnMarket(beerTrips(3, 1))).toEqual([DAY, DAY + 1]);
    expect(daysOnMarket(beerTrips(3, 10))).toEqual([DAY, DAY + 1, DAY + 2]);
    expect(daysOnMarket(beerTrips(5, 10))).toHaveLength(MERCHANTS.maxStayDays);
    // druhý den už jen dvě – třetí den nezůstane
    const [first, ...others] = beerTrips(3, 10);
    expect(daysOnMarket([{ ...first!, stayDays: 1 }, ...others])).toEqual([DAY, DAY + 1]);
  });

  it('kovář, doprovod partnera ani druhý kupec se do výprav nepočítají', () => {
    const extra = (fields: Partial<MarketVisitor>): ((s: VillageState) => void) => {
      return (s) => {
        s.market!.visitors.push({
          ...structuredClone(visitorOf(s, 'market:p0:1')),
          key: 'market:x:1',
          order: s.market!.nextOrder++,
          ...fields,
        });
      };
    };
    const two = beerTrips(2, 10);
    expect(daysOnMarket(two, extra({ service: { kind: 'shoeing', horses: 1 } }))).toEqual([DAY]);
    expect(daysOnMarket(two, extra({ kin: { seekerId: 1 } }))).toEqual([DAY]);
    expect(daysOnMarket(two, extra({ merchant: true }))).toEqual([DAY]);
    // obyčejná třetí výprava i výprava vesničanů ano
    expect(daysOnMarket(two, extra({}))).toHaveLength(3);
    expect(daysOnMarket(two, extra({ by: 'villagers' }))).toHaveLength(3);
  });

  it('prodlouží jen kupce, kterému pobyt dnes končí – výpravy ne', () => {
    const s = host(0, [STOP, CROSSING]);
    for (const arrival of beerTrips(3, 1)) joinMarket(s, DAY, arrival);
    merchantsArrive(s, DAY);
    const [first, second] = merchantsOf(s) as [MarketVisitor, MarketVisitor];
    second.lastDay = DAY + 4;
    extendMerchants(s.market!, DAY);
    expect(first.lastDay).toBe(DAY + 1);
    expect(second.lastDay).toBe(DAY + 4);
    expect(s.market!.visitors.slice(0, 3).map((v) => v.lastDay)).toEqual([DAY, DAY, DAY]);
  });

  it('druhý den kupuje dál, co za cenu dne ze seznamu chce – mince platí, ale nedrží', () => {
    const s = host();
    // dvojnásobek výchozí ceny medu – kupec chce půl seznamu (Měšec kupců bez dna, bod 6)
    const honey = 2 * initialPrice('honey');
    s.market = { prices: { honey }, visitors: [], nextOrder: 1, arrivals: [] };
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { furs: 30 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(allCoins(s)).toBe(3); // 30 kožešin po 8/90 = 2,67 nahoru
    joinMarket(s, DAY + 1, trip('market:b:1', { honey: 200 }, {}));
    expect(merchantsArrive(s, DAY + 1)).toEqual([]);
    // med první den na trhu nebyl – cena stojí a kupci hladinou nehýbou
    expect(s.market).not.toHaveProperty('level');
    marketDay(s, DAY + 1);
    // 50 kg z 200 po 2/15 = 6,67 mince, platí 7
    expect(merchant.bought).toEqual({ furs: 30, honey: 50 });
    expect(merchant.goods).toEqual(MERCHANTS.goods);
    expect(resultOf(s, 'market:b:1').unsold).toEqual({ honey: 150, coins: 7 });
    // odjeli všichni: 3 a 7 mincí jede domů s výpravami, kupec žádné nemá
    expect(s.market!.visitors).toEqual([]);
    expect(allCoins(s)).toBe(10);
  });

  it('druhý den shání jen to, co mu na seznamu zbylo – koupené kožešiny znovu ne', () => {
    const s = host();
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { furs: 60 }, {}));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.bought).toEqual({ furs: 60 });
    expect(merchant.goods).not.toHaveProperty('coins');
    expect(merchant.lastDay).toBe(DAY + 1);
    // 6 kg vosku po 1/3 = 2 mince (méně než minci by kupec nekoupil)
    joinMarket(s, DAY + 1, trip('market:b:1', { furs: 10, wax: 6 }, {}));
    marketDay(s, DAY + 1);
    expect(merchant.bought).toEqual({ furs: 60, wax: 6 });
    expect(merchant.wants).toEqual({ gold: 1_000, honey: 100, wax: 18, slaves: 10 });
    const { sold, unsold } = resultOf(s, 'market:b:1');
    expect(sold).toEqual({ wax: 6 });
    expect(unsold).toMatchObject({ furs: 10 });
  });

  it('mince za prodaný meč u kupce zaniknou – druhý den shání zbytek seznamu za cenu dne', () => {
    const s = host();
    for (const arrival of beerTrips(2, 1)) joinMarket(s, DAY, arrival);
    joinMarket(s, DAY, trip('market:a:1', { coins: 20 }, { swords: 1 }));
    merchantsArrive(s, DAY);
    const merchant = merchantOf(s);
    marketDay(s, DAY);
    expect(merchant.goods).toEqual({ swords: 1, mailShirts: 1, helmets: 2 });
    expect(resultOf(s, 'market:a:1')).toMatchObject({ bought: { swords: 1 }, coinsPaid: 20 });
    expect(allCoins(s)).toBe(0);
    const honey = 2 * initialPrice('honey');
    s.market!.prices = { honey };
    delete s.market!.level;
    joinMarket(s, DAY + 1, trip('market:b:1', { honey: 10 }, {}));
    marketDay(s, DAY + 1);
    // za dvojnásobek výchozí ceny shání 50 kg ku 10 → × (1 + 0,1 × 40 ÷ 60)
    expect(s.market!.prices.honey).toBeCloseTo(honey * (1 + (0.1 * 40) / 60), 12);
    expect(merchant.bought).toEqual({ honey: 10 });
    expect(merchant.goods).not.toHaveProperty('coins');
  });
});

describe('kupci v dopočtu vsi (advanceVillage)', () => {
  it('přijedou po události schránky a obchodují týž den; druhý den na trhu nejsou', () => {
    const s = host();
    const event = arriveEvent(trip('market:a:1', { furs: 30, wax: 4 }, {}), DAY);
    const after = advanceVillage(s, DAY, null, null, [event]);
    const kinds = after.chronicle.map((e) => e.kind);
    expect(kinds.filter((k) => k.startsWith('market') || k.startsWith('merchants'))).toEqual([
      'market-arrived',
      'merchants-arrived',
    ]);
    expect(arrivedEvents(after)).toEqual([
      {
        day: DAY,
        kind: 'merchants-arrived',
        sells: MERCHANTS.goods,
        buys: MERCHANTS.wants,
      },
    ]);
    expect(after.market!.arrivals.map((a) => a.merchants)).toEqual([undefined, true]);
    expect(resultOf(after, 'market:a:1').unsold).toEqual({ coins: 4 }); // 2,67 + 1,33 nahoru
    expect(merchantsOf(after)).toEqual([]);
    // vstup se nemění
    expect(s).not.toHaveProperty('market');
    const next = advanceVillage(after, DAY + 1, null);
    expect(next.market!.visitors).toEqual([]);
    expect(arrivedEvents(next)).toHaveLength(1);
  });

  it('kronika příjezdu je před zápisem tržního dne', () => {
    const s = host();
    s.crafts = { charcoalKg: 0, potteryKg: 500 };
    const event = arriveEvent(trip('market:a:1', { furs: 30 }, { pottery: 50 }), DAY);
    const after = advanceVillage(s, DAY, null, null, [event]);
    const kinds = after.chronicle.map((e) => e.kind);
    expect(kinds.indexOf('market-arrived')).toBeLessThan(kinds.indexOf('merchants-arrived'));
    expect(kinds.indexOf('merchants-arrived')).toBeLessThan(kinds.indexOf('market-held'));
    expect(after.coins).toBe(1); // 50 kg keramiky po 1/30 = 1,67 – za celé mince dolů 1 (30 kg)
  });

  it('přijedou v každý den plánu, i když na trhu jinak nikdo není', () => {
    const start = host(1_000);
    // přebytek medu: kupec bere jen nákup od celé mince (drobný přebytek 0,47 mince by se zrušil)
    start.wares = {
      honeyKg: 100 + 2 * HONEY.kgPerPersonYear * start.people.length,
      waxKg: 0,
      sheepFurs: 0,
      wildFurs: 0,
      hides: 0,
    };
    const whole = advanceVillage(start, DAY + 400, null);
    expect(isVillageDormant(whole)).toBe(false);
    const planned = merchantVisits([STOP], DAY, DAY + 400).map((visit) => visit.day);
    expect(planned).toHaveLength(5);
    expect(whole.market!.arrivals.map((a) => [a.day, a.merchants])).toEqual(
      planned.map((day) => [day, true]),
    );
    // do kroniky jen první v každém herním roce
    expect(firstsOfYears(planned)).toHaveLength(2);
    expect(arrivedEvents(whole).map((e) => e.day)).toEqual(firstsOfYears(planned));
    expect(whole.market!.visitors).toEqual([]);
    // co ves doma vyrobí nad potřebu, prodá kupcům za mince (plán 4, bod 6)
    expect(whole.coins).toBeGreaterThan(0);
    expect(whole).not.toHaveProperty('outbox');
  });

  it('dopočet 400 dní vcelku a po kouscích dá týž stav i kroniku', () => {
    const start = host(1_000, [STOP, { key: '0,0,N', seed: 11, index: 2, length: 5 }]);
    const inbox = [
      // rušný trh: tři výpravy v den kupců, kupec zůstane přes hranici dávek
      ...beerTrips(3, 1).map((arrival, i) => arriveEvent(arrival, DAY, i + 1)),
      arriveEvent(trip('market:a:1', { furs: 90, honey: 120 }, { swords: 1 }), DAY + 1, 4),
    ];
    const end = DAY - 1 + 400;
    const whole = advanceVillage(start, end, null, null, inbox);
    expect(isVillageDormant(whole)).toBe(false);
    const planned = merchantVisits(start.merchantStops!, DAY, end).map((visit) => visit.day);
    expect(planned.length).toBeGreaterThanOrEqual(8);
    // čtyři výpravy a všichni kupci plánu; v kronice jen první příjezd kupců v každém roce
    expect(whole.market!.nextOrder).toBe(1 + 4 + planned.length);
    expect(arrivedEvents(whole).map((e) => e.day)).toEqual(firstsOfYears(planned));
    for (const splits of [[DAY - 1 + 100], [DAY], [DAY, DAY + 1], [DAY + 133, DAY + 239]]) {
      let parts = start;
      for (const to of [...splits, end]) {
        parts = advanceVillage(parts, to, null, null, inbox);
        // uložení do DB a načtení
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(JSON.parse(JSON.stringify(whole)));
    }
    // na hranici dávek kupec na trhu opravdu stál a druhý den kupoval
    expect(merchantOf(advanceVillage(start, DAY, null, null, inbox)).lastDay).toBe(DAY + 1);
    // výprava prodala kupci celý seznam medu a kožešin (100 kg a 60 kusů) za cenu dne
    const sold = 100 * initialPrice('honey') + 60 * initialPrice('furs');
    expect(resultOf(whole, 'market:a:1').unsold.coins).toBe(Math.ceil(sold - 1e-9));
  });

  it('ves bez zastávek i s prázdnými žije bit po bitu jako bez kupců', () => {
    const without = advanceVillage(bareHost(), DAY + 90, null);
    expect(without).not.toHaveProperty('market');
    expect(without).not.toHaveProperty('merchantStops');
    const dry = advanceVillage({ ...bareHost(), merchantStops: [] }, DAY + 90, null);
    expect(dry).toStrictEqual({ ...without, merchantStops: [] });
    // zastávka, kam v těch dnech nikdo nepřijel, nic nezmění
    expect(merchantVisits([STOP], DAY + 1, DAY + 90)).toEqual([]);
    const later: VillageState = { ...bareHost(), lastDay: DAY };
    expect(advanceVillage({ ...later, merchantStops: [STOP] }, DAY + 90, null)).toStrictEqual({
      ...advanceVillage(later, DAY + 90, null),
      merchantStops: [STOP],
    });
  });

  it('ves na suché mapě s výpravami obchoduje beze změny', () => {
    const event = arriveEvent(trip('market:a:1', { coins: 50 }, { grain: 300 }), DAY);
    const without = advanceVillage(bareHost(), DAY + 90, null, null, [event]);
    expect(without.coins).toBe(3); // 300 kg obilí ÷ 90 = 3,33 – za celé mince dolů 3 (270 kg)
    const dry = { ...bareHost(), merchantStops: [] };
    expect(advanceVillage(dry, DAY + 90, null, null, [event])).toStrictEqual({
      ...without,
      merchantStops: [],
    });
  });

  it.each([
    ['vymřelá', { extinctDay: DAY - 5 }],
    ['opuštěná', { abandonedDay: DAY - 5 }],
    [
      'na cestě',
      { journey: { direction: 'E', departedDay: DAY - 5, arrivalDay: DAY + 500 } as const },
    ],
  ])('do spící vsi (%s) kupci nepřijedou', (_name, fields) => {
    const s: VillageState = { ...host(), ...fields };
    expect(isVillageDormant(s)).toBe(true);
    const after = advanceVillage(s, DAY + 100, null);
    expect(after).not.toHaveProperty('market');
    expect(arrivedEvents(after)).toEqual([]);
  });
});

describe('kupec na trhu zaniklé vsi (Rozhodnutí plánu 4, bod 9 – návrh Clauda)', () => {
  /** Rušný trh v den kupců: tři výpravy na pivo a výprava se 7 mincemi, která zůstává tři dny. */
  const BUSY = [
    ...beerTrips(3, 1).map((arrival, i) => arriveEvent(arrival, DAY, i + 1)),
    arriveEvent(trip('market:a:1', { coins: 7 }, {}, { stayDays: 3 }), DAY, 4),
  ];

  /** Lhota večer v den kupců – kupec bez mincí a výprava `market:a:1` zůstávají do dalšího dne. */
  function busy(): VillageState {
    const s = advanceVillage(host(), DAY, null, null, BUSY);
    expect(merchantOf(s)).toMatchObject({ lastDay: DAY + 1, goods: MERCHANTS.goods });
    expect(s.market!.visitors.map((v) => v.key)).toEqual(['market:a:1', KEY]);
    expect(allCoins(s)).toBe(7);
    return s;
  }

  /** Kupec odjel se vším, výprava na trhu zůstala (vrátí ji domovská ves) a nic jiného se nezměnilo. */
  function merchantLeft(gone: VillageState, before: VillageState): void {
    expect(gone.market).toEqual({
      ...before.market!,
      visitors: before.market!.visitors.filter((v) => !v.merchant),
    });
    expect(gone.market!.visitors.map((v) => v.key)).toEqual(['market:a:1']);
    expect(gone.outbox).toEqual(before.outbox);
    expect(gone).not.toHaveProperty('arms');
    // měšec kupce zanikl s ním, mince výpravy zůstaly
    expect(allCoins(gone)).toBe(7);
    // spící ves se nesimuluje – kupci do ní dál nejezdí
    const later = advanceVillage(gone, DAY + 400, null, null, BUSY);
    expect([later.market, later.outbox]).toEqual([gone.market, gone.outbox]);
    expect(allCoins(later)).toBe(7);
  }

  it('rod vymřel a ves zanikla: kupec odjede se vším, vstup se nezmění', () => {
    const before = busy();
    const input = structuredClone(before);
    const gone = abandonForLineEnd(before, DAY);
    expect(gone.abandonedDay).toBe(DAY);
    merchantLeft(gone, before);
    expect(before).toStrictEqual(input);
  });

  it('odešli všichni: kupec odjede se vším – osadníci si z něj nic nevezmou, vstup se nezmění', () => {
    const before = busy();
    const input = structuredClone(before);
    const homes = [...new Set(before.people.map((p) => p.dwellingId))];
    const { state: gone, settlers } = departVillage(before, DAY, homes, 'N');
    expect(gone.abandonedDay).toBe(DAY);
    merchantLeft(gone, before);
    expect(settlers.whole!.stocks).not.toHaveProperty('coins');
    expect(settlers.whole!.stocks).not.toHaveProperty('arms');
    expect(before).toStrictEqual(input);
  });

  it('odešla část lidí: ves žije dál a kupec stojí na trhu', () => {
    const before = busy();
    const home = before.people.find((p) => p.dwellingId !== before.manorId)!.dwellingId;
    const { state } = departVillage(before, DAY, [home], 'N');
    expect(state).not.toHaveProperty('abandonedDay');
    expect(state.market).toEqual(before.market);
  });

  it('ves vymřela v dopočtu dne kupců: kupec odjede se vším, vcelku i po kouscích', () => {
    const empty = host();
    empty.people = [];
    const whole = advanceVillage(empty, DAY + 100, null, null, BUSY);
    expect(whole.extinctDay).toBe(DAY);
    expect(whole.market!.arrivals.map((a) => a.merchants)).toContain(true);
    expect(whole.market!.visitors.map((v) => v.key)).toEqual(['market:a:1']);
    expect(allCoins(whole)).toBe(7);
    for (const splits of [[DAY], [DAY, DAY + 1], [DAY + 50]]) {
      let parts = empty;
      for (const to of [...splits, DAY + 100]) {
        parts = advanceVillage(parts, to, null, null, BUSY);
        parts = JSON.parse(JSON.stringify(parts)) as VillageState;
      }
      expect(parts).toEqual(JSON.parse(JSON.stringify(whole)));
    }
  });

  it('ves bez trhu a trh bez kupce zánik nezmění', () => {
    const bare = host();
    expect(abandonForLineEnd(bare, DAY)).not.toHaveProperty('market');
    const trips = host();
    joinMarket(trips, DAY, trip('market:a:1', { coins: 7 }, {}, { stayDays: 3 }));
    expect(abandonForLineEnd(trips, DAY).market).toBe(trips.market);
  });
});
