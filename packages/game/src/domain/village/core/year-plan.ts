import { dateOfDayIndex } from '../../calendar';
import {
  distanceFactor,
  partWalkDistance,
  effectiveFertility,
  fallowStage,
  grossYieldPerHa,
  isWeedFree,
  reclaimCostPerHa,
} from '../fields/fields';
import { daysUntilHarvest, daysUntilWinterHarvest } from './food';
import { PLOUGH_HA_PER_DAY, PLOUGH_SOD_FACTOR, hasSod, ploughWorkPerHa } from '../livestock/plough';
import { partsByIdOf } from './parts-by-id';
import { ploughLayout } from '../livestock/plough-blocks';
import { fieldWorkPerHa } from './productivity';
import {
  CROP_WINDOWS,
  FLAX,
  LEGUMES,
  PLANNING_DAY,
  SEED_KG_PER_HA,
  SOWERS,
  LEGACY_WEEDING_WORST_PER_HA,
  THRESH_CALIBRATION_FERTILITY,
  UNWEEDED_YIELD,
  YIELD_BASE_KG_PER_HA,
  type WindowSegment,
} from '../rules';
import type {
  Crop,
  CropWork,
  FallowStage,
  FieldPart,
  FieldTask,
  PloughWork,
  TaskName,
  VillageState,
  FarmSeason,
  SeasonCrop,
} from '../types';

const M2_PER_HA = 10_000;
const MONTHS_PER_YEAR = 12;
/**
 * Pořadí úloh – rozhoduje při shodě konce okna. Na podzim vracení přílohu před kopáním, na jaře
 * setí před dalším kopáním (Ruling 14): zaseje se, co je zkopané (taskRemaining), takže pole
 * nedokopané do konce dubna dá aspoň úrodu zkopané části. Totéž platí pro ozim na podzim.
 */
export const TASK_ORDER: readonly TaskName[] = [
  'reclaim',
  'sow',
  'dig',
  'weed',
  'harvest',
  'thresh',
];
const RATE_TASKS: readonly FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];

export function emptyTaskRecord(): Record<TaskName, number> {
  return { reclaim: 0, dig: 0, sow: 0, weed: 0, harvest: 0, thresh: 0 };
}

/** Práce dílu za rok po úlohách a orba rádlem (`plough` – jen ves, která orá spřežením). */
export type PartWork = Record<TaskName, number> & { plough: number };

/**
 * Váha dílu v polních pracích – plocha × příplatek za vzdálenost chůze po pěšinách (ha, paths.md)
 * – stejný příplatek jako v `partWork`.
 */
export function partWeight(part: FieldPart): number {
  return (part.areaM2 / M2_PER_HA) * distanceFactor(partWalkDistance(part));
}

/**
 * Člověkodny prací jednoho dílu za rok podle sazeb (meze podle pokrytí nástroji) a vzdálenosti.
 * První sezónu po vymýcení lesa se díl neplete; příloh stojí navíc vrácení podle stadia (mladý
 * příloh nic, louka drn, křoviny a mladý les jako jejich založení – fields.md, Zarůstání), drn
 * louky založené rádlem jako vrácení louky. S `plough` (ves má spřežení – oxen.md, Jen rádlo) se
 * díl orá místo kopání, i drn: ten rozorá orba křížem (`PLOUGH_SOD_FACTOR`× víc orby, motyka na
 * drn nejde); křoviny a mladý les se klučí ručně jako dřív. Setí za rádlem podle orby (rozsévač
 * za spřežením – `SOWERS.perTeam`), motykou podle sazby.
 */
export function partWork(
  part: FieldPart,
  day: number,
  toolCoverage: number,
  plough = false,
  crop: Crop = 'spring',
): PartWork {
  const work: PartWork = { ...emptyTaskRecord(), plough: 0 };
  const ha = part.areaM2 / M2_PER_HA;
  const factor = distanceFactor(partWalkDistance(part));
  const weedFree = isWeedFree(part, day);
  for (const task of RATE_TASKS) {
    if (task === 'weed' && weedFree) continue;
    work[task] = ha * fieldWorkPerHa(task, toolCoverage, crop) * factor;
  }
  if (part.state === 'fallow') {
    work.reclaim = reclaimCostPerHa(fallowStage(part, day), toolCoverage) * ha * factor;
  } else if (part.sod) {
    work.reclaim = reclaimCostPerHa('meadow', toolCoverage) * ha * factor;
  }
  if (plough) {
    const sod = hasSod(part, day);
    if (sod) work.reclaim = 0;
    work.plough = ha * ploughWorkPerHa(toolCoverage) * factor * (sod ? PLOUGH_SOD_FACTOR : 1);
    work.dig = 0;
    // rozsévač za spřežením (fields.md – Práce, setí; Martin 9. 11. 2026: „Ano, jeden rozsévač za
    // spřežením“) – člověkoden setí na den spřežení: dny spřežení = orba ÷ denní orba páru
    // (PLOUGH_HA_PER_DAY × sazba – `pairCapacityPerDay`), na drnu orbě křížem 2,5× víc dní
    work.sow = (work.plough / (PLOUGH_HA_PER_DAY * ploughWorkPerHa(toolCoverage))) * SOWERS.perTeam;
  }
  return work;
}

/** Práce přípravy hektaru půdy po zdrojích (člověkodny) – lidé a spřežení. */
export interface PrepWorkPerHa {
  people: number;
  plough: number;
}

