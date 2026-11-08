import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import {
  addGate,
  autoGates,
  fortificationCost,
  fortificationFullCost,
  FORT_NO_STONE,
  FORT_WALKWAY_NEW,
  wallYearReason,
  fortBlockingSegments,
  fortOutlineOf,
  fortRunningWork,
  fortSegments,
  roadGates,
  sectionOf,
  sectionPieces,
  busySegments,
  completeUpgrade,
  layerBuilt,
  segmentBuilt,
  settleUpgrade,
  upgradeDone,
  segmentKind,
  segmentRampart,
  segmentWall,
  type FortGate,
  type FortOutline,
  type FortSegmentShape,
  type SectionPiece,
} from './fortification';
import type { Point } from './polygon';
import { giveWayToBuilding } from './land-taken';
import { villageManorId } from './manor';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import type { Walk } from './paths/walking';
import { checkFortificationPlacement } from './placement-fortifications';
import { placementVillageOf } from './placement-village';
import { DEMOLITION } from './rules-buildings';
import { FORTIFICATIONS } from './rules-fortifications';
import { nearestQuarry, quarryManDaysPerM3 } from './quarry';
import { stoneOnHand, takeStone } from './stone';
import type {
  ChronicleEvent,
  Construction,
  FortBuildWork,
  FortKind,
  FortSegment,
  FortSegmentWork,
  FortTop,
  Fortification,
  RoadPoint,
  VillageState,
  WallKind,
} from './types';
import {
  addLogs,
  claimedObstacles,
  planWoodFrom,
  takeWood,
  woodFellingCost,
  woodLogs,
} from './wood';

// Stavba opevnění po úsecích (fortifications.md – Cena a stavba; Hradby a obrana – Cena): cena
// předem jen klády a kámen – klády na hromadě a dospělé stromy k mání musí pokrýt klády celé
// stavby, kámen na hromadách a lom ve skalním výchozu kámen celé stavby („Hráč staví kdy chce“),
// práce se nečeká, jen trvá. Cena je komplet: strom pro opevnění se kácí za 1 čd × vzdálenost
// (ne za obecné 2 čd), kámen z lomu se láme za 1 čd na m³ × vzdálenost. Stavba bere ze společné
// práce rovným dílem s ostatními stavbami (`build` v simulate-build.ts); práce jde napřed do
// kácení vyhrazených stromů, pak do úseků jeden po druhém od brány nejblíž dvorci po směru hodin
// (lámání kamene je v práci úseků podle jejich kamene). Hotový úsek stojí hned.

/** Důvody odmítnutí česky (u kurzoru a v odpovědi akce). */
export const FORT_NO_WOOD = 'Na opevnění chybí dřevo – klády ani stromy ke kácení nestačí.';
export const FORT_UNKNOWN = 'Takové opevnění ves nemá.';
export const FORT_BUSY = 'Na opevnění se už staví.';
export const FORT_NOT_FENCE = 'Na palisádu jde vylepšit jen polský plot.';
export const FORT_ALREADY_PALISADE = 'Opevnění už je palisáda.';
export const FORT_NOT_RAMPART = 'Plot nebo palisáda se staví jen na val.';
export const FORT_RAMPART_UNFINISHED = 'Na valu se staví až na hotovém.';
export const FORT_TOP_DONE = 'Val už nástavbu má.';
export const FORT_GATE_OFF = 'Brána musí stát na obvodu opevnění.';
export const FORT_GATE_TAKEN = 'Úsek už bránu má.';
export const FORT_SECTION_GONE = 'Úsek už je zbořený.';
export const FORT_SECTION_GATE_ONLY = 'V úseku stojí jen brána – brány zůstávají.';

/** Tolerance porovnání práce (čd). */
const EPSILON = 1e-9;

/** Výsledek akce nad opevněním – nový stav, nebo důvod odmítnutí. */
export type FortificationResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/** Opevnění vsi (u vsí uložených dřív chybí – žádné). */
export function villageFortifications(
  state: Pick<VillageState, 'fortifications'>,
): Fortification[] {
  return state.fortifications ?? [];
}

/** Obvod opevnění druhu `kind` (bez údaje druh opevnění) – tvar z uložených bodů. */
export function outlineOf(
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  fort: Fortification,
  kind: FortKind = fort.kind,
): FortOutline | null {
  return fortOutlineOf(geo, fort, kind);
}

/**
 * Běží na některém z dílů `indices` opevnění jiná stavba? Na opevnění smí běžet víc staveb, každá
 * na svých dílech (Martin 8. 11. 2026 – „B“); stavba nového opevnění zabírá celý obvod.
 */
function segmentsBusy(
  state: VillageState,
  fort: Fortification,
  indices: Iterable<number>,
): boolean {
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  for (const i of indices) if (busy.has(i)) return true;
  return false;
}

