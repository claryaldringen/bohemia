import { length2 } from '../../landscape';
import {
  CART_ROUTES,
  CART_SPEED,
  CEMETERY_FENCE_INSET_M,
  PEN_FENCE_INSET_M,
  SACRED_BUILDINGS,
} from '../rules';
import type { PartStage } from '../summary';
import type { CartKind, RoadGrade, RoadGround } from '../types';
import { nearestPartFinder } from './nearest';
import {
  PathHeap,
  buildingBounds,
  cellsIn,
  inBuilding,
  penPathSquares,
  simplifyPathLine,
  fencedCells,
  squareCells,
  villageBuildings,
  type GridWindow,
  type PathPoint,
  type PathTraffic,
  type PathVillage,
  villageTerrain,
} from './network';
import { PATH_FORD, PATH_FOREST, PATH_WATER, PATH_WETLAND, type PathTerrain } from './terrain';
import { roadTreeSpeed } from './walk-speed';

// Vozová síť (docs/design/wagons.md – Vozová síť a vyjeté cesty; Martin, 19. 10. 2026: „Vozy
// mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří chodí pěšky. Bude to
// znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit
// serpentiny.“). Vůz jede po stejné mřížce jako pěšiny (≈ 3,75 m, terén pěšin – výšky a příznaky),
// ale v 16 směrech (osy, úhlopříčky a „jezdcovy“ skoky – stoupání šikmo ke svahu po 26,6°)
// a se směrem jízdy ve stavu hledání: dvoukolák zatočí na krok nejvýš o 2 směry (≤ 53°),
// čtyřkolák o 1 (≤ 27° – širší oblouk). Rozhoduje sklon ve směru jízdy (výšky koncových buněk
// hrany) – nad CART_ROUTES.maxGrade vůz nejede, pod ním stoupání zdražuje, takže do svahu vede
// nejlevnější cesta šikmo a serpentiny vzniknou samy. Les jen po pevné vozové nebo upravené
// (vykácené) cestě, křoviny a mladý les ne, voda jen brodem, lávka (jen pro pěší) ne, přes osetý
// díl ne (po pevné cestě přes pole ano – jako lidé), kolem domů a plotů jen kudy se vůz vejde.
// Rychlost podle povrchu a druhu cesty (CART_SPEED – vyšlapaná, vyježděná, upravená, hať; mokřina
// na ose cesty z `Road.ground` jako u chůze; stromy u cesty přidají jako chůzi – roads.md, Stromy
// u cesty zrychlí chůzi). Čistá deterministická funkce (jen přesná aritmetika –
// soubor hlídá ESLint jako síť pěšin), stejně na serveru i v prohlížeči.

/** 16 směrů jízdy po mřížce v pořadí úhlu (krok 18,4–26,6°): osy, úhlopříčky, skoky (2, 1). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 1],
  [-1, 2],
  [-1, 1],
  [-2, 1],
  [-1, 0],
  [-2, -1],
  [-1, -1],
  [-1, -2],
  [0, -1],
  [1, -2],
  [1, -1],
  [2, -1],
];
const HEADINGS = DIRS.length;
/** Délka kroku v buňkách. */
const DIR_LEN = DIRS.map(([i, j]) => Math.sqrt(i * i + j * j));
/** Buňky, přes které krok vede (úhlopříčka a skok nesmí přes roh neprůchodné buňky). */
const DIR_VIA: readonly (readonly (readonly [number, number])[])[] = DIRS.map(([i, j]) => {
  if (i === 0 || j === 0) return [];
  if (Math.abs(i) === 1 && Math.abs(j) === 1) {
    return [
      [i, 0],
      [0, j],
    ];
  }
  if (Math.abs(i) === 2) {
    return [
      [i / 2, 0],
      [i / 2, j],
    ];
  }
  return [
    [0, j / 2],
    [i, j / 2],
  ];
});

/** Směry jízdy, jejich délky a buňky, přes které vedou – i pro trasu vozové cesty (wagon-route.ts). */
export const CART_HEADINGS = DIRS;
export const CART_HEADING_LENGTHS = DIR_LEN;
export const CART_HEADING_VIA = DIR_VIA;

/**
 * Vůz stojí u ohrady se spřežením – vyjede z kterékoli průjezdné buňky do tolika metrů od středu
 * ohrady (čtverec 15 m a kolem něj ≈ 7 m): branka může vést k sousednímu pozemku, kudy vůz
 * neprojede, voly ale jde vyvést a zapřáhnout kdekoli u plotu.
 */
