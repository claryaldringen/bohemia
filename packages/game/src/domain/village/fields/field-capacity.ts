import { grossYieldPerHa, isOvergrown } from './fields';
import { bufferKg, steadyHarvestKg, yearlyFoodNeed, fieldFoodShare } from './field-food';
import { NO_CRAFTS } from '../core/productivity';
import { FERTILITY, SEED_KG_PER_HA } from '../rules';
import type { VillageState } from '../types';

const EPSILON = 1e-9;

/** Součty ustálené dráhy odpočatého dílu za periodu (podíl úrodnosti na začátku roku). */
interface SteadyPath {
  /** Počet oběhů (osev a příloh) v periodě. */
  rounds: number;
  /** Roky osevu a jejich součet podílů úrodnosti. */
  sown: number;
  sownSum: number;
  /** Roky přílohu. */
  fallow: number;
  /** Součet podílů přes všechny roky (osev i příloh). */
  sum: number;
}

/**
 * Skutečná ustálená dráha odpočatého dílu podle přílohové soustavy (fields.md – Přílohová soustava
 * do roku 1100, Pole uživí podle dnešní půdy): podíl se mění jednou ročně 1. 9. – díl se osévá rok
 * po roku, dokud mu před osevem zbývá aspoň `sowableMin` (každý osev ubere `sowDepletion`), pak leží
 * ladem a přibývá mu `fallowRecovery`, dokud nedosáhne `fallowReady`, a osévá se znovu. Obnova se
 * zaokrouhluje nahoru (8 let přílohu z 59 % dá 99 %, ne 95 %), takže oběh nezačíná pořád na 95 %,
 * ale posouvá se (95, 99, 98 … 96 %), dokud se start neopakuje. Průměry se berou přes celou
 * periodu. Čistě deterministická smyčka.
 */
function steadyPath(): SteadyPath {
  const starts: number[] = [];
  const rounds: Omit<SteadyPath, 'rounds'>[] = [];
  let start: number = FERTILITY.fallowReady;
  for (let guard = 0; guard < 1000; guard++) {
    // klíč zaokrouhlený kvůli plovoucí čárce
    const key = Math.round(start * 1e6);
    const seen = starts.indexOf(key);
    if (seen >= 0) {
      const cycle = rounds.slice(seen);
      const total = (pick: (r: Omit<SteadyPath, 'rounds'>) => number): number =>
        cycle.reduce((sum, r) => sum + pick(r), 0);
      return {
        rounds: cycle.length,
        sown: total((r) => r.sown),
        sownSum: total((r) => r.sownSum),
        fallow: total((r) => r.fallow),
        sum: total((r) => r.sum),
      };
    }
    starts.push(key);
    let share = start;
    const round = { sown: 0, sownSum: 0, fallow: 0, sum: 0 };
    while (share >= FERTILITY.sowableMin - EPSILON) {
      round.sown++;
      round.sownSum += share;
      round.sum += share;
      share = Math.max(0, share - FERTILITY.sowDepletion);
    }
    while (share < FERTILITY.fallowReady - EPSILON) {
      round.fallow++;
      round.sum += share;
      share = Math.min(1, share + FERTILITY.fallowRecovery);
    }
    rounds.push(round);
    start = share;
  }
  throw new Error('Dráha oběhu se neuzavřela.');
}

const STEADY_PATH = steadyPath();

/**
 * Oběh odpočatého dílu podle přílohové soustavy (fields.md – Přílohová soustava do roku 1100) –
 * průměr na jeden oběh ustálené dráhy (`steadyPath`): dnes 3 osevy (95 → 83 → 71 → 59 %) a příloh
 * zpět na 95 % 7–8 let (průměr 7,2 při obnově 5 bodů ročně).
 */
export function rotationYears(): { sown: number; fallow: number } {
  return {
    sown: STEADY_PATH.sown / STEADY_PATH.rounds,
    fallow: STEADY_PATH.fallow / STEADY_PATH.rounds,
  };
}

export const ROTATION = rotationYears();
/** Pole na celý oběh ÷ osev (dnes 10,2 / 3 = 3,4). */
export const ROTATION_FACTOR = (ROTATION.sown + ROTATION.fallow) / ROTATION.sown;

/**
 * Průměrný podíl přirozené úrodnosti za roky osevu ustálené dráhy (dnes 0,85 – osevy 95–99 %,
 * 83–87 % a 71–75 %). Úroda je lineární v úrodnosti, takže úroda při průměrném podílu = průměr úrod.
 */
export function averageSownShare(): number {
  return STEADY_PATH.sownSum / STEADY_PATH.sown;
}

