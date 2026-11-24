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
// - 1. 9. a 1. 3. (`SEED_RESERVE.days`) osivo u nejbližší vsi okolí za hřivny a krávy,
// - kdykoli hřivny na kování vozu u nejbližšího kováře (Martin 20. 10. 2026).
// Cena je cena trhu cíle ze zprávy na pivo (jinak výchozí) v kg obilí; obilím a luštěninami
// z přebytku (`paymentPool`) se platí řemeslníkovi, který je bere vždy. Rozhoduje jen ze stavu vsi
// a dne, takže výsledek nezávisí na kouscích dopočtu.
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
  CraftCoverage,
  NearbyVillage,
  OrderGood,
  PlacedOrder,
  TradeGood,
  TradeGoods,
  VillageState,
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
} from './market-trip';
import { nearbyTarget, nearestNearby, nearestWith } from './nearby';
import { villageGoodStock } from './trade';

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

/** Zboží trhu výrobku řemeslníků. */
const PRODUCT_GOOD: Readonly<Record<CraftProduct, 'tools' | 'pottery' | 'woodTools'>> = {
  toolsKg: 'tools',
  potteryKg: 'pottery',
  woodToolsKg: 'woodTools',
};

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
}

/** Den vesničanů: co ves ví o sobě a čím platí (líně – počítá se, jen když je potřeba). */
interface TripDay {
  state: VillageState;
  day: number;
  coverage: CraftCoverage;
  pool?: PaymentPool;
  ctx?: BuyingContext;
  adults?: number;
  /** Výpravy dne po cílech. */
  hauls: Map<string, Haul>;
}

