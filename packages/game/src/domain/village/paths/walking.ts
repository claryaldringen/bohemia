import { length2, type Landscape } from '../../landscape';
import { PATH_WALK, ROAD_WALK } from '../rules';
import type { RoadGrade, RoadGround, RoadLining } from '../types';
import { roadBridged } from '../types-roads';
import type { FortWalls } from '../fortification/walls';
import {
  GATE_SLACK_M,
  wallCrossing,
  walkWallsOf,
  WALL_CLIMB_M,
  type WalkWalls,
} from './walk-walls';
import { PathHeap, type PathLine, type PathPoint, type PathVillage } from './network';
import { fieldCellsOf } from './network-grid';
import {
  PATH_FORD,
  PATH_FOREST,
  PATH_FOREST_COST,
  PATH_WATER,
  PATH_WATER_SPOT,
  PATH_WETLAND,
  pathTerrainOf,
  pathWindowFor,
  type PathTerrain,
} from './terrain';
import {
  isCropPart,
  partWalkSpeed,
  pathCostFactor,
  roadTreeSpeed,
  roadWalkSpeed,
} from './walk-speed';

// Chůze po vyšlapaných pěšinách a pevných cestách (paths.md – Pěšiny a práce, roads.md –
// Rychlejší chůze): vzdálenost chůze = nejkratší z: rovně, nebo rovně k pěšině či cestě, po ní
// a rovně od ní k cíli. Rychlosti proti louce jsou stejné jako v síti pěšin (walk-speed.ts –
// Martin, 19. 10. 2026): po plné pěšině dne 1,3× (slabší úměrně síle – PATH_WALK), po pevné cestě
// podle stupně (ROAD_WALK – vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes
// mokřinu; stromy u cesty přidají až 0,03, jabloně 0,05 – roads.md, Stromy u cesty zrychlí chůzi).
// Mokřina 0,5× (bahno), les 1 / 1,35× (PATH_FOREST_COST), brod + 30 m (po lávce bez zdržení),
// díl pole stálou rychlostí 0,875× v každém stadiu (FIELD_WALK – pěšina dne přes pole nezrychlí,
// pevná cesta jde rychlostí cesty). Úsečka přes potok mimo brod jde objížďkou přes nejbližší brod
// (paths.md – Odhad vzdáleností; Martin 31. 10. 2026: „simulace bude počítat jen s odhadem
// vzdáleností a přesné trasy zůstanou prohlížeči“), most dává síť pevných cest. S krajinou
// (`WalkGround`) se mokřina, les, voda a pole počítají i rovně; bez ní (kalibrace) jen délka. Čistá deterministická funkce – stejně na serveru i v prohlížeči; použije ji každý, kdo
// měří cestu na pole, do sadu, do lesa.

/** Graf chůze – body a úseky s délkou a cenou chůze (rozcestí sdílejí bod). */
export interface WalkGraph {
  x: number[];
  z: number[];
  links: { to: number; length: number; cost: number }[][];
  /**
   * Body každé pěšiny a pevné cesty v pořadí (id uzlů) – obydlí i cíl se na síť napojí jen
   * v nejbližším bodě každé z nich (`walkingDistances`, paths.md – Odhad vzdáleností).
   */
  chains: number[][];
}

/** Pevná cesta pro chůzi – osa, stupeň, mokřina s brody na ose a stromy u cesty. */
export interface WalkRoad {
  points: readonly PathPoint[];
  grade: RoadGrade;
  /** Upravená cesta bez hatě a lávky (`Road.unbridged`) – v mokřině i na brodu jako vyšlapaná. */
  unbridged?: boolean | undefined;
  ground?: RoadGround;
  /** Olemování stromy a jabloněmi (`Road.lined`) – zrychlí chůzi mimo mokřinu; chybí = bez. */
  lined?: RoadLining;
}

/**
 * Půda pro chůzi rovně: terén pěšin v pevném okně kolem místa vsi (stejném na serveru
 * i v prohlížeči – na kouscích ani na tom, co je kde v mezipaměti, výsledek nezávisí). Mimo okno
 * je to louka.
 */
export interface WalkGround {
  terrain: PathTerrain;
  /**
   * Pole vsi po buňkách terénu (`withFieldWalk`): rychlost chůze přes díl (`partWalkSpeed` – v osevu
   * 0,5, strniště 0,8; jinde 1) a díly v osevu, které pěšina dne nezrychlí. Bez údaje bez polí.
   */
  fields?: { speed: Float32Array; crop: Uint8Array };
  /**
   * Stěny opevnění vsi (`withFortWalk`): chodec jimi jde jen branou – úsečky rovně i úseky os
   * pěšin a cest (`walkGraph`). Bez údaje bez opevnění.
   */
  walls?: WalkWalls;
}

/** Okno půdy pro chůzi: tolik metrů od středu místa vsi na každou stranu. */
const WALK_GROUND_HALF_M = 700;
const groundCache = new WeakMap<Landscape, WalkGround>();

/** Půda pro chůzi v krajině sídla (terén pěšin kolem místa vsi; v mezipaměti podle krajiny). */
export function walkGroundOf(landscape: Landscape): WalkGround {
  const cached = groundCache.get(landscape);
  if (cached) return cached;
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const cx = -half + (landscape.villageSite.x + 0.5) * landscape.cellSizeM;
  const cz = -half + (landscape.villageSite.y + 0.5) * landscape.cellSizeM;
  const window = pathWindowFor(landscape, {
    minX: cx - WALK_GROUND_HALF_M,
    minZ: cz - WALK_GROUND_HALF_M,
    maxX: cx + WALK_GROUND_HALF_M,
    maxZ: cz + WALK_GROUND_HALF_M,
  });
  const ground = { terrain: pathTerrainOf(landscape, window) };
  groundCache.set(landscape, ground);
  return ground;
}

/**
 * Půda pro chůzi s poli vsi (fields.md – Vzdálenost): rychlost chůze přes díly polí podle stadia
 * a vzhledu (`partWalkSpeed`) po buňkách terénu půdy – stejně jako cena buněk sítě pěšin. Bez polí
 * půda beze změny.
 */
export function withFieldWalk(ground: WalkGround, fields: PathVillage['fields']): WalkGround {
  if (fields.every((f) => f.parts.length === 0)) return ground;
  const t = ground.terrain;
  const speed = new Float32Array(t.width * t.height).fill(1);
  const crop = new Uint8Array(t.width * t.height);
  for (const field of fields) {
    // hrana mezi díly téhož pole je uvnitř pole – podle nejbližšího dílu (jako síť pěšin)
    const { inside, nearest } = fieldCellsOf(t, field.parts);
    for (let n = 0; n < inside.length; n++) {
      const c = inside[n]!;
      const part = field.parts[nearest[n]!]!;
      speed[c] = Math.min(speed[c]!, partWalkSpeed(part));
      if (isCropPart(part)) crop[c] = 1;
    }
  }
  return { terrain: t, fields: { speed, crop } };
}

