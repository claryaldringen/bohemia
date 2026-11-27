// Trh ve vsi hostitele (markets.md – Pravidla 2, 3, 5 a 8; Rozhodnutí plánu 2, body 4–7): výprava
// přijde událostí schránky (`joinMarket`) a každý tržní den (`marketDay` – v pořadí dne hned po
// událostech schránky) se hostitelská ves a výpravy vyrovnají zápočtem (`clearMarket`) za ceny
// trhu. Výprava po posledním dni pobytu odjede: výsledek (`marketResult`) jde do odchozí schránky
// vsi (`VillageState.outbox`) k domovské vsi a padne na den jejího návratu. Řemeslníci prodávají
// výrobky za obilí a luštěniny vždy, ve vlastním zápočtu před dnešním, a nekoupený výrobek
// hostitel zapíše jako zakázku (craft-orders.ts – Rozhodnutí plánu 3, body 5 a 6). Co zápočty
// nechaly, koupí za mince výprava, která je veze, nebo cizí kupec z měšce bez dna – za drahé zboží
// méně (mincovní fáze `coinPhase`, market-coins.ts – Rozhodnutí plánu 4, body 2 a 3; markets.md –
// Měšec kupců bez dna, poptávka kupce `merchantDemand` bod 6);
// hostitel v ní jen prodává a koupí jedině zbroj,
// kterou si u kupců objednal hráč (arms-order.ts – bod 15), a zlato přespolních výprav vymění za své
// mince – 2,4 g za minci, po celých mincích (gold.md – Rozhodnutí plánu 6, bod 3; Mince 2,4 g,
// bod 4). Cizí kupci (merchants.ts – bod 5) jsou
// návštěvníci bez domovské vsi a odjíždějí bez pošty. Kovář souseda (výprava se službou kování) kuje
// hned po příjezdu a do zápočtu nevstupuje (livestock/smith-visit.ts – Rozhodnutí plánu 3, bod 9).
// Lidé jdou zápočtem jako kusy, ale po skupinách jako skuteční lidé: prodaní hostitelem odejdou
// k výpravě, koupení hostitelem se u něj hned usadí (market-people.ts – bod 10). Trh počítá jen ze
// stavu hostitele a událostí schránky toho dne, takže výsledek nezávisí na kouscích dopočtu. Mutuje
// stav jako kroky dne.
import { serveShoeing } from '../livestock/smith-visit';
import { receiveKin } from '../people/kin-match';
import { OPPOSITE } from '../people/world-grid';
import { MARKET } from '../rules';
import type {
  ChronicleEvent,
  CartGood,
  Direction8,
  HorseGood,
  MarketArrival,
  MarketCart,
  MarketClearing,
  MarketHorse,
  MarketPerson,
  MarketPrices,
  MarketResult,
  MarketStance,
  MarketVisitor,
  PeopleGood,
  TradeGood,
  TradeGoods,
  TradedHorse,
  VillageMarket,
  VillageNews,
  VillageState,
} from '../types';
import { armsBuyer, reduceArmsOrder } from './arms-order';
import {
  coinPhaseStock,
  craftParties,
  craftStance,
  recordOrders,
  reduceOrder,
} from './craft-orders';
import {
  CART_GOODS,
  COIN_GOOD,
  GOLD_GOOD,
  HORSE_GOODS,
  PEOPLE_GOODS,
  TRADE_GOODS,
  isCartGood,
  isHorseGood,
  isOrderGood,
  isPeopleGood,
  onlyGoods,
  withoutCoins,
  withoutMoney,
} from './goods';
import { addHorses, takeHorses } from './horse-trade';
import { jewelleryOf, useJewellery } from './jewellery';
import { clearMarket, partyTotals, totalGoods } from './market-clearing';
import { coinClearing, type CoinParty, type CoinPayment } from './market-coins';
import { leavingGroups, sendPeople, settlePeople } from './market-people';
import { goldCoins, nextLevel, nextPrices, roundGold } from './market-prices';
import { newMarket } from './coin-rate';
import { marketStance } from './market-stance';
import { offeredSlaveIds, reduceSlavesForSale } from './slaves';
import { extendMerchants, merchantDemand } from './merchants';
import { addGood, addMarketCarts, takeCarts, villageGoodStock } from './trade';
import { villageReport } from './village-report';

/** Strana hostitelské vsi v zápočtu (výpravy mají klíč `market:…`). */
const HOST = 'host';

/** Šum plovoucí čárky: zbytek zboží do NOISE × původního množství je nula (jako v zápočtu). */
const NOISE = 1e-9;

/** `ref` příjezdu výpravy ve schránce hostitele. */
export function marketArrivalRef(key: string): string {
  return `${key}:in`;
}

/** `ref` výsledku trhu ve schránce domovské vsi. */
export function marketResultRef(key: string): string {
  return `${key}:out`;
}

/**
 * Klíče výprav, které ves ještě řeší (souhrn vsi – `VillageDigest.openTrips`; markets.md – Rozhodnutí
 * plánu 4, bod 10): vlastní výprava bez výsledku (`trade.expeditions`) a výprava, jejíž zpráva leží
 * v odchozí schránce – příjezd vlastní výpravy, výsledek cizí, i doručené a jen nesmazané. Jen takovou
 * zprávu by ves mohla poslat znovu nebo se po jejím příjezdu ptát (výprava po termínu).
 */
export function openTripKeys(state: Pick<VillageState, 'trade' | 'outbox'>): string[] {
  const keys = new Set<string>();
  for (const { kind, market } of state.trade?.expeditions ?? []) {
    if (kind === 'market' && market) keys.add(market.key);
  }
  for (const { body } of state.outbox ?? []) {
    if (body.kind === 'market-arrive') keys.add(body.arrival.key);
    if (body.kind === 'market-result') keys.add(body.result.key);
  }
  return [...keys];
}

/**
 * Zapamatuje si zprávu na pivo o jiné vsi (mutuje stav; markets.md – Pravidla 8): jedna na ves,
 * novější `report.day` vyhrává – při stejném dni pozdější zpráva. Uloží kopii. Ceny a hladinu trhu
 * (`prices`, `level`) nesou jen výsledky výprav (Rozhodnutí plánu 4, bod 3): novější zpráva bez cen
 * (hosté na trhu, kovář, sňatek) známé ceny a hladinu nepřepíše, starší zpráva s cenami je doplní,
 * jen když ves žádné nezná (preflight plánu 4, M15).
 */
