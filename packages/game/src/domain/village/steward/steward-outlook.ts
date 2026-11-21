import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import {
  fieldCapacity,
  harvestPerPersonKg,
  netYieldPerHa,
  ROTATION,
} from '../fields/field-capacity';
import { distanceFactor, fallowStage, partWalkDistance, reclaimCostPerHa } from '../fields/fields';
import { builtThreshingFloorCount } from '../fields/threshing';
import { windowDaylightWithout } from '../fields/sowing';
import { ableTeams } from '../livestock/oxen';
import { ploughWorkPerHa } from '../livestock/plough';
import { fieldWorkPerHa } from '../core/productivity';
import { SEED_KG_PER_HA, THRESHING, WINDOWS, WINTER_THRESH_WINDOW } from '../rules/rules-fields';
import { grainSeedTakenKg, reservedSeedKg, seedKeepKg, sowableSeedKg } from '../fields/seed';
import { SOW_AFTER_DIG_DAYS, sowingCapacity } from '../core/simulate-plan';
import type { CraftCoverage, FieldPart, VillageState } from '../types';

// Výhled vsi – „ideální stav“ (steward.md – Model kapacity vsi; Martin 1. 11. 2026: „Měl by přece
// umět spočítat ideální umístění všeho a nejlepší postupy.“): kolik ves za hospodářský rok oseje
// podle práce v oknech setí, podle osiva a podle půdy, které z toho je úzké hrdlo a kolik lidí ves
// udrží. Správce z něj staví cíl polí, „je kam pole rozšířit“ a přelidnění. Zná jen dnešní stav
// vsi (lidé, díly, letošní plán, zásoby) – počasí ani budoucí úrodu nečte. Čistá funkce.

/** Co ves brzdí: půda (pole v oběhu), práce v oknech setí, nebo osivo. */
export type StewardBottleneck = 'land' | 'labor' | 'seed';

