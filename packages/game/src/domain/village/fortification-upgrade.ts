import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import {
  busySegments,
  fortificationCost,
  fortSegments,
  FORT_WALKWAY_NEW,
  needsUpgrade,
  sectionOf,
  sectionPieces,
  segmentBand,
  segmentRampart,
  segmentWall,
  upgradeBase,
  upgradeOnRampart,
  wallYearReason,
  WALL_ORDER,
  type FortCost,
  type UpgradeBase,
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
  type FortWorkPlan,
} from './fortifications';
import { giveWayToBuilding } from './land-taken';
import type { Walk } from './paths/walking';
import { checkFortificationPlacement } from './placement-fortifications';
import { placementVillageOf } from './placement-village';
import { FORTIFICATIONS } from './rules-fortifications';
import type { FortSegment, FortSegmentWork, Fortification, VillageState, WallKind } from './types';

// Vylepšení opevnění po úsecích (fortifications.md – Hradby a obrana, Druhy a postup vylepšení;
// demolition.md – Opevnění): úsek mezi branami (`sectionOf`) na kterýkoli vyšší stupeň za cenu
// cílového – i o víc stupňů (Martin 8. 11. 2026 – „Pokud je možné vše, tak A“), roštová od roku 790,
// komorová od 830; palisáda s ochozem jen na stojící palisádu (Martin 8. 11. 2026: „ne – napřed
// palisáda, pak vylepšení v podobě ochozu“). Zbořený úsek (mezera) dostane cílovou hradbu za cenu
// nové. Každý úsek zvlášť – na opevnění smí běžet víc staveb, jedna na díl (Martin 8. 11. 2026 –
// „B“); práce vsi se mezi ně rozdělí jako mezi jiné stavby.

/** Úsek už cílovou nebo vyšší hradbu má (nic k vylepšení). */
export const FORT_UPGRADE_NONE = 'Úsek už takovou hradbu má.';

/** Vstup vylepšení úseku – díl v úseku (úsek dohledá server), nebo null = celé opevnění. */
export interface SectionUpgradeInput {
  fortificationId: number;
  /** Díl (`FortSegment.index`) v úseku; null – „Vylepšit vše“ (všechny úseky v jedné stavbě). */
  segment: number | null;
}

/** Vylepšení úseku na hradbu `target`. */
export interface SectionUpgradeStart extends SectionUpgradeInput {
  target: WallKind;
}

/**
 * Nabídka vylepšení úseku (tlačítko Vylepšit): cílová hradba, práce bez kácení a lámání (čd),
 * klády a kámen (m³) a důvod, proč nejde (null – jde).
 */
export interface FortUpgradeOption {
  target: WallKind;
  laborManDays: number;
  logs: number;
  stoneM3: number;
  block: string | null;
}

/** Kus vylepšení – celý díl, nebo kus dílu s branou (mezera po zboření sousedního úseku). */
interface UpgradePiece {
  index: number;
  part?: 'before' | 'after';
  cost: FortCost;
  /** Co na celém dílu stojí; u kusu dílu s branou null. */
  base: UpgradeBase | null;
}

/** Plán vylepšení: kusy v pořadí práce, nebo důvod. */
type UpgradePlan = { fort: Fortification; pieces: UpgradePiece[] } | { reason: string };

const ZERO: FortCost = { laborManDays: 0, logs: 0, stoneM3: 0 };

function addCost(a: FortCost, b: FortCost): FortCost {
  return {
    laborManDays: a.laborManDays + b.laborManDays,
    logs: a.logs + b.logs,
    stoneM3: a.stoneM3 + b.stoneM3,
  };
}

/**
 * Cena kusu dílu s branou, který je mezerou (návrh Clauda): postaví se znovu to, co na dílu stojí –
 * val i hradba dílu jako nové, podle délky kusu.
 */
function partCost(fort: Fortification, seg: FortSegment, lengthM: number): FortCost {
  const rampart = segmentRampart(fort, seg);
  const wall = segmentWall(fort, seg);
  let cost = rampart ? fortificationCost('rampart', lengthM) : ZERO;
  if (wall) cost = addCost(cost, fortificationCost(wall.kind, lengthM));
  return cost;
}

/**
 * Kusy vylepšení úseku s dílem `input.segment` (null – všech dílů) na hradbu `target`: díly úseku,
 * které cílovou hradbu ještě nemají (stojící nižší za cenu cílového, holý val a mezera za cenu
 * nové); u úseku i kusy dílů s branou, které jsou mezerou (zbořený sousední úsek). „Vylepšit vše“
 * zbořené díly vynechá (demolition.md – Opevnění). Pořadí práce od brány nejblíž dvorci.
 *
 * Díl s branou je rozhraní dvou úseků (návrh Clauda): druh má jeden pro celý díl, takže ho
 * vylepšení úseku zvedne, jen když hradba po obou stranách brány (sousední díly) bude mít aspoň
 * cílový stupeň – jinak brána zůstane na nižším druhu, dokud se nevylepší i sousední úsek. Úsek
 * tak nesahá do sousedního úseku a ten smí mít současně vlastní stavbu (Martin 8. 11. 2026 – „B“).
 */