export function rememberNews(state: VillageState, news: VillageNews): void {
  const list = (state.news ??= []);
  const i = list.findIndex((n) => n.villageId === news.villageId);
  const old = list[i];
  if (old === undefined) {
    list.push(structuredClone(news));
  } else if (news.report.day >= old.report.day) {
    const next = structuredClone(news);
    // ceny jdou s hladinou a kurzem (`coinKg` – gold.md, Mince 2,4 g, bod 3)
    if (next.prices === undefined && old.prices !== undefined) {
      next.prices = old.prices;
      if (old.level !== undefined) next.level = old.level;
      if (old.coinKg !== undefined) next.coinKg = old.coinKg;
    }
    list[i] = next;
  } else if (old.prices === undefined && news.prices !== undefined) {
    old.prices = structuredClone(news.prices);
    if (news.level !== undefined) old.level = news.level;
    if (news.coinKg !== undefined) old.coinKg = news.coinKg;
  }
}

/** Kopie zboží jen s kladnými položkami v pořadí `TRADE_GOODS`. */
function positiveGoods(goods: TradeGoods): TradeGoods {
  const out: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (amount > 0) out[good] = amount;
  }
  return out;
}

/** Je ve zboží aspoň něco? */
function hasGoods(goods: TradeGoods): boolean {
  return TRADE_GOODS.some((good) => (goods[good] ?? 0) > 0);
}

/** Přičte k položce (mutuje) – zlato na setiny gramu (`roundGold`). */
function addTo(goods: TradeGoods, good: TradeGood, amount: number): void {
  const sum = (goods[good] ?? 0) + amount;
  goods[good] = good === GOLD_GOOD ? roundGold(sum) : sum;
}

/**
 * Ubere z položky (mutuje); zbytek, který je jen šum plovoucí čárky, položku smaže. Zlato na setiny
 * gramu (`roundGold`) – neprodané zlato výpravy (10 − 9,6 g) i zbytek seznamu kupce (1 000 − 998,4 g)
 * jsou bez šumu.
 */
function takeFrom(goods: TradeGoods, good: TradeGood, amount: number): void {
  const had = goods[good] ?? 0;
  const rest = good === GOLD_GOOD ? roundGold(had - amount) : had - amount;
  if (rest > had * NOISE) goods[good] = rest;
  else delete goods[good];
}

/**
 * Výprava přijela na trh (mutuje stav – událost schránky `market-arrive`): trh vznikne, chybí-li,
 * výprava stojí na trhu v pořadí příjezdu do `lastDay` = den + `stayDays` − 1, poznámka
 * o obchodníkovi (posledních `MARKET.report.traders` – technický strop paměti vsi, ne pravidlo
 * hry) a zpráva o její vsi (`rememberNews`). Vrací zápis kroniky `market-arrived` s vsí výpravy
 * (`villageId`); výprava si nese směr `firstStep`, má-li ho příjezd. Týž klíč podruhé (výprava na
 * trhu nebo její výsledek v odchozí schránce) nic neudělá. Příjezd se ukládá kopií. Počty koní ve
 * zboží jsou počty kusů v `horses` po druzích – kůň, který nepřišel, se neprodá; stejně lidé
 * (`people` po skupinách – Rozhodnutí plánu 3, bod 10). Kovář souseda (`service` – Rozhodnutí
 * plánu 3, bod 9) si službu nese a kuje hned po příjezdu (`serveShoeing`, kronika `horses-shod` za
 * příjezdem). Partner za hledajícím (`kin` – Rozhodnutí plánu 3, bod 11) zbožím není: usadí se hned
 * po příjezdu (`receiveKin` – svatba nebo nováček, kronika za příjezdem) a doprovod jen čeká.
 */
export function joinMarket(
  state: VillageState,
  day: number,
  arrival: MarketArrival,
): ChronicleEvent[] {
  const known =
    (state.market?.visitors.some((v) => v.key === arrival.key) ?? false) ||
    (state.outbox?.some((mail) => mail.ref === marketResultRef(arrival.key)) ?? false);
  if (known) return [];
  const market = (state.market ??= newMarket());
  const pieceCounts: TradeGoods = {};
  for (const good of HORSE_GOODS) {
    pieceCounts[good] = arrival.horses.filter((h) => h.good === good).length;
  }
  for (const good of PEOPLE_GOODS) {
    // partner za hledajícím (`kin`) se neprodává – zbožím není
    pieceCounts[good] = arrival.kin
      ? 0
      : (arrival.people ?? []).filter((g) => g.good === good).length;
  }
  const goods = positiveGoods({ ...arrival.goods, ...pieceCounts });
  const visitor: MarketVisitor = {
    key: arrival.key,
    fromVillageId: arrival.fromVillageId,
    fromName: arrival.fromName,
    ...(arrival.firstStep ? { firstStep: arrival.firstStep } : {}),
    order: market.nextOrder++,
    arrivedDay: day,
    lastDay: day + arrival.stayDays - 1,
    travelDays: arrival.travelDays,
    goods,
    horses: structuredClone(arrival.horses),
    ...(arrival.carts?.length ? { carts: structuredClone(arrival.carts) } : {}),
    ...(arrival.people?.length ? { people: structuredClone(arrival.people) } : {}),
    wants: positiveGoods(arrival.wants),
    sold: {},
    bought: {},
    boughtHorses: [],
    ...(arrival.service ? { service: { ...arrival.service } } : {}),
    ...(arrival.kin ? { kin: { ...arrival.kin } } : {}),
    ...(arrival.by ? { by: arrival.by } : {}),
    // kapacita šperkaře, kterou výprava veze (gold.md – Pravidla 4) – použije ji mincovní fáze
    ...((arrival.jewelleryG ?? 0) > 0 ? { jewelleryG: arrival.jewelleryG } : {}),
  };
  market.visitors.push(visitor);
  market.arrivals.push({
    name: arrival.fromName,
    villageId: arrival.fromVillageId,
    day,
    goods: TRADE_GOODS.filter((good) => (goods[good] ?? 0) > 0),
    ...(arrival.service ? { smith: true as const } : {}),
  });
  const excess = market.arrivals.length - MARKET.report.traders;
  if (excess > 0) market.arrivals.splice(0, excess);
  rememberNews(state, {
    villageId: arrival.fromVillageId,
    name: arrival.fromName,
    report: arrival.report,
  });
  return [
    {
      day,
      kind: 'market-arrived',
      villageName: arrival.fromName,
      goods: { ...goods },
      villageId: arrival.fromVillageId,
      ...(arrival.service ? { smith: true as const } : {}),
    },
    ...serveShoeing(state, day, visitor),
    ...receiveKin(state, day, visitor),
  ];
}

