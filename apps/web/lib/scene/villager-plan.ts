import {
  DWELLING_CLEARING_M,
  SACRED_BUILDINGS,
  dateOfDayIndex,
  type Craft,
  type DwellingType,
  type Position,
  type TileCell,
} from '@bohemia/game';
import type {
  LaborActivity,
  LaborShare,
  LaborTarget,
  SceneFieldPart,
  SceneLaborShare,
  SceneVillage,
} from '../village-view';
import { TREE_CLEARANCE_M, buildingClearings, insideClearings } from './building-clearings';
import { cellsBoundary, rowDirection, type CellSquare } from './field-cells';
import {
  fieldPartViews,
  villageCenter,
  workFrame,
  workSteps,
  workedParts,
  type PartView,
  type WorkFrame,
} from './field-look';
import { chickenBox } from './livestock-placement';
import { orchardTreeSpots } from './orchard-layout';
import { hash01 } from './smoke-schedule';
import { localToWorld } from './village-layout';
import {
  fetcher,
  herder,
  route,
  rowWork,
  shuttle,
  stand,
  walkSpeed,
  type Lane,
  type PoseFn,
  type Route,
  type VillagerClip,
  type VillagerKind,
} from './villager-motion';
import { MILIR_SHAPE_M, craftSpots, forestKilnAnchor, milirPlace } from './workshop-layout';

// Postavy ve vsi (docs/design/villagers.md): kdo kde je a co dělá, jako čistá funkce vsi pro
// scénu – z rozdělení práce posledního dne (herní jádro, labor-report.ts), ne z vlastních
// pravidel. Člověkodny dne se převedou na postavy (jedna na pracujícího, nejvýš MAX_WORKERS)
// a rozestaví se k místům práce: řady na polích, nosiči mezi polem a obydlím, stavitelé kolem
// staveniště, dřevorubci u vyhrazených stromů, lidé v sadu, u hřbitova, výmlat u vsi, ženy
// u obydlí. Navíc starší u domů a děti u stád (nejsou práce vsi). Nikdo nestojí ve vodě,
// v domě nebo jámě ani na hrobech.

/**
 * Postavy jsou stylizovaně o 20 % větší než skutečná výška modelu (žena 1,6 m, muž 1,72 m),
 * jako domácí zvířata – z kamery (50–120 m) by jinak byly moc malé (Martin). Rozestupy mezi
 * lidmi a od domů, stromů a plotů se zvětšují s nimi (`gap`).
 */
export const FIGURE_SCALE = 1.2;

/** Rozestup `m` metrů pro postavu ve skutečné velikosti, zvětšený s postavami. */
function gap(m: number): number {
  return m * FIGURE_SCALE;
}

/** Nejvýš tolik pracujících postav – víc se jich zmenší poměrně. */
export const MAX_WORKERS = 60;
/** Nejvýš tolik starších u domů a kolik starších na jednu postavu. */
export const MAX_ELDERS = 4;
const ELDERS_PER_FIGURE = 2;
/** Kolik lidí pracuje na jednom čtverci pole (řada) a jak často se řady posunou (herní dny). */
const CREW = 4;
const CREW_MOVE_DAYS = 2;
/** Zimní měsíce – venku je méně lidí (domácí práce u ohně, nečinní uvnitř). */
const WINTER_MONTHS: readonly number[] = [12, 1, 2];
/**
 * Kolik z domácí práce a nečinných je vidět venku (zbytek je v obydlí) – domácí výroba se
 * dělá hlavně uvnitř a hlavně v zimě (fields.md – Práce).
 */
const OUTDOORS: Partial<Record<LaborActivity, { summer: number; winter: number }>> = {
  domestic: { summer: 0.5, winter: 0.25 },
  idle: { summer: 1, winter: 0.3 },
};
/** Podíl žen v činnosti (jinak muži) – jen vzhled, jádro pohlaví nezná. */
const WOMEN: Record<LaborActivity, number> = {
  reclaim: 0.2,
  dig: 0.3,
  sow: 0.3,
  weed: 0.7,
  harvest: 0.65,
  carry: 0.5,
  thresh: 0.3,
  plough: 0,
  mow: 0.3,
  slaughter: 0.4,
  milking: 0.9,
  'animal-care': 0.4,
  'orchard-care': 0.3,
  'orchard-harvest': 0.6,
  build: 0.15,
  pen: 0.15,
  fell: 0.05,
  'found-field': 0.2,
  'orchard-plant': 0.3,
  cemetery: 0.2,
  repair: 0.2,
  craft: 0.25,
  plant: 0.4,
  domestic: 0.85,
  idle: 0.5,
};
/**
 * Barvy oděvu (násobek nebarvené látky v atlasu): nebarvená vlna, hnědá (ořech, kůra)
 * a okrová (rýt, mořena) – podíly.
 */
export const CLOTH_COLORS: readonly { color: readonly [number, number, number]; share: number }[] =
  [
    { color: [1.04, 1.02, 1], share: 0.5 },
    { color: [0.64, 0.52, 0.42], share: 0.3 },
    { color: [1.1, 0.88, 0.52], share: 0.2 },
  ];
/** Vdaná žena (šátek) – podíl dospělých žen. */
const MARRIED = 0.7;
/**
 * Práce v řadě: jak dlouho na místě (dvě až tři opakování klipu) a o kolik metrů popojde.
 */
const ROW: Partial<Record<VillagerClip, { workS: number; stepM: number }>> = {
  hoe: { workS: 5.4, stepM: 0.8 },
  reap: { workS: 8.3, stepM: 1 },
  weed: { workS: 6.6, stepM: 1.2 },
  seed: { workS: 4.2, stepM: 1.5 },
};
/** Odstup od okraje čtverce pole (m) a nejkratší řada, na které se ještě pracuje. */
const ROW_MARGIN_M = 1.2;
const MIN_LANE_M = 3;
/** Odstup od domu (m), kam se nevstupuje (k obdélníku domu se šíjí). */
const HOUSE_MARGIN_M = gap(0.3);
/** Odstup dřevorubce od kmene (m) – kmeny stromů ve scéně mají poloměr až ≈ 0,8 m. */
const FELL_REACH_M = 1.3 + gap(0.5);
/** Staveniště před vchodem (m, souřadnice domu) – nářadí a hlína u šíje. */
const SITE_FRONT_M = 5;
/** Krok kontroly trasy (m). */
const ROUTE_STEP_M = 1.5;

export type HairLook = 'natural' | 'grey' | 'linen' | 'madder';

export interface VillagerLook {
  /** Násobek barvy oděvu (RGB). */
  cloth: readonly [number, number, number];
  hair: HairLook;
}

export interface PlannedVillager {
  /** Stálá identita – stejná postava (vzhled, fáze) dokud dělá totéž. */
  key: string;
  kind: VillagerKind;
  scale: number;
  /** Posun fáze animace (0–1) – sousedé se nehýbou naráz. */
  phase: number;
  look: VillagerLook;
  pose: PoseFn;
}

/** Terén pro postavy (bez vsi). */
export interface VillagerGround {
  /** Smí tu stát člověk – ne voda a břeh, strmá skála ani okraj krajiny. */
  walkable(x: number, z: number): boolean;
  /** Poloha stromu z vrstvy překážek, nebo null. */
  tree(id: number): { x: number; z: number } | null;
  /** Stojící dospělé stromy ve čtverci (střed, polovina strany) – nejvýš `max`. */
  treesIn(x: number, z: number, half: number, max: number): { x: number; z: number }[];
}

/**
 * Vyšlapané pěšiny vsi pro postavy (path-network.ts, paths.md): trasa po pěšinách a kam chodí
 * domácnost pro vodu a dřevo. Bez nich se chodí rovnou.
 */
export interface VillagerPaths {
  /**
   * Trasa z `a` do `b` po pěšinách – body [x, z] od `a` do `b` a tempo úseků (po pěšině se jde
   * rychleji – paths.md), nebo null – jde se rovnou.
   */
  route(
    a: { x: number; z: number },
    b: { x: number; z: number },
  ): { points: readonly (readonly [number, number])[]; pace: readonly number[] } | null;
  /** Kam chodí domácnost (id obydlí) pro vodu nebo dřevo – konec její pěšiny, nebo null. */
  errand(dwellingId: number, kind: 'water' | 'wood'): { x: number; z: number } | null;
}

export interface VillagerPlanOptions {
  seed: number;
  /** Kolik stád se pase (pasáčci – jeden na stádo, když jsou děti). */
  herds: number;
  maxWorkers?: number;
  /** Vyšlapané pěšiny – nosiči a ženy pro vodu a dřevo chodí po nich. */
  paths?: VillagerPaths | null;
}

/** Obdélník domu v jeho souřadnicích (x napříč, z k vchodu). */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Stavba, kolem které lidé stojí a kterou obcházejí: obydlí (hotové i staveniště), nebo modla
 * či svatyně (`sacred` – jen staveniště a překážka, nebydlí se v ní).
 */
