import {
  BUILD_COSTS,
  CRAFT_NAMES,
  CRAFT_PRODUCTION,
  ORCHARD_WINDOWS,
  STOCK_RESOURCES,
  affordability,
  ageYears,
  dateOfDayIndex,
  effectiveFertility,
  fieldPartLooks,
  forestBonus,
  monthInWindow,
  obstacleChangesAt,
  ORCHARD_PLANTING_WINDOWS,
  laborReport,
  groveAgeYears,
  obstaclesOf,
  partStage,
  reservedTrees,
  ruinOvergrowth,
  squareBearing,
  summarizeVillage,
  tileCenterWorld,
  villageStock,
  wholeLogs,
  sacredBuildingHappiness,
  sacredOakAgeYears,
  HAY_WINTER_MONTHS,
  foundingCostPerHa,
  type BuildKind,
  type DietDay,
  type HerdSpecies,
  type LivestockSummary,
  type ChronicleEvent,
  type ConstructionKind,
  type ConstructionSummary,
  type Craft,
  type CraftCoverage,
  type CraftStocks,
  type Crop,
  type DwellingPlot,
  type DwellingType,
  type FieldSurface,
  type LaborShare,
  type Landscape,
  type ObstacleChanges,
  type ObstacleLayer,
  type OrchardSquare,
  type OrchardWork,
  type PartStage,
  type PlacementVillage,
  type PlotVariant,
  type Position,
  type SacredBuildingKind,
  type StockResource,
  type TileCell,
  type VillageLifespan,
  type VillageRecord,
  type VillageState,
  type VillageSummary,
  type WorkshopActivity,
  hasShrine,
  villageCemeteries,
  villageLifespan,
  villageOrchards,
} from '@bohemia/game';
import { formatGameDate } from './game-date';
import { fruitVisible, treeGrowth } from './orchard-look';
import { sacredOakGrowth } from './sacred-look';
import { formatCells, formatHa, formatInteger } from './village-format';

// Pohled na ves pro panel a scénu (DTO server actions). Čistý modul – smí ho importovat
// i klient (typy, převod scény na data pro kontrolu umístění).

export type {
  BuildKind,
  Craft,
  Crop,
  HerdSpecies,
  FieldSurface,
  LaborActivity,
  LaborShare,
  LaborTarget,
  PartStage,
  SacredBuildingKind,
  StockResource,
  WorkshopActivity,
} from '@bohemia/game';

/**
 * Stavba v nabídce staveb: cena a jestli na ni ves má (bez surovin, dřeva nebo lidí k osídlení je
 * tlačítko zašedlé).
 */
export interface BuildOption {
  /** Člověkodny ze společné práce – u pole a sadu za hektar (`perHa`), u hřbitova za čtverec. */
  laborManDays: number;
  perHa: boolean;
  /** Cena za čtverec (pohřebiště). */
  perSquare: boolean;
  /**
   * Předem – suroviny (obilí, dřevo ve stromech) a lidé k osídlení: kolik stavba chce a kolik
   * chybí (0 = ves má).
   */
  upfront: { resource: StockResource; amount: number; missing: number }[];
  /**
   * Stavbu nejde zahájit z jiného důvodu než surovin – svatyně je jedna na ves (happiness.md);
   * rozhraní důvod ukáže v popisku červeně. Jinak null.
   */
  blocked: string | null;
  affordable: boolean;
}

/** Štěstí obyvatel pro horní lištu (happiness.md). */
export interface VillageHappiness {
  /** Štěstí 0–100. */
  value: number;
  /** Cílová hodnota, ke které se štěstí pomalu posouvá. */
  target: number;
  /** Násobek veškeré práce vsi (0,8–1,1). */
  laborFactor: number;
}

/**
 * Posvátná místa pro panel výběru – kolik které samo přidává štěstí (stropy počtu a součtu platí
 * pro celou ves), stáří dubu (háj: jeho nejstaršího dubu – `oakAgeYears`, celé roky; strom mimo
 * vrstvu null) a u modly a svatyně průběh stavby.
 */
export interface VillageSacred {
  oaks: { id: number; happiness: number; ageYears: number | null }[];
  groves: {
    id: number;
    oaks: number;
    squares: number;
    happiness: number;
    ageYears: number | null;
  }[];
  /**
   * Modly a svatyně – hotové (`built`, id stavby, která je postavila) i rozestavěné (id stavby):
   * průběh celé stavby i s kácením dubů 0–1 a kolik dubů ještě musí skácet.
   */
  buildings: {
    id: number;
    kind: SacredBuildingKind;
    built: boolean;
    happiness: number;
    progress: number;
    oaksToFell: number;
  }[];
}

/** Ohrada pro panel výběru (oxen.md – Co hráč vidí): stavba, spřežení, výcvik a seno. */
export interface VillagePen {
  id: number;
  built: boolean;
  /** Průběh stavby 0–1 (hotová 1). */
  progress: number;
  /** Vycvičené spřežení – stáří a kolik let ještě slouží; bez spřežení null. */
  team: { ageYears: number; yearsLeft: number } | null;
  /** Výcvik spřežení – průběh 0–1 a zbývající dny; bez výcviku null. */
  training: { progress: number; daysLeft: number } | null;
  /** Proč teď nejde začít výcvik (česky), nebo null – tlačítko „Vycvičit spřežení“. */
  trainBlocked: string | null;
  /** Kolik krav a volů v ohradě právě stojí (krávy jen v zimě). */
  cows: number;
  oxen: number;
}

/** Jídlo pro horní lištu a tooltip nasycení (diet.md) – energie, pestrost a podíly na energii. */
export type VillageDiet = Pick<DietDay, 'energy' | 'diversity' | 'shares'>;

/** Řemeslná dílna pro panel výběru (crafts.md – Co hráč vidí). */
export interface VillageWorkshop {
  /** Id obydlí dílny. */
  dwellingId: number;
  craft: Craft;
  /** Co dílna dělala poslední den – vyrábí, kácí, čeká na uhlí / dřevo, nemá kdo, prázdná. */
  activity: WorkshopActivity;
  occupants: number;
  /** Práce řemeslu za den (člověkodny po minimu a domácí výrobě). */
  laborPerDay: number;
  /** Výroba za den při této práci, když jsou vstupy (kg výrobku). */
  outputPerDayKg: number;
}

/**
 * Řemesla vsi pro horní lištu a panel výběru: zásoby (kg), potřeba a pokrytí 0–1 (meze
 * produktivity) a dílny – hotové (`workshops`). Lišta zásoby ukáže, jen když ves řemesla má
 * (`present` – hotová nebo rozestavěná dílna, nebo něco v zásobě).
 */
