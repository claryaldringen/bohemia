import { WAGON_ROAD } from '@bohemia/game';
import type { SceneEarthwork, SceneJunction, SceneRoad, SceneRoadApple } from '../village-view';
import { junctionRibbons } from './junction-shape';
import { junctionPatch, mergeGrids, type PatchArm } from './junction-patch';
import {
  CART_RUT_OFFSET_M,
  CART_WORN_LAYER,
  IMPROVED_EARTH_LAYER,
  IMPROVED_WORN_LAYER,
  ROAD_EARTH_LAYER,
  ROAD_WIDTH_M,
  ROAD_WORN_LAYER,
  WAGON_EARTH_LAYER,
  WAGON_WORN_LAYER,
  ribbonTrack,
  type RibbonLayer,
  type RibbonLine,
} from './path-ribbon';
import type { Track } from './track-mask';
import { hash01 } from './smoke-schedule';
import type { DecalGrid, Point } from './village-layout';

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

/** Krytí pásu cesty v bodě: bledý kus zarůstající cesty je slabší (`SceneRoad.fade`), jinak 1. */
function fadeAt(road: SceneRoad, p: { x: number; z: number }): number {
  let best = 1;
  let nearest = 12.5;
  for (const f of road.fade ?? []) {
    const d = Math.hypot(f.x - p.x, f.z - p.z);
    if (d <= nearest) {
      nearest = d;
      best = f.strength;
    }
  }
  return best;
}

/** Pás cesty: vyšlapaná, upravená (širší), vyšlapaná vozová (wagons.md), vozová cesta (roads.md). */
export type BandKind = 'trodden' | 'improved' | 'cart' | 'wagon';

/** Šířka pásu (m) – jako obtisk plné síly (ROAD_WORN_LAYER, IMPROVED_*, CART_WORN_LAYER). */
const BAND_WIDTH_M: Record<BandKind, number> = {
  trodden: ROAD_WIDTH_M.trodden,
  improved: ROAD_WIDTH_M.improved,
  cart: ROAD_WIDTH_M.cart,
  wagon: ROAD_WIDTH_M.wagon,
};

/**
 * Pásy cest pro obtisk: vyšlapané (plně vyšlapaná pěšina) a upravené (širší) – rozestavěná
 * úprava je upravená od začátku úseku (nebo konce – `fromEnd`) do průběhu stavby, dál vyšlapaná.
 * Vytrácí se jen skutečný volný konec (brána domu, cíl – `SceneRoad.openEnds`), ne konec, kde
 * navazuje jiný úsek nebo pěšina dne. Kde na sebe navazují pásy různé šířky (jiný stupeň či
 * vozová – cesta hráče, roads.md), širší se k užšímu plynule zúží (`narrowStart` / `narrowEnd`)
 * a koleje vozové cesty se vytratí.
 */
