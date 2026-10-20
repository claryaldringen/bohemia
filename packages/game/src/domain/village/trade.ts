// Obchod se sousedy po zemské stezce (docs/design/trade.md – Obchod). Výměnou podle hodnot v kg
// obilí: soused bere s přirážkou 20 %, sháněné zboží platí o 20 % dráž, nabízené prodá o 20 %
// levněji; bilance hodnoty musí být pro souseda nezáporná. Zboží nesou nosiči po stezce (25 kg
// na člověka, dobytek se žene), cesta tam a zpět 2–6 dní podle délky stezky + 1 den za krajem
// mapy; práce nosičů jde ze společné práce vsi (jako stavba) a zboží dorazí, až se vrátí. Jedna
// výprava na souseda naráz. Obchoduje se jen zbožím, které má i ves (Martin 19. 10. 2026: „Nech jen
// společné suroviny, nezaváděj nové.“) – starší vsi o zboží zvenku přijdou (`withoutForeignGoods`).
// Se sousedem jdou vyměnit i lidé – rodiny a svobodní dospělí (trade.md – Výměna lidí,
// `people-trade.ts`): odejdou hned s výpravou, lidé od souseda přijdou s jejím návratem.
// Čisté funkce bez I/O.
import type { Landscape } from '../landscape';
import { tradeCarts, trailCartPassable } from './carts';
import { charcoalStockKg, takeCharcoal } from './charcoal';
import { addExpeditionDemand } from './draft';
import { removePeople } from './kinship';
import { ageGroup } from './people';
import { startingLivestock } from './livestock';
import {
  NO_PEOPLE,
  emigrantGroups,
  emigrantList,
  neighbourFamilyValue,
  newcomerProfiles,
  peopleCount,
  settleNewcomers,
  tradePeopleCount,
  type Emigrants,
} from './people-trade';
import { addLogs, woodLogs } from './wood';
import { TRADE_GOODS, neighbourOf, neighbourStock } from './neighbours';
import { CARTS, CART_DEMAND, PEOPLE_TRADE, TRADE, TRADE_GOOD_VALUES } from './rules';
import { builtTrail, trailTripDays } from './trail';
import type {
  CartKind,
  ChronicleEvent,
  ComingPeople,
  DietDay,
  Direction8,
  NeighbourPeople,
  NeighbourStock,
  Person,
  TradeExpedition,
  TradeGood,
  TradeGoods,
  TradePeople,
  VillageState,
  VillageTrade,
} from './types';

const EPSILON = 1e-9;

/** Kolik kg obilí soused připíše za sháněné v hodnotě `valueKg` – ÷ přirážka × příplatek. */
export function sellValue(valueKg: number): number {
  return (valueKg / (1 + TRADE.markup)) * (1 + TRADE.demandBonus);
}

/** Kolik kg obilí soused chce za nabízené v hodnotě `valueKg` – × přirážka × sleva. */
export function buyValue(valueKg: number): number {
  return valueKg * (1 + TRADE.markup) * (1 - TRADE.offerDiscount);
}

/** Kolik kg obilí soused dá za kus sháněného zboží – hodnota ÷ přirážka × příplatek za sháněné. */
export function sellPrice(good: TradeGood): number {
  return sellValue(TRADE_GOOD_VALUES[good].valueKg);
}

/** Kolik kg obilí soused chce za kus nabízeného zboží – hodnota × přirážka × sleva za nabízené. */
export function buyPrice(good: TradeGood): number {
  return buyValue(TRADE_GOOD_VALUES[good].valueKg);
}

/** Kolik kg obilí soused chce za svobodného dospělého, kterého dá (trade.md – Výměna lidí). */
export function adultBuyPrice(): number {
  return buyValue(PEOPLE_TRADE.adultValueKg);
}

/** Kolik kg obilí soused chce za svou rodinu s `children` dětmi. */
export function familyBuyPrice(children: number): number {
  return buyValue(neighbourFamilyValue(children));
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
      // uhlí u kováře i ve vypálených milířích (crafts.md – Milíř stojí vždy)
      return Math.floor(charcoalStockKg(state));
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
    case 'tools': {
      const crafts = (state.crafts ??= { charcoalKg: 0, toolsKg: 0, potteryKg: 0 });
      const key = good === 'pottery' ? 'potteryKg' : 'toolsKg';
      crafts[key] = Math.max(0, crafts[key] + amount);
      return;
    }
    case 'charcoal': {
      // prodané uhlí napřed od kováře, pak z vypálených milířů; koupené jde ke kováři
      // (crafts.md – Milíř stojí vždy)
      if (amount < 0) takeCharcoal(state, -amount);
      else (state.crafts ??= { charcoalKg: 0, toolsKg: 0, potteryKg: 0 }).charcoalKg += amount;
    }
  }
}

