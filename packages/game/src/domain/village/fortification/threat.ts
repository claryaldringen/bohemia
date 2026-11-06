import { FORTIFICATIONS } from '../rules-fortifications';
import type { ThreatSignal } from './types';

// Hrozba vsi (fortifications.md – Hrozba, jak se počítá): součet vah signálů, každý slábne
// s poločasem 10 herních let; válka bez úbytku, dokud trvá. Deterministická vrstva – poločas
// bez `Math.pow` a `**` (tabulka 2^(-1/2^k)), aby server i prohlížeč dostaly stejné číslo.

/** 2^(−1/2^k) pro k = 1…10 – dvojková řada zlomku poločasu. */
const HALF_ROOTS: readonly number[] = [
  0.7071067811865476, 0.8408964152537145, 0.9170040432046712, 0.9576032806985737,
  0.9785720620877001, 0.9892280131939755, 0.9945994234836332, 0.9972960560854701,
  0.9986471128909702, 0.9993233275026507,
];

/** Poločas: ½^(ageDays ÷ halfLifeDays), deterministicky (celé poločasy půlením, zbytek řadou). */
export function halfLifeFactor(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  const periods = ageDays / halfLifeDays;
  let whole = Math.floor(periods);
  let out = 1;
  if (whole > 60) return 0;
  while (whole-- > 0) out *= 0.5;
  let frac = periods - Math.floor(periods);
  for (let k = 0; k < HALF_ROOTS.length; k++) {
    frac *= 2;
    if (frac >= 1) {
      frac -= 1;
      out *= HALF_ROOTS[k]!;
    }
  }
  return out;
}

const DAYS_PER_YEAR = 365;
const T = FORTIFICATIONS.threat;
/** Váhy signálů podle druhu (Hrozba – tabulka signálů). */
const WEIGHT: Record<ThreatSignal['kind'], number> = {
  'raid-here': T.raid,
  'raid-house': T.kinRaid,
  'army-seen': T.army,
  war: T.war,
};

/** Váha jednoho signálu ve dni `day` (0 po zapomenutí). */
export function threatWeight(signal: ThreatSignal, day: number): number {
  if (signal.day > day) return 0;
  const weight = WEIGHT[signal.kind];
  const years = T.memoryYears * DAYS_PER_YEAR;
  let age = day - signal.day;
  if (signal.kind === 'war') {
    // válka bez úbytku do míru, pak slábne od dne míru
    if (signal.endDay === undefined || signal.endDay >= day) return weight;
    age = day - signal.endDay;
  }
  if (age > years) return 0;
  return weight * halfLifeFactor(age, T.halfLifeYears * DAYS_PER_YEAR);
}

/** Hrozba vsi 0–1: `min(1, Σ váha × ½^(stáří ÷ 10 let))`; signály starší než 50 let se nepočítají. */
export function villageThreat(signals: readonly ThreatSignal[] | undefined, day: number): number {
  if (!signals || signals.length === 0) return 0;
  let sum = 0;
  for (const s of signals) sum += threatWeight(s, day);
  return Math.min(1, sum);
}

/** Signály, které ves ještě pamatuje (zapomenutá válka i starý nájezd zmizí); pořadí zůstává. */
export function pruneThreats(signals: readonly ThreatSignal[], day: number): ThreatSignal[] {
  const years = T.memoryYears * DAYS_PER_YEAR;
  return signals.filter((s) => day - (s.kind === 'war' ? (s.endDay ?? day) : s.day) <= years);
}
