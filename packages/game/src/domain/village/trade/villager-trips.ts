// Vesničané na trhu (markets.md – Pravidla 9: vesničané jedou na nejbližší trh s řemeslníkem pro
// nástroje, keramiku, dřevěné nářadí, vozy a osivo, „když se jim to vyplatí“; Rozhodnutí plánu 3,
// bod 7; Martin 22. 11. 2026 – vesničané na trh pro nástroje, keramiku a osivo: „Ano“; Martin 24. 11.
// 2026: „Ano, řemeslník bere obilí vždy“). Krok dne `villagerTripsDay` – jen ves s okolím
// (`VillageState.nearby`), cíle jen z okolí, jedna výprava na cíl a den, odchod jen přes
// `departMarketInPlace` (kontroly `checkMarketTrip`, nosiči z volných lidí `marketFreeAdults`):
// - hotová zakázka (`ready`) → výprava pro ni týž den, zakázka pak `open` do výsledku,
// - 15. 11. (`CRAFT_BUYING.day`) nástroje, keramika, dřevěné nářadí a vůz – port dřívějšího
//   `planPurchases` @ b4f8dadc (`planVillagerPurchases`): koupí se jen to, co ušetří víc práce, než
//   stojí platba a nosiči,
// - 1. 9. a 1. 3. (`SEED_RESERVE.days`) osivo u nejbližší vsi okolí za hřivny a krávy – seznam je
//   obilí v hodnotě platby, osivem z něj je chybějící osivo (`MarketTrip.seedKg` – ves ho nesní),
// - kdykoli hřivny na kování vozu u nejbližšího kováře (Martin 20. 10. 2026).
// Volní lidé a dopravní vozy dne se mezi výpravy dělí v pořadí přijetí nákupů (zakázky, výrobky od
// nejlepšího, osivo, hřivny) a v tom pořadí výpravy odjíždějí. Nákup s pevným dnem (výrobky a vůz,
// osivo), na který nezbyli lidé ani vozy, vesničané zkusí druhý den (`VillageTrade.villagersRetry`),
// zakázka a hřivny se zkoušejí každý den samy. Ves, která zakázku nevzala, vesničané rok vynechají
// a jedou k další vsi s řemeslníkem (Rozhodnutí plánu 3, bod 6). Cena je cena trhu cíle ze zprávy na
// pivo (jinak výchozí) v kg obilí; obilím a luštěninami z přebytku (`paymentPool`) se platí
// řemeslníkovi, který je bere vždy. Rozhoduje jen ze stavu vsi a dne, takže výsledek nezávisí na
// kouscích dopočtu.
import { dateOfDayIndex } from '../../calendar';
import {
  CRAFT_PRODUCTS,
  PRODUCT_WEAR_PER_YEAR,
  buyingContext,
  ownCraftsmanWorks,
  pay,
  paymentPool,
  productCoverage,
  productStock,
  withToolCoverage,
  yearlySaving,
  type BuyingContext,
  type CraftProduct,
  type PayValues,
  type PaymentPool,
} from '../crafts/craft-buying';
import { cartOxen, cartsWithOxen, tradeHomeCarts } from '../crafts/carts';
import { craftTargets, ironOrderBarsKg } from '../crafts/crafts';
import { seedShortKg } from '../fields/seed-reserve';
import { cartYearSaving, missingCart } from '../livestock/draft';
import { surplusCows } from '../livestock/husbandry';
import { oxenHome } from '../livestock/oxen';
import { CARTS, CRAFT_BUYING, MARKET, SEED_RESERVE, TRADE_GOOD_VALUES } from '../rules';
import type {
  CartGood,
  CartKind,
  Craft,
  CraftCoverage,
  NearbyVillage,
  OrderGood,
  PlacedOrder,
  TradeGood,
  TradeGoods,
  VillageState,
  VillagerRetry,
} from '../types';
import { orderRefused, placedOrder, readyOrders } from './craft-orders';
import { CART_GOODS, ORDER_CRAFT, cartGoodKind } from './goods';
import { priceOf } from './market-prices';
import {
  departMarketInPlace,
  marketCarryKg,
  marketCrew,
  marketFreeAdults,
  marketTravelDays,
  oxenForCarts,
} from './market-trip';
import { nearbyTarget, nearestNearby, nearestWith } from './nearby';
import { expeditionLaborNeed, villageGoodStock } from './trade';

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Výrobek, který vesničané 15. 11. kupují – výrobek řemeslníků, nebo vůz od tesaře. */
export type VillagerGood = 'tools' | 'pottery' | 'woodTools' | 'twoWheelCarts' | 'fourWheelCarts';

