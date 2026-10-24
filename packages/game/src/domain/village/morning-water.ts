import { dateOfDayIndex, dayIndexOf } from '../calendar';
import type { WaterCartPlan } from './cart-jobs';
import { ironTravellers } from './crafts';
import { householdWater, type HouseholdWater } from './labor';
import { lordApartIds, trainingFamily } from './lord';
import { MORNING_WATER } from './rules';
import type { CropWork, Person, VillageState } from './types';
import { cropTaskWindows, neededTaskRemaining, planCrops, windowEndOf } from './year-plan';

const EPS = 1e-9;
const MONTHS = 12;

/**
 * Lidé, kteří dnes pracují se vsí, a domácnost dvorce, jejíž minimum kryje cvičící rodina (lord.md –
 * Den rodiny) – jedno místo pravdy pro práci dne (`work`) i scénu (komu vůz přivezl vodu): bez
 * domácností dílen, které dnes pracují v dílně (`crafts` – id obydlí), bez lidí na cestě pro kování
 * k vozu (wagons.md – Kování vozů) a bez cvičící rodiny vojvody.
 */
export function villagersToday(
  state: VillageState,
  day: number,
  crafts: ReadonlySet<number>,
): { villagers: readonly Person[]; manorSkip: ReadonlySet<number> } {
  const travelling = ironTravellers(state);
  const apart = lordApartIds(state, day);
  const family = trainingFamily(state, day);
  const villagers =
    crafts.size > 0 || travelling.size > 0 || apart.size > 0
      ? state.people.filter(
          (p) => !crafts.has(p.dwellingId) && !travelling.has(p.id) && !apart.has(p.id),
        )
      : state.people;
  return { villagers, manorSkip: new Set(family?.lord ? [family.lord.dwellingId] : []) };
}

/**
 * Domácnosti vsi a jejich chůze pro vodu dnes (`householdWater` lidí `villagersToday`) – podklad pro
 * vodu vozem v simulaci i ve scéně (wagons.md – Co vozy vozí).
 */
export function waterHouseholdsToday(
  state: VillageState,
  day: number,
  crafts: ReadonlySet<number>,
): HouseholdWater[] {
  const { villagers, manorSkip } = villagersToday(state, day, crafts);
  return householdWater(villagers, state.dwellings, manorSkip);
}

/** Okno orby jedné plodiny – kolik orby zbývá (součtem s dřívějšími okny) a kolik dní po dnešku. */
export interface PloughWindow {
  /** Orba, která zbývá do konce okna (jednotky kapacity rádel – výkon 1), i s dřívějšími okny. */
  need: number;
  /** Dny okna po dnešku. */
  daysLeft: number;
}

/**
 * Okna orby plodin plánu, která dnes běží (wagons.md – Voda ráno ve dny orby): zbytek orby
 * (`neededTaskRemaining`) přepočtený výkonem dílu (`factor` – brázda a cesta k bloku), napřed
 * plodina s dřívějším koncem okna, `need` součtem s dřívějšími.
 */
export function ploughWindowsToday(
  state: VillageState,
  day: number,
  factor: (work: CropWork) => number,
): PloughWindow[] {
  if (!state.plan) return [];
  const { year, month } = dateOfDayIndex(day);
  const windows: { end: number; need: number; daysLeft: number }[] = [];
  for (const { crop, work } of planCrops(state.plan)) {
    const left = neededTaskRemaining(work, 'plough');
    if (left <= EPS) continue;
    const end = windowEndOf(cropTaskWindows(crop, 'plough'), month);
    if (end === null) continue;
    const f = factor(work);
    // první den měsíce po konci okna (konec okna může být v příštím roce – měsíc > 12)
    const after = end + 1;
    const first = dayIndexOf({
      year: year + Math.floor((after - 1) / MONTHS),
      month: ((after - 1) % MONTHS) + 1,
      day: 1,
    });
    windows.push({ end, need: f > EPS ? left / f : Infinity, daysLeft: first - 1 - day });
  }
  windows.sort((a, b) => a.end - b.end);
  let sum = 0;
  return windows.map((w) => {
    sum += w.need;
    return { need: sum, daysLeft: w.daysLeft };
  });
}

/** Rozhodnutí rána (`morningWater`). */
export interface MorningWater {
  plan: WaterCartPlan;
  /** Podíl dne páru u vody (jízdy ÷ jízdy vozu za den). */
  share: number;
  /** O kolik méně rádla dnes zorají (jednotky kapacity rádel). */
  cut: number;
  /** Úspora vody – ušetřená chůze s vědry − posádka (čd). */
  gain: number;
}

/**
 * Voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby; Martin 24. 10. 2026: „Rozhodne
 * ekonomika“): pár od rádla sveze ráno vodu (`plan` – jeden vůz), když jízdy zaberou nejvýš
 * MORNING_WATER.maxTeamShare dne páru a úspora vody je kladná. Ztráta orby = dnes naplánovaná orba
 * (`planned`) + podíl dne páru nad kapacitu rádel (`capacity` páry `pairs`); bez ztráty voda
 * vyhraje vždy. Se ztrátou jen s rezervou okna orby: zbytek orby každého okna (`windows`) se vejde
 * do MORNING_WATER.windowReserve kapacity ve zbývajících dnech – jinak má orba přednost (null).
 */
export function morningWater(input: {
  plan: WaterCartPlan;
  capacity: number;
  pairs: number;
  planned: number;
  windows: readonly PloughWindow[];
}): MorningWater | null {
  const { plan, capacity, pairs, planned, windows } = input;
  const share = plan.cartDays;
  if (pairs <= 0 || share > MORNING_WATER.maxTeamShare + EPS) return null;
  const gain = plan.saved - plan.crew;
  if (gain <= EPS) return null;
  const cut = Math.max(0, planned + (share * capacity) / pairs - capacity);
  if (cut > EPS) {
    const ploughed = planned - cut;
    const reserve = windows.every(
      (w) => w.need - ploughed <= MORNING_WATER.windowReserve * capacity * w.daysLeft + EPS,
    );
    if (!reserve) return null;
  }
  return { plan, share, cut: cut > EPS ? cut : 0, gain };
}