/**
 * Výsledek trhu pro domovskou ves výpravy – jediné místo, kde vzniká (odjezd v `marketDay`, zaniklý
 * hostitel). Návštěvník: co prodal a koupil, `unsold` = co mu zbylo (i mince v měšci), koně domů =
 * neprodaní a koupení, lidé – neprodaní vlastní (`people`) a koupení (`newcomers`), zaplacené
 * a přijaté mince (`coinsPaid`, `coinsGot` – Rozhodnutí plánu 4, bod 9; jen kladné). Nepoužitý
 * příjezd: nic neprodal ani nekoupil, domů jde vše, co vezl, i lidé. Obojí nese nepoužitou kapacitu
 * šperkaře (`jewelleryG`, jen kladnou – gold.md, Rozhodnutí plánu 6, bod 6), i výsledek `returned`.
 * Kopie.
 */
export function marketResult(
  from: MarketVisitor | MarketArrival,
  extra: Pick<MarketResult, 'report' | 'prices' | 'level' | 'returned' | 'ordered' | 'origin'> = {},
): MarketResult {
  const visitor = 'order' in from ? from : null;
  const carts = visitor
    ? [...(visitor.carts ?? []), ...(visitor.boughtCarts ?? [])]
    : (from.carts ?? []);
  const people = from.people ?? [];
  const newcomers = visitor?.boughtPeople ?? [];
  return structuredClone({
    key: from.key,
    sold: visitor?.sold ?? {},
    bought: visitor?.bought ?? {},
    unsold: from.goods,
    horses: visitor ? [...visitor.horses, ...visitor.boughtHorses] : from.horses,
    ...(carts.length > 0 ? { carts } : {}),
    ...(people.length > 0 ? { people } : {}),
    ...(newcomers.length > 0 ? { newcomers } : {}),
    ...(visitor?.coinsPaid ? { coinsPaid: visitor.coinsPaid } : {}),
    ...(visitor?.coinsGot ? { coinsGot: visitor.coinsGot } : {}),
    ...((from.jewelleryG ?? 0) > 0 ? { jewelleryG: from.jewelleryG } : {}),
    ...extra,
    // ceny trhu v dnešním kurzu (gold.md – Mince 2,4 g, bod 3)
    ...(extra.prices ? { coinKg: MARKET.grainKgPerCoin } : {}),
  });
}

/**
 * Co ze zboží `goods` zbývá po obchodech `traded` (kopie, kladné položky) – co hostitel po nákupech
 * ještě shání, nebo co po prodejích ještě nabízí.
 */
function goodsLeft(goods: TradeGoods, traded: TradeGoods): TradeGoods {
  const left = positiveGoods(goods);
  for (const good of TRADE_GOODS) {
    const moved = traded[good] ?? 0;
    if (moved > 0 && left[good] !== undefined) takeFrom(left, good, moved);
  }
  return left;
}

/** Prvních `n` koní druhu `good` výpravy (mutuje – z jejích koní odejdou). */
function takeVisitorHorses(visitor: MarketVisitor, good: HorseGood, n: number): MarketHorse[] {
  const out: MarketHorse[] = [];
  visitor.horses = visitor.horses.filter((h) => {
    if (h.good !== good || out.length >= n) return true;
    out.push(h);
    return false;
  });
  return out;
}

/** První `n` skupin lidí druhu `good` výpravy (mutuje – z jejích lidí odejdou). */
function takeVisitorPeople(visitor: MarketVisitor, good: PeopleGood, n: number): MarketPerson[] {
  const out: MarketPerson[] = [];
  visitor.people = (visitor.people ?? []).filter((g) => {
    if (g.good !== good || out.length >= n) return true;
    out.push(g);
    return false;
  });
  return out;
}

/** Směr od hostitele k domovské vsi výpravy; neznámý u výpravy uložené před směrem cesty. */
function homeward(visitor: MarketVisitor): Direction8 | undefined {
  return visitor.firstStep ? OPPOSITE[visitor.firstStep] : undefined;
}

/** První `n` vozů druhu `good` výpravy (mutuje – z jejích vozů odejdou). */
function takeVisitorCarts(visitor: MarketVisitor, good: CartGood, n: number): MarketCart[] {
  const out: MarketCart[] = [];
  visitor.carts = (visitor.carts ?? []).filter((c) => {
    if (c.good !== good || out.length >= n) return true;
    out.push(c);
    return false;
  });
  return out;
}

/** Co hostitel v jedné fázi tržního dne prodal a koupil a kronika lidí, kteří se u něj usadili. */
interface PhaseTrades {
  sold: TradeGoods;
  bought: TradeGoods;
  events: ChronicleEvent[];
}

/**
 * Vyrovná obchody jedné fáze tržního dne (mutuje stav). Hostitel prodané zboží ubere (`addGood` se
 * zápornou hodnotou, koně `takeHorses` v pořadí prodeje) a koupené přidá (`addGood`, koně
 * `addHorses`). Výpravě ubude prodané z `goods` a koupené ze seznamu `wants` a přibude do `sold`
 * a `bought`. Koně jdou jako počty po druzích a kupující dostane tytéž kusy: od hostitele podle
 * `takeHorses`, od výpravy první kusy druhu z jejích koní. Vozy jdou stejně po kusech se stářím
 * prodejce (`takeCarts`, `addMarketCarts`). Lidé po skupinách (Rozhodnutí plánu 3, bod 10):
 * hostitel vybere prodané najednou (`leavingGroups` – rodiny, muži a ženy berou z týchž lidí)
 * a odejdou ve směru kupující výpravy do jejích `boughtPeople` (`sendPeople`, označené `fromHost`);
 * od výpravy jdou první skupiny druhu – k jiné výpravě do `boughtPeople`, hostitel je hned usadí
 * s novými id (`settlePeople`, odkud a z jakého směru přišli). Prodej zakázkového zboží výpravě vsi, která ho má
 * u hostitele v zakázce, zakázku zmenší, hotovou uzavře (`reduceOrder`). Vrací, co hostitel prodal
 * a koupil, a kroniku usazených lidí. `reserved` – otroci z nabídky vsi spočtení na začátku dne
 * (`offeredSlaveIds`, Rozhodnutí plánu 5, bod 8): prodaní otroci jsou z nich, jako rodina, muž ani
 * žena hostitele neodejdou.
 */
