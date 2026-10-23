// Pohřebiště ve scéně bez Babylonu (cemetery.md – Co hráč vidí): nízký proutěný plot kolem
// čtverců s brankou k vsi, hliněné mohylky (žárové hroby 6.–8. století) přibývající, jak se
// pohřebiště plní, a fáze založení (vytyčení → kůly → pletení plotu). Souřadnice světa scény
// v metrech (x, z), čtverce jako u pole (field-cells.ts). Plot je pletený plot společný
// s pozemkem polozemnice (woven-fence.ts) – zakulacené rohy, jen hustší pletivo. Natočený
// hřbitov (fields.md – Natočené stavby): obrys a hroby se počítají v „rovném prostoru“ jeho
// mřížky (field-cells.ts – `GridFrame`) a otočí se do světa; plot se plete už ve světě.
// Mohyly podle významu (cemetery.md – Martin 19. 10. 2026): místo a velikost určí jádro
// (`placeMound`), tady se jen spočítá střed (`gravePlaceCenter` z jádra), natočení a měřítko;
// staré hroby (pohřbení před mohylami) zůstávají po řadách jako dřív (`gravePlacements`).
import {
  CEMETERY_FENCE_INSET_M,
  CEMETERY_GATE,
  GRAVE_PLACES,
  MOUND_SIZES,
  gravePlaceCenter,
  type MoundSize,
} from '@bohemia/game';
import { gridFrame, type CellSquare, type GridFrame } from './field-cells';
import { seededRandom, type Point } from './village-layout';
import {
  WOVEN_CORNER_RADIUS_M,
  wovenFence,
  type FencePath,
  type FenceStyle,
  type WovenFence,
} from './woven-fence';

/**
 * Hroby ve čtverci po řadách: 7 × 8 = 56 míst – z jádra (GRAVE_PLACES = CEMETERY.gravesPerSquare,
 * hlídá test); místo ≈ 2 × 1,75 m.
 */
export const GRAVE_GRID = { columns: GRAVE_PLACES.columns, rows: GRAVE_PLACES.rows } as const;
/** Okraj čtverce bez hrobů (m) – mohylky nesahají k plotu, mezi čtverci zůstane ulička. */
const GRAVE_MARGIN_M = GRAVE_PLACES.marginM;
/**
 * Mohylky se zmenší s místy na hrob: plot stojí 1,5 m uvnitř čtverce, míst zůstává 56 (cemetery.md
 * – Plot hřbitova uvnitř čtverce), takže mřížka je hustší o poměr ploch bez okraje (původní okraj
 * 0,5 m na čtverci 15 m).
 */
// Hroby se zmenšily s okrajem: místa leží `GRAVE_MARGIN_M` od okraje čtverce místo okraje bez plotu
// (`GRAVE_MARGIN_M - CEMETERY_FENCE_INSET_M`); strana čtverce je `SQUARE_SIDE_M`.
const SQUARE_SIDE_M = 15;
const GRAVE_SCALE =
  (SQUARE_SIDE_M - 2 * GRAVE_MARGIN_M) /
  (SQUARE_SIDE_M - 2 * (GRAVE_MARGIN_M - CEMETERY_FENCE_INSET_M));
/** Kolik posledních hrobů je čerstvých (holá hlína) – ostatní zarostly travou. */
export const FRESH_GRAVES = 3;
/**
 * Plot hřbitova: kůly nejvýš po metru jako u polského plotu, ale hustší pletivo – jedenáct větví
 * 0,1–0,8 m (nízký plot) – a širší branka 1,8 m (projde průvod s nebožtíkem). Branka a kůly
 * z jádra (`CEMETERY_GATE` – vchod, ke kterému vede pěšina).
 */
export const CEMETERY_FENCE: FenceStyle = {
  postStep: CEMETERY_GATE.postStep,
  rails: [0.1, 0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73, 0.8],
  gateWidth: CEMETERY_GATE.gateWidth,
};

