import type { ObstacleLayer } from '../landscape';
import { availableSettlers } from './dwellings';
import { CEMETERY, DWELLING_TREES, DWELLINGS, FOUNDING_COST_PER_HA, ORCHARD } from './rules';
import type { DwellingType, VillageState } from './types';
import { woodSupply } from './wood';

// Ceny staveb a jestli na ně ves má (population.md – Nové obydlí, Odemčení). Práce
// (člověkodny) se platí postupně ze společné práce vsi během stavby – na tu ves „má“ vždy.
// Předem musí ves mít suroviny ze zásob (dřevo, kámen… – platí se při zahájení stavby) a u obydlí
// lidi k osídlení (Martin, 17. 10. 2026). Když něco chybí, stavba nejde a tlačítko v nabídce
// staveb je zašedlé s chybějící částí červeně (jako v 0 A.D.). Dřevo (forest.md): klády na
// hromadě + dospělé stromy sídla, které jde skácet – stavba ho při zahájení vyhradí.

/** Co hráč staví z nabídky staveb. */
export type BuildKind = DwellingType | 'field' | 'cemetery' | 'orchard';

/**
 * Co stavba potřebuje předem: obilí ze zásob, dřevo (stromy – klády z hromady, nebo dospělé
 * stromy ke skácení; kámen přibude) a lidé k osídlení (`availableSettlers` – mladý pár, který se
 * do nového obydlí nastěhuje). Lidi stavba neodebírá, jen je zamluví – rozestavěné obydlí
 * snižuje počet volných.
 */
export type StockResource = 'grain' | 'wood' | 'settlers';

export const STOCK_RESOURCES: readonly StockResource[] = ['grain', 'wood', 'settlers'];

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

/**
 * Ceny staveb – práce se platí postupně (u obydlí i s kácením blízkého lesa); obydlí (a později
 * řemeslné dílny) chtějí dřevo a jednu domácnost k osídlení, pole, sad a hřbitov nic.
 */
export const BUILD_COSTS: Record<BuildKind, BuildCost> = {
  zemnice: {
    laborManDays: DWELLINGS.zemnice.cost,
    perHa: false,
    upfront: { wood: DWELLING_TREES.zemnice, settlers: 1 },
  },
  polozemnice: {
    laborManDays: DWELLINGS.polozemnice.cost,
    perHa: false,
    upfront: { wood: DWELLING_TREES.polozemnice, settlers: 1 },
  },
  field: { laborManDays: FOUNDING_COST_PER_HA.meadow, perHa: true, upfront: {} },
  cemetery: { laborManDays: CEMETERY.costPerSquare, perHa: false, perSquare: true, upfront: {} },
  orchard: { laborManDays: ORCHARD.plantingPerHa, perHa: true, upfront: {} },
};

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
    settlers: Math.max(0, availableSettlers(state, state.lastDay)),
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
