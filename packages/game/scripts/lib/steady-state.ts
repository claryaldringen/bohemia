// Ustálený stav domácnosti bez simulace – vzorce přímo z pravidel (rules.ts). Jádro kalkulačky
// (village-calculator.ts) a pomocníci kalibrace (measure-village.ts). Ves je v ustáleném oběhu:
// každý díl se oseje ROTATION.sown let a ROTATION.fallow let leží ladem, každý rok se z přílohu
// vrátí třetina osevu (drn pastviny), pole se nezakládají. Řemesla zatím nejsou (NO_CRAFTS),
// štěstí 50 (práce × 1). Měsíce běží v hospodářském roce od září (běžný rok, 365 dní).
import {
  APPLE_FOOD_VALUE,
  CROP_ORDER,
  CROP_WINDOWS,
  DWELLINGS,
  DWELLING_TREES,
  FELLING_MAN_DAYS_PER_TREE,
  FERTILITY,
  FOOD_NEED_KG_PER_YEAR,
  LABOR_PER_DAY,
  NO_CRAFTS,
  ORCHARD,
  ORCHARD_WINDOWS,
  SEED_KG_PER_HA,
  TASK_ORDER,
  YOUNG_FALLOW_YEARS,
  adultDailyMin,
  bufferKg,
  dailyMinPerHousehold,
  distanceFactor,
  dwellingBuildLabor,
  fieldWorkPerHa,
  grossYieldPerHa,
  reclaimCostPerHa,
  steadyHarvestKg,
  storageLossPerYear,
  windowEndOf,
  type Crop,
  type DwellingType,
  type TaskName,
  type WindowSegment,
} from '../../src/domain/village';

const EPSILON = 1e-9;
/** Hospodářský rok od září (plán osevu 1. 9.) – měsíc a počet dní v běžném roce. */
export const SEASON_MONTHS: readonly { month: number; days: number }[] = [
  { month: 9, days: 30 },
  { month: 10, days: 31 },
  { month: 11, days: 30 },
  { month: 12, days: 31 },
  { month: 1, days: 31 },
  { month: 2, days: 28 },
  { month: 3, days: 31 },
  { month: 4, days: 30 },
  { month: 5, days: 31 },
  { month: 6, days: 30 },
  { month: 7, days: 31 },
  { month: 8, days: 31 },
];

