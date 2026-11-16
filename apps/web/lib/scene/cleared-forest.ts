import {
  NO_OBSTACLE_CHANGES,
  clearedForestOf,
  pointInPolygon,
  type ClearedForest,
  type Landscape,
  type ObstacleLayer,
  type Point,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';

// Vymýcený les ve scéně a na minimapě (fields.md – Krajina sídla a scéna, forest.md – Les
// ustupuje): kde ves les vykácela nebo ho vymýtila pro pole, scéna tam les přestane kreslit –
// plocha korun zapadne pod zem, minimapa ukáže paseku. Maska po políčkách krajiny se počítá ze
// stavu vsi (odstraněné, pokácené a dorůstající stromy, založené díly polí) – levně, jen při
// změně. Stavba v lese (Martin, 19. 10. 2026 – les se vyklučí) bere menší plochu než políčko:
// vyklízené plochy obydlí a dílen i s pruhem pod korunami (`forestClearingsOf` z jádra), natočené
// pozemky a půdorysy model a svatyní s pruhem v lese jsou paseky přesně podle tvaru (`areas`) –
// plocha korun nad nimi zapadne, okolní les zůstane. Čistý modul bez Babylonu. Výpočet masky
// (`clearedForest`, `ClearedForest`, `CLEARED_SHARE`) je v jádru (core/cleared-forest.ts) – hledání
// cesty vojska ho čte ze stejných funkcí; tady zůstává čtení ze scény a vzdálenosti k pasekám.

export { CLEARED_SHARE, clearedForest, type ClearedForest } from '@bohemia/game';

/**
 * Vymýcený les z pohledu na ves pro scénu: pohled se jen převede na zdroje jádra a výpočet
 * (`clearedForestOf` – díly polí, paseky pod obydlími, dílnami, modlami, svatyněmi a milířišti)
 * je tentýž jako ve `villageClearings` pro hledání cesty vojska.
 */
export function villageClearedForest(
  l: Landscape,
  layer: ObstacleLayer,
  village: Pick<SceneVillage, 'fields' | 'obstacles'> &
    Partial<Pick<SceneVillage, 'dwellings' | 'sacred' | 'kilns' | 'kilnRemnants'>>,
): ClearedForest {
  return clearedForestOf(l, layer, {
    obstacles: village.obstacles ?? NO_OBSTACLE_CHANGES,
    parts: village.fields.flatMap((field) =>
      field.parts.map((part) => ({
        cell: part.cell,
        x: part.x,
        z: part.z,
        size: part.size,
        ...(part.rotation !== undefined ? { rotation: part.rotation } : {}),
        founding: part.stage === 'founding',
      })),
    ),
    dwellings: (village.dwellings ?? []).map((d) => ({
      type: d.type,
      position: d.position,
      ...(d.craft ? { craft: d.craft } : {}),
      ...(d.plainShape ? { plainShape: true as const } : {}),
      plot: d.plot
        ? { x: d.plot.x, z: d.plot.z, size: d.plot.size, rotation: d.plot.rotation }
        : null,
    })),
    sacred: (village.sacred?.buildings ?? []).map((b) => ({ kind: b.kind, position: b.position })),
    kilns: [...(village.kilns ?? []), ...(village.kilnRemnants ?? [])],
  });
}

/** Klíč pasek pod stavbami (na decimetry) – změna tvaru či počtu je změna vymýceného lesa. */
export function clearedAreasKey(cleared: ClearedForest): string {
  return cleared.areas
    .map((area) => area.map(([x, z]) => `${Math.round(x * 10)},${Math.round(z * 10)}`).join(' '))
    .join('|');
}

/** Stejná vymýcená políčka a podíly (po desetinách) – minimapu ani scénu není třeba měnit. */
export function sameClearing(a: ClearedForest | null, b: ClearedForest | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.share.length !== b.share.length) return false;
  if (clearedAreasKey(a) !== clearedAreasKey(b)) return false;
  for (let i = 0; i < a.share.length; i++) {
    if (a.mask[i] !== b.mask[i]) return false;
    if (Math.round(a.share[i]! * 10) !== Math.round(b.share[i]! * 10)) return false;
  }
  return true;
}

/**
 * Vzdálenost bodu světa (m) k nejbližšímu vymýcenému políčku nebo pasece pod stavbou – k jejímu
 * okraji, uvnitř 0. Hledá jen do `maxM` (dál Infinity) – plocha korun se mění jen u paseky.
 */
export function clearingDistance(
  cleared: ClearedForest,
  x: number,
  z: number,
  maxM: number,
): number {
  const area = areaDistance(cleared.areas, x, z, maxM);
  if (cleared.tiles.length === 0) return area;
  return Math.min(area, tileDistance(cleared, x, z, maxM));
}

/** Vzdálenost bodu k nejbližší pasece pod stavbou (uvnitř 0), dál než `maxM` Infinity. */
function areaDistance(
  areas: readonly (readonly Point[])[],
  x: number,
  z: number,
  maxM: number,
): number {
  let best = Infinity;
  for (const area of areas) {
    const xs = area.map((p) => p[0]);
    const zs = area.map((p) => p[1]);
    if (
      x < Math.min(...xs) - maxM ||
      x > Math.max(...xs) + maxM ||
      z < Math.min(...zs) - maxM ||
      z > Math.max(...zs) + maxM
    ) {
      continue;
    }
    if (pointInPolygon([x, z], area)) return 0;
    for (let i = 0; i < area.length; i++) {
      best = Math.min(best, segmentDistance(x, z, area[i]!, area[(i + 1) % area.length]!));
    }
  }
  return best <= maxM ? best : Infinity;
}

/** Vzdálenost bodu od úsečky a–b. */
function segmentDistance(x: number, z: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Vzdálenost bodu k nejbližšímu vymýcenému políčku (uvnitř 0), dál než `maxM` Infinity. */
function tileDistance(cleared: ClearedForest, x: number, z: number, maxM: number): number {
  const { size, cellSizeM } = cleared;
  const half = (size * cellSizeM) / 2;
  const reach = Math.ceil(maxM / cellSizeM);
  const tx = Math.floor((x + half) / cellSizeM);
  const ty = Math.floor((z + half) / cellSizeM);
  let best = Infinity;
  for (let y = Math.max(0, ty - reach); y <= Math.min(size - 1, ty + reach); y++) {
    for (let xx = Math.max(0, tx - reach); xx <= Math.min(size - 1, tx + reach); xx++) {
      if (!cleared.mask[y * size + xx]) continue;
      const minX = xx * cellSizeM - half;
      const minZ = y * cellSizeM - half;
      const dx = Math.max(0, minX - x, x - (minX + cellSizeM));
      const dz = Math.max(0, minZ - z, z - (minZ + cellSizeM));
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best <= maxM ? best : Infinity;
}
