import {
  DWELLING_FOOTPRINT_M,
  HAY_WINTER_MONTHS,
  SURFACE_CODES,
  dateOfDayIndex,
  rotationCosSin,
  type DwellingType,
  type ForestField,
  type Landscape,
  type Position,
  type Relief,
} from '@bohemia/game';
import { grazeablePart } from './field-look';
import { aftermathGrazing } from './hay-meadows';
import { PIT_SHAPES } from './dwelling-pit';
import { insidePlot, type PlotSquare } from './homestead-layout';
import { hash01 } from './smoke-schedule';
import type { SceneFieldPart } from '../village-view';
import type { StreamCenterline } from './stream-geometry';
import { tileAt } from './tile-at';
import { localToWorld } from './village-layout';

// Domácí zvířata vsi: slepice kolem obydlí, ovce s kozami a krávy na loukách a úhoru, prasata
// v lese u okraje. Kolik jich je, říká herní jádro (diet.md – skutečná stáda, `livestock`;
// krávy v zimě v ohradě se nepočítají), kde se pasou, se odvozuje z dat vsi pro scénu
// a z krajiny, deterministicky – stejná ves = stejná zvířata a stejné pastviny. Bez počtů od
// jádra (starší data) se stáda odvodí z domácností jako dřív. Martin 19. 10. 2026: „Stáda
// domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí být nějaký člověk.“ – na
// pastvu jde jen tolik stád, kolik je dnes pasáků (diet.md – Pasáci); ostatní stojí u domů
// (v zimě ovce, kozy a krávy bez ohrady vždy). Stáda se drží mimo jídlo pro lidi – osetý díl,
// louku před sečí, sad a záhony pozemků.

export type LivestockSpecies = 'sheep' | 'goat' | 'cow' | 'pig' | 'chicken';

/** Co z vsi pro scénu (SceneVillage) zvířata potřebují – pohřebiště jen tam, kde už jsou. */
export interface LivestockVillage {
  dwellings: readonly {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    inhabited?: boolean;
    /** Pozemek (polozemnice) – slepice zůstávají uvnitř plotu, cizí do něj nechodí. */
    plot?: PlotSquare;
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
      /** Natočený díl natočeného pole (fields.md – Natočené stavby). */
      rotation?: number;
      stage?: SceneFieldPart['stage'];
      look?: SceneFieldPart['look'];
      work?: number;
      /**
       * Příloh, kam stáda dnes dojdou (jádro – `pastureGrazedParts`, diet.md – Pastva); false =
       * nepase se. Bez údaje se pase.
       */
      grazed?: boolean;
    }[];
  }[];
  cemeteries?: readonly {
    squares: readonly { x: number; z: number; size: number; rotation?: number }[];
  }[];
  orchards?: readonly {
    squares: readonly { x: number; z: number; size: number; rotation?: number }[];
  }[];
  /** Ohrady (oxen.md) – oplocené čtverce, stáda ani slepice do nich nechodí. */
  pens?: readonly {
    x: number;
    z: number;
    size: number;
    rotation?: number;
    /** Další čtverce ohrady (oxen.md – Ohrady podle druhu). */
    extraSquares?: readonly { x: number; z: number }[];
  }[];
  /**
   * Rozdělení práce dne: herní den (na louce na seno se pase jen po seči; bez něj se tam nepase)
   * a pasáci (`herders` – výrostci 7–13 let; starší a dospělí v podílech `herding` jen v datech
   * z doby před 19. 10. 2026; diet.md – Pasáci). Bez údaje o pasácích (starší data) jdou na
   * pastvu všechna stáda.
   */
  labor?: {
    day: number;
    herders?: { children: number; elders?: number };
    shares?: readonly { activity: string; manDays: number }[];
  };
  /**
   * Přirozené louky letošní seče (oxen.md – Seno): před sečí na ně stáda nejdou, po seči se na
   * otavě pase (`aftermathGrazing`).
   */
  hayMeadows?: readonly {
    x: number;
    z: number;
    size: number;
    rotation?: number;
    look?: SceneFieldPart['look'];
    work?: number;
  }[];
  /**
   * Skutečné počty stád od herního jádra (diet.md, zaokrouhleně; krávy bez těch v ohradě). Bez
   * údaje se odvodí z domácností (`PER_HOUSEHOLD`).
   */
  livestock?: Readonly<Record<'sheep' | 'goat' | 'pig' | 'cow', number>>;
}

