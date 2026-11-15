import { STONE } from '../../rules/rules-stone';
import { type Point, rectangleCorners } from '../../placement/polygon';

// Plocha lomu (fortifications.md – Kámen, Lom jako plocha u skal; Martin 14. 11. 2026): čtverec
// `STONE.quarryArea.sizeM` natočený jako ostatní stavby. Samostatný modul, ať ji kontrola volného
// místa (`checkFootprintFree`) zná bez závislosti na celém lomu.

/** Půdorys plochy lomu se středem a natočením `position` (rohy ve světě). */
export function quarryAreaFootprint(position: { x: number; z: number; rotation: number }): Point[] {
  const size = STONE.quarryArea.sizeM;
  return rectangleCorners(position.x, position.z, size, size, position.rotation);
}
