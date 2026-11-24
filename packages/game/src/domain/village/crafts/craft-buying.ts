import type { Landscape } from '../../landscape';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape/types';
import { craftNeeds, craftStocks, occupiedWorkshops } from './crafts';
import { addCart } from './carts';
import { toolEquipmentKg } from './iron';
import { storesOutlook } from '../fields/field-food';
import { expectedNetKg } from '../fields/fields';
import { villageLegumesKg } from '../fields/legumes';
import { seedOutsideFoodKg, uneatenSeedKg } from '../fields/seed';
import { foodGrainReserveKg } from '../fields/threshing';
import { villageFoodNeed } from '../core/diet';
import {
  dailyMinPerHousehold,
  storageLossPerYear,
  woodToolsLaborFactor,
} from '../core/productivity';
import { seasonHayYieldKg } from '../livestock/hay';
import { villageFoodCosts } from '../livestock/husbandry';
import { villageLaborFactor } from '../people/happiness';
import { lordApartIds } from '../people/lord';
import { villageManor } from '../people/manor';
import { laborPerDay } from '../people/people';
import { CRAFT_BUYING, CRAFT_NEEDS, LEGUMES, TRADE, WOOD_TOOLS } from '../rules';
import { sellPrice } from '../trade/trade';
import { ORDER_CRAFT } from '../trade/goods';
import { DIRECTION_VECTORS, builtTrail, trailTripDays } from '../trade/trail';
import type {
  ChronicleEvent,
  Craft,
  CraftCoverage,
  CraftPurchase,
  CraftPurchaseGoods,
  CraftPurchasePay,
  Direction8,
  Dwelling,
  LaborTarget,
  TradeGoods,
  VillageState,
} from '../types';

// Výrobky řemeslníků – nástroje, keramika a dřevěné nářadí – má ves od vlastních pracujících
// řemeslníků (`craftSources`), nebo je vesničané koupí na trhu sousední vsi (markets.md – Pravidla 9,
// Rozhodnutí plánu 3, bod 7; trade/villager-trips.ts). Smyšlení sousedé zrušeni (markets.md –
// Pravidla 1); nákup uložený na cestě ve starší vsi doběhne (markets.md bod 10): skupina dojde,
// přinese výrobky a koupený vůz (`walkPurchases`, `finishPurchases`). Zůstává i cesta ke kraji mapy
// ve směru (`purchaseRoute` – karavany zásilek, cizí kovář ze starší kroniky), přebytek k platbě
// (`paymentPool` – ohrada koní, vesničané na trhu, kovář souseda) a rozhodnutí „vyplatí se“ dřívějšího nákupu
// u sousedů @ b4f8dadc (`BuyingContext`, `yearlySaving`, `withToolCoverage`, `pay` – vzorce beze
// změny). Kroky simulace mutují stav – volat na klonu; čisté funkce stavu, deterministicky, na
// kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
const DAYS_PER_YEAR = 365;

/** Výrobek řemeslníků (kg v zásobách řemesel; nákup na cestě ho nese v `CraftPurchase.get`). */
export type CraftProduct = keyof CraftPurchaseGoods;

/** Výrobky řemeslníků v pořadí panelu a kroniky. */
export const CRAFT_PRODUCTS: readonly CraftProduct[] = ['toolsKg', 'potteryKg', 'woodToolsKg'];

/** Kdo výrobek dělá – z jediné mapy řemesel výrobků `ORDER_CRAFT` (trade/goods.ts). */
export const PRODUCT_CRAFT: Readonly<Record<CraftProduct, Craft>> = {
  toolsKg: ORDER_CRAFT.tools,
  potteryKg: ORDER_CRAFT.pottery,
  woodToolsKg: ORDER_CRAFT.woodTools,
};

/** Cesta ke kraji mapy ve směru – po hotové zemské stezce, nebo krajinou. */
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
 * Cesta ke kraji mapy ve směru (crafts.md – Nákup u sousedů; karavana zásilky, cizí kovář ze starší
 * kroniky): po hotové zemské stezce dny jako výprava (`trailTripDays`); bez ní lidé jdou krajinou
 * rovně ke kraji mapy – delší (× CRAFT_BUYING.offTrailFactor) a den navíc. Bez krajiny (kalibrace)
 * se počítá s mapou obvyklé velikosti. Krajinou se jde od dvorce (`villageCenter`).
 */
