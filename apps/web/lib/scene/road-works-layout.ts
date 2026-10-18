import type { PathLine, RoadGrade } from '@bohemia/game';
import type { SceneRoad, SceneRoadApple } from '../village-view';
import { JUNCTION, type RibbonJunction } from './path-ribbon';
import { hash01 } from './smoke-schedule';
import type { Point } from './village-layout';

// Vylepšené pevné cesty ve scéně bez Babylonu (docs/design/roads.md – Co hráč vidí): upravená
// cesta je širší se strouhou po jedné straně a kameny v blátě a v brodu, hať jsou kmeny napříč
// přes mokřinu, lávka z kmenů přes brod. Rozestavěné vylepšení: vytyčení kolíky a provázkem od
// zadání (Martin – u všech staveb), upravená cesta roste od začátku úseku, kmeny hatě se kladou
// po mokřině, lávka nejdřív kůly a prahy, pak kmeny. Čisté funkce – rozměry dílů musí sedět
// s tools/blender/roads.py.

/** Kmen hatě (road-log.glb): délka napříč cestou (m) a rozestup kmenů podél osy (m). */
export const LOG_LENGTH_M = 2.6;
export const LOG_SPACING_M = 0.24;
/** Lávka (road-bridge.glb) – délka podél osy (m). */
export const BRIDGE_LENGTH_M = 5.2;
/** Strouha upravené cesty: vzdálenost od osy (m, vlevo) a šířka (m). */
export const DITCH = { offsetM: 1.75, widthM: 0.55 } as const;
/** Kameny upravené cesty: v mokřině a brodu hustě (na m osy), jinde řídce. */
const STONES_PER_M = { wet: 0.9, dry: 0.12 } as const;
/** Vytyčení: provázek po obou stranách pásu (m od osy). */
const STAKING_OFFSET_M = 1.7;
/** Lávka: kůly a prahy od takového průběhu stavby hatě a lávky, celá lávka od takového. */
const BRIDGE_STAGES = { posts: 0.25, deck: 0.9 } as const;

/** Bod a směr osy ve vzdálenosti `d` od začátku (m). */
export interface AxisPoint {
  x: number;
  z: number;
  /** Jednotkový směr osy. */
  tx: number;
  tz: number;
}

/** Délky po ose od začátku. */
export function lengthsAlong(points: readonly { x: number; z: number }[]): number[] {
  const at = [0];
  for (let k = 1; k < points.length; k++) {
    at.push(
      at[k - 1]! + Math.hypot(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z),
    );
  }
  return at;
}

/** Bod osy ve vzdálenosti `d` (m) se směrem. */
export function axisAt(points: readonly { x: number; z: number }[], d: number): AxisPoint {
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const t = Math.min(length, Math.max(0, d));
  let k = 1;
  while (k < points.length - 1 && at[k]! < t) k++;
  const a = points[k - 1]!;
  const b = points[k]!;
  const span = Math.max(1e-9, at[k]! - at[k - 1]!);
  const u = Math.min(1, Math.max(0, (t - at[k - 1]!) / span));
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    tx: (b.x - a.x) / span,
    tz: (b.z - a.z) / span,
  };
}

/** Kus lomené čáry od `from` do `to` m od začátku (včetně bodů zlomu mezi nimi). */
export function axisPart(
  points: readonly { x: number; z: number }[],
  from: number,
  to: number,
): { x: number; z: number }[] {
  const at = lengthsAlong(points);
  if (to - from < 1e-6) return [];
  const start = axisAt(points, from);
  const end = axisAt(points, to);
  const out = [{ x: start.x, z: start.z }];
  for (let k = 1; k < points.length - 1; k++) {
    if (at[k]! > from && at[k]! < to) out.push({ x: points[k]!.x, z: points[k]!.z });
  }
  out.push({ x: end.x, z: end.z });
  return out;
}

/** Délka osy úseku (m). */
export function roadLength(road: Pick<SceneRoad, 'points'>): number {
  const at = lengthsAlong(road.points);
  return at[at.length - 1] ?? 0;
}

/** Stupeň, který úsek ukazuje do vzdálenosti `d` od začátku (rozestavěná úprava roste od začátku). */
function shownGrade(road: SceneRoad, d: number): RoadGrade {
  const up = road.upgrade;
  if (!up || up.grade !== 'improved') return road.grade;
  return d <= up.progress * roadLength(road) ? 'improved' : road.grade;
}