interface House {
  id: number;
  position: Position;
  built: boolean;
  progress: number;
  inhabited: boolean;
  box: Box;
  /**
   * Obydlí na pozemku: `box` je celý oplocený pozemek (cizí lidé stojí za plotem), `own` dům
   * se šíjí – stavitelé stojí u domu uvnitř pozemku (za hromadou a nářadím staveniště, které
   * leží ≈ 3,5 m od středu – `PLOT_BUILDER_RINGS_M`); `plot` = střed a strana pozemku (plot se
   * staví na konci – stavitelé u plotu).
   */
  own?: Box;
  plot?: { x: number; z: number; size: number };
  /** Řemeslná dílna (crafts.md) – řemeslníci stojí u pece, výhně nebo milíře. */
  craft?: Craft;
}

/** Id překážky „milíř“ v seznamu staveb – kladná id jsou obydlí, malá záporná čekající stavby. */
const MILIR_ID_OFFSET = -1_000_000;
/** Id překážky „milíř v lese“ (crafts.md – Uhlíř) – podle id dílny uhlíře. */
const FOREST_KILN_ID_OFFSET = -2_000_000;
/** Dřevo dávky leží u lesního milíře – kácení do tolika metrů od něj nosí polena k němu. */
const FOREST_KILN_HAUL_M = 120;

interface Point {
  x: number;
  z: number;
}

interface Identity {
  key: string;
  kind: VillagerKind;
  scale: number;
  phase: number;
  seed: number;
}

/** Kontext rozmístění – ves, terén a z nich odvozené překážky. */
interface Context {
  village: SceneVillage;
  ground: VillagerGround;
  seed: number;
  day: number;
  center: Point;
  houses: House[];
  /** Obydlí, kde se bydlí (bez nich staveniště zakladatelů). */
  homes: House[];
  graves: CellSquare[];
  paths: VillagerPaths | null;
}

type Placer = (index: number, who: Identity) => PoseFn | null;

/**
 * Postavy vsi podle rozdělení práce posledního dne (`village.labor`). Bez rozdělení, lidí nebo
 * obydlí nikdo. Pracujících je tolik, kolik je člověkodní (venku – domácí práce a nečinní
 * jen z části), nejvýš `maxWorkers`; navíc starší u domů a pasáčci u stád.
 */
export function planVillagers(
  village: SceneVillage,
  ground: VillagerGround,
  options: VillagerPlanOptions,
): PlannedVillager[] {
  const labor = village.labor;
  if (!labor || village.dwellings.length === 0) return [];
  const ctx = context(village, ground, options.seed, labor.day, options.paths ?? null);
  const counts = shareCounts(labor.shares, labor.month, options.maxWorkers ?? MAX_WORKERS);
  const people: PlannedVillager[] = [];
  labor.shares.forEach((share, s) => {
    const count = counts[s] ?? 0;
    if (count === 0) return;
    const place = placer(ctx, share, count);
    for (let i = 0; i < count; i++) {
      const who = identity(ctx.seed, `${share.activity}:${targetKey(share.target)}:${i}`, {
        women: WOMEN[share.activity],
        child: false,
      });
      // u stavby musí někdo stát, i když zvláštní místo (strom, řada, plot) nevyšlo
      const pose =
        place(i, who) ?? (isConstructionShare(share) ? builderNearby(ctx, share, i, who) : null);
      if (pose) people.push(villager(who, pose, adultHair(who)));
    }
  });
  const winter = WINTER_MONTHS.includes(labor.month);
  people.push(...elders(ctx, elderCount(labor.people.elders, winter)));
  people.push(...herders(ctx, Math.min(options.herds, labor.people.children)));
  return people;
}

/**
 * Kolik postav dostane který podíl práce: postavy se spočítají po činnostech (figureCounts)
 * a v činnosti se rozdělí po skupinách až CREW lidí tam, kde je práce nejvíc (crewSplit) – lidé
 * pracují pohromadě, ne každý na jiném z desítek polí.
 */
export function shareCounts(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays' | 'target' | 'construction'>[],
  month: number,
  max: number = MAX_WORKERS,
): number[] {
  const groups = new Map<LaborActivity, number[]>();
  shares.forEach((share, i) =>
    groups.set(share.activity, [...(groups.get(share.activity) ?? []), i]),
  );
  const activities = [...groups.entries()];
  const totals = figureCounts(
    activities.map(([activity, members]) => ({
      activity,
      manDays: members.reduce((sum, i) => sum + shares[i]!.manDays, 0),
    })),
    month,
    max,
  );
  const counts = shares.map(() => 0);
  activities.forEach(([activity, members], g) => {
    const split = crewSplit(
      members.map((i) => shares[i]!.manDays),
      totals[g] ?? 0,
      // řemeslníci pracují každý ve své dílně – žádné skupiny po čtyřech (crafts.md)
      activity === 'craft' ? 1 : CREW,
    );
    members.forEach((i, k) => (counts[i] = split[k] ?? 0));
  });
  return withBuilderAtEachConstruction(shares, counts, max);
}

/** Práce na stavbě – stavba, kácení jejího dřeva, zakládání pole, výsadba sadu, hřbitov. */
const CONSTRUCTION_ACTIVITIES: ReadonlySet<LaborActivity> = new Set([
  'build',
  'fell',
  'found-field',
  'orchard-plant',
  'cemetery',
  'pen',
]);

function isConstructionShare(share: Pick<LaborShare, 'activity'>): boolean {
  return CONSTRUCTION_ACTIVITIES.has(share.activity);
}

/**
 * Každá stavba, která dnes dostala práci, má aspoň jednoho člověka (Martin: budova nesmí růst
 * sama od sebe) – i když by se jí po zaokrouhlení, skupinách po čtyřech nebo omezení počtu
 * postav nikdo nedostal. Stavba = id stavby z jádra (stavba i kácení jejího dřeva), u starších
 * rozdělení bez id místo práce. Chybějící člověk se přidá k největšímu podílu stavby; přes
 * `max` se ubere z největší skupiny, která tím o všechny lidi nepřijde.
 */