export interface VillageCrafts {
  present: boolean;
  stocks: CraftStocks;
  needs: { toolsKg: number; potteryKg: number };
  coverage: CraftCoverage;
  workshops: VillageWorkshop[];
}

export interface VillageView {
  name: string;
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    /** Řemeslo dílny (crafts.md); obyčejné obydlí null. */
    craft: Craft | null;
    occupants: number;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
    /** Věk obyvatel v celých letech, od nejstaršího. */
    ages: number[];
    /** Stáří obydlí v celých letech. */
    ageYears: number;
  }[];
  storesKg: number;
  /** Zásoby ovoce – jablek (kg; v rozhraní „ovoce“ – diet.md). */
  applesKg: number;
  /** Zásoba masa (kg) – uzené maso a vejce (diet.md). */
  meatKg: number;
  /** Zásoba sena (kg) – horní lišta ho ukáže, když ves má ohradu nebo seno (oxen.md). */
  hayKg: number;
  /** Jídlo příštího dne – energie, pestrost a podíly obilí, masa a ovoce (tooltip nasycení). */
  diet: VillageDiet;
  /** Dobytek – stáda, slepice, voli a nosnost (diet.md – Co hráč vidí). */
  livestock: LivestockSummary;
  /** Ohrady v pořadí založení. */
  pens: VillagePen[];
  /** Klády na hromadě u vsi v kusech (forest.md). */
  woodLogs: number;
  /** Řemesla – zásoby uhlí, nástrojů a keramiky, pokrytí a dílny (crafts.md). */
  crafts: VillageCrafts;
  storesMonths: number;
  satiation: number;
  commonLaborPerDay: number;
  /** Některá domácnost je plná a nečeká na ni žádné nové obydlí (upozornění). */
  fullHousehold: boolean;
  /** Nabídka staveb – hráč staví kdy chce, předem musí ves mít suroviny a lidi k osídlení. */
  build: Record<BuildKind, BuildOption>;
  constructions: {
    id: number;
    kind: ConstructionKind;
    label: string;
    progress: number;
    /** Typ stavěného obydlí (u přestavby nový typ), u pole null. */
    dwellingType: DwellingType | null;
    /** Stavěná nebo přestavovaná řemeslná dílna (crafts.md), jinak null. */
    craft: Craft | null;
    /** Přestavované obydlí (rebuild), jinak null. */
    dwellingId: number | null;
    /** Zakládané pole (field), jinak null. */
    fieldId: number | null;
    /** Zakládaný nebo rozšiřovaný hřbitov (cemetery), jinak null. */
    cemeteryId: number | null;
    /** Vysazovaný sad (orchard), jinak null. */
    orchardId: number | null;
    /** Kolik stromů stavba ještě musí skácet (obydlí, přestavba – forest.md). */
    treesToFell: number;
  }[];
  /**
   * Pole pro panel výběru: výměra, průměrná úrodnost, počet dílů podle stadia a podle povrchu,
   * na kterém se díly zakládaly (louka, křoviny, les), oseté díly podle plodiny (ozim, jař)
   * a kolik dílů má popel z vymýceného lesa.
   */
  fields: {
    id: number;
    areaM2: number;
    fertility: number;
    stages: Partial<Record<PartStage, number>>;
    surfaces: Partial<Record<FieldSurface, number>>;
    /** Oseté díly podle plodiny (fields.md – Ozim a jař); díl bez plodiny je jař. */
    crops: Partial<Record<Crop, number>>;
    /** Díly v okně bonusu úrodnosti po vymýcení lesa (fields.md – Úroda). */
    ashParts: number;
    /** Nejvyšší letošní bonus úrodnosti z popela (+40 první sezónu osevu, +20 druhou), jinak 0. */
    ashBonus: number;
  }[];
  /** Hřbitovy v pořadí pohřbívání – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
  cemeteries: VillageCemetery[];
  /** Jabloňové sady pro panel výběru – plocha, stáří, odhad úrody (orchard.md). */
  orchards: VillageOrchard[];
  /** Ves hladoví – zásoby nevystačí do sklizně. */
  hungry: boolean;
  /** Lidé umírají hlady – nahromaděný hlad přesáhl práh (population.md – Hlad a vymření). */
  starving: boolean;
  /** Stavby stojí – několik dní po sobě nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  /** Štěstí obyvatel (happiness.md) – horní lišta. */
  happiness: VillageHappiness;
  /** Posvátné duby, háje, modly a svatyně (happiness.md) – panel výběru. */
  sacred: VillageSacred;
  /** Ves vymřela – herní rok založení a vymření a kolik let žila; žijící ves null. */
  extinct: VillageLifespan | null;
  /**
   * Konec hry – hráči vymřely všechny vsi (ne jen tahle). Rozhraní ukáže obrazovku porážky
   * s tlačítkem Začít znovu.
   */
  gameOver: boolean;
  scene: SceneVillage;
  /**
   * Posledních CHRONICLE_LENGTH událostí, nejnovější první (`kind` – druh pro upozornění, `kg` –
   * množství u sklizní a porážky).
   */
  chronicle: {
    day: number;
    kind: ChronicleEvent['kind'];
    kg?: number;
    dateLabel: string;
    text: string;
  }[];
  /** Den poslední svatby mezi domy (population.md – Sňatky mezi domy); žádná null. */
  lastMarriageDay: number | null;
}

/** Hřbitov pro panel výběru – čísla, žádné věty (rozhraní jako v 0 A.D.). */
export interface VillageCemetery {
  id: number;
  squares: number;
  /** Vytyčený a ohrazený – přijímá mrtvé. */
  built: boolean;
  /** Průběh stavby 0–1: založení, u hotového hřbitova rozšíření; bez stavby 1. */
  progress: number;
  /** Hroby hotových čtverců (rozšíření ve stavbě se nepočítá). */
  capacity: number;
  graves: number;
  freeGraves: number;
  /** Odhad, za kolik let se zaplní (podle úmrtí posledních let); bez úmrtí null. */
  yearsLeft: number | null;
}

/** Sad pro panel výběru – čísla, žádné věty. */
export interface VillageOrchard {
  id: number;
  areaM2: number;
  squares: number;
  /** Stáří v celých letech od výsadby; dokud se nic nevysadilo, null. */
  ageYears: number | null;
  /** Úroda nejbližší sklizně při plné sklizni (kg jablek). */
  expectedYieldKg: number;
  /** Průběh výsadby 0–1; vysazený sad null. */
  planting: number | null;
  /** Výsadba čeká na okno – sází se jen na jaře a na podzim (orchard.md). */
  plantingWaits: boolean;
}

/** Pozemek obydlí ve scéně – políčko se středem a stranou jako čtverec pole a varianta. */
export interface ScenePlot {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  variant: PlotVariant;
}

