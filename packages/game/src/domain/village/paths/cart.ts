import { length2 } from '../../landscape';
import {
  CART_ROUTES,
  CART_SPEED,
  CEMETERY_FENCE_INSET_M,
  PEN_FENCE_INSET_M,
  SACRED_BUILDINGS,
} from '../rules';
import type { PartStage } from '../core/summary';
import type { CartKind, RoadGrade, RoadGround } from '../types';
import {
  PathHeap,
  quantizedStep,
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
import { fieldCellsOf, fortWallCells } from './network-grid';
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
/** Úhlopříčky (krok o 1 a 1) – po pevné cestě smí přes roh (`cartRoutes`). */
const DIAGONAL = DIRS.map(([i, j]) => Math.abs(i) === 1 && Math.abs(j) === 1);
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

/**
 * Mřížka pro vůz: cena povrchu za metr (Infinity = neprojede) a výšky buněk. Po prvním hledání
 * (`cartRoutesOn`) se nemění – souvislé kusy mřížky se pamatují k ní (`cartParts`).
 */
export interface CartGrid extends GridWindow {
  cost: Float32Array;
  heights: Float32Array | null;
  /** Buňky pásu pevné cesty, kudy vůz jede (průjezdné), 1 – bez pevných cest null. */
  road?: Uint8Array | null;
  /** Buňky dílů polí pro mřížku s jinými stadii dílů (`withPartStages`) – jen z `cartGrid`. */
  fieldCells?: CartFieldCells | null;
}

/**
 * Vrstva dílů polí v mřížce vozu (`cartGrid`): po polích a buňkách v pořadí, v jakém je vrstva
 * položila – jen buňky, které pozdější vrstvy (les vsi, pevná cesta, sad, hřbitov, ohrada,
 * svatyně, stavby) nepřepíšou. Mřížka s jinými stadii dílů téže vsi (`withPartStages`) tak položí
 * jen tuto vrstvu znovu – ve stejném pořadí, bit po bitu jako celá mřížka.
 */
export interface CartFieldCells {
  /** Buňka mřížky. */
  cells: Int32Array;
  /** Nejbližší díl buňky – index přes díly všech polí v pořadí. */
  parts: Int32Array;
  /** Cena buňky před vrstvou dílů. */
  pre: Float32Array;
}

/** Cíl vozu – bod a jak blízko musí vůz dojet (m). */
export interface CartTarget {
  x: number;
  z: number;
  reachM: number;
}

/**
 * Trasa vozu k cíli: dojede (`reached`), cena (m jízdy po louce bez stoupání), délka (m) a osa
 * od depa k cíli (zjednodušená) a buňky trasy (pro provoz).
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
 * Rychlost vozu přes díl pole proti louce (paths.md – Stálé trasy, pravidlo 1): křoviny a mladý
 * les 0 (vůz neprojede), jinak stálá `CART_SPEED.field` v každém stadiu – dvoukolák i čtyřkolák.
 */
export function cartPartSpeed(stage: PartStage): number {
  if (stage === 'shrubs' || stage === 'young-forest') return 0;
  return CART_SPEED.field;
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
  unbridged = false,
): number {
  // hať upravené cesty i vozová cesta (zpevněné koleje – roads.md, Vozová cesta) drží rychlost
  // i v mokřině
  if (grade === 'wagon' || (grade === 'improved' && !unbridged)) {
    return CART_SPEED.road[grade] + (wet ? 0 : treeSpeed);
  }
  if (wet) return CART_SPEED.wet;
  const speed = CART_SPEED.road[grade];
  return (cart ? Math.max(speed, CART_SPEED.road.cart) : speed) + treeSpeed;
}

/**
 * Pás pevné cesty pro vůz – buňky do tolika buněk od bodu osy. Jen nejbližší buňka osy (jako
 * `roadMask`) nestačí: šikmá cesta lesem nebo osetým polem je pak řetěz buněk spojených rohy
 * a vůz úhlopříčkou přes roh neprůchodné buňky nejede (`DIR_VIA`) – cesta by byla nesjízdná.
 * Rohové buňky úhlopříčky jsou od osy √2/2 buňky, od nejbližšího bodu osy (po třetině buňky)
 * nejvýš ≈ 0,73 buňky; rovná cesta v řadě buněk zůstane jednou řadou (sousední řada je 1 buňka).
 */
const ROAD_BAND_CELLS = 0.75;

/**
 * Buňky pásu pevné cesty (`ROAD_BAND_CELLS` kolem bodů osy po třetině buňky): `mark(c, along)`
 * pro každou buňku pásu a vzdálenost bodu osy od začátku (m) – buňka může přijít víckrát. Vozová
 * síť i mřížka vozové cesty (`wagonRoadGrid`) tak berou pevnou cestu stejně.
 */
export function roadBandCells(
  grid: GridWindow,
  points: readonly PathPoint[],
  mark: (c: number, along: number) => void,
): void {
  const step = grid.cellM / 3;
  const band2 = ROAD_BAND_CELLS * ROAD_BAND_CELLS;
  const markAt = (x: number, z: number, along: number): void => {
    const fi = (x - grid.originX) / grid.cellM;
    const fj = (z - grid.originZ) / grid.cellM;
    const i0 = Math.max(0, Math.ceil(fi - ROAD_BAND_CELLS));
    const i1 = Math.min(grid.width - 1, Math.floor(fi + ROAD_BAND_CELLS));
    const j0 = Math.max(0, Math.ceil(fj - ROAD_BAND_CELLS));
    const j1 = Math.min(grid.height - 1, Math.floor(fj + ROAD_BAND_CELLS));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if ((i - fi) * (i - fi) + (j - fj) * (j - fj) > band2) continue;
        mark(j * grid.width + i, along);
      }
    }
  };
  if (points.length === 1) markAt(points[0]!.x, points[0]!.z, 0);
  let along = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const length = length2(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(length / step));
    for (let q = 0; q <= n; q++) {
      markAt(a.x + ((b.x - a.x) * q) / n, a.z + ((b.z - a.z) * q) / n, along + (length * q) / n);
    }
    along += length;
  }
}

