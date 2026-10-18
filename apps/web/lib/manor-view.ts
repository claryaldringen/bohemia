// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou. Čistý modul – data ze stavu vsi.
import { villageManor, type Landscape, type VillageState } from '@bohemia/game';

/** Dvorec vojvody pro panel výběru. */
export interface VillageManor {
  /** Obydlí (id domácnosti), které je dvorcem. */
  dwellingId: number;
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  landscape: Landscape,
  day: number,
): VillageManor | null {
  void landscape;
  void day;
  const manor = villageManor(state);
  return manor ? { dwellingId: manor.id } : null;
}