export function purchaseRoute(
  state: VillageState,
  direction: Direction8,
  landscape: Landscape | null,
): PurchaseRoute {
  const from = villageCenter(state);
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

/** Kde ves výrobek řemeslníků bere (panel dvorce). */
export interface CraftSource {
  product: CraftProduct;
  /** Vlastní pracující řemeslník; jinak ho ves nemá odkud vzít. */
  own: boolean;
}

/**
 * Kde ves bere nástroje, keramiku a dřevěné nářadí: jen od vlastního pracujícího řemeslníka
 * (`ownCraftsmanWorks`) – nákup u sousedů zrušen (markets.md – Pravidla 1).
 */
export function craftSources(state: VillageState): CraftSource[] {
  return CRAFT_PRODUCTS.map((product) => ({
    product,
    own: ownCraftsmanWorks(state, PRODUCT_CRAFT[product]),
  }));
}

/**
 * Pracující dílny řemesla v pořadí id: obývané dílny, které mají vstupy – ne bez uhlí, dřeva, rudy
 * ani hlíny (kovárny, odkud může jít kovář ke koním souseda – smith-visit.ts).
 */
export function workingWorkshops(state: VillageState, craft: Craft): Dwelling[] {
  return occupiedWorkshops(state, craft).filter((d) => {
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

/**
 * Pracuje ve vsi vlastní řemeslník, který výrobek dělá (obývaná dílna, která má vstupy – ne bez uhlí,
 * dřeva, rudy ani hlíny – `workingWorkshops`)?
 */
export function ownCraftsmanWorks(state: VillageState, craft: Craft): boolean {
  return workingWorkshops(state, craft).length > 0;
}

/**
 * Čím ves může platit – přebytek obilí a luštěnin nad pojistkou zásob (kg; ohrada koní, vesničané
 * na trhu), u kováře souseda i z pojistky (`intoBuffer`).
 */
export interface PaymentPool {
  /** Přebytek energie nad pojistkou k příští sklizni (kg obilí); s `intoBuffer` i pojistka. */
  energyKg: number;
  grainKg: number;
  legumesKg: number;
}

/**
 * Přebytek obilí a luštěnin nad pojistkou zásob (výhled zásob – field-food.ts, `storesOutlook`).
 * Vymlácené zrno k platbě je bez zrna na dnešní jídlo (`foodGrainReserveKg` – jako výmlat na dnešní
 * jídlo), hromady osiva (okno i zimní osivo) a osiva jen na setí
 * (oprava, návrh Clauda 9. 11. 2026: Vlkov 1. 8. 873 zaplatil kování 41 kg vymláceného zrna
 * a příděl dne spadl na 0,55 – pojistka počítá i snopy, které se teprve vymlátí). `intoBuffer` –
 * platí se i z pojistky (kovář souseda, dřívější návrh Clauda „cizí kovář platí i z pojistky“ –
 * markets.md, Rozhodnutí plánu 3, bod 9; port z b4f8dadc).
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

// --- vyplatí se? (port dřívějšího nákupu u sousedů @ b4f8dadc, vzorce beze změny) --------------

/** Opotřebení výrobku za rok (podíl) – výrobek slouží 1 ÷ opotřebení let. */
export const PRODUCT_WEAR_PER_YEAR: Readonly<Record<CraftProduct, number>> = {
  toolsKg: CRAFT_NEEDS.toolWearPerYear,
  potteryKg: CRAFT_NEEDS.potteryBreakagePerYear,
  woodToolsKg: WOOD_TOOLS.wearPerYear,
};

/**
 * Kolik výrobku ves má (kg): nástroje ve vybavení domácností (production-chains.md – Nástroje jako
 * vybavení domácností), keramika a dřevěné nářadí v zásobě.
 */
export function productStock(state: VillageState, product: CraftProduct): number {
  if (product === 'toolsKg') return toolEquipmentKg(state);
  return craftStocks(state)[product] ?? 0;
}

/** Pokrytí potřeby zásobou 0–1 (jako `craftCoverage`). */
export function productCoverage(stock: number, need: number): number {
  if (need <= 0) return stock > EPSILON ? 1 : 0;
  return Math.min(1, Math.max(0, stock / need));
}

/** Co ves o sobě ví pro rozhodnutí o nákupu (jednou za rozhodnutí). */
export interface BuyingContext {
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
 * Co ves o sobě ví pro rozhodnutí o nákupu (jako dřívější `planPurchases` @ b4f8dadc): úroda dílů
 * v osevu, seno letošní seče, zásoby, domácnosti, práce vsi za rok bez cvičící rodiny vojvody
 * (lord.md – Den rodiny) a cena jídla v práci při dnešním pokrytí nástroji.
 */
export function buyingContext(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): BuyingContext {
  const costs = villageFoodCosts(state, day, coverage.tools);
  const sown = state.parts.filter((p) => p.state === 'sown' || p.state === 'ready');
  // cvičící vojvodova rodina práci vsi nedává (lord.md – Den rodiny)
  const apart = lordApartIds(state, day);
  return {
    day,
    coverage,
    needs: craftNeeds(state, day),
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
}

/**
 * Kolik práce za rok ušetří pokrytí `to` místo `from` (crafts.md – Účinek, meze produktivity):
 * nástroje – polní práce dílů v osevu a seč (cena jídla v práci při obou pokrytích), keramika –
 * ztráty zásob a denní minimum domácností, dřevěné nářadí – práce celé vsi.
 */
export function yearlySaving(
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
export function withToolCoverage(
  state: VillageState,
  ctx: BuyingContext,
  tools: number,
): BuyingContext {
  const costs = villageFoodCosts(state, ctx.day, tools);
  return { ...ctx, grainPerKg: costs.grainPerKg };
}

/** Hodnota kg obilí a luštěnin u cíle (kg obilí – cena trhu cíle × `MARKET.grainKgPerCoin`). */
export interface PayValues {
  grain: number;
  legumes: number;
}

/**
 * Zaplatí hodnotu `valueKg` (kg obilí u cíle) z přebytku (mutuje `pool`): nejlevnější v práci
 * i s nošením první (obilí, nebo luštěniny – cena jídla v práci a den cesty na každých 25 kg).
 * Vrátí platbu (zboží trhu) a práci za ni (čd) – nebo méně, když přebytek nestačí. Hodnoty kg
 * obilí a luštěnin jsou ceny cíle (`values`; dřív `sellPrice` × `goodWorth`).
 */
export function pay(
  ctx: BuyingContext,
  pool: PaymentPool,
  valueKg: number,
  days: number,
  values: PayValues,
): { pay: TradeGoods; paidKg: number; labor: number; weightKg: number } {
  const carry = days / TRADE.porterKg;
  const options = [
    {
      key: 'grainKg' as const,
      good: 'grain' as const,
      value: values.grain,
      labor: ctx.grainPerKg + carry,
      energy: 1,
    },
    {
      key: 'legumesKg' as const,
      good: 'legumes' as const,
      value: values.legumes,
      // luštěniny ves na poli nepěstuje (fields.md – Luštěniny, zrušeno) – kilogram stojí obilí,
      // které ves místo nich sní (návrh Clauda 9. 11. 2026)
      labor: ctx.grainPerKg * LEGUMES.energy + carry,
      energy: LEGUMES.energy,
    },
  ].sort((a, b) => a.labor / a.value - b.labor / b.value);
  const out: TradeGoods = {};
  let left = valueKg;
  let labor = 0;
  let weightKg = 0;
  for (const option of options) {
    if (left <= EPSILON) break;
    const kg = Math.min(left / option.value, pool[option.key], pool.energyKg / option.energy);
    if (kg <= EPSILON) continue;
    out[option.good] = (out[option.good] ?? 0) + kg;
    pool[option.key] -= kg;
    pool.energyKg -= kg * option.energy;
    left -= kg * option.value;
    labor += kg * (option.labor - carry);
    weightKg += kg;
  }
  return { pay: out, paidKg: valueKg - Math.max(0, left), labor, weightKg };
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
 * jako vybavení domácností), keramika a dřevěné nářadí do zásob řemesel, koupený vůz mezi vozy vsi
 * (crafts.md – Nákup u sousedů, Vozy), kronika `crafts-bought` (jen fakt – „Vesničané koupili
 * nástroje u souseda (sever)“).
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
    if (purchase.cart) addCart(state, purchase.cart, day);
    events.push({
      day,
      kind: 'crafts-bought',
      direction: purchase.direction,
      get: { ...purchase.get },
      pay: { ...purchase.pay },
      ...(purchase.cart ? { cart: purchase.cart } : {}),
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
