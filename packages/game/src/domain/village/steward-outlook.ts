import { dateOfDayIndex, dayIndexOf } from '../calendar';
import { fieldCapacity, ROTATION } from './field-capacity';
import { distanceFactor, fallowStage, partWalkDistance, reclaimCostPerHa } from './fields';
import { ableTeams } from './oxen';
import { ploughWorkPerHa } from './plough';
import { fieldWorkPerHa } from './productivity';
import { SEED_KG_PER_HA, WINDOWS } from './rules-fields';
import { foodUntilHarvestKg, grainSeedTakenKg, sowableSeedKg } from './seed';
import { sowingCapacity } from './simulate-plan';
import type { CraftCoverage, FieldPart, VillageState } from './types';

// Výhled vsi – „ideální stav“ (steward.md – Model kapacity vsi; Martin 1. 11. 2026: „Měl by přece
// umět spočítat ideální umístění všeho a nejlepší postupy.“): kolik ves za hospodářský rok oseje
// podle práce v oknech setí, podle osiva a podle půdy, které z toho je úzké hrdlo a kolik lidí ves
// udrží. Správce z něj staví cíl polí, „je kam pole rozšířit“ a přelidnění. Zná jen dnešní stav
// vsi (lidé, díly, letošní plán, zásoby) – počasí ani budoucí úrodu nečte. Čistá funkce.

/** Co ves brzdí: půda (pole v oběhu), práce v oknech setí, nebo osivo. */
export type StewardBottleneck = 'land' | 'labor' | 'seed';

export interface StewardOutlook {
  /** Osev za hospodářský rok (ha) podle práce v oknech setí (kopání, orba, setí, vracení přílohu). */
  laborHa: number;
  /** Osev podle osiva – letos vzaté a co smí do země (ha); mimo okna setí nekonečno. */
  seedHa: number;
  /** Osev podle půdy – pole v oběhu ÷ `ROTATION_FACTOR` (ha, `fieldCapacity`). */
  landHa: number;
  /** Úzké hrdlo letošního osevu – nejmenší z osevů (při shodě půda, pak práce). */
  bottleneck: StewardBottleneck;
  /**
   * Trvalé hrdlo – půda, nebo práce (osivo chybí jen do příští sklizně, pole stojí roky): podle
   * něj cíl polí, „je kam pole rozšířit“ a přelidnění.
   */
  lasting: 'land' | 'labor';
  /** Člověkodny lidí v oknech setí na osetý hektar (vracení přílohu, kopání, setí). */
  workPerHa: number;
  /** Lidé, které pole uživí podle dnešní půdy (`fieldCapacity`). */
  landPeople: number;
  /** Udržitelní lidé – „Pole uživí“ při osevu trvalého hrdla. */
  sustainablePeople: number;
}

const M2_PER_HA = 10_000;
/** Poslední měsíc setí hospodářského roku (jař v dubnu) – do něj osivo brzdí letošní osev. */
const LAST_SOWING_MONTH = Math.max(...WINDOWS.sow.map(([, to]) => to));

/** 1. 9. hospodářského roku, do kterého den patří. */
function farmYearStart(day: number): number {
  const date = dateOfDayIndex(day);
  return dayIndexOf({ year: date.month >= 9 ? date.year : date.year - 1, month: 9, day: 1 });
}

/** Díly v oběhu – zakládané jako by už byly (jako `fieldTarget`). */
function rotationParts(state: VillageState): FieldPart[] {
  return state.parts.map((p) => (p.state === 'founding' ? { ...p, state: 'fallow' as const } : p));
}

/**
 * Práce lidí a spřežení na osetý hektar: z letošního plánu (`season` – skutečná práce dílů, které
 * ves vzala, i se vzdáleností a stadiem přílohu), bez plánu podle sazeb – kopání (orba) a setí
 * a vracení přílohu jednou za `ROTATION.sown` let osevu, × průměrný příplatek za vzdálenost.
 */