/**
 * Půda pro chůzi se stěnami opevnění vsi (`PathVillage.fortifications` – fortifications.md, Brány):
 * úsečka chůze přes stěnu mimo bránu jde branou nebo s přirážkou (`walk-walls.ts`). Bez stěn
 * půda beze změny (týž objekt – ves bez opevnění počítá bit po bitu stejně).
 */
export function withFortWalk(
  ground: WalkGround,
  fortifications: readonly FortWalls[] | undefined,
): WalkGround {
  const walls = walkWallsOf(fortifications);
  return walls ? { ...ground, walls } : ground;
}

/**
 * Chůze rovně a → b se stěnami opevnění (`withFortWalk`): úsečka přes stěnu mimo bránu jde
 * objížďkou branou a kolem rohů stěn (`wallDetour` – kusy podle `length`), a kam se tak dojít
 * nedá, s přirážkou WALL_CLIMB_M (poslední záchrana). Vrátí cenu a body objížďky (bez ní null);
 * objížďka aspoň `limit` m se nedopočítá – cena Infinity (volající ji stejně nevezme).
 */
function walledStraight(
  walls: WalkWalls,
  a: PathPoint,
  b: PathPoint,
  length: (from: PathPoint, to: PathPoint) => number,
  limit = Infinity,
): { cost: number; via: PathPoint[] | null } {
  // úsečky se opakují každý přepočet tras – průchod stěnou i objížďka z paměti stěn
  const via = wallCrossing(walls, a, b, 0, limit);
  if (via === null) return { cost: length(a, b), via: null };
  if (via === 'far') return { cost: Infinity, via: null };
  if (via === 'none') return { cost: length(a, b) + WALL_CLIMB_M, via: null };
  let cost = 0;
  let at = a;
  for (const p of [...via, b]) {
    cost += length(at, p);
    at = p;
  }
  return { cost, via };
}

/**
 * Délka chůze rovně z `a` do `b` (m) – po pěšině dne síly `strength` (bez údaje bez pěšiny): po
 * půlbuňkách terénu – mokřina, les a díl pole podle rychlosti (přes díl v osevu pěšina
 * nezrychlí), každé vstoupení do vody + ROAD_WALK.fordExtraM. Úsečka přes potok mimo brod jde
 * objížďkou přes brod (`fordDetour` – nejkratší a → brod → b vzdušnou čarou); bez brodu v okně se
 * brodí kdekoli. Bez půdy délka úsečky (po pěšině zkrácená).
 */
export function groundWalkLength(
  ground: WalkGround | null | undefined,
  a: PathPoint,
  b: PathPoint,
  strength = 0,
): number {
  const value = straightWalkCost(ground, a, b, strength);
  if (!crossedDeep || !ground) return value;
  const ford = fordDetour(ground, a, b);
  if (!ford) return value;
  // brodí se jednou – druhý úsek začíná ve vodě brodu
  return (
    straightWalkCost(ground, a, ford, strength) + straightWalkCost(ground, ford, b, strength, true)
  );
}

/** Úsečka posledního `straightWalkCost` vstoupila do vody mimo brod. */
let crossedDeep = false;

/**
 * Brod pro objížďku úsečky `a`–`b` přes potok (paths.md – Odhad vzdáleností): buňka brodu
 * (PATH_FORD) s nejmenším součtem vzdáleností od `a` a k `b` (při shodě první po řádcích). Bez
 * brodu v okně půdy null.
 */
