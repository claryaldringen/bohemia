import {
  DWELLING_FOOTPRINT_M,
  SURFACE_CODES,
  dateOfDayIndex,
  type DwellingType,
  type ForestField,
  type Landscape,
  type Position,
  type Relief,
} from '@bohemia/game';
import { inGarden } from './dwelling-decor';
import { grazeablePart } from './field-look';
import { PIT_SHAPES } from './dwelling-pit';
import { hash01 } from './smoke-schedule';
import type { SceneFieldPart } from '../village-view';
import type { StreamCenterline } from './stream-geometry';
import { tileAt } from './tile-at';
import { localToWorld } from './village-layout';

// Domácí zvířata jako ozdoba vsi (zatím bez herní mechaniky – Martin): slepice kolem obydlí,
// ovce s kozami a krávy na loukách, prasata v lese u okraje. Všechno se odvozuje z dat vsi pro
// scénu a z krajiny, deterministicky – stejná ves = stejná zvířata a stejné pastviny.

export type LivestockSpecies = 'sheep' | 'goat' | 'cow' | 'pig' | 'chicken';

/** Co z vsi pro scénu (SceneVillage) zvířata potřebují – pohřebiště jen tam, kde už jsou. */
export interface LivestockVillage {
  dwellings: readonly {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    inhabited?: boolean;
  }[];
  /**
   * Díly polí – stadium a vzhled (field-look.ts) rozhodnou, jestli se na dílu pase (úhor:
   * Martin – na úhoru se pasou ovce, kozy a krávy); bez nich je díl osetý.
   */
  fields: readonly {
    parts: readonly {
      x: number;
      z: number;
      size: number;
      stage?: SceneFieldPart['stage'];
      look?: SceneFieldPart['look'];
      work?: number;
    }[];
  }[];
  cemeteries?: readonly { squares: readonly { x: number; z: number; size: number }[] }[];
  orchards?: readonly { squares: readonly { x: number; z: number; size: number }[] }[];
  /** Herní den (rozdělení práce) – na louce na seno se pase jen po seči. Bez něj se tam nepase. */
  labor?: { day: number };
}

/** Den v roce pro pastvu na dílech pole (z rozdělení práce vsi), nebo undefined. */
export function grazingDay(village: Pick<LivestockVillage, 'labor'>): number | undefined {
  return village.labor ? dateOfDayIndex(village.labor.day).dayOfYear : undefined;
}

/** Díl pole, kde se dnes pase (úhor, otava po seči) – stadium bez údaje = osetý díl. */
export function grazedPart(
  part: LivestockVillage['fields'][number]['parts'][number],
  dayOfYear: number | undefined,
): boolean {
  return (
    part.stage !== undefined &&
    grazeablePart({ stage: part.stage, look: part.look, work: part.work }, dayOfYear)
  );
}

/** Terén pro zvířata (bez vsi). */
export interface LivestockGround {
  /** Louka, kde se smí pást – ne les, voda, skála, prudký svah ani okraj krajiny. */
  pasture(x: number, z: number): boolean;
  /** Okraj lesa pod krajními stromy – tam prasata rozrývají půdu (hlouběji by je zakryly koruny). */
  forestEdge(x: number, z: number): boolean;
  /** Kudy smí slepice – ne voda, skála a prudký svah. */
  walkable(x: number, z: number): boolean;
}

/**
 * Slepice jednoho obydlí: zobají a popocházejí kolem něj – mimo obdélník domu se vchodem
 * (souřadnice modelu jako `localToWorld`), nejvýš `reachM` od něj a jen v oblouku `arc`.
 */
export interface ChickenFlock {
  seed: number;
  position: Position;
  /** Kam slepice nesmí: |x| < halfX, minZ < z < maxZ (dům, střecha, šíje se schody). */
  box: { halfX: number; minZ: number; maxZ: number };
  /** Úhly kolem domu (rad, 0 = k vchodu, π/2 = +x modelu), kam smějí; null = dokola. */
  arc: { from: number; to: number } | null;
  /** Odstup od domu (m): nejblíž a nejdál. */
  reachM: { from: number; to: number };
  chickens: { seed: number; scale: number; home: number }[];
}

export type HerdKind = 'flock' | 'cattle' | 'swine';

export interface HerdAnimal {
  species: LivestockSpecies;
  seed: number;
  scale: number;
  /** Kde se zvíře pase vůči středu stáda (m). */
  homeX: number;
  homeZ: number;
}