const DEPOT_REACH_M = 15;
/** Okraj domu, kam vůz nesmí (m) – jako u pěšin, k tomu půl šířky vozu. */
const HOUSE_MARGIN_M = 0.4;

/** Mřížka pro vůz: cena povrchu za metr (Infinity = neprojede) a výšky buněk. */
export interface CartGrid extends GridWindow {
  cost: Float32Array;
  heights: Float32Array | null;
}

/** Cíl vozu – bod a jak blízko musí vůz dojet (m). */
export interface CartTarget {
  x: number;
  z: number;
  reachM: number;
}

/**
 * Trasa vozu k cíli: dojede (`reached`), cena (m jízdy po louce bez stoupání), délka (m) a osa
 * od depa k cíli (zjednodušená), buňky trasy (pro provoz).
 */
export interface CartRoute {
  reached: boolean;
  cost: number;
  lengthM: number;
  points: PathPoint[];
  cells: number[];
}

/** Pevná cesta pro vůz – jako v síti pěšin, s mokřinou a brody na ose (`Road.ground`). */
export type CartRoad = NonNullable<PathVillage['roads']>[number] & { ground?: RoadGround };

/** Ves pro vozovou síť – ves sítě pěšin, pevné cesty i s půdou na ose (`cartVillageOf`). */
export type CartVillage = Omit<PathVillage, 'roads'> & { roads?: readonly CartRoad[] };

/**
 * Ves pro vozovou síť: k pevným cestám vsi sítě pěšin (`pathVillageOf`) přidá mokřinu a brody na
 * ose z úseků stavu (`Road.ground` – podle id), aby vůz viděl mokřinu na cestě stejně jako chůze
 * (`roadPieceCost` ve walking.ts). Cesta bez údaje je suchá.
 */
export function cartVillageOf(
  village: PathVillage,
  roads: readonly { id: number; ground?: RoadGround }[],
): CartVillage {
  if (!village.roads || village.roads.length === 0) return village;
  const ground = new Map(roads.flatMap((r) => (r.ground ? [[r.id, r.ground] as const] : [])));
  if (ground.size === 0) return village;
  return {
    ...village,
    roads: village.roads.map((r) => {
      const g = r.id !== undefined ? ground.get(r.id) : undefined;
      return g ? { ...r, ground: g } : r;
    }),
  };
}

/**
 * Rychlost vozu přes díl pole proti louce (CART_SPEED): osetý díl, křoviny a mladý les 0 (vůz
 * neprojede), zakládaný díl (rozrývaný drn) jako zoraný, připravený díl – sesedlá rozrytá půda do
 * osevu, i díly sklízené plodiny při žni (`harvestReachState`) – jako strniště, úhor a příloh
 * jako louka.
 */
export function cartPartSpeed(stage: PartStage): number {
  if (stage === 'sown' || stage === 'shrubs' || stage === 'young-forest') return 0;
  if (stage === 'founding') return CART_SPEED.ploughed;
  if (stage === 'ready') return CART_SPEED.stubble;
  return 1;
}

/**
 * Rychlost vozu po pevné cestě proti louce (CART_SPEED.road): vyšlapaná, vyježděná (vyšlapaná
 * s příznakem vozová), upravená, hať, vozová cesta; v mokřině (`wet`) jen hať a vozová cesta,
 * jinak bahno jako mokřina bez cesty. Mimo mokřinu se přičtou stromy u cesty (`treeSpeed` – `roadTreeSpeed`, stejně jako
 * u chůze; roads.md – Stromy u cesty zrychlí chůzi).
 */
export function cartRoadSpeed(
  grade: RoadGrade,
  cart: boolean,
  wet: boolean,
  treeSpeed = 0,
): number {
  // hať i vozová cesta (zpevněné koleje – roads.md, Vozová cesta) drží rychlost i v mokřině
  if (grade === 'causeway' || grade === 'wagon') {
    return CART_SPEED.road[grade] + (wet ? 0 : treeSpeed);
  }
  if (wet) return CART_SPEED.wet;
  const speed = CART_SPEED.road[grade];
  return (cart ? Math.max(speed, CART_SPEED.road.cart) : speed) + treeSpeed;
}

