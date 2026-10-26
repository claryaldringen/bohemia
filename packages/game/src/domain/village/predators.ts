// Šelmy na dobytku (wildlife.md – Vlci na dobytku, medvěd): vlčí díl ročních ztrát stáda podle
// smečky a medvěd na prasatech v lese. Podíl stáda den po dni, bez losu; celé kusy do kroniky.

import { dateOfDayIndex, monthLength } from '../calendar';
import { HERD_SPECIES, LIVESTOCK } from './livestock';
import { PREDATION, WILDLIFE_YEAR } from './rules-wildlife';
import type { ChronicleEvent, HerdSpecies, Predation, VillageState } from './types';

const EPSILON = 1e-9;

/** Dnů v měsících `from`–`to` včetně (nepřestupný rok – denní podíly nezávisí na přestupném dni). */
function daysInMonths(from: number, to: number): number {
  let days = 0;
  for (let m = from; m <= to; m++) days += monthLength(501, m);
  return days;
}

const DAYS_PER_YEAR = daysInMonths(1, 12);
/** Dnů v roce, kdy je dobytek venku (duben–říjen) – vlčí díl se rozpočítá na ně. */
const PASTURE_DAYS = daysInMonths(PREDATION.pastureMonths.from, PREDATION.pastureMonths.to);
/** Dnů, kdy medvěd nespí (duben–listopad). */
const BEAR_DAYS = daysInMonths(PREDATION.bear.fromMonth, PREDATION.bear.toMonth);

/** Vlci v kraji: ves bez údajů o zvěři má plnou smečku (kalibrace beze změny). */
export function wolvesOf(state: Pick<VillageState, 'wildlife'>): number {
  return state.wildlife?.wolves ?? PREDATION.fullPack;
}

/** Jsou na `month` vlci na tomto stádě? Prasata v lese celý rok, ostatní jen na pastvě. */
function wolvesAtHerd(species: HerdSpecies, month: number): boolean {
  if (species === 'pig' && PREDATION.pigsAllYear) return true;
  return month >= PREDATION.pastureMonths.from && month <= PREDATION.pastureMonths.to;
}

/**
 * Za den ze stáda zůstane tento podíl kvůli vlkům. Roční vlčí díl (3 / 3 / 2 / 1 % při plné smečce
 * × vlci ÷ 5) se přidá ke ztrátám základu tak, aby součet při 5 vlcích dal dosavadních 12 / 10 / 12
 * / 6 % (návrh Clauda): roční zbytek vlky = (1 − základ − díl) ÷ (1 − základ), rozpočtený na dny,
 * kdy je stádo venku. 1 = vlci stádo ten den neberou.
 */
export function wolfDailyKeep(species: HerdSpecies, wolves: number, month: number): number {
  if (!wolvesAtHerd(species, month) || wolves <= 0) return 1;
  const base = LIVESTOCK.lossPerYear[species];
  const share = Math.min(1 - base, (PREDATION.wolfShare[species] * wolves) / PREDATION.fullPack);
  const days = species === 'pig' && PREDATION.pigsAllYear ? DAYS_PER_YEAR : PASTURE_DAYS;
  return ((1 - base - share) / (1 - base)) ** (1 / days);
}

function emptyAcc(): Record<HerdSpecies, number> {
  return { sheep: 0, goat: 0, pig: 0, cow: 0 };
}

function predationOf(state: VillageState): Predation | null {
  const w = state.wildlife;
  if (!w) return null;
  w.predation ??= { acc: emptyAcc(), killDays: [], yearHeads: emptyAcc() };
  return w.predation;
}

function month(predation: Predation): NonNullable<Predation['monthHeads']> {
  predation.monthHeads ??= { wolf: emptyAcc(), bear: 0 };
  return predation.monthHeads;
}

