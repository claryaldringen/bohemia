import { grossYieldPerHa, isOvergrown } from './fields';
import { bufferKg, steadyHarvestKg, yearlyFoodNeed, fieldFoodShare } from './field-food';
import { NO_CRAFTS } from './productivity';
import { FERTILITY, SEED_KG_PER_HA, SOWN_ROUNDS } from './rules';
import type { VillageState } from './types';

const EPSILON = 1e-9;

/**
 * Oběh odpočatého dílu podle pravidel (fields.md – Osevní postup po dílech, Přílohová soustava):
 * ustálená ves síje díl, který se právě zotavil na `fallowReady` (95 %): dva osevy (`SOWN_ROUNDS`,
 * úrodnost 95 → 83 → 71 %) a příloh zpět do 95 % (5 let při obnově 5 bodů ročně).
 */
export function rotationYears(): { sown: number; fallow: number } {
  let share: number = FERTILITY.fallowReady;
  let sown = 0;
  while (sown < SOWN_ROUNDS && share >= FERTILITY.sowableMin - EPSILON) {
    share -= FERTILITY.sowDepletion;
    sown++;
  }
  let fallow = 0;
  while (share < FERTILITY.fallowReady - EPSILON) {
    share = Math.min(1, share + FERTILITY.fallowRecovery);
    fallow++;
  }
  return { sown, fallow };
}

export const ROTATION = rotationYears();
/** Pole na celý oběh ÷ osev (dnes 7 / 2 = 3,5). */
export const ROTATION_FACTOR = (ROTATION.sown + ROTATION.fallow) / ROTATION.sown;

/**
 * Průměrný podíl přirozené úrodnosti za roky osevu odpočatého dílu (0,95; 0,83 → 0,89). Úroda je
 * lineární v úrodnosti, takže úroda při průměrném podílu = průměr úrod.
 */
export function averageSownShare(): number {
  let sum = 0;
  for (let year = 0; year < ROTATION.sown; year++)
    sum += FERTILITY.fallowReady - FERTILITY.sowDepletion * year;
  return sum / ROTATION.sown;
}

/**
 * Skutečná ustálená dráha odpočatého dílu podle pravidel (fields.md – Pole uživí podle dnešní půdy):
 * podíl se mění jednou ročně 1. 9. – osev `SOWN_ROUNDS` let ubírá `sowDepletion`, příloh po
 * `sowableMin` přidává `fallowRecovery`, a díl se osévá znovu, jakmile dosáhne `fallowReady`.
 * Obnova se zaokrouhluje nahoru (5 let příloh z 71 % dá 96 %, ne 95 %), takže oběh nezačíná pořád
 * na 95 %, ale posouvá se (95, 96 … 99 %), dokud se start neopakuje. Průměr se bere přes celou
 * periodu, podíl je na začátku roku (změna se projeví až 1. 9.). Čistě deterministická smyčka.
 */
function steadyPath(): { sum: number; years: number } {
  const starts: number[] = [];
  const rotations: { sum: number; years: number }[] = [];
  let start: number = FERTILITY.fallowReady;
  for (let guard = 0; guard < 1000; guard++) {
    // klíč zaokrouhlený kvůli plovoucí čárce
    const key = Math.round(start * 1e6);
    const seen = starts.indexOf(key);
    if (seen >= 0) {
      const cycle = rotations.slice(seen);
      return {
        sum: cycle.reduce((total, r) => total + r.sum, 0),
        years: cycle.reduce((total, r) => total + r.years, 0),
      };
    }
    starts.push(key);
    let share = start;
    let sum = 0;
    let years = 0;
    for (let year = 0; year < ROTATION.sown; year++) {
      sum += share;
      years++;
      share = Math.max(0, share - FERTILITY.sowDepletion);
    }
    while (share < FERTILITY.fallowReady - EPSILON) {
      sum += share;
      years++;
      share = Math.min(1, share + FERTILITY.fallowRecovery);
    }
    rotations.push({ sum, years });
    start = share;
  }
  throw new Error('Dráha oběhu se neuzavřela.');
}

const STEADY_PATH = steadyPath();

/** Počet let periody ustálené dráhy odpočatého dílu (dnes 34 let = 5 oběhů po 6–7 letech). */
export const STEADY_PATH_YEARS = STEADY_PATH.years;

/**
 * Průměrný podíl přirozené úrodnosti přes periodu skutečné ustálené dráhy odpočatého dílu (osev i
 * příloh, podíl na začátku roku) → ≈ 0,85. Do tohoto podílu se ustálí díl v oběhu; porovnává se
 * s ním dnešní půda.
 */
export function averageRotationShare(): number {
  return STEADY_PATH.sum / STEADY_PATH.years;
}

/** Čistá úroda hektaru (kg) v průměru let osevu při plné a včasné práci. */
export function netYieldPerHa(fertility: number): number {
  return grossYieldPerHa(fertility * averageSownShare()) - SEED_KG_PER_HA;
}

/** Kolik lidí uživí pole vsi v ustáleném oběhu (fields.md – Co hráč vidí, Pole uživí). */
export interface FieldCapacity {
  /** Uživí se ≈ tolik lidí (při dnešním složení a stravě vsi). */
  people: number;
  /** Plocha pole v oběhu (ha) – osev a příloh bez zarostlých a zakládaných dílů. */
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
    (p) => (p.state === 'sown' || p.state === 'ready' || p.state === 'fallow') && !isOvergrown(p),
  );
  const areaM2 = inRotation.reduce((sum, p) => sum + p.areaM2, 0);
  if (state.people.length === 0 || areaM2 <= 0) return null;
  const fertility = inRotation.reduce((sum, p) => sum + p.naturalFertility * p.areaM2, 0) / areaM2;
  const todayShare = inRotation.reduce((sum, p) => sum + p.fertilityShare * p.areaM2, 0) / areaM2;
  const soil = Math.min(1, todayShare / averageRotationShare());
  const rotationHa = areaM2 / 10_000;
  const sownHa = rotationHa / ROTATION_FACTOR;
  const harvestKg = sownHa * netYieldPerHa(fertility);
  const foodNeed = yearlyFoodNeed(state, day);
  const perPerson = steadyHarvestKg(
    (fieldFoodShare(state) * foodNeed) / state.people.length,
    bufferKg(foodNeed / state.people.length),
    potteryCoverage,
  );
  return {
    people: perPerson > 0 ? (harvestKg / perPerson) * soil : 0,
    rotationHa,
    sownHa,
    fertility,
    soil,
  };
}
