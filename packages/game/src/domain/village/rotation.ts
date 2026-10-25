import { dateOfDayIndex } from '../calendar';
import type { SowingTargets } from './field-food';
import { startedPartIds } from './field-progress';
import {
  endOfSeason,
  expectedNetKg,
  fallowStage,
  isEmergencyFallow,
  isSowableFertility,
  partOvergrowthYears,
  partWalkDistance,
} from './fields';
import { expectedFlaxKg } from './flax';
import { EMERGENCY_GROUP, sowingBlocks, villageHoldings } from './holdings';
import { expectedLegumeKg, legumeEnergy } from './legumes';
import { CROP_WINDOWS, FERTILITY, FIELD_STORES } from './rules';
import { sideCropOrder, type SideCrop } from './sowing';
import type { Crop, FieldPart, VillageState } from './types';
import { logsFromClearedTrees } from './wood';
import { woodMatureShare, woodTreesOnArea } from './woods';
import { seasonCrops, windowEndOf } from './year-plan';

// Osevní postup po dílech a setí do konce okna (fields.md, 25. 10. 2026 – návrh Clauda, Martin:
// „Ano“; k dílu, který nestihl ozim: „Jestli bude možné mu dát ozim, ať dostane ozim.“). Ves nemá
// roční plán osevu: každý díl ví, co na něm poroste příště (`nextSowing`), a ves k letošní práci
// přibírá díly na řadě podle potřeby úrody (`neededSelection`). Čisté funkce stavu a dne – žádná
// náhoda; dokud je simulace nevolá, chování vsi se nemění.

/** Tolerance porovnání úrodnosti a práce. */
const EPSILON = 1e-9;
/** Tolerance porovnání energie (kg obilí). */
const ENERGY_EPSILON = 1e-6;

/**
 * Co na dílu poroste příště (fields.md – Osevní postup po dílech, bod 1): `first` – první osev
 * oběhu (čerstvě založený díl, příloh odpočatý aspoň na `FERTILITY.fallowReady`), `spring` – díl
 * po ozimu čeká na jař, `winter` – díl po jaři, která byla prvním osevem, čeká na ozim (Martin
 * 25. 10. 2026), `late` – příloh 70–95 % (jen když běžné díly nestačí), `emergency` – příloh
 * 40–70 % (nouzový osev), `rest` – příloh odpočívá.
 */
export type SowingKind = 'first' | 'spring' | 'winter' | 'late' | 'emergency' | 'rest';

/** Co je na dílu na řadě; díl v sezóně (zasetý) a zakládaný null. */
export function nextSowing(part: FieldPart): SowingKind | null {
  if (part.state === 'ready') return part.next ?? 'first';
  if (part.state !== 'fallow') return null;
  if (part.fertilityShare >= FERTILITY.fallowReady - EPSILON) return 'first';
  if (isSowableFertility(part)) return 'late';
  return isEmergencyFallow(part) ? 'emergency' : 'rest';
}

/** Okno úlohy plodiny dnes běží. */
export function windowOpen(crop: Crop, task: 'reclaim' | 'dig' | 'sow', day: number): boolean {
  return windowEndOf(CROP_WINDOWS[crop][task], dateOfDayIndex(day).month) !== null;
}

/** Ozim smí na dílu dnes začít – po dnešku zbývá den setí (seje se zkopané do včerejška). */
function winterStartable(day: number): boolean {
  return windowOpen('winter', 'sow', day) && windowOpen('winter', 'sow', day + 1);
}

/** Jař smí dnes začít – v oknech kopání, na jaře jen dokud po dnešku zbývá den setí. */
function springStartable(day: number): boolean {
  if (!windowOpen('spring', 'dig', day)) return false;
  return !windowOpen('spring', 'sow', day) || windowOpen('spring', 'sow', day + 1);
}

/**
 * Obilí, které dnes začne na dílu na řadě (fields.md – Osevní postup po dílech, bod 2): první
 * osev (i po jaři, příloh 70–95 % a nouzový) ozim, dokud po dnešku zbývá den setí ozimu, potom
 * jař – díl, na kterém setí ozimu do konce října nezačne, se oseje na jaře jaří; díl po ozimu
 * jen jař. Jinak null (okna zavřená, díl odpočívá).
 */
export function sowingCropToday(kind: SowingKind | null, day: number): 'winter' | 'spring' | null {
  if (kind === null || kind === 'rest') return null;
  if (kind !== 'spring' && winterStartable(day)) return 'winter';
  return springStartable(day) ? 'spring' : null;
}

