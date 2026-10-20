import {
  AGE,
  DWELLING_CLEARING_M,
  PLAIN_FRAME,
  SACRED_BUILDINGS,
  dateOfDayIndex,
  rotationCosSin,
  shapeRect,
  type Craft,
  type DwellingType,
  type Position,
  type ShapeFrame,
  type Sex,
  type TileCell,
} from '@bohemia/game';
import type {
  LaborActivity,
  LaborShare,
  LaborTarget,
  SceneExpedition,
  SceneFieldPart,
  SceneLaborShare,
  SceneLabor,
  SceneVillage,
} from '../village-view';
import { scenePenSquares } from '../village-view';
import {
  caravanHead,
  caravanPlan,
  caravanProgress,
  caravanPoints,
  memberSpot,
  waitingOffset,
  type CaravanMember,
  type DayWindow,
} from './caravan';
import { funeralActiveIn, funeralPlan, funeralPose, type FuneralPlan } from './funeral-plan';
import {
  BRIDE_CLOTH,
  weddingActiveIn,
  weddingCloth,
  weddingLookRoll,
  weddingMembersIn,
  weddingPlan,
  weddingPose,
  weddingVillagersIn,
  type WeddingPlan,
} from './wedding-plan';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
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
import {
  FIELD_TRIPS_PER_MAN_DAY,
  MAX_TRAFFIC,
  fetchCarriers,
  streamPhase,
  trafficCounts,
  trafficHomes,
  waterTrips,
  woodTrips,
  type TrafficKind,
  type TrafficStream,
} from './road-traffic';
import { hash01 } from './smoke-schedule';
import { localToWorld, sceneFrame } from './village-layout';
import {
  alongRoute,
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
import { MILIR_SHAPE_M, craftSpots, forestKilnAnchor } from './workshop-layout';
import { isMarriedWomanRole } from '../person-roles';
import type { ScenePerson } from '../person-view';
import { ADULTS, DayRoster, ELDERS, YOUNGSTERS, type PersonJob } from './villager-roster';
import { orePitRadius } from './ore-site-layout';

// Postavy ve vsi (docs/design/villagers.md): kdo kde je a co dělá, jako čistá funkce vsi pro
// scénu – z rozdělení práce posledního dne (herní jádro, labor-report.ts), ne z vlastních
// pravidel. Člověkodny dne se převedou na postavy (jedna na pracujícího, nejvýš MAX_WORKERS)
// a rozestaví se k místům práce: řady na polích, nosiči mezi polem a obydlím, stavitelé kolem
// staveniště, dřevorubci u vyhrazených stromů, lidé v sadu, u hřbitova, výmlat u vsi, ženy
// u obydlí. Navíc starší u domů a děti u stád (nejsou práce vsi) a provoz na cestách – lidé, kteří
// jdou pro vodu, k lesu pro dřevo a mezi domem a polem (road-traffic.ts). Nikdo nestojí ve vodě,
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
  herding: 0.2,
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
  // kovář a jeho synové (crafts.md – Uhlí a ruda kováře) – muži
  ore: 0,
  clay: 0.2,
  fetch: 0,
  domestic: 0.85,
  trade: 0.3,
  haul: 0.1,
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

/** Vlasy postavy: přirozené, šediny, šátek (lněný, mořenou), svatební věnec z květů (nevěsta). */
export type HairLook = 'natural' | 'grey' | 'linen' | 'madder' | 'wreath';

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
  /** Člověk vsi (id – villagers.md, Výběr postavy); bez lidí ve scéně (`labor.persons`) chybí. */
  person?: number;
  /** Co postava dělá – činnost v panelu postavy (person-activity.ts); jen s `person`. */
  job?: PersonJob;
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
   * rychleji – paths.md), nebo null – jde se rovnou. `reach` = jak daleko od pěšiny smí cíl být
   * (bez údaje kousek – díl daleko v poli: po pěšině k poli a přes pole).
   */
  route(
    a: { x: number; z: number },
    b: { x: number; z: number },
    reach?: number,
  ): { points: readonly (readonly [number, number])[]; pace: readonly number[] } | null;
  /** Kam chodí domácnost (id obydlí) pro vodu nebo dřevo – konec její pěšiny, nebo null. */
  errand(dwellingId: number, kind: 'water' | 'wood'): { x: number; z: number } | null;
}

export interface VillagerPlanOptions {
  seed: number;
  /** Kolik stád se pase (pasáčci – jeden na stádo, když jsou děti). */
  herds: number;
  maxWorkers?: number;
  /** Nejvýš tolik lidí na cestách (provoz – road-traffic.ts); bez údaje MAX_TRAFFIC. */
  maxTraffic?: number;
  /** Vyšlapané pěšiny – nosiči, lidé pro vodu a dřevo a na pole chodí po nich. */
  paths?: VillagerPaths | null;
  /**
   * Okno herního dne (skutečný čas) – karavany výprav jdou podle postupu výpravy v herním čase
   * (caravan.ts); bez hodin stojí na postupu dne dat.
   */
  dayWindow?: (day: number) => DayWindow | null;
  /**
   * Pohřby (`planFunerals` – cemetery.md, Pohřeb ve scéně): lidé průvodu a kruhu kolem hranice
   * jdou mimo rozpočet pracujících a v den obřadu se o ně počet pracujících postav sníží.
   */
  funerals?: readonly FuneralPlan[];
  /**
   * Svatby (`planWeddings` – kinship.md, Svatba ve scéně): průvod, pár a podkova svatebčanů jdou
   * mimo rozpočet pracujících – lidé vsi na svatbě ubírají z pracujících postav.
   */
  weddings?: readonly WeddingPlan[];
  /**
   * Spřežení a vozy, které dnes kreslí ves (village-renderer.ts – `draftCrews`): kolik spřežení
   * s rádlem je na poli (v pořadí plough-team-renderer.ts) a id vozů se zapřaženými voly (jedou
   * pro náklad, nebo v karavaně výpravy). S lidmi ve scéně (`labor.persons`) dostane každé
   * spřežení oráče a honáka a každý vůz vozku (`planVillagersWithCrew` – villagers.md, Výběr
   * postavy). Bez údaje nikdo.
   */
  draft?: DraftCrews;
}

/** Spřežení a vozy dne, které kreslí ves – kolik spřežení s rádlem a id zapřažených vozů. */
export interface DraftCrews {
  teams: number;
  carts: readonly number[];
}

/**
 * Lidé u spřežení a vozů (villagers.md – Výběr postavy): u každého spřežení s rádlem oráč
 * a honák, u každého zapřaženého vozu vozka – id člověka, nikdo volný null. Postavy kreslí
 * spřežení a vůz (plough-team-renderer.ts, cart-renderer.ts), ne villagers.ts.
 */
export interface DraftCrew {
  teams: { ploughman: number | null; leader: number | null }[];
  carts: { cart: number; drover: number | null }[];
}

/** Honák spřežení je výrostek – přednostně člověk nejblíž tomuto věku (oxen.md – honáček). */
export const LEADER_AGE = 12;

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
  /** Natočený pozemek (fields.md – Natočené stavby) má i natočení. */
  plot?: { x: number; z: number; size: number; rotation?: number };
  /** Řemeslná dílna (crafts.md) – řemeslníci stojí u pece, výhně nebo milíře. */
  craft?: Craft;
  /** Varianta rozměrů domu (population.md – Varianty rozměrů) – místa řemeslníků s ní. */
  frame?: ShapeFrame;
  /** Čtverec ohrady (oxen.md) – k brance se chodí krmit, pěšina k ní smí zasáhnout dovnitř. */
  pen?: true;
  /**
   * Natočení a dosah obdélníku od středu (`withReach` v `context`) – `inBox` se ptá u každého
   * bodu tras tisíckrát, vzdálené domy tak odbude jedním porovnáním.
   */
  cos?: number;
  sin?: number;
  reach?: number;
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
  /** Podíly žen ve vsi – postavy podle skutečného pohlaví lidí (kinship.md). */
  sexes: FigureSexes;
  center: Point;
  houses: House[];
  /** Obydlí, kde se bydlí (bez nich staveniště zakladatelů). */
  homes: House[];
  graves: CellSquare[];
  paths: VillagerPaths | null;
  /** Lidé dne k rozdělení mezi postavy (villager-roster.ts); bez lidí ve scéně null. */
  roster: DayRoster | null;
}

type Placer = (index: number, who: Identity) => PoseFn | null;

/**
 * Postavy vsi podle rozdělení práce posledního dne (`village.labor`). Bez rozdělení, lidí nebo
 * obydlí nikdo. Pracujících je tolik, kolik je člověkodní (venku – domácí práce a nečinní
 * jen z části), nejvýš `maxWorkers`; navíc starší u domů a pasáčci u stád.
 *
 * S lidmi vsi (`labor.persons` – villagers.md, Výběr postavy) je každá postava jeden skutečný
 * člověk (villager-roster.ts) a nikdo není ve dvou postavách: napřed lidé s pevným místem dne
 * (průvod pohřbu, karavany, nosiči kováře, pasáci, domácnosti dílen u své práce), pak stavby
 * (u každé aspoň jeden), práce vsi, provoz na cestách a nakonec domácí práce a nečinní; na koho
 * nezbude člověk, ta postava není (ves s málo lidmi). Pořadí postav ve výsledku je stejné jako
 * bez lidí.
 */
export function planVillagers(
  village: SceneVillage,
  ground: VillagerGround,
  options: VillagerPlanOptions,
): PlannedVillager[] {
  return planVillagersWithCrew(village, ground, options).people;
}

/**
 * Postavy vsi (`planVillagers`) a lidé u spřežení a vozů (`options.draft` – villagers.md, Výběr
 * postavy): spřežení a vozy jsou ve scéně vidět celý den, proto oráč, honák a vozka patří k lidem
 * s pevným místem dne – vozka vozu výpravy s karavanou, ostatní hned po pasácích (před dílnami,
 * stavbami a prací vsi); jejich podíl práce (orba, svoz) už postavy nemá.
 */
