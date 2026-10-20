import { detCos, detSin, type Landscape, type ObstacleLayer } from '../landscape';
import { checkKilnSite, placementVillageOf } from './placement';
import { KILN_SITE } from './rules';
import type { VillageState } from './types';

// Místo milíře u dávky buků (crafts.md – Milíř u skácených buků; Martin 20. 10. 2026: „uhlíř udělá
// milíř na místě, kde na něj skácel buky“, podrobnosti návrh Clauda): rovné volné místo co nejblíž
// středu dávky – hledá se od středu po kružnicích (KILN_SITE.stepM do KILN_SITE.searchM), každé
// místo projde kontrolou `checkKilnSite` (placement.ts – ne na poli, cestě, v sadu, na hřbitově,
// v ohradě, u domů, pod posvátným dubem ani na háji). Deterministicky – body kružnic přes det-math.

/**
 * Místo milíře u dávky buků se středem `center` (m, na cm): první volné místo od středu po
 * kružnicích; když žádné není, střed dávky (rozhodnutí Clauda – uhlíř milíř postaví i tak, les
 * u dávky je jeho).
 */
export function findKilnSite(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  center: { x: number; z: number },
): { x: number; z: number } {
  const village = placementVillageOf(state, day);
  const round = (p: { x: number; z: number }): { x: number; z: number } => ({
    x: Math.round(p.x * 100) / 100,
    z: Math.round(p.z * 100) / 100,
  });
  const ok = (p: { x: number; z: number }): boolean =>
    checkKilnSite(landscape, village, p, obstacles).ok;
  const first = round(center);
  if (ok(first)) return first;
  for (let r = KILN_SITE.stepM; r <= KILN_SITE.searchM + 1e-9; r += KILN_SITE.stepM) {
    const count = Math.max(8, Math.round((2 * Math.PI * r) / KILN_SITE.stepM));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const p = round({ x: center.x + r * detCos(angle), z: center.z + r * detSin(angle) });
      if (ok(p)) return p;
    }
  }
  return first;
}
