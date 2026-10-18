import {
  length2,
  obstacleKind,
  obstacleLook,
  obstaclesInTile,
  type ObstacleLayer,
} from '../landscape';
import { pointInPolygon, rectangleCorners, type Point } from './polygon';
import { sacredOakNow } from './sacred-life';
import {
  GROVE,
  GROVE_DEFINITION,
  HAPPINESS_BONUS,
  OAK_MODEL_HEIGHT_M,
  SACRED_BUILDINGS,
  SACRED_OAK,
  SACRED_OAK_DEFINITION,
} from './rules';
import type {
  Grove,
  Position,
  SacredBuilding,
  SacredBuildingKind,
  SacredOak,
  TileCell,
  VillageState,
} from './types';

// Posvátná místa (happiness.md): posvátné duby a dubové háje vznikají samy – vesničané je při
// mýcení nechají stát –, modly a svatyni staví hráč. Které duby a háje jsou posvátné, plyne jen
// z vrstvy překážek (čistá funkce vrstvy, v prohlížeči i na serveru stejně, v mezipaměti podle
// vrstvy); stav vsi si pamatuje jen ty, které vesničané při mýcení opravdu ušetřili.

/** Posvátný dub vrstvy překážek – velký dub mimo souvislý les. */
export interface SacredOakSite {
  /** Id stromu z vrstvy překážek. */
  id: number;
  x: number;
  z: number;
}

/** Dubový háj vrstvy překážek – místo v lese, kde převažují dospělé duby. */
export interface GroveSite {
  /** Id středového dubu z vrstvy překážek. */
  id: number;
  x: number;
  z: number;
  /** Čtverce háje (políčka krajiny) po řádcích. */
  cells: TileCell[];
  /** Dospělé duby v okruhu GROVE.radiusM od středu (i středový). */
  oaks: number;
}

/** Posvátná místa vrstvy překážek a rychlé dotazy nad nimi. */
export interface SacredSites {
  /** Posvátné duby podle id. */
  readonly oaks: readonly SacredOakSite[];
  /** Háje v pořadí výběru (nejvíc dubový první). */
  readonly groves: readonly GroveSite[];
  /** Posvátné duby po políčkách (index y × size + x). */
  readonly oaksByTile: ReadonlyMap<number, readonly SacredOakSite[]>;
  /** Háj, kterému políčko patří (index y × size + x). */
  readonly groveByTile: ReadonlyMap<number, GroveSite>;
  /** Stromy, které se nikdy nekácí ani nemýtí: posvátné duby a dospělé stromy na čtvercích hájů. */
  readonly protectedTrees: ReadonlySet<number>;
}

/** Ušetřená posvátná místa – co stavba při mýcení nechala stát (zapíše se do stavu vsi). */
export interface SparedSacred {
  oaks: { id: number; x: number; z: number }[];
  groves: { id: number; x: number; z: number; cells: TileCell[]; oaks: number }[];
}

export const NO_SPARED: SparedSacred = { oaks: [], groves: [] };

/** Poloměr plochy pod korunou posvátného dubu (m) – ≈ 50 m², stavby se jí vyhnou. */
export const SACRED_OAK_RADIUS_M = Math.sqrt(SACRED_OAK.crownM2 / Math.PI);

const cache = new WeakMap<ObstacleLayer, SacredSites>();

/**
 * Posvátné duby a dubové háje vrstvy překážek (happiness.md – definice v `rules.ts`). Počítá se
 * jednou na vrstvu: jen sčítání, násobení a porovnání nad Float32 polohami vrstvy – výsledek je
 * v prohlížeči i na serveru stejný.
 */
export function sacredSitesOf(layer: ObstacleLayer): SacredSites {
  const cached = cache.get(layer);
  if (cached) return cached;
  const sites = computeSacredSites(layer);
  cache.set(layer, sites);
  return sites;
}