/** Pevné cesty vsi (i vozové a úseky zemské stezky) – osy pro brány, které vzniknou samy. */
function roadAxes(state: VillageState): RoadPoint[][] {
  return (state.roads?.roads ?? []).map((r) => r.points);
}

/**
 * Brány pro cesty přes blokující opevnění (fortifications.md – Brány: cesta postavená přes hotové
 * opevnění dostane bránu taky – návrh Clauda; mutuje stav): každý den před přepočtem tras – nová
 * pevná cesta z vyšlapanosti, hotový úsek vozové cesty a zemské stezky i staveniště opevnění přes
 * starou cestu tak bránu dostanou dřív, než je síť pěšin a vozů uzavře (`roadGates`). Blokující
 * úsek = stojící nebo staveniště běžící stavby (`segmentBlockKind` – celý obvod blokuje od
 * položení stavby). Ves bez opevnění nebo bez cest beze změny.
 */
export function gateRoadCrossings(
  state: VillageState,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
): void {
  const forts = state.fortifications;
  if (!forts || forts.length === 0) return;
  const axes = roadAxes(state);
  if (axes.length === 0) return;
  for (const fort of forts) {
    const standing = new Set(
      fortBlockingSegments(fort, fortRunningWork(state, fort.id)).map((s) => s.index),
    );
    // každý stojící úsek už bránu má – není co přidat
    for (const g of fort.gates) standing.delete(g.segment);
    if (standing.size === 0) continue;
    const outline = outlineOf(geo, fort);
    if (!outline) continue;
    const gates = roadGates(outline, fort.gates, axes, (i) => standing.has(i));
    if (gates !== fort.gates) fort.gates = [...gates];
  }
}

/** Kotva vsi – dvorec, bez něj střed obydlí (fortifications.md – Brány); bez obydlí střed mapy. */
export function villageAnchor(state: VillageState): RoadPoint {
  const manorId = villageManorId(state);
  const manor = manorId === null ? undefined : state.dwellings.find((d) => d.id === manorId);
  if (manor) return { x: manor.position.x, z: manor.position.z };
  if (state.dwellings.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const d of state.dwellings) {
    x += d.position.x;
    z += d.position.z;
  }
  return { x: x / state.dwellings.length, z: z / state.dwellings.length };
}

/**
 * Pořadí práce úseků (fortifications.md – Cena a stavba): od úseku brány nejblíž kotvě vsi po
 * směru hodin (při shodě brána s menším úsekem); bez brány od prvního úseku.
 */
export function fortWorkOrder(
  count: number,
  gates: readonly FortGate[],
  anchor: RoadPoint,
): number[] {
  let start = 0;
  let best = Infinity;
  for (const g of gates) {
    const dx = g.x - anchor.x;
    const dz = g.z - anchor.z;
    const d = dx * dx + dz * dz;
    if (d < best - EPSILON) {
      best = d;
      start = g.segment;
    }
  }
  return Array.from({ length: count }, (_, k) => (start + k) % count);
}

/** Plán stavby opevnění: práce úseků v pořadí, klády celé stavby (i necelé) a kámen úseků. */
export interface FortWorkPlan {
  segments: FortSegmentWork[];
  wood: number;
  /** Kámen úseků (m³) ve stejném pořadí jako `segments`; chybí = stavba bez kamene. */
  stoneM3?: readonly number[];
}

/**
 * Plán práce úseků `indices` (v pořadí) na hradbu či val `target` z hradby `from` (null = nové,
 * hradba na valu, přestavba – `fortificationCost`): práce bez kácení a lámání, dřevo a kámen.
 */
export function segmentPlan(
  shapes: readonly FortSegmentShape[],
  indices: readonly number[],
  target: FortKind,
  from: WallKind | null = null,
): FortWorkPlan {
  let wood = 0;
  const stoneM3: number[] = [];
  const segments = indices.map((index) => {
    const cost = fortificationCost(target, shapes[index]!.lengthM, from);
    wood += cost.logs;
    stoneM3.push(cost.stoneM3);
    return { index, cost: cost.laborManDays };
  });
  return { segments, wood, ...(stoneM3.some((m) => m > 0) ? { stoneM3 } : {}) };
}

/** Odkud vezme stavba opevnění kámen: z hromad, z lomu (s prací lámání), a kolik chybí (m³). */
export interface FortStonePlan {
  fromPile: number;
  quarried: number;
  /** Lámání a dovoz kamene z lomu (čd). */
  quarryManDays: number;
  missing: number;
}