export interface GravePlacement {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Čerstvý hrob – mohylka z holé hlíny. */
  fresh: boolean;
}

/**
 * Mohylky prvních `graves` hrobů: čtverce v daném pořadí, v každém po řadách mřížka 7 × 8
 * s drobným rozházením (deterministicky podle `seed`). Víc hrobů, než se vejde, se nekreslí.
 * Čerstvých (z holé hlíny) je posledních `fresh` – staré hroby vedle mohyl podle významu jsou
 * všechny zarostlé.
 */
export function gravePlacements(
  squares: readonly CellSquare[],
  graves: number,
  seed: number,
  fresh: number = FRESH_GRAVES,
): GravePlacement[] {
  const first = squares[0];
  if (first?.rotation !== undefined) {
    // natočený hřbitov: hroby po řadách v osách čtverců, otočené do světa
    const frame = gridFrame(first);
    if (frame.rotated) {
      return gravePlacements(flatSquares(frame, squares), graves, seed, fresh).map((grave) => {
        const [x, z] = frame.toWorld(grave.x, grave.z);
        return { ...grave, x, z, rotationY: grave.rotationY + first.rotation! };
      });
    }
  }
  const perSquare = GRAVE_GRID.columns * GRAVE_GRID.rows;
  const count = Math.max(0, Math.min(Math.floor(graves), squares.length * perSquare));
  const random = seededRandom(seed * 7919 + 17);
  const out: GravePlacement[] = [];
  for (let i = 0; i < count; i++) {
    const square = squares[Math.floor(i / perSquare)]!;
    const slot = i % perSquare;
    const column = slot % GRAVE_GRID.columns;
    const row = Math.floor(slot / GRAVE_GRID.columns);
    const inner = square.size - 2 * GRAVE_MARGIN_M;
    const stepX = inner / GRAVE_GRID.columns;
    const stepZ = inner / GRAVE_GRID.rows;
    const jitter = (step: number): number => (random() - 0.5) * step * 0.25;
    out.push({
      x: square.x - inner / 2 + (column + 0.5) * stepX + jitter(stepX),
      z: square.z - inner / 2 + (row + 0.5) * stepZ + jitter(stepZ),
      rotationY: random() * Math.PI * 2,
      scale: (0.85 + random() * 0.3) * GRAVE_SCALE,
      fresh: i >= count - fresh,
    });
  }
  return out;
}

/**
 * Tvar mohyly podle velikosti (cemetery.md – Mohyly podle významu): poloměr napříč, poloměr podél
 * řad (podlouhlá mohyla hlavy rodiny leží přes dvě místa za sebou) a výška (m). Běžná = dřívější
 * mohylka; mohyla vojvody a jeho ženy výrazně větší a s dřevěným kůlem na vrcholu.
 */
export const MOUND_SHAPES: Record<
  MoundSize,
  { radius: number; length: number; height: number; post: boolean }
> = {
  small: { radius: 0.55, length: 0.55, height: 0.26, post: false },
  normal: { radius: 0.9, length: 0.9, height: 0.45, post: false },
  large: { radius: 0.92, length: 1.6, height: 0.72, post: false },
  great: { radius: 1.65, length: 1.65, height: 1.1, post: true },
};

/** Mohyla ve světě – střed, natočení, měřítko, velikost a jestli je čerstvá. */
export interface MoundPlacement extends GravePlacement {
  size: MoundSize;
}

/** Mohyla podle významu ze scény vsi (místo ve čtverci, velikost, čerstvá). */
export interface MoundSpot {
  cell: { x: number; y: number };
  column: number;
  row: number;
  size: MoundSize;
  fresh?: boolean;
}

/**
 * Mohyly podle významu: střed bloku míst ve svém čtverci (`gravePlaceCenter` z jádra – stejná
 * mřížka jako pro výběr místa, i natočený čtverec), drobné rozházení a natočení deterministicky
 * podle hřbitova a místa. Kulaté mohyly natočené náhodně, podlouhlá po řadách čtverce. Mohyla ve
 * čtverci, který mezi `squares` není (rozšíření ve stavbě), se nekreslí.
 */