function computeSacredSites(layer: ObstacleLayer): SacredSites {
  const isTree = new Uint8Array(layer.count);
  const oakHeight = new Float64Array(layer.count);
  const oaks: number[] = [];
  for (let i = 0; i < layer.count; i++) {
    if (obstacleKind(layer, i) !== 'tree') continue;
    isTree[i] = 1;
    const height = OAK_MODEL_HEIGHT_M[obstacleLook(layer, i)];
    if (height === undefined) continue;
    oakHeight[i] = height * layer.scale[i]!;
    oaks.push(i);
  }
  const half = (layer.size * layer.cellSizeM) / 2;
  const tileOf = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  const { tileStart, tileItems, x: xs, z: zs } = layer;

  /**
   * Dospělé stromy (a z nich duby) do `radius` od stromu `i` – bez něj; po políčkách bez
   * pomocných polí (volá se pro desítky tisíc dubů). Počítání stromů skončí po `stopAfter`.
   */
  const neighbours = (
    i: number,
    radius: number,
    stopAfter = Infinity,
  ): { trees: number; oaks: number } => {
    const x = xs[i]!;
    const z = zs[i]!;
    const limit = radius * radius;
    let trees = 0;
    let oakCount = 0;
    const y0 = tileOf(z - radius);
    const y1 = tileOf(z + radius);
    const x0 = tileOf(x - radius);
    const x1 = tileOf(x + radius);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = ty * layer.size + tx;
        const end = tileStart[tile + 1]!;
        for (let k = tileStart[tile]!; k < end; k++) {
          const j = tileItems[k]!;
          if (j === i || isTree[j] !== 1) continue;
          const dx = xs[j]! - x;
          const dz = zs[j]! - z;
          if (dx * dx + dz * dz > limit) continue;
          trees++;
          if (oakHeight[j]! > 0) oakCount++;
          if (trees > stopAfter) return { trees, oaks: oakCount };
        }
      }
    }
    return { trees, oaks: oakCount };
  };

  // velký = horní třetina velikosti dubů vrstvy
  const sizes = Float64Array.from(oaks, (i) => oakHeight[i]!).sort();
  const threshold =
    sizes.length > 0
      ? sizes[
          Math.min(
            sizes.length - 1,
            Math.floor(sizes.length * (1 - SACRED_OAK_DEFINITION.topShare)),
          )
        ]!
      : Infinity;

  const sacredOaks: SacredOakSite[] = [];
  const cores: { i: number; oaks: number; trees: number }[] = [];
  for (const i of oaks) {
    const near = neighbours(
      i,
      SACRED_OAK_DEFINITION.solitaryRadiusM,
      SACRED_OAK_DEFINITION.solitaryMaxTrees,
    );
    const solitary = near.trees <= SACRED_OAK_DEFINITION.solitaryMaxTrees;
    if (solitary) {
      if (oakHeight[i]! >= threshold) {
        sacredOaks.push({ id: layer.id[i]!, x: layer.x[i]!, z: layer.z[i]! });
      }
      continue;
    }
    // háj: v okruhu aspoň 6 dubů a duby převažují (i se středovým dubem)
    const around = neighbours(i, GROVE.radiusM);
    const oakCount = around.oaks + 1;
    const treeCount = around.trees + 1;
    if (oakCount >= GROVE.minOaks && oakCount >= GROVE_DEFINITION.oakShare * treeCount) {
      cores.push({ i, oaks: oakCount, trees: treeCount });
    }
  }

  // nejvíc dubová místa první (podíl celými čísly křížem), pak víc dubů, pak menší id
  cores.sort(
    (a, b) =>
      b.oaks * a.trees - a.oaks * b.trees || b.oaks - a.oaks || layer.id[a.i]! - layer.id[b.i]!,
  );
  const spacing = 2 * GROVE.radiusM;
  const picked: { i: number; oaks: number }[] = [];
  for (const core of cores) {
    const x = layer.x[core.i]!;
    const z = layer.z[core.i]!;
    const free = picked.every((p) => {
      const dx = layer.x[p.i]! - x;
      const dz = layer.z[p.i]! - z;
      return dx * dx + dz * dz >= spacing * spacing;
    });
    if (free) picked.push(core);
  }

  const groveByTile = new Map<number, GroveSite>();
  const groves: GroveSite[] = [];
  const protectedTrees = new Set<number>();
  const reach = Math.ceil(GROVE.radiusM / layer.cellSizeM);
  for (const core of picked) {
    const x = layer.x[core.i]!;
    const z = layer.z[core.i]!;
    const grove: GroveSite = { id: layer.id[core.i]!, x, z, cells: [], oaks: core.oaks };
    const cx = tileOf(x);
    const cy = tileOf(z);
    for (let ty = cy - reach; ty <= cy + reach; ty++) {
      for (let tx = cx - reach; tx <= cx + reach; tx++) {
        if (tx < 0 || ty < 0 || tx >= layer.size || ty >= layer.size) continue;
        const index = ty * layer.size + tx;
        if (groveByTile.has(index)) continue;
        const centerX = -half + (tx + 0.5) * layer.cellSizeM;
        const centerZ = -half + (ty + 0.5) * layer.cellSizeM;
        const dx = centerX - x;
        const dz = centerZ - z;
        if (dx * dx + dz * dz >= GROVE.radiusM * GROVE.radiusM) continue;
        const items = obstaclesInTile(layer, tx, ty);
        if (!items.some((j) => isTree[j] === 1)) continue;
        grove.cells.push({ x: tx, y: ty });
        groveByTile.set(index, grove);
        for (const j of items) if (isTree[j] === 1) protectedTrees.add(layer.id[j]!);
      }
    }
    if (grove.cells.length > 0) groves.push(grove);
  }

  // dub na čtverci háje patří háji
  const oaksOutside = sacredOaks.filter(
    (oak) => !groveByTile.has(tileOf(oak.z) * layer.size + tileOf(oak.x)),
  );
  const oaksByTile = new Map<number, SacredOakSite[]>();
  for (const oak of oaksOutside) {
    protectedTrees.add(oak.id);
    const index = tileOf(oak.z) * layer.size + tileOf(oak.x);
    const list = oaksByTile.get(index);
    if (list) list.push(oak);
    else oaksByTile.set(index, [oak]);
  }
  return { oaks: oaksOutside, groves, oaksByTile, groveByTile, protectedTrees };
}