/**
 * Stádo: pase se na pastvině kolem středu (do `radiusM`) a během dní se stěhuje po pastvinách
 * `route` (tam a zpět, sousední pastviny spojuje volná cesta) – livestock-motion.ts.
 */
export interface Herd {
  kind: HerdKind;
  seed: number;
  /** Posun rozvrhu stěhování (podíl dne) – stáda se nestěhují všechna naráz. */
  phase: number;
  /**
   * Posun v trase (pastvin) – po přepočtu vsi zůstane stádo na pastvině, kde právě je, pokud ji
   * nová trasa obsahuje (keepRouteSpot v livestock-motion.ts).
   */
  routeOffset: number;
  route: { x: number; z: number }[];
  radiusM: number;
  animals: HerdAnimal[];
}

export interface LivestockPlan {
  chickens: ChickenFlock[];
  herds: Herd[];
}

/** Slepic na hotové obydlí – řemeslné dílny později podle základního typu (Martin). */
export function chickensFor(type: DwellingType): number {
  return type === 'polozemnice' ? 3 : 2;
}

/** Na domácnost (obývané obydlí): ovce, kozy, prasata; krávy na dvě domácnosti. */
export const PER_HOUSEHOLD = { sheep: 3, goat: 1, pig: 2, householdsPerCow: 2 } as const;
/** Kolik domácností má společné stádo ovcí a koz a nejvýš kolik krav a prasat je v jednom. */
const HOUSEHOLDS_PER_FLOCK = 5;
const COWS_PER_HERD = 6;
const PIGS_PER_HERD = 8;

/** Slepice: odstup od domu (m) a kolik úhlů kolem domu se zkouší. */
const CHICKEN_REACH_M = { from: 0.4, to: 4.5 };
const CHICKEN_ARC_SAMPLES = 32;
/** Nejmenší volný oblouk (počet vzorků), ve kterém slepice ještě chodí. */
const CHICKEN_MIN_ARC = 4;

/** Pastviny: rozteč kandidátů (m), délka trasy (pastvin) a krok mezi sousedními (m). */
const SPOT_GRID_M = 9;
const ROUTE_LENGTH = 160;
const ROUTE_STEP_M = { from: 6, to: 22 };
/** Kolik naposledy navštívených pastvin trasa nevybere znovu. */
const ROUTE_MEMORY = 8;
/** Jak daleko od vsi (m): stáda na loukách a prasata v lese, kdyby u vsi les nebyl. */
const PASTURE_REACH_M = 300;
const SWINE_REACH_M = [150, 260] as const;
/** Pastviny dál od vsi trasa vybírá méně často (m – měřítko poklesu). */
const PASTURE_FALLOFF_M = { flock: 170, cattle: 190, swine: 90 } as const;
/** Odstup stáda od obydlí a od polí a hřbitovů (m). */
const HERD_DWELLING_GAP_M = 12;
const SWINE_DWELLING_GAP_M = 8;
const HERD_CROP_GAP_M = 1.5;
/** Starty stád od sebe nejméně (m). */
const HERD_START_GAP_M = 45;

/**
 * Měřítko vůči modelu ve skutečné velikosti (fauna.json: ovce 1,25 m, kráva 2,1 m, slepice
 * 0,45 m) – zvířata jsou stylizovaně větší jako ryby, aby byla z kamery (50–120 m) poznat.
 */
