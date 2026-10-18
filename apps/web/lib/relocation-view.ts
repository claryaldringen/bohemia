import {
  BUILD_COSTS,
  STOCK_RESOURCES,
  obstaclesOf,
  relocationAffordability,
  relocationBlock,
  type ConstructionSummary,
  type DwellingType,
  type Landscape,
  type RelocationBlock,
  type ResourceAmounts,
  type VillageState,
} from '@bohemia/game';
import type { BuildOption } from './village-view';

// Přestěhování domácnosti v pohledu na ves (migration.md – Přestěhování domácnosti): cena nového
// domu bez lidí k osídlení a co dělá která domácnost. Čistý modul.

/** Typy nového domu, které hráč při stěhování volí. */
export const RELOCATION_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];

/** Přestěhování domácnosti v panelu výběru – stavba nového domu a její průběh. */
export interface HouseholdRelocation {
  constructionId: number;
  type: DwellingType;
  /** Průběh celé stavby i s kácením dřeva 0–1. */
  progress: number;
  /** Kolik stromů stavba ještě musí skácet. */
  treesToFell: number;
}

/**
 * Cena nového domu stěhující se domácnosti: práce a dřevo jako u obydlí, lidé k osídlení ne
 * (`relocationAffordability`). Dřevo = klády + dospělé stromy krajiny sídla, které jde skácet.
 */
export function relocationOptions(
  state: VillageState,
  landscape: Landscape,
): Record<DwellingType, BuildOption> {
  const obstacles = obstaclesOf(landscape);
  const option = (type: DwellingType): BuildOption => {
    const cost: ResourceAmounts = { ...BUILD_COSTS[type].upfront };
    delete cost.settlers; // přestěhování lidi k osídlení nechce
    const { affordable, missing } = relocationAffordability(state, type, obstacles);
    return {
      laborManDays: BUILD_COSTS[type].laborManDays,
      perHa: false,
      perSquare: false,
      upfront: STOCK_RESOURCES.flatMap((resource) => {
        const amount = cost[resource] ?? 0;
        return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
      }),
      blocked: null,
      affordable,
    };
  };
  return { zemnice: option('zemnice'), polozemnice: option('polozemnice') };
}

/** Rozestavěné přestěhování domácnosti `dwellingId` s průběhem, nebo null. */
export function householdRelocation(
  state: VillageState,
  constructions: readonly ConstructionSummary[],
  dwellingId: number,
): HouseholdRelocation | null {
  const c = state.constructions.find((x) => x.relocates === dwellingId);
  if (!c || c.dwellingType === null) return null;
  const summary = constructions.find((x) => x.id === c.id);
  return {
    constructionId: c.id,
    type: c.dwellingType,
    progress: summary?.progress ?? 0,
    treesToFell: summary?.treesToFell ?? 0,
  };
}

/** Proč se domácnost obydlí teď přestěhovat nemůže (null = může). */
export function householdRelocationBlock(
  state: VillageState,
  dwellingId: number,
): RelocationBlock | null {
  return relocationBlock(state, dwellingId);
}
