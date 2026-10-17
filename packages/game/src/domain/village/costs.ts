import { availableSettlers } from './dwellings';
import { CEMETERY, DWELLINGS, FOUNDING_COST_PER_HA, ORCHARD } from './rules';
import type { DwellingType, VillageState } from './types';

// Ceny staveb a jestli na ně ves má (population.md – Nové obydlí, Odemčení). Práce
// (člověkodny) se platí postupně ze společné práce vsi během stavby – na tu ves „má“ vždy.
// Předem musí ves mít suroviny ze zásob (dřevo, kámen… až vzniknou jejich mechaniky – platí se
// při zahájení stavby) a u obydlí lidi k osídlení (Martin, 17. 10. 2026). Když něco chybí,
// stavba nejde a tlačítko v nabídce staveb je zašedlé s chybějící částí červeně (jako v 0 A.D.).

/** Co hráč staví z nabídky staveb. */
export type BuildKind = DwellingType | 'field' | 'cemetery' | 'orchard';

/**
 * Co stavba potřebuje předem: obilí ze zásob (dřevo a kámen přibudou) a lidé k osídlení
 * (`availableSettlers` – mladý pár, který se do nového obydlí nastěhuje). Lidi stavba
 * neodebírá, jen je zamluví – rozestavěné obydlí snižuje počet volných.
 */
export type StockResource = 'grain' | 'settlers';

export const STOCK_RESOURCES: readonly StockResource[] = ['grain', 'settlers'];

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
 * Ceny staveb. Žádná zatím nestojí suroviny – práce se platí postupně; obydlí (a později
 * řemeslné dílny) chtějí jednu domácnost k osídlení, pole, sad a hřbitov nikoho.
 */
export const BUILD_COSTS: Record<BuildKind, BuildCost> = {
  zemnice: { laborManDays: DWELLINGS.zemnice.cost, perHa: false, upfront: { settlers: 1 } },
  polozemnice: { laborManDays: DWELLINGS.polozemnice.cost, perHa: false, upfront: { settlers: 1 } },
  field: { laborManDays: FOUNDING_COST_PER_HA.meadow, perHa: true, upfront: {} },
  cemetery: { laborManDays: CEMETERY.costPerSquare, perHa: false, perSquare: true, upfront: {} },
  orchard: { laborManDays: ORCHARD.plantingPerHa, perHa: true, upfront: {} },
};

/** Co ves má předem k dispozici – zásoby a lidé k osídlení (ves dopočítaná do `lastDay`). */
export function villageStock(state: VillageState): Record<StockResource, number> {
  return {
    grain: state.storesKg,
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

/** Má ves na stavbu suroviny a lidi předem? `costs` jen pro testy (hypotetické ceny). */
export function buildAffordability(
  state: VillageState,
  kind: BuildKind,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): Affordability {
  return affordability(villageStock(state), costs[kind].upfront);
}

/**
 * Zaplatí suroviny předem ze zásob (mutuje stav – volat na klonu, po `buildAffordability`).
 * Lidé k osídlení se neplatí – zamluví je sama rozestavěná stavba.
 */
export function payUpfront(
  state: VillageState,
  kind: BuildKind,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): void {
  const { upfront } = costs[kind];
  state.storesKg -= upfront.grain ?? 0;
}