/**
 * Kámen stavby opevnění (Hradby a obrana – Cena, Kámen): napřed z hromad vsi (`stoneOnHand`),
 * zbytek se láme na zakázku v nejbližším dostavěném lomu k `at` (`nearestQuarry`) za
 * `STONE.quarryManDaysPerM3` × `distanceFactor` vzdálenosti; bez lomu chybí (Martin 8. 11. 2026:
 * „Kámen z pole je na to nevhodný. Musíme zavést lom.“). Stav nemění.
 */
export function fortStonePlan(
  state: Pick<VillageState, 'stoneM3' | 'quarries'>,
  needM3: number,
  at: RoadPoint,
): FortStonePlan {
  const need = Math.max(0, needM3);
  const fromPile = Math.min(need, stoneOnHand(state));
  const rest = need - fromPile;
  if (rest <= EPSILON) return { fromPile, quarried: 0, quarryManDays: 0, missing: 0 };
  const quarry = nearestQuarry(state, at);
  if (!quarry) return { fromPile, quarried: 0, quarryManDays: 0, missing: rest };
  return {
    fromPile,
    quarried: rest,
    quarryManDays: rest * quarryManDaysPerM3(quarry.distanceM),
    missing: 0,
  };
}

/** Průměr bodů lomené čáry obvodu – odtud se hledají nejbližší stromy ke kácení. */
export function outlineCenter(outline: FortOutline): RoadPoint {
  const line = outline.polyline;
  let x = 0;
  let z = 0;
  for (const [px, pz] of line) {
    x += px;
    z += pz;
  }
  return { x: x / line.length, z: z / line.length };
}

export interface FortWorkInput {
  fortificationId: number;
  work: FortBuildWork;
  plan: FortWorkPlan;
  center: RoadPoint;
  clearedIds: readonly number[];
  clearedTrees: number;
}

/**
 * Založí stavbu na opevnění (mutuje `next` – klon): klády z hromady (i z pokácených stromů pásu),
 * zbytek vyhradí ke kácení mezi nejbližšími dospělými stromy (strom za `pileSaves.logManDays`
 * × vzdálenost – kácení je v ceně komplet); kámen z hromad, zbytek z lomu vsi (`fortStonePlan`) –
 * lámání se přičte k práci úseků podle jejich kamene. Vrátí důvod, když dřevo nebo kámen
 * nestačí (`FORT_NO_WOOD`, `FORT_NO_STONE`) – stav pak nemění; jinak null.
 */
export function pushWork(
  next: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  input: FortWorkInput,
  walk: Walk | undefined,
): string | null {
  const need = Math.ceil(input.plan.wood - EPSILON);
  const plan = planWoodFrom(
    Math.max(0, need),
    input.center,
    {
      logs: woodLogs(next),
      changes: () => obstacleChangesAt(next, day),
      claimed: () => claimedObstacles(next),
    },
    {
      obstacles,
      clearedIds: input.clearedIds,
      clearedTrees: input.clearedTrees,
      ...(walk ? { walk } : {}),
      fellManDaysPerTree: FORTIFICATIONS.pileSaves.logManDays,
    },
  );
  if (plan.missing > 0) return FORT_NO_WOOD;
  const stoneBy = input.plan.stoneM3 ?? [];
  const stoneNeed = stoneBy.reduce((sum, m) => sum + m, 0);
  const stone = fortStonePlan(next, stoneNeed, input.center);
  if (stone.missing > EPSILON) return FORT_NO_STONE(stone.missing);
  recordClearedObstacles(next, input.clearedIds, day);
  const wood = takeWood(next, plan, input.center);
  if (stone.fromPile > 0) takeStone(next, stone.fromPile, input.center);
  // lámání z lomu po úsecích podle jejich kamene – úsek je hotový i s kamenem, který chce
  const quarryPerM3 = stoneNeed > EPSILON ? stone.quarryManDays / stoneNeed : 0;
  const segments =
    quarryPerM3 > 0
      ? input.plan.segments.map((s, k) => ({
          ...s,
          cost: s.cost + (stoneBy[k] ?? 0) * quarryPerM3,
        }))
      : input.plan.segments;
  const labor = segments.reduce((sum, s) => sum + s.cost, 0);
  next.constructions.push({
    id: next.nextId++,
    kind: 'fortification',
    startedDay: day,
    cost: woodFellingCost(wood) + labor,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    ...(wood.trees > 0 ? { wood } : {}),
    fortificationId: input.fortificationId,
    fortWork: input.work,
    fortSegments: segments,
    ...(stone.fromPile > 0 ? { stoneFromPile: stone.fromPile } : {}),
  });
  return null;
}

/** Vstup stavby nového opevnění – body obvodu (návrh hry, upravený hráčem) a druh. */
export interface FortificationInput {
  points: readonly Point[];
  kind: FortKind;
}

