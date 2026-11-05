import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import {
  addGate,
  autoGates,
  fortificationArea,
  fortificationCost,
  fortificationOutline,
  fortSegments,
  roadGates,
  type FortGate,
  type FortOutline,
  type FortSegmentShape,
  type FortWork,
} from './fortification';
import { giveWayToBuilding } from './land-taken';
import { villageManorId } from './manor';
import { obstacleChangesAt, recordClearedObstacles } from './obstacles';
import type { Walk } from './paths/walking';
import { checkFortificationPlacement } from './placement-fortifications';
import { placementVillageOf } from './placement-village';
import type {
  Construction,
  FortBuildWork,
  FortKind,
  FortSegment,
  FortSegmentWork,
  FortTop,
  Fortification,
  RoadPoint,
  SquareGrid,
  TileCell,
  VillageState,
} from './types';
import { claimedObstacles, planWoodFrom, takeWood, woodFellingCost, woodLogs } from './wood';

// Stavba opevnění po úsecích (fortifications.md – Cena a stavba): cena předem jen dřevo – klády
// na hromadě a dospělé stromy k mání musí pokrýt klády celé stavby („Hráč staví kdy chce“), práce
// se nečeká, jen trvá. Stavba bere ze společné práce rovným dílem s ostatními stavbami
// (`build` v simulate-build.ts); práce jde napřed do kácení vyhrazených stromů, pak do úseků
// jeden po druhém od brány nejblíž dvorci po směru hodin. Hotový úsek stojí hned.

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

/** Druh, který na úseku stojí (rozdělané vylepšení – úsek s hotovou palisádou). */
export function segmentKind(fort: Fortification, segment: FortSegment): FortKind {
  return segment.kind ?? fort.kind;
}

/** Obvod opevnění druhu `kind` (bez údaje druh opevnění) – tvar z uložené plochy. */
export function outlineOf(
  geo: Pick<Landscape, 'size' | 'cellSizeM'>,
  fort: Fortification,
  kind: FortKind = fort.kind,
): FortOutline | null {
  const area = fortificationArea(fort.cells, fort.grid, geo);
  return 'error' in area ? null : fortificationOutline(area, kind);
}

/** Stavba, která na opevnění právě pracuje (nejvýš jedna). */
function runningWork(state: VillageState, id: number): Construction | undefined {
  return state.constructions.find((c) => c.kind === 'fortification' && c.fortificationId === id);
}

/** Pevné cesty vsi (i vozové a úseky zemské stezky) – osy pro brány, které vzniknou samy. */
function roadAxes(state: VillageState): RoadPoint[][] {
  return (state.roads?.roads ?? []).map((r) => r.points);
}

/**
 * Brány pro cesty přes stojící opevnění (fortifications.md – Brány: cesta postavená přes hotové
 * opevnění dostane bránu taky – návrh Clauda; mutuje stav): každý den před přepočtem tras – nová
 * pevná cesta z vyšlapanosti, hotový úsek vozové cesty a zemské stezky i úsek opevnění dostavěný
 * přes starou cestu tak bránu dostanou dřív, než je síť pěšin a vozů uzavře (`roadGates`). Stojící
 * úsek = hotový a neprolomený. Ves bez opevnění nebo bez cest beze změny.
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
      fort.segments
        .filter((s) => s.builtDay !== null && s.breachedDay === undefined)
        .map((s) => s.index),
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
function villageAnchor(state: VillageState): RoadPoint {
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

/** Plán práce úseků `indices` (v pořadí) a dřevo celé stavby (klády, i necelé). */
function segmentPlan(
  shapes: readonly FortSegmentShape[],
  indices: readonly number[],
  kind: FortKind,
  work: FortWork,
): { segments: FortSegmentWork[]; wood: number } {
  let wood = 0;
  const segments = indices.map((index) => {
    const cost = fortificationCost(kind, shapes[index]!.lengthM, work);
    wood += cost.upfront.wood ?? 0;
    return { index, cost: cost.laborManDays };
  });
  return { segments, wood };
}

/** Těžiště čtverců plochy – odtud se hledají nejbližší stromy ke kácení. */
function outlineCenter(outline: FortOutline): RoadPoint {
  const squares = outline.area.squares;
  let x = 0;
  let z = 0;
  for (const q of squares) {
    x += q.x;
    z += q.z;
  }
  return { x: x / squares.length, z: z / squares.length };
}

