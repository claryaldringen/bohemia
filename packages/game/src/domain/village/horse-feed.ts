import { horseGrainToday, horsePens, penHorses, villageHorses } from './horses';
import { HAY } from './hay';
import { HORSES } from './rules';
import { reservedSeedKg } from './seed';
import type { ChronicleEvent, Horse, VillageState } from './types';

// Krmení koní (horses.md – Krmení): obilí jezdeckým koním po jídle lidí – lidé napřed – a konec
// zimy 1. 3. (úhyn pro nedostatek sena). Seno dne dává `feedHay` (hay.ts) po volech a před stádem.

const EPSILON = 1e-9;

/**
 * Obilí koní po jídle dne (mutuje stav – horses.md, Krmení; Martin 23. 10. 2026: jezdecký kůň
 * 1,5 kg denně). Lidé napřed: koně obilí dostanou, jen když ves nešetří (`state.hungry`) a obilí,
 * které lidem po dnešním jídle do sklizně zbude (`spareKg` – `DietResult.grainSpareKg`), vystačí
 * i koním na `daysToHarvest` dní. Jinak nedostanou nic (`horsesFed = false` – seno 7 kg, výcvik
 * polovičním tempem) a ves kvůli koním nešetří. Kdo včera obilí nedostal, dostane ho znovu, až
 * zbude navíc ještě `HORSES.grainResumeDays` dní obilí koní – na hraně zásob se krmení nepřepíná
 * den po dni (návrh Clauda). Ves bez koní stav nemění.
 */
export function feedHorseGrain(
  state: VillageState,
  day: number,
  spareKg: number,
  daysToHarvest: number,
): void {
  const horses = villageHorses(state);
  if (horses.length === 0) {
    if (state.horsesFed !== undefined) delete state.horsesFed;
    return;
  }
  const want = horseGrainToday(horses, day);
  if (want <= 0) {
    state.horsesFed = true;
    return;
  }
  const days =
    Math.max(1, daysToHarvest) + (state.horsesFed === false ? HORSES.grainResumeDays : 0);
  const fed =
    state.hungry !== true &&
    state.storesKg - reservedSeedKg(state) >= want - EPSILON &&
    spareKg >= want * days - EPSILON;
  if (fed) state.storesKg = Math.max(0, state.storesKg - want);
  state.horsesFed = fed;
}

/**
 * Konec zimy (1. 3.) pro koně (mutuje stav – horses.md, Krmení): pod polovinu přídělu sena za zimu
 * (`coverage` – `horsesHayCoverage`) uhyne tolik koní, aby ostatní měli polovinu – nejdřív
 * nejmladší (při shodě ohrada s vyšším id, pak kůň s vyšším id), jako voli. Vrací události kroniky.
 */
export function horsesWinterEnd(
  state: VillageState,
  day: number,
  coverage: number,
): ChronicleEvent[] {
  if (coverage >= HAY.deathBelowCoverage - EPSILON) return [];
  const pens = horsePens(state);
  const order = pens
    .flatMap((pen) => penHorses(pen).map((horse) => ({ pen, horse })))
    .sort(
      (a, b) => b.horse.bornDay - a.horse.bornDay || b.pen.id - a.pen.id || b.horse.id - a.horse.id,
    );
  const total = order.length;
  const survivors = Math.floor((total * coverage) / HAY.deathBelowCoverage + EPSILON);
  const dead = new Set<Horse>(order.slice(0, total - survivors).map(({ horse }) => horse));
  const events: ChronicleEvent[] = [];
  for (const pen of pens) {
    const horses = penHorses(pen);
    const died = horses.filter((h) => dead.has(h)).length;
    if (died === 0) continue;
    pen.horses = horses.filter((h) => !dead.has(h));
    events.push({ day, kind: 'horse-starved', penId: pen.id, horses: died });
  }
  return events;
}
