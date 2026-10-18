import {
  DWELLING_CLEARING_M,
  DWELLING_GARDEN_M,
  type DwellingType,
  type Position,
} from '@bohemia/game';
import type { LaborActivity, LaborShare, LaborTarget, SceneVillage } from '../village-view';
import { cellsBoundary, type CellSquare } from './field-cells';
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
  'orchard-care': 0.3,
  'orchard-harvest': 0.6,
  build: 0.15,
  fell: 0.05,
  'found-field': 0.2,
  'orchard-plant': 0.3,
  cemetery: 0.2,
  repair: 0.2,
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

export interface VillagerPlanOptions {
  seed: number;
  /** Kolik stád se pase (pasáčci – jeden na stádo, když jsou děti). */
  herds: number;
  maxWorkers?: number;
}

/** Obdélník domu v jeho souřadnicích (x napříč, z k vchodu). */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface House {
  id: number;
  type: DwellingType;
  position: Position;
  built: boolean;
  progress: number;
  inhabited: boolean;
  box: Box;
}

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
  const ctx = context(village, ground, options.seed, labor.day);
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
      const pose = place(i, who);
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
  shares: readonly Pick<LaborShare, 'activity' | 'manDays'>[],
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
  activities.forEach(([, members], g) => {
    const split = crewSplit(
      members.map((i) => shares[i]!.manDays),
      totals[g] ?? 0,
      CREW,
    );
    members.forEach((i, k) => (counts[i] = split[k] ?? 0));
  });
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
): Context {
  const houses: House[] = village.dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: d.built,
    progress: d.progress,
    inhabited: d.built && d.inhabited !== false,
    box: d.built ? houseBox(d.type) : siteBox(d.type),
  }));
  const homes = houses.filter((h) => h.inhabited);
  const settled = homes.length > 0 ? homes : houses;
  const center = {
    x: settled.reduce((s, h) => s + h.position.x, 0) / settled.length,
    z: settled.reduce((s, h) => s + h.position.z, 0) / settled.length,
  };
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  return { village, ground, seed, day, center, houses, homes: settled, graves };
}

/**
 * Staveniště zabere i s hromadou hlíny, drnem, dřevem a nářadím kolem jámy celou vyklízenou
 * plochu (village-construction.ts) – stavitelé stojí za ní.
 */
function siteBox(type: DwellingType): Box {
  const clearance = DWELLING_CLEARING_M[type];
  // vyklízená plocha polozemnice sahá doleva i přes budoucí zahrádku – nářadí leží souměrně
  return {
    minX: -clearance.maxX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(chickenBox(type).maxZ, SITE_FRONT_M),
  };
}

/**
 * Hotové obydlí: dům se střechou a šíjí (jako pro slepice – `chickenBox`) a u polozemnice
 * i oplocená zahrádka vedle domu (`DWELLING_GARDEN_M`) – obdélník přes obojí.
 */
