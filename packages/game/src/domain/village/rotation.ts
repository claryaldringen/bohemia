import { dateOfDayIndex } from '../calendar';
import {
  effectiveFertility,
  endOfSeason,
  expectedNetKg,
  fallowStage,
  isEmergencyFallow,
  isSowableFertility,
  partOvergrowthYears,
} from './fields';
import { expectedFlaxKg, flaxAllowed } from './flax';
import { EMERGENCY_GROUP, sowingBlocks, villageHoldings } from './holdings';
import { partsByIdOf } from './parts-by-id';
import { CROP_WINDOWS, FERTILITY, SOWN_ROUNDS } from './rules';
import type { Crop, FarmSeason, FieldPart, SeasonCrop, VillageState } from './types';
import { logsFromClearedTrees } from './wood';
import { woodMatureShare, woodTreesOnArea } from './woods';
import { lateSpringCrop, seasonCrops, windowEndOf } from './year-plan';

// Osevní postup po dílech a setí do konce okna (fields.md, 25. 10. 2026 – návrh Clauda, Martin:
// „Ano“; k dílu, který nestihl ozim: „Jestli bude možné mu dát ozim, ať dostane ozim.“). Ves nemá
// roční plán osevu: každý díl ví, co na něm poroste příště (`nextSowing`), a ves k letošní práci
// přibírá všechny díly na řadě, dokud stačí lidé, spřežení a osivo (`turnSelection`). Čisté funkce
// stavu a dne – žádná náhoda.

/** Tolerance porovnání úrodnosti a práce. */
const EPSILON = 1e-9;
/** Tolerance porovnání lnu (kg). */
const KG_EPSILON = 1e-6;

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
  // opuštěný díl odpočívá napořád (fields.md – Opuštěný díl); osetý dál roste do žní
  if (part.abandoned) return part.state === 'fallow' || part.state === 'ready' ? 'rest' : null;
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

/**
 * Ozim smí na dílu dnes začít – celé okno setí: seje se týž den hned za orbou a motykou (fields.md –
 * Práce; Martin 9. 11. 2026: „Setí by mělo probíhat ihned po orbě“).
 */
function winterStartable(day: number): boolean {
  return windowOpen('winter', 'sow', day);
}

/** Jař smí dnes začít – v oknech kopání (seje se týž den hned za orbou a motykou). */
function springStartable(day: number): boolean {
  return windowOpen('spring', 'dig', day);
}

/**
 * Obilí, které dnes začne na dílu na řadě (fields.md – Osevní postup po dílech, bod 2): první
 * osev (i po jaři, příloh 70–95 % a nouzový) ozim, dokud běží okno setí ozimu, potom
 * jař – díl, na kterém setí ozimu do konce října nezačne, se oseje na jaře jaří; díl po ozimu
 * jen jař. Jinak null (okna zavřená, díl odpočívá).
 */
export function sowingCropToday(kind: SowingKind | null, day: number): 'winter' | 'spring' | null {
  if (kind === null || kind === 'rest') return null;
  if (kind !== 'spring' && winterStartable(day)) return 'winter';
  return springStartable(day) ? 'spring' : null;
}

/**
 * Opuštěný díl jde do přílohu (mutuje – fields.md, Opuštěný díl): jako díl po osevu, který
 * vyčerpal úrodnost – od dne `day` ladem, bez plodiny, postupu a popela z vymýcení.
 */
export function toAbandonedFallow(part: FieldPart, day: number): void {
  part.state = 'fallow';
  part.fallowSinceDay = day;
  part.sownYears = 0;
  part.bonusUntilDay = null;
  delete part.crop;
  delete part.next;
}

/**
 * Konec hospodářského roku (1. 9.) pro jeden díl podle postupu (fields.md – Osevní postup po
 * dílech, bod 1) – mění ho na místě. Úrodnost jako `endOfSeason`; pak ozim, který byl prvním
 * osevem oběhu, čeká na jař a jař, která byla prvním osevem (ozim nestihla), na ozim (Martin
 * 25. 10. 2026) – oboje jen, když díl smí dál (aspoň `FERTILITY.sowableMin`). Ostatní osev
 * (druhý osev, luštěniny, len, nouzový osev) jde do úhoru – bez bonusu vymýceného lesa. Osetý len
 * (i nevytrhaný) si díl pamatuje rokem `flaxYear` (fields.md – Len, nejdřív za 7 let znovu).
 */
