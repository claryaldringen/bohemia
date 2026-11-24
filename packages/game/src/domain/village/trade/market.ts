// Trh ve vsi hostitele (markets.md – Pravidla 2, 3, 5 a 8; Rozhodnutí plánu 2, body 4–7): výprava
// přijde událostí schránky (`joinMarket`) a každý tržní den (`marketDay` – v pořadí dne hned po
// událostech schránky) se hostitelská ves a výpravy vyrovnají zápočtem (`clearMarket`) za ceny
// trhu. Výprava po posledním dni pobytu odjede: výsledek (`marketResult`) jde do odchozí schránky
// vsi (`VillageState.outbox`) k domovské vsi a padne na den jejího návratu. Trh počítá jen ze stavu
// hostitele a událostí schránky toho dne, takže výsledek nezávisí na kouscích dopočtu. Mutuje stav
// jako kroky dne.
import { MARKET } from '../rules';
import type {
  ChronicleEvent,
  CartGood,
  HorseGood,
  MarketArrival,
  MarketCart,
  MarketClearing,
  MarketHorse,
  MarketResult,
  MarketVisitor,
  TradeGood,
  TradeGoods,
  TradedHorse,
  VillageMarket,
  VillageNews,
  VillageState,
} from '../types';
import { CART_GOODS, HORSE_GOODS, TRADE_GOODS, isCartGood, isHorseGood } from './goods';
import { addHorses, takeHorses } from './horse-trade';
import { clearMarket, partyTotals } from './market-clearing';
import { nextPrices } from './market-prices';
import { marketStance } from './market-stance';
import { addGood, addMarketCarts, takeCarts } from './trade';
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
 * Zapamatuje si zprávu na pivo o jiné vsi (mutuje stav; markets.md – Pravidla 8): jedna na ves,
 * novější `report.day` vyhrává – při stejném dni pozdější zpráva. Uloží kopii.
 */
