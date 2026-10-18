import { detCos, detSin, length2 } from '../../landscape';
import { milirPosition } from '../crafts';
import { DWELLING_CLEARING_M, SACRED_BUILDINGS } from '../rules';
import type { ObstacleChanges } from '../obstacles';
import type { PartStage } from '../summary';
import type {
  Craft,
  DwellingType,
  FieldSurface,
  HerdSpecies,
  RoadGrade,
  LaborTarget,
  Position,
  SacredBuildingKind,
  TileCell,
} from '../types';
import { nearestPartFinder } from './nearest';
import { PATH_FOREST_EDGE, PATH_WATER_SPOT, type PathTerrain } from './terrain';

// Vyšlapané pěšiny (docs/design/paths.md). Čistá deterministická funkce vsi a terénu – počítá ji
// server (cesta na pole po pěšině je rychlejší – fields.md – Vzdálenost) i prohlížeč (vzhled,
// postavy) a musí jim vyjít stejně: jen přesná aritmetika (det-math, hlídá ESLint). Z každé
// domácnosti se chodí pro vodu k potoku, pro dřevo k okraji lesa, na pole, do sadu, ke hřbitovu,
// k posvátným místům a na staveniště – tam, kam ves dnes chodí práce (rozdělení práce dne), plus
// kousek navíc, ať zavedená místa pěšinu mají.
// Trasy hledá Dijkstra na hrubé mřížce (path-terrain.ts + domy, pole a překážky vsi). Provoz se
// sčítá po buňkách, z něj síla pěšiny; pak se trasy hledají znovu se slevou na vyšlapané buňky
// (aktivní chodci) – lidé dají přednost vyšlapané pěšině a trasy se slijí do sítě. Ke společnému
// cíli (pole, sad, staveniště…) jde každá domácnost zvlášť, nejvytíženější první, a další se
// k čerstvě vyšlapané pěšině přidá – žádné souběžné pěšiny vedle sebe (Martin). Po pevné cestě
// (roads.md) se jde jako po plné pěšině, takže se k ní trasy stahují. Výsledek jsou vyhlazené
// lomené čáry se silou v bodech.

/** Bod ve světě (m). */
export interface PathPoint {
  x: number;
  z: number;
}

/** Pěšina: osa (vyhlazená lomená čára) a síla v bodech 0–1 (šířka, vyšlapanost). */
export interface PathLine {
  points: PathPoint[];
  strength: number[];
  /**
   * Jak dlouho se tudy chodí (herní roky – průměr tras, vážený provozem); bez údaje o stáří
   * obydlí PATH_YEARS_UNKNOWN. Podle něj rostou stromy podél pěšin (path-trees.ts).
   */
  years: number[];
  /** Začíná / končí volným koncem (brána, pole, břeh) – tam se vytrácí; jinak v rozcestí. */
  openStart: boolean;
  openEnd: boolean;
}

/** Provoz po buňkách okna – cest za den (vyhlazené); vývojová teplotní mapa. */
export interface PathTraffic {
  originX: number;
  originZ: number;
  cellM: number;
  width: number;
  height: number;
  values: Float32Array;
  /** Provoz po buňkách bez vyhlazení (cest za den) – podle něj pevné cesty zarůstají (roads.md). */
  raw: Float32Array;
}

/** Kam chodí domácnost pro vodu a dřevo – konec její trasy (null = nikam blízko). */
export interface PathErrands {
  water: PathPoint | null;
  wood: PathPoint | null;
}

export interface PathNetwork {
  lines: PathLine[];
  traffic: PathTraffic;
  /** Podle id obydlí domácnosti. */
  errands: ReadonlyMap<number, PathErrands>;
  /** Tras (domácnost × cíl) v posledním kole. */
  trips: number;
  /**
   * Kolik cest za den vede k jednotlivým stavbám (abandonment.md – opuštěná stavba): klíč
   * `<druh>:<id>` (`idol`, `shrine`, `cemetery`, `pen`), cesty za den z posledního kola – jen
   * domácnosti, ke kterým se trasa našla. Stavba, která v mapě chybí, nemá žádný provoz.
   */
  visits: ReadonlyMap<string, number>;
}

/** Čtverec stavby po políčkách (díl pole, čtverec sadu, hřbitova, háje) – střed a strana (m). */
export interface PathSquare {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
}

/**
 * Ves pro pěšiny – jen to, na čem pěšiny závisí. Tvar odpovídá vsi pro scénu (`SceneVillage`
 * ve webu ji splňuje), server ji skládá ze stavu vsi (`pathVillageOf`).
 */
export interface PathVillage {
  /**
   * Hotová obydlí (id obydlí) i staveniště (id stavby). `inhabited` – bydlí v něm někdo (bez
   * údaje ano), `since` – herní den, od kdy stojí (dostavění / zahájení stavby; bez údaje
   * odjakživa), `plot` – pozemek polozemnice (střed políčka a strana), `craft` – řemeslná dílna
   * (u uhlíře stojí kus od zemnice milíř – crafts.md).
   */
  dwellings: readonly {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    inhabited?: boolean;
    since?: number;
    craft?: Craft;
    /** `yard` – dvůr dvorce vojvody (trade.md): střed druhého políčka pozemku. */
    plot?: { cell: TileCell; x: number; z: number; size: number; yard?: { x: number; z: number } };
  }[];
  /**
   * Pole – díly se stadiem; `grazed` u přílohu ve fázi louky = pasou se na něm stáda (fields.md –
   * Zarůstání, `pastureGrazedParts`): kam stáda nedojdou, tam pasáček nechodí. Bez údaje se pase
   * na každém přílohu.
   */
  fields: readonly {
    id: number;
    parts: readonly (PathSquare & { stage: PartStage; grazed?: boolean })[];
  }[];
  orchards?: readonly { id: number; squares: readonly PathSquare[] }[];
  cemeteries?: readonly { id: number; squares: readonly PathSquare[] }[];
  sacred?: {
    oaks: readonly { id: number; x: number; z: number }[];
    groves: readonly { id: number; x: number; z: number; squares: readonly PathSquare[] }[];
    buildings: readonly {
      id: number;
      kind: SacredBuildingKind;
      position: Position;
      built: boolean;
    }[];
  };
  /** Rozdělení práce posledního dne (člověkodny po místech), lidé podle věku a herní den. */
  labor?: {
    day: number;
    month: number;
    people: { children: number; adults: number; elders: number };
    shares: readonly { target: LaborTarget; manDays: number }[];
  };
  /** Odstraněné a pokácené překážky (počty – klíč sítě). */
  obstacles?: Pick<ObstacleChanges, 'removed' | 'stumps'>;
  /** Pevné cesty (roads.md) – po nich se jde jako po plné pěšině. Bez údaje žádné. */
  roads?: readonly { id?: number; points: readonly PathPoint[]; grade?: RoadGrade }[];
  /**
   * Ohrady (oxen.md) – čtverec jako díl pole a jestli je hotová: plot obchází, k ohradě se chodí
   * krmit dobytek. `stocked: false` – hotová ohrada bez zvířat (abandonment.md): krmit se tam
   * nechodí, jen za prací dne. Bez údaje žádné (u ohrady bez `stocked` se zvířaty).
   */
  pens?: readonly (PathSquare & { id: number; built: boolean; stocked?: boolean })[];
  /**
   * Stáda na pastvě (diet.md – kusy po druzích, krávy v zimě v ohradě nepočítané): pasáček je
   * denně vyžene na úhor. Bez údaje žádná.
   */
  livestock?: Readonly<Partial<Record<HerdSpecies, number>>>;
  /**
   * Les vsi (fields.md – Les vsi) – čtverce polí zarostlé lesem: na bývalé louce se jde jako
   * lesem (les na vymýceném lese už terén krajiny zná). Bez údaje žádný.
   */
  woods?: readonly (PathSquare & { surface?: FieldSurface })[];
  /**
   * Přirozené louky letošní seče (oxen.md – Seno) – políčka; pěšina vede k těm, kde se dnes seče
   * (práce `meadow` v rozdělení práce). Bez údaje žádné.
   */
  hayMeadows?: readonly PathSquare[];
}

export interface PathNetworkInput {
  village: PathVillage;
  /** Terén okna – i s překážkami krajiny (`withObstacles` v terrain.ts). */
  terrain: PathTerrain;
  /** Poloha stromu z vrstvy překážek – kácení dřeva pro stavbu. */
  tree?(id: number): PathPoint | null;
  /**
   * Provoz za celý rok místo dne (pevné cesty – roads.md): `village.labor.shares` nesou průměrné
   * člověkodny na den za rok, pro dřevo se chodí podle průměru roku (ne podle měsíce).
   */
  annual?: boolean;
}

/** Kola hledání: první trasy (každá další se přidá k už vyšlapaným) a jedno kolo se slevou z prvního. */
const PASSES = 2;
/** Vyšlapaná buňka stojí (1 − PATH_DISCOUNT × síla) – po silné pěšině se jde i oklikou. */
const PATH_DISCOUNT = 0.5;
/** Kupa milíře uhlíře (crafts.py MILIR_R) – pěšina ji obejde. */
const MILIR_RADIUS_M = 2.3;
/** Pevná cesta (roads.md): sleva jako po plné pěšině – trasy se k ní stahují. */
const ROAD_STRENGTH = 1;
/**
 * Provoz v cestách za den: pod `min` se pěšina nevyšlape (jednotlivé cesty nekreslí), od `full`
 * je plná; mezi tím síla roste s odmocninou provozu (pomalu – přesná aritmetika místo logaritmu).
 */