/** Oběh dílu podle pravidel (fields.md – Přílohová soustava): roky osevu a přílohu do 95 %. */
export function rotationYears(): { sown: number; fallow: number } {
  let share = 1;
  let sown = 0;
  while (share >= FERTILITY.sowableMin - EPSILON) {
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
/** Pole na celý oběh ÷ osev (dnes 16 / 3 ≈ 5,3). */
export const ROTATION_FACTOR = (ROTATION.sown + ROTATION.fallow) / ROTATION.sown;

/**
 * Průměrný podíl přirozené úrodnosti za roky osevu (1; 0,88; 0,76 → 0,88). Úroda je lineární
 * v úrodnosti, takže úroda při průměrném podílu = průměr úrod.
 */
export function averageSownShare(): number {
  let sum = 0;
  for (let year = 0; year < ROTATION.sown; year++) sum += 1 - FERTILITY.sowDepletion * year;
  return sum / ROTATION.sown;
}

/** Čistá úroda hektaru (kg) v průměru let osevu při plné a včasné práci. */
export function netYieldPerHa(fertility: number): number {
  return grossYieldPerHa(fertility * averageSownShare()) - SEED_KG_PER_HA;
}

export interface Household {
  adults: number;
  elders: number;
  /** Děti 7–13 let (pracují 0,3). */
  olderChildren: number;
  /** Děti do 7 let. */
  smallChildren: number;
}

export function people(h: Household): number {
  return h.adults + h.elders + h.olderChildren + h.smallChildren;
}

/** Roční potřeba obilí (kg). */
export function foodNeedKg(h: Household): number {
  return (
    h.adults * FOOD_NEED_KG_PER_YEAR.adult +
    h.elders * FOOD_NEED_KG_PER_YEAR.elder +
    (h.olderChildren + h.smallChildren) * FOOD_NEED_KG_PER_YEAR.child
  );
}

/**
 * Práce vsi za den (člověkodny) – bez štěstí: jen dospělí (population.md – Práce; výrostci pasou,
 * starší kryjí denní minimum domácnosti – `adultDailyMin`).
 */
export function laborPerDay(h: Household): number {
  return h.adults * LABOR_PER_DAY.adult;
}

/**
 * Osev (ha) na úrodu rok co rok – s pojistkou `bufferKgValue` (osev podle zásob: potřeba z pole
 * a ztráty skladováním, `steadyHarvestKg`), bez ní jen potřeba.
 */
export function sownHa(needKg: number, fertility: number, bufferKgValue?: number): number {
  const harvest =
    bufferKgValue === undefined
      ? needKg
      : steadyHarvestKg(needKg, bufferKgValue, NO_CRAFTS.pottery);
  return harvest / netYieldPerHa(fertility);
}

/**
 * Zásoby po sklizni v rovnováze (v ročních potřebách), když ves každý rok sklidí `harvestShare`
 * roční potřeby: ztráta skladováním je spojitá (`storageLossPerYear`), jí se rovnoměrně.
 * Zásoby po sklizni A splňují A = sklizeň + A·q − potřeba·(1 − q)/λ, q = 1 − ztráta, λ = −ln q.
 */
export function equilibriumStores(harvestShare: number): number {
  const keep = 1 - storageLossPerYear(NO_CRAFTS.pottery);
  const rate = -Math.log(keep);
  return harvestShare / (1 - keep) - 1 / rate;
}

/** Sklizeň (v ročních potřebách), při které se zásoby po sklizni ustálí na `stores`. */
export function harvestForStores(stores: number): number {
  const keep = 1 - storageLossPerYear(NO_CRAFTS.pottery);
  const rate = -Math.log(keep);
  return (stores + 1 / rate) * (1 - keep);
}

export interface SteadyInput {
  household: Household;
  /** Stejných domácností ve vsi (denní minimum je za domácnost). */
  households: number;
  /** Přirozená úrodnost dílů (0–100). */
  fertility: number;
  /** Průměrná vzdálenost dílů od obydlí (m). */
  distanceM: number;
  /** Od obydlí k okraji lesa (m) – jen do výpisu; palivo práci vsi nebere (forest.md – Palivo). */
  forestDistanceM: number;
  dwelling: DwellingType;
  /** Plocha sadu v plné úrodě (ha) – nejí se místo obilí, jen práce a jablka navíc. */
  orchardHa: number;
  /**
   * Osev podle zásob se zásobami na pojistce (potřeba z pole a ztráty skladováním – fields.md,
   * Osev podle zásob), jinak jen potřeba.
   */
  reserve: boolean;
  /**
   * Podíl jídla z pole (fields.md – Osev podle stravy): osev jen na tuto část roční potřeby
   * energie, zbytek dá maso, mléko a sýr, vejce, ovoce a med. Bez údaje 1 – ves jí jen obilí.
   */
  fieldShare?: number;
  /** Osev (ha) místo cíle osevu – např. pro hledání nejvyššího osevu, který práce stihne. */
  sownHaOverride?: number;
}

type WorkName = TaskName | 'orchard-harvest' | 'orchard-care';

export interface MonthLabor {
  month: number;
  days: number;
  capacity: number;
  dailyMin: number;
  field: Record<TaskName, number>;
  orchard: number;
  /** Opravy obydlí – z práce, kterou stavby nespotřebují (v ustáleném stavu se nestaví). */
  repairs: number;
  common: number;
}

export interface PeakReserve {
  name: string;
  need: number;
  free: number;
  /** 1 − potřeba ÷ volná práce po denním minimu (jako rezerva ve špičce v kalibraci). */
  reserve: number;
}

export interface SteadyResult {
  people: number;
  needKg: number;
  sownHa: number;
  winterHa: number;
  fieldHa: number;
  netPerHa: number;
  capacityPerYear: number;
  dailyMinPerYear: number;
  fieldWork: Record<TaskName, number>;
  orchardWork: number;
  repairsPerYear: number;
  commonPerYear: number;
  /** Podíl práce na obživu – 1 − (společná práce + opravy) ÷ práce (jako v kalibraci). */
  subsistence: number;
  months: MonthLabor[];
  peaks: PeakReserve[];
  /** Polní práce, kterou ves do konce okna nestihne (člověkodny) – > 0 = osev je moc velký. */
  unfinished: number;
  wood: { treesPerYear: number; fellingPerYear: number; rebuildLaborPerYear: number };
  orchard: { applesKg: number; grainKg: number; grainKgPerManDay: number };
  fieldGrainKgPerManDay: number;
}

interface WorkItem {
  name: WorkName;
  crop: Crop | null;
  segments: readonly WindowSegment[];
  remaining: number;
  /** Pořadí při shodě konce okna (jako `fieldTasks` a `orchardPosition` v simulate.ts). */
  rank: number;
  lastMonth: number;
}

/** Poslední měsíc okna v pořadí hospodářského roku (září = 0). */
function seasonIndex(month: number): number {
  return (month - 9 + 12) % 12;
}

function lastSeasonIndex(segments: readonly WindowSegment[]): number {
  return Math.max(...segments.map(([, to]) => seasonIndex(to)));
}

/**
 * Ozim jako ve `chooseCrops`: díly, které se osévají dál (bez vrácení přílohu), první, pak
 * vrácené z přílohu – každý do ozimu, dokud ho stihne podzimní práce (září–říjen, poslední den
 * setí ne) a červencová sklizeň. Spojitě po hektarech.
 */
function winterHectares(
  sown: number,
  free: number,
  factor: number,
  reclaimPerHa: number,
  orchardAutumn: number,
): number {
  const autumnCapacity = Math.max(0, free * (30 + 31 - 1) - orchardAutumn);
  const julyCapacity = free * 31;
  const autumnPerHa = (fieldWorkPerHa('dig', 0) + fieldWorkPerHa('sow', 0)) * factor;
  const harvestPerHa = fieldWorkPerHa('harvest', NO_CRAFTS.tools) * factor;
  const continuing = (sown * (ROTATION.sown - 1)) / ROTATION.sown;
  const byJuly = julyCapacity / harvestPerHa;
  // jař se mlátí hned po žni v září – ta práce ubírá z podzimní kapacity ozimu, takže ozim
  // se hledá půlením (Martin 21. 10. 2026 – jař dál kope i na jaře, ozim má na podzim přednost)
  const threshPerHa = fieldWorkPerHa('thresh', NO_CRAFTS.tools) * factor;
  const fitsAutumn = (w: number): boolean => {
    const need =
      w * autumnPerHa +
      Math.max(0, w - continuing) * reclaimPerHa * factor +
      Math.max(0, sown - w) * threshPerHa;
    return need <= autumnCapacity + EPSILON;
  };
  const upper = Math.min(sown, byJuly);
  if (fitsAutumn(upper)) return upper;
  let low = 0;
  let high = upper;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (fitsAutumn(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/** Ustálený stav vsi z `households` stejných domácností. */
export function steadyState(input: SteadyInput): SteadyResult {
  const h = input.household;
  const count = input.households;
  const persons = people(h) * count;
  // potřeba z pole – osev podle stravy, pojistka z celé energie (fields.md – Kolik ves oseje)
  const need = foodNeedKg(h) * count * (input.fieldShare ?? 1);
  const buffer = input.reserve ? bufferKg(foodNeedKg(h) * count) : undefined;
  const sown = input.sownHaOverride ?? sownHa(need, input.fertility, buffer);
  const factor = distanceFactor(input.distanceM);
  const capacityPerDay = laborPerDay(h) * count;
  const dailyMinPerDay = adultDailyMin(dailyMinPerHousehold(NO_CRAFTS.pottery), h.elders) * count;
  const free = Math.max(0, capacityPerDay - dailyMinPerDay);
  // vrácení přílohu po ROTATION.fallow letech – drn pastviny (spásaný příloh nezarůstá)
  const reclaimPerHa = reclaimCostPerHa(
    ROTATION.fallow > YOUNG_FALLOW_YEARS ? 'meadow' : 'young-fallow',
    NO_CRAFTS.tools,
  );
  const orchardAutumn = ORCHARD.harvestPerHa * input.orchardHa * factor;
  const winter = winterHectares(sown, free, factor, reclaimPerHa, orchardAutumn);
  const reclaimedHa = sown / ROTATION.sown;
  // vrácené díly jdou do ozimu až po pokračujících – podíl vrácených v ozimu
  const continuing = sown - reclaimedHa;
  const reclaimedWinter = Math.max(0, winter - continuing);

  const items: WorkItem[] = [];
  const crops: { crop: Crop; ha: number; reclaimHa: number }[] = [
    { crop: 'winter', ha: winter, reclaimHa: reclaimedWinter },
    { crop: 'spring', ha: sown - winter, reclaimHa: reclaimedHa - reclaimedWinter },
  ];
  const fieldWork: Record<TaskName, number> = {
    reclaim: 0,
    dig: 0,
    sow: 0,
    weed: 0,
    harvest: 0,
    thresh: 0,
  };
  for (const { crop, ha, reclaimHa } of crops) {
    for (const name of TASK_ORDER) {
      const amount =
        name === 'reclaim'
          ? reclaimHa * reclaimPerHa * factor
          : ha * fieldWorkPerHa(name, NO_CRAFTS.tools) * factor;
      fieldWork[name] += amount;
      const segments = CROP_WINDOWS[crop][name];
      items.push({
        name,
        crop,
        segments,
        remaining: amount,
        rank: CROP_ORDER.indexOf(crop) * TASK_ORDER.length + TASK_ORDER.indexOf(name),
        lastMonth: lastSeasonIndex(segments),
      });
    }
  }
  // sad: sklizeň jablek před polními úlohami se stejným koncem okna, péče po nich
  const orchardCare = ORCHARD.carePerHa * input.orchardHa * factor;
  items.push(
    {
      name: 'orchard-harvest',
      crop: null,
      segments: ORCHARD_WINDOWS.harvest,
      remaining: orchardAutumn,
      rank: -1,
      lastMonth: lastSeasonIndex(ORCHARD_WINDOWS.harvest),
    },
    {
      name: 'orchard-care',
      crop: null,
      segments: ORCHARD_WINDOWS.care,
      remaining: orchardCare,
      rank: Number.MAX_SAFE_INTEGER,
      lastMonth: lastSeasonIndex(ORCHARD_WINDOWS.care),
    },
  );

  const repairsPerDay = (DWELLINGS[input.dwelling].repairAtEndOfLifePerYear / 3 / 365) * count;
  let unfinished = 0;
  const months: MonthLabor[] = SEASON_MONTHS.map(({ month, days }, index) => {
    const capacity = capacityPerDay * days;
    const dailyMin = Math.min(capacity, dailyMinPerDay * days);
    let left = capacity - dailyMin;
    const field: Record<TaskName, number> = {
      reclaim: 0,
      dig: 0,
      sow: 0,
      weed: 0,
      harvest: 0,
      thresh: 0,
    };
    let orchard = 0;
    const active = items
      .map((item) => ({ item, end: windowEndOf(item.segments, month) }))
      .filter((x): x is { item: WorkItem; end: number } => x.end !== null)
      .sort((a, b) => a.end - b.end || a.item.rank - b.item.rank);
    for (const { item } of active) {
      const amount = Math.min(item.remaining, left);
      item.remaining -= amount;
      left -= amount;
      if (item.name === 'orchard-harvest' || item.name === 'orchard-care') orchard += amount;
      else field[item.name] += amount;
    }
    for (const item of items) {
      if (item.lastMonth !== index || item.remaining <= EPSILON) continue;
      unfinished += item.remaining; // okno skončilo – nedodělek propadá
      item.remaining = 0;
    }
    const repairs = Math.min(left, repairsPerDay * days);
    left -= repairs;
    return { month, days, capacity, dailyMin, field, orchard, repairs, common: left };
  });

  const sum = (pick: (m: MonthLabor) => number): number =>
    months.reduce((total, m) => total + pick(m), 0);
  const capacityPerYear = sum((m) => m.capacity);
  const commonPerYear = sum((m) => m.common);
  const repairsPerYear = sum((m) => m.repairs);
  const window = (from: number, to: number): number =>
    SEASON_MONTHS.filter(({ month }) =>
      from <= to ? month >= from && month <= to : month >= from || month <= to,
    ).reduce((total, m) => total + m.days, 0);
  const winterAutumn =
    (fieldWorkPerHa('dig', 0) + fieldWorkPerHa('sow', 0)) * winter * factor +
    reclaimedWinter * reclaimPerHa * factor;
  const springDig = fieldWorkPerHa('dig', 0) * (sown - winter) * factor;
  const springAutumnLeft = Math.max(0, free * window(9, 11) - winterAutumn - orchardAutumn);
  const springReclaim = (reclaimedHa - reclaimedWinter) * reclaimPerHa * factor;
  const peaks: PeakReserve[] = [
    {
      name: 'podzim (září–říjen, ozim a jablka)',
      need: winterAutumn + orchardAutumn,
      free: free * window(9, 10),
    },
    {
      name: 'jaro (březen–duben, setí a zbytek kopání)',
      need:
        fieldWorkPerHa('sow', 0) * (sown - winter) * factor +
        Math.max(0, springReclaim + springDig - springAutumnLeft),
      free: free * window(3, 4),
    },
    {
      name: 'pletí (květen–červen)',
      need: fieldWorkPerHa('weed', 0) * sown * factor,
      free: free * window(5, 6),
    },
    {
      name: 'léto (horší z července a srpna)',
      need: fieldWorkPerHa('harvest', 0) * Math.max(winter, sown - winter) * factor,
      free: free * 31,
    },
  ].map((p) => ({ ...p, reserve: p.free > 0 ? 1 - p.need / p.free : -Infinity }));

  const trees = DWELLING_TREES[input.dwelling];
  const lifespan = DWELLINGS[input.dwelling].lifespanYears;
  const applesKg = ORCHARD.fullYieldKgPerHa * input.orchardHa;
  const orchardWork = orchardAutumn + orchardCare;
  const fieldTotal = Object.values(fieldWork).reduce((total, v) => total + v, 0);
  return {
    people: persons,
    needKg: need,
    sownHa: sown,
    winterHa: winter,
    fieldHa: sown * ROTATION_FACTOR,
    netPerHa: netYieldPerHa(input.fertility),
    capacityPerYear,
    dailyMinPerYear: sum((m) => m.dailyMin),
    fieldWork,
    orchardWork,
    repairsPerYear,
    commonPerYear,
    subsistence: 1 - (commonPerYear + repairsPerYear) / capacityPerYear,
    months,
    peaks,
    unfinished,
    wood: {
      treesPerYear: (trees / lifespan) * count,
      fellingPerYear: ((trees * FELLING_MAN_DAYS_PER_TREE) / lifespan) * count,
      rebuildLaborPerYear: (dwellingBuildLabor(input.dwelling) / lifespan) * count,
    },
    orchard: {
      applesKg,
      grainKg: applesKg * APPLE_FOOD_VALUE,
      grainKgPerManDay: orchardWork > 0 ? (applesKg * APPLE_FOOD_VALUE) / orchardWork : 0,
    },
    fieldGrainKgPerManDay:
      fieldTotal > 0 ? (sown * netYieldPerHa(input.fertility)) / fieldTotal : 0,
  };
}

/**
 * Nejvyšší osev (ha), jehož polní práci ves v ustáleném oběhu stihne (bez nedodělku) – půlením.
 * Odpovídá stropu osevu podle práce ve špičkách (`chooseCrops`) jen přibližně: plán osevu
 * stropuje po dílech, tady se počítá spojitě po měsících.
 */
export function maxSownHa(input: SteadyInput): number {
  let low = 0;
  let high = Math.max(
    1,
    sownHa(
      foodNeedKg(input.household) * input.households * (input.fieldShare ?? 1),
      input.fertility,
    ) * 4,
  );
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (steadyState({ ...input, sownHaOverride: mid }).unfinished > 1e-6) high = mid;
    else low = mid;
  }
  return low;
}