/**
 * Nákup, který vesničané zvažují (plán dne – stav nemění; port `PurchasePlan` @ b4f8dadc): výrobek,
 * ves okolí s řemeslníkem, kolik (kg, vůz – 1 kus), platba (obilí a luštěniny), práce, kterou
 * výrobek ušetří za dobu služby, a práce za platbu a nosiče (čd); `worthIt` – vyplatí se, ves koupí.
 */
export interface VillagerPurchase {
  good: VillagerGood;
  villageId: string;
  amount: number;
  pay: TradeGoods;
  savedManDays: number;
  costManDays: number;
  worthIt: boolean;
}

/** Nákup 15. 11.: výrobek řemeslníků (zboží trhu), nebo vůz od tesaře. */
type BuyItem = Exclude<VillagerRetry, 'seed'>;

/** Zboží trhu výrobku řemeslníků. */
const PRODUCT_GOOD: Readonly<Record<CraftProduct, 'tools' | 'pottery' | 'woodTools'>> = {
  toolsKg: 'tools',
  potteryKg: 'pottery',
  woodToolsKg: 'woodTools',
};

/** Výrobek řemeslníků zboží trhu. */
const GOOD_PRODUCT: Readonly<Record<Exclude<BuyItem, 'cart'>, CraftProduct>> = {
  tools: 'toolsKg',
  pottery: 'potteryKg',
  woodTools: 'woodToolsKg',
};

/** Nákupy 15. 11. v pořadí výrobků (`CRAFT_PRODUCTS`), pak vůz. */
const BUY_ITEMS: readonly BuyItem[] = [...CRAFT_PRODUCTS.map((p) => PRODUCT_GOOD[p]), 'cart'];

/** Zboží trhu vozu druhu `kind`. */
function cartGoodOf(kind: CartKind): CartGood {
  return CART_GOODS.find((good) => cartGoodKind(good) === kind)!;
}

/** Je dnes den `date` kalendáře? */
function isOn(day: number, date: { month: number; day: number }): boolean {
  const today = dateOfDayIndex(day);
  return today.month === date.month && today.day === date.day;
}

/**
 * Cena zboží u vsi `villageId` v kg obilí (Rozhodnutí plánu 3, bod 7): cena trhu ze zprávy na pivo
 * × `MARKET.grainKgPerCoin`, bez zprávy výchozí (`TRADE_GOOD_VALUES`).
 */
function priceKg(state: VillageState, villageId: string, good: TradeGood): number {
  const prices = state.news?.find((n) => n.villageId === villageId)?.prices;
  return prices?.[good] === undefined
    ? TRADE_GOOD_VALUES[good].valueKg
    : priceOf(prices, good) * MARKET.grainKgPerCoin;
}

/** Hodnota kg obilí a luštěnin u vsi `villageId` (kg obilí – cena cíle). */
function payValues(state: VillageState, villageId: string): PayValues {
  return {
    grain: priceKg(state, villageId, 'grain'),
    legumes: priceKg(state, villageId, 'legumes'),
  };
}

/** Dny výpravy do vsi okolí – cesta tam a zpět a pobyt `MARKET.minStayDays`. */
function tripDays(village: NearbyVillage): number {
  return 2 * marketTravelDays(village.cells) + MARKET.minStayDays;
}