export function rememberNews(state: VillageState, news: VillageNews): void {
  const list = (state.news ??= []);
  const i = list.findIndex((n) => n.villageId === news.villageId);
  const old = list[i];
  if (old === undefined) list.push(structuredClone(news));
  else if (news.report.day >= old.report.day) list[i] = structuredClone(news);
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

/** Přičte k položce (mutuje). */
function addTo(goods: TradeGoods, good: TradeGood, amount: number): void {
  goods[good] = (goods[good] ?? 0) + amount;
}

/** Ubere z položky (mutuje); zbytek, který je jen šum plovoucí čárky, položku smaže. */
function takeFrom(goods: TradeGoods, good: TradeGood, amount: number): void {
  const had = goods[good] ?? 0;
  const rest = had - amount;
  if (rest > had * NOISE) goods[good] = rest;
  else delete goods[good];
}

/**
 * Výprava přijela na trh (mutuje stav – událost schránky `market-arrive`): trh vznikne, chybí-li,
 * výprava stojí na trhu v pořadí příjezdu do `lastDay` = den + `stayDays` − 1, poznámka
 * o obchodníkovi (posledních `MARKET.report.traders` – technický strop paměti vsi, ne pravidlo
 * hry) a zpráva o její vsi (`rememberNews`). Vrací zápis kroniky. Týž klíč podruhé (výprava na
 * trhu nebo její výsledek v odchozí schránce) nic neudělá. Příjezd se ukládá kopií. Počty koní ve
 * zboží jsou počty kusů v `horses` po druzích – kůň, který nepřišel, se neprodá.
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
  const market = (state.market ??= { prices: {}, visitors: [], nextOrder: 1, arrivals: [] });
  const horseCounts: TradeGoods = {};
  for (const good of HORSE_GOODS) {
    horseCounts[good] = arrival.horses.filter((h) => h.good === good).length;
  }
  const goods = positiveGoods({ ...arrival.goods, ...horseCounts });
  market.visitors.push({
    key: arrival.key,
    fromVillageId: arrival.fromVillageId,
    fromName: arrival.fromName,
    order: market.nextOrder++,
    arrivedDay: day,
    lastDay: day + arrival.stayDays - 1,
    travelDays: arrival.travelDays,
    goods,
    horses: structuredClone(arrival.horses),
    ...(arrival.carts?.length ? { carts: structuredClone(arrival.carts) } : {}),
    wants: positiveGoods(arrival.wants),
    sold: {},
    bought: {},
    boughtHorses: [],
  });
  market.arrivals.push({
    name: arrival.fromName,
    day,
    goods: TRADE_GOODS.filter((good) => (goods[good] ?? 0) > 0),
  });
  const excess = market.arrivals.length - MARKET.report.traders;
  if (excess > 0) market.arrivals.splice(0, excess);
  rememberNews(state, {
    villageId: arrival.fromVillageId,
    name: arrival.fromName,
    report: arrival.report,
  });
  return [{ day, kind: 'market-arrived', villageName: arrival.fromName, goods: { ...goods } }];
}

/**
 * Výsledek trhu pro domovskou ves výpravy – jediné místo, kde vzniká (odjezd v `marketDay`, zaniklý
 * hostitel). Návštěvník: co prodal a koupil, `unsold` = co mu zbylo, koně domů = neprodaní
 * a koupení. Nepoužitý příjezd: nic neprodal ani nekoupil, domů jde vše, co vezl. Kopie.
 */
export function marketResult(
  from: MarketVisitor | MarketArrival,
  extra: Pick<MarketResult, 'report' | 'prices' | 'returned'> = {},
): MarketResult {
  const visitor = 'order' in from ? from : null;
  const carts = visitor
    ? [...(visitor.carts ?? []), ...(visitor.boughtCarts ?? [])]
    : (from.carts ?? []);
  return structuredClone({
    key: from.key,
    sold: visitor?.sold ?? {},
    bought: visitor?.bought ?? {},
    unsold: from.goods,
    horses: visitor ? [...visitor.horses, ...visitor.boughtHorses] : from.horses,
    ...(carts.length > 0 ? { carts } : {}),
    ...extra,
  });
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

/**
 * Vyrovná obchody tržního dne (mutuje stav). Hostitel prodané zboží ubere (`addGood` se zápornou
 * hodnotou, koně `takeHorses` v pořadí prodeje) a koupené přidá (`addGood`, koně `addHorses`).
 * Výpravě ubude prodané z `goods` a koupené ze seznamu `wants` a přibude do `sold` a `bought`. Koně
 * jdou zápočtem jako počty po druzích a kupující dostane tytéž kusy: od hostitele podle
 * `takeHorses`, od výpravy první kusy druhu z jejích koní. Vozy jdou stejně po kusech se stářím
 * prodejce (`takeCarts`, `addMarketCarts`). Vrací, co hostitel prodal a koupil.
 */
function settleTrades(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
  clearing: MarketClearing,
): { sold: TradeGoods; bought: TradeGoods } {
  const host = partyTotals(clearing, HOST);
  const totals = new Map(visitors.map((v) => [v.key, partyTotals(clearing, v.key)]));
  // koně prodávajících po kusech – podle druhu, v pořadí, ve kterém je dostanou kupující
  const herds = new Map<string, MarketHorse[]>();
  const herdKey = (seller: string, good: HorseGood | CartGood): string => `${seller}|${good}`;
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
  // hostitel: napřed prodané pryč, pak koupené dovnitř
  for (const good of TRADE_GOODS) {
    const sold = host.sold[good] ?? 0;
    if (sold > 0 && !isHorseGood(good) && !isCartGood(good)) addGood(state, good, -sold, day);
  }
  for (const good of TRADE_GOODS) {
    const bought = host.bought[good] ?? 0;
    if (bought > 0 && !isHorseGood(good) && !isCartGood(good)) addGood(state, good, bought, day);
  }
  addHorses(state, hostHorses, day);
  addMarketCarts(state, hostCarts);
  // vůz bez záznamu stáří (výprava uložená dřív) přijde nový
  for (const good of CART_GOODS) {
    const missing = (host.bought[good] ?? 0) - hostCarts.filter((c) => c.good === good).length;
    if (missing > 0) addGood(state, good, missing, day);
  }
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
  return host;
}

/**
 * Výpravy s posledním tržním dnem `day` (nebo dřívějším) odjedou (mutuje stav): výsledek se
 * zprávou o hostiteli a cenami trhu jde do odchozí schránky k domovské vsi na den návratu – den po
 * posledním tržním dni + dny cesty.
 */
function departVisitors(state: VillageState, market: VillageMarket, day: number): void {
  const leaving = market.visitors.filter((v) => v.lastDay <= day);
  if (leaving.length === 0) return;
  const report = villageReport(state, day);
  const outbox = (state.outbox ??= []);
  for (const visitor of leaving) {
    outbox.push({
      villageId: visitor.fromVillageId,
      day: day + 1 + visitor.travelDays,
      ref: marketResultRef(visitor.key),
      body: {
        kind: 'market-result',
        result: marketResult(visitor, { report, prices: market.prices }),
      },
    });
  }
  market.visitors = market.visitors.filter((v) => v.lastDay > day);
}

/**
 * Tržní den vsi `day` (mutuje stav; markets.md – Pravidla 3 a 5): strany zápočtu jsou hostitel
 * (`marketStance` – přebytek nad vlastní potřebou) a výpravy v pořadí příjezdu, za ceny trhu.
 * Obchody se vyrovnají (`settleTrades`), ceny se posunou podle nabídky a poptávky dne
 * (`nextPrices`) a výpravy, kterým pobyt končí, odjedou s výsledkem. Vrací zápis kroniky, prodala-li
 * nebo koupila-li ves něco. Bez výprav na trhu nic – stav se nezmění.
 */
export function marketDay(state: VillageState, day: number): ChronicleEvent[] {
  const market = state.market;
  if (!market || market.visitors.length === 0) return [];
  const visitors = [...market.visitors].sort((a, b) => a.order - b.order);
  const stance = marketStance(state, day);
  const clearing = clearMarket(
    [
      { key: HOST, offer: stance.offer, wants: stance.wants },
      ...visitors.map((v) => ({ key: v.key, offer: v.goods, wants: v.wants })),
    ],
    market.prices,
  );
  const host = settleTrades(state, day, visitors, clearing);
  market.prices = nextPrices(market.prices, clearing.offered, clearing.wanted);
  const chronicle: ChronicleEvent[] =
    hasGoods(host.sold) || hasGoods(host.bought)
      ? [{ day, kind: 'market-held', sold: host.sold, bought: host.bought }]
      : [];
  departVisitors(state, market, day);
  return chronicle;
}