export interface StewardOutlook {
  /**
   * Osev za hospodářský rok (ha) podle práce v oknech setí (kopání, orba, setí, vracení přílohu) –
   * dřívější výpočet pro plán sídla, odchod syna, ohradu volů a hrdla (jaro dvakrát, orba bez
   * lidí – steward.md, Model kapacity vsi; cíl polí čte `workableHa`).
   */
  laborHa: number;
  /**
   * Cíl polí (D99 kolo 1 – Martin 18. 11. 2026, „kolik polí ves zvládne obdělat“): kolik ves
   * stihne osít (`sowHa`, spřežením) **a** sklidit (`harvestHa`) i vymlátit (`threshHa`), nejmenší
   * z nich (ha) – i s prací rodu vojvody (D103 – Martin 19. 11. 2026).
   */
  workableHa: number;
  /**
   * Osev, který ves s rodem stihne připravit a osít v oknech setí (okno vracení a kopání jednou,
   * orba i lidmi – ha).
   */
  sowHa: number;
  /** Osev, který ves s rodem stihne sklidit: žeň a odnos v oknech žní (červenec, srpen – ha). */
  harvestHa: number;
  /** Osev, který ves s rodem stihne vymlátit v zimním okně výmlatu (listopad–únor – ha). */
  threshHa: number;
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
  /** Člověkodny lidí v oknech setí na osetý hektar (vracení přílohu, kopání, setí – bez orby). */
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

/** Práce na osetý hektar (`workPerSownHa`). */
interface SownHaWork {
  /** Lidé v oknech setí bez orby: vracení přílohu, kopání a setí. */
  people: number;
  /** Orba – dny spřežení, stejně tolik člověkodnů oráče a honáčka (plough.ts). */
  plough: number;
  /** Lidé o žních: žeň (sklizeň a odnos) – jen obilí. */
  harvest: number;
  /** Výmlat (člověkodny, bez humna dražší) – jen obilí. */
  thresh: number;
}

/**
 * Žeň a výmlat na osetý hektar obilí: z plánu (`required` ozimu, jaře a luštěnin – len trhají ženy
 * a děti napřed a dřinu nepřidá, fields.md – Len), bez něj podle sazeb × příplatek za vzdálenost
 * `factor`; bez humna výmlat o `THRESHING.emergencyWork` dražší (jako `threshSeasonTasks`).
 */
function grainWorkPerSownHa(
  state: VillageState,
  byId: ReadonlyMap<number, FieldPart>,
  tools: number,
  factor: number,
): { harvest: number; thresh: number } {
  const threshFactor = builtThreshingFloorCount(state) > 0 ? 1 : 1 + THRESHING.emergencyWork;
  let ha = 0;
  let harvest = 0;
  let thresh = 0;
  for (const crop of state.season?.crops ?? []) {
    if (crop.crop === 'flax') continue;
    ha += crop.partIds.reduce((sum, id) => sum + (byId.get(id)?.areaM2 ?? 0), 0) / M2_PER_HA;
    harvest += crop.required.harvest;
    thresh += crop.required.thresh;
  }
  if (ha > 0 && harvest > 0) return { harvest: harvest / ha, thresh: (thresh / ha) * threshFactor };
  return {
    harvest: fieldWorkPerHa('harvest', tools) * factor,
    thresh: fieldWorkPerHa('thresh', tools) * threshFactor,
  };
}

/**
 * Práce lidí a spřežení na osetý hektar: z letošního plánu (`season` – skutečná práce dílů, které
 * ves vzala, i se vzdáleností a stadiem přílohu), bez plánu podle sazeb – kopání (orba) a setí
 * a vracení přílohu jednou za `ROTATION.sown` let osevu, × průměrný příplatek za vzdálenost; žeň
 * a výmlat `grainWorkPerSownHa`. Orba stojí lidi stejně jako spřežení (oráč a honáček – plough.ts;
 * simulace ji do práce lidí počítá – `cropLoadOf`; `people` ji nemá – cíl polí ji přičte, D99 kolo 1).
 */
function workPerSownHa(
  state: VillageState,
  day: number,
  tools: number,
  plough: boolean,
): SownHaWork {
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  // opuštěné díly (fields.md – Opuštěný díl) se neosejí ani nevracejí – do práce nepatří
  const parts = state.parts.filter((p) => p.state !== 'founding' && !p.abandoned);
  const area = parts.reduce((sum, p) => sum + p.areaM2, 0);
  const factor =
    area > 0
      ? parts.reduce((sum, p) => sum + p.areaM2 * distanceFactor(partWalkDistance(p)), 0) / area
      : 1;
  const grain = grainWorkPerSownHa(state, byId, tools, factor);
  let ha = 0;
  let people = 0;
  let ploughWork = 0;
  for (const crop of state.season?.crops ?? []) {
    ha += crop.partIds.reduce((sum, id) => sum + (byId.get(id)?.areaM2 ?? 0), 0) / M2_PER_HA;
    people += crop.required.reclaim + crop.required.dig + crop.required.sow;
    ploughWork += crop.plough?.required ?? 0;
  }
  if (ha > 0 && people > 0) return { people: people / ha, plough: ploughWork / ha, ...grain };
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
    ...grain,
  };
}

