import { obstacleKind, obstaclesNear, type ObstacleLayer } from '../../../landscape';
import { validateActionDay } from '../../core/actions';
import { distanceFactor } from '../../fields/fields';
import { logArrivalPoint } from '../../forest/log-piles';
import { OUTCROP_RADIUS_M } from '../../rules';
import { STONE } from '../../rules/rules-stone';
import { addStone } from './stone';
import type { Construction, Position, Quarry, VillageState } from '../../types';

// Lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je na to
// nevhodný. Musíme zavést lom.“): stavba jen na skalním výchozu mapy. Kámen se v něm láme na
// zakázku – pro rozestavěnou hradbu (`fortifications.ts` – `fortStonePlan`), nebo do zásoby, když
// to hráč zadá (pro obchod a dávky). Návrh Clauda: na výchozu nejvýš jeden lom, stavba ≈ 20 čd bez
// dřeva; zásoba se veze k hromadě u cesty nejblíž dvorci.

/** Proč lom sem nejde – texty pro kurzor. */
export const QUARRY_NO_OUTCROP = 'Lom jde jen na skalní výchoz.';
export const QUARRY_TAKEN = 'Na tomhle výchozu už lom je.';
export const QUARRY_MISSING = 'Ves nemá lom.';

/** Skalní výchoz pod bodem – id, střed a poloměr (m). */
export interface OutcropHit {
  id: number;
  x: number;
  z: number;
  radiusM: number;
}

/** Dostavěné lomy vsi; starší ves bez lomů prázdné. */
export function villageQuarries(state: Pick<VillageState, 'quarries'>): readonly Quarry[] {
  return state.quarries ?? [];
}

/**
 * Skalní výchoz pod bodem `at` (kruh `OUTCROP_RADIUS_M × velikost` + `STONE.pickSlackM`); víc
 * výchozů – nejbližší střed, při shodě menší id. Výchoz se neodstraňuje, stačí vrstva překážek.
 */
export function outcropAt(
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
): OutcropHit | null {
  const reach = OUTCROP_RADIUS_M * 2 + STONE.pickSlackM;
  let best: OutcropHit | null = null;
  let bestD = Infinity;
  for (const i of obstaclesNear(
    obstacles,
    at.x - reach,
    at.z - reach,
    at.x + reach,
    at.z + reach,
  )) {
    if (obstacleKind(obstacles, i) !== 'outcrop') continue;
    const radiusM = OUTCROP_RADIUS_M * obstacles.scale[i]!;
    const dx = obstacles.x[i]! - at.x;
    const dz = obstacles.z[i]! - at.z;
    const d = dx * dx + dz * dz;
    const limit = radiusM + STONE.pickSlackM;
    if (d > limit * limit) continue;
    const id = obstacles.id[i]!;
    if (d < bestD || (d === bestD && best !== null && id < best.id)) {
      best = { id, x: obstacles.x[i]!, z: obstacles.z[i]!, radiusM };
      bestD = d;
    }
  }
  return best;
}

/** Ves, jak ji vidí kontrola umístění lomu – lomy a rozestavěné stavby. */
export interface QuarrySites {
  readonly quarries?: readonly { readonly outcropId: number }[];
  readonly constructions: readonly { readonly quarryOutcrop?: number; readonly kind?: string }[];
}

/** Výsledek kontroly umístění lomu – výchoz, na který lom padne. */
export interface QuarryCheck {
  ok: boolean;
  reason: string | null;
  outcrop: OutcropHit | null;
}

/**
 * Jde lom na místo `at`? Jen na skalní výchoz (`QUARRY_NO_OUTCROP`), na kterém ještě lom nestojí
 * ani se nestaví (`QUARRY_TAKEN`). Server i prohlížeč počítají totéž.
 */
export function checkQuarryPlacement(
  village: QuarrySites,
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
): QuarryCheck {
  const outcrop = outcropAt(obstacles, at);
  if (!outcrop) return { ok: false, reason: QUARRY_NO_OUTCROP, outcrop: null };
  const taken =
    (village.quarries ?? []).some((q) => q.outcropId === outcrop.id) ||
    village.constructions.some((c) => c.kind === 'quarry' && c.quarryOutcrop === outcrop.id);
  if (taken) return { ok: false, reason: QUARRY_TAKEN, outcrop };
  return { ok: true, reason: null, outcrop };
}

/** Výsledek akce nad lomem – nový stav, nebo důvod česky. */
export type QuarryResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Hráč zahájí stavbu lomu u bodu `position` (střed padne na střed výchozu, natočení zůstane) –
 * `STONE.quarryLaborManDays` ze společné práce, bez dřeva. Vstupní stav nemění.
 */
export function startQuarry(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer,
  position: Position,
): QuarryResult {
  validateActionDay(state, day);
  const check = checkQuarryPlacement(state, obstacles, position);
  if (!check.ok || !check.outcrop) return { ok: false, reason: check.reason ?? QUARRY_NO_OUTCROP };
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'quarry',
    startedDay: day,
    cost: STONE.quarryLaborManDays,
    done: 0,
    dwellingType: null,
    position: { x: check.outcrop.x, z: check.outcrop.z, rotation: position.rotation },
    dwellingId: null,
    fieldId: null,
    quarryOutcrop: check.outcrop.id,
  });
  return { ok: true, state: next };
}