interface FortWorkInput {
  fortificationId: number;
  work: FortBuildWork;
  plan: { segments: FortSegmentWork[]; wood: number };
  center: RoadPoint;
  clearedIds: readonly number[];
  clearedTrees: number;
}

/**
 * Založí stavbu na opevnění (mutuje `next` – klon): klády z hromady (i z pokácených stromů pásu),
 * zbytek vyhradí ke kácení mezi nejbližšími dospělými stromy. False, když dřevo nestačí.
 */
function pushWork(
  next: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  input: FortWorkInput,
  walk: Walk | undefined,
): boolean {
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
    },
  );
  if (plan.missing > 0) return false;
  recordClearedObstacles(next, input.clearedIds, day);
  const wood = takeWood(next, plan, input.center);
  const labor = input.plan.segments.reduce((sum, s) => sum + s.cost, 0);
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
    fortSegments: input.plan.segments,
  });
  return true;
}

/** Vstup stavby nového opevnění – nakreslené čtverce, mřížka (null = krajina) a druh. */
export interface FortificationInput {
  cells: readonly TileCell[];
  grid: SquareGrid | null;
  kind: FortKind;
}

/**
 * Hráč zahájí stavbu opevnění (fortifications.md – Obvod, Cena a stavba): kontrola umístění
 * (`checkFortificationPlacement`), brány samy na průsečících s pevnými cestami (jinak jedna
 * u dvorce), překážky v pásu osadníci odstraní hned (dospělé stromy dají klády), val vezme kusy
 * polí a sadů pod pásem. Stavba po úsecích od brány nejblíž dvorci. Vstupní stav nemění.
 */