/**
 * Hráč zahájí stavbu opevnění (fortifications.md – Obvod, Cena a stavba): roštová hradba až od
 * roku 790, komorová od 830 a palisáda s ochozem jen vylepšením (Hradby a obrana – Druhy), kontrola
 * umístění (`checkFortificationPlacement`), brány samy na průsečících s pevnými cestami (jinak
 * jedna u dvorce), překážky v pásu osadníci odstraní hned (dospělé stromy dají klády), val a široké
 * hradby vezmou kusy polí a sadů pod pásem. Klády a kámen předem (`pushWork`). Stavba po úsecích od
 * brány nejblíž dvorci. Vstupní stav nemění.
 */
export function startFortification(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: FortificationInput,
  walk?: Walk,
): FortificationResult {
  if (input.kind === 'walkway') return { ok: false, reason: FORT_WALKWAY_NEW };
  const year = wallYearReason(input.kind, day);
  if (year) return { ok: false, reason: year };
  const check = checkFortificationPlacement(
    landscape,
    placementVillageOf(state, day),
    obstacles,
    input.points,
    input.kind,
  );
  if (!check.ok || !check.outline) {
    return { ok: false, reason: check.reason ?? 'Sem opevnění nepatří.' };
  }
  const outline = check.outline;
  const shapes = fortSegments(outline);
  const anchor = villageAnchor(state);
  const gates = autoGates(outline, roadAxes(state), anchor);
  const next = cloneState(state);
  const id = next.nextId++;
  // val vezme kusy polí a sadů pod pásem (fields.md – Pole jako krajina)
  giveWayToBuilding(next, day, check.takenLand, 'fortification');
  const missing = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: id,
      work: 'build',
      plan: segmentPlan(shapes, fortWorkOrder(shapes.length, gates, anchor), input.kind),
      center: outlineCenter(outline),
      clearedIds: check.obstacleIds,
      clearedTrees: check.clearedTrees,
    },
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  (next.fortifications ??= []).push({
    id,
    points: outline.points.map((p): Point => [p[0], p[1]]),
    kind: input.kind,
    segments: shapes.map((s) => ({ index: s.index, builtDay: null, state: 1 })),
    gates,
  });
  return { ok: true, state: next };
}

/** Vstup vylepšení – plot na palisádu (`upgrade`), nebo plot či palisáda na val (`top`). */
export interface FortificationUpgradeInput {
  fortificationId: number;
  work: 'upgrade' | 'top';
  /** Nástavba na val (jen `top`). */
  top?: FortTop;
}

/**
 * Hráč vylepší opevnění (fortifications.md – Druhy): plot na palisádu – po úsecích, plot úseku
 * stojí, dokud jeho palisáda není hotová, nic nevrací; palisáda chce širší pás (kontrola umístění
 * znovu, překážky v něm se odstraní). Plot nebo palisáda na valu jen na hotový val za cenu
 * samotného. Na opevnění smí běžet jen jedna stavba. Vstupní stav nemění.
 */