/**
 * Příprava hektaru přílohu ve stadiu `stage` k setí po zdrojích, jako ji počítá `partWork` (bez
 * příplatku za vzdálenost): s rádlem (`plough`) louka jen orbu drnu křížem (`PLOUGH_SOD_FACTOR`)
 * a rozsévače za ní, křoví a mladý les klučení rukama, orbu a setí; motykou vrácení podle stadia
 * (louka drn), kopání a setí – vše lidé. Ceny pro pořadí přílohů do osevu (fields.md – Pořadí
 * dávek).
 */
export function fallowPrepPerHa(
  stage: FallowStage,
  toolCoverage: number,
  plough: boolean,
): PrepWorkPerHa {
  const reclaim = reclaimCostPerHa(stage, toolCoverage);
  if (!plough) {
    const dig = fieldWorkPerHa('dig', toolCoverage);
    return { people: reclaim + dig + fieldWorkPerHa('sow', toolCoverage), plough: 0 };
  }
  const sod = stage === 'meadow';
  const ploughPerHa = ploughWorkPerHa(toolCoverage) * (sod ? PLOUGH_SOD_FACTOR : 1);
  const sow = (ploughPerHa / (PLOUGH_HA_PER_DAY * ploughWorkPerHa(toolCoverage))) * SOWERS.perTeam;
  return { people: (sod ? 0 : reclaim) + sow, plough: ploughPerHa };
}

/**
 * Plodina, kterou letos oralo spřežení, dokončí motyka (mutuje `work`) – ves přišla o poslední
 * spřežení (oxen.md – Jen rádlo). Díly, kam orba došla, zůstanou zorané; zbytek se dokope:
 * kopání celé plodiny podle sazby motyky (drn s vrácením louky) s hotovým podílem, kam došla
 * orba – po dílech stejně (díl s drnem má v orbě větší váhu, v kopání ne). Setí oraných dílů
 * (rozsévač za spřežením) se přepočte na sazbu motyky s hotovým podílem. Plodina pak orbu nemá.
 */
export function ploughToHoe(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  toolCoverage: number,
  crop: Crop,
): void {
  const plough = work.plough;
  if (!plough) return;
  const sod = new Set(plough.sodIds ?? []);
  const parts = plough.partIds.flatMap((id) => {
    const part = partsById.get(id);
    return part ? [part] : [];
  });
  const ploughWeights = parts.map((p) => partWeight(p) * (sod.has(p.id) ? PLOUGH_SOD_FACTOR : 1));
  const ploughTotal = ploughWeights.reduce((sum, w) => sum + w, 0);
  const position = plough.required > 0 ? Math.min(1, plough.done / plough.required) : 1;
  const dig = fieldWorkPerHa('dig', toolCoverage, crop);
  const drn = reclaimCostPerHa('meadow', toolCoverage);
  let hoe = 0;
  let weight = 0;
  let doneWeight = 0;
  let start = 0;
  parts.forEach((part, i) => {
    const w = partWeight(part);
    const span = ploughTotal > 0 ? ploughWeights[i]! / ploughTotal : 0;
    const done = span > 0 ? Math.min(1, Math.max(0, (position - start) / span)) : 1;
    start += span;
    hoe += w * (dig + (sod.has(part.id) ? drn : 0));
    weight += w;
    doneWeight += w * done;
  });
  work.required.dig += hoe;
  work.done.dig += weight > 0 ? (doneWeight / weight) * hoe : hoe;
  // setí za orbou šlo podle orby (`partWork`), motykou podle sazby – plán starší vsi s kopanými
  // díly (`digWeight`) má setí podle sazby už celé, nechá se
  if (!plough.digWeight) {
    const sow = weight * fieldWorkPerHa('sow', toolCoverage, crop);
    const sown = work.required.sow > 0 ? Math.min(1, work.done.sow / work.required.sow) : 0;
    work.required.sow = sow;
    work.done.sow = sown * sow;
  }
  delete work.plough;
}

/** Pořadí dílů, ve kterém k nim postupuje práce plodiny. */
export type WorkOrder = (parts: readonly FieldPart[]) => FieldPart[];

/** Dřívější pořadí práce: nejblíž obydlím první, při shodě podle id. */
export const nearestFirst: WorkOrder = (parts) =>
  [...parts].sort((a, b) => a.distanceM - b.distanceM || a.id - b.id);

/**
 * Práce jedné plodiny pro vybrané díly (viz `partWork`). Díly se seřadí, jak k nim práce
 * postupuje (fields.md – Postup práce po čtvercích): ves s hospodářstvími po úsecích od domu ven
 * (`workOrder` v holdings.ts), jinak nejblíž obydlím první, při shodě podle id. S `plough` orá
 * spřežení všechny díly (`plough` v práci plodiny – i bez dílů, ať k ní přidané díly orá taky).
 */
export function createCropWork(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
  crop: Crop = 'spring',
): CropWork {
  const required = emptyTaskRecord();
  // spřežení orá po souvislých blocích a pásech podél brázdy (oxen.md – Co nejdelší brázda)
  const layout = plough ? ploughLayout(selected) : null;
  const ordered = layout ? layout.order : order(selected);
  const reclaimIds: number[] = [];
  const sodIds: number[] = [];
  let ploughRequired = 0;
  let ploughWeight = 0;
  for (const part of ordered) {
    const work = partWork(part, day, toolCoverage, plough, crop);
    for (const task of TASK_ORDER) required[task] += work[task];
    if (work.reclaim > 0) reclaimIds.push(part.id);
    if (!plough) continue;
    ploughRequired += work.plough;
    ploughWeight += partWeight(part);
    if (hasSod(part, day)) sodIds.push(part.id);
  }
  const partIds = ordered.map((p) => p.id);
  return {
    partIds,
    ...(reclaimIds.length > 0 ? { reclaimIds } : {}),
    required,
    done: emptyTaskRecord(),
    harvestedKg: null,
    seedKg: 0,
    ...(plough
      ? {
          plough: {
            partIds: [...partIds],
            required: ploughRequired,
            done: 0,
            weight: ploughWeight,
            perHa: ploughWorkPerHa(toolCoverage),
            ...(sodIds.length > 0 ? { sodIds } : {}),
            bands: layout!.bands,
          },
        }
      : {}),
  };
}