export function planVillagersWithCrew(
  village: SceneVillage,
  ground: VillagerGround,
  options: VillagerPlanOptions,
): { people: PlannedVillager[]; crew: DraftCrew } {
  const crew: DraftCrew = { teams: [], carts: [] };
  const labor = village.labor;
  if (!labor || village.dwellings.length === 0) return { people: [], crew };
  const ctx = context(
    village,
    ground,
    options.seed,
    labor.day,
    options.paths ?? null,
    figureSexes(labor.people),
    labor.persons ? dayRoster(labor, options.seed) : null,
  );
  // pohřby dne (cemetery.md – Pohřeb ve scéně): lidé průvodu ubírají z pracujících postav
  const funerals = activeFunerals(options.funerals ?? [], options.dayWindow?.(labor.day) ?? null);
  const mourning = funerals.reduce((sum, plan) => sum + plan.members.length, 0);
  // svatby dne (kinship.md – Svatba ve scéně): lidé vsi na svatbě ubírají z pracujících postav
  const dayWindow = options.dayWindow?.(labor.day) ?? null;
  const weddings = activeWeddings(options.weddings ?? [], dayWindow);
  const celebrating = weddings.reduce((sum, plan) => sum + weddingVillagersIn(plan, dayWindow), 0);
  const counts = shareCounts(
    labor.shares,
    labor.month,
    Math.max(0, (options.maxWorkers ?? MAX_WORKERS) - mourning - celebrating),
  );
  // lidé u spřežení a vozů (villagers.md – Výběr postavy) – postavy kreslí spřežení a vůz
  const staff = draftStaff(ctx, options.draft ?? null, crew);
  // lidé s pevným místem dne napřed – pohřeb, karavany, nosiči kováře a pasáci
  const mourners = funerals.flatMap((plan) => funeralFigures(ctx, plan));
  const celebrants = weddings.flatMap((plan) => weddingFigures(ctx, plan, dayWindow));
  const caravanPeople: PlannedVillager[] = [];
  for (const e of village.expeditions ?? []) {
    caravanPeople.push(...caravanFigures(ctx, e, options.dayWindow?.(e.day) ?? null));
  }
  // vozka vozu výpravy jde s karavanou
  staff.caravanCarts();
  const fetchers = smithFetchFigures(ctx, labor);
  const herding = herderPeople(ctx, labor);
  // spřežení a vozy jsou ve scéně vidět celý den – oráč, honák a vozka mají pevné místo dne
  staff.all();
  // výpravy k sousedům jdou jako karavany podle stavu výpravy (trade.md – Ve scéně), ne podle
  // práce dne – nosiči nezmizí, ani když výprava dnes nepostoupila
  const caravans = village.expeditions !== undefined;
  const slots: PlannedVillager[][] = labor.shares.map(() => []);
  const placers = new Map<number, Placer>();
  const tried = new Set<string>();
  const place = (s: number, i: number): void => {
    if (tried.has(`${s}:${i}`)) return;
    tried.add(`${s}:${i}`);
    const share = labor.shares[s]!;
    // orbu dělají oráč a honák u spřežení, vůz svozu vede vozka (`staff`) – postavy kreslí
    // spřežení a vůz
    if (share.activity === 'plough') return;
    if (share.activity === 'haul' && staff.haulCart(share, i) !== null) return;
    let place = placers.get(s);
    if (!place) {
      place = placer(ctx, share, counts[s] ?? 0);
      placers.set(s, place);
    }
    // kdo práci dělá, když to jádro ví (kovář a synové – crafts.md, Uhlí a ruda kováře)
    const age = share.ages ? share.ages[i % share.ages.length] : undefined;
    const child = age !== undefined && age < CHILD_UNDER;
    const c = cast(
      ctx,
      `${share.activity}:${targetKey(share.target)}:${i}`,
      { women: womenChance(WOMEN[share.activity], ctx.sexes.women), child },
      (sex) => shareWorker(ctx, share, i, sex, age),
    );
    if (!c) return;
    // u stavby musí někdo stát, i když zvláštní místo (strom, řada, plot) nevyšlo
    const pose =
      place(i, c.who) ?? (isConstructionShare(share) ? builderNearby(ctx, share, i, c.who) : null);
    if (!pose) {
      // místo nevyšlo – člověk zůstane volný pro jinou postavu
      if (c.person) ctx.roster?.release(c.person.id);
      return;
    }
    const hair = child ? 'natural' : adultHair(c.who, ctx.sexes.married);
    slots[s]![i] = figure(c, pose, hair, shareJob(share));
  };
  const wanted = (s: number): boolean =>
    (counts[s] ?? 0) > 0 && !(caravans && labor.shares[s]!.activity === 'trade');
  const all = (filter: (share: SceneLaborShare) => boolean): void =>
    labor.shares.forEach((share, s) => {
      if (!wanted(s) || !filter(share)) return;
      for (let i = 0; i < counts[s]!; i++) place(s, i);
    });
  // řemeslníci u své dílny, pak u každé stavby aspoň jeden, pak ostatní práce vsi
  all((share) => CRAFT_ACTIVITIES.has(share.activity));
  for (const s of firstBuilders(labor.shares, counts)) if (wanted(s)) place(s, 0);
  all((share) => !LATE_ACTIVITIES.has(share.activity));
  const traffic = trafficFigures(ctx, labor, options.maxTraffic ?? MAX_TRAFFIC);
  // domácí práce a nečinní – na koho zbude člověk
  all(() => true);
  const people: PlannedVillager[] = slots.flatMap((list) => list.filter(Boolean));
  const winter = WINTER_MONTHS.includes(labor.month);
  const tending = herderKinds(labor, options.herds);
  const elderHerders = tending.filter((kind) => kind === 'elder').length;
  people.push(...elders(ctx, elderCount(Math.max(0, labor.people.elders - elderHerders), winter)));
  people.push(...herders(ctx, tending, herding));
  people.push(...caravanPeople);
  people.push(...traffic);
  people.push(...mourners);
  people.push(...celebrants);
  people.push(...fetchers);
  return { people, crew };
}

/**
 * Kdo je u spřežení a vozů (villagers.md – Výběr postavy): oráč je dospělý muž (jinak žena),
 * honák výrostek nejblíž LEADER_AGE (jinak dospělý – na poli ho kreslí postava honáčka), vozka
 * dospělý muž (jinak žena). Každé spřežení a každý vůz nejvýš jednou; bez lidí ve scéně nikdo
 * (null). Zapisuje do `crew` – spřežení v pořadí renderera, vozy výprav napřed, pak ostatní
 * v pořadí renderera. `haulCart` – vůz svozu, který vede `i`-tý člověk podílu svozu (postavu
 * nemá – je u vozu).
 */
function draftStaff(
  ctx: Context,
  draft: DraftCrews | null,
  crew: DraftCrew,
): {
  haulCart(share: SceneLaborShare, i: number): number | null;
  caravanCarts(): void;
  all(): void;
} {
  const roster = ctx.roster;
  const drawn = new Set(draft?.carts ?? []);
  const staffed = new Set<number>();
  let teamsDone = false;
  const adult = (): number | null => roster?.take({ ...ADULTS, sex: 'male' })?.id ?? null;
  const teams = (): void => {
    if (teamsDone) return;
    teamsDone = true;
    for (let k = 0; k < (draft?.teams ?? 0); k++) {
      const ploughman = adult();
      const leader =
        roster?.take({ from: AGE.olderChild, to: AGE.elder, sex: 'male', age: LEADER_AGE })?.id ??
        null;
      crew.teams.push({ ploughman, leader });
    }
  };
  const cart = (id: number): void => {
    if (staffed.has(id) || !drawn.has(id)) return;
    staffed.add(id);
    crew.carts.push({ cart: id, drover: adult() });
  };
  // vozy svozu podle podílu (stejně jako honáci v placeru `haul`) – jen zapřažené
  const haulCarts = new Map<string, number[]>();
  for (const c of ctx.village.carts ?? []) {
    if (c.job?.activity !== 'haul' || (c.route?.length ?? 0) < 2 || !drawn.has(c.id)) continue;
    const key = targetKey(c.job.target);
    haulCarts.set(key, [...(haulCarts.get(key) ?? []), c.id]);
  }
  return {
    haulCart: (share, i) => haulCarts.get(targetKey(share.target))?.[i] ?? null,
    caravanCarts: () => {
      for (const c of ctx.village.carts ?? []) if (c.job?.activity === 'trade') cart(c.id);
    },
    all: () => {
      teams();
      for (const id of draft?.carts ?? []) cart(id);
    },
  };
}

/**
 * Lidé dne k rozdělení mezi postavy (villager-roster.ts): domácnosti dílen, které dnes pracují
 * v dílně, kopou rudu či hlínu nebo nosí kováři (crafts.md), jdou jen k práci své domácnosti.
 */
function dayRoster(labor: SceneLabor, seed: number): DayRoster {
  const busy = new Set<number>();
  for (const share of labor.shares) {
    const t = share.target;
    if (share.activity === 'craft' && (t.kind === 'dwelling' || t.kind === 'kiln')) busy.add(t.id);
    if (
      (share.activity === 'ore' || share.activity === 'clay') &&
      (t.kind === 'ore' || t.kind === 'clay')
    ) {
      busy.add(t.id);
    }
    if (share.activity === 'fetch') {
      const from =
        t.kind === 'kiln' ? t.from : t.kind === 'ore' || t.kind === 'clay' ? t.id : undefined;
      if (from !== undefined) busy.add(from);
    }
  }
  return new DayRoster(labor.persons ?? [], seed, labor.day, busy);
}

/** Práce dílen a jejich domácností – řemeslníci dostanou lidi napřed (crafts.md). */
const CRAFT_ACTIVITIES: ReadonlySet<LaborActivity> = new Set(['craft', 'ore', 'clay', 'plant']);
/** Domácí práce, dojení, péče o zvířata a nečinní – dostanou lidi až po provozu na cestách. */
const LATE_ACTIVITIES: ReadonlySet<LaborActivity> = new Set([
  'domestic',
  'milking',
  'animal-care',
  'idle',
]);

/**
 * U které stavby stojí první člověk (`withBuilderAtEachConstruction`): u každé stavby dne první
 * podíl, který dostal postavu – index podílu.
 */