export function moundPlacements(
  squares: readonly CellSquare[],
  mounds: readonly MoundSpot[],
  seed: number,
): MoundPlacement[] {
  return mounds.flatMap((m) => {
    const square = squares.find((q) => q.cell.x === m.cell.x && q.cell.y === m.cell.y);
    if (!square) return [];
    const { columns, rows } = MOUND_SIZES[m.size];
    const center = gravePlaceCenter(
      square,
      square.size,
      square.rotation,
      m.column,
      m.row,
      columns,
      rows,
    );
    const random = seededRandom(
      seed * 7919 + (m.cell.x * 131 + m.cell.y) * 977 + m.row * GRAVE_GRID.columns + m.column + 3,
    );
    const step = (square.size - 2 * GRAVE_MARGIN_M) / GRAVE_GRID.rows;
    const jitter = (): number => (random() - 0.5) * step * 0.2;
    const along = m.size === 'large';
    const big = along || m.size === 'great';
    const turn = random();
    return [
      {
        x: center.x + jitter(),
        z: center.z + jitter(),
        // podlouhlá mohyla po řadách čtverce (místní +z), jinak natočená jakkoli
        rotationY: along
          ? (square.rotation ?? 0) + (turn < 0.5 ? 0 : Math.PI) + (random() - 0.5) * 0.12
          : turn * Math.PI * 2,
        // velké mohyly zaberou svá místa celá – menší rozptyl velikosti
        scale: (big ? 0.96 + random() * 0.08 : 0.9 + random() * 0.2) * GRAVE_SCALE,
        fresh: m.fresh === true,
        size: m.size,
      },
    ];
  });
}

export interface FenceLayout {
  /** Pletený plot (kůly v pořadí stavby, branka). */
  fence: WovenFence;
  /** Obrys čtverců – čára vytyčení a kolíky (rohy vytyčení zakulacené nejsou). */
  outline: Point[][];
}

const SAME_M = 1e-3;

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < SAME_M && Math.abs(a[1] - b[1]) < SAME_M;
}

function hasSquare(squares: readonly CellSquare[], x: number, z: number): boolean {
  return squares.some((q) => Math.abs(q.x - x) < SAME_M && Math.abs(q.z - z) < SAME_M);
}

/** Úhel odbočení ze směru a→b do směru b→c (kladný = doleva). */
function turn(a: Point, b: Point, c: Point): number {
  const ux = b[0] - a[0];
  const uz = b[1] - a[1];
  const vx = c[0] - b[0];
  const vz = c[1] - b[1];
  return Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz);
}

