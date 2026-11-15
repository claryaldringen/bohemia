import { detCos, detSin, type Landscape, type ObstacleLayer } from '../../landscape';
import { kilnViewBlockers } from './charcoal';
import { campRotation, type CampSite } from './burner-camp';
import { obstacleChangesAt, obstacleStatus } from '../core/obstacles';
import { checkCampSite, checkKilnSite, placementVillageOf } from '../placement/placement';
import { BURNER_CAMP, KILN_SITE } from '../rules';
import type { VillageState } from '../types';

// Místo milíře u dávky buků (crafts.md – Milíř u skácených buků; Martin 20. 10. 2026: „uhlíř udělá
// milíř na místě, kde na něj skácel buky“, podrobnosti návrh Clauda): rovné volné místo co nejblíž
// středu dávky – hledá se od středu po kružnicích (KILN_SITE.stepM), každé místo projde kontrolou
// `checkKilnSite` (placement.ts – ne na poli, cestě, v sadu, na hřbitově, v ohradě, u domů, pod
// posvátným dubem ani na háji). Přednost má místo, kde milíř bude vidět z výchozí kamery (od jihu
// nezakrývá dospělý strom – `kilnViewBlockers`, KILN_SITE.view): okraj lesa, paseka, louka.
// Stejně se u milíře hledá místo zemnice uhlíře (workshops.md – Uhlíř – zemnice u milíře –
// `findCampSite`, kontrola `checkCampSite`). Deterministicky – body kružnic přes det-math.

/**
 * Místo milíře u dávky buků se středem `center` (m, na cm; `batch` – buky dávky, ty padnou):
 * nejbližší volné místo, kde milíř z výchozí kamery nic nezakrývá, do KILN_SITE.view.searchM;
 * jinak nejbližší volné místo do KILN_SITE.searchM s nejmenším počtem stromů ve výhledu; když žádné
 * není, střed dávky (rozhodnutí Clauda – uhlíř milíř postaví i tak, les u dávky je jeho).
 */
export function findKilnSite(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  center: { x: number; z: number },
  batch: ReadonlySet<number | null> = new Set(),
): { x: number; z: number } {
  const village = placementVillageOf(state, day);
  const status = obstacleStatus(obstacleChangesAt(state, day));
  const round = (p: { x: number; z: number }): { x: number; z: number } => ({
    x: Math.round(p.x * 100) / 100,
    z: Math.round(p.z * 100) / 100,
  });
  const ok = (p: { x: number; z: number }): boolean =>
    checkKilnSite(landscape, village, p, obstacles).ok;
  let best: { p: { x: number; z: number }; blockers: number } | null = null;
  const consider = (p: { x: number; z: number }, r: number): boolean => {
    const blockers = kilnViewBlockers(obstacles, status, p, batch);
    if (blockers === 0) return ok(p);
    if (r <= KILN_SITE.searchM && (best === null || blockers < best.blockers) && ok(p)) {
      best = { p, blockers };
    }
    return false;
  };
  const first = round(center);
  if (consider(first, 0)) return first;
  for (let r = KILN_SITE.stepM; r <= KILN_SITE.view.searchM + 1e-9; r += KILN_SITE.stepM) {
    const count = Math.max(8, Math.round((2 * Math.PI * r) / KILN_SITE.stepM));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const p = round({ x: center.x + r * detCos(angle), z: center.z + r * detSin(angle) });
      if (consider(p, r)) return p;
    }
  }
  const fallback = best as { p: { x: number; z: number } } | null;
  return fallback ? fallback.p : first;
}

/**
 * Místo zemnice uhlíře u milíře se středem `kilnSite` (workshops.md – Uhlíř – zemnice u milíře,
 * návrh Clauda): po kružnicích po BURNER_CAMP.stepM od BURNER_CAMP.minFromKilnM (mimo milířiště)
 * do BURNER_CAMP.maxFromKilnM, body jako ve `findKilnSite` (od úhlu 0, na cm) – první místo, které
 * projde `checkCampSite` (půda jako u milíře, bez stromů). Zemnice stojí vchodem k milíři
 * (`campRotation`). Když žádné není, null – zemnice tentokrát nevznikne.
 */
export function findCampSite(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  kilnSite: { x: number; z: number },
): CampSite | null {
  const village = placementVillageOf(state, day);
  const { minFromKilnM, maxFromKilnM, stepM } = BURNER_CAMP;
  for (let r = minFromKilnM; r <= maxFromKilnM + 1e-9; r += stepM) {
    const count = Math.max(8, Math.round((2 * Math.PI * r) / stepM));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const site = {
        x: Math.round((kilnSite.x + r * detCos(angle)) * 100) / 100,
        z: Math.round((kilnSite.z + r * detSin(angle)) * 100) / 100,
        rotation: campRotation(angle),
      };
      if (checkCampSite(landscape, village, site, obstacles).ok) return site;
    }
  }
  return null;
}
