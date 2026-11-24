// Zakázky u řemeslníka a obilí za výrobky (markets.md – Rozhodnutí plánu 3, body 5 a 6; Martin
// 22. 11. 2026: „Řemeslníkovi je jedno, kdo mu platí za výrobky“; Martin 24. 11. 2026: „Ano,
// řemeslník bere obilí vždy“). Hostitel s pracujícím řemeslníkem shání za jeho výrobky obilí
// a luštěniny (`craftPayWants`), výrobek, který výprava nekoupila, zapíše při jejím odjezdu jako
// zakázku (`recordOrders` – odchylka od neighbours.md, Pravidla 6: zápočet bez mincí nezná dluh
// ani platbu předem, platí se až při vyzvednutí), řemeslník vyrábí do vlastní potřeby a zakázek
// (`orderTargets`) a hotovou zakázku ohlásí zprávou `order-ready` (`fillOrders`). Hotové kusy jsou
// na prodej komukoli – kdo dřív zaplatí, ten má. Kupující si své zakázky pamatuje
// (`rememberOrders`, `markOrderReady`, `placedOrder`). Mutuje stav jako kroky dne a rozhoduje jen
// ze stavu vsi, takže výsledek nezávisí na kouscích dopočtu.
import { ownCraftsmanWorks } from '../crafts/craft-buying';
import { MARKET } from '../rules';
import type {
  ChronicleEvent,
  CraftOrder,
  MarketPrices,
  MarketResult,
  MarketStance,
  MarketTrip,
  MarketVisitor,
  OrderGood,
  OrderReady,
  PlacedOrder,
  TradeGood,
  TradeGoods,
  VillageState,
} from '../types';
import { ORDER_CRAFT, ORDER_GOODS, TRADE_GOODS } from './goods';
import { priceOf } from './market-prices';
import { marketStance } from './market-stance';
import { marketTravelDays } from './market-trip';

/** Tolerance proti chybám desetinných čísel (kg, kusy). */
const EPSILON = 1e-9;
/** Šum plovoucí čárky: zbytek zakázky do NOISE × původního množství je nula (jako na trhu). */
const NOISE = 1e-9;
/** Čím řemeslník bere platbu vždy, v tomto pořadí (Martin 24. 11. 2026). */
const CRAFT_PAY = ['grain', 'legumes'] as const;

/** Je zakázka zapsaná v den `orderDay` v den `day` živá – nevypršela (`MARKET.orderDays`)? */
function isLive(orderDay: number, day: number): boolean {
  return day - orderDay <= MARKET.orderDays;
}

/** Součet zboží `good` přes výpravy na trhu (`pick` – co vezou, nebo co shánějí). */
function visitorsTotal(
  visitors: readonly MarketVisitor[],
  pick: (v: MarketVisitor) => TradeGoods,
  good: TradeGood,
): number {
  return visitors.reduce((sum, v) => sum + (pick(v)[good] ?? 0), 0);
}

/**
 * Řemeslník bere obilí vždy (Martin 24. 11. 2026; mutuje `stance.wants`, volá marketDay před
 * zápočtem): hostitel shání navíc obilí, pak luštěniny nejvýš za hodnotu výrobků svých pracujících
 * dílen, které ten den nabízí a výpravy shánějí.
 *
 * Hodnota V = Σ přes výrobky `ORDER_GOODS`, jejichž řemeslník ve vsi pracuje (`ownCraftsmanWorks`),
 * min(nabídka hostitele, co výpravy shánějí) × cena trhu. Obilí za min(V, obilí výprav), luštěniny
 * za zbytek V nejvýš do luštěnin výprav – v kg za ceny trhu, přičtené k tomu, co hostitel shání
 * sám. Bez takových výrobků nic. Zápočet je vyrovnaný, takže hostitel obilí nekoupí víc, než kolik
 * za výrobky utrží.
 */
export function craftPayWants(
  state: VillageState,
  day: number,
  stance: MarketStance,
  visitors: readonly MarketVisitor[],
  prices: MarketPrices,
): void {
  let value = 0;
  for (const good of ORDER_GOODS) {
    const offer = stance.offer[good] ?? 0;
    if (!(offer > 0) || !ownCraftsmanWorks(state, ORDER_CRAFT[good])) continue;
    const wanted = visitorsTotal(visitors, (v) => v.wants, good);
    value += Math.min(offer, wanted) * priceOf(prices, good);
  }
  for (const good of CRAFT_PAY) {
    if (!(value > 0)) return;
    const price = priceOf(prices, good);
    const carried = visitorsTotal(visitors, (v) => v.goods, good);
    if (!(carried > 0)) continue;
    const affordable = value / price;
    const kg = Math.min(affordable, carried);
    stance.wants[good] = (stance.wants[good] ?? 0) + kg;
    value = carried >= affordable ? 0 : value - carried * price;
  }
}