/**
 * Cena metru po pevných cestách po buňkách (pás `roadBandCells`, mokřina podle polohy na ose
 * z `ground.wet`, mimo ni i se stromy u cesty – `lined`); mimo cesty 0, v buňce víc cest
 * nejrychlejší. Bez cest null.
 */
function cartRoadCosts(grid: GridWindow, roads: CartVillage['roads']): Float32Array | null {
  if (!roads || roads.length === 0) return null;
  const out = new Float32Array(grid.width * grid.height);
  for (const road of roads) {
    const grade = road.grade ?? 'trodden';
    const cart = road.cart === true;
    const unbridged = road.unbridged === true;
    const dryCost = 1 / cartRoadSpeed(grade, cart, false, roadTreeSpeed(road.lined), unbridged);
    const wetCost = 1 / cartRoadSpeed(grade, cart, true, 0, unbridged);
    const wet = road.ground?.wet ?? [];
    roadBandCells(grid, road.points, (c, along) => {
      const cost = wet.some(([a, b]) => along >= a && along <= b) ? wetCost : dryCost;
      if (out[c] === 0 || cost < out[c]!) out[c] = cost;
    });
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
}

/**
 * Mřížka pro vůz (wagons.md – Kudy vůz projede): z terénu pěšin – voda jen brodem, les ne,
 * mokřina pomaleji, překážky krajiny (`blocked`) ne; díly polí stálou cenou (`cartPartSpeed` –
 * v každém stadiu stejně, dvoukolák i čtyřkolák; křoviny a mladý les ne – meze mezi poli
 * průjezdné; paths.md – Stálé trasy), sad, hřbitov, ohrada a les vsi ne (ani jejich okraj –
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
  const fieldSquares = v.fields.map((field) => fieldCellsOf(grid, field.parts));
  // pole založené v lese je vymýcené – les krajiny tam neplatí
  const cleared = new Uint8Array(all);
  for (const { inside, edge } of fieldSquares) {
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
  // díly polí stálou cenou (zarostlý neprůjezdný) – nejpomalejší z povrchu a dílu platí; buňky
  // a díly vrstvy se pamatují pro mřížku s jinými stadii (`withPartStages`)
  const pre = new Float32Array(cost);
  const layerCells: number[] = [];
  const layerParts: number[] = [];
  let first = 0;
  v.fields.forEach((field, f) => {
    const { inside, nearest } = fieldSquares[f]!;
    for (let n = 0; n < inside.length; n++) {
      const c = inside[n]!;
      const speed = cartPartSpeed(field.parts[nearest[n]!]!.stage);
      cost[c] = speed > 0 ? Math.max(cost[c]!, 1 / speed) : Infinity;
      layerCells.push(c);
      layerParts.push(first + nearest[n]!);
    }
    first += field.parts.length;
  });
  // buňky, které pozdější vrstvy přepíšou (vrstva dílů tam neplatí)
  const later = new Uint8Array(all);
  // les vsi je les – vůz jen po pevné cestě
  const woods = (v.woods ?? []).filter((wd) => wd.surface !== 'forest');
  if (woods.length > 0) {
    const { inside, edge } = squareCells(grid, woods);
    for (const c of [...inside, ...edge]) {
      cost[c] = Infinity;
      later[c] = 1;
    }
  }
  // pevné cesty – sjízdné vždy (i lesem, přes pole a mezi překážkami) rychlostí podle druhu cesty
  // a mokřiny na ose; voda (brod – i pod hatí) a neprůchodná místa terénu zůstávají
  const roads = cartRoadCosts(grid, v.roads);
  if (roads) {
    grid.road = new Uint8Array(all);
    for (let c = 0; c < all; c++) {
      if (!roads[c] || !Number.isFinite(t.cost[c]!) || t.flags[c]! & PATH_WATER) continue;
      cost[c] = roads[c]!;
      grid.road[c] = 1;
      later[c] = 1;
    }
  }
  const block = (c: number): void => {
    cost[c] = Infinity;
    later[c] = 1;
  };
  // sad (stromy v řadách) – i jeho okraj, okrsek svatyně
  for (const o of v.orchards ?? []) {
    if (o.squares.length === 0) continue;
    const { inside, edge } = squareCells(grid, o.squares);
    for (const c of inside) block(c);
    for (const c of edge) block(c);
  }
  // hřbitov a ohrada: jen buňky uvnitř plotu, který stojí 1,5 m od okraje čtverců – mezi dvěma
  // sousedními stavbami zůstává ulička 3 m, kterou vůz projede (oxen.md – plot je menší než čtverec)
  for (const cemetery of v.cemeteries ?? []) {
    for (const c of fencedCells(grid, cemetery.squares, CEMETERY_FENCE_INSET_M)) block(c);
  }
  for (const pen of v.pens ?? []) {
    for (const c of fencedCells(grid, penPathSquares(pen), PEN_FENCE_INSET_M)) block(c);
  }
  // stojící opevnění (fortifications.md – Brány): vůz projede jen branou (4 m – vůz se spřežením)
  for (const fort of v.fortifications ?? []) {
    for (const c of fortWallCells(grid, fort).wall) block(c);
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
      block,
    );
  }
  // domy, pozemky, staveniště, milíř a modla – i s půl šířkou vozu
  const margin = HOUSE_MARGIN_M + CART_ROUTES.widthM / 2;
  for (const b of villageBuildings(v).all) {
    const [x0, z0, x1, z1] = buildingBounds(b, margin);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (inBuilding(b, x, z, margin)) block(c);
    });
  }
  if (grid.road) for (let c = 0; c < all; c++) if (cost[c] === Infinity) grid.road[c] = 0;
  let kept = 0;
  for (const c of layerCells) if (!later[c]) kept++;
  const fieldCells: CartFieldCells = {
    cells: new Int32Array(kept),
    parts: new Int32Array(kept),
    pre: new Float32Array(kept),
  };
  for (let k = 0, n = 0; k < layerCells.length; k++) {
    const c = layerCells[k]!;
    if (later[c]) continue;
    fieldCells.cells[n] = c;
    fieldCells.parts[n] = layerParts[k]!;
    fieldCells.pre[n] = pre[c]!;
    n++;
  }
  grid.fieldCells = fieldCells;
  return grid;
}

/**
 * Mřížka vozu téže vsi s jinými stadii dílů (`village` se od vsi mřížky `grid` liší jen stadii –
 * týž `cartGridKey` bez zarostlých dílů): vrstva dílů polí položená znovu na buňky, které
 * pozdější vrstvy nepřepsaly (`CartFieldCells`) – ve stejném pořadí, bit po bitu jako
 * `cartGrid` nové vsi. Mřížka bez vrstvy dílů (ne z `cartGrid`) null.
 */
export function withPartStages(
  grid: CartGrid,
  village: Pick<CartVillage, 'fields'>,
): CartGrid | null {
  const layer = grid.fieldCells;
  if (!layer) return null;
  const speeds: number[] = [];
  for (const field of village.fields)
    for (const p of field.parts) speeds.push(cartPartSpeed(p.stage));
  const cost = new Float32Array(grid.cost);
  const { cells, parts, pre } = layer;
  for (let k = 0; k < cells.length; k++) cost[cells[k]!] = pre[k]!;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k]!;
    const speed = speeds[parts[k]!]!;
    cost[c] = speed > 0 ? Math.max(cost[c]!, 1 / speed) : Infinity;
  }
  return { ...grid, cost };
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
  return { grid, routes: cartRoutesOn(grid, input) };
}

