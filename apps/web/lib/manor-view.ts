// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou – zemské stezky do 8 směrů. Čistý modul – data ze
// stavu vsi.
import {
  obstaclesOf,
  trailOptions,
  villageManor,
  villageRoadWalk,
  type Landscape,
  type TrailOption,
  type VillageState,
} from '@bohemia/game';

/** Dvorec vojvody pro panel výběru. */
export interface VillageManor {
  /** Obydlí (id domácnosti), které je dvorcem. */
  dwellingId: number;
  /** Zemské stezky do 8 směrů – hotové, rozestavěné a nabídka nových (cena, délka, důvod). */
  trails: TrailOption[];
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  landscape: Landscape,
  day: number,
): VillageManor | null {
  const manor = villageManor(state);
  if (!manor || state.extinctDay !== undefined) return null;
  const obstacles = obstaclesOf(landscape);
  return {
    dwellingId: manor.id,
    trails: trailOptions(state, day, landscape, obstacles, villageRoadWalk(state, landscape)),
  };
}