const SCALE: Record<LivestockSpecies, { from: number; to: number }> = {
  sheep: { from: 1.12, to: 1.3 },
  goat: { from: 1.12, to: 1.3 },
  cow: { from: 1.08, to: 1.2 },
  pig: { from: 1.1, to: 1.3 },
  chicken: { from: 1.35, to: 1.6 },
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function between(range: { from: number; to: number }, t: number): number {
  return range.from + (range.to - range.from) * t;
}

/** Počet domácností – hotová obydlí, ve kterých někdo bydlí (bez údaje = obývané). */
export function householdCount(village: LivestockVillage): number {
  return village.dwellings.filter((d) => d.built && d.inhabited !== false).length;
}

/** Obdélník, kam slepice nesmí: dům se střechou a šíje před vchodem (souřadnice modelu). */
export function chickenBox(type: DwellingType): ChickenFlock['box'] {
  const footprint = DWELLING_FOOTPRINT_M[type];
  const pit = PIT_SHAPES[type];
  return {
    halfX: footprint.width / 2 + 0.9,
    minZ: -(footprint.depth / 2 + 1.3),
    maxZ: Math.max(footprint.depth / 2 + 1.3, pit.rampEndZ + 0.5),
  };
}

/**
 * Bod kolem domu: paprsek ze středu obdélníku pod úhlem `theta` (0 = k vchodu) protne jeho
 * okraj a pokračuje ještě `d` metrů. Plynulá změna úhlu a odstupu tak obchází dům.
 */
export function chickenPoint(
  flock: Pick<ChickenFlock, 'position' | 'box'>,
  theta: number,
  d: number,
): [number, number] {
  const { halfX, minZ, maxZ } = flock.box;
  const halfZ = (maxZ - minZ) / 2;
  const dx = Math.sin(theta);
  const dz = Math.cos(theta);
  const rx = Math.abs(dx) > 1e-6 ? halfX / Math.abs(dx) : Infinity;
  const rz = Math.abs(dz) > 1e-6 ? halfZ / Math.abs(dz) : Infinity;
  const r = Math.min(rx, rz) + d;
  return localToWorld(flock.position, dx * r, (minZ + maxZ) / 2 + dz * r);
}

/** Pole, hřbitovy, sady a obydlí vsi jako překážky pro stáda a slepice. */
interface Obstacles {
  /** Na poli, hřbitově nebo v sadu (čtverec rozšířený o `margin`) – úhor, kde se pase, ne. */
  onCrop(x: number, z: number, margin: number): boolean;
  /** Na úhoru, kde se pase (v některém jeho čtverci – sousední čtverce úhoru se spojí). */
  onPasture(x: number, z: number): boolean;
  /** Na hřbitově (čtverec rozšířený o `margin`). */
  onCemetery(x: number, z: number, margin: number): boolean;
  /** Blíž než `gap` k některému obydlí nebo staveništi. */
  nearDwelling(x: number, z: number, gap: number): boolean;
  /** V obdélníku slepic jiného obydlí než `exceptId` (s okrajem). */
  inOtherHouse(x: number, z: number, exceptId: number): boolean;
  /** V zahrádce některého obydlí (s okrajem `margin`) – je oplocená. */
  inGarden(x: number, z: number, margin: number): boolean;
}

function obstacles(village: LivestockVillage): Obstacles {
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  const orchards = (village.orchards ?? []).flatMap((o) => o.squares);
  const parts = village.fields.flatMap((f) => f.parts);
  // úhor se pase (stadium bez údaje = osetý díl – starší data)
  const day = grazingDay(village);
  const grazed = parts.filter((p) => grazedPart(p, day));
  const sown = parts.filter((p) => !grazed.includes(p));
  const squares = [...sown, ...graves, ...orchards];
  const inSquare =
    (list: readonly { x: number; z: number; size: number }[]) =>
    (x: number, z: number, margin: number): boolean =>
      list.some(
        (s) => Math.abs(x - s.x) < s.size / 2 + margin && Math.abs(z - s.z) < s.size / 2 + margin,
      );
  const houses = village.dwellings.map((d) => ({
    id: d.id,
    position: d.position,
    box: chickenBox(d.type),
  }));
  const onGrazed = inSquare(grazed);
  return {
    onCrop: inSquare(squares),
    onPasture: (x, z) => onGrazed(x, z, 0),
    onCemetery: inSquare(graves),
    nearDwelling: (x, z, gap) =>
      houses.some((h) => Math.hypot(x - h.position.x, z - h.position.z) < gap),
    inOtherHouse: (x, z, exceptId) =>
      houses.some((h) => {
        if (h.id === exceptId) return false;
        const c = Math.cos(h.position.rotation);
        const s = Math.sin(h.position.rotation);
        const dx = x - h.position.x;
        const dz = z - h.position.z;
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        return Math.abs(lx) < h.box.halfX + 0.5 && lz > h.box.minZ - 0.5 && lz < h.box.maxZ + 0.5;
      }),
    inGarden: (x, z, margin) =>
      village.dwellings.some((d) => inGarden(d.type, d.position, x, z, margin)),
  };
}

/**
 * Domácí zvířata vsi: slepice u každého hotového obydlí, na každou domácnost tři ovce, koza
 * a dvě prasata, na dvě domácnosti kráva. Ovce s kozami (stádo na pět domácností) a krávy se
 * pasou přednostně na úhoru vsi (mladý úhor i pastvina – stěhují se mezi jeho čtverci, nikdy na
 * osetý díl), bez úhoru na loukách do pár set metrů od vsi, prasata v lese u okraje do 150 m.
 * `seed` míchá krajinu, aby se stáda v každé vsi pásla jinde.
 */
export function planLivestock(
  village: LivestockVillage,
  ground: LivestockGround,
  seed: number,
): LivestockPlan {
  const blocked = obstacles(village);
  const chickens = village.dwellings
    .filter((d) => d.built)
    .map((d) => chickenFlock(d, ground, blocked, seed))
    .filter((f): f is ChickenFlock => f !== null);

  const households = householdCount(village);
  const built = village.dwellings.filter((d) => d.built);
  if (households === 0 || built.length === 0) return { chickens, herds: [] };
  const center = {
    x: built.reduce((sum, d) => sum + d.position.x, 0) / built.length,
    z: built.reduce((sum, d) => sum + d.position.z, 0) / built.length,
  };

  const herds: Herd[] = [];
  const starts: { x: number; z: number }[] = [];
  // louka, nebo úhor, kde se pase (i na vymýceném lese – schůdná zem); od osetých dílů,
  // hřbitovů a sadů odstup
  const meadow = (x: number, z: number, margin: number): boolean =>
    (ground.pasture(x, z) || (blocked.onPasture(x, z) && ground.walkable(x, z))) &&
    !blocked.onCrop(x, z, margin) &&
    !blocked.nearDwelling(x, z, HERD_DWELLING_GAP_M);
  // Martin: na úhoru se pasou ovce, kozy a krávy s pasáčkem – stádo se pase přednostně tam
  const fallow = (x: number, z: number): boolean => blocked.onPasture(x, z);
  const forest = (x: number, z: number, margin: number): boolean =>
    ground.forestEdge(x, z) &&
    !blocked.onCrop(x, z, margin) &&
    !blocked.nearDwelling(x, z, SWINE_DWELLING_GAP_M);

  // Ovce s kozami: stádo na pět domácností.
  const flocks = Math.ceil(households / HOUSEHOLDS_PER_FLOCK);
  for (let k = 0; k < flocks; k++) {
    const share = shareOf(households, flocks, k);
    const animals = [
      ...repeat('sheep', share * PER_HOUSEHOLD.sheep),
      ...repeat('goat', share * PER_HOUSEHOLD.goat),
    ] as LivestockSpecies[];
    const herd = buildHerd(
      'flock',
      animals,
      center,
      meadow,
      PASTURE_REACH_M,
      starts,
      seed,
      k,
      fallow,
    );
    if (herd) herds.push(herd);
  }
  // Krávy: jedna na dvě domácnosti, stáda nejvýš po šesti.
  const cows = Math.ceil(households / PER_HOUSEHOLD.householdsPerCow);
  const cattle = Math.ceil(cows / COWS_PER_HERD);
  for (let k = 0; k < cattle; k++) {
    const animals = repeat('cow', shareOf(cows, cattle, k)) as LivestockSpecies[];
    const herd = buildHerd(
      'cattle',
      animals,
      center,
      meadow,
      PASTURE_REACH_M,
      starts,
      seed,
      k,
      fallow,
    );
    if (herd) herds.push(herd);
  }
  // Prasata: v lese u okraje do 150 m od vsi (když tam les není, o kus dál).
  const pigs = households * PER_HOUSEHOLD.pig;
  const swine = Math.ceil(pigs / PIGS_PER_HERD);
  for (let k = 0; k < swine; k++) {
    const animals = repeat('pig', shareOf(pigs, swine, k)) as LivestockSpecies[];
    for (const reach of SWINE_REACH_M) {
      const herd = buildHerd('swine', animals, center, forest, reach, starts, seed, k);
      if (herd) {
        herds.push(herd);
        break;
      }
    }
  }
  return { chickens, herds };
}

function repeat(species: LivestockSpecies, count: number): LivestockSpecies[] {
  return Array.from({ length: count }, () => species);
}

/** Kolik z `total` připadne `k`-tému z `parts` dílů (rovnoměrně, první dostanou zbytek). */
function shareOf(total: number, parts: number, k: number): number {
  return Math.floor(total / parts) + (k < total % parts ? 1 : 0);
}

function chickenFlock(
  dwelling: LivestockVillage['dwellings'][number],
  ground: LivestockGround,
  blocked: Obstacles,
  seed: number,
): ChickenFlock | null {
  const count = chickensFor(dwelling.type);
  const base = { position: dwelling.position, box: chickenBox(dwelling.type) };
  // Které úhly kolem domu jsou volné – celý paprsek od domu až po největší odstup.
  const free = Array.from({ length: CHICKEN_ARC_SAMPLES }, (_, i) => {
    const theta = (i / CHICKEN_ARC_SAMPLES) * Math.PI * 2;
    return [CHICKEN_REACH_M.from, 2.4, CHICKEN_REACH_M.to].every((d) => {
      const [x, z] = chickenPoint(base, theta, d);
      // Na kraj pole slepice zajdou, na hřbitov ne.
      return (
        ground.walkable(x, z) &&
        !blocked.inOtherHouse(x, z, dwelling.id) &&
        !blocked.inGarden(x, z, 0.4) &&
        !blocked.onCemetery(x, z, 0.5)
      );
    });
  });
  const arc = longestRun(free);
  if (!arc) return null;
  const step = (Math.PI * 2) / CHICKEN_ARC_SAMPLES;
  const full = arc.length === CHICKEN_ARC_SAMPLES;
  const range = full ? null : { from: arc.start * step, to: (arc.start + arc.length - 1) * step };
  const flockSeed = (dwelling.id * 7919 + seed) | 0;
  return {
    ...base,
    seed: flockSeed,
    arc: range,
    reachM: CHICKEN_REACH_M,
    chickens: Array.from({ length: count }, (_, i) => {
      const s = (flockSeed * 31 + i * 101) | 0;
      const t = (i + 0.5 * hash01(s, 1, 61)) / count;
      return {
        seed: s,
        scale: between(SCALE.chicken, hash01(s, 2, 61)),
        home: range ? range.from + (range.to - range.from) * t : t * Math.PI * 2,
      };
    }),
  };
}

/** Nejdelší souvislý úsek volných úhlů (po kruhu), nebo null, když je moc krátký. */
function longestRun(free: readonly boolean[]): { start: number; length: number } | null {
  const n = free.length;
  if (free.every(Boolean)) return { start: 0, length: n };
  let best: { start: number; length: number } | null = null;
  // Začít za prvním zakázaným úhlem – úsek přes konec pole se pak počítá vcelku.
  const first = free.indexOf(false);
  let start = -1;
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    if (free[i]) {
      if (start < 0) start = k;
      const length = k - start + 1;
      if (!best || length > best.length) best = { start: (first + start) % n, length };
    } else {
      start = -1;
    }
  }
  return best && best.length >= CHICKEN_MIN_ARC ? best : null;
}

