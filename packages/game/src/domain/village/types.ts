// Stav vsi – JSON-serializovatelný (objekty, pole, čísla, řetězce, null).
export type DwellingType = 'zemnice' | 'polozemnice';
export type FieldSurface = 'meadow' | 'shrub' | 'forest';
export interface Position {
  x: number;
  z: number;
  rotation: number;
} // svět, m; ověřuje plán 3
export interface Person {
  id: number;
  bornDay: number;
  dwellingId: number;
}
export interface Dwelling {
  id: number;
  type: DwellingType;
  builtDay: number;
  condition: number /* 0–1 */;
  position: Position;
}
export type PartState = 'founding' | 'ready' | 'sown' | 'fallow';
export interface FieldPart {
  id: number;
  fieldId: number;
  areaM2: number;
  distanceM: number;
  naturalFertility: number; // 0–100 z krajiny
  fertilityShare: number; // aktuální úrodnost / přirozená, 0–1
  bonusUntilDay: number | null; // +20 po vymýcení lesa
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  fallowSinceDay: number | null; // od kdy leží v přílohu
  foundingCost: number; // člověkodny (povrch × plocha + překážky)
  foundingDone: number;
  surface: FieldSurface; // povrch při založení
}
export interface Field {
  id: number;
  outline: [number, number][];
} // obrys jen nese plán 3
export type ConstructionKind = 'dwelling' | 'rebuild' | 'field';
export interface Construction {
  id: number;
  kind: ConstructionKind;
  startedDay: number;
  cost: number;
  done: number;
  dwellingType: DwellingType | null;
  position: Position | null; // dwelling
  dwellingId: number | null; // rebuild
  fieldId: number | null; // field – zakládá díly od nejbližšího
}
export type TaskName = 'reclaim' | 'dig' | 'sow' | 'weed' | 'harvest' | 'thresh';
export interface YearPlan {
  plannedDay: number;
  partIds: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
  harvestedKg: number | null; // čistá úroda sklizená 31. 8. (pro ztrátu nevymláceného 1. 3.)
}
export type ChronicleEvent = { day: number } & (
  | { kind: 'village-founded' }
  | { kind: 'birth' }
  | { kind: 'death'; group: 'child' | 'adult' | 'elder' }
  | { kind: 'household-founded'; dwellingId: number }
  | { kind: 'household-merged'; fromDwellingId: number; toDwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
    }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  | { kind: 'harvest'; kg: number }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  | { kind: 'part-became-forest'; partId: number }
);
export interface VillageState {
  seed: number;
  foundedDay: number;
  lastDay: number; // poslední už odsimulovaný den
  nextId: number;
  people: Person[];
  dwellings: Dwelling[];
  fields: Field[];
  parts: FieldPart[];
  constructions: Construction[];
  plan: YearPlan | null;
  threshingFromPlan: YearPlan | null;
  storesKg: number;
  domesticBacklog: number;
  hungry: boolean;
  commonLaborHistory: number[]; // společná práce posledních 30 dní (pro „má na to“)
  chronicle: ChronicleEvent[];
}
