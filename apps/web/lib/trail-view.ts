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
import type { SceneRoad, SceneTrail, SceneVillage } from './village-view';

/**
 * Osy pokračování stezek sousedních vsí (`mapTrailContinuations`) jako pevné cesty scény
 * (trade.md – Pokračování na sousední mapě): upravená cesta s průsekem, záporná id (−1, −2 …),
 * ať se nikdy nesrazí s úseky vsi. Pole os je sdílené z mezipaměti – jen se čte.
 */
export function sceneTrailContinuations(
  axes: readonly (readonly { x: number; z: number }[])[],
): SceneRoad[] {
  return axes.map((axis, i) => ({
    id: -(i + 1),
    points: axis.map((p) => ({ x: p.x, z: p.z })),
    grade: 'improved',
    swath: true,
  }));
}

/**
 * Ves cizí mapy s pokračováním stezek sousedů: i mapa bez staveb dostane prázdnou ves, ať scéna
 * cestu nakreslí; bez os ves beze změny (i null).
 */
export function withTrailContinuations(
  village: SceneVillage | null,
  axes: readonly (readonly { x: number; z: number }[])[] | null | undefined,
): SceneVillage | null {
  if (!axes || axes.length === 0) return village;
  return {
    ...(village ?? { dwellings: [], fields: [] }),
    trailContinuations: sceneTrailContinuations(axes),
  };
}

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