function settleTrades(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
  clearing: MarketClearing,
  reserved: ReadonlySet<number>,
): PhaseTrades {
  const host = partyTotals(clearing, HOST);
  const totals = new Map(visitors.map((v) => [v.key, partyTotals(clearing, v.key)]));
  // koně prodávajících po kusech – podle druhu, v pořadí, ve kterém je dostanou kupující
  const herds = new Map<string, MarketHorse[]>();
  const herdKey = (seller: string, good: HorseGood | CartGood | PeopleGood): string =>
    `${seller}|${good}`;
  for (const good of HORSE_GOODS) {
    const fromHost = takeHorses(state, good, host.sold[good] ?? 0, day);
    herds.set(
      herdKey(HOST, good),
      fromHost.map((horse) => ({ good, horse })),
    );
    for (const visitor of visitors) {
      const n = totals.get(visitor.key)?.sold[good] ?? 0;
      if (n > 0) herds.set(herdKey(visitor.key, good), takeVisitorHorses(visitor, good, n));
    }
  }
  const byKey = new Map(visitors.map((v) => [v.key, v]));
  const hostHorses: TradedHorse[] = [];
  for (const trade of clearing.trades) {
    if (!isHorseGood(trade.good)) continue;
    const moved = herds.get(herdKey(trade.seller, trade.good))?.splice(0, trade.amount) ?? [];
    if (trade.buyer === HOST) hostHorses.push(...moved.map((h) => h.horse));
    else byKey.get(trade.buyer)?.boughtHorses.push(...moved);
  }
  // vozy po kusech se stářím prodejce, stejně jako koně
  const cartHerds = new Map<string, MarketCart[]>();
  for (const good of CART_GOODS) {
    cartHerds.set(herdKey(HOST, good), takeCarts(state, good, host.sold[good] ?? 0));
    for (const visitor of visitors) {
      const n = totals.get(visitor.key)?.sold[good] ?? 0;
      if (n > 0) cartHerds.set(herdKey(visitor.key, good), takeVisitorCarts(visitor, good, n));
    }
  }
  const hostCarts: MarketCart[] = [];
  for (const trade of clearing.trades) {
    if (!isCartGood(trade.good)) continue;
    const moved = cartHerds.get(herdKey(trade.seller, trade.good))?.splice(0, trade.amount) ?? [];
    if (trade.buyer === HOST) hostCarts.push(...moved);
    else (byKey.get(trade.buyer)!.boughtCarts ??= []).push(...moved);
  }
  // lidé po skupinách – hostitel vybere prodané najednou, výpravy dají první skupiny druhu
  const hostPeople = leavingGroups(state, day, host.sold, reserved);
  const crowds = new Map<string, MarketPerson[]>();
  for (const good of PEOPLE_GOODS) {
    for (const visitor of visitors) {
      const n = totals.get(visitor.key)?.sold[good] ?? 0;
      if (n > 0) crowds.set(herdKey(visitor.key, good), takeVisitorPeople(visitor, good, n));
    }
  }
  const hostNewcomers: { from: MarketVisitor; groups: MarketPerson[] }[] = [];
  for (const trade of clearing.trades) {
    if (!isPeopleGood(trade.good)) continue;
    const buyer = trade.buyer === HOST ? undefined : byKey.get(trade.buyer);
    if (trade.seller === HOST) {
      // od hostitele odejdou k výpravě – ve směru její domovské vsi; `fromHost` – zanikne-li ves
      // kupujícího, vrátí se hostiteli s původními id (Rozhodnutí plánu 3, bod 13)
      const groups = hostPeople[trade.good].splice(0, trade.amount);
      if (buyer) {
        const sold = sendPeople(state, groups, homeward(buyer));
        (buyer.boughtPeople ??= []).push(...sold.map((g) => ({ ...g, fromHost: true as const })));
      }
      continue;
    }
    const moved = crowds.get(herdKey(trade.seller, trade.good))?.splice(0, trade.amount) ?? [];
    const seller = byKey.get(trade.seller);
    if (buyer) (buyer.boughtPeople ??= []).push(...moved);
    else if (seller) hostNewcomers.push({ from: seller, groups: moved });
  }
  // zakázky kupujících (Rozhodnutí plánu 3, bod 6): prodej vsi zakázku zmenší, hotovou uzavře
  for (const trade of clearing.trades) {
    const buyer = trade.seller === HOST ? byKey.get(trade.buyer) : undefined;
    if (buyer && isOrderGood(trade.good)) reduceOrder(state, buyer, trade.good, trade.amount);
  }
  // hostitel: napřed prodané pryč, pak koupené dovnitř (koně, vozy a lidé po kusech výš a níž)
  const byPiece = (good: TradeGood): boolean =>
    isHorseGood(good) || isCartGood(good) || isPeopleGood(good);
  for (const good of TRADE_GOODS) {
    const sold = host.sold[good] ?? 0;
    if (sold > 0 && !byPiece(good)) addGood(state, good, -sold, day);
  }
  for (const good of TRADE_GOODS) {
    const bought = host.bought[good] ?? 0;
    if (bought > 0 && !byPiece(good)) addGood(state, good, bought, day);
  }
  addHorses(state, hostHorses, day);
  addMarketCarts(state, hostCarts);
  // vůz bez záznamu stáří (výprava uložená dřív) přijde nový
  for (const good of CART_GOODS) {
    const missing = (host.bought[good] ?? 0) - hostCarts.filter((c) => c.good === good).length;
    if (missing > 0) addGood(state, good, missing, day);
  }
  // koupení lidé se u hostitele hned usadí – noví sousedé z vsi výpravy, ze směru její vsi
  const events = hostNewcomers.flatMap(({ from, groups }) => {
    const direction = homeward(from);
    return settlePeople(state, day, groups, {
      villageId: from.fromVillageId,
      villageName: from.fromName,
      ...(direction ? { direction } : {}),
    });
  });
  // výpravy: co zbývá prodat a koupit, co prodaly a koupily
  for (const visitor of visitors) {
    const { sold, bought } = totals.get(visitor.key) ?? { sold: {}, bought: {} };
    for (const good of TRADE_GOODS) {
      const out = sold[good] ?? 0;
      if (out > 0) {
        takeFrom(visitor.goods, good, out);
        addTo(visitor.sold, good, out);
      }
      const into = bought[good] ?? 0;
      if (into > 0) {
        addTo(visitor.bought, good, into);
        takeFrom(visitor.wants, good, into);
      }
    }
  }
  return { ...host, events };
}