/** Zapíše kusy měsíce do kroniky (jedna událost za druh a šelmu) a vynuluje je. */
function flushMonth(predation: Predation, day: number, events: ChronicleEvent[]): void {
  const heads = predation.monthHeads;
  if (!heads) return;
  for (const species of HERD_SPECIES) {
    if (heads.wolf[species] > 0) {
      events.push({ day, kind: 'predator-kill', species, by: 'wolf', heads: heads.wolf[species] });
    }
  }
  if (heads.bear > 0) {
    events.push({ day, kind: 'predator-kill', species: 'pig', by: 'bear', heads: heads.bear });
  }
  delete predation.monthHeads;
}

/** Zmenší stádo, mláďata i porážku o podíl `loss` (0–1). */
function shrink(state: VillageState, species: HerdSpecies, loss: number): void {
  const livestock = state.livestock;
  if (!livestock || loss <= 0) return;
  const keep = 1 - loss;
  livestock.herds[species] *= keep;
  livestock.young[species] *= keep;
  if (livestock.culling) livestock.culling[species] *= keep;
}

/**
 * Den šelem (mutuje stav; po základních ztrátách `herdLosses`): vlci vezmou vlčí díl stáda,
 * medvěd (je-li a nespí) 2 prasata ročně z prasat nad chovný pár. Zlomky kusů jdou do akumulátorů,
 * celé kusy do `killDays` a po měsících do kroniky (jedna událost za druh a šelmu poslední den
 * měsíce – 500 událostí kroniky nesmí zaplavit stáda). Vrací události kroniky.
 */
export function predationDay(state: VillageState, day: number): ChronicleEvent[] {
  const livestock = state.livestock;
  if (!livestock) return [];
  const date = dateOfDayIndex(day);
  const predation = predationOf(state);
  if (predation && date.month === WILDLIFE_YEAR.month && date.day === WILDLIFE_YEAR.day) {
    predation.yearHeads = emptyAcc();
  }
  const events: ChronicleEvent[] = [];
  const wolves = wolvesOf(state);
  let killed = false;
  for (const species of HERD_SPECIES) {
    const keep = wolfDailyKeep(species, wolves, date.month);
    if (keep >= 1) continue;
    const taken = livestock.herds[species] * (1 - keep);
    shrink(state, species, 1 - keep);
    if (!predation) continue;
    predation.acc[species] += taken;
    const heads = Math.floor(predation.acc[species] + EPSILON);
    if (heads < 1) continue;
    predation.acc[species] -= heads;
    predation.yearHeads[species] += heads;
    month(predation).wolf[species] += heads;
    killed = true;
  }
  const bear = state.wildlife?.bear;
  if (
    predation &&
    bear?.present &&
    date.month >= PREDATION.bear.fromMonth &&
    date.month <= PREDATION.bear.toMonth &&
    livestock.herds.pig > PREDATION.bear.keepPigs + EPSILON
  ) {
    // jen z prasat nad chovný pár (návrh Clauda)
    const taken = Math.min(
      PREDATION.bear.pigsPerYear / BEAR_DAYS,
      livestock.herds.pig - PREDATION.bear.keepPigs,
    );
    shrink(state, 'pig', taken / livestock.herds.pig);
    predation.bearAcc = (predation.bearAcc ?? 0) + taken;
    const heads = Math.floor(predation.bearAcc + EPSILON);
    if (heads >= 1) {
      predation.bearAcc -= heads;
      predation.yearHeads.pig += heads;
      month(predation).bear += heads;
      killed = true;
    }
  }
  if (predation) {
    // kronika po měsících (ne po dnech): poslední den měsíce celé kusy vlků a medvěda
    if (dateOfDayIndex(day + 1).month !== date.month) flushMonth(predation, day, events);
    if (killed) predation.killDays.push(day);
    const oldest = day - PREDATION.killDaysKept;
    if (predation.killDays.length > 0 && predation.killDays.some((d) => d <= oldest)) {
      predation.killDays = predation.killDays.filter((d) => d > oldest);
    }
  }
  return events;
}
