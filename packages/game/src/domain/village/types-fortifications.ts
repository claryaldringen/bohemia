// Typy opevnění (fortifications.md). Tvar obvodu – `fortification/`, čísla – `rules-fortifications.ts`.

/** Druh opevnění (fortifications.md – Druhy): polský plot, palisáda, val s příkopem. */
export type FortKind = 'fence' | 'palisade' | 'rampart';
/** Nástavba na koruně valu (fortifications.md – Druhy): plot, nebo palisáda. */
export type FortTop = 'fence' | 'palisade';

export type {
  FortBuildWork,
  FortSegment,
  FortSegmentWork,
  Fortification,
  ThreatSignal,
} from './fortification/types';
