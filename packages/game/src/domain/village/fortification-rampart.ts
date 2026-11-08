import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import {
  busySegments,
  fortificationCost,
  fortSegments,
  layerBuilt,
  moatSegments,
  sectionOf,
  segmentRampart,
  segmentWall,
  startRampartOn,
  type FortSection,
} from './fortification';
import {
  FORT_BUSY,
  FORT_UNKNOWN,
  fortWorkOrder,
  outlineCenter,
  outlineOf,
  pushWork,
  villageAnchor,
  villageFortifications,
  type FortificationResult,
} from './fortifications';
import { giveWayToBuilding } from './land-taken';
import type { Walk } from './paths/walking';
import { checkFortificationPlacement, type FortBandSpan } from './placement-fortifications';
import { placementVillageOf } from './placement-village';
import { FORTIFICATIONS } from './rules-fortifications';
import type { FortSegment, FortSegmentWork, Fortification, VillageState } from './types';

// Val pod stojící hradbou a vodní příkop (fortifications.md – Hradby a obrana, Druhy; Martin
// 8. 11. 2026: „Polský plot, palisádu a obě hradby sice mohu postavit samostatně, ale pak bych měl
// mít možnost doplnit to o val s příkopem.“ a „Další možnost bude napojení příkopu na vodní zdroj.
// Pak nelze příkopem projít, pokud se nezasype.“). Doplněný val leží vně hradby (`rampartOutside`)
// – křivka obvodu ani díly se nemění, hradba stojí a brání dál. Vodní příkop – `fortification/moat.ts`.

/** Důvody odmítnutí česky (u kurzoru a v odpovědi akce). */
export const FORT_RAMPART_DONE = 'Úsek už val má.';
export const FORT_RAMPART_NO_WALL = 'Val se doplňuje jen pod stojící hradbu.';
export const FORT_MOAT_NO_RAMPART = 'Napustit jde jen příkop hotového valu.';
export const FORT_MOAT_NO_WATER = 'Příkop nedosáhne k vodě.';
export const FORT_MOAT_DONE = 'Příkop už je napuštěný.';

/** Vstup doplnění valu – díl v úseku (úsek dohledá server), nebo null = celé opevnění. */
export interface RampartAdditionInput {
  fortificationId: number;
  segment: number | null;
}

/** Vstup napuštění příkopu – díl v úseku (úsek dohledá server). */
export interface MoatFillInput {
  fortificationId: number;
  segment: number;
}

/**
 * Smí díl dostat val vně: nemá val (ani rozestavěný), stojí na něm dostavěná hradba a není
 * prolomený ani zbořený (ani část dílu s branou).
 */
function canAddRampart(fort: Fortification, seg: FortSegment): boolean {
  return (
    segmentRampart(fort, seg) === null &&
    layerBuilt(segmentWall(fort, seg)) &&
    seg.breachedDay === undefined &&
    seg.demolishedDay === undefined &&
    seg.demolishedBeforeGate === undefined &&
    seg.demolishedAfterGate === undefined
  );
}

/**
 * Díly, které doplnění valu úseku `section` (null – celé opevnění) dostane: díly úseku bez dílů
 * s branou, které val smějí dostat (`canAddRampart`); díl s branou na kraji úseku, až bude val po
 * obou stranách brány – jako vylepšení po úsecích (fortification-upgrade.ts).
 */
function rampartIndices(fort: Fortification, section: FortSection | null): number[] {
  const n = fort.segments.length;
  const gateSegs = new Set(fort.gates.map((g) => g.segment));
  const segOf = (i: number): FortSegment | undefined => fort.segments.find((s) => s.index === i);
  const inner = new Set(
    section
      ? section.segments.filter((i) => !gateSegs.has(i) || gateSegs.size === 0)
      : fort.segments.map((s) => s.index),
  );
  const can = (i: number): boolean => {
    const seg = segOf(i);
    return seg !== undefined && canAddRampart(fort, seg);
  };
  // díl bude mít val – už ho má, nebo ho doplnění úseku přidá
  const willHave = (i: number): boolean => {
    const seg = segOf(i);
    if (!seg) return false;
    return segmentRampart(fort, seg) !== null || (inner.has(i) && can(i));
  };
  const indices = [...inner].filter(can);
  if (section) {
    const last = section.segments[section.segments.length - 1]!;
    for (const g of new Set([section.segments[0]!, (last + 1) % n])) {
      if (!gateSegs.has(g) || inner.has(g) || !can(g)) continue;
      if (willHave((g - 1 + n) % n) && willHave((g + 1) % n)) indices.push(g);
    }
  }
  return indices;
}

/** Pás dílu s valem vně hradby: 7 m ven, dovnitř šířka hradby, nejméně 3 m. */
function outsideSpan(fort: Fortification, seg: FortSegment): FortBandSpan {
  const wall = segmentWall(fort, seg);
  const out = FORTIFICATIONS.rampartOutside;
  return {
    outM: out.outM,
    inM: Math.max(wall ? FORTIFICATIONS.bandM[wall.kind] : 0, out.minInM),
  };
}

