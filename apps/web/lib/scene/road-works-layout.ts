import type { RoadGrade } from '@bohemia/game';
import type { SceneRoad, SceneRoadApple } from '../village-view';
import {
  CART_RUT_OFFSET_M,
  CART_WORN_LAYER,
  IMPROVED_WORN_LAYER,
  JUNCTION,
  ROAD_WIDTH_M,
  ROAD_WORN_LAYER,
  ribbonTrack,
  type RibbonJunction,
  type RibbonLine,
} from './path-ribbon';
import type { Track } from './track-mask';
import { hash01 } from './smoke-schedule';
import type { Point } from './village-layout';

// Vylepšené pevné cesty ve scéně bez Babylonu (docs/design/roads.md – Co hráč vidí): upravená
// cesta je jen širší vyšlapaná cesta (Martin, 19. 10. 2026: „upravená cesta ať je prostě jenom
// širší – ta odvodňovací strouha vypadá divně, zrušíme ji“ – pás kreslí obtisky, tady nic), hať
// jsou kmeny napříč přes mokřinu na celou šířku upravené cesty, lávka z kmenů přes brod.
// Rozestavěné vylepšení: vytyčení kolíky a provázkem od zadání (Martin – u všech staveb) po
// okrajích širší cesty, upravená cesta roste od začátku úseku, kmeny hatě se kladou po mokřině,
// lávka nejdřív kůly a prahy, pak kmeny. Čisté funkce – rozměry dílů musí sedět
// s tools/blender/roads.py.

/** Kmen hatě (road-log.glb): délka modelu napříč cestou (m) a rozestup kmenů podél osy (m). */
export const LOG_LENGTH_M = 2.6;
export const LOG_SPACING_M = 0.24;
/**
 * Kmeny hatě se zvětší na šířku upravené cesty (hať na ni navazuje bez zúžení) – i rozestup,
 * ať se silnější kmeny nepřekrývají.
 */
export const LOG_SCALE = ROAD_WIDTH_M.improved / LOG_LENGTH_M;
/** Lávka (road-bridge.glb) – délka podél osy (m). */
export const BRIDGE_LENGTH_M = 5.2;
/** Vytyčení: provázek po obou okrajích upravené cesty (m od osy). */
export const STAKING_OFFSET_M = ROAD_WIDTH_M.improved / 2 + 0.2;
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

/**
 * Upravená část rozestavěné úpravy úseku [od, do] (m po ose): roste od začátku osy, nebo od konce
 * (`upgrade.fromEnd` – úsek leží v cestě hráče obráceně, stavba jde po cestě); jinak null.
 */
function improvedPart(road: SceneRoad, length: number): [number, number] | null {
  const up = road.upgrade;
  if (!up || up.grade !== 'improved' || road.grade !== 'trodden') return null;
  const done = up.progress * length;
  return up.fromEnd ? [length - done, length] : [0, done];
}

/** Stupeň, který úsek ukazuje ve vzdálenosti `d` od začátku (rozestavěná úprava roste po cestě). */
function shownGrade(road: SceneRoad, d: number): RoadGrade {
  const part = improvedPart(road, roadLength(road));
  if (!part) return road.grade;
  return d >= part[0] - 1e-6 && d <= part[1] + 1e-6 ? 'improved' : road.grade;
}

/** Pás cesty: vyšlapaná, upravená (širší), vyšlapaná vozová (wagons.md). */
type BandKind = 'trodden' | 'improved' | 'cart';

/** Šířka pásu (m) – jako obtisk plné síly (ROAD_WORN_LAYER, IMPROVED_*, CART_WORN_LAYER). */
const BAND_WIDTH_M: Record<BandKind, number> = {
  trodden: ROAD_WIDTH_M.trodden,
  improved: ROAD_WIDTH_M.improved,
  cart: ROAD_WIDTH_M.cart,
};

/**
 * Pásy cest pro obtisk: vyšlapané (plně vyšlapaná pěšina) a upravené (širší) – rozestavěná
 * úprava je upravená od začátku úseku (nebo konce – `fromEnd`) do průběhu stavby, dál vyšlapaná.
 * Vytrácí se jen skutečný volný konec (brána domu, cíl – `SceneRoad.openEnds`), ne konec, kde
 * navazuje jiný úsek nebo pěšina dne. Kde na sebe navazují pásy různé šířky (jiný stupeň či
 * vozová – cesta hráče, roads.md), širší se k užšímu plynule zúží (`narrowStart` / `narrowEnd`)
 * a koleje vozové cesty se vytratí.
 */