/** Pozemek obydlí ze stavu vsi pro scénu (střed políčka ve světě). */
export function scenePlot(landscape: Landscape, plot: DwellingPlot): ScenePlot {
  const center = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  return {
    cell: { x: plot.cell.x, y: plot.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    variant: plot.variant,
  };
}

export interface SceneVillage {
  /**
   * Hotová obydlí (`built: true`, id obydlí) i rozestavěná (`built: false`, id stavby); řemeslná
   * dílna nese řemeslo (`craft` – model dílny, u uhlíře i milíř).
   */
  dwellings: {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    progress: number;
    /** Řemeslná dílna (crafts.md) – `type` je pak obydlí, na kterém stojí. */
    craft?: Craft;
    /**
     * Hotová dílna dnes vyrábí – z pece, výhně nebo milíře stoupá dým (u uhlíře jen při pálení,
     * ne při kácení). Bez údaje ne.
     */
    working?: boolean;
    /** Bydlí v něm někdo – jen z obydlí s obyvateli stoupá dým. Bez údaje = obývané. */
    inhabited?: boolean;
    /**
     * Pozemek (polozemnice) – políčko krajiny, jeho střed (x, z) ve světě, strana v m a varianta
     * (kde na něm dům stojí). Volná obydlí (zemnice, starší polozemnice) ho nemají.
     */
    plot?: ScenePlot;
    /**
     * Herní den, od kdy obydlí stojí (hotové – dostavění, staveniště – zahájení stavby): pěšiny
     * domácnosti se vyšlapávají postupně (paths.md). Bez údaje = odjakživa.
     */
    since?: number;
    /**
     * Stav hotového obydlí 0–1 (population.md – Chátrání) – podle něj se dům ve scéně rozpadá
     * (dwelling-decay.ts). Bez údaje = celý (100 %).
     */
    condition?: number;
  }[];
  /**
   * Zbytky jam po zaniklých obydlích (population.md – Po zániku): typ, poloha, den zániku
   * (`since`), u polozemnice pozemek, jak zarostly 0–1 (`overgrowth`). Bez údaje žádné.
   */
  ruins?: {
    id: number;
    type: DwellingType;
    position: Position;
    since: number;
    overgrowth: number;
    plot?: ScenePlot;
    craft?: Craft;
  }[];
  /**
   * Pole po čtvercích – díl = políčko krajiny `cell`, jeho střed (x, z) ve světě, strana
   * políčka `size` v m a stadium.
   */
  fields: {
    id: number;
    parts: SceneFieldPart[];
  }[];
  /**
   * Hřbitovy po čtvercích (střed políčka ve světě a strana jako u pole) – průběh stavby
   * (založení, u hotového rozšíření; `built` hotový), počet obsazených hrobů a čtverce
   * rozšíření ve stavbě (`pending`). Bez údaje žádné.
   */
  cemeteries?: {
    id: number;
    squares: { cell: TileCell; x: number; z: number; size: number; pending?: boolean }[];
    built: boolean;
    progress: number;
    graves: number;
  }[];
  /**
   * Jabloňové sady po čtvercích (střed políčka ve světě a strana jako u pole): průběh výsadby
   * čtverce 0–1, velikost stromů 0–1 (mladé stromky rostou – orchard-look.ts) a jestli na
   * stromech visí jablka (pozdní léto a podzim, než se sklidí). Velikost a jablka jsou po
   * čtvercích – obnovený čtverec má mladé stromky, zbytek sadu staré (orchard.md – Obnova sadu).
   * Bez údaje žádné.
   */
  orchards?: {
    id: number;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      planting: number;
      growth: number;
      fruit: boolean;
      /**
       * Čtverec obnovy, který se sází znovu (staré stromy jsou skácené) – vytyčuje se jen on,
       * ne celý sad. U ostatních čtverců chybí.
       */
      renewal?: true;
    }[];
  }[];
  /**
   * Stromy, keře a kameny vrstvy překážek, které ves odstranila (pole, obydlí, hřbitovy, sady) nebo
   * pokácela (pařez, později nálet) – id z vrstvy. Bez údaje žádné.
   */
  obstacles?: ObstacleChanges;
  /**
   * Stromy vyhrazené rozestavěnými stavbami (forest.md) – kontrola umístění v prohlížeči podle
   * nich počítá klády z mýcení stejně jako server. Bez údaje žádné.
   */
  reservedTrees?: number[];
  /** Klády na hromadě v kusech – scéna je složí u obydlí nejblíž lesu. Bez údaje žádné. */
  woodLogs?: number;
  /**
   * Kde ves dnes pracuje – postavy ve scéně (docs/design/villagers.md). Bez údaje (ves uložená
   * před rozdělením práce, ještě nedopočítaný den) nikdo.
   */
  labor?: SceneLabor;
  /** Posvátná místa (happiness.md) – bez údaje žádná. */
  sacred?: SceneSacred;
  /**
   * Pokrytí nástroji 0–1 (crafts.md) – kontrola umístění pole v prohlížeči podle něj počítá cenu
   * založení jako server. Bez údaje 0.
   */
  toolCoverage?: number;
  /**
   * Stáda na pastvě (diet.md – skutečné počty, zaokrouhleně): ovce, kozy, prasata a krávy mimo
   * ohradu (v zimě stojí krávy v ohradě, když ves nějakou má). Bez údaje se odvodí z domácností.
   */
  livestock?: Record<HerdSpecies, number>;
  /** Ohrady (oxen.md) – čtverec, stavba a zvířata v ní. Bez údaje žádné. */
  pens?: ScenePen[];
}

/**
 * Ohrada ve scéně: políčko (střed a strana jako u pole), průběh stavby 0–1 (`built` hotová)
 * a zvířata v ní – voli spřežení (když dnes neorá – orbu ukazuje `labor`), telata ve výcviku
 * a krávy (v zimě).
 */
export interface ScenePen {
  id: number;
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  built: boolean;
  progress: number;
  oxen: number;
  trainees: number;
  cows: number;
}

/**
 * Posvátná místa pro scénu: ušetřené posvátné duby (id stromu z vrstvy překážek a kmen – obětiny
 * u kmene), dubové háje (id středového dubu, střed a čtverce s jejich středy a stranou – kamenný
 * kruh a obětiny na okraji) a modly a svatyně (hotové i rozestavěné – id stavby; `progress` je
 * průběh samotné stavby bez kácení dubů 0–1 pro fáze staveniště, vytyčení je vidět od 0).
 */
export interface SceneSacred {
  /**
   * `growth` = násobek velikosti dubu (a obětin u kmene) – ušetřené duby se postupně zvětší
   * (`sacredOakGrowth`, jen vzhled); bez údaje 1.
   */
  oaks: { id: number; x: number; z: number; growth?: number }[];
  groves: {
    id: number;
    x: number;
    z: number;
    squares: { cell: TileCell; x: number; z: number; size: number }[];
  }[];
  buildings: {
    id: number;
    kind: SacredBuildingKind;
    position: Position;
    built: boolean;
    progress: number;
  }[];
}