/**
 * Hráč doplní val s příkopem pod stojící hradbu úseku s dílem `input.segment` (null – celé
 * opevnění; fortifications.md – Hradby a obrana, Druhy): díly s dostavěnou hradbou bez valu
 * dostanou val vně – pás 7 m ven a dovnitř šířkou hradby (nejméně 3 m) musí splnit Kudy pás smí
 * (`checkFortificationPlacement` jen na těch dílech, ohyb valu), val vezme díly polí a sadů pod
 * pásem a překážky osadníci odstraní. Cena valu (150 čd na 100 m), bez klád. Díly se přepíšou
 * hned (`startRampartOn`) – hradba stojí a brání, staveniště valu blokuje celým pásem. Díly nesmí
 * mít jinou běžící stavbu (`FORT_BUSY`). Vstupní stav nemění.
 */
export function startRampartAddition(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: RampartAdditionInput,
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const outline = outlineOf(landscape, fort);
  if (!outline) return { ok: false, reason: FORT_UNKNOWN };
  const section = input.segment === null ? null : sectionOf(fort, input.segment);
  if (input.segment !== null && !section) return { ok: false, reason: FORT_UNKNOWN };
  const indices = rampartIndices(fort, section);
  if (indices.length === 0) {
    const scope = section ? section.segments : fort.segments.map((s) => s.index);
    const has = scope.some((i) => {
      const seg = fort.segments.find((s) => s.index === i);
      return seg !== undefined && segmentRampart(fort, seg) !== null;
    });
    return { ok: false, reason: has ? FORT_RAMPART_DONE : FORT_RAMPART_NO_WALL };
  }
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (indices.some((i) => busy.has(i))) return { ok: false, reason: FORT_BUSY };
  const only = new Map<number, FortBandSpan>();
  for (const i of indices)
    only.set(
      i,
      outsideSpan(
        fort,
        fort.segments.find((s) => s.index === i)!,
      ),
    );
  const village = placementVillageOf(state, day);
  const check = checkFortificationPlacement(
    landscape,
    { ...village, fortifications: villageFortifications(state).filter((f) => f.id !== fort.id) },
    obstacles,
    outline.points,
    'rampart',
    only,
  );
  if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem val nepatří.' };
  const shapes = fortSegments(outline);
  const rank = new Map(
    fortWorkOrder(shapes.length, fort.gates, villageAnchor(state)).map((index, k) => [index, k]),
  );
  const ordered = [...indices].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  const segments: FortSegmentWork[] = ordered.map((index) => ({
    index,
    cost: fortificationCost('rampart', shapes[index]?.lengthM ?? 0).laborManDays,
  }));
  const next = cloneState(state);
  giveWayToBuilding(next, day, check.takenLand, 'fortification');
  const nextFort = villageFortifications(next).find((f) => f.id === fort.id)!;
  for (const index of ordered)
    startRampartOn(
      nextFort,
      nextFort.segments.find((s) => s.index === index)!,
    );
  const missing = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: fort.id,
      work: 'rampart',
      plan: { segments, wood: 0 },
      center: outlineCenter(outline),
      clearedIds: check.obstacleIds,
      clearedTrees: check.clearedTrees,
    },
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  return { ok: true, state: next };
}

/**
 * Hráč napustí příkop úseku s dílem `input.segment` (fortifications.md – Hradby a obrana, Druhy,
 * Cena): voda do 30 m od osy příkopu se rozlije do souvislých dílů úseku s dnem pod hladinou
 * (`moatSegments`); strouha ¼ čd na 1 m napouštěných dílů. Jen u hotového valu; díly nesmí mít
 * jinou běžící stavbu. Voda přijde do všech dílů naráz s koncem stavby (`moatDay` – návrh Clauda:
 * strouha napustí příkop, až je hotová). Vstupní stav nemění.
 */
export function startMoatFill(
  state: VillageState,
  day: number,
  landscape: Landscape,
  input: MoatFillInput,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  const outline = outlineOf(landscape, fort);
  const section = sectionOf(fort, input.segment);
  if (!outline || !section) return { ok: false, reason: FORT_UNKNOWN };
  const ditch = section.segments.some((i) => {
    const seg = fort.segments.find((s) => s.index === i);
    return (
      seg !== undefined && seg.demolishedDay === undefined && layerBuilt(segmentRampart(fort, seg))
    );
  });
  if (!ditch) return { ok: false, reason: FORT_MOAT_NO_RAMPART };
  const wet = moatSegments(landscape, fort, input.segment);
  if (wet.length === 0) return { ok: false, reason: FORT_MOAT_NO_WATER };
  const todo = wet.filter((i) => fort.segments.find((s) => s.index === i)?.moatDay === undefined);
  if (todo.length === 0) return { ok: false, reason: FORT_MOAT_DONE };
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (todo.some((i) => busy.has(i))) return { ok: false, reason: FORT_BUSY };
  const shapes = fortSegments(outline);
  const segments: FortSegmentWork[] = todo.map((index) => ({
    index,
    cost: FORTIFICATIONS.moat.manDaysPerM * (shapes[index]?.lengthM ?? 0),
  }));
  const next = cloneState(state);
  const missing = pushWork(
    next,
    day,
    null,
    {
      fortificationId: fort.id,
      work: 'moat',
      plan: { segments, wood: 0 },
      center: outlineCenter(outline),
      clearedIds: [],
      clearedTrees: 0,
    },
    undefined,
  );
  if (missing) return { ok: false, reason: missing };
  return { ok: true, state: next };
}