function firstBuilders(
  shares: readonly Pick<LaborShare, 'activity' | 'target' | 'construction' | 'manDays'>[],
  counts: readonly number[],
): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  shares.forEach((share, s) => {
    if (!isConstructionShare(share) || (counts[s] ?? 0) <= 0) return;
    const key =
      share.construction !== undefined
        ? `c${share.construction}`
        : `${share.activity}:${targetKey(share.target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });
  return out;
}

/**
 * Kdo dělá podíl práce: řemeslník a jeho domácnost u dílny (i uhlíř u milíře), kovář a synové
 * u rudiště nebo hliniště podle věku z jádra, uhlíř sází buky, dílna kácí svůj strom; ostatní
 * dospělí vsi – u domácí práce, dojení a nečinných přednostně z domu, u kterého postava stojí.
 */
function shareWorker(
  ctx: Context,
  share: SceneLaborShare,
  i: number,
  sex: Sex,
  age: number | undefined,
): ScenePerson | null {
  const roster = ctx.roster!;
  const t = share.target;
  const own = (id: number): ReadonlySet<number> => new Set([id]);
  if (share.activity === 'craft' && (t.kind === 'dwelling' || t.kind === 'kiln')) {
    return (
      roster.take({ ...ADULTS, homes: own(t.id), sex }) ??
      roster.take({ from: AGE.olderChild, to: Infinity, homes: own(t.id), sex })
    );
  }
  if (
    (share.activity === 'ore' || share.activity === 'clay') &&
    (t.kind === 'ore' || t.kind === 'clay')
  ) {
    return roster.take({
      from: AGE.olderChild,
      to: Infinity,
      homes: own(t.id),
      sex: 'male',
      ...(age !== undefined ? { age } : {}),
    });
  }
  if (
    share.activity === 'plant' ||
    (share.activity === 'fell' && share.construction === undefined)
  ) {
    // uhlíř sází a kácí buky, dílny kácejí svůj strom (crafts.md) – napřed uhlíři, pak dílny
    const burners = craftHomes(ctx, (craft) => craft === 'burner');
    const crafts = craftHomes(ctx, (craft) => craft === 'burner' || craft === 'potter');
    return (
      (burners.size > 0 ? roster.take({ ...ADULTS, homes: burners, sex }) : null) ??
      (crafts.size > 0 ? roster.take({ ...ADULTS, homes: crafts, sex }) : null) ??
      roster.take({ ...ADULTS, sex })
    );
  }
  const home = homeHint(ctx, share, i);
  return roster.take({ ...ADULTS, sex, ...(home !== null ? { preferHome: home } : {}) });
}

/** Obydlí dílen s řemeslem, které projde `filter`. */
function craftHomes(ctx: Context, filter: (craft: Craft) => boolean): ReadonlySet<number> {
  return new Set(ctx.village.dwellings.filter((d) => d.craft && filter(d.craft)).map((d) => d.id));
}

/** U kterého domu postava podílu stojí (domácí práce, dojení, nečinní – jako jejich placer). */
function homeHint(ctx: Context, share: SceneLaborShare, i: number): number | null {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  if (homes.length === 0) return null;
  if (share.activity === 'domestic' || share.activity === 'milking') {
    return share.target.kind === 'pen' ? null : homes[i % homes.length]!.id;
  }
  if (share.activity === 'idle') return homes[Math.floor(i / 2) % homes.length]!.id;
  return null;
}

/** Co dělá postava podílu práce (panel postavy). */
function shareJob(share: SceneLaborShare): PersonJob {
  return {
    kind: 'share',
    activity: share.activity,
    target: share.target,
    ...(share.job ? { job: share.job } : {}),
  };
}

/**
 * Výrostci, kteří dnes pasou (`labor.herders.children` – diet.md, Pasáci): napřed, ať je nikdo
 * jiný nevezme; postav u stád je jen tolik, kolik stád se pase (`herders`).
 */
function herderPeople(ctx: Context, labor: SceneLabor): ScenePerson[] {
  const roster = ctx.roster;
  if (!roster) return [];
  const out: ScenePerson[] = [];
  for (let k = 0; k < (labor.herders?.children ?? 0); k++) {
    const who = identity(ctx.seed, `herder:${k}`, {
      women: womenChance(0.4, ctx.sexes.girls),
      child: true,
    });
    const person = roster.take({ ...YOUNGSTERS, sex: who.kind === 'woman' ? 'female' : 'male' });
    if (!person) break;
    out.push(person);
  }
  return out;
}

/** Nejvýš tolik postav všech pohřbů dne (víc pohřbů naráz – nejnovější napřed). */
export const MAX_FUNERAL_FIGURES_TOTAL = 60;

/**
 * Pohřby, jejichž lidé jsou vidět během dne `window` – nejnovější napřed, dokud se jejich lidé
 * vejdou do MAX_FUNERAL_FIGURES_TOTAL (hranice ostatních kreslí ves dál).
 */
function activeFunerals(plans: readonly FuneralPlan[], window: DayWindow | null): FuneralPlan[] {
  let total = 0;
  return [...plans]
    .filter((plan) => funeralActiveIn(plan, window))
    .sort((a, b) => b.timeline.startMs - a.timeline.startMs)
    .filter((plan) => {
      if (total + plan.members.length > MAX_FUNERAL_FIGURES_TOTAL) return false;
      total += plan.members.length;
      return true;
    });
}

/**
 * Pohřby vsi pro scénu (cemetery.md – Pohřeb ve scéně, funeral-plan.ts): průvod vychází od
 * vchodu domu zemřelého (volné místo před vchodem jako provoz na cestách) po pěšinách; lidé
 * stojí na schůdné zemi mimo domy a pozemky. Bez pohřbů, obydlí nebo hodin světa nic.
 */
export function planFunerals(
  village: SceneVillage,
  ground: VillagerGround,
  options: Pick<VillagerPlanOptions, 'seed' | 'paths' | 'dayWindow'>,
): FuneralPlan[] {
  const funerals = village.funerals ?? [];
  const dayWindow = options.dayWindow;
  if (funerals.length === 0 || village.dwellings.length === 0 || !dayWindow) return [];
  const ctx = context(village, ground, options.seed, 0, options.paths ?? null);
  // obydlí jsou v seznamu staveb první (pak milíře, modly a ohrady – id se mohou krýt)
  const dwellings = ctx.houses.slice(0, village.dwellings.length);
  return funerals.flatMap((funeral) => {
    const plan = funeralPlan(funeral, village, {
      dayWindow,
      door: (id) => {
        const house = dwellings.find((h) => h.id === id);
        return house ? trafficDoor(ctx, house) : null;
      },
      route: (a, b) => ctx.paths?.route(a, b)?.points ?? null,
      standable: (x, z) =>
        ctx.ground.walkable(x, z) && !ctx.houses.some((h) => inBox(h, x, z, HOUSE_MARGIN_M)),
      figureScale: FIGURE_SCALE,
    });
    return plan ? [plan] : [];
  });
}

/**
 * Lidé pohřbu (funeral-plan.ts): nosiči jsou muži, ostatní podle pohlaví a věku z jádra – ženy
 * v šátcích jako jinde, starší s šedinami.
 */
function funeralFigures(ctx: Context, plan: FuneralPlan): PlannedVillager[] {
  return plan.members.flatMap((member, index) => {
    // za márami jdou skuteční lidé (id z jádra), máry nesou muži vsi
    const c = cast(
      ctx,
      `funeral:${plan.key}:${member.key}`,
      { women: member.sex === 'female' ? 1 : 0, child: member.child },
      () =>
        member.person !== undefined
          ? ctx.roster!.takeId(member.person)
          : member.bearer
            ? (ctx.roster!.take({ ...ADULTS, onlySex: 'male' }) ??
              ctx.roster!.take({ from: AGE.adult, to: Infinity, onlySex: 'male' }))
            : null,
    );
    if (!c) return [];
    const hair: HairLook = member.elder
      ? 'grey'
      : member.child
        ? 'natural'
        : adultHair(c.who, ctx.sexes.married);
    const pose = funeralPose(plan, index, c.who.kind, c.who.scale);
    return [figure(c, pose, hair, { kind: 'funeral', bearer: member.bearer })];
  });
}

/** Klip člena karavany na cestě: nosič se zbožím nese, ostatní jdou. */
function caravanClip(member: CaravanMember): VillagerClip {
  return member.loaded ? 'carry' : 'walk';
}

/**
 * Karavana výpravy k sousedovi (trade.md – Ve scéně, caravan.ts): jedna skupina po zemské
 * stezce podle postupu výpravy v herním čase – tam nosiči se zbožím (s vozy jen pomocníci, náklad
 * veze vůz – kreslí village-carts.ts) a lidé, kteří odcházejí k sousedovi; za krajem mapy zmizí
 * a za dny výpravy se objeví na cestě zpátky – nosiči a lidé od souseda (pohlaví a věk z jádra).
 * Před odchodem a po návratu stojí v hloučku u začátku stezky; výjimečně (ves bez dospělých) stojí
 * na cestě.
 */
function caravanFigures(
  ctx: Context,
  e: SceneExpedition,
  window: DayWindow | null,
): PlannedVillager[] {
  // po zemské stezce, nákup u souseda bez stezky po čáře krajinou (crafts.md)
  const points = caravanPoints(e, ctx.village.trails);
  if (points.length < 2) return [];
  const path = route(points.map((p) => [p.x, p.z] as const));
  const L = path.length;
  const plan = caravanPlan(e);
  const columns = { out: plan.out.length, back: plan.back.length };
  const daySeconds = window ? Math.max(1, (window.endMs - window.startMs) / 1000) : 86;
  const [x0, z0] = [points[0]!.x, points[0]!.z];
  const first = unit(points[1]!.x - x0, points[1]!.z - z0);
  const out: PlannedVillager[] = [];
  // kdo jde (villagers.md – Výběr postavy): nosiči a pomocníci u vozů jsou dospělí vsi, tam
  // i zpátky tíž; u kování tesař nebo syn (`trip.travellerId`) – s vozem pomocník u vozu; lidé,
  // kteří se stěhují k sousedovi nebo od něj přicházejí, nejsou lidé vsi (nejdou vybrat)
  const trip = e.trip ?? null;
  const traveller = trip?.kind === 'iron' ? (trip.travellerId ?? null) : null;
  const walkers = new Map<string, ScenePerson | null>();
  const walker = (role: string, slot: string, sex: Sex): ScenePerson | null => {
    const roster = ctx.roster!;
    const id =
      traveller !== null &&
      (role === 'leaving' || role === 'coming' || (role === 'helper' && slot === 'helper:0:0'))
        ? 'traveller'
        : slot;
    if (walkers.has(id)) return walkers.get(id)!;
    const person = id === 'traveller' ? roster.takeId(traveller!) : roster.take({ ...ADULTS, sex });
    walkers.set(id, person);
    return person;
  };
  for (const leg of ['out', 'back'] as const) {
    plan[leg].members.forEach((member, index) => {
      const key = `caravan:${e.id}:${member.key}`;
      const person = member.sex !== null;
      const child = person && (member.age ?? 30) < 14;
      const [, role = '', ...rest] = member.key.split(':');
      const slot = [role, ...rest].join(':');
      const stranger = person && traveller === null;
      const c = cast(
        ctx,
        key,
        { women: person ? (member.sex === 'female' ? 1 : 0) : WOMEN.trade, child },
        stranger ? STRANGER : (sex) => walker(role, slot, sex),
      );
      if (!c) return;
      const who = c.who;
      const hair: HairLook =
        (member.age ?? 0) >= 45 ? 'grey' : child ? 'natural' : adultHair(who, ctx.sexes.married);
      const clip = caravanClip(member);
      const base = walkSpeed(who.kind, clip, who.scale);
      const pose: PoseFn = (t, _herds, o) => {
        const nowMs = t * 1000 + LIVESTOCK_EPOCH_MS;
        const head = caravanHead(e, caravanProgress(e, window, nowMs), L, columns);
        o.hidden = head.leg !== leg;
        if (o.hidden) {
          o.x = x0;
          o.z = z0;
          o.clip = 'idle';
          o.pace = 1;
          return o;
        }
        const spot = memberSpot(head, member.behind, L, index);
        o.hidden = !spot.visible;
        if (spot.waiting !== null) {
          const w = waitingOffset(spot.waiting);
          o.x = x0 - first.x * w.back - first.z * w.side;
          o.z = z0 - first.z * w.back + first.x * w.side;
          o.headingX = first.x;
          o.headingZ = first.z;
          o.clip = 'idle';
          o.pace = 1;
          o.stage = 'wait';
          return o;
        }
        alongRoute(path, spot.s, leg === 'back', o);
        // vedle osy (pomocník u vozu) – vlevo od směru chůze
        o.x -= o.headingZ * member.side;
        o.z += o.headingX * member.side;
        const speed = head.perDay / daySeconds;
        o.clip = speed > 0 ? clip : 'idle';
        o.pace = speed > 0 ? Math.min(3, Math.max(0.6, speed / Math.max(0.1, base))) : 1;
        o.stage = leg;
        return o;
      };
      out.push(
        figure(c, pose, hair, {
          kind: 'caravan',
          trip,
          porter: c.person?.id !== traveller,
        }),
      );
    });
  }
  return out;
}

/**
 * Kdo stojí u stád (diet.md – Pasáci): pasáci z jádra – výrostci 7–13 let (v rozdělení práce
 * z doby před 19. 10. 2026 i starší a dospělí – podíl `herding`, člověkoden = pasák) –, nejvýš
 * jeden u každého stáda ve scéně. Rozdělení práce z doby před pasáky je nemá – pak děti jako dřív.
 */
export function herderKinds(
  labor: Pick<SceneLabor, 'people' | 'shares' | 'herders'>,
  herds: number,
): ('child' | 'elder' | 'adult')[] {
  const free = labor.herders ?? { children: labor.people.children, elders: 0 };
  const adults = Math.ceil(
    labor.shares
      .filter((share) => share.activity === 'herding')
      .reduce((sum, share) => sum + share.manDays, 0) - 1e-6,
  );
  const kinds: ('child' | 'elder' | 'adult')[] = [
    ...Array<'child'>(free.children).fill('child'),
    ...Array<'elder'>(free.elders ?? 0).fill('elder'),
    ...Array<'adult'>(Math.max(0, adults)).fill('adult'),
  ];
  return kinds.slice(0, Math.max(0, herds));
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
  sexes: FigureSexes = figureSexes(null),
  roster: DayRoster | null = null,
): Context {
  const dwellings: House[] = village.dwellings.map((d) => {
    // dům i staveniště podle varianty rozměrů domu (population.md – Varianty rozměrů)
    const frame = sceneFrame(d);
    return {
      id: d.id,
      position: d.position,
      built: d.built,
      progress: d.progress,
      inhabited: d.built && d.inhabited !== false,
      box: d.plot
        ? plotBox(d.position, d.plot)
        : d.built
          ? houseBox(d.type, frame)
          : siteBox(d.type, frame),
      frame,
      ...(d.plot
        ? {
            own: houseBox(d.type, frame),
            plot: {
              x: d.plot.x,
              z: d.plot.z,
              size: d.plot.size,
              ...(d.plot.rotation !== undefined ? { rotation: d.plot.rotation } : {}),
            },
          }
        : {}),
      ...(d.craft ? { craft: d.craft } : {}),
    };
  });
  // milíř uhlíře – lidé ho obcházejí (do kupy se nevstupuje), řemeslníci stojí kolem něj
  // milíře uhlířů – samostatné stavby u skácených buků (crafts.md – Milíř u skácených buků)
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
  // ohrady (oxen.md): oplocené čtverce – lidé stojí za plotem, dovnitř nechodí (ohrada o víc
  // čtvercích – oxen.md, Ohrady podle druhu – každý čtverec)
  const pens: House[] = (village.pens ?? []).flatMap((pen) =>
    scenePenSquares(pen).map((q) => {
      const half = pen.size / 2;
      return {
        id: pen.id,
        // natočená ohrada (fields.md – Natočené stavby) – čtverec v osách ohrady
        position: { x: q.x, z: q.z, rotation: pen.rotation ?? 0 },
        built: pen.built,
        progress: pen.progress,
        inhabited: false,
        box: { minX: -half, maxX: half, minZ: -half, maxZ: half },
        pen: true as const,
      };
    }),
  );
  const houses = [...dwellings, ...forestKilns, ...sacred, ...pens];
  for (const h of houses) {
    h.cos = Math.cos(h.position.rotation);
    h.sin = Math.sin(h.position.rotation);
    h.reach = Math.hypot(Math.max(-h.box.minX, h.box.maxX), Math.max(-h.box.minZ, h.box.maxZ));
  }
  const homes = dwellings.filter((h) => h.inhabited);
  const settled = homes.length > 0 ? homes : dwellings.length > 0 ? dwellings : houses;
  const center = {
    x: settled.reduce((s, h) => s + h.position.x, 0) / settled.length,
    z: settled.reduce((s, h) => s + h.position.z, 0) / settled.length,
  };
  const graves = (village.cemeteries ?? []).flatMap((c) => c.squares);
  return {
    village,
    ground,
    seed,
    day,
    sexes,
    center,
    houses,
    homes: settled,
    graves,
    paths,
    roster,
  };
}

/**
 * Staveniště zabere i s hromadou hlíny, drnem, dřevem a nářadím kolem jámy celou vyklízenou
 * plochu (village-construction.ts) – stavitelé stojí za ní.
 */
export function siteBox(type: DwellingType, frame: ShapeFrame = PLAIN_FRAME): Box {
  const clearance = shapeRect(frame, DWELLING_CLEARING_M[type]);
  return {
    minX: clearance.minX,
    maxX: clearance.maxX,
    minZ: clearance.minZ,
    maxZ: Math.max(chickenBox(type, frame).maxZ, SITE_FRONT_M),
  };
}

/** Hotové volné obydlí: dům se střechou a šíjí (jako pro slepice – `chickenBox`). */
export function houseBox(type: DwellingType, frame: ShapeFrame = PLAIN_FRAME): Box {
  const house = chickenBox(type, frame);
  return { minX: -house.halfX, maxX: house.halfX, minZ: house.minZ, maxZ: house.maxZ };
}

/**
 * Obydlí na pozemku (hotové i staveniště): celé oplocené políčko v osách modelu domu – lidé
 * stojí za plotem (před brankou), dovnitř cizích pozemků nechodí.
 */
export function plotBox(
  position: Position,
  plot: { x: number; z: number; size: number; rotation?: number },
): Box {
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  // rohy políčka (natočeného pozemku) do os modelu (inverze localToWorld)
  const local = squareCorners(plot).map(([x, z]) => {
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
  const dx = x - h.position.x;
  const dz = z - h.position.z;
  if (h.reach !== undefined) {
    const r = h.reach + Math.max(0, margin);
    if (dx > r || dx < -r || dz > r || dz < -r) return false;
  }
  const c = h.cos ?? Math.cos(h.position.rotation);
  const s = h.sin ?? Math.sin(h.position.rotation);
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
  // natočený hřbitov (fields.md – Natočené stavby) v osách čtverce
  return graves.some((g) => inSquare(g, x, z, -0.2));
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

/** Postava a člověk, kterým je (villagers.md – Výběr postavy); bez lidí ve scéně `person` null. */
interface Cast {
  who: Identity;
  person: ScenePerson | null;
}

/** Postava, která není člověk vsi (lidé, kteří se stěhují k sousedovi nebo od něj přicházejí). */
const STRANGER = 'stranger';

/**
 * Identita postavy: bez lidí ve scéně (dřívější pohled, ukázky) z klíče a podílu žen jako dřív;
 * s lidmi (`ctx.roster`) je postava skutečný člověk – `pick` ho vybere (přednostně pohlaví podle
 * losu postavy, ať činnost drží podíl žen) a postava má jeho pohlaví a velikost. Nikdo volný –
 * null (postava není). Cizí postava (`STRANGER`) zůstane jako dřív.
 */
function cast(
  ctx: Context,
  key: string,
  look: { women: number; child: boolean },
  pick: ((sex: Sex) => ScenePerson | null) | typeof STRANGER,
): Cast | null {
  const who = identity(ctx.seed, key, look);
  if (!ctx.roster || pick === STRANGER) return { who, person: null };
  const person = pick(who.kind === 'woman' ? 'female' : 'male');
  if (!person) return null;
  return {
    who: identity(ctx.seed, key, {
      women: person.sex === 'female' ? 1 : 0,
      child: person.age < CHILD_UNDER,
    }),
    person,
  };
}

/** Vlasy postavy podle člověka: starší šediny, děti a svobodné bez šátku, vdaná žena šátek. */
function personHair(who: Identity, person: ScenePerson): HairLook {
  if (person.age >= AGE.elder) return 'grey';
  if (person.age < CHILD_UNDER || who.kind !== 'woman' || !isMarriedWomanRole(person.role)) {
    return 'natural';
  }
  return hash01(who.seed, 7, 91) < 0.75 ? 'linen' : 'madder';
}

/** Postava z identity a pózy; s člověkem jeho vlasy, id a co dělá (`job`). */
function figure(c: Cast, pose: PoseFn, hair: HairLook, job: PersonJob): PlannedVillager {
  const out = villager(c.who, pose, c.person ? personHair(c.who, c.person) : hair);
  if (c.person) {
    out.person = c.person.id;
    out.job = job;
  }
  return out;
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

/**
 * Podíly žen ve vsi pro postavy (kinship.md – postavy podle skutečného pohlaví): ženy mezi muži
 * a ženami 14–44, starší ženy mezi staršími, dívky mezi dětmi a vdané mezi ženami. Bez údajů
 * (ves bez pohlaví, staré testy) null – platí výchozí podíly činností.
 */
export interface FigureSexes {
  women: number | null;
  elderWomen: number | null;
  girls: number | null;
  married: number | null;
}

/** Podíl `part` z `part + other`, nebo null, když nikdo není. */
function shareOf(part: number | undefined, other: number | undefined): number | null {
  if (part === undefined || other === undefined || part + other === 0) return null;
  return part / (part + other);
}

export function figureSexes(people: SceneLabor['people'] | null): FigureSexes {
  if (!people) return { women: null, elderWomen: null, girls: null, married: null };
  const women = (people.women ?? 0) + (people.elderWomen ?? 0);
  return {
    women: shareOf(people.women, people.men),
    elderWomen: shareOf(people.elderWomen, people.elderMen),
    girls: shareOf(people.girls, people.boys),
    married:
      people.couples === undefined || women === 0 ? null : Math.min(1, people.couples / women),
  };
}

/**
 * Pravděpodobnost, že postava činnosti je žena: výchozí podíl činnosti `base` (počítá s vsí půl
 * na půl) posunutý podle podílu žen ve vsi `share` – poměr šancí se vynásobí. Ves bez žen má jen
 * muže, ves bez mužů jen ženy; bez údaje `base`.
 */
export function womenChance(base: number, share: number | null): number {
  if (share === null) return base;
  if (share <= 0 || base <= 0) return 0;
  if (share >= 1 || base >= 1) return 1;
  const odds = (base / (1 - base)) * (share / (1 - share));
  return odds / (1 + odds);
}

/**
 * Vdané ženy nosí šátek – většinou lněný, některé barvený mořenou. Podíl vdaných podle vsi
 * (`married`), bez údaje MARRIED.
 */
function adultHair(who: Identity, married: number | null = null): HairLook {
  if (who.kind !== 'woman' || hash01(who.seed, 6, 91) >= (married ?? MARRIED)) return 'natural';
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
  if (target.kind === 'edge') return `edge-${target.direction}`;
  if (target.kind === 'water') return `water-${target.x}-${target.z}`;
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
    case 'herding':
      // dospělí pasáci stojí u stád spolu s dětmi (`herders`, diet.md – Pasáci)
      return none;
    case 'pen':
      return t.kind === 'pen' ? penFence(ctx, t.id) : none;
    case 'orchard-harvest':
    case 'orchard-care':
      if (t.kind === 'road') return roadApples(ctx, t.id, count, 'tree');
      return t.kind === 'orchard' ? orchardTrees(ctx, t.id, count) : none;
    case 'orchard-plant':
      if (t.kind === 'road') return roadApples(ctx, t.id, count, 'planting');
      return t.kind === 'orchard' ? orchardPlanting(ctx, t.id, count) : none;
    case 'cemetery':
      return t.kind === 'cemetery' ? cemeteryFence(ctx, t.id) : none;
    case 'fell':
      if (t.kind === 'trees') return felling(ctx, t.ids, share.construction !== undefined);
      if (t.kind === 'pen') return penFence(ctx, t.id);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'build':
      if (t.kind === 'road') return roadWork(ctx, t.id);
      return t.kind === 'site' || t.kind === 'dwelling' ? building(ctx, t, 'build') : none;
    case 'repair':
      // opravy obydlí, oprava modly a svatyně (abandonment.md – Oprava) – lidé kolem stavby
      return t.kind === 'dwelling' || t.kind === 'sacred' ? building(ctx, t, 'build') : none;
    case 'craft':
      if (t.kind === 'kiln') return kilnWorkers(ctx, t);
      return t.kind === 'dwelling' ? craftsmen(ctx, t.id) : none;
    case 'plant':
      // uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa)
      return t.kind === 'trees' ? planting(ctx, t.ids) : none;
    case 'domestic':
      return domestic(ctx);
    case 'trade':
      // nosiči výpravy k sousedovi po zemské stezce (trade.md); nákup u souseda bez stezky jde
      // krajinou rovně ke kraji mapy (crafts.md – Nákup u sousedů)
      if (t.kind === 'edge') return porters(ctx, null, [ctx.center, t]);
      return t.kind === 'trail' ? porters(ctx, t.id) : none;
    case 'haul': {
      // honák a nakladač s vozem (wagons.md – Vůz): nakladač u svozu jako nosiči snopů, sekáči
      // na louce a dřevorubci u stromů; honák jde s vozem (kreslí ho cart-renderer.ts – fáze 3);
      // s uhlím a vodou (Co vozy vozí) jde posádka s vozem – nakladače nekreslí; s osivem stojí
      // nakladač na poli jako nosiči
      const crew =
        share.job === 'charcoal' || share.job === 'water'
          ? none
          : t.kind === 'field'
            ? carriers(ctx, share, t.id)
            : t.kind === 'meadow'
              ? meadowRows(ctx, t.cells, count)
              : t.kind === 'trees'
                ? felling(ctx, t.ids, false)
                : none;
      const key = targetKey(t);
      const drovers = (ctx.village.carts ?? []).filter(
        (c) =>
          c.job?.activity === 'haul' &&
          (c.route?.length ?? 0) >= 2 &&
          targetKey(c.job.target) === key,
      ).length;
      return drovers > 0 ? (i, who) => (i < drovers ? null : crew(i, who)) : crew;
    }
    case 'ore':
      // kovář a synové od 14 let kopou rudu u jámy na rudišti (crafts.md – Uhlí a ruda kováře)
      return t.kind === 'ore' ? oreDiggers(ctx, t) : none;
    case 'clay':
      // hrnčíř a synové od 14 let kopou hlínu u jámy na hliništi (crafts.md – Hlína hrnčíře)
      return t.kind === 'clay' ? oreDiggers(ctx, t) : none;
    case 'fetch':
      // nošení uhlí a rudy v koších jde jako provoz na cestách (`smithFetchFigures`)
      return none;
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
  } else if (t.kind === 'site' || t.kind === 'dwelling' || t.kind === 'sacred') {
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
    // rozšíření ve stavbě – u nových čtverců (oxen.md – Ohrady podle druhu)
    const pending = (pen?.extraSquares ?? []).find((q) => q.pending);
    if (pen) anchors.push({ at: pen.built && pending ? pending : pen, clip: 'build' });
  } else if (t.kind === 'road') {
    const road = (ctx.village.roads ?? []).find((r) => r.id === t.id);
    const middle = road?.points[Math.floor(road.points.length / 2)];
    if (middle) anchors.push({ at: middle, clip: 'hoe' });
  }
  // dřevo pro stavbu: když u stromů místo není, aspoň u stavby, pro kterou se kácí
  if (share.construction !== undefined) houseAt(share.construction);
  return anchors;
}

interface Square {
  x: number;
  z: number;
  size: number;
  /** Natočený čtverec natočené stavby (fields.md – Natočené stavby). */
  rotation?: number;
}

/** Osy čtverce ve světě – místní x a z (natočený čtverec natočené stavby). */
function squareAxes(square: { rotation?: number }): [Point, Point] {
  if (!square.rotation) {
    return [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ];
  }
  const [c, s] = rotationCosSin(square.rotation);
  return [
    { x: c, z: -s },
    { x: s, z: c },
  ];
}

/** Rohy čtverce ve světě (místní −−, +−, ++, −+). */
function squareCorners(square: {
  x: number;
  z: number;
  size: number;
  rotation?: number;
}): [number, number][] {
  const h = square.size / 2;
  const [ax, az] = squareAxes(square);
  return (
    [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ] as const
  ).map(([u, v]): [number, number] => [
    square.x + ax.x * u + az.x * v,
    square.z + ax.z * u + az.z * v,
  ]);
}

/** Bod do souřadnic čtverce (u podél místní x, v podél místní z). */
function squareLocal(square: Square, x: number, z: number): [number, number] {
  const [ax, az] = squareAxes(square);
  const dx = x - square.x;
  const dz = z - square.z;
  return [dx * ax.x + dz * ax.z, dx * az.x + dz * az.z];
}

/** Bod ve čtverci rozšířeném o `margin` (ostrá nerovnost, v osách čtverce). */
function inSquare(square: Square, x: number, z: number, margin: number): boolean {
  const h = square.size / 2 + margin;
  if (!square.rotation) return Math.abs(x - square.x) < h && Math.abs(z - square.z) < h;
  const [u, v] = squareLocal(square, x, z);
  return Math.abs(u) < h && Math.abs(v) < h;
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
  // podél řádků (i natočeného pole), napříč o `v` ve směru práce
  return freeLane(
    ctx,
    square,
    { x: frame.along[0], z: frame.along[1] },
    { x: frame.across[0], z: frame.across[1] },
    v,
    half,
  );
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
  // řada podél té osy čtverce, která míří nejvíc od vsi (natočený čtverec v jeho osách)
  const [ax, az] = squareAxes(square);
  const du = dx * ax.x + dz * ax.z;
  const dv = dx * az.x + dz * az.z;
  const alongU = Math.abs(du) >= Math.abs(dv);
  const sign = (alongU ? du : dv) >= 0 ? 1 : -1;
  const dir = alongU ? { x: ax.x * sign, z: ax.z * sign } : { x: az.x * sign, z: az.z * sign };
  const perp = alongU ? az : ax;
  const half = square.size / 2 - ROW_MARGIN_M;
  const across = -half + ((member + 0.5) * 2 * half) / size + (who.phase - 0.5) * 0.6;
  const lane = freeLane(ctx, square, dir, perp, across, half);
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

/**
 * Řada přes čtverec ve směru `dir` (jednotkový), posunutá o `across` ve směru `perp` – zkrácená na
 * nejdelší volný úsek (voda, dům).
 */
function freeLane(
  ctx: Context,
  square: Square,
  dir: Point,
  perp: Point,
  across: number,
  half: number,
): Lane | null {
  const at = (u: number): Point => ({
    x: square.x + dir.x * u + perp.x * across,
    z: square.z + dir.z * u + perp.z * across,
  });
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
    // od vchodu jako provoz na cestách (`trafficDoor` – vchod pozemku může ústit k sousednímu
    // pozemku); stejné místo pro všechny nosiče domu – trasa se hledá jednou
    const door = trafficDoor(ctx, home) ?? doorPoint(home);
    const half = square.size / 2 - ROW_MARGIN_M;
    // kraj čtverce nejblíž dveřím (v osách čtverce – i natočeného)
    const [u, v] = squareLocal(square, door.x, door.z);
    const [ax, az] = squareAxes(square);
    const cu = Math.min(half, Math.max(-half, u));
    const cv = Math.min(half, Math.max(-half, v));
    const edge = {
      x: square.x + ax.x * cu + az.x * cv,
      z: square.z + ax.z * cu + az.z * cv,
    };
    const path = walkRoute(ctx, door, edge) ?? fieldPath(ctx, door, edge);
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

/** Do kolika let je postava dítě (menší) – jako věková skupina jádra (AGE.adult). */
const CHILD_UNDER = 14;

/**
 * Kopáči rudy (crafts.md – Uhlí a ruda kováře): na valu nejčerstvější jámy u rudiště (do
 * ORE_PIT_REACH_M od místa) kolem dokola, čelem do jámy, s motykou; bez jámy kolem místa.
 */
function oreDiggers(ctx: Context, site: { x: number; z: number }): Placer {
  const near = (ctx.village.orePits ?? [])
    .filter((p) => Math.hypot(p.x - site.x, p.z - site.z) <= ORE_PIT_REACH_M)
    .sort((a, b) => a.overgrowth - b.overgrowth || b.kg - a.kg);
  const pit = near[0] ?? { x: site.x, z: site.z, kg: 0 };
  const radius = orePitRadius(pit.kg) + gap(0.2);
  return (i) => {
    const a = 0.7 + i * 2.1;
    const x = pit.x + Math.cos(a) * radius;
    const z = pit.z + Math.sin(a) * radius;
    const spot = nearestFree(ctx, x, z, 3);
    if (!spot) return null;
    const h = unit(pit.x - spot.x, pit.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, 'hoe');
  };
}
/** Jámy rudiště leží kolem místa nejvýš tak daleko (m – SMITH_SUPPLY.pitSpreadM a rezerva). */
const ORE_PIT_REACH_M = 8;

/**
 * Nosiči kováře (crafts.md – Uhlí a ruda kováře; villagers.md – Provoz na cestách): kdo dnes nese
 * uhlí od milíře nebo rudu z rudiště (synové – menší postavy, nebo kovář), jde z kovárny po
 * pěšinách k milíři či jámě tam bez nákladu a zpět s košem, doma na chvíli zmizí. Každý nosič je
 * jedna postava (`fetchCarriers`) – syn chodí sám celý den tam a zpět, ne proud lidí. S vozem
 * jede kovář vozem.
 */
function smithFetchFigures(ctx: Context, labor: SceneLabor): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (const share of labor.shares) {
    if (share.activity !== 'fetch' || share.carts) continue;
    const t = share.target;
    if (t.kind !== 'ore' && t.kind !== 'clay' && t.kind !== 'kiln') continue;
    const from = t.kind === 'kiln' ? t.from : t.id;
    if (from === undefined) continue;
    const home = ctx.houses.find((h) => h.id === from && h.built);
    if (!home) continue;
    const door = trafficDoor(ctx, home);
    const goal = nearestFree(ctx, t.x, t.z, 8);
    if (!door || !goal) continue;
    const path = walkRoute(ctx, door, goal);
    if (!path) continue;
    const key = `fetch:${targetKey(t)}:${(share.ages ?? []).join('.')}`;
    const base = hash01(stringHash(key), 1, 93);
    const goods = t.kind === 'kiln' ? 'charcoal' : t.kind;
    fetchCarriers(share.ages).forEach((age, k) => {
      const child = age < CHILD_UNDER;
      // syn kováře podle věku z jádra (uhlí od 10 let, ruda od 14), nebo kovář sám
      const c = cast(ctx, `${key}:${k}`, { women: 0, child }, () =>
        ctx.roster!.take({
          from: AGE.olderChild,
          to: Infinity,
          homes: new Set([from]),
          sex: 'male',
          age,
        }),
      );
      if (!c) return;
      const who = c.who;
      const pose = shuttle(path, {
        outClip: 'walk',
        outSpeed: walkSpeed(who.kind, 'walk', who.scale),
        endClip: 'idle',
        endS: FETCH_LOAD_S,
        backClip: 'carry',
        backSpeed: walkSpeed(who.kind, 'carry', who.scale),
        restClip: 'idle',
        restS: TRAFFIC_HOME_S,
        restHidden: true,
        phase: streamPhase(k, base),
      });
      const hair = child ? 'natural' : adultHair(who, ctx.sexes.married);
      out.push(figure(c, pose, hair, { kind: 'fetch', goods }));
    });
  }
  return out;
}
/** Nosič kováře u milíře nebo jámy nakládá koš (s). */
const FETCH_LOAD_S = 5;

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
  const spots = craftSpots(house.craft, house.position, house.frame);
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
 * Stavba a opravy: lidé kolem domu (vně jámy a šíje) čelem k němu – i kolem opravované modly
 * a svatyně (abandonment.md – Oprava). Staveniště v první čtvrtině průběhu se kope motykou
 * (jáma), pak se staví.
 */
function building(
  ctx: Context,
  target: Extract<LaborTarget, { kind: 'site' | 'dwelling' | 'sacred' }>,
  clip: VillagerClip,
): Placer {
  const house = ctx.houses.find((h) => h.id === target.id && h.built === (target.kind !== 'site'));
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
  plot: { x: number; z: number; size: number; rotation?: number },
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
      const [u, v] = squareLocal(plot, x, z);
      if (Math.abs(u) > inside || Math.abs(v) > inside) continue;
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
  plot: { x: number; z: number; size: number; rotation?: number },
): Placer {
  const inset = plot.size / 2 - gap(0.8);
  const [ax, az] = squareAxes(plot);
  return (i, who) => {
    const side = (i + Math.floor(who.phase * 4)) % 4;
    const along = (((i * 0.37 + who.phase) % 1) * 2 - 1) * inset * 0.8;

    // normála strany v osách pozemku (natočený pozemek natočená)
    const [su, sv] = PLOT_SIDES[side] ?? [1, 0];
    const nx = ax.x * su + az.x * sv;
    const nz = ax.z * su + az.z * sv;
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
    if (squares.some((s) => inSquare(s, x, z, 0.5))) return false;
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
 * Jabloně podél pevné cesty (roads.md – Vysazení jabloní): sklizeň a péče u stromů (`tree`),
 * výsadba u míst, která na ni čekají (`planting` – okopávají jámu). Po skupinách se přesouvají
 * po řadě jako v sadu.
 */
function roadApples(
  ctx: Context,
  roadId: number,
  count: number,
  stage: 'tree' | 'planting',
): Placer {
  const trees = (ctx.village.roadApples ?? []).filter(
    (a) => a.roadId === roadId && a.stage === stage,
  );
  if (trees.length === 0) return none;
  const start = Math.floor(ctx.day / CREW_MOVE_DAYS) * count;
  return (i, who) => {
    const tree = trees[(start + i) % trees.length]!;
    return stage === 'tree'
      ? atTree(ctx, tree, who, 'fruit', gap(1.3))
      : atTree(ctx, tree, who, 'hoe', gap(0.9));
  };
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
        const inside = cemetery.squares.some((s) => inSquare(s, x, z, 0));
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
  const found = (ctx.village.pens ?? []).find((p) => p.id === penId);
  if (!found) return none;
  // rozšíření ve stavbě – lidé kolem nového čtverce (oxen.md – Ohrady podle druhu)
  const pending = found.built ? (found.extraSquares ?? []).find((q) => q.pending) : undefined;
  const pen = pending ? { ...found, x: pending.x, z: pending.z } : found;
  const out = pen.size / 2 + HOUSE_MARGIN_M + gap(0.5);
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  // strany v osách ohrady (natočená ohrada – fields.md, Natočené stavby)
  const [ax, az] = squareAxes(pen);
  for (const [sx, sz] of PLOT_SIDES) {
    const nx = ax.x * sx + az.x * sz;
    const nz = ax.z * sx + az.z * sz;
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
 * Vylepšení pevné cesty (roads.md): lidé podél úseku po obou okrajích pásu – rozšiřují
 * a srovnávají cestu, kladou kmeny hatě (motyka a stavba střídavě), čelem k ose.
 */
function roadWork(ctx: Context, roadId: number): Placer {
  const road = (ctx.village.roads ?? []).find((r) => r.id === roadId);
  if (!road || road.points.length < 2) return none;
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  const at = [0];
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    at.push(at[k - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = at[at.length - 1]!;
  // práce postupuje po cestě – od začátku osy úseku, nebo od konce (`fromEnd`); lidé u čela
  // práce, kousek před ním a za ním
  const done = (road.upgrade?.progress ?? 0) * length;
  const front = road.upgrade?.fromEnd ? length - done : done;
  for (let k = 0; k < 12; k++) {
    const d = Math.min(length, Math.max(0, front + (k - 4) * 3));
    let seg = 1;
    while (seg < road.points.length - 1 && at[seg]! < d) seg++;
    const a = road.points[seg - 1]!;
    const b = road.points[seg]!;
    const span = Math.max(1e-6, at[seg]! - at[seg - 1]!);
    const u = Math.min(1, Math.max(0, (d - at[seg - 1]!) / span));
    const nx = -(b.z - a.z) / span;
    const nz = (b.x - a.x) / span;
    const side = k % 2 === 0 ? 1 : -1;
    const x = a.x + (b.x - a.x) * u + nx * side * gap(1.6);
    const z = a.z + (b.z - a.z) * u + nz * side * gap(1.6);
    if (free(ctx, x, z)) slots.push({ x, z, hx: -nx * side, hz: -nz * side });
  }
  if (slots.length === 0) return none;
  return (i) => {
    const slot = slots[i % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 2 === 0 ? 'hoe' : 'build');
  };
}

/**
 * Nosiči výpravy k sousedovi (trade.md – Obchod): jdou s nákladem po zemské stezce od dvorce ke
 * kraji mapy a zase zpět (skutečný čas jako ostatní postavy) – rozestoupení podle fáze, takže
 * tvoří karavanu po celé stezce.
 */
function porters(
  ctx: Context,
  trailId: number | null,
  line?: readonly { x: number; z: number }[],
): Placer {
  const points = line ?? (ctx.village.trails ?? []).find((t) => t.id === trailId)?.points ?? [];
  if (points.length < 2) return none;
  const path = route(points.map((p) => [p.x, p.z] as const));
  return (_i, who) =>
    shuttle(path, {
      outClip: 'carry',
      outSpeed: walkSpeed(who.kind, 'carry', who.scale),
      endClip: 'idle',
      endS: 4,
      backClip: 'carry',
      backSpeed: walkSpeed(who.kind, 'carry', who.scale),
      restClip: 'idle',
      restS: 3,
      phase: who.phase,
    });
}

/**
 * Domácí práce venku: u obydlí (po domech dokola) postávají ženy před vchodem a některé
 * chodí kousek od domu (pro vodu a dřevo po pěšinách chodí provoz na cestách).
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
    // pro vodu a dřevo po pěšinách chodí provoz na cestách (trafficFigures) – domácí práce jen
    // kousek od domu
    if (turn % 2 === 1) {
      // 6–12 m od domu směrem od vsi (k hromadě dřeva, ke džberu)
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

/**
 * Pochůzka pro dřevo nejvýš tak daleko (m po pěšině) – dál chodí jen kousek od domu. Pro vodu se
 * chodí vždy, i daleko (paths.md – Pochůzky pro vodu; Martin, 19. 10. 2026).
 */
const ERRAND_MAX_M: Record<'water' | 'wood', number> = { water: Infinity, wood: 220 };

/**
 * Trasa pro vodu nebo dřevo po pěšině domácnosti, nebo null – bez pěšin, pro dřevo moc daleko,
 * nebo cíl ve vodě. Konec pochůzky mimo rastr schůdné země (vzdálená voda) je suchý břeh ze sítě
 * pěšin – postava se zastaví na něm.
 */
function errandPath(ctx: Context, home: House, door: Point, kind: 'water' | 'wood'): Route | null {
  const paths = ctx.paths;
  if (!paths) return null;
  const end = paths.errand(home.id, kind);
  if (!end) return null;
  // pěšina končí u vody / pod stromy – postava se zastaví na nejbližším volném místě
  const goal = nearestFree(ctx, end.x, end.z, 4) ?? (kind === 'water' ? end : null);
  const along = paths.route(door, end);
  if (!goal || !along || along.points.length < 2) return null;
  const points = [...along.points.slice(0, -1), [goal.x, goal.z] as const];
  if (!trafficRouteOk(ctx, points, false)) return null;
  const path = route(points, along.pace);
  return path.length <= ERRAND_MAX_M[kind] ? path : null;
}

// --- provoz na cestách (villagers.md – Provoz na cestách) ------------------------------------

/**
 * Jak chodí lidé po cestě kterého druhu: podíl žen a dětí (pro vodu chodily hlavně ženy a děti),
 * co dělají na konci (nabírají vodu, sbírají dřevo, u pole chvíli postojí), s čím jdou zpět.
 */
const TRAFFIC_LOOK: Record<
  TrafficKind,
  {
    women: number;
    children: number;
    outClip: VillagerClip;
    endClip: VillagerClip;
    endS: number;
    backClip: VillagerClip;
  }
> = {
  // s vahadlem a vědry tam i zpět, u vody chvíli stojí (nabírá)
  water: {
    women: 0.75,
    children: 0.3,
    outClip: 'carry-water',
    endClip: 'water-idle',
    endS: 5,
    backClip: 'carry-water',
  },
  wood: {
    women: 0.45,
    children: 0.2,
    outClip: 'walk',
    endClip: 'weed',
    endS: 6,
    backClip: 'carry-wood',
  },
  field: {
    women: 0.45,
    children: 0,
    outClip: 'walk',
    endClip: 'idle',
    endS: 2,
    backClip: 'walk',
  },
  // uhlíř ze zemnice k milíři a zpět (crafts.md – Milíř u skácených buků)
  kiln: {
    women: 0.35,
    children: 0,
    outClip: 'walk',
    endClip: 'idle',
    endS: 2,
    backClip: 'walk',
  },
};
/** Mezi cestami je člověk chvíli doma – není vidět (s). */
const TRAFFIC_HOME_S = 6;
/** Na pole a zpět chodí lidé od těchto prací (u nosičů úrody, kteří chodí tak jako tak, ne). */
const FIELD_COMMUTE: ReadonlySet<LaborActivity> = new Set([
  'dig',
  'reclaim',
  'sow',
  'weed',
  'harvest',
  'mow',
  'found-field',
]);

/** Proud lidí po jedné trase (`TrafficStream`) s trasou a podílem žen. */
interface TrafficRoute extends TrafficStream {
  key: string;
  route: Route;
  women: number;
  /** Domácnost (id obydlí), od jejíchž dveří lidé jdou. */
  home: number;
}

/**
 * Lidé na cestách (road-traffic.ts): pro vodu a k lesu po pěšině každé domácnosti, mezi domem
 * a polem od domů, ke kterým patří díly dnešní práce. Kolik jich na které trase je, určí cesty
 * za den a délka cesty (`trafficCounts`, nejvýš `max`); po trase jdou rozestoupení (fáze se
 * zlatým řezem), tam bez nákladu, zpět s vodou, dřevem nebo z pole, a doma na chvíli zmizí.
 */
function trafficFigures(ctx: Context, labor: SceneLabor, max: number): PlannedVillager[] {
  const streams = trafficRoutes(ctx, labor);
  const counts = trafficCounts(streams, max);
  const out: PlannedVillager[] = [];
  streams.forEach((stream, s) => {
    const count = counts[s] ?? 0;
    const look = TRAFFIC_LOOK[stream.kind];
    const base = hash01(stringHash(stream.key), 1, 93);
    for (let k = 0; k < count; k++) {
      const key = `traffic:${stream.key}:${k}`;
      const child =
        labor.people.children > 0 &&
        hash01((ctx.seed * 31 + stringHash(key)) | 0, 9, 93) < look.children;
      const c = cast(
        ctx,
        key,
        { women: womenChance(stream.women, child ? ctx.sexes.girls : ctx.sexes.women), child },
        (sex) => trafficWalker(ctx, stream, child, sex),
      );
      if (!c) continue;
      const who = c.who;
      const pose = shuttle(stream.route, {
        outClip: look.outClip,
        outSpeed: walkSpeed(who.kind, look.outClip, who.scale),
        endClip: look.endClip,
        endS: look.endS,
        backClip: look.backClip,
        backSpeed: walkSpeed(who.kind, look.backClip, who.scale),
        restClip: 'idle',
        restS: TRAFFIC_HOME_S,
        restHidden: true,
        phase: streamPhase(k, base),
      });
      const hair = child ? 'natural' : adultHair(who, ctx.sexes.married);
      out.push(figure(c, pose, hair, { kind: 'traffic', traffic: stream.kind }));
    }
  });
  return out;
}

/**
 * Kdo jde po cestě (villagers.md – Výběr postavy): člověk z domácnosti, od jejíchž dveří proud
 * vychází – pro vodu a dřevo dospělí i výrostci (dítě, když ho los postavy chce, jinak dospělý),
 * na pole dospělí, k milíři uhlíř; z dílny, která dnes pracuje, na pole nikdo.
 */
function trafficWalker(
  ctx: Context,
  stream: TrafficRoute,
  child: boolean,
  sex: Sex,
): ScenePerson | null {
  const roster = ctx.roster!;
  const homes = new Set([stream.home]);
  if (stream.kind === 'field' && roster.busy(stream.home)) return null;
  const adults = (): ScenePerson | null => roster.take({ ...ADULTS, homes, sex });
  if (stream.kind !== 'water' && stream.kind !== 'wood') return adults();
  const kids = (): ScenePerson | null => roster.take({ ...YOUNGSTERS, homes, sex });
  return child ? (kids() ?? adults()) : (adults() ?? kids());
}

/** Proudy lidí vsi: voda a dřevo po domácnostech, pole po prácích dne a domech. */
function trafficRoutes(ctx: Context, labor: SceneLabor): TrafficRoute[] {
  const homes = ctx.homes.filter((h) => h.inhabited).sort((a, b) => a.id - b.id);
  const people = new Map(
    trafficHomes(
      labor,
      homes.map((h) => h.id),
    ).map((h) => [h.id, h]),
  );
  const out: TrafficRoute[] = [];
  const add = (
    kind: TrafficKind,
    key: string,
    trips: number,
    path: Route | null,
    women: number,
    home: number,
  ): void => {
    if (!path || trips <= 0 || path.length < 1) return;
    // táž práce na témže poli víckrát (ozim a jař) – jeden proud, cesty se sečtou
    const same = out.find((s) => s.key === key);
    if (same) same.trips += trips;
    else {
      const activeS = activeSeconds(path, kind);
      out.push({ kind, key, trips, route: path, activeS, women, home });
    }
  };
  for (const home of homes) {
    const household = people.get(home.id);
    if (!household) continue;
    const door = trafficDoor(ctx, home);
    if (!door) continue;
    for (const kind of ['water', 'wood'] as const) {
      const trips = kind === 'water' ? waterTrips(household) : woodTrips(labor.month);
      if (trips <= 0) continue;
      add(
        kind,
        `${kind}:${home.id}`,
        trips,
        errandPath(ctx, home, door, kind),
        TRAFFIC_LOOK[kind].women,
        home.id,
      );
    }
  }
  // uhlíř chodí ze zemnice k milíři (crafts.md – Milíř u skácených buků): cesta tam a zpět na
  // člověkoden práce u milíře – jen ke vzdálenému milíři
  labor.shares.forEach((share) => {
    const t = share.target;
    if (share.activity !== 'craft' || t.kind !== 'kiln' || t.from !== undefined) return;
    const home = homes.find((h) => h.id === t.id);
    if (!home || share.manDays <= 0) return;
    const door = trafficDoor(ctx, home);
    if (!door || Math.hypot(t.x - door.x, t.z - door.z) < KILN_COMMUTE_MIN_M) return;
    const edge = towards(t, door, MILIR_SHAPE_M.radius + 1);
    add(
      'kiln',
      `kiln:${t.id}:${t.kiln ?? ''}`,
      share.manDays * FIELD_TRIPS_PER_MAN_DAY,
      walkRoute(ctx, door, edge) ?? fieldPath(ctx, door, edge),
      TRAFFIC_LOOK.kiln.women,
      home.id,
    );
  });
  labor.shares.forEach((share) => {
    if (!FIELD_COMMUTE.has(share.activity) || share.target.kind !== 'field') return;
    if (share.manDays <= 0) return;
    const fieldId = share.target.id;
    const work = fieldWork(ctx, fieldId);
    if (!work) return;
    const squares = workedSquares(ctx, share, work);
    if (squares.length === 0) return;
    // díl patří k nejbližšímu domu (holdings.ts) – od každého domu ke svému prvnímu dílu fronty
    const groups = new Map<number, { home: House; square: Square; n: number }>();
    for (const view of squares) {
      const home = nearestHouse(homes, view.part);
      if (!home) continue;
      const group = groups.get(home.id);
      if (group) group.n++;
      else groups.set(home.id, { home, square: view.part, n: 1 });
    }
    for (const { home, square, n } of groups.values()) {
      const door = trafficDoor(ctx, home);
      if (!door) continue;
      const trips = (share.manDays * FIELD_TRIPS_PER_MAN_DAY * n) / squares.length;
      const edge = squareEdge(square, door);
      add(
        'field',
        `field:${share.activity}:${fieldId}:${home.id}`,
        trips,
        walkRoute(ctx, door, edge) ?? fieldPath(ctx, door, edge),
        WOMEN[share.activity],
        home.id,
      );
    }
  });
  return out;
}

/** Milíř blíž zemnici než tolik (m) – uhlíř k němu nechodí jako proud lidí. */
const KILN_COMMUTE_MIN_M = 25;

/** Bod `distance` m od středu `center` směrem k bodu `to`. */
function towards(center: { x: number; z: number }, to: Point, distance: number): Point {
  const dx = to.x - center.x;
  const dz = to.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: center.x + (dx / len) * distance, z: center.z + (dz / len) * distance };
}

/** Jak daleko od pěšiny smí být díl pole, na který se jde po pěšině a pak přes pole (m). */
const FIELD_ENTRY_M = 260;

/**
 * Cesta na díl daleko v poli (Vlkov – pole přes 40 ha, pěšina dne končí na kraji pole u vsi): po
 * pěšinách k nejbližšímu bodu pěšiny u dílu a od něj rovně přes pole (pole lidi nezdržuje –
 * paths.md); rovný kus musí vést po suchu. Bez pěšin nebo přes vodu null.
 */
function fieldPath(ctx: Context, door: Point, edge: Point): Route | null {
  const along = ctx.paths?.route(door, edge, FIELD_ENTRY_M);
  if (!along || along.points.length < 2 || !trafficRouteOk(ctx, along.points)) return null;
  return route(along.points, along.pace);
}

/** O kolik metrů smí trasa po pěšinách zasáhnout do obdélníku domu, pozemku nebo ohrady. */
const ROUTE_HOUSE_SLACK_M = 1.5;

/**
 * Trasa po pěšinách pro provoz na cestách projde: odbočka na pěšinu a (`lastLeg`) z ní k cíli po
 * suchu mimo hroby; nikde přes dům nebo pozemek – vyhlazená pěšina smí jen o kousek
 * (ROUTE_HOUSE_SLACK_M) zasáhnout do rohu (síť pěšin domy obchází sama); k brance ohrady vede
 * pěšina krmení, ohrada se proto nekontroluje.
 */
function trafficRouteOk(
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
      if (ctx.houses.some((h) => !h.pen && inBox(h, x, z, -ROUTE_HOUSE_SLACK_M))) return false;
      if (leg && (!ctx.ground.walkable(x, z) || onGrave(ctx.graves, x, z))) return false;
    }
  }
  return true;
}

/** Jak daleko od vchodu může být místo, odkud člověk vyjde na cestu (sousední pozemky – m). */
const TRAFFIC_DOOR_REACH_M = 16;

/**
 * Kde člověk z domu vychází na cestu: před vchodem (u pozemku před plotem), nejbližší volné místo
 * – mezi sousedními pozemky i o pár metrů dál.
 */
function trafficDoor(ctx: Context, home: House): Point | null {
  const door = doorPoint(home);
  return nearestFree(ctx, door.x, door.z, TRAFFIC_DOOR_REACH_M);
}

/** Bod na kraji čtverce nejblíž bodu `p` (v osách čtverce – i natočeného). */
function squareEdge(square: Square, p: Point): Point {
  const half = square.size / 2 - ROW_MARGIN_M;
  const [u, v] = squareLocal(square, p.x, p.z);
  const [ax, az] = squareAxes(square);
  const cu = Math.min(half, Math.max(-half, u));
  const cv = Math.min(half, Math.max(-half, v));
  return { x: square.x + ax.x * cu + az.x * cv, z: square.z + ax.z * cu + az.z * cv };
}

/** Jak dlouho je člověk na cestě (s): tam, na konci, zpět – průměrná žena (FIGURE_SCALE). */
function activeSeconds(path: Route, kind: TrafficKind): number {
  const look = TRAFFIC_LOOK[kind];
  const walk = path.walkLength ?? path.length;
  return (
    walk / walkSpeed('woman', look.outClip, FIGURE_SCALE) +
    look.endS +
    walk / walkSpeed('woman', look.backClip, FIGURE_SCALE)
  );
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
    const slot = homes[i % homes.length]!;
    // starší doma (villagers.md – Výběr postavy): přednostně z domu postavy, stojí u svého domu
    const c = cast(
      ctx,
      `elder:${slot.id}:${i}`,
      { women: womenChance(0.5, ctx.sexes.elderWomen), child: false },
      () => ctx.roster!.take({ ...ELDERS, preferHome: slot.id }),
    );
    if (!c) continue;
    const home = (c.person && homes.find((h) => h.id === c.person!.home)) || slot;
    const who = c.who;
    const side = i % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + gap(0.7) : home.box.minX - gap(0.7);
    const p = worldPoint(home.position, edge, home.box.minZ * 0.3);
    const spot = nearestFree(ctx, p.x, p.z, 1.5);
    if (!spot) continue;
    const away = unit(spot.x - home.position.x, spot.z - home.position.z);
    out.push(
      figure(
        { who: { ...who, scale: who.scale * 0.97 }, person: c.person },
        stand(spot.x, spot.z, away.x, away.z, 'idle', 0.7),
        'grey',
        { kind: 'elder' },
      ),
    );
  }
  return out;
}

/**
 * Pasáci u stád – děti (zmenšený muž nebo žena), starší (šediny) a dospělí, jeden u každého
 * stáda (`herderKinds`).
 */
function herders(
  ctx: Context,
  kinds: readonly ('child' | 'elder' | 'adult')[],
  youngsters: readonly ScenePerson[] = [],
): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  kinds.forEach((kind, k) => {
    const c = cast(
      ctx,
      `herder:${k}`,
      {
        women: womenChance(
          kind === 'child' ? 0.4 : WOMEN.herding,
          kind === 'child'
            ? ctx.sexes.girls
            : kind === 'elder'
              ? ctx.sexes.elderWomen
              : ctx.sexes.women,
        ),
        child: kind === 'child',
      },
      // výrostci, kteří dnes pasou (`herderPeople`); starší a dospělí pasáci (dřívější
      // rozdělení práce) z lidí vsi
      () =>
        kind === 'child'
          ? (youngsters[k] ?? null)
          : ctx.roster!.take(kind === 'elder' ? ELDERS : ADULTS),
    );
    if (!c) return;
    const who = c.who;
    const speed = walkSpeed(who.kind, 'walk', who.scale) * 0.8;
    const home = nearestFree(ctx, ctx.center.x + 12 + k * 2, ctx.center.z + 12, 6) ?? ctx.center;
    const hair =
      kind === 'elder' ? 'grey' : kind === 'adult' ? adultHair(who, ctx.sexes.married) : 'natural';
    const pose = herder(k, home, who.seed, who.phase, speed, 0.8);
    out.push(figure(c, pose, hair, { kind: 'herd', herd: k }));
  });
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

/** Nejvýš tolik postav všech svateb dne (víc svateb naráz – nejnovější napřed). */
export const MAX_WEDDING_FIGURES_TOTAL = 60;

/**
 * Svatby, jejichž lidé jsou vidět během dne `window` – nejnovější napřed, dokud se jejich lidé
 * vejdou do MAX_WEDDING_FIGURES_TOTAL.
 */
function activeWeddings(plans: readonly WeddingPlan[], window: DayWindow | null): WeddingPlan[] {
  let total = 0;
  return [...plans]
    .filter((plan) => weddingActiveIn(plan, window))
    .sort((a, b) => b.timeline.startMs - a.timeline.startMs)
    .filter((plan) => {
      if (total + plan.members.length > MAX_WEDDING_FIGURES_TOTAL) return false;
      total += plan.members.length;
      return true;
    });
}

/**
 * Svatby vsi pro scénu (kinship.md – Svatba ve scéně, wedding-plan.ts): průvod vychází od vchodu
 * domu nevěsty (volné místo před vchodem jako provoz na cestách) po pěšinách; lidé stojí na
 * schůdné zemi mimo domy a pozemky (modla a svatyně se nepočítají – okolí hlídá místo obřadu).
 * Bez svateb, obydlí nebo hodin světa nic.
 */
export function planWeddings(
  village: SceneVillage,
  ground: VillagerGround,
  options: Pick<VillagerPlanOptions, 'seed' | 'paths' | 'dayWindow'>,
): WeddingPlan[] {
  const weddings = village.weddings ?? [];
  const dayWindow = options.dayWindow;
  if (weddings.length === 0 || village.dwellings.length === 0 || !dayWindow) return [];
  const ctx = context(village, ground, options.seed, 0, options.paths ?? null);
  // obydlí jsou v seznamu staveb první (pak milíře, modly a ohrady – id se mohou krýt)
  const dwellings = ctx.houses.slice(0, village.dwellings.length);
  const sacred = new Set((village.sacred?.buildings ?? []).map((b) => b.position));
  const blocking = ctx.houses.filter((h) => !sacred.has(h.position));
  return weddings.flatMap((wedding) => {
    const plan = weddingPlan(wedding, village, {
      dayWindow,
      door: (id) => {
        const house = dwellings.find((h) => h.id === id);
        return house ? trafficDoor(ctx, house) : null;
      },
      route: (a, b) => ctx.paths?.route(a, b)?.points ?? null,
      standable: (x, z) =>
        ctx.ground.walkable(x, z) && !blocking.some((h) => inBox(h, x, z, HOUSE_MARGIN_M)),
      figureScale: FIGURE_SCALE,
      seed: options.seed,
    });
    return plan ? [plan] : [];
  });
}

/**
 * Lidé svatby (wedding-plan.ts): nevěsta s věncem v běleném lnu, ostatní pestřeji oblečení
 * (barva instance), podle pohlaví a věku z jádra – vdané ženy v šátcích, starší s šedinami.
 */
function weddingFigures(
  ctx: Context,
  plan: WeddingPlan,
  window: DayWindow | null,
): PlannedVillager[] {
  const shown = new Set(weddingMembersIn(plan, window));
  return plan.members.flatMap((member, index) => {
    // jen kdo je dnes vidět – ve dny cesty lidí z okolí jsou svatebčané ze vsi u své práce
    if (!shown.has(index)) return [];
    const key = `wedding:${plan.key}:${member.key}`;
    const look = { women: member.sex === 'female' ? 1 : 0, child: member.child };
    const spouse = member.role === 'bride' || member.role === 'groom';
    // svatebčan je člověk vsi (id z jádra); lidé z okolí ne – postava je, vybrat nejde; pár se
    // ukáže vždy (i když ho starší zápis nezná)
    const c =
      (member.person !== undefined && member.role !== 'companion'
        ? cast(ctx, key, look, () => ctx.roster!.takeId(member.person!))
        : null) ?? (spouse || member.person === undefined ? cast(ctx, key, look, STRANGER) : null);
    if (!c) return [];
    const hair: HairLook = member.elder
      ? 'grey'
      : member.child
        ? 'natural'
        : adultHair(c.who, ctx.sexes.married);
    const pose = weddingPose(plan, index, c.who.kind, c.who.scale);
    const role = member.role === 'bride' || member.role === 'groom' ? member.role : 'guest';
    const out = figure(c, pose, hair, { kind: 'wedding', role });
    // nevěsta s věncem v běleném lnu, svatebčané pestřeji
    const cloth =
      member.role === 'bride' ? BRIDE_CLOTH : weddingCloth(weddingLookRoll(plan, index));
    return [{ ...out, look: { cloth, hair: member.role === 'bride' ? 'wreath' : out.look.hair } }];
  });
}