/** Co vesničané dnes do jedné vsi vezou a shánějí (jedna výprava na cíl a den). */
interface Haul {
  village: NearbyVillage;
  give: TradeGoods;
  wants: TradeGoods;
  /** Kg nošeného zboží, které výprava už nese – víc z cesty tam a zpět u každého nákupu. */
  loadKg: number;
  /** Hotové zakázky, pro které jede – po odjezdu `open`. */
  orders: PlacedOrder[];
  /** Kolik kg obilí seznamu je osivo (`MarketTrip.seedKg`). */
  seedKg: number;
  /** Nákupy s pevným dnem ve výpravě – neprojde-li odjezd, zkusí se druhý den. */
  dated: VillagerRetry[];
  /** Nosiči a dopravní vozy výpravy (`marketCrew` – `shareCrews` po každém nákupu). */
  porters: number;
  carts: CartKind[];
}

/** Den vesničanů: co ves ví o sobě a čím platí (líně – počítá se, jen když je potřeba). */
interface TripDay {
  state: VillageState;
  day: number;
  coverage: CraftCoverage;
  pool?: PaymentPool;
  ctx?: BuyingContext;
  adults?: number;
  /** Výpravy dne po cílech v pořadí přijetí prvního nákupu. */
  hauls: Map<string, Haul>;
  /** Nákupy s pevným dnem, na které dnes nezbyli lidé ani vozy – zkusí se druhý den. */
  retry: Set<VillagerRetry>;
}

function newTripDay(state: VillageState, day: number, coverage: CraftCoverage): TripDay {
  return { state, day, coverage, hauls: new Map(), retry: new Set() };
}

/**
 * Přebytek k platbě (`paymentPool`) – obilí a luštěniny nejvýš celé kg, které ves na trh dá
 * (`villageGoodStock` – kontrola výpravy).
 */
function poolOf(t: TripDay): PaymentPool {
  if (!t.pool) {
    const pool = paymentPool(t.state, t.day, t.coverage);
    pool.grainKg = Math.min(pool.grainKg, villageGoodStock(t.state, 'grain', t.day));
    pool.legumesKg = Math.min(pool.legumesKg, villageGoodStock(t.state, 'legumes', t.day));
    t.pool = pool;
  }
  return t.pool;
}

function ctxOf(t: TripDay): BuyingContext {
  return (t.ctx ??= buyingContext(t.state, t.day, t.coverage));
}

/** Voli, kteří půjdou s výpravami dne pro koupené vozy (`oxenForCarts`). */
function reservedOxen(t: TripDay): number {
  let oxen = 0;
  for (const haul of t.hauls.values()) oxen += oxenForCarts(haul.wants);
  return oxen;
}

/** Dopravní vozy dne – doma, s voly, kteří zbudou po volech pro koupené vozy (i `extraOxen`). */
function transportCarts(t: TripDay, extraOxen = 0): CartKind[] {
  const oxen = oxenHome(t.state, t.day) - reservedOxen(t) - extraOxen;
  return cartsWithOxen(tradeHomeCarts(t.state), oxen).map((cart) => cart.kind);
}

/**
 * Nosiči a vozy výprav dne (mutuje výpravy): v pořadí výprav každá vezme nosiče a vozy `marketCrew`
 * ze zbytku dopravních vozů – jako při odjezdu jedna po druhé.
 */
function shareCrews(t: TripDay): void {
  let left = transportCarts(t);
  for (const haul of t.hauls.values()) {
    const crew = marketCrew(haul.give, haul.wants, left);
    haul.porters = crew.porters;
    haul.carts = left.slice(0, crew.carts);
    left = left.slice(crew.carts);
  }
}

/** Lidé a vozy, které zbyly pro výpravu do jedné vsi, a kolik ještě unese. */
interface Space {
  carts: CartKind[];
  roomKg: number;
  /** Část lidí nebo vozů mají jiné výpravy (dnešní nebo na cestě) – až se vrátí, unese víc. */
  held: boolean;
}

/**
 * Kolik kg nošeného zboží výprava do `village` ještě unese – volní dospělí a dopravní vozy jedné
 * cesty (`marketCarryKg`) bez nosičů a vozů ostatních výprav dne a bez toho, co už nese (dřívější
 * `carryKg` nákupu, Rozhodnutí plánu 3, bod 7: víc ves koupí příště). `extraOxen` – voli pro vůz,
 * který se zvažuje.
 */
