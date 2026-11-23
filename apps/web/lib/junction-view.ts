// Křižovatky v pohledu na ves (docs/design/paths.md – Křižovatky; Martin, #6: „Křižovatka:
// samostatný objekt, který jde označit“): údaje pro panel výběru – tvar, počet cest, znamení
// a stáří. Žádná nová pravidla, jen čtení z `VillageRoads.junctions`. Čistý modul.
import {
  junctionLandmark,
  roadEndsNetwork,
  type JunctionLandmarkKind,
  type JunctionShape,
  type Landscape,
  type VillageState,
} from '@bohemia/game';
import { landmarkPhrase } from './village-view-chronicle';

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
  /** Významné místo u ní (D66, `junctionLandmark`): „u kovárny“, „severně od vsi“ – nadpis panelu. */
  place?: string;
}

/** Křižovatky pro panel výběru v den `day`. */
export function junctionViews(
  state: VillageState,
  day: number,
  landscape?: Landscape,
): VillageJunction[] {
  const junctions = state.roads?.junctions ?? [];
  // krajina jen pro výšku místa („pod“ / „nad“) – stejně jako u konců cesty (D66)
  const terrain =
    junctions.length > 0 && landscape ? roadEndsNetwork(state, landscape).terrain : null;
  return junctions.map((j) => {
    const near = junctionLandmark(state, j, terrain);
    const place = near ? landmarkPhrase(near) : null;
    return {
      id: j.id,
      shape: j.shape,
      roads: j.arms.filter((a) => a !== null).length,
      landmark: j.landmark.kind,
      ageYears: Math.max(0, Math.floor((day - j.bornDay) / DAYS_PER_YEAR)),
      ...(place ? { place } : {}),
    };
  });
}

/** Pole pohledu na ves s křižovatkami (chybí, když žádná není). */
export function junctionsField(
  state: VillageState,
  day: number,
  landscape?: Landscape,
): { junctions?: VillageJunction[] } {
  const junctions = junctionViews(state, day, landscape);
  return junctions.length > 0 ? { junctions } : {};
}
