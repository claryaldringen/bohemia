import { seasonHayYieldKg } from '../livestock/hay';
import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape/types';
import { craftNeeds, craftStocks, craftTargets, occupiedWorkshops } from './crafts';
import { toolEquipmentKg } from './iron';
import { storesOutlook } from '../fields/field-food';
import { expectedNetKg } from '../fields/fields';
import { villageLaborFactor } from '../people/happiness';
import { lordApartIds } from '../people/lord';
import { villageFoodCosts } from '../livestock/husbandry';
import { villageLegumesKg } from '../fields/legumes';
import { seedOutsideFoodKg, uneatenSeedKg } from '../fields/seed';
import { foodGrainReserveKg } from '../fields/threshing';
import { villageFoodNeed } from '../core/diet';
import { villageManor } from '../people/manor';
import { neighbourKind } from '../trade/neighbours';
import { ageGroup, laborPerDay } from '../people/people';
import {
  dailyMinPerHousehold,
  storageLossPerYear,
  woodToolsLaborFactor,
} from '../core/productivity';
import {
  CRAFT_BUYING,
  CRAFT_NEEDS,
  LEGUMES,
  NEIGHBOR_DIRECTIONS,
  TRADE,
  TRADE_GOOD_VALUES,
  WOOD_TOOLS,
} from '../rules';
import { buyValue, goodWorth, sellPrice } from '../trade/trade';
import { DIRECTION_VECTORS, builtTrail, trailTripDays } from '../trade/trail';
import type {
  ChronicleEvent,
  Craft,
  CraftCoverage,
  CraftPurchase,
  CraftPurchaseGoods,
  CraftPurchasePay,
  Direction8,
  LaborTarget,
  VillageState,
} from '../types';

// Nákup u sousedů (crafts.md – Nákup u sousedů; Martin 19. 10. 2026: „Nástroje ať vesničané
// obchodují individuálně. Např. pokud ve vedlejší vesnici kovář je a u nás ne, ať si vesničané od
// něj koupí nástroje za něco z toho, co vesnice produkuje. Sami si spočítají, jestli se jim to
// vyplatí. Až bude kovář u nás, budou pravděpodobněji nakupovat u něj, protože si ušetří cestu.
// S ostatními řemesly to bude stejné.“). Ves se jednou za rok po sklizni sama rozhodne (bez
// hráče – princip „co ulehčí práci, ves použije sama“, oxen.md): u každého výrobku řemeslníků
// (nástroje, keramika, dřevěné nářadí), na který nemá vlastního řemeslníka, porovná práci, kterou
// jí výrobek za dobu služby ušetří (meze produktivity), s prací za platbu (obilí nebo luštěniny
// z přebytku nad pojistkou zásob – cena jídla v práci, economy.ts) a za cestu malé skupiny
// k nejbližšímu sousedovi s řemeslníkem. Kupuje jen do zásoby (`craftTargets`) a jen když se to
// vyplatí; zboží přinesou s návratem. Kroky simulace mutují stav – volat na klonu; čisté funkce
// stavu, deterministicky, na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
const DAYS_PER_YEAR = 365;

/** Výrobek řemeslníků, který ves kupuje (kg v zásobách řemesel). */
export type CraftProduct = keyof CraftPurchaseGoods;

/** Výrobky řemeslníků (pořadí při shodě – nákup jde podle poměru ušetřené práce k ceně). */
export const CRAFT_PRODUCTS: readonly CraftProduct[] = ['toolsKg', 'potteryKg', 'woodToolsKg'];

/** Kdo výrobek dělá. */
export const PRODUCT_CRAFT: Readonly<Record<CraftProduct, Craft>> = {
  toolsKg: 'smith',
  potteryKg: 'potter',
  woodToolsKg: 'carpenter',
};

/** Řemesla, která soused může mít (v pořadí losu). */
const NEIGHBOUR_CRAFT_ORDER = ['smith', 'potter', 'carpenter'] as const;

/** Opotřebení výrobku za rok (podíl) – výrobek slouží 1 ÷ opotřebení let. */
const WEAR_PER_YEAR: Readonly<Record<CraftProduct, number>> = {
  toolsKg: CRAFT_NEEDS.toolWearPerYear,
  potteryKg: CRAFT_NEEDS.potteryBreakagePerYear,
  woodToolsKg: WOOD_TOOLS.wearPerYear,
};