/**
 * Výhled vsi (steward.md – Model kapacity vsi): co ves obdělá (`workableHa`) = nejmenší z osevu
 * podle lidí (`sowHa` – kapacita oken setí hospodářského roku – `sowingCapacity.autumn` od 1. 9.,
 * září–listopad i březen–duben, lidé po denním minimu i s prací rodu vojvody – D103 ÷ práce lidí
 * na osetý hektar i s orbou), podle spřežení (orba spřežení týchž oken ÷ orba na hektar), podle
 * žní (`harvestHa` – práce oken žní i s rodem ÷ žeň a odnos na hektar) a podle výmlatu
 * (`threshHa` – práce zimního okna výmlatu i s rodem ÷ výmlat na hektar); osev podle práce
 * (`laborHa`) bez rodu; osev podle osiva = (osivo, které letošní plán vzal, + co smí
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
  // dosklizeň jaře v září je jednorázová – dlouhodobou kapacitu nemění (návrh Clauda – fields.md,
  // Žeň jaře i v září)
  const yearStart = farmYearStart(day);
  const windows = sowingCapacity(state, yearStart, coverage, plough, null, undefined, {
    withoutLateHarvest: true,
  });
  const work = workPerSownHa(state, day, coverage.tools, plough);
  const peopleHa = work.people > 0 ? (windows.autumn + windows.spring) / work.people : Infinity;
  const ploughHa =
    windows.plough && work.plough > 0
      ? (windows.plough.autumn + windows.plough.spring) / work.plough
      : Infinity;
  const laborHa = Math.min(peopleHa, ploughHa);
  // cíl polí i s prací rodu vojvody (D103 – Martin 19. 11. 2026 na otázku, má-li správce zakládat
  // pole i na práci rodu: „Ano, maximálně zůstanou neobdělaná“): tentýž model jako plán pomoci
  // rodiny (`lordHelpDay`) – práce cvičící rodiny, která je ve vsi, po denním minimu dvorce
  // v oknech setí i žní a v zimním výmlatu (lord.md – Kdy jde rodina na pole); spřežení rodina
  // nepřidá – orba se převezme. Rodina, která necvičí, pracuje jako ostatní a je už v práci vsi.
  // `laborHa` dál bez rodiny (Známý dluh – steward.md, Model kapacity vsi)
  const lordWindows = sowingCapacity(state, yearStart, coverage, plough, null, undefined, {
    withoutLateHarvest: true,
    lord: true,
    ...(windows.plough ? { ploughCapacity: windows.plough } : {}),
  });
  // cíl polí (D99 kolo 1): okno `autumn` (vracení přílohu a kopání – září–listopad i březen–duben)
  // už nese celé jaro, `spring` je jen jeho výsek pro setí – počítá se jednou; orba stojí i lidi
  const sowPeople = work.people + work.plough;
  const sowHa = sowPeople > 0 ? lordWindows.autumn / sowPeople : Infinity;
  const teamHa = windows.plough && work.plough > 0 ? windows.plough.autumn / work.plough : Infinity;
  // sklidit (D99 kolo 2): žeň a odnos v oknech žní (červenec, srpen – se žňovými rukama), žeň jde
  // v práci dne před lnem i otavou (`DAY_WORK_ORDER`), proto se od nich nic neodečítá (Martin
  // 9. 11. 2026: „Je lepší za každou cenu sklidit to, co už vyrostlo, než začínat pěstování úplně
  // od začátku“); dosklizeň jaře v září je jednorázová (`withoutLateHarvest`)
  const harvestHa =
    work.harvest > 0 ? (lordWindows.july + lordWindows.august) / work.harvest : Infinity;
  // výmlat ve vlastním okně do února za polními pracemi (Martin 9. 11. 2026: „Výmlat prý počká
  // i docela hluboko do zimy“): práce zimního okna výmlatu (`WINTER_THRESH_WINDOW`) – volná práce
  // dne jako v okně setí (`spring` na světlý den, i s rodinou – lord.md, Výmlat v zimě) × světlé
  // dny okna; co ves vymlátí v září a říjnu vedle setí, se nepočítá (návrh Clauda – opatrně)
  const springLight = windowDaylightWithout(yearStart, WINDOWS.sow, SOW_AFTER_DIG_DAYS);
  const threshRoom =
    springLight > 0
      ? (lordWindows.spring / springLight) *
        windowDaylightWithout(yearStart, WINTER_THRESH_WINDOW, 0)
      : 0;
  const threshHa = work.thresh > 0 ? threshRoom / work.thresh : Infinity;
  const workableHa = Math.min(sowHa, teamHa, harvestHa, threshHa);
  const month = dateOfDayIndex(day).month;
  const sowing = month >= 9 || month <= LAST_SOWING_MONTH;
  const seedKg = sowing
    ? grainSeedTakenKg(state) +
      sowableSeedKg(state, 'grain', seedKeepKg(state, day)) +
      (state.legumesKg ?? 0)
    : Infinity;
  const seedHa = seedKg / SEED_KG_PER_HA;
  const sownHa = Math.min(landHa, laborHa, seedHa);
  const bottleneck: StewardBottleneck =
    sownHa >= landHa ? 'land' : sownHa >= laborHa ? 'labor' : 'seed';
  const lasting = laborHa < landHa ? 'labor' : 'land';
  return {
    laborHa,
    workableHa,
    sowHa,
    harvestHa,
    threshHa,
    seedHa,
    landHa,
    bottleneck,
    lasting,
    workPerHa: work.people,
    landPeople,
    sustainablePeople: landHa > 0 ? (landPeople * Math.min(landHa, laborHa)) / landHa : 0,
  };
}

/** Půda, na které ves seje (pro `stewardFedPeople`): úrodnost a stav dílů, strava vsi. */
export interface StewardSoil {
  /** Přirozená úrodnost dílů (vážená plochou). */
  fertility: number;
  /** Dnešní půda ÷ ustálená, nejvýš 1 (`FieldCapacity.soil`). */
  soil: number;
  /** Podíl jídla z pole (`fieldFoodShare`) – strava vsi. */
  fieldFood: VillageState['fieldFood'];
}

