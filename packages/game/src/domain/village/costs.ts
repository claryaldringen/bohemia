import { CEMETERY, DWELLINGS, FOUNDING_COST_PER_HA } from './rules';
import type { DwellingType, VillageState } from './types';

// Ceny staveb a jestli na ně ves má (population.md – Nové obydlí, Odemčení). Práce
// (člověkodny) se platí postupně ze společné práce vsi během stavby – na tu ves „má“ vždy.
// Suroviny předem (dřevo, kámen… až vzniknou jejich mechaniky) se platí ze zásob při zahájení
// stavby; dokud je ves nemá, stavba nejde a tlačítko v nabídce staveb je zašedlé (jako v 0 A.D.).

/** Co hráč staví z nabídky staveb. */
export type BuildKind = DwellingType | 'field' | 'cemetery';

/** Zásoby vsi, ze kterých se smí platit předem. Zatím jen obilí; dřevo a kámen přibudou. */
export type StockResource = 'grain';

export const STOCK_RESOURCES: readonly StockResource[] = ['grain'];

/** Množství surovin (jen uvedené suroviny). */
export type ResourceAmounts = Partial<Record<StockResource, number>>;

export interface BuildCost {
  /** Člověkodny ze společné práce – u pole za hektar louky (`perHa`), u pohřebiště za čtverec. */
  laborManDays: number;
  perHa: boolean;
  /** Cena za čtverec (pohřebiště – cemetery.md); bez údaje ne. */
  perSquare?: boolean;
  /** Suroviny předem ze zásob vsi při zahájení stavby. */
  upfront: ResourceAmounts;
}

/** Ceny staveb. Žádná zatím nic předem nestojí – všechno je práce placená postupně. */
export const BUILD_COSTS: Record<BuildKind, BuildCost> = {
  zemnice: { laborManDays: DWELLINGS.zemnice.cost, perHa: false, upfront: {} },
  polozemnice: { laborManDays: DWELLINGS.polozemnice.cost, perHa: false, upfront: {} },
  field: { laborManDays: FOUNDING_COST_PER_HA.meadow, perHa: true, upfront: {} },
  cemetery: { laborManDays: CEMETERY.costPerSquare, perHa: false, perSquare: true, upfront: {} },
};

/** Zásoby vsi podle surovin. */
export function villageStock(state: VillageState): Record<StockResource, number> {
  return { grain: state.storesKg };
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

/** Má ves na stavbu suroviny předem? `costs` jen pro testy (hypotetické ceny). */
export function buildAffordability(
  state: VillageState,
  kind: BuildKind,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): Affordability {
  return affordability(villageStock(state), costs[kind].upfront);
}

/** Zaplatí suroviny předem ze zásob (mutuje stav – volat na klonu, po `buildAffordability`). */
export function payUpfront(
  state: VillageState,
  kind: BuildKind,
  costs: Record<BuildKind, BuildCost> = BUILD_COSTS,
): void {
  const { upfront } = costs[kind];
  state.storesKg -= upfront.grain ?? 0;
}