/** Práce plodiny `crop` jako položka hospodářského roku. */
function newSeasonCrop(
  crop: Crop,
  parts: FieldPart[],
  day: number,
  toolCoverage: number,
  plough: boolean,
  order: WorkOrder,
): SeasonCrop {
  return { crop, ...createCropWork(parts, day, toolCoverage, plough, order, crop) };
}

/**
 * Hospodářský rok jen s jaří (tvar z doby před ozimem); s `plough` ves letos orá rádlem (`ard`).
 */
export function createPlan(
  selected: FieldPart[],
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): FarmSeason {
  return {
    startDay: day,
    ...(plough ? { ard: true as const } : {}),
    crops: [newSeasonCrop('spring', selected, day, toolCoverage, plough, order)],
  };
}

/**
 * Hospodářský rok s ozimem, jaří, luštěninami a lnem (fields.md – Ozim a jař, Luštěniny, Len);
 * plodiny v pořadí ozim, luštěniny, len, jař – bez ozimu, luštěnin a lnu bez jejich položky.
 */
export function createSeason(
  crops: { winter: FieldPart[]; spring: FieldPart[]; legume?: FieldPart[]; flax?: FieldPart[] },
  day: number,
  toolCoverage: number,
  plough = false,
  order: WorkOrder = nearestFirst,
): FarmSeason {
  const season = createPlan(crops.spring, day, toolCoverage, plough, order);
  const before: SeasonCrop[] = [];
  const lists: [Crop, FieldPart[] | undefined][] = [
    ['winter', crops.winter],
    ['legume', crops.legume],
    ['flax', crops.flax],
  ];
  for (const [crop, parts] of lists) {
    if (parts && parts.length > 0) {
      before.push(newSeasonCrop(crop, parts, day, toolCoverage, plough, order));
    }
  }
  season.crops.unshift(...before);
  return season;
}

/**
 * Přidá do práce plodiny `crop` další díly (mutuje `work`) – nová dávka jde na konec, seřazená
 * `order`.
 * Plodina, kterou orá spřežení (`plough`), přidané díly orá taky, jinak je kope motyka (oxen.md –
 * Jen rádlo: plodina se buď celá orá, nebo celá kope).
 */
export function addToCropWork(
  work: CropWork,
  added: FieldPart[],
  day: number,
  toolCoverage: number,
  order: WorkOrder = nearestFirst,
  crop: Crop = 'spring',
): void {
  const plough = work.plough;
  const extra = createCropWork(added, day, toolCoverage, plough !== undefined, order, crop);
  for (const task of TASK_ORDER) work.required[task] += extra.required[task];
  work.partIds.push(...extra.partIds);
  if (extra.reclaimIds) work.reclaimIds = [...(work.reclaimIds ?? []), ...extra.reclaimIds];
  if (!plough || !extra.plough) return;
  // přidané díly jsou při pokrytí `toolCoverage` – dosavadní orba taky, jinak by se zoraná část
  // plodiny posunula (orba by přibyla zadarmo, nebo by se zoraný díl oral znovu)
  ploughAtTools(plough, toolCoverage);
  plough.partIds.push(...extra.plough.partIds);
  plough.required += extra.plough.required;
  plough.weight += extra.plough.weight;
  if (extra.plough.sodIds) plough.sodIds = [...(plough.sodIds ?? []), ...extra.plough.sodIds];
  // přidané díly – další bloky orby na konci
  if (plough.bands && extra.plough.bands) {
    const next = plough.bands.reduce((max, b) => Math.max(max, b.block + 1), 0);
    plough.bands.push(...extra.plough.bands.map((b) => ({ ...b, block: b.block + next })));
  }
}

/**
 * Přepočte orbu plodiny na pokrytí nástroji `toolCoverage` (mutuje `plough`; oxen.md – Účinek na
 * práci, Nástroje během sezóny): potřebná i hotová práce poměrem sazeb – kam orba došla
 * (`taskPosition`), se nezmění. Kapacita spřežení (`ploughCapacityPerDay`) je v člověkodnech při
 * témže pokrytí, takže pár zorá ≈ 0,3 ha za den s jakýmikoli nástroji a lepší nástroje ubírají
 * práci lidem. Orba bez sazby (`perHa`) se bere, jako by při tomto pokrytí spočtená byla.
 */
export function ploughAtTools(plough: PloughWork, toolCoverage: number): void {
  const perHa = ploughWorkPerHa(toolCoverage);
  if (plough.perHa !== undefined && plough.perHa !== perHa) {
    const rate = perHa / plough.perHa;
    plough.required *= rate;
    plough.done *= rate;
  }
  plough.perHa = perHa;
}

/** Orba všech plodin letošní práce při pokrytí nástroji `toolCoverage` (`ploughAtTools`). */
export function seasonPloughAtTools(season: FarmSeason | null, toolCoverage: number): void {
  for (const work of season?.crops ?? []) {
    if (work.plough) ploughAtTools(work.plough, toolCoverage);
  }
}