/** Půda vsi – díly v oběhu (zakládané jako by už byly); ves bez polí null. */
export function stewardSoil(state: VillageState, day: number): StewardSoil | null {
  const capacity = fieldCapacity(
    { parts: rotationParts(state), people: state.people, fieldFood: state.fieldFood },
    day,
  );
  if (!capacity) return null;
  return { fertility: capacity.fertility, soil: capacity.soil, fieldFood: state.fieldFood };
}

/**
 * Osivo na příští osev (kg) i mimo okna setí: osivo jen na setí (`reservedSeedKg`), zrno zásob
 * a nevymlácených snopů nad přežívací zásobu do žní (`seedKeepKg` – tu ves sní, fields.md, Osivo
 * ze zásob) a luštěniny.
 */
function nextSowingSeedKg(state: VillageState, day: number): number {
  const reserved = reservedSeedKg(state);
  const grain = Math.max(0, state.storesKg) + (state.sheaves?.grainKg ?? 0) - reserved;
  const free = Math.max(0, grain - seedKeepKg(state, day));
  return reserved + free + Math.max(0, state.legumesKg ?? 0) + (state.sheaves?.legumesKg ?? 0);
}

/**
 * Kolik lidí ves uživí osevem vlastní prací (steward.md – Životaschopná výprava; Martin
 * 2. 11. 2026): osev = menší z osevu podle práce (`stewardOutlook` – kapacita setí hospodářského
 * roku) a s `seed` i podle osiva na příští osev (`nextSowingSeedKg`), × čistá úroda hektaru
 * `netYieldPerHa` při úrodnosti a stavu půdy `soil` ÷ úroda na průměrného člověka vsi
 * (`harvestPerPersonKg` se stravou `soil.fieldFood`). Půda vsi se nepočítá (návrh Clauda):
 * přelidněné vsi bez místa na pole je odchod lékem a nová ves si pole teprve založí. Ves bez lidí 0.
 */
export function stewardFedPeople(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  soil: StewardSoil,
  seed = true,
): number {
  const perPerson = harvestPerPersonKg(
    { people: state.people, fieldFood: soil.fieldFood },
    day,
    coverage.pottery,
  );
  if (perPerson <= 0) return 0;
  const { laborHa } = stewardOutlook(state, day, coverage);
  const seedHa = seed ? nextSowingSeedKg(state, day) / SEED_KG_PER_HA : Infinity;
  const sownHa = Math.min(laborHa, seedHa);
  return (sownHa * netYieldPerHa(soil.fertility) * soil.soil) / perPerson;
}
