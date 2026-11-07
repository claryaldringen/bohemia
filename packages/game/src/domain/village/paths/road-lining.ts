import { length2 } from '../../landscape';
import { ROAD_TREE_SPEED } from '../rules';
import type { Road, RoadApple, RoadLining, RoadPoint, VillageState } from '../types';

// Stromy u cesty zrychlí chůzi (roads.md; Martin 20. 10. 2026: „Stromy u cesty musí přídat něco
// málo k rychlosti jak chodců tak vozů. šlo by přidat třeba 0.03? A pokud to budou jabloně,
// přidalo by se 0.05.“): kolik délky úseku pevné cesty lemuje alej. Martin 31. 10. 2026: „Stromy
// jsou součást cesty. Kvůli stromům u cesty se přece nemusí měnit přepočet“ – lemuje každé místo
// na strom (`Road.spots`) a jabloň úseku, jak je alej naplánovaná, ne co na nich zrovna roste.
// Místo lemuje osu kolem svého průmětu na osu – k polovině vzdálenosti k sousednímu místu, nejvýš
// ROAD_TREE_SPEED.reachM na každou stranu, krajní místo až ke konci osy (do ROAD_TREE_SPEED.endM).
// Jabloně platí, kde jsou, jinde ostatní stromy. Podíly po desetinách se ukládají do `Road.lined`
// s postavením nebo vylepšením cesty (`lineRoads`, `relineRoad`). Čisté deterministické funkce (jen přesná aritmetika – soubor hlídá ESLint jako
// síť pěšin), stejně na serveru i v prohlížeči (prohlížeč dostane uložené olemování s cestou).

/** Kus osy [od, do] v metrech od začátku osy. */
type Piece = readonly [number, number];

/** Místo na strom na ose – poloha na ose (m) a jestli na něm strom lemuje cestu. */
interface Slot {
  at: number;
  standing: boolean;
}

/** Vzdálenosti bodů osy od začátku (m). */
function lengthsAlong(points: readonly RoadPoint[]): number[] {
  const out = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    out.push(out[k - 1]! + length2(b.x - a.x, b.z - a.z));
  }
  return out;
}

/** Poloha průmětu bodu na osu (m od začátku osy) – na nejbližší úsečku osy. */
function alongAxis(
  points: readonly RoadPoint[],
  at: readonly number[],
  x: number,
  z: number,
): number {
  let best = Infinity;
  let along = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const d = length2(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) {
      best = d;
      along = at[k - 1]! + (at[k]! - at[k - 1]!) * t;
    }
  }
  return along;
}

/**
 * Kusy osy délky `length`, které lemují místa `slots` (jen ta, kde strom stojí): každé místo na obě
 * strany k polovině vzdálenosti k sousednímu místu, nejvýš `reach`; krajní místo k začátku či konci
 * osy celou cestu, když je ten konec do `end` (u konců se stromy nesázejí), jinak taky nejvýš
 * `reach`. Kusy jsou vzestupně a nepřekrývají se.
 */
export function linedPieces(
  slots: readonly Slot[],
  length: number,
  reach: number,
  end: number,
): Piece[] {
  const sorted = [...slots].sort((a, b) => a.at - b.at);
  const out: Piece[] = [];
  sorted.forEach((slot, k) => {
    if (!slot.standing) return;
    const prev = sorted[k - 1];
    const next = sorted[k + 1];
    const from = prev
      ? Math.max(slot.at - reach, (prev.at + slot.at) / 2)
      : slot.at <= end
        ? 0
        : slot.at - reach;
    const to = next
      ? Math.min(slot.at + reach, (slot.at + next.at) / 2)
      : length - slot.at <= end
        ? length
        : slot.at + reach;
    const a = Math.max(0, from);
    const b = Math.min(length, to);
    if (b > a) out.push([a, b]);
  });
  return out;
}