/** Posvátné duby na políčku (index y × size + x). */
export function sacredOaksInTile(sites: SacredSites, tile: number): readonly SacredOakSite[] {
  return sites.oaksByTile.get(tile) ?? [];
}

/** Vzdálenost bodu od úsečky a–b. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return length2(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/**
 * Posvátné duby, jejichž kmen leží v mnohoúhelníku nebo blíž k němu než `margin` (m) – stavba
 * by stála pod korunou dubu.
 */
export function sacredOaksNear(
  sites: SacredSites,
  layer: ObstacleLayer,
  polygon: readonly Point[],
  margin: number,
): SacredOakSite[] {
  if (sites.oaks.length === 0) return [];
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const half = (layer.size * layer.cellSizeM) / 2;
  const tileOf = (v: number): number =>
    Math.min(layer.size - 1, Math.max(0, Math.floor((v + half) / layer.cellSizeM)));
  const found: SacredOakSite[] = [];
  for (let ty = tileOf(Math.min(...zs) - margin); ty <= tileOf(Math.max(...zs) + margin); ty++) {
    for (let tx = tileOf(Math.min(...xs) - margin); tx <= tileOf(Math.max(...xs) + margin); tx++) {
      for (const oak of sacredOaksInTile(sites, ty * layer.size + tx)) {
        const point: Point = [oak.x, oak.z];
        if (pointInPolygon(point, polygon)) {
          found.push(oak);
          continue;
        }
        for (let k = 0; k < polygon.length; k++) {
          if (distanceToSegment(point, polygon[k]!, polygon[(k + 1) % polygon.length]!) < margin) {
            found.push(oak);
            break;
          }
        }
      }
    }
  }
  return found.sort((a, b) => a.id - b.id);
}

/** Háje, kterým patří některé z políček `tiles` (index y × size + x), podle id. */
export function grovesOfTiles(sites: SacredSites, tiles: Iterable<number>): GroveSite[] {
  const found = new Map<number, GroveSite>();
  for (const tile of tiles) {
    const grove = sites.groveByTile.get(tile);
    if (grove) found.set(grove.id, grove);
  }
  return [...found.values()].sort((a, b) => a.id - b.id);
}