/**
 * Váha orby plodiny (ha × příplatek za vzdálenost; díly s drnem `PLOUGH_SOD_FACTOR`× jako
 * `partWork`) – orba plodiny je váha × sazba (`ploughWorkPerHa`).
 */
export function ploughWeight(plough: PloughWork, byId: ReadonlyMap<number, FieldPart>): number {
  let weight = plough.weight;
  for (const id of plough.sodIds ?? []) {
    const part = byId.get(id);
    if (part) weight += partWeight(part) * (PLOUGH_SOD_FACTOR - 1);
  }
  return weight;
}

/** Má letošní plán orbu bez sazby (`PloughWork.perHa`) – plán uložený dřív, převod `plough-rate`? */
export function needsPloughRate(season: FarmSeason | null): boolean {
  return (season?.crops ?? []).some((work) => lacksPloughRate(work.plough));
}

/** Orba s prací, ale bez sazby – prázdná orba (plodina bez dílů) sazbu nepotřebuje. */
function lacksPloughRate(plough: PloughWork | undefined): plough is PloughWork {
  return plough !== undefined && plough.perHa === undefined && plough.required > 0;
}

/**
 * Sazba orby plánu uloženého bez ní (mutuje plán): orba ÷ váha oraných dílů (`ploughWeight`) –
 * průměr pokrytí dnů, kdy díly přibyly – v mezích sazby (váhy dílů se od plánu mohly změnit).
 */
export function setPloughRate(
  season: FarmSeason | null,
  byId: ReadonlyMap<number, FieldPart>,
): void {
  for (const { plough } of season?.crops ?? []) {
    if (!lacksPloughRate(plough)) continue;
    const rate = plough.required / ploughWeight(plough, byId);
    plough.perHa = Math.min(ploughWorkPerHa(0), Math.max(ploughWorkPerHa(1), rate));
  }
}

/** Plodina hospodářského roku; chybí = ves ji letos nemá. */
export function seasonCrop(
  season: FarmSeason | null | undefined,
  crop: Crop,
): SeasonCrop | undefined {
  return season?.crops.find((c) => c.crop === crop);
}

/** Jařní plodina hospodářského roku – je v něm vždy. */
export function springCrop(season: FarmSeason): SeasonCrop {
  const spring = seasonCrop(season, 'spring');
  if (!spring) throw new Error('Hospodářský rok bez jaří.');
  return spring;
}

const CROP_ORDER: readonly Crop[] = ['winter', 'legume', 'flax', 'spring'];

/** Pořadí plodiny v hospodářském roce (`CROP_ORDER`). */
function cropRank(work: SeasonCrop): number {
  return CROP_ORDER.indexOf(work.crop);
}

/** Vloží plodinu na její místo v pořadí ozim, luštěniny, len, jař (nahradí stejnou plodinu). */
export function putSeasonCrop(season: FarmSeason, work: SeasonCrop): void {
  const rank = cropRank(work);
  season.crops = season.crops.filter((c) => cropRank(c) !== rank);
  const at = season.crops.findIndex((c) => cropRank(c) > rank);
  season.crops.splice(at < 0 ? season.crops.length : at, 0, work);
}

/** Odebere plodinu z hospodářského roku (jař se neodebírá). */
export function dropSeasonCrop(season: FarmSeason, crop: Crop): void {
  season.crops = season.crops.filter((c) => c.crop !== crop);
}

/**
 * Práce hospodářského roku po plodinách v pořadí ozim, luštěniny, len, jař (jen plodiny, které
 * ves má; jař je vždy).
 */
export function seasonCrops(season: FarmSeason): { crop: Crop; work: SeasonCrop }[] {
  return season.crops.map((work) => ({ crop: work.crop, work }));
}

/** Stav s plánem u výmlatu (výhledy bez něj – jař na poli v září nevidí). */
type LateSpringState = Partial<Pick<VillageState, 'threshingSeason'>>;

/**
 * Jař loňského hospodářského roku, kterou srpen nedosklidil (fields.md – Žeň jaře i v září): od
 * 31. 8. v plánu u výmlatu (`threshingSeason`) nesklizená (`harvestedKg` null) – žne se v září
 * a její díly zůstávají osetou jaří, dokud nejde do snopů. Jinak undefined.
 */
export function lateSpringCrop(state: LateSpringState): SeasonCrop | undefined {
  const spring = seasonCrop(state.threshingSeason, 'spring');
  return spring && spring.harvestedKg === null && spring.partIds.length > 0 ? spring : undefined;
}

/** Zbývající žeň jaře, kterou srpen nedosklidil (člověkodny – `lateSpringCrop`); jinak 0. */
export function lateHarvestRemaining(state: LateSpringState): number {
  const late = lateSpringCrop(state);
  return late ? taskRemaining(late, 'harvest') : 0;
}

/**
 * Plodiny letošní práce (`season`) a jař, kterou srpen nedosklidil (`lateSpringCrop` – v září se
 * dožíná) – ta jen se žní.
 */
export function cropsAfield(
  state: Pick<VillageState, 'season'> & LateSpringState,
): { crop: Crop; work: SeasonCrop; late?: true }[] {
  const crops: { crop: Crop; work: SeasonCrop; late?: true }[] = state.season
    ? seasonCrops(state.season)
    : [];
  const late = state.season ? lateSpringCrop(state) : undefined;
  if (late) crops.push({ crop: 'spring', work: late, late: true });
  return crops;
}

