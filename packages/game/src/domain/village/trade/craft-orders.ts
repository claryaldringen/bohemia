// Zakázky u řemeslníka a obilí za výrobky (markets.md – Rozhodnutí plánu 3, body 5 a 6; Martin
// 22. 11. 2026: „Řemeslníkovi je jedno, kdo mu platí za výrobky“; Martin 24. 11. 2026: „Ano,
// řemeslník bere obilí vždy“). Řemeslníci hostitele prodávají výrobky za obilí a luštěniny ve
// vlastním zápočtu napřed (`craftStance`, `craftParties`), výrobek, který výprava nekoupila, zapíše
// hostitel při jejím odjezdu jako zakázku (`recordOrders` – odchylka od neighbours.md, Pravidla 6:
// zápočet bez mincí nezná dluh ani platbu předem, platí se až při vyzvednutí), řemeslník vyrábí do
// vlastní potřeby a zakázek (`orderTargets`) a hotovou zakázku ohlásí zprávou `order-ready`
// (`fillOrders`). Hotové kusy jsou na prodej komukoli – kdo dřív zaplatí, ten má. Kupující si své
// zakázky pamatuje (`rememberOrders`, `markOrderReady`, `placedOrder`) – obě vsi vedou zakázku
// stejně. Mutuje stav jako kroky dne a rozhoduje jen ze stavu vsi, takže výsledek nezávisí na
// kouscích dopočtu.
import { ownCraftsmanWorks } from '../crafts/craft-buying';
import { MARKET } from '../rules';
import type {
  ChronicleEvent,
  CraftOrder,
  MarketParty,
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
import { COIN_GOOD, ORDER_CRAFT, ORDER_GOODS, TRADE_GOODS, onlyGoods, withoutCoins } from './goods';
import { priceOf } from './market-prices';
import { craftOffer } from './market-stance';
import { marketTravelDays } from './market-trip';

/** Tolerance proti chybám desetinných čísel (kg, kusy). */
const EPSILON = 1e-9;
/** Šum plovoucí čárky: zbytek zakázky do NOISE × původního množství je nula (jako na trhu). */
const NOISE = 1e-9;
/** Čím řemeslník bere platbu vždy, v tomto pořadí (Martin 24. 11. 2026). */
const CRAFT_PAY = ['grain', 'legumes'] as const;
/** Zboží kromě platby řemeslníkovi (`CRAFT_PAY`), v pořadí `TRADE_GOODS`. */
const BESIDES_CRAFT_PAY: readonly TradeGood[] = TRADE_GOODS.filter(
  (good) => !(CRAFT_PAY as readonly TradeGood[]).includes(good),
);

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
 * Zápočet řemeslníků – první zápočet tržního dne (Martin 24. 11. 2026: „Ano, řemeslník bere obilí
 * vždy“; Rozhodnutí plánu 3, bod 5): co v něm hostitel nabízí a shání. Nabízí výrobky dílen
 * `ORDER_GOODS` ze své nabídky (`stance.offer` – nad vlastní potřebu), jejichž řemeslník ve vsi
 * pracuje (`ownCraftsmanWorks`), a shání za ně obilí, pak luštěniny. Hodnota V = Σ min(nabídka, co
 * výpravy shánějí) × cena trhu; obilí za min(V, obilí výprav), luštěniny za zbytek V nejvýš do
 * luštěnin výprav – v kg za ceny trhu. Zápočet je vyrovnaný, takže hostitel obilí a luštěniny koupí
 * nejvýš za hodnotu výrobků, které ten den prodá, a za ně nic jiného. Null, když řemeslníci nemají
 * co prodat nebo výpravy nemají čím zaplatit. `stance` se nemění – v dnešním zápočtu hostitel shání
 * obilí jen podle výpočtu potřeby.
 */
export function craftStance(
  state: VillageState,
  stance: MarketStance,
  visitors: readonly MarketVisitor[],
  prices: MarketPrices,
): MarketStance | null {
  const offer: TradeGoods = {};
  let value = 0;
  for (const good of ORDER_GOODS) {
    const amount = stance.offer[good] ?? 0;
    if (!(amount > 0) || !ownCraftsmanWorks(state, ORDER_CRAFT[good])) continue;
    offer[good] = amount;
    const wanted = visitorsTotal(visitors, (v) => v.wants, good);
    value += Math.min(amount, wanted) * priceOf(prices, good);
  }
  const wants: TradeGoods = {};
  for (const good of CRAFT_PAY) {
    if (!(value > 0)) break;
    const price = priceOf(prices, good);
    const carried = visitorsTotal(visitors, (v) => v.goods, good);
    if (!(carried > 0)) continue;
    const affordable = value / price;
    wants[good] = Math.min(affordable, carried);
    value = carried >= affordable ? 0 : value - carried * price;
  }
  return CRAFT_PAY.some((good) => (wants[good] ?? 0) > 0) ? { offer, wants } : null;
}

/**
 * Strany zápočtu řemeslníků: hostitel pod klíčem `hostKey` s tím, co nabízí a shání (`craftStance`),
 * a výpravy v pořadí `visitors` (příjezdu) – každá nabízí jen obilí a luštěniny, které veze,
 * a shání jen výrobky z nabídky řemeslníků. Výprava si tak za obilí koupí jen výrobky dílen.
 */
export function craftParties(
  hostKey: string,
  craft: MarketStance,
  visitors: readonly MarketVisitor[],
): MarketParty[] {
  const products = ORDER_GOODS.filter((good) => (craft.offer[good] ?? 0) > 0);
  return [
    { key: hostKey, offer: craft.offer, wants: craft.wants },
    ...visitors.map((v) => ({
      key: v.key,
      offer: onlyGoods(v.goods, CRAFT_PAY),
      wants: onlyGoods(v.wants, products),
    })),
  ];
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
 * Vezme hostitel od výpravy `visitor` zakázku na výrobek `good` – pracuje jeho řemeslník a výprava
 * ho tu nevyzvedla hotový (`pickedUp`)? Platbu ověří až `recordOrders`.
 */
function takesOrder(state: VillageState, visitor: MarketVisitor, good: OrderGood): boolean {
  return ownCraftsmanWorks(state, ORDER_CRAFT[good]) && !(visitor.pickedUp ?? []).includes(good);
}

/**
 * Co výprava `visitor` prodává v mincovní fázi (markets.md – Rozhodnutí plánu 4, bod 4): náklad bez
 * mincí. Výprava vesničanů, která má na seznamu ještě výrobek dílny, na který hostitel zakázku vezme
 * (`takesOrder`), si obilí a luštěniny (`CRAFT_PAY`) nechá – zakázka má přednost před prodejem za
 * mince (návrh Clauda): mincemi vesničané platit nesmějí (Martin 25. 11. 2026: „Mince utrácí jen
 * vojvoda/správce“), takže by při odjezdu neměli čím zakázku zaplatit (`recordOrders`). Ostatní
 * zbytky (krávy, hřivny…) prodají za mince jako dosud; výprava hráče a správce prodá vše.
 */
export function coinPhaseStock(state: VillageState, visitor: MarketVisitor): TradeGoods {
  const stock = withoutCoins(visitor.goods);
  if (visitor.by !== 'villagers') return stock;
  const ordering = ORDER_GOODS.some(
    (good) => (visitor.wants[good] ?? 0) > 0 && takesOrder(state, visitor, good),
  );
  return ordering ? onlyGoods(stock, BESIDES_CRAFT_PAY) : stock;
}

/**
 * Zakázky výpravy, která odjíždí (mutuje stav – v `departVisitors` před výsledkem). Seznam výpravy
 * nahradí zakázky její vsi u hostitele – novější zakázka téže vsi na totéž zboží tu starou nahradí:
 * výrobek dílny (`ORDER_GOODS`), který má výprava ještě na seznamu a jehož řemeslník ve vsi
 * pracuje, hostitel zapíše jako zakázku, když výprava pořád veze obilí nebo luštěniny (řemeslník je
 * bere vždy), mince (Rozhodnutí plánu 4, bod 4) nebo něco, co hostitel shání (`hostWants`). Výrobek
 * ze seznamu, který se nezapíše (koupený, bez pracujícího řemeslníka, bez platby, vyzvednutá hotová
 * zakázka – `pickedUp`), starou zakázku té vsi smaže – kupující vede zakázku podle `ordered`
 * (`rememberOrders`), takže ji obě vsi vedou stejně. Vrací, co se zapsalo (`MarketResult.ordered`).
 */
export function recordOrders(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
  hostWants: TradeGoods,
): TradeGoods {
  const ordered: TradeGoods = {};
  const market = state.market;
  if (!market) return ordered;
  const carries = (good: TradeGood): boolean => (visitor.goods[good] ?? 0) > 0;
  const pays =
    CRAFT_PAY.some(carries) ||
    // mince utrácí jen vojvoda a správce (Martin 25. 11. 2026) – výprava vesničanů jimi neplatí
    (visitor.by !== 'villagers' && carries(COIN_GOOD)) ||
    TRADE_GOODS.some((g) => carries(g) && (hostWants[g] ?? 0) > 0);
  for (const good of ORDER_GOODS) {
    const amount = visitor.wants[good] ?? 0;
    // jen zboží ze seznamu výpravy – co ještě shání, nebo už koupila
    if (!(amount > 0) && !((visitor.bought[good] ?? 0) > 0)) continue;
    const orders = (market.orders ?? []).filter(
      (o) => o.villageId !== visitor.fromVillageId || o.good !== good,
    );
    if (amount > 0 && pays && takesOrder(state, visitor, good)) {
      orders.push({ villageId: visitor.fromVillageId, name: visitor.fromName, good, amount, day });
      ordered[good] = amount;
    }
    if (orders.length > 0) market.orders = orders;
    else delete market.orders;
  }
  return ordered;
}

/**
 * Hostitel prodal zakázkové zboží výpravě `visitor` (mutuje stav i výpravu – v `settleTrades`):
 * zakázka její vsi se o prodané zmenší, na nule se smaže (prázdný seznam zmizí celý). Vyzvednutí
 * hotové zakázky (`readyDay`) ji uzavře celou – i se zbytkem, který od ohlášení ubralo opotřebení –
 * a výprava zboží zapíše do `pickedUp`, takže ho při odjezdu znovu neobjedná (`recordOrders`; platí
 * i při pobytu přes víc dní). Kupující ji uzavře také – koupené bez `ordered` (`rememberOrders`).
 */
export function reduceOrder(
  state: VillageState,
  visitor: MarketVisitor,
  good: OrderGood,
  amount: number,
): void {
  const market = state.market;
  const order = market?.orders?.find(
    (o) => o.villageId === visitor.fromVillageId && o.good === good,
  );
  if (!market || !order) return;
  const rest = order.amount - amount;
  if (order.readyDay === undefined && rest > order.amount * NOISE) {
    order.amount = rest;
    return;
  }
  if (order.readyDay !== undefined && !(visitor.pickedUp ?? []).includes(good)) {
    (visitor.pickedUp ??= []).push(good);
  }
  const others = market.orders!.filter((o) => o !== order);
  if (others.length > 0) market.orders = others;
  else delete market.orders;
}

/** `ref` ohlášení hotové zakázky: `order:<hostitel>:<kupující>:<zboží>:<den zakázky>`. */
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
 * Zásoba nad vlastní potřebou (nabídka výrobků dílen `craftOffer` – bez zakázek, táž jako v nabídce
 * trhu) se rozdělí postupně podle dne zápisu, pak id vsi kupujícího; ohlášená zakázka si svůj díl
 * drží, dokud si ji kupující nevyzvedne. Pokrytá zakázka dostane `readyDay` a do odchozí schránky
 * jde `order-ready` na den `day + 1 + marketTravelDays(cells)` – posel, `cells` z okolí (kupující
 * mimo okolí 1). Bez okolí (`nearby.self`) ves neví, kdo je, a neohlašuje.
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
  const left = craftOffer(state, day);
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
 * Zakázky kupujícího z výsledku výpravy (mutuje stav – v `applyMarketResult`), vedené stejně jako
 * u hostitele (`recordOrders`): zboží, které hostitel zapsal (`result.ordered`), je `open` s jeho
 * množstvím – i když výprava část koupila; koupené bez `ordered` zakázku u té vsi uzavře (smaže –
 * výprava koupila, co chtěla, nebo vyzvedla hotovou zakázku, jejíž zbytek hostitel znovu
 * nezapisuje); zboží ze seznamu, které nekoupila ani neobjednala, je `refused`. Výprava, kterou
 * zaniklý hostitel vrátil (`returned`), nic neodmítla – zakázky u něj zanikly s ním a smažou se.
 * Vypršelé zakázky zmizí.
 */
export function rememberOrders(
  state: VillageState,
  day: number,
  trip: MarketTrip,
  result: MarketResult,
): void {
  const ordered = result.ordered ?? {};
  let orders = (state.orders ?? []).filter((o) => isLive(o.day, day));
  if (result.returned) orders = orders.filter((o) => o.villageId !== trip.villageId);
  for (const good of result.returned ? [] : ORDER_GOODS) {
    const wanted = trip.wants[good] ?? 0;
    if (!(wanted > 0)) continue;
    orders = orders.filter((o) => o.villageId !== trip.villageId || o.good !== good);
    const amount = ordered[good] ?? 0;
    if (!(amount > 0) && (result.bought[good] ?? 0) > 0) continue;
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

/** Živé zakázky kupujícího (nevypršelé – `MARKET.orderDays`) v pořadí zápisu, i odmítnutí. */
export function placedOrders(state: VillageState, day: number): PlacedOrder[] {
  return (state.orders ?? []).filter((o) => isLive(o.day, day));
}

/**
 * Živá zakázka kupujícího na zboží `good` – otevřená nebo hotová (odmítnutí zakázka není) u vsi,
 * kterou `at` vezme (bez `at` u kterékoli); první v pořadí zápisu, jinak null.
 */
export function placedOrder(
  state: VillageState,
  day: number,
  good: OrderGood,
  at: (villageId: string) => boolean = () => true,
): PlacedOrder | null {
  return (
    state.orders?.find(
      (o) => o.good === good && o.status !== 'refused' && isLive(o.day, day) && at(o.villageId),
    ) ?? null
  );
}

/** Živé hotové zakázky kupujícího (`ready`) v pořadí zápisu – vesničané pro ně jedou týž den. */
export function readyOrders(state: VillageState, day: number): PlacedOrder[] {
  return (state.orders ?? []).filter((o) => o.status === 'ready' && isLive(o.day, day));
}

/**
 * Nevzala ves `villageId` zakázku na `good` (živé `refused`)? Vesničané tam to zboží rok nehledají
 * (Rozhodnutí plánu 3, bod 6).
 */
export function orderRefused(
  state: VillageState,
  day: number,
  villageId: string,
  good: OrderGood,
): boolean {
  return (state.orders ?? []).some(
    (o) =>
      o.villageId === villageId && o.good === good && o.status === 'refused' && isLive(o.day, day),
  );
}