export function roadBands(
  roads: readonly SceneRoad[],
  cuts: readonly JunctionCut[] = [],
): {
  trodden: RibbonLine[];
  improved: RibbonLine[];
  /** Vyšlapaná vozová cesta (wagons.md – Vyjeté cesty) – širší, bez holé hlíny uprostřed. */
  cart: RibbonLine[];
  /** Koleje vozových cest (i upravených) – po CART_RUT_OFFSET_M na obě strany osy. */
  ruts: RibbonLine[];
  /** Vozová cesta (roads.md – Vozová cesta) – pás 3,5 m. */
  wagon: RibbonLine[];
  /** Zpevněné koleje vozové cesty – štěrk a kameny po CART_RUT_OFFSET_M od osy. */
  gravel: RibbonLine[];
  /** Ramena křižovatek (`cuts`) – kus osy od řezu pásu do středu, kreslí ho plácek. */
  arms: JunctionArmBand[];
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
    road: SceneRoad;
    /** Konce osy úseku před řezem u křižovatky – podle nich se hledají sousední pásy. */
    from: Pt;
    to: Pt;
    points: { x: number; z: number }[];
    strength: number[];
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
    const plain: BandKind =
      road.grade === 'wagon'
        ? 'wagon'
        : road.grade !== 'trodden'
          ? 'improved'
          : road.cart
            ? 'cart'
            : 'trodden';
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
        road,
        from: points[0]!,
        to: points[points.length - 1]!,
        points,
        strength: points.map((p) => fadeAt(road, p)),
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
  // křižovatky: pás končí v řezu (`JunctionCut.radius` od středu), kus osy do středu kreslí plácek
  const junctionEnds: { piece: Piece; end: 0 | 1; arm: JunctionArmBand }[] = [];
  const atCut = (p: Pt): number =>
    cuts.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) <= JUNCTION_END_M);
  for (const piece of pieces) {
    // úsek mezi dvěma křižovatkami, jejichž plácky se na něm překrývají (paths.md – Rozestup,
    // přijatá výjimka): plácky se o něj dělí v půli překryvu, ať ramena obou míří po ose úseku
    // a koleje vedou skrz (Vlkov 1387 mezi 1131 a 1619)
    const split = overlapSplit(piece.points, cuts, atCut);
    if (split) {
      piece.points = [];
      for (const [end, j, axis] of [
        [1, split.endJunction, split.toEnd],
        [0, split.startJunction, split.toStart],
      ] as const) {
        junctionEnds.push({
          piece,
          end,
          arm: { junction: j, kind: piece.kind, axis, strength: fadeAt(piece.road, axis[0]!) },
        });
      }
      continue;
    }
    for (const end of [1, 0] as const) {
      const pts = piece.points;
      if (pts.length < 2) continue;
      const j = atCut(end === 1 ? pts[pts.length - 1]! : pts[0]!);
      if (j < 0) continue;
      const toward = end === 1 ? pts : [...pts].reverse();
      const cut = cutAxisEnd(toward, cuts[j]!, cuts[j]!.radius);
      piece.points = end === 1 ? cut.kept : [...cut.kept].reverse();
      // celý krátký úsek v plácku: k volnému konci (branka) se rameno vytrácí jako pás
      const farOpen = end === 1 ? piece.openStart : piece.openEnd;
      junctionEnds.push({
        piece,
        end,
        arm: {
          junction: j,
          kind: piece.kind,
          axis: cut.inner,
          strength: fadeAt(piece.road, cut.inner[0]!),
          ...(cut.kept.length === 0 && farOpen
            ? { openM: Math.min(OPEN_FADE_M, roadLength({ points: cut.inner }) / 3) }
            : {}),
        },
      });
    }
  }
  for (const piece of pieces) piece.strength = piece.points.map((p) => fadeAt(piece.road, p));
  // koleje přes plácek: dvě ramena téhož druhu kolejí, mezi nimiž vede cesta skrz
  const rutKind = (piece: Piece): 'gravel' | 'ruts' | null =>
    piece.kind === 'wagon' ? 'gravel' : piece.cart ? 'ruts' : null;
  const throughs: { a: (typeof junctionEnds)[number]; b: (typeof junctionEnds)[number] }[] = [];
  const paired = new Set<(typeof junctionEnds)[number]>();
  junctionEnds.forEach((a, i) => {
    for (const b of junctionEnds.slice(i + 1)) {
      const kind = rutKind(a.piece);
      if (kind === null || a.arm.junction !== b.arm.junction || rutKind(b.piece) !== kind) continue;
      if (a.arm.openM !== undefined || b.arm.openM !== undefined) continue;
      const ta = armTangent(a.arm.axis);
      const tb = armTangent(b.arm.axis);
      if (ta.x * tb.x + ta.z * tb.z > -RUT_THROUGH_COS) continue;
      throughs.push({ a, b });
      paired.add(a);
      paired.add(b);
    }
  });
  const out = {
    trodden: [] as RibbonLine[],
    improved: [] as RibbonLine[],
    cart: [] as RibbonLine[],
    ruts: [] as RibbonLine[],
    wagon: [] as RibbonLine[],
    gravel: [] as RibbonLine[],
    arms: junctionEnds.map((e) => e.arm),
  };
  const addRuts = (list: RibbonLine[], line: RibbonLine): void => {
    for (const offset of [CART_RUT_OFFSET_M, -CART_RUT_OFFSET_M]) {
      const rut = offsetPolyline(line.points, offset).map(([x, z]) => ({ x, z }));
      list.push({ ...line, points: rut });
    }
  };
  for (const piece of pieces) {
    const { points } = piece;
    const own = junctionEnds.filter((e) => e.piece === piece);
    // celý úsek v plácích dvou křižovatek (`overlapSplit`) nemá pás, jen koleje z dělicího bodu
    const between = points.length < 2 && own.length === 2 && own.every((e) => !e.arm.openM);
    if (points.length < 2 && !between) continue;
    const before = neighbour(piece, piece.from);
    const after = neighbour(piece, piece.to);
    // konec v řezu křižovatky: pás tam začíná v plné šířce svého druhu, tak jako rameno plácku –
    // zúžení ze středu křižovatky by udělalo schod
    const cutAt = (end: 0 | 1): boolean =>
      junctionEnds.some((e) => e.piece === piece && e.end === end);
    const narrowStart = cutAt(0) ? undefined : narrowing(piece, before);
    const narrowEnd = cutAt(1) ? undefined : narrowing(piece, after);
    const line: RibbonLine = {
      points,
      strength: piece.strength,
      years: points.map(() => 0),
      openStart: piece.openStart,
      openEnd: piece.openEnd,
      ...(narrowStart !== undefined ? { narrowStart } : {}),
      ...(narrowEnd !== undefined ? { narrowEnd } : {}),
    };
    if (!between) out[piece.kind].push(line);
    const kind = rutKind(piece);
    if (kind === null) continue;
    // koleje se vytratí, kde vozová cesta přechází v jinou – i na plácku křižovatky, kudy
    // vozová cesta nevede skrz (koleje tam dojdou až ke středu a vytratí se)
    const other = (n: Piece | null): boolean =>
      n !== null && (kind === 'gravel' ? n.kind !== 'wagon' : !n.cart);
    let rutPoints = between ? [own[0]!.arm.axis[0]!] : points;
    let openStart = line.openStart || other(before);
    let openEnd = line.openEnd || other(after);
    for (const e of own) {
      if (paired.has(e)) continue;
      const inner = [...e.arm.axis].reverse();
      if (e.end === 1) {
        rutPoints = [...rutPoints, ...e.arm.axis.slice(1)];
        openEnd = true;
      } else {
        rutPoints = [...inner.slice(0, -1), ...rutPoints];
        openStart = true;
      }
    }
    // úsek mezi křižovatkami, kudy vozová cesta vede skrz obě: koleje kreslí oba průjezdy
    if (rutPoints.length < 2) continue;
    addRuts(out[kind], {
      points: rutPoints,
      strength: rutPoints.map((p) => fadeAt(piece.road, p)),
      years: rutPoints.map(() => 0),
      openStart,
      openEnd,
    });
  }
  for (const { a, b } of throughs) {
    const points = throughCurve(a.arm.axis, b.arm.axis);
    addRuts(out[rutKind(a.piece)!], {
      points,
      strength: points.map((_, k) => {
        const u = k / Math.max(1, points.length - 1);
        return a.arm.strength + (b.arm.strength - a.arm.strength) * u;
      }),
      years: points.map(() => 0),
      openStart: false,
      openEnd: false,
    });
  }
  return out;
}