/** Den v roce pro pastvu na dílech pole (z rozdělení práce vsi), nebo undefined. */
export function grazingDay(village: Pick<LivestockVillage, 'labor'>): number | undefined {
  return village.labor ? dateOfDayIndex(village.labor.day).dayOfYear : undefined;
}

/**
 * Díl pole, kde se dnes pase (úhor, kam stáda dojdou, otava po seči, strniště po sklizni – diet.md,
 * Pastva) – stadium bez údaje = osetý díl.
 */
export function grazedPart(
  part: LivestockVillage['fields'][number]['parts'][number],
  dayOfYear: number | undefined,
): boolean {
  if (part.stage === undefined) return false;
  // strniště po sklizni – paběrky (Martin: jídlo pro lidi stáda nespásají, strniště už jídlem není)
  if (part.look === 'stubble' && (part.work === undefined || part.work >= 1)) return true;
  return grazeablePart(
    { stage: part.stage, look: part.look, work: part.work, grazed: part.grazed },
    dayOfYear,
  );
}

/** Louka letošní seče, kde se dnes pase – jen otava po seči (bez dne v roce ne). */
export function grazedMeadow(
  meadow: NonNullable<LivestockVillage['hayMeadows']>[number],
  dayOfYear: number | undefined,
): boolean {
  if (dayOfYear === undefined || !aftermathGrazing(dayOfYear)) return false;
  if (meadow.work !== undefined && meadow.work < 1) return false;
  return meadow.look === 'mown' || meadow.look === 'haystacks';
}

/**
 * Kolik lidí dnes pase (diet.md – Pasáci): výrostci 7–13 let z rozdělení práce; v datech z doby
 * před 19. 10. 2026 i starší a dospělí podle člověkodní činnosti `herding` (člověkoden = jeden
 * pasák). Bez údaje (starší data) neomezeně.
 */