/** Živé zakázky hostitele v den `day` (bez vypršelých – `MARKET.orderDays`), v pořadí zápisu. */
export function liveOrders(state: VillageState, day: number): CraftOrder[] {
  return (state.market?.orders ?? []).filter((o) => isLive(o.day, day));
}

/**
 * Kolik výrobků navíc řemeslníci vsi drží na zakázky (součty živých zakázek po zboží – i ohlášených,
 * dokud si je kupující nevyzvedne). Řemeslník vyrábí do vlastní potřeby plus tyto zakázky
 * (Rozhodnutí plánu 3, bod 6); bez zakázek nuly.
 */
export function orderTargets(state: VillageState, day: number): Record<OrderGood, number> {
  const targets: Record<OrderGood, number> = {
    tools: 0,
    pottery: 0,
    woodTools: 0,
    ironBars: 0,
    twoWheelCarts: 0,
    fourWheelCarts: 0,
  };
  for (const order of state.market?.orders ?? []) {
    if (isLive(order.day, day)) targets[order.good] += order.amount;
  }
  return targets;
}

/**
 * Zakázky výpravy, která odjíždí (mutuje stav – v `departVisitors` před výsledkem): výrobek dílny
 * (`ORDER_GOODS`), který má výprava ještě na seznamu a jehož řemeslník ve vsi pracuje, hostitel
 * zapíše jako zakázku – když výprava pořád veze obilí nebo luštěniny (řemeslník je bere vždy) nebo
 * něco, co hostitel shání (`hostWants`). Novější zakázka téže vsi na totéž zboží tu starou
 * nahradí. Vrací, co se zapsalo (`MarketResult.ordered`).
 */
export function recordOrders(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
  hostWants: TradeGoods,
): TradeGoods {
  const ordered: TradeGoods = {};
  const market = state.market;
  const carries = (good: TradeGood): boolean => (visitor.goods[good] ?? 0) > 0;
  const pays =
    CRAFT_PAY.some(carries) || TRADE_GOODS.some((g) => carries(g) && (hostWants[g] ?? 0) > 0);
  if (!market || !pays) return ordered;
  for (const good of ORDER_GOODS) {
    const amount = visitor.wants[good] ?? 0;
    if (!(amount > 0) || !ownCraftsmanWorks(state, ORDER_CRAFT[good])) continue;
    const others = (market.orders ?? []).filter(
      (o) => o.villageId !== visitor.fromVillageId || o.good !== good,
    );
    others.push({ villageId: visitor.fromVillageId, name: visitor.fromName, good, amount, day });
    market.orders = others;
    ordered[good] = amount;
  }
  return ordered;
}

/**
 * Hostitel prodal zakázkové zboží výpravě vsi `villageId` (mutuje stav – v `settleTrades`):
 * zakázka té vsi se o prodané zmenší, na nule se smaže (prázdný seznam zmizí celý).
 */
export function reduceOrder(
  state: VillageState,
  villageId: string,
  good: OrderGood,
  amount: number,
): void {
  const market = state.market;
  const order = market?.orders?.find((o) => o.villageId === villageId && o.good === good);
  if (!market || !order) return;
  const rest = order.amount - amount;
  if (rest > order.amount * NOISE) {
    order.amount = rest;
    return;
  }
  const others = market.orders!.filter((o) => o !== order);
  if (others.length > 0) market.orders = others;
  else delete market.orders;
}

/** `ref` ohlášení hotové zakázky: `order:<hostitel>:<kupec>:<zboží>:<den zakázky>`. */
function orderReadyRef(host: string, order: CraftOrder): string {
  return `order:${host}:${order.villageId}:${order.good}:${order.day}`;
}

/** Pořadí zakázek: podle dne zápisu, pak id vsi kupujícího. */
function byDayAndVillage(a: CraftOrder, b: CraftOrder): number {
  if (a.day !== b.day) return a.day - b.day;
  return a.villageId < b.villageId ? -1 : a.villageId > b.villageId ? 1 : 0;
}