function spaceFor(t: TripDay, village: NearbyVillage, extraOxen = 0): Space {
  const own = t.hauls.get(village.villageId);
  let adults = (t.adults ??= marketFreeAdults(t.state, t.day));
  const carts = transportCarts(t, extraOxen);
  let others = false;
  for (const haul of t.hauls.values()) {
    if (haul === own) continue;
    others = true;
    adults -= haul.porters;
    for (const kind of haul.carts) {
      const i = carts.indexOf(kind);
      if (i >= 0) carts.splice(i, 1);
    }
  }
  return {
    carts,
    roomKg: Math.max(0, marketCarryKg(Math.max(0, adults), carts) - (own?.loadKg ?? 0)),
    held: others || expeditionLaborNeed(t.state, t.day + 1) > 0,
  };
}

/** Nákup do výpravy dne (`add` – co přidá; výprava se založí až s prvním nákupem). */
interface HaulAdd {
  give: TradeGoods;
  wants: TradeGoods;
  loadKg: number;
  seedKg?: number;
  dated?: VillagerRetry;
  order?: PlacedOrder;
}

/** Přidá nákup do výpravy dne do `village` (mutuje) a znovu rozdělí lidi a vozy dne. */
function addToHaul(t: TripDay, village: NearbyVillage, add: HaulAdd): void {
  let haul = t.hauls.get(village.villageId);
  if (!haul) {
    haul = {
      village,
      give: {},
      wants: {},
      loadKg: 0,
      orders: [],
      seedKg: 0,
      dated: [],
      porters: 0,
      carts: [],
    };
    t.hauls.set(village.villageId, haul);
  }
  addTo(haul.give, add.give);
  addTo(haul.wants, add.wants);
  haul.loadKg += add.loadKg;
  haul.seedKg += add.seedKg ?? 0;
  if (add.dated) haul.dated.push(add.dated);
  if (add.order) haul.orders.push(add.order);
  shareCrews(t);
}

/** Přičte zboží (mutuje). */
function addTo(goods: TradeGoods, more: TradeGoods): void {
  for (const [good, amount] of Object.entries(more) as [TradeGood, number | undefined][]) {
    if (amount && amount > 0) goods[good] = (goods[good] ?? 0) + amount;
  }
}

/** Zvažovaný nákup a přebytek po jeho platbě (`trial`). */
interface Option {
  item: BuyItem;
  plan: VillagerPurchase;
  trial: PaymentPool;
  village: NearbyVillage;
  loadKg: number;
}

/** Zvažovaný nákup; `'blocked'` – na nákup nezbyli lidé ani vozy, zkusí se druhý den. */
type Considered = Option | 'blocked' | null;

/** Kolik práce nákup ušetří na čd, které stojí (platba a nosiči). */
function ratio(plan: VillagerPurchase): number {
  return plan.savedManDays / Math.max(EPSILON, plan.costManDays);
}

/**
 * Nejbližší ves okolí s řemeslníkem `craft` ze zprávy, kromě té, která zakázku na `good` nevzala
 * (`orderRefused` – rok ji vynechá a jede k další; Rozhodnutí plánu 3, bod 6).
 */
function craftsmanFor(t: TripDay, craft: Craft, good: OrderGood): NearbyVillage | null {
  return nearestWith(t.state, craft, (v) => orderRefused(t.state, t.day, v.villageId, good));
}

/**
 * Výrobek řemeslníků z přebytku `from` (port `consider` @ b4f8dadc): bez vlastního pracujícího
 * řemeslníka, bez živé zakázky (jede se pro ni, až bude hotová), chybí do zásoby (`craftTargets`)
 * aspoň `CRAFT_BUYING.minKg`; cíl je nejbližší ves okolí, o jejímž řemeslníkovi ves ví ze zprávy
 * (`nearestWith`), kromě té, která zakázku nevzala (`orderRefused` – jede se k další). Ves zaplatí,
 * kolik z přebytku zaplatí a výprava unese, a porovná práci, kterou to za dobu služby výrobku
 * ušetří, s prací za platbu a nosiče (nosiči × dny výpravy).
 */