/** Přičte mince k nákladu výpravy (mutuje; záporně ubere) – celé kusy, nula z nákladu zmizí. */
function addCoins(goods: TradeGoods, coins: number): void {
  const rest = (goods[COIN_GOOD] ?? 0) + coins;
  if (rest < 0) {
    throw new RangeError(`Výprava by měla ${rest} mincí – platba ${coins} převyšuje její měšec.`);
  }
  if (rest > 0) goods[COIN_GOOD] = rest;
  else delete goods[COIN_GOOD];
}

/**
 * Platby mincovní fáze v pořadí nákupů (mutuje stav i výpravy): celé mince z nákladu kupující
 * výpravy (`goods.coins`) do nákladu prodávající, hostitel je platí ze zásoby vsi a bere do ní
 * (`addGood`). Do `sold` a `bought` výpravy se nepíšou – domů jdou s nákladem (`unsold`) a podruhé
 * vzniknout nesmějí; součty pro kroniku návratu má výprava v `coinsPaid` a `coinsGot` (Rozhodnutí
 * plánu 4, bod 9). Cizímu kupci se nepřipíše ani neubere nic (markets.md – Měšec kupců bez dna, body
 * 1 a 5): jeho platbou mince vznikají, platbou jemu zanikají a mince ze starého stavu nechá ležet.
 * Vrací, kolik mincí hostitel zaplatil a získal.
 */
function payCoins(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
  payments: readonly CoinPayment[],
): { paid: number; earned: number } {
  const byKey = new Map(visitors.map((v) => [v.key, v]));
  const give = (key: string, coins: number): void => {
    const visitor = byKey.get(key);
    if (visitor?.merchant) return; // měšec bez dna – mince od kupce vznikly, kupci zanikly
    if (visitor) addCoins(visitor.goods, coins);
    else addGood(state, COIN_GOOD, coins, day);
  };
  const host = { paid: 0, earned: 0 };
  for (const { buyer, seller, coins } of payments) {
    give(buyer, -coins);
    give(seller, coins);
    const from = byKey.get(buyer);
    if (from && !from.merchant) from.coinsPaid = (from.coinsPaid ?? 0) + coins;
    const to = byKey.get(seller);
    if (to && !to.merchant) to.coinsGot = (to.coinsGot ?? 0) + coins;
    if (buyer === HOST) host.paid += coins;
    if (seller === HOST) host.earned += coins;
  }
  return host;
}

/**
 * Seznam návštěvníka, jak vstupuje do fáze tržního dne za ceny dne `prices`: výprava má celý seznam
 * (`visitor.wants`), cizí kupec svou poptávku za ceny dne (`merchantDemand` – markets.md, Měšec kupců
 * bez dna, bod 6: za drahé zboží chce méně, bez toho, co za průjezd už koupil) – stejnou pro cenu dne,
 * zápočet (strop V) i mincovní fázi, takže nekoupí víc, než za cenu dne chce. V den, kdy na trhu nikdo
 * otroky nenabízí (`slavesOnMarket` – hostitel podle `stance.offer.slaves`, výpravy z nákladu), kupec
 * otroky neshání (Rozhodnutí plánu 5, bod 7) – zápočet, cena dne, hladina ani mincovní fáze je
 * nepočítají a trh je bit po bitu jako po plánu 4.
 */
function merchantWants(
  visitor: MarketVisitor,
  slavesOnMarket: boolean,
  prices: MarketPrices,
): TradeGoods {
  if (!visitor.merchant) return visitor.wants;
  const wants = merchantDemand(visitor.wants, visitor.bought, prices);
  if (!slavesOnMarket) delete wants.slaves;
  return wants;
}

/**
 * Mincovní fáze tržního dne (mutuje stav; markets.md – Rozhodnutí plánu 4, body 2–4 a 15): co
 * výpravám po zápočtech na seznamu zbylo, koupí za mince, které vezou (`coinClearing` za ceny dne
 * a hladinu trhu), obchody se vyrovnají jako zápočet (`settleTrades`) a mince přejdou (`payCoins`).
 * Cizí kupec koupí, co na trhu je, nejvýš svou poptávku za ceny dne (`merchantWants` – za drahé zboží
 * méně, bez koupeného v zápočtu a v dřívějších dnech průjezdu; markets.md – Měšec kupců bez dna,
 * bod 6) – platí z měšce bez dna (`Infinity` jen ve straně fáze, ve stavu mince nemá; body 1 a 2).
 * Výprava prodává, co veze (`coinPhaseStock` – vesničané, kteří ještě shánějí výrobek dílny, si
 * nechají obilí a luštěniny na zakázku). Hostitel prodává, co mu z nabídky zbylo (`hostOffer`), a své
 * zlato – zásobu na setiny gramu po celých mincích, 2,4 g za minci (`hostGold`; zbytek pod minci
 * zůstane ve vsi); za mince koupí jedině zbroj, kterou si u kupců objednal hráč
 * (`armsBuyer`; o koupenou se objednávka zmenší – `reduceArmsOrder`), nic podle výpočtu potřeby
 * (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“) – po mincích ji kupcům doplatí zlatem vsi
 * po celých mincích, 2,4 g za minci (`goldPurse`). Zlato, které nabízí přespolní výprava, po zbroji
 * vymění za mince vsi – 2,4 g za minci, po celých mincích (`exchangesGold`) – kov za kov, ne útrata
 * (Martin 22. 11. 2026:
 * „Zlato lze měnt za mince s kýmkoliv, kdo ty mince má“; gold.md – Rozhodnutí plánu 6, bod 3).
 * Šperkař (gold.md – Pravidla 4): hostitel má kapacitu vsi (`jewelleryOf`), výpravy svou
 * (`MarketVisitor.jewelleryG`); spotřebovaná ubude ve vsi (`useJewellery`) i výpravě.
 * Lidí nabídne
 * nejvýš tolik skupin, kolik jich po zápočtech doopravdy odejde (`leavingGroups` – výběr je
 * postupný), aby kupující nezaplatil lidi, které nedostane. Hladinu posune `nextLevel`; hladina 1 ve
 * stavu není. Bez kupujícího s mincemi – výpravy nebo kupce, který něco shání (kupec jen to, co je na
 * trhu – jinak by fázi spouštěl každý den kupců naprázdno), vsi s objednanou zbrojí v den kupců, nebo
 * vsi s mincemi, které přespolní výprava nabízí zlato aspoň za minci (2,4 g) – se fáze nespustí (null,
 * stav se nezmění; den kupců bez jejich zboží vrátí prázdný výsledek jako dřívější fáze naprázdno);
 * mince v zásobě vsi ji samy nespustí, objednanou zbroj spustí
 * i samo zlato vsi. Kupci kupují i otroky – v den bez otroků (`slavesOnMarket`) jejich seznam otroky
 * nemá (`merchantWants`), takže fáze ani hladina (C a W) nejsou jiné než po plánu 4. Co hostitel
 * prodal a koupil, je i s mincemi. Rezervace otroků z nabídky (`reserved`) je ze začátku dne –
 * přepočet ze vsi zmenšené o lidi prodané v zápočtu by rezervoval jiné lidi (Rozhodnutí plánu 5,
 * bod 8).
 */