/**
 * Pásy cest pro obtisk: vyšlapané (plně vyšlapaná pěšina) a upravené (širší) – rozestavěná
 * úprava je upravená od začátku úseku do průběhu stavby, dál vyšlapaná. Volný konec se vytrácí.
 */
export function roadBands(roads: readonly SceneRoad[]): {
  trodden: PathLine[];
  improved: PathLine[];
} {
  const ends = roads.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]);
  const joined = (p: { x: number; z: number } | undefined, own: number): boolean =>
    p !== undefined &&
    ends.some(
      (q, i) =>
        Math.floor(i / 2) !== own && q !== undefined && Math.hypot(q.x - p.x, q.z - p.z) <= 0.5,
    );
  const out = { trodden: [] as PathLine[], improved: [] as PathLine[] };
  roads.forEach((road, k) => {
    if (road.points.length < 2) return;
    const length = roadLength(road);
    const cut =
      road.upgrade?.grade === 'improved' && road.grade === 'trodden'
        ? road.upgrade.progress * length
        : null;
    const pieces: { from: number; to: number; improved: boolean }[] =
      cut === null
        ? [{ from: 0, to: length, improved: road.grade !== 'trodden' }]
        : [
            { from: 0, to: cut, improved: true },
            { from: cut, to: length, improved: false },
          ];
    for (const piece of pieces) {
      const points = axisPart(road.points, piece.from, piece.to);
      if (points.length < 2) continue;
      const line: PathLine = {
        points,
        strength: points.map(() => 1),
        years: points.map(() => 0),
        openStart: piece.from < 1e-6 && !joined(road.points[0], k),
        openEnd: piece.to > length - 1e-6 && !joined(road.points[road.points.length - 1], k),
      };
      (piece.improved ? out.improved : out.trodden).push(line);
    }
  });
  return out;
}

/**
 * Rozcestí pevných cest (roads.md – Co hráč vidí; Martin: „rozcestí by mělo být nejvyšlapanější
 * plochou“): body, kde končí aspoň tři úseky – plácek plné síly. Patří k upravené cestě, když do
 * něj upravená část některého úseku vbíhá (je pak širší), jinak k vyšlapané.
 */
export function roadJunctions(roads: readonly SceneRoad[]): {
  trodden: RibbonJunction[];
  improved: RibbonJunction[];
} {
  const nodes = new Map<string, { x: number; z: number; count: number; improved: boolean }>();
  for (const road of roads) {
    if (road.points.length < 2) continue;
    const length = roadLength(road);
    for (const [p, d] of [
      [road.points[0]!, 0],
      [road.points[road.points.length - 1]!, length],
    ] as const) {
      const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
      const node = nodes.get(key) ?? { x: p.x, z: p.z, count: 0, improved: false };
      node.count++;
      node.improved ||= shownGrade(road, d) !== 'trodden';
      nodes.set(key, node);
    }
  }
  const out = { trodden: [] as RibbonJunction[], improved: [] as RibbonJunction[] };
  for (const node of nodes.values()) {
    if (node.count < JUNCTION.minLines) continue;
    (node.improved ? out.improved : out.trodden).push({ x: node.x, z: node.z, strength: 1 });
  }
  return out;
}

/** Lomená čára posunutá o `offset` m kolmo k ose (vlevo kladně). */
export function offsetPolyline(
  points: readonly { x: number; z: number }[],
  offset: number,
): Point[] {
  return points.map((p, k) => {
    const a = points[Math.max(0, k - 1)]!;
    const b = points[Math.min(points.length - 1, k + 1)]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [p.x - ((b.z - a.z) / l) * offset, p.z + ((b.x - a.x) / l) * offset];
  });
}

/** Strouhy upravených částí úseků – čáry vlevo od osy (mimo brody). */
export function ditchLines(roads: readonly SceneRoad[]): { x: number; z: number }[][] {
  const out: { x: number; z: number }[][] = [];
  for (const road of roads) {
    const length = roadLength(road);
    const until =
      road.grade !== 'trodden'
        ? length
        : road.upgrade?.grade === 'improved'
          ? road.upgrade.progress * length
          : 0;
    if (until < 2) continue;
    // přes brod strouha nevede – rozdělí se kolem brodu (±3 m)
    const cuts = (road.ground?.fords ?? []).filter((f) => f < until).sort((a, b) => a - b);
    let from = 0;
    for (const ford of [...cuts, until]) {
      const to = ford === until ? until : Math.max(from, ford - 3);
      if (to - from >= 2) {
        out.push(
          offsetPolyline(axisPart(road.points, from, to), DITCH.offsetM).map(([x, z]) => ({
            x,
            z,
          })),
        );
      }
      from = ford + 3;
    }
  }
  return out;
}