/** Bod (m). */
type Pt = { x: number; z: number };

/** Křižovatka pro obtisk: střed a vzdálenost řezu pásů cest od středu (`junctionCuts`). */
export interface JunctionCut {
  x: number;
  z: number;
  radius: number;
}

/** Rameno křižovatky v obtisku: kus osy od řezu pásu (první bod) do středu, druh pásu a síla. */
export interface JunctionArmBand {
  /** Index křižovatky v `cuts`. */
  junction: number;
  kind: BandKind;
  axis: Pt[];
  strength: number;
  /** Krátký úsek celý v plácku s volným koncem (branka): rameno se k němu vytrácí na tolik m. */
  openM?: number;
}

/** Konec úseku je ve středu křižovatky, když je od něj nejvýš tolik (m). */
const JUNCTION_END_M = 0.3;
/** Koleje vedou přes plácek mezi rameny, která svírají aspoň 120° (zatáčka nejvýš 60°). */
const RUT_THROUGH_COS = 0.5;
/** Zbylo-li by z pásu za řezem méně než tolik (m), celý úsek patří plácku. */
const MIN_KEPT_M = 1;
/**
 * Volný konec pásu se vytrácí na takové délce (m) – jako `END_FADE_M` v path-ribbon.ts; krátké
 * rameno nejvýš na třetině délky, ať je cesta k brance vidět.
 */
const OPEN_FADE_M = 3;

/**
 * Konec osy u křižovatky (poslední bod je střed): osa do řezu `radius` m od středu a kus od řezu do
 * středu; když by z pásu zbylo méně než MIN_KEPT_M (krátký úsek, např. 5 m k brance), `kept` je
 * prázdné a celá osa je rameno plácku.
 */
export function cutAxisEnd(
  points: readonly Pt[],
  center: Pt,
  radius: number,
): { kept: Pt[]; inner: Pt[] } {
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i]!;
    if (Math.hypot(a.x - center.x, a.z - center.z) < radius) continue;
    const b = points[i + 1]!;
    // průsečík úsečky a–b s kružnicí řezu (a je venku, b uvnitř)
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const fx = a.x - center.x;
    const fz = a.z - center.z;
    const qa = dx * dx + dz * dz;
    const qb = 2 * (fx * dx + fz * dz);
    const qc = fx * fx + fz * fz - radius * radius;
    const t =
      qa > 0
        ? Math.min(1, Math.max(0, (-qb - Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa)))
        : 0;
    const cut = { x: a.x + dx * t, z: a.z + dz * t };
    const kept = t < 1e-6 ? points.slice(0, i + 1) : [...points.slice(0, i + 1), cut];
    const inner = t > 1 - 1e-6 ? points.slice(i + 1) : [cut, ...points.slice(i + 1)];
    if (kept.length < 2 || inner.length < 2 || roadLength({ points: kept }) < MIN_KEPT_M) break;
    return { kept, inner };
  }
  return { kept: [], inner: [...points] };
}