/** Posun indexu buňky o krok směru (po řádcích mřížky šířky `w`). */
const DIR_DI = Int8Array.from(DIRS, ([i]) => i);
const DIR_DJ = Int8Array.from(DIRS, ([, j]) => j);
/** Krok vede přes dvě buňky (úhlopříčka, skok) – 1, po ose 0. */
const DIR_HAS_VIA = Uint8Array.from(DIR_VIA, (via) => (via.length > 0 ? 1 : 0));
const DIR_IS_DIAGONAL = Uint8Array.from(DIAGONAL, (d) => (d ? 1 : 0));

/**
 * Opakovaně použitá pole hledání (`cartRoutesOn`) – hledání je synchronní a jedno po druhém,
 * takže stačí jedna sada; roste podle největší mřížky (u Vlkova ≈ 140 tis. buněk × 16 směrů
 * ≈ 45 MB). Mezi hledáními se nenulují – stav buňky platí jen s razítkem běhu (`searchRun`), jako
 * v síti pěšin (`SearchState`). Ceny jako Float64 – Float32 by z platných záznamů haldy dělal
 * zastaralé.
 */
let searchDist = new Float64Array(0);
let searchParent = new Int32Array(0);
/** Ceny kroků z buňky po směrech (-1 neprojede) a běh hledání, ve kterém se buňce spočítaly. */
let searchEdge = new Float64Array(0);
let searchEdgeRun = new Uint32Array(0);
/** Běh hledání, ve kterém buňka dostala ceny a předchůdce svých 16 stavů (jinak neplatí). */
let searchStateRun = new Uint32Array(0);
/**
 * Hledání ceny (`cartCostOn`): běh, ve kterém je buňka cílem, běh, ve kterém má buňka cenu
 * zpětného hledání (a pak odhad A*), a ta cena / odhad zbytku cesty z buňky.
 */
