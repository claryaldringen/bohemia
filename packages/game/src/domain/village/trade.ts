// Obchod se sousedy po zemské stezce (docs/design/trade.md – Obchod). Výměnou podle hodnot v kg
// obilí: soused bere s přirážkou 20 %, sháněné zboží platí o 20 % dráž, nabízené prodá o 20 %
// levněji; bilance hodnoty musí být pro souseda nezáporná. Zboží nesou nosiči po stezce (25 kg
// na člověka, dobytek se žene), cesta tam a zpět 2–6 dní podle délky stezky + 1 den za krajem
// mapy; práce nosičů jde ze společné práce vsi (jako stavba) a zboží dorazí, až se vrátí. Jedna
// výprava na souseda naráz. Obchoduje se jen zbožím, které má i ves (Martin 19. 10. 2026: „Nech jen
// společné suroviny, nezaváděj nové.“) – starší vsi o zboží zvenku přijdou (`withoutForeignGoods`).
// Čisté funkce bez I/O.
import { startingLivestock } from './livestock';
import { addLogs, woodLogs } from './wood';
import { TRADE_GOODS, neighbourOf, neighbourStock } from './neighbours';
import { TRADE, TRADE_GOOD_VALUES } from './rules';
import { builtTrail, trailTripDays } from './trail';
import type {
  ChronicleEvent,
  DietDay,
  Direction8,
  NeighbourStock,
  TradeExpedition,
  TradeGood,
  TradeGoods,
  VillageState,
  VillageTrade,
} from './types';

const EPSILON = 1e-9;

/** Kolik kg obilí soused dá za kus sháněného zboží – hodnota ÷ přirážka × příplatek za sháněné. */
export function sellPrice(good: TradeGood): number {
  return (TRADE_GOOD_VALUES[good].valueKg / (1 + TRADE.markup)) * (1 + TRADE.demandBonus);
}

/** Kolik kg obilí soused chce za kus nabízeného zboží – hodnota × přirážka × sleva za nabízené. */
export function buyPrice(good: TradeGood): number {
  return TRADE_GOOD_VALUES[good].valueKg * (1 + TRADE.markup) * (1 - TRADE.offerDiscount);
}

/**
 * Kolik zboží ves má k obchodu (celé kusy a kg): obilí, maso, sýr a luštěniny ze zásob, krávy
 * (chovný pár zůstane – TRADE.keepCows), celé klády z hromady a výrobky řemesel.
 */
export function villageGoodStock(state: VillageState, good: TradeGood): number {
  switch (good) {
    case 'grain':
      return Math.floor(state.storesKg);
    case 'meat':
      return Math.floor(state.meatKg ?? 0);
    case 'cheese':
      return Math.floor(state.cheeseKg ?? 0);
    case 'legumes':
      return Math.floor(state.legumesKg ?? 0);
    case 'cattle':
      return Math.max(0, Math.floor(state.livestock?.herds.cow ?? 0) - TRADE.keepCows);
    case 'logs':
      return Math.floor(woodLogs(state));
    case 'pottery':
      return Math.floor(state.crafts?.potteryKg ?? 0);
    case 'tools':
      return Math.floor(state.crafts?.toolsKg ?? 0);
    case 'charcoal':
      return Math.floor(state.crafts?.charcoalKg ?? 0);
  }
}

/** Přičte (záporně ubere) zboží ve vsi (mutuje stav). */
function addGood(state: VillageState, good: TradeGood, amount: number): void {
  switch (good) {
    case 'grain':
      state.storesKg = Math.max(0, state.storesKg + amount);
      return;
    case 'meat':
      state.meatKg = Math.max(0, (state.meatKg ?? 0) + amount);
      return;
    case 'cheese':
      state.cheeseKg = Math.max(0, (state.cheeseKg ?? 0) + amount);
      return;
    case 'legumes':
      state.legumesKg = Math.max(0, (state.legumesKg ?? 0) + amount);
      return;
    case 'cattle': {
      // starší ves bez stád dostane výchozí stádo (diet.md – jako první dopočítaný den)
      const livestock = (state.livestock ??= startingLivestock(state));
      livestock.herds.cow = Math.max(0, livestock.herds.cow + amount);
      return;
    }
    case 'logs':
      if (amount > 0) addLogs(state, amount);
      else state.woodLogs = Math.max(0, woodLogs(state) + amount);
      return;
    case 'pottery':
    case 'tools':
    case 'charcoal': {
      const crafts = (state.crafts ??= { charcoalKg: 0, toolsKg: 0, potteryKg: 0 });
      const key = good === 'pottery' ? 'potteryKg' : good === 'tools' ? 'toolsKg' : 'charcoalKg';
      crafts[key] = Math.max(0, crafts[key] + amount);
    }
  }
}