function coinPhase(
  state: VillageState,
  day: number,
  market: VillageMarket,
  visitors: readonly MarketVisitor[],
  hostOffer: TradeGoods,
  slavesOnMarket: boolean,
  reserved: ReadonlySet<number>,
): PhaseTrades | null {
  // výprava vesničanů mince jen vydělá, nekoupí nic (Martin 25. 11. 2026) – nemá seznam
  const guests = visitors.map((v): CoinParty => ({
    key: v.key,
    // kupec platí z měšce bez dna – mince ze starého stavu nepoužije (Měšec kupců bez dna, bod 5)
    coins: v.merchant ? Infinity : (v.goods[COIN_GOOD] ?? 0),
    // vesničané si obilí a luštěniny na zakázku nechají (`coinPhaseStock`, návrh Clauda)
    stock: coinPhaseStock(state, v),
    // výprava vesničanů mince jen vydělá, nekoupí nic (Martin 25. 11. 2026) – nemá seznam
    wants:
      v.by === 'villagers' ? {} : withoutCoins(merchantWants(v, slavesOnMarket, market.prices)),
    ...(v.merchant ? { merchant: true as const } : {}),
    ...(v.jewelleryG ? { jewelleryG: v.jewelleryG } : {}),
  }));
  // zlato vsi i se zlomkem – hostitel ho nabízí jen v mincovní fázi, po celých mincích (zbytek pod
  // minci zůstane ve vsi – Mince 2,4 g, bod 4)
  const hostGold = villageGoodStock(state, GOLD_GOOD, day);
  // kdo má mince a něco shání; kupec (měšec bez dna a poptávka po zlatě skoro vždy) fázi spustí, jen
  // když je na trhu něco z jeho poptávky – v nabídce hostitele (lidé nejvýš z nabídky), v jeho zlatě
  // nebo v nákladu ostatních stran; jinak by běžela každý den kupců naprázdno
  const ready = guests.filter((p) => p.coins > 0 && hasGoods(p.wants));
  const offers = [{ ...hostOffer, [GOLD_GOOD]: hostGold }, ...guests.map((p) => p.stock)];
  const onMarket = (p: CoinParty): boolean =>
    TRADE_GOODS.some(
      (good) =>
        (p.wants[good] ?? 0) > 0 &&
        offers.some((stock) => stock !== p.stock && (stock[good] ?? 0) > 0),
    );
  const spends = ready.some((p) => !p.merchant || onMarket(p));
  const buyer = armsBuyer(state, day, visitors);
  // přespolní výprava (ne kupec) nabízí zlato aspoň za minci (2,4 g) – hostitel ho vymění za mince
  // vsi (Rozhodnutí plánu 6, bod 3; Mince 2,4 g, bod 4); fáze se spustí i jen kvůli výměně
  const exchanges = guests.some((p) => !p.merchant && goldCoins(p.stock[GOLD_GOOD] ?? 0) >= 1);
  const hostCoins = villageGoodStock(state, COIN_GOOD, day);
  // objednanou zbroj ves zaplatí mincemi i zlatem po celých mincích (Rozhodnutí plánu 6, bod 3)
  const armsMeans = buyer ? buyer.coins + goldCoins(buyer.goldPurse ?? 0) : 0;
  if (!(armsMeans > 0) && !spends && !(exchanges && hostCoins > 0)) {
    // den kupců bez zboží z jejich poptávky: nikdo nic nekoupí – prázdný výsledek jako fáze naprázdno
    // dřív, ať součty dne v `marketDay` (`totalGoods`) vyjdou bit po bitu stejně
    return ready.length > 0 ? { sold: {}, bought: {}, events: [] } : null;
  }
  const leaving = leavingGroups(state, day, hostOffer, reserved);
  const people: TradeGoods = {};
  for (const good of PEOPLE_GOODS) people[good] = leaving[good].length;
  const level = market.level ?? 1;
  // kapacita šperkaře vsi – jedna pro prodej zlata kupcům i zbroj
  const jewelleryG = jewelleryOf(state);
  const { trades, payments, available, sought, jewelleryUsed } = coinClearing(
    [
      {
        key: HOST,
        stock: withoutCoins({ ...hostOffer, ...people, [GOLD_GOOD]: hostGold }),
        ...(buyer ?? { coins: 0, wants: {} }),
        ...(exchanges ? { coins: hostCoins, exchangesGold: true as const } : {}),
        ...(jewelleryG > 0 ? { jewelleryG } : {}),
      },
      ...guests,
    ],
    market.prices,
    level,
  );
  const { sold, bought, events } = settleTrades(
    state,
    day,
    visitors,
    { trades, offered: {}, wanted: {} },
    reserved,
  );
  const { paid, earned } = payCoins(state, day, visitors, payments);
  reduceArmsOrder(state, bought);
  // spotřebovaná kapacita šperkaře – ve vsi a ve výpravách (nula pole smaže)
  const holders = new Map(visitors.map((v) => [v.key, v]));
  for (const [key, grams] of Object.entries(jewelleryUsed ?? {})) {
    const holder = key === HOST ? state : holders.get(key);
    if (holder) useJewellery(holder, grams);
  }
  const next = nextLevel(level, available, sought);
  if (next === 1) delete market.level;
  else market.level = next;
  return {
    sold: { ...sold, ...(paid > 0 ? { [COIN_GOOD]: paid } : {}) },
    bought: { ...bought, ...(earned > 0 ? { [COIN_GOOD]: earned } : {}) },
    events,
  };
}