/**
 * Cena metru po pevných cestách po buňkách (buňky jako `roadMask` – body osy po třetině buňky,
 * mokřina podle polohy na ose z `ground.wet`, mimo ni i se stromy u cesty – `lined`); mimo cesty
 * 0, v buňce víc cest nejrychlejší. Bez cest null.
 */
function cartRoadCosts(grid: GridWindow, roads: CartVillage['roads']): Float32Array | null {
  if (!roads || roads.length === 0) return null;
  const out = new Float32Array(grid.width * grid.height);
  const step = grid.cellM / 3;
  for (const road of roads) {
    const grade = road.grade ?? 'trodden';
    const cart = road.cart === true;
    const dryCost = 1 / cartRoadSpeed(grade, cart, false, roadTreeSpeed(road.lined));
    const wetCost = 1 / cartRoadSpeed(grade, cart, true);
    const wet = road.ground?.wet ?? [];
    const mark = (x: number, z: number, along: number): void => {
      const i = Math.round((x - grid.originX) / grid.cellM);
      const j = Math.round((z - grid.originZ) / grid.cellM);
      if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return;
      const c = j * grid.width + i;
      const cost = wet.some(([a, b]) => along >= a && along <= b) ? wetCost : dryCost;
      if (out[c] === 0 || cost < out[c]!) out[c] = cost;
    };
    const pts = road.points;
    if (pts.length === 1) mark(pts[0]!.x, pts[0]!.z, 0);
    let along = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const length = length2(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(length / step));
      for (let q = 0; q <= n; q++) {
        mark(a.x + ((b.x - a.x) * q) / n, a.z + ((b.z - a.z) * q) / n, along + (length * q) / n);
      }
      along += length;
    }
  }
  return out;
}

export interface CartRoutesInput {
  village: CartVillage;
  /** Terén pěšin v okně (s výškami a příznaky) – i s překážkami (`withObstacles`), nebo bez. */
  terrain: PathTerrain;
  /** Překážky krajiny, přes které vůz neprojede (`cartObstacleMask`) – bez údaje žádné. */
  blocked?: Uint8Array | null;
  kind: CartKind;
  /** Odkud vozy vyjíždějí (u ohrady se spřežením – `cartDepots`). */
  depots: readonly PathPoint[];
  targets: readonly CartTarget[];
  /**
   * Čtyřkolák vsi (wagons.md – Co se vozí a na čem; Martin 20. 10. 2026: „Po strništích a loukách
   * může libovolně“): po louce, úhoru a strništi kamkoli jako dvoukolák, na zakládaný (zoraný) díl
   * ne – dvoukolák tam projede pomalu; zatáčí širším obloukem (`kind`). Bez údaje jako dvoukolák.
   */
  fourWheel?: boolean;
}

/**
 * Mřížka pro vůz (wagons.md – Kudy vůz projede): z terénu pěšin – voda jen brodem, les ne,
 * mokřina pomaleji, překážky krajiny (`blocked`) ne; díly polí podle stadia (`cartPartSpeed` –
 * osetý, křoviny a mladý les ne, zakládaný jako zoraný, připravený jako strniště, úhor a louka
 * jako louka – meze mezi poli průjezdné), sad, hřbitov, ohrada a les vsi ne (ani jejich okraj –
 * plot, stromy), okrsek svatyně ne. Pevná cesta (wagons.md: „Les jen po vykácené cestě (pevné
 * cestě)“) je sjízdná vždy – lesem, přes pole, mezi překážkami – rychlostí podle druhu
 * (`cartRoadSpeed` – v mokřině na ose jen hať rychle); voda jen brodem a sráz ani po ní. Domy, pozemky,
 * staveniště, milíř a modla ne – i s půl šířkou vozu.
 */
