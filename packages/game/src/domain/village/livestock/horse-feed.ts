import { horseGrainToday, horsePens, penHorses, villageHorses } from './horses';
import { HAY, hayLeftAvailable, hayWinterDaysLeft, villageHayKg } from './hay';
import { butcher } from './livestock';
import { HORSES } from '../rules';
import { reservedSeedKg } from '../fields/seed';
import type { ChronicleEvent, Horse, Pen, VillageState } from '../types';

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

/** Kůň v ohradě – pořadí, v jakém hladový kůň přijde o život (`starvingHorses`). */
interface PenHorse {
  pen: Pen;
  horse: Horse;
}

/**
 * Koně, kterým pod polovinou přídělu sena za zimu (`coverage`) nezbude krmení: tolik, aby ostatní
 * měli polovinu – nejdřív nejmladší (při shodě ohrada s vyšším id, pak kůň s vyšším id), jako voli.
 * Společné pro úhyn 1. 3. (`horsesWinterEnd`) i včasnou porážku (`horsesHaySlaughter`).
 */
function starvingHorses(state: VillageState, coverage: number): PenHorse[] {
  if (coverage >= HAY.deathBelowCoverage - EPSILON) return [];
  const order = horsePens(state)
    .flatMap((pen) => penHorses(pen).map((horse) => ({ pen, horse })))
    .sort(
      (a, b) => b.horse.bornDay - a.horse.bornDay || b.pen.id - a.pen.id || b.horse.id - a.horse.id,
    );
  const total = order.length;
  const survivors = Math.floor((total * coverage) / HAY.deathBelowCoverage + EPSILON);
  return order.slice(0, total - survivors);
}

/** Odebere koně z ohrad (mutuje stav); vrací události kroniky po ohradách – `make` je tvoří. */
function removeHorses(
  state: VillageState,
  gone: readonly PenHorse[],
  make: (pen: Pen, horses: number) => ChronicleEvent,
): ChronicleEvent[] {
  const dead = new Set<Horse>(gone.map(({ horse }) => horse));
  const events: ChronicleEvent[] = [];
  for (const pen of horsePens(state)) {
    const horses = penHorses(pen);
    const died = horses.filter((h) => dead.has(h)).length;
    if (died === 0) continue;
    pen.horses = horses.filter((h) => !dead.has(h));
    events.push(make(pen, died));
  }
  return events;
}

/**
 * Konec zimy (1. 3.) pro koně (mutuje stav – horses.md, Krmení): pod polovinu přídělu sena za zimu
 * (`coverage` – `horsesHayCoverage`) uhyne tolik koní, aby ostatní měli polovinu – nejdřív
 * nejmladší. Jen když je včasná porážka (`horsesHaySlaughter`) nestihla. Vrací události kroniky.
 */
export function horsesWinterEnd(
  state: VillageState,
  day: number,
  coverage: number,
): ChronicleEvent[] {
  return removeHorses(state, starvingHorses(state, coverage), (pen, horses) => ({
    day,
    kind: 'horse-starved',
    penId: pen.id,
    horses,
  }));
}

/**
 * Koně, kteří by pro nedostatek sena 1. 3. uhynuli, ves včas porazí a sní (mutuje stav – horses.md,
 * Krmení; Martin 17. 11. 2026: „Spíš jde o to sníst zvířata, která by stejně chcípla na nedostatek
 * krmiva.“): každý den zimy spočítá, jaké pokrytí sena koní za zimu vyjde k 1. 3. (`horsesKg` –
 * dávka koní za den, seno po volech) a ty samé kusy, které by tehdy uhynuly, hned porazí – maso
 * `HORSES.meatKg` na kus do zásoby jako z porážky. Vrací události kroniky (`horse-retired`, důvod
 * `hay`), mimo zimu (a v dubnu dlouhé zimy) nic.
 */
export function horsesHaySlaughter(
  state: VillageState,
  day: number,
  oxen: number,
  horsesKg: number,
): ChronicleEvent[] {
  // do konce března – úhyn 1. 3. se v dubnu dlouhé zimy nekoná
  const days = hayWinterDaysLeft(day);
  if (days <= 0 || horsesKg <= 0) return [];
  const winter = state.hay?.winter;
  const march = horsesKg * days;
  const need = (winter?.horsesNeedKg ?? 0) + march;
  if (need <= EPSILON) return [];
  const left = Math.max(
    0,
    hayLeftAvailable(villageHayKg(state), days) - oxen * HAY.dailyKg.ox * days,
  );
  const eaten = (winter?.horsesEatenKg ?? 0) + Math.min(left, march);
  const gone = starvingHorses(state, Math.min(1, eaten / need));
  if (gone.length === 0) return [];
  butcher(state, gone.length * HORSES.meatKg);
  return removeHorses(state, gone, (pen, horses) => ({
    day,
    kind: 'horse-retired',
    penId: pen.id,
    horses,
    reason: 'hay',
  }));
}