/** Dostavěný lom (krok dokončení staveb) – přibude do `quarries`. Mutuje stav. */
export function finishQuarry(state: VillageState, c: Construction, day: number): void {
  if (c.quarryOutcrop === undefined || c.position === null) return;
  const outcropId = c.quarryOutcrop;
  if (villageQuarries(state).some((q) => q.outcropId === outcropId)) return;
  (state.quarries ??= []).push({
    outcropId,
    x: c.position.x,
    z: c.position.z,
    rotation: c.position.rotation,
    builtDay: day,
  });
}

/** Nejbližší dostavěný lom k místu `at` a vzdálenost k němu (m); při shodě menší id; bez lomu null. */
export function nearestQuarry(
  state: Pick<VillageState, 'quarries'>,
  at: { x: number; z: number },
): { quarry: Quarry; distanceM: number } | null {
  let best: Quarry | null = null;
  let bestD = Infinity;
  for (const q of villageQuarries(state)) {
    const d = (q.x - at.x) * (q.x - at.x) + (q.z - at.z) * (q.z - at.z);
    if (d < bestD || (d === bestD && best !== null && q.outcropId < best.outcropId)) {
      best = q;
      bestD = d;
    }
  }
  return best ? { quarry: best, distanceM: Math.sqrt(bestD) } : null;
}

/** Lámání a dovoz 1 m³ z lomu na vzdálenost `distanceM` (čd) – `STONE.quarryManDaysPerM3`. */
export function quarryManDaysPerM3(distanceM: number): number {
  return STONE.quarryManDaysPerM3 * distanceFactor(distanceM);
}

/**
 * Práce zakázky „nalámat do zásoby“ `m3` v lomu `quarry` (čd): lámání a dovoz k hromadě u cesty
 * nejblíž dvorci (`logArrivalPoint`) – tam se kámen složí.
 */
export function stockQuarryingManDays(state: VillageState, quarry: Quarry, m3: number): number {
  const to = logArrivalPoint(state);
  const d = Math.sqrt(
    (quarry.x - to.x) * (quarry.x - to.x) + (quarry.z - to.z) * (quarry.z - to.z),
  );
  return m3 * quarryManDaysPerM3(d);
}

/**
 * Hráč zadá v lomu `outcropId` „nalámat do zásoby“ `m3` (celé m³ v `STONE.stockOrderM3`) – práce
 * jde ze společné práce vsi jako stavba, po dokončení leží kámen na hromadě u cesty u dvorce.
 * Vstupní stav nemění.
 */
export function orderQuarrying(
  state: VillageState,
  day: number,
  outcropId: number,
  m3: number,
): QuarryResult {
  validateActionDay(state, day);
  const quarry = villageQuarries(state).find((q) => q.outcropId === outcropId);
  if (!quarry) return { ok: false, reason: QUARRY_MISSING };
  const { min, max } = STONE.stockOrderM3;
  if (!Number.isInteger(m3) || m3 < min || m3 > max) {
    return { ok: false, reason: `Nalámat jde ${min} až ${max} m³ kamene.` };
  }
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'quarrying',
    startedDay: day,
    cost: stockQuarryingManDays(state, quarry, m3),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    quarryOutcrop: outcropId,
    stoneOrderM3: m3,
  });
  return { ok: true, state: next };
}

/** Kámen zakázky lámání, který už je nalámaný (m³) – podle odvedené práce. */
function quarriedSoFar(c: Construction): number {
  const m3 = c.stoneOrderM3 ?? 0;
  if (c.cost <= 0) return m3;
  return m3 * Math.min(1, Math.max(0, c.done / c.cost));
}

/** Dokončené lámání do zásoby – kámen na hromadu u cesty u dvorce. Mutuje stav. */
export function finishQuarrying(state: VillageState, c: Construction): void {
  addStone(state, c.stoneOrderM3 ?? 0, null);
}

/**
 * Zrušení stavby s kamenem (mutuje klon): lámání do zásoby složí na hromadu, co se už nalámalo
 * (návrh Clauda); hradba vrátí nezabudovaný kámen z hromad (`stoneFromPile` × nehotový podíl) –
 * nalámaný kámen nehotových úseků se nelámal (lámání je v práci úseků).
 */
export function returnConstructionStone(state: VillageState, c: Construction): void {
  if (c.kind === 'quarrying') {
    addStone(state, quarriedSoFar(c), null);
    return;
  }
  const fromPile = c.stoneFromPile ?? 0;
  if (fromPile <= 0) return;
  const progress = c.cost > 0 ? Math.min(1, Math.max(0, c.done / c.cost)) : 0;
  addStone(state, fromPile * (1 - progress), c.fortLogsAt ?? c.position ?? null);
}