/** Zboží s kladným množstvím v pořadí TRADE_GOODS. */
function entries(goods: TradeGoods): [TradeGood, number][] {
  return TRADE_GOODS.flatMap((g) =>
    (goods[g] ?? 0) > 0 ? [[g, goods[g]!] as [TradeGood, number]] : [],
  );
}

/** Nosiči výpravy – víc z cesty tam a zpět, aspoň jeden (i pro prohlížeč – náhled v panelu). */
export function expeditionPorters(give: TradeGoods, get: TradeGoods): number {
  return Math.max(1, carriers(give), carriers(get));
}

/** Nosiči na jednu cestu: náklad po 25 kg na člověka, dobytek žene honák na 10 kusů. */
function carriers(goods: TradeGoods): number {
  let kg = 0;
  let heads = 0;
  for (const [good, amount] of entries(goods)) {
    if (good === 'cattle') heads += amount;
    else kg += amount * TRADE_GOOD_VALUES[good].carryKg;
  }
  return (
    Math.ceil(kg / TRADE.porterKg - EPSILON) + Math.ceil(heads / TRADE.headsPerDrover - EPSILON)
  );
}

/** Návrh výměny se sousedem ve směru – co ves dá a co dostane. */
export interface TradeOffer {
  direction: Direction8;
  give: TradeGoods;
  get: TradeGoods;
}

/** Ocenění výměny a výpravy: hodnoty pro souseda, nosiči, dny a práce, nebo proč nejde. */
export interface TradeQuote {
  /** Kolik kg obilí soused za dané zboží připíše a kolik chce za své. */
  credit: number;
  price: number;
  /** Bilance pro souseda (kg obilí) – musí být ≥ 0. */
  balance: number;
  /** Nosiči (víc z cesty tam a zpět, aspoň 1), dny cesty tam a zpět a práce (lidé × dny). */
  porters: number;
  days: number;
  manDays: number;
  /** Proč výprava nejde (česky), nebo null. */
  blocked: string | null;
}

export const NO_TRAIL = 'K tomuto sousedovi zatím nevede hotová stezka.';
export const EXPEDITION_AWAY = 'Výprava k tomuto sousedovi je ještě na cestě.';
export const NOTHING_TO_TRADE = 'Zatím se nic nevyměňuje.';
export const NOT_WANTED = 'Tohle soused nechce.';
export const NOT_OFFERED = 'Tohle soused nenabízí.';
export const OVER_DEMAND = 'Tolik soused letos nevezme.';
export const OVER_SUPPLY = 'Tolik soused letos nemá.';
export const OVER_STOCK = 'Tolik ves nemá.';
export const UNFAIR = 'Za to by soused prodělal – přidej, nebo uber.';

/** Výprava k sousedovi ve směru, která je na cestě; jinak null. */
export function expeditionTo(
  state: Pick<VillageState, 'trade'>,
  direction: Direction8,
): TradeExpedition | null {
  return state.trade?.expeditions.find((e) => e.direction === direction) ?? null;
}

/**
 * Ocení výměnu v den `day` a zkontroluje ji: hotová stezka, žádná výprava na cestě, soused dané
 * zboží shání (nejvýš zbytek roční poptávky) a nabízené má (nejvýš zbytek zásoby), ves má, co dává,
 * a bilance pro souseda ≥ 0. Nosiči a práce i u zamítnuté výměny (náhled v panelu).
 */
