// Hašení řetězem s vědry (disasters.md – Požár, Hašení; Martin 27. 10. 2026: „Chci, aby všichni
// dospělí hasili. Ať udělají řetěz s vědry od nejbližší vody“ (tam, kam chodí ženy pro vodu) a „Lidé musí být rozložení ve stejných
// vzdálenostech“): v den požáru stojí všichni dospělí rovnoměrně na přímce od nejbližší vody
// k hořící stavbě; čím řidší řetěz, tím menší účinnost.

import type { Landscape } from '../../landscape/types';
import { PATH_WATER_SPOT } from '../paths/terrain';
import { groundSpots, nearestSpot, walkGroundOf } from '../paths/walking';
import { ironTravellers } from '../crafts/crafts';
import { isAdult } from '../people/people';
import { FIRE } from '../rules/rules-disasters';
import type { FireFight, Person, VillageState } from '../types';

/** Účinnost řetězu: lidé na vzdálenost `distanceM` (m) → min(1; 2,5 ÷ rozestup); bez lidí 0. */
export function chainEfficiency(distanceM: number, people: number): number {
  if (people <= 0) return 0;
  const spacing = distanceM / people;
  if (spacing <= FIRE.firefighting.handoverM) return 1;
  return FIRE.firefighting.handoverM / spacing;
}

/**
 * Dospělí, kteří dnes hasí: jen ti, kdo jsou dnes ve vsi – mimo ty, kdo jsou na cestě pro kování
 * (`ironTravellers`). Vojvodova rodina, která cvičí na dvorci, je ve vsi, takže hasí taky (návrh
 * Clauda).
 */
export function fireFighters(
  state: Pick<VillageState, 'people' | 'dwellings'>,
  day: number,
): Person[] {
  const away = ironTravellers(state);
  return state.people.filter((p) => isAdult(p, day) && !away.has(p.id));
}

/**
 * Vodní bod hašení = bod, kam chodí ženy pro vodu (`Dwelling.waterWalkM`, paths.md – Pochůzky pro
 * vodu): suchý břeh (`PATH_WATER_SPOT`) nejblíž hořící stavbě vzdušnou čarou; vzdálenost řetězu
 * je přímka od něj ke stavbě (řetěz se staví rovně – návrh Clauda). Bez vody null.
 */
export function nearestWater(
  landscape: Landscape,
  x: number,
  z: number,
): { x: number; z: number; distanceM: number } | null {
  const spot = nearestSpot(groundSpots(walkGroundOf(landscape), PATH_WATER_SPOT), { x, z });
  if (!spot) return null;
  return { x: spot.x, z: spot.z, distanceM: Math.sqrt((spot.x - x) ** 2 + (spot.z - z) ** 2) };
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