const HERD_RADIUS: Record<HerdKind, (count: number) => number> = {
  flock: (n) => 3 + Math.sqrt(n) * 1.6,
  cattle: (n) => 4 + Math.sqrt(n) * 2.2,
  swine: (n) => 2.5 + Math.sqrt(n) * 1.3,
};

/**
 * Jak velký kruh kolem pastviny musí ležet na vhodné půdě (podíl poloměru stáda) – prasata
 * se drží pásu u okraje lesa, který je užší než jejich hlouček; kus louky nebo hlubší les
 * pod okrajem nevadí.
 */
const FIT_RADIUS: Record<HerdKind, number> = {
  flock: 1,
  cattle: 1,
  swine: 0.6,
};

/**
 * Stádo s trasou po pastvinách: kandidáti v mřížce do `reach` od vsi, na kterých se celé
 * stádo vejde na vhodnou půdu, a náhodná procházka mezi sousedními z nich (bez nedávno
 * navštívených, blíž ke vsi častěji). Bez vhodné pastviny null.
 */
function buildHerd(
  kind: HerdKind,
  species: LivestockSpecies[],
  center: { x: number; z: number },
  suits: (x: number, z: number, margin: number) => boolean,
  reach: number,
  starts: { x: number; z: number }[],
  seed: number,
  index: number,
  prefer?: (x: number, z: number) => boolean,
): Herd | null {
  if (species.length === 0) return null;
  const herdSeed = (seed * 13 + index * 977 + kind.length * 31337) | 0;
  const radiusM = HERD_RADIUS[kind](species.length);
  const fitRadius = radiusM * FIT_RADIUS[kind];
  const fits = (x: number, z: number): boolean => {
    if (!suits(x, z, HERD_CROP_GAP_M)) return false;
    for (let k = 0; k < 12; k++) {
      const r = k < 8 ? fitRadius : fitRadius / 2;
      const a = (k / (k < 8 ? 8 : 4)) * Math.PI * 2 + (k < 8 ? 0 : 0.4);
      if (!suits(x + Math.cos(a) * r, z + Math.sin(a) * r, HERD_CROP_GAP_M)) return false;
    }
    return true;
  };
  const jitterX = hash01(herdSeed, 1, 71) * SPOT_GRID_M;
  const jitterZ = hash01(herdSeed, 2, 71) * SPOT_GRID_M;
  const all: { x: number; z: number; d: number }[] = [];
  const cells = Math.ceil(reach / SPOT_GRID_M);
  for (let gz = -cells; gz <= cells; gz++) {
    for (let gx = -cells; gx <= cells; gx++) {
      const x = center.x + gx * SPOT_GRID_M + jitterX - SPOT_GRID_M / 2;
      const z = center.z + gz * SPOT_GRID_M + jitterZ - SPOT_GRID_M / 2;
      const d = Math.hypot(x - center.x, z - center.z);
      if (d > reach || !fits(x, z)) continue;
      all.push({ x, z, d });
    }
  }
  if (all.length === 0) return null;
  all.sort((a, b) => a.d - b.d);
  // Úhor má přednost (pastviny jen na něm), když se na něj stádo vejde a jiné stádo ho ještě
  // nezabralo; jinak louka.
  const free = (c: { x: number; z: number }): boolean =>
    starts.every((s) => Math.hypot(s.x - c.x, s.z - c.z) >= HERD_START_GAP_M);
  const fallow = prefer ? all.filter((c) => prefer(c.x, c.z)) : [];
  const candidates = fallow.some(free) ? fallow : all;
  // Start: nejbližší pastvina ke vsi, kterou ještě nezabralo jiné stádo.
  const startIndex = candidates.findIndex(free);
  const start = startIndex >= 0 ? startIndex : 0;
  starts.push(candidates[start]!);

  const pathFree = (a: { x: number; z: number }, b: { x: number; z: number }): boolean => {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / 3));
    const nx = -(b.z - a.z) / length;
    const nz = (b.x - a.x) / length;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // Stádo jde při stěhování celé – volný musí být pruh v šířce stáda.
      for (const side of [-1, -0.5, 0, 0.5, 1]) {
        const offset = side * fitRadius;
        if (!suits(x + nx * offset, z + nz * offset, 1)) return false;
      }
    }
    return true;
  };
  const falloff = PASTURE_FALLOFF_M[kind];
  const route: number[] = [start];
  for (let step = 1; step < ROUTE_LENGTH; step++) {
    const current = candidates[route[route.length - 1]!]!;
    const recent = new Set(route.slice(-ROUTE_MEMORY));
    const near = candidates
      .map((c, i) => ({ c, i, d: Math.hypot(c.x - current.x, c.z - current.z) }))
      .filter((n) => n.d >= ROUTE_STEP_M.from && n.d <= ROUTE_STEP_M.to);
    let options = near.filter((n) => !recent.has(n.i) && pathFree(current, n.c));
    if (options.length === 0) {
      const previous = route[route.length - 2];
      options = near.filter((n) => n.i === previous);
    }
    if (options.length === 0) break;
    const weights = options.map((n) => Math.exp(-((n.c.d / falloff) ** 2)) + 0.03);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let pick = hash01(herdSeed, step, 72) * total;
    let chosen = options[options.length - 1]!;
    for (let o = 0; o < options.length; o++) {
      pick -= weights[o]!;
      if (pick < 0) {
        chosen = options[o]!;
        break;
      }
    }
    route.push(chosen.i);
  }

  // Zvířata se pasou rozestoupená (slunečnicový vzor), druhy promíchané.
  const order = species
    .map((s, i) => ({ s, key: hash01(herdSeed, i, 73) }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.s);
  const turn = hash01(herdSeed, 3, 71) * Math.PI * 2;
  const animals: HerdAnimal[] = order.map((s, i) => {
    const animalSeed = (herdSeed * 61 + i * 137) | 0;
    const r = radiusM * 0.78 * Math.sqrt((i + 0.5) / order.length);
    const a = turn + i * GOLDEN_ANGLE;
    return {
      species: s,
      seed: animalSeed,
      scale: between(SCALE[s], hash01(animalSeed, 1, 74)),
      homeX: Math.cos(a) * r,
      homeZ: Math.sin(a) * r,
    };
  });
  return {
    kind,
    seed: herdSeed,
    phase: hash01(herdSeed, 4, 71),
    routeOffset: 0,
    route: route.map((i) => ({ x: candidates[i]!.x, z: candidates[i]!.z })),
    radiusM,
    animals,
  };
}