export const PATH_TRAFFIC = { min: 0.6, full: 10 } as const;
/** Za kolik let od vzniku je spojení vyšlapané naplno (domácnost i cíl) – pěšina se objevuje. */
export const PATH_AGE_FULL_YEARS = 2;
const DAYS_PER_YEAR = 365.25;
/** Stáří spojení, když obydlí stáří nenese (ves uložená dřív, vývojová ves) – odjakživa. */
export const PATH_YEARS_UNKNOWN = 100;
/** Stáří pro stromy podél pěšin se v klíči sítě zaokrouhluje na tolik let a nejvýš do tolika. */
const YEARS_STEP = 2;
const YEARS_KEY_MAX = 40;
/** Cest za den: pro vodu na člověka domácnosti, pro dřevo na domácnost (léto / zima). */
const WATER_TRIPS_PER_PERSON = 0.4;
const WOOD_TRIPS = { summer: 0.5, winter: 1.2 } as const;
const WINTER_MONTHS: readonly number[] = [11, 12, 1, 2, 3];
/** Návštěvy mezi sousedy – každá domácnost se dvěma nejbližšími. */
const NEIGHBOUR_TRIPS = 0.5;
const NEIGHBOURS = 2;
/** Cest za den na člověkoden práce dne na místě (tam a zpět = jedna cesta). */
const TRIPS_PER_MAN_DAY = 1;
/** Zavedená místa – cest za den celé vsi navíc k práci dne (pěšina nezaroste mezi pracemi). */
const BASE_TRIPS = {
  field: 1.6,
  fallow: 0.4,
  orchard: 0.8,
  site: 0.6,
  sacred: 0.6,
  pen: 0.8,
} as const;
/**
 * Stáda na pastvě (diet.md, jako scéna – livestock-placement.ts): ovce s kozami po 20 kusech,
 * krávy po 6; pasáček vyžene každé stádo jednou denně na úhor a zpět (jedna cesta). Mladý úhor se
 * pase vždy, louka na seno až po seči (srpen–listopad); prasata jdou do lesa (cesty pro dřevo).
 */
const PASTURE = { flockHeads: 20, cattleHeads: 6, tripsPerHerd: 1 } as const;
const AFTERMATH_MONTHS: readonly number[] = [8, 9, 10, 11];
/**
 * Návštěvy hrobů předků (Martin schválil, návrh Clauda – raní Slované je navštěvovali pravidelně:
 * obětiny, hostiny za mrtvé): cest za den na člověka domácnosti, každá domácnost k nejbližšímu
 * hřbitovu (ves se 7 lidmi ≈ 1 cesta denně, se 40 lidmi ≈ 6).
 */
const CEMETERY_VISITS_PER_PERSON = 0.15;
/** Lidí na domácnost bez rozdělení práce (ves uložená dřív). */
const DEFAULT_HOUSEHOLD = 5;
/** Menší cesta za den se nehledá. */
const MIN_TRIP = 0.02;
/** Pro vodu a dřevo se chodí nejvýš tak daleko (cena v m chůze po louce). */
const ERRAND_MAX_COST = 450;
/** Další kola hledají pochůzku domácnosti nejvýš tak daleko proti prvnímu kolu (násobek a cena navíc). */
const ERRAND_REACH = { factor: 1.25, extra: 30 } as const;
/** Do takové ceny cesty se pro vodu a dřevo chodí naplno, dál úměrně méně často. */
const ERRAND_NEAR_COST = 130;
/**
 * Cena chůze přes díl pole podle stadia (násobek terénu): přes osetý díl se nechodí (obchází se
 * po okraji), zoraný a zakládaný díl je hrubá hlína, přes úhor a pastvinu se chodí volně (nálet
 * ani les na přílohu není).
 */
const STAGE_COST: Record<PartStage, number> = {
  founding: 3,
  ready: 3,
  sown: 12,
  'young-fallow': 1.1,
  meadow: 1.25,
  // zarůstající příloh (fields.md – Zarůstání): trnité křoviny, houština mladého lesa
  shrubs: 2.2,
  'young-forest': 1.8,
};
/** Les vsi na bývalé louce – jako les krajiny (terrain.ts – FOREST_COST). */
const WOOD_COST = 1.35;
/** Sad (pod jabloněmi, okopané kmeny), hřbitov (plot, hroby) a ohrada (plot ze žerdí). */
const ORCHARD_COST = 1.6;
const CEMETERY_COST = 15;
const PEN_COST = 15;
/** Svatyně – ohrazený posvátný okrsek (modla stojí na malém půdorysu – neprůchodná). */
const SHRINE_COST = 2.5;
/** Okraj domu, kam pěšina nesmí (m). */
const HOUSE_MARGIN_M = 0.4;
/** Brána před vchodem domu – kus před koncem šíje (m). */
const GATE_M = 1;
/** Kolem kmene posvátného dubu se staví obětiny – pěšina končí kus od něj (m). */
const OAK_REACH_M = 4;
/** Zjednodušení osy (m) a kola vyhlazení (Chaikin). */
const SIMPLIFY_M = 1.1;
const SMOOTH_PASSES = 3;
const SQRT2 = Math.SQRT2;
/**
 * Váha odhadu A* pochůzek (násobek vzdušné čáry k místu z prvního kola) – pod nejlevnější cenou
 * chůze po vyšlapané pěšině, hledání se tak drží směru a neprochází celé okolí.
 */
const A_STAR_WEIGHT = 0.5;
/**
 * Pochůzka přijme místo nebo pěšinu souseda, i když je až o tolik dražší než nejlepší (vážené
 * hledání – jen pro vzhled); hledání tak skončí brzy.
 */
const GOAL_SLACK = 1.3;

/** Okolí vsi pro pěšiny: kam se chodí pro vodu a dřevo (m od staveb vsi). */
export const PATH_REACH_M = 240;
/** Okno pěšin nejvýš tolik od středu vsi (m) – výpočet zůstane krátký. */
const MAX_WINDOW_HALF_M = 650;
/** Okno se zaokrouhluje ven na tolik (m) – terén se nepřepočítá při každé nové stavbě. */
const WINDOW_ROUND_M = 90;

/**
 * Obdélník světa, který pěšiny vsi potřebují: stavby vsi a okolí pro vodu a dřevo, zaokrouhlený
 * ven (stabilní okno) a nejvýš MAX_WINDOW_HALF_M od středu obydlí. Ves bez obydlí null.
 */
export function pathBounds(
  village: PathVillage,
): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  if (village.dwellings.length === 0) return null;
  const xs: number[] = [];
  const zs: number[] = [];
  const add = (x: number, z: number): void => {
    xs.push(x);
    zs.push(z);
  };
  for (const d of village.dwellings) add(d.position.x, d.position.z);
  const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const cz = zs.reduce((s, z) => s + z, 0) / zs.length;
  for (const f of village.fields) for (const p of f.parts) add(p.x, p.z);
  for (const o of village.orchards ?? []) for (const s of o.squares) add(s.x, s.z);
  for (const c of village.cemeteries ?? []) for (const s of c.squares) add(s.x, s.z);
  for (const o of village.sacred?.oaks ?? []) add(o.x, o.z);
  for (const g of village.sacred?.groves ?? []) add(g.x, g.z);
  for (const b of village.sacred?.buildings ?? []) add(b.position.x, b.position.z);
  for (const p of village.pens ?? []) add(p.x, p.z);
  for (const m of mowedMeadows(village)) add(m.x, m.z);
  const clampX = (x: number): number =>
    Math.min(cx + MAX_WINDOW_HALF_M, Math.max(cx - MAX_WINDOW_HALF_M, x));
  const clampZ = (z: number): number =>
    Math.min(cz + MAX_WINDOW_HALF_M, Math.max(cz - MAX_WINDOW_HALF_M, z));
  const down = (v: number): number => Math.floor(v / WINDOW_ROUND_M) * WINDOW_ROUND_M;
  const up = (v: number): number => Math.ceil(v / WINDOW_ROUND_M) * WINDOW_ROUND_M;
  return {
    minX: down(clampX(Math.min(...xs) - PATH_REACH_M)),
    minZ: down(clampZ(Math.min(...zs) - PATH_REACH_M)),
    maxX: up(clampX(Math.max(...xs) + PATH_REACH_M)),
    maxZ: up(clampZ(Math.max(...zs) + PATH_REACH_M)),
  };
}

/**
 * Políčka přirozených luk, kde ves seče (práce `meadow` v rozdělení práce – v roční síti za rok),
 * podle `hayMeadows`; políčko, které ves nezná, vypadne.
 */
function mowedMeadows(village: PathVillage): PathSquare[] {
  const meadows = village.hayMeadows ?? [];
  if (meadows.length === 0) return [];
  const byCell = new Map(meadows.map((m) => [`${m.cell.x},${m.cell.y}`, m]));
  const out = new Map<string, PathSquare>();
  for (const share of village.labor?.shares ?? []) {
    if (share.target.kind !== 'meadow' || share.manDays <= 0) continue;
    for (const c of share.target.cells) {
      const key = `${c.x},${c.y}`;
      const m = byCell.get(key);
      if (m) out.set(key, m);
    }
  }
  return [...out.values()];
}

/** Síla pěšiny 0–1 z provozu (cest za den); pod prahem 0. */
export function pathStrength(trips: number): number {
  if (trips < PATH_TRAFFIC.min) return 0;
  return Math.min(1, Math.sqrt(trips / PATH_TRAFFIC.full));
}

/** Kolik spojení je vyšlapané podle stáří (roky) – za PATH_AGE_FULL_YEARS naplno. */
export function pathAgeFactor(years: number): number {
  return Math.min(1, Math.max(0, years / PATH_AGE_FULL_YEARS));
}

/**
 * Klíč všeho, na čem pěšiny závisí (rozložení vsi, práce dne po místech, stáří obydlí) – síť se
 * přepočítá, jen když se změní. Člověkodny po půlkách, stáří po desetinách – denní drobné změny
 * síť nepřestavují.
 */