export function fordDetour(ground: WalkGround, a: PathPoint, b: PathPoint): PathPoint | null {
  let best: PathPoint | null = null;
  let bestD = Infinity;
  for (const f of groundSpots(ground, PATH_FORD)) {
    const d = length2(f.x - a.x, f.z - a.z) + length2(b.x - f.x, b.z - f.z);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

/**
 * Chůze rovně bez objížďky (`groundWalkLength`): voda kdekoli + ROAD_WALK.fordExtraM (s `fromWater`
 * úsečka začíná ve vodě – první brodění se nepočítá); nastaví `crossedDeep`, když úsečka vstoupila
 * do vody mimo brod.
 */
function straightWalkCost(
  ground: WalkGround | null | undefined,
  a: PathPoint,
  b: PathPoint,
  strength: number,
  fromWater = false,
): number {
  crossedDeep = false;
  const length = length2(b.x - a.x, b.z - a.z);
  if (!ground || length === 0) return pathWalkLength(length, strength);
  const t = ground.terrain;
  const { speed: cellSpeed, mask, seamsI, seamsJ } = walkCellsOf(ground);
  const tread = pathCostFactor(strength);
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const piece = length / n;
  const w = t.width;
  const h = t.height;
  const fi = (k: number): number => (a.x + (b.x - a.x) * ((k + 0.5) / n) - t.originX) / t.cellM;
  const fj = (k: number): number => (a.z + (b.z - a.z) * ((k + 0.5) / n) - t.originZ) / t.cellM;
  let cost = 0;
  let inWater = fromWater;
  for (let k = 0; k < n;) {
    const end = Math.min(n, k + WALK_RUN);
    if (end - k === WALK_RUN) {
      // kus úsečky po stejné půdě: buňky kroků leží v obdélníku mezi krajními kroky (s buňkou
      // rezervy) – když je celý uvnitř mřížky a bez švu mezi různými buňkami (`seamsI`,
      // `seamsJ`), mají všechny kroky kusu týž člen součtu a sečtou se bez čtení buněk
      const x0 = fi(k);
      const x1 = fi(end - 1);
      const z0 = fj(k);
      const z1 = fj(end - 1);
      const i0 = Math.round(Math.min(x0, x1)) - 1;
      const i1 = Math.round(Math.max(x0, x1)) + 1;
      const j0 = Math.round(Math.min(z0, z1)) - 1;
      const j1 = Math.round(Math.max(z0, z1)) + 1;
      if (
        i0 >= 0 &&
        j0 >= 0 &&
        i1 < w &&
        j1 < h &&
        rectSum(seamsI, w, i0, i1 - 1, j0, j1) === 0 &&
        rectSum(seamsJ, w, i0, i1, j0, j1 - 1) === 0
      ) {
        const c = j0 * w + i0;
        const m = mask[c]!;
        const water = (m & WALK_WATER) !== 0;
        const term = (piece / cellSpeed[c]!) * (m & WALK_CROP ? 1 : tread);
        if (m & WALK_DEEP) crossedDeep = true;
        if (water && !inWater) cost += ROAD_WALK.fordExtraM;
        inWater = water;
        for (; k < end; k++) cost += term;
        continue;
      }
    }
    for (; k < end; k++) {
      const u = (k + 0.5) / n;
      const i = Math.round((a.x + (b.x - a.x) * u - t.originX) / t.cellM);
      const j = Math.round((a.z + (b.z - a.z) * u - t.originZ) / t.cellM);
      let speed = 1;
      let water = false;
      let factor = tread;
      if (i >= 0 && j >= 0 && i < w && j < h) {
        const c = j * w + i;
        const m = mask[c]!;
        water = (m & WALK_WATER) !== 0;
        speed = cellSpeed[c]!;
        if (m & WALK_CROP) factor = 1;
        if (m & WALK_DEEP) crossedDeep = true;
      }
      if (water && !inWater) cost += ROAD_WALK.fordExtraM;
      inWater = water;
      cost += (piece / speed) * factor;
    }
  }
  return cost;
}

/** Příznaky buňky půdy chůze (`walkCellsOf`): voda, díl v osevu, voda mimo brod. */
const WALK_WATER = 1;
const WALK_CROP = 2;
const WALK_DEEP = 4;
/** Rychlost chůze lesem proti louce (cena buňky lesa v síti pěšin – PATH_FOREST_COST). */
const FOREST_WALK_SPEED = 1 / PATH_FOREST_COST;
/** Kroků úsečky v kusu, který se po louce sečte bez čtení buněk (`groundWalkLength`). */
const WALK_RUN = 8;

/**
 * Půda chůze po buňkách (`groundWalkLength`, po objektu půdy – půda se nemění): rychlost buňky
 * (mokřina, díl pole – nejpomalejší), příznaky voda a díl v osevu a švy – součty po obdélnících od
 * rohu mřížky ((šířka + 1) × (výška + 1)) buněk, které se liší od sousední vpravo (`seamsI`) nebo
 * dole (`seamsJ`). Jen zrychlení – tytéž hodnoty, jaké se dřív skládaly z příznaků terénu a polí
 * v každém kroku úsečky (docs/code/village-roads.md – Trasy v paměti).
 */
interface WalkCells {
  speed: Float64Array;
  mask: Uint8Array;
  seamsI: Int32Array;
  seamsJ: Int32Array;
}

const walkCellsCache = new WeakMap<WalkGround, WalkCells>();

/** Součet buněk `i0..i1` × `j0..j1` (včetně) z obdélníkových součtů mřížky šířky `w`. */
function rectSum(
  sums: Int32Array,
  w: number,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
): number {
  if (i0 > i1 || j0 > j1) return 0;
  const row = w + 1;
  return (
    sums[(j1 + 1) * row + i1 + 1]! -
    sums[j0 * row + i1 + 1]! -
    sums[(j1 + 1) * row + i0]! +
    sums[j0 * row + i0]!
  );
}

function walkCellsOf(ground: WalkGround): WalkCells {
  const known = walkCellsCache.get(ground);
  if (known) return known;
  const t = ground.terrain;
  const fields = ground.fields;
  const w = t.width;
  const h = t.height;
  const speed = new Float64Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) {
    const flags = t.flags[c]!;
    let v = 1;
    if (flags & PATH_WETLAND) v = ROAD_WALK.wetSpeed;
    else if (flags & PATH_FOREST) v = FOREST_WALK_SPEED;
    let m = flags & PATH_WATER ? WALK_WATER | (flags & PATH_FORD ? 0 : WALK_DEEP) : 0;
    if (fields) {
      // pole založené v lese je vymýcené – les tam neplatí
      const field = fields.speed[c]!;
      if (field < 1) v = flags & PATH_WETLAND ? Math.min(v, field) : field;
      if (fields.crop[c]) m |= WALK_CROP;
    }
    speed[c] = v;
    mask[c] = m;
  }
  const differs = (c: number, d: number): boolean => speed[c] !== speed[d] || mask[c] !== mask[d];
  const seamsI = new Int32Array((w + 1) * (h + 1));
  const seamsJ = new Int32Array((w + 1) * (h + 1));
  for (let j = 0; j < h; j++) {
    let lineI = 0;
    let lineJ = 0;
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      if (i + 1 < w && differs(c, c + 1)) lineI++;
      if (j + 1 < h && differs(c, c + w)) lineJ++;
      const at = (j + 1) * (w + 1) + i + 1;
      seamsI[at] = seamsI[at - (w + 1)]! + lineI;
      seamsJ[at] = seamsJ[at - (w + 1)]! + lineJ;
    }
  }
  const cells = { speed, mask, seamsI, seamsJ };
  walkCellsCache.set(ground, cells);
  return cells;
}

/**
 * Paměť chůze rovně po úsečkách (`walkingDistances` s `memo` – přepočet chůze vsi, docs/code/
 * village-roads.md – Trasy v paměti): délka chůze rovně bez pěšiny (`groundWalkLength`) podle
 * krajních bodů úsečky. Délka závisí jen na buňkách půdy v obdélníku kolem úsečky (s rezervou
 * dvou buněk – `unchangedAround`), proto záznam platí, dokud se v obdélníku žádná buňka nezmění.
 * Paměť drží buňky půdy poslední generace; půda s jinými buňkami (díl přibyl, zmizel, zarostl,
 * zoral se) založí další generaci se součty změněných buněk po obdélnících, záznamy předchozí
 * generace se ověří proti nim (jinak se spočítají znovu) a starší vypadnou. Jen zrychlení – bit
 * po bitu tytéž délky jako `groundWalkLength`.
 */
export interface WalkMemo {
  terrain: PathTerrain | null;
  cells: WalkCells | null;
  /** Generace buněk `cells`; záznamy nesou generaci, ve které naposledy platily (0 = volno). */
  gen: number;
  /** Součty buněk změněných mezi generacemi `gen - 1` a `gen` po obdélnících (jako švy). */
  changed: Int32Array | null;
  /** Krajní body úseček po čtveřicích (a.x, a.z, b.x, b.z) v otevřené tabulce. */
  keys: Float64Array;
  values: Float64Array;
  gens: Int32Array;
  size: number;
}

/**
 * Míst tabulky paměti chůze na začátku a nejvýš (zaplní se nejvýš ze tří čtvrtin – nad mez se
 * úsečky už nezapisují): nejvýš ≈ 11,5 MB tabulky na krajinu, paměť drží nejvýš `MEMO_LANDSCAPES`
 * krajin (nejstarší vypadne) – server má v mezipaměti víc krajin (apps/web, `cachedLandscapes`).
 */
const MEMO_MIN_SLOTS = 1 << 16;
const MEMO_MAX_SLOTS = 1 << 18;
const MEMO_LANDSCAPES = 2;
const walkMemos = new WeakMap<Landscape, WalkMemo>();
const memoLandscapes: WeakRef<Landscape>[] = [];

