// Rámec místních pohrom dne (disasters.md – Místní pohromy – jedna ves; plán – Pořadí dne, krok 6).
// Samostatný soubor: importuje požár, kroupy, povodeň a seno, takže ho čte jen `simulate.ts` (disasters.ts
// čte i strava – cyklus importů by rozbil pořadí načtení modulů).

import type { Landscape, ObstacleLayer } from '../landscape';
import { fireDay } from './fire';
import { floodDay } from './flood';
import { hailDay } from './hail';
import type { ChronicleEvent } from './types-chronicle';
import type { VillageState } from './types-state';

/**
 * Místní pohromy dne (disasters.md – Místní pohromy – jedna ves; plán – Pořadí dne, krok 6):
 * v pevném pořadí smršť (P9 – zatím není), kroupy, povodeň, požár – požár nastaví `disasters.fireFight`,
 * takže `villagersToday` a `work()` dnes vidí dospělé u hašení. Běží po `damageWindowStart`, před
 * `startPurchases` a `work()`. Ves bez počasí kraje (zlaté otisky) a nová ves (5 let) nic – kromě
 * vynucené pohromy. Mutuje stav, vrátí zápisy do kroniky (u povodně i úmrtí).
 */
export function localDisastersDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  // 1. smršť (P9) – zatím neexistuje, místo je prázdné
  // 2. kroupy
  const hail = hailDay(state, day, landscape);
  if (hail) events.push(hail);
  // 3. povodeň – voda kraje, škody podle políček vsi
  events.push(...floodDay(state, day, landscape));
  // 4. požár
  events.push(...fireDay(state, day, obstacles, landscape));
  return events;
}
