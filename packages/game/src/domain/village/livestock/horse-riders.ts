import { horseAgeYears, horsePens, isGrainHorse, penHorses, villageHorses } from './horses';
import { isUnshod } from './horse-shoeing-term';
import type { LordFamily } from '../people/lord';
import { ageYears } from '../people/people';
import { HORSES, LORD } from '../rules';
import type { ChronicleEvent, Horse, Person, VillageState } from '../types';

// Jezdci a výcvik koně (horses.md – Výcvik koně a jezdec): každý jezdecký kůň má svého jezdce
// z vojvodovy rodiny, výcvik koně roste ve dnech, kdy na něm jezdec cvičí jízdu.

const DAYS_PER_YEAR = 365.25;
const EPSILON = 1e-6;
/** Nikdo na koni – ves bez koní. */
export const NO_RIDERS: ReadonlySet<number> = new Set();

/**
 * Denní přírůstek výcviku koně s obilím (horses.md – Výcvik koně a jezdec; Martin 22. 10. 2026:
 * od 3 do 12 let): jízda každý den dovede koně z 0 na plný výcvik za 9 let (≈ 11 % ročně).
 */
const TRAINING_PER_DAY =
  HORSES.trainingFull / ((HORSES.trainedAtYears - HORSES.foalUntilYears) * DAYS_PER_YEAR);

/** Jezdci rodiny – cvičící muži rodiny od 10 let (horses.md – Chov; lord.md – Den rodiny). */
export function familyRiders(family: Pick<LordFamily, 'trainees'>, day: number): Person[] {
  return family.trainees.filter((p) => ageYears(p.bornDay, day) >= LORD.youthFrom);
}

/**
 * Páry jezdec–kůň (horses.md – Výcvik koně a jezdec; mutuje `Horse.riderId`): pár drží, dokud
 * oba žijí a jezdec je v rodině od 10 let. Volné jezdecké koně (samci od 3 let) ves přidělí sama –
 * nejlépe vycvičený vojvodovi, další synům od nejstaršího (chlapci 10–13 let tak až po dospělých).
 * Klisny a hříbata jezdce nemají. Vrací id jezdců, kteří mají koně.
 */
export function assignRiders(
  state: Pick<VillageState, 'pens'>,
  day: number,
  family: Pick<LordFamily, 'lord' | 'trainees'>,
): ReadonlySet<number> {
  const horses = villageHorses(state);
  if (horses.length === 0) return NO_RIDERS;
  const riders = familyRiders(family, day);
  const riderIds = new Set(riders.map((p) => p.id));
  const mounted = new Set<number>();
  const free: Horse[] = [];
  for (const horse of horses) {
    const rider = horse.riderId;
    if (isGrainHorse(horse, day) && rider !== undefined && riderIds.has(rider)) {
      if (!mounted.has(rider)) {
        mounted.add(rider);
        continue;
      }
    }
    if (rider !== undefined) delete horse.riderId;
    if (isGrainHorse(horse, day)) free.push(horse);
  }
  const waiting = riders.filter((p) => !mounted.has(p.id));
  if (free.length === 0 || waiting.length === 0) return mounted;
  const lordId = family.lord?.id;
  const rank = (p: Person): number => (p.id === lordId ? 0 : 1);
  waiting.sort((a, b) => rank(a) - rank(b) || a.bornDay - b.bornDay || a.id - b.id);
  free.sort((a, b) => b.training - a.training || a.bornDay - b.bornDay || a.id - b.id);
  for (let i = 0; i < Math.min(free.length, waiting.length); i++) {
    const rider = waiting[i]!;
    free[i]!.riderId = rider.id;
    mounted.add(rider.id);
  }
  return mounted;
}

/**
 * Výcvik koní dne (horses.md – Výcvik koně a jezdec; mutuje stav): kůň roste o denní přírůstek
 * krát podíl dne, který jeho jezdec dnes cvičil (`riding` – id jezdce → podíl 0–1). Bez obilí
 * (`horsesFed === false`) polovičním tempem (Martin 22. 10. 2026: „zpomalí“), bez plné péče
 * (`horsesCaredToday` < 1 – recenze úlohy 5) a ve dnech rodiny na poli (žně – nikdo nejezdí,
 * `riding` prázdné) stojí.
 * Plný výcvik zůstane; při jeho dosažení kronika `horse-trained`.
 */
export function trainHorsesDay(
  state: VillageState,
  day: number,
  riding: ReadonlyMap<number, number>,
): ChronicleEvent[] {
  if (riding.size === 0) return [];
  if ((state.horsesCaredToday ?? 0) < 1 - EPSILON) return [];
  // nepodkuté koně nejezdí, výcvik stojí (horses.md – Kování)
  if (isUnshod(state, day)) return [];
  const gain = TRAINING_PER_DAY * (state.horsesFed === false ? HORSES.trainingWithoutGrain : 1);
  const events: ChronicleEvent[] = [];
  for (const pen of horsePens(state)) {
    for (const horse of penHorses(pen)) {
      const share = horse.riderId === undefined ? 0 : (riding.get(horse.riderId) ?? 0);
      if (
        share <= 0 ||
        horse.training >= HORSES.trainingFull ||
        !isGrainHorse(horse, day) ||
        horseAgeYears(horse, day) > HORSES.trainedAtYears
      ) {
        continue;
      }
      const next = horse.training + gain * Math.min(1, share);
      if (next >= HORSES.trainingFull - EPSILON) {
        horse.training = HORSES.trainingFull;
        events.push({ day, kind: 'horse-trained', penId: pen.id, horseId: horse.id });
      } else horse.training = next;
    }
  }
  return events;
}

/**
 * Co jezdec na koni dokáže (horses.md – Výcvik koně a jezdec): jízda jezdce × (0,4 + 0,6 × výcvik
 * koně) – na nevycvičeném koni 40 % jízdy, na vycvičeném plnou. Zatím jen pro panel (lov a válka
 * později).
 */
export function riderPower(rider: Pick<Person, 'arms'>, horse: Pick<Horse, 'training'>): number {
  const { base, perTraining } = HORSES.riderPower;
  const training = Math.min(1, Math.max(0, horse.training / HORSES.trainingFull));
  return (rider.arms?.riding ?? 0) * (base + perTraining * training);
}

/**
 * Kůň jezdce padl (hunting.md – Pravidla 6; mutuje stav): zmizí z ohrady koní i z koní bez ohrady
 * a jezdec venku na něm už nejede (`away.horseId` pryč – jde dál pěšky). Vrací, zda kůň ve vsi byl
 * (chybějící kůň – nic, výsledek se smí doručit i po druhé).
 */
export function loseHorse(state: VillageState, horseId: number): boolean {
  let lost = false;
  for (const pen of horsePens(state)) {
    const horses = penHorses(pen);
    if (!horses.some((h) => h.id === horseId)) continue;
    pen.horses = horses.filter((h) => h.id !== horseId);
    lost = true;
  }
  if (state.looseHorses?.some((h) => h.id === horseId)) {
    state.looseHorses = state.looseHorses.filter((h) => h.id !== horseId);
    lost = true;
  }
  if (!lost) return false;
  for (const p of state.people) if (p.away?.horseId === horseId) delete p.away.horseId;
  return true;
}