let searchGoalRun = new Uint32Array(0);
let searchBackRun = new Uint32Array(0);
let searchHeur = new Float64Array(0);
let searchRun = 0;
const searchHeap = new PathHeap();
/** Halda zpětného hledání po buňkách (`cartCostOn`). */
const searchBackHeap = new PathHeap();

/**
 * Připraví sdílená pole hledání pro mřížku s `all` buňkami (rostou podle největší mřížky) a vrátí
 * razítko nového běhu.
 */
function nextSearchRun(all: number): number {
  const states = all * HEADINGS;
  if (searchDist.length < states) {
    searchDist = new Float64Array(states);
    searchParent = new Int32Array(states);
    searchEdge = new Float64Array(states);
  }
  if (searchEdgeRun.length < all || searchRun >= 0xfffffffe) {
    const size = Math.max(all, searchEdgeRun.length);
    searchEdgeRun = new Uint32Array(size);
    searchStateRun = new Uint32Array(size);
    searchGoalRun = new Uint32Array(size);
    searchBackRun = new Uint32Array(size);
    searchHeur = new Float64Array(size);
    searchRun = 0;
  }
  return ++searchRun;
}

/** Kroky směrů na mřížce: posun indexu, buňky rohů, délka (m) a cena zatočení (podle vozu). */
interface CartSteps {
  turnSteps: number;
  offset: Int32Array;
  via0: Int32Array;
  via1: Int32Array;
  length: Float64Array;
  turnPrice: Float64Array;
}

/** Kroky směrů vozu `kind` na mřížce `grid` (`CartSteps`). */
function cartSteps(grid: CartGrid, kind: CartKind): CartSteps {
  const w = grid.width;
  const turnSteps = CART_ROUTES.turnSteps[kind];
  const offset = new Int32Array(HEADINGS);
  const via0 = new Int32Array(HEADINGS);
  const via1 = new Int32Array(HEADINGS);
  const length = new Float64Array(HEADINGS);
  for (let k = 0; k < HEADINGS; k++) {
    offset[k] = DIR_DJ[k]! * w + DIR_DI[k]!;
    const via = DIR_VIA[k]!;
    if (via.length > 0) {
      via0[k] = via[0]![1] * w + via[0]![0];
      via1[k] = via[1]![1] * w + via[1]![0];
    }
    length[k] = DIR_LEN[k]! * grid.cellM;
  }
  const turnPrice = new Float64Array(2 * turnSteps + 1);
  for (let turn = -turnSteps; turn <= turnSteps; turn++) {
    turnPrice[turn + turnSteps] = CART_ROUTES.turnCost * Math.abs(turn);
  }
  return { turnSteps, offset, via0, via1, length, turnPrice };
}

