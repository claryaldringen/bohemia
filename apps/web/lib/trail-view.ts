// Zemské stezky ve scéně (docs/design/trade.md – Zemská stezka): osa od dvorce ke kraji mapy
// složená z úseků pevných cest a průběh stavby po úsecích od vsi ven (vytyčení hned, úprava
// roste na úseku, kam stavba došla). Čistý modul – data ze stavu vsi.
import {
  trailWorkFront,
  villageManor,
  villageTrails,
  type RoadGrade,
  type VillageState,
} from '@bohemia/game';
import type { SceneTrail } from './village-view';

/** Osa stezky – úseky za sebou, každý otočený tak, aby navazoval na předchozí (od dvorce). */
export function sceneTrails(
  state: Pick<VillageState, 'trails' | 'roads' | 'dwellings' | 'manorId' | 'constructions'>,
): SceneTrail[] {
  const roads = new Map((state.roads?.roads ?? []).map((r) => [r.id, r]));
  const manor = villageManor(state);
  return villageTrails(state).map((trail) => {
    const points: { x: number; z: number }[] = [];
    let at = manor ? { x: manor.position.x, z: manor.position.z } : null;
    for (const piece of trail.pieces) {
      const road = roads.get(piece.roadId);
      if (!road || road.points.length === 0) continue;
      const first = road.points[0]!;
      const last = road.points[road.points.length - 1]!;
      const flip =
        at !== null &&
        Math.hypot(last.x - at.x, last.z - at.z) < Math.hypot(first.x - at.x, first.z - at.z);
      const axis = flip ? [...road.points].reverse() : road.points;
      for (const p of axis) {
        const prev = points[points.length - 1];
        if (!prev || prev.x !== p.x || prev.z !== p.z) points.push({ x: p.x, z: p.z });
      }
      at = points[points.length - 1] ?? at;
    }
    return { id: trail.id, direction: trail.direction, points, built: trail.builtDay !== null };
  });
}

/**
 * Rozestavěné stezky po úsecích (pevná cesta → stupeň a průběh 0–1): hotové úseky už nový stupeň
 * mají (bez stavby), úsek u čela práce průběh, ty za ním 0 (jen vytyčené).
 */
export function trailRoadWork(
  state: Pick<VillageState, 'trails' | 'constructions'>,
): Map<number, { grade: RoadGrade; progress: number }> {
  const work = new Map<number, { grade: RoadGrade; progress: number }>();
  for (const c of state.constructions) {
    if (c.trail === undefined) continue;
    const trail = villageTrails(state).find((t) => t.id === c.trail);
    if (!trail) continue;
    const front = trailWorkFront(trail, c, c.done);
    trail.pieces.forEach((piece, i) => {
      if (i < front.finished) return;
      const progress = i === front.current ? Math.round(front.progress * 1000) / 1000 : 0;
      work.set(piece.roadId, { grade: piece.grade, progress });
    });
  }
  return work;
}