export function cartGrid(
  input: Omit<CartRoutesInput, 'kind' | 'depots' | 'targets'> &
    Partial<Pick<CartRoutesInput, 'depots'>>,
): CartGrid {
  // úpravy terénu vozových cest (roads.md – Vozová cesta) – po úvozu vůz jede rovně
  const t = villageTerrain(input.village, input.terrain);
  const all = t.width * t.height;
  const grid: CartGrid = {
    width: t.width,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    cost: new Float32Array(all),
    heights: t.heights ?? null,
  };
  const cost = grid.cost;
  const v = input.village;
  // pole založené v lese je vymýcené – les krajiny tam neplatí
  const cleared = new Uint8Array(all);
  for (const field of v.fields) {
    const { inside, edge } = squareCells(grid, field.parts);
    for (const c of inside) cleared[c] = 1;
    for (const c of edge) cleared[c] = 1;
  }
  for (let c = 0; c < all; c++) {
    const flags = t.flags[c]!;
    if (!Number.isFinite(t.cost[c]!) || input.blocked?.[c]) cost[c] = Infinity;
    else if (flags & PATH_WATER) cost[c] = flags & PATH_FORD ? CART_ROUTES.fordCost : Infinity;
    else if (flags & PATH_FOREST && !cleared[c]) cost[c] = Infinity;
    else if (flags & PATH_WETLAND) cost[c] = 1 / CART_SPEED.wet;
    else cost[c] = 1;
  }
  // díly polí podle stadia – nejpomalejší z povrchu a dílu platí
  for (const field of v.fields) {
    const nearestPart = nearestPartFinder(field.parts, field.parts[0]?.size ?? 0);
    for (const c of squareCells(grid, field.parts).inside) {
      const stage = nearestPart(
        grid.originX + (c % grid.width) * grid.cellM,
        grid.originZ + Math.floor(c / grid.width) * grid.cellM,
      ).stage;
      // čtyřkolák na zoraný (zakládaný) díl nesjede
      const speed = input.fourWheel && stage === 'founding' ? 0 : cartPartSpeed(stage);
      cost[c] = speed > 0 ? Math.max(cost[c]!, 1 / speed) : Infinity;
    }
  }
  // les vsi je les – vůz jen po pevné cestě
  const woods = (v.woods ?? []).filter((wd) => wd.surface !== 'forest');
  if (woods.length > 0) {
    const { inside, edge } = squareCells(grid, woods);
    for (const c of [...inside, ...edge]) cost[c] = Infinity;
  }
  // pevné cesty – sjízdné vždy (i lesem, přes pole a mezi překážkami) rychlostí podle druhu cesty
  // a mokřiny na ose; voda (brod – i pod hatí) a neprůchodná místa terénu zůstávají
  const roads = cartRoadCosts(grid, v.roads);
  if (roads) {
    for (let c = 0; c < all; c++) {
      if (!roads[c] || !Number.isFinite(t.cost[c]!) || t.flags[c]! & PATH_WATER) continue;
      cost[c] = roads[c]!;
    }
  }
  // sad (stromy v řadách) – i jeho okraj, okrsek svatyně
  for (const o of v.orchards ?? []) {
    if (o.squares.length === 0) continue;
    const { inside, edge } = squareCells(grid, o.squares);
    for (const c of inside) cost[c] = Infinity;
    for (const c of edge) cost[c] = Infinity;
  }
  // hřbitov a ohrada: jen buňky uvnitř plotu, který stojí 1,5 m od okraje čtverců – mezi dvěma
  // sousedními stavbami zůstává ulička 3 m, kterou vůz projede (oxen.md – plot je menší než čtverec)
  for (const cemetery of v.cemeteries ?? []) {
    for (const c of fencedCells(grid, cemetery.squares, CEMETERY_FENCE_INSET_M)) cost[c] = Infinity;
  }
  for (const pen of v.pens ?? []) {
    for (const c of fencedCells(grid, penPathSquares(pen), PEN_FENCE_INSET_M)) cost[c] = Infinity;
  }
  for (const b of v.sacred?.buildings ?? []) {
    if (b.kind !== 'shrine') continue;
    const half = SACRED_BUILDINGS.shrine.footprintM / 2;
    cellsIn(
      grid,
      b.position.x - half,
      b.position.z - half,
      b.position.x + half,
      b.position.z + half,
      (c) => {
        cost[c] = Infinity;
      },
    );
  }
  // domy, pozemky, staveniště, milíř a modla – i s půl šířkou vozu
  const margin = HOUSE_MARGIN_M + CART_ROUTES.widthM / 2;
  for (const b of villageBuildings(v).all) {
    const [x0, z0, x1, z1] = buildingBounds(b, margin);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (inBuilding(b, x, z, margin)) cost[c] = Infinity;
    });
  }
  return grid;
}