/** Kolik metrů na buňku má rastr terénu pro zvířata a jak daleko od vsi sahá. */
const GROUND_CELL_M = 4;
export const GROUND_REACH_M = PASTURE_REACH_M + 40;
/** Pastva: dál od lesa (m), od vody (m), sklon (m/m) a skalnatost (0–1). */
const PASTURE_LIMITS = { forestM: -6, bankM: 3, slope: 0.12, rock: 0.25 };
/**
 * Prasata: pás u okraje lesa (m od hranice, záporné v louce) – na okraji pod krajními stromy.
 * Hlouběji v lese je z kamery zakryjí koruny (okraj tvoří 2–3 husté řady 3D stromů); za
 * okrajem lesa z druhé strany je po otočení kamery taky nemusí být vidět – to nevadí.
 */
const FOREST_EDGE_M = { from: -7, to: 5 };
const FOREST_LIMITS = { bankM: 3, slope: 0.16, rock: 0.35 };
/** Slepice: od vody (m), sklon a skalnatost. */
const WALK_LIMITS = { bankM: 1, slope: 0.2, rock: 0.5 };
/** Okraj krajiny, kam zvířata nechodí (m). */
const EDGE_MARGIN_M = 12;

const PASTURE = 1;
const FOREST_EDGE = 2;
const WALKABLE = 4;

