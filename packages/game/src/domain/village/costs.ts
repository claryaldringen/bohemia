import type { ObstacleLayer } from '../landscape';
import { PEN } from './oxen';
import { NO_CRAFTS, foundingCostPerHa } from './productivity';
import {
  CEMETERY,
  DWELLING_TREES,
  DWELLINGS,
  dwellingBuildLabor,
  FELLING_MAN_DAYS_PER_TREE,
  HUMNO,
  ORCHARD,
  SACRED_BUILDINGS,
  workshopBuildLabor,
  workshopCost,
  workshopTrees,
} from './rules';
import type {
  BuildableDwellingType,
  Craft,
  DwellingType,
  SacredBuildingKind,
  VillageState,
} from './types';
import { STONE } from './rules-stone';
import { oakSupply, woodSupply, type WoodPlan } from './wood';

// Ceny staveb a jestli na ně ves má (population.md – Nové obydlí, Odemčení). Práce
// (člověkodny) se platí postupně ze společné práce vsi během stavby – na tu ves „má“ vždy.
// Předem musí ves mít suroviny ze zásob (dřevo, kámen… – platí se při zahájení stavby) a u obydlí
// lidi k osídlení (Martin, 17. 10. 2026). Když něco chybí, stavba nejde a tlačítko v nabídce
// staveb je zašedlé s chybějící částí červeně (jako v 0 A.D.). Dřevo (forest.md): klády na
// hromadě + dospělé stromy sídla, které jde skácet – stavba ho při zahájení vyhradí.

/**
 * Co hráč staví z nabídky staveb – obydlí, řemeslné dílny (crafts.md), pole a další stavby,
 * ohrada s přístřeškem (oxen.md – jeden čtverec louky, dřevo předem, osadníci ne) a humno
 * (production-chains.md – Humno: půdorys u kurzoru, dřevo předem, osadníci ne).
 */
export type BuildKind =
  | BuildableDwellingType
  | Craft
  | 'field'
  | 'cemetery'
  | 'orchard'
  | SacredBuildingKind
  | 'pen'
  | 'threshing-floor'
  | 'quarry';

/**
 * Co stavba potřebuje předem: obilí ze zásob, dřevo (stromy – klády z hromady, nebo dospělé
 * stromy ke skácení; kámen přibude), dospělé duby ke skácení (modla a svatyně – happiness.md)
 * a lidé k osídlení (`availableSettlers` – rodina ženatého syna nebo svobodný nejstarší syn
 * z přeplněného domu, kteří se do nového obydlí nastěhují – kinship.md). Lidi stavba neodebírá, jen je zamluví – rozestavěné
 * obydlí snižuje počet volných.
 */
export type StockResource = 'grain' | 'wood' | 'oaks';

export const STOCK_RESOURCES: readonly StockResource[] = ['grain', 'wood', 'oaks'];

/** Množství surovin (jen uvedené suroviny). */
export type ResourceAmounts = Partial<Record<StockResource, number>>;

export interface BuildCost {
  /**
   * Člověkodny ze společné práce – u pole a sadu za hektar louky (`perHa`), u pohřebiště za
   * čtverec.
   */
  laborManDays: number;
  perHa: boolean;
  /** Cena za čtverec (pohřebiště – cemetery.md); bez údaje ne. */
  perSquare?: boolean;
  /** Předem při zahájení stavby: suroviny ze zásob vsi a lidé k osídlení. */
  upfront: ResourceAmounts;
}

/** Cena řemeslné dílny – základní obydlí + 30 % práce i dřeva, domácnost k osídlení. */
function workshopBuildCost(craft: Craft): BuildCost {
  return {
    laborManDays: workshopCost(craft),
    perHa: false,
    upfront: { wood: workshopTrees(craft) },
  };
}

/**
 * Ceny staveb – práce se platí postupně (u obydlí i s kácením blízkého lesa); obydlí chtějí jen
 * dřevo (jdou postavit i bez lidí k osídlení – demolition.md, Martin 8. 11. 2026), řemeslné dílny
 * dřevo a jednu domácnost k osídlení, pole, sad a hřbitov nic.
 */
export const BUILD_COSTS: Record<BuildKind, BuildCost> = {
  zemnice: {
    laborManDays: DWELLINGS.zemnice.cost,
    perHa: false,
    upfront: { wood: DWELLING_TREES.zemnice },
  },
  polozemnice: {
    laborManDays: DWELLINGS.polozemnice.cost,
    perHa: false,
    upfront: { wood: DWELLING_TREES.polozemnice },
  },
  potter: workshopBuildCost('potter'),
  smith: workshopBuildCost('smith'),
  burner: workshopBuildCost('burner'),
  carpenter: workshopBuildCost('carpenter'),
  field: { laborManDays: foundingCostPerHa('meadow', NO_CRAFTS.tools), perHa: true, upfront: {} },
  cemetery: { laborManDays: CEMETERY.costPerSquare, perHa: false, perSquare: true, upfront: {} },
  orchard: { laborManDays: ORCHARD.plantingPerHa, perHa: true, upfront: {} },
  idol: {
    laborManDays: SACRED_BUILDINGS.idol.laborManDays,
    perHa: false,
    upfront: { oaks: SACRED_BUILDINGS.idol.oaks },
  },
  shrine: {
    laborManDays: SACRED_BUILDINGS.shrine.laborManDays,
    perHa: false,
    upfront: { oaks: SACRED_BUILDINGS.shrine.oaks },
  },
  // oxen.md – Ohrada: 40 člověkodní (i s kácením blízkého lesa) a 6 stromů
  pen: { laborManDays: PEN.laborManDays, perHa: false, upfront: { wood: PEN.trees } },
  // production-chains.md – Humno: jen mlat, 20 člověkodní a žádné dřevo
  'threshing-floor': {
    laborManDays: HUMNO.laborManDays,
    perHa: false,
    upfront: { wood: HUMNO.trees },
  },
  // fortifications.md – Kámen: lom na skalním výchozu ≈ 20 čd, bez dřeva (návrh Clauda)
  quarry: { laborManDays: STONE.quarryLaborManDays, perHa: false, upfront: {} },
};