/** Průchodné buňky do `radius` m od bodu (aspoň nejbližší průchodná do 3 buněk). */
function cellsNear(grid: CartGrid, p: PathPoint, radius: number): number[] {
  const out: number[] = [];
  cellsIn(grid, p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c, x, z) => {
    if (length2(x - p.x, z - p.z) <= radius && Number.isFinite(grid.cost[c]!)) out.push(c);
  });
  if (out.length > 0) return out;
  let best = -1;
  let bestD = Infinity;
  const reach = 3 * grid.cellM;
  cellsIn(grid, p.x - reach, p.z - reach, p.x + reach, p.z + reach, (c, x, z) => {
    const d = length2(x - p.x, z - p.z);
    if (Number.isFinite(grid.cost[c]!) && d < bestD) {
      best = c;
      bestD = d;
    }
  });
  return best >= 0 ? [best] : [];
}

/**
 * Trasy vozu (wagons.md – Vozová síť): jedno hledání (Dijkstra po buňkách se směrem jízdy) od
 * depa ke všem cílům – sklon ve směru jízdy nad mezí neprojede, stoupání zdražuje se čtvercem,
 * zatočit jde jen o kousek na krok (dvoukolák ≤ 53°, čtyřkolák ≤ 27°) a každá změna směru trochu
 * stojí. Cíl je dosažen v buňce do `reachM` od něj. Výsledek podle pořadí cílů – nedosažitelný cíl
 * má `reached: false` a prázdnou trasu. Deterministicky.
 */
export function cartRoutes(input: CartRoutesInput): { grid: CartGrid; routes: CartRoute[] } {
  const grid = cartGrid(input);
  const { width: w, height: h, cost, heights } = grid;
  const all = w * h;
  const routes: CartRoute[] = input.targets.map(() => ({
    reached: false,
    cost: Infinity,
    lengthM: 0,
    points: [],
    cells: [],
  }));
  // cíle po buňkách
  const goals = new Map<number, number[]>();
  input.targets.forEach((target, k) => {
    for (const c of cellsNear(grid, target, target.reachM)) {
      const list = goals.get(c);
      if (list) list.push(k);
      else goals.set(c, [k]);
    }
  });
  const starts = [...new Set(input.depots.flatMap((d) => cellsNear(grid, d, DEPOT_REACH_M)))];
  if (goals.size === 0 || starts.length === 0) return { grid, routes };
  const states = all * HEADINGS;
  const dist = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const heap = new PathHeap();
  for (const c of starts.sort((a, b) => a - b)) {
    for (let hd = 0; hd < HEADINGS; hd++) {
      const s = c * HEADINGS + hd;
      dist[s] = 0;
      heap.push(s, 0);
    }
  }
  const turnSteps = CART_ROUTES.turnSteps[input.kind];
  const step = grid.cellM;
  const best = new Int32Array(input.targets.length).fill(-1);
  let left = new Set([...goals.values()].flat()).size;
  while (heap.size > 0 && left > 0) {
    const s = heap.pop();
    const d = heap.topKey;
    if (d > dist[s]!) continue;
    if (d > CART_ROUTES.maxCost) break;
    const c = Math.floor(s / HEADINGS);
    const hd = s - c * HEADINGS;
    const reachedHere = goals.get(c);
    if (reachedHere) {
      for (const k of reachedHere) {
        if (best[k]! >= 0) continue;
        best[k] = s;
        left--;
      }
    }
    const i = c % w;
    const j = (c - i) / w;
    const own = cost[c]!;
    for (let turn = -turnSteps; turn <= turnSteps; turn++) {
      const k = (hd + turn + HEADINGS) % HEADINGS;
      const [di, dj] = DIRS[k]!;
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      let blocked = false;
      for (const [vi, vj] of DIR_VIA[k]!) {
        if (cost[(j + vj) * w + i + vi] === Infinity) blocked = true;
      }
      if (blocked) continue;
      const length = DIR_LEN[k]! * step;
      const rise = heights ? Math.abs(heights[n]! - heights[c]!) : 0;
      const grade = rise / length;
      if (grade > CART_ROUTES.maxGrade) continue;
      const g = grade / CART_ROUTES.maxGrade;
      const nd =
        d +
        length * ((own + next) / 2) * (1 + CART_ROUTES.gradeCost * g * g) +
        CART_ROUTES.turnCost * Math.abs(turn);
      const ns = n * HEADINGS + k;
      if (nd < dist[ns]!) {
        dist[ns] = nd;
        parent[ns] = s;
        heap.push(ns, nd);
      }
    }
  }
  input.targets.forEach((_, k) => {
    const end = best[k]!;
    if (end < 0) return;
    const cells: number[] = [];
    for (let s = end; s >= 0; s = parent[s]!) {
      const c = Math.floor(s / HEADINGS);
      if (cells[cells.length - 1] !== c) cells.push(c);
    }
    cells.reverse();
    const raw = cells.map((c) => ({
      x: grid.originX + (c % w) * step,
      z: grid.originZ + Math.floor(c / w) * step,
    }));
    let lengthM = 0;
    for (let q = 1; q < raw.length; q++) {
      lengthM += length2(raw[q]!.x - raw[q - 1]!.x, raw[q]!.z - raw[q - 1]!.z);
    }
    routes[k] = {
      reached: true,
      cost: dist[end]!,
      lengthM,
      points: simplifyPathLine(raw, [], 0.5).points,
      cells,
    };
  });
  return { grid, routes };
}

