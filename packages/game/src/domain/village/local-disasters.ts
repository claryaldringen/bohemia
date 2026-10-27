// Rámec místních pohrom dne (disasters.md – Místní pohromy – jedna ves; plán – Pořadí dne, krok 6).
// Samostatný soubor: importuje požár, kroupy a seno, takže ho čte jen `simulate.ts` (disasters.ts
// čte i strava – cyklus importů by rozbil pořadí načtení modulů).

import type { Landscape, ObstacleLayer } from '../landscape';
import { fireDay } from './fire';
import { hailDay } from './hail';
import type { ChronicleEvent } from './types-chronicle';
import type { VillageState } from './types-state';

/**
 * Místní pohromy dne (disasters.md – Místní pohromy – jedna ves; plán – Pořadí dne, krok 6):
 * v pevném pořadí smršť (P9), kroupy, povodeň (P6), požár – požár nastaví `disasters.fireFight`,
 * takže `villagersToday` a `work()` dnes vidí dospělé u hašení. Běží po `damageWindowStart`, před
 * `startPurchases` a `work()`. Ves bez počasí kraje (zlaté otisky) a nová ves (5 let) nic – kromě
 * vynucené pohromy. Mutuje stav, vrátí zápisy do kroniky (P6 a P9 i úmrtí).
 */
export function localDisastersDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  // smršť – P9
  const hail = hailDay(state, day, landscape);
  if (hail) events.push(hail);
  // povodeň – P6
  events.push(...fireDay(state, day, obstacles, landscape));
  return events;
}
