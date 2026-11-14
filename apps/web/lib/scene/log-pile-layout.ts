// Hromady klád (forest.md – Mýcení a hromada klád) bez Babylonu: kde leží a jak jsou klády
// složené; kláda = jeden velký strom. Místo hromady určí jádro při jejím vzniku (`LogStack` – u cesty
// nejblíž místu kácení, bez cesty v dosahu u místa kácení), scéna k němu najde volné místo.
// Bývalá hromada u vsi (převod starých vsí) a klády bez hromady (ves před převodem) leží u obydlí
// nejblíž lesu na volném místě vedle něj jako dřív (návrh Clauda).
import {
  dwellingClearing,
  dwellingShape,
  forestEdgeDistanceM,
  obstacleStatus,
  obstaclesNear,
  pointInPolygon,
  polygonsOverlap,
  rectangleCorners,
  rotatedSquareCorners,
  surfaceAt,
  tileOfWorldPoint,
  type Landscape,
  type ObstacleChanges,
  type ObstacleKind,
  type ObstacleLayer,
  type Point,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { isRotatedSquare, squareContains, type CellSquare } from './field-cells';
import { distanceToPolyline } from './village-picking';
import { dwellingArea, footprintRect, localToWorld } from './village-layout';

/** Kláda – délka a poloměr (m): kmen velkého stromu přeřezaný na délku srubu. */
export const LOG_LENGTH_M = 4.2;
export const LOG_RADIUS_M = 0.21;
/** Klád ve spodní řadě hranice – hranice má řady 6, 5, 4, 3, 2, 1 (21 klád). */
const STACK_BASE = 6;
const STACK_SIZE = (STACK_BASE * (STACK_BASE + 1)) / 2;
/** Nejvíc hranic vedle sebe – větší zásobu ukáže jen číslo v liště. */
export const MAX_STACKS = 3;
/** Nejvíc klád, které scéna ukáže. */
export const MAX_SHOWN_LOGS = STACK_SIZE * MAX_STACKS;
/** Mezera mezi hranicemi (m). */
const STACK_GAP_M = 0.35;
const STACK_WIDTH_M = STACK_BASE * 2 * LOG_RADIUS_M;
/** Šířka hromady o `stacks` hranicích vedle sebe (m). */
export function pileWidth(stacks: number): number {
  return stacks * STACK_WIDTH_M + (stacks - 1) * STACK_GAP_M;
}
/** Půdorys celé hromady (všech hranic) – podle něj se hledá volné místo, aby neskákala. */
export const PILE_WIDTH_M = pileWidth(MAX_STACKS);
export const PILE_DEPTH_M = LOG_LENGTH_M + 0.6;
/** Odstup hromady od stěny obydlí (m) – za okapem, ještě na udusané ploše u obydlí. */
const SITE_GAP_M = 1.5;
/** Volno kolem hromady bez překážek (m). */
const FREE_MARGIN_M = 0.4;
/** Hromada klád (`LogStack`): nejdál od kotvy (m) a volno kolem ní bez stromů (m). */
export const STACK_REACH_M = 20;
const STACK_MARGIN_M = 0.3;
/** Odstup hromady (`LogStack`) od osy pevné cesty (m) – jádro ji klade dál (`LOG_PILES.roadSideM`). */
const ROAD_CLEAR_M = 3;
/**
 * Co hromadě klád u lesa nepřekáží: pařezy, keře a drobné kameny (klády leží mezi nimi) – stojící
 * stromy, souše, padlé kmeny, mladé stromky, balvany a výchozy ano.
 */
const STACK_TOLERATED: ReadonlySet<ObstacleKind> = new Set(['stump', 'shrub', 'stone']);

/** Místo hromady: střed ve světě a natočení (klády leží podél místní osy z). */
export interface LogPileSite {
  x: number;
  z: number;
  rotation: number;
  /** Kolik hranic se na místo vejde (1–MAX_STACKS); bez údaje MAX_STACKS. */
  stacks?: number;
}

/** Kláda hromady v místních souřadnicích (x napříč, y nahoru od země, z podél klád). */
export interface LogPlacement {
  x: number;
  y: number;
  z: number;
  radius: number;
  length: number;
  /** Malé pootočení kolem svislé osy (rad) – klády neleží jako podle pravítka. */
  yaw: number;
}

/** Hash indexu → [0, 1) – drobné odchylky klád jsou jen vzhled. */
function hash(i: number, k: number): number {
  let h = Math.imul(i ^ Math.imul(k, 0x27d4eb2d), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Klády hromady v místních souřadnicích: hranice po 21 (řady 6–5–4–3–2–1) vedle sebe, plní se
 * zdola a hranice po hranici – hromada tak ubývá shora a od poslední hranice. Nejvýš
 * MAX_SHOWN_LOGS (na místě pro méně hranic `stacks` × 21).
 */
export function logPileLayout(count: number, stacks = MAX_STACKS): LogPlacement[] {
  const shown = Math.max(0, Math.min(STACK_SIZE * stacks, MAX_SHOWN_LOGS, Math.floor(count)));
  const width = pileWidth(stacks);
  const logs: LogPlacement[] = [];
  const rowHeight = LOG_RADIUS_M * Math.sqrt(3);
  for (let i = 0; i < shown; i++) {
    const stack = Math.floor(i / STACK_SIZE);
    let k = i % STACK_SIZE;
    let row = 0;
    while (k >= STACK_BASE - row) {
      k -= STACK_BASE - row;
      row++;
    }
    const stackLeft = -width / 2 + stack * (STACK_WIDTH_M + STACK_GAP_M);
    const inRow = STACK_BASE - row;
    const rowLeft = stackLeft + (STACK_WIDTH_M - inRow * 2 * LOG_RADIUS_M) / 2;
    const radius = LOG_RADIUS_M * (0.88 + 0.12 * hash(i, 1));
    logs.push({
      x: rowLeft + (2 * k + 1) * LOG_RADIUS_M,
      y: radius + row * rowHeight,
      z: (hash(i, 2) - 0.5) * 0.35,
      radius,
      length: LOG_LENGTH_M * (0.92 + 0.12 * hash(i, 3)),
      yaw: (hash(i, 4) - 0.5) * 0.06,
    });
  }
  return logs;
}

/**
 * Jak daleko od středu domu sahá pozemek v místních osách domu: vpravo (+x), vlevo (−x)
 * a dozadu (−z) – hromada klád leží za plotem.
 */
function plotReach(
  position: { x: number; z: number; rotation: number },
  plot: { x: number; z: number; size: number; rotation?: number },
): { right: number; left: number; back: number } {
  const h = plot.size / 2;
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  // rohy pozemku – natočený pozemek (fields.md – Natočené stavby) natočené
  const corners: readonly (readonly [number, number])[] = plot.rotation
    ? rotatedSquareCorners(plot.x, plot.z, plot.size, plot.rotation)
    : [
        [plot.x - h, plot.z - h],
        [plot.x + h, plot.z - h],
        [plot.x + h, plot.z + h],
        [plot.x - h, plot.z + h],
      ];
  const local = corners.map(([x, z]) => {
    const dx = x - position.x;
    const dz = z - position.z;
    return [dx * c - dz * s, dx * s + dz * c] as const;
  });
  return {
    right: Math.max(...local.map((p) => p[0])),
    left: -Math.min(...local.map((p) => p[0])),
    back: -Math.min(...local.map((p) => p[1])),
  };
}

/** Půdorys hromady na místě `site` (rohy ve světě). */
export function pileCorners(site: LogPileSite): Point[] {
  return rectangleCorners(
    site.x,
    site.z,
    pileWidth(site.stacks ?? MAX_STACKS),
    PILE_DEPTH_M,
    site.rotation,
  );
}

/** Místní (lx, lz) hromady na místě `site` → svět. */
export function pileToWorld(site: LogPileSite, lx: number, lz: number): Point {
  return localToWorld({ x: site.x, z: site.z, rotation: site.rotation }, lx, lz);
}

/**
 * Kde leží hromada klád u obydlí: u obydlí `homeId` (převedená hromada u vsi – `LogStack.dwellingId`),
 * bez něj u obydlí (i rozestavěného) nejblíž okraji lesa (při shodě menší id), na prvním volném
 * místě vedle něj – po stranách, za ním a pak dál. Volné = v krajině, ne ve vodě,
 * na poli ani hřbitově, mimo vyklizenou plochu jiných obydlí a bez stojících překážek (stromy,
 * kameny, keře). Bez obydlí nebo bez volného místa null – hromada se pak nekreslí (nikdy ne do
 * vody ani na pole).
 */
export function logPileSite(
  landscape: Landscape,
  village: SceneVillage,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  homeId: number | null = null,
): LogPileSite | null {
  const dwellings = village.dwellings;
  if (dwellings.length === 0) return null;
  let home = dwellings[0]!;
  if (homeId !== null) {
    const fixed = dwellings.find((d) => d.id === homeId);
    if (!fixed) return null;
    home = fixed;
  } else {
    let best = Infinity;
    for (const d of dwellings) {
      const distance = forestEdgeDistanceM(landscape, d.position.x, d.position.z);
      if (distance < best || (distance === best && d.id < home.id)) {
        best = distance;
        home = d;
      }
    }
  }
  // půdorys podle varianty rozměrů domu (population.md – Varianty rozměrů)
  const footprint = footprintRect(home);
  // obydlí na pozemku: hromada za plotem (místní osy domu – pozemek je kolem něj souměrně
  // jen u varianty uprostřed, proto od okraje políčka, ne od stěny)
  const reach = home.plot
    ? plotReach(home.position, home.plot)
    : {
        right: footprint.maxX,
        left: -footprint.minX,
        back: -footprint.minZ,
      };
  const side = (half: number): number => half + SITE_GAP_M + PILE_DEPTH_M / 2;
  const behind = -reach.back - SITE_GAP_M - PILE_DEPTH_M / 2;
  // hranice podél boční stěny (klády od ní kolmo ven), nebo za obydlím podél zadní stěny
  const candidates: { lx: number; lz: number; turn: number }[] = [];
  for (const extra of [0, 3, 7]) {
    candidates.push(
      { lx: side(reach.right) + extra, lz: 0, turn: Math.PI / 2 },
      { lx: -side(reach.left) - extra, lz: 0, turn: Math.PI / 2 },
      { lx: 0, lz: behind - extra, turn: 0 },
    );
  }
  const sites = candidates.map(({ lx, lz, turn }): LogPileSite => {
    const [x, z] = localToWorld(home.position, lx, lz);
    return { x, z, rotation: home.position.rotation + turn };
  });
  const context = freeContext(village);
  return (
    sites.find((site) =>
      isFree(landscape, village, context, layer, changes, site, {
        homeId: home.id,
        margin: FREE_MARGIN_M,
        blocks: () => true,
        dense: false,
      }),
    ) ?? null
  );
}

/**
 * Kde leží hromada klád (forest.md – Mýcení a hromada klád): hromada u cesty (`anchor.road`) nejdřív
 * přesně na kotvě, čely klád k cestě; jinak na volném místě do STACK_REACH_M od kotvy (u cesty
 * místo vedle ní, bez cesty místo kácení) – po kružnicích od kotvy ven, pro všechny hranice,
 * a když se nevejdou, pro méně hranic. Volné = v krajině, ne ve
 * vodě, na dílech polí ani hřbitovech, na cestách ani u obydlí, bez stojících stromů (pařezy,
 * keře a kameny nevadí). Předchozí místo `previous`, které je pořád volné, zůstane – hromada
 * neskáče, když okolo padají stromy. Bez místa null – hromada se nekreslí.
 */
export function logStackSite(
  landscape: Landscape,
  village: SceneVillage,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  anchor: { x: number; z: number; road?: { x: number; z: number } | undefined },
  previous: LogPileSite | null = null,
  occupied: readonly (readonly Point[])[] = [],
  height?: (x: number, z: number) => number,
): LogPileSite | null {
  const options = {
    occupied,
    homeId: null,
    margin: STACK_MARGIN_M,
    blocks: (kind: ObstacleKind) => !STACK_TOLERATED.has(kind),
    dense: true,
  };
  const context = freeContext(village);
  if (previous && isFree(landscape, village, context, layer, changes, previous, options)) {
    return previous;
  }
  // nejrovnější volné místo: první dost rovné se bere hned, jinak to s nejmenším převýšením
  // (při shodě dřívější v pořadí hledání) – hromada neleží zanořená do svahu
  const best: { site: LogPileSite | null; relief: number } = { site: null, relief: Infinity };
  const consider = (site: LogPileSite): boolean => {
    if (!isFree(landscape, village, context, layer, changes, site, options)) return false;
    const relief = height ? siteRelief(site, height) : 0;
    if (relief < best.relief) {
      best.site = site;
      best.relief = relief;
    }
    return relief <= FLAT_RELIEF_M;
  };
  for (let stacks = MAX_STACKS; stacks >= 1; stacks--) {
    if (anchor.road) {
      // klády míří čely k cestě – místní osa z od cesty ke kotvě
      const rotation = Math.atan2(anchor.x - anchor.road.x, anchor.z - anchor.road.z);
      if (consider({ x: anchor.x, z: anchor.z, rotation, stacks })) return best.site;
    }
    for (let r = 2.5; r <= STACK_REACH_M; r += 2.5) {
      const steps = Math.max(8, Math.round((2 * Math.PI * r) / 2.5));
      for (let i = 0; i < steps; i++) {
        const a = (2 * Math.PI * i) / steps;
        const x = anchor.x + r * Math.cos(a);
        const z = anchor.z + r * Math.sin(a);
        // klády míří ke kotvě (od paseky), nebo napříč
        for (const turn of [0, Math.PI / 2]) {
          if (consider({ x, z, rotation: Math.PI / 2 - a + turn, stacks })) return best.site;
        }
      }
    }
    // pro víc hranic je místo, i když nerovné – menší hromada se hledá, jen když žádné není
    if (best.site) return best.site;
  }
  return null;
}

/** Nejvyšší převýšení pod půdorysem hromady, které se ještě bere jako rovina (m). */
export const FLAT_RELIEF_M = 0.3;

/** Převýšení pod půdorysem hromady (m): rozdíl nejvyššího a nejnižšího bodu rohů, stran a středu. */
export function siteRelief(site: LogPileSite, height: (x: number, z: number) => number): number {
  const corners = pileCorners(site);
  const points: Point[] = [...corners, [site.x, site.z]];
  for (let k = 0; k < corners.length; k++) {
    const a = corners[k]!;
    const b = corners[(k + 1) % corners.length]!;
    points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  const heights = points.map(([x, z]) => height(x, z));
  return Math.max(...heights) - Math.min(...heights);
}

/**
 * Co se pro test volného místa počítá ze vsi jednou na hledání (ne pro každé zkoušené místo –
 * hledání zkouší stovky míst): obsazená políčka polí a hřbitovů, natočené díly a plochy obydlí.
 */
interface FreeContext {
  taken: Set<string>;
  turned: CellSquare[];
  dwellings: { id: number; plot: boolean; area: Point[] }[];
}

function freeContext(village: SceneVillage): FreeContext {
  const taken = new Set<string>();
  // natočené díly (fields.md – Natočené stavby) nejsou políčka – test bodu v jejich osách
  const squares = [
    ...village.fields.flatMap((f) => f.parts),
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
  ];
  const turned = squares.filter((p) => isRotatedSquare(p));
  for (const p of squares) if (!isRotatedSquare(p)) taken.add(`${p.cell.x},${p.cell.y}`);
  const dwellings = village.dwellings.map((d) => ({
    id: d.id,
    plot: Boolean(d.plot),
    area: d.plot ? dwellingArea(d) : dwellingClearing(d.type, d.position, dwellingShape(d)),
  }));
  return { taken, turned, dwellings };
}

function isFree(
  landscape: Landscape,
  village: SceneVillage,
  context: FreeContext,
  layer: ObstacleLayer,
  changes: ObstacleChanges,
  site: LogPileSite,
  options: {
    /** Obydlí, u kterého hromada leží (bez pozemku smí na jeho vyklizenou plochu). */
    homeId: number | null;
    margin: number;
    /** Které stojící překážky hromadě vadí. */
    blocks: (kind: ObstacleKind) => boolean;
    /** Zkoušet i středy stran a cesty (hromada u lesa). */
    dense: boolean;
    /** Půdorysy jiných hromad klád – hromady se nepřekrývají. */
    occupied?: readonly (readonly Point[])[];
  },
): boolean {
  const width = pileWidth(site.stacks ?? MAX_STACKS);
  const corners = rectangleCorners(site.x, site.z, width, PILE_DEPTH_M, site.rotation);
  const points: Point[] = [...corners, [site.x, site.z]];
  for (const other of options.occupied ?? []) {
    if (polygonsOverlap(corners, other)) return false;
  }
  if (options.dense) {
    for (let k = 0; k < corners.length; k++) {
      const a = corners[k]!;
      const b = corners[(k + 1) % corners.length]!;
      points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    for (const road of village.roads ?? []) {
      if (points.some(([x, z]) => distanceToPolyline({ x, z }, road.points) < ROAD_CLEAR_M)) {
        return false;
      }
    }
  }
  const { taken, turned } = context;
  for (const [x, z] of points) {
    const tile = tileOfWorldPoint(landscape, x, z);
    if (!tile || surfaceAt(landscape, tile.x, tile.y) === 'water') return false;
    if (taken.has(`${tile.x},${tile.y}`)) return false;
    if (turned.some((p) => squareContains(p, x, z))) return false;
  }
  for (const d of context.dwellings) {
    // vlastní pozemek je oplocený a plný záhonů – hromada leží za plotem
    if (d.id === options.homeId && !d.plot) continue;
    if (polygonsOverlap(corners, d.area)) return false;
  }
  const margin = rectangleCorners(
    site.x,
    site.z,
    width + 2 * options.margin,
    PILE_DEPTH_M + 2 * options.margin,
    site.rotation,
  );
  const xs = margin.map((p) => p[0]);
  const zs = margin.map((p) => p[1]);
  const status = obstacleStatus(changes);
  for (const i of obstaclesNear(
    layer,
    Math.min(...xs),
    Math.min(...zs),
    Math.max(...xs),
    Math.max(...zs),
  )) {
    const kind = status.kindOf(layer, i);
    if (kind === null || !options.blocks(kind)) continue;
    if (pointInPolygon([layer.x[i]!, layer.z[i]!], margin)) return false;
  }
  return true;
}
