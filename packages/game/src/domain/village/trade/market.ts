// Trh ve vsi hostitele (markets.md – Pravidla 2, 3, 5 a 8; Rozhodnutí plánu 2, body 4–7): výprava
// přijde událostí schránky (`joinMarket`) a každý tržní den (`marketDay` – v pořadí dne hned po
// událostech schránky) se hostitelská ves a výpravy vyrovnají zápočtem (`clearMarket`) za ceny
// trhu. Výprava po posledním dni pobytu odjede: výsledek (`marketResult`) jde do odchozí schránky
// vsi (`VillageState.outbox`) k domovské vsi a padne na den jejího návratu. Řemeslníci prodávají
// výrobky za obilí a luštěniny vždy, ve vlastním zápočtu před dnešním, a nekoupený výrobek
// hostitel zapíše jako zakázku (craft-orders.ts – Rozhodnutí plánu 3, body 5 a 6). Kovář souseda
// (výprava se službou kování) kuje hned po příjezdu a do zápočtu nevstupuje (livestock/smith-visit.ts
// – Rozhodnutí plánu 3, bod 9). Lidé jdou zápočtem jako kusy, ale po skupinách jako skuteční lidé:
// prodaní hostitelem odejdou k výpravě, koupení hostitelem se u něj hned usadí (market-people.ts –
// bod 10). Trh počítá jen ze stavu hostitele a událostí schránky toho dne, takže výsledek nezávisí
// na kouscích dopočtu. Mutuje stav jako kroky dne.
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
  MarketResult,
  MarketVisitor,
  PeopleGood,
  TradeGood,
  TradeGoods,
  TradedHorse,
  VillageMarket,
  VillageNews,
  VillageState,
} from '../types';
import { craftParties, craftStance, recordOrders, reduceOrder } from './craft-orders';
import {
  CART_GOODS,
  HORSE_GOODS,
  PEOPLE_GOODS,
  TRADE_GOODS,
  isCartGood,
  isHorseGood,
  isOrderGood,
  isPeopleGood,
} from './goods';
import { addHorses, takeHorses } from './horse-trade';
import { clearMarket, partyTotals, totalGoods } from './market-clearing';
import { leavingGroups, sendPeople, settlePeople } from './market-people';
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
  const market = (state.market ??= { prices: {}, visitors: [], nextOrder: 1, arrivals: [] });
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
 * hostitel). Návštěvník: co prodal a koupil, `unsold` = co mu zbylo, koně domů = neprodaní
 * a koupení, lidé – neprodaní vlastní (`people`) a koupení (`newcomers`). Nepoužitý příjezd: nic
 * neprodal ani nekoupil, domů jde vše, co vezl, i lidé. Kopie.
 */