/** Zboží s kladným množstvím v pořadí TRADE_GOODS. */
function entries(goods: TradeGoods): [TradeGood, number][] {
  return TRADE_GOODS.flatMap((g) =>
    (goods[g] ?? 0) > 0 ? [[g, goods[g]!] as [TradeGood, number]] : [],
  );
}

/**
 * Nosiči výpravy – víc z cesty tam a zpět, aspoň jeden (i pro prohlížeč – náhled v panelu).
 * S vozy (`carts` – druhy vozů, které má ves pro výpravu, v pořadí výběru – `tradeCarts`) jde
 * náklad na vozy a s každým vozem 2 lidé (wagons.md – Obchod) – `expeditionTransport`.
 */
export function expeditionPorters(
  give: TradeGoods,
  get: TradeGoods,
  carts: readonly CartKind[] = [],
): number {
  return expeditionTransport(give, get, carts).porters;
}

/**
 * Doprava výpravy (wagons.md – Obchod, návrh Clauda): kolik vozů z nabídnutých (`carts` – v pořadí
 * výběru, čtyřkoláky napřed) jede a kolik lidí jde – vůz bere CARTS.loadKg nákladu místo nosičů
 * po 25 kg a jdou s ním CARTS.tradeCrew lidé (honák a pomocník), dobytek se žene jako dřív.
 * Vozů jede tolik z prvních, aby lidí bylo nejméně (při shodě méně vozů).
 */
export function expeditionTransport(
  give: TradeGoods,
  get: TradeGoods,
  carts: readonly CartKind[] = [],
): { porters: number; carts: number } {
  let best = { porters: Math.max(1, carriers(give, []), carriers(get, [])), carts: 0 };
  for (let n = 1; n <= carts.length; n++) {
    const used = carts.slice(0, n);
    const porters = Math.max(1, carriers(give, used), carriers(get, used));
    if (porters < best.porters) best = { porters, carts: n };
  }
  return best;
}

/**
 * Kolik práce by výpravě ušetřil k-tý čtyřkolák (čd – wagons.md, Kolik vozů ves chce): nosiči,
 * které vůz nahradí (`expeditionTransport` s k čtyřkoláky), krát dny cesty; jen dokud vozy
 * pomáhají (nejvýš CART_DEMAND.maxCarts).
 */
export function fourWheelSavings(give: TradeGoods, get: TradeGoods, days: number): number[] {
  const out: number[] = [];
  let porters = expeditionTransport(give, get, []).porters;
  for (let k = 1; k <= CART_DEMAND.maxCarts['four-wheel']; k++) {
    const carts = Array.from({ length: k }, (): CartKind => 'four-wheel');
    const next = expeditionTransport(give, get, carts).porters;
    if (next >= porters) break;
    out.push((porters - next) * days);
    porters = next;
  }
  return out;
}

/**
 * Lidé na jednu cestu: náklad po 25 kg na člověka (co se nevejde na vozy), dobytek žene honák na
 * 10 kusů, s každým vozem jeho posádka.
 */
function carriers(goods: TradeGoods, carts: readonly CartKind[]): number {
  let kg = 0;
  let heads = 0;
  for (const [good, amount] of entries(goods)) {
    if (good === 'cattle') heads += amount;
    else kg += amount * TRADE_GOOD_VALUES[good].carryKg;
  }
  const onCarts = Math.min(
    kg,
    carts.reduce((sum, kind) => sum + CARTS.loadKg[kind], 0),
  );
  return (
    Math.ceil((kg - onCarts) / TRADE.porterKg - EPSILON) +
    Math.ceil(heads / TRADE.headsPerDrover - EPSILON) +
    carts.length * CARTS.tradeCrew
  );
}

/**
 * Návrh výměny se sousedem ve směru – co ves dá a co dostane, i lidé (trade.md – Výměna lidí:
 * kolik rodin a svobodných dospělých ves dá a vezme; chybí = nikdo).
 */