function workPerSownHa(
  state: VillageState,
  day: number,
  tools: number,
  plough: boolean,
): { people: number; plough: number } {
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  let ha = 0;
  let people = 0;
  let ploughWork = 0;
  for (const crop of state.season?.crops ?? []) {
    ha += crop.partIds.reduce((sum, id) => sum + (byId.get(id)?.areaM2 ?? 0), 0) / M2_PER_HA;
    people += crop.required.reclaim + crop.required.dig + crop.required.sow;
    ploughWork += crop.plough?.required ?? 0;
  }
  if (ha > 0 && people > 0) return { people: people / ha, plough: ploughWork / ha };
  const parts = state.parts.filter((p) => p.state !== 'founding');
  const area = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const factor =
    area > 0
      ? parts.reduce((sum, p) => sum + p.areaM2 * distanceFactor(partWalkDistance(p)), 0) / area
      : 1;
  const fallow = parts.filter((p) => p.state === 'fallow');
  const fallowArea = fallow.reduce((sum, p) => sum + p.areaM2, 0);
  const reclaim =
    fallowArea > 0
      ? fallow.reduce(
          (sum, p) => sum + p.areaM2 * reclaimCostPerHa(fallowStage(p, day), tools),
          0,
        ) / fallowArea
      : reclaimCostPerHa('meadow', tools);
  const dig = plough ? 0 : fieldWorkPerHa('dig', tools);
  return {
    people: (dig + fieldWorkPerHa('sow', tools) + reclaim / ROTATION.sown) * factor,
    plough: plough ? ploughWorkPerHa(tools) * factor : 0,
  };
}

/**
 * Výhled vsi (steward.md – Model kapacity vsi): osev podle práce = kapacita setí celého
 * hospodářského roku (`sowingCapacity` od 1. 9. – podzim i jaro, lidé po denním minimu, spřežení
 * orbou) ÷ práce na osetý hektar; osev podle osiva = (osivo, které letošní plán vzal, + co smí
 * do země + luštěniny) ÷ `SEED_KG_PER_HA` – jen do konce setí (po dubnu se letošní osivo už
 * neřeší a příští ves ještě nezná); osev podle půdy z `fieldCapacity`. Udržitelní lidé = „Pole
 * uživí“ × osev trvalého hrdla (půda, nebo práce) ÷ osev podle půdy. Ves bez lidí nebo bez pole:
 * hrdlem půda, nula lidí.
 */
export function stewardOutlook(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): StewardOutlook {
  const capacity = fieldCapacity(
    { parts: rotationParts(state), people: state.people, fieldFood: state.fieldFood },
    day,
    coverage.pottery,
  );
  const landHa = capacity?.sownHa ?? 0;
  const landPeople = capacity?.people ?? 0;
  const plough = ableTeams(state, day) > 0;
  const windows = sowingCapacity(state, farmYearStart(day), coverage, plough);
  const work = workPerSownHa(state, day, coverage.tools, plough);
  const peopleHa = work.people > 0 ? (windows.autumn + windows.spring) / work.people : Infinity;
  const ploughHa =
    windows.plough && work.plough > 0
      ? (windows.plough.autumn + windows.plough.spring) / work.plough
      : Infinity;
  const laborHa = Math.min(peopleHa, ploughHa);
  const month = dateOfDayIndex(day).month;
  const sowing = month >= 9 || month <= LAST_SOWING_MONTH;
  const seedKg = sowing
    ? grainSeedTakenKg(state) +
      sowableSeedKg(state, 'grain', foodUntilHarvestKg(state, day)) +
      (state.legumesKg ?? 0)
    : Infinity;
  const seedHa = seedKg / SEED_KG_PER_HA;
  const sownHa = Math.min(landHa, laborHa, seedHa);
  const bottleneck: StewardBottleneck =
    sownHa >= landHa ? 'land' : sownHa >= laborHa ? 'labor' : 'seed';
  const lasting = laborHa < landHa ? 'labor' : 'land';
  return {
    laborHa,
    seedHa,
    landHa,
    bottleneck,
    lasting,
    workPerHa: work.people,
    landPeople,
    sustainablePeople: landHa > 0 ? (landPeople * Math.min(landHa, laborHa)) / landHa : 0,
  };
}
