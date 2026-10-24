import { dateOfDayIndex, dayIndexOf } from '../calendar';
import type { WaterCartPlan } from './cart-jobs';
import { ironTravellers } from './crafts';
import { householdWater, type HouseholdWater } from './labor';
import { familyHomes, lordApartIds, trainingFamily } from './lord';
import { MORNING_WATER } from './rules';
import type { CropWork, Person, VillageState } from './types';
import { cropTaskWindows, neededTaskRemaining, planCrops, windowEndOf } from './year-plan';

const EPS = 1e-9;
const MONTHS = 12;

/**
 * Lidé, kteří dnes pracují se vsí, a domácnosti dvorce a vedlejších manželek vojvody, jejichž
 * minimum kryje cvičící rodina (lord.md – Den rodiny, Rod vojvody – Manželky; `familyHomes`) –
 * jedno místo pravdy pro práci dne (`work`) i scénu (komu vůz přivezl vodu): bez domácností dílen, které dnes pracují v dílně (`crafts` – id obydlí), bez lidí na cestě pro kování
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
  return { villagers, manorSkip: familyHomes(family) };
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
  /** O kolik méně rádla dnes zorají (jednotky kapacity rádel = čd). */
  cut: number;
  /** Úspora vody – ušetřená chůze s vědry − posádka (čd). */
  gain: number;
  /** Cena odložené orby (čd) – `cut` × riziko nestihnutí osevu (`lateRisk`); voda vyhrála, protože je nižší než `gain`. */
  cost: number;
}

/**
 * Riziko, že odložená orba způsobí nestihnutý osev (wagons.md – Voda ráno ve dny orby, bod 5):
 * poměr `r` = zbytek orby okna ÷ orba, kterou rádla do konce okna zvládnou tempem `pace` (čd za
 * den). Do `MORNING_WATER.windowReserve` je riziko 0 (rezerva stačí), pak roste
 * (r − rezerva) ÷ (1 − r) a při r ≥ 1 je nekonečné – osev by se nestihl, orba má přednost.
 * Bere nejhorší okno. `ploughed` = orba, kterou rádla dnes zorají.
 */
export function lateRisk(windows: readonly PloughWindow[], pace: number, ploughed: number): number {
  const reserve = MORNING_WATER.windowReserve;
  let risk = 0;
  for (const w of windows) {
    const left = w.need - ploughed;
    if (left <= EPS) continue;
    const room = pace * w.daysLeft;
    const r = room > EPS ? left / room : Infinity;
    if (r <= reserve + EPS) continue;
    risk = Math.max(risk, r >= 1 - EPS ? Infinity : (r - reserve) / (1 - r));
  }
  return risk;
}

/**
 * Voda ráno ve dny orby (wagons.md – Voda ráno ve dny orby; Martin 24. 10. 2026: „Rozhodne
 * ekonomika“): pár od rádla, který je ráno doma (v den výjezdu – spřežení na poli vodu nesveze,
 * oxen.md – Spřežení zůstane na poli; rozhoduje `work`), sveze ráno vodu (`plan` – jeden vůz,
 * počítá se až po levném zamítnutí), když jízdy zaberou nejvýš MORNING_WATER.maxTeamShare dne páru a **přínos** (úspora
 * vody − posádka, čd) je větší než **cena** (odložená orba `cut` × `lateRisk`). Odložená orba =
 * dnes naplánovaná orba (`planned`) + podíl dne páru nad kapacitu rádel (`capacity` páry `pairs`).
 * Riziko se měří proti skutečnému tempu orby `min(capacity, planned)` – omezují ji rádla i lidé
 * (pomoc rodiny jen u setí se nezapočítá) – v oknech `windows`.
 */
export function morningWater(input: {
  plan: () => WaterCartPlan | null;
  capacity: number;
  pairs: number;
  planned: number;
  windows: readonly PloughWindow[];
}): MorningWater | null {
  const { capacity, pairs, planned, windows } = input;
  if (pairs <= 0) return null;
  const pace = Math.min(capacity, planned);
  // levné zamítnutí: rádla jedou naplno a osev by se nestihl už s dnešní orbou – jakékoli zkrácení
  // je nekonečně drahé
  if (planned >= capacity - EPS && lateRisk(windows, pace, planned) === Infinity) return null;
  const plan = input.plan();
  if (!plan) return null;
  const share = plan.cartDays;
  if (share > MORNING_WATER.maxTeamShare + EPS) return null;
  const gain = plan.saved - plan.crew;
  if (gain <= EPS) return null;
  const cut = Math.max(0, planned + (share * capacity) / pairs - capacity);
  let cost = 0;
  if (cut > EPS) {
    cost = cut * lateRisk(windows, pace, planned - cut);
    if (!(gain > cost)) return null;
  }
  return { plan, share, cut: cut > EPS ? cut : 0, gain, cost };
}