export interface TradeOffer {
  direction: Direction8;
  give: TradeGoods;
  get: TradeGoods;
  givePeople?: TradePeople;
  getPeople?: TradePeople;
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
  /** Vozy, které s výpravou pojedou (wagons.md – Obchod; druhy v pořadí výběru). */
  carts: CartKind[];
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
export const NO_PEOPLE_WANTED = 'Lidi soused letos nevezme.';
export const NO_PEOPLE_OFFERED = 'Lidi soused letos nedá.';
export const OVER_PEOPLE_DEMAND = 'Tolik lidí soused letos nevezme.';
export const OVER_PEOPLE_SUPPLY = 'Tolik lidí soused letos nemá.';
export const NO_EMIGRANTS =
  'Tolik lidí ves dát nemůže – bez dědiců, dvorce a bez rozpadu domácností.';

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
 * a bilance pro souseda ≥ 0. Nosiči a práce i u zamítnuté výměny (náhled v panelu). Vozy jedou
 * jen po stezce sjízdné pro vozy (`landscape` – `trailCartPassable`; bez krajiny vždy).
 */
export function tradeQuote(
  state: VillageState,
  offer: TradeOffer,
  day: number,
  landscape: Landscape | null = null,
): TradeQuote {
  const neighbour = neighbourOf(state.seed, offer.direction);
  const stock = neighbourStock(state, offer.direction, day);
  const give = entries(offer.give);
  const get = entries(offer.get);
  const givePeople = offer.givePeople ?? NO_PEOPLE;
  const getPeople = offer.getPeople ?? NO_PEOPLE;
  const people = stockPeople(stock);
  const leaving = emigrantGroups(state, day, givePeople);
  const credit =
    give.reduce((sum, [g, n]) => sum + n * sellPrice(g), 0) +
    emigrantList(leaving).reduce((sum, g) => sum + sellValue(g.valueKg), 0);
  const price =
    get.reduce((sum, [g, n]) => sum + n * buyPrice(g), 0) +
    people.families
      .slice(0, getPeople.families)
      .reduce((sum, children) => sum + familyBuyPrice(children), 0) +
    (Math.min(getPeople.men, people.men) + Math.min(getPeople.women, people.women)) *
      adultBuyPrice();
  const trail = builtTrail(state, offer.direction);
  const days = trail ? trailTripDays(trail.lengthM) : 0;
  // vozy s voly, kteří jsou doma – náklad místo nosičů, jen po sjízdné stezce (wagons.md –
  // Obchod, axisCartCheck)
  const available =
    trail && trailCartPassable(state, trail, landscape)
      ? tradeCarts(state, day).map((c) => c.kind)
      : [];
  const transport = expeditionTransport(offer.give, offer.get, available);
  const porters = transport.porters;
  const quote = {
    credit: round2(credit),
    price: round2(price),
    balance: round2(credit - price),
    porters,
    carts: available.slice(0, transport.carts),
    days,
    manDays: porters * days,
  };
  const blocked = ((): string | null => {
    if (!trail) return NO_TRAIL;
    if (expeditionTo(state, offer.direction)) return EXPEDITION_AWAY;
    const noPeople = tradePeopleCount(givePeople) + tradePeopleCount(getPeople) === 0;
    if (give.length === 0 && get.length === 0 && noPeople) return NOTHING_TO_TRADE;
    const peopleBlock = peopleBlocked(people, givePeople, getPeople, leaving);
    if (peopleBlock) return peopleBlock;
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

/** Lidé souseda ze zbytku roku (`neighbourStock` je doplní vždy). */
function stockPeople(stock: NeighbourStock): NeighbourPeople {
  return stock.people ?? { families: [], men: 0, women: 0, takes: { ...NO_PEOPLE } };
}

/** Proč lidé ve výměně nejdou (trade.md – Výměna lidí), nebo null. */
function peopleBlocked(
  people: NeighbourPeople,
  give: TradePeople,
  get: TradePeople,
  leaving: Emigrants,
): string | null {
  const { takes } = people;
  if (tradePeopleCount(give) > 0) {
    if (tradePeopleCount(takes) === 0) return NO_PEOPLE_WANTED;
    if (give.families > takes.families || give.men > takes.men || give.women > takes.women) {
      return OVER_PEOPLE_DEMAND;
    }
    if (
      leaving.families.length < give.families ||
      leaving.men.length < give.men ||
      leaving.women.length < give.women
    ) {
      return NO_EMIGRANTS;
    }
  }
  if (tradePeopleCount(get) > 0) {
    if (people.families.length + people.men + people.women === 0) return NO_PEOPLE_OFFERED;
    if (get.families > people.families.length || get.men > people.men || get.women > people.women) {
      return OVER_PEOPLE_SUPPLY;
    }
  }
  return null;
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
 * (nosiči × dny). Lidé, které ves dává (trade.md – Výměna lidí – `emigrantGroups`), odejdou hned
 * a v rodokmenu zůstanou jako odešlí ve směru souseda (`removePeople`); lidé souseda přijdou
 * s návratem výpravy. Lidé nic nenesou a nosiče nepotřebují. RangeError, když výměna nejde
 * (`tradeQuote` – důvod česky). Konvence dne jako u ostatních akcí.
 */
export function startExpedition(
  state: VillageState,
  day: number,
  offer: TradeOffer,
  landscape: Landscape | null = null,
): VillageState {
  const quote = tradeQuote(state, offer, day, landscape);
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
  // lidé (trade.md – Výměna lidí): naši odejdou hned s výpravou, lidé souseda přijdou s návratem
  const givePeople = offer.givePeople ?? NO_PEOPLE;
  const getPeople = offer.getPeople ?? NO_PEOPLE;
  const people = stockPeople(stock);
  const leaving = emigrantGroups(next, day, givePeople);
  const groups = emigrantList(leaving);
  // kdo odchází – pohlaví a den narození (postavy karavany ve scéně jdou s výpravou tam)
  const members = groups.flatMap((g) =>
    g.people.map((p) => ({ sex: p.sex ?? 'male', bornDay: p.bornDay, group: g.kind })),
  );
  const emigrated = new Map(
    groups.flatMap((g) => g.people.map((p) => [p.id, offer.direction] as const)),
  );
  removePeople(next, new Set(emigrated.keys()), emigrated);
  people.takes = {
    families: people.takes.families - givePeople.families,
    men: people.takes.men - givePeople.men,
    women: people.takes.women - givePeople.women,
  };
  const coming = {
    families: people.families.slice(0, getPeople.families),
    men: getPeople.men,
    women: getPeople.women,
  };
  people.families = people.families.slice(getPeople.families);
  people.men -= getPeople.men;
  people.women -= getPeople.women;
  storeStock(next, { ...stock, people });
  const sent = tradePeopleCount(givePeople) > 0;
  const fetched = tradePeopleCount(getPeople) > 0;
  const trade = tradeOf(next);
  // vozy výpravy (s nimi jejich voli) jsou do návratu pryč (wagons.md – Obchod)
  const carts = tradeCarts(state, day)
    .slice(0, quote.carts.length)
    .map((c) => c.id);
  // co by výpravě ušetřily čtyřkoláky – do roku vozů (wagons.md – Kolik vozů ves chce)
  if (trailCartPassable(state, trail, landscape)) {
    addExpeditionDemand(next, day, fourWheelSavings(give, get, quote.days));
  }
  trade.expeditions.push({
    id: trade.nextId++,
    direction: offer.direction,
    trailId: trail.id,
    startedDay: day,
    give,
    get,
    porters: quote.porters,
    ...(carts.length > 0 ? { carts } : {}),
    days: quote.days,
    cost: quote.manDays,
    done: 0,
    ...(sent ? { givePeople: { ...givePeople, people: peopleCount(groups), members } } : {}),
    ...(fetched ? { getPeople: coming } : {}),
  });
  next.chronicle.push({
    day,
    kind: 'trade-departed',
    direction: offer.direction,
    give,
    ...(sent ? { people: { ...givePeople } } : {}),
  });
  return next;
}

/**
 * Kolik lidí je dnes na výpravách k sousedům (trade.md – Doprava; Martin 19. 10. 2026: „Ano,
 * udělej to tak.“ – nosiči mají vlastní podíl práce): každá výprava na cestě chce denně tolik
 * člověkodní, kolik s ní jde lidí (nosiči, honáci a pomocníci u vozů), nejvýš co jí zbývá. Krok
 * práce je vezme po denním minimu a před rozdělením dne (`allocateDay` – `away`), takže výprava trvá
 * přesně dny z náhledu. Platí pro každou výpravu ve `state.trade.expeditions` (i nákup u sousedů).
 */
export function expeditionLaborNeed(state: Pick<VillageState, 'trade'>): number {
  return (state.trade?.expeditions ?? []).reduce(
    (sum, e) => sum + Math.min(e.porters, Math.max(0, e.cost - e.done)),
    0,
  );
}

/**
 * Práce lidí na výpravách dnes (trade.md – Doprava; jediné pravidlo pro všechny výpravy na cestě):
 * `expeditionLaborNeed`, nejvýš kolik je mezi `people` (lidé, kteří dnes pracují se vsí – bez
 * řemeslníků v dílnách) dospělých. Náklad 25 kg na několik dní cesty nesou dospělí; děti a starší
 * zůstanou doma. Krok práce ji dá do `allocateDay` jako `away` – po denním minimu domácností, před
 * úlohami dne – a `workExpeditions` ji rozdělí mezi výpravy. `extra` = lidé dalších cest
 * k sousedům (skupiny nákupu výrobků řemeslníků – crafts.md, Nákup u sousedů).
 */
export function expeditionLaborToday(
  state: Pick<VillageState, 'trade'>,
  people: readonly Person[],
  day: number,
  extra = 0,
): number {
  const need = expeditionLaborNeed(state) + extra;
  if (need <= 0) return 0;
  return Math.min(need, people.filter((p) => ageGroup(p, day) === 'adult').length);
}

/**
 * Práce nosičů dne (mutuje stav – krok práce): rozdělí práci lidí na výpravách (`allocateDay` –
 * `away`, nejvýš `expeditionLaborToday`) – každá výprava nejvýš tolik, kolik má lidí, v pořadí
 * výprav. Když ves lidí na výpravu nemá (po denním minimu, jen dospělí), cesta trvá déle. Vrátí
 * použitou práci a podíly po stezkách.
 */
export function workExpeditions(
  state: VillageState,
  away: number,
): { used: number; shares: { trailId: number; manDays: number; carts?: number }[] } {
  const shares: { trailId: number; manDays: number; carts?: number }[] = [];
  let left = away;
  for (const e of state.trade?.expeditions ?? []) {
    if (left <= EPSILON) break;
    const take = Math.min(left, e.porters, Math.max(0, e.cost - e.done));
    if (take <= 0) continue;
    e.done += take;
    left -= take;
    shares.push({
      trailId: e.trailId,
      manDays: take,
      ...(e.carts && e.carts.length > 0 ? { carts: e.carts.length } : {}),
    });
  }
  return { used: away - left, shares };
}

/**
 * Vrácené výpravy (mutuje stav): přinesené zboží do zásob vsi, lidé od souseda do obydlí
 * (`settleNewcomers`), kronika.
 */
export function finishExpeditions(state: VillageState, day: number): ChronicleEvent[] {
  const trade = state.trade;
  if (!trade || trade.expeditions.length === 0) return [];
  const events: ChronicleEvent[] = [];
  trade.expeditions = trade.expeditions.filter((e) => {
    if (e.done + EPSILON < e.cost) return true;
    for (const [g, n] of entries(e.get)) addGood(state, g, n);
    const coming = e.getPeople;
    events.push({
      day,
      kind: 'trade-returned',
      direction: e.direction,
      get: { ...e.get },
      ...(coming ? { people: comingCounts(coming, state.seed, String(e.id)) } : {}),
    });
    // lidé od souseda přijdou s výpravou (trade.md – Výměna lidí)
    if (coming) events.push(...settleNewcomers(state, day, e.direction, coming, String(e.id)));
    return false;
  });
  return events;
}

/**
 * Kolik lidí s výpravou přijde – rodiny, muži a ženy; u výpravy uložené dřív se svobodní dospělí
 * bez pohlaví (`adults`) losují až při příchodu – v kronice podle losu (`newcomerProfiles`).
 */
function comingCounts(coming: ComingPeople, seed?: number, key?: string): TradePeople {
  if (coming.adults && seed !== undefined && key !== undefined) {
    const singles = newcomerProfiles(seed, key, coming).filter((p) => p.group !== 'family');
    return {
      families: coming.families.length,
      men: singles.filter((p) => p.group === 'man').length,
      women: singles.filter((p) => p.group === 'woman').length,
    };
  }
  return { families: coming.families.length, men: coming.men ?? 0, women: coming.women ?? 0 };
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