export function startFortificationUpgrade(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: FortificationUpgradeInput,
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const anchor = villageAnchor(state);
  if (input.work === 'upgrade') {
    if (fort.kind !== 'fence') {
      return {
        ok: false,
        reason: fort.kind === 'palisade' ? FORT_ALREADY_PALISADE : FORT_NOT_FENCE,
      };
    }
    // širší pás palisády – kontrola bez sebe sama (vlastní pás plotu ji neblokuje)
    const village = placementVillageOf(state, day);
    const check = checkFortificationPlacement(
      landscape,
      { ...village, fortifications: villageFortifications(state).filter((f) => f.id !== fort.id) },
      obstacles,
      outlineOf(landscape, fort)?.points ?? [],
      'palisade',
    );
    if (!check.ok || !check.outline) {
      return { ok: false, reason: check.reason ?? 'Sem palisáda nepatří.' };
    }
    const shapes = fortSegments(check.outline);
    // zbořený díl zůstává mezerou (demolition.md – Opevnění)
    const todo = new Set(
      fort.segments
        .filter((s) => segmentWall(fort, s)?.kind !== 'palisade' && s.demolishedDay === undefined)
        .map((s) => s.index),
    );
    const order = fortWorkOrder(shapes.length, fort.gates, anchor).filter((i) => todo.has(i));
    if (segmentsBusy(state, fort, todo)) return { ok: false, reason: FORT_BUSY };
    const next = cloneState(state);
    const missing = pushWork(
      next,
      day,
      obstacles,
      {
        fortificationId: fort.id,
        work: 'upgrade',
        plan: segmentPlan(shapes, order, 'palisade', 'fence'),
        center: outlineCenter(check.outline),
        clearedIds: check.obstacleIds,
        clearedTrees: check.clearedTrees,
      },
      walk,
    );
    return missing ? { ok: false, reason: missing } : { ok: true, state: next };
  }
  // nástavba na valu (fortifications.md – Druhy): jen na hotový val, kdykoli později
  if (fort.kind !== 'rampart') return { ok: false, reason: FORT_NOT_RAMPART };
  if (
    segmentsBusy(
      state,
      fort,
      fort.segments.map((s) => s.index),
    )
  ) {
    return { ok: false, reason: FORT_BUSY };
  }
  if (fort.segments.some((s) => segmentRampart(fort, s)?.builtDay === null)) {
    return { ok: false, reason: FORT_RAMPART_UNFINISHED };
  }
  const top = input.top ?? fort.top ?? 'fence';
  // ochoz jen vylepšením palisády, roštová a komorová až od svého roku (Hradby a obrana – Druhy)
  if (top === 'walkway') return { ok: false, reason: FORT_WALKWAY_NEW };
  const year = wallYearReason(top, day);
  if (year) return { ok: false, reason: year };
  // srovnaný val nástavbu nedostane; díl se zbořenou nástavbou ji dostane znovu
  const todo = new Set(
    fort.segments
      .filter((s) => !layerBuilt(segmentWall(fort, s)) && s.demolishedDay === undefined)
      .map((s) => s.index),
  );
  // rozdělaná nástavba (zrušená stavba) se dostaví stejným druhem
  if (todo.size === 0 || (fort.top !== undefined && fort.top !== top)) {
    return { ok: false, reason: FORT_TOP_DONE };
  }
  const outline = outlineOf(landscape, fort);
  if (!outline) return { ok: false, reason: FORT_UNKNOWN };
  const shapes = fortSegments(outline);
  const order = fortWorkOrder(shapes.length, fort.gates, anchor).filter((i) => todo.has(i));
  const next = cloneState(state);
  const missing = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: fort.id,
      work: 'top',
      plan: segmentPlan(shapes, order, top),
      center: outlineCenter(outline),
      clearedIds: [],
      clearedTrees: 0,
    },
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  const target = villageFortifications(next).find((f) => f.id === fort.id)!;
  target.top = top;
  for (const s of target.segments) s.topBuiltDay ??= null;
  return { ok: true, state: next };
}

/**
 * Hráč přidá bránu kliknutím na obvod (fortifications.md – Brány): úsek nejblíž kliku, nejvýš
 * jedna brána na úsek; brána nic navíc nestojí. Vstupní stav nemění.
 */
export function addGateToFortification(
  state: VillageState,
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
  fortificationId: number,
  position: RoadPoint,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const outline = outlineOf(landscape, fort);
  if (!outline) return { ok: false, reason: FORT_UNKNOWN };
  const gates = addGate(outline, fort.gates, position);
  if ('error' in gates) {
    return { ok: false, reason: gates.error === 'off-outline' ? FORT_GATE_OFF : FORT_GATE_TAKEN };
  }
  const next = cloneState(state);
  villageFortifications(next).find((f) => f.id === fortificationId)!.gates = gates;
  return { ok: true, state: next };
}

/** Stojí na dílu valu hradba (dokončená a nezbořená)? */
function topStands(fort: Fortification, s: FortSegment): boolean {
  return segmentRampart(fort, s) !== null && layerBuilt(segmentWall(fort, s));
}

/** Vstup zboření – opevnění a díl, na který hráč klikl (úsek dohledá server). */
export interface SectionDemolitionInput {
  fortificationId: number;
  /** Díl (`FortSegment.index`) v úseku – úsek je z dílů vždy znovu spočítaný (`sectionOf`). */
  segment: number;
}

/** Co zboření úseku udělá: práce (čd) a klády zpět na hromadu. */
export interface SectionDemolition {
  /** `demolish` – plot, palisáda či nástavba valu; `level` – srovnání valu bez nástavby. */
  work: 'demolish' | 'level';
  laborManDays: number;
  logs: number;
}

/** Kus úseku ke zboření – celý díl, nebo část dílu s branou (`SectionPiece`). */
interface DemolitionPiece extends SectionPiece {
  seg: FortSegment;
}

/** Je kus dílu už zbořený (celý díl, nebo jeho část u brány)? */
function pieceGone(seg: FortSegment, part: 'before' | 'after' | undefined): boolean {
  if (seg.demolishedDay !== undefined) return true;
  if (part === 'before') return seg.demolishedBeforeGate !== undefined;
  if (part === 'after') return seg.demolishedAfterGate !== undefined;
  return false;
}

/** Plán zboření úseku – díly v pořadí práce s prací a kládami a místo hromady. */
interface DemolitionPlan extends SectionDemolition {
  segments: FortSegmentWork[];
  at: RoadPoint;
}