/**
 * Ves letos orá rádlem (oxen.md – Jen rádlo): letošní plán (po sklizni ten, který se mlátí)
 * vznikl se spřežením – i když ho po ztrátě spřežení dokončila motyka; plán starší vsi, když
 * v něm spřežení oralo. Ve scéně má pak celé pole kulaté rohy.
 */
export function ploughsThisYear(state: Pick<VillageState, 'season' | 'threshingSeason'>): boolean {
  const plan = state.season ?? state.threshingSeason;
  if (!plan) return false;
  return plan.ard === true || seasonCrops(plan).some(({ work }) => work.plough !== undefined);
}

/** Všechny díly hospodářského roku – ozim, luštěniny, len i jař. */
export function seasonPartIds(season: FarmSeason): number[] {
  return season.crops.flatMap((work) => work.partIds);
}

/** Hotový podíl úlohy vůči celé práci plodiny (0–1); úloha bez práce = 1. */
function planShare(work: CropWork, task: TaskName): number {
  return work.required[task] > 0 ? Math.min(1, work.done[task] / work.required[task]) : 1;
}

/** Zasetý podíl plánu plodiny (0–1). */
export function sownShare(work: CropWork): number {
  return planShare(work, 'sow');
}

/** Hotový podíl orby (0–1); plodina bez orby 1. */
function ploughShare(work: CropWork): number {
  const plough = work.plough;
  return plough && plough.required > 0 ? Math.min(1, plough.done / plough.required) : 1;
}

/**
 * Zpracovaný podíl půdy plodiny (0–1) – seje se, co je zorané, bez orby co je zkopané (oxen.md –
 * Jen rádlo). Plán starší vsi, kde spřežení oralo jen část dílů, váží orbu a kopání vahami dílů.
 */
export function tilledShare(work: CropWork): number {
  const plough = work.plough;
  if (!plough) return planShare(work, 'dig');
  const digWeight = plough.digWeight ?? 0;
  if (digWeight <= 0) return ploughShare(work);
  const total = plough.weight + digWeight;
  return (planShare(work, 'dig') * digWeight + ploughShare(work) * plough.weight) / total;
}

/**
 * Setí za přípravou půdy (fields.md – Práce, setí týž den hned za orbou a motykou): člověkodny
 * setí, které otevře člověkoden orby (`plough`) nebo kopání (`dig`) – zpracovaný podíl
 * (`tilledShare`) roste s orbou i kopáním lineárně.
 */
export function sowPerTill(work: CropWork): { plough: number; dig: number } {
  const sow = work.required.sow;
  const dig = work.required.dig;
  const plough = work.plough;
  if (!plough) return { plough: 0, dig: dig > 0 ? sow / dig : 0 };
  const digWeight = plough.digWeight ?? 0;
  const perPlough = plough.required > 0 ? sow / plough.required : 0;
  if (digWeight <= 0) return { plough: perPlough, dig: 0 };
  const total = plough.weight + digWeight;
  return {
    plough: (perPlough * plough.weight) / total,
    dig: dig > 0 ? (sow * digWeight) / total / dig : 0,
  };
}

/**
 * Kolik práce úlohy se letos opravdu dělá (Ruling 17): setí jen na zkopané (zorané) části, pletí
 * a sklizeň jen na zasetou, výmlat jen sklizenou úrodu. Nezasetá půda se neplete ani nesklízí.
 */
function workableRequired(work: CropWork, task: TaskName): number {
  switch (task) {
    case 'sow':
      return work.required.sow * tilledShare(work);
    case 'weed':
    case 'harvest':
      return work.required[task] * planShare(work, 'sow');
    case 'thresh':
      return work.required.thresh * planShare(work, 'harvest');
    default:
      return work.required[task];
  }
}

/** Zbývající práce úlohy – jen na části, kam předchozí úloha došla (viz workableRequired). */
export function taskRemaining(work: CropWork, task: TaskName): number {
  return Math.max(0, workableRequired(work, task) - work.done[task]);
}

/** Polní úloha plodiny – úlohy plánu a orba rádlem (oxen.md). */
export type CropTask = TaskName | 'plough';

/** Zbývající orba plodiny (člověkodny); bez orby 0. */
export function ploughRemaining(work: CropWork): number {
  const plough = work.plough;
  return plough ? Math.max(0, plough.required - plough.done) : 0;
}

/** Zbývající práce úlohy nebo orby (viz `taskRemaining`). */
export function cropTaskRemaining(work: CropWork, task: CropTask): number {
  return task === 'plough' ? ploughRemaining(work) : taskRemaining(work, task);
}

/** Odvedená práce úlohy nebo orby (člověkodny). */
export function cropTaskDone(work: CropWork, task: CropTask): number {
  return task === 'plough' ? (work.plough?.done ?? 0) : work.done[task];
}

/** Vloží práci do úlohy nebo orby, nejvýš do potřebné (mutuje `work`). */
export function addCropTaskWork(work: CropWork, task: CropTask, amount: number): void {
  if (task === 'plough') {
    if (work.plough) work.plough.done = Math.min(work.plough.required, work.plough.done + amount);
    return;
  }
  work.done[task] = Math.min(work.required[task], work.done[task] + amount);
}

/** Okna úlohy plodiny – orba v oknech kopání. */
export function cropTaskWindows(crop: Crop, task: CropTask): readonly WindowSegment[] {
  return CROP_WINDOWS[crop][task === 'plough' ? 'dig' : task];
}