/**
 * Plodina, kterou dnes začíná osev navíc (fields.md – Osev navíc) – jako první osev oběhu
 * (`sowingCropToday`). Zmizí s osevem navíc (plán – Úloha 4).
 */
export function extraSowingCrop(day: number): 'winter' | 'spring' | null {
  return sowingCropToday('first', day);
}

/**
 * Konec hospodářského roku (1. 9.) pro jeden díl podle postupu (fields.md – Osevní postup po
 * dílech, bod 1) – mění ho na místě. Úrodnost jako `endOfSeason`; pak ozim, který byl prvním
 * osevem oběhu, čeká na jař a jař, která byla prvním osevem (ozim nestihla), na ozim (Martin
 * 25. 10. 2026) – oboje jen, když díl smí dál (aspoň `FERTILITY.sowableMin`). Ostatní osev
 * (druhý osev, luštěniny, len, nouzový osev) jde do úhoru – bez bonusu vymýceného lesa.
 */
export function rotateAfterSeason(part: FieldPart, day: number): void {
  const sown = part.state === 'sown';
  const crop = part.crop ?? 'spring';
  if (sown) delete part.next;
  endOfSeason(part, day);
  if (!sown || part.state !== 'sown') return;
  delete part.crop;
  if (part.sownYears === 1 && (crop === 'winter' || crop === 'spring')) {
    part.state = 'ready';
    part.next = crop === 'winter' ? 'spring' : 'winter';
    return;
  }
  part.state = 'fallow';
  part.fallowSinceDay = day;
  part.sownYears = 0;
  part.bonusUntilDay = null;
}

/**
 * Vybrané díly se osejí plodinou `crop` (příloh se vrací do osevu – zarůstání začne znovu); díl
 * z přílohu si pamatuje, jak ležel, kdyby ho ves zase uvolnila (`returnPart`). Díl na řadě si
 * do konce sezóny nechá, co na něm mělo růst (`FieldPart.next`) – uvolněný nebo nezasetý díl na
 * řadu přijde zase stejně; 1. 9. ho `rotateAfterSeason` smaže.
 */
export function sowParts(parts: readonly FieldPart[], crop: Crop): void {
  for (const part of parts) {
    if (part.state === 'fallow') {
      part.fallowBeforePlan = {
        sinceDay: part.fallowSinceDay,
        ...(part.overgrowthYears !== undefined ? { overgrowthYears: part.overgrowthYears } : {}),
      };
      part.fallowSinceDay = null;
      part.sownYears = 0;
      delete part.overgrowthYears;
    }
    part.state = 'sown';
    part.crop = crop;
  }
}

/**
 * Díl, který ves k letošní práci přibrala a pak z ní vyřadila (uvolněný nutný díl, nezasetá jař –
 * fields.md, Osevní postup po dílech, body 2 a 3), se vrátí, jak byl (mění ho na místě): příloh
 * leží ladem jako předtím (`fallowBeforePlan`), hotový díl a díl po prvním osevu zase čeká na
 * řadě (`next` zůstal). Rozkopání propadne.
 */
export function returnPart(part: FieldPart, startDay: number): void {
  const before = part.fallowBeforePlan;
  delete part.crop;
  delete part.fallowBeforePlan;
  if (!before) {
    part.state = 'ready';
    return;
  }
  part.state = 'fallow';
  part.fallowSinceDay = before.sinceDay ?? startDay;
  part.sownYears = 0;
  if (before.overgrowthYears !== undefined) part.overgrowthYears = before.overgrowthYears;
}

/**
 * Klády z vracených dílů v mladém lese (fields.md – Zarůstání): dospělých stromů jako v lese vsi
 * stejného stáří (`woodMatureShare` × hustota lesa) – za každý celý strom kláda (forest.md –
 * Mýcení). Díly ve stavu před osevem.
 */