/**
 * Práce na modle nebo svatyni bez kácení dubů – cena (happiness.md) v sobě má kácení blízkých
 * dubů jako cena obydlí kácení blízkého lesa.
 */
export function sacredBuildLabor(kind: SacredBuildingKind): number {
  const spec = SACRED_BUILDINGS[kind];
  return spec.laborManDays - spec.oaks * FELLING_MAN_DAYS_PER_TREE;
}

/**
 * Práce na modle nebo svatyni (člověkodny) jako při zahájení stavby: stavba bez dubů, překážky
 * na půdorysu (`obstacleCost`) a kácení dubů z plánu (`planSacredWood`).
 */
export function sacredLaborManDays(
  kind: SacredBuildingKind,
  obstacleCost: number,
  wood: Pick<WoodPlan, 'fell'>,
): number {
  return sacredBuildLabor(kind) + obstacleCost + wood.fell.reduce((sum, t) => sum + t.cost, 0);
}

/**
 * Práce na obydlí (člověkodny) jako při zahájení stavby (`startNewDwelling`, `foundVillage`):
 * stavba bez dřeva, překážky na vyklízené ploše (`obstacleCost`) a kácení stromů z plánu dřeva
 * (`planDwellingWood`) – klády z hromady práci nestojí. Rozhraní ji ukáže při umisťování.
 */
export function dwellingLaborManDays(
  type: DwellingType,
  obstacleCost: number,
  wood: Pick<WoodPlan, 'fell'>,
): number {
  return dwellingBuildLabor(type) + obstacleCost + wood.fell.reduce((sum, t) => sum + t.cost, 0);
}

/**
 * Práce na řemeslné dílně (člověkodny) jako při zahájení stavby (`startWorkshop`): dílna bez
 * dřeva, překážky na vyklízené ploše (i kolem milíře) a kácení stromů z plánu dřeva.
 */
export function workshopLaborManDays(
  craft: Craft,
  obstacleCost: number,
  wood: Pick<WoodPlan, 'fell'>,
): number {
  return workshopBuildLabor(craft) + obstacleCost + wood.fell.reduce((sum, t) => sum + t.cost, 0);
}

/**
 * Co ves má předem k dispozici – zásoby, dřevo a lidé k osídlení (ves dopočítaná do `lastDay`).
 * Dřevo = celé klády + dospělé stromy z vrstvy překážek `obstacles`, které jde skácet; bez vrstvy
 * (jen testy) stromů neomezeně.
 */
export function villageStock(
  state: VillageState,
  obstacles?: ObstacleLayer | null,
): Record<StockResource, number> {
  return {
    grain: state.storesKg,
    wood: woodSupply(state, obstacles),
    oaks: oakSupply(state, obstacles),
  };
}

export interface Affordability {
  affordable: boolean;
  /** Kolik které suroviny chybí – jen chybějící suroviny. */
  missing: ResourceAmounts;
}

/** Stačí zásoby na cenu předem? Chybějící množství po surovinách. */
export function affordability(
  stock: Record<StockResource, number>,
  cost: ResourceAmounts,
): Affordability {
  const missing: ResourceAmounts = {};
  for (const resource of STOCK_RESOURCES) {
    const short = (cost[resource] ?? 0) - stock[resource];
    if (short > 0) missing[resource] = short;
  }
  return { affordable: Object.keys(missing).length === 0, missing };
}

/**
 * Má ves na stavbu suroviny a lidi předem? `obstacles` = vrstva překážek krajiny (dřevo ke
 * kácení), `costs` jen pro testy (hypotetické ceny).
 */
export function buildAffordability(
  state: VillageState,
  kind: BuildKind,
  obstacles?: ObstacleLayer | null,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): Affordability {
  return affordability(villageStock(state, obstacles), costs[kind].upfront);
}

/**
 * Zaplatí suroviny předem ze zásob (mutuje stav – volat na klonu, po `buildAffordability`).
 * Lidé k osídlení se neplatí – zamluví je sama rozestavěná stavba. Dřevo bere stavba sama při
 * zahájení podle plánu (`planDwellingWood`, `takeWood`) – klády z hromady a vyhrazené stromy.
 */
export function payUpfront(
  state: VillageState,
  kind: BuildKind,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): void {
  const { upfront } = costs[kind];
  state.storesKg -= upfront.grain ?? 0;
}