/**
 * Úsek, který začíná i končí v křižovatce a jehož řezy se překrývají (z pásu by mezi nimi zbylo
 * méně než MIN_KEPT_M): dělicí bod v půli překryvu po ose a ramena obou plácků od něj do středů
 * (`toEnd` ke křižovatce na konci osy, `toStart` k té na začátku). Jinak null – řeže se po koncích
 * (`cutAxisEnd`). Bez dělení by první řez sebral skoro celý úsek a rameno druhé křižovatky by
 * začínalo v zatáčce u ní – koleje by přes plácky nevedly skrz (Vlkov 1387, 2. 11. 2026).
 */
export function overlapSplit(
  points: readonly Pt[],
  cuts: readonly JunctionCut[],
  atCut: (p: Pt) => number,
): { startJunction: number; endJunction: number; toStart: Pt[]; toEnd: Pt[] } | null {
  if (points.length < 2) return null;
  const startJunction = atCut(points[0]!);
  const endJunction = atCut(points[points.length - 1]!);
  if (startJunction < 0 || endJunction < 0) return null;
  const at = lengthsAlong(points);
  const length = at[at.length - 1]!;
  const atEnd = cuts[endJunction]!;
  const atStart = cuts[startJunction]!;
  // poloha řezů po ose: konec pásu u křižovatky na konci a začátek u té na začátku
  const endCut = roadLength({ points: cutAxisEnd(points, atEnd, atEnd.radius).kept });
  const startCut =
    length -
    roadLength({ points: cutAxisEnd([...points].reverse(), atStart, atStart.radius).kept });
  if (endCut - startCut >= MIN_KEPT_M) return null;
  const s = (startCut + endCut) / 2;
  if (s < 1e-3 || s > length - 1e-3) return null;
  return {
    startJunction,
    endJunction,
    toStart: axisPart(points, 0, s).reverse(),
    toEnd: axisPart(points, s, length),
  };
}

/** Směr ramene v řezu – od středu ven. */
function armTangent(axis: readonly Pt[]): Pt {
  const a = axis[0]!;
  const b = axis[1]!;
  const l = Math.max(1e-6, Math.hypot(a.x - b.x, a.z - b.z));
  return { x: (a.x - b.x) / l, z: (a.z - b.z) / l };
}

/**
 * Osa kolejí přes plácek z řezu jednoho ramene do řezu druhého: kubická Bézierova křivka s tečnou
 * ve směru ramen (rovně proti sobě je to přímka středem), body po ≈ 0,5 m.
 */
export function throughCurve(from: readonly Pt[], to: readonly Pt[]): Pt[] {
  const a = from[0]!;
  const b = to[0]!;
  const ta = armTangent(from);
  const tb = armTangent(to);
  const center = from[from.length - 1]!;
  const reach =
    0.5 *
    Math.min(
      Math.hypot(a.x - center.x, a.z - center.z),
      Math.hypot(b.x - center.x, b.z - center.z),
    );
  const c1 = { x: a.x - ta.x * reach, z: a.z - ta.z * reach };
  const c2 = { x: b.x - tb.x * reach, z: b.z - tb.z * reach };
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
  return Array.from({ length: n + 1 }, (_, k) => {
    const u = k / n;
    const v = 1 - u;
    return {
      x: v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * b.x,
      z: v * v * v * a.z + 3 * v * v * u * c1.z + 3 * v * u * u * c2.z + u * u * u * b.z,
    };
  });
}

/** Vrstvy pásů podle druhu – plácek bere průřez navazujícího pásu (vyjetá vozová hlínu nemá). */
const PATCH_LAYERS: Record<'worn' | 'earth', Record<BandKind, RibbonLayer | null>> = {
  worn: {
    trodden: ROAD_WORN_LAYER,
    improved: IMPROVED_WORN_LAYER,
    cart: CART_WORN_LAYER,
    wagon: WAGON_WORN_LAYER,
  },
  earth: {
    trodden: ROAD_EARTH_LAYER,
    improved: IMPROVED_EARTH_LAYER,
    cart: null,
    wagon: WAGON_EARTH_LAYER,
  },
};

/**
 * Plácky křižovatek jedné vrstvy obtisku (prošlapaná tráva, hlína): ramena v šířce, měkkém okraji
 * a krytí pásu cesty, který do ramene vede – plácek navazuje na pásy bez řezu (junction-patch.ts).
 */
export function junctionPatchGrid(
  arms: readonly JunctionArmBand[],
  cuts: readonly JunctionCut[],
  decal: 'worn' | 'earth',
): DecalGrid {
  const grids = cuts.flatMap((cut, j) => {
    const patchArms = arms
      .filter((a) => a.junction === j)
      .flatMap((a): PatchArm[] => {
        const layer = PATCH_LAYERS[decal][a.kind];
        if (!layer) return [];
        const width = layer.width.weak + (layer.width.strong - layer.width.weak) * a.strength;
        return [
          {
            axis: a.axis,
            half: (width / 2) * layer.widthFactor,
            softM: layer.softM,
            alpha: layer.alpha(a.strength),
            ...(a.openM !== undefined ? { openM: a.openM } : {}),
          },
        ];
      });
    return patchArms.length > 0 ? [junctionPatch(cut, patchArms)] : [];
  });
  return mergeGrids(grids);
}