/** Ušetřená místa ze seznamu dubů a hájů vrstvy (kopie – ukládá se do stavu vsi). */
export function sparedSacred(
  oaks: readonly SacredOakSite[],
  groves: readonly GroveSite[],
): SparedSacred {
  return {
    oaks: oaks.map((o) => ({ id: o.id, x: o.x, z: o.z })),
    groves: groves.map((g) => ({
      id: g.id,
      x: g.x,
      z: g.z,
      cells: g.cells.map((c) => ({ x: c.x, y: c.y })),
      oaks: g.oaks,
    })),
  };
}

/** Spojí ušetřená místa bez opakování (podle id). */
export function mergeSpared(...lists: readonly SparedSacred[]): SparedSacred {
  const oaks = new Map<number, SparedSacred['oaks'][number]>();
  const groves = new Map<number, SparedSacred['groves'][number]>();
  for (const list of lists) {
    for (const oak of list.oaks) oaks.set(oak.id, oak);
    for (const grove of list.groves) groves.set(grove.id, grove);
  }
  const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;
  return { oaks: [...oaks.values()].sort(byId), groves: [...groves.values()].sort(byId) };
}

/** Vesničané ušetří posvátný dub, nebo háj – text upozornění u kurzoru (neblokuje). */
export function sparedWarning(spared: SparedSacred): string | undefined {
  const lines: string[] = [];
  if (spared.oaks.length === 1) lines.push('Posvátný dub zůstane stát');
  else if (spared.oaks.length > 1)
    lines.push(`Posvátné duby zůstanou stát (${spared.oaks.length})`);
  if (spared.groves.length > 0) lines.push('Dubový háj zůstane stát');
  return lines.length > 0 ? lines.join('\n') : undefined;
}

// --- stav vsi ------------------------------------------------------------------------------

/** Ušetřené posvátné duby vsi (vsi uložené dřív žádné). */
export function villageSacredOaks(state: Pick<VillageState, 'sacredOaks'>): SacredOak[] {
  return state.sacredOaks ?? [];
}

/** Ušetřené dubové háje vsi (vsi uložené dřív žádné). */
export function villageGroves(state: Pick<VillageState, 'groves'>): Grove[] {
  return state.groves ?? [];
}

/** Hotové modly a svatyně vsi (vsi uložené dřív žádné). */
export function villageSacredBuildings(
  state: Pick<VillageState, 'sacredBuildings'>,
): SacredBuilding[] {
  return state.sacredBuildings ?? [];
}

/** Ověří ušetřená místa (vstup akce); jinak RangeError – čísla mimo JSON by stav otrávila. */
export function validateSpared(spared: SparedSacred): void {
  const finite = (...values: number[]): boolean => values.every(Number.isFinite);
  const ids = (list: readonly { id: number }[]): boolean =>
    list.every((s) => Number.isInteger(s.id) && s.id >= 0) &&
    new Set(list.map((s) => s.id)).size === list.length;
  if (!ids(spared.oaks) || !ids(spared.groves)) {
    throw new RangeError('Id posvátných míst musí být nezáporná celá čísla bez opakování.');
  }
  for (const oak of spared.oaks) {
    if (!finite(oak.x, oak.z)) throw new RangeError('Posvátný dub musí mít konečnou polohu.');
  }
  for (const grove of spared.groves) {
    if (!finite(grove.x, grove.z) || !Number.isInteger(grove.oaks) || grove.oaks < 0) {
      throw new RangeError('Háj musí mít konečnou polohu a počet dubů.');
    }
    if (!grove.cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))) {
      throw new RangeError('Čtverce háje musí mít celočíselné souřadnice.');
    }
  }
}

/**
 * Zapíše ušetřená posvátná místa, která ves ještě nemá, s událostí kroniky (mutuje stav – volat
 * na klonu).
 */
