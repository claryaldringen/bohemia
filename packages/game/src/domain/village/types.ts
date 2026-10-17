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
/** Políčko krajiny – sloupec x a řádek y mřížky. */
export interface TileCell {
  x: number;
  y: number;
}
export interface FieldPart {
  id: number;
  fieldId: number;
  areaM2: number;
  distanceM: number;
  naturalFertility: number; // 0–100 z krajiny
  fertilityShare: number; // aktuální úrodnost / přirozená, 0–1
  bonusUntilDay: number | null; // do kdy platí bonus vymýceného lesa (FOREST_BONUS)
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  fallowSinceDay: number | null; // od kdy leží v přílohu
  foundingCost: number; // člověkodny (povrch × plocha + překážky)
  foundingDone: number;
  surface: FieldSurface; // povrch při založení
  cell?: TileCell; // políčko krajiny = čtverec pole, který díl zabírá
}
/** Pole – jeho čtverce jsou políčka jeho dílů (`FieldPart.cell`). */
export interface Field {
  id: number;
  /** @deprecated Obrys z prvního prototypu (pole se kreslila volným obrysem) – jen staré vsi. */
  outline?: [number, number][];
}
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
/** Polní práce s pevnou sazbou na osetý hektar (vracení přílohu se počítá podle stáří přílohu). */
export type FieldTask = Exclude<TaskName, 'reclaim'>;
/**
 * Meze produktivity (Martin): hodnota bez řemesel (`worst`) a s plně pokrytou potřebou výrobků
 * řemeslníků (`best`); mezi nimi lineárně podle pokrytí (productivity.ts).
 */
export interface Bounds {
  readonly worst: number;
  readonly best: number;
}
/** Pokrytí potřeby výrobků řemeslníků 0–1 (crafts.md): nástroje od kováře, nádoby od hrnčíře. */
export interface CraftCoverage {
  readonly tools: number;
  readonly pottery: number;
}
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