/** Paměť chůze rovně pro přepočet chůze vsi v krajině `landscape` (po krajině). */
export function walkMemoOf(landscape: Landscape): WalkMemo {
  let memo = walkMemos.get(landscape);
  if (!memo) {
    memoLandscapes.push(new WeakRef(landscape));
    while (memoLandscapes.length > MEMO_LANDSCAPES) {
      const oldest = memoLandscapes.shift()!.deref();
      if (oldest) walkMemos.delete(oldest);
    }
    memo = {
      terrain: null,
      cells: null,
      gen: 0,
      changed: null,
      keys: new Float64Array(MEMO_MIN_SLOTS * 4),
      values: new Float64Array(MEMO_MIN_SLOTS),
      gens: new Int32Array(MEMO_MIN_SLOTS),
      size: 0,
    };
    walkMemos.set(landscape, memo);
  }
  return memo;
}

/** Zapomene paměť chůze krajiny (studený start v testech a měření). */
export function forgetWalkMemo(landscape: Landscape): void {
  walkMemos.delete(landscape);
  const at = memoLandscapes.findIndex((r) => r.deref() === landscape);
  if (at >= 0) memoLandscapes.splice(at, 1);
}

const memoBits = new Float64Array(4);
const memoWords = new Uint32Array(memoBits.buffer);