function considerProduct(t: TripDay, product: CraftProduct, from: PaymentPool): Considered {
  const { state, day } = t;
  const good = PRODUCT_GOOD[product];
  const craft = ORDER_CRAFT[good];
  if (ownCraftsmanWorks(state, craft) || placedOrder(state, day, good)) return null;
  const stock = productStock(state, product);
  const wanted = craftTargets(state, day)[product] - stock;
  if (wanted < CRAFT_BUYING.minKg) return null;
  const village = craftsmanFor(t, craft, good);
  if (!village) return null;
  const price = priceKg(state, village.villageId, good);
  const space = spaceFor(t, village);
  if (space.roomKg < CRAFT_BUYING.minKg * price) return space.held ? 'blocked' : null;
  const ctx = ctxOf(t);
  const need = ctx.needs[product];
  // obilí na platbu ves vypěstuje znovu – u nástrojů už s nimi (cena jídla v práci při pokrytí
  // po nákupu), u ostatních výrobků při dnešním pokrytí nástroji
  const payCtx =
    product === 'toolsKg'
      ? withToolCoverage(state, ctx, productCoverage(stock + wanted, need))
      : ctx;
  const days = tripDays(village);
  const trial = { ...from };
  const paid = pay(
    payCtx,
    trial,
    Math.min(wanted * price, space.roomKg),
    days,
    payValues(state, village.villageId),
  );
  const kg = paid.paidKg / price;
  if (kg < CRAFT_BUYING.minKg) return null;
  const crew = marketCrew(paid.pay, { [good]: kg }, space.carts);
  const years = 1 / PRODUCT_WEAR_PER_YEAR[product];
  const saved =
    yearlySaving(
      state,
      ctx,
      product,
      productCoverage(stock, need),
      productCoverage(stock + kg, need),
    ) * years;
  const cost = paid.labor + crew.porters * days;
  return {
    item: good,
    plan: {
      good,
      villageId: village.villageId,
      amount: kg,
      pay: paid.pay,
      savedManDays: saved,
      costManDays: cost,
      worthIt: saved > cost + EPSILON,
    },
    trial,
    village,
    loadKg: Math.max(paid.weightKg, kg * TRADE_GOOD_VALUES[good].carryKg),
  };
}

/**
 * Vůz od tesaře (port `considerCart` @ b4f8dadc; crafts.md – Nákup u sousedů, Vozy): ves bez
 * pracujícího tesaře, která vůz chce a nemá (`missingCart`), bez živé zakázky a bez výpravy, která
 * ho už veze, s volnými vycvičenými voly, kteří ho dovedou domů (`cartOxen`), u nejbližší vsi okolí
 * s tesařem ze zprávy (kromě té, která zakázku nevzala); celý vůz z přebytku, nebo nic. Ušetří, co
 * další vůz podle loňského roku vozů (`cartYearSaving`) za `CARTS.lifespanYears` let.
 */
function considerCart(t: TripDay, from: PaymentPool): Considered {
  const { state, day } = t;
  if (ownCraftsmanWorks(state, 'carpenter')) return null;
  const kind = missingCart(state);
  if (!kind) return null;
  const good = cartGoodOf(kind);
  if (placedOrder(state, day, good) || onTheWay(state, good)) return null;
  const village = craftsmanFor(t, 'carpenter', good);
  if (!village) return null;
  const space = spaceFor(t, village, cartOxen(kind));
  // volní voli – bez volů pro jiné koupené vozy a volů u vozů ostatních výprav dne
  let othersOxen = 0;
  for (const haul of t.hauls.values()) {
    if (haul.village.villageId === village.villageId) continue;
    othersOxen += haul.carts.reduce((n, kind) => n + cartOxen(kind), 0);
  }
  if (oxenHome(state, day) - reservedOxen(t) - othersOxen < cartOxen(kind)) {
    return space.held ? 'blocked' : null;
  }
  const days = tripDays(village);
  const price = priceKg(state, village.villageId, good);
  const values = payValues(state, village.villageId);
  // nejlehčí platba – obilí či luštěniny kg za kg; tolik výprava neunese, než se lidé vrátí
  if (space.roomKg < price / Math.max(values.grain, values.legumes) - EPSILON) {
    return space.held ? 'blocked' : null;
  }
  const trial = { ...from };
  const paid = pay(ctxOf(t), trial, price, days, values);
  if (paid.paidKg < price - EPSILON) return null;
  if (paid.weightKg > space.roomKg + EPSILON) return null;
  const crew = marketCrew(paid.pay, { [good]: 1 }, space.carts);
  const saved = cartYearSaving(state, kind) * CARTS.lifespanYears;
  const cost = paid.labor + crew.porters * days;
  return {
    item: 'cart',
    plan: {
      good,
      villageId: village.villageId,
      amount: 1,
      pay: paid.pay,
      savedManDays: saved,
      costManDays: cost,
      worthIt: saved > cost + EPSILON,
    },
    trial,
    village,
    loadKg: paid.weightKg,
  };
}