function houseBox(type: DwellingType): Box {
  const house = chickenBox(type);
  const garden = DWELLING_GARDEN_M[type];
  return {
    minX: Math.min(-house.halfX, garden?.minX ?? 0),
    maxX: Math.max(house.halfX, garden?.maxX ?? 0),
    minZ: Math.min(house.minZ, garden?.minZ ?? 0),
    maxZ: Math.max(house.maxZ, garden?.maxZ ?? 0),
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

function placer(ctx: Context, share: LaborShare, count: number): Placer {
  const t = share.target;
  switch (share.activity) {
    case 'dig':
    case 'reclaim':
      return t.kind === 'field' ? fieldRows(ctx, t.id, count, 'hoe', t.parts) : none;
    case 'sow':
      return t.kind === 'field' ? fieldRows(ctx, t.id, count, 'seed', t.parts) : none;
    case 'weed':
      return t.kind === 'field' ? fieldRows(ctx, t.id, count, 'weed', t.parts) : none;
    case 'harvest':
      return t.kind === 'field' ? fieldRows(ctx, t.id, count, 'reap', t.parts) : none;
    case 'carry':
      return t.kind === 'field' ? carriers(ctx, t.id, t.parts) : none;
    case 'found-field':
      return t.kind === 'field' ? founding(ctx, t.id, count) : none;
    case 'thresh':
      return threshing(ctx, count);
    case 'orchard-harvest':
    case 'orchard-care':
      return t.kind === 'orchard' ? orchardTrees(ctx, t.id, count) : none;
    case 'orchard-plant':
      return t.kind === 'orchard' ? orchardPlanting(ctx, t.id, count) : none;
    case 'cemetery':
      return t.kind === 'cemetery' ? cemeteryFence(ctx, t.id) : none;
    case 'fell':
      if (t.kind === 'trees') return felling(ctx, t.ids);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'build':
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'repair':
      return t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'domestic':
      return domestic(ctx);
    case 'idle':
      return idlers(ctx);
  }
}

const none: Placer = () => null;

interface Square {
  x: number;
  z: number;
  size: number;
}

/**
 * Čtverce pole pro práci: díly ve stadiu `stage` (osévané = v plánu, zakládané), jinak všechny.
 * Osévané se střídají po dnech (řady se posouvají po poli), zakládané od nejbližšího k obydlí
 * jako v simulaci.
 */
function fieldSquares(ctx: Context, fieldId: number, stage: 'sown' | 'founding'): Square[] {
  const field = ctx.village.fields.find((f) => f.id === fieldId);
  if (!field || field.parts.length === 0) return [];
  const matching = field.parts.filter((p) => p.stage === stage);
  const parts = matching.length > 0 ? matching : field.parts;
  const distance = (p: Square): number => {
    const h = nearestHouse(ctx.houses, p);
    return h ? Math.hypot(h.position.x - p.x, h.position.z - p.z) : 0;
  };
  const sorted = [...parts].sort((a, b) => distance(a) - distance(b) || a.x - b.x || a.z - b.z);
  if (stage === 'founding') return sorted;
  const start =
    Math.floor(ctx.day / CREW_MOVE_DAYS) +
    Math.floor(hash01(fieldId, ctx.seed, 92) * sorted.length);
  return sorted.map((_, i) => sorted[(start + i) % sorted.length]!);
}

/**
 * Čtverce, na kterých se dnes pracuje: díly `parts` z rozdělení práce (čelo práce po čtvercích –
 * fields.md), jinak osévané díly pole jako dřív.
 */
function workSquares(
  ctx: Context,
  fieldId: number,
  parts: readonly number[] | undefined,
): Square[] {
  if (parts && parts.length > 0) {
    const field = ctx.village.fields.find((f) => f.id === fieldId);
    const squares = parts.flatMap((id) => field?.parts.find((p) => p.id === id) ?? []);
    if (squares.length > 0) return squares;
  }
  return fieldSquares(ctx, fieldId, 'sown');
}

/** Řady na čtvercích pole – po CREW lidech na čtverec, `clip` podle člena řady. */
function fieldRows(
  ctx: Context,
  fieldId: number,
  count: number,
  clip: VillagerClip,
  parts?: readonly number[],
): Placer {
  return crewRows(ctx, workSquares(ctx, fieldId, parts), count, () => clip);
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
 * Nosiči úrody: od obydlí nejblíž čtverci, kde se žne, a s nůší zpět. Když trasa nevede po
 * suchu, žne nosič taky.
 */
function carriers(ctx: Context, fieldId: number, parts?: readonly number[]): Placer {
  const squares = workSquares(ctx, fieldId, parts);
  if (squares.length === 0) return none;
  return (i, who) => {
    const square = squares[Math.floor(i / 2) % squares.length]!;
    const home = nearestHouse(ctx.homes, square);
    const fallback = (): PoseFn | null => rowOn(ctx, square, i % CREW, CREW, 'reap', who);
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
 * Zakládání pole: stromy na zakládaném čtverci se kácejí (sekera u kmene), zbytek okopává
 * drn motykou.
 */
function founding(ctx: Context, fieldId: number, count: number): Placer {
  const squares = fieldSquares(ctx, fieldId, 'founding');
  if (squares.length === 0) return none;
  const trees = squares.map((s) => ctx.ground.treesIn(s.x, s.z, s.size / 2, CREW));
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const k = crew % squares.length;
    const square = squares[k]!;
    const standing = trees[k] ?? [];
    if (standing.length > 0 && member % 2 === 0) {
      const tree = standing[(member / 2) % standing.length]!;
      return atTree(ctx, tree, who, 'fell', FELL_REACH_M);
    }
    return rowOn(ctx, square, member, Math.min(CREW, count - crew * CREW), 'hoe', who);
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
 * (nejbližší staveniště, jinak obydlí).
 */
function felling(ctx: Context, ids: readonly number[]): Placer {
  const trees = ids.flatMap((id) => {
    const p = ctx.ground.tree(id);
    return p ? [p] : [];
  });
  if (trees.length === 0) return none;
  const sites = ctx.houses.filter((h) => !h.built);
  return (i, who) => {
    const tree = trees[i % trees.length]!;
    if (i < trees.length * 2) {
      const slot = { ...who, phase: (who.phase + (i >= trees.length ? 0.5 : 0)) % 1 };
      return atTree(ctx, tree, slot, 'fell', FELL_REACH_M);
    }
    const target = nearestHouse(sites.length > 0 ? sites : ctx.houses, tree);
    const from = target ? nearestFree(ctx, tree.x + 1.5, tree.z, 3) : null;
    if (!target || !from) return atTree(ctx, tree, who, 'fell', FELL_REACH_M + 0.6);
    const path = walkRoute(ctx, doorPoint(target, -1.5), from);
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
  const { minX, maxX, minZ, maxZ } = house.box;
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
    const spot = nearestFree(ctx, p.x, p.z, 1.5);
    if (!spot) return null;
    const h = unit(house.position.x - spot.x, house.position.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, digging ? 'hoe' : clip);
  };
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
  const trees = orchard.squares.filter((s) => s.planting >= 1).flatMap((s) => orchardTreeSpots(s));
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
    if (turn % 2 === 1) {
      // pro vodu / dřevo: 6–12 m od domu směrem od vsi
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
  ctx: Pick<Context, 'houses' | 'ground' | 'graves'>,
  a: Point,
  b: Point,
): Route | null {
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
