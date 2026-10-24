import { PATH_WALK, routeLine, type StoredRoute } from '@bohemia/game';
import type { VillagerPaths } from './villager-plan-types';

// Chůze postav po uložených trasách vsi (paths.md – kudy lidé chodí, rozhoduje jen simulace;
// scéna trasy jen ukazuje): osa trasy se dekóduje stejnou funkcí jádra jako pěšiny (`routeLine`).
// Hledání cesty v prohlížeči není – postava buď jde po trase domácnosti a cíle, nebo (bez trasy)
// krátkým pohybem. Po trase se chodí rychleji (PATH_WALK). Jen vzhled.

/** Z takové dálky (m) od začátku trasy (brány domu) vyjde postava na trasu. */
const START_REACH_M = 30;
/** Kolik hotových dotazů si zapamatuje (pak začne znovu). */
const MEMO_SIZE = 4000;

interface WalkedRoute {
  readonly route: StoredRoute;
  readonly home: string;
  readonly points: readonly (readonly [number, number])[];
}

type Found = ReturnType<VillagerPaths['route']>;

/**
 * Postavy po uložených trasách: `route(a, b)` najde trasu, která začíná u `a` (brána domu) a končí
 * u `b` (nejvýš `reach` m), nebo opačně; `errand` je konec trasy domácnosti pro vodu nebo dřevo.
 */
export function routeWalker(routes: readonly StoredRoute[], cellM: number): VillagerPaths {
  const walked: WalkedRoute[] = [];
  for (const route of routes) {
    const line = routeLine(route, cellM);
    if (line.length < 2) continue;
    walked.push({
      route,
      home: route.from,
      points: line.map((p) => [p.x, p.z] as const),
    });
  }
  const memo = new Map<string, Found>();
  const dist = (p: readonly [number, number], x: number, z: number): number =>
    Math.hypot(p[0] - x, p[1] - z);
  const find = (a: { x: number; z: number }, b: { x: number; z: number }, reach: number): Found => {
    let best: { points: readonly (readonly [number, number])[]; cost: number } | null = null;
    for (const w of walked) {
      const first = w.points[0]!;
      const last = w.points[w.points.length - 1]!;
      for (const reversed of [false, true]) {
        const from = reversed ? last : first;
        const to = reversed ? first : last;
        const near = dist(from, a.x, a.z);
        const far = dist(to, b.x, b.z);
        if (near > START_REACH_M || far > reach) continue;
        // blíž k oběma koncům; při shodě víc používaná trasa
        const cost = near + far - w.route.trips / 1e6;
        if (best && best.cost <= cost) continue;
        best = { points: reversed ? [...w.points].reverse() : w.points, cost };
      }
    }
    if (!best) return null;
    const points: [number, number][] = [
      [a.x, a.z],
      ...best.points.map((p) => [p[0], p[1]] as [number, number]),
      [b.x, b.z],
    ];
    // odbočka na trasu a z ní k cíli jde mimo cestu (1), po trase PATH_WALK
    const pace = points
      .slice(1)
      .map((_, i) => (i === 0 || i === points.length - 2 ? 1 : PATH_WALK.speed));
    return { points, pace };
  };
  return {
    route(a, b, reach = START_REACH_M) {
      const key = `${a.x.toFixed(2)},${a.z.toFixed(2)},${b.x.toFixed(2)},${b.z.toFixed(2)},${reach}`;
      if (memo.has(key)) return memo.get(key)!;
      if (memo.size >= MEMO_SIZE) memo.clear();
      const found = find(a, b, reach);
      memo.set(key, found);
      return found;
    },
    errand(dwellingId, kind) {
      let best: WalkedRoute | null = null;
      for (const w of walked) {
        if (w.home !== `d:${dwellingId}` || w.route.to !== kind) continue;
        if (!best || w.route.trips > best.route.trips) best = w;
      }
      const end = best?.points[best.points.length - 1];
      return end ? { x: end[0], z: end[1] } : null;
    },
  };
}
