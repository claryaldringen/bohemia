import { obstacleKind, type ObstacleLayer } from '../landscape';
import { logArrivalPoint, logPilePlace } from './log-piles';
import { LOG_PILES } from './rules';
import type { StoneStack, VillageState } from './types';

// Kámen vsi (fortifications.md – Hradby a obrana, Kámen): zásoba v m³ s hromadami u cest jako klády
// (`wood.ts`, `log-piles.ts`). Kámen přibývá jen z lomu (`quarry.ts` – Martin 8. 11. 2026: „Kámen
// z pole je na to nevhodný. Musíme zavést lom.“) a vrací se ze zrušené stavby hradby; nehnije.

/** Tolerance zbytku hromady (m³) – menší hromada zmizí. */
const EPSILON_M3 = 1e-9;

/** Kámen vsi celkem (m³); ves bez kamene 0. */
export function stoneOnHand(state: Pick<VillageState, 'stoneM3'>): number {
  return Math.max(0, state.stoneM3 ?? 0);
}

/**
 * Vezme `m3` kamene (nejvýš, co ves má) z hromad od nejbližší k `at` (při shodě menší id); co
 * hromady nepokryjí, ubere ze zásoby bez hromady. Vyprázdněná hromada zmizí. Mutuje stav – volat
 * na klonu.
 */
export function takeStone(state: VillageState, m3: number, at: { x: number; z: number }): void {
  const want = Math.min(Math.max(0, m3), stoneOnHand(state));
  if (want <= 0) return;
  let left = want;
  const stacks = state.stoneStacks;
  if (stacks && stacks.length > 0) {
    const distance = (s: StoneStack): number =>
      (s.x - at.x) * (s.x - at.x) + (s.z - at.z) * (s.z - at.z);
    const order = [...stacks].sort((a, b) => distance(a) - distance(b) || a.id - b.id);
    for (const stack of order) {
      if (left <= EPSILON_M3) break;
      const take = Math.min(left, stack.m3);
      stack.m3 -= take;
      left -= take;
    }
    const kept = stacks.filter((s) => s.m3 > EPSILON_M3);
    if (kept.length > 0) state.stoneStacks = kept;
    else delete state.stoneStacks;
  }
  const rest = stoneOnHand(state) - want;
  if (rest > EPSILON_M3) state.stoneM3 = rest;
  else delete state.stoneM3;
}

/**
 * Přidá `m3` kamene na hromadu u cesty nejblíž místu `at` (`logPilePlace`; null = kámen přišel
 * odjinud – u cesty nejblíž dvorci, `logArrivalPoint`). Hromada do `LOG_PILES.joinM` od místa se
 * zvětší (nejbližší, při shodě menší id), jinak vznikne nová s id z `nextStoneStackId` (ne
 * z `nextId`). Mutuje stav – volat na klonu.
 */
export function addStone(
  state: VillageState,
  m3: number,
  at: { x: number; z: number } | null,
): void {
  if (!(m3 > EPSILON_M3)) return;
  state.stoneM3 = stoneOnHand(state) + m3;
  const stacks = (state.stoneStacks ??= []);
  const place = logPilePlace(state, at ?? logArrivalPoint(state));
  const join = LOG_PILES.joinM * LOG_PILES.joinM;
  let target: StoneStack | null = null;
  let targetD = Infinity;
  for (const s of stacks) {
    const d = (s.x - place.x) * (s.x - place.x) + (s.z - place.z) * (s.z - place.z);
    if (d <= join && (d < targetD || (d === targetD && target !== null && s.id < target.id))) {
      target = s;
      targetD = d;
    }
  }
  if (target) {
    target.m3 += m3;
    return;
  }
  const id = state.nextStoneStackId ?? 1;
  state.nextStoneStackId = id + 1;
  stacks.push({ id, x: place.x, z: place.z, m3, ...(place.road ? { road: place.road } : {}) });
}

/**
 * Lom – nejbližší skalní výchoz (`outcrop`) na mapě sídla k místu `at` a vzdálenost k němu (m); při
 * shodě menší id. Výchoz se neodstraňuje, takže stačí vrstva překážek bez změn vsi. Bez výchozu null.
 */
export function quarryNear(
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
): { x: number; z: number; distanceM: number } | null {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < obstacles.count; i++) {
    if (obstacleKind(obstacles, i) !== 'outcrop') continue;
    const dx = obstacles.x[i]! - at.x;
    const dz = obstacles.z[i]! - at.z;
    const d = dx * dx + dz * dz;
    // id roste s indexem – první nalezený při shodě má menší id
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  if (best < 0) return null;
  return { x: obstacles.x[best]!, z: obstacles.z[best]!, distanceM: Math.sqrt(bestD) };
}
