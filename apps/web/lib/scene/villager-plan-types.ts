// Typy, konstanty a kontext plánu postav (rozhraní Context, Placer, House, Box…).
import type { DogPlan } from './dogs';
import type { RidePlan } from './riders';
import type { HuntSpotFn } from './villager-plan-lord';
import { type Craft, type Position, type ShapeFrame } from '@bohemia/game';
import type { LaborActivity, SceneVillage } from '../village-view';
import { type DayWindow } from './caravan';
import { type FuneralPlan } from './funeral-plan';
import { type WeddingPlan } from './wedding-plan';
import { type CellSquare } from './field-cells';
import {
  type PoseFn,
  type ShuttleCycle,
  type VillagerClip,
  type VillagerKind,
} from './villager-motion';
import { DayRoster, type PersonJob } from './villager-roster';

/**
 * Postavy jsou stylizovaně o 20 % větší než skutečná výška modelu (žena 1,6 m, muž 1,72 m),
 * jako domácí zvířata – z kamery (50–120 m) by jinak byly moc malé (Martin). Rozestupy mezi
 * lidmi a od domů, stromů a plotů se zvětšují s nimi (`gap`).
 */
export const FIGURE_SCALE = 1.2;

/** Rozestup `m` metrů pro postavu ve skutečné velikosti, zvětšený s postavami. */
export function gap(m: number): number {
  return m * FIGURE_SCALE;
}

/** Nejvýš tolik pracujících postav – víc se jich zmenší poměrně. */
export const MAX_WORKERS = 60;

/** Nejvýš tolik starších u domů a kolik starších na jednu postavu. */
export const MAX_ELDERS = 4;

export const ELDERS_PER_FIGURE = 2;

/** Kolik lidí pracuje na jednom čtverci pole (řada) a jak často se řady posunou (herní dny). */
export const CREW = 4;

export const CREW_MOVE_DAYS = 2;

/** Zimní měsíce – venku je méně lidí (domácí práce u ohně, nečinní uvnitř). */
export const WINTER_MONTHS: readonly number[] = [12, 1, 2];

/**
 * Kolik z domácí práce a nečinných je vidět venku (zbytek je v obydlí) – domácí výroba se
 * dělá hlavně uvnitř a hlavně v zimě (fields.md – Práce).
 */
export const OUTDOORS: Partial<Record<LaborActivity, { summer: number; winter: number }>> = {
  domestic: { summer: 0.5, winter: 0.25 },
  idle: { summer: 1, winter: 0.3 },
};

/** Podíl žen v činnosti (jinak muži) – jen vzhled, jádro pohlaví nezná. */
export const WOMEN: Record<LaborActivity, number> = {
  reclaim: 0.2,
  dig: 0.3,
  sow: 0.3,
  // plejí hlavně ženy a děti, kosou sekají muži (fields.md – Pletí jednou a rychle, Martin
  // 25. 10. 2026) – u pletí dospělých bere scéna podíl žen z jádra (`LaborShare.women`)
  weed: 0.9,
  harvest: 0.65,
  carry: 0.5,
  thresh: 0.3,
  plough: 0,
  mow: 0.1,
  slaughter: 0.4,
  milking: 0.9,
  'animal-care': 0.4,
  'horse-care': 0.4,
  'horse-shoeing': 0,
  herding: 0.2,
  // rybáři a oka na zajíce (wildlife.md – Drobná zvěř a ryby) – scéna je dokreslí až s W11
  // noční hlídka polí – ve dne nikdo, v noci vesničané spí v domech
  watch: 0,
  fish: 0.2,
  snare: 0.3,
  'orchard-care': 0.3,
  'orchard-harvest': 0.6,
  build: 0.15,
  pen: 0.15,
  fell: 0.05,
  'found-field': 0.2,
  'orchard-plant': 0.3,
  cemetery: 0.2,
  repair: 0.2,
  // řemeslo dělá jen řemeslník a jeho synové (crafts.md – Kdo dělá řemeslo)
  craft: 0,
  plant: 0,
  // kovář a jeho synové (crafts.md – Uhlí a ruda kováře) – muži
  ore: 0,
  clay: 0.2,
  // obilné jámy – kopání, nošení zrna z humna a pečetění (production-chains.md – Obilné jámy)
  'grain-pit': 0.3,
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
export const MARRIED = 0.7;

/**
 * Práce v řadě: jak dlouho na místě (dvě až tři opakování klipu) a o kolik metrů popojde.
 */
export const ROW: Partial<Record<VillagerClip, { workS: number; stepM: number }>> = {
  hoe: { workS: 5.4, stepM: 0.8 },
  reap: { workS: 8.3, stepM: 1 },
  weed: { workS: 6.6, stepM: 1.2 },
  seed: { workS: 4.2, stepM: 1.5 },
};

/** Odstup od okraje čtverce pole (m) a nejkratší řada, na které se ještě pracuje. */
export const ROW_MARGIN_M = 1.2;

export const MIN_LANE_M = 3;

/** Odstup od domu (m), kam se nevstupuje (k obdélníku domu se šíjí). */
export const HOUSE_MARGIN_M = gap(0.3);

/** Odstup dřevorubce od kmene (m) – kmeny stromů ve scéně mají poloměr až ≈ 0,8 m. */
export const FELL_REACH_M = 1.3 + gap(0.5);

/** Staveniště před vchodem (m, souřadnice domu) – nářadí a hlína u šíje. */
export const SITE_FRONT_M = 5;

/** Krok kontroly trasy (m). */
export const ROUTE_STEP_M = 1.5;

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
  /**
   * Pochůzka jako celý cyklus (villagers.md – Pochůzka se dokončí): z domu k cíli a zpět – při
   * změně plánu ji postava na cestě dokončí (villager-errands.ts). Bez údaje není pochůzka.
   */
  errand?: Errand;
}

