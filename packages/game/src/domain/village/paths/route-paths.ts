// Pěšiny z uložených tras (paths.md – Vyšlapanost a vznik cesty): čáry vedou, kudy trasy chodí,
// síla je vyšlapanost / práh cesty. Jeden zdroj pro chůzi (`walking.ts`) i scénu – nic se
// nepočítá znovu, jen se dekódují trasy.

import { WEAR } from '../rules-roads';
import type { StoredRoute } from '../types';
import { type GridWindow } from './network-grid';
import { extractLines } from './network-lines';
import { edgeSlot } from './network-search';
import type { PathLine, PathPoint } from './network-types';
import { routeCells } from './routes';
import { wearNear } from './wear';

/**
 * Síla pěšiny z vyšlapanosti v bodě čáry trasy (`wearNear` – buňka bodu a sousední): vyšlapanost /
 * práh cesty, nejvýš 1, pod viditelnou 0.
 */
export function wearStrengthAt(wear: ReadonlyMap<number, number>, x: number, z: number): number {
  const w = wearNear(wear, x, z);
  return w >= WEAR.visibleFrom ? Math.min(1, w / WEAR.roadAt) : 0;
}

/**
 * Čáry pěšin z tras (`VillageState.routes`): provoz tras po hranách buněk (cesty za den) →
 * `extractLines` jako u sítě, začátky tras (brány domů) jsou kotvy. Síla v bodě čáry je
 * vyšlapanost (`wearStrengthAt`), ne provoz – nová pěšina začíná slabě a sílí. Stáří se z tras
 * nezná (0). `cellM` – strana buňky mřížky pěšin, ve které jsou trasy uložené.
 */
export function routePaths(
  routes: readonly StoredRoute[],
  wear: ReadonlyMap<number, number>,
  cellM: number,
): PathLine[] {
  const decoded = routes.map((r) => routeCells(r));
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const cells of decoded) {
    for (const [x, z] of cells) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (minX > maxX) return [];
  const grid: GridWindow = {
    originX: minX * cellM,
    originZ: minZ * cellM,
    width: maxX - minX + 1,
    height: maxZ - minZ + 1,
    cellM,
  };
  const at = (x: number, z: number): number => (z - minZ) * grid.width + (x - minX);
  const edges = new Float32Array(grid.width * grid.height * 4);
  const anchors = new Map<number, PathPoint>();
  decoded.forEach((cells, k) => {
    const trips = routes[k]!.trips / 100;
    const first = cells[0];
    if (first) anchors.set(at(first[0], first[1]), { x: first[0] * cellM, z: first[1] * cellM });
    for (let i = 1; i < cells.length; i++) {
      const [ax, az] = cells[i - 1]!;
      const [bx, bz] = cells[i]!;
      const slot = edgeSlot(grid.width, at(ax, az), at(bx, bz));
      edges[slot] = edges[slot]! + trips;
    }
  });
  const lines = extractLines(grid, { edges, edgeYears: new Float32Array(edges.length) }, anchors);
  for (const line of lines) {
    line.strength = line.points.map((p) => wearStrengthAt(wear, p.x, p.z));
  }
  return lines;
}
