import type { Landscape, ObstacleLayer } from '../../landscape';
import { cloneState } from '../core/clone';
import type { LegacyRoadFields, VillageRoads, VillageState } from '../types';
import { tidyRoadsNow } from './roads';

/**
 * Starší ves přejde na nový systém cest (paths.md – Převod starých vsí; Martin 23. 10. 2026:
 * jednou a idempotentně). Hned při načtení se síť uklidí jako měsíční úklid (`tidyRoadsNow` –
 * souběžné cesty se sloučí a vozová pohltí slabší, copánky, díry, spojení, pahýly, cesty k vchodům,
 * křižovatky z ramen s provozem), upravené a vozové cesty zůstanou a nepoužívané začnou zarůstat
 * (stav kusů dal `withRoadCondition`). Smažou se pole, která nový systém nepotřebuje
 * (`LegacyRoadFields`), a ves dostane příznak `roads.v2`. Ves bez cest vrátí týž objekt; s příznakem
 * také. Volá se až po `withRoutes` (kotvy a trasy) a po vyšlapanosti ze starých kandidátů.
 */
export function withRoadsV2(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer | null,
): VillageState {
  const roads = state.roads;
  if (!roads || roads.v2) return state;
  const next = cloneState(state);
  const mine = next.roads!;
  tidyRoadsNow(next, landscape, obstacles);
  const legacy: VillageRoads & LegacyRoadFields = mine;
  delete legacy.candidates;
  delete legacy.endsChecked;
  delete legacy.parallelsChecked;
  mine.v2 = true;
  return next;
}
