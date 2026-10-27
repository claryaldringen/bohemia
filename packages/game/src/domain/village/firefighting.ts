// Hašení řetězem s vědry (disasters.md – Požár, Hašení; Martin 27. 10. 2026: „Chci, aby všichni
// dospělí hasili. Ať udělají řetěz s vědry od nejbližší vody“ a „Lidé musí být rozložení ve stejných
// vzdálenostech“): v den požáru stojí všichni dospělí rovnoměrně na přímce od nejbližší vody
// k hořící stavbě; čím řidší řetěz, tím menší účinnost.

import { SURFACE_CODES, type Landscape } from '../landscape/types';
import { streamCenterline } from '../landscape/stream-geometry';
import { isAdult } from './people';
import { FIRE } from './rules-disasters';
import type { FireFight, Person, VillageState } from './types';

/** Bod osy potoka s šířkou vody (jen to, co hledání vody potřebuje). */
export interface WaterAxisPoint {
  x: number;
  z: number;
  halfLeft: number;
  halfRight: number;
}

/**
 * Nejbližší místo na břehu vody k bodu `(x, z)`: nejbližší bod osy potoka (po úsečkách), posunutý
 * o polovinu šířky vody k bodu. Vzdálenost je vzdušnou čarou přes celou mapu (návrh Clauda – hasiči
 * si vodu najdou, i když je daleko). Bez potoka null.
 */
export function nearestWaterPoint(
  axis: readonly WaterAxisPoint[],
  x: number,
  z: number,
): { x: number; z: number; distanceM: number } | null {
  if (axis.length === 0) return null;
  let best = { px: axis[0]!.x, pz: axis[0]!.z, dist: Infinity, half: 0 };
  for (let i = 0; i < Math.max(1, axis.length - 1); i++) {
    const a = axis[i]!;
    const b = axis[Math.min(i + 1, axis.length - 1)]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + t * dx;
    const pz = a.z + t * dz;
    const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (dist < best.dist) {
      const half = (a.halfLeft + a.halfRight + b.halfLeft + b.halfRight) / 4;
      best = { px, pz, dist, half };
    }
  }
  const edge = Math.max(0, best.dist - best.half);
  // břeh leží o `edge` m od bodu směrem k ose (je-li bod ve vodě, je to bod na ose)
  const k = best.dist === 0 ? 0 : (best.dist - edge) / best.dist;
  return { x: best.px + (x - best.px) * k, z: best.pz + (z - best.pz) * k, distanceM: edge };
}

/**
 * Nejbližší vodní políčko krajiny (tůň, jezírko i potok): střed políčka, vzdálenost se počítá
 * k jeho okraji. Bez vody null.
 */
export function nearestWaterCell(
  landscape: Pick<Landscape, 'size' | 'cellSizeM' | 'surface'>,
  x: number,
  z: number,
): { x: number; z: number; distanceM: number } | null {
  const { size, cellSizeM, surface } = landscape;
  const half = (size * cellSizeM) / 2;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (let j = 0; j < size; j++) {
    const cz = -half + (j + 0.5) * cellSizeM;
    const dz2 = (cz - z) ** 2;
    if (dz2 >= best) continue;
    for (let i = 0; i < size; i++) {
      if (surface[j * size + i] !== SURFACE_CODES.water) continue;
      const cx = -half + (i + 0.5) * cellSizeM;
      const d2 = (cx - x) ** 2 + dz2;
      if (d2 < best) {
        best = d2;
        bx = cx;
        bz = cz;
      }
    }
  }
  if (best === Infinity) return null;
  const dist = Math.sqrt(best);
  const edge = Math.max(0, dist - cellSizeM / 2);
  const k = dist === 0 ? 0 : (dist - edge) / dist;
  return { x: bx + (x - bx) * k, z: bz + (z - bz) * k, distanceM: edge };
}

/** Účinnost řetězu: lidé na vzdálenost `distanceM` (m) → min(1; 2,5 ÷ rozestup); bez lidí 0. */
export function chainEfficiency(distanceM: number, people: number): number {
  if (people <= 0) return 0;
  const spacing = distanceM / people;
  if (spacing <= FIRE.firefighting.handoverM) return 1;
  return FIRE.firefighting.handoverM / spacing;
}

/** Dospělí vsi, kteří dnes hasí. */
export function fireFighters(people: readonly Person[], day: number): Person[] {
  return people.filter((p) => isAdult(p, day));
}

/** Nejbližší voda krajiny: bližší z potoka (osa) a vodních políček (tůně, jezírka). */
function nearestWater(
  landscape: Landscape,
  x: number,
  z: number,
): { x: number; z: number; distanceM: number } | null {
  const stream = nearestWaterPoint(streamCenterline(landscape).points, x, z);
  const cell = nearestWaterCell(landscape, x, z);
  if (!stream) return cell;
  if (!cell) return stream;
  return cell.distanceM < stream.distanceM ? cell : stream;
}

/**
 * Řetěz s vědry u hořící stavby na `(x, z)`: kde je voda, kolik lidí, rozestup a účinnost.
 * Bez krajiny nebo bez potoka řetěz nevznikne (účinnost 0, bod vody chybí).
 */
export function planFireFight(
  landscape: Landscape | null,
  dwellingId: number,
  x: number,
  z: number,
  people: number,
  day: number,
): FireFight {
  const water = landscape ? nearestWater(landscape, x, z) : null;
  if (!water) {
    return { day, dwellingId, water: null, distanceM: 0, people, spacingM: 0, efficiency: 0 };
  }
  return {
    day,
    dwellingId,
    water: { x: water.x, z: water.z },
    distanceM: water.distanceM,
    people,
    spacingM: people > 0 ? water.distanceM / people : 0,
    efficiency: chainEfficiency(water.distanceM, people),
  };
}

/** Hasí se dnes požár (všichni dospělí mimo běžnou práci)? Čte plán uložený `fireDay`. */
export function fireFighting(state: Pick<VillageState, 'disasters'>, day: number): boolean {
  return state.disasters?.fireFight?.day === day;
}