/**
 * Výpravy s posledním tržním dnem `day` (nebo dřívějším) odjedou (mutuje stav): výsledek se
 * zprávou o hostiteli, cenami trhu, hladinou (jen ≠ 1; Rozhodnutí plánu 4, bod 3) a zakázkami, které
 * hostitel zapsal (`recordOrders` – co hostitel po dnešním zápočtu ještě shání je `hostWants`), jde
 * do odchozí schránky k domovské vsi na den návratu – den po posledním tržním dni + dny cesty.
 * Výsledek s lidmi, s mincemi v měšci nebo se zlatem (neprodaným i koupeným – gold.md, Rozhodnutí
 * plánu 6, bod 9) nese i výpravu, jak ji hostitel viděl (`origin` – Rozhodnutí plánu 3, bod 13):
 * zanikne-li domovská ves, pošta s ním vrátí lidi a mince hostiteli (`stranded-people`) a kronika
 * hostitele ví, odkud přišly (preflight plánu 4, M14). Cizí kupec domov
 * nemá (Rozhodnutí plánu 4, bod 5) – odjede bez zakázek a bez pošty a jeho neprodaná zbroj
 * i koupené zboží odejdou ze světa, i koupení otroci (`boughtPeople` – jediný odchod lidí ze světa
 * kromě smrti, Rozhodnutí plánu 5, bod 7). Mince kupec nemá (měšec bez dna – Měšec kupců bez dna,
 * bod 1); které mu zbyly ze starého stavu, odjedou s ním (bod 5).
 */
function departVisitors(
  state: VillageState,
  market: VillageMarket,
  day: number,
  hostWants: TradeGoods,
): void {
  const leaving = market.visitors.filter((v) => v.lastDay <= day);
  if (leaving.length === 0) return;
  market.visitors = market.visitors.filter((v) => v.lastDay > day);
  const trips = leaving.filter((v) => !v.merchant);
  if (trips.length === 0) return;
  const report = villageReport(state, day);
  const outbox = (state.outbox ??= []);
  for (const visitor of trips) {
    const ordered = recordOrders(state, day, visitor, hostWants);
    const direction = homeward(visitor);
    const people = (visitor.people?.length ?? 0) + (visitor.boughtPeople?.length ?? 0);
    // kov domů – měšec a zlato v nákladu i koupené (zlato je mezi vsemi jako mince)
    const money =
      (visitor.goods[COIN_GOOD] ?? 0) +
      (visitor.goods[GOLD_GOOD] ?? 0) +
      (visitor.bought[GOLD_GOOD] ?? 0);
    outbox.push({
      villageId: visitor.fromVillageId,
      day: day + 1 + visitor.travelDays,
      ref: marketResultRef(visitor.key),
      body: {
        kind: 'market-result',
        result: marketResult(visitor, {
          report,
          prices: market.prices,
          ...(market.level !== undefined && market.level !== 1 ? { level: market.level } : {}),
          ...(hasGoods(ordered) ? { ordered } : {}),
          ...((people > 0 || money > 0) && direction !== undefined
            ? {
                origin: {
                  villageId: visitor.fromVillageId,
                  villageName: visitor.fromName,
                  direction,
                },
              }
            : {}),
        }),
      },
    });
  }
}

/**
 * Nabídka S a poptávka D tržního dne, podle kterých se posunou ceny (`nextPrices`): co ráno nabízejí
 * a shánějí hostitel (`stance`), jeho řemeslníci (`craftWants` – obilí za výrobky, jako by šlo
 * o jeden zápočet) a návštěvníci `visitors` (bez kováře souseda a doprovodu partnera), bez mincí.
 * O cizích kupcích platí (Rozhodnutí plánu 4, bod 3 – návrh Clauda):
 * - kupec shání svou poptávku za ceny dne toho, co je na trhu ke koupi (S > 0) – za výchozí cenu
 *   celý seznam, za dražší méně (`merchantWants`, `merchantDemand`; markets.md – Měšec kupců bez
 *   dna, body 3 a 6), takže cena se zastaví, kde kupci chtějí právě tolik, kolik je na trhu; bez
 *   nabídky cenou nehne;
 * - není-li na trhu žádná výprava, počítá se jen zboží, které kupci vezou nebo shánějí, a ostatní
 *   ceny stojí – průjezd kupců nezdraží, co hostitel shání, ani nezlevní, co nabízí a kupci nechtějí;
 * - v den bez otroků (`slavesOnMarket`) seznam kupce otroky nemá (`merchantWants` – Rozhodnutí
 *   plánu 5, bod 7).
 * S aspoň jednou výpravou se hýbou všechny ceny (Martin 23. 11. 2026: „Nechat bez stropu“).
 */
function priceTotals(
  stance: MarketStance,
  craftWants: TradeGoods,
  visitors: readonly MarketVisitor[],
  slavesOnMarket: boolean,
  prices: MarketPrices,
): { offered: TradeGoods; wanted: TradeGoods } {
  const offered = totalGoods([stance.offer, ...visitors.map((v) => withoutMoney(v.goods))]);
  const forSale = TRADE_GOODS.filter((good) => (offered[good] ?? 0) > 0);
  const lists = visitors.map((v) => merchantWants(v, slavesOnMarket, prices));
  const demand = visitors.map((v, i) => {
    const list = lists[i] ?? v.wants;
    return v.merchant ? onlyGoods(list, forSale) : withoutMoney(list);
  });
  const wanted = totalGoods([stance.wants, craftWants, ...demand]);
  if (visitors.some((v) => !v.merchant)) return { offered, wanted };
  const traded = TRADE_GOODS.filter((good) =>
    visitors.some((v, i) => (v.goods[good] ?? 0) > 0 || (lists[i]?.[good] ?? 0) > 0),
  );
  return { offered: onlyGoods(offered, traded), wanted: onlyGoods(wanted, traded) };
}