/**
 * Plán zboření úseku mezi branami, ve kterém leží díl `input.segment` (demolition.md – Opevnění,
 * Čísla): díly úseku po směru hodin bez dílu s branou (brány zůstávají na koncích úseků), jen
 * nezbořené a dostavěné. Plot a palisáda – díl zbořit; val s nástavbou – jen nástavbu (díly, kde
 * stojí); val bez nástavby – srovnat. Práce dílu `laborShare` × práce dílu podle délky (val
 * `rampartLaborShare`), klády `logShare` × klády dílu × stav dílu; celé dolů jednou za stavbu.
 */
function demolitionPlan(
  state: VillageState,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  input: SectionDemolitionInput,
): DemolitionPlan | { reason: string } {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { reason: FORT_UNKNOWN };
  const section = sectionOf(fort, input.segment);
  if (!section) return { reason: FORT_UNKNOWN };
  const outline = outlineOf(geo, fort);
  if (!outline) return { reason: FORT_UNKNOWN };
  const shapes = fortSegments(outline);
  const pieces = sectionPieces(
    shapes.map((x) => x.lengthM),
    fort.gates,
    section.gateSegment,
  );
  if (pieces.length === 0) return { reason: FORT_SECTION_GATE_ONLY };
  const parts: DemolitionPiece[] = [];
  for (const piece of pieces) {
    const seg = fort.segments.find((x) => x.index === piece.index);
    if (seg && segmentBuilt(seg) && !pieceGone(seg, piece.part)) parts.push({ seg, ...piece });
  }
  if (parts.length === 0) return { reason: FORT_SECTION_GONE };
  // jedna stavba na díl (Martin 8. 11. 2026 – „B“)
  if (
    segmentsBusy(
      state,
      fort,
      parts.map((p) => p.seg.index),
    )
  )
    return { reason: FORT_BUSY };
  const rampart = fort.kind === 'rampart';
  // nástavbu valu zbourá jen celý díl, kus dílu s branou se srovná až při srovnání valu
  const tops = rampart ? parts.filter((p) => p.part === undefined && topStands(fort, p.seg)) : [];
  const work: 'demolish' | 'level' = rampart && tops.length === 0 ? 'level' : 'demolish';
  const targets = rampart && work === 'demolish' ? tops : parts;
  let labor = 0;
  let logs = 0;
  const segments: FortSegmentWork[] = targets.map(({ seg, part, lengthM }) => {
    const at = part === undefined ? {} : { part };
    // zboření stojí podíl práce stavby komplet (demolition.md – Čísla; Hradby a obrana – Cena)
    if (work === 'level') {
      const cost = fortificationFullCost('rampart', lengthM).laborManDays;
      labor += DEMOLITION.rampartLaborShare * cost;
      return { index: seg.index, ...at, cost: DEMOLITION.rampartLaborShare * cost };
    }
    const top = rampart ? (segmentWall(fort, seg)?.kind ?? null) : null;
    const cost = fortificationFullCost(top ?? segmentKind(fort, seg), lengthM);
    const segLogs = DEMOLITION.logShare * cost.logs * seg.state;
    labor += DEMOLITION.laborShare * cost.laborManDays;
    logs += segLogs;
    return {
      index: seg.index,
      ...at,
      cost: DEMOLITION.laborShare * cost.laborManDays,
      logs: segLogs,
    };
  });
  const middle = shapes[targets[Math.floor(targets.length / 2)]!.seg.index];
  const at = middle ? { x: middle.mid[0], z: middle.mid[1] } : villageAnchor(state);
  return { work, laborManDays: labor, logs: Math.floor(logs + EPSILON), segments, at };
}

/**
 * Co by zboření úseku s dílem `input.segment` stálo a vrátilo (popisek tlačítka Zbořit), nebo
 * důvod, proč nejde (`FORT_BUSY`, `FORT_SECTION_GONE`, `FORT_SECTION_GATE_ONLY`).
 */
export function sectionDemolition(
  state: VillageState,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  input: SectionDemolitionInput,
): SectionDemolition | { reason: string } {
  const plan = demolitionPlan(state, geo, input);
  if ('reason' in plan) return plan;
  return { work: plan.work, laborManDays: plan.laborManDays, logs: plan.logs };
}

/**
 * Hráč zboří úsek opevnění mezi branami (demolition.md – Opevnění): stavba opevnění `demolish`
 * nebo `level` ze společné práce vsi jako každá stavba, bez ceny předem. Stavba drží indexy dílů –
 * brána přidaná během zboření úsek rozdělí, práce ale pokračuje po dílech, které měla. Na
 * opevnění smí běžet jen jedna stavba. Vstupní stav nemění.
 */
export function startSectionDemolition(
  state: VillageState,
  day: number,
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  input: SectionDemolitionInput,
): FortificationResult {
  const plan = demolitionPlan(state, geo, input);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  const next = cloneState(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'fortification',
    startedDay: day,
    cost: plan.laborManDays,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    fortificationId: input.fortificationId,
    fortWork: plan.work,
    fortSegments: plan.segments,
    ...(plan.work === 'demolish' ? { fortLogsAt: plan.at } : {}),
  });
  return { ok: true, state: next };
}