/**
 * Terén pro zvířata jako rastr kolem středu vsi (po 4 m, do GROUND_REACH_M) – dotazy na potok
 * a les jsou drahé a rozmístění stád se ptá desetitisíckrát. Mimo rastr nic nevyhovuje.
 */
export function livestockGround(
  l: Landscape,
  env: { field: ForestField; stream: StreamCenterline; relief: Relief },
  center: { x: number; z: number },
): LivestockGround {
  const n = Math.ceil((GROUND_REACH_M * 2) / GROUND_CELL_M);
  const originX = center.x - GROUND_REACH_M;
  const originZ = center.z - GROUND_REACH_M;
  const half = (l.size * l.cellSizeM) / 2 - EDGE_MARGIN_M;
  const flags = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = originX + (i + 0.5) * GROUND_CELL_M;
      const z = originZ + (j + 0.5) * GROUND_CELL_M;
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      const tile = tileAt(l, x, z);
      if (!tile) continue;
      const surface = l.surface[tile.y * l.size + tile.x];
      if (surface === SURFACE_CODES.water) continue;
      const bank = env.stream.nearest(x, z).bankDistance;
      const slope = env.relief.slopeAt(x, z);
      const rock = env.relief.rockinessAt(x, z);
      const forest = env.field.distanceAt(x, z);
      let f = 0;
      if (bank > WALK_LIMITS.bankM && slope < WALK_LIMITS.slope && rock < WALK_LIMITS.rock) {
        f |= WALKABLE;
      }
      if (
        surface === SURFACE_CODES.meadow &&
        forest < PASTURE_LIMITS.forestM &&
        bank > PASTURE_LIMITS.bankM &&
        slope < PASTURE_LIMITS.slope &&
        rock < PASTURE_LIMITS.rock
      ) {
        f |= PASTURE;
      }
      if (
        forest >= FOREST_EDGE_M.from &&
        forest <= FOREST_EDGE_M.to &&
        bank > FOREST_LIMITS.bankM &&
        slope < FOREST_LIMITS.slope &&
        rock < FOREST_LIMITS.rock
      ) {
        f |= FOREST_EDGE;
      }
      flags[j * n + i] = f;
    }
  }
  const at = (x: number, z: number, flag: number): boolean => {
    const i = Math.floor((x - originX) / GROUND_CELL_M);
    const j = Math.floor((z - originZ) / GROUND_CELL_M);
    if (i < 0 || j < 0 || i >= n || j >= n) return false;
    return (flags[j * n + i]! & flag) !== 0;
  };
  return {
    pasture: (x, z) => at(x, z, PASTURE),
    forestEdge: (x, z) => at(x, z, FOREST_EDGE),
    walkable: (x, z) => at(x, z, WALKABLE),
  };
}