/**
 * Ceny kroků z buňky `c` bez zatočení pro všech 16 směrů do `searchEdge` (-1 neprojede) – jednou
 * za hledání (z buňky se vyjíždí až v 16 stavech, každý zkouší 3–5 směrů).
 */
function cellEdges(grid: CartGrid, steps: CartSteps, c: number): void {
  const { width: w, height: h, cost, heights } = grid;
  const road = grid.road ?? null;
  const { offset, via0, via1, length } = steps;
  const edge = searchEdge;
  const maxGrade = CART_ROUTES.maxGrade;
  const gradeCost = CART_ROUTES.gradeCost;
  const base = c * HEADINGS;
  const i = c % w;
  const j = (c - i) / w;
  const own = cost[c]!;
  const onRoad = road !== null && road[c] !== 0;
  for (let k = 0; k < HEADINGS; k++) {
    edge[base + k] = -1;
    const ii = i + DIR_DI[k]!;
    const jj = j + DIR_DJ[k]!;
    if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
    const n = c + offset[k]!;
    const next = cost[n]!;
    if (next === Infinity) continue;
    // úhlopříčka z cesty na cestu jede po ose cesty – roh vedle (les, okraj domu) ji nezastaví;
    // pás cesty na mřížce je jen obraz osy (ohyb cesty u domu by jinak nesjel)
    if (
      DIR_HAS_VIA[k] &&
      !(onRoad && DIR_IS_DIAGONAL[k] && road[n]) &&
      (cost[c + via0[k]!] === Infinity || cost[c + via1[k]!] === Infinity)
    ) {
      continue;
    }
    const len = length[k]!;
    const rise = heights ? Math.abs(heights[n]! - heights[c]!) : 0;
    const grade = rise / len;
    if (grade > maxGrade) continue;
    const g = grade / maxGrade;
    edge[base + k] = len * ((own + next) / 2) * (1 + gradeCost * g * g);
  }
}

/** Souvislé kusy mřížky vozu (`cartParts`) – po mřížce; mřížka se po prvním hledání nemění. */
const CART_PARTS = new WeakMap<CartGrid, Int32Array>();

/**
 * Souvislé kusy mřížky: buňky, mezi kterými vůz projede bez ohledu na směr jízdy a zatáčení
 * (tytéž kroky jako hledání – neprůjezdná buňka, roh u úhlopříčky a skoku, sklon). Krok platí
 * oběma směry (sklon i rohy jsou souměrné), takže kus je opravdu „kam se odtud dá dojet“ –
 * hledání se směrem jízdy dojede jen do svého kusu. Neprůjezdná buňka -1.
 */
function cartParts(grid: CartGrid): Int32Array {
  const known = CART_PARTS.get(grid);
  if (known) return known;
  const { width: w, height: h, cost, heights } = grid;
  const road = grid.road ?? null;
  const all = w * h;
  const part = new Int32Array(all).fill(-1);
  const queue = new Int32Array(all);
  const step = grid.cellM;
  let parts = 0;
  for (let seed = 0; seed < all; seed++) {
    if (part[seed] !== -1 || cost[seed] === Infinity) continue;
    part[seed] = parts;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    while (head < tail) {
      const c = queue[head++]!;
      const i = c % w;
      const j = (c - i) / w;
      for (let k = 0; k < HEADINGS; k++) {
        const ii = i + DIR_DI[k]!;
        const jj = j + DIR_DJ[k]!;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const n = jj * w + ii;
        if (part[n] !== -1 || cost[n] === Infinity) continue;
        if (!passable(cost, road, heights, c, n, k, i, j, w, DIR_LEN[k]! * step)) continue;
        part[n] = parts;
        queue[tail++] = n;
      }
    }
    parts++;
  }
  CART_PARTS.set(grid, part);
  return part;
}

/**
 * Projede vůz krokem `k` z buňky `c` (sloupec `i`, řádek `j`) do průjezdné `n`? Rohy úhlopříčky
 * a skoku a sklon ve směru jízdy – jako v hledání (`cartRoutesOn`).
 */
function passable(
  cost: Float32Array,
  road: Uint8Array | null,
  heights: Float32Array | null,
  c: number,
  n: number,
  k: number,
  i: number,
  j: number,
  w: number,
  length: number,
): boolean {
  if (!(road && DIAGONAL[k] && road[c] && road[n])) {
    for (const [vi, vj] of DIR_VIA[k]!) {
      if (cost[(j + vj) * w + i + vi] === Infinity) return false;
    }
  }
  const rise = heights ? Math.abs(heights[n]! - heights[c]!) : 0;
  return !(rise / length > CART_ROUTES.maxGrade);
}