/**
 * Tržní den vsi `day` (mutuje stav; markets.md – Pravidla 3 a 5) ve dvou zápočtech a mincovní fázi za
 * ceny trhu, vše se stranami hostitel a výpravy v pořadí příjezdu:
 * 1. zápočet řemeslníků (Martin 24. 11. 2026: „Ano, řemeslník bere obilí vždy“) – řemeslníci
 *    hostitele prodávají výrobky dílen jen za obilí a luštěniny, nejvýš za hodnotu výrobků, které
 *    ten den prodají (`craftStance`, `craftParties`); bez nich se přeskočí;
 * 2. dnešní zápočet se zbytkem zboží – hostitel nabízí a shání podle výpočtu potřeby
 *    (`marketStance`, bez prodaného v 1.), výpravy, co jim zbylo;
 * 3. mincovní fáze (`coinPhase` – Rozhodnutí plánu 4, body 2 a 15) – výprava nebo cizí kupec, který
 *    veze mince, za ně koupí, co mu na seznamu zbylo; hostitel jen prodává (i své zlato), koupí
 *    jedině zbroj objednanou u kupců a zlato přespolních výprav vymění za své mince (Rozhodnutí
 *    plánu 6, bod 3). Bez mincí k útratě nebo k výměně se přeskočí.
 * Kupci kupují i otroky (Rozhodnutí plánu 5, bod 7); v den, kdy na trhu nikdo otroky nenabízí
 * (hostitel podle `stance.offer.slaves`, výpravy z nákladu), seznam kupců otroky nemá ve fázích ani
 * v ceně dne (`merchantWants`) – trh je bit po bitu jako po plánu 4. Otroky hostitel nabízí podle
 * nabídky hráče (`slavesForSale`, bod 8): rezervace `offeredSlaveIds` se spočte jednou na začátku dne
 * a platí pro nabídku i všechny fáze; o otroky prodané za den se nabídka zmenší
 * (`reduceSlavesForSale`).
 * Zápočty mince nevidí (`withoutCoins` – Rozhodnutí plánu 4, bod 1). Obchody se po každé fázi
 * vyrovnají (`settleTrades`), ceny se posunou podle původních nabídek a seznamů dne (`priceTotals`,
 * `nextPrices` – v den jen s kupci jen ceny jejich zboží), kupci na rušném trhu zůstanou další
 * den (`extendMerchants` – bod 5) a výpravy, kterým pobyt končí, odjedou s výsledkem a zakázkami,
 * kupci bez nich. Vrací zápis kroniky, prodala-li nebo koupila-li ves něco (všechny fáze dohromady,
 * i mince). Bez výprav a kupců na trhu nic – stav se nezmění. Kovář souseda (výprava se `service` –
 * Rozhodnutí plánu 3, bod 9) a doprovod partnera (`kin` – bod 11) neobchodují, jen v poslední den
 * odjedou; jsou-li na trhu jen oni, tržní den není (ceny stojí).
 */
export function marketDay(state: VillageState, day: number): ChronicleEvent[] {
  const market = state.market;
  if (!market || market.visitors.length === 0) return [];
  const visitors = market.visitors
    .filter((v) => !v.service && !v.kin)
    .sort((a, b) => a.order - b.order);
  if (visitors.length === 0) {
    departVisitors(state, market, day, {});
    return [];
  }
  const prices = market.prices;
  // otroci z nabídky vsi jednou z celé vsi – platí pro nabídku i všechny fáze dne (Rozhodnutí plánu 5,
  // bod 8); `stance.offer.slaves` je jejich počet, takže je vidí i `slavesOnMarket`
  const reserved = offeredSlaveIds(state, day);
  const stance = marketStance(state, day, reserved);
  const craft = craftStance(state, stance, visitors, prices);
  // nabízí dnes někdo otroky? Bez nich kupci otroky neshánějí ve všech fázích (`merchantWants`)
  const slavesOnMarket =
    (stance.offer.slaves ?? 0) > 0 || visitors.some((v) => (v.goods.slaves ?? 0) > 0);
  // nabídky a seznamy dne napřed – zápočty a mincovní fáze je mění
  const { offered, wanted } = priceTotals(
    stance,
    craft?.wants ?? {},
    visitors,
    slavesOnMarket,
    prices,
  );
  const first = craft
    ? settleTrades(
        state,
        day,
        visitors,
        clearMarket(craftParties(HOST, craft, visitors), prices),
        reserved,
      )
    : null;
  const clearing = clearMarket(
    [
      {
        key: HOST,
        offer: first ? goodsLeft(stance.offer, first.sold) : stance.offer,
        wants: stance.wants,
      },
      ...visitors.map((v) => ({
        key: v.key,
        offer: withoutMoney(v.goods),
        // strop V = min(nabídka, seznam) – kupec bez otroků v den, kdy je nikdo nenabízí
        wants: withoutMoney(merchantWants(v, slavesOnMarket, prices)),
      })),
    ],
    prices,
  );
  const second = settleTrades(state, day, visitors, clearing, reserved);
  const barter = first
    ? {
        sold: totalGoods([first.sold, second.sold]),
        bought: totalGoods([first.bought, second.bought]),
      }
    : second;
  // ještě za ceny dne – ceny trhu se posunou až po všech fázích
  const third = coinPhase(
    state,
    day,
    market,
    visitors,
    goodsLeft(stance.offer, barter.sold),
    slavesOnMarket,
    reserved,
  );
  market.prices = nextPrices(prices, offered, wanted);
  const host = third
    ? {
        sold: totalGoods([barter.sold, third.sold]),
        bought: totalGoods([barter.bought, third.bought]),
      }
    : barter;
  // o otroky prodané za den se nabídka zmenší, zbytek čeká na další trh (vzor `reduceArmsOrder`)
  reduceSlavesForSale(state, host.sold.slaves ?? 0);
  const chronicle: ChronicleEvent[] =
    hasGoods(host.sold) || hasGoods(host.bought)
      ? [{ day, kind: 'market-held', sold: host.sold, bought: host.bought }]
      : [];
  // lidé, které hostitel koupil, se usadili (kronika `newcomer` za obchodem)
  chronicle.push(...(first?.events ?? []), ...second.events, ...(third?.events ?? []));
  extendMerchants(market, day);
  departVisitors(state, market, day, goodsLeft(stance.wants, second.bought));
  return chronicle;
}