/** Délka kusů. */
function piecesLength(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Délka kusů `pieces` mimo kusy `cover`. */
function lengthOutside(pieces: readonly Piece[], cover: readonly Piece[]): number {
  let sum = 0;
  for (const [a, b] of pieces) {
    let inside = 0;
    for (const [c, d] of cover) inside += Math.max(0, Math.min(b, d) - Math.max(a, c));
    sum += b - a - inside;
  }
  return sum;
}

/** Podíl po dílech ROAD_TREE_SPEED.steps (počet dílů). */
function steps(share: number): number {
  return Math.min(ROAD_TREE_SPEED.steps, Math.max(0, Math.round(share * ROAD_TREE_SPEED.steps)));
}

/**
 * Olemování úseku `road` (roads.md – Stromy u cesty zrychlí chůzi; Martin 31. 10. 2026: „Stromy
 * jsou součást cesty.“): alej, jak je naplánovaná – každé místo na strom úseku (`Road.spots`)
 * a každá jabloň úseku (`apples` – i čekající na výsadbu nebo souš), ne to, co na nich zrovna
 * roste. Podíly délky po desetinách – nejdřív celkem, z toho jabloně, zbytek stromy (dohromady
 * nejvýš 1).
 */
export function roadLining(
  road: Pick<Road, 'points' | 'spots'>,
  apples: readonly Pick<RoadApple, 'x' | 'z'>[],
): RoadLining {
  const at = lengthsAlong(road.points);
  const length = at[at.length - 1] ?? 0;
  if (length <= 0) return { trees: 0, apples: 0 };
  const treeSlots = road.spots.map((spot): Slot => ({
    at: alongAxis(road.points, at, spot.x, spot.z),
    standing: true,
  }));
  const appleSlots = apples.map((apple): Slot => ({
    at: alongAxis(road.points, at, apple.x, apple.z),
    standing: true,
  }));
  const { reachM, endM } = ROAD_TREE_SPEED;
  const bySpots = linedPieces(treeSlots, length, reachM.trees, endM.trees);
  const byApples = linedPieces(appleSlots, length, reachM.apples, endM.apples);
  const appleLength = piecesLength(byApples);
  const treeLength = lengthOutside(bySpots, byApples);
  const total = steps((appleLength + treeLength) / length);
  const appleSteps = Math.min(total, steps(appleLength / length));
  return {
    trees: (total - appleSteps) / ROAD_TREE_SPEED.steps,
    apples: appleSteps / ROAD_TREE_SPEED.steps,
  };
}

/**
 * Určí olemování úseků bez něj (mutuje stav – roads.md, Stromy u cesty zrychlí chůzi): nový nebo
 * přestavěný úsek a úsek po vylepšení (`relineRoad`). Jabloně podle úseku (`RoadApple.roadId`).
 * Sázení, růst ani uschnutí stromů a jabloní olemování nemění (Martin 31. 10. 2026).
 */
export function lineRoads(state: VillageState): void {
  const roads = state.roads;
  if (!roads || roads.roads.length === 0) return;
  const todo = roads.roads.filter((r) => r.lined === undefined);
  if (todo.length === 0) return;
  const applesByRoad = applesOf(roads.apples ?? []);
  for (const road of todo) road.lined = roadLining(road, applesByRoad.get(road.id) ?? []);
}

/** Jabloně po úsecích. */
function applesOf(apples: readonly RoadApple[]): Map<number, RoadApple[]> {
  const byRoad = new Map<number, RoadApple[]>();
  for (const apple of apples) {
    const list = byRoad.get(apple.roadId);
    if (list) list.push(apple);
    else byRoad.set(apple.roadId, [apple]);
  }
  return byRoad;
}

/**
 * Vylepšená cesta dostane olemování znovu (mutuje úsek): olemování se určí s postavením nebo
 * vylepšením cesty (`lineRoads` – další přepočet chůze, se kterým se mapa tras mění i kvůli
 * stupni).
 */
export function relineRoad(road: Road): void {
  delete road.lined;
}

/**
 * Převod starší vsi (roads.md – Stromy u cesty, Kdy): olemování všech úseků podle míst na stromy
 * a jabloně místo toho, co rostlo 1. dne v měsíci – jednou (`VillageRoads.liningPlanned`),
 * idempotentně; ves bez cest beze změny.
 */
export function withPlannedLining(state: VillageState): VillageState {
  const roads = state.roads;
  if (!roads || roads.liningPlanned || roads.roads.length === 0) return state;
  const applesByRoad = applesOf(roads.apples ?? []);
  return {
    ...state,
    roads: {
      ...roads,
      liningPlanned: true,
      roads: roads.roads.map((r) => ({
        ...r,
        lined: roadLining(r, applesByRoad.get(r.id) ?? []),
      })),
    },
  };
}