/**
 * Trasy vozu po hotové mřížce `grid` (`cartGrid`) – hledání jako `cartRoutes`. Trasa k cíli
 * nezávisí na ostatních cílech: hledání je do posledního cíle pro všechny cíle totéž a remízy
 * rozhoduje nižší index (paths.md – Stálé trasy, pravidlo 3) – proto jde hledat po kouscích
 * a pamatovat po cílech (`villageCartRoutes`).
 *
 * Rychlé hledání (docs/code/village-roads.md – Trasy v paměti): stavy (buňka × směr) jen
 * v typovaných polích, cíle po buňkách v řetězech indexů, pole hledání opakovaně s razítkem běhu
 * po buňkách (`searchDist`), ceny kroků z buňky jednou za hledání pro všech 16 směrů (zatočení se
 * přičte zvlášť – součet ve stejném pořadí). Cíl mimo souvislý kus mřížky depa (`cartParts`) se
 * nečeká – hledání skončí po posledním dosažitelném cíli místo prohledání celé mřížky. Halda,
 * pořadí kroků a pravidla remíz jsou táž jako dřív, výsledek bit po bitu stejný (test
 * `cart-routes-fast`).
 *
 * S `nearestM` (stačí nejlevnější cíl – voda vozem) hledání skončí o `nearestM` za prvním
 * dosaženým cílem: trasy k cílům do té ceny jsou bit po bitu tytéž (všechny stavy do ní jsou
 * vytažené, předchůdci i remízy rozhodnuté), dražší cíle vrátí „nedojede“, i když by dojel.
 */