/**
 * Pás pevných cest pro masku polí (track-mask.ts – pod cestou obilí neroste): vyšlapané, upravené
 * a vozové úseky v šířce prošlapané trávy obtisku (`ROAD_WORN_LAYER`, `IMPROVED_WORN_LAYER`,
 * `CART_WORN_LAYER` – šířky ROAD_LAND jako plocha, kterou cesta poli bere) a plácky rozcestí –
 * stejné průřezy jako obtisk cesty (`roadRibbonMeshes`).
 */
export function roadTrack(
  roads: readonly SceneRoad[],
  junctionList: readonly SceneJunction[] = [],
): Track {
  const bands = roadBands(roads);
  const junctions = junctionRibbons(junctionList, roads);
  const parts = [
    ribbonTrack(bands.trodden, ROAD_WORN_LAYER, undefined, undefined, junctions.trodden),
    ribbonTrack(bands.improved, IMPROVED_WORN_LAYER, undefined, undefined, junctions.improved),
    ribbonTrack(bands.cart, CART_WORN_LAYER, undefined, undefined, junctions.cart),
    ...(bands.wagon.length > 0 ? [ribbonTrack(bands.wagon, WAGON_WORN_LAYER)] : []),
  ];
  const counts = [
    bands.trodden.length + junctions.trodden.length,
    bands.improved.length + junctions.improved.length,
    bands.cart.length + junctions.cart.length,
    bands.wagon.length,
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
  // hať a lávka jsou součástí úpravy – má je každá upravená cesta, která není `unbridged`
  if (road.grade === 'improved' && !road.unbridged) return 1;
  return road.upgrade?.grade === 'improved' && road.grade !== 'wagon' ? road.upgrade.progress : 0;
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
      road.grade === 'trodden'
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

/** Vytyčení vozové cesty – po okrajích vozovky (m od osy). */
export const WAGON_STAKING_OFFSET_M = WAGON_ROAD.bedHalfM + 0.25;

/**
 * Vytyčení vozové cesty (roads.md – Vozová cesta; Martin – kolíky a provázek hned od zadání): po
 * obou okrajích vozovky na ose zemních prací, která ještě není hotová (od hotové délky dál), a na
 * celé trase náhledu (`preview` – vybraná cesta hráče před zadáním).
 */
export function wagonStakingLines(
  earthworks: readonly Pick<SceneEarthwork, 'profile' | 'shownM' | 'building'>[],
  preview: readonly (readonly { x: number; z: number }[])[],
): Point[][] {
  const out: Point[][] = [];
  const stake = (points: readonly { x: number; z: number }[], from: number): void => {
    const length = lengthsAlong(points).at(-1) ?? 0;
    if (length - from < 1) return;
    const part = axisPart(points, from, length);
    out.push(
      offsetPolyline(part, WAGON_STAKING_OFFSET_M),
      offsetPolyline(part, -WAGON_STAKING_OFFSET_M),
    );
  };
  for (const e of earthworks) if (e.building) stake(e.profile, e.shownM);
  for (const line of preview) if (line.length >= 2) stake(line, 0);
  return out;
}

/** Klíč vytyčení vozových cest – hotová délka po decimetrech a náhled. */
export function wagonStakingKey(
  earthworks: readonly Pick<SceneEarthwork, 'id' | 'shownM' | 'building'>[],
  preview: readonly (readonly { x: number; z: number }[])[],
): string {
  const works = earthworks
    .filter((e) => e.building)
    .map((e) => `${e.id}@${Math.round(e.shownM * 10)}`)
    .join(',');
  const lines = preview
    .filter((p) => p.length >= 2)
    .map((p) => `${p.length}:${p[0]!.x},${p[0]!.z}:${p.at(-1)!.x},${p.at(-1)!.z}`)
    .join(',');
  return `${works}|${lines}`;
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
        `${r.id}:${r.grade}${r.unbridged ? 'u' : ''}${r.abandoned ? 'x' : ''}:${r.points.length}:${(r.fade ?? []).map((f) => f.strength).join(',')}:${r.upgrade ? `${r.upgrade.grade}@${Math.round(r.upgrade.progress * 100)}${r.upgrade.fromEnd ? '<' : ''}` : ''}:${(r.ground?.wet ?? []).length},${(r.ground?.fords ?? []).length}`,
    )
    .join(';');
}

/** Svahy úvozu a náspu sahají nejvýš tolik od osy (m) – jako úpravy terénu v jádru. */
const SLOPE_REACH_M = WAGON_ROAD.flatHalfM + 7;
/** Krok příčného řezu svahů (m). */
const SLOPE_STEP_M = 0.5;
/**
 * Vzhled svahů úvozu a náspu (roads.md – Vozová cesta, Martin 22. 10. 2026: „Náspy a úvozy musí být
 * výrazně vidět“): holá hlína zarůstá pomalu – za `grassYears` let jen řídkou trávou (zbude
 * `oldAlpha` krytí hlíny), nikdy úplně; lem hrany úvozu a paty náspu je široký `edgeM` m. Zemní
 * práce bez cesty (přestavba sítě – paths.md) zaroste celá i s lemem za `wildYears` let jako
 * opuštěná cesta (návrh Clauda 24. 10. 2026).
 */
export const SLOPE_LOOK = { grassYears: 15, oldAlpha: 0.45, edgeM: 0.6, wildYears: 5 };
/**
 * Strmost úpravy napříč osou (změna odchylky terénu PROTI PŮVODNÍMU terénu na metr – boční sklon
 * terénu se tím odečte, výkop 0,8 m a násep 1 m jsou strmé stejně na rovině i na svahu 50 %),
 * od které je hlína svahu vidět a od které plně: svah 1 : 1 je plně vidět, mírné dorovnání
 * terénu (plochá pláň, pár cm na šířku pláně) hlínu nemá – jinak by z něj byla široká tmavá šmouha
 * mimo cestu. Strmost se bere jako největší v okolí ±1 řezu, ať ji nezředí vyhlazený terén.
 */
const SLOPE_GRADE = { from: 0.08, full: 0.25 } as const;
/** Konec osy, ke kterému do tolika metrů dosahuje jiná osa, na ni navazuje a nevytrácí se. */
const SLOPE_JOIN_M = 1;
/** Lem okraje: odchylka terénu (m), do které se místo bere za okraj svahu (a nad kterou už ne). */
const EDGE_DIFF_M = { full: 0.1, none: 0.3 } as const;
/**
 * Svahy se ke krajům sítě – konce hotové osy a kraje řezu – vytrácejí na takové délce (m): obtisk
 * nemá rovnou hranu po řezech, kde úprava terénu pokračuje (sousední zemní práce u křižovatky).
 */
const SLOPE_FADE_M = 1.5;
/**
 * Překryv řezů (sousední zemní práce, vnitřek ostrého oblouku): bod řezu, ke kterému je nějaká
 * osa blíž než jeho vlastní, se vytrácí mezi tolika metry rozdílu – každé místo kreslí jen
 * nejbližší osa, krytí se nesčítá do tmavších skvrn.
 */
const SLOPE_OVERLAP_M = { from: 0.25, none: 1 } as const;

function smooth(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Krytí bodů jednoho řezu: odchylky terénu (m, kladná = násep), strmosti a podíl zarostlosti. */
type SectionAlphas = (
  diffs: readonly number[],
  grades: readonly number[],
  grass: number,
) => number[];

interface SlopeLattice {
  positions: Float32Array;
  alphas: Float32Array;
  indices: Uint32Array;
}

/** Vzdálenost bodu od úsečky (m). */
function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  const ex = x - (ax + dx * t);
  const ez = z - (az + dz * t);
  return Math.sqrt(ex * ex + ez * ez);
}

/** Vzdálenost k nejbližší hotové ose zemních prací – úsečky v přihrádkách po SLOPE_REACH_M. */
export function nearestAxis(
  axes: readonly { x: number; z: number }[][],
): (x: number, z: number) => number {
  const cell = SLOPE_REACH_M;
  const bins = new Map<string, [number, number, number, number][]>();
  for (const axis of axes) {
    for (let k = 1; k < axis.length; k++) {
      const a = axis[k - 1]!;
      const b = axis[k]!;
      const i0 = Math.floor(Math.min(a.x, b.x) / cell);
      const i1 = Math.floor(Math.max(a.x, b.x) / cell);
      const j0 = Math.floor(Math.min(a.z, b.z) / cell);
      const j1 = Math.floor(Math.max(a.z, b.z) / cell);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = `${i},${j}`;
          const list = bins.get(key) ?? [];
          list.push([a.x, a.z, b.x, b.z]);
          bins.set(key, list);
        }
      }
    }
  }
  return (x, z) => {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    let best = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (const [ax, az, bx, bz] of bins.get(`${i},${j}`) ?? []) {
          best = Math.min(best, distanceToSegment(x, z, ax, az, bx, bz));
        }
      }
    }
    return best;
  };
}