function withBuilderAtEachConstruction(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays' | 'target' | 'construction'>[],
  counts: number[],
  max: number,
): number[] {
  const groups = new Map<string, number[]>();
  shares.forEach((share, i) => {
    if (!isConstructionShare(share) || share.manDays <= 0) return;
    const key =
      share.construction !== undefined
        ? `c${share.construction}`
        : `${share.activity}:${targetKey(share.target)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const groupOf = new Map<number, number[]>();
  for (const members of groups.values()) for (const i of members) groupOf.set(i, members);
  const people = (members: readonly number[]): number =>
    members.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
  for (const members of groups.values()) {
    if (people(members) > 0) continue;
    const biggest = members.reduce((a, b) => (shares[b]!.manDays > shares[a]!.manDays ? b : a));
    counts[biggest] = (counts[biggest] ?? 0) + 1;
    if (counts.reduce((a, b) => a + b, 0) <= max) continue;
    // nad limit: uber člověka tam, kde je jich nejvíc a kde po něm někdo zůstane
    let donor = -1;
    counts.forEach((count, i) => {
      if (count <= 0) return;
      const group = groupOf.get(i);
      if (group && people(group) <= 1) return;
      if (donor < 0 || count > counts[donor]!) donor = i;
    });
    if (donor >= 0) counts[donor] = counts[donor]! - 1;
  }
  return counts;
}

/**
 * Rozdělí `count` lidí mezi místa s prací `weights` po skupinách až `crew` lidí: každá skupina
 * jde tam, kde zbývá nejvíc práce na člověka (při shodě dřívější místo).
 */
export function crewSplit(weights: readonly number[], count: number, crew: number): number[] {
  const out = weights.map(() => 0);
  const total = weights.reduce((a, b) => a + b, 0);
  if (count <= 0 || total <= 0) return out;
  const unit = total / count;
  let left = count;
  while (left > 0) {
    const size = Math.min(crew, left);
    let best = 0;
    let bestNeed = -Infinity;
    weights.forEach((w, i) => {
      const need = w - out[i]! * unit;
      if (need > bestNeed + 1e-9) {
        best = i;
        bestNeed = need;
      }
    });
    out[best] = (out[best] ?? 0) + size;
    left -= size;
  }
  return out;
}

/**
 * Kolik postav dostane která činnost: člověkodny × podíl venku, celkem zaokrouhleně
 * (nejvýš `max`, pak poměrně menší), rozdělené metodou největších zbytků (deterministicky).
 */
export function figureCounts(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays'>[],
  month: number,
  max: number = MAX_WORKERS,
): number[] {
  const winter = WINTER_MONTHS.includes(month);
  const wanted = shares.map((s) => {
    const outdoors = OUTDOORS[s.activity];
    return Math.max(0, s.manDays) * (outdoors ? (winter ? outdoors.winter : outdoors.summer) : 1);
  });
  const sum = wanted.reduce((a, b) => a + b, 0);
  const total = Math.min(max, Math.round(sum));
  if (total <= 0 || sum <= 0) return wanted.map(() => 0);
  const exact = wanted.map((w) => (w * total) / sum);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    left--;
  }
  return counts;
}

/** Starší u domů: na každé dva jedna postava, nejvýš MAX_ELDERS; v zimě polovina venku. */
export function elderCount(elders: number, winter: boolean): number {
  const shown = Math.min(MAX_ELDERS, Math.ceil(Math.max(0, elders) / ELDERS_PER_FIGURE));
  return winter ? Math.floor(shown / 2) : shown;
}

// --- kontext a vzhled ----------------------------------------------------------------------

function context(
  village: SceneVillage,
  ground: VillagerGround,
  seed: number,
  day: number,
  paths: VillagerPaths | null,
): Context {
  const dwellings: House[] = village.dwellings.map((d) => ({
    id: d.id,
    position: d.position,
    built: d.built,
    progress: d.progress,
    inhabited: d.built && d.inhabited !== false,
    box: d.plot ? plotBox(d.position, d.plot) : d.built ? houseBox(d.type) : siteBox(d.type),
    ...(d.plot
      ? { own: houseBox(d.type), plot: { x: d.plot.x, z: d.plot.z, size: d.plot.size } }
      : {}),
    ...(d.craft ? { craft: d.craft } : {}),
  }));
  // milíř uhlíře – lidé ho obcházejí (do kupy se nevstupuje), řemeslníci stojí kolem něj
  const milirs: House[] = village.dwellings.flatMap((d) => {
    if (d.craft !== 'burner') return [];
    const half = MILIR_SHAPE_M.radius;
    return [
      {
        id: MILIR_ID_OFFSET - d.id,
        position: milirPlace(d.position),
        built: true,
        progress: 1,
        inhabited: false,
        box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
      },
    ];
  });
  // milíře uhlířů v lese – stejně jako milíř u dílny (crafts.md – Uhlíř)
  const forestKilns: House[] = (village.kilns ?? []).map((k) => {
    const half = MILIR_SHAPE_M.radius;
    return {
      id: FOREST_KILN_ID_OFFSET - k.id,
      position: { x: k.x, z: k.z, rotation: 0 },
      built: true,
      progress: 1,
      inhabited: false,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    };
  });
  // modla a svatyně: stavitelé stojí kolem půdorysu, hotové lidé obcházejí (happiness.md)
  const sacred: House[] = (village.sacred?.buildings ?? []).map((b) => {
    const half = SACRED_BUILDINGS[b.kind].footprintM / 2;
    return {
      id: b.id,
      position: b.position,
      built: b.built,
      progress: b.progress,
      inhabited: false,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    };
  });
  // ohrady (oxen.md): oplocený čtverec – lidé stojí za plotem, dovnitř nechodí
  const pens: House[] = (village.pens ?? []).map((pen) => {
    const half = pen.size / 2;
    return {
      id: pen.id,
      position: { x: pen.x, z: pen.z, rotation: 0 },
      built: pen.built,
      progress: pen.progress,
      inhabited: false,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    };
  });
  const houses = [...dwellings, ...milirs, ...forestKilns, ...sacred, ...pens];
  const homes = dwellings.filter((h) => h.inhabited);
  const settled = homes.length > 0 ? homes : dwellings.length > 0 ? dwellings : houses;
  const center = {
    x: settled.reduce((s, h) => s + h.position.x, 0) / settled.length,
    z: settled.reduce((s, h) => s + h.position.z, 0) / settled.length,
  };
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  return { village, ground, seed, day, center, houses, homes: settled, graves, paths };
}

/**
 * Staveniště zabere i s hromadou hlíny, drnem, dřevem a nářadím kolem jámy celou vyklízenou
 * plochu (village-construction.ts) – stavitelé stojí za ní.
 */
export function siteBox(type: DwellingType): Box {
  const clearance = DWELLING_CLEARING_M[type];
  return {
    minX: clearance.minX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(chickenBox(type).maxZ, SITE_FRONT_M),
  };
}

/** Hotové volné obydlí: dům se střechou a šíjí (jako pro slepice – `chickenBox`). */
export function houseBox(type: DwellingType): Box {
  const house = chickenBox(type);
  return { minX: -house.halfX, maxX: house.halfX, minZ: house.minZ, maxZ: house.maxZ };
}

/**
 * Obydlí na pozemku (hotové i staveniště): celé oplocené políčko v osách modelu domu – lidé
 * stojí za plotem (před brankou), dovnitř cizích pozemků nechodí.
 */
export function plotBox(position: Position, plot: { x: number; z: number; size: number }): Box {
  const h = plot.size / 2;
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  // rohy políčka do os modelu (inverze localToWorld)
  const local = [
    [plot.x - h, plot.z - h],
    [plot.x + h, plot.z - h],
    [plot.x + h, plot.z + h],
    [plot.x - h, plot.z + h],
  ].map(([x, z]) => {
    const dx = x! - position.x;
    const dz = z! - position.z;
    return [dx * c - dz * s, dx * s + dz * c] as const;
  });
  return {
    minX: Math.min(...local.map((p) => p[0])),
    maxX: Math.max(...local.map((p) => p[0])),
    minZ: Math.min(...local.map((p) => p[1])),
    maxZ: Math.max(...local.map((p) => p[1])),
  };
}

/** Bod v obdélníku domu (se šíjí) rozšířeném o `margin`. */
function inBox(h: House, x: number, z: number, margin: number): boolean {
  const c = Math.cos(h.position.rotation);
  const s = Math.sin(h.position.rotation);
  const dx = x - h.position.x;
  const dz = z - h.position.z;
  // inverze localToWorld (x napříč, z k vchodu)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    lx > h.box.minX - margin &&
    lx < h.box.maxX + margin &&
    lz > h.box.minZ - margin &&
    lz < h.box.maxZ + margin
  );
}

function onGrave(graves: readonly Square[], x: number, z: number): boolean {
  return graves.some(
    (g) => Math.abs(x - g.x) < g.size / 2 - 0.2 && Math.abs(z - g.z) < g.size / 2 - 0.2,
  );
}

/** Smí tu postava stát: suchá schůdná zem mimo domy a hroby. */
function free(ctx: Context, x: number, z: number): boolean {
  return (
    ctx.ground.walkable(x, z) &&
    !onGrave(ctx.graves, x, z) &&
    !ctx.houses.some((h) => inBox(h, x, z, HOUSE_MARGIN_M))
  );
}

/** Volné místo co nejblíž bodu (spirála do `reach` m), nebo null. */
function nearestFree(ctx: Context, x: number, z: number, reach: number): Point | null {
  if (free(ctx, x, z)) return { x, z };
  for (let r = 0.6; r <= reach; r += 0.6) {
    const steps = Math.max(6, Math.round((2 * Math.PI * r) / 0.8));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (free(ctx, px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

function identity(seed: number, key: string, options: { women: number; child: boolean }): Identity {
  const s = (seed * 31 + stringHash(key)) | 0;
  const kind: VillagerKind = hash01(s, 1, 91) < options.women ? 'woman' : 'man';
  const r = hash01(s, 2, 91);
  const scale = options.child
    ? 0.62 + r * 0.12
    : kind === 'woman'
      ? 0.96 + r * 0.07
      : 0.95 + r * 0.1;
  return { key, kind, scale: scale * FIGURE_SCALE, phase: hash01(s, 3, 91), seed: s };
}

function clothOf(seed: number): VillagerLook['cloth'] {
  let pick = hash01(seed, 4, 91);
  const shade = 0.95 + hash01(seed, 5, 91) * 0.1;
  for (const { color, share } of CLOTH_COLORS) {
    pick -= share;
    if (pick < 0) return [color[0] * shade, color[1] * shade, color[2] * shade];
  }
  const last = CLOTH_COLORS[0]!.color;
  return [last[0] * shade, last[1] * shade, last[2] * shade];
}

/** Vdané ženy nosí šátek – většinou lněný, některé barvený mořenou. */
function adultHair(who: Identity): HairLook {
  if (who.kind !== 'woman' || hash01(who.seed, 6, 91) >= MARRIED) return 'natural';
  return hash01(who.seed, 7, 91) < 0.75 ? 'linen' : 'madder';
}

function villager(who: Identity, pose: PoseFn, hair: HairLook): PlannedVillager {
  return {
    key: who.key,
    kind: who.kind,
    scale: who.scale,
    phase: who.phase,
    look: { cloth: clothOf(who.seed), hair },
    pose,
  };
}

function targetKey(target: LaborTarget): string {
  if (target.kind === 'village') return 'village';
  if (target.kind === 'trees') return `trees-${target.ids[0] ?? 0}`;
  if (target.kind === 'meadow') {
    const first = target.cells[0];
    return first ? `meadow-${first.x}-${first.y}` : 'meadow';
  }
  return `${target.kind}-${target.id}`;
}

function stringHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

function unit(x: number, z: number): Point {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? { x: x / l, z: z / l } : { x: 0, z: 1 };
}

function worldPoint(position: Position, lx: number, lz: number): Point {
  const [x, z] = localToWorld(position, lx, lz);
  return { x, z };
}

/** Před vchodem domu (na konci šíje), `side` napříč (m). */
function doorPoint(h: House, side = 0): Point {
  return worldPoint(h.position, side, h.box.maxZ + gap(0.6));
}

function nearestHouse(list: readonly House[], p: Point): House | null {
  let best: House | null = null;
  let bestD = Infinity;
  for (const h of list) {
    const d = Math.hypot(h.position.x - p.x, h.position.z - p.z);
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

// --- podle činnosti ------------------------------------------------------------------------

function placer(ctx: Context, share: SceneLaborShare, count: number): Placer {
  const t = share.target;
  switch (share.activity) {
    case 'dig':
    case 'reclaim':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'hoe') : none;
    case 'sow':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'seed') : none;
    case 'weed':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'weed') : none;
    case 'harvest':
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'reap') : none;
    case 'carry':
      return t.kind === 'field' ? carriers(ctx, share, t.id) : none;
    case 'found-field':
      return t.kind === 'field' ? founding(ctx, share, t.id, count) : none;
    case 'thresh':
      return threshing(ctx, count);
    case 'plough':
      // oráč a honáček jsou součástí spřežení (plough-team-renderer.ts)
      return none;
    case 'mow':
      if (t.kind === 'meadow') return meadowRows(ctx, t.cells, count);
      return t.kind === 'field' ? fieldRows(ctx, share, t.id, count, 'reap') : none;
    case 'milking':
      // dojení u domů – ženy u dojných zvířat vedle obydlí (diet.md)
      return milkers(ctx);
    case 'animal-care':
      // v zimě u ohrady (krmení, voda, kydání), jinak u domů (prasata, slepice)
      return t.kind === 'pen' ? penFence(ctx, t.id) : domestic(ctx);
    case 'slaughter':
      // porážka a uzení u vsi (diet.md) – na udusané zemi kousek od domů jako výmlat
      return threshing(ctx, count);
    case 'pen':
      return t.kind === 'pen' ? penFence(ctx, t.id) : none;
    case 'orchard-harvest':
    case 'orchard-care':
      return t.kind === 'orchard' ? orchardTrees(ctx, t.id, count) : none;
    case 'orchard-plant':
      return t.kind === 'orchard' ? orchardPlanting(ctx, t.id, count) : none;
    case 'cemetery':
      return t.kind === 'cemetery' ? cemeteryFence(ctx, t.id) : none;
    case 'fell':
      if (t.kind === 'trees') return felling(ctx, t.ids, share.construction !== undefined);
      if (t.kind === 'pen') return penFence(ctx, t.id);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'build':
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'repair':
      return t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'craft':
      if (t.kind === 'kiln') return kilnWorkers(ctx, t);
      return t.kind === 'dwelling' ? craftsmen(ctx, t.id) : none;
    case 'plant':
      // uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa)
      return t.kind === 'trees' ? planting(ctx, t.ids) : none;
    case 'domestic':
      return domestic(ctx);
    case 'idle':
      return idlers(ctx);
  }
}

const none: Placer = () => null;

/**
 * Náhradní místo pro člověka u stavby, když zvláštní rozmístění nevyšlo (strom mimo schůdnou
 * zem, čtverec bez volné řady, staveniště bez volného místa po obvodu): volné místo co nejblíž
 * místu práce – u stromu, na kraji zakládaného čtverce, u staveniště –, čelem k němu.
 */
function builderNearby(
  ctx: Context,
  share: SceneLaborShare,
  index: number,
  who: Identity,
): PoseFn | null {
  for (const { at, clip } of constructionAnchors(ctx, share)) {
    // lidé kolem místa po zlatém úhlu – nestojí na sobě
    const angle = index * 2.39996 + who.phase;
    const spot = nearestFree(ctx, at.x + Math.cos(angle) * 1.5, at.z + Math.sin(angle) * 1.5, 14);
    if (!spot) continue;
    const h = unit(at.x - spot.x, at.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, clip);
  }
  return null;
}

/** Místa, kde se na stavbě pracuje, od nejpřesnějšího (strom, díl, staveniště). */
function constructionAnchors(
  ctx: Context,
  share: SceneLaborShare,
): { at: Point; clip: VillagerClip }[] {
  const t = share.target;
  const anchors: { at: Point; clip: VillagerClip }[] = [];
  const houseAt = (id: number): void => {
    const house = ctx.houses.find((h) => h.id === id);
    if (house) anchors.push({ at: house.position, clip: 'build' });
  };
  if (t.kind === 'trees') {
    for (const id of t.ids) {
      const tree = ctx.ground.tree(id);
      if (tree) anchors.push({ at: tree, clip: 'fell' });
    }
  } else if (t.kind === 'site' || t.kind === 'dwelling') {
    houseAt(t.id);
  } else if (t.kind === 'field') {
    const parts = ctx.village.fields.find((f) => f.id === t.id)?.parts ?? [];
    const founding = parts.filter((p) => p.stage === 'founding');
    for (const p of (founding.length > 0 ? founding : parts).slice(0, 3)) {
      anchors.push({ at: p, clip: 'hoe' });
    }
  } else if (t.kind === 'orchard') {
    const squares = (ctx.village.orchards ?? []).find((o) => o.id === t.id)?.squares ?? [];
    const planting = squares.filter((s) => s.planting < 1);
    for (const sq of (planting.length > 0 ? planting : squares).slice(0, 3)) {
      anchors.push({ at: sq, clip: 'hoe' });
    }
  } else if (t.kind === 'cemetery') {
    const squares = (ctx.village.cemeteries ?? []).find((c) => c.id === t.id)?.squares ?? [];
    const pending = squares.filter((s) => s.pending);
    for (const sq of (pending.length > 0 ? pending : squares).slice(0, 3)) {
      anchors.push({ at: sq, clip: 'build' });
    }
  } else if (t.kind === 'pen') {
    const pen = (ctx.village.pens ?? []).find((p) => p.id === t.id);
    if (pen) anchors.push({ at: pen, clip: 'build' });
  }
  // dřevo pro stavbu: když u stromů místo není, aspoň u stavby, pro kterou se kácí
  if (share.construction !== undefined) houseAt(share.construction);
  return anchors;
}

interface Square {
  x: number;
  z: number;
  size: number;
}

/** Pole s díly ve vzhledu, jak je kreslí scéna (field-look.ts), směrem řádků a práce. */
interface FieldWork {
  views: PartView[];
  rows: [number, number];
  center: { x: number; z: number };
}

function fieldWork(ctx: Context, fieldId: number): FieldWork | null {
  const field = ctx.village.fields.find((f) => f.id === fieldId);
  if (!field || field.parts.length === 0) return null;
  const dayOfYear = dateOfDayIndex(ctx.day).dayOfYear;
  return {
    views: fieldPartViews(field, { dayOfYear, village: ctx.village }),
    rows: rowDirection(field.parts),
    center: villageCenter(ctx.village, field.parts),
  };
}

/**
 * Díly, na kterých se dnes pracuje (Martin: panáček přijde přesně na čtverec, který se zrovna
 * dělá): z fronty práce od herního jádra (`share.parts`), jinak rozpracovaný díl a za ním díly,
 * na které práce přijde (field-look.ts – `workedParts`). Pletí se střídá po dnech.
 */
function workedSquares(ctx: Context, share: SceneLaborShare, work: FieldWork): PartView[] {
  const worked = workedParts(work.views, share.activity, share.parts);
  if (share.activity !== 'weed' || worked.length === 0) return worked;
  const fieldId = share.target.kind === 'field' ? share.target.id : 0;
  const start =
    Math.floor(ctx.day / CREW_MOVE_DAYS) +
    Math.floor(hash01(fieldId, ctx.seed, 92) * worked.length);
  return worked.map((_, i) => worked[(start + i) % worked.length]!);
}

/**
 * Seč přirozené louky (oxen.md – Seno): řady sekáčů na políčkách louky, přes která dnes seč
 * postoupila (`cells` od jádra) – jako řady na poli, vzhled a rozpracovanost z
 * `SceneVillage.hayMeadows`. Řádky sena vedou podél x, seče se od strany blíž vsi.
 */
function meadowRows(ctx: Context, cells: readonly TileCell[], count: number): Placer {
  const meadows = ctx.village.hayMeadows ?? [];
  const views: PartView[] = cells.flatMap((cell, order) => {
    const m = meadows.find((h) => h.cell.x === cell.x && h.cell.y === cell.y);
    if (!m) return [];
    const part: SceneFieldPart = {
      cell: { x: m.cell.x, y: m.cell.y },
      x: m.x,
      z: m.z,
      size: m.size,
      stage: 'meadow',
      look: m.look,
    };
    const work = m.work !== undefined && m.work < 1 ? m.work : null;
    return [
      {
        part,
        look: m.look,
        work,
        before: work !== null ? (m.before ?? null) : null,
        staked: false,
        order,
      },
    ];
  });
  if (views.length === 0) return none;
  const work: FieldWork = { views, rows: [1, 0], center: villageCenter(ctx.village) };
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const view = views[crew % views.length]!;
    return frontierRow(ctx, work, view, member, size, 'reap', who, false);
  };
}

/**
 * Dojení (diet.md – Práce se zvířaty): ženy u bočních stěn obydlí, sehnuté k dojnému zvířeti
 * (klip pletí – dojení animace nemá), po domech dokola.
 */
function milkers(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i) => {
    const home = homes[i % homes.length];
    if (!home) return null;
    const turn = Math.floor(i / homes.length);
    const side = turn % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + gap(1.8) : home.box.minX - gap(1.8);
    const p = worldPoint(home.position, edge, home.box.minZ * 0.2 - turn * gap(0.8));
    const spot = nearestFree(ctx, p.x, p.z, 2);
    if (!spot) return null;
    const toward = unit(home.position.x - spot.x, home.position.z - spot.z);
    return stand(spot.x, spot.z, -toward.z * side, toward.x * side, 'weed');
  };
}

/**
 * Řady na čtvercích pole – po CREW lidech na čtverec z fronty práce, `clip` podle práce. Na
 * rozpracovaném čtverci stojí řada na čáře práce (kus do nehotové části) a jde podél řádků.
 */
function fieldRows(
  ctx: Context,
  share: SceneLaborShare,
  fieldId: number,
  count: number,
  clip: VillagerClip,
): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  const squares = workedSquares(ctx, share, work);
  if (squares.length === 0) return none;
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const view = squares[crew % squares.length]!;
    return frontierRow(ctx, work, view, member, size, clip, who, share.activity === 'weed');
  };
}

/** Rozestup lidí v řadě napříč řádky na čáře práce (m). */
const FRONT_GAP_M = gap(0.9);

/**
 * Člověk `member` z `size` na čtverci: řada vede podél řádků pole. Na rozpracovaném čtverci
 * stojí lidé vedle sebe hned za čarou práce (v nehotové části), na čtverci, kam práce teprve
 * přijde, u jeho začátku (strana blíž vsi); při pletí rozestoupení přes celý čtverec.
 */
function frontierRow(
  ctx: Context,
  work: FieldWork,
  view: PartView,
  member: number,
  size: number,
  clip: VillagerClip,
  who: Identity,
  spread: boolean,
): PoseFn | null {
  const square = view.part;
  const frame = workFrame(square, work.rows, work.center);
  const half = square.size / 2 - ROW_MARGIN_M;
  const line = view.work !== null ? workSteps(view.work) : 0;
  let v: number;
  if (spread) {
    v = -half + ((member + 0.5) * 2 * half) / size + (who.phase - 0.5) * 0.6;
  } else {
    const start = -square.size / 2 + line * square.size;
    v = Math.min(half, Math.max(-half, start + (member + 0.5) * FRONT_GAP_M));
  }
  const lane = laneAlongRows(ctx, square, frame, v, half);
  if (!lane) return null;
  const row = ROW[clip] ?? { workS: 5, stepM: 1 };
  return rowWork(
    lane,
    clip,
    row.workS,
    row.stepM,
    walkSpeed(who.kind, 'walk', who.scale),
    who.phase,
  );
}

/** Řada podél řádků pole ve vzdálenosti `v` napříč (souřadnice práce) – nejdelší volný úsek. */
function laneAlongRows(
  ctx: Context,
  square: Square,
  frame: WorkFrame,
  v: number,
  half: number,
): Lane | null {
  const alongX = Math.abs(frame.along[0]) > 0.5;
  // freeLane počítá napříč v ose z (řádky podél x), nebo v ose x (řádky podél z)
  const offset = alongX ? v * frame.across[1] : v * frame.across[0];
  return freeLane(ctx, square, alongX, 1, offset, half);
}

function crewRows(
  ctx: Context,
  squares: readonly Square[],
  count: number,
  clipOf: (index: number) => VillagerClip,
): Placer {
  if (squares.length === 0) return none;
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const square = squares[crew % squares.length]!;
    return rowOn(ctx, square, member, size, clipOf(i), who);
  };
}

/** Člověk `member` z `size` v řadě na čtverci – řada vede od vsi pryč, lidé vedle sebe. */
function rowOn(
  ctx: Context,
  square: Square,
  member: number,
  size: number,
  clip: VillagerClip,
  who: Identity,
): PoseFn | null {
  const row = ROW[clip] ?? { workS: 5, stepM: 1 };
  const dx = square.x - ctx.center.x;
  const dz = square.z - ctx.center.z;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const sign = (alongX ? dx : dz) >= 0 ? 1 : -1;
  const half = square.size / 2 - ROW_MARGIN_M;
  const across = -half + ((member + 0.5) * 2 * half) / size + (who.phase - 0.5) * 0.6;
  const lane = freeLane(ctx, square, alongX, sign, across, half);
  if (!lane) return null;
  return rowWork(
    lane,
    clip,
    row.workS,
    row.stepM,
    walkSpeed(who.kind, 'walk', who.scale),
    who.phase,
  );
}

/** Řada napříč čtvercem v ose x nebo z – zkrácená na nejdelší volný úsek (voda, dům). */
function freeLane(
  ctx: Context,
  square: Square,
  alongX: boolean,
  sign: number,
  across: number,
  half: number,
): Lane | null {
  const at = (u: number): Point =>
    alongX
      ? { x: square.x + sign * u, z: square.z + across }
      : { x: square.x + across, z: square.z + sign * u };
  const steps = Math.max(1, Math.round((2 * half) / 1));
  let best: [number, number] | null = null;
  let start: number | null = null;
  for (let k = 0; k <= steps + 1; k++) {
    const u = -half + (k * 2 * half) / steps;
    const p = at(u);
    const ok = k <= steps && free(ctx, p.x, p.z);
    if (ok && start === null) start = u;
    if (!ok && start !== null) {
      const end = -half + ((k - 1) * 2 * half) / steps;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = null;
    }
  }
  if (!best || best[1] - best[0] < MIN_LANE_M) return null;
  const a = at(best[0]);
  const b = at(best[1]);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
}

/**
 * Nosiči úrody: od obydlí nejblíž čtverci, kde stojí panáky (sklizená část fronty žně), a se
 * snopy v nůši zpět. Když trasa nevede po suchu, žne nosič taky.
 */
function carriers(ctx: Context, share: SceneLaborShare, fieldId: number): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  const squares = workedSquares(ctx, share, work);
  if (squares.length === 0) return none;
  return (i, who) => {
    const view = squares[Math.floor(i / 2) % squares.length]!;
    const square = view.part;
    const home = nearestHouse(ctx.homes, square);
    const fallback = (): PoseFn | null =>
      frontierRow(ctx, work, view, i % CREW, CREW, 'reap', who, false);
    if (!home) return fallback();
    const door = doorPoint(home, (who.phase - 0.5) * 1.6);
    const half = square.size / 2 - ROW_MARGIN_M;
    const edge = {
      x: Math.min(square.x + half, Math.max(square.x - half, door.x)),
      z: Math.min(square.z + half, Math.max(square.z - half, door.z)),
    };
    const path = walkRoute(ctx, door, edge);
    if (!path) return fallback();
    return shuttle(path, {
      outClip: 'walk',
      outSpeed: walkSpeed(who.kind, 'walk', who.scale),
      endClip: 'weed',
      endS: 3.5,
      backClip: 'carry',
      backSpeed: walkSpeed(who.kind, 'carry', who.scale),
      restClip: 'idle',
      restS: 2.5,
      phase: who.phase,
    });
  };
}

/**
 * Zakládání pole: na rozpracovaném čtverci (pak na dalších z fronty – od obydlí) se kácejí
 * stromy (sekera u kmene), zbytek rozrývá drn motykou na čáře práce.
 */
function founding(ctx: Context, share: SceneLaborShare, fieldId: number, count: number): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  const squares = workedSquares(ctx, share, work);
  if (squares.length === 0) return none;
  const trees = squares.map((s) => ctx.ground.treesIn(s.part.x, s.part.z, s.part.size / 2, CREW));
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const k = crew % squares.length;
    const view = squares[k]!;
    const standing = trees[k] ?? [];
    if (standing.length > 0 && member % 2 === 0) {
      const tree = standing[(member / 2) % standing.length]!;
      return atTree(ctx, tree, who, 'fell', FELL_REACH_M);
    }
    const size = Math.min(CREW, count - crew * CREW);
    return frontierRow(ctx, work, view, member, size, 'hoe', who, false);
  };
}

/** Postava u kmene stromu (`reach` m od něj) čelem ke kmeni. */
function atTree(
  ctx: Context,
  tree: Point,
  who: Identity,
  clip: VillagerClip,
  reach: number,
): PoseFn | null {
  const base = who.phase * Math.PI * 2;
  for (let k = 0; k < 8; k++) {
    const a = base + (k * Math.PI) / 4;
    const x = tree.x + Math.cos(a) * reach;
    const z = tree.z + Math.sin(a) * reach;
    if (!free(ctx, x, z)) continue;
    const h = unit(tree.x - x, tree.z - z);
    return stand(x, z, h.x, h.z, clip);
  }
  return null;
}

/**
 * Kácení dřeva stavby: dva lidé u každého vyhrazeného stromu, ostatní nosí dřevo ke stavbě
 * (nejbližší staveniště, jinak obydlí). Kácení řemeslné dílny (`forConstruction` false – uhlíř
 * na milíř, hrnčíř na palivo pece, crafts.md) nosí dřevo k nejbližší dílně, která kácí.
 */
function felling(ctx: Context, ids: readonly number[], forConstruction = true): Placer {
  const trees = ids.flatMap((id) => {
    const p = ctx.ground.tree(id);
    return p ? [p] : [];
  });
  if (trees.length === 0) return none;
  const sites = forConstruction
    ? ctx.houses.filter((h) => !h.built)
    : ctx.houses.filter((h) => h.built && (h.craft === 'burner' || h.craft === 'potter'));
  // uhlíř v lese nosí polena k lesnímu milíři u dávky (crafts.md – Uhlíř)
  const kilns = forConstruction ? [] : (ctx.village.kilns ?? []);
  return (i, who) => {
    const tree = trees[i % trees.length]!;
    if (i < trees.length * 2) {
      const slot = { ...who, phase: (who.phase + (i >= trees.length ? 0.5 : 0)) % 1 };
      return atTree(ctx, tree, slot, 'fell', FELL_REACH_M);
    }
    const kiln = nearestPoint(kilns, tree, FOREST_KILN_HAUL_M);
    const target = kiln ? null : nearestHouse(sites.length > 0 ? sites : ctx.houses, tree);
    const from = target || kiln ? nearestFree(ctx, tree.x + 1.5, tree.z, 3) : null;
    const to = kiln
      ? nearestFree(ctx, kiln.x + MILIR_SHAPE_M.radius + 1, kiln.z, 3)
      : target
        ? doorPoint(target, -1.5)
        : null;
    if (!to || !from) return atTree(ctx, tree, who, 'fell', FELL_REACH_M + 0.6);
    const path = walkRoute(ctx, to, from);
    if (!path) return atTree(ctx, tree, who, 'fell', FELL_REACH_M + 0.6);
    return shuttle(path, {
      outClip: 'walk',
      outSpeed: walkSpeed(who.kind, 'walk', who.scale),
      endClip: 'weed',
      endS: 3,
      backClip: 'carry-wood',
      backSpeed: walkSpeed(who.kind, 'carry-wood', who.scale),
      restClip: 'idle',
      restS: 2,
      phase: who.phase,
    });
  };
}

/** Nejbližší z bodů do `reach` m od `p`, jinak null. */
function nearestPoint<T extends Point>(list: readonly T[], p: Point, reach: number): T | null {
  let best: T | null = null;
  let bestD = reach;
  for (const q of list) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d <= bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

/**
 * Uhlíř u milíře v lese (crafts.md – Uhlíř): staví, hlídá a vytahuje uhlí – místa kolem kupy
 * jako u milíře u dílny (`craftSpots` s `forestKilnAnchor`).
 */
function kilnWorkers(ctx: Context, kiln: { x: number; z: number }): Placer {
  const spots = craftSpots('burner', forestKilnAnchor(kiln));
  return (i) => {
    const spot = spots[i % spots.length]!;
    if (free(ctx, spot.x, spot.z)) return stand(spot.x, spot.z, spot.hx, spot.hz, spot.clip);
    const near = nearestFree(ctx, spot.x, spot.z, 4);
    return near ? stand(near.x, near.z, spot.hx, spot.hz, spot.clip) : null;
  };
}

/** Sázení mladých buků: u každého pařezu jeden člověk s motykou (crafts.md – Uhlíř). */
function planting(ctx: Context, ids: readonly number[]): Placer {
  const stumps = ids.flatMap((id) => {
    const p = ctx.ground.tree(id);
    return p ? [p] : [];
  });
  if (stumps.length === 0) return none;
  return (i, who) => atTree(ctx, stumps[i % stumps.length]!, who, 'hoe', FELL_REACH_M);
}

/**
 * Řemeslníci v dílně (crafts.md): hrnčíř u kruhu a pece, kovář u kovadliny a měchů, uhlíř kolem
 * milíře s hrabicí – místa z workshop-layout.ts, postavy se po nich střídají; místo, kde
 * nejde stát (voda, jiný dům), nahradí nejbližší volné.
 */
function craftsmen(ctx: Context, dwellingId: number): Placer {
  const house = ctx.houses.find((h) => h.id === dwellingId && h.built && h.craft);
  if (!house?.craft) return none;
  const spots = craftSpots(house.craft, house.position);
  // pod přístřeškem dílny smí stát její řemeslníci (dům bez přístřešku je v `box`)
  const ok = (x: number, z: number): boolean =>
    ctx.ground.walkable(x, z) &&
    !ctx.houses.some(
      (h) => h !== house && h.id !== MILIR_ID_OFFSET - house.id && inBox(h, x, z, 0),
    );
  return (i) => {
    const spot = spots[i % spots.length]!;
    const ring = Math.floor(i / spots.length);
    const x = spot.x - spot.hx * ring * gap(0.8);
    const z = spot.z - spot.hz * ring * gap(0.8);
    if (ok(x, z)) return stand(x, z, spot.hx, spot.hz, spot.clip);
    const near = nearestFree(ctx, x, z, 4);
    return near ? stand(near.x, near.z, spot.hx, spot.hz, spot.clip) : null;
  };
}

/**
 * Stavba a opravy: lidé kolem domu (vně jámy a šíje) čelem k němu. Staveniště v první
 * čtvrtině průběhu se kope motykou (jáma), pak se staví.
 */
function building(
  ctx: Context,
  target: Extract<LaborTarget, { kind: 'site' | 'dwelling' }>,
  clip: VillagerClip,
): Placer {
  const house = ctx.houses.find(
    (h) => h.id === target.id && h.built === (target.kind === 'dwelling'),
  );
  if (!house) return none;
  const digging = !house.built && house.progress < 0.25;
  // polozemnice na pozemku staví plot a záhony až na konci (village-construction.ts)
  const fencing = !house.built && house.plot !== undefined && house.progress >= PLOT_FENCE_FROM;
  if (fencing && house.plot) return plotFence(ctx, house, house.plot);
  if (house.plot) {
    const ring = plotBuilderSpots(ctx, house, house.plot);
    if (ring.length > 0) {
      return (i) => {
        const spot = ring[i % ring.length]!;
        const h = unit(house.position.x - spot.x, house.position.z - spot.z);
        return stand(spot.x, spot.z, h.x, h.z, digging ? 'hoe' : clip);
      };
    }
  }
  const { minX, maxX, minZ, maxZ } = house.own ?? house.box;
  // místa po obvodu (souřadnice domu) – ne před vchodem do šíje
  const slots: [number, number][] = [
    [minX - gap(0.6), 0],
    [maxX + gap(0.6), 0],
    [0, minZ - gap(0.6)],
    [minX - gap(0.6), minZ + 0.8],
    [maxX + gap(0.6), minZ + 0.8],
    [minX - gap(0.6), maxZ - 1.2],
    [maxX + gap(0.6), maxZ - 1.2],
    [minX * 0.6, minZ - gap(0.6)],
    [maxX * 0.6, minZ - gap(0.6)],
  ];
  return (i) => {
    const ring = Math.floor(i / slots.length);
    const [lx, lz] = slots[i % slots.length]!;
    // další kruh o kus dál od domu (do stran a dozadu)
    const p = worldPoint(
      house.position,
      lx + Math.sign(lx) * ring * 1.2,
      lz + (lz < 0 ? -ring * 1.2 : 0),
    );
    const spot = nearestFreeFor(ctx, house, p.x, p.z, 1.5);
    if (!spot) return null;
    const h = unit(house.position.x - spot.x, house.position.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, digging ? 'hoe' : clip);
  };
}

/**
 * Stavitelé domu na pozemku: kruhy kolem domu za rekvizitami staveniště (hromada hlíny, drn,
 * dřevo a nářadí leží ≈ 3,5 m od středu – village-construction.ts), jen uvnitř vlastního
 * pozemku a na volné zemi; místa střídavě kolem dokola, ať nestojí vedle sebe.
 */
const PLOT_BUILDER_RINGS_M = [5, 6.2];

function plotBuilderSpots(
  ctx: Context,
  house: House,
  plot: { x: number; z: number; size: number },
): Point[] {
  const inside = plot.size / 2 - gap(0.6);
  const spots: Point[] = [];
  for (const r of PLOT_BUILDER_RINGS_M) {
    for (let k = 0; k < 12; k++) {
      // 0, 6, 3, 9, … – sousední stavitelé na opačných stranách domu
      const order = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11][k]!;
      const a = (order / 12) * Math.PI * 2 + house.position.rotation;
      const x = house.position.x + Math.sin(a) * r;
      const z = house.position.z + Math.cos(a) * r;
      if (Math.abs(x - plot.x) > inside || Math.abs(z - plot.z) > inside) continue;
      if (nearestFreeFor(ctx, house, x, z, 0) === null) continue;
      spots.push({ x, z });
    }
  }
  return spots;
}

/** Odkdy staví polozemnice na pozemku plot (fáze `fence` – village-construction.ts). */
const PLOT_FENCE_FROM = 0.85;

/** Strany pozemku – normály do plotu (x, z). */
const PLOT_SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Plot pozemku: stavitelé uvnitř pozemku podél plotu čelem k němu (kůly, proplétání). */
function plotFence(
  ctx: Context,
  house: House,
  plot: { x: number; z: number; size: number },
): Placer {
  const inset = plot.size / 2 - gap(0.8);
  return (i, who) => {
    const side = (i + Math.floor(who.phase * 4)) % 4;
    const along = (((i * 0.37 + who.phase) % 1) * 2 - 1) * inset * 0.8;

    const [nx, nz] = PLOT_SIDES[side] ?? [1, 0];
    const x = plot.x + nx * inset - nz * along;
    const z = plot.z + nz * inset + nx * along;
    const spot = nearestFreeFor(ctx, house, x, z, 2);
    return spot ? stand(spot.x, spot.z, nx, nz, i % 2 === 0 ? 'build' : 'weed') : null;
  };
}

/**
 * Volné místo pro stavitele vlastního domu (`nearestFree`): na pozemku smí stát uvnitř svého
 * plotu – jen ne v domě nebo na jeho staveništi (`own`).
 */
function nearestFreeFor(
  ctx: Context,
  house: House,
  x: number,
  z: number,
  reach: number,
): Point | null {
  if (!house.own) return nearestFree(ctx, x, z, reach);
  const ok = (px: number, pz: number): boolean =>
    ctx.ground.walkable(px, pz) &&
    !onGrave(ctx.graves, px, pz) &&
    !inBox({ ...house, box: house.own! }, px, pz, HOUSE_MARGIN_M) &&
    !ctx.houses.some((h) => h !== house && inBox(h, px, pz, HOUSE_MARGIN_M));
  if (ok(x, z)) return { x, z };
  for (let r = 0.6; r <= reach; r += 0.6) {
    const steps = Math.max(6, Math.round((2 * Math.PI * r) / 0.8));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Výmlat u vsi: mlatci v kruhu na volném místě kousek od domů (cep zatím paličkou). */
function threshing(ctx: Context, count: number): Placer {
  const floors: Point[] = [];
  const perFloor = 6;
  const wanted = Math.ceil(count / perFloor);
  for (let r = 8; r <= 26 && floors.length < wanted; r += 3) {
    for (let k = 0; k < 12 && floors.length < wanted; k++) {
      const a = (k / 12) * Math.PI * 2 + hash01(ctx.seed, r, 93);
      const p = { x: ctx.center.x + Math.cos(a) * r, z: ctx.center.z + Math.sin(a) * r };
      if (openGround(ctx, p, 2.4) && floors.every((f) => Math.hypot(f.x - p.x, f.z - p.z) > 6)) {
        floors.push(p);
      }
    }
  }
  if (floors.length === 0) return none;
  return (i) => {
    const floor = floors[Math.floor(i / perFloor) % floors.length]!;
    const inFloor = Math.min(perFloor, count - Math.floor(i / perFloor) * perFloor);
    const a = ((i % perFloor) / inFloor) * Math.PI * 2 + hash01(ctx.seed, 94, 1);
    const x = floor.x + Math.cos(a) * gap(1.4);
    const z = floor.z + Math.sin(a) * gap(1.4);
    return stand(x, z, -Math.cos(a), -Math.sin(a), 'build');
  };
}

/** Kruh `radius` kolem bodu je volný a mimo pole, sady a hřbitovy (mlat na udusané zemi). */
function openGround(ctx: Context, p: Point, radius: number): boolean {
  const squares: Square[] = [
    ...ctx.village.fields.flatMap((f) => f.parts),
    ...(ctx.village.orchards ?? []).flatMap((o) => o.squares),
    ...ctx.graves,
  ];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = k === 8 ? 0 : radius;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    if (!free(ctx, x, z)) return false;
    if (
      squares.some(
        (s) => Math.abs(x - s.x) < s.size / 2 + 0.5 && Math.abs(z - s.z) < s.size / 2 + 0.5,
      )
    ) {
      return false;
    }
    if (ctx.houses.some((h) => inBox(h, x, z, 1.5))) return false;
  }
  return true;
}

/** Sklizeň jablek a péče: lidé pod jabloněmi vysazených čtverců (střídají se po dnech). */
function orchardTrees(ctx: Context, orchardId: number, count: number): Placer {
  const orchard = (ctx.village.orchards ?? []).find((o) => o.id === orchardId);
  if (!orchard) return none;
  // jabloně pod obydlím na čtverci sadu nejsou (jako ve scéně – orchard-renderer.ts)
  const built = insideClearings(buildingClearings(ctx.village.dwellings), TREE_CLEARANCE_M);
  const trees = orchard.squares
    .filter((s) => s.planting >= 1)
    .flatMap((s) => orchardTreeSpots(s, [], built));
  if (trees.length === 0) return none;
  const start = Math.floor(ctx.day / CREW_MOVE_DAYS) * count;
  return (i, who) => {
    const tree = trees[(start + i) % trees.length]!;
    return atTree(ctx, tree, who, 'fruit', gap(1.3));
  };
}

/** Výsadba sadu: čtverce, které se sázejí (rozsázené první, pak od vsi), okopávání v řadách. */
function orchardPlanting(ctx: Context, orchardId: number, count: number): Placer {
  const orchard = (ctx.village.orchards ?? []).find((o) => o.id === orchardId);
  if (!orchard) return none;
  const distance = (s: Square): number => Math.hypot(s.x - ctx.center.x, s.z - ctx.center.z);
  const squares = orchard.squares
    .filter((s) => s.planting < 1)
    .sort((a, b) => b.planting - a.planting || distance(a) - distance(b));
  return crewRows(ctx, squares, count, () => 'hoe');
}

/**
 * Zakládání a rozšíření hřbitova: lidé na vnějším obvodu ohrazovaných čtverců (plot) čelem
 * dovnitř – nikdy uvnitř na hrobech.
 */
function cemeteryFence(ctx: Context, cemeteryId: number): Placer {
  const cemetery = (ctx.village.cemeteries ?? []).find((c) => c.id === cemeteryId);
  if (!cemetery) return none;
  const pending = cemetery.squares.filter((s) => s.pending);
  const squares = pending.length > 0 ? pending : cemetery.squares;
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  for (const segment of cellsBoundary(squares)) {
    const [a, b] = [segment[0], segment[segment.length - 1]];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = { x: -(b[1] - a[1]) / length, z: (b[0] - a[0]) / length };
    for (let d = 1.5; d < length - 1; d += 3) {
      const mx = a[0] + ((b[0] - a[0]) * d) / length;
      const mz = a[1] + ((b[1] - a[1]) * d) / length;
      // ven = strana, která neleží v žádném čtverci hřbitova
      for (const side of [1, -1]) {
        const x = mx + n.x * side * gap(0.7);
        const z = mz + n.z * side * gap(0.7);
        const inside = cemetery.squares.some(
          (s) => Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2,
        );
        if (inside || !free(ctx, x, z)) continue;
        slots.push({ x, z, hx: -n.x * side, hz: -n.z * side });
        break;
      }
    }
  }
  if (slots.length === 0) return none;
  const offset = Math.floor(hash01(cemeteryId, ctx.seed, 95) * slots.length);
  return (i) => {
    const step = Math.max(1, Math.floor(slots.length / 6));
    const slot = slots[(offset + i * step) % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 3 === 2 ? 'hoe' : 'build');
  };
}

/**
 * Stavba ohrady a výroba rádla (oxen.md): lidé po obvodu čtverce ohrady za plotem čelem
 * dovnitř – kůly, proplétání a přístřešek; střídavě kolem dokola.
 */
function penFence(ctx: Context, penId: number): Placer {
  const pen = (ctx.village.pens ?? []).find((p) => p.id === penId);
  if (!pen) return none;
  const out = pen.size / 2 + HOUSE_MARGIN_M + gap(0.5);
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  for (const [nx, nz] of PLOT_SIDES) {
    for (const along of [-0.5, 0, 0.5]) {
      const x = pen.x + nx * out - nz * along * pen.size * 0.8;
      const z = pen.z + nz * out + nx * along * pen.size * 0.8;
      if (free(ctx, x, z)) slots.push({ x, z, hx: -nx, hz: -nz });
    }
  }
  if (slots.length === 0) return none;
  const offset = Math.floor(hash01(penId, ctx.seed, 96) * slots.length);
  return (i) => {
    // sousední lidé na opačných stranách ohrady
    const slot = slots[(offset + i * 5) % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 3 === 2 ? 'hoe' : 'build');
  };
}

/**
 * Domácí práce venku: u obydlí (po domech dokola) postávají ženy před vchodem a některé
 * chodí pro vodu nebo dřevo kousek od domu.
 */
function domestic(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i, who) => {
    const home = homes[i % homes.length];
    if (!home) return null;
    const turn = Math.floor(i / homes.length);
    const side = turn % 2 === 0 ? -gap(1.3) : gap(1.3);
    const door = nearestFree(ctx, doorPoint(home, side).x, doorPoint(home, side).z, 1.5);
    if (!door) return null;
    // s pěšinami chodí pro vodu a dřevo i každá třetí žena od domu (je je vidět na pěšině)
    const errandTurn = ctx.paths !== null && i % 3 === 2;
    if (errandTurn) {
      const errand = errandRoute(ctx, home, door, who);
      if (errand) return fetcher(errand, who.kind, who.scale, 10 + who.phase * 8, who.phase);
    }
    if (turn % 2 === 1) {
      // pro vodu k potoku nebo pro dřevo k okraji lesa po vyšlapané pěšině (paths.md)
      const errand = errandTurn ? null : errandRoute(ctx, home, door, who);
      if (errand) return fetcher(errand, who.kind, who.scale, 10 + who.phase * 8, who.phase);
      // bez pěšiny: 6–12 m od domu směrem od vsi
      const away = unit(
        home.position.x - ctx.center.x + (who.phase - 0.5) * 6,
        home.position.z - ctx.center.z + 1,
      );
      const r = 6 + who.phase * 6;
      const goal = nearestFree(ctx, door.x + away.x * r, door.z + away.z * r, 3);
      const path = goal ? walkRoute(ctx, door, goal) : null;
      if (path) return fetcher(path, who.kind, who.scale, 10 + who.phase * 8, who.phase);
    }
    const out = unit(door.x - home.position.x, door.z - home.position.z);
    return stand(door.x, door.z, out.x, out.z, 'idle');
  };
}

/** Pochůzka pro vodu nebo dřevo nejvýš tak daleko (m po pěšině) – dál chodí jen kousek od domu. */
const ERRAND_MAX_M = 220;

/**
 * Trasa pro vodu nebo dřevo po pěšině domácnosti (podle fáze postavy jedno nebo druhé), nebo
 * null – bez pěšin, moc daleko, nebo cíl ve vodě.
 */
function errandRoute(ctx: Context, home: House, door: Point, who: Identity): Route | null {
  const paths = ctx.paths;
  if (!paths) return null;
  const kinds: ('water' | 'wood')[] = who.phase < 0.5 ? ['water', 'wood'] : ['wood', 'water'];
  for (const kind of kinds) {
    const end = paths.errand(home.id, kind);
    if (!end) continue;
    // pěšina končí u vody / pod stromy – postava se zastaví na nejbližším volném místě
    const goal = nearestFree(ctx, end.x, end.z, 4);
    const along = paths.route(door, end);
    if (!goal || !along || along.points.length < 2) continue;
    const points = [...along.points.slice(0, -1), [goal.x, goal.z] as const];
    if (!pathRouteOk(ctx, points, false)) continue;
    const path = route(points, along.pace);
    if (path.length <= ERRAND_MAX_M) return path;
  }
  return null;
}

/** Nečinní (společná práce bez staveb): dvojice u domů natočené k sobě. */
function idlers(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i) => {
    const home = homes[Math.floor(i / 2) % homes.length];
    if (!home) return null;
    const pair = Math.floor(i / (2 * homes.length));
    const side = pair % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + 2.4 : home.box.minX - 2.4;
    const base = worldPoint(home.position, edge, 0.5 - pair);
    const across = unit(Math.cos(home.position.rotation), -Math.sin(home.position.rotation));
    const k = i % 2 === 0 ? -gap(0.7) : gap(0.7);
    const spot = nearestFree(ctx, base.x + across.x * k, base.z + across.z * k, 2);
    if (!spot) return null;
    return stand(spot.x, spot.z, -across.x * Math.sign(k), -across.z * Math.sign(k), 'idle');
  };
}

/** Starší u domů – stojí u boční stěny čelem ven (sedět zatím neumí – chybí animace). */
function elders(ctx: Context, count: number): PlannedVillager[] {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  const out: PlannedVillager[] = [];
  for (let i = 0; i < count && homes.length > 0; i++) {
    const home = homes[i % homes.length]!;
    const who = identity(ctx.seed, `elder:${home.id}:${i}`, { women: 0.5, child: false });
    const side = i % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + gap(0.7) : home.box.minX - gap(0.7);
    const p = worldPoint(home.position, edge, home.box.minZ * 0.3);
    const spot = nearestFree(ctx, p.x, p.z, 1.5);
    if (!spot) continue;
    const away = unit(spot.x - home.position.x, spot.z - home.position.z);
    out.push(
      villager(
        { ...who, scale: who.scale * 0.97 },
        stand(spot.x, spot.z, away.x, away.z, 'idle', 0.7),
        'grey',
      ),
    );
  }
  return out;
}

/** Pasáčci – děti (zmenšený muž nebo žena), jeden u každého stáda. */
function herders(ctx: Context, count: number): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (let k = 0; k < count; k++) {
    const who = identity(ctx.seed, `herder:${k}`, { women: 0.4, child: true });
    const speed = walkSpeed(who.kind, 'walk', who.scale) * 0.8;
    const home = nearestFree(ctx, ctx.center.x + 12 + k * 2, ctx.center.z + 12, 6) ?? ctx.center;
    out.push(villager(who, herder(k, home, who.seed, who.phase, speed, 0.8), 'natural'));
  }
  return out;
}

// --- trasy ---------------------------------------------------------------------------------

/**
 * Trasa z `a` do `b` po suchu, která obchází domy: když úsečka protne dům, vloží se bod
 * stranou od domu (až třikrát). Když trasa vede vodou, hrobem nebo domem, null.
 */
export function walkRoute(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'> & { paths?: VillagerPaths | null },
  a: Point,
  b: Point,
): Route | null {
  const along = ctx.paths?.route(a, b);
  if (along && along.points.length >= 2 && pathRouteOk(ctx, along.points)) {
    return route(along.points, along.pace);
  }
  let points: Point[] = [a, b];
  for (let pass = 0; pass < 4; pass++) {
    const next: Point[] = [points[0]!];
    let changed = false;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1]!;
      const q = points[i]!;
      const house = ctx.houses.find(
        (h) => !inBox(h, p.x, p.z, 0.2) && !inBox(h, q.x, q.z, 0.2) && segmentHitsBox(h, p, q),
      );
      if (house) {
        next.push(aroundHouse(house, p, q));
        changed = true;
      }
      next.push(q);
    }
    points = next;
    if (!changed) break;
  }
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const steps = Math.max(1, Math.ceil(length / ROUTE_STEP_M));
    for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
      const x = p.x + ((q.x - p.x) * s) / steps;
      const z = p.z + ((q.z - p.z) * s) / steps;
      if (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z)) return null;
      if (ctx.houses.some((h) => inBox(h, x, z, 0))) return null;
    }
  }
  return route(points.map((p) => [p.x, p.z] as const));
}

/**
 * Trasa po pěšinách projde: odbočka na pěšinu a z ní k cíli po suchu mimo hroby a domy, celá
 * trasa mimo domy (pěšina sama smí přes brod a prudší svah).
 */
function pathRouteOk(
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'>,
  points: readonly (readonly [number, number])[],
  lastLeg = true,
): boolean {
  const last = points.length - 1;
  for (let i = 1; i <= last; i++) {
    const [px, pz] = points[i - 1]!;
    const [qx, qz] = points[i]!;
    const leg = i === 1 || (lastLeg && i === last);
    const length = Math.hypot(qx - px, qz - pz);
    const steps = Math.max(1, Math.ceil(length / ROUTE_STEP_M));
    for (let s = 0; s <= steps; s++) {
      const x = px + ((qx - px) * s) / steps;
      const z = pz + ((qz - pz) * s) / steps;
      if (ctx.houses.some((h) => inBox(h, x, z, 0))) return false;
      if (leg && (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z))) return false;
    }
  }
  return true;
}

/** Úsečka p–q protne obdélník domu (s okrajem) – Liangův–Barskyho ořez v souřadnicích domu. */
function segmentHitsBox(h: House, p: Point, q: Point): boolean {
  const toLocal = (x: number, z: number): [number, number] => {
    const c = Math.cos(h.position.rotation);
    const s = Math.sin(h.position.rotation);
    const dx = x - h.position.x;
    const dz = z - h.position.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const [x0, z0] = toLocal(p.x, p.z);
  const [x1, z1] = toLocal(q.x, q.z);
  const m = 0.4;
  const edges: [number, number][] = [
    [-(x1 - x0), x0 - (h.box.minX - m)],
    [x1 - x0, h.box.maxX + m - x0],
    [-(z1 - z0), z0 - (h.box.minZ - m)],
    [z1 - z0, h.box.maxZ + m - z0],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pe, qe] of edges) {
    if (Math.abs(pe) < 1e-9) {
      if (qe < 0) return false;
      continue;
    }
    const r = qe / pe;
    if (pe < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Bod stranou od domu – kolmo k úsečce na tu stranu, kde úsečka dům míjí blíž okraji. */
function aroundHouse(h: House, p: Point, q: Point): Point {
  const center = worldPoint(
    h.position,
    (h.box.minX + h.box.maxX) / 2,
    (h.box.minZ + h.box.maxZ) / 2,
  );
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const length = Math.max(1e-6, Math.hypot(dx, dz));
  const t = Math.min(
    1,
    Math.max(0, ((center.x - p.x) * dx + (center.z - p.z) * dz) / (length * length)),
  );
  const closest = { x: p.x + dx * t, z: p.z + dz * t };
  let n = unit(closest.x - center.x, closest.z - center.z);
  if (Math.hypot(closest.x - center.x, closest.z - center.z) < 1e-3) n = unit(-dz, dx);
  const halfX = (h.box.maxX - h.box.minX) / 2;
  const halfZ = (h.box.maxZ - h.box.minZ) / 2;
  const reach = Math.hypot(halfX, halfZ) + 1;
  return { x: center.x + n.x * reach, z: center.z + n.z * reach };
}