export function startFortification(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: FortificationInput,
  walk?: Walk,
): FortificationResult {
  const check = checkFortificationPlacement(
    landscape,
    placementVillageOf(state, day),
    obstacles,
    input.cells,
    input.grid,
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
  const ok = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: id,
      work: 'build',
      plan: segmentPlan(shapes, fortWorkOrder(shapes.length, gates, anchor), input.kind, 'new'),
      center: outlineCenter(outline),
      clearedIds: check.obstacleIds,
      clearedTrees: check.clearedTrees,
    },
    walk,
  );
  if (!ok) return { ok: false, reason: FORT_NO_WOOD };
  (next.fortifications ??= []).push({
    id,
    grid: outline.area.grid ? { ...outline.area.grid } : null,
    cells: outline.area.cells.map((c) => ({ x: c.x, y: c.y })),
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
  const busy = runningWork(state, fort.id) !== undefined;
  if (input.work === 'upgrade') {
    if (fort.kind !== 'fence') {
      return {
        ok: false,
        reason: fort.kind === 'palisade' ? FORT_ALREADY_PALISADE : FORT_NOT_FENCE,
      };
    }
    if (busy) return { ok: false, reason: FORT_BUSY };
    // širší pás palisády – kontrola bez sebe sama (vlastní pás plotu ji neblokuje)
    const village = placementVillageOf(state, day);
    const check = checkFortificationPlacement(
      landscape,
      { ...village, fortifications: villageFortifications(state).filter((f) => f.id !== fort.id) },
      obstacles,
      fort.cells,
      fort.grid,
      'palisade',
    );
    if (!check.ok || !check.outline) {
      return { ok: false, reason: check.reason ?? 'Sem palisáda nepatří.' };
    }
    const shapes = fortSegments(check.outline);
    const todo = new Set(
      fort.segments.filter((s) => segmentKind(fort, s) !== 'palisade').map((s) => s.index),
    );
    const order = fortWorkOrder(shapes.length, fort.gates, anchor).filter((i) => todo.has(i));
    const next = cloneState(state);
    const ok = pushWork(
      next,
      day,
      obstacles,
      {
        fortificationId: fort.id,
        work: 'upgrade',
        plan: segmentPlan(shapes, order, 'palisade', 'upgrade'),
        center: outlineCenter(check.outline),
        clearedIds: check.obstacleIds,
        clearedTrees: check.clearedTrees,
      },
      walk,
    );
    return ok ? { ok: true, state: next } : { ok: false, reason: FORT_NO_WOOD };
  }
  // nástavba na valu (fortifications.md – Druhy): jen na hotový val, kdykoli později
  if (fort.kind !== 'rampart') return { ok: false, reason: FORT_NOT_RAMPART };
  if (busy) return { ok: false, reason: FORT_BUSY };
  if (fort.segments.some((s) => s.builtDay === null)) {
    return { ok: false, reason: FORT_RAMPART_UNFINISHED };
  }
  const top = input.top ?? fort.top ?? 'fence';
  const todo = new Set(
    fort.segments
      .filter((s) => s.topBuiltDay === undefined || s.topBuiltDay === null)
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
  const ok = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: fort.id,
      work: 'top',
      plan: segmentPlan(shapes, order, top, 'top'),
      center: outlineCenter(outline),
      clearedIds: [],
      clearedTrees: 0,
    },
    walk,
  );
  if (!ok) return { ok: false, reason: FORT_NO_WOOD };
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

/** Úsek je hotový pro práci `work` (stavba, vylepšení, nástavba). */
function segmentDone(
  fort: Fortification,
  s: FortSegment,
  work: FortBuildWork | undefined,
): boolean {
  if (work === 'upgrade') return segmentKind(fort, s) === 'palisade';
  if (work === 'top') return s.topBuiltDay !== undefined && s.topBuiltDay !== null;
  return s.builtDay !== null;
}

/**
 * Úseky, na které došla práce stavby opevnění (mutuje stav): práce napřed pokácí vyhrazené
 * stromy (`fellAsWorked`), pak úseky v pořadí `fortSegments` – úsek je hotový v den, kdy práce
 * stavby přejde jeho konec. Hotový úsek: stavba a vylepšení – den dokončení a plný stav (palisáda
 * nahradí plot úseku), nástavba – den nástavby. Nezávisí na tom, po kolika dnech se ves dopočítá.
 */
export function workFortification(state: VillageState, c: Construction, day: number): void {
  const fort = villageFortifications(state).find((f) => f.id === c.fortificationId);
  if (!fort || !c.fortSegments) return;
  let reached = woodFellingCost(c.wood);
  for (const w of c.fortSegments) {
    reached += w.cost;
    if (c.done + EPSILON < reached) return;
    const s = fort.segments.find((x) => x.index === w.index);
    if (!s || segmentDone(fort, s, c.fortWork)) continue;
    if (c.fortWork === 'top') {
      s.topBuiltDay = day;
      continue;
    }
    s.builtDay = day;
    s.state = 1;
    if (c.fortWork === 'upgrade') s.kind = 'palisade';
  }
}

/**
 * Dostavěné opevnění (krok 4 – `finishConstructions`): všechny úseky hotové; vylepšení plotu,
 * které došlo na všechny úseky, změní druh opevnění na palisádu.
 */
export function finishFortification(state: VillageState, c: Construction, day: number): void {
  workFortification(state, c, day);
  const fort = villageFortifications(state).find((f) => f.id === c.fortificationId);
  if (!fort || c.fortWork !== 'upgrade') return;
  if (fort.segments.every((s) => segmentKind(fort, s) === 'palisade')) {
    fort.kind = 'palisade';
    for (const s of fort.segments) delete s.kind;
  }
}

/**
 * Zrušená stavba opevnění (mutuje klon – fortifications.md, Cena a stavba): hotové úseky zůstanou
 * stát, nehotové zmizí a obvod je otevřený. Nové opevnění bez hotového úseku zmizí celé,
 * nástavba bez hotového úseku zruší i druh nástavby.
 */
export function dropFortificationWork(next: VillageState, c: Construction): void {
  const forts = villageFortifications(next);
  const fort = forts.find((f) => f.id === c.fortificationId);
  if (!fort) return;
  if (c.fortWork === 'build' && fort.segments.every((s) => s.builtDay === null)) {
    next.fortifications = forts.filter((f) => f.id !== fort.id);
    return;
  }
  if (
    c.fortWork === 'top' &&
    fort.segments.every((s) => s.topBuiltDay === undefined || s.topBuiltDay === null)
  ) {
    delete fort.top;
    for (const s of fort.segments) delete s.topBuiltDay;
  }
}