/** Místo úsečky v tabulce – rozptýlené bity čtyř souřadnic (jen pořadí hledání, ne výsledek). */
function memoHash(ax: number, az: number, bx: number, bz: number): number {
  memoBits[0] = ax;
  memoBits[1] = az;
  memoBits[2] = bx;
  memoBits[3] = bz;
  let h = 0x9747b28c;
  for (let q = 0; q < 8; q++) {
    h = Math.imul(h ^ memoWords[q]!, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** Tabulka paměti o `slots` místech se záznamy, které `keep` ponechá (přehashuje je). */
function rebuildMemo(memo: WalkMemo, slots: number, keep: (gen: number) => boolean): void {
  const { keys, values, gens } = memo;
  memo.keys = new Float64Array(slots * 4);
  memo.values = new Float64Array(slots);
  memo.gens = new Int32Array(slots);
  memo.size = 0;
  for (let s = 0; s < gens.length; s++) {
    const g = gens[s]!;
    if (g === 0 || !keep(g)) continue;
    const k = s * 4;
    memoInsert(memo, keys[k]!, keys[k + 1]!, keys[k + 2]!, keys[k + 3]!, values[s]!, g);
  }
}

/** Zapíše úsečku do volného místa (úsečka v tabulce není); plná tabulka nad mezí nic nezapíše. */
function memoInsert(
  memo: WalkMemo,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  value: number,
  gen: number,
): void {
  if ((memo.size + 1) * 4 > memo.gens.length * 3) {
    if (memo.gens.length >= MEMO_MAX_SLOTS) return;
    rebuildMemo(memo, memo.gens.length * 2, () => true);
  }
  const mask = memo.gens.length - 1;
  let slot = memoHash(ax, az, bx, bz) & mask;
  while (memo.gens[slot] !== 0) slot = (slot + 1) & mask;
  const k = slot * 4;
  memo.keys[k] = ax;
  memo.keys[k + 1] = az;
  memo.keys[k + 2] = bx;
  memo.keys[k + 3] = bz;
  memo.values[slot] = value;
  memo.gens[slot] = gen;
  memo.size++;
}

/**
 * Přepne paměť na buňky půdy `ground`: tytéž buňky (i jiný objekt se stejným obsahem) generaci
 * nemění; jiné založí další generaci se součty změněných buněk a ponechají jen záznamy dosavadní
 * generace (ověří se proti změnám). Jiný terén paměť vyprázdní.
 */
function syncWalkMemo(memo: WalkMemo, ground: WalkGround): void {
  const cells = walkCellsOf(ground);
  if (memo.cells === cells) return;
  const t = ground.terrain;
  const prev = memo.cells;
  memo.cells = cells;
  if (!prev || memo.terrain !== t) {
    memo.terrain = t;
    memo.gen++;
    memo.changed = null;
    rebuildMemo(memo, MEMO_MIN_SLOTS, () => false);
    return;
  }
  const w = t.width;
  const h = t.height;
  const sums = new Int32Array((w + 1) * (h + 1));
  let any = false;
  for (let j = 0; j < h; j++) {
    let line = 0;
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      if (prev.speed[c] !== cells.speed[c] || prev.mask[c] !== cells.mask[c]) {
        line++;
        any = true;
      }
      const at = (j + 1) * (w + 1) + i + 1;
      sums[at] = sums[at - (w + 1)]! + line;
    }
  }
  if (!any) return;
  const old = memo.gen;
  memo.gen++;
  memo.changed = sums;
  rebuildMemo(memo, memo.gens.length, (g) => g === old);
}

/**
 * Žádná buňka, kterou `straightWalkCost` na úsečce `a`–`b` čte, se mezi generacemi nezměnila:
 * úsečka po kusech UNCHANGED_STEPS kroků (násobek WALK_RUN – kus úsečky po stejné půdě leží celý
 * v jednom), u každého obdélník krajních kroků ± 2 buňky (oříznuto na mřížku). Buňky kroků
 * i obdélníky kusů (krajní kroky ± 1) leží uvnitř – délka chůze je tedy táž. Úzký pruh podél
 * úsečky místo obdélníku celé úsečky: dlouhá šikmá úsečka nepropadne kvůli změně stranou.
 */
function unchangedAround(changed: Int32Array, t: PathTerrain, a: PathPoint, b: PathPoint): boolean {
  const length = length2(b.x - a.x, b.z - a.z);
  if (length === 0) return true;
  // kroky jako ve `straightWalkCost` (týž počet i tytéž polohy)
  const n = Math.max(1, Math.ceil(length / (t.cellM / 2)));
  const { originX, originZ, cellM } = t;
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  for (let k = 0; k < n; k += UNCHANGED_STEPS) {
    const last = Math.min(n, k + UNCHANGED_STEPS) - 1;
    const x0 = (a.x + ex * ((k + 0.5) / n) - originX) / cellM;
    const x1 = (a.x + ex * ((last + 0.5) / n) - originX) / cellM;
    const z0 = (a.z + ez * ((k + 0.5) / n) - originZ) / cellM;
    const z1 = (a.z + ez * ((last + 0.5) / n) - originZ) / cellM;
    const i0 = Math.max(0, Math.floor(Math.min(x0, x1)) - 2);
    const i1 = Math.min(t.width - 1, Math.ceil(Math.max(x0, x1)) + 2);
    const j0 = Math.max(0, Math.floor(Math.min(z0, z1)) - 2);
    const j1 = Math.min(t.height - 1, Math.ceil(Math.max(z0, z1)) + 2);
    if (rectSum(changed, t.width, i0, i1, j0, j1) !== 0) return false;
  }
  return true;
}

/** Kroků úsečky v jednom obdélníku kontroly změn (`unchangedAround`) – násobek WALK_RUN. */
const UNCHANGED_STEPS = 4 * WALK_RUN;

/** `groundWalkLength(ground, a, b)` (bez pěšiny) přes paměť `memo` přepnutou na `ground`. */
function memoWalkLength(memo: WalkMemo, ground: WalkGround, a: PathPoint, b: PathPoint): number {
  const { keys, gens } = memo;
  const mask = gens.length - 1;
  let slot = memoHash(a.x, a.z, b.x, b.z) & mask;
  for (let g = gens[slot]!; g !== 0; g = gens[slot]!) {
    const k = slot * 4;
    if (keys[k] === a.x && keys[k + 1] === a.z && keys[k + 2] === b.x && keys[k + 3] === b.z) {
      if (
        g === memo.gen ||
        (g === memo.gen - 1 &&
          memo.changed !== null &&
          unchangedAround(memo.changed, ground.terrain, a, b))
      ) {
        gens[slot] = memo.gen;
        return memoDetour(memo, ground, a, b, memo.values[slot]!);
      }
      const value = signedStraight(ground, a, b);
      memo.values[slot] = value;
      gens[slot] = memo.gen;
      return memoDetour(memo, ground, a, b, value);
    }
    slot = (slot + 1) & mask;
  }
  const value = signedStraight(ground, a, b);
  memoInsert(memo, a.x, a.z, b.x, b.z, value, memo.gen);
  return memoDetour(memo, ground, a, b, value);
}

/**
 * Chůze rovně bez objížďky do paměti: úsečka přes potok mimo brod se záporným znaménkem (délka je
 * vždy kladná) – objížďka se skládá z úseček v paměti (`memoDetour`), protože vede mimo obdélník
 * úsečky.
 */
function signedStraight(ground: WalkGround, a: PathPoint, b: PathPoint): number {
  const value = straightWalkCost(ground, a, b, 0);
  return crossedDeep ? -value : value;
}

/** Hodnota z paměti → `groundWalkLength` (záporná = objížďka přes brod z úseček v paměti). */
function memoDetour(
  memo: WalkMemo,
  ground: WalkGround,
  a: PathPoint,
  b: PathPoint,
  value: number,
): number {
  if (value >= 0) return value;
  const ford = fordDetour(ground, a, b);
  if (!ford) return -value;
  return memoStraight(memo, ground, a, ford) + straightWalkCost(ground, ford, b, 0, true);
}

/** Úsek objížďky – chůze rovně bez další objížďky (přes potok brodem kdekoli) přes paměť. */
function memoStraight(memo: WalkMemo, ground: WalkGround, a: PathPoint, b: PathPoint): number {
  const { keys, gens } = memo;
  const mask = gens.length - 1;
  let slot = memoHash(a.x, a.z, b.x, b.z) & mask;
  for (let g = gens[slot]!; g !== 0; g = gens[slot]!) {
    const k = slot * 4;
    if (keys[k] === a.x && keys[k + 1] === a.z && keys[k + 2] === b.x && keys[k + 3] === b.z) {
      if (
        g === memo.gen ||
        (g === memo.gen - 1 &&
          memo.changed !== null &&
          unchangedAround(memo.changed, ground.terrain, a, b))
      ) {
        gens[slot] = memo.gen;
        return Math.abs(memo.values[slot]!);
      }
      const value = signedStraight(ground, a, b);
      memo.values[slot] = value;
      gens[slot] = memo.gen;
      return Math.abs(value);
    }
    slot = (slot + 1) & mask;
  }
  const value = signedStraight(ground, a, b);
  memoInsert(memo, a.x, a.z, b.x, b.z, value, memo.gen);
  return Math.abs(value);
}

/** Délka chůze úsekem pěšiny se silou `strength` 0–1 (m) – po pěšině se jde rychleji. */
export function pathWalkLength(length: number, strength: number): number {
  return length * pathCostFactor(strength);
}

/**
 * Nejmenší podíl přímé vzdálenosti, na který chůze může klesnout – nejrychlejší chůze (plná
 * pěšina, pevná cesta podle stupně, hať – bez stromů u cest, s nimi `fastestWalkShare`): chůze
 * z A do B je nejméně přímá vzdálenost × tento podíl. Kdo měří jen kandidáty v dosahu (seč luk –
 * hay.ts), podle něj odhadne, co měřit.
 */
export const FASTEST_WALK_SHARE = Math.min(
  1 / PATH_WALK.speed,
  ...Object.values(ROAD_WALK.speed).map((speed) => 1 / speed),
  1 / ROAD_WALK.causewayWetSpeed,
);

/**
 * Nejmenší podíl přímé vzdálenosti pro chůzi po pevných cestách `roads` – jako FASTEST_WALK_SHARE,
 * jen se stromy u cest (roads.md – Stromy u cesty zrychlí chůzi): cesta lemovaná stromy jde
 * rychleji než její stupeň. Bez stromů u cest přesně FASTEST_WALK_SHARE.
 */
export function fastestWalkShare(
  roads: readonly Pick<WalkRoad, 'grade' | 'lined'>[] | undefined,
): number {
  let share = FASTEST_WALK_SHARE;
  for (const road of roads ?? []) {
    const trees = roadTreeSpeed(road.lined);
    if (trees > 0) share = Math.min(share, 1 / roadWalkSpeed(road.grade, false, trees));
  }
  return share;
}

/**
 * Cena chůze úsekem osy pevné cesty od `from` do `to` m od začátku osy: kusy v mokřině a mimo ni
 * podle rychlosti (mimo mokřinu i se stromy u cesty – `roadTreeSpeed`), brody v úseku
 * + ROAD_WALK.fordExtraM (po lávce – hať a lávka – nic).
 */
export function roadPieceCost(road: WalkRoad, from: number, to: number): number {
  const wet = road.ground?.wet ?? [];
  const dry = roadWalkSpeed(road.grade, false, roadTreeSpeed(road.lined));
  let cost = 0;
  let at = from;
  for (const [a, b] of wet) {
    if (b <= at || a >= to) continue;
    const start = Math.max(at, a);
    const end = Math.min(to, b);
    cost += (start - at) / dry;
    cost += (end - start) / roadWalkSpeed(road.grade, true, 0, road.unbridged === true);
    at = end;
  }
  cost += Math.max(0, to - at) / dry;
  if (!roadBridged(road)) {
    for (const ford of road.ground?.fords ?? []) {
      if (ford >= from && ford < to) cost += ROAD_WALK.fordExtraM;
    }
  }
  return cost;
}

/**
 * Graf chůze z os pěšin (úsek mezi body osy – cena podle průměrné síly, s mokřinou a vodou
 * z `ground`) a pevných cest (`roads` – podle stupně, mokřiny a brodů na ose). Konce os se stejnými
 * souřadnicemi sdílejí bod (rozcestí).
 */
export function walkGraph(
  lines: readonly PathLine[],
  options: { roads?: readonly WalkRoad[]; ground?: WalkGround | null } = {},
): WalkGraph {
  const graph: WalkGraph = { x: [], z: [], links: [], chains: [] };
  const shared = new Map<string, number>();
  const node = (p: PathPoint, end: boolean): number => {
    const key = end ? `${p.x}|${p.z}` : null;
    if (key !== null) {
      const found = shared.get(key);
      if (found !== undefined) return found;
    }
    graph.x.push(p.x);
    graph.z.push(p.z);
    graph.links.push([]);
    const id = graph.x.length - 1;
    if (key !== null) shared.set(key, id);
    return id;
  };
  const link = (a: number, b: number, length: number, cost: number): void => {
    graph.links[a]!.push({ to: b, length, cost });
    graph.links[b]!.push({ to: a, length, cost });
  };
  const walls = options.ground?.walls ?? null;
  /**
   * Úsek osy z uzlu `prev` do nového uzlu bodu `p` s cenou `cost` (`part` – cena kusu úseku).
   * Přes stěnu opevnění mimo bránu (`cutsWall`) jde úsek objížďkou branou a kolem rohů stěn
   * (`wallDetour` – body objížďky v řetězu), kde to nejde, s přirážkou WALL_CLIMB_M; bez stěn
   * jako dřív.
   */
  const step = (
    chain: number[],
    prev: number,
    p: PathPoint,
    end: boolean,
    cost: (length: number) => number,
    part: (from: PathPoint, to: PathPoint, length: number) => number,
    slack: number,
  ): number => {
    const a = prev >= 0 ? { x: graph.x[prev]!, z: graph.z[prev]! } : null;
    const found = a !== null && walls !== null ? wallCrossing(walls, a, p, slack) : null;
    const cut = found !== null;
    const via = Array.isArray(found) ? found : null;
    const viaIds = (via ?? []).map((v) => node(v, false));
    chain.push(...viaIds);
    const id = node(p, end);
    chain.push(id);
    if (!a || prev === id) return id;
    if (via) {
      let from = prev;
      let at = a;
      via.forEach((v, k) => {
        const l = length2(v.x - at.x, v.z - at.z);
        link(from, viaIds[k]!, l, part(at, v, l));
        from = viaIds[k]!;
        at = v;
      });
      const l = length2(p.x - at.x, p.z - at.z);
      link(from, id, l, part(at, p, l));
    } else {
      const length = length2(p.x - a.x, p.z - a.z);
      link(prev, id, length, cut ? cost(length) + WALL_CLIMB_M : cost(length));
    }
    return id;
  };
  for (const line of lines) {
    let prev = -1;
    const chain: number[] = [];
    graph.chains.push(chain);
    line.points.forEach((p, k) => {
      const strength = k > 0 ? (line.strength[k - 1]! + line.strength[k]!) / 2 : 0;
      const a = prev >= 0 ? { x: graph.x[prev]!, z: graph.z[prev]! } : p;
      prev = step(
        chain,
        prev,
        p,
        k === 0 || k === line.points.length - 1,
        () => groundWalkLength(options.ground, a, p, strength),
        (from, to) => groundWalkLength(options.ground, from, to, strength),
        // osa stálé trasy jde buňkami brány – kousek vedle otvoru je průchod branou
        GATE_SLACK_M,
      );
    });
  }
  for (const road of options.roads ?? []) {
    let prev = -1;
    let along = 0;
    const chain: number[] = [];
    graph.chains.push(chain);
    road.points.forEach((p, k) => {
      const from = along;
      const length = prev >= 0 ? length2(p.x - graph.x[prev]!, p.z - graph.z[prev]!) : 0;
      prev = step(
        chain,
        prev,
        p,
        k === 0 || k === road.points.length - 1,
        () => roadPieceCost(road, from, from + length),
        // branou: cena kusu úměrně délce (mokřina a brody úseku rozložené po délce)
        (_a, _b, piece) =>
          length > 0 ? (roadPieceCost(road, from, from + length) * piece) / length : piece,
        0,
      );
      along += length;
    });
  }
  return graph;
}

/**
 * Vzdálenost chůze (m) z nejbližšího výchozího bodu (obydlí) ke každému cíli: rovně, nebo
 * k pěšině či cestě, po ní a od ní k cíli – kratší z obou. Na síť se obydlí i cíl napojí jen
 * v nejbližším bodě (vzdušnou čarou) každé pěšiny a cesty (`WalkGraph.chains` – paths.md, Odhad
 * vzdáleností; jako vůz v `cart-estimate.ts`), ne v každém bodě sítě. Rovně podle půdy (`ground` –
 * mokřina, voda), bez ní délka úsečky; s pamětí `memo` (`walkMemoOf`) se délky rovně berou
 * z paměti – tytéž. Bez výchozích bodů Infinity.
 */
export function walkingDistances(
  graph: WalkGraph,
  origins: readonly PathPoint[],
  targets: readonly PathPoint[],
  ground: WalkGround | null = null,
  memo: WalkMemo | null = null,
): number[] {
  const steps = walkingDistancesSteps(graph, origins, targets, ground, memo);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** Cíle, po kterých se `walkingDistancesSteps` zastaví (dost málo na to, aby kus trval milisekundy). */
const WALK_STEP_TARGETS = 8;

/**
 * `walkingDistances` po krocích: po každých `WALK_STEP_TARGETS` cílech (rovně z obydlí i po síti)
 * se zastaví, aby volající mohl dát přestávku (server – dlouhý dopočet neblokuje ostatní
 * požadavky). Výsledek je týž.
 */
export function* walkingDistancesSteps(
  graph: WalkGraph,
  origins: readonly PathPoint[],
  targets: readonly PathPoint[],
  ground: WalkGround | null = null,
  memo: WalkMemo | null = null,
): Generator<void, number[], void> {
  if (targets.length === 0) return [];
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new PathHeap();
  if (ground && memo) syncWalkMemo(memo, ground);
  const plain = (a: PathPoint, b: PathPoint): number =>
    ground
      ? memo
        ? memoWalkLength(memo, ground, a, b)
        : groundWalkLength(ground, a, b)
      : length2(b.x - a.x, b.z - a.z);
  // přes stěnu opevnění mimo bránu objížďkou přes bránu (`withFortWalk`) – mimo paměť délek rovně
  const walls = ground?.walls ?? null;
  // `limit`: dražší objížďku stěny není třeba dopočítat (výsledek týž – vrátí Infinity)
  const straight = (a: PathPoint, x: number, z: number, limit = Infinity): number =>
    walls ? walledStraight(walls, a, { x, z }, plain, limit).cost : plain(a, { x, z });
  const bound = new Float64Array(Math.max(n, origins.length));
  /**
   * Nejmenší z `start` a `exact(k)` – rovně je vždy aspoň délka úsečky (rychlosti nejvýš louka),
   * takže dražší výpočet půdy jen u kandidátů v pořadí dolní meze (`lower`, při rovnosti nižší
   * index), dokud může vyjít méně. Horní mez napřed: kandidát s nejmenší dolní mezí se spočítá
   * hned a řadí se jen kandidáti pod ním (výsledek jako průchod všemi).
   */
  const cheapest = (
    count: number,
    lower: (k: number) => number,
    exact: (k: number, limit: number) => number,
    start = Infinity,
  ): number => {
    let first = -1;
    for (let k = 0; k < count; k++) {
      const lb = lower(k);
      bound[k] = lb;
      if (lb < start && (first < 0 || lb < bound[first]!)) first = k;
    }
    if (first < 0) return start;
    const value = exact(first, start);
    let best = value < start ? value : start;
    const order: number[] = [];
    for (let k = 0; k < count; k++) if (k !== first && bound[k]! < best) order.push(k);
    order.sort((a, b) => bound[a]! - bound[b]! || a - b);
    for (const k of order) {
      if (bound[k]! >= best) break;
      const value = exact(k, best);
      if (value < best) best = value;
    }
    return best;
  };
  // rovně z obydlí ke každému cíli – horní mez výsledku; uzel, ke kterému je rovně aspoň tak daleko
  // jako nejdelší z nich, cestu k žádnému cíli nezkrátí a do sítě nevstupuje (výsledek týž)
  const direct: number[] = [];
  for (const [q, t] of targets.entries()) {
    if (q % WALK_STEP_TARGETS === 0) yield;
    direct.push(
      cheapest(
        origins.length,
        (k) => length2(t.x - origins[k]!.x, t.z - origins[k]!.z),
        (k, below) => straight(origins[k]!, t.x, t.z, below),
      ),
    );
  }
  let limit = 0;
  for (const d of direct) if (d > limit) limit = d;
  // na síť z každého obydlí jen v nejbližším bodě každé pěšiny a cesty (paths.md – Odhad
  // vzdáleností, jako vůz – cart-estimate.ts); dál po síti
  for (const chain of graph.chains) {
    for (const o of origins) {
      const id = nearestNode(graph, chain, o);
      if (id < 0) continue;
      const lb = length2(graph.x[id]! - o.x, graph.z[id]! - o.z);
      if (lb >= limit || lb >= dist[id]!) continue;
      const cost = straight(o, graph.x[id]!, graph.z[id]!, Math.min(limit, dist[id]!));
      if (cost >= limit || cost >= dist[id]!) continue;
      dist[id] = cost;
      heap.push(id, cost);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    for (const { to, cost } of graph.links[c]!) {
      const nd = d + cost;
      if (nd < dist[to]!) {
        dist[to] = nd;
        heap.push(to, nd);
      }
    }
  }
  // dolní mez řetězu: nejmenší vzdálenost po síti do jeho bodu + vzdušnou čarou k obdélníku jeho
  // bodů – řetěz, u kterého ani ta nevyjde pod dosavadní nejlepší, by níž neprošel (nejbližší bod
  // je v obdélníku a jeho vzdálenost po síti aspoň nejmenší; zaokrouhlení je monotónní), takže
  // se jeho nejbližší bod nehledá (jen zrychlení – tytéž výsledky)
  const chains = graph.chains;
  const bounds = new Float64Array(chains.length * 5);
  chains.forEach((chain, ci) => {
    let min = Infinity;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const id of chain) {
      if (dist[id]! < min) min = dist[id]!;
      const x = graph.x[id]!;
      const z = graph.z[id]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    bounds.set([min, x0, x1, z0, z1], ci * 5);
  });
  // z nejbližšího bodu každé pěšiny a cesty k cíli, nebo rovně z obydlí – kratší z obou
  const result: number[] = [];
  for (const [q, t] of targets.entries()) {
    if (q % WALK_STEP_TARGETS === 0) yield;
    let best = direct[q]!;
    for (let ci = 0; ci < chains.length; ci++) {
      const b = ci * 5;
      const min = bounds[b]!;
      if (min === Infinity) continue;
      const x0 = bounds[b + 1]!;
      const x1 = bounds[b + 2]!;
      const z0 = bounds[b + 3]!;
      const z1 = bounds[b + 4]!;
      const ex = t.x < x0 ? x0 - t.x : t.x > x1 ? t.x - x1 : 0;
      const ez = t.z < z0 ? z0 - t.z : t.z > z1 ? t.z - z1 : 0;
      if (min + length2(ex, ez) >= best) continue;
      const chain = chains[ci]!;
      const id = nearestNode(graph, chain, t);
      if (id < 0 || !Number.isFinite(dist[id]!)) continue;
      if (dist[id]! + length2(t.x - graph.x[id]!, t.z - graph.z[id]!) >= best) continue;
      const cost =
        dist[id]! + straight({ x: graph.x[id]!, z: graph.z[id]! }, t.x, t.z, best - dist[id]!);
      if (cost < best) best = cost;
    }
    result.push(best);
  }
  return result;
}

/** Trasa chodce z bodu do bodu (`walkingRoute`) – body a cena chůze úseků. */
export interface WalkingRoute {
  /** Body od `from` do `to`: rovně jen ty dva, po síti `from`, body pěšin a cest, `to`. */
  points: PathPoint[];
  /** Cena chůze každého úseku (m chůze po louce) – o jedno číslo méně než bodů. */
  costs: number[];
  /** Cena celé trasy – táž jako `walkingDistances(graph, [from], [to], ground, memo)[0]`. */
  cost: number;
}

/**
 * Trasa chodce z `from` do `to` týmž modelem jako odhad simulace (`walkingDistances` – paths.md,
 * Odhad vzdáleností): kratší z „rovně“ a „rovně k nejbližšímu bodu pěšiny či cesty, po síti
 * a z nejbližšího bodu pěšiny či cesty rovně k cíli“ – navíc vrátí body (zpětné sledování
 * předchůdců). Prohlížeč podle ní vede postavy ve scéně (path-router.ts); cena je přesně odhad
 * simulace. Při shodě rovně; po síti při shodě první řetěz (jako `walkingDistances`).
 */
export function walkingRoute(
  graph: WalkGraph,
  from: PathPoint,
  to: PathPoint,
  ground: WalkGround | null = null,
  memo: WalkMemo | null = null,
): WalkingRoute {
  if (ground && memo) syncWalkMemo(memo, ground);
  const plain = (a: PathPoint, b: PathPoint): number =>
    ground
      ? memo
        ? memoWalkLength(memo, ground, a, b)
        : groundWalkLength(ground, a, b)
      : length2(b.x - a.x, b.z - a.z);
  // přes stěnu opevnění mimo bránu objížďkou přes bránu (`withFortWalk`) – mimo paměť délek rovně
  const walls = ground?.walls ?? null;
  // `limit`: dražší objížďku stěny není třeba dopočítat (výsledek týž – vrátí Infinity)
  const straight = (a: PathPoint, x: number, z: number, limit = Infinity): number =>
    walls ? walledStraight(walls, a, { x, z }, plain, limit).cost : plain(a, { x, z });
  const direct = straight(from, to.x, to.z);
  const n = graph.x.length;
  const dist = new Float64Array(n).fill(Infinity);
  // předchůdce na síti; −1 = na síť se sem vstoupilo rovně z `from`
  const prev = new Int32Array(n).fill(-1);
  const heap = new PathHeap();
  for (const chain of graph.chains) {
    const id = nearestNode(graph, chain, from);
    if (id < 0) continue;
    const lb = length2(graph.x[id]! - from.x, graph.z[id]! - from.z);
    if (lb >= direct || lb >= dist[id]!) continue;
    const cost = straight(from, graph.x[id]!, graph.z[id]!, Math.min(direct, dist[id]!));
    if (cost >= direct || cost >= dist[id]!) continue;
    dist[id] = cost;
    heap.push(id, cost);
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = heap.topKey;
    if (d > dist[c]!) continue;
    // uzly dál než rovně trasu nezkrátí (cena k cíli je aspoň vzdálenost po síti) – vzdálenosti
    // uzlů blíž jsou tytéž jako po celém průchodu
    if (d >= direct) break;
    for (const { to: next, cost } of graph.links[c]!) {
      const nd = d + cost;
      if (nd < dist[next]!) {
        dist[next] = nd;
        prev[next] = c;
        heap.push(next, nd);
      }
    }
  }
  let best = direct;
  let end = -1;
  for (const chain of graph.chains) {
    const id = nearestNode(graph, chain, to);
    if (id < 0 || !Number.isFinite(dist[id]!)) continue;
    if (dist[id]! + length2(to.x - graph.x[id]!, to.z - graph.z[id]!) >= best) continue;
    const cost =
      dist[id]! + straight({ x: graph.x[id]!, z: graph.z[id]! }, to.x, to.z, best - dist[id]!);
    if (cost < best) {
      best = cost;
      end = id;
    }
  }
  if (end < 0) return gateLegs({ points: [from, to], costs: [direct], cost: direct });
  const nodes: number[] = [];
  for (let id = end; id >= 0; id = prev[id]!) nodes.push(id);
  nodes.reverse();
  const points: PathPoint[] = [from];
  const costs: number[] = [dist[nodes[0]!]!];
  nodes.forEach((id, k) => {
    points.push({ x: graph.x[id]!, z: graph.z[id]! });
    if (k > 0) costs.push(dist[id]! - dist[nodes[k - 1]!]!);
  });
  points.push(to);
  costs.push(best - dist[end]!);
  return gateLegs({ points, costs, cost: best });

  /** Úsečky rovně (k síti, od ní k cíli, celá) přes stěnu – body objížďky (`walledStraight`). */
  function gateLegs(found: WalkingRoute): WalkingRoute {
    if (!walls) return found;
    const pts = found.points;
    const out: PathPoint[] = [pts[0]!];
    const outCosts: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const cost = found.costs[i - 1]!;
      const via = i === 1 || i === pts.length - 1 ? walledStraight(walls, a, b, plain).via : null;
      // kusy objížďky – poslední dostane zbytek ceny úsečky (součet týž)
      let rest = cost;
      let at = a;
      for (const p of via ?? []) {
        const piece = plain(at, p);
        out.push(p);
        outCosts.push(piece);
        rest -= piece;
        at = p;
      }
      outCosts.push(rest);
      out.push(b);
    }
    return { points: out, costs: outCosts, cost: found.cost };
  }
}

/** Bod řetězu `chain` nejblíž `p` vzdušnou čarou (při shodě první), prázdný řetěz −1. */
function nearestNode(graph: WalkGraph, chain: readonly number[], p: PathPoint): number {
  let best = -1;
  let bestD = Infinity;
  for (const id of chain) {
    const dx = graph.x[id]! - p.x;
    const dz = graph.z[id]! - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/**
 * Chůze po pevných cestách (bez pěšin dne) s půdou – pro kácení dřeva stavby (roads.md): z místa
 * stavby ke stromům. Stejná data na serveru i v prohlížeči (pevné cesty a krajina), takže cena
 * u kurzoru sedí. Vrátí vzdálenosti chůze z `from` ke každému cíli.
 */
export type Walk = (from: PathPoint, targets: readonly PathPoint[]) => number[];

/** Chůze po pevných cestách `roads` s půdou `ground` (bez pěšin dne). */
export function roadWalk(roads: readonly WalkRoad[], ground: WalkGround | null): Walk {
  const graph = walkGraph([], { roads, ground });
  return (from, targets) => walkingDistances(graph, [from], targets, ground);
}

/** Chůze po pevných cestách vsi s půdou krajiny sídla – kácení dřeva staveb (roads.md). */
export function villageRoadWalk(
  state: { roads?: { roads: readonly WalkRoad[] } },
  landscape: Landscape,
): Walk {
  return roadWalk(state.roads?.roads ?? [], walkGroundOf(landscape));
}

/** Chůze rovně krajinou s půdou `ground` (bez pěšin dne i pevných cest). */
export function straightWalk(ground: WalkGround | null): Walk {
  return (from, targets) => targets.map((t) => groundWalkLength(ground, from, t));
}

const spotsCache = new WeakMap<PathTerrain, Map<number, PathPoint[]>>();

/**
 * Body buněk půdy pro chůzi s příznakem `flag` (PATH_WATER_SPOT – suchý břeh, kam se chodí pro
 * vodu, PATH_FOREST_EDGE – okraj lesa pro dřevo) po řádcích; v mezipaměti podle terénu půdy.
 */
export function groundSpots(ground: WalkGround, flag: number): readonly PathPoint[] {
  const t = ground.terrain;
  let byFlag = spotsCache.get(t);
  if (!byFlag) {
    byFlag = new Map();
    spotsCache.set(t, byFlag);
  }
  const cached = byFlag.get(flag);
  if (cached) return cached;
  const out: PathPoint[] = [];
  for (let j = 0; j < t.height; j++) {
    for (let i = 0; i < t.width; i++) {
      if (t.flags[j * t.width + i]! & flag) {
        out.push({ x: t.originX + i * t.cellM, z: t.originZ + j * t.cellM });
      }
    }
  }
  byFlag.set(flag, out);
  return out;
}

/** Nejbližší bod vzdušnou čarou (při shodě první); bez bodů null. */
export function nearestSpot(points: readonly PathPoint[], from: PathPoint): PathPoint | null {
  let best: PathPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = (p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Chůze z `from` k nejbližší vodě (m; paths.md – Pochůzky pro vodu): místo na suchém břehu
 * (PATH_WATER_SPOT) nejblíž vzdušnou čarou v okně půdy pro chůzi, vzdálenost podle `walk` – po
 * pěšinách dne a pevných cestách (`walkGraph` + `walkingDistances`), jen po pevných cestách
 * (`roadWalk`), nebo rovně krajinou (`straightWalk`). Bez vody v okně null.
 */
export function waterWalkDistance(ground: WalkGround, walk: Walk, from: PathPoint): number | null {
  const spot = nearestSpot(groundSpots(ground, PATH_WATER_SPOT), from);
  return spot ? walk(from, [spot])[0]! : null;
}