/** Cyklus pochůzky postavy (`shuttleCycle`) a jak ho změna plánu omezila. */
export interface Errand extends ShuttleCycle {
  /** Trasa a tempo – stejné u stejné postavy = táž pochůzka, pokračuje plynule. */
  sig: string;
  /** Nový člověk v proudu: do té doby (s) je doma, vyjde s cyklem (ne uprostřed cesty). */
  fromS?: number;
  /** Dokončovaná pochůzka: v tu chvíli (s) vejde do domu a z plánu odpadne. */
  untilS?: number;
}

/** Terén pro postavy (bez vsi). */
export interface VillagerGround {
  /** Smí tu stát člověk – ne voda a břeh, strmá skála ani okraj krajiny. */
  walkable(x: number, z: number): boolean;
  /** Poloha stromu z vrstvy překážek, nebo null. */
  tree(id: number): { x: number; z: number } | null;
  /** Stojící dospělé stromy ve čtverci (střed, polovina strany) – nejvýš `max`. */
  treesIn(x: number, z: number, half: number, max: number): { x: number; z: number }[];
  /**
   * Značka stavu stromů: dokud je stejný objekt, jsou stromy (`treesIn`) tytéž – index skupinek
   * stromů se mezi přeplánováními nepočítá znovu. Bez ní se počítá při každém plánu.
   */
  treesToken?: object;
}

/**
 * Vyšlapané pěšiny vsi pro postavy (path-network.ts, paths.md): trasa po pěšinách a kam chodí
 * domácnost pro vodu a dřevo. Bez nich se chodí rovnou.
 */
export interface VillagerPaths {
  /**
   * Trasa z `a` do `b` po pěšinách – body [x, z] od `a` do `b` a tempo úseků (po pěšině se jde
   * rychleji – paths.md), nebo null – jde se rovnou. `reach` = jak daleko od pěšiny smí cíl být
   * (bez údaje kousek – díl daleko v poli: po pěšině k poli a přes pole). `dwellingId` = obydlí
   * domácnosti: její trasa (`d:<id>`) má přednost před geometricky bližší trasou cizí domácnosti.
   */
  route(
    a: { x: number; z: number },
    b: { x: number; z: number },
    reach?: number,
    dwellingId?: number,
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
  /**
   * Okraj lesa u zvěře pro lov dne (VillageWildlife.huntSpot – wildlife.md, Ve scéně); bez údaje
   * nebo bez zvěře ve scéně jdou lovci k nejbližšímu okraji lesa (`forestEdge`).
   */
  huntSpot?: HuntSpotFn;
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
  /** Jízdy dne vojvodovy rodiny (riders.ts) – koně kreslí livestock.ts. Bez údaje se nejezdí. */
  rides?: RidePlan[];
  /** Psi dvorce dne (dogs.ts) – kreslí livestock.ts. Bez údaje dvorec psy nemá. */
  dogs?: DogPlan[];
}

/** Honák spřežení je výrostek – přednostně člověk nejblíž tomuto věku (oxen.md – honáček). */
export const LEADER_AGE = 12;

/** Obdélník domu v jeho souřadnicích (x napříč, z k vchodu). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Stavba, kolem které lidé stojí a kterou obcházejí: obydlí (hotové i staveniště), nebo modla
 * či svatyně (`sacred` – jen staveniště a překážka, nebydlí se v ní).
 */
export interface House {
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
export const MILIR_ID_OFFSET = -1_000_000;

/** Id překážky „milíř v lese“ (crafts.md – Uhlíř) – podle id dílny uhlíře. */
export const FOREST_KILN_ID_OFFSET = -2_000_000;

/** Dřevo dávky leží u lesního milíře – kácení do tolika metrů od něj nosí polena k němu. */
export const FOREST_KILN_HAUL_M = 120;

export interface Point {
  x: number;
  z: number;
}

export interface Identity {
  key: string;
  kind: VillagerKind;
  scale: number;
  phase: number;
  seed: number;
}

/** Kontext rozmístění – ves, terén a z nich odvozené překážky. */
export interface Context {
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

export type Placer = (index: number, who: Identity) => PoseFn | null;

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

export const none: Placer = () => null;

export interface Square {
  x: number;
  z: number;
  size: number;
  /** Natočený čtverec natočené stavby (fields.md – Natočené stavby). */
  rotation?: number;
}

/** Do kolika let je postava dítě (menší) – jako věková skupina jádra (AGE.adult). */
export const CHILD_UNDER = 14;

/** Mezi cestami je člověk chvíli doma – není vidět (s). */
export const TRAFFIC_HOME_S = 6;