function upgradePlan(
  state: VillageState,
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
  input: SectionUpgradeStart,
): UpgradePlan {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { reason: FORT_UNKNOWN };
  const outline = outlineOf(landscape, fort);
  if (!outline) return { reason: FORT_UNKNOWN };
  const shapes = fortSegments(outline);
  const lengths = shapes.map((s) => s.lengthM);
  const section = input.segment === null ? null : sectionOf(fort, input.segment);
  if (input.segment !== null && !section) return { reason: FORT_UNKNOWN };
  const n = fort.segments.length;
  const gateSegs = new Set(fort.gates.map((g) => g.segment));
  const inner = new Set(
    section
      ? section.segments.filter((i) => !gateSegs.has(i) || gateSegs.size === 0)
      : fort.segments.map((s) => s.index),
  );
  const segOf = (i: number): FortSegment | undefined => fort.segments.find((s) => s.index === i);
  // hradba dílu bude mít po vylepšení aspoň cílový stupeň (díl úseku, nebo už stojí vyšší)
  const atLeast = (i: number): boolean => {
    if (inner.has(i)) return true;
    const seg = segOf(i);
    return seg !== undefined && !needsUpgrade(upgradeBase(fort, seg), input.target);
  };
  const indices = [...inner];
  if (section) {
    const last = section.segments[section.segments.length - 1]!;
    for (const g of new Set([section.segments[0]!, (last + 1) % n])) {
      if (!gateSegs.has(g) || inner.has(g)) continue;
      if (atLeast((g - 1 + n) % n) && atLeast((g + 1) % n)) indices.push(g);
    }
  }
  const order = fortWorkOrder(shapes.length, fort.gates, villageAnchor(state));
  const rank = new Map(order.map((index, k) => [index, k]));
  const pieces: UpgradePiece[] = [];
  for (const index of indices) {
    const seg = segOf(index);
    if (!seg) continue;
    if (!section && seg.demolishedDay !== undefined) continue;
    const base = upgradeBase(fort, seg);
    if (!needsUpgrade(base, input.target)) continue;
    const lengthM = lengths[index] ?? 0;
    const from = base.kind === 'wall' ? base.wall : null;
    pieces.push({ index, cost: fortificationCost(input.target, lengthM, from), base });
  }
  if (section) {
    for (const piece of sectionPieces(lengths, fort.gates, section.gateSegment)) {
      if (piece.part === undefined) continue;
      const seg = fort.segments.find((s) => s.index === piece.index);
      if (!seg || seg.demolishedDay !== undefined) continue;
      const gone =
        piece.part === 'before'
          ? seg.demolishedBeforeGate !== undefined
          : seg.demolishedAfterGate !== undefined;
      if (!gone) continue;
      pieces.push({
        index: piece.index,
        part: piece.part,
        cost: partCost(fort, seg, piece.lengthM),
        base: null,
      });
    }
  }
  // pořadí práce: od brány nejblíž dvorci po směru hodin, celý díl před kusem dílu
  pieces.sort(
    (a, b) =>
      (rank.get(a.index) ?? 0) - (rank.get(b.index) ?? 0) ||
      (a.part === undefined ? 0 : 1) - (b.part === undefined ? 0 : 1),
  );
  return { fort, pieces };
}

/** Šířka pásu cílové hradby na dílu (m): na valu pás s valem, jinak pás hradby. */
function targetBand(base: UpgradeBase, target: WallKind): number {
  return upgradeOnRampart(base)
    ? FORTIFICATIONS.wallOnRampartBandM[target]
    : FORTIFICATIONS.bandM[target];
}

/**
 * Hráč vylepší úsek opevnění (nebo celé – `segment` null) na hradbu `target` (fortifications.md –
 * Hradby a obrana, Druhy a postup vylepšení): rok (roštová 790, komorová 830), ochoz jen na stojící
 * palisádu, díly úseku nesmí mít jinou běžící stavbu (`FORT_BUSY`), širší pás cílové hradby
 * (ohyb úseku, překážky, voda, stavby – `checkFortificationPlacement` jen na dílech, kde se pás
 * rozšíří, a na mezerách); překážky osadníci odstraní hned, široké hradby vezmou díly polí
 * a sadů. Klády a kámen předem (`pushWork`). Stavba `upgrade` (bez valu) nebo `top` (na valu)
 * s `fortTarget`; stará hradba stojí a brání, dokud díl není hotový. Vstupní stav nemění.
 */