export function rotateAfterSeason(part: FieldPart, day: number): void {
  const sown = part.state === 'sown';
  const crop = part.crop ?? 'spring';
  if (sown) delete part.next;
  if (sown && crop === 'flax') part.flaxYear = dateOfDayIndex(day).year;
  endOfSeason(part, day);
  // opuštěný díl po žních do přílohu (fields.md – Opuštěný díl)
  if (part.abandoned && (part.state === 'sown' || part.state === 'ready')) {
    toAbandonedFallow(part, day);
    return;
  }
  if (!sown || part.state !== 'sown') return;
  delete part.crop;
  if (part.sownYears === SOWN_ROUNDS - 1 && (crop === 'winter' || crop === 'spring')) {
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
      part.fallowBeforeSeason = {
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
 * leží ladem jako předtím (`fallowBeforeSeason`), hotový díl a díl po prvním osevu zase čeká na
 * řadě (`next` zůstal). Rozkopání propadne.
 */
export function returnPart(part: FieldPart, startDay: number): void {
  const before = part.fallowBeforeSeason;
  delete part.crop;
  delete part.fallowBeforeSeason;
  if (!before) {
    // opuštěný díl se nevrací k osevu – leží ladem (fields.md – Opuštěný díl)
    if (part.abandoned) toAbandonedFallow(part, startDay);
    else part.state = 'ready';
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
 * forest.md – Mýcení): stáří lesa podle stavu před osevem (`fallowBeforeSeason`) – jinak jako
 * `reclaimedLogs`.
 */
export function clearedLogs(parts: readonly FieldPart[], day: number): number {
  let trees = 0;
  for (const part of parts) {
    const before = part.fallowBeforeSeason;
    if (!before || before.overgrowthYears === undefined) continue;
    const was = { fallowSinceDay: before.sinceDay, overgrowthYears: before.overgrowthYears };
    if (fallowStage(was, day) !== 'young-forest') continue;
    trees += woodTreesOnArea(part.areaM2) * woodMatureShare(before.overgrowthYears);
  }
  return logsFromClearedTrees(Math.floor(trees + 1e-9));
}

/** Díl, který přibude k letošní práci, a jeho plodina. */
export interface SeasonJoin {
  id: number;
  crop: Crop;
}

/** Co výběr dílů dne potřebuje vědět mimo stav dílů (`turnSelection`). */
export interface TurnOptions {
  /**
   * Potřeba lnu na oděv zapsaná v plánu k 1. 9. (kg třeného lnu – fields.md, Len): len bere díly
   * jen do ní; 0 = len se nevybírá (plán bez potřeby).
   */
  flaxNeedKg: number;
  /**
   * Skutečný nedostatek – zásoby k sklizni (i hromada osiva okna a snopy) pod přežívací zásobou do
   * žní (`seedKeepKg`): k práci přibudou i přílohy 70–95 % a nouzové přílohy 40–70 %.
   */
  shortage: boolean;
}

/** Díly seřazené podle id – výběr nezávisí na pořadí dílů ve stavu. */
function byId(parts: readonly FieldPart[]): readonly FieldPart[] {
  for (let i = 1; i < parts.length; i++) {
    if (parts[i - 1]!.id > parts[i]!.id) return [...parts].sort((a, b) => a.id - b.id);
  }
  return parts;
}

/**
 * Díly na řadě jsou oseté (fields.md – Osevní postup po dílech, bod 3, „na řadě“ – návrh Clauda):
 * žádný díl na řadě dnes nepřibývá a plodiny letošní práce, jejichž okno setí dnes běží, mají
 * zaseto. Okno setí přílohu 70–95 % (ozim, nebo jař podle dne) musí dnes běžet.
 */
function turnSown(state: VillageState, day: number): boolean {
  const crop = sowingCropToday('late', day);
  if (crop === null || !windowOpen(crop, 'sow', day)) return false;
  if (!state.season) return true;
  for (const { crop: c, work } of seasonCrops(state.season)) {
    if (work.harvestedKg !== null || !windowOpen(c, 'sow', day)) continue;
    if (work.done.sow < work.required.sow - EPSILON) return false;
  }
  return true;
}

/**
 * Díly, které dnes přibudou k letošní práci, v pořadí, ve kterém je ves vezme (fields.md – Osevní
 * postup po dílech, bod 3; Martin 25. 10. 2026: „ves by měla vyrobit maximum obilí a maximum sena,
 * kolik jí umožňuje rozloha polí a množství lidí“): bez odhadu úrody a bez stropu – kolik ves
 * zvládne, určí čelo práce (lidé a spřežení) a osivo. Napřed len místo jaře do potřeby lnu na oděv
 * (`flaxCandidates` – fields.md, Len; Martin 9. 11. 2026), pak obilí na všech dílech na řadě (první
 * osev, jař po ozimu, ozim po jaři) v pořadí přílohové soustavy po úsecích od domu
 * (`sowingBlocks`), v dávce ozim před jaří (jeho okno končí dřív); plodina `sowingCropToday`.
 * Na řadě (návrh Clauda): zotavené přílohy 70–95 % až když jsou díly na řadě oseté a okno setí
 * běží (`turnSown` – osivo z toho, co zbude nad přežívací zásobou), nouzové přílohy 40–70 % s kladnou
 * úrodou jen při skutečném nedostatku (`TurnOptions.shortage` – pak i přílohy 70–95 % hned).
 * Luštěniny ves na poli nepěstuje (fields.md – Luštěniny, zrušeno – má je domácnost na zahrádce
 * u obydlí; Martin 9. 11. 2026). Stav nemění.
 */
export function turnSelection(
  state: VillageState,
  day: number,
  options: TurnOptions,
): SeasonJoin[] {
  const parts = byId(state.parts);
  const holdings = villageHoldings(parts === state.parts ? state : { ...state, parts: [...parts] });
  const inSeason = new Set<number>();
  // len letošní práce, který ještě poroste – kolik ho ves čeká
  let flaxKg = 0;
  const partsById = partsByIdOf(parts);
  for (const { crop, work } of state.season ? seasonCrops(state.season) : []) {
    for (const id of work.partIds) inSeason.add(id);
    if (crop !== 'flax' || work.harvestedKg !== null) continue;
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (part) flaxKg += expectedFlaxKg(part, day);
    }
  }
  // jař, kterou srpen nedosklidil, je na poli – díl přijde na řadu, až se sklidí (fields.md – Žeň
  // jaře i v září)
  for (const id of lateSpringCrop(state)?.partIds ?? []) inSeason.add(id);
  const kindOf = new Map<number, SowingKind | null>();
  const kind = (p: FieldPart): SowingKind | null => {
    let k = kindOf.get(p.id);
    if (k === undefined) {
      k = inSeason.has(p.id) ? null : nextSowing(p);
      kindOf.set(p.id, k);
    }
    return k;
  };
  // obilí dnes podle druhu osevu – jen druh a den, tak jednou za druh (jen zrychlení)
  const cropToday = new Map<SowingKind | null, 'winter' | 'spring' | null>();
  const cropOf = (k: SowingKind | null): 'winter' | 'spring' | null => {
    let crop = cropToday.get(k);
    if (crop === undefined) {
      crop = sowingCropToday(k, day);
      cropToday.set(k, crop);
    }
    return crop;
  };
  const blocks = sowingBlocks(parts, holdings).flat();
  const turn = blocks.filter((p) => onTurn(kind(p)));
  const join: SeasonJoin[] = [];
  const used = new Set<number>();
  // len místo jaře do potřeby na oděv – jen když jař dnes smí začít
  if (options.flaxNeedKg > KG_EPSILON && sowingCropToday('spring', day) !== null) {
    // skupina prvního osevu se řadí, jen když druhá potřebu nepokryje (jen zrychlení)
    for (const group of flaxCandidates(blocks, kind, cropOf, day)) {
      if (flaxKg >= options.flaxNeedKg - KG_EPSILON) break;
      for (const p of group()) {
        if (flaxKg >= options.flaxNeedKg - KG_EPSILON) break;
        join.push({ id: p.id, crop: 'flax' });
        used.add(p.id);
        flaxKg += expectedFlaxKg(p, day);
      }
    }
  }
  // obilí v pořadí bloků, v dávce ozim před jaří
  const grain = (list: readonly FieldPart[]): number => {
    const batch: SeasonJoin[] = [];
    for (const p of list) {
      if (used.has(p.id)) continue;
      const crop = cropOf(kind(p));
      if (!crop) continue;
      batch.push({ id: p.id, crop });
      used.add(p.id);
    }
    join.push(...batch.filter((j) => j.crop === 'winter'));
    join.push(...batch.filter((j) => j.crop !== 'winter'));
    return batch.length;
  };
  const onTurnJoins = grain(turn);
  const late = (): FieldPart[] => blocks.filter((p) => kind(p) === 'late');
  if (options.shortage) {
    grain(late());
    grain(
      sowingBlocks(parts, holdings, EMERGENCY_GROUP)
        .flat()
        .filter((p) => kind(p) === 'emergency' && expectedNetKg(p, day) > 0),
    );
  } else if (onTurnJoins === 0 && turnSown(state, day)) {
    grain(late());
  }
  return join;
}

/**
 * Díly, které smí dostat len (fields.md – Len; Martin 9. 11. 2026: „Len je extrémně náročná
 * plodina na kvalitu půdy.“), v pořadí, ve kterém je len bere: díly, na kterých by dnes začala jař
 * – napřed díly druhého osevu oběhu (po ozimu `spring`, po jaři `winter`, kterému okno ozimu
 * skončilo – po nich díl stejně odpočívá), pak díly prvního osevu (`first` a příloh 70–95 % `late`
 * – len jim vezme kolo obilí; návrh Clauda), v obou skupinách od nejlepší úrodnosti (při shodě
 * podle id); jen díly od 70 % (`isSowableFertility`), na kterých len 7 let nerostl
 * (`flaxAllowed`). Nouzový příloh ne. Vrací obě skupiny zvlášť – každá se seřadí až při zavolání
 * (jen zrychlení: ves, které len pokryje už druhý osev, první neřadí).
 */
function flaxCandidates(
  blocks: readonly FieldPart[],
  kind: (p: FieldPart) => SowingKind | null,
  cropOf: (k: SowingKind | null) => 'winter' | 'spring' | null,
  day: number,
): (() => FieldPart[])[] {
  // jedním průchodem do dvou skupin (druhý osev, první osev); řadí se až na požádání
  const second: FieldPart[] = [];
  const first: FieldPart[] = [];
  for (const p of blocks) {
    const k = kind(p);
    if (k === null) continue;
    const group =
      k === 'spring' || k === 'winter' ? second : k === 'first' || k === 'late' ? first : null;
    if (!group || cropOf(k) !== 'spring' || !isSowableFertility(p) || !flaxAllowed(p, day)) {
      continue;
    }
    group.push(p);
  }
  // od nejlepší úrodnosti, při shodě podle id (úplné pořadí – nezávisí na pořadí bloků)
  const ranked = (list: readonly FieldPart[]): FieldPart[] =>
    list
      .map((p) => ({ p, fertility: effectiveFertility(p, day) }))
      .sort((a, b) => b.fertility - a.fertility || a.p.id - b.p.id)
      .map(({ p }) => p);
  return [(): FieldPart[] => ranked(second), (): FieldPart[] => ranked(first)];
}

/** Díl na řadě s obilím – první osev, jař po ozimu, ozim po jaři (ne příloh 70–95 % ani nouzový). */
export function onTurn(kind: SowingKind | null): boolean {
  return kind === 'first' || kind === 'spring' || kind === 'winter';
}

/** Díl osevu navíc z doby ročního plánu – `sownYears`: osévaný díl ležel ladem jen od plánu. */
interface LegacyExtraPart {
  id: number;
  sownYears?: number;
}
/** Hospodářský rok uložený s ročním plánem: osev navíc a čekající příprava jeho dílů. */
type LegacySeason = FarmSeason & { extra?: LegacyExtraPart[] };
type LegacyCrop = SeasonCrop & { extraLeft?: unknown };
type LegacyPart = FieldPart & { fallowBeforePlan?: FieldPart['fallowBeforeSeason'] };

/** Hospodářský rok bez klíčů ročního plánu (`extra`, `extraLeft`). */
function seasonWithoutPlan(season: LegacySeason | null): FarmSeason | null {
  if (!season) return null;
  const legacy =
    season.extra !== undefined || season.crops.some((c: LegacyCrop) => c.extraLeft !== undefined);
  if (!legacy) return season;
  const copy: LegacySeason = {
    ...season,
    crops: season.crops.map((c) => {
      const crop: LegacyCrop = { ...c };
      delete crop.extraLeft;
      return crop;
    }),
  };
  delete copy.extra;
  return copy;
}

/** Převod bez značky – může selhat na poškozeném stavu (`withSowingRotation` ho zachytí). */
function convertToRotation(state: VillageState): VillageState {
  const season = state.season as LegacySeason | null;
  const inSeason = new Set(season?.crops.flatMap((c) => c.partIds));
  const waiting = new Map((season?.extra ?? []).map((e) => [e.id, e]));
  let partsChanged = false;
  const parts = state.parts.map((p: LegacyPart) => {
    const sownYears = waiting.get(p.id)?.sownYears;
    const restore = sownYears !== undefined && p.state === 'fallow' && !inSeason.has(p.id);
    if (p.fallowBeforePlan === undefined && !restore) return p;
    partsChanged = true;
    const part: LegacyPart = { ...p };
    if (part.fallowBeforePlan !== undefined) {
      part.fallowBeforeSeason = part.fallowBeforePlan;
      delete part.fallowBeforePlan;
    }
    if (restore) {
      // osévaný díl ležel ladem jen od plánu – zase čeká na řadě s léty v řadě
      part.state = 'ready';
      part.fallowSinceDay = null;
      part.sownYears = sownYears;
      delete part.overgrowthYears;
    }
    return part;
  });
  const next = seasonWithoutPlan(season);
  const threshing = seasonWithoutPlan(state.threshingSeason as LegacySeason | null);
  if (!partsChanged && next === state.season && threshing === state.threshingSeason) return state;
  return { ...state, parts, season: next, threshingSeason: threshing };
}

/**
 * Ves uložená s ročním plánem přejde na osevní postup po dílech jednou (fields.md – Osevní postup
 * po dílech, bod 7 – Starší vsi; značka `VillageState.sowingRotation`). Volat po `withSeason`.
 * Plodiny hospodářského roku zůstanou s hotovou prací a jsou nutné – i začaté díly osevu navíc:
 * jejich čekající příprava (`extraLeft`) je v potřebné práci, převodem se stane nutnou. Díly
 * osevu navíc, na kterých práce nezačala (`extra`), čekají podle stavu – osévaný díl, který ležel
 * ladem jen od plánu, je zase na řadě s léty v řadě, příloh leží dál. Příloh vracený do osevu si
 * pamatuje stav před sezónou (`fallowBeforeSeason`). Co na dílu poroste příště (`next`), dopočítá
 * `rotateAfterSeason` 1. 9.; pomoc rodiny a potřeba lnu zůstanou do konce roku. Při chybě se ves
 * načte beze změny se značkou (jako `withRoadsRebuilt`; zpráva chyby zůstane v `sowingRotationFailed`). Vstupní stav nemění.
 */
export function withSowingRotation(state: VillageState): VillageState {
  if (state.sowingRotation) return state;
  try {
    return { ...convertToRotation(state), sowingRotation: true };
  } catch (error) {
    // ves se načte a počítá dál; příznak s chybou si přečte aplikace a zapíše ji (`updateVillage`)
    const message = error instanceof Error ? error.message : String(error);
    return { ...state, sowingRotation: true, sowingRotationFailed: message };
  }
}
