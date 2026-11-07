// Křižovatky v pohledu na ves (docs/design/paths.md – Křižovatky; Martin, #6: „Křižovatka:
// samostatný objekt, který jde označit“): údaje pro panel výběru – tvar, počet cest, znamení
// a stáří. Žádná nová pravidla, jen čtení z `VillageRoads.junctions`. Čistý modul.
import type { JunctionLandmarkKind, JunctionShape, VillageState } from '@bohemia/game';

const DAYS_PER_YEAR = 365;

/** Křižovatka pro panel výběru. */
export interface VillageJunction {
  /** Id křižovatky – vybírá se podle něj (`{ kind: 'junction', id }`). */
  id: number;
  /** Kříž se čtyřmi vchody, nebo Y se třemi. */
  shape: JunctionShape;
  /** Kolik cest do ní vede (ramena bez cesty se nepočítají). */
  roads: number;
  /** Znamení: strom, vztyčený kámen, nebo dřevěný kůl. */
  landmark: JunctionLandmarkKind;
  /** Stáří v celých letech od vzniku. */
  ageYears: number;
}

/** Křižovatky pro panel výběru v den `day`. */
export function junctionViews(state: VillageState, day: number): VillageJunction[] {
  return (state.roads?.junctions ?? []).map((j) => ({
    id: j.id,
    shape: j.shape,
    roads: j.arms.filter((a) => a !== null).length,
    landmark: j.landmark.kind,
    ageYears: Math.max(0, Math.floor((day - j.bornDay) / DAYS_PER_YEAR)),
  }));
}

/** Pole pohledu na ves s křižovatkami (chybí, když žádná není). */
export function junctionsField(
  state: VillageState,
  day: number,
): { junctions?: VillageJunction[] } {
  const junctions = junctionViews(state, day);
  return junctions.length > 0 ? { junctions } : {};
}