/**
 * Řemeslníci souseda ve směru (crafts.md – Nákup u sousedů): podle toho, čím se soused živí
 * (`neighbourKind`) – řemeslníci mají kováře, hrnčíře i tesaře jistě, ostatní někdy
 * (CRAFT_BUYING.crafts). Deterministicky ze seedu vsi a směru.
 */
export function neighbourCrafts(seed: number, direction: Direction8): Craft[] {
  const odds = CRAFT_BUYING.crafts[neighbourKind(seed, direction)];
  const rnd = createRandom(deriveSeed(seed, `neighbour-crafts:${direction}`));
  // los pro každé řemeslo vždy – výsledek nezávisí na ostatních
  return NEIGHBOUR_CRAFT_ORDER.filter((craft) => rnd.next() < odds[craft]);
}

/**
 * Kolik kg obilí soused chce za kg výrobku (nabízené zboží – hodnota × 0,96, trade.md); nástroje
 * nejsou zboží obchodu (na obchod jdou hřivny – production-chains.md, Kovář), kovář souseda je
 * prodá za CRAFT_BUYING.toolsValueKg.
 */
export function productPrice(
  product: CraftProduct,
  state?: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day?: number,
): number {
  // po zlém roce kraje soused dá výrobek za méně obilí (`goodWorth`, disasters.md – Obchod)
  const worth = state && day !== undefined ? goodWorth(state, 'pottery', day) : 1;
  if (product === 'woodToolsKg') return worth * buyValue(CRAFT_BUYING.woodToolsValueKg);
  if (product === 'toolsKg') return worth * buyValue(CRAFT_BUYING.toolsValueKg);
  return worth * buyValue(TRADE_GOOD_VALUES.pottery.valueKg);
}

/**
 * Kolik výrobku ves má (kg): nástroje ve vybavení domácností (production-chains.md – Nástroje jako
 * vybavení domácností), keramika a dřevěné nářadí v zásobě.
 */
function productStock(state: VillageState, product: CraftProduct): number {
  if (product === 'toolsKg') return toolEquipmentKg(state);
  return craftStocks(state)[product] ?? 0;
}

/** Cesta k sousedovi – po hotové zemské stezce, nebo krajinou ke kraji mapy. */
export interface PurchaseRoute {
  direction: Direction8;
  /** Hotová zemská stezka (id), nebo null – jde se krajinou. */
  trailId: number | null;
  /** Dny cesty tam a zpět (i za krajem mapy). */
  days: number;
  /** Bod na kraji mapy ve směru (m) – kam skupina jde (scéna). */
  edge: { x: number; z: number };
}

/** Odkud se jde: dvorec vojvody, jinak první obydlí nebo staveniště; jinak střed mapy. */
function villageCenter(state: VillageState): { x: number; z: number } {
  const manor = villageManor(state);
  if (manor) return manor.position;
  const first =
    state.dwellings[0]?.position ?? state.constructions.find((c) => c.position)?.position;
  return first ?? { x: 0, z: 0 };
}

/**
 * Cesta k sousedovi ve směru (crafts.md – Nákup u sousedů): po hotové zemské stezce dny jako
 * výprava (`trailTripDays`); bez ní lidé jdou krajinou rovně ke kraji mapy – delší (× CRAFT_BUYING.
 * offTrailFactor) a den navíc. Bez krajiny (kalibrace) se počítá s mapou obvyklé velikosti.
 * `from` – odkud se jde krajinou (výchozí dvorec – nákup; tesař pro kování od dílny – wagons.md).
 */
