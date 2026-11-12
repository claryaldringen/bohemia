// Kam se kámen z lomu nosí a vozí (fortifications.md – Kámen, Nošení kamene a vůz; jádro –
// `stoneSource`): k hromadě kamene u kostela, k bodu obvodu hradby, jejíž stavba láme, jinak
// k hromadě kamení u dvorce (zásoba). Čistý modul – používají ho nosiči v lomu
// (villager-plan-quarry.ts) i cíl vozu s kamenem (village-view-crafts.ts – `withStoneCartHeaps`).
import type { SceneVillage } from '../village-view';
import { heapRadius, stoneHeapAt } from './church-site-layout';
import { stackRadius } from './stone-pile-layout';

type Point = { x: number; z: number };

/**
 * Kam se kámen lomu u bodu `from` pro stavbu `construction` nosí: k hromadě kamene u kostela
 * (`stoneHeapAt`), k nejbližšímu bodu obvodu hradby, jejíž stavba láme
 * (`SceneFortification.constructions`), jinak k hromadě kamení u dvorce (zásoba – nejbližší hromada
 * u cesty, bez ní dvorec, bez dvorce `center`). Bod a poloměr hromady (m); bez místa null.
 */
export function stoneDestination(
  village: Pick<SceneVillage, 'churches' | 'forts' | 'stoneStacks' | 'home'>,
  center: Point,
  construction: number | undefined,
  from: Point,
): { at: Point; r: number } | null {
  const id = construction;
  const church = id === undefined ? undefined : village.churches?.find((c) => c.id === id);
  if (church)
    return church.site ? { at: stoneHeapAt(church.site), r: heapRadius(church.site.stone) } : null;
  const fort =
    id === undefined ? undefined : village.forts?.find((f) => f.constructions?.includes(id));
  if (fort) {
    const at = nearestOnRing(fort.outline, from);
    return at ? { at, r: 0 } : null;
  }
  const manor = village.home ?? center;
  let best: { at: Point; r: number } | null = null;
  let bestD = Infinity;
  for (const s of village.stoneStacks ?? []) {
    const d = Math.hypot(s.x - manor.x, s.z - manor.z);
    if (d < bestD) {
      bestD = d;
      best = { at: { x: s.x, z: s.z }, r: stackRadius(s.m3) };
    }
  }
  return best ?? { at: { x: manor.x, z: manor.z }, r: 0 };
}

/** Nejbližší bod uzavřené lomené čáry `ring` k bodu `p`; prázdná null. */
function nearestOnRing(ring: readonly (readonly [number, number])[], p: Point): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t =
      len2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2)) : 0;
    const c = { x: ax + dx * t, z: az + dz * t };
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