export function marketResult(
  from: MarketVisitor | MarketArrival,
  extra: Pick<MarketResult, 'report' | 'prices' | 'returned' | 'ordered' | 'origin'> = {},
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
    ...extra,
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

/**
 * Vyrovná obchody tržního dne (mutuje stav). Hostitel prodané zboží ubere (`addGood` se zápornou
 * hodnotou, koně `takeHorses` v pořadí prodeje) a koupené přidá (`addGood`, koně `addHorses`).
 * Výpravě ubude prodané z `goods` a koupené ze seznamu `wants` a přibude do `sold` a `bought`. Koně
 * jdou zápočtem jako počty po druzích a kupující dostane tytéž kusy: od hostitele podle
 * `takeHorses`, od výpravy první kusy druhu z jejích koní. Vozy jdou stejně po kusech se stářím
 * prodejce (`takeCarts`, `addMarketCarts`). Lidé po skupinách (Rozhodnutí plánu 3, bod 10):
 * hostitel vybere prodané najednou (`leavingGroups` – rodiny, muži a ženy berou z týchž lidí)
 * a odejdou ve směru kupující výpravy do jejích `boughtPeople` (`sendPeople`, označené `fromHost`);
 * od výpravy jdou první skupiny druhu – k jiné výpravě do `boughtPeople`, hostitel je hned usadí
 * s novými id (`settlePeople`, odkud a z jakého směru přišli). Prodej zakázkového zboží výpravě vsi, která ho má
 * u hostitele v zakázce, zakázku zmenší, hotovou uzavře (`reduceOrder`). Vrací, co hostitel prodal
 * a koupil, a kroniku usazených lidí.
 */
function settleTrades(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
  clearing: MarketClearing,
): { sold: TradeGoods; bought: TradeGoods; events: ChronicleEvent[] } {
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
  const hostPeople = leavingGroups(state, day, host.sold);
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
      // kupce, vrátí se hostiteli s původními id (Rozhodnutí plánu 3, bod 13)
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

/**
 * Výpravy s posledním tržním dnem `day` (nebo dřívějším) odjedou (mutuje stav): výsledek se
 * zprávou o hostiteli, cenami trhu a zakázkami, které hostitel zapsal (`recordOrders` – co hostitel
 * po dnešním zápočtu ještě shání je `hostWants`), jde do odchozí schránky k domovské vsi na den
 * návratu – den po posledním tržním dni + dny cesty. Výsledek s lidmi nese i výpravu, jak ji
 * hostitel viděl (`origin` – Rozhodnutí plánu 3, bod 13): zanikne-li domovská ves, pošta s ním
 * vrátí lidi hostiteli (`stranded-people`).
 */
function departVisitors(
  state: VillageState,
  market: VillageMarket,
  day: number,
  hostWants: TradeGoods,
): void {
  const leaving = market.visitors.filter((v) => v.lastDay <= day);
  if (leaving.length === 0) return;
  const report = villageReport(state, day);
  const outbox = (state.outbox ??= []);
  for (const visitor of leaving) {
    const ordered = recordOrders(state, day, visitor, hostWants);
    const direction = homeward(visitor);
    const people = (visitor.people?.length ?? 0) + (visitor.boughtPeople?.length ?? 0);
    outbox.push({
      villageId: visitor.fromVillageId,
      day: day + 1 + visitor.travelDays,
      ref: marketResultRef(visitor.key),
      body: {
        kind: 'market-result',
        result: marketResult(visitor, {
          report,
          prices: market.prices,
          ...(hasGoods(ordered) ? { ordered } : {}),
          ...(people > 0 && direction !== undefined
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
  market.visitors = market.visitors.filter((v) => v.lastDay > day);
}

/**
 * Tržní den vsi `day` (mutuje stav; markets.md – Pravidla 3 a 5) ve dvou zápočtech za ceny trhu,
 * obou se stranami hostitel a výpravy v pořadí příjezdu:
 * 1. zápočet řemeslníků (Martin 24. 11. 2026: „Ano, řemeslník bere obilí vždy“) – řemeslníci
 *    hostitele prodávají výrobky dílen jen za obilí a luštěniny, nejvýš za hodnotu výrobků, které
 *    ten den prodají (`craftStance`, `craftParties`); bez nich se přeskočí;
 * 2. dnešní zápočet se zbytkem zboží – hostitel nabízí a shání podle výpočtu potřeby
 *    (`marketStance`, bez prodaného v 1.), výpravy, co jim zbylo.
 * Obchody se po každém vyrovnají (`settleTrades`), ceny se posunou podle původních nabídek
 * a seznamů dne (`nextPrices` – i s obilím za výrobky, jako by šlo o jeden zápočet) a výpravy, kterým
 * pobyt končí, odjedou s výsledkem a zakázkami. Vrací zápis kroniky, prodala-li nebo koupila-li ves
 * něco (oba zápočty dohromady). Bez výprav na trhu nic – stav se nezmění. Kovář souseda (výprava se
 * `service` – Rozhodnutí plánu 3, bod 9) a doprovod partnera (`kin` – bod 11) do zápočtu nevstupují,
 * jen v poslední den odjedou; jsou-li na trhu jen oni, tržní den není (ceny stojí).
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
  const stance = marketStance(state, day);
  const craft = craftStance(state, stance, visitors, prices);
  // nabídky a seznamy dne napřed – zápočty je mění
  const offered = totalGoods([stance.offer, ...visitors.map((v) => v.goods)]);
  const wanted = totalGoods([stance.wants, craft?.wants ?? {}, ...visitors.map((v) => v.wants)]);
  const first = craft
    ? settleTrades(state, day, visitors, clearMarket(craftParties(HOST, craft, visitors), prices))
    : null;
  const clearing = clearMarket(
    [
      {
        key: HOST,
        offer: first ? goodsLeft(stance.offer, first.sold) : stance.offer,
        wants: stance.wants,
      },
      ...visitors.map((v) => ({ key: v.key, offer: v.goods, wants: v.wants })),
    ],
    prices,
  );
  const second = settleTrades(state, day, visitors, clearing);
  market.prices = nextPrices(prices, offered, wanted);
  const host = first
    ? {
        sold: totalGoods([first.sold, second.sold]),
        bought: totalGoods([first.bought, second.bought]),
      }
    : second;
  const chronicle: ChronicleEvent[] =
    hasGoods(host.sold) || hasGoods(host.bought)
      ? [{ day, kind: 'market-held', sold: host.sold, bought: host.bought }]
      : [];
  // lidé, které hostitel koupil, se usadili (kronika `newcomer` za obchodem)
  chronicle.push(...(first?.events ?? []), ...second.events);
  departVisitors(state, market, day, goodsLeft(stance.wants, second.bought));
  return chronicle;
}
