import { effectiveFertility, expectedNetKg, grossYieldPerHa, reclaimCostPerHa } from './fields';
import { HAY, PLAN_HAY_KEEP, mowingWorkShare, mowingYieldPerHa } from './hay';
import { fieldWorkPerHa, hayWorkPerHa } from './productivity';
import { FERTILITY, LEGUMES, SEED_KG_PER_HA } from './rules';
import type { FieldPart, FieldTask, VillageState } from './types';
import { cropGrossPerHa, partWork } from './year-plan';

// Rovnovážné hospodaření (diet.md – Rovnovážné hospodaření; Martin 19. 10. 2026: „ok, udělej to
// tak, aby ves hospodařila rovnovážně. Tj. aby byla sytá, měla ± ideální kombinaci stravy, ale
// aby jí zároveň zbylo co nejvíce volného času na rozvoj.“). Cena jídla v práci za dnešních
// podmínek vsi – kolik člověkodní stojí kilogram obilí, luštěnin a sena. Z ní ves volí skladbu
// stád a plochu luštěnin (livestock.ts – `balancedHerds`). Čistá funkce stavu, deterministicky.

/** Cena jídla v práci (člověkodny na kg). */
export interface FoodCosts {
  /** Kilogram čisté úrody obilí – práce osevu dílů v oběhu (i vracení přílohu), vzdálenost. */
  grainPerKg: number;
  /** Kilogram čisté úrody luštěnin – sazby luštěnin, menší úroda. */
  legumePerKg: number;
  /** Kilogram sena v době zkrmení – seč, sušení, svoz a stohování, vzdálenost luk, ztráty. */
  hayPerKg: number;
}

const M2_PER_HA = 10_000;
const RATE_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];
/** Bez dílů v osevu – typický díl: úrodnost a vzdálenost (m). */
const TYPICAL_PART = { fertility: 60, distanceFactor: 1.05 };
/** Bez plánu seče – louky průměrně tolik dráž kvůli vzdálenosti. */
const TYPICAL_MEADOW_FACTOR = 1.2;

/** Kolik let se díl v přílohové soustavě oseje, než jde zase ladem (fields.md – Přílohová soustava). */
function sownYears(): number {
  let share = 1;
  let years = 0;
  while (share >= FERTILITY.sowableMin - 1e-9) {
    share -= FERTILITY.sowDepletion;
    years++;
  }
  return Math.max(1, years);
}

/**
 * Cena jídla v práci za dnešních podmínek vsi (diet.md – Rovnovážné hospodaření): obilí a luštěniny
 * z dílů, které ves právě oseje (práce dílu podle sazeb s pokrytím nástroji, vzdáleností a orbou
 * spřežením ÷ čistá úroda dílu podle dnešní úrodnosti), s vracením drnu přílohu rozpočteným do let
 * osevu; bez dílů v osevu typický díl. Seno podle sazby seče, výnosu louky, vzdálenosti luk
 * letošní seče a ztráty ve stohu do zkrmení.
 */
export function foodCosts(
  state: Pick<VillageState, 'parts' | 'hay'>,
  day: number,
  toolCoverage: number,
  plough = false,
): FoodCosts {
  const reclaim = reclaimCostPerHa('meadow', toolCoverage) / sownYears();
  const sown = state.parts.filter((p) => p.state === 'sown' || p.state === 'ready');
  let grainWork = 0;
  let grainKg = 0;
  let legumeWork = 0;
  let legumeKg = 0;
  for (const part of sown) {
    const ha = part.areaM2 / M2_PER_HA;
    grainWork += workOf(part, day, toolCoverage, plough, 'spring') + reclaim * ha;
    grainKg += Math.max(0, expectedNetKg(part, day));
    legumeWork += workOf(part, day, toolCoverage, plough, 'legume') + reclaim * ha;
    legumeKg += Math.max(
      0,
      (cropGrossPerHa('legume', effectiveFertility(part, day)) - LEGUMES.seedKgPerHa) * ha,
    );
  }
  if (grainKg <= 0 || legumeKg <= 0) {
    const perHa = (crop: 'spring' | 'legume'): number =>
      RATE_TASKS.reduce((sum, task) => sum + fieldWorkPerHa(task, toolCoverage, crop), 0) *
        TYPICAL_PART.distanceFactor +
      reclaim;
    const grain = grossYieldPerHa(TYPICAL_PART.fertility);
    grainWork = perHa('spring');
    grainKg = grain - SEED_KG_PER_HA;
    legumeWork = perHa('legume');
    legumeKg = cropGrossPerHa('legume', TYPICAL_PART.fertility) - LEGUMES.seedKgPerHa;
  }
  const mowing = state.hay?.mowing;
  const workPerHa = hayWorkPerHa(toolCoverage);
  const meadowFactor =
    mowing && mowing.yieldKg > 0
      ? mowing.required /
        ((mowing.yieldKg / mowingYieldPerHa(mowing)) * workPerHa * mowingWorkShare(mowing))
      : TYPICAL_MEADOW_FACTOR;
  return {
    grainPerKg: grainWork / grainKg,
    legumePerKg: legumeWork / legumeKg,
    hayPerKg: (workPerHa * meadowFactor) / HAY.yieldKgPerHa / PLAN_HAY_KEEP,
  };
}

/** Práce dílu za rok (člověkodny) pro plodinu `crop` – všechny úlohy dílu. */
function workOf(
  part: FieldPart,
  day: number,
  toolCoverage: number,
  plough: boolean,
  crop: 'spring' | 'legume',
): number {
  const work = partWork(part, day, toolCoverage, plough, crop);
  return Object.values(work).reduce((sum, v) => sum + v, 0);
}