function newTripDay(state: VillageState, day: number, coverage: CraftCoverage): TripDay {
  return { state, day, coverage, hauls: new Map() };
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

/** Výprava dne do vsi `village` – založí se prázdná. */
function haulOf(t: TripDay, village: NearbyVillage): Haul {
  let haul = t.hauls.get(village.villageId);
  if (!haul) {
    haul = { village, give: {}, wants: {}, loadKg: 0, orders: [] };
    t.hauls.set(village.villageId, haul);
  }
  return haul;
}

/** Voli, kteří půjdou s výpravami dne pro koupené vozy (`cartOxen`). */
function reservedOxen(t: TripDay): number {
  let oxen = 0;
  for (const haul of t.hauls.values()) {
    for (const good of CART_GOODS) oxen += cartOxen(cartGoodKind(good)) * (haul.wants[good] ?? 0);
  }
  return oxen;
}

/** Dopravní vozy výpravy – doma, s voly, kteří zbudou po volech pro koupené vozy (`extraOxen`). */
function transportCarts(t: TripDay, extraOxen = 0): CartKind[] {
  const oxen = oxenHome(t.state, t.day) - reservedOxen(t) - extraOxen;
  return cartsWithOxen(tradeHomeCarts(t.state), oxen).map((cart) => cart.kind);
}

/**
 * Kolik kg nošeného zboží výprava do vsi ještě unese – volní dospělí a dopravní vozy jedné cesty
 * (`marketCarryKg`) bez toho, co už nese (dřívější `carryKg` nákupu, Rozhodnutí plánu 3, bod 7:
 * víc ves koupí příště). Vsi stejného dne sdílejí lidi i vozy – další výprava, na kterou nezbudou,
 * neprojde kontrolou a ten den nejede.
 */
function roomKg(t: TripDay, haul: Haul, carts: readonly CartKind[]): number {
  t.adults ??= marketFreeAdults(t.state, t.day);
  return Math.max(0, marketCarryKg(t.adults, carts) - haul.loadKg);
}

/** Přičte zboží (mutuje). */
function addTo(goods: TradeGoods, more: TradeGoods): void {
  for (const [good, amount] of Object.entries(more) as [TradeGood, number | undefined][]) {
    if (amount && amount > 0) goods[good] = (goods[good] ?? 0) + amount;
  }
}

/** Zvažovaný nákup a přebytek po jeho platbě (`trial`). */
interface Option {
  item: CraftProduct | 'cart';
  plan: VillagerPurchase;
  trial: PaymentPool;
  village: NearbyVillage;
  loadKg: number;
}

/** Kolik práce nákup ušetří na čd, které stojí (platba a nosiči). */
function ratio(plan: VillagerPurchase): number {
  return plan.savedManDays / Math.max(EPSILON, plan.costManDays);
}

/**
 * Výrobek řemeslníků z přebytku `from` (port `consider` @ b4f8dadc): bez vlastního pracujícího
 * řemeslníka, bez živé zakázky (jede se pro ni, až bude hotová), chybí do zásoby (`craftTargets`)
 * aspoň `CRAFT_BUYING.minKg`; cíl je nejbližší ves okolí, o jejímž řemeslníkovi ves ví ze zprávy
 * (`nearestWith`), ne ta, která zakázku nevzala (`orderRefused`). Ves zaplatí, kolik z přebytku
 * zaplatí a výprava unese, a porovná práci, kterou to za dobu služby výrobku ušetří, s prací za
 * platbu a nosiče (nosiči × dny výpravy).
 */
function considerProduct(t: TripDay, product: CraftProduct, from: PaymentPool): Option | null {
  const { state, day } = t;
  const good = PRODUCT_GOOD[product];
  const craft = ORDER_CRAFT[good];
  if (ownCraftsmanWorks(state, craft) || placedOrder(state, day, good)) return null;
  const stock = productStock(state, product);
  const wanted = craftTargets(state, day)[product] - stock;
  if (wanted < CRAFT_BUYING.minKg) return null;
  const village = nearestWith(state, craft);
  if (!village || orderRefused(state, day, village.villageId, good)) return null;
  const ctx = ctxOf(t);
  const price = priceKg(state, village.villageId, good);
  const need = ctx.needs[product];
  // obilí na platbu ves vypěstuje znovu – u nástrojů už s nimi (cena jídla v práci při pokrytí
  // po nákupu), u ostatních výrobků při dnešním pokrytí nástroji
  const payCtx =
    product === 'toolsKg'
      ? withToolCoverage(state, ctx, productCoverage(stock + wanted, need))
      : ctx;
  const haul = haulOf(t, village);
  const carts = transportCarts(t);
  const days = tripDays(village);
  const trial = { ...from };
  const paid = pay(
    payCtx,
    trial,
    Math.min(wanted * price, roomKg(t, haul, carts)),
    days,
    payValues(state, village.villageId),
  );
  const kg = paid.paidKg / price;
  if (kg < CRAFT_BUYING.minKg) return null;
  const crew = marketCrew(paid.pay, { [good]: kg }, carts);
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
    item: product,
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
 * s tesařem ze zprávy; celý vůz z přebytku, nebo nic. Ušetří, co další vůz podle loňského roku vozů
 * (`cartYearSaving`) za `CARTS.lifespanYears` let.
 */
function considerCart(t: TripDay, from: PaymentPool): Option | null {
  const { state, day } = t;
  if (ownCraftsmanWorks(state, 'carpenter')) return null;
  const kind = missingCart(state);
  if (!kind) return null;
  const good = cartGoodOf(kind);
  if (placedOrder(state, day, good) || onTheWay(state, good)) return null;
  if (oxenHome(state, day) - reservedOxen(t) < cartOxen(kind)) return null;
  const village = nearestWith(state, 'carpenter');
  if (!village || orderRefused(state, day, village.villageId, good)) return null;
  const haul = haulOf(t, village);
  const carts = transportCarts(t, cartOxen(kind));
  const days = tripDays(village);
  const price = priceKg(state, village.villageId, good);
  const trial = { ...from };
  const paid = pay(ctxOf(t), trial, price, days, payValues(state, village.villageId));
  if (paid.paidKg < price - EPSILON) return null;
  if (paid.weightKg > roomKg(t, haul, carts) + EPSILON) return null;
  const crew = marketCrew(paid.pay, { [good]: 1 }, carts);
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
 * Nákupy z přebytku `pool` (mutuje `pool` i výpravy dne – port smyčky `planPurchases`
 * @ b4f8dadc; crafts.md – Nákup u sousedů, rozhodnutí Clauda): z jednoho přebytku napřed nákup,
 * který ušetří nejvíc práce na práci, kterou stojí; po každém ostatní znovu podle zbylého přebytku.
 * Nevýhodné jsou v seznamu s `worthIt` false (přebytek ani výpravy jim nic nedají).
 */
function choosePurchases(t: TripDay, pool: PaymentPool): VillagerPurchase[] {
  const plans: VillagerPurchase[] = [];
  let left: (CraftProduct | 'cart')[] = [...CRAFT_PRODUCTS, 'cart'];
  while (left.length > 0) {
    const options = left
      .map((item) => (item === 'cart' ? considerCart(t, pool) : considerProduct(t, item, pool)))
      .filter((o): o is Option => o !== null);
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
    const haul = haulOf(t, best.village);
    addTo(haul.give, best.plan.pay);
    addTo(haul.wants, { [best.plan.good]: best.plan.amount });
    haul.loadKg += best.loadKg;
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
  return choosePurchases(t, { ...poolOf(t) });
}

/** Hotové zakázky: výprava pro ně týž den, platba z přebytku cenou cíle. */
function readyTrips(t: TripDay): void {
  for (const order of readyOrders(t.state, t.day)) {
    const village = t.state.nearby?.villages.find((v) => v.villageId === order.villageId);
    if (!village) continue;
    const haul = haulOf(t, village);
    if (!buyWith(t, haul, order.good, order.amount)) continue;
    haul.orders.push(order);
  }
}

/**
 * Do výpravy `haul` přidá zboží `good` (`amount`) s platbou z přebytku cenou cíle, nejvýš kolik
 * výprava unese. Bez platby nic (vrací false) – za nic se na trhu nic nekoupí.
 */
function buyWith(t: TripDay, haul: Haul, good: OrderGood, amount: number): boolean {
  const pool = poolOf(t);
  // bez přebytku nic nezaplatí – a cenu jídla v práci (`buyingContext`) netřeba počítat; krok
  // hřiven na kování se tak v chudé vsi neopakuje draze den co den
  if (pool.energyKg <= EPSILON || pool.grainKg + pool.legumesKg <= EPSILON) return false;
  const villageId = haul.village.villageId;
  const price = priceKg(t.state, villageId, good);
  const room = roomKg(t, haul, transportCarts(t));
  if (room <= EPSILON) return false;
  const paid = pay(
    ctxOf(t),
    pool,
    Math.min(amount * price, room),
    tripDays(haul.village),
    payValues(t.state, villageId),
  );
  if (paid.paidKg <= EPSILON) return false;
  addTo(haul.give, paid.pay);
  addTo(haul.wants, { [good]: amount });
  haul.loadKg += Math.max(paid.weightKg, amount * TRADE_GOOD_VALUES[good].carryKg);
  return true;
}

/**
 * Osivo 1. 9. a 1. 3. (port `buySeed` @ b4f8dadc; fields.md – Osivo pro ves bez zásob): chybí-li
 * aspoň `SEED_RESERVE.minKg`, seznam je chybějící osivo (nejvýš, kolik výprava unese) u nejbližší
 * vsi okolí, platí se hřivnami, pak krávami nad ty, které ves drží (`surplusCows`), nejvýš
 * `SEED_RESERVE.maxCows`, do hodnoty osiva cenou cíle. Za méně než `minKg` osiva se nejede.
 */
function seedTrip(t: TripDay): void {
  const { state, day } = t;
  if (!SEED_RESERVE.days.some((d) => isOn(day, d))) return;
  const shortKg = seedShortKg(state, day);
  if (shortKg < SEED_RESERVE.minKg) return;
  const village = nearestNearby(state);
  if (!village) return;
  const haul = haulOf(t, village);
  const wantKg = Math.min(shortKg, roomKg(t, haul, transportCarts(t)));
  const grainPrice = priceKg(state, village.villageId, 'grain');
  const dueKg = wantKg * grainPrice;
  const barValue = priceKg(state, village.villageId, 'ironBars');
  const ironBars = Math.min(
    villageGoodStock(state, 'ironBars', day) - (haul.give.ironBars ?? 0),
    Math.max(0, Math.ceil(dueKg / barValue - EPSILON)),
  );
  let valueKg = Math.max(0, ironBars) * barValue;
  const cowValue = priceKg(state, village.villageId, 'cows');
  const cows = Math.min(
    surplusCows(state, day),
    villageGoodStock(state, 'cows', day) - (haul.give.cows ?? 0),
    SEED_RESERVE.maxCows,
    Math.max(0, Math.ceil((dueKg - valueKg) / cowValue - EPSILON)),
  );
  valueKg += Math.max(0, cows) * cowValue;
  if (Math.min(valueKg / grainPrice, wantKg) < SEED_RESERVE.minKg) return;
  addTo(haul.give, { ironBars, cows });
  addTo(haul.wants, { grain: wantKg });
  haul.loadKg += Math.max(wantKg, ironBars);
}

/**
 * Hřivny na kování vozu (kdykoli; wagons.md – Kování vozů, Martin 20. 10. 2026): vozy čekají na
 * kování (`ironOrderBarsKg` nad hřivnami vsi), ves nemá pracujícího kováře, pro hřivny nejde jiná
 * výprava vesničanů a nečeká se na zakázku → seznam je chybějící hřivny u nejbližší vsi okolí
 * s kovářem ze zprávy (ne té, která zakázku nevzala), platba z přebytku. Hřivny doma vůz dokončí
 * (`cartIronDay`).
 */
function ironBarsTrip(t: TripDay): void {
  const { state, day } = t;
  const missing = ironOrderBarsKg(state) - (state.crafts?.ironBarsKg ?? 0);
  if (missing <= EPSILON || ownCraftsmanWorks(state, 'smith')) return;
  if (onTheWay(state, 'ironBars', 'villagers') || placedOrder(state, day, 'ironBars')) return;
  const village = nearestWith(state, 'smith');
  if (!village || orderRefused(state, day, village.villageId, 'ironBars')) return;
  buyWith(t, haulOf(t, village), 'ironBars', missing);
}

/**
 * Vesničané na trhu – krok dne (mutuje stav; markets.md – Pravidla 9, Rozhodnutí plánu 3, bod 7),
 * hned za rezervou osiva: bez okolí nic. Napřed hotové zakázky, 15. 11. výrobky a vůz
 * (`planVillagerPurchases` – co se vyplatí), 1. 9. a 1. 3. osivo, kdykoli hřivny na kování vozu.
 * Co jde do jedné vsi, jede jednou výpravou (pobyt `MARKET.minStayDays`, `by: 'villagers'`), vsi
 * v pořadí okolí; odmítne-li ji `planMarketTrip`, dnes nejede. Zakázka, pro kterou výprava vyrazila,
 * je zase `open` do výsledku.
 */
export function villagerTripsDay(state: VillageState, day: number, coverage: CraftCoverage): void {
  const nearby = state.nearby;
  if (!nearby || nearby.villages.length === 0 || state.people.length === 0) return;
  const t = newTripDay(state, day, coverage);
  readyTrips(t);
  if (isOn(day, CRAFT_BUYING.day)) choosePurchases(t, poolOf(t));
  seedTrip(t);
  ironBarsTrip(t);
  for (const village of nearby.villages) {
    const haul = t.hauls.get(village.villageId);
    if (!haul || (Object.keys(haul.give).length === 0 && Object.keys(haul.wants).length === 0)) {
      continue;
    }
    const target = nearbyTarget(state, village.villageId);
    if (!target) continue;
    const sent = departMarketInPlace(
      state,
      day,
      { give: haul.give, wants: haul.wants, stayDays: MARKET.minStayDays },
      target,
      { by: 'villagers' },
    );
    if (!sent.ok) continue;
    for (const order of haul.orders) order.status = 'open';
  }
}