/** Vynechá body uprostřed rovných úseků (u uzavřené čáry i přes začátek). */
function mergeStraight(points: Point[], closed: boolean): Point[] {
  const out = [...points];
  for (let changed = true; changed && out.length > 2;) {
    changed = false;
    for (let i = closed ? 0 : 1; i < (closed ? out.length : out.length - 1); i++) {
      const prev = out[(i - 1 + out.length) % out.length]!;
      const next = out[(i + 1) % out.length]!;
      if (Math.abs(turn(prev, out[i]!, next)) < 1e-6) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function unitDir(a: Point, b: Point): Point {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}

/**
 * Obrys odsazený `inset` dovnitř (ohrazení vlevo od směru čáry): vrchol se posune o `inset` vlevo
 * od obou sousedních stran (vnější i vnitřní roh). Otevřená čára (rozšíření ve stavbě) končí na
 * starém plotu – konce se posunou jen napříč a prodlouží o `inset` + poloměr rohu zpět po svém
 * směru, aby navázaly na přímý úsek starého plotu před jeho zakulaceným rohem.
 */
function insetPoints(points: Point[], closed: boolean, inset: number): Point[] {
  if (inset === 0) return points;
  const n = points.length;
  const reach = inset + WOVEN_CORNER_RADIUS_M;
  return points.map((p, i): Point => {
    if (!closed && i === 0) {
      const d = unitDir(p, points[1]!);
      return [p[0] - inset * d[1] - reach * d[0], p[1] + inset * d[0] - reach * d[1]];
    }
    if (!closed && i === n - 1) {
      const d = unitDir(points[n - 2]!, p);
      return [p[0] - inset * d[1] + reach * d[0], p[1] + inset * d[0] + reach * d[1]];
    }
    const d1 = unitDir(points[(i - 1 + n) % n]!, p);
    const d2 = unitDir(p, points[(i + 1) % n]!);
    return [p[0] + inset * (-d1[1] - d2[1]), p[1] + inset * (d1[0] + d2[0])];
  });
}

/**
 * Čáry plotu po obrysu čtverců (ohrazení vlevo – jak chce woven-fence.ts): strany čtverců, za
 * kterými není jiný čtverec ani čtverec z `fenced` (tam už plot stojí), spojené za sebou.
 * Obrys bez vynechaných stran je uzavřená čára (díra uvnitř další), s vynechanými kusy otevřené.
 * Kde se čtverce dotýkají jen rohem, zahne čára doleva – každý čtverec má svůj oblouk.
 */
function outlinePaths(
  squares: readonly CellSquare[],
  fenced: readonly CellSquare[],
  inset = 0,
): FencePath[] {
  const sides: [Point, Point][] = [];
  const toward: Point[] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (const q of squares) {
    const h = q.size / 2;
    // proti směru hodinových ručiček v (x, z) – čtverec leží vlevo od každé strany
    const c: Point[] = [
      [q.x - h, q.z - h],
      [q.x + h, q.z - h],
      [q.x + h, q.z + h],
      [q.x - h, q.z + h],
    ];
    toward.forEach(([dx, dz], k) => {
      const nx = q.x + dx * q.size;
      const nz = q.z + dz * q.size;
      if (hasSquare(squares, nx, nz) || hasSquare(fenced, nx, nz)) return;
      sides.push([c[k]!, c[(k + 1) % 4]!]);
    });
  }
  const used = sides.map(() => false);
  const follow = (first: number, closed: boolean): Point[] => {
    const points: Point[] = [sides[first]![0]];
    let i = first;
    for (;;) {
      used[i] = true;
      const [from, end] = sides[i]!;
      points.push(end);
      if (closed && samePoint(end, points[0]!)) break;
      let next = -1;
      let bestTurn = -Infinity;
      sides.forEach(([a, b], j) => {
        if (used[j] || !samePoint(a, end)) return;
        const t = turn(from, end, b);
        if (t > bestTurn) {
          bestTurn = t;
          next = j;
        }
      });
      if (next < 0) break;
      i = next;
    }
    return points;
  };
  const paths: FencePath[] = [];
  // otevřené kusy začínají stranou, na kterou žádná nenavazuje
  sides.forEach(([a], i) => {
    if (used[i] || sides.some(([, b]) => samePoint(a, b))) return;
    paths.push({
      points: insetPoints(mergeStraight(follow(i, false), false), false, inset),
      closed: false,
    });
  });
  sides.forEach((_, i) => {
    if (used[i]) return;
    const points = follow(i, true);
    points.pop(); // poslední bod je zase první
    paths.push({ points: insetPoints(mergeStraight(points, true), true, inset), closed: true });
  });
  return paths;
}

/**
 * Plot kolem čtverců hřbitova: pletený plot po obrysu se zakulacenými rohy a branka v místě
 * plotu nejblíž k bodu `gateToward` na dost dlouhém rovném úseku – ve vsi je to vchod z jádra
 * (`cemeteryEntrance` – branka sama, pěšina vede k ní); bez bodu uprostřed prvního dost dlouhého
 * úseku.
 * Rozšíření ve stavbě: `withGate: false` a `fenced` = čtverce, kolem kterých plot už stojí –
 * strany sousedící s nimi se vynechají a plot rozšíření na starý plot jen navazuje.
 */
export function fenceLayout(
  squares: readonly CellSquare[],
  gateToward: { x: number; z: number } | null,
  options: { withGate?: boolean; fenced?: readonly CellSquare[] } = {},
): FenceLayout {
  const fenced = options.fenced ?? [];
  const first = squares[0];
  const frame = first?.rotation !== undefined ? gridFrame(first) : null;
  // natočený hřbitov: obrys v rovném prostoru mřížky, čáry plotu otočené do světa
  const paths =
    frame && frame.rotated
      ? outlinePaths(
          flatSquares(frame, squares),
          flatSquares(frame, fenced),
          CEMETERY_FENCE_INSET_M,
        ).map((path) => ({
          ...path,
          points: path.points.map(([x, z]) => frame.toWorld(x, z)),
        }))
      : outlinePaths(squares, fenced, CEMETERY_FENCE_INSET_M);
  const gate = options.withGate === false ? null : { toward: gateToward };
  return {
    fence: wovenFence(paths, CEMETERY_FENCE, gate),
    outline: stakingSegments(squares, frame),
  };
}

/**
 * Čára vytyčení a kolíky: obrys čtverců odsazený jako plot (bez ohledu na to, co už stojí),
 * jako úsečky [začátek, konec] ve světě.
 */
function stakingSegments(squares: readonly CellSquare[], frame: GridFrame | null): Point[][] {
  const flat = frame && frame.rotated ? flatSquares(frame, squares) : squares;
  return outlinePaths(flat, [], CEMETERY_FENCE_INSET_M).flatMap((path) =>
    path.points.map((a, i): Point[] => {
      const b = path.points[(i + 1) % path.points.length]!;
      return frame && frame.rotated
        ? [frame.toWorld(a[0], a[1]), frame.toWorld(b[0], b[1])]
        : [a, b];
    }),
  );
}

/** Čtverce natočené mřížky v jejím rovném prostoru (bez natočení). */
function flatSquares(frame: GridFrame, squares: readonly CellSquare[]): CellSquare[] {
  return squares.map((square) => {
    const [x, z] = frame.toSpace(square.x, square.z);
    const { rotation: _turned, ...rest } = square;
    void _turned;
    return { ...rest, x, z };
  });
}

/**
 * Plot starého hřbitova zmizel (abandonment.md – Následky; Martin 19. 10. 2026: „starému hřbitovu
 * plot zmizí úplně, zůstanou jen mohylky“): spadlý plot (stav 0) se nekreslí vůbec – žádné pahýly
 * ani kůly. Opravovaný plot vyroste znovu, jakmile stav přibude.
 */
export function cemeteryFenceGone(condition: number | undefined): boolean {
  return condition !== undefined && condition <= 0;
}

/** Fáze založení pohřebiště pro vývojovou lištu (průběh 0–1, navazují na sebe). */
export const CEMETERY_PHASES = [
  { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.15 },
  { id: 'posts', label: 'zatloukání kůlů', from: 0.15, to: 0.45 },
  { id: 'wattle', label: 'pletení plotu z proutí', from: 0.45, to: 1 },
] as const;

export interface CemeteryConstruction {
  /** Čára vytyčení a kolíky v rozích. */
  layout: boolean;
  /** Podíl zatlučených kůlů 0–1. */
  posts: number;
  /** Podíl upletených větví 0–1 (zdola nahoru). */
  rails: number;
}

/** Co pohřebiště ukáže při průběhu založení 0–1 (hotové = celý plot). */
export function cemeteryConstruction(progress: number, built: boolean): CemeteryConstruction {
  if (built || progress >= 1) return { layout: false, posts: 1, rails: 1 };
  const [layout, posts, wattle] = CEMETERY_PHASES;
  const share = (phase: { from: number; to: number }): number =>
    Math.min(1, Math.max(0, (progress - phase.from) / (phase.to - phase.from)));
  return {
    layout: progress < wattle.from,
    posts: progress < layout.to ? 0 : share(posts),
    rails: progress < wattle.from ? 0 : share(wattle),
  };
}