/** Hotový podíl úlohy vůči práci, která se letos dělá (0–1); bez takové práce 1. */
export function workedShare(work: CropWork, task: TaskName): number {
  const workable = workableRequired(work, task);
  return workable > 0 ? Math.min(1, work.done[task] / workable) : 1;
}

/** Konec aktuálního úseku okna úlohy plodiny v měsících (viz `windowEndOf`). */
export function taskWindowEnd(task: TaskName, month: number, crop: Crop = 'spring'): number | null {
  return windowEndOf(CROP_WINDOWS[crop][task], month);
}

/**
 * Konec aktuálního úseku okna v měsících; navazující úsek od ledna se přičte (mlácení do konce
 * února = 14). Mimo okno null. Podle konce se řadí sezónní práce – nejbližší konec první.
 */
export function windowEndOf(segments: readonly WindowSegment[], month: number): number | null {
  const current = segments.find(([from, to]) => month >= from && month <= to);
  if (!current) return null;
  const [, to] = current;
  if (to === MONTHS_PER_YEAR) {
    const next = segments.find(([from]) => from === 1);
    if (next) return MONTHS_PER_YEAR + next[1];
  }
  return to;
}

/**
 * Úlohy plodiny s nedodělkem, jejichž okno dnes běží; nejbližší konec okna první. Žeň v prvním
 * měsíci hospodářského roku (září) patří jen jaři, kterou srpen nedosklidil (`late` – fields.md,
 * Žeň jaře i v září); plodina letošní práce se žne až za rok.
 */
export function activeTasks(
  work: CropWork,
  day: number,
  crop: Crop = 'spring',
  sowExtended = false,
  late = false,
): TaskName[] {
  const { month } = dateOfDayIndex(day);
  const result: { task: TaskName; end: number }[] = [];
  for (const task of TASK_ORDER) {
    if (taskRemaining(work, task) <= 0) continue;
    if (task === 'harvest' && !late && month === PLANNING_DAY.month) continue;
    // dohra setí jařin v dlouhé zimě 1.–14. 5. (`springSowingExtended`)
    const end = taskWindowEnd(task, month, crop) ?? (sowExtended && task === 'sow' ? month : null);
    if (end !== null) result.push({ task, end });
  }
  // Array.sort je stabilní – při shodě zůstává pořadí z TASK_ORDER.
  return result.sort((a, b) => a.end - b.end).map((r) => r.task);
}

/**
 * Úroda v kg z dílů práce plodiny – osivo vzaly zásoby při setí, sklizeň ho neodečítá (ani
 * práce z doby před tím – převod `withSeedForgiven`). Pletí a sklizeň se měří jen
 * vůči zaseté části (Ruling 17) – částečné setí se tak nepromítne do úrody dvakrát. Díl
 * v první sezóně po vymýcení lesa pletí nepotřebuje, nedodělané pletí ostatních ho nesráží.
 * `fromDone` – práce žně (člověkodny), jejíž úroda už je ve snopech (červencová žeň –
 * `CropWork.sheaved`): úroda jen ze žně po ní.
 */
export function harvestKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  crop: Crop = 'spring',
  losses?: PartLosses,
  fromDone = 0,
): number {
  const workable = workableRequired(work, 'harvest');
  const before = workable > 0 ? Math.min(1, fromDone / workable) : 0;
  // osivo vzala ze zásob už setí
  return cropYieldKg(
    work,
    parts,
    day,
    planShare(work, 'sow'),
    Math.max(0, workedShare(work, 'harvest') - before),
    crop,
    losses,
  );
}

/**
 * Úroda, kterou plodina ještě dá ze žně, která zbývá (kg – výhled přídělu v září s jaří, kterou
 * srpen nedosklidil: fields.md, Žeň jaře i v září) – jako `harvestKg` pro zbytek žně.
 */
export function unharvestedKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  losses?: PartLosses,
): number {
  return cropYieldKg(
    work,
    parts,
    day,
    planShare(work, 'sow'),
    Math.max(0, 1 - workedShare(work, 'harvest')),
    'spring',
    losses,
  );
}

/**
 * Práce výmlatu sklizené úrody plodiny (člověkodny – `taskRemaining` výmlatu) bez výmlatu úrody,
 * která už je ve snopech (`fromDone` – práce žně červencové žně, `CropWork.sheaved`).
 */
export function threshRemainingAfter(work: CropWork, fromDone = 0): number {
  const sheaved =
    work.required.harvest > 0
      ? (work.required.thresh * Math.min(fromDone, work.required.harvest)) / work.required.harvest
      : 0;
  return Math.max(0, taskRemaining(work, 'thresh') - sheaved);
}

/**
 * Práce výmlatu snopů ze sklizně `kg` (člověkodny – production-chains.md, Humno, Práce výmlatu
 * podle snopů; Martin 18. 11. 2026 – volba C): sazba plánu na hektar (`required.thresh` ÷ plocha
 * dílů plánu – nástroje i příplatek za vzdálenost) platí pro běžnou úrodu (`cropGrossPerHa` při
 * THRESH_CALIBRATION_FERTILITY); snopy pod ní se vymlátí úměrně rychleji, nad ní pomaleji. Bez
 * práce výmlatu (`threshRemainingAfter` – výmlat hotový, starší stav) 0; plán bez ploch dílů
 * sazbu na hektar jako dřív.
 */
