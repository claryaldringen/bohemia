// Výhled osetých dílů pro panel dílu a pole (fields.md – Co hráč vidí, Očekávaná úroda a jestli
// práce stačí; návrh Clauda): kolik dá díl úrody a jestli práce na zbylé kroky do konce okna stačí.
// Jen čte stav – stejné výpočty jako sklizeň (`harvestKg`, `dayPartLosses`) a pomoc rodiny
// (`planLoad`, `cropLoadOf`, `sowingCapacity`), simulace výhled nepoužívá.

import { dayPartLosses } from '../disasters/disasters';
import { partYearWork, type PartYearWork } from './field-progress';
import { effectiveFertility, isWeedFree } from './fields';
import { CROP_WINDOWS } from '../rules';
import { orchardHarvestLoad, sowingCapacity } from '../core/simulate-plan';
import {
  SOWING_CAPACITY_WINDOWS,
  augustOverflow,
  cropLoadOf,
  harvestOverflow,
  planLoad,
  windowDaysLeft,
} from './sowing';
import type { Landscape } from '../../landscape';
import type { CraftCoverage, Crop, FieldPart, SeasonCrop, VillageState } from '../types';
import {
  cropWeatherOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from '../disasters/weather-effects';
import {
  cropGrossPerHa,
  cropsAfield,
  lateHarvestRemaining,
  sownShare,
  seasonCrop,
  unweededYield,
  workedShare,
} from '../core/year-plan';

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel při porovnání práce s kapacitou. */
const EPSILON = 1e-9;

/** Krok práce osetého dílu, který výhled hlídá: příprava půdy, setí a sklizeň. */
export type OutlookStep = 'prep' | 'sow' | 'harvest';

/**
 * Práce, která do konce okna nestačí (zátěž okna nad volnou prací vsi, ve žních i s pomocí
 * cvičící rodiny vojvody – `sowingCapacity` s `lord`, jako `lordHarvestHelp`). Příprava a setí mají jedno okno
 * (ozim září–říjen, jař, luštěniny a len do konce dubna – podzim napřed), sklizeň všech plodin
 * jedno do konce srpna (ozim, luštěniny a len v červenci, co nestihnou, v srpnu před jaří –
 * fields.md, Žně i v srpnu; v srpnu i výmlat ozimu).
 */
export interface WorkShortfall {
  steps: readonly OutlookStep[];
  /** Měsíc, kterým okno končí (1–12). */
  endMonth: number;
  /** Chybějící práce lidí (člověkodny); 0 = lidí dost. */
  manDays: number;
  /** Chybějící orba spřežení (člověkodny orby); 0 = orby dost, ves bez spřežení 0. */
  ploughManDays: number;
}

/**
 * Výhled osetého dílu: očekávaná úroda (kg – snopy obilí a luštěnin, třený len) při dodělání
 * zbylé práce a z čeho je – úroda z úrodnosti a podíly, které berou vlivy (počasí, které už je
 * vidět, škoda zvěře, kroupy, voda a smršť, nedodělaná práce po konci okna; záporné počasí =
 * dobrý rok přidá). Kroky, na které práce do konce okna nestačí (jen ty, které díl ještě nemá
 * hotové).
 */
export interface PartOutlook {
  crop: Crop;
  kg: number;
  /** Úroda z úrodnosti dílu – plná a včasná práce, bez počasí a škod (kg). */
  fullKg: number;
  weather: number;
  wildlife: number;
  disasters: number;
  work: number;
  short: WorkShortfall[];
}

/** Okno práce, kterou výhled hlídá – klíč chybějící práce (`WorkShortfall`). */
type OutlookWindow = 'autumnWinter' | 'spring' | 'august' | 'september';

const WINDOW_END: Record<OutlookWindow, number> = {
  autumnWinter: 10,
  spring: 4,
  august: 8,
  september: 9,
};

/**
 * Okna kroků plodiny: příprava a setí, sklizeň (ozim, luštěniny a len do konce srpna, jař do konce
 * září – fields.md, Žeň jaře i v září).
 */
function cropWindows(crop: Crop): { sow: OutlookWindow; harvest: OutlookWindow } {
  return {
    sow: crop === 'winter' ? 'autumnWinter' : 'spring',
    harvest: crop === 'spring' ? 'september' : 'august',
  };
}

/**
 * Chybějící práce po oknech (jen okna, která letos ještě běží nebo přijdou, a kde chybí): zbytek
 * letošní práce (`planLoad` – i se sklizní jablek) proti volné práci
 * vsi do konce hospodářského roku (`sowingCapacity` i s cvičící rodinou – ta pomáhá ve žních
 * a s přípravou půdy a setím, když ves nestíhá – lord.md, Kdy jde rodina na pole; D102). Jař: vrácení a kopání napřed na podzim, co po ozimu zbude,
 * zbytek se setím na jaře; žeň, kterou červenec nestihne, se žne v srpnu (`harvestOverflow`), co
 * nestihne srpen, v září (`augustOverflow` – fields.md, Žeň jaře i v září).
 */
function seasonShortfalls(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): Partial<Record<OutlookWindow, { manDays: number; ploughManDays: number }>> {
  const season = state.season;
  if (!season) return {};
  // v září i žeň jaře, kterou srpen nedosklidil (fields.md – Žeň jaře i v září)
  const load = {
    ...cropLoadOf(planLoad(season, orchardHarvestLoad(state))),
    september: lateHarvestRemaining(state),
  };
  // jako `lordHelpDay` – orba jaře; rok bez jaře podle ozimu
  const plough =
    (seasonCrop(season, 'spring') ?? seasonCrop(season, 'winter'))?.plough !== undefined;
  const cap = sowingCapacity(state, day, coverage, plough, landscape, undefined, { lord: true });
  const autumnLeft = Math.max(0, cap.autumn - load.winterAutumn);
  const springOver = Math.max(0, load.springReclaim + load.springDig - autumnLeft);
  const people: Record<OutlookWindow, number> = {
    autumnWinter: load.winterAutumn - cap.autumnWinter,
    spring: load.springSow + springOver - cap.spring,
    // v srpnu se napřed dožne, co červenec nestihl (CROP_ORDER) – po srpnu propadne
    august: harvestOverflow(load, cap.july) - cap.august,
    // jař, kterou srpen nestihne, se žne v září (fields.md – Žeň jaře i v září)
    september: load.september + augustOverflow(load, cap.july, cap.august) - cap.september,
  };
  const ploughs: Partial<Record<OutlookWindow, number>> = cap.plough
    ? {
        autumnWinter: load.ploughWinter - cap.plough.autumnWinter,
        spring:
          load.ploughSpring -
          (Math.max(0, cap.plough.autumn - load.ploughWinter) + cap.plough.spring),
      }
    : {};
  const result: Partial<Record<OutlookWindow, { manDays: number; ploughManDays: number }>> = {};
  for (const window of Object.keys(people) as OutlookWindow[]) {
    // po konci okna se nic nestihne – nedodělek bere úrodu (`workFactor`), ne varování
    // září žně jaře přijde po srpnu hospodářského roku – hlídá se, dokud srpen nepřišel
    const segments = SOWING_CAPACITY_WINDOWS[window === 'september' ? 'august' : window];
    if (windowDaysLeft(day, segments) <= 0) continue;
    const manDays = Math.max(0, people[window]);
    const ploughManDays = Math.max(0, ploughs[window] ?? 0);
    if (manDays > EPSILON || ploughManDays > EPSILON) result[window] = { manDays, ploughManDays };
  }
  return result;
}

/** Okno úlohy plodiny ještě letos běží nebo přijde (dny okna do konce hospodářského roku). */
function windowAhead(crop: Crop, task: 'sow' | 'weed', day: number): boolean {
  return windowDaysLeft(day, CROP_WINDOWS[crop][task]) > 0;
}

/** Podíl úrody, který dá letošní práce plodiny: hotová práce po konci okna, jinak celá. */
function workFactor(work: SeasonCrop, crop: Crop, part: FieldPart, day: number): number {
  const sow = windowAhead(crop, 'sow', day) ? 1 : sownShare(work);
  const unweeded = unweededYield(crop);
  const weeded =
    isWeedFree(part, day) || windowAhead(crop, 'weed', day) ? 1 : workedShare(work, 'weed');
  return sow * (unweeded + (1 - unweeded) * weeded);
}

/** Podíl, o který vliv úrodu zmenší (1 − násobek); bez vlivu 0. */
const lossOf = (kept: number): number => 1 - kept;

/** Výhled jednoho dílu (viz `PartOutlook`) – bez kroků, na které práce nestačí. */
function partOutlook(
  state: VillageState,
  day: number,
  work: SeasonCrop,
  crop: Crop,
  part: FieldPart,
): PartOutlook {
  const fullKg = cropGrossPerHa(crop, effectiveFertility(part, day)) * (part.areaM2 / M2_PER_HA);
  const grain = crop === 'winter' || crop === 'spring';
  const base = grain ? state.wildlife?.damage?.parts : undefined;
  const key = String(part.id);
  // celkem stejnou funkcí jako sklizeň (`harvestKg`), počasí jen co už je vidět
  const kept = 1 - (dayPartLosses(state, day, crop, [part.id], base, true)?.[key]?.share ?? 0);
  const weather = hasWeather(state) ? cropWeatherOf(state, day, true) : undefined;
  const weatherKept =
    weather && weatherChangesCrop(weather, crop)
      ? partWeatherFactor(weather, crop, state.disasters?.protection?.parts[key])
      : 1;
  const wildlifeKept = 1 - (base?.[key]?.share ?? 0);
  const both = weatherKept * wildlifeKept;
  const disastersKept = both > EPSILON ? kept / both : 1;
  const workKept = workFactor(work, crop, part, day);
  return {
    crop,
    kg: Math.max(0, fullKg * workKept * kept),
    fullKg,
    weather: lossOf(weatherKept),
    wildlife: lossOf(wildlifeKept),
    disasters: lossOf(disastersKept),
    work: lossOf(workKept),
    short: [],
  };
}

/** Kroky dílu, které ještě nemá hotové (podle postupu práce po čtvercích – `partYearWork`). */
function stepsLeft(work: PartYearWork | undefined): Set<OutlookStep> {
  const crop = work?.crop;
  const left = new Set<OutlookStep>();
  if (!crop) return left;
  if (crop.prep && crop.prep.share < 1 - EPSILON) left.add('prep');
  if (crop.sow < 1 - EPSILON) left.add('sow');
  if (crop.harvest < 1 - EPSILON) left.add('harvest');
  return left;
}

/**
 * Výhled osetých dílů v den `day` (díl id → výhled) – jen díly letošní práce (hospodářského roku), které ještě
 * nejsou sklizené. `yearWork` = letošní práce dílů (`partYearWork`), když ji volající už má.
 */
export function fieldOutlook(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
  yearWork: ReadonlyMap<number, PartYearWork> = partYearWork(state, day),
): Map<number, PartOutlook> {
  const result = new Map<number, PartOutlook>();
  const season = state.season;
  if (!season) return result;
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  const shortfalls = seasonShortfalls(state, day, coverage, landscape);
  // i jař, kterou srpen nedosklidil (fields.md – Žeň jaře i v září)
  for (const { crop, work } of cropsAfield(state)) {
    if (work.harvestedKg !== null) continue;
    const windows = cropWindows(crop);
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (!part || part.state !== 'sown') continue;
      const outlook = partOutlook(state, day, work, crop, part);
      const left = stepsLeft(yearWork.get(id));
      const add = (window: OutlookWindow, steps: readonly OutlookStep[]): void => {
        const missing = shortfalls[window];
        const open = steps.filter((s) => left.has(s));
        if (missing && open.length > 0) {
          outlook.short.push({ steps: open, endMonth: WINDOW_END[window], ...missing });
        }
      };
      add(windows.sow, ['prep', 'sow']);
      add(windows.harvest, ['harvest']);
      result.set(id, outlook);
    }
  }
  return result;
}