export function herderCount(labor: LivestockVillage['labor']): number {
  if (!labor?.herders) return Infinity;
  const adults = (labor.shares ?? [])
    .filter((share) => share.activity === 'herding')
    .reduce((sum, share) => sum + share.manDays, 0);
  return (
    labor.herders.children + (labor.herders.elders ?? 0) + Math.max(0, Math.ceil(adults - 1e-6))
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
  /**
   * Pase se s pasákem (Martin 19. 10. 2026 – stádo nikdy samo); false = stojí u domu, nestěhuje
   * se. Stáda s pasákem jsou v plánu napřed – pasák `k` patří ke stádu `k`.
   */
  tended: boolean;
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
/** Nejvýš kolik ovcí a koz je v jednom stádě a nejvýš kolik krav a prasat. */
const FLOCK_SIZE = 5 * (PER_HOUSEHOLD.sheep + PER_HOUSEHOLD.goat);
const COWS_PER_HERD = 6;
const PIGS_PER_HERD = 8;

/** Slepice: odstup od domu (m) a kolik úhlů kolem domu se zkouší. */
const CHICKEN_REACH_M = { from: 0.4, to: 4.5 };
/** Na pozemku slepice nechodí dál než k plotu – i dům uprostřed jim nechá místo dokola. */
const PLOT_CHICKEN_REACH_M = { from: 0.4, to: 2.5 };
/** Odstup slepic od plotu pozemku (m). */
const PLOT_FENCE_GAP_M = 0.35;
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
/** Stádo bez pasáka u domů: jak daleko od vsi, od obydlí a od sebe (m). */
const HOME_REACH_M = 80;
const HOME_DWELLING_GAP_M = 6;
const HOME_START_GAP_M = 14;

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
  /**
   * Na poli, louce před sečí, hřbitově, v sadu, ohradě nebo na pozemku (čtverec rozšířený
   * o `margin`) – úhor, otava a strniště, kde se pase, ne.
   */
  onCrop(x: number, z: number, margin: number): boolean;
  /** Na úhoru, kde se pase (v některém jeho čtverci – sousední čtverce úhoru se spojí). */
  onPasture(x: number, z: number): boolean;
  /** Na hřbitově (čtverec rozšířený o `margin`). */
  onCemetery(x: number, z: number, margin: number): boolean;
  /** Blíž než `gap` k některému obydlí nebo staveništi. */
  nearDwelling(x: number, z: number, gap: number): boolean;
  /** V obdélníku slepic jiného obydlí než `exceptId` (s okrajem). */
  inOtherHouse(x: number, z: number, exceptId: number): boolean;
  /** Na cizím pozemku (s okrajem `margin`) – je oplocený. */
  inOtherPlot(x: number, z: number, exceptId: number, margin: number): boolean;
}

function obstacles(village: LivestockVillage): Obstacles {
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  const orchards = (village.orchards ?? []).flatMap((o) => o.squares);
  const parts = village.fields.flatMap((f) => f.parts);
  // úhor se pase (stadium bez údaje = osetý díl – starší data)
  const day = grazingDay(village);
  const grazed = parts.filter((p) => grazedPart(p, day));
  const grazedSet = new Set(grazed);
  const sown = parts.filter((p) => !grazedSet.has(p));
  // louka před sečí je seno pro dobytek – stáda na ni nejdou, po seči na otavu ano
  const meadows = village.hayMeadows ?? [];
  const aftermath = meadows.filter((m) => grazedMeadow(m, day));
  const uncut = meadows.filter((m) => !grazedMeadow(m, day));
  // ohrada je oplocená jako pole – stáda kolem ní, ne skrz (oxen.md)
  const penSquares = (village.pens ?? []).flatMap(penSquaresOf);
  const squares = [...sown, ...uncut, ...graves, ...orchards, ...penSquares];
  // záhony pozemků (zelí, řepa) jsou jídlo pro lidi – pozemek je oplocený
  const plots = village.dwellings.flatMap((d) => (d.plot ? [d.plot] : []));
  const houses = village.dwellings.map((d) => ({
    id: d.id,
    position: d.position,
    box: chickenBox(d.type),
  }));
  const onGrazed = squareLookup([...grazed, ...aftermath]);
  const onSquares = squareLookup(squares);
  return {
    onCrop: (x, z, margin) =>
      onSquares(x, z, margin) || plots.some((plot) => insidePlot(plot, x, z, -margin)),
    onPasture: (x, z) => onGrazed(x, z, 0),
    onCemetery: squareLookup(graves),
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
    inOtherPlot: (x, z, exceptId, margin) =>
      village.dwellings.some(
        (d) => d.id !== exceptId && d.plot !== undefined && insidePlot(d.plot, x, z, -margin),
      ) || penSquares.some((pen) => inSquare(pen, x, z, margin)),
  };
}

/** Čtverce ohrady – první a další (oxen.md – Ohrady podle druhu), se stranou a natočením. */
export function penSquaresOf(pen: {
  x: number;
  z: number;
  size: number;
  rotation?: number;
  extraSquares?: readonly { x: number; z: number }[];
}): { x: number; z: number; size: number; rotation?: number }[] {
  const turned = pen.rotation !== undefined ? { rotation: pen.rotation } : {};
  return [
    { x: pen.x, z: pen.z, size: pen.size, ...turned },
    ...(pen.extraSquares ?? []).map((q) => ({ x: q.x, z: q.z, size: pen.size, ...turned })),
  ];
}

interface Square {
  x: number;
  z: number;
  size: number;
  /** Natočený čtverec (fields.md – Natočené stavby) – test v jeho osách. */
  rotation?: number;
}

/** Méně čtverců projde dotaz rovnou. */
const SQUARE_LOOKUP_MIN = 8;

/** Bod ve čtverci rozšířeném o `margin` (ostrá nerovnost); natočený čtverec v jeho osách. */
function inSquare(s: Square, x: number, z: number, margin: number): boolean {
  const h = s.size / 2 + margin;
  if (!s.rotation) return Math.abs(x - s.x) < h && Math.abs(z - s.z) < h;
  const [c, sn] = rotationCosSin(s.rotation);
  const dx = x - s.x;
  const dz = z - s.z;
  return Math.abs(dx * c - dz * sn) < h && Math.abs(dx * sn + dz * c) < h;
}

/** Největší vzdálenost bodu čtverce od středu v ose světa (natočený až √2 × polovina strany). */
function squareReach(s: Square): number {
  return (s.size / 2) * (s.rotation ? Math.SQRT2 : 1);
}

/**
 * Dotaz „bod ve čtverci rozšířeném o `margin`“ (ostrá nerovnost v obou osách) přes přihrádky
 * po největším čtverci – stejný výsledek jako průchod všemi čtverci, jen bez tisíců porovnání
 * na bod (rozmístění stád se ptá statisíckrát, pole mívá stovky až tisíce dílů).
 */
export function squareLookup(
  list: readonly Square[],
): (x: number, z: number, margin: number) => boolean {
  const scan = (x: number, z: number, margin: number): boolean =>
    list.some((s) => inSquare(s, x, z, margin));
  if (list.length < SQUARE_LOOKUP_MIN) return scan;
  let maxHalf = 0;
  for (const s of list) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z) || !Number.isFinite(s.size)) return scan;
    maxHalf = Math.max(maxHalf, squareReach(s));
  }
  const cell = Math.max(1, maxHalf * 2);
  const slack = cell * 1e-6;
  let minI = Infinity;
  let minJ = Infinity;
  let maxI = -Infinity;
  let maxJ = -Infinity;
  for (const s of list) {
    const i = Math.floor(s.x / cell);
    const j = Math.floor(s.z / cell);
    minI = Math.min(minI, i);
    maxI = Math.max(maxI, i);
    minJ = Math.min(minJ, j);
    maxJ = Math.max(maxJ, j);
  }
  const width = maxI - minI + 1;
  const buckets = new Map<number, Square[]>();
  for (const s of list) {
    const key = (Math.floor(s.z / cell) - minJ) * width + (Math.floor(s.x / cell) - minI);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(s);
    else buckets.set(key, [s]);
  }
  return (x, z, margin) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(margin)) {
      return scan(x, z, margin);
    }
    // čtverec, který bod obsahuje, má střed blíž než největší polovina strany + okraj (s rezervou
    // na zaokrouhlení při zařazení do přihrádky)
    const reach = maxHalf + Math.max(0, margin) + slack;
    const i0 = Math.max(minI, Math.floor((x - reach) / cell));
    const i1 = Math.min(maxI, Math.floor((x + reach) / cell));
    const j0 = Math.max(minJ, Math.floor((z - reach) / cell));
    const j1 = Math.min(maxJ, Math.floor((z + reach) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const bucket = buckets.get((j - minJ) * width + (i - minI));
        if (!bucket) continue;
        for (const s of bucket) {
          if (inSquare(s, x, z, margin)) return true;
        }
      }
    }
    return false;
  };
}

