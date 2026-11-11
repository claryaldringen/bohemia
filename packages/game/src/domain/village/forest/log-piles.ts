// Hromady klád u cesty (forest.md – Mýcení a hromada klád; Martin 8. 11. 2026: „teď jsou klády
// u vsi, ale vlastně by měly zůstávat složené někde u cesty, nejblíž místu, kde byly pokáceny“):
// kam vesničané složí klády z mýcení. Místo se určí jednou při vzniku hromady a uloží se do stavu
// (`LogStack`) – cesty se mění, hromada se nestěhuje. Jen přesné operace (deterministická vrstva –
// dopočet po kouscích musí dát totéž místo).

import { villageManor } from '../people/manor';
import { LOG_PILES } from '../rules';
import type { RoadPoint, VillageState } from '../types';

/** Místo nové hromady klád: střed (m, svět) a bod osy cesty, u které leží (bez cesty chybí). */
export interface LogPilePlace {
  x: number;
  z: number;
  road?: RoadPoint;
}

/** Nejbližší bod osy cesty k bodu: bod, čtverec vzdálenosti a směr úseku (nenormovaný). */
interface RoadHit {
  x: number;
  z: number;
  d2: number;
  dx: number;
  dz: number;
}

/**
 * Nejbližší bod pevných cest vsi (vyšlapané, upravené i vozové – `state.roads`, bez opuštěných
 * kusů) k bodu `at`. Při shodě vzdálenosti vyhraje dřívější cesta v poli a dřívější úsek osy –
 * pořadí cest ve stavu je pevné. Bez cest null.
 */
export function nearestRoadPoint(
  state: Pick<VillageState, 'roads'>,
  at: { x: number; z: number },
): RoadHit | null {
  let best: RoadHit | null = null;
  for (const road of state.roads?.roads ?? []) {
    if (road.abandoned) continue;
    const points = road.points;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t =
        len2 > 0 ? Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / len2)) : 0;
      const x = a.x + t * dx;
      const z = a.z + t * dz;
      const ex = at.x - x;
      const ez = at.z - z;
      const d2 = ex * ex + ez * ez;
      if (best === null || d2 < best.d2) best = { x, z, d2, dx, dz };
    }
  }
  return best;
}

/**
 * Kam se složí klády z mýcení v místě `at` (forest.md – Mýcení a hromada klád): vedle nejbližšího
 * bodu pevné cesty vsi, `LOG_PILES.roadSideM` od osy na straně místa kácení (místo kácení přímo
 * na ose – vlevo od směru úseku); cesta dál než `LOG_PILES.roadReachM` nebo žádná – u místa
 * kácení. Volné místo (mimo cestu, díly polí a stavby) dohledá scéna od tohoto bodu.
 */
export function logPilePlace(
  state: Pick<VillageState, 'roads'>,
  at: { x: number; z: number },
): LogPilePlace {
  const hit = nearestRoadPoint(state, at);
  const reach = LOG_PILES.roadReachM;
  if (!hit || hit.d2 > reach * reach) return { x: at.x, z: at.z };
  let nx = at.x - hit.x;
  let nz = at.z - hit.z;
  let len = Math.sqrt(hit.d2);
  if (len < 1e-6) {
    // místo kácení na ose: kolmo vlevo od směru úseku (pevná strana)
    nx = -hit.dz;
    nz = hit.dx;
    len = Math.sqrt(nx * nx + nz * nz);
    if (len < 1e-9) return { x: at.x, z: at.z, road: { x: hit.x, z: hit.z } };
  }
  const side = LOG_PILES.roadSideM / len;
  return {
    x: roundCm(hit.x + nx * side),
    z: roundCm(hit.z + nz * side),
    road: { x: roundCm(hit.x), z: roundCm(hit.z) },
  };
}

/** Na centimetry – místo hromady se ukládá do JSON jako osy cest. */
function roundCm(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Kde se skládají klády, které do vsi přišly odjinud (obchod, dávky vazalství): u cesty nejblíž
 * dvorci, bez něj prvnímu obydlí nebo staveništi obydlí; bez nich střed mapy (návrh Clauda).
 */
export function logArrivalPoint(state: VillageState): { x: number; z: number } {
  const manor = villageManor(state);
  const position =
    manor?.position ??
    state.dwellings[0]?.position ??
    state.constructions.find((c) => c.position !== null)?.position ??
    null;
  return position ? { x: position.x, z: position.z } : { x: 0, z: 0 };
}