/**
 * Co je na dílu pole vidět (fields.md – Co hráč vidí): rozrytý drn při zakládání (`bare`),
 * zorané (`plowed`), zavláčené a oseté (`sown`), vzcházející (`sprouted`), zelené (`green`)
 * a zralé obilí (`ripe`), žeň s panáky snopů (`harvesting`), strniště (`stubble`). Úhor: mladý
 * (1–2 roky) je strniště s plevelem, kde se pase (`young-fallow`), spasená pastvina (`pasture`);
 * úhor ve stadiu louky se kosí na seno (Martin) – vysoká tráva na jaře (`meadow`), posečená
 * s řádky sena a kupkami (`mown`), otava se stohy, které přes podzim a zimu mizí (`haystacks`).
 */
export type FieldLook =
  | 'bare'
  | 'plowed'
  | 'sown'
  | 'sprouted'
  | 'green'
  | 'ripe'
  | 'harvesting'
  | 'stubble'
  | 'young-fallow'
  | 'pasture'
  | 'meadow'
  | 'mown'
  | 'haystacks';

/**
 * Díl pole ve scéně – políčko krajiny `cell`, jeho střed (x, z) ve světě, strana políčka `size`
 * v m a stadium. Vzhled (`look`, `work`, `before`) počítá herní jádro po čtvercích – práce mění
 * díl, až když k němu dojde (fronta práce: jeden rozpracovaný díl na úlohu; `fieldPartLooks`
 * v jádru). Bez `look` (starší příloh – pastvina a louka na seno) ho scéna odhadne ze stadia
 * a data (`estimateFieldLooks` ve field-look.ts).
 */
export interface SceneFieldPart {
  /** Id dílu v herním jádru – podle něj postavy najdou díly z fronty práce (`SceneLaborShare.parts`). */
  id?: number;
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  stage: PartStage;
  /** Co je na dílu vidět; u rozpracovaného dílu vzhled hotové části. */
  look?: FieldLook;
  /**
   * Rozpracovaný díl: kolik práce dnešní úlohy je na něm hotovo 0–1 – hotová část řádků má
   * `look`, zbytek `before`. Zakládaný díl s 0 je jen vytyčený (kolíky a provázek).
   */
  work?: number;
  /** Vzhled nehotové části rozpracovaného dílu; bez údaje povrch před prací (louka u zakládání). */
  before?: FieldLook;
}

/**
 * Podíl práce dne pro postavy. U polních prací může nést díly z fronty práce (`parts` – id
 * dílů v pořadí: nejdřív rozpracovaný, pak ty, na které práce přijde) – postavy pak pracují
 * přesně tam; bez nich je scéna odhadne z `work` a vzhledu dílů.
 */
export type SceneLaborShare = LaborShare & { parts?: readonly number[] };

/**
 * Rozdělení práce posledního dne pro postavy: člověkodny po činnostech a místech (na setiny),
 * lidé podle věku a herní den s měsícem (v zimě je venku méně lidí; podle dne se ve scéně kosí
 * a pase na úhoru).
 */
export interface SceneLabor {
  day: number;
  month: number;
  people: { children: number; adults: number; elders: number };
  shares: SceneLaborShare[];
}

export const CHRONICLE_LENGTH = 8;

/**
 * Řemesla v rozhraní (crafts.md): ikona dílny (`public/icons/build/`), výrobek – ikona
 * (`public/icons/resources/`), název a zásoba ve `CraftStocks`.
 */
export const CRAFT_LOOKS: Record<
  Craft,
  { icon: string; product: { icon: string; name: string; stock: keyof CraftStocks } }
> = {
  potter: { icon: 'hrncir', product: { icon: 'pottery', name: 'Keramika', stock: 'potteryKg' } },
  smith: { icon: 'kovar', product: { icon: 'tools', name: 'Nástroje', stock: 'toolsKg' } },
  burner: { icon: 'uhlir', product: { icon: 'charcoal', name: 'Uhlí', stock: 'charcoalKg' } },
};

/** Názvy obydlí v 1. a 4. pádě. */
export const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
};

function deathText(group: 'child' | 'adult' | 'elder', hunger: boolean): string {
  if (group === 'child') return hunger ? 'Dítě zemřelo hlady.' : 'Zemřelo dítě.';
  if (group === 'adult') {
    return hunger ? 'Jeden z dospělých zemřel hlady.' : 'Zemřel jeden z dospělých.';
  }
  return hunger ? 'Jeden ze starších zemřel hlady.' : 'Zemřel jeden ze starších.';
}

/** Dostavěná řemeslná dílna – kronika (crafts.md). */
const WORKSHOP_FINISHED: Record<Craft, string> = {
  potter: 'Dostavěli hrnčířskou dílnu s pecí.',
  smith: 'Dostavěli kovárnu s výhní.',
  burner: 'Dostavěli uhlířovu zemnici s milířem.',
};

function finishedText(kind: ConstructionKind, craft?: Craft): string {
  if (craft && (kind === 'dwelling' || kind === 'rebuild')) {
    return kind === 'dwelling' ? WORKSHOP_FINISHED[craft] : 'Dokončili přestavbu dílny.';
  }
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'idol') return 'Vztyčili dřevěnou modlu.';
  if (kind === 'shrine') return 'Svatyně je dostavěná – v ohništích hoří oheň.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  if (kind === 'cemetery') return 'Hřbitov je ohrazený – dá se do něj pohřbívat.';
  if (kind === 'orchard') return 'Sad je vysazený.';
  if (kind === 'pen') return 'Ohrada je postavená.';
  if (kind === 'ard') return 'Vesničané vyrobili rádlo.';
  return 'Pole je založené – dá se osévat.';
}

/** Pole nebo sad ustoupil stavbě obydlí – kronika (population.md – Obydlí na poli a v sadu). */
function landTakenText(land: 'field' | 'orchard', areaM2: number, gone: boolean): string {
  if (land === 'field') {
    return gone
      ? 'Pole ustoupilo stavbě obydlí a zaniklo.'
      : `Pole ustoupilo stavbě obydlí – zmenšilo se o ${formatInteger(areaM2)} m².`;
  }
  return gone
    ? 'Sad ustoupil stavbě obydlí a zanikl.'
    : `Sad ustoupil stavbě obydlí – zmenšil se o ${formatInteger(areaM2)} m².`;
}