export function recordSpared(state: VillageState, spared: SparedSacred, day: number): void {
  const knownOaks = new Set(villageSacredOaks(state).map((o) => o.id));
  for (const oak of spared.oaks) {
    if (knownOaks.has(oak.id)) continue;
    knownOaks.add(oak.id);
    (state.sacredOaks ??= []).push({ id: oak.id, day, x: oak.x, z: oak.z });
    state.chronicle.push({ day, kind: 'sacred-spared', site: 'oak', id: oak.id });
  }
  const knownGroves = new Set(villageGroves(state).map((g) => g.id));
  for (const grove of spared.groves) {
    if (knownGroves.has(grove.id)) continue;
    knownGroves.add(grove.id);
    (state.groves ??= []).push({
      id: grove.id,
      day,
      x: grove.x,
      z: grove.z,
      cells: grove.cells.map((c) => ({ x: c.x, y: c.y })),
      oaks: grove.oaks,
    });
    state.chronicle.push({ day, kind: 'sacred-spared', site: 'grove', id: grove.id });
  }
}

// --- štěstí z posvátných míst -----------------------------------------------------------------

/** Kolik přidá háj s `oaks` dospělými duby: +10 a +1 za každé 2 duby nad 6, nejvýš +15. */
export function groveHappiness(oaks: number): number {
  const extra = Math.floor(Math.max(0, oaks - GROVE.minOaks) / GROVE.oaksPerPoint);
  return Math.min(GROVE.maxHappiness, GROVE.happiness + extra);
}

/** Kolik přidá jedna modla nebo svatyně. */
export function sacredBuildingHappiness(kind: SacredBuildingKind): number {
  return SACRED_BUILDINGS[kind].happiness;
}

/**
 * Štěstí z posvátných míst vsi v den `day` (happiness.md): duby podle stáří 1–10, souš 1 (nejvýš
 * 3 – ty, které přidávají nejvíc; `sacredOakNow` z vrstvy překážek `obstacles`, bez ní jako
 * nejmladší dub), háje podle dubů (nejvýš 2 nejlepší), modly +8 (nejvýš 2), svatyně +25 (jedna) –
 * dohromady nejvýš +40. Počítají se jen hotové modly a svatyně.
 */
export function sacredHappiness(
  state: Pick<VillageState, 'sacredOaks' | 'groves' | 'sacredBuildings'>,
  day: number,
  obstacles: ObstacleLayer | null,
): number {
  const oaks = villageSacredOaks(state)
    .map((o) => sacredOakNow(obstacles, o.id, day).happiness)
    .sort((a, b) => b - a)
    .slice(0, SACRED_OAK.counted)
    .reduce((sum, v) => sum + v, 0);
  const groves = villageGroves(state)
    .map((g) => groveHappiness(g.oaks))
    .sort((a, b) => b - a)
    .slice(0, GROVE.counted)
    .reduce((sum, v) => sum + v, 0);
  const buildings = villageSacredBuildings(state);
  let built = 0;
  for (const kind of ['idol', 'shrine'] as const) {
    const count = buildings.filter((b) => b.kind === kind).length;
    built += Math.min(count, SACRED_BUILDINGS[kind].counted) * SACRED_BUILDINGS[kind].happiness;
  }
  return Math.min(HAPPINESS_BONUS.sacredMax, oaks + groves + built);
}

// --- modla a svatyně ---------------------------------------------------------------------------

/** Půdorys modly nebo svatyně ve světě (čtverec natočený jako obydlí). */
export function sacredFootprint(kind: SacredBuildingKind, position: Position): Point[] {
  const size = SACRED_BUILDINGS[kind].footprintM;
  return rectangleCorners(position.x, position.z, size, size, position.rotation);
}

/** Modly a svatyně vsi i rozestavěné – co zabírají místo (kontrola umístění). */
export function sacredBuildingPlots(
  state: Pick<VillageState, 'sacredBuildings' | 'constructions'>,
): { kind: SacredBuildingKind; position: Position }[] {
  return [
    ...villageSacredBuildings(state).map((b) => ({ kind: b.kind, position: b.position })),
    ...state.constructions.flatMap((c) =>
      (c.kind === 'idol' || c.kind === 'shrine') && c.position !== null
        ? [{ kind: c.kind, position: c.position }]
        : [],
    ),
  ];
}

/** Má ves svatyni (hotovou nebo rozestavěnou)? Svatyně je jedna na ves. */
export function hasShrine(state: Pick<VillageState, 'sacredBuildings' | 'constructions'>): boolean {
  return sacredBuildingPlots(state).some((b) => b.kind === 'shrine');
}