/**
 * Provoz vozů po buňkách (jízd za den) – trasy s počtem jízd za den (`trips` po trasách). Tvar
 * jako provoz pěšin (`PathTraffic`), bez vyhlazení.
 */
export function cartTraffic(
  grid: GridWindow,
  routes: readonly CartRoute[],
  trips: readonly number[],
): PathTraffic {
  const raw = new Float32Array(grid.width * grid.height);
  routes.forEach((route, k) => {
    const n = trips[k] ?? 0;
    if (!route.reached || n <= 0) return;
    for (const c of route.cells) raw[c] = raw[c]! + n;
  });
  return {
    originX: grid.originX,
    originZ: grid.originZ,
    cellM: grid.cellM,
    width: grid.width,
    height: grid.height,
    values: raw,
    raw,
  };
}

/**
 * Odkud vozy vyjíždějí (wagons.md – Vůz: vůz stojí u ohrady se spřežením): střed každé hotové
 * ohrady se spřežením (`withTeam` – id ohrad) – vůz vyjede z průjezdné buňky kolem ní
 * (DEPOT_REACH_M).
 */
export function cartDepots(village: PathVillage, withTeam: ReadonlySet<number>): PathPoint[] {
  return (village.pens ?? [])
    .filter((pen) => pen.built && withTeam.has(pen.id))
    .map((pen) => ({ x: pen.x, z: pen.z }));
}

/**
 * Projede vůz po ose (zemská stezka, pevná cesta – wagons.md, trade.md)? Sklon ve směru jízdy
 * po kusech dlouhých jako dvě buňky terénu nejvýš CART_ROUTES.maxGrade a voda jen brodem.
 * Vrátí, jestli projede, délku příliš prudkých kusů (m) a nejprudší sklon. Bez výšek jen voda.
 */
export function axisCartCheck(
  points: readonly PathPoint[],
  terrain: PathTerrain,
): { passable: boolean; steepM: number; maxGrade: number; deepWater: boolean } {
  const pieceM = terrain.cellM * 2;
  const samples: PathPoint[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / pieceM));
    for (let q = k === 1 ? 0 : 1; q <= n; q++) {
      samples.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  const cell = (p: PathPoint): number => {
    const i = Math.round((p.x - terrain.originX) / terrain.cellM);
    const j = Math.round((p.z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return -1;
    return j * terrain.width + i;
  };
  let steepM = 0;
  let maxGrade = 0;
  let deepWater = false;
  for (let q = 0; q < samples.length; q++) {
    const c = cell(samples[q]!);
    if (c < 0) continue;
    const flags = terrain.flags[c]!;
    if (flags & PATH_WATER && !(flags & PATH_FORD)) deepWater = true;
    if (q === 0 || !terrain.heights) continue;
    const prev = cell(samples[q - 1]!);
    if (prev < 0) continue;
    const length = length2(samples[q]!.x - samples[q - 1]!.x, samples[q]!.z - samples[q - 1]!.z);
    if (length <= 0) continue;
    const grade = Math.abs(terrain.heights[c]! - terrain.heights[prev]!) / length;
    if (grade > maxGrade) maxGrade = grade;
    if (grade > CART_ROUTES.maxGrade) steepM += length;
  }
  return { passable: steepM === 0 && !deepWater, steepM, maxGrade, deepWater };
}