/** Text události kroniky česky. */
export function chronicleText(event: ChronicleEvent, villageName: string): string {
  switch (event.kind) {
    case 'village-founded':
      return `Osadníci založili ves ${villageName}.`;
    case 'birth':
      return 'Narodilo se dítě.';
    case 'death':
      return deathText(event.group, event.cause === 'hunger');
    case 'village-extinct':
      return `Zemřel poslední obyvatel – ves ${villageName} vymřela.`;
    case 'household-founded':
      return 'Dva mladí dospělí založili v novém obydlí vlastní domácnost.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k sousedům.';
    case 'marriage':
      return 'Svatba – jeden ze snoubenců se přestěhoval do domu druhého.';
    case 'construction-finished':
      return finishedText(event.constructionKind, event.craft);
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'harvest':
      return `${HARVEST_NAMES[event.crop ?? 'any']}: ${formatInteger(event.kg)} kg obilí.`;
    case 'apple-harvest':
      return `Sklizeň ovoce: ${formatInteger(event.kg)} kg.`;
    case 'slaughter':
      return `Podzimní porážka: ${formatInteger(event.kg)} kg masa.`;
    case 'team-ready':
      return 'Spřežení volů je vycvičené – orá rádlem.';
    case 'team-retired':
      return 'Spřežení dosloužilo – voli zestárli a šli na maso.';
    case 'ox-died':
      return event.training
        ? 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'
        : 'Přes zimu chybělo seno – vůl uhynul a spřežení se rozpadlo.';
    case 'orchard-gone':
      return 'Starý sad dosloužil a zarostl loukou.';
    case 'orchard-renewal-started':
      return `Vesničané obnovují starý sad – znovu vysadí ${formatCells(event.squares)}.`;
    case 'land-taken':
      return landTakenText(event.land, event.areaM2, event.gone);
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'part-became-forest':
      return 'Opuštěný díl pole zarostl v les.';
    case 'sacred-spared':
      return event.site === 'oak'
        ? 'Vesničané ušetřili posvátný dub.'
        : 'Vesničané ušetřili dubový háj.';
    case 'cemetery-full':
      if (event.othersFree) return 'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.';
      // staví se jiný hřbitov nebo rozšíření – bude kam pohřbívat
      if (event.othersBuilding) return 'Hřbitov se zaplnil.';
      return 'Hřbitov se zaplnil – mrtvé není kam pohřbívat.';
  }
}

/** Názvy posvátných staveb (happiness.md). */
export const SACRED_BUILDING_NAMES: Record<SacredBuildingKind, string> = {
  idol: 'Modla',
  shrine: 'Svatyně',
};