export function purchaseRoute(
  state: VillageState,
  direction: Direction8,
  landscape: Landscape | null,
  from: { x: number; z: number } = villageCenter(state),
): PurchaseRoute {
  const half = landscape
    ? (landscape.size * landscape.cellSizeM) / 2
    : (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;
  const d = DIRECTION_VECTORS[direction];
  const reach = (p: number, v: number): number =>
    Math.abs(v) < EPSILON ? Infinity : ((v > 0 ? half : -half) - p) / v;
  const length = Math.max(0, Math.min(reach(from.x, d.x), reach(from.z, d.z)));
  const edge = { x: from.x + d.x * length, z: from.z + d.z * length };
  const trail = builtTrail(state, direction);
  if (trail) return { direction, trailId: trail.id, days: trailTripDays(trail.lengthM), edge };
  const days = trailTripDays(length * CRAFT_BUYING.offTrailFactor) + CRAFT_BUYING.offTrailExtraDays;
  return { direction, trailId: null, days, edge };
}

/** Nejbližší soused s řemeslníkem `craft` (nejméně dní cesty, při shodě v pořadí směrů). */
export function nearestCraftsman(
  state: VillageState,
  craft: Craft,
  landscape: Landscape | null,
): PurchaseRoute | null {
  let best: PurchaseRoute | null = null;
  for (const direction of NEIGHBOR_DIRECTIONS) {
    if (!neighbourCrafts(state.seed, direction).includes(craft)) continue;
    const route = purchaseRoute(state, direction, landscape);
    if (!best || route.days < best.days) best = route;
  }
  return best;
}

/** Kde ves výrobky řemeslníků bere – vlastní dílna, nebo nejbližší soused (panel). */
export interface CraftSource {
  product: CraftProduct;
  /** Vlastní pracující řemeslník – nikam se nechodí. */
  own: boolean;
  /** Nejbližší soused s řemeslníkem (bez vlastního), jinak null. */
  route: PurchaseRoute | null;
}

/**
 * Kde ves bere nástroje, keramiku a dřevěné nářadí (crafts.md – Nákup u sousedů): vlastní
 * pracující řemeslník má přednost, jinak nejbližší soused s řemeslníkem (kam by šla nakoupit).
 */
export function craftSources(state: VillageState, landscape: Landscape | null): CraftSource[] {
  return CRAFT_PRODUCTS.map((product) => {
    const own = ownCraftsmanWorks(state, PRODUCT_CRAFT[product]);
    return {
      product,
      own,
      route: own ? null : nearestCraftsman(state, PRODUCT_CRAFT[product], landscape),
    };
  });
}

/**
 * Pracuje ve vsi vlastní řemeslník, který výrobek dělá (obývaná dílna, která má vstupy – ne bez uhlí
 * ani bez dřeva)? Pak má přednost – ves u souseda nekupuje (crafts.md – Nákup u sousedů).
 */
export function ownCraftsmanWorks(state: VillageState, craft: Craft): boolean {
  return occupiedWorkshops(state, craft).some((d) => {
    const activity = d.workshop!.activity;
    return (
      activity !== 'no-charcoal' &&
      activity !== 'no-wood' &&
      activity !== 'no-ore' &&
      activity !== 'no-clay' &&
      activity !== 'empty'
    );
  });
}

/** Pokrytí potřeby zásobou 0–1 (jako `craftCoverage`). */
function coverageOf(stock: number, need: number): number {
  if (need <= 0) return stock > EPSILON ? 1 : 0;
  return Math.min(1, Math.max(0, stock / need));
}

/** Co ves o sobě ví pro rozhodnutí o nákupu (jednou za rozhodnutí). */
interface BuyingContext {
  day: number;
  coverage: CraftCoverage;
  needs: ReturnType<typeof craftNeeds>;
  /** Čistá úroda dílů v osevu za rok (kg) a seno letošní seče (kg). */
  grainKg: number;
  hayKg: number;
  /** Zásoby obilí a luštěnin (kg) – ztráty skladováním. */
  storedKg: number;
  households: number;
  /** Práce vsi za rok (čd, se štěstím). */
  yearlyLabor: number;
  /** Cena jídla v práci (čd na kg) při dnešním pokrytí nástroji. */
  grainPerKg: number;
}

/**
 * Kolik práce za rok ušetří pokrytí `to` místo `from` (crafts.md – Účinek, meze produktivity):
 * nástroje – polní práce dílů v osevu a seč (cena jídla v práci při obou pokrytích), keramika –
 * ztráty zásob a denní minimum domácností, dřevěné nářadí – práce celé vsi.
 */
function yearlySaving(
  state: VillageState,
  ctx: BuyingContext,
  product: CraftProduct,
  from: number,
  to: number,
): number {
  if (to <= from + EPSILON) return 0;
  if (product === 'toolsKg') {
    const before = villageFoodCosts(state, ctx.day, from);
    const after = villageFoodCosts(state, ctx.day, to);
    return (
      ctx.grainKg * (before.grainPerKg - after.grainPerKg) +
      ctx.hayKg * (before.hayPerKg - after.hayPerKg)
    );
  }
  if (product === 'potteryKg') {
    const stores = ctx.storedKg * (storageLossPerYear(from) - storageLossPerYear(to));
    const minimum =
      ctx.households * DAYS_PER_YEAR * (dailyMinPerHousehold(from) - dailyMinPerHousehold(to));
    return stores * ctx.grainPerKg + minimum;
  }
  return ctx.yearlyLabor * (woodToolsLaborFactor(to) - woodToolsLaborFactor(from));
}

/** Cena jídla v práci při jiném pokrytí nástroji (obilí na platbu za nástroje). */
function withToolCoverage(state: VillageState, ctx: BuyingContext, tools: number): BuyingContext {
  const costs = villageFoodCosts(state, ctx.day, tools);
  return { ...ctx, grainPerKg: costs.grainPerKg };
}

/** Čím ves může platit – přebytek obilí a luštěnin nad pojistkou zásob (kg) a cena v práci. */
export interface PaymentPool {
  /** Přebytek energie nad pojistkou k příští sklizni (kg obilí). */
  energyKg: number;
  grainKg: number;
  legumesKg: number;
}

/**
 * Přebytek obilí a luštěnin nad pojistkou zásob (výhled zásob – field-food.ts, `storesOutlook`). S `intoBuffer`
 * smí platba sáhnout i do pojistky – ne pod nulu zásob k příští sklizni (nutný malý výdaj, např.
 * kování koní – horses.md, Kování). Vymlácené zrno k platbě je bez zrna na dnešní jídlo
 * (`foodGrainReserveKg` – jako výmlat na dnešní jídlo), hromady osiva (okno i zimní osivo) a osiva jen na setí
 * (oprava, návrh Clauda 9. 11. 2026: Vlkov 1. 8. 873 zaplatil kování 41 kg vymláceného zrna
 * a příděl dne spadl na 0,55 – pojistka počítá i snopy, které se teprve vymlátí).
 */
export function paymentPool(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  intoBuffer = false,
): PaymentPool {
  // osivo, které ves ještě zaseje, a osivo jen na setí ves nezaplatí (jako `fieldStoresOutlook`)
  const outlook = storesOutlook(
    state,
    day,
    coverage.pottery,
    seedOutsideFoodKg(state, day, coverage.tools),
  );
  return {
    energyKg: Math.max(0, outlook.leftKg - (intoBuffer ? 0 : outlook.bufferKg)),
    grainKg: Math.max(
      0,
      state.storesKg - uneatenSeedKg(state) - foodGrainReserveKg(villageFoodNeed(state, day)),
    ),
    legumesKg: villageLegumesKg(state),
  };
}

/**
 * Zaplatí hodnotu `valueKg` (kg obilí u souseda) z přebytku (mutuje `pool`): nejlevnější v práci
 * i s nošením první (obilí, nebo luštěniny – cena jídla v práci a den cesty na každých 25 kg).
 * Vrátí platbu a práci za ni (čd) – nebo méně, když přebytek nestačí.
 */
function pay(
  state: VillageState,
  ctx: BuyingContext,
  pool: PaymentPool,
  valueKg: number,
  days: number,
): { pay: CraftPurchasePay; paidKg: number; labor: number; weightKg: number } {
  const carry = days / TRADE.porterKg;
  const options = [
    {
      key: 'grainKg' as const,
      value: sellPrice('grain'),
      labor: ctx.grainPerKg + carry,
      energy: 1,
    },
    {
      key: 'legumesKg' as const,
      value: sellPrice('legumes') * goodWorth(state, 'legumes', ctx.day),
      // luštěniny ves na poli nepěstuje (fields.md – Luštěniny, zrušeno) – kilogram stojí obilí,
      // které ves místo nich sní (návrh Clauda 9. 11. 2026)
      labor: ctx.grainPerKg * LEGUMES.energy + carry,
      energy: LEGUMES.energy,
    },
  ].sort((a, b) => a.labor / a.value - b.labor / b.value);
  const out: CraftPurchasePay = {};
  let left = valueKg;
  let labor = 0;
  let weightKg = 0;
  for (const option of options) {
    if (left <= EPSILON) break;
    const kg = Math.min(left / option.value, pool[option.key], pool.energyKg / option.energy);
    if (kg <= EPSILON) continue;
    out[option.key] = (out[option.key] ?? 0) + kg;
    pool[option.key] -= kg;
    pool.energyKg -= kg * option.energy;
    left -= kg * option.value;
    labor += kg * (option.labor - carry);
    weightKg += kg;
  }
  return { pay: out, paidKg: valueKg - Math.max(0, left), labor, weightKg };
}

/**
 * Kolik dospělých může jít (malá skupina – CRAFT_BUYING.groupShare dospělých, aspoň 1, nejvýš
 * maxGroup) – i nosiči platby za kování k vozu (wagons.md – Kování vozů).
 */
export function groupCap(state: VillageState, day: number): number {
  const adults = state.people.filter((p) => ageGroup(p, day) === 'adult').length;
  return Math.max(1, Math.min(CRAFT_BUYING.maxGroup, Math.floor(adults * CRAFT_BUYING.groupShare)));
}

/** Skupina a dny cesty pro náklad (kg tam a zpět): víc nákladu = víc cest tam a zpět. */
export function tripOf(
  loadKg: number,
  routeDays: number,
  cap: number,
): { group: number; days: number; labor: number } {
  const loads = Math.max(1, Math.ceil(loadKg / TRADE.porterKg - EPSILON));
  const group = Math.min(cap, loads);
  const rounds = Math.ceil(loads / group - EPSILON);
  const days = routeDays * rounds;
  return { group, days, labor: group * days };
}

/** Nákup, který ves zvažuje – výrobek, u koho, kolik, čím platí, co ušetří a co stojí. */
export interface PurchasePlan {
  product: CraftProduct;
  route: PurchaseRoute;
  kg: number;
  pay: CraftPurchasePay;
  /** Práce, kterou výrobek ušetří za dobu služby (čd). */
  savedManDays: number;
  /** Práce za platbu a cestu (čd). */
  costManDays: number;
  /** Vyplatí se – ves koupí. */
  worthIt: boolean;
}

/** Kolik práce nákup ušetří na čd, které stojí (platba a cesta). */
function ratio(plan: PurchasePlan): number {
  return plan.savedManDays / Math.max(EPSILON, plan.costManDays);
}

/**
 * Co by ves dnes nakoupila (crafts.md – Nákup u sousedů; stav nemění): u každého výrobku bez
 * vlastního pracujícího řemeslníka chybí do zásoby (`craftTargets`) – u nejbližšího souseda
 * s řemeslníkem by koupila, kolik zaplatí z přebytku, a porovnala práci, kterou to za dobu služby
 * výrobku (1 ÷ opotřebení let) ušetří, s prací za platbu a cestu (každý výrobek s vlastní cestou
 * – spojená cesta je levnější). Z jednoho přebytku napřed výrobek, který ušetří nejvíc práce na
 * práci, kterou stojí; ostatní pak podle zbylého přebytku (nevýhodné v plánu s `worthIt` false).
 */
export function planPurchases(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): PurchasePlan[] {
  const targets = craftTargets(state, day);
  const needs = craftNeeds(state, day);
  const costs = villageFoodCosts(state, day, coverage.tools);
  const sown = state.parts.filter((p) => p.state === 'sown' || p.state === 'ready');
  // cvičící vojvodova rodina práci vsi nedává (lord.md – Den rodiny)
  const apart = lordApartIds(state, day);
  const ctx: BuyingContext = {
    day,
    coverage,
    needs,
    grainKg: sown.reduce((sum, p) => sum + Math.max(0, expectedNetKg(p, day)), 0),
    hayKg: seasonHayYieldKg(state.hay?.mowing),
    storedKg: Math.max(0, state.storesKg) + villageLegumesKg(state),
    households: new Set(state.people.map((p) => p.dwellingId)).size,
    yearlyLabor:
      state.people.reduce((sum, p) => sum + (apart.has(p.id) ? 0 : laborPerDay(p, day)), 0) *
      DAYS_PER_YEAR *
      villageLaborFactor(state),
    grainPerKg: costs.grainPerKg,
  };
  const pool = paymentPool(state, day, coverage);
  const cap = groupCap(state, day);
  // nákup výrobku při dnešním přebytku `from` – na zkoušku (`trial` – přebytek po platbě)
  const consider = (
    product: CraftProduct,
    from: PaymentPool,
  ): { plan: PurchasePlan; trial: PaymentPool } | null => {
    const craft = PRODUCT_CRAFT[product];
    if (ownCraftsmanWorks(state, craft)) return null;
    const stock = productStock(state, product);
    const wanted = targets[product] - stock;
    if (wanted < CRAFT_BUYING.minKg) return null;
    const route = nearestCraftsman(state, craft, landscape);
    if (!route) return null;
    const price = productPrice(product, state, day);
    const need = needs[product];
    // obilí na platbu ves vypěstuje znovu – u nástrojů už s nimi (cena jídla v práci při pokrytí
    // po nákupu), u ostatních výrobků při dnešním pokrytí nástroji
    const payCtx =
      product === 'toolsKg' ? withToolCoverage(state, ctx, coverageOf(stock + wanted, need)) : ctx;
    // skupina unese za nejvýš CRAFT_BUYING.maxDays dní jen tolik – víc ves koupí příští rok
    const carryKg =
      cap * Math.max(1, Math.floor(CRAFT_BUYING.maxDays / route.days)) * TRADE.porterKg;
    const trial = { ...from };
    const paid = pay(state, payCtx, trial, Math.min(wanted * price, carryKg), route.days);
    const kg = paid.paidKg / price;
    if (kg < CRAFT_BUYING.minKg) return null;
    const trip = tripOf(Math.max(paid.weightKg, kg), route.days, cap);
    const years = 1 / WEAR_PER_YEAR[product];
    const saved =
      yearlySaving(state, ctx, product, coverageOf(stock, need), coverageOf(stock + kg, need)) *
      years;
    const cost = paid.labor + trip.labor;
    return {
      plan: {
        product,
        route,
        kg,
        pay: paid.pay,
        savedManDays: saved,
        costManDays: cost,
        worthIt: saved > cost + EPSILON,
      },
      trial,
    };
  };
  // z jednoho přebytku napřed to, co ušetří nejvíc práce na práci, kterou stojí (rozhodnutí
  // Clauda – crafts.md, Nákup u sousedů); po každém nákupu ostatní znovu podle zbylého přebytku
  const plans: PurchasePlan[] = [];
  let left: CraftProduct[] = [...CRAFT_PRODUCTS];
  while (left.length > 0) {
    const options = left
      .map((product) => consider(product, pool))
      .filter((o): o is NonNullable<typeof o> => o !== null);
    const best = options
      .filter((o) => o.plan.worthIt)
      .reduce<(typeof options)[number] | null>(
        (top, o) => (top === null || ratio(o.plan) > ratio(top.plan) + EPSILON ? o : top),
        null,
      );
    if (!best) {
      plans.push(...options.map((o) => o.plan));
      break;
    }
    Object.assign(pool, best.trial);
    plans.push(best.plan);
    left = options.filter((o) => o !== best).map((o) => o.plan.product);
  }
  return plans;
}

/** Je dnes den, kdy se ves rozhoduje o nákupu (CRAFT_BUYING.day – po sklizni)? */
export function isBuyingDay(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === CRAFT_BUYING.day.month && date.day === CRAFT_BUYING.day.day;
}

/**
 * Den rozhodnutí o nákupu (mutuje stav – krok dne): co se vyplatí, ves koupí – nákupy u téhož
 * souseda jdou jednou cestou, platba se hned odebere ze zásob a skupina vyrazí (lidé jsou celé dny
 * pryč). Mimo den rozhodnutí nic.
 */
export function startPurchases(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): void {
  if (!isBuyingDay(day) || state.people.length === 0) return;
  const plans = planPurchases(state, day, coverage, landscape).filter((p) => p.worthIt);
  if (plans.length === 0) return;
  const cap = groupCap(state, day);
  for (const direction of NEIGHBOR_DIRECTIONS) {
    const here = plans.filter((p) => p.route.direction === direction);
    if (here.length === 0) continue;
    const get: CraftPurchaseGoods = {};
    const paid: CraftPurchasePay = {};
    for (const plan of here) {
      get[plan.product] = (get[plan.product] ?? 0) + plan.kg;
      for (const key of ['grainKg', 'legumesKg'] as const) {
        if (plan.pay[key]) paid[key] = (paid[key] ?? 0) + plan.pay[key]!;
      }
    }
    const route = here[0]!.route;
    const goodsKg = Object.values(get).reduce((sum, kg) => sum + (kg ?? 0), 0);
    const payKg = (paid.grainKg ?? 0) + (paid.legumesKg ?? 0);
    const trip = tripOf(Math.max(goodsKg, payKg), route.days, cap);
    state.storesKg = Math.max(0, state.storesKg - (paid.grainKg ?? 0));
    if (paid.legumesKg) state.legumesKg = Math.max(0, villageLegumesKg(state) - paid.legumesKg);
    (state.purchases ??= []).push({
      direction,
      startedDay: day,
      group: trip.group,
      days: trip.days,
      tripDays: route.days,
      done: 0,
      trailId: route.trailId,
      edge: { x: Math.round(route.edge.x * 10) / 10, z: Math.round(route.edge.z * 10) / 10 },
      get,
      pay: paid,
    });
  }
}

/** Lidé, kteří jsou dnes s nákupem pryč (práce vsi bez nich – crafts.md, Nákup u sousedů). */
export function purchaseTravelers(state: Pick<VillageState, 'purchases'>): number {
  return (state.purchases ?? []).reduce((sum, p) => sum + (p.done < p.days ? p.group : 0), 0);
}

/**
 * Čára cesty nákupu krajinou bez stezky – od vsi (dvorec, první obydlí) rovně k bodu na kraji mapy
 * (karavana ve scéně – crafts.md, Nákup u sousedů).
 */
export function purchaseLine(
  state: VillageState,
  purchase: Pick<CraftPurchase, 'edge'>,
): { x: number; z: number }[] {
  const from = villageCenter(state);
  return [{ x: from.x, z: from.z }, { ...purchase.edge }];
}

/** Kam skupina nákupu jde – po zemské stezce, nebo krajinou ke kraji mapy (scéna). */
export function purchaseTarget(purchase: CraftPurchase): LaborTarget {
  return purchase.trailId !== null
    ? { kind: 'trail', id: purchase.trailId }
    : { kind: 'edge', direction: purchase.direction, ...purchase.edge };
}

/**
 * Den cesty nákupů (mutuje stav – krok práce): skupiny na cestě ujdou den. Vrátí, kde dnes
 * jsou a kolik lidí (rozdělení práce dne – karavana ve scéně).
 */
export function walkPurchases(state: VillageState): { target: LaborTarget; manDays: number }[] {
  const shares: { target: LaborTarget; manDays: number }[] = [];
  for (const purchase of state.purchases ?? []) {
    if (purchase.done >= purchase.days) continue;
    purchase.done += 1;
    shares.push({ target: purchaseTarget(purchase), manDays: purchase.group });
  }
  return shares;
}

/**
 * Vrácené nákupy (mutuje stav): nástroje do vybavení domácností (production-chains.md – Nástroje
 * jako vybavení domácností), keramika a dřevěné nářadí do zásob řemesel, kronika `crafts-bought`
 * (jen fakt – „Vesničané koupili nástroje u souseda (sever)“).
 */
export function finishPurchases(state: VillageState, day: number): ChronicleEvent[] {
  const purchases = state.purchases;
  if (!purchases || purchases.length === 0) return [];
  const events: ChronicleEvent[] = [];
  state.purchases = purchases.filter((purchase) => {
    if (purchase.done < purchase.days) return true;
    const stocks = (state.crafts ??= { charcoalKg: 0, potteryKg: 0 });
    if (purchase.get.toolsKg) {
      state.toolEquipmentKg = toolEquipmentKg(state) + purchase.get.toolsKg;
    }
    stocks.potteryKg += purchase.get.potteryKg ?? 0;
    if (purchase.get.woodToolsKg) {
      stocks.woodToolsKg = (stocks.woodToolsKg ?? 0) + purchase.get.woodToolsKg;
    }
    events.push({
      day,
      kind: 'crafts-bought',
      direction: purchase.direction,
      get: { ...purchase.get },
      pay: { ...purchase.pay },
    });
    return false;
  });
  if (state.purchases.length === 0) delete state.purchases;
  return events;
}

/** Kolik dní nákupu ještě zbývá (panel). */
export function purchaseDaysLeft(purchase: Pick<CraftPurchase, 'days' | 'done'>): number {
  return Math.max(0, purchase.days - purchase.done);
}

/** Hodnota platby u souseda (kg obilí) – panel. */
export function paymentValueKg(pay: CraftPurchasePay): number {
  return (pay.grainKg ?? 0) * sellPrice('grain') + (pay.legumesKg ?? 0) * sellPrice('legumes');
}
