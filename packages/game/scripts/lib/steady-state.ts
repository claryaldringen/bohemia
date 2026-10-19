// Ustálený stav domácnosti bez simulace – vzorce přímo z pravidel (rules.ts). Jádro kalkulačky
// (village-calculator.ts) a pomocníci kalibrace (measure-village.ts). Ves je v ustáleném oběhu:
// každý díl se oseje ROTATION.sown let a ROTATION.fallow let leží ladem, každý rok se z přílohu
// vrátí třetina osevu (drn pastviny), pole se nezakládají. Řemesla zatím nejsou (NO_CRAFTS),
// štěstí 50 (práce × 1). Měsíce běží v hospodářském roce od září (běžný rok, 365 dní).
import {
  APPLE_FOOD_VALUE,
  CROP_ORDER,
  CROP_WINDOWS,
  DOMESTIC,
  DWELLINGS,
  DWELLING_TREES,
  FELLING_MAN_DAYS_PER_TREE,
  FERTILITY,
  FOOD_NEED_KG_PER_YEAR,
  FUEL_DOMESTIC_SHARE,
  LABOR_PER_DAY,
  NO_CRAFTS,
  ORCHARD,
  ORCHARD_WINDOWS,
  SEED_KG_PER_HA,
  SOW_RESERVE,
  TASK_ORDER,
  YOUNG_FALLOW_YEARS,
  dailyMinPerHousehold,
  distanceFactor,
  dwellingBuildLabor,
  fieldWorkPerHa,
  grossYieldPerHa,
  reclaimCostPerHa,
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

/** Práce za den (člověkodny) – bez štěstí. */
export function laborPerDay(h: Household): number {
  return (
    h.adults * LABOR_PER_DAY.adult +
    h.elders * LABOR_PER_DAY.elder +
    h.olderChildren * LABOR_PER_DAY.olderChild
  );
}

/** Osev (ha), který pokryje cíl osevu – potřeba × (1 + rezerva), nebo jen potřeba. */
export function sownHa(needKg: number, fertility: number, reserve = true): number {
  return (needKg * (reserve ? 1 + SOW_RESERVE : 1)) / netYieldPerHa(fertility);
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
  /** Stejných domácností ve vsi (denní minimum a domácí výroba jsou za domácnost). */
  households: number;
  /** Přirozená úrodnost dílů (0–100). */
  fertility: number;
  /** Průměrná vzdálenost dílů od obydlí (m). */
  distanceM: number;
  /** Od obydlí k okraji lesa (m) – palivo. */
  forestDistanceM: number;
  dwelling: DwellingType;
  /** Plocha sadu v plné úrodě (ha) – nejí se místo obilí, jen práce a jablka navíc. */
  orchardHa: number;
  /** Cíl osevu s rezervou 15 % (zásoby do 1,5 roční potřeby), jinak jen potřeba. */
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
  repairs: number;
  domestic: number;
  /** Domácí výroba, která se odkládá na další měsíce (nejvýš 60 dní potřeby). */
  domesticBacklog: number;
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
  domesticPerYear: number;
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
  const reclaimed = sown - continuing;
  const byJuly = julyCapacity / harvestPerHa;
  const onContinuing = Math.min(continuing, autumnCapacity / autumnPerHa);
  const left = autumnCapacity - onContinuing * autumnPerHa;
  const onReclaimed =
    onContinuing < continuing - EPSILON
      ? 0
      : Math.min(reclaimed, left / (autumnPerHa + reclaimPerHa * factor));
  return Math.min(byJuly, onContinuing + onReclaimed);
}

/** Ustálený stav vsi z `households` stejných domácností. */
export function steadyState(input: SteadyInput): SteadyResult {
  const h = input.household;
  const count = input.households;
  const persons = people(h) * count;
  // potřeba z pole – osev podle stravy (fields.md – Kolik ves oseje)
  const need = foodNeedKg(h) * count * (input.fieldShare ?? 1);
  const sown = input.sownHaOverride ?? sownHa(need, input.fertility, input.reserve);
  const factor = distanceFactor(input.distanceM);
  const capacityPerDay = laborPerDay(h) * count;
  const dailyMinPerDay = dailyMinPerHousehold(NO_CRAFTS.pottery) * count;
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
  const domesticPerDay =
    (DOMESTIC.perHousehold + DOMESTIC.perPerson * people(h)) *
    count *
    (1 + FUEL_DOMESTIC_SHARE * (distanceFactor(input.forestDistanceM) - 1));

  let backlog = 0;
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
    const domesticNeed = domesticPerDay * days;
    const domestic = Math.min(left, domesticNeed + backlog);
    left -= domestic;
    backlog = Math.min(DOMESTIC.backlogMaxDays * domesticPerDay, backlog + domesticNeed - domestic);
    return {
      month,
      days,
      capacity,
      dailyMin,
      field,
      orchard,
      repairs,
      domestic,
      domesticBacklog: backlog,
      common: left,
    };
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
  const springAutumnLeft = Math.max(
    0,
    free * window(9, 11) -
      winterAutumn -
      orchardAutumn -
      (reclaimedHa - reclaimedWinter) * reclaimPerHa * factor,
  );
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
        Math.max(0, springDig - springAutumnLeft),
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
    domesticPerYear: sum((m) => m.domestic),
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