/** Kolik zvířat kterého druhu se pase: od herního jádra, jinak z domácností (starší data). */
export function herdCounts(
  village: LivestockVillage,
): Readonly<Record<'sheep' | 'goat' | 'pig' | 'cow', number>> {
  if (village.livestock) {
    const { sheep, goat, pig, cow } = village.livestock;
    const whole = (n: number): number => Math.max(0, Math.round(n));
    return { sheep: whole(sheep), goat: whole(goat), pig: whole(pig), cow: whole(cow) };
  }
  const households = householdCount(village);
  return {
    sheep: households * PER_HOUSEHOLD.sheep,
    goat: households * PER_HOUSEHOLD.goat,
    pig: households * PER_HOUSEHOLD.pig,
    cow: Math.ceil(households / PER_HOUSEHOLD.householdsPerCow),
  };
}

/**
 * Domácí zvířata vsi: slepice u každého hotového obydlí, stáda podle skutečných počtů od jádra
 * (`herdCounts`; bez nich na domácnost tři ovce, koza a dvě prasata, na dvě domácnosti kráva).
 * Ovce s kozami (stádo na každých 20 kusů – dřív na pět domácností) a krávy se
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

  const counts = herdCounts(village);
  const flockGroups = Math.ceil((counts.sheep + counts.goat) / FLOCK_SIZE);
  const cattleGroups = Math.ceil(counts.cow / COWS_PER_HERD);
  const swineGroups = Math.ceil(counts.pig / PIGS_PER_HERD);
  // Martin: stádo nikdy samo – na pastvu jde jen tolik stád, kolik je pasáků; v zimě (listopad až
  // březen) jsou ovce, kozy a krávy u domů na seně, pasou se jen prasata v lese
  const day = village.labor?.day;
  const winter = day !== undefined && HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const pastureGroups = winter ? 0 : flockGroups + cattleGroups;
  const tended = tendedHerds(herderCount(village.labor), pastureGroups, swineGroups);
  const pastureHerd = (kind: HerdKind, animals: LivestockSpecies[], k: number): void => {
    const herd = buildHerd(kind, animals, center, meadow, PASTURE_REACH_M, starts, seed, k, fallow);
    if (herd) herds.push(herd);
  };
  if (tended.pasture === pastureGroups) {
    // Ovce s kozami: stádo nejvýš po FLOCK_SIZE kusech (dřív na pět domácností = 20 kusů).
    for (let k = 0; k < pastureGroups && k < flockGroups; k++) {
      pastureHerd(
        'flock',
        [
          ...repeat('sheep', shareOf(counts.sheep, flockGroups, k)),
          ...repeat('goat', shareOf(counts.goat, flockGroups, k)),
        ],
        k,
      );
    }
    // Krávy: stáda nejvýš po šesti.
    for (let k = 0; k < pastureGroups - flockGroups; k++) {
      pastureHerd('cattle', repeat('cow', shareOf(counts.cow, cattleGroups, k)), k);
    }
  } else {
    // pasáků je méně než stád – pasák vede víc zvířat najednou (ovce, kozy i krávy)
    for (let k = 0; k < tended.pasture; k++) {
      const cows = shareOf(counts.cow, tended.pasture, k);
      pastureHerd(
        cows > 0 ? 'cattle' : 'flock',
        [
          ...repeat('sheep', shareOf(counts.sheep, tended.pasture, k)),
          ...repeat('goat', shareOf(counts.goat, tended.pasture, k)),
          ...repeat('cow', cows),
        ],
        k,
      );
    }
  }
  // Prasata: v lese u okraje do 150 m od vsi (když tam les není, o kus dál), s pasákem.
  for (let k = 0; k < tended.swine; k++) {
    const animals = repeat('pig', shareOf(counts.pig, tended.swine, k));
    for (const reach of SWINE_REACH_M) {
      const herd = buildHerd('swine', animals, center, forest, reach, starts, seed, k);
      if (herd) {
        herds.push(herd);
        break;
      }
    }
  }
  // Stáda bez pasáka se nepasou – stojí u domů (Martin: „nesmí se potulovat sama“).
  const home = (x: number, z: number, margin: number): boolean =>
    ground.walkable(x, z) &&
    !blocked.onCrop(x, z, margin) &&
    !blocked.nearDwelling(x, z, HOME_DWELLING_GAP_M);
  const homeStarts: { x: number; z: number }[] = [];
  const homeHerd = (kind: HerdKind, animals: LivestockSpecies[], k: number): void => {
    const herd = buildHerd(
      kind,
      animals,
      center,
      home,
      HOME_REACH_M,
      homeStarts,
      seed,
      k,
      undefined,
      {
        routeLength: 1,
        startGap: HOME_START_GAP_M,
      },
    );
    if (herd) herds.push({ ...herd, tended: false });
  };
  if (tended.pasture === 0) {
    for (let k = 0; k < flockGroups; k++) {
      homeHerd(
        'flock',
        [
          ...repeat('sheep', shareOf(counts.sheep, flockGroups, k)),
          ...repeat('goat', shareOf(counts.goat, flockGroups, k)),
        ],
        k,
      );
    }
    for (let k = 0; k < cattleGroups; k++) {
      homeHerd('cattle', repeat('cow', shareOf(counts.cow, cattleGroups, k)), k);
    }
  }
  if (tended.swine === 0) {
    for (let k = 0; k < swineGroups; k++) {
      homeHerd('swine', repeat('pig', shareOf(counts.pig, swineGroups, k)), k);
    }
  }
  return { chickens, herds };
}

function repeat(species: LivestockSpecies, count: number): LivestockSpecies[] {
  return Array.from({ length: count }, () => species);
}

/**
 * Kolik stád jde dnes na pastvu s pasákem (diet.md – Pasáci): všechna, když je pasáků dost; jinak
 * pasák vede víc zvířat najednou – na loukách napřed (ovce jsou hlavní zvíře, Martin), a když je
 * pasáků aspoň dva, jeden jde s prasaty do lesa. Bez pasáka žádné.
 */