export function cartRoutesOn(
  grid: CartGrid,
  input: Pick<CartRoutesInput, 'kind' | 'depots' | 'targets'>,
  nearestM: number | null = null,
): CartRoute[] {
  const all = grid.width * grid.height;
  const targetCount = input.targets.length;
  const routes: CartRoute[] = input.targets.map(() => ({
    reached: false,
    cost: Infinity,
    lengthM: 0,
    points: [],
    cells: [],
  }));
  const starts = [...new Set(input.depots.flatMap((d) => cellsNear(grid, d, DEPOT_REACH_M)))];
  if (starts.length === 0) return routes;
  // cíle po buňkách: řetěz záznamů (cíl, další záznam buňky) – v buňce cíle vzestupně
  const goalCells = input.targets.map((target) => cellsNear(grid, target, target.reachM));
  let entries = 0;
  for (const cells of goalCells) entries += cells.length;
  if (entries === 0) return routes;
  const goalHead = new Int32Array(all).fill(-1);
  const goalNext = new Int32Array(entries);
  const goalTarget = new Int32Array(entries);
  let entry = 0;
  for (let k = targetCount - 1; k >= 0; k--) {
    for (const c of goalCells[k]!) {
      goalTarget[entry] = k;
      goalNext[entry] = goalHead[c]!;
      goalHead[c] = entry++;
    }
  }
  // čeká se jen na cíle v souvislém kusu některého depa – ostatní hledání nedosáhne
  const parts = cartParts(grid);
  const startParts = new Set(starts.map((c) => parts[c]!));
  const awaited = new Uint8Array(targetCount);
  let left = 0;
  for (let k = 0; k < targetCount; k++) {
    if (goalCells[k]!.some((c) => startParts.has(parts[c]!))) {
      awaited[k] = 1;
      left++;
    }
  }
  if (left === 0) return routes;
  const run = nextSearchRun(all);
  const edge = searchEdge;
  const edgeRun = searchEdgeRun;
  const stateRun = searchStateRun;
  const dist = searchDist;
  const parent = searchParent;
  const heap = searchHeap;
  heap.clear();
  for (const c of starts.sort((a, b) => a - b)) {
    stateRun[c] = run;
    for (let hd = 0; hd < HEADINGS; hd++) {
      const s = c * HEADINGS + hd;
      dist[s] = 0;
      parent[s] = -1;
      heap.push(s, 0);
    }
  }
  const steps = cartSteps(grid, input.kind);
  const { turnSteps, offset, turnPrice } = steps;
  const maxCost = CART_ROUTES.maxCost;
  const best = new Int32Array(targetCount).fill(-1);
  const bestD = new Float64Array(targetCount).fill(Infinity);
  // po posledním cíli se dobírají stavy se stejnou cenou – z koncových stavů cíle (buňka × směr)
  // se stejnou cenou vyhraje nižší index (paths.md – Stálé trasy, pravidlo 3)
  let limit = Infinity;
  while (heap.size > 0 && heap.peekKey() <= limit) {
    const s = heap.pop();
    const d = heap.topKey;
    if (d > dist[s]!) continue;
    if (d > maxCost) break;
    // HEADINGS = 16: buňka a směr ze stavu posunem a maskou
    const c = s >> 4;
    const hd = s & 15;
    for (let e = goalHead[c]!; e >= 0; e = goalNext[e]!) {
      const k = goalTarget[e]!;
      if (best[k]! < 0) {
        best[k] = s;
        bestD[k] = d;
        if (awaited[k]) {
          if (--left === 0) limit = d;
          else if (nearestM !== null && limit === Infinity) limit = d + nearestM;
        }
      } else if (d === bestD[k]! && s < best[k]!) best[k] = s;
    }
    if (left === 0) continue;
    // ceny kroků z buňky bez zatočení – spočítané jednou za hledání pro všech 16 směrů
    // (z buňky se vyjíždí až v 16 stavech, každý zkouší 3–5 směrů)
    const base = c * HEADINGS;
    if (edgeRun[c] !== run) {
      edgeRun[c] = run;
      cellEdges(grid, steps, c);
    }
    for (let turn = -turnSteps; turn <= turnSteps; turn++) {
      const k = (hd + turn + HEADINGS) & 15;
      const price = edge[base + k]!;
      if (price < 0) continue;
      const n = c + offset[k]!;
      // cena kroku po kvantech (`quantizedStep`) – součty přesné, remízy opravdové
      const nd = d + quantizedStep(price + turnPrice[turn + turnSteps]!);
      const ns = n * HEADINGS + k;
      if (stateRun[n] !== run) {
        // buňka v tomto hledání poprvé – její stavy zatím bez ceny a předchůdce
        stateRun[n] = run;
        const first = n * HEADINGS;
        for (let q = first; q < first + HEADINGS; q++) {
          dist[q] = Infinity;
          parent[q] = -1;
        }
      }
      const old = dist[ns]!;
      if (nd < old) {
        dist[ns] = nd;
        parent[ns] = s;
        heap.push(ns, nd);
      } else if (nd === old && s < parent[ns]!) {
        // remíza – vyhraje předchůdce s nižším indexem (buňka × směr)
        parent[ns] = s;
      }
    }
  }
  const w = grid.width;
  const step = grid.cellM;
  for (let k = 0; k < targetCount; k++) {
    const end = best[k]!;
    if (end < 0) continue;
    const cells: number[] = [];
    for (let s = end; s >= 0; s = parent[s]!) {
      const c = s >> 4;
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
  }
  return routes;
}

/** Cena trasy vozu k jednomu cíli (`cartCostOn`): dojede a za kolik (m jízdy po louce). */
export interface CartCost {
  reached: boolean;
  cost: number;
}

/**
 * Cena trasy vozu k jednomu cíli bez trasy samotné (orba – cesta spřežení k dílu a přesun mezi
 * díly; docs/code/village-roads.md – Trasy v paměti): A* po týchž stavech (buňka × směr)
 * a krocích jako `cartRoutesOn`. Odhad zbytku z buňky je cena k cíli bez směru jízdy (hledání
 * od cíle po buňkách – tytéž kroky a ceny kroků, jen bez zatočení a jeho ceny), dokud nedojde
 * k výjezdu; buňkám dál od cíle se odhadne cena, kam hledání od cíle došlo. Odhad tak nikdy
 * nepřecení (`quantizedStep` roste s cenou, zatočení jen přidá). Kroky jsou po kvantech, součty
 * přesné – nejlevnější cena je tatáž jako `cartRoutesOn(…)[0].cost` bit po bitu (i „nedojede“
 * nad CART_ROUTES.maxCost), jen se prohledá menší kus mřížky. Trasa se nevrací – při remízách
 * by mohla vést jinudy.
 */
export function cartCostOn(
  grid: CartGrid,
  input: { kind: CartKind; depots: readonly PathPoint[]; target: CartTarget },
): CartCost {
  const none: CartCost = { reached: false, cost: Infinity };
  const { width: w, height: h, cost } = grid;
  const all = w * h;
  const starts = [...new Set(input.depots.flatMap((d) => cellsNear(grid, d, DEPOT_REACH_M)))];
  if (starts.length === 0) return none;
  const goals = cellsNear(grid, input.target, input.target.reachM);
  if (goals.length === 0) return none;
  // cíl mimo souvislý kus depa vůz nenajde (jako `cartRoutesOn`)
  const parts = cartParts(grid);
  const startParts = new Set(starts.map((c) => parts[c]!));
  if (!goals.some((c) => startParts.has(parts[c]!))) return none;
  const run = nextSearchRun(all);
  const steps = cartSteps(grid, input.kind);
  const { turnSteps, offset, turnPrice } = steps;
  const maxCost = CART_ROUTES.maxCost;
  const edge = searchEdge;
  const edgeRun = searchEdgeRun;
  const goalRun = searchGoalRun;
  const heur = searchHeur;
  // 1) od cíle po buňkách bez směru jízdy (předchůdce `c` buňky `x` krokem `k`: cena kroku z `c`),
  //    dokud není hotová první buňka výjezdu (z ostatních může být cesta zavřená – výjezd má víc
  //    buněk); hotové buňky `stateRun`, cena v `heur`
  const done = searchStateRun;
  const back = searchBackHeap;
  back.clear();
  for (const c of goals) {
    goalRun[c] = run;
    heur[c] = 0;
    back.push(c, 0);
  }
  const startCells = new Set(starts);
  let found = false;
  const seen = searchBackRun;
  for (const c of goals) seen[c] = run;
  while (back.size > 0 && !found) {
    const x = back.pop();
    const d = back.topKey;
    if (done[x] === run || d > heur[x]!) continue;
    if (d > maxCost) break;
    done[x] = run;
    if (startCells.has(x)) found = true;
    const i = x % w;
    const j = (x - i) / w;
    for (let k = 0; k < HEADINGS; k++) {
      const ii = i - DIR_DI[k]!;
      const jj = j - DIR_DJ[k]!;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const c = x - offset[k]!;
      if (cost[c] === Infinity || done[c] === run) continue;
      if (edgeRun[c] !== run) {
        edgeRun[c] = run;
        cellEdges(grid, steps, c);
      }
      const price = edge[c * HEADINGS + k]!;
      if (price < 0) continue;
      const nd = d + quantizedStep(price);
      if (seen[c] !== run || nd < heur[c]!) {
        seen[c] = run;
        heur[c] = nd;
        back.push(c, nd);
      }
    }
  }
  // výjezd, ke kterému se od cíle nedojde (ani bez zatáčení, nebo jen nad maxCost), vůz nenajde
  if (!found) return none;
  // buňky, kam hledání od cíle nedošlo: aspoň cena, kam došlo (nejlevnější čekající)
  const rest = back.size > 0 ? back.peekKey() : Infinity;
  // 2) A* od výjezdu se směrem jízdy: pole `searchBackRun` s novým razítkem `ahead` značí buňky,
  //    které už mají stavy a odhad – odhad se buňce určí, když na ni hledání poprvé narazí
  //    (`nextSearchRun` nechá razítku místo)
  const ahead = ++searchRun;
  const estimate = (c: number): number => (done[c] === run ? heur[c]! : rest);
  const known = searchBackRun;
  const dist = searchDist;
  const heap = searchHeap;
  heap.clear();
  for (const c of starts.sort((a, b) => a - b)) {
    heur[c] = estimate(c);
    known[c] = ahead;
    for (let hd = 0; hd < HEADINGS; hd++) {
      const s = c * HEADINGS + hd;
      dist[s] = 0;
      heap.push(s, heur[c]!);
    }
  }
  while (heap.size > 0) {
    const s = heap.pop();
    const f = heap.topKey;
    const c = s >> 4;
    const d = dist[s]!;
    // zastaralý záznam haldy (stav mezitím zlevnil) – součty jsou přesné
    if (f > d + heur[c]!) continue;
    // odhad nikdy nepřecení – cíl odtud ani odjinud levněji než `f` nebude
    if (f > maxCost) break;
    if (goalRun[c] === run) return { reached: true, cost: d };
    const base = c * HEADINGS;
    if (edgeRun[c] !== run) {
      edgeRun[c] = run;
      cellEdges(grid, steps, c);
    }
    const hd = s & 15;
    for (let turn = -turnSteps; turn <= turnSteps; turn++) {
      const k = (hd + turn + HEADINGS) & 15;
      const price = edge[base + k]!;
      if (price < 0) continue;
      const n = c + offset[k]!;
      const nd = d + quantizedStep(price + turnPrice[turn + turnSteps]!);
      const ns = n * HEADINGS + k;
      if (known[n] !== ahead) {
        known[n] = ahead;
        heur[n] = estimate(n);
        const first = n * HEADINGS;
        for (let q = first; q < first + HEADINGS; q++) dist[q] = Infinity;
      }
      if (nd < dist[ns]!) {
        dist[ns] = nd;
        const nf = nd + heur[n]!;
        if (nf <= maxCost) heap.push(ns, nf);
      }
    }
  }
  return none;
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
