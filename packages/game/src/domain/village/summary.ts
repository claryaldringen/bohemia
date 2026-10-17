import { TOTAL_GAME_DAYS } from '../calendar';
import { isFull, isOvercrowded, waitingHouseholds } from './dwellings';
import { fallowYears } from './fields';
import { daysUntilHarvest, eatDay } from './food';
import { ageGroup, foodNeedPerDay, occupants } from './people';
import { NO_CRAFTS } from './productivity';
import { DWELLINGS, OVERGROWTH_STAGES } from './rules';
import type {
  Construction,
  ConstructionKind,
  DwellingType,
  FieldPart,
  VillageState,
} from './types';

// Souhrn vsi pro panel hráče a scénu – jen čte stav, nic nemění.

/** Stadium dílu pro scénu: zakládá se, připravený, osetý, nebo příloh podle let zarůstání. */
export type PartStage =
  'founding' | 'ready' | 'sown' | 'young-fallow' | 'meadow' | 'young-growth' | 'shrub' | 'forest';

export interface HouseholdSummary {
  dwellingId: number;
  type: DwellingType;
  occupants: number;
  capacity: number;
  full: boolean;
  overcrowded: boolean;
  condition: number;
}

export interface ConstructionSummary {
  id: number;
  kind: ConstructionKind;
  dwellingType: DwellingType | null;
  dwellingId: number | null;
  fieldId: number | null;
  /** Výměra zakládaného pole (m²), u obydlí null. */
  areaM2: number | null;
  /** Průběh 0–1. */
  progress: number;
}

export interface VillageSummary {
  people: { children: number; adults: number; elders: number };
  households: HouseholdSummary[];
  storesKg: number;
  /** Na kolik měsíců zásoby vystačí při dnešní potřebě (bez lidí 0). */
  storesMonths: number;
  /** Nasycení příštího dne 0–1 podle přídělového systému. */
  satiation: number;
  /** Průměrná společná práce za den (posledních 30 dní). */
  commonLaborPerDay: number;
  /**
   * Některá domácnost je plná (4 dospělí 14–44) a nečeká na ni žádné nové obydlí – upozornění
   * pro hráče, stavbu nepodmiňuje.
   */
  fullHousehold: boolean;
  constructions: ConstructionSummary[];
  /** Ves hladoví – zásoby nevystačí do sklizně (jako `hunger-began` v kronice). */
  hungry: boolean;
  /** Stavby stojí – posledních STALL_DAYS dní nezbyla žádná společná práce. */
  constructionsStalled: boolean;
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
/** Kolik posledních dní bez společné práce znamená, že stavby stojí. */
export const STALL_DAYS = 3;
/** Méně společné práce za den (člověkodny) se bere jako žádná. */
const NO_LABOR = 0.01;

/** Stadium dílu v daný den; příloh podle celých let zarůstání (fields.md – Zarůstání). */
export function partStage(part: FieldPart, day: number): PartStage {
  if (part.state !== 'fallow') return part.state;
  const years = fallowYears(part, day);
  return OVERGROWTH_STAGES.find((s) => years <= s.maxYears)?.stage ?? 'forest';
}

function peopleByGroup(state: VillageState, day: number): VillageSummary['people'] {
  const people = { children: 0, adults: 0, elders: 0 };
  for (const person of state.people) {
    const group = ageGroup(person, day);
    if (group === 'child') people.children++;
    else if (group === 'adult') people.adults++;
    else people.elders++;
  }
  return people;
}

function households(state: VillageState, day: number): HouseholdSummary[] {
  return state.dwellings.map((d) => ({
    dwellingId: d.id,
    type: d.type,
    occupants: occupants(state, d.id).length,
    capacity: DWELLINGS[d.type].capacity,
    full: isFull(state, d.id, day),
    overcrowded: isOvercrowded(state, d.id, day),
    condition: d.condition,
  }));
}

/** Nasycení příštího dne: příděl ze zásob do sklizně (stejně jako eatDay v simulaci). */
function nextDaySatiation(state: VillageState, day: number, needPerDay: number): number {
  if (needPerDay <= 0) return 1;
  const next = Math.min(day + 1, TOTAL_GAME_DAYS - 1);
  return eatDay(state.storesKg, needPerDay, daysUntilHarvest(next), NO_CRAFTS.pottery).satiation;
}

function constructionSummary(state: VillageState, c: Construction): ConstructionSummary {
  const areaM2 =
    c.kind === 'field'
      ? state.parts.filter((p) => p.fieldId === c.fieldId).reduce((s, p) => s + p.areaM2, 0)
      : null;
  return {
    id: c.id,
    kind: c.kind,
    dwellingType: c.dwellingType,
    dwellingId: c.dwellingId,
    fieldId: c.fieldId,
    areaM2,
    progress: c.cost > 0 ? Math.min(1, c.done / c.cost) : 1,
  };
}

/** Stavby stojí: nějaká se staví a posledních STALL_DAYS dní na ni nezbyla společná práce. */
function stalled(state: VillageState): boolean {
  const recent = state.commonLaborHistory.slice(-STALL_DAYS);
  return (
    state.constructions.length > 0 &&
    recent.length === STALL_DAYS &&
    recent.every((labor) => labor < NO_LABOR)
  );
}

/** Souhrn vsi v den `day` (stav má být dopočítaný do tohoto dne). */
export function summarizeVillage(state: VillageState, day: number): VillageSummary {
  const needPerDay = state.people.reduce((sum, p) => sum + foodNeedPerDay(p, day), 0);
  const history = state.commonLaborHistory;
  return {
    people: peopleByGroup(state, day),
    households: households(state, day),
    storesKg: state.storesKg,
    storesMonths:
      needPerDay > 0 ? state.storesKg / ((needPerDay * DAYS_PER_YEAR) / MONTHS_PER_YEAR) : 0,
    satiation: nextDaySatiation(state, day, needPerDay),
    commonLaborPerDay: history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0,
    fullHousehold: waitingHouseholds(state, day) > 0,
    constructions: state.constructions.map((c) => constructionSummary(state, c)),
    hungry: state.hungry,
    constructionsStalled: stalled(state),
  };
}