export function tendedHerds(
  herders: number,
  pastureGroups: number,
  swineGroups: number,
): { pasture: number; swine: number } {
  if (herders >= pastureGroups + swineGroups) return { pasture: pastureGroups, swine: swineGroups };
  const h = Math.max(0, Math.floor(herders));
  let swine = 0;
  if (swineGroups > 0) {
    if (pastureGroups === 0) swine = Math.min(swineGroups, h);
    else if (h >= 2) swine = Math.min(swineGroups, Math.max(1, h - pastureGroups));
  }
  return { pasture: Math.min(pastureGroups, h - swine), swine };
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
  // na pozemku jen uvnitř plotu (kratší odstup od domu)
  const plot = dwelling.plot;
  const reach = plot ? PLOT_CHICKEN_REACH_M : CHICKEN_REACH_M;
  // Které úhly kolem domu jsou volné – celý paprsek od domu až po největší odstup.
  const free = Array.from({ length: CHICKEN_ARC_SAMPLES }, (_, i) => {
    const theta = (i / CHICKEN_ARC_SAMPLES) * Math.PI * 2;
    return [reach.from, (reach.from + reach.to) / 2, reach.to].every((d) => {
      const [x, z] = chickenPoint(base, theta, d);
      // Na kraj pole slepice zajdou, na hřbitov ne.
      return (
        ground.walkable(x, z) &&
        !blocked.inOtherHouse(x, z, dwelling.id) &&
        !blocked.inOtherPlot(x, z, dwelling.id, 0.4) &&
        (!plot || insidePlot(plot, x, z, PLOT_FENCE_GAP_M)) &&
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
    reachM: reach,
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
  options: { routeLength?: number; startGap?: number } = {},
): Herd | null {
  if (species.length === 0) return null;
  const routeLength = options.routeLength ?? ROUTE_LENGTH;
  const startGap = options.startGap ?? HERD_START_GAP_M;
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
    starts.every((s) => Math.hypot(s.x - c.x, s.z - c.z) >= startGap);
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
  // trasa se k pastvinám vrací – průchodnost cesty mezi dvěma pastvinami se počítá jednou
  const freeWays = new Map<number, boolean>();
  const freeWay = (from: number, to: number): boolean => {
    const key = from * candidates.length + to;
    let free = freeWays.get(key);
    if (free === undefined) {
      free = pathFree(candidates[from]!, candidates[to]!);
      freeWays.set(key, free);
    }
    return free;
  };
  const falloff = PASTURE_FALLOFF_M[kind];
  const neighbours = routeNeighbours(candidates);
  const route: number[] = [start];
  for (let step = 1; step < routeLength; step++) {
    const current = route[route.length - 1]!;
    const recent = new Set(route.slice(-ROUTE_MEMORY));
    const near = neighbours(current);
    let options = near.filter((n) => !recent.has(n.i) && freeWay(current, n.i));
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
    tended: true,
    seed: herdSeed,
    phase: hash01(herdSeed, 4, 71),
    routeOffset: 0,
    route: route.map((i) => ({ x: candidates[i]!.x, z: candidates[i]!.z })),
    radiusM,
    animals,
  };
}

/**
 * Sousední pastviny trasy (krok ROUTE_STEP_M) k pastvině `index` – v pořadí kandidátů jako
 * průchod všemi, jen přes přihrádky o straně nejdelšího kroku (a pro každou pastvinu jednou).
 */
function routeNeighbours(
  candidates: readonly { x: number; z: number; d: number }[],
): (index: number) => { c: { x: number; z: number; d: number }; i: number; d: number }[] {
  const cell = ROUTE_STEP_M.to;
  const buckets = new Map<string, number[]>();
  const keyOf = (i: number, j: number): string => `${i},${j}`;
  candidates.forEach((c, i) => {
    const key = keyOf(Math.floor(c.x / cell), Math.floor(c.z / cell));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  });
  const cache = new Map<
    number,
    { c: { x: number; z: number; d: number }; i: number; d: number }[]
  >();
  return (index) => {
    const known = cache.get(index);
    if (known) return known;
    const current = candidates[index]!;
    const ci = Math.floor(current.x / cell);
    const cj = Math.floor(current.z / cell);
    const found: number[] = [];
    // krok nejvýš o přihrádku, druhá přihrádka je rezerva na zaokrouhlení
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) found.push(...(buckets.get(keyOf(i, j)) ?? []));
    }
    found.sort((a, b) => a - b);
    const near = found
      .map((i) => {
        const c = candidates[i]!;
        return { c, i, d: Math.hypot(c.x - current.x, c.z - current.z) };
      })
      .filter((n) => n.d >= ROUTE_STEP_M.from && n.d <= ROUTE_STEP_M.to);
    cache.set(index, near);
    return near;
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