/** Počet let periody ustálené dráhy odpočatého dílu (dnes 51 let = 5 oběhů po 10–11 letech). */
export const STEADY_PATH_YEARS = STEADY_PATH.sown + STEADY_PATH.fallow;

/**
 * Průměrný podíl přirozené úrodnosti přes periodu skutečné ustálené dráhy odpočatého dílu (osev i
 * příloh, podíl na začátku roku). Do tohoto podílu se ustálí díl v oběhu; porovnává se s ním
 * dnešní půda.
 */
export function averageRotationShare(): number {
  return STEADY_PATH.sum / STEADY_PATH_YEARS;
}

/** Čistá úroda hektaru (kg) v průměru let osevu při plné a včasné práci. */
export function netYieldPerHa(fertility: number): number {
  return grossYieldPerHa(fertility * averageSownShare()) - SEED_KG_PER_HA;
}

/**
 * Úroda z pole na průměrného člověka vsi rok co rok (kg obilí – fields.md, Pole uživí): potřeba
 * z pole podílem `fieldFoodShare` a pojistka zásob se ztrátami skladováním (`steadyHarvestKg`).
 * Ves bez lidí 0.
 */
export function harvestPerPersonKg(
  state: Pick<VillageState, 'people' | 'fieldFood'>,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): number {
  if (state.people.length === 0) return 0;
  const foodNeed = yearlyFoodNeed(state, day);
  return steadyHarvestKg(
    (fieldFoodShare(state) * foodNeed) / state.people.length,
    bufferKg(foodNeed / state.people.length),
    potteryCoverage,
  );
}

/** Kolik lidí uživí pole vsi v ustáleném oběhu (fields.md – Co hráč vidí, Pole uživí). */
export interface FieldCapacity {
  /** Uživí se ≈ tolik lidí (při dnešním složení a stravě vsi). */
  people: number;
  /** Plocha pole v oběhu (ha) – osev a příloh bez zarostlých, opuštěných a zakládaných dílů. */
  rotationHa: number;
  /** Z toho osev v ustáleném oběhu (ha). */
  sownHa: number;
  /** Průměrná přirozená úrodnost dílů v oběhu (vážená plochou). */
  fertility: number;
  /**
   * Dnešní půda ÷ ustálená (`averageRotationShare`), nejvýš 1: vyčerpaná ves uživí úměrně méně,
   * odpočatá i čerstvá půda `people` nemění (fields.md – Pole uživí podle dnešní půdy).
   */
  soil: number;
}

/**
 * Kolik lidí uživí pole vsi, kdyby se každý rok sklidilo, co ustálený oběh dá (fields.md – Co hráč
 * vidí): díly v oběhu (osev, hotové k osevu a příloh, který nezarostl) dělené `ROTATION_FACTOR`
 * jsou osev, ten dá čistou úrodu `netYieldPerHa` při průměrné přirozené úrodnosti a úroda musí
 * pokrýt potřebu z pole `fieldFoodShare` všech lidí i pojistku zásob (`steadyHarvestKg`, jako
 * `village-calculator.ts`). Potřeba i pojistka rostou s počtem lidí lineárně, stačí tedy
 * úroda ÷ úroda potřebná na jednoho průměrného člověka vsi. Výsledek se násobí `soil` = min(1; dnešní
 * podíl úrodnosti dílů ÷ ustálený podíl oběhu), aby vyčerpaná ves neviděla víc, než pole dají. Ves bez lidí nebo bez pole: `null`.
 */
export function fieldCapacity(
  state: Pick<VillageState, 'parts' | 'people' | 'fieldFood'>,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): FieldCapacity | null {
  const inRotation = state.parts.filter(
    (p) =>
      (p.state === 'sown' || p.state === 'ready' || p.state === 'fallow') &&
      !isOvergrown(p) &&
      !p.abandoned,
  );
  const areaM2 = inRotation.reduce((sum, p) => sum + p.areaM2, 0);
  if (state.people.length === 0 || areaM2 <= 0) return null;
  const fertility = inRotation.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2;
  const todayShare = inRotation.reduce((sum, p) => sum + p.fertilityShare * p.areaM2, 0) / areaM2;
  const soil = Math.min(1, todayShare / averageRotationShare());
  const rotationHa = areaM2 / 10_000;
  const sownHa = rotationHa / ROTATION_FACTOR;
  const harvestKg = sownHa * netYieldPerHa(fertility);
  const perPerson = harvestPerPersonKg(state, day, potteryCoverage);
  return {
    people: perPerson > 0 ? (harvestKg / perPerson) * soil : 0,
    rotationHa,
    sownHa,
    fertility,
    soil,
  };
}