export function roadBands(roads: readonly SceneRoad[]): {
  trodden: RibbonLine[];
  improved: RibbonLine[];
  /** Vyšlapaná vozová cesta (wagons.md – Vyjeté cesty) – širší, bez holé hlíny uprostřed. */
  cart: RibbonLine[];
  /** Koleje vozových cest (i upravených) – po CART_RUT_OFFSET_M na obě strany osy. */
  ruts: RibbonLine[];
} {
  const ends = roads.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]);
  const joined = (p: { x: number; z: number } | undefined, own: number): boolean =>
    p !== undefined &&
    ends.some(
      (q, i) =>
        Math.floor(i / 2) !== own && q !== undefined && Math.hypot(q.x - p.x, q.z - p.z) <= 0.5,
    );
  // volný konec – brána domu nebo cíl (jádro: `openEnds`); bez údaje každý konec, kde nekončí
  // jiný úsek. Kde navazuje jiný úsek nebo pokračuje pěšina dne, pás se nevytrácí.
  const isOpen = (road: SceneRoad, k: number, end: 0 | 1): boolean => {
    const p = end === 0 ? road.points[0] : road.points[road.points.length - 1];
    if (joined(p, k)) return false;
    return road.openEnds ? road.openEnds[end] : true;
  };
  interface Piece {
    points: { x: number; z: number }[];
    kind: BandKind;
    cart: boolean;
    openStart: boolean;
    openEnd: boolean;
  }
  const pieces: Piece[] = [];
  roads.forEach((road, k) => {
    if (road.points.length < 2) return;
    const length = roadLength(road);
    const part = improvedPart(road, length);
    const plain: BandKind = road.grade !== 'trodden' ? 'improved' : road.cart ? 'cart' : 'trodden';
    const spans: { from: number; to: number; kind: BandKind }[] = part
      ? [
          { from: 0, to: part[0], kind: plain },
          { from: part[0], to: part[1], kind: 'improved' as const },
          { from: part[1], to: length, kind: plain },
        ].filter((p) => p.to - p.from > 1e-6)
      : [{ from: 0, to: length, kind: plain }];
    for (const span of spans) {
      const points = axisPart(road.points, span.from, span.to);
      if (points.length < 2) continue;
      pieces.push({
        points,
        kind: span.kind,
        cart: road.cart === true,
        openStart: span.from < 1e-6 && isOpen(road, k, 0),
        openEnd: span.to > length - 1e-6 && isOpen(road, k, 1),
      });
    }
  });
  // konce pásů po uzlech – přechod mezi dvěma pásy (právě dva konce), ne rozcestí
  const key = (p: { x: number; z: number }): string =>
    `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
  const nodes = new Map<string, Piece[]>();
  for (const piece of pieces) {
    for (const p of [piece.points[0]!, piece.points[piece.points.length - 1]!]) {
      const list = nodes.get(key(p));
      if (list) list.push(piece);
      else nodes.set(key(p), [piece]);
    }
  }
  const neighbour = (piece: Piece, p: { x: number; z: number }): Piece | null => {
    const list = nodes.get(key(p)) ?? [];
    if (list.length !== 2) return null;
    const other = list[0] === piece ? list[1]! : list[0]!;
    return other === piece ? null : other;
  };
  const narrowing = (piece: Piece, other: Piece | null): number | undefined => {
    if (!other) return undefined;
    const ratio = BAND_WIDTH_M[other.kind] / BAND_WIDTH_M[piece.kind];
    return ratio < 1 - 1e-6 ? ratio : undefined;
  };
  const out = {
    trodden: [] as RibbonLine[],
    improved: [] as RibbonLine[],
    cart: [] as RibbonLine[],
    ruts: [] as RibbonLine[],
  };
  for (const piece of pieces) {
    const { points } = piece;
    const before = neighbour(piece, points[0]!);
    const after = neighbour(piece, points[points.length - 1]!);
    const narrowStart = narrowing(piece, before);
    const narrowEnd = narrowing(piece, after);
    const line: RibbonLine = {
      points,
      strength: points.map(() => 1),
      years: points.map(() => 0),
      openStart: piece.openStart,
      openEnd: piece.openEnd,
      ...(narrowStart !== undefined ? { narrowStart } : {}),
      ...(narrowEnd !== undefined ? { narrowEnd } : {}),
    };
    out[piece.kind].push(line);
    if (piece.cart) {
      // koleje se vytratí, kde vozová cesta přechází v jinou
      const rutLine = {
        ...line,
        openStart: line.openStart || (before !== null && !before.cart),
        openEnd: line.openEnd || (after !== null && !after.cart),
      };
      delete rutLine.narrowStart;
      delete rutLine.narrowEnd;
      for (const offset of [CART_RUT_OFFSET_M, -CART_RUT_OFFSET_M]) {
        const rut = offsetPolyline(points, offset).map(([x, z]) => ({ x, z }));
        out.ruts.push({ ...rutLine, points: rut });
      }
    }
  }
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
  cart: RibbonJunction[];
} {
  const nodes = new Map<
    string,
    { x: number; z: number; count: number; improved: boolean; cart: boolean }
  >();
  for (const road of roads) {
    if (road.points.length < 2) continue;
    const length = roadLength(road);
    for (const [p, d] of [
      [road.points[0]!, 0],
      [road.points[road.points.length - 1]!, length],
    ] as const) {
      const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
      const node = nodes.get(key) ?? { x: p.x, z: p.z, count: 0, improved: false, cart: false };
      node.count++;
      node.improved ||= shownGrade(road, d) !== 'trodden';
      node.cart ||= road.cart === true;
      nodes.set(key, node);
    }
  }
  const out = {
    trodden: [] as RibbonJunction[],
    improved: [] as RibbonJunction[],
    cart: [] as RibbonJunction[],
  };
  for (const node of nodes.values()) {
    if (node.count < JUNCTION.minLines) continue;
    const list = node.improved ? out.improved : node.cart ? out.cart : out.trodden;
    list.push({ x: node.x, z: node.z, strength: 1 });
  }
  return out;
}

/**
 * Pás pevných cest pro masku polí (track-mask.ts – pod cestou obilí neroste): vyšlapané, upravené
 * a vozové úseky v šířce prošlapané trávy obtisku (`ROAD_WORN_LAYER`, `IMPROVED_WORN_LAYER`,
 * `CART_WORN_LAYER` – šířky ROAD_LAND jako plocha, kterou cesta poli bere) a plácky rozcestí –
 * stejné průřezy jako obtisk cesty (`roadRibbonMeshes`).
 */
export function roadTrack(roads: readonly SceneRoad[]): Track {
  const bands = roadBands(roads);
  const junctions = roadJunctions(roads);
  const parts = [
    ribbonTrack(bands.trodden, ROAD_WORN_LAYER, undefined, undefined, junctions.trodden),
    ribbonTrack(bands.improved, IMPROVED_WORN_LAYER, undefined, undefined, junctions.improved),
    ribbonTrack(bands.cart, CART_WORN_LAYER, undefined, undefined, junctions.cart),
  ];
  const counts = [
    bands.trodden.length + junctions.trodden.length,
    bands.improved.length + junctions.improved.length,
    bands.cart.length + junctions.cart.length,
  ];
  // čáry každé vrstvy za předchozími (klíče bloků podle čar)
  const segments: Track['segments'] = [];
  const discs: Track['discs'] = [];
  let offset = 0;
  parts.forEach((track, k) => {
    segments.push(...track.segments.map((s) => ({ ...s, line: s.line + offset })));
    discs.push(...track.discs.map((d) => ({ ...d, line: d.line + offset })));
    offset += counts[k]!;
  });
  return { segments, discs };
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

/** Podíl hotové hatě a lávky 0–1 (hotová hať 1, rozestavěná podle průběhu, jinak 0). */
function causewayShare(road: SceneRoad): number {
  if (road.grade === 'causeway') return 1;
  return road.upgrade?.grade === 'causeway' ? road.upgrade.progress : 0;
}

/**
 * Kmeny hatě napříč cestou po mokřině (roads.md – hať): na šířku upravené cesty (LOG_SCALE) po
 * LOG_SPACING_M × LOG_SCALE, rozestavěná hať je položená od začátku mokřiny po podíl průběhu
 * stavby (po celé délce mokřiny úseku).
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
      const step = LOG_SPACING_M * LOG_SCALE;
      for (let d = a; d <= b && laid > 0; d += step, laid -= step) {
        const p = axisAt(road.points, d);
        const key = Math.round(d * 10);
        out.push({
          x: p.x,
          z: p.z,
          rotationY: acrossRotation(p.tx, p.tz) + (hash01(road.id, key, 85) - 0.5) * 0.12,
          scale: LOG_SCALE * (0.96 + hash01(road.id, key, 86) * 0.08),
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
    const done = up.progress * length;
    const spans: [number, number][] =
      up.grade === 'improved'
        ? [up.fromEnd ? [0, length - done] : [done, length]]
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
        `${r.id}:${r.grade}:${r.points.length}:${r.upgrade ? `${r.upgrade.grade}@${Math.round(r.upgrade.progress * 100)}${r.upgrade.fromEnd ? '<' : ''}` : ''}:${(r.ground?.wet ?? []).length},${(r.ground?.fords ?? []).length}`,
    )
    .join(';');
}
