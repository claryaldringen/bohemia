import type { Landscape } from '../../landscape';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../../landscape/types';
import { occupiedWorkshops } from './crafts';
import { addCart } from './carts';
import { toolEquipmentKg } from './iron';
import { storesOutlook } from '../fields/field-food';
import { villageLegumesKg } from '../fields/legumes';
import { seedOutsideFoodKg, uneatenSeedKg } from '../fields/seed';
import { foodGrainReserveKg } from '../fields/threshing';
import { villageFoodNeed } from '../core/diet';
import { villageManor } from '../people/manor';
import { CRAFT_BUYING } from '../rules';
import { sellPrice } from '../trade/trade';
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

// Výrobky řemeslníků – nástroje, keramika a dřevěné nářadí – má ves jen od vlastních pracujících
// řemeslníků (`craftSources`). Nákup u sousedů zrušen (markets.md – Pravidla 1; Martin 22. 11. 2026:
// „Ves by měla být schopná přežít a rozvíjet se dle současných pravidel i bez obchodu“; vrátí se
// s trhem skutečných vsí – markets.md bod 9). Nákup uložený na cestě ve starší vsi doběhne
// (markets.md bod 10): skupina dojde, přinese výrobky a koupený vůz (`walkPurchases`,
// `finishPurchases`). Zůstává i cesta ke kraji mapy ve směru (`purchaseRoute` – karavany zásilek,
// cizí kovář ze starší kroniky) a přebytek k platbě (`paymentPool` – ohrada koní). Kroky simulace
// mutují stav – volat na klonu; čisté funkce stavu, deterministicky, na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Výrobek řemeslníků (kg v zásobách řemesel; nákup na cestě ho nese v `CraftPurchase.get`). */
export type CraftProduct = keyof CraftPurchaseGoods;

/** Výrobky řemeslníků v pořadí panelu a kroniky. */
export const CRAFT_PRODUCTS: readonly CraftProduct[] = ['toolsKg', 'potteryKg', 'woodToolsKg'];

/** Kdo výrobek dělá. */
export const PRODUCT_CRAFT: Readonly<Record<CraftProduct, Craft>> = {
  toolsKg: 'smith',
  potteryKg: 'potter',
  woodToolsKg: 'carpenter',
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
 * se počítá s mapou obvyklé velikosti. `from` – odkud se jde krajinou (výchozí dvorec).
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
 * Pracuje ve vsi vlastní řemeslník, který výrobek dělá (obývaná dílna, která má vstupy – ne bez uhlí,
 * dřeva, rudy ani hlíny)?
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

/** Čím ves může platit – přebytek obilí a luštěnin nad pojistkou zásob (kg; ohrada koní). */
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
