import type {
  Dwelling,
  DwellingType,
  NeighborDirection,
  Person,
  Sex,
  VillageState,
} from '../types';

// Lidé s příbuzenstvím pro testy (kinship.md) – věk, pohlaví, dům a vazby.

export const YEAR = 365.25;
/** Dostatečně pozdě, aby šly narodit všechny věky. */
export const DAY = 100 * YEAR;

export interface KinSpec {
  id: number;
  age: number;
  sex: Sex;
  home?: number;
  spouse?: number;
  mother?: number;
  father?: number;
  origin?: NeighborDirection;
}

/** Člověk daného věku (uprostřed roku) s vazbami; bez domu bydlí v obydlí 1. */
export function kin(spec: KinSpec, day = DAY): Person {
  return {
    id: spec.id,
    bornDay: day - Math.ceil((spec.age + 0.5) * YEAR),
    dwellingId: spec.home ?? 1,
    sex: spec.sex,
    ...(spec.spouse === undefined ? {} : { spouseId: spec.spouse }),
    ...(spec.mother === undefined ? {} : { motherId: spec.mother }),
    ...(spec.father === undefined ? {} : { fatherId: spec.father }),
    ...(spec.origin === undefined ? {} : { origin: spec.origin }),
  };
}

export function dwelling(id: number, type: DwellingType = 'zemnice'): Dwelling {
  return { id, type, builtDay: 0, condition: 1, position: { x: 0, z: 0, rotation: 0 } };
}

/** Ves bez polí a staveb dopočítaná do DAY. */
export function village(
  people: Person[],
  dwellings: Dwelling[] = [dwelling(1)],
  extra: Partial<VillageState> = {},
): VillageState {
  return {
    seed: 1,
    foundedDay: 0,
    lastDay: DAY,
    nextId: 1000,
    people,
    dwellings,
    fields: [],
    parts: [],
    constructions: [],
    season: null,
    threshingSeason: null,
    storesKg: 0,
    domesticBacklog: 0,
    hungry: false,
    commonLaborHistory: [],
    chronicle: [],
    ...extra,
  };
}

/** Manželé – muž a žena (s jejich id). */
export function couple(
  husband: Omit<KinSpec, 'sex' | 'spouse'>,
  wife: Omit<KinSpec, 'sex' | 'spouse'>,
): KinSpec[] {
  return [
    { ...husband, sex: 'male', spouse: wife.id },
    { ...wife, sex: 'female', spouse: husband.id },
  ];
}

/** Vojvoda sledované vsi (`trackedVillage`). */
export const LINE_LORD_ID = 10;

/** Sledovaná ves – vojvoda LINE_LORD_ID v dvorci (1); příznak rodu má on a jeho synové. */
export function trackedVillage(
  specs: KinSpec[],
  dwellings = [dwelling(1), dwelling(2), dwelling(3)],
  extra: Partial<VillageState> = {},
): VillageState {
  const s = village(
    specs.map((k) => kin(k)),
    dwellings,
    {
      manorId: 1,
      dynasty: { lordId: LINE_LORD_ID, lords: [{ id: LINE_LORD_ID, fromDay: DAY }] },
      ...extra,
    },
  );
  for (const p of s.people) {
    if (p.sex === 'male' && (p.id === LINE_LORD_ID || p.fatherId === LINE_LORD_ID)) p.line = true;
  }
  return s;
}
