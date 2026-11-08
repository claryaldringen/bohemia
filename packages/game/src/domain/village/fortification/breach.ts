import { FORTIFICATIONS } from '../rules-fortifications';
import type { FortKind, FortTop } from '../types';
import { segmentTop } from './life';
import type { Fortification, FortSegment } from './types';

// Prolomení opevnění (fortifications.md – Prolomení): práce v mužohodinách podle druhu a místa,
// nejvýš 4 muži na místo. Čistá doména pro válku.

/** Kde se prolamuje: brána, nebo zeď (4 m úseku mimo bránu). */
export type BreachSpot = 'gate' | 'wall';

/** Rozdělaný průlom. */
export interface BreachProgress {
  /** Odvedená práce (mužohodiny). */
  done: number;
  /** Potřebná práce (mužohodiny) – `breachWork`. */
  required: number;
  breached: boolean;
}

/**
 * Práce průlomu v mužohodinách (0 / 2 / 12 / 96). Plot, palisáda i nástavba valu podle druhu;
 * holý val se neprolamuje a brána (závora z kůlů) nestojí nic – přechod valu řeší
 * `breachPace`.
 */
export function breachWork(
  fort: Pick<Fortification, 'kind' | 'top'>,
  seg: Pick<FortSegment, 'kind' | 'top'>,
  at: BreachSpot,
): number {
  const kind: FortKind = seg.kind ?? fort.kind;
  const w = FORTIFICATIONS.breachManHours;
  const top: FortTop | null = kind === 'rampart' ? segmentTop(fort, seg) : kind;
  if (!top) return 0;
  if (top === 'fence') return at === 'gate' ? w.fenceGate : w.fence;
  return at === 'gate' ? w.palisadeGate : w.palisade;
}

/** Tempo přechodu úseku: val čtvrtinové (útok do kopce přes pás), jinak plné. */
export function breachPace(
  fort: Pick<Fortification, 'kind'>,
  seg: Pick<FortSegment, 'kind'>,
): number {
  return (seg.kind ?? fort.kind) === 'rampart' ? FORTIFICATIONS.rampartAssaultPace : 1;
}

/** Nový průlom s potřebnou prací; nulová práce je prolomená hned. */
export function breachStart(required: number): BreachProgress {
  return { done: 0, required, breached: required <= 0 };
}

/**
 * Pokrok za `hours` herních hodin: pracuje nejvýš 4 muži na místo (pátý nezrychlí), průlom je
 * hotový, když odvedená práce dosáhne potřebné.
 */
export function breachStep(progress: BreachProgress, men: number, hours: number): BreachProgress {
  if (progress.breached) return progress;
  const workers = Math.max(0, Math.min(men, FORTIFICATIONS.breach.maxMen));
  const done = Math.min(progress.required, progress.done + workers * hours);
  return { done, required: progress.required, breached: done >= progress.required - 1e-9 };
}

/** Přesila, při které se skupina za opevněním vzdá: 1,5 × obránci × násobek opevnění. */
export function surrenderThreshold(defenders: number, fortMultiplier: number): number {
  return FORTIFICATIONS.surrenderOddsPerDefender * defenders * fortMultiplier;
}