/**
 * Zboří díl (mutuje stav): na valu se zbořením jen nástavba (`top: 'none'`) – val stojí dál
 * s plným stavem; jinak díl je mezera (`demolishedDay`, stav 0) – plot a palisáda zbořené, val
 * srovnaný. Průlom dílu zboření pohltí.
 */
function demolishSegment(
  fort: Fortification,
  s: FortSegment,
  day: number,
  part?: 'before' | 'after',
): void {
  if (part !== undefined) {
    // kus dílu u brány je mezera, brána i zbytek dílu stojí dál (průlom dílu zůstává)
    if (part === 'before') s.demolishedBeforeGate ??= day;
    else s.demolishedAfterGate ??= day;
    return;
  }
  delete s.breachedDay;
  if (topStands(fort, s)) {
    s.top = 'none';
    delete s.topBuiltDay;
    s.state = 1;
    return;
  }
  s.demolishedDay = day;
  s.state = 0;
  delete s.top;
  delete s.topBuiltDay;
}

/**
 * Konec zboření – dokončeného i zrušeného (mutuje stav; vrací klády): klády zbořených dílů
 * stavby (necelé, `FortSegmentWork.logs`) dolů na celé na hromadu u cesty nejblíž úseku. Val, na
 * kterém už žádná nástavba nestojí, je val bez nástavby; opevnění, kde nestojí žádný díl, zmizí.
 */
function settleDemolition(state: VillageState, fort: Fortification, c: Construction): number {
  let sum = 0;
  for (const w of c.fortSegments ?? []) {
    const s = fort.segments.find((x) => x.index === w.index);
    if (s && w.logs !== undefined && segmentDone(fort, s, c, w.part)) sum += w.logs;
  }
  const logs = Math.floor(sum + EPSILON);
  addLogs(state, logs, c.fortLogsAt ?? null);
  if (fort.top !== undefined && !fort.segments.some((s) => topStands(fort, s))) {
    delete fort.top;
    for (const s of fort.segments) {
      delete s.top;
      delete s.topBuiltDay;
    }
  }
  // opevnění bez stojícího dílu zmizí – jen když na něm neběží jiná stavba (vylepšení mezery)
  const other = state.constructions.some(
    (x) => x.id !== c.id && x.kind === 'fortification' && x.fortificationId === fort.id,
  );
  if (!other && !fort.segments.some((s) => segmentBuilt(s) && s.demolishedDay === undefined)) {
    state.fortifications = villageFortifications(state).filter((f) => f.id !== fort.id);
  }
  return logs;
}

/** Vylepšení s cílovou hradbou (`startSectionUpgrade`), ne starší vylepšení celého opevnění. */
function sectionUpgrade(
  c: Pick<Construction, 'fortWork' | 'fortTarget'>,
): c is Pick<Construction, 'fortWork'> & { fortTarget: WallKind } {
  return (c.fortWork === 'upgrade' || c.fortWork === 'top') && c.fortTarget !== undefined;
}

/** Úsek je hotový pro práci `work` (stavba, vylepšení, nástavba, zboření). */
function segmentDone(
  fort: Fortification,
  s: FortSegment,
  c: Pick<Construction, 'fortWork' | 'startedDay' | 'fortTarget'>,
  part?: 'before' | 'after',
): boolean {
  // vylepšení úseku s cílovou hradbou (Hradby a obrana – Druhy a postup vylepšení)
  if (sectionUpgrade(c)) return upgradeDone(fort, s, c.fortTarget, part);
  if (c.fortWork === 'level') return pieceGone(s, part);
  if (c.fortWork === 'demolish') {
    if (part !== undefined) return pieceGone(s, part);
    return segmentRampart(fort, s) !== null ? !topStands(fort, s) : s.demolishedDay !== undefined;
  }
  if (c.fortWork === 'upgrade') return segmentWall(fort, s)?.kind === 'palisade';
  if (c.fortWork === 'top') return layerBuilt(segmentWall(fort, s));
  // přestavba: val nebo hradba dílu dostavěné po založení stavby
  if (c.fortWork === 'rebuild') {
    const after = (layer: { builtDay: number | null } | null): boolean =>
      layer !== null && layer.builtDay !== null && layer.builtDay > c.startedDay;
    return after(segmentRampart(fort, s)) || after(segmentWall(fort, s));
  }
  // stavba: základ úseku – val, bez valu hradba
  return layerBuilt(segmentRampart(fort, s) ?? segmentWall(fort, s));
}