/** Veze zboží `good` už některá výprava na trh na cestě (seznam `wants`)? */
function onTheWay(state: VillageState, good: TradeGood, by?: 'villagers'): boolean {
  return (state.trade?.expeditions ?? []).some(
    (e) =>
      e.kind === 'market' && (by === undefined || e.by === by) && (e.market?.wants[good] ?? 0) > 0,
  );
}

/**
 * Nákupy `items` z přebytku `pool` (mutuje `pool` i výpravy dne – port smyčky `planPurchases`
 * @ b4f8dadc; crafts.md – Nákup u sousedů, rozhodnutí Clauda): z jednoho přebytku napřed nákup,
 * který ušetří nejvíc práce na práci, kterou stojí; po každém ostatní znovu podle zbylého přebytku
 * a lidí a vozů, které zbyly. Nevýhodné jsou v seznamu s `worthIt` false (přebytek ani výpravy jim
 * nic nedají); nákup, na který nezbyli lidé ani vozy, jde do `t.retry`.
 */
function choosePurchases(
  t: TripDay,
  pool: PaymentPool,
  items: readonly BuyItem[],
): VillagerPurchase[] {
  const plans: VillagerPurchase[] = [];
  let left = [...items];
  while (left.length > 0) {
    const options: Option[] = [];
    for (const item of left) {
      const o =
        item === 'cart' ? considerCart(t, pool) : considerProduct(t, GOOD_PRODUCT[item], pool);
      if (o === 'blocked') t.retry.add(item);
      else if (o) options.push(o);
    }
    const best = options
      .filter((o) => o.plan.worthIt)
      .reduce<Option | null>(
        (top, o) => (top === null || ratio(o.plan) > ratio(top.plan) + EPSILON ? o : top),
        null,
      );
    if (!best) {
      plans.push(...options.map((o) => o.plan));
      break;
    }
    Object.assign(pool, best.trial);
    plans.push(best.plan);
    // nákupy jednoho cíle jedou jednou výpravou – nesou spolu, voli pro koupený vůz jdou s ní
    addToHaul(t, best.village, {
      give: best.plan.pay,
      wants: { [best.plan.good]: best.plan.amount },
      loadKg: best.loadKg,
      dated: best.item,
    });
    left = options.filter((o) => o !== best).map((o) => o.item);
  }
  return plans;
}

/**
 * Plán nákupů dne (stav nemění; port `planPurchases` @ b4f8dadc – markets.md, Pravidla 9,
 * Rozhodnutí plánu 3, bod 7): u každého výrobku bez vlastního pracujícího řemeslníka (nástroje,
 * keramika, dřevěné nářadí) a u vozu, který ves chce a nemá, výrobek, cíl, kolik, platba, ušetřená
 * práce a cena v čd – vyplatí-li se, ves koupí. Bez okolí prázdný.
 */
export function planVillagerPurchases(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): VillagerPurchase[] {
  if (!state.nearby || state.people.length === 0) return [];
  const t = newTripDay(state, day, coverage);
  return choosePurchases(t, { ...poolOf(t) }, BUY_ITEMS);
}

/** Hotové zakázky: výprava pro ně týž den, platba z přebytku cenou cíle. */
function readyTrips(t: TripDay): void {
  for (const order of readyOrders(t.state, t.day)) {
    const village = t.state.nearby?.villages.find((v) => v.villageId === order.villageId);
    if (!village) continue;
    const bought = buyWith(t, village, order.good, order.amount);
    if (bought) addToHaul(t, village, { ...bought, order });
  }
}