export function startSectionUpgrade(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: SectionUpgradeStart,
  walk?: Walk,
): FortificationResult {
  if (!WALL_ORDER.includes(input.target)) return { ok: false, reason: FORT_UNKNOWN };
  const plan = upgradePlan(state, landscape, input);
  if ('reason' in plan) return { ok: false, reason: plan.reason };
  const { fort, pieces } = plan;
  const year = wallYearReason(input.target, day);
  if (year) return { ok: false, reason: year };
  if (pieces.length === 0) return { ok: false, reason: FORT_UPGRADE_NONE };
  // ochoz jen na stojící palisádu (Martin 8. 11. 2026 – „ne – napřed palisáda“)
  if (
    input.target === 'walkway' &&
    pieces.some((p) => p.base !== null && (p.base.kind !== 'wall' || p.base.wall !== 'palisade'))
  ) {
    return { ok: false, reason: FORT_WALKWAY_NEW };
  }
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (pieces.some((p) => busy.has(p.index))) return { ok: false, reason: FORT_BUSY };
  // pás cílové hradby: kontrola jen dílů, kde se pás rozšíří, a mezer (pás uvolnily jiným stavbám)
  const only = new Map<number, number>();
  for (const p of pieces) {
    const seg = fort.segments.find((s) => s.index === p.index)!;
    if (p.base === null) {
      if (!only.has(p.index)) only.set(p.index, segmentBand(fort, seg).inM);
      continue;
    }
    const width = targetBand(p.base, input.target);
    const now = p.base.kind === 'gap' ? 0 : segmentBand(fort, seg).inM;
    if (width > now + 1e-9) only.set(p.index, Math.max(width, only.get(p.index) ?? 0));
  }
  const outline = outlineOf(landscape, fort);
  if (!outline) return { ok: false, reason: FORT_UNKNOWN };
  let cleared: { ids: readonly number[]; trees: number } = { ids: [], trees: 0 };
  let taken: Parameters<typeof giveWayToBuilding>[2] = [];
  if (only.size > 0) {
    const village = placementVillageOf(state, day);
    const check = checkFortificationPlacement(
      landscape,
      { ...village, fortifications: villageFortifications(state).filter((f) => f.id !== fort.id) },
      obstacles,
      outline.points,
      input.target,
      only,
    );
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Sem taková hradba nepatří.' };
    cleared = { ids: check.obstacleIds, trees: check.clearedTrees };
    taken = check.takenLand;
  }
  let wood = 0;
  const stoneM3: number[] = [];
  const segments: FortSegmentWork[] = pieces.map((p) => {
    wood += p.cost.logs;
    stoneM3.push(p.cost.stoneM3);
    return { index: p.index, ...(p.part ? { part: p.part } : {}), cost: p.cost.laborManDays };
  });
  const workPlan: FortWorkPlan = {
    segments,
    wood,
    ...(stoneM3.some((m) => m > 0) ? { stoneM3 } : {}),
  };
  const next = cloneState(state);
  giveWayToBuilding(next, day, taken, 'fortification');
  const onRampart = pieces.some((p) => p.base !== null && upgradeOnRampart(p.base));
  const before = next.constructions.length;
  const missing = pushWork(
    next,
    day,
    obstacles,
    {
      fortificationId: fort.id,
      work: onRampart ? 'top' : 'upgrade',
      plan: workPlan,
      center: outlineCenter(outline),
      clearedIds: cleared.ids,
      clearedTrees: cleared.trees,
    },
    walk,
  );
  if (missing) return { ok: false, reason: missing };
  const added = next.constructions[before];
  if (added) added.fortTarget = input.target;
  return { ok: true, state: next };
}

/**
 * Nabídka Vylepšit úseku s dílem `input.segment` (null – celé opevnění): stupně, na které by se
 * v úseku něco změnilo – vyšší než nejnižší stojící hradba úseku (na mezeře a holém valu všechny),
 * každý s cenou (práce bez kácení a lámání, klády, kámen) a důvodem, proč nejde – rok, ochoz jen
 * na palisádu, běžící stavba, ohyb, pás, dřevo, kámen (`startSectionUpgrade`). Stav nemění.
 */
export function sectionUpgrades(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: SectionUpgradeInput,
  walk?: Walk,
): FortUpgradeOption[] {
  return WALL_ORDER.flatMap((target) => {
    const plan = upgradePlan(state, landscape, { ...input, target });
    if ('reason' in plan || plan.pieces.length === 0) return [];
    const cost = plan.pieces.reduce((sum, p) => addCost(sum, p.cost), ZERO);
    const result = startSectionUpgrade(
      state,
      day,
      landscape,
      obstacles,
      { ...input, target },
      walk,
    );
    return [{ target, ...cost, block: result.ok ? null : result.reason }];
  });
}
