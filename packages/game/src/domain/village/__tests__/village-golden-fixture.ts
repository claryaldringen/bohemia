import { dayIndexOf } from '../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../landscape';
import { foundVillage } from '../actions';
import { advanceVillage } from '../simulate';
import { newSteward } from '../steward-state';
import type { VillageState } from '../types';

// Společný základ zlatého otisku celé vsi (village-golden.test.ts a village-golden-long.test.ts):
// ves ze seedu, kterou od založení řídí správce – po 20 letech má 10 polí, stáda, uhlíře, hrnčíře
// a kováře (železo), 14 lidí a dynastii. Nic se nenačítá z JSONu, ves vyroste jen z kódu.

export const YEAR = 365;
const SETUP_YEARS = 20;

export interface GoldenWorld {
  readonly landscape: Landscape;
  readonly obstacles: ObstacleLayer;
  /** Ves po 20 letech od založení – výchozí bod otisků. */
  readonly start: VillageState;
}

/** Ves po 20 letech řízená správcem; dopočítává se asi 12 s, proto se staví jen jednou na soubor. */
export function goldenWorld(): GoldenWorld {
  const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
  const obstacles = obstaclesOf(landscape);
  const day = dayIndexOf({ year: 503, month: 3, day: 1 });
  const site = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  const founded = foundVillage({
    seed: 4242,
    day,
    dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
  });
  const start = advanceVillage(
    { ...founded, steward: newSteward(day, true) },
    day + SETUP_YEARS * YEAR,
    obstacles,
    landscape,
  );
  return { landscape, obstacles, start };
}

/** Otisk stavu (cyrb53 z `JSON.stringify`) – každé pole stavu, i to nejmenší, ho změní. */
export function stateFingerprint(state: VillageState): string {
  const text = JSON.stringify(state);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Dopočet o `days` dní po kouscích po `step` dnech (poslední kousek kratší). */
export function advanceChunked(
  state: VillageState,
  days: number,
  step: number,
  world: GoldenWorld,
): VillageState {
  const end = state.lastDay + days;
  let s = state;
  while (s.lastDay < end) {
    s = advanceVillage(s, Math.min(end, s.lastDay + step), world.obstacles, world.landscape);
  }
  return s;
}
