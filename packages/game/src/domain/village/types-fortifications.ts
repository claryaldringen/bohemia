// Typy opevnění (fortifications.md). Tvar obvodu – `fortification/`, čísla – `rules-fortifications.ts`.

/**
 * Hradba – stupeň 1–5 (fortifications.md – Hradby a obrana, Druhy a postup vylepšení): polský
 * plot, palisáda, palisáda s ochozem (jen vylepšením palisády), roštová a komorová hradba. Pořadí
 * stupňů – `WALL_ORDER`.
 */
export type WallKind = 'fence' | 'palisade' | 'walkway' | 'crib' | 'chamber';
/** Druh opevnění (fortifications.md – Druhy): hradba, nebo val s příkopem. */
export type FortKind = WallKind | 'rampart';
/** Hradba na koruně valu (fortifications.md – Druhy): kterýkoli stupeň hradby. */
export type FortTop = WallKind;

export type {
  FortBuildWork,
  FortSegment,
  FortSegmentWork,
  Fortification,
  ThreatSignal,
} from './fortification/types';