/** Instance dílu cesty: poloha, natočení kolem svislé osy a měřítko. */
export interface RoadPiece {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Natočení dílu, jehož osa x (kmen hatě) leží napříč osou cesty se směrem (tx, tz). */
function acrossRotation(tx: number, tz: number): number {
  // kmen podél místního x – natočit tak, aby x mířilo kolmo k ose cesty (−tz, tx)
  return Math.atan2(tx, tz);
}

/** Je vzdálenost `d` na ose v mokřině úseku? */
function inWet(road: SceneRoad, d: number): boolean {
  return (road.ground?.wet ?? []).some(([a, b]) => d >= a && d <= b);
}

/**
 * Kameny upravené cesty (kameny do bláta a brodu – roads.md): v mokřině a u brodů hustě,
 * jinde řídce, náhodně po šířce pásu – deterministicky podle id úseku a místa.
 */
export function stonePieces(roads: readonly SceneRoad[]): RoadPiece[] {
  const out: RoadPiece[] = [];
  for (const road of roads) {
    const length = roadLength(road);
    const fords = road.ground?.fords ?? [];
    for (let d = 0.5; d < length; d += 0.5) {
      if (shownGrade(road, d) === 'trodden') continue;
      const nearFord = fords.some((f) => Math.abs(f - d) < 2.5);
      // po hati (hotové) jsou kameny jen u brodu – mokřinu kryjí kmeny
      const wet = inWet(road, d) && road.grade !== 'causeway';
      const density = wet || nearFord ? STONES_PER_M.wet : STONES_PER_M.dry;
      const key = Math.round(d * 2);
      if (hash01(road.id, key, 81) >= density * 0.5) continue;
      const p = axisAt(road.points, d);
      const across = (hash01(road.id, key, 82) - 0.5) * 2 * 1.1;
      out.push({
        x: p.x - p.tz * across,
        z: p.z + p.tx * across,
        rotationY: hash01(road.id, key, 83) * Math.PI * 2,
        scale: 0.65 + hash01(road.id, key, 84) * 0.6,
      });
    }
  }
  return out;
}

/** Podíl hotové hatě a lávky 0–1 (hotová hať 1, rozestavěná podle průběhu, jinak 0). */
function causewayShare(road: SceneRoad): number {
  if (road.grade === 'causeway') return 1;
  return road.upgrade?.grade === 'causeway' ? road.upgrade.progress : 0;
}

/**
 * Kmeny hatě napříč cestou po mokřině (roads.md – hať): po LOG_SPACING_M, rozestavěná hať je
 * položená od začátku mokřiny po podíl průběhu stavby (po celé délce mokřiny úseku).
 */
export function logPieces(roads: readonly SceneRoad[]): RoadPiece[] {
  const out: RoadPiece[] = [];
  for (const road of roads) {
    const share = causewayShare(road);
    if (share <= 0) continue;
    const wet = road.ground?.wet ?? [];
    const total = wet.reduce((sum, [a, b]) => sum + (b - a), 0);
    let laid = share * total;
    for (const [a, b] of wet) {
      for (let d = a; d <= b && laid > 0; d += LOG_SPACING_M, laid -= LOG_SPACING_M) {
        const p = axisAt(road.points, d);
        const key = Math.round(d * 10);
        out.push({
          x: p.x,
          z: p.z,
          rotationY: acrossRotation(p.tx, p.tz) + (hash01(road.id, key, 85) - 0.5) * 0.12,
          scale: 0.92 + hash01(road.id, key, 86) * 0.16,
        });
      }
    }
  }
  return out;
}

/** Lávka přes brod – poloha, natočení podél osy a fáze stavby (kůly, nebo celá). */
export interface BridgePiece extends RoadPiece {
  stage: 'posts' | 'deck';
  /** Konce lávky ve světě – výška podle vyššího břehu. */
  ends: [Point, Point];
}

/** Lávky přes brody úseků s hatí a lávkou (rozestavěné po fázích). */
export function bridgePieces(roads: readonly SceneRoad[]): BridgePiece[] {
  const out: BridgePiece[] = [];
  for (const road of roads) {
    const share = causewayShare(road);
    if (share < BRIDGE_STAGES.posts) continue;
    const stage = share >= BRIDGE_STAGES.deck ? 'deck' : 'posts';
    for (const ford of road.ground?.fords ?? []) {
      const p = axisAt(road.points, ford);
      const half = BRIDGE_LENGTH_M / 2;
      out.push({
        x: p.x,
        z: p.z,
        // lávka podél místního z – natočit do směru osy cesty
        rotationY: Math.atan2(p.tx, p.tz),
        scale: 1,
        stage,
        ends: [
          [p.x - p.tx * half, p.z - p.tz * half],
          [p.x + p.tx * half, p.z + p.tz * half],
        ],
      });
    }
  }
  return out;
}

/**
 * Vytyčení rozestavěného vylepšení (Martin – kolíky a provázek hned od zadání): upravená cesta
 * podél celého úseku po obou stranách pásu (ještě neupravená část), hať a lávka kolem mokřiny
 * a brodů.
 */
export function stakingLines(roads: readonly SceneRoad[]): Point[][] {
  const out: Point[][] = [];
  for (const road of roads) {
    const up = road.upgrade;
    if (!up) continue;
    const length = roadLength(road);
    const spans: [number, number][] =
      up.grade === 'improved'
        ? [[up.progress * length, length]]
        : [
            ...(road.ground?.wet ?? []),
            ...(road.ground?.fords ?? []).map((f): [number, number] => [
              Math.max(0, f - BRIDGE_LENGTH_M / 2),
              Math.min(length, f + BRIDGE_LENGTH_M / 2),
            ]),
          ];
    for (const [a, b] of spans) {
      if (b - a < 1) continue;
      const part = axisPart(road.points, a, b);
      out.push(offsetPolyline(part, STAKING_OFFSET_M), offsetPolyline(part, -STAKING_OFFSET_M));
    }
  }
  return out;
}

/**
 * Vytyčení výsadby jabloní u cesty (Martin – u všech staveb hned od zadání kolíky a provázkem):
 * po každé straně úseku provázek přes místa jabloní, které na výsadbu teprve čekají, kolík na
 * každém místě (`pegs`). Jediná jabloň na straně má jen kolík.
 */
export function appleStaking(
  roads: readonly SceneRoad[],
  apples: readonly SceneRoadApple[],
): { lines: Point[][]; pegs: Point[] } {
  const lines: Point[][] = [];
  const pegs: Point[] = [];
  for (const road of roads) {
    const pending = apples.filter((a) => a.roadId === road.id && a.stage === 'planting');
    if (pending.length === 0 || road.points.length < 2) continue;
    const at = lengthsAlong(road.points);
    const sides = new Map<number, { d: number; p: Point }[]>();
    for (const a of pending) {
      // nejbližší místo na ose – vzdálenost od začátku a strana (vlevo +1, vpravo −1)
      let best = { dist: Infinity, d: 0, side: 1 };
      for (let k = 1; k < road.points.length; k++) {
        const p = road.points[k - 1]!;
        const q = road.points[k]!;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const l2 = dx * dx + dz * dz || 1;
        const u = Math.min(1, Math.max(0, ((a.x - p.x) * dx + (a.z - p.z) * dz) / l2));
        const dist = Math.hypot(a.x - (p.x + dx * u), a.z - (p.z + dz * u));
        if (dist < best.dist) {
          const cross = dx * (a.z - p.z) - dz * (a.x - p.x);
          best = { dist, d: at[k - 1]! + Math.sqrt(l2) * u, side: cross >= 0 ? 1 : -1 };
        }
      }
      const list = sides.get(best.side) ?? [];
      list.push({ d: best.d, p: [a.x, a.z] });
      sides.set(best.side, list);
      pegs.push([a.x, a.z]);
    }
    for (const side of [1, -1]) {
      const list = (sides.get(side) ?? []).sort((a, b) => a.d - b.d);
      if (list.length >= 2) lines.push(list.map((e) => e.p));
    }
  }
  return { lines, pegs };
}

/** Klíč vytyčení jabloní – mění se jen s místy, která čekají na výsadbu. */
export function appleStakingKey(apples: readonly SceneRoadApple[]): string {
  return apples
    .filter((a) => a.stage === 'planting')
    .map((a) => a.id)
    .join(',');
}

/** Klíč vzhledu vylepšení – přestaví se jen při změně stupně, průběhu (po setinách) a os. */
export function roadWorksKey(roads: readonly SceneRoad[] | undefined): string {
  return (roads ?? [])
    .map(
      (r) =>
        `${r.id}:${r.grade}:${r.points.length}:${r.upgrade ? `${r.upgrade.grade}@${Math.round(r.upgrade.progress * 100)}` : ''}:${(r.ground?.wet ?? []).length},${(r.ground?.fords ?? []).length}`,
    )
    .join(';');
}
