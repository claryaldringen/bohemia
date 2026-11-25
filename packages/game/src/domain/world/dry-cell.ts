import type { GridCell } from '../village/people/world-grid';
import { cellDistance, ringCells } from './placement';
import { WORLD } from './rules-world';
import { skeletonContext, type SkeletonCache } from './skeleton/drainage';
import { isDry, isTrailOnly } from './skeleton/sites';
import { skeletonSlice } from './skeleton/slice';

// Ves syna (NPC vojvody) jen na suché mapě (world-skeleton.md – Otevřené otázky 3, Martin 8. 11.
// 2026: „NPC budou mít normální mapy. Prémiové jen lidští hráči.“), nebo na stezce bez řeky
// (markets.md – Rozhodnutí plánu 4, bod 11; Martin 22. 11. 2026: „ok“): když políčkem ve směru
// odchodu vede řeka kostry (i brod, pramen a soutok), ves vznikne na nejbližším políčku bez ní.

/** Druhá mocnina vzdálenosti políček – pořadí uvnitř prstence (bližší ke směru odchodu první). */
function squaredDistance(a: GridCell, b: GridCell): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Nejbližší políčko k `target` (ve směru odchodu z mapy `from`), které splní `ok`: `target` samo,
 * jinak po prstencích kolem něj nejvýš `WORLD.sonDryRings`. V prstenci mají přednost sousedé
 * výchozí mapy (ves zůstane vedle), pak políčka blíž `target`, pak pořadí `ringCells` (od severu
 * po směru hodinových ručiček) – návrh Clauda. `from` se nevybere nikdy. Null – v dosahu žádné.
 */
export function nearestCellAround(
  from: GridCell,
  target: GridCell,
  ok: (cell: GridCell) => boolean,
): GridCell | null {
  for (let radius = 0; radius <= WORLD.sonDryRings; radius++) {
    const ring = ringCells(target, radius)
      .map((cell, order) => ({
        cell,
        order,
        home: cellDistance(cell, from),
        near: squaredDistance(cell, target),
      }))
      .filter((c) => c.home > 0)
      .sort((a, b) => a.home - b.home || a.near - b.near || a.order - b.order);
    for (const { cell } of ring) if (ok(cell)) return cell;
  }
  return null;
}

/**
 * Nejbližší políčko k `target`, kam smí ves syna – suché, nebo se stezkou bez řeky
 * (`nearestCellAround`); políčka, která `allowed` odmítne (cizí mapy), se nevyberou. Null –
 * v dosahu žádné (ves tím směrem nevznikne).
 */
export function sonCellNear(
  worldSeed: number,
  from: GridCell,
  target: GridCell,
  allowed: (cell: GridCell) => boolean = () => true,
  cache?: SkeletonCache,
): GridCell | null {
  const ctx = skeletonContext(worldSeed, cache);
  return nearestCellAround(from, target, (cell) => {
    if (!allowed(cell)) return false;
    const slice = skeletonSlice(worldSeed, cell, ctx);
    return isDry(slice) || isTrailOnly(slice);
  });
}