export function pathNetworkKey(village: PathVillage): string {
  const day = village.labor?.day ?? null;
  const dwellings = village.dwellings.map((d) => {
    const age =
      d.since !== undefined && day !== null
        ? `${ageBucket(day - d.since)}/${Math.floor(Math.min(YEARS_KEY_MAX, (day - d.since) / DAYS_PER_YEAR) / YEARS_STEP)}`
        : '';
    const yard = d.plot?.yard ? `+${d.plot.yard.x},${d.plot.yard.z}` : '';
    const plot = d.plot ? `${d.plot.cell.x},${d.plot.cell.y}${yard}` : '';
    return `${d.id}:${d.type}${d.craft ? `/${d.craft}` : ''}:${d.built ? 1 : 0}:${d.inhabited === false ? 0 : 1}:${age}:${plot}:${d.position.x.toFixed(1)},${d.position.z.toFixed(1)},${d.position.rotation.toFixed(2)}`;
  });
  const fields = village.fields.map(
    (f) =>
      `${f.id}:${f.parts.map((p) => `${p.cell.x},${p.cell.y},${p.stage}${p.grazed === false ? ',-' : ''}`).join(';')}`,
  );
  const woods = (village.woods ?? []).map(
    (w) => `${w.cell.x},${w.cell.y}${w.surface === 'forest' ? 'f' : ''}`,
  );
  const orchards = (village.orchards ?? []).map(
    (o) => `${o.id}:${o.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  const cemeteries = (village.cemeteries ?? []).map(
    (c) => `${c.id}:${c.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';')}`,
  );
  const sacred = village.sacred
    ? [
        village.sacred.oaks.map((o) => o.id).join(','),
        village.sacred.groves.map((g) => g.id).join(','),
        village.sacred.buildings.map((b) => `${b.id}:${b.kind}:${b.built ? 1 : 0}`).join(','),
      ].join('|')
    : '';
  const labor = village.labor
    ? `${village.labor.month}:${laborByTarget(village)
        .map(([key, manDays]) => `${key}=${manDays}`)
        .join(
          ',',
        )}:${village.labor.people.adults + village.labor.people.children + village.labor.people.elders}`
    : '';
  const obstacles = village.obstacles
    ? `${village.obstacles.removed.length},${village.obstacles.stumps.length}`
    : '';
  const pens = (village.pens ?? []).map(
    (p) => `${p.id}:${p.cell.x},${p.cell.y}:${p.built ? 1 : 0}${p.stocked === false ? ':-' : ''}`,
  );
  return JSON.stringify([
    dwellings,
    fields,
    orchards,
    cemeteries,
    sacred,
    labor,
    obstacles,
    roadsKey(village.roads),
    pens,
    pastureHerds(village.livestock),
    // bez lesa vsi prázdné – klíč starších vsí zůstane stejný
    ...(woods.length > 0 ? [woods] : []),
  ]);
}

/** Bod v polovině lomené čáry. */
function middleOf(points: readonly PathPoint[]): PathPoint {
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    total += length2(points[k]!.x - points[k - 1]!.x, points[k]!.z - points[k - 1]!.z);
  }
  let along = 0;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (length > 0 && along + length >= total / 2) {
      const u = (total / 2 - along) / length;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
    }
    along += length;
  }
  return points[0]!;
}

/** Kolik stád se pase (ovce s kozami, krávy – PASTURE); prasata ne. */
export function pastureHerds(livestock: PathVillage['livestock']): number {
  const whole = (n: number | undefined): number => Math.max(0, Math.round(n ?? 0));
  const flock = whole(livestock?.sheep) + whole(livestock?.goat);
  return (
    Math.ceil(flock / PASTURE.flockHeads) + Math.ceil(whole(livestock?.cow) / PASTURE.cattleHeads)
  );
}

/** Klíč pevných cest – počet bodů, konce každé osy (osa se jinak nemění) a stupeň. */
export function roadsKey(roads: PathVillage['roads']): string {
  return (roads ?? [])
    .map((r) => {
      const a = r.points[0];
      const b = r.points[r.points.length - 1];
      return a && b ? `${r.points.length}:${a.x},${a.z}:${b.x},${b.z}:${r.grade ?? ''}` : '';
    })
    .join(';');
}

function ageBucket(days: number): number {
  return Math.round(pathAgeFactor(days / DAYS_PER_YEAR) * 10);
}

/** Člověkodny dne po místech (klíč místa), po půlkách – nulová místa vynechá. */
function laborByTarget(village: PathVillage): [string, number][] {
  const sums = new Map<string, number>();
  for (const share of village.labor?.shares ?? []) {
    const t = share.target;
    if (t.kind === 'village') continue;
    const key =
      t.kind === 'trees'
        ? `trees:${t.ids.join('.')}`
        : t.kind === 'meadow'
          ? `meadow:${t.cells.map((c) => `${c.x}.${c.y}`).join('_')}`
          : `${t.kind}:${t.id}`;
    // na setiny jako ve scéně (village-view.ts) – server i prohlížeč pak sečtou totéž
    sums.set(key, (sums.get(key) ?? 0) + Math.round(share.manDays * 100) / 100);
  }
  return [...sums.entries()]
    .map(([key, manDays]): [string, number] => [key, Math.round(manDays * 2) / 2])
    .filter(([, manDays]) => manDays > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// --- mřížka -------------------------------------------------------------------------------

interface Grid {
  width: number;
  height: number;
  originX: number;
  originZ: number;
  cellM: number;
  /** Cena po vsi a překážkách (bez slevy za pěšiny). */
  base: Float32Array;
  flags: Uint8Array;
  /** Buňka patří stavbě vsi (pole, sad, hřbitov, dům) – pro dřevo a vodu se sem nechodí. */
  village: Uint8Array;
}

function cellX(grid: Grid, c: number): number {
  return grid.originX + (c % grid.width) * grid.cellM;
}

function cellZ(grid: Grid, c: number): number {
  return grid.originZ + Math.floor(c / grid.width) * grid.cellM;
}

/** Buňky se středem v obdélníku světa (včetně okraje). */
function cellsIn(
  grid: Grid,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  visit: (c: number, x: number, z: number) => void,
): void {
  const i0 = Math.max(0, Math.ceil((minX - grid.originX) / grid.cellM - 1e-6));
  const j0 = Math.max(0, Math.ceil((minZ - grid.originZ) / grid.cellM - 1e-6));
  const i1 = Math.min(grid.width - 1, Math.floor((maxX - grid.originX) / grid.cellM + 1e-6));
  const j1 = Math.min(grid.height - 1, Math.floor((maxZ - grid.originZ) / grid.cellM + 1e-6));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      visit(j * grid.width + i, grid.originX + i * grid.cellM, grid.originZ + j * grid.cellM);
    }
  }
}

interface Square {
  cell: { x: number; y: number };
  x: number;
  z: number;
  size: number;
}

/** Číselný klíč políčka (celá čísla do ±2^20 – krajina je o řády menší). */
function tileKey(x: number, y: number): number {
  return (x + TILE_KEY_OFFSET) * TILE_KEY_SPAN + (y + TILE_KEY_OFFSET);
}
const TILE_KEY_OFFSET = 1_048_576; // 2^20
const TILE_KEY_SPAN = 2_097_152; // 2^21

/**
 * Buňky čtverců (políček) jedné stavby: `inside` – střed uvnitř nebo na hraně mezi dvěma
 * čtverci (mezi díly pole meze nejsou), `edge` – střed na vnější hraně (tam vede pěšina podél
 * okraje). Vrátí obojí zvlášť.
 */
function squareCells(grid: Grid, squares: readonly Square[]): { inside: number[]; edge: number[] } {
  const first = squares[0];
  if (!first) return { inside: [], edge: [] };
  const tiles = new Set(squares.map((s) => tileKey(s.cell.x, s.cell.y)));
  const left = first.x - first.size / 2;
  const top = first.z - first.size / 2;
  const inUnion = (x: number, z: number): boolean =>
    tiles.has(
      tileKey(
        first.cell.x + Math.floor((x - left) / first.size),
        first.cell.y + Math.floor((z - top) / first.size),
      ),
    );
  const seen = new Set<number>();
  const inside: number[] = [];
  const edge: number[] = [];
  const probe = 0.2;
  for (const s of squares) {
    const half = s.size / 2;
    cellsIn(grid, s.x - half, s.z - half, s.x + half, s.z + half, (c, x, z) => {
      if (seen.has(c)) return;
      seen.add(c);
      let count = 0;
      if (inUnion(x + probe, z + probe)) count++;
      if (inUnion(x - probe, z + probe)) count++;
      if (inUnion(x + probe, z - probe)) count++;
      if (inUnion(x - probe, z - probe)) count++;
      if (count === 4) inside.push(c);
      else if (count > 0) edge.push(c);
    });
  }
  return { inside, edge };
}

/** Obdélník v souřadnicích domu (x napříč, z k vchodu, m). */
export interface PathBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Stavba, kterou pěšiny obcházejí: dům (i se šíjí), pozemek, staveniště, modla. */
interface Building {
  position: Position;
  box: PathBox;
}

/** Bod v souřadnicích domu (x napříč, z k vchodu) → svět (natočení jako `mesh.rotation.y`). */
function localToWorld(position: Position, lx: number, lz: number): [number, number] {
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  return [position.x + lx * c + lz * s, position.z - lx * s + lz * c];
}

function inBuilding(b: Building, x: number, z: number, margin: number): boolean {
  const c = detCos(b.position.rotation);
  const s = detSin(b.position.rotation);
  const dx = x - b.position.x;
  const dz = z - b.position.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return (
    lx > b.box.minX - margin &&
    lx < b.box.maxX + margin &&
    lz > b.box.minZ - margin &&
    lz < b.box.maxZ + margin
  );
}

function buildingBounds(b: Building, margin: number): [number, number, number, number] {
  const corners = [
    localToWorld(b.position, b.box.minX - margin, b.box.minZ - margin),
    localToWorld(b.position, b.box.maxX + margin, b.box.minZ - margin),
    localToWorld(b.position, b.box.maxX + margin, b.box.maxZ + margin),
    localToWorld(b.position, b.box.minX - margin, b.box.maxZ + margin),
  ];
  return [
    Math.min(...corners.map((p) => p[0])),
    Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])),
  ];
}

/**
 * Obdélník obydlí pro pěšiny: na pozemku celé oplocené políčko (brána = branka na přední
 * straně proti vchodu), volné obydlí jako dům se šíjí, rozestavěné jako staveniště.
 */
function dwellingBox(d: PathVillage['dwellings'][number]): PathBox {
  if (d.plot) return plotPathBox(d.position, d.plot);
  return d.built ? DWELLING_PATH_BOX_M[d.type] : sitePathBox(d.type);
}

/**
 * Dům se střechou a šíjí v souřadnicích domu (x napříč, z k vchodu) – stejný obdélník jako
 * u slepic a postav ve scéně (`chickenBox` + `houseBox` ve webu, hlídá test).
 */
export const DWELLING_PATH_BOX_M: Record<DwellingType, PathBox> = {
  zemnice: { minX: -2.9, maxX: 2.9, minZ: -3.3, maxZ: 4.2 },
  polozemnice: { minX: -3.4, maxX: 3.4, minZ: -3.8, maxZ: 3.8 },
  dvorec: { minX: -3.8, maxX: 3.8, minZ: -5.9, maxZ: 5.9 },
};
/** Staveniště sahá s hromadou hlíny a nářadím před dům nejméně tak daleko (m). */
const SITE_FRONT_M = 5;

/** Staveniště: celá vyklízená plocha (jako `siteBox` postav ve scéně). */
function sitePathBox(type: DwellingType): PathBox {
  const clearance = DWELLING_CLEARING_M[type];
  return {
    minX: clearance.minX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(DWELLING_PATH_BOX_M[type].maxZ, SITE_FRONT_M),
  };
}

/** Oplocený pozemek v osách domu (jako `plotBox` postav ve scéně) – u dvorce i se dvorem. */
function plotPathBox(
  position: Position,
  plot: { x: number; z: number; size: number; yard?: { x: number; z: number } },
): PathBox {
  const h = plot.size / 2;
  const c = detCos(position.rotation);
  const s = detSin(position.rotation);
  const minX = Math.min(plot.x, plot.yard?.x ?? plot.x) - h;
  const maxX = Math.max(plot.x, plot.yard?.x ?? plot.x) + h;
  const minZ = Math.min(plot.z, plot.yard?.z ?? plot.z) - h;
  const maxZ = Math.max(plot.z, plot.yard?.z ?? plot.z) + h;
  const local = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
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

/** Brána domu – kus před koncem šíje (odtud vychází pěšina). */
function gateOf(b: Building): PathPoint {
  const [x, z] = localToWorld(b.position, 0, b.box.maxZ + GATE_M);
  return { x, z };
}

/**
 * Mřížka pro hledání: terén (i s překážkami krajiny), k němu stavby vsi (pole podle stadia, sad,
 * hřbitov) a neprůchodné domy.
 */
function villageGrid(input: PathNetworkInput, buildings: readonly Building[]): Grid {
  const t = input.terrain;
  const grid: Grid = {
    width: t.width,
    height: t.height,
    originX: t.originX,
    originZ: t.originZ,
    cellM: t.cellM,
    base: new Float32Array(t.cost),
    flags: t.flags,
    village: new Uint8Array(t.width * t.height),
  };
  const v = input.village;
  for (const field of v.fields) {
    // hrana mezi díly téhož pole je uvnitř pole (meze nejsou) – cena podle nejbližšího dílu
    const nearestPart = nearestPartFinder(field.parts, field.parts[0]?.size ?? 0);
    for (const c of squareCells(grid, field.parts).inside) {
      const stage = nearestPart(cellX(grid, c), cellZ(grid, c)).stage;
      grid.base[c] = grid.base[c]! * STAGE_COST[stage];
      grid.village[c] = 1;
    }
  }
  for (const orchard of v.orchards ?? []) {
    for (const c of squareCells(grid, orchard.squares).inside) {
      grid.base[c] = grid.base[c]! * ORCHARD_COST;
      grid.village[c] = 1;
    }
  }
  for (const cemetery of v.cemeteries ?? []) {
    for (const c of squareCells(grid, cemetery.squares).inside) {
      grid.base[c] = grid.base[c]! * CEMETERY_COST;
      grid.village[c] = 1;
    }
  }
  for (const pen of v.pens ?? []) {
    for (const c of squareCells(grid, [pen]).inside) {
      grid.base[c] = grid.base[c]! * PEN_COST;
      grid.village[c] = 1;
    }
  }
  const woods = (v.woods ?? []).filter((w) => w.surface !== 'forest');
  if (woods.length > 0) {
    for (const c of squareCells(grid, woods).inside) grid.base[c] = grid.base[c]! * WOOD_COST;
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
        grid.base[c] = grid.base[c]! * SHRINE_COST;
        grid.village[c] = 1;
      },
    );
  }
  for (const b of buildings) {
    const [x0, z0, x1, z1] = buildingBounds(b, HOUSE_MARGIN_M);
    cellsIn(grid, x0, z0, x1, z1, (c, x, z) => {
      if (!inBuilding(b, x, z, HOUSE_MARGIN_M)) return;
      grid.base[c] = Infinity;
      grid.village[c] = 1;
    });
  }
  return grid;
}

/** Nejbližší průchodná buňka k bodu (do `reach` buněk), nebo −1. */
function passableNear(grid: Grid, x: number, z: number, reach: number): number {
  const ci = Math.round((x - grid.originX) / grid.cellM);
  const cj = Math.round((z - grid.originZ) / grid.cellM);
  let best = -1;
  let bestD = Infinity;
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) continue;
      const c = j * grid.width + i;
      if (!Number.isFinite(grid.base[c]!)) continue;
      const d = length2(grid.originX + i * grid.cellM - x, grid.originZ + j * grid.cellM - z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
  }
  return best;
}

/** Průchodné buňky do `radius` m od bodu (aspoň nejbližší jedna). */
function cellsAround(grid: Grid, p: PathPoint, radius: number): number[] {
  const out: number[] = [];
  cellsIn(grid, p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c, x, z) => {
    if (length2(x - p.x, z - p.z) <= radius && Number.isFinite(grid.base[c]!)) out.push(c);
  });
  if (out.length === 0) {
    const near = passableNear(grid, p.x, p.z, 3);
    if (near >= 0) out.push(near);
  }
  return out;
}

/**
 * Buňky pevných cest (síla ROAD_STRENGTH, jinak 0) – osy se projdou po třetinách buňky a označí
 * se nejbližší buňka, takže cesta je souvislá řada buněk. Bez cest null.
 */
function roadCells(grid: Grid, roads: PathVillage['roads']): Float32Array | null {
  if (!roads || roads.length === 0) return null;
  const fixed = new Float32Array(grid.width * grid.height);
  const step = grid.cellM / 3;
  const mark = (x: number, z: number): void => {
    const i = Math.round((x - grid.originX) / grid.cellM);
    const j = Math.round((z - grid.originZ) / grid.cellM);
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return;
    const c = j * grid.width + i;
    if (Number.isFinite(grid.base[c]!)) fixed[c] = ROAD_STRENGTH;
  };
  for (const road of roads) {
    const pts = road.points;
    if (pts.length === 1) mark(pts[0]!.x, pts[0]!.z);
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const n = Math.max(1, Math.ceil(length2(b.x - a.x, b.z - a.z) / step));
      for (let s = 0; s <= n; s++) mark(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n);
    }
  }
  return fixed;
}

// --- cesty -----------------------------------------------------------------------------------

interface Household {
  dwellingId: number;
  gate: number;
  /** Brána přesně (pěšina končí u ní, buňka `gate` je střed buňky). */
  gatePoint: PathPoint;
  /** Lidí v domácnosti (odhad). */
  size: number;
  /** Jak vyšlapaná jsou její spojení podle stáří obydlí (0–1). */
  age: number;
  /** Stáří obydlí v herních letech (PATH_YEARS_UNKNOWN, když ho obydlí nenese). */
  years: number;
  x: number;
  z: number;
}

/** Skupina cest do jednoho cíle: buňky cíle a kolik cest za den k němu vede z každé domácnosti. */
interface TripGroup {
  /** Pochůzka pro vodu nebo dřevo – konec trasy si domácnost zapamatuje (postavy tam chodí). */
  errand?: keyof PathErrands;
  sources: number[];
  weights: number[];
  /** Stáří spojení po domácnostech (roky) – bez údaje stáří domácnosti. */
  years?: number[];
  maxCost: number;
  /**
   * Pochůzka: buňky míst (1 = sem se chodí) a po prvním kole, jak daleko smí hledání každé
   * domácnosti (cena) – další kola hledají každé domácnosti zvlášť od brány k nejbližšímu místu
   * podle cen se slevou, aby se trasy sousedů mohly slít.
   */
  marks?: Uint8Array;
  reach?: number[];
  /** Místo, ke kterému domácnost došla v prvním kole – směr pro A* dalších hledání. */
  goals?: number[];
  /** Stavba, jejíž provoz se počítá do `PathNetwork.visits` (`<druh>:<id>`). */
  visit?: string;
}

function households(
  village: PathVillage,
  grid: Grid,
  buildings: Map<number, Building>,
): Household[] {
  const day = village.labor?.day ?? null;
  const homes = village.dwellings.filter((d) => d.built && d.inhabited !== false);
  // zakladatelé bydlí na staveništi první zemnice
  const settled = homes.length > 0 ? homes : village.dwellings;
  const people = village.labor
    ? village.labor.people.adults + village.labor.people.children + village.labor.people.elders
    : settled.length * DEFAULT_HOUSEHOLD;
  const weight = (type: DwellingType): number => (type === 'polozemnice' ? 1.5 : 1);
  const total = settled.reduce((s, d) => s + weight(d.type), 0);
  const out: Household[] = [];
  for (const d of settled) {
    const b = buildings.get(d.id);
    if (!b) continue;
    const gatePoint = gateOf(b);
    const gate = passableNear(grid, gatePoint.x, gatePoint.z, 2);
    if (gate < 0) continue;
    const years =
      d.since !== undefined && day !== null
        ? Math.max(0, (day - d.since) / DAYS_PER_YEAR)
        : PATH_YEARS_UNKNOWN;
    out.push({
      dwellingId: d.id,
      gate,
      gatePoint,
      size: total > 0 ? (people * weight(d.type)) / total : DEFAULT_HOUSEHOLD,
      age: pathAgeFactor(years),
      years: Math.min(PATH_YEARS_UNKNOWN, years),
      x: d.position.x,
      z: d.position.z,
    });
  }
  return out;
}

/** Cesty za den celé vsi rozdělené mezi domácnosti podle velikosti a stáří. */
function shareWeights(homes: readonly Household[], trips: number, targetAge = 1): number[] {
  const total = homes.reduce((s, h) => s + h.size, 0);
  return homes.map((h) => (total > 0 ? (trips * h.size * Math.min(h.age, targetAge)) / total : 0));
}

function tripGroups(
  input: PathNetworkInput,
  grid: Grid,
  homes: readonly Household[],
  buildings: Map<number, Building>,
): TripGroup[] {
  const v = input.village;
  const groups: TripGroup[] = [];
  const labor = new Map(laborByTarget(v));
  const work = (key: string): number => (labor.get(key) ?? 0) * TRIPS_PER_MAN_DAY;

  const target = (sources: number[], trips: number, targetAge = 1, visit?: string): void => {
    if (sources.length === 0 || trips <= 0) return;
    groups.push({
      sources,
      weights: shareWeights(homes, trips, targetAge),
      maxCost: groupReach(grid, sources, homes),
      ...(visit ? { visit } : {}),
    });
  };
  const squaresTarget = (squares: readonly Square[]): number[] => {
    const { inside, edge } = squareCells(grid, squares);
    return [...inside, ...edge].filter((c) => Number.isFinite(grid.base[c]!));
  };

  for (const field of v.fields) {
    const sown = field.parts.some((p) => p.stage === 'sown' || p.stage === 'ready');
    const founding = field.parts.every((p) => p.stage === 'founding');
    const base = sown || founding ? BASE_TRIPS.field : BASE_TRIPS.fallow;
    // nově zakládané pole: pěšina se teprve vyšlapává
    target(squaresTarget(field.parts), base + work(`field:${field.id}`), founding ? 0.5 : 1);
  }
  // sad: zavedené místo jen k nejbližšímu sadu, práce dne tam, kde se dnes pracuje
  const orchards = v.orchards ?? [];
  const nearestOrchard = nearestOfKind(
    homes,
    orchards.map((o) => o.squares),
  );
  orchards.forEach((orchard, k) => {
    const sources = squaresTarget(orchard.squares);
    if (sources.length === 0) return;
    const base = shareWeights(homes, BASE_TRIPS.orchard);
    const builders = shareWeights(homes, work(`orchard:${orchard.id}`));
    const weights = homes.map((_, i) => builders[i]! + (nearestOrchard[i] === k ? base[i]! : 0));
    if (weights.every((w) => w < MIN_TRIP)) return;
    groups.push({ sources, weights, maxCost: groupReach(grid, sources, homes) });
  });
  // hřbitov: návštěvy hrobů podle lidí v domácnosti (k nejbližšímu hřbitovu) a práce dne
  const cemeteries = v.cemeteries ?? [];
  const nearestCemetery = nearestOfKind(
    homes,
    cemeteries.map((c) => c.squares),
  );
  cemeteries.forEach((cemetery, k) => {
    const sources = squaresTarget(cemetery.squares);
    if (sources.length === 0) return;
    const builders = shareWeights(homes, work(`cemetery:${cemetery.id}`));
    const weights = homes.map(
      (h, i) =>
        builders[i]! + (nearestCemetery[i] === k ? CEMETERY_VISITS_PER_PERSON * h.size * h.age : 0),
    );
    if (weights.every((w) => w <= 0)) return;
    groups.push({
      sources,
      weights,
      maxCost: groupReach(grid, sources, homes),
      visit: `cemetery:${cemetery.id}`,
    });
  });
  // vylepšení pevné cesty (roads.md) – nosí se k polovině úseku
  for (const road of v.roads ?? []) {
    if (road.id === undefined || road.points.length === 0) continue;
    const trips = work(`road:${road.id}`);
    if (trips > 0) target(cellsAround(grid, middleOf(road.points), 3), trips);
  }
  // ohrada: krmení a napájení dobytka, stavba a rádlo (práce dne na ohradě); do ohrady bez
  // zvířat se krmit nechodí (abandonment.md)
  for (const pen of v.pens ?? []) {
    const base = pen.built ? (pen.stocked === false ? 0 : BASE_TRIPS.pen) : BASE_TRIPS.site;
    target(squaresTarget([pen]), base + work(`pen:${pen.id}`), 1, `pen:${pen.id}`);
  }
  // stáda na pastvu – na úhor vsi (louka na seno až po seči; v roční síti obojí)
  const herds = pastureHerds(v.livestock);
  if (herds > 0) {
    const aftermath = input.annual || AFTERMATH_MONTHS.includes(v.labor?.month ?? 6);
    // jen díly, které stáda opravdu spásají (fields.md – Zarůstání – nejbližší příloh napřed)
    const pasture = v.fields.flatMap((f) =>
      f.parts.filter(
        (p) =>
          p.grazed !== false && (p.stage === 'young-fallow' || (aftermath && p.stage === 'meadow')),
      ),
    );
    if (pasture.length > 0) {
      target(squaresTarget(pasture), herds * PASTURE.tripsPerHerd);
    }
  }
  // staveniště nových obydlí – nosí se k jejich čelu
  for (const d of v.dwellings) {
    const b = buildings.get(d.id);
    if (!b) continue;
    if (!d.built) {
      target(cellsAround(grid, gateOf(b), 2.5), BASE_TRIPS.site + work(`site:${d.id}`));
    } else {
      const repair = work(`dwelling:${d.id}`);
      if (repair > 0) target(cellsAround(grid, gateOf(b), 2.5), repair);
    }
  }
  // seč přirozených luk (oxen.md – Seno): k políčkům, kde se dnes seče, chodí sekáči
  if (v.hayMeadows && v.hayMeadows.length > 0) {
    const byCell = new Map(v.hayMeadows.map((m) => [`${m.cell.x},${m.cell.y}`, m]));
    for (const t of v.labor?.shares ?? []) {
      if (t.target.kind !== 'meadow') continue;
      const squares = t.target.cells.flatMap((c) => {
        const m = byCell.get(`${c.x},${c.y}`);
        return m ? [m] : [];
      });
      target(squaresTarget(squares), t.manDays * TRIPS_PER_MAN_DAY);
    }
  }
  for (const t of v.labor?.shares ?? []) {
    if (t.target.kind !== 'trees' || !input.tree) continue;
    const trees = t.target.ids.flatMap((id) => {
      const p = input.tree?.(id);
      return p ? [p] : [];
    });
    const sources = trees.flatMap((p) => cellsAround(grid, p, 2.5));
    target(sources, t.manDays * TRIPS_PER_MAN_DAY);
  }
  // posvátná místa: každá domácnost chodí jen k nejbližšímu místu každého druhu (posvátný dub,
  // háj, modla, svatyně – Martin); rozestavěná modla a svatyně jsou staveniště (práce dne)
  const visit = (
    places: readonly { sources: number[]; at: readonly PathPoint[]; visit?: string }[],
  ): void => {
    if (places.length === 0) return;
    const nearest = nearestOfKind(
      homes,
      places.map((p) => p.at),
    );
    const weights = shareWeights(homes, BASE_TRIPS.sacred);
    places.forEach((place, k) => {
      const own = weights.map((w, i) => (nearest[i] === k ? w : 0));
      if (place.sources.length === 0 || own.every((w) => w < MIN_TRIP)) return;
      groups.push({
        sources: place.sources,
        weights: own,
        maxCost: groupReach(grid, place.sources, homes),
        ...(place.visit ? { visit: place.visit } : {}),
      });
    });
  };
  visit(
    (v.sacred?.oaks ?? []).map((oak) => ({
      sources: cellsAround(grid, oak, OAK_REACH_M),
      at: [oak],
    })),
  );
  visit(
    (v.sacred?.groves ?? []).map((grove) => ({
      sources: squaresTarget(grove.squares),
      at: grove.squares,
    })),
  );
  const sacredBuildings = v.sacred?.buildings ?? [];
  for (const kind of ['idol', 'shrine'] as const) {
    visit(
      sacredBuildings
        .filter((b) => b.built && b.kind === kind)
        .map((b) => ({
          sources: cellsAround(
            grid,
            b.position,
            SACRED_BUILDINGS[b.kind].footprintM / 2 + grid.cellM,
          ),
          at: [b.position],
          visit: `${b.kind}:${b.id}`,
        })),
    );
  }
  for (const b of sacredBuildings) {
    if (b.built) continue;
    const half = SACRED_BUILDINGS[b.kind].footprintM / 2;
    target(
      cellsAround(grid, b.position, half + grid.cellM),
      BASE_TRIPS.site + work(`site:${b.id}`),
    );
  }
  // sousedé – každá domácnost se dvěma nejbližšími (dvojice jednou)
  const pairs = new Set<string>();
  homes.forEach((h, a) => {
    const near = homes
      .map((o, b) => ({ b, d: length2(o.x - h.x, o.z - h.z) }))
      .filter((n) => n.b !== a)
      .sort((p, q) => p.d - q.d || p.b - q.b)
      .slice(0, NEIGHBOURS);
    for (const { b } of near) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const weights = homes.map((_, k) =>
        k === b ? NEIGHBOUR_TRIPS * Math.min(h.age, homes[b]!.age) : 0,
      );
      const years = homes.map(() => Math.min(h.years, homes[b]!.years));
      groups.push({
        sources: [h.gate],
        weights,
        years,
        maxCost: groupReach(grid, [h.gate], homes),
      });
    }
  });
  return groups;
}

/**
 * Pochůzky pro vodu (suchý břeh u potoka) a pro dřevo (okraj lesa) – mimo stavby vsi, každá
 * domácnost k nejbližšímu místu. Cest za den: voda podle lidí v domácnosti, dřevo na domácnost
 * (v zimní půlce roku víc). Hledá se od všech míst najednou k branám.
 */
function errandGroups(
  annual: boolean,
  village: PathVillage,
  grid: Grid,
  homes: readonly Household[],
): TripGroup[] {
  const all = grid.width * grid.height;
  const water: number[] = [];
  const wood: number[] = [];
  for (let c = 0; c < all; c++) {
    if (grid.village[c] || grid.base[c] === Infinity) continue;
    const f = grid.flags[c]!;
    if (f & PATH_WATER_SPOT) water.push(c);
    if (f & PATH_FOREST_EDGE) wood.push(c);
  }
  const winter = WINTER_MONTHS.includes(village.labor?.month ?? 6);
  const woodTrips = annual
    ? (WOOD_TRIPS.winter * WINTER_MONTHS.length + WOOD_TRIPS.summer * (12 - WINTER_MONTHS.length)) /
      12
    : winter
      ? WOOD_TRIPS.winter
      : WOOD_TRIPS.summer;
  const groups: TripGroup[] = [];
  const marksOf = (cells: readonly number[]): Uint8Array => {
    const marks = new Uint8Array(all);
    for (const c of cells) marks[c] = 1;
    return marks;
  };
  if (water.length > 0) {
    groups.push({
      errand: 'water',
      marks: marksOf(water),
      sources: water,
      weights: homes.map((h) => WATER_TRIPS_PER_PERSON * h.size * h.age),
      maxCost: ERRAND_MAX_COST,
      goals: nearestByAir(grid, water, homes),
    });
  }
  if (wood.length > 0) {
    groups.push({
      errand: 'wood',
      marks: marksOf(wood),
      sources: wood,
      weights: homes.map((h) => woodTrips * h.age),
      maxCost: ERRAND_MAX_COST,
      goals: nearestByAir(grid, wood, homes),
    });
  }
  return groups;
}

/**
 * Nejbližší místo daného druhu každé domácnosti (index v `places`, −1 = žádné): vzdušnou čarou
 * od domu k nejbližšímu bodu místa (čtverce, kmene, stavby), při shodě první místo. K zavedeným
 * místům (posvátná místa, hřbitov, sad) chodí domácnost jen k nejbližšímu (Martin).
 */
function nearestOfKind(
  homes: readonly Household[],
  places: readonly (readonly PathPoint[])[],
): number[] {
  return homes.map((h) => {
    let best = -1;
    let bestD = Infinity;
    places.forEach((points, k) => {
      for (const p of points) {
        const d = length2(p.x - h.x, p.z - h.z);
        if (d < bestD) {
          best = k;
          bestD = d;
        }
      }
    });
    return best;
  });
}

/** Nejbližší místo pochůzky každé domácnosti vzdušnou čarou (−1 = žádné) – směr pro A*. */
function nearestByAir(grid: Grid, cells: readonly number[], homes: readonly Household[]): number[] {
  return homes.map((h) => {
    let best = -1;
    let bestD = Infinity;
    for (const c of cells) {
      const d = length2(cellX(grid, c) - h.x, cellZ(grid, c) - h.z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  });
}

/**
 * Nejvyšší cena hledání do cíle: k nejvzdálenější domácnosti přímo, s rezervou na objížďku – když
 * je některá brána nedosažitelná, hledání neprojde celé okno.
 */
function groupReach(grid: Grid, sources: readonly number[], homes: readonly Household[]): number {
  let sx = 0;
  let sz = 0;
  for (const c of sources) {
    sx += cellX(grid, c);
    sz += cellZ(grid, c);
  }
  sx /= sources.length;
  sz /= sources.length;
  let spread = 0;
  for (const c of sources)
    spread = Math.max(spread, length2(cellX(grid, c) - sx, cellZ(grid, c) - sz));
  let far = 0;
  for (const h of homes) far = Math.max(far, length2(h.x - sx, h.z - sz));
  return (far + spread + 40) * 6;
}

// --- hledání ---------------------------------------------------------------------------------

/** Binární halda (min) nad buňkami s cenou – líné mazání (zastaralé záznamy se přeskočí). */
export class PathHeap {
  private keys = new Float64Array(1024);
  private cells = new Int32Array(1024);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(cell: number, key: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
      const cells = new Int32Array(this.size * 2);
      cells.set(this.cells);
      this.cells = cells;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.keys[i] = this.keys[parent]!;
      this.cells[i] = this.cells[parent]!;
      i = parent;
    }
    this.keys[i] = key;
    this.cells[i] = cell;
  }

  /** Vyjme nejlevnější buňku; cenu vrátí přes `topKey`. */
  pop(): number {
    const cell = this.cells[0]!;
    this.topKey = this.keys[0]!;
    const lastKey = this.keys[--this.size]!;
    const lastCell = this.cells[this.size]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= lastKey) break;
      this.keys[i] = this.keys[child]!;
      this.cells[i] = this.cells[child]!;
      i = child;
    }
    this.keys[i] = lastKey;
    this.cells[i] = lastCell;
    return cell;
  }

  topKey = 0;
}

const NEIGHBOURS_8: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [-1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, -1, SQRT2],
];
const DI = Int8Array.from(NEIGHBOURS_8.map((n) => n[0]));
const DJ = Int8Array.from(NEIGHBOURS_8.map((n) => n[1]));
const STEP = Float64Array.from(NEIGHBOURS_8.map((n) => n[2]));

interface SearchState {
  /**
   * Ceny jako Float64 – zaokrouhlení na Float32 by dělalo z platných záznamů haldy zastaralé.
   * Platí jen u buněk s `stamp` tohoto hledání (pole se mezi hledáními nenuluje).
   */
  dist: Float64Array;
  stamp: Uint32Array;
  run: number;
  parent: Int32Array;
  heap: PathHeap;
  /** Brány domácností, ke kterým hledání ještě má dojít (1 = čeká). */
  sinks: Uint8Array;
}

/**
 * Dijkstra z buněk `sources` po mřížce s cenou `cost` (Infinity = neprůchodné). Po každé
 * vyjmuté buňce se zeptá `done(c)` – true hledání ukončí; skončí i nad `maxCost`. S buňkou
 * `toward` je to A* (odhad vzdušnou čarou k ní × A_STAR_WEIGHT – jen směr hledání, `done` může
 * skončit i jinde). Úhlopříčně jen kolem průchodných rohů (neproklouzne rohem domu ani podél
 * vody).
 */
function search(
  grid: Grid,
  cost: Float32Array,
  sources: readonly number[],
  maxCost: number,
  state: SearchState,
  done: (c: number) => boolean,
  toward = -1,
): void {
  const { dist, parent, heap, stamp } = state;
  const run = ++state.run;
  heap.clear();
  const w = grid.width;
  const h = grid.height;
  const m = grid.cellM / 2;
  const ti = toward >= 0 ? toward % w : 0;
  const tj = toward >= 0 ? (toward - ti) / w : 0;
  const weight = toward >= 0 ? A_STAR_WEIGHT * grid.cellM : 0;
  const estimate = (c: number): number => {
    const ci = c % w;
    return length2(ci - ti, (c - ci) / w - tj) * weight;
  };
  for (const s of sources) {
    if (stamp[s] === run) continue;
    stamp[s] = run;
    dist[s] = 0;
    parent[s] = -1;
    heap.push(s, weight > 0 ? estimate(s) : 0);
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const d = weight > 0 ? dist[c]! : heap.topKey;
    if (weight > 0 ? heap.topKey > d + estimate(c) + 1e-9 : d > dist[c]!) continue;
    if (d > maxCost || done(c)) break;
    const i = c % w;
    const j = (c - i) / w;
    const own = cost[c]!;
    for (let k = 0; k < 8; k++) {
      const di = DI[k]!;
      const dj = DJ[k]!;
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      if (k >= 4 && (cost[j * w + ii] === Infinity || cost[jj * w + i] === Infinity)) continue;
      const nd = d + (own + next) * STEP[k]! * m;
      if (stamp[n] !== run || nd < dist[n]!) {
        stamp[n] = run;
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, weight > 0 ? nd + estimate(n) : nd);
      }
    }
  }
}

/**
 * Provoz kola – po buňkách a po hranách mezi sousedními buňkami: hrana je u buňky s menším
 * indexem, 4 směry na buňku (edgeSlot).
 */
interface Traffic {
  cells: Float32Array;
  edges: Float32Array;
  /** Součet provoz × stáří spojení po hranách – průměrné stáří pěšiny. */
  edgeYears: Float32Array;
  trips: number;
}

/** Index hrany mezi sousedními buňkami a, b v poli `Traffic.edges` (4 na buňku: V, J, JV, JZ). */
function edgeSlot(width: number, a: number, b: number): number {
  const lo = a < b ? a : b;
  const d = (a < b ? b : a) - lo;
  const dir = d === 1 ? 0 : d === width ? 1 : d === width + 1 ? 2 : 3;
  return lo * 4 + dir;
}

/** Druhý konec hrany ze slotu (inverze edgeSlot). */
function edgeOther(width: number, slot: number): [number, number] {
  const lo = slot >> 2;
  const dir = slot & 3;
  const d = dir === 0 ? 1 : dir === 1 ? width : dir === 2 ? width + 1 : width - 1;
  return [lo, lo + d];
}

/** Přičte provoz buňce a hned jí sníží cenu podle síly vyšlapané pěšiny. */
function treadCell(traffic: Traffic, costs: PassCosts, c: number, weight: number): void {
  traffic.cells[c] = traffic.cells[c]! + weight;
  const strength = Math.max(costs.previous[c]!, pathStrength(traffic.cells[c]!));
  costs.cost[c] = costs.base[c]! * (1 - PATH_DISCOUNT * strength);
}

/** Ceny kola: základ, síla pěšin z minulého kola a ceny se slevou, které se průběžně snižují. */
interface PassCosts {
  base: Float32Array;
  previous: Float32Array;
  cost: Float32Array;
}

/**
 * Přičte cestu z buňky `from` po rodičích hledání až k jeho zdroji; vrátí zdroj. Buňkám na trase
 * hned sníží cenu podle nového provozu – další trasy kola se k vyšlapané pěšině přidají (aktivní
 * chodci po sobě, ne všichni naráz).
 */
function addTrip(
  state: SearchState,
  traffic: Traffic,
  costs: PassCosts,
  width: number,
  from: number,
  weight: number,
  years: number,
): number {
  const all = traffic.cells.length;
  let c = from;
  treadCell(traffic, costs, c, weight);
  traffic.trips++;
  for (let guard = 0; guard < all; guard++) {
    const p = state.parent[c]!;
    if (p < 0) break;
    treadCell(traffic, costs, p, weight);
    const slot = edgeSlot(width, c, p);
    traffic.edges[slot] = traffic.edges[slot]! + weight;
    traffic.edgeYears[slot] = traffic.edgeYears[slot]! + weight * years;
    c = p;
  }
  return c;
}

/**
 * Jedno kolo: skupiny od nejvytíženější. Cíl – jediná domácnost: hledání od buněk cíle k její
 * bráně; víc domácností: každá zvlášť (A* od cíle k její bráně), nejvytíženější první – další se
 * k pěšině, kterou ta před ní právě vyšlapala, přidá (souběžné pěšiny nevzniknou). Pochůzka – v prvním kole od všech míst najednou (každá domácnost dojde k nejbližšímu),
 * v dalších každá domácnost zvlášť od brány (cestou se přidá k pěšině souseda). Trasy se
 * přičtou do provozu; u pochůzek si domácnost zapamatuje, kam došla (`ends`).
 */
function routeAll(
  grid: Grid,
  costs: PassCosts,
  homes: readonly Household[],
  groups: readonly TripGroup[],
  state: SearchState,
  ends: Map<number, PathErrands> | null,
): Traffic {
  const traffic: Traffic = {
    cells: new Float32Array(grid.width * grid.height),
    edges: new Float32Array(grid.width * grid.height * 4),
    edgeYears: new Float32Array(grid.width * grid.height * 4),
    trips: 0,
  };
  const remember = (group: TripGroup, k: number, end: number): void => {
    if (!ends || !group.errand) return;
    const home = homes[k]!;
    const entry = ends.get(home.dwellingId) ?? { water: null, wood: null };
    entry[group.errand] = { x: cellX(grid, end), z: cellZ(grid, end) };
    ends.set(home.dwellingId, entry);
  };
  const sinks = state.sinks;
  /** Hledání od buněk skupiny ke všem branám s cestou; vrátí, jestli nějaká brána čekala. */
  const toGates = (group: TripGroup): boolean => {
    let remaining = 0;
    group.weights.forEach((w, k) => {
      const gate = homes[k]!.gate;
      if (w >= MIN_TRIP && !sinks[gate]) {
        sinks[gate] = 1;
        remaining++;
      }
    });
    if (remaining === 0) return false;
    search(grid, costs.cost, group.sources, group.maxCost, state, (c) => {
      if (sinks[c]) {
        sinks[c] = 0;
        remaining--;
      }
      return remaining === 0;
    });
    for (const home of homes) sinks[home.gate] = 0;
    return true;
  };
  /** Brána domácnosti `k` byla v posledním hledání dosažena (a ne moc daleko). */
  const reached = (group: TripGroup, k: number): boolean => {
    const gate = homes[k]!.gate;
    return state.stamp[gate] === state.run && state.dist[gate]! <= group.maxCost;
  };
  for (const group of groups) {
    const marks = group.marks;
    if (marks) {
      const first = !group.reach;
      const reach = group.reach ?? homes.map(() => group.maxCost);
      const goals = group.goals ?? [];
      // každá domácnost zvlášť od brány k nejbližšímu místu – po sobě, takže se další přidá
      // k pěšině, kterou vyšlapali sousedé
      const trail = errandTrail(grid.width * grid.height);
      group.weights.forEach((w, k) => {
        if (w < MIN_TRIP) return;
        const gate = homes[k]!.gate;
        const at = searchErrand(
          grid,
          costs.cost,
          gate,
          marks,
          trail,
          reach[k]!,
          state,
          goals[k] ?? -1,
        );
        if (at < 0) {
          // pro vodu / dřevo nemá kam (moc daleko, za vodou) – další kola už nehledají
          group.weights[k] = 0;
          return;
        }
        if (first) {
          const total = state.dist[at]! + (marks[at] ? 0 : trail.rest[at]!);
          reach[k] = total * ERRAND_REACH.factor + ERRAND_REACH.extra;
          // daleko se chodí méně často (s větším nákladem) – pěšina tam vznikne, až když se slije
          group.weights[k] = w * Math.min(1, ERRAND_NEAR_COST / Math.max(1, total));
        }
        const trips = group.weights[k]!;
        const years = group.years?.[k] ?? homes[k]!.years;
        const end = addErrand(grid, state, traffic, costs, trail, marks, at, trips, years);
        remember(group, k, end);
      });
      group.reach = reach;
      continue;
    }
    const walkers = group.weights
      .map((w, k) => ({ w, k }))
      .filter(({ w }) => w >= MIN_TRIP)
      .sort((a, b) => b.w - a.w || a.k - b.k);
    if (walkers.length === 1) {
      // jediná domácnost – jedno hledání od cíle k její bráně
      if (!toGates(group)) continue;
    }
    for (const { w, k } of walkers) {
      const home = homes[k]!;
      if (walkers.length > 1) {
        // víc domácností ke stejnému cíli: každá zvlášť, nejvytíženější první – další se po
        // čerstvě vyšlapané pěšině přidá k ní (Martin: „Pokud už cesta vede tím směrem, lidé by
        // měli použít tu, ne si prošlapat vlastní souběžnou.“)
        const gate = home.gate;
        search(grid, costs.cost, group.sources, group.maxCost, state, (c) => c === gate, gate);
      }
      if (!reached(group, k)) {
        // nedosažitelná brána (nebo moc daleko) – další kola ji už nehledají
        group.weights[k] = 0;
        continue;
      }
      const years = group.years?.[k] ?? home.years;
      addTrip(state, traffic, costs, grid.width, home.gate, w, years);
    }
  }
  return traffic;
}

/** Pěšina pochůzky v kole: kudy se z buňky jde dál k místu, kolik to ještě stojí a kam vede. */
interface ErrandTrail {
  /** Další buňka po trase k místu (−1 = buňka na trase není). */
  next: Int32Array;
  rest: Float64Array;
  end: Int32Array;
}

function errandTrail(all: number): ErrandTrail {
  return {
    next: new Int32Array(all).fill(-1),
    rest: new Float64Array(all),
    end: new Int32Array(all),
  };
}

/** Cena kroku mezi sousedními buňkami (jako v hledání). */
function stepCost(grid: Grid, cost: Float32Array, a: number, b: number): number {
  const d = Math.abs(a - b);
  const diagonal = d !== 1 && d !== grid.width;
  return ((cost[a]! + cost[b]!) / 2) * (diagonal ? SQRT2 : 1) * grid.cellM;
}

/**
 * A* od brány k nejbližšímu místu pochůzky – nebo k pěšině souseda, která k místu vede (cena =
 * cesta k ní + zbytek po ní): domácnost se přidá k vyšlapané pěšině, jen když se jí to vyplatí,
 * a hledání skončí brzo. Vrátí buňku, kde skončilo (místo, nebo napojení na pěšinu), nebo −1.
 * Odhad A* vzdušnou čarou k `toward` (místo nejblíž vzdušnou čarou) × A_STAR_WEIGHT.
 */
function searchErrand(
  grid: Grid,
  cost: Float32Array,
  gate: number,
  marks: Uint8Array,
  trail: ErrandTrail,
  maxCost: number,
  state: SearchState,
  toward: number,
): number {
  const { dist, parent, heap, stamp } = state;
  const run = ++state.run;
  heap.clear();
  const w = grid.width;
  const h = grid.height;
  const m = grid.cellM / 2;
  const ti = toward >= 0 ? toward % w : 0;
  const tj = toward >= 0 ? (toward - ti) / w : 0;
  const weight = toward >= 0 ? A_STAR_WEIGHT * grid.cellM : 0;
  const estimate = (c: number): number => {
    const ci = c % w;
    return length2(ci - ti, (c - ci) / w - tj) * weight;
  };
  // cíl hledání: místo (zbývá 0) nebo pěšina k místu (zbývá cena po ní) – záznam −(c + 1);
  // cíl se přijme o něco dřív (GOAL_SLACK), hledání pak neprochází celé okolí
  const offer = (c: number, g: number): void => {
    if (marks[c]) heap.push(-(c + 1), g / GOAL_SLACK);
    else if (trail.next[c]! >= 0) heap.push(-(c + 1), (g + trail.rest[c]!) / GOAL_SLACK);
  };
  stamp[gate] = run;
  dist[gate] = 0;
  parent[gate] = -1;
  heap.push(gate, estimate(gate));
  offer(gate, 0);
  while (heap.size > 0) {
    const entry = heap.pop();
    if (entry < 0) return -entry - 1;
    if (heap.topKey > maxCost) return -1;
    const c = entry;
    const d = dist[c]!;
    if (heap.topKey > d + estimate(c) + 1e-9) continue;
    const i = c % w;
    const j = (c - i) / w;
    const own = cost[c]!;
    for (let k = 0; k < 8; k++) {
      const ii = i + DI[k]!;
      const jj = j + DJ[k]!;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const n = jj * w + ii;
      const next = cost[n]!;
      if (next === Infinity) continue;
      if (k >= 4 && (cost[j * w + ii] === Infinity || cost[jj * w + i] === Infinity)) continue;
      const nd = d + (own + next) * STEP[k]! * m;
      if (stamp[n] !== run || nd < dist[n]!) {
        stamp[n] = run;
        dist[n] = nd;
        parent[n] = c;
        heap.push(n, nd + estimate(n));
        offer(n, nd);
      }
    }
  }
  return -1;
}

/**
 * Přidá pochůzku domácnosti, která skončila v buňce `at` (místo, nebo napojení na pěšinu):
 * úsek od brány k `at` (rodiče hledání), dál po pěšině souseda k místu; nový úsek zapíše do
 * pěšiny pochůzky. Vrátí místo, kam domácnost chodí.
 */
function addErrand(
  grid: Grid,
  state: SearchState,
  traffic: Traffic,
  costs: PassCosts,
  trail: ErrandTrail,
  marks: Uint8Array,
  at: number,
  weight: number,
  years: number,
): number {
  addTrip(state, traffic, costs, grid.width, at, weight, years);
  const joined = !marks[at] && trail.next[at]! >= 0;
  const end = joined ? trail.end[at]! : at;
  if (joined) {
    // po pěšině souseda až k místu
    let c = at;
    for (let guard = 0; guard < traffic.cells.length && trail.next[c]! >= 0; guard++) {
      const n = trail.next[c]!;
      treadCell(traffic, costs, n, weight);
      const slot = edgeSlot(grid.width, c, n);
      traffic.edges[slot] = traffic.edges[slot]! + weight;
      traffic.edgeYears[slot] = traffic.edgeYears[slot]! + weight * years;
      c = n;
    }
  }
  // nový úsek od `at` zpět k bráně se stane pěšinou, ke které se můžou přidat další
  let child = at;
  let rest = joined ? trail.rest[at]! : 0;
  trail.end[at] = end;
  trail.rest[at] = rest;
  for (let guard = 0; guard < traffic.cells.length; guard++) {
    const p = state.parent[child]!;
    if (p < 0) break;
    rest += stepCost(grid, costs.cost, p, child);
    if (trail.next[p]! < 0 || rest < trail.rest[p]!) {
      trail.next[p] = child;
      trail.rest[p] = rest;
      trail.end[p] = end;
    }
    child = p;
  }
  return end;
}

/** Lehce rozmazaný provoz (3 × 3) – pěšina přitahuje i trasy o buňku vedle. */
function smoothTraffic(grid: Grid, traffic: Float32Array): Float32Array {
  const w = grid.width;
  const h = grid.height;
  const out = new Float32Array(traffic.length);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = j * w + i;
      const t = traffic[c]!;
      if (t === 0) continue;
      out[c] = out[c]! + t * 0.6;
      for (const [di, dj, step] of NEIGHBOURS_8) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const n = jj * w + ii;
        out[n] = out[n]! + t * (step === 1 ? 0.07 : 0.03);
      }
    }
  }
  return out;
}

/**
 * Vyšlapané pěšiny vsi. Bez obydlí (nebo bez průchodné brány) žádné. Výsledek závisí jen na
 * vstupu (deterministicky).
 */
export function computePathNetwork(input: PathNetworkInput): PathNetwork {
  const v = input.village;
  const buildings = new Map<number, Building>();
  for (const d of v.dwellings) {
    buildings.set(d.id, { position: d.position, box: dwellingBox(d) });
  }
  const obstaclesOnly: Building[] = [...buildings.values()];
  // milíř uhlíře kus od zemnice – pěšina ho obejde (crafts.md)
  for (const d of v.dwellings) {
    if (d.craft !== 'burner') continue;
    const half = MILIR_RADIUS_M;
    obstaclesOnly.push({
      position: milirPosition(d.position),
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    });
  }
  for (const b of v.sacred?.buildings ?? []) {
    if (b.kind !== 'idol') continue;
    const half = SACRED_BUILDINGS.idol.footprintM / 2;
    obstaclesOnly.push({
      position: b.position,
      box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    });
  }
  const grid = villageGrid(input, obstaclesOnly);
  const all = grid.width * grid.height;
  const empty: PathNetwork = {
    lines: [],
    traffic: {
      originX: grid.originX,
      originZ: grid.originZ,
      cellM: grid.cellM,
      width: grid.width,
      height: grid.height,
      values: new Float32Array(all),
      raw: new Float32Array(all),
    },
    errands: new Map(),
    trips: 0,
    visits: new Map(),
  };
  const homes = households(v, grid, buildings);
  if (homes.length === 0) return empty;
  // nejvytíženější skupiny první – vyšlapou kmen, ke kterému se přidají ostatní
  const groups = [
    ...errandGroups(input.annual ?? false, v, grid, homes),
    ...tripGroups(input, grid, homes, buildings),
  ]
    .map((group, order) => ({ group, order, total: group.weights.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .map((g) => g.group);
  const state: SearchState = {
    dist: new Float64Array(all),
    stamp: new Uint32Array(all),
    run: 0,
    parent: new Int32Array(all),
    heap: new PathHeap(),
    sinks: new Uint8Array(all),
  };
  // pevné cesty: od začátku jako plná pěšina (sleva), síla buňky nikdy pod ni neklesne
  const fixed = roadCells(grid, v.roads);
  const costs: PassCosts = {
    base: grid.base,
    previous: fixed ? new Float32Array(fixed) : new Float32Array(all),
    cost: new Float32Array(grid.base),
  };
  if (fixed) {
    for (let c = 0; c < all; c++) {
      if (fixed[c]! > 0) costs.cost[c] = grid.base[c]! * (1 - PATH_DISCOUNT * fixed[c]!);
    }
  }
  let result: Traffic = {
    cells: new Float32Array(all),
    edges: new Float32Array(all * 4),
    edgeYears: new Float32Array(all * 4),
    trips: 0,
  };
  let smooth: Float32Array = new Float32Array(all);
  const errands = new Map<number, PathErrands>();
  for (let pass = 0; pass < PASSES; pass++) {
    if (pass > 0) {
      for (let c = 0; c < all; c++) {
        const s = fixed ? Math.max(fixed[c]!, pathStrength(smooth[c]!)) : pathStrength(smooth[c]!);
        costs.previous[c] = s;
        costs.cost[c] = s > 0 ? grid.base[c]! * (1 - PATH_DISCOUNT * s) : grid.base[c]!;
      }
    }
    const last = pass === PASSES - 1;
    result = routeAll(grid, costs, homes, groups, state, last ? errands : null);
    smooth = smoothTraffic(grid, result.cells);
  }
  return {
    lines: extractLines(grid, result, new Map(homes.map((h) => [h.gate, h.gatePoint]))),
    traffic: { ...empty.traffic, values: smooth, raw: result.cells },
    errands,
    trips: result.trips,
    visits: visitsOf(groups),
  };
}

/**
 * Provoz ke stavbám (`TripGroup.visit`) z posledního kola: kolo vynuluje váhy domácností, ke
 * kterým se trasa nenašla, takže zbylé váhy nad MIN_TRIP jsou cesty, které opravdu vedly.
 */
function visitsOf(groups: readonly TripGroup[]): Map<string, number> {
  const visits = new Map<string, number>();
  for (const group of groups) {
    if (!group.visit) continue;
    const trips = group.weights.reduce((sum, w) => (w >= MIN_TRIP ? sum + w : sum), 0);
    if (trips > 0) visits.set(group.visit, (visits.get(group.visit) ?? 0) + trips);
  }
  return visits;
}

// --- osy pěšin -------------------------------------------------------------------------------

/**
 * Lomené čáry z hran s provozem nad prahem: řetězce mezi rozcestími, branami domů (`anchors` –
 * vyhlazení je nesmí useknout) a volnými konci, zjednodušené a vyhlazené. Síla a stáří v bodě
 * podle provozu na hranách.
 */
function extractLines(
  grid: Grid,
  traffic: Traffic,
  anchors: ReadonlyMap<number, PathPoint>,
): PathLine[] {
  const edges = traffic.edges;
  const all = grid.width * grid.height;
  const adjacency = new Map<number, Map<number, number>>();
  const link = (a: number, b: number, t: number): void => {
    let m = adjacency.get(a);
    if (!m) {
      m = new Map();
      adjacency.set(a, m);
    }
    m.set(b, t);
  };
  for (let slot = 0; slot < edges.length; slot++) {
    const t = edges[slot]!;
    if (t < PATH_TRAFFIC.min) continue;
    const [a, b] = edgeOther(grid.width, slot);
    link(a, b, t);
    link(b, a, t);
  }
  const visited = new Set<number>();
  const edgeKey = (a: number, b: number): number => (a < b ? a * all + b : b * all + a);
  const chains: number[][] = [];
  const walk = (start: number, next: number): number[] => {
    const chain = [start];
    let prev = start;
    let cur = next;
    visited.add(edgeKey(prev, cur));
    for (;;) {
      chain.push(cur);
      const around = adjacency.get(cur)!;
      if (around.size !== 2 || anchors.has(cur)) break;
      let step = -1;
      for (const n of around.keys()) {
        if (n !== prev && !visited.has(edgeKey(cur, n))) step = n;
      }
      if (step < 0) break;
      visited.add(edgeKey(cur, step));
      prev = cur;
      cur = step;
    }
    return chain;
  };
  const nodes = [...adjacency.keys()].sort((a, b) => a - b);
  for (const node of nodes) {
    const around = adjacency.get(node)!;
    if (around.size === 2 && !anchors.has(node)) continue;
    for (const n of [...around.keys()].sort((a, b) => a - b)) {
      if (!visited.has(edgeKey(node, n))) chains.push(walk(node, n));
    }
  }
  // samotné okruhy (všechny uzly se dvěma sousedy)
  for (const node of nodes) {
    for (const n of [...adjacency.get(node)!.keys()].sort((a, b) => a - b)) {
      if (!visited.has(edgeKey(node, n))) chains.push(walk(node, n));
    }
  }
  const lines: PathLine[] = [];
  for (const chain of chains) {
    if (chain.length < 2) continue;
    // u brány domu pěšina končí přesně u ní (střed buňky může být kus vedle)
    const points = chain.map((c) => anchors.get(c) ?? { x: cellX(grid, c), z: cellZ(grid, c) });
    // mezi rozcestími vedou po hranách řetězce tytéž trasy – síla je skoro stálá
    const strength: number[] = [];
    const years: number[] = [];
    chain.forEach((c, k) => {
      // silnější ze dvou hran řetězce u bodu
      let slot = -1;
      for (const n of [chain[k - 1], chain[k + 1]]) {
        if (n === undefined) continue;
        const candidate = edgeSlot(grid.width, c, n);
        if (slot < 0 || edges[candidate]! > edges[slot]!) slot = candidate;
      }
      const t = slot >= 0 ? edges[slot]! : 0;
      strength.push(pathStrength(t));
      years.push(t > 0 ? traffic.edgeYears[slot]! / t : 0);
    });
    const first = adjacency.get(chain[0]!)!.size;
    const last = adjacency.get(chain[chain.length - 1]!)!.size;
    const simple = simplifyPathLine(points, [strength, years], SIMPLIFY_M);
    const smoothed = smoothPathLine(simple.points, simple.values, SMOOTH_PASSES);
    lines.push({
      points: smoothed.points,
      strength: smoothed.values[0]!,
      years: smoothed.values[1]!,
      openStart: first === 1 || anchors.has(chain[0]!),
      openEnd: last === 1 || anchors.has(chain[chain.length - 1]!),
    });
  }
  return lines;
}

/** Douglasův–Peuckerův algoritmus (konce zůstanou) – hodnoty v bodech (síla…) v ponechaných. */
export function simplifyPathLine(
  points: readonly PathPoint[],
  values: readonly (readonly number[])[],
  tolerance: number,
): { points: PathPoint[]; values: number[][] } {
  if (points.length <= 2) return { points: [...points], values: values.map((v) => [...v]) };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a]!;
    const pb = points[b]!;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const length = length2(dx, dz);
    let worst = -1;
    let worstD = tolerance;
    for (let k = a + 1; k < b; k++) {
      const p = points[k]!;
      const d =
        length > 1e-9
          ? Math.abs((p.x - pa.x) * dz - (p.z - pa.z) * dx) / length
          : length2(p.x - pa.x, p.z - pa.z);
      if (d > worstD) {
        worst = k;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const outPoints: PathPoint[] = [];
  const outValues: number[][] = values.map(() => []);
  for (let k = 0; k < points.length; k++) {
    if (!keep[k]) continue;
    outPoints.push(points[k]!);
    values.forEach((v, i) => outValues[i]!.push(v[k]!));
  }
  return { points: outPoints, values: outValues };
}

/** Chaikinovo vyhlazení lomené čáry (konce zůstanou na místě), hodnoty v bodech se interpolují. */
export function smoothPathLine(
  points: readonly PathPoint[],
  values: readonly (readonly number[])[],
  passes: number,
): { points: PathPoint[]; values: number[][] } {
  let p = [...points];
  let vs = values.map((v) => [...v]);
  for (let pass = 0; pass < passes && p.length > 2; pass++) {
    const np: PathPoint[] = [p[0]!];
    const nv: number[][] = vs.map((v) => [v[0]!]);
    const mix = (k: number, t: number): void =>
      vs.forEach((v, i) => nv[i]!.push(v[k]! * (1 - t) + v[k + 1]! * t));
    for (let k = 0; k < p.length - 1; k++) {
      const a = p[k]!;
      const b = p[k + 1]!;
      if (k > 0) {
        np.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
        mix(k, 0.25);
      }
      if (k < p.length - 2) {
        np.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
        mix(k, 0.75);
      }
    }
    np.push(p[p.length - 1]!);
    vs.forEach((v, i) => nv[i]!.push(v[v.length - 1]!));
    p = np;
    vs = nv;
  }
  return { points: p, values: vs };
}