export function reclaimedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    if (part.state !== 'fallow' || fallowStage(part, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(partOvergrowthYears(part));
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/**
 * Klády z mladého lesa na přibraných dílech, které ves vyklučila (fields.md – Zarůstání,
 * forest.md – Mýcení): stáří lesa podle stavu před osevem (`fallowBeforePlan`) – jinak jako
 * `reclaimedLogs`.
 */
export function clearedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    const before = part.fallowBeforePlan;
    if (!before || before.overgrowthYears === undefined) continue;
    const was = { fallowSinceDay: before.sinceDay, overgrowthYears: before.overgrowthYears };
    if (fallowStage(was, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(before.overgrowthYears);
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/**
 * Potřeba úrody pro výběr nutných dílů (fields.md – Osevní postup po dílech, bod 3): energie
 * obilí a luštěnin (`harvestKg`), roční potřeba bez rezervy (`energyFloorKg` – do ní obilí před
 * luštěninami), luštěniny (`legumeKg`), roční potřeba z pole (`needKg` – tolerance uvolnění)
 * a potřeba lnu na oděv k 1. 9. (`flaxNeedKg`, kg třeného lnu).
 */
export type NeededTargets = Pick<
  SowingTargets,
  'harvestKg' | 'energyFloorKg' | 'legumeKg' | 'needKg'
> & {
  flaxNeedKg: number;
};

/** Díl, který přibude k nutné práci sezóny, a jeho plodina. */
export interface NeededJoin {
  id: number;
  crop: Crop;
}

/** Výsledek výběru nutných dílů – díly k přidání a nezačaté nutné díly, které ves nepotřebuje. */
export interface NeededSelection {
  join: NeededJoin[];
  release: number[];
}

/** Díly seřazené podle id – výběr nezávisí na pořadí dílů ve stavu. */
function byId(parts: readonly FieldPart[]): readonly FieldPart[] {
  for (let i = 1; i < parts.length; i++) {
    if (parts[i - 1]!.id > parts[i]!.id) return [...parts].sort((a, b) => a.id - b.id);
  }
  return parts;
}

/** Očekávaná energie úrody dílu plodiny (kg obilí, luštěniny svou energií, len se nejí). */
function partEnergy(part: FieldPart, crop: Crop, day: number): number {
  if (crop === 'flax') return 0;
  return crop === 'legume' ? legumeEnergy(expectedLegumeKg(part, day)) : expectedNetKg(part, day);
}

/** Nutná práce sezóny – co už ves dělá (dnes letošní plán). */
interface SeasonWork {
  energyKg: number;
  legumeKg: number;
  flaxKg: number;
  ids: Set<number>;
  /** Nezačaté díly obilí (ozim, jař) – kandidáti uvolnění. */
  untouched: { part: FieldPart; crop: Crop }[];
}

/**
 * Zasetá a začatá nutná práce sezóny: očekávaná úroda plodin, které se ještě nesklidily (plná
 * práce, dnešní úrodnost – jako dosud plán), a nezačaté díly obilí.
 */
function seasonOf(
  state: VillageState,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): SeasonWork {
  const season: SeasonWork = { energyKg: 0, legumeKg: 0, flaxKg: 0, ids: new Set(), untouched: [] };
  if (!state.season) return season;
  for (const { crop, work } of seasonCrops(state.season)) {
    for (const id of work.partIds) season.ids.add(id);
    if (work.harvestedKg !== null) continue;
    const grain = crop === 'winter' || crop === 'spring';
    const started = grain ? startedPartIds(work, partsById, day) : null;
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (!part) continue;
      season.energyKg += partEnergy(part, crop, day);
      if (crop === 'legume') season.legumeKg += expectedLegumeKg(part, day);
      if (crop === 'flax') season.flaxKg += expectedFlaxKg(part, day);
      if (started && !started.has(id)) season.untouched.push({ part, crop });
    }
  }
  return season;
}

/**
 * Nezačaté díly obilí, které ves už nepotřebuje (fields.md – Osevní postup po dílech, bod 3):
 * jen když úroda převyšuje potřebu o víc než `FIELD_STORES.trimMarginYears` roční potřeby z pole
 * (díly tak nepřebíhají den co den – návrh Clauda, jako dosud zkrácení plánu); nouzový příloh
 * první, pak nejdál od domu (chůze po pěšinách), dokud úroda bez dalšího dílu nepoklesne pod
 * potřebu. Luštěniny a len zůstanou.
 */
function releasable(season: SeasonWork, targets: NeededTargets, day: number): number[] {
  const margin = FIELD_STORES.trimMarginYears * targets.needKg;
  if (season.energyKg <= targets.harvestKg + margin + ENERGY_EPSILON) return [];
  const order = [...season.untouched].sort(
    (a, b) =>
      Number(isSowableFertility(a.part)) - Number(isSowableFertility(b.part)) ||
      partWalkDistance(b.part) - partWalkDistance(a.part) ||
      Number(a.crop === 'winter') - Number(b.crop === 'winter') ||
      b.part.id - a.part.id,
  );
  const release: number[] = [];
  let energy = season.energyKg;
  for (const { part, crop } of order) {
    const lost = partEnergy(part, crop, day);
    if (energy - lost < targets.harvestKg - ENERGY_EPSILON) break;
    energy -= lost;
    release.push(part.id);
  }
  return release;
}

/**
 * Výběr nutných dílů (fields.md – Osevní postup po dílech, bod 3, a Postup práce po dílech): k
 * zasetému a začatému přibírá díly na řadě v pořadí, ve kterém je ves vezme k práci – len (je ho
 * málo, bez něj chybí oděv – Len napřed), obilí do roční potřeby bez rezervy (`energyFloorKg` –
 * proti hladu; obilí má přednost), luštěniny, pak obilí do celé potřeby (`harvestKg`). Obilí
 * v pořadí přílohové soustavy po úsecích od domu (`sowingBlocks` – díly po prvním osevu, čerstvě
 * založené, odpočaté, přílohy 70–95 % a nakonec nouzové přílohy s kladnou úrodou), v dávce ozim
 * před jaří (jeho okno končí dřív); plodina `sowingCropToday`. Len a luštěniny místo jaře – len od
 * konce, luštěniny od domu, napřed díly po ozimu, pak díly s prvním osevem – do své potřeby.
 * Když potřebu úroda převyšuje a obilí nepřibírá, vrátí nezačaté díly obilí k uvolnění
 * (`release`). Stav nemění.
 */
export function neededSelection(
  state: VillageState,
  day: number,
  targets: NeededTargets,
): NeededSelection {
  const parts = byId(state.parts);
  const partsById = new Map(parts.map((p) => [p.id, p]));
  const season = seasonOf(state, partsById, day);
  const holdings = villageHoldings(parts === state.parts ? state : { ...state, parts: [...parts] });
  const kindOf = new Map<number, SowingKind | null>();
  const kind = (p: FieldPart): SowingKind | null => {
    if (!kindOf.has(p.id)) kindOf.set(p.id, season.ids.has(p.id) ? null : nextSowing(p));
    return kindOf.get(p.id)!;
  };
  const regular = sowingBlocks(parts, holdings)
    .flat()
    .filter((p) => {
      const k = kind(p);
      return k === 'first' || k === 'spring' || k === 'winter' || k === 'late';
    });
  let emergency: FieldPart[] | null = null;
  const join: NeededJoin[] = [];
  const used = new Set<number>();
  let energy = season.energyKg;
  // obilí do `limitKg` v pořadí bloků; nouzové přílohy až za ostatními, jen s kladnou úrodou
  const grain = (limitKg: number): void => {
    if (energy >= limitKg - ENERGY_EPSILON) return;
    emergency ??= sowingBlocks(parts, holdings, EMERGENCY_GROUP)
      .flat()
      .filter((p) => kind(p) === 'emergency' && expectedNetKg(p, day) > 0);
    const batch: NeededJoin[] = [];
    for (const p of [...regular, ...emergency]) {
      if (energy >= limitKg - ENERGY_EPSILON) break;
      if (used.has(p.id)) continue;
      const crop = sowingCropToday(kind(p), day);
      if (!crop) continue;
      batch.push({ id: p.id, crop });
      used.add(p.id);
      energy += expectedNetKg(p, day);
    }
    join.push(...batch.filter((j) => j.crop === 'winter'));
    join.push(...batch.filter((j) => j.crop !== 'winter'));
  };
  // len a luštěniny místo jaře – jen když jař dnes smí začít
  const springToday = sowingCropToday('spring', day) !== null;
  const sideCrop = (crop: SideCrop, targetKg: number, haveKg: number): void => {
    if (!springToday) return;
    let kg = haveKg;
    const free = (k: SowingKind): FieldPart[] =>
      regular.filter((p) => kind(p) === k && !used.has(p.id));
    for (const p of [
      ...sideCropOrder(free('spring'), crop),
      ...sideCropOrder(free('first'), crop),
    ]) {
      if (kg >= targetKg - ENERGY_EPSILON) break;
      join.push({ id: p.id, crop });
      used.add(p.id);
      kg += crop === 'flax' ? expectedFlaxKg(p, day) : expectedLegumeKg(p, day);
      energy += partEnergy(p, crop, day);
    }
  };
  sideCrop('flax', targets.flaxNeedKg, season.flaxKg);
  grain(Math.min(targets.energyFloorKg, targets.harvestKg));
  sideCrop('legume', targets.legumeKg, season.legumeKg);
  grain(targets.harvestKg);
  // len a luštěniny přibírají kvůli své potřebě – uvolnění obilí nebrzdí
  const grainJoins = join.some((j) => j.crop === 'winter' || j.crop === 'spring');
  return { join, release: grainJoins ? [] : releasable(season, targets, day) };
}