/**
 * Hotové osy zemních prací, vzdálenost k nejbližší (`distance`) a k nejbližší zemní práci vozové
 * cesty (`live` – bez opuštěných) a které jejich konce navazují na jinou osu.
 */
interface SlopeContext {
  shown: SceneEarthwork[];
  distance: (x: number, z: number) => number;
  live: (x: number, z: number) => number;
  joined: Map<SceneEarthwork, { start: boolean; end: boolean }>;
}

const contexts = new WeakMap<readonly SceneEarthwork[], SlopeContext>();

/** Společné podklady svahů – staví se jednou pro dané zemní práce (svahy i lem). */
function slopeContext(earthworks: readonly SceneEarthwork[]): SlopeContext {
  const cached = contexts.get(earthworks);
  if (cached) return cached;
  const shown = earthworks.filter((e) => e.profile.length >= 2 && e.shownM > 0);
  const axes = shown.map((e) => {
    const at = lengthsAlong(e.profile);
    return e.profile.filter((_, k) => at[k]! <= e.shownM + 1e-6);
  });
  // konec zemní práce vozové cesty nenavazuje na opuštěnou (ta zarůstá) – vytrácí se jako volný
  const joinedTo = (self: number, p: { x: number; z: number }): boolean =>
    axes.some((axis, o) => {
      if (o === self) return false;
      if (shown[o]!.abandonedYears !== undefined && shown[self]!.abandonedYears === undefined) {
        return false;
      }
      for (let k = 1; k < axis.length; k++) {
        const a = axis[k - 1]!;
        const b = axis[k]!;
        if (distanceToSegment(p.x, p.z, a.x, a.z, b.x, b.z) <= SLOPE_JOIN_M) return true;
      }
      return false;
    });
  const joined = new Map<SceneEarthwork, { start: boolean; end: boolean }>();
  shown.forEach((e, i) => {
    const axis = axes[i]!;
    const at = lengthsAlong(e.profile);
    const endM = Math.min(e.shownM, at[at.length - 1]!);
    joined.set(e, {
      start: axis.length > 0 && joinedTo(i, axis[0]!),
      end: axis.length > 0 && endM > 0 && joinedTo(i, axisAt(e.profile, endM)),
    });
  });
  const live = nearestAxis(axes.filter((_, i) => shown[i]!.abandonedYears === undefined));
  const context = { shown, distance: nearestAxis(axes), live, joined };
  contexts.set(earthworks, context);
  return context;
}