export function tradeQuote(state: VillageState, offer: TradeOffer, day: number): TradeQuote {
  const neighbour = neighbourOf(state.seed, offer.direction);
  const stock = neighbourStock(state, offer.direction, day);
  const give = entries(offer.give);
  const get = entries(offer.get);
  const credit = give.reduce((sum, [g, n]) => sum + n * sellPrice(g), 0);
  const price = get.reduce((sum, [g, n]) => sum + n * buyPrice(g), 0);
  const trail = builtTrail(state, offer.direction);
  const days = trail ? trailTripDays(trail.lengthM) : 0;
  const porters = expeditionPorters(offer.give, offer.get);
  const quote = {
    credit: round2(credit),
    price: round2(price),
    balance: round2(credit - price),
    porters,
    days,
    manDays: porters * days,
  };
  const blocked = ((): string | null => {
    if (!trail) return NO_TRAIL;
    if (expeditionTo(state, offer.direction)) return EXPEDITION_AWAY;
    if (give.length === 0 && get.length === 0) return NOTHING_TO_TRADE;
    for (const [g, n] of give) {
      if (!neighbour.demands.includes(g)) return NOT_WANTED;
      if (n > (stock.demand[g] ?? 0)) return OVER_DEMAND;
      if (n > villageGoodStock(state, g)) return OVER_STOCK;
    }
    for (const [g, n] of get) {
      if (!neighbour.offers.includes(g)) return NOT_OFFERED;
      if (n > (stock.supply[g] ?? 0)) return OVER_SUPPLY;
    }
    if (credit + EPSILON < price) return UNFAIR;
    return null;
  })();
  return { ...quote, blocked };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Obchod vsi (založí prázdný – mutuje stav). */
function tradeOf(state: VillageState): VillageTrade {
  return (state.trade ??= { neighbours: [], expeditions: [], nextId: 1 });
}

/** Uloží zbytek roku souseda (mutuje stav). */
function storeStock(state: VillageState, stock: NeighbourStock): void {
  const trade = tradeOf(state);
  trade.neighbours = [...trade.neighbours.filter((n) => n.direction !== stock.direction), stock];
}

/**
 * Výprava vyrazí (trade.md – Obchod): zboží, které ves dává, se odebere ze zásob a soused ho
 * odepíše ze své poptávky, nabízené ze své zásoby; nosiči jdou od zítřka ze společné práce vsi
 * (nosiči × dny). RangeError, když výměna nejde (`tradeQuote` – důvod česky). Konvence dne jako
 * u ostatních akcí.
 */
export function startExpedition(state: VillageState, day: number, offer: TradeOffer): VillageState {
  const quote = tradeQuote(state, offer, day);
  if (quote.blocked) throw new RangeError(quote.blocked);
  const trail = builtTrail(state, offer.direction)!;
  const next = structuredClone(state);
  const stock = structuredClone(neighbourStock(next, offer.direction, day));
  const give = Object.fromEntries(entries(offer.give)) as TradeGoods;
  const get = Object.fromEntries(entries(offer.get)) as TradeGoods;
  for (const [g, n] of entries(give)) {
    addGood(next, g, -n);
    stock.demand[g] = (stock.demand[g] ?? 0) - n;
  }
  for (const [g, n] of entries(get)) stock.supply[g] = (stock.supply[g] ?? 0) - n;
  storeStock(next, stock);
  const trade = tradeOf(next);
  trade.expeditions.push({
    id: trade.nextId++,
    direction: offer.direction,
    trailId: trail.id,
    startedDay: day,
    give,
    get,
    porters: quote.porters,
    days: quote.days,
    cost: quote.manDays,
    done: 0,
  });
  next.chronicle.push({ day, kind: 'trade-departed', direction: offer.direction, give });
  return next;
}

/**
 * Práce nosičů dne (mutuje stav – krok práce před stavbami): každá výprava si ze společné práce
 * vezme nejvýš tolik, kolik má nosičů (jdou všichni naráz), v pořadí výprav. Když společné práce
 * nestačí, cesta trvá déle (nosiči jdou na víc cest). Vrátí použitou práci a podíly po stezkách.
 */
export function workExpeditions(
  state: VillageState,
  common: number,
): { used: number; shares: { trailId: number; manDays: number }[] } {
  const shares: { trailId: number; manDays: number }[] = [];
  let left = common;
  for (const e of state.trade?.expeditions ?? []) {
    if (left <= EPSILON) break;
    const take = Math.min(left, e.porters, Math.max(0, e.cost - e.done));
    if (take <= 0) continue;
    e.done += take;
    left -= take;
    shares.push({ trailId: e.trailId, manDays: take });
  }
  return { used: common - left, shares };
}

/** Vrácené výpravy (mutuje stav): přinesené zboží do zásob vsi, kronika. */
export function finishExpeditions(state: VillageState, day: number): ChronicleEvent[] {
  const trade = state.trade;
  if (!trade || trade.expeditions.length === 0) return [];
  const events: ChronicleEvent[] = [];
  trade.expeditions = trade.expeditions.filter((e) => {
    if (e.done + EPSILON < e.cost) return true;
    for (const [g, n] of entries(e.get)) addGood(state, g, n);
    events.push({ day, kind: 'trade-returned', direction: e.direction, get: { ...e.get } });
    return false;
  });
  return events;
}

/** Zboží, které obchod zná – uložené vsi mohou mít v obchodu ještě zboží zvenku (sůl, med…). */
function isTradeGood(key: string): key is TradeGood {
  return (TRADE_GOODS as readonly string[]).includes(key);
}

/** Zboží obsahuje druh, který obchod nezná. */
function hasForeign(goods: TradeGoods): boolean {
  return Object.keys(goods).some((key) => !isTradeGood(key));
}

/** Jen zboží, které obchod zná (nový objekt). */
function knownGoods(goods: TradeGoods): TradeGoods {
  return Object.fromEntries(Object.entries(goods).filter(([key]) => isTradeGood(key)));
}

/** Druhy zboží jsou přesně `goods` (bez ohledu na pořadí). */
function sameGoods(stock: TradeGoods, goods: readonly TradeGood[]): boolean {
  const keys = Object.keys(stock);
  return keys.length === goods.length && goods.every((g) => g in stock);
}

/** Uložený zbytek roku souseda sedí na jeho povahu – nabídka i poptávka mají jeho druhy zboží. */
function fitsNeighbour(stock: NeighbourStock, seed: number): boolean {
  const neighbour = neighbourOf(seed, stock.direction);
  return sameGoods(stock.supply, neighbour.offers) && sameGoods(stock.demand, neighbour.demands);
}

/** Událost kroniky o výpravě se zbožím, které obchod nezná. */
function foreignTradeEvent(event: ChronicleEvent): boolean {
  return (
    (event.kind === 'trade-departed' && hasForeign(event.give)) ||
    (event.kind === 'trade-returned' && hasForeign(event.get))
  );
}

/**
 * Ves bez zboží zvenku (trade.md – Jen společné suroviny; Martin 19. 10. 2026: „Nech jen společné
 * suroviny, nezaváděj nové.“). Starší ves přijde o zásoby soli, železa, medu a kožešin
 * (`VillageState.goods`) a o podíl medu v posledním jídle; uložený zbytek roku souseda, který
 * nesedí na jeho dnešní povahu (soused nabízel zboží zvenku), se zahodí – soused má do 1. 11. plné
 * roční zásoby a poptávku. Výprava na cestě, která měla přinést zboží zvenku, se ruší celá: nosiči
 * přinesou zpět, co nesli (`get` = `give`), ves nic neztratí ani nezíská. Z kroniky výprav zboží
 * zvenku zmizí. Bez čeho převádět, vrátí tentýž objekt; idempotentní (jako `withKinship`).
 */
export function withoutForeignGoods(state: VillageState): VillageState {
  const legacy = state as VillageState & { goods?: unknown };
  const shares = state.diet?.shares as (DietDay['shares'] & { honey?: number }) | undefined;
  const trade = state.trade;
  const staleStocks = trade?.neighbours.some((n) => !fitsNeighbour(n, state.seed)) ?? false;
  const foreignExpeditions =
    trade?.expeditions.some((e) => hasForeign(e.give) || hasForeign(e.get)) ?? false;
  const foreignEvents = state.chronicle.some(foreignTradeEvent);
  if (
    legacy.goods === undefined &&
    shares?.honey === undefined &&
    !staleStocks &&
    !foreignExpeditions &&
    !foreignEvents
  ) {
    return state;
  }
  const next: VillageState & { goods?: unknown } = { ...state };
  delete next.goods;
  if (state.diet && shares?.honey !== undefined) {
    const { grain, meat, dairy, eggs, fruit, legumes } = shares;
    next.diet = {
      ...state.diet,
      shares: { grain, meat, dairy, eggs, fruit, ...(legumes !== undefined ? { legumes } : {}) },
    };
  }
  if (trade && (staleStocks || foreignExpeditions)) {
    next.trade = {
      ...trade,
      neighbours: trade.neighbours.filter((n) => fitsNeighbour(n, state.seed)),
      expeditions: trade.expeditions.map((e) =>
        hasForeign(e.give) || hasForeign(e.get)
          ? { ...e, give: knownGoods(e.give), get: knownGoods(hasForeign(e.get) ? e.give : e.get) }
          : e,
      ),
    };
  }
  if (foreignEvents) {
    next.chronicle = state.chronicle.map((event) => {
      if (event.kind === 'trade-departed') return { ...event, give: knownGoods(event.give) };
      if (event.kind === 'trade-returned') return { ...event, get: knownGoods(event.get) };
      return event;
    });
  }
  return next;
}