/**
 * Zboží `good` (`amount`) s platbou z přebytku cenou cíle, nejvýš kolik výprava do `village` unese
 * (mutuje přebytek). Bez platby null – za nic se na trhu nic nekoupí.
 */
function buyWith(
  t: TripDay,
  village: NearbyVillage,
  good: OrderGood,
  amount: number,
): HaulAdd | null {
  const pool = poolOf(t);
  // bez přebytku nic nezaplatí – a cenu jídla v práci (`buyingContext`) netřeba počítat; krok
  // hřiven na kování se tak v chudé vsi neopakuje draze den co den
  if (pool.energyKg <= EPSILON || pool.grainKg + pool.legumesKg <= EPSILON) return null;
  const price = priceKg(t.state, village.villageId, good);
  const room = spaceFor(t, village).roomKg;
  if (room <= EPSILON) return null;
  const paid = pay(
    ctxOf(t),
    pool,
    Math.min(amount * price, room),
    tripDays(village),
    payValues(t.state, village.villageId),
  );
  if (paid.paidKg <= EPSILON) return null;
  return {
    give: paid.pay,
    wants: { [good]: amount },
    loadKg: Math.max(paid.weightKg, amount * TRADE_GOOD_VALUES[good].carryKg),
  };
}

/**
 * Osivo 1. 9. a 1. 3. (port `buySeed` @ b4f8dadc; fields.md – Osivo pro ves bez zásob): chybí-li
 * aspoň `SEED_RESERVE.minKg`, ves zaplatí chybějící osivo (nejvýš, kolik výprava unese) u nejbližší
 * vsi okolí hřivnami (ne těmi, které čekají na kování vozu – `ironOrderBarsKg`), pak krávami nad
 * ty, které ves drží (`surplusCows`), nejvýš `SEED_RESERVE.maxCows` – kráva jede, jen když obilí za
 * ni výprava unese (kus se na trhu prodá jen celý). Seznam je obilí v hodnotě platby, nejvýš kolik
 * výprava unese (přeplatek za kus je v obilí jako dřív); osivem je z něj chybějící osivo
 * (`seedKg` – ves ho nesní), zbytek jde do zásob. Za méně než `minKg` osiva se nejede.
 */
function seedTrip(t: TripDay, again: boolean): void {
  const { state, day } = t;
  if (!again && !SEED_RESERVE.days.some((d) => isOn(day, d))) return;
  const shortKg = seedShortKg(state, day);
  if (shortKg < SEED_RESERVE.minKg) return;
  const village = nearestNearby(state);
  if (!village) return;
  const space = spaceFor(t, village);
  if (space.roomKg < SEED_RESERVE.minKg) {
    if (space.held) t.retry.add('seed');
    return;
  }
  const haul = t.hauls.get(village.villageId);
  const grainPrice = priceKg(state, village.villageId, 'grain');
  const dueKg = Math.min(shortKg, space.roomKg) * grainPrice;
  const barValue = priceKg(state, village.villageId, 'ironBars');
  const barsLeft =
    Math.floor((state.crafts?.ironBarsKg ?? 0) - ironOrderBarsKg(state) + EPSILON) -
    (haul?.give.ironBars ?? 0);
  const ironBars = Math.max(0, Math.min(barsLeft, Math.ceil(dueKg / barValue - EPSILON)));
  let valueKg = ironBars * barValue;
  const cowValue = priceKg(state, village.villageId, 'cows');
  const cows = Math.max(
    0,
    Math.min(
      surplusCows(state, day),
      villageGoodStock(state, 'cows', day) - (haul?.give.cows ?? 0),
      SEED_RESERVE.maxCows,
      Math.ceil((dueKg - valueKg) / cowValue - EPSILON),
      Math.floor((space.roomKg * grainPrice - valueKg) / cowValue + EPSILON),
    ),
  );
  valueKg += cows * cowValue;
  const getKg = Math.min(valueKg / grainPrice, space.roomKg);
  const seedKg = Math.min(getKg, shortKg);
  if (seedKg < SEED_RESERVE.minKg) return;
  addToHaul(t, village, {
    give: { ironBars, cows },
    wants: { grain: getKg },
    loadKg: Math.max(getKg, ironBars),
    seedKg,
    dated: 'seed',
  });
}