/**
 * Úseky, na které došla práce stavby opevnění (mutuje stav): práce napřed pokácí vyhrazené
 * stromy (`fellAsWorked`), pak úseky v pořadí `fortSegments` – úsek je hotový v den, kdy práce
 * stavby přejde jeho konec. Hotový úsek: stavba a vylepšení – den dokončení a plný stav (palisáda
 * nahradí plot úseku), nástavba – den nástavby, zboření – díl zbořený (`demolishSegment`).
 * Nezávisí na tom, po kolika dnech se ves dopočítá.
 */
export function workFortification(state: VillageState, c: Construction, day: number): void {
  const fort = villageFortifications(state).find((f) => f.id === c.fortificationId);
  if (!fort || !c.fortSegments) return;
  let reached = woodFellingCost(c.wood);
  for (const w of c.fortSegments) {
    reached += w.cost;
    if (c.done + EPSILON < reached) return;
    // obnova valu nemá úseky k dokončení – výška se vrátí s koncem stavby (`finishFortification`)
    if (c.fortWork === 'restore') continue;
    const s = fort.segments.find((x) => x.index === w.index);
    if (!s || segmentDone(fort, s, c, w.part)) continue;
    if (c.fortWork === 'demolish' || c.fortWork === 'level') {
      demolishSegment(fort, s, day, w.part);
      continue;
    }
    if (sectionUpgrade(c)) {
      completeUpgrade(fort, s, c.fortTarget, day, w.part);
      continue;
    }
    if (c.fortWork === 'top') {
      s.topBuiltDay = day;
      // díl se zbořenou nástavbou dostane nástavbu opevnění
      delete s.top;
      continue;
    }
    if (
      c.fortWork === 'rebuild' &&
      segmentRampart(fort, s) !== null &&
      s.breachedDay === undefined
    ) {
      // přestavba shnilé nástavby valu – val sám stojí dál
      s.topBuiltDay = day;
      s.state = 1;
      delete s.extraAgeDays;
      continue;
    }
    s.builtDay = day;
    s.state = 1;
    delete s.extraAgeDays;
    delete s.breachedDay;
    if (c.fortWork === 'upgrade') s.kind = 'palisade';
  }
}

/**
 * Dostavěné opevnění (krok 4 – `finishConstructions`): všechny úseky hotové; vylepšení plotu,
 * které došlo na všechny nezbořené úseky, změní druh opevnění na palisádu. Dokončené zboření dá
 * klády na hromadu a vrátí událost kroniky (`fortification-demolished`), jinak null.
 */
export function finishFortification(
  state: VillageState,
  c: Construction,
  day: number,
): ChronicleEvent | null {
  workFortification(state, c, day);
  const fort = villageFortifications(state).find((f) => f.id === c.fortificationId);
  if (!fort) return null;
  if (c.fortWork === 'demolish' || c.fortWork === 'level') {
    const logs = settleDemolition(state, fort, c);
    return {
      day,
      kind: 'fortification-demolished',
      logs,
      ...(c.fortWork === 'level' ? { level: true as const } : {}),
    };
  }
  if (c.fortWork === 'restore') {
    delete fort.rampartHeight;
    return null;
  }
  // plot, který je celý palisádou, je palisáda – i po vylepšení úseků (`settleUpgrade`)
  if (c.fortWork === 'upgrade' || sectionUpgrade(c)) settleUpgrade(fort);
  return null;
}

/**
 * Zrušená stavba opevnění (mutuje klon – fortifications.md, Cena a stavba): hotové úseky zůstanou
 * stát, nehotové zmizí a obvod je otevřený. Nové opevnění bez hotového úseku zmizí celé,
 * nástavba bez hotového úseku zruší i druh nástavby. Zrušené zboření: zbořené díly zůstanou
 * zbořené, ostatní stojí dál.
 */
export function dropFortificationWork(next: VillageState, c: Construction): void {
  const forts = villageFortifications(next);
  const fort = forts.find((f) => f.id === c.fortificationId);
  if (!fort) return;
  if (c.fortWork === 'demolish' || c.fortWork === 'level') {
    // zbořené díly zůstanou zbořené a jejich klády přijdou na hromadu (návrh Clauda)
    settleDemolition(next, fort, c);
    return;
  }
  // vylepšení úseku: hotové díly mají cílovou hradbu, ostatní starou – nic se nevrací
  if (sectionUpgrade(c)) return;
  if (c.fortWork === 'build' && fort.segments.every((s) => !segmentBuilt(s))) {
    next.fortifications = forts.filter((f) => f.id !== fort.id);
    return;
  }
  if (c.fortWork === 'top' && fort.segments.every((s) => !layerBuilt(segmentWall(fort, s)))) {
    delete fort.top;
    for (const s of fort.segments) delete s.topBuiltDay;
  }
}