export function threshWorkForSheaves(
  work: CropWork,
  parts: FieldPart[],
  crop: Crop,
  kg: number,
  fromDone = 0,
): number {
  const byArea = threshRemainingAfter(work, fromDone);
  if (byArea <= 0) return 0;
  const byId = partsByIdOf(parts);
  const ha = work.partIds.reduce((sum, id) => sum + (byId.get(id)?.areaM2 ?? 0), 0) / M2_PER_HA;
  const typicalKg = ha * cropGrossPerHa(crop, THRESH_CALIBRATION_FERTILITY);
  if (typicalKg <= 0) return byArea;
  return (Math.max(0, kg) * work.required.thresh) / typicalKg;
}

/**
 * Hrubá úroda plodiny na hektar při úrodnosti (luštěniny podíl úrody obilí – LEGUMES; len kg
 * třeného lnu – FLAX, s úrodností jako obilí).
 */
export function cropGrossPerHa(crop: Crop, fertility: number): number {
  const grain = grossYieldPerHa(fertility);
  if (crop === 'legume') return grain * LEGUMES.yieldShare;
  if (crop === 'flax') return (grain / YIELD_BASE_KG_PER_HA) * FLAX.fiberKgPerHa;
  return grain;
}

/**
 * Osivo plodiny na hektar (kg) – len seje semeno z vlastní úrody, zásoby neubírá (FLAX); ozim
 * i jař `SEED_KG_PER_HA`.
 */
export function cropSeedPerHa(crop: Crop): number {
  if (crop === 'legume') return LEGUMES.seedKgPerHa;
  if (crop === 'flax') return 0;
  return SEED_KG_PER_HA;
}

/**
 * Ozim se neplete (fields.md – Pletí jednou a rychle; Martin 25. 10. 2026: „Ozim se plít asi
 * nemusí – v dubnu už je tak velký, že plevel udusí.“): starší hospodářský rok s pletím ozimu ho
 * ztratí (požadované i hotové pletí 0). Idempotentní – bez pletí ozimu vrací týž rok.
 */
export function withoutWinterWeeding(season: FarmSeason): FarmSeason {
  const winter = seasonCrop(season, 'winter');
  if (!winter || (winter.required.weed === 0 && winter.done.weed === 0)) return season;
  return {
    ...season,
    crops: season.crops.map((c) =>
      c === winter
        ? {
            ...winter,
            required: { ...winter.required, weed: 0 },
            done: { ...winter.done, weed: 0 },
          }
        : c,
    ),
  };
}

/**
 * Pletí jednou a rychle (fields.md): práce jaře, luštěnin a lnu ze starších sazeb (30 / 15 a 40 /
 * 20 čd/ha v květnu–červnu) by se v jediném květnovém okně nestihla – úroda by klesla. Požadované
 * i hotové pletí se přepočte na nové sazby (× nová ÷ stará nejhorší mez, hotový podíl zůstane).
 * Starší práce se pozná podle pletí na sklizeň: víc, než dá nová nejhorší mez (setí ne – za rádlem
 * jde podle orby, fields.md – Práce, setí). Zprůměrovaná žeň obilí (10. 11. 2026 – 30 → 23 čd/ha)
 * mez jen zvedne: pletí podle nových sazeb ji s plánem ze starších i nových sazeb sklizně nepřekročí,
 * pletí starších sazeb (30 čd/ha) ano. Idempotentní – rok s novými sazbami vrací týž.
 */
export function withOnceWeedingRates(season: FarmSeason): FarmSeason {
  const rescale = (work: SeasonCrop): SeasonCrop => {
    const crop = work.crop;
    if (crop === 'winter') return work;
    const newWorst = fieldWorkPerHa('weed', 0, crop);
    const limit = (work.required.harvest * newWorst) / fieldWorkPerHa('harvest', 0, crop);
    if (work.required.weed <= limit * (1 + 1e-9)) return work;
    const k =
      newWorst /
      (crop === 'spring' ? LEGACY_WEEDING_WORST_PER_HA.grain : LEGACY_WEEDING_WORST_PER_HA.lowCrop);
    return {
      ...work,
      required: { ...work.required, weed: work.required.weed * k },
      done: { ...work.done, weed: work.done.weed * k },
    };
  };
  const crops = season.crops.map(rescale);
  if (crops.every((c, i) => c === season.crops[i])) return season;
  return { ...season, crops };
}

/**
 * Podíl úrody neopletého dílu plodiny (luštěniny a len plevel snášejí hůř). Ozim se neplete
 * (fields.md – Pletí jednou a rychle) – plná úroda, i když starší plán pletí ozimu měl.
 */
export function unweededYield(crop: Crop): number {
  if (crop === 'winter') return 1;
  if (crop === 'legume') return LEGUMES.unweededYield;
  if (crop === 'flax') return FLAX.unweededYield;
  return UNWEEDED_YIELD;
}

/**
 * Ztráty dílů zvěří (wildlife.md – Škody; `FieldDamage.parts`): podíl hrubé úrody po id dílu.
 * Úroda dílu = bez škody × (1 − share); díl bez záznamu se neztrácí.
 */
export type PartLosses = Readonly<Record<string, { share: number }>>;

function cropYieldKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  sowFrac: number,
  harvestFrac: number,
  crop: Crop = 'spring',
  losses?: PartLosses,
  seedFrac = 0,
  stopAtKg = Infinity,
): number {
  const weedFrac = workedShare(work, 'weed');
  // díly podle id z paměti po seznamu dílů (`partsByIdOf` – jako mapa jen dílů plánu: při dvojím
  // id platí poslední) – hledat každý v celém poli by bylo kvadratické
  const byId = partsByIdOf(parts);
  let total = 0;
  for (const id of work.partIds) {
    const part = byId.get(id);
    if (!part) continue;
    const ha = part.areaM2 / M2_PER_HA;
    const weeded = isWeedFree(part, day) ? 1 : weedFrac;
    const unweeded = unweededYield(crop);
    const gross =
      cropGrossPerHa(crop, effectiveFertility(part, day)) *
      sowFrac *
      (unweeded + (1 - unweeded) * weeded) *
      harvestFrac;
    const kept = 1 - (losses?.[id]?.share ?? 0);
    total += Math.max(0, ha * gross * kept - ha * cropSeedPerHa(crop) * seedFrac);
    // sčítance nejsou záporné a sčítání je monotónní – součet už pod `stopAtKg` neklesne
    if (total >= stopAtKg) return total;
  }
  return total;
}

/**
 * Odhad, o kolik ozim zvětší zásoby (příděl): bez osiva, které zásoby ještě vezmou; sklizeň celá, pletí jen kolik je hotové (před pletím
 * neopletá úroda – opatrně) a setí do konce okna setí celé, potom jen zasetá část. `stopAtKg` –
 * stačí vědět, zda odhad dosáhne tolika: sčítání skončí, jakmile ho dosáhne (vrátí částečný
 * součet, aspoň `stopAtKg` – jen zrychlení, porovnání dopadne stejně).
 */
export function expectedWinterKg(
  work: CropWork,
  parts: FieldPart[],
  day: number,
  losses?: PartLosses,
  stopAtKg = Infinity,
): number {
  const sowing = taskWindowEnd('sow', dateOfDayIndex(day).month, 'winter') !== null;
  const sown = planShare(work, 'sow');
  // osivo zaseté části vzaly zásoby už při setí (u práce z doby před tím je odpuštěné –
  // `withSeedForgiven`), nezaseté teprve vezmou
  return cropYieldKg(
    work,
    parts,
    day,
    sowing ? 1 : sown,
    1,
    'spring',
    losses,
    sowing ? 1 - sown : 0,
    stopAtKg,
  );
}

/**
 * Dní do sklizně, se kterou počítá přídělový systém (fields.md – Ozim a jař): do sklizně ozimu
 * (31. 7.), když ji ves ještě čeká a podle odhadu (`expectedWinterKg`) uživí ves od 1. 8. do
 * sklizně jaře; jinak do sklizně jaře (31. 8.). `needPerDayKg` = denní potřeba, kterou má ozim
 * pokrýt – simulace dává potřebu z pole (potřeba × `fieldFoodShare`), na kterou ves osévala.
 */
export function daysUntilFoodHarvest(
  plan: FarmSeason | null,
  parts: FieldPart[],
  day: number,
  needPerDayKg: number,
  losses?: PartLosses,
): number {
  const late = daysUntilHarvest(day);
  const winter = plan ? seasonCrop(plan, 'winter') : undefined;
  if (!winter || winter.harvestedKg !== null || winter.partIds.length === 0) return late;
  const early = daysUntilWinterHarvest(day);
  if (early >= late) return late;
  const neededKg = needPerDayKg * (late - early);
  return expectedWinterKg(winter, parts, day, losses, neededKg) >= neededKg ? early : late;
}

/** Roční plán uložený před hospodářským rokem (jař na nejvyšší úrovni, ozim, luštěniny, len zvlášť). */
type LegacyPlan = CropWork & {
  plannedDay: number;
  ard?: true;
  winter?: CropWork;
  legume?: CropWork;
  flax?: CropWork;
  flaxNeedKg?: number;
  /**
   * Osev navíc ročního plánu (díly s `sownYears`) – zůstane v hospodářském roce jako starý klíč,
   * převede ho hned potom `withSowingRotation` (fields.md – Osevní postup po dílech, bod 7); stejně
   * čekající přípravu dílů osevu navíc v plodinách.
   */
  extra?: unknown;
  lordHelp?: FarmSeason['lordHelp'];
};

function seasonOfPlan(plan: LegacyPlan): FarmSeason {
  const { plannedDay, ard, winter, legume, flax, flaxNeedKg, extra, lordHelp, ...spring } = plan;
  const season: FarmSeason & { extra?: unknown } = {
    startDay: plannedDay,
    ...(ard ? { ard } : {}),
    crops: [],
    ...(flaxNeedKg !== undefined ? { flaxNeedKg } : {}),
    ...(extra ? { extra } : {}),
    ...(lordHelp ? { lordHelp } : {}),
  };
  if (winter) season.crops.push({ crop: 'winter', ...winter });
  if (legume) season.crops.push({ crop: 'legume', ...legume });
  if (flax) season.crops.push({ crop: 'flax', ...flax });
  season.crops.push({ crop: 'spring', ...spring });
  return season;
}

/**
 * Ves uložená s ročním plánem (`plan`, `threshingFromPlan`) dostane hospodářský rok (`season`,
 * `threshingSeason`) – jen přejmenování tvaru, práce zůstává. Jednou, idempotentně: stav bez
 * starých klíčů se nemění.
 */
export function withSeason(state: VillageState): VillageState {
  const old = state as VillageState & {
    plan?: LegacyPlan | null;
    threshingFromPlan?: LegacyPlan | null;
  };
  if (old.plan === undefined && old.threshingFromPlan === undefined) return state;
  const { plan, threshingFromPlan, ...rest } = old;
  return {
    ...rest,
    season: plan ? seasonOfPlan(plan) : (rest.season ?? null),
    threshingSeason: threshingFromPlan
      ? seasonOfPlan(threshingFromPlan)
      : (rest.threshingSeason ?? null),
  };
}