/**
 * Hřivny na kování vozu (kdykoli; wagons.md – Kování vozů, Martin 20. 10. 2026): vozy čekají na
 * kování (`ironOrderBarsKg` nad hřivnami vsi), ves nemá pracujícího kováře, pro hřivny nejde jiná
 * výprava vesničanů a nečeká se na zakázku → seznam je chybějící hřivny u nejbližší vsi okolí
 * s kovářem ze zprávy (kromě té, která zakázku nevzala), platba z přebytku. Hřivny doma vůz dokončí
 * (`cartIronDay`).
 */
function ironBarsTrip(t: TripDay): void {
  const { state, day } = t;
  const missing = ironOrderBarsKg(state) - (state.crafts?.ironBarsKg ?? 0);
  if (missing <= EPSILON || ownCraftsmanWorks(state, 'smith')) return;
  if (onTheWay(state, 'ironBars', 'villagers') || placedOrder(state, day, 'ironBars')) return;
  const village = craftsmanFor(t, 'smith', 'ironBars');
  if (!village) return;
  const bought = buyWith(t, village, 'ironBars', missing);
  if (bought) addToHaul(t, village, bought);
}

/** Nákupy s pevným dnem, které vesničané dnes zkusí znovu (mutuje – paměť se smaže). */
function takeRetry(state: VillageState, day: number): VillagerRetry[] {
  const retry = state.trade?.villagersRetry;
  if (!retry || retry.day > day) return [];
  delete state.trade!.villagersRetry;
  return retry.goods;
}

/**
 * Vesničané na trhu – krok dne (mutuje stav; markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7),
 * hned za rezervou osiva: bez okolí nic. Napřed hotové zakázky, 15. 11. výrobky a vůz
 * (`planVillagerPurchases` – co se vyplatí), 1. 9. a 1. 3. osivo, kdykoli hřivny na kování vozu;
 * nákupy s pevným dnem, na které včera nezbyli lidé ani vozy, znovu. Co jde do jedné vsi, jede
 * jednou výpravou (pobyt `MARKET.minStayDays`, `by: 'villagers'`); výpravy odjíždějí v pořadí
 * přijetí nákupů a každá počítá s lidmi a vozy, které zbyly. Odmítne-li výpravu `planMarketTrip`,
 * dnes nejede – zakázka a hřivny se zkusí druhý den samy, nákupy s pevným dnem přes
 * `villagersRetry`. Zakázka, pro kterou výprava vyrazila, je zase `open` do výsledku.
 */
export function villagerTripsDay(state: VillageState, day: number, coverage: CraftCoverage): void {
  const nearby = state.nearby;
  if (!nearby || nearby.villages.length === 0 || state.people.length === 0) return;
  const t = newTripDay(state, day, coverage);
  const again = takeRetry(state, day);
  readyTrips(t);
  const items = isOn(day, CRAFT_BUYING.day)
    ? BUY_ITEMS
    : BUY_ITEMS.filter((item) => again.includes(item));
  if (items.length > 0) choosePurchases(t, poolOf(t), items);
  seedTrip(t, again.includes('seed'));
  ironBarsTrip(t);
  for (const haul of t.hauls.values()) {
    const target = nearbyTarget(state, haul.village.villageId);
    const sent = target
      ? departMarketInPlace(
          state,
          day,
          { give: haul.give, wants: haul.wants, stayDays: MARKET.minStayDays },
          target,
          { by: 'villagers', seedKg: haul.seedKg },
        )
      : null;
    if (!sent?.ok) {
      for (const item of haul.dated) t.retry.add(item);
      continue;
    }
    for (const order of haul.orders) order.status = 'open';
  }
  if (t.retry.size > 0) {
    (state.trade ??= { expeditions: [], nextId: 1 }).villagersRetry = {
      day: day + 1,
      goods: [...t.retry],
    };
  }
}