/**
 * Síť příčných řezů podél hotové části osy (`shownM` – i rozestavěný úsek podle průběhu) po bodech
 * profilu; `alphasOf` dostane odchylky terénu proti původnímu v řezu (m, kladná = násep), jejich
 * strmost napříč a podíl zarostlosti 0–1 a vrátí krytí. Krytí se ke krajům sítě vytrácí
 * (SLOPE_FADE_M) a kde je blíž jiná osa, kreslí ji jen ta (SLOPE_OVERLAP_M). Bez krytí null.
 */
function slopeLattice(
  earthworks: readonly SceneEarthwork[],
  height: (x: number, z: number) => number,
  base: (x: number, z: number) => number,
  scale: number,
  alphasOf: SectionAlphas,
): SlopeLattice | null {
  const positions: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  const lanes = Math.round((2 * SLOPE_REACH_M) / SLOPE_STEP_M) + 1;
  const { shown, distance, live, joined } = slopeContext(earthworks);
  for (const e of shown) {
    // zemní práce bez cesty zarůstá celá (SLOPE_LOOK.wildYears); kde vede živá, kreslí jen ta
    const abandoned = e.abandonedYears !== undefined;
    const wild = abandoned ? 1 - smooth(0, SLOPE_LOOK.wildYears, e.abandonedYears!) : 1;
    if (wild <= 0) continue;
    const join = joined.get(e)!;
    const profile = e.profile;
    const at = lengthsAlong(profile);
    const endM = Math.min(e.shownM, at[at.length - 1]!);
    const ageAt = (d: number): number => {
      let from = 0;
      for (const piece of e.pieces) {
        if (d <= piece.toM + 1e-6) return d >= from ? (piece.ageYears ?? 0) : 0;
        from = piece.toM;
      }
      return 0;
    };
    let previous = -1;
    for (let k = 0; k < profile.length; k++) {
      if (at[k]! > e.shownM + 1e-6) break;
      const p = profile[k]!;
      const a = profile[Math.max(0, k - 1)]!;
      const b = profile[Math.min(profile.length - 1, k + 1)]!;
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / tl;
      const nz = (b.x - a.x) / tl;
      const grass = Math.min(1, ageAt(at[k]!) / SLOPE_LOOK.grassYears);
      // konec, na který navazuje další zemní práce, se nevytrácí (mezera mezi úseky)
      const ends = Math.min(
        join.start ? 1 : at[k]! / SLOPE_FADE_M,
        join.end ? 1 : (endM - at[k]!) / SLOPE_FADE_M,
        1,
      );
      const start = positions.length / 2;
      const diffs: number[] = [];
      for (let l = 0; l < lanes; l++) {
        const t = -SLOPE_REACH_M + l * SLOPE_STEP_M;
        const x = p.x + nx * t;
        const z = p.z + nz * t;
        positions.push(x, z);
        diffs.push((height(x, z) - base(x, z)) / scale);
      }
      const central = diffs.map((_, l) => {
        const lo = Math.max(0, l - 1);
        const hi = Math.min(lanes - 1, l + 1);
        return Math.abs(diffs[hi]! - diffs[lo]!) / ((hi - lo) * SLOPE_STEP_M);
      });
      const grades = central.map((_, l) =>
        Math.max(central[Math.max(0, l - 1)]!, central[l]!, central[Math.min(lanes - 1, l + 1)]!),
      );
      const section = alphasOf(diffs, grades, grass);
      for (let l = 0; l < lanes; l++) {
        const t = Math.abs(-SLOPE_REACH_M + l * SLOPE_STEP_M);
        let alpha =
          section[l]! * wild * Math.max(0, ends) * Math.min(1, (SLOPE_REACH_M - t) / SLOPE_FADE_M);
        if (alpha > 0) {
          const x = positions[(start + l) * 2]!;
          const z = positions[(start + l) * 2 + 1]!;
          // živá zemní práce ustoupí jen živé, opuštěná každé bližší a celá živé v dosahu svahů
          const closer = t - (abandoned ? distance(x, z) : live(x, z));
          alpha *= 1 - smooth(SLOPE_OVERLAP_M.from, SLOPE_OVERLAP_M.none, closer);
          if (abandoned) alpha *= smooth(SLOPE_REACH_M - SLOPE_FADE_M, SLOPE_REACH_M, live(x, z));
        }
        alphas.push(alpha);
      }
      if (previous >= 0) {
        for (let l = 0; l < lanes - 1; l++) {
          const a0 = previous + l;
          const b0 = start + l;
          indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
      previous = start;
    }
  }
  if (indices.length === 0 || !alphas.some((v) => v > 0)) return null;
  return {
    positions: new Float32Array(positions),
    alphas: new Float32Array(alphas),
    indices: new Uint32Array(indices),
  };
}

/**
 * Holá hlína na svazích úvozu a náspu vozové cesty: krytí podle strmosti úpravy terénu napříč osou
 * (`height` po úpravě proti `base` původnímu – m s převýšením scény, `scale` převýšení) – svah
 * 1 : 1 plně, mírné dorovnání pláně ne – a podle stáří úseku (`SLOPE_LOOK`). Bez svahů null.
 */
export function earthworkSlopeGrid(
  earthworks: readonly SceneEarthwork[],
  height: (x: number, z: number) => number,
  base: (x: number, z: number) => number,
  scale: number,
): SlopeLattice | null {
  return slopeLattice(earthworks, height, base, scale, (diffs, grades, grass) => {
    const fade = 1 - (1 - SLOPE_LOOK.oldAlpha) * grass * grass * (3 - 2 * grass);
    return grades.map((g) => smooth(SLOPE_GRADE.from, SLOPE_GRADE.full, g) * fade);
  });
}

/**
 * Lem okraje svahů: `cut` – hrana úvozu (světlý), `fill` – pata náspu (tmavý). Pás řezu ≈
 * `SLOPE_LOOK.edgeM` tam, kde svah potká původní terén: odchylka do EDGE_DIFF_M a vedle strmý
 * svah (jen vně svahu), bez zarůstání. Mírné dorovnání terénu lem nemá. Bez lemu null.
 */
export function earthworkEdges(
  earthworks: readonly SceneEarthwork[],
  height: (x: number, z: number) => number,
  base: (x: number, z: number) => number,
  scale: number,
): { cut: SlopeLattice | null; fill: SlopeLattice | null } {
  const edge = (sign: 1 | -1): SlopeLattice | null =>
    slopeLattice(earthworks, height, base, scale, (diffs, grades) =>
      diffs.map((diff, l) => {
        const inner = [l - 1, l + 1]
          .filter((n) => n >= 0 && n < diffs.length)
          .reduce((best, n) => (Math.abs(diffs[n]!) > Math.abs(diffs[best]!) ? n : best), l);
        // jen vně svahu: soused blíž ose je hlubší (vyšší) a má znaménko lemu
        if (inner === l || diffs[inner]! * sign <= 0) return 0;
        return (
          smooth(SLOPE_GRADE.from, SLOPE_GRADE.full, grades[inner]!) *
          (1 - smooth(EDGE_DIFF_M.full, EDGE_DIFF_M.none, Math.abs(diff)))
        );
      }),
    );
  return { cut: edge(-1), fill: edge(1) };
}

/** Klíč svahů vozových cest – hotová délka po decimetrech a stáří úseků. */
export function earthworkSlopeKey(earthworks: readonly SceneEarthwork[]): string {
  return earthworks
    .map(
      (e) =>
        `${e.id}@${Math.round(e.shownM * 10)}:${e.pieces.map((p) => Math.min(SLOPE_LOOK.grassYears, p.ageYears ?? 0)).join(',')}${e.abandonedYears !== undefined ? `x${Math.min(SLOPE_LOOK.wildYears, e.abandonedYears)}` : ''}`,
    )
    .join(';');
}