function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)}`;
  if (c.craft && c.kind === 'dwelling') return CRAFT_NAMES[c.craft];
  if (c.kind === 'idol' || c.kind === 'shrine') return SACRED_BUILDING_NAMES[c.kind];
  if (c.kind === 'cemetery') return `Hřbitov (${formatCells(c.squares ?? 0)})`;
  if (c.kind === 'orchard') return `Sad ${formatHa(c.areaM2 ?? 0)}`;
  if (c.kind === 'pen') return 'Ohrada';
  if (c.kind === 'ard') return 'Rádlo';
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneVillage {
  const constructions = summary.constructions;
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const built = state.dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: true,
    progress: 1,
    inhabited: occupied.has(d.id),
    ...(d.plot ? { plot: scenePlot(landscape, d.plot) } : {}),
    since: d.builtDay,
    // stav po tisícinách – rozpad ve scéně jde po stupních (dwelling-decay.ts)
    ...(d.condition < 1 ? { condition: Math.round(d.condition * 1000) / 1000 } : {}),
    ...(d.workshop ? { craft: d.workshop.craft } : {}),
    ...(d.workshop && occupied.has(d.id) && d.workshop.activity === 'producing'
      ? { working: true }
      : {}),
  }));
  // staveniště ukazuje samotnou stavbu – dřevo se kácí v lese, než se začne stavět; přestavba
  // polozemnice bez pozemku stojí na novém pozemku (domácnost zatím bydlí ve starém domě)
  const sites = state.constructions.flatMap((c) => {
    if (c.kind !== 'dwelling' && c.kind !== 'rebuild') return [];
    if (c.dwellingType === null || c.position === null) return [];
    const progress = constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    const plot = c.plot ? { plot: scenePlot(landscape, c.plot) } : {};
    return [
      {
        id: c.id,
        type: c.dwellingType,
        position: c.position,
        built: false,
        progress,
        ...plot,
        since: c.startedDay,
        ...(c.craft ? { craft: c.craft } : {}),
      },
    ];
  });
  const looks = fieldPartLooks(state, day);
  const fields = state.fields.map((f) => ({
    id: f.id,
    // vzhled po čtvercích z jádra (fieldPartLooks); bez něj (starší příloh) odhad scény
    parts: state.parts.flatMap((p): SceneFieldPart[] =>
      p.fieldId === f.id && p.cell !== undefined
        ? [{ ...scenePart(landscape, p, p.cell, partStage(p, day)), ...looks.get(p.id) }]
        : [],
    ),
  }));
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
    progress: cemeteryProgress(c.id, c.builtDay !== null, constructions),
    graves: c.graves,
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    squares: o.squares.map((s) => sceneOrchardSquare(landscape, s, day, state.orchardWork ?? null)),
  }));
  const reserved = [...reservedTrees(state)].sort((a, b) => a - b);
  const labor = sceneLabor(state, summary.people);
  const sacred = sceneSacred(state, landscape, day, summary);
  const ruins = (state.ruins ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    position: r.position,
    since: r.day,
    overgrowth: Math.round(ruinOvergrowth(r, day) * 1000) / 1000,
    ...(r.plot ? { plot: scenePlot(landscape, r.plot) } : {}),
    ...(r.craft ? { craft: r.craft } : {}),
  }));
  const pens = scenePens(state, landscape, day, summary);
  const penned = pens.reduce((sum, pen) => sum + pen.cows, 0);
  const herds = summary.livestock.herds;
  return {
    dwellings: [...built, ...sites],
    ...(ruins.length > 0 ? { ruins } : {}),
    fields,
    cemeteries,
    ...(orchards.length > 0 ? { orchards } : {}),
    obstacles: obstacleChangesAt(state, day),
    ...(reserved.length > 0 ? { reservedTrees: reserved } : {}),
    woodLogs: wholeLogs(state.woodLogs ?? 0),
    ...(labor ? { labor } : {}),
    ...(sacred ? { sacred } : {}),
    livestock: { ...herds, cow: Math.max(0, herds.cow - penned) },
    ...(pens.length > 0 ? { pens } : {}),
    ...(summary.crafts.coverage.tools > 0 ? { toolCoverage: summary.crafts.coverage.tools } : {}),
  };
}

/** Výroba dílny za den při práci `labor` (kg) – uhlíř bez kácení, kovář a hrnčíř s přirážkou. */
function workshopOutputKg(craft: Craft, labor: number, oreFactor: number): number {
  if (craft === 'burner') return labor * CRAFT_PRODUCTION.charcoalKgPerManDay;
  if (craft === 'smith') return labor / (CRAFT_PRODUCTION.toolManDaysPerKg * oreFactor);
  return labor / (CRAFT_PRODUCTION.potteryManDaysPerKg * oreFactor);
}

/** Řemesla pro lištu a panel výběru. */
function craftsView(state: VillageState, summary: VillageSummary): VillageCrafts {
  const { stocks, needs, coverage, workshops } = summary.crafts;
  const present =
    workshops.length > 0 ||
    state.constructions.some((c) => c.craft) ||
    stocks.charcoalKg + stocks.toolsKg + stocks.potteryKg > 0;
  return {
    present,
    stocks,
    needs,
    coverage,
    workshops: workshops.map((w) => ({
      dwellingId: w.dwellingId,
      craft: w.craft,
      activity: w.activity,
      occupants: w.occupants,
      laborPerDay: w.laborPerDay,
      outputPerDayKg: workshopOutputKg(w.craft, w.laborPerDay, w.oreFactor),
    })),
  };
}

/**
 * Ohrady pro scénu: stavba (průběh z rozestavěné stavby) a zvířata – voli spřežení, telata ve
 * výcviku a v zimě krávy stáda (do hotových ohrad rovným dílem – oxen.md: přes zimu stojí
 * v ohradě).
 */
function scenePens(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): ScenePen[] {
  const winter = HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const built = summary.pens.filter((p) => p.built).length;
  const cows = winter && built > 0 ? summary.livestock.herds.cow : 0;
  let builtIndex = 0;
  return summary.pens.map((pen) => {
    const construction = state.constructions.find((c) => c.kind === 'pen' && c.penId === pen.id);
    const share = pen.built ? Math.floor(cows / built) + (builtIndex++ < cows % built ? 1 : 0) : 0;
    return {
      id: pen.id,
      cell: { x: pen.cell.x, y: pen.cell.y },
      x: pen.x,
      z: pen.z,
      size: landscape.cellSizeM,
      built: pen.built,
      progress: pen.built
        ? 1
        : (summary.constructions.find((c) => c.id === construction?.id)?.buildProgress ?? 0),
      oxen: pen.team ? 2 : 0,
      trainees: pen.training ? 2 : 0,
      cows: share,
    };
  });
}

/** Posvátná místa pro scénu; ves bez nich null. */
function sceneSacred(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneSacred | null {
  const sites = state.constructions.flatMap((c) => {
    if ((c.kind !== 'idol' && c.kind !== 'shrine') || c.position === null) return [];
    const progress = summary.constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    return [{ id: c.id, kind: c.kind, position: c.position, built: false, progress }];
  });
  const buildings = [
    ...summary.sacred.buildings.map((b) => ({
      id: b.id,
      kind: b.kind,
      position: b.position,
      built: true,
      progress: 1,
    })),
    ...sites,
  ];
  const { oaks, groves } = summary.sacred;
  if (oaks.length === 0 && groves.length === 0 && buildings.length === 0) return null;
  return {
    oaks: oaks.map((o) => ({ id: o.id, x: o.x, z: o.z, growth: sacredOakGrowth(o.day, day) })),
    groves: groves.map((g) => ({
      id: g.id,
      x: g.x,
      z: g.z,
      squares: g.cells.map((cell) => {
        const center = tileCenterWorld(landscape, cell.x, cell.y);
        return {
          cell: { x: cell.x, y: cell.y },
          x: center.x,
          z: center.z,
          size: landscape.cellSizeM,
        };
      }),
    })),
    buildings,
  };
}

/**
 * Posvátná místa pro panel výběru – kolik které přidává, stáří dubů podle vrstvy překážek, u staveb
 * průběh.
 */
function sacredView(summary: VillageSummary, obstacles: ObstacleLayer, day: number): VillageSacred {
  const sites = summary.constructions.flatMap((c) =>
    c.kind === 'idol' || c.kind === 'shrine'
      ? [
          {
            id: c.id,
            kind: c.kind,
            built: false,
            happiness: SACRED_HAPPINESS[c.kind],
            progress: c.progress,
            oaksToFell: c.treesToFell,
          },
        ]
      : [],
  );
  return {
    oaks: summary.sacred.oaks.map((o) => ({
      id: o.id,
      happiness: o.happiness,
      ageYears: sacredOakAgeYears(obstacles, o.id, day),
    })),
    groves: summary.sacred.groves.map((g) => ({
      id: g.id,
      oaks: g.oaks,
      squares: g.cells.length,
      happiness: g.happiness,
      ageYears: groveAgeYears(obstacles, g, day),
    })),
    buildings: [
      ...summary.sacred.buildings.map((b) => ({
        id: b.id,
        kind: b.kind,
        built: true,
        happiness: b.happiness,
        progress: 1,
        oaksToFell: 0,
      })),
      ...sites,
    ],
  };
}

/** Rozdělení práce posledního dne pro postavy – člověkodny na setiny (drobné podíly 0,01). */
function sceneLabor(state: VillageState, people: SceneLabor['people']): SceneLabor | null {
  const labor = laborReport(state);
  if (!labor) return null;
  // na setiny, ale nic, co dnes práci dostalo, nezmizí – i drobná práce na stavbě je stavba,
  // která roste, a u ní má někdo stát (villagers.md); díly čela polní práce jdou do podílu
  // (`parts`), cíl zůstane pole
  const shares = labor.shares.flatMap((share): SceneLaborShare[] => {
    if (share.manDays <= 0) return [];
    const manDays = Math.max(0.01, Math.round(share.manDays * 100) / 100);
    if (share.target.kind === 'field' && share.target.parts) {
      const { parts, ...target } = share.target;
      return [{ ...share, target, manDays, parts }];
    }
    return [{ ...share, manDays }];
  });
  return { day: labor.day, month: dateOfDayIndex(labor.day).month, people, shares };
}

const DAYS_PER_TREE_YEAR = 365.25;

/**
 * Čtverec sadu pro scénu: průběh výsadby, velikost stromů podle stáří (po setinách – instance
 * se nepřestavují při každém dotazu) a jablka na stromech, když sad plodí a ještě se nesklidil.
 */
function sceneOrchardSquare(
  landscape: Landscape,
  square: OrchardSquare,
  day: number,
  work: OrchardWork | null,
): NonNullable<SceneVillage['orchards']>[number]['squares'][number] {
  const center = tileCenterWorld(landscape, square.cell.x, square.cell.y);
  const planted = square.plantedDay;
  const planting =
    planted !== null ? 1 : square.plantingCost > 0 ? square.plantingDone / square.plantingCost : 0;
  const growth =
    planted === null ? 0 : Math.round(treeGrowth((day - planted) / DAYS_PER_TREE_YEAR) * 100) / 100;
  const month = dateOfDayIndex(day).month;
  const fruit =
    planted !== null &&
    fruitVisible({
      bearing: squareBearing(square, day),
      month,
      harvestWindow: monthInWindow(ORCHARD_WINDOWS.harvest, month),
      harvested: work?.task === 'harvest' ? work.done >= work.required : true,
    });
  return {
    cell: { x: square.cell.x, y: square.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    planting,
    growth,
    fruit,
    // obnova: staré stromy skácené, čtverec se sází znovu (orchard.md – Obnova sadu)
    ...(square.renewal !== undefined && planted === null ? { renewal: true as const } : {}),
  };
}

/**
 * Průběh stavby hřbitova 0–1 – založení, u hotového hřbitova rozšíření (stavby jdou v pořadí
 * zahájení, první je založení); bez stavby hotový 1, nehotový 0.
 */
function cemeteryProgress(
  id: number,
  built: boolean,
  constructions: readonly ConstructionSummary[],
): number {
  const active = constructions.filter((s) => s.kind === 'cemetery' && s.cemeteryId === id);
  if (active.length === 0) return built ? 1 : 0;
  return built ? Math.min(...active.map((s) => s.progress)) : active[0]!.progress;
}

/** Krok průběhu zakládání dílu pro scénu – obtisk se nepřestavuje při každém dotazu. */
const FOUNDING_WORK_STEP = 20;

/**
 * Díl pole pro scénu. Zakládaný díl nese průběh (`work`): 0 = jen vytyčený (kolíky a provázek),
 * pak se drn rozrývá po řádcích – zakládá se po dílech od nejbližšího k obydlí, rozpracovaný je
 * vždy jen jeden. Vzhled ostatních dílů zatím odhadne scéna (field-look.ts).
 */
function scenePart(
  landscape: Landscape,
  part: { id: number; foundingDone: number; foundingCost: number },
  cell: TileCell,
  stage: PartStage,
): SceneFieldPart {
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  const scene: SceneFieldPart = {
    id: part.id,
    cell: { x: cell.x, y: cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    stage,
  };
  if (stage === 'founding') {
    const done = part.foundingCost > 0 ? part.foundingDone / part.foundingCost : 0;
    const step = Math.round(done * FOUNDING_WORK_STEP) / FOUNDING_WORK_STEP;
    scene.work = done > 0 ? Math.min(1, Math.max(1 / FOUNDING_WORK_STEP, step)) : 0;
  }
  return scene;
}

/** Den poslední svatby mezi domy v kronice; žádná null. */
function lastMarriageDay(state: VillageState): number | null {
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const event = state.chronicle[i];
    if (event?.kind === 'marriage') return event.day;
  }
  return null;
}

function chronicle(state: VillageState, name: string): VillageView['chronicle'] {
  return state.chronicle
    .slice(-CHRONICLE_LENGTH)
    .reverse()
    .map((event) => ({
      day: event.day,
      kind: event.kind,
      ...('kg' in event ? { kg: event.kg } : {}),
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name),
    }));
}

/** Kronika sklizní podle plodiny (fields.md – Ozim a jař); bez plodiny ves seje jen jař. */
const HARVEST_NAMES: Record<Crop | 'any', string> = {
  winter: 'Sklizeň ozimu',
  spring: 'Sklizeň jaře',
  any: 'Sklizeň',
};

const BUILD_KINDS: readonly BuildKind[] = [
  'zemnice',
  'polozemnice',
  'field',
  'cemetery',
  'orchard',
  'idol',
  'shrine',
  'potter',
  'smith',
  'burner',
  'pen',
];
/** Kolik štěstí přidá modla a svatyně (happiness.md). */
const SACRED_HAPPINESS: Record<SacredBuildingKind, number> = {
  idol: sacredBuildingHappiness('idol'),
  shrine: sacredBuildingHappiness('shrine'),
};
/** Svatyně je jedna na ves (happiness.md) – důvod v popisku nabídky staveb. */
export const SHRINE_LIMIT = 'Ves už svatyni má.';
const DAYS_PER_YEAR = 365.25;

/**
 * Nabídka staveb: cena z pravidel a co z ceny předem (suroviny, dřevo, lidé k osídlení) ves nemá.
 * Dřevo = klády + dospělé stromy krajiny sídla, které jde skácet (vrstva překážek).
 */
function buildOptions(
  state: VillageState,
  landscape: Landscape,
  coverage: CraftCoverage,
): Record<BuildKind, BuildOption> {
  const stock = villageStock(state, obstaclesOf(landscape));
  const entries = BUILD_KINDS.map((kind): [BuildKind, BuildOption] => {
    const base = BUILD_COSTS[kind];
    // založení pole podle pokrytí nástroji (crafts.md – meze produktivity)
    const cost =
      kind === 'field'
        ? { ...base, laborManDays: foundingCostPerHa('meadow', coverage.tools) }
        : base;
    const { affordable, missing } = affordability(stock, cost.upfront);
    const upfront = STOCK_RESOURCES.flatMap((resource) => {
      const amount = cost.upfront[resource] ?? 0;
      return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
    });
    const blocked = kind === 'shrine' && hasShrine(state) ? SHRINE_LIMIT : null;
    const option: BuildOption = {
      laborManDays: cost.laborManDays,
      perHa: cost.perHa,
      perSquare: cost.perSquare ?? false,
      upfront,
      blocked,
      affordable: affordable && blocked === null,
    };
    return [kind, option];
  });
  return Object.fromEntries(entries) as Record<BuildKind, BuildOption>;
}

/**
 * Pole pro panel výběru – výměra, úrodnost vážená plochou, díly podle stadia, povrchu a plodiny
 * a díly s popelem z vymýceného lesa.
 */
function fieldViews(state: VillageState, day: number): VillageView['fields'] {
  return state.fields.map((f) => {
    const parts = state.parts.filter((p) => p.fieldId === f.id);
    const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
    const fertility =
      areaM2 > 0
        ? parts.reduce((sum, p) => sum + effectiveFertility(p, day) * p.areaM2, 0) / areaM2
        : 0;
    const stages: Partial<Record<PartStage, number>> = {};
    const surfaces: Partial<Record<FieldSurface, number>> = {};
    const crops: Partial<Record<Crop, number>> = {};
    let ashParts = 0;
    let ashBonus = 0;
    for (const p of parts) {
      const stage = partStage(p, day);
      stages[stage] = (stages[stage] ?? 0) + 1;
      surfaces[p.surface] = (surfaces[p.surface] ?? 0) + 1;
      if (p.state === 'sown') {
        const crop = p.crop ?? 'spring';
        crops[crop] = (crops[crop] ?? 0) + 1;
      }
      if (p.bonusUntilDay !== null && p.bonusUntilDay >= day) ashParts++;
      ashBonus = Math.max(ashBonus, forestBonus(p, day));
    }
    return { id: f.id, areaM2, fertility, stages, surfaces, crops, ashParts, ashBonus };
  });
}

/**
 * Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). `gameOver` – hráči vymřely
 * všechny vsi (zjistí ho vstupní bod přes `dynastyStatus`, pohled na jednu ves to neví).
 */
export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
  gameOver = false,
): VillageView {
  const { state, name } = record;
  const summary = summarizeVillage(state, day);
  return {
    name,
    dayIndex: day,
    people: summary.people,
    households: summary.households.map((h) => {
      const dwelling = state.dwellings.find((d) => d.id === h.dwellingId);
      return {
        ...h,
        ages: state.people
          .filter((p) => p.dwellingId === h.dwellingId)
          .map((p) => ageYears(p.bornDay, day))
          .sort((a, b) => b - a),
        ageYears: dwelling ? Math.max(0, Math.floor((day - dwelling.builtDay) / DAYS_PER_YEAR)) : 0,
      };
    }),
    storesKg: summary.storesKg,
    applesKg: summary.applesKg,
    meatKg: summary.meatKg,
    hayKg: summary.hayKg,
    diet: {
      energy: summary.diet.energy,
      diversity: summary.diet.diversity,
      shares: summary.diet.shares,
    },
    livestock: summary.livestock,
    woodLogs: wholeLogs(summary.woodLogs),
    crafts: craftsView(state, summary),
    storesMonths: summary.storesMonths,
    satiation: summary.satiation,
    commonLaborPerDay: summary.commonLaborPerDay,
    fullHousehold: summary.fullHousehold,
    build: buildOptions(state, landscape, summary.crafts.coverage),
    constructions: summary.constructions.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: constructionLabel(c),
      progress: c.progress,
      dwellingType: c.dwellingType,
      craft:
        c.craft ??
        (c.kind === 'rebuild'
          ? (state.dwellings.find((d) => d.id === c.dwellingId)?.workshop?.craft ?? null)
          : null),
      dwellingId: c.kind === 'rebuild' ? c.dwellingId : null,
      fieldId: c.kind === 'field' ? c.fieldId : null,
      cemeteryId: c.cemeteryId,
      orchardId: c.orchardId,
      treesToFell: c.treesToFell,
    })),
    fields: fieldViews(state, day),
    hungry: summary.hungry,
    starving: summary.starving,
    constructionsStalled: summary.constructionsStalled,
    happiness: {
      value: summary.happiness.value,
      target: summary.happiness.target,
      laborFactor: summary.happiness.laborFactor,
    },
    sacred: sacredView(summary, obstaclesOf(landscape), day),
    extinct: villageLifespan(state),
    gameOver,
    cemeteries: summary.cemeteries.map((c) => {
      const progress = cemeteryProgress(c.id, c.built, summary.constructions);
      return { ...c, progress };
    }),
    orchards: summary.orchards.map((o) => {
      const planting = summary.constructions.find(
        (c) => c.kind === 'orchard' && c.orchardId === o.id,
      );
      return {
        id: o.id,
        areaM2: o.areaM2,
        squares: o.squares,
        ageYears: o.ageYears,
        expectedYieldKg: o.expectedYieldKg,
        planting: planting ? planting.progress : null,
        plantingWaits:
          planting !== undefined &&
          !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month),
      };
    }),
    pens: penViews(state, day, summary),
    scene: sceneVillage(state, landscape, day, summary),
    chronicle: chronicle(state, name),
    lastMarriageDay: lastMarriageDay(state),
  };
}

/** Ohrady pro panel výběru – stavba, spřežení, výcvik a zvířata v ohradě. */
function penViews(state: VillageState, day: number, summary: VillageSummary): VillagePen[] {
  const winter = HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  const built = summary.pens.filter((p) => p.built).length;
  return summary.pens.map((pen) => {
    const construction = state.constructions.find((c) => c.kind === 'pen' && c.penId === pen.id);
    const progress = pen.built
      ? 1
      : (summary.constructions.find((c) => c.id === construction?.id)?.progress ?? 0);
    return {
      id: pen.id,
      built: pen.built,
      progress,
      team: pen.team,
      training: pen.training,
      trainBlocked: pen.trainBlocked,
      cows: winter && pen.built && built > 0 ? Math.round(summary.livestock.herds.cow / built) : 0,
      oxen: (pen.team ? 2 : 0) + (pen.training ? 2 : 0),
    };
  });
}

/**
 * Data pro kontrolu umístění v prohlížeči (`checkDwellingPlacement`, `fieldPartsFromCells`,
 * `cemeteryPartsFromCells`, `orchardPartsFromCells`) ze scény vsi – hotová i rozestavěná obydlí
 * jako obydlí, pole podle čtverců dílů, pohřebiště a sady podle svých čtverců, odstraněné
 * a pokácené překážky a vyhrazené stromy – náhled pak spočítá totéž co server.
 */
export function placementVillageFromScene(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({
      type: d.type,
      position: d.position,
      ...(d.plot ? { plot: { cell: d.plot.cell, variant: d.plot.variant } } : {}),
      ...(d.craft ? { workshop: { craft: d.craft } } : {}),
    })),
    constructions: [],
    // pole a plocha dílu (políčko) pro navazující pole – rozšíření a sloučení (fields.md)
    parts: scene.fields.flatMap((f) =>
      f.parts.map((p) => ({ cell: p.cell, fieldId: f.id, areaM2: p.size * p.size })),
    ),
    cemeteries: (scene.cemeteries ?? []).map((c) => ({
      squares: c.squares.map((s) => ({ cell: s.cell })),
    })),
    // plocha čtverce (políčko) pro varování, že sad stavbou obydlí zanikne
    orchards: (scene.orchards ?? []).map((o) => ({
      squares: o.squares.map((s) => ({ cell: s.cell, areaM2: s.size * s.size })),
    })),
    pens: (scene.pens ?? []).map((pen) => ({ cell: pen.cell })),
    ...(scene.obstacles ? { obstacleChanges: scene.obstacles } : {}),
    ...(scene.reservedTrees ? { reservedTrees: scene.reservedTrees } : {}),
    ...(scene.sacred
      ? {
          sacredBuildings: scene.sacred.buildings.map((b) => ({
            kind: b.kind,
            position: b.position,
          })),
        }
      : {}),
    ...(scene.toolCoverage ? { toolCoverage: scene.toolCoverage } : {}),
  };
}