/**
 * Hotové zakázky (mutuje stav – po práci dne, před opotřebením): vypršelé zakázky zmizí ze stavu.
 * Zásoba nad vlastní potřebou (nabídka `marketStance` – bez zakázek) se rozdělí postupně podle dne
 * zápisu, pak id vsi kupujícího; ohlášená zakázka si svůj díl drží, dokud si ji kupující
 * nevyzvedne. Pokrytá zakázka dostane `readyDay` a do odchozí schránky jde `order-ready` na den
 * `day + 1 + marketTravelDays(cells)` – posel, `cells` z okolí (kupující mimo okolí 1). Bez okolí
 * (`nearby.self`) ves neví, kdo je, a neohlašuje.
 */
export function fillOrders(state: VillageState, day: number): void {
  const market = state.market;
  if (!market?.orders) return;
  const live = liveOrders(state, day);
  if (live.length === 0) {
    delete market.orders;
    return;
  }
  if (live.length < market.orders.length) market.orders = live;
  const nearby = state.nearby;
  if (!nearby || live.every((o) => o.readyDay !== undefined)) return;
  const left: TradeGoods = { ...marketStance(state, day).offer };
  for (const order of [...live].sort(byDayAndVillage)) {
    const have = left[order.good] ?? 0;
    left[order.good] = Math.max(0, have - order.amount);
    if (order.readyDay !== undefined || have + EPSILON < order.amount) continue;
    order.readyDay = day;
    const cells = nearby.villages.find((v) => v.villageId === order.villageId)?.cells ?? 1;
    (state.outbox ??= []).push({
      villageId: order.villageId,
      day: day + 1 + marketTravelDays(cells),
      ref: orderReadyRef(nearby.self.villageId, order),
      body: {
        kind: 'order-ready',
        ready: {
          villageId: nearby.self.villageId,
          name: nearby.self.name,
          good: order.good,
          amount: order.amount,
        },
      },
    });
  }
}

/**
 * Zakázky kupujícího z výsledku výpravy (mutuje stav – v `applyMarketResult`): zboží, které
 * hostitel zapsal (`result.ordered`), je `open`; zboží ze seznamu výpravy, které nekoupila ani
 * neobjednala, `refused`; koupené zakázku u té vsi uzavře (smaže) – i když hostitel zapsal zbytek
 * (návrh Clauda: zbytek po opotřebení zásoby od ohlášení by jinak posílal výpravy pro gramy).
 * Výprava, kterou zaniklý hostitel vrátil (`returned`), nic neodmítla. Vypršelé zakázky zmizí.
 */
export function rememberOrders(
  state: VillageState,
  day: number,
  trip: MarketTrip,
  result: MarketResult,
): void {
  if (result.returned) return;
  const ordered = result.ordered ?? {};
  let orders = (state.orders ?? []).filter((o) => isLive(o.day, day));
  for (const good of ORDER_GOODS) {
    const wanted = trip.wants[good] ?? 0;
    if (!(wanted > 0)) continue;
    orders = orders.filter((o) => o.villageId !== trip.villageId || o.good !== good);
    if ((result.bought[good] ?? 0) > 0) continue;
    const amount = ordered[good] ?? 0;
    orders.push({
      villageId: trip.villageId,
      name: trip.name,
      good,
      amount: amount > 0 ? amount : wanted,
      day,
      status: amount > 0 ? 'open' : 'refused',
    });
  }
  if (orders.length > 0) state.orders = orders;
  else delete state.orders;
}

/**
 * Hostitel ohlásil hotovou zakázku (mutuje stav – událost schránky `order-ready`): otevřená
 * zakázka u té vsi na to zboží je `ready` (s množstvím z ohlášení) a do kroniky jde
 * `order-ready`. Bez otevřené zakázky (vyzvednutá, odmítnutá, vypršelá) nic.
 */
export function markOrderReady(
  state: VillageState,
  day: number,
  ready: OrderReady,
): ChronicleEvent[] {
  const order = state.orders?.find(
    (o) =>
      o.villageId === ready.villageId &&
      o.good === ready.good &&
      o.status === 'open' &&
      isLive(o.day, day),
  );
  if (!order) return [];
  order.status = 'ready';
  order.amount = ready.amount;
  return [
    {
      day,
      kind: 'order-ready',
      villageName: ready.name,
      villageId: ready.villageId,
      good: ready.good,
    },
  ];
}

/**
 * Živá zakázka kupujícího na zboží `good` – otevřená nebo hotová (odmítnutí zakázka není); první
 * v pořadí zápisu, jinak null.
 */
export function placedOrder(state: VillageState, day: number, good: OrderGood): PlacedOrder | null {
  return (
    state.orders?.find((o) => o.good === good && o.status !== 'refused' && isLive(o.day, day)) ??
    null
  );
}
