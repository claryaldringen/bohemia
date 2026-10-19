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
  hayMeadowLooks,
  forestBonus,
  monthInWindow,
  obstacleChangesAt,
  ORCHARD_PLANTING_WINDOWS,
  laborReport,
  groveAgeYears,
  obstaclesOf,
  partStage,
  partOvergrowthYears,
  pastureGrazedParts,
  isGrazeableFallow,
  isOvergrown,
  reservedTrees,
  roadAppleBearing,
  roadAppleStage,
  roadApplesOption,
  roadLengthM,
  roadTreeLook,
  roadUpgradeOptions,
  villageRoadWalk,
  ruinOvergrowth,
  isAbandoned,
  sacredRuinOvergrowth,
  stockedPenIds,
  structureCondition,
  squareBearing,
  summarizeVillage,
  squareCenter,
  tileCenterWorld,
  villageStock,
  wholeLogs,
  sacredBuildingHappiness,
  HAY_WINTER_MONTHS,
  foundingCostPerHa,
  type AbandonedStructure,
  type BuildKind,
  type DietDay,
  type HerdSpecies,
  type LivestockSummary,
  type ChronicleEvent,
  type LandTaker,
  type FamilyCounts,
  type ConstructionKind,
  type ConstructionSummary,
  type Craft,
  type CraftCoverage,
  type CraftStocks,
  type Crop,
  type DwellingPlot,
  type BuildableDwellingType,
  type Direction8,
  type NewcomerGroup,
  type TradeGoods,
  type TradePeople,
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
  type RelocationBlock,
  type Road,
  type RoadAppleStage,
  type RoadApplesOption,
  type RoadGrade,
  type RoadTree,
  type RoadTreeLook,
  type RoadUpgrade,
  type RoadUpgradeOption,
  type SacredBuildingKind,
  type SquareGrid,
  type StockResource,
  type TileCell,
  type VillageLifespan,
  type VillageRecord,
  type VillageState,
  type VillageSummary,
  type WorkshopActivity,
  type KilnStage,
  saplingGrowth,
  hasShrine,
  villageCemeteries,
  villageLifespan,
  villageOrchards,
  villageWoods,
  woodAgeYears,
  abandonedVillageAt,
  withNeighbours,
  type NeighbourSnapshot,
} from '@bohemia/game';
import { formatGameDate } from './game-date';
import { fruitVisible, treeGrowth } from './orchard-look';
import { sacredOakGrowth } from './sacred-look';
import {
  householdRelocation,
  householdRelocationBlock,
  relocationOptions,
  type HouseholdRelocation,
} from './relocation-view';
import { manorView, type VillageManor } from './manor-view';
import { foreignFromScene, plotOfScene } from './scene/neighbour-villages';
import { sceneTrails, trailRoadWork } from './trail-view';
import { DIRECTION_NAMES, NEWCOMER_TEXTS, goodsText, peopleText } from './trade-names';
import { formatCells, formatHa, formatInteger, plural } from './village-format';
import type { VillageListItem } from './village-list';
import {
  journeyView,
  leaveOptions,
  villageAbandonment,
  type SceneNeighbour,
  type VillageAbandonment,
  type VillageJourneyView,
  type VillageLeave,
} from './departure-view';

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
  KilnStage,
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
  /** Živé posvátné duby a posvátné souše (`snag`) – padlá souš už posvátným dubem není. */
  oaks: { id: number; happiness: number; ageYears: number | null; snag: boolean }[];
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
    /** Stav hotové stavby 0–1 (abandonment.md – chátrání); rozestavěná 1. */
    condition: number;
    /** Opuštěná – nikdo k ní nechodí, chátrá. */
    abandoned: boolean;
    /** Vesničané stavbu opravují (abandonment.md – Oprava) – průběh 0–1; jinak null. */
    repair: number | null;
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
  /** Stav hotové ohrady 0–1 (abandonment.md – ohrada bez zvířat chátrá); rozestavěná 1. */
  condition: number;
  /** Opuštěná – bez zvířat a nikdo k ní nechodí, chátrá. */
  abandoned: boolean;
  /** Vesničané ohradu opravují (abandonment.md – Oprava) – průběh 0–1; jinak null. */
  repair: number | null;
}

/**
 * Pevná cesta pro panel výběru (roads.md – Co hráč vidí): stupeň, délka, stáří, stromy u ní,
 * rozestavěné vylepšení a vylepšení, která úsek nabízí (cena a proč teď nejde).
 */
export interface VillageRoad {
  id: number;
  grade: RoadGrade;
  lengthM: number;
  /** Stáří v celých letech. */
  ageYears: number;
  /** Stojící stromy u úseku (keře a stromy, ne souše a pařezy). */
  trees: number;
  /** Úsek vede mokřinou (m) a přes brody. */
  wetM: number;
  fords: number;
  /** Rozestavěné vylepšení – na jaký stupeň, průběh 0–1 a stromy ke skácení; jinak null. */
  building: { grade: RoadGrade; progress: number; treesToFell: number } | null;
  upgrades: RoadUpgradeOption[];
  /**
   * Jabloně podél úseku (roads.md – Vysazení jabloní): živé stromy, z nich plodící, rozestavěná
   * výsadba (kolik jabloní a průběh 0–1) a „Vysadit jabloně“ – kolik přibude, práce a proč ne.
   */
  apples: {
    trees: number;
    bearing: number;
    /** Rozestavěná výsadba; `waits` – mimo okna výsadby (sází se na jaře a na podzim). */
    planting: { trees: number; progress: number; waits: boolean } | null;
    option: RoadApplesOption;
  };
}

/** Názvy stupňů cesty (roads.md – Vylepšení cesty). */
export const ROAD_GRADE_NAMES: Record<RoadGrade, string> = {
  trodden: 'Vyšlapaná cesta',
  improved: 'Upravená cesta',
  causeway: 'Cesta s hatí a lávkou',
};

/** Tlačítka vylepšení – název akce. */
export const ROAD_UPGRADE_NAMES: Record<RoadUpgrade, string> = {
  improved: 'Upravit cestu',
  causeway: 'Postavit hať a lávku',
};

/** Jídlo pro horní lištu a tooltip nasycení (diet.md) – energie, pestrost a podíly na energii. */
export type VillageDiet = Pick<DietDay, 'energy' | 'protein' | 'diversity' | 'shares'>;

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
  /**
   * Uhlíř: rozdělaný milíř – fáze, připravené buky z kolika, průběh fáze 0–1 a jestli stojí
   * v lese (crafts.md – Uhlíř); ostatní dílny a uhlíř bez milíře null.
   */
  kiln: VillageSummary['crafts']['workshops'][number]['kiln'];
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk; ostatní 0. */
  toPlant: number;
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
  /** Id vsi – akce i dotazy jdou podle něj (migration.md – Víc vsí jednoho hráče). */
  id: string;
  /**
   * Otisk pohledu (`villageViewStamp` – ves, den, jméno a verze všech vsí hráče): klient ho pošle
   * s dalším dotazem a server při shodě odpoví `{ unchanged: true }` bez načtení vsí. Chybí =
   * dotaz vždy celý.
   */
  stamp?: string;
  /** Sídlo (mapa), na jehož krajině ves stojí. */
  settlementId: string;
  name: string;
  /**
   * Všechny vsi hráče (i tahle) pro přepínač v horní liště – sídelní první, pak podle založení.
   * Upozornění z jiných vsí se ukážou krátkým řádkem se jménem vsi.
   */
  villages: VillageListItem[];
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    /** Řemeslo dílny (crafts.md); obyčejné obydlí null. */
    craft: Craft | null;
    occupants: number;
    /** Muži, ženy, děti, starší a manželské páry (kinship.md – panel obydlí). */
    family: FamilyCounts;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
    /** Věk obyvatel v celých letech, od nejstaršího. */
    ages: number[];
    /** Stáří obydlí v celých letech. */
    ageYears: number;
    /** Domácnost si staví nový dům (migration.md – Přestěhování domácnosti); jinak null. */
    relocation: HouseholdRelocation | null;
    /** Proč se domácnost teď přestěhovat nemůže (null = může). */
    relocationBlock: RelocationBlock | null;
  }[];
  storesKg: number;
  /** Zásoby ovoce – jablek (kg; v rozhraní „ovoce“ – diet.md). */
  applesKg: number;
  /** Zásoba sýra (kg) a mléko dne (l, když se podojí všechny dojné samice – diet.md). */
  cheeseKg: number;
  milkLPerDay: number;
  /** Zásoba masa (kg) – uzené a sušené (diet.md). */
  meatKg: number;
  /** Zásoba luštěnin (kg – hrách a čočka; diet.md – Luštěniny). */
  legumesKg: number;
  /** Zásoba sena (kg) – horní lišta ho ukáže, když ves má ohradu nebo seno (oxen.md). */
  hayKg: number;
  /** Jídlo příštího dne – energie, pestrost a podíly obilí, masa a ovoce (tooltip nasycení). */
  diet: VillageDiet;
  /** Dobytek – stáda, slepice, voli a nosnost (diet.md – Co hráč vidí). */
  livestock: LivestockSummary;
  /** Ohrady v pořadí založení. */
  pens: VillagePen[];
  /** Pevné cesty (roads.md) – úseky pro panel výběru: stupeň, délka, stáří, stromy, vylepšení. */
  roads: VillageRoad[];
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
  /** Nový dům stěhující se domácnosti – cena bez lidí k osídlení (migration.md). */
  relocation: Record<BuildableDwellingType, BuildOption>;
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
    /** Nový dům stěhující se domácnosti – id jejího obydlí (migration.md); jinak null. */
    relocates: number | null;
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
    /**
     * Kolik z pole zarůstá (m², fields.md – Zarůstání): příloh, který se poslední vegetační
     * období nespásl ani neposekl, i ten, který už zarostl křovinami a mladým lesem.
     */
    overgrowingM2: number;
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
  /** Ves je opuštěná – odešli všichni (migration.md); žijící ves null. */
  abandoned: VillageAbandonment | null;
  /** Lidé jsou na cestě na novou mapu (migration.md – fáze 4); ves, která stojí, null. */
  journey: VillageJourneyView | null;
  /** Odchod do nové vsi – dny cesty na novou mapu po směrech a kam to nejde (migration.md). */
  leave: VillageLeave;
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
    /** U pádu a opravy stavby (`structure-fell`, `structure-repaired`) která stavba. */
    structure?: AbandonedStructure;
    /** Kdo přišel od souseda a odkud (`newcomer` – trade.md, Výměna lidí). */
    group?: NewcomerGroup;
    direction?: Direction8;
    dateLabel: string;
    text: string;
  }[];
  /** Den poslední svatby mezi domy (population.md – Sňatky mezi domy); žádná null. */
  lastMarriageDay: number | null;
  /**
   * Dvorec vojvody (trade.md – Dvorec vojvody): obydlí, odkud jdou vylepšení vsi – zemské stezky
   * a obchod se sousedy; dokud zakladatelé první zemnici staví, null.
   */
  manor: VillageManor | null;
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
  /** Stav plotu 0–1 (abandonment.md – ke hřbitovu, kam nikdo nechodí, plot chátrá). */
  fenceCondition: number;
  /** Opuštěný – nikdo k němu nechodí, plot chátrá. */
  abandoned: boolean;
  /**
   * Vesničané plot opravují, spadlý stavějí znovu (abandonment.md – Oprava) – průběh 0–1;
   * jinak null.
   */
  repair: number | null;
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

/**
 * Pozemek obydlí ve scéně – políčko se středem a stranou jako čtverec pole a varianta. Natočený
 * pozemek (fields.md – Natočené stavby) má střed čtverce a natočení `rotation` (rad, po 15°) –
 * celý pozemek i s plotem, záhony a brankou je otočený; `cell` je pak políčko pod středem.
 */
export interface ScenePlot {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  variant: PlotVariant;
  rotation?: number;
  /** Dvůr dvorce vojvody (trade.md) – druhé políčko pozemku a jeho střed; jinak chybí. */
  yard?: { cell: TileCell; x: number; z: number };
}

/** Pozemek obydlí ze stavu vsi pro scénu (střed políčka ve světě, u dvorce i dvůr). */
export function scenePlot(landscape: Landscape, plot: DwellingPlot): ScenePlot {
  if (plot.square && !plot.yard) {
    return {
      cell: { x: plot.cell.x, y: plot.cell.y },
      x: plot.square.x,
      z: plot.square.z,
      size: landscape.cellSizeM,
      variant: plot.variant,
      rotation: plot.square.rotation,
    };
  }
  const center = tileCenterWorld(landscape, plot.cell.x, plot.cell.y);
  const yard = plot.yard ? tileCenterWorld(landscape, plot.yard.x, plot.yard.y) : null;
  return {
    cell: { x: plot.cell.x, y: plot.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    variant: plot.variant,
    ...(plot.yard && yard
      ? { yard: { cell: { x: plot.yard.x, y: plot.yard.y }, x: yard.x, z: yard.z } }
      : {}),
  };
}

/** Milíř uhlíře v lese ve scéně (crafts.md – Uhlíř). */
export interface SceneKiln {
  /** Id dílny uhlíře. */
  id: number;
  x: number;
  z: number;
  /** Fáze: kácení a příprava dřeva (hromada polen), stavba, pálení (kouří), vytahání. */
  stage: KilnStage;
  /** Průběh fáze 0–1 (stavba po fázích staveniště milíře). */
  progress: number;
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
    /**
     * Natočená mřížka pole (fields.md – Natočené stavby) – díly nesou střed a natočení, malování
     * rozšíření jde v ní. Bez údaje mřížka krajiny.
     */
    grid?: SquareGrid;
    parts: SceneFieldPart[];
  }[];
  /**
   * Hřbitovy po čtvercích (střed políčka ve světě a strana jako u pole) – průběh stavby
   * (založení, u hotového rozšíření; `built` hotový), počet obsazených hrobů a čtverce
   * rozšíření ve stavbě (`pending`). Bez údaje žádné.
   */
  cemeteries?: {
    id: number;
    /** Natočená mřížka hřbitova (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
    grid?: SquareGrid;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      /** Natočení čtverce natočeného hřbitova (rad); bez údaje 0. */
      rotation?: number;
      pending?: boolean;
    }[];
    built: boolean;
    progress: number;
    graves: number;
    /**
     * Stav plotu 0–1 (abandonment.md) – plot se rozpadá jako plot opuštěného pozemku, mohylky
     * zarůstají. Jen pod 1; bez údaje celý.
     */
    fence?: number;
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
    /** Natočená mřížka sadu (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
    grid?: SquareGrid;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      /** Natočení čtverce natočeného sadu (rad); bez údaje 0. */
      rotation?: number;
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
   * Milíře uhlíře v lese (crafts.md – Uhlíř) – id dílny, střed (m), fáze a její průběh 0–1
   * (stavba po fázích staveniště, pálení kouří). Milíř u dílny nese dílna (`working`). Bez údaje
   * žádné.
   */
  kilns?: SceneKiln[];
  /**
   * Mladé buky, které zasadil uhlíř (crafts.md – Uhlíř, obnova lesa): id stromu z vrstvy
   * překážek a velikost 0–1 podle stáří (za 60 let dospělý). Bez údaje žádné – ostatní nálet
   * má pevnou velikost.
   */
  plantedSaplings?: { id: number; growth: number }[];
  /**
   * Pevné cesty (roads.md) – úseky mezi rozcestími: osa a stupeň. Kreslí se stále stejně (ne
   * podle pěšin dne) a pěšiny dne se k nim stahují. Bez údaje žádné.
   */
  roads?: SceneRoad[];
  /**
   * Zemské stezky (trade.md) – osa od dvorce ke kraji mapy (úseky pevných cest za sebou) a jestli
   * je dostavěná; nosiči výpravy po ní chodí (`villager-plan.ts`). Bez údaje žádné.
   */
  trails?: SceneTrail[];
  /**
   * Stromy u pevných cest (roads.md) – stadium (keř, strom, souš, pařez) a velikost 0–1 v den
   * pohledu. Bez údaje žádné.
   */
  roadTrees?: SceneRoadTree[];
  /**
   * Jabloně podél pevných cest (roads.md – Vysazení jabloní): čekající na výsadbu (vytyčené
   * kolíkem), strom s velikostí 0–1 a plody jako v sadu (orchard-look.ts), souš. Bez údaje žádné.
   */
  roadApples?: SceneRoadApple[];
  /**
   * Stáda na pastvě (diet.md – skutečné počty, zaokrouhleně): ovce, kozy, prasata a krávy mimo
   * ohradu (v zimě stojí krávy v ohradě, když ves nějakou má). Bez údaje se odvodí z domácností.
   */
  livestock?: Record<HerdSpecies, number>;
  /** Ohrady (oxen.md) – čtverec, stavba a zvířata v ní. Bez údaje žádné. */
  pens?: ScenePen[];
  /**
   * Stavby jiných vsí na téže mapě – jen pohled (migration.md – Vsi na téže mapě). Scéna je
   * kreslí s ostatními stavbami (`withNeighbourVillages`), kontrola umístění je zná jako
   * cizí půdu (`placementVillageFromScene`). Bez údaje žádné.
   */
  neighbours?: SceneNeighbour[];
  /**
   * Les vsi (fields.md – Les vsi) – čtverce polí zarostlé lesem: políčko, povrch při založení
   * a stáří lesa v celých letech (od 30). Stromy jsou mezi překážkami přidanými vsí
   * (`obstacles.added`, id lesa vsi – `isWoodTreeId`). Bez údaje žádný.
   */
  woods?: SceneWood[];
  /**
   * Přirozené louky letošní seče (oxen.md – Seno; ozdobné louky na seno nahradila data):
   * políčko, střed a strana jako u dílu pole a vzhled `meadow` / `mown` / `haystacks` (rozpracované
   * s `work` a `before`). Bez údaje žádné.
   */
  hayMeadows?: SceneHayMeadow[];
}

/** Čtverec lesa vsi ve scéně (fields.md – Les vsi). */
export interface SceneWood {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  /** Les z natočeného pole (fields.md – Natočené stavby) – mřížka pole a natočení čtverce. */
  grid?: SquareGrid;
  rotation?: number;
  surface: FieldSurface;
  /** Stáří lesa v celých letech – stromy rostou do 70 let (VILLAGE_WOOD). */
  age: number;
}

/** Políčko přirozené louky v seči pro scénu. */
export interface SceneHayMeadow {
  cell: TileCell;
  x: number;
  z: number;
  size: number;
  look: FieldLook;
  work?: number;
  before?: FieldLook;
}

/**
 * Ohrada ve scéně: políčko (střed a strana jako u pole), průběh stavby 0–1 (`built` hotová)
 * a zvířata v ní – voli spřežení (když dnes neorá – orbu ukazuje `labor`), telata ve výcviku
 * a krávy (v zimě).
 */
export interface ScenePen {
  id: number;
  /** Čtverec ohrady v mřížce `grid`; bez ní políčko krajiny. */
  cell: TileCell;
  /** Natočená mřížka ohrady (fields.md – Natočené stavby); bez údaje mřížka krajiny. */
  grid?: SquareGrid;
  x: number;
  z: number;
  size: number;
  /** Natočení čtverce natočené ohrady (rad); bez údaje 0. */
  rotation?: number;
  built: boolean;
  progress: number;
  oxen: number;
  trainees: number;
  cows: number;
  /** Stav hotové ohrady 0–1 (abandonment.md – rozpad); jen pod 1, bez údaje celá. */
  condition?: number;
  /**
   * Hotová ohrada bez zvířat (spřežení, výcvik, zimní krávy) – krmit se do ní nechodí (síť
   * pěšin jako na serveru – `PathVillage.pens`). Ohrada se zvířaty údaj nemá.
   */
  stocked?: false;
}

/**
 * Pevná cesta pro scénu (roads.md): osa, stupeň, mokřina a brody na ose a rozestavěné
 * vylepšení (na jaký stupeň a průběh samotné stavby bez kácení 0–1 – fáze staveniště).
 */
/** Zemská stezka ve scéně (trade.md) – osa od dvorce ke kraji mapy. */
export interface SceneTrail {
  id: number;
  direction: Direction8;
  points: { x: number; z: number }[];
  built: boolean;
}

export type SceneRoad = Pick<Road, 'id' | 'points' | 'grade' | 'ground' | 'openEnds' | 'cart'> & {
  upgrade?: { grade: RoadGrade; progress: number };
};
/** Strom u pevné cesty pro scénu – poloha, druh a vzhled v den pohledu (`roadTreeLook`). */
export type SceneRoadTree = Pick<RoadTree, 'id' | 'x' | 'z' | 'species'> & RoadTreeLook;
/** Jabloň u pevné cesty pro scénu – stadium, velikost stromu 0–1 (po setinách) a plody. */
export interface SceneRoadApple {
  id: number;
  roadId: number;
  x: number;
  z: number;
  stage: RoadAppleStage;
  growth: number;
  fruit: boolean;
}

/**
 * Posvátný dub ve scéně: id stromu z vrstvy překážek a kmen. `growth` = násobek velikosti dubu
 * (a obětin u kmene) – ušetřené duby se postupně zvětší (`sacredOakGrowth`, jen vzhled; souš od
 * uschnutí už neroste); bez údaje 1. `snag` – dub uschl, místo stromu stojí posvátná souš
 * (obětiny u ní zůstávají). `sizeM` – velikost dubu (výška modelu × měřítko) pro souš a padlý
 * kmen; bez údaje odhad.
 */
export interface SceneSacredOak {
  id: number;
  x: number;
  z: number;
  growth?: number;
  snag?: true;
  sizeM?: number;
}

/**
 * Posvátná místa pro scénu: ušetřené posvátné duby (id stromu z vrstvy překážek a kmen – obětiny
 * u kmene), dubové háje (id středového dubu, střed a čtverce s jejich středy a stranou – kamenný
 * kruh a obětiny na okraji) a modly a svatyně (hotové i rozestavěné – id stavby; `progress` je
 * průběh samotné stavby bez kácení dubů 0–1 pro fáze staveniště, vytyčení je vidět od 0).
 */
export interface SceneSacred {
  /** Živé posvátné duby a posvátné souše. */
  oaks: SceneSacredOak[];
  /**
   * Padlé posvátné souše (happiness.md – Posvátný dub): místo už není posvátný dub – strom se
   * skryje a leží padlý kmen. Bez údaje žádné.
   */
  fallenOaks?: SceneSacredOak[];
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
    /**
     * Stav hotové stavby 0–1 (abandonment.md – chátrání, structure-decay.ts) – jen pod 1; bez
     * údaje celá.
     */
    condition?: number;
    /** Opuštěná stavba – chátrá (u svatyně vyhasnou ohniště). Bez údaje navštěvovaná. */
    abandoned?: true;
    /**
     * Vesničané stavbu opravují (abandonment.md – Oprava) – stav roste s prací, ohniště svatyně
     * zůstanou studená až do konce opravy. Bez údaje se neopravuje.
     */
    repairing?: true;
  }[];
  /**
   * Zbytky padlých model a svatyní (abandonment.md – Následky): padlá modla na zemi, zarostlý
   * příkop svatyně – jak zarostly 0–1 (`overgrowth`, po 5 %). Bez údaje žádné.
   */
  ruins?: { id: number; kind: SacredBuildingKind; position: Position; overgrowth: number }[];
}

/**
 * Co je na dílu pole vidět (fields.md – Co hráč vidí): rozrytý drn při zakládání (`bare`),
 * zorané (`plowed`), zavláčené a oseté (`sown`), vzcházející (`sprouted`), zelené (`green`)
 * a zralé obilí (`ripe`), žeň s panáky snopů (`harvesting`), strniště (`stubble`). Úhor: mladý
 * (1–2 roky) je strniště s plevelem, kde se pase (`young-fallow`), spasená pastvina (`pasture`);
 * úhor ve stadiu louky se kosí na seno (Martin) – vysoká tráva na jaře (`meadow`), posečená
 * s řádky sena a kupkami (`mown`), otava se stohy, které přes podzim a zimu mizí (`haystacks`).
 * Nepasený a nesečený příloh zarůstá (fields.md – Zarůstání): křoviny (`shrubs`) a mladý les
 * (`young-forest`) – bez obtisku pole, roste na něm keř a stromky (`overgrowth` dílu).
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
  | 'haystacks'
  | 'shrubs'
  | 'young-forest';

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
  /**
   * Natočení čtverce natočeného pole (rad, po 15° – fields.md, Natočené stavby); `cell` je pak
   * čtverec v mřížce pole. Bez údaje 0 – díl je políčko krajiny.
   */
  rotation?: number;
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
  /**
   * Roky přílohu bez pastvy a seče (fields.md – Zarůstání) – podle nich ve scéně rostou keře
   * a stromky (hustota a velikost). Jen u přílohu, který zarůstá (aspoň rok).
   */
  overgrowth?: number;
  /**
   * Příloh ve fázi louky: pasou se na něm stáda (`pastureGrazedParts` – nejbližší napřed). Kam
   * stáda nedojdou, tam se ve scéně nepase a pasáček nechodí. Bez údaje se pase všude.
   */
  grazed?: boolean;
  /**
   * Plodina osetého dílu, když to není obilí – `legume` (hrách a čočka – fields.md,
   * Luštěniny): zelené, zralé a sklizené luštěniny vypadají jinak než obilí. Bez údaje obilí.
   */
  crop?: 'legume';
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
  /**
   * Lidé vsi podle věku a – když jsou známí – podle pohlaví (kinship.md): postavy ve scéně jsou
   * muži a ženy v poměru, jaký ves má (`villager-plan.ts`); bez údaje půl na půl.
   */
  people: { children: number; adults: number; elders: number } & Partial<FamilyCounts>;
  shares: SceneLaborShare[];
  /**
   * Děti od 7 let a starší, kteří dnes pasou (diet.md – Pasáci) – postavy u stád; dospělí pasáci
   * jsou podíl `herding`. Bez údaje (dřívější rozdělení práce) pasou děti.
   */
  herders?: { children: number; elders: number };
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
  dvorec: { nominative: 'Dvorec', accusative: 'dvorec' },
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
  if (kind === 'road') return 'Cesta je vylepšená – chodí se po ní rychleji.';
  if (kind === 'road-apples') return 'Jabloně podél cesty jsou vysazené.';
  return 'Pole je založené – dá se osévat.';
}

/** Pole nebo sad ustoupil stavbě obydlí – kronika (population.md – Obydlí na poli a v sadu). */
/** Komu pole či sad ustoupil (3. pád) – kronika (fields.md – Pole jako krajina). */
const LAND_TAKERS: Record<LandTaker, string> = {
  dwelling: 'stavbě obydlí',
  orchard: 'sadu',
  cemetery: 'hřbitovu',
  pen: 'ohradě',
  idol: 'modle',
  shrine: 'svatyni',
  'road-apples': 'jabloním u cesty',
  'road-trees': 'stromům u cesty',
};

function landTakenText(
  land: 'field' | 'orchard',
  areaM2: number,
  gone: boolean,
  by: LandTaker = 'dwelling',
): string {
  const who = LAND_TAKERS[by];
  if (land === 'field') {
    return gone
      ? `Pole ustoupilo ${who} a zaniklo.`
      : `Pole ustoupilo ${who} – zmenšilo se o ${formatInteger(areaM2)} m².`;
  }
  return gone
    ? `Sad ustoupil ${who} a zanikl.`
    : `Sad ustoupil ${who} – zmenšil se o ${formatInteger(areaM2)} m².`;
}

/** Příloh zarostl lesem a vypadl z pole – kronika (fields.md – Zarůstání). */
function forestText(parts: number, gone: boolean): string {
  if (gone) return 'Nepasené pole zarostlo lesem a zaniklo.';
  return parts === 1
    ? 'Nepasený díl pole zarostl lesem – pole se zmenšilo.'
    : `Nepasené pole zarostlo lesem – ubylo ${formatCells(parts)}.`;
}

/** Opuštěná stavba spadla (abandonment.md – kronika). */
const STRUCTURE_FELL_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Modla, ke které léta nikdo nechodil, padla.',
  shrine: 'Opuštěná svatyně se rozpadla – zbyl jen zarůstající příkop.',
  'cemetery-fence': 'Plot hřbitova, kam nikdo nechodí, se rozpadl.',
  pen: 'Opuštěná ohrada se rozpadla.',
};

/** Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava) – kronika. */
const STRUCTURE_REPAIRED_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Vesničané modlu znovu usadili a opravili.',
  shrine: 'Vesničané opravili svatyni – v ohništích zase hoří oheň.',
  'cemetery-fence': 'Vesničané opravili plot hřbitova.',
  pen: 'Vesničané opravili ohradu.',
};

/** Domácnosti odešly založit novou ves (migration.md) – kronika. */
function householdsLeftText(households: number, people: number, direction?: Direction8): string {
  const who =
    households === 1
      ? 'Jedna domácnost odešla'
      : households <= 4
        ? `${households} domácnosti odešly`
        : `${households} domácností odešlo`;
  const where = direction ? ` na ${DIRECTION_NAMES[direction].name}` : '';
  return `${who} založit novou ves${where} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
}

/**
 * Věta kroniky o výpravě (trade.md – Obchod, Výměna lidí): „Nosiči vyrazili … – nesou 100 kg obilí;
 * odchází s nimi 1 rodina.“ Bez zboží jen lidé, bez lidí jen zboží.
 */
function tradeTripText(
  lead: string,
  carry: string,
  goods: TradeGoods,
  withThem: string,
  people: TradePeople | undefined,
): string {
  const who = peopleText(people);
  const hasGoods = Object.values(goods).some((n) => (n ?? 0) > 0);
  if (who === '') return `${lead} – ${carry} ${goodsText(goods)}.`;
  if (!hasGoods) return `${lead} – ${withThem} ${who}.`;
  return `${lead} – ${carry} ${goodsText(goods)}; ${withThem} ${who}.`;
}

/** Věta kroniky o lidech od souseda: „Ze severu přišla rodina – 4 lidé.“ */
function newcomerText(direction: Direction8, group: NewcomerGroup, people: number): string {
  const from = DIRECTION_NAMES[direction].from;
  const lead = `${from.charAt(0).toUpperCase()}${from.slice(1)} ${NEWCOMER_TEXTS[group].chronicle}`;
  if (group !== 'family') return `${lead}.`;
  return `${lead} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
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
      return 'V obydlí založila domácnost nová rodina.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k příbuzným nebo sousedům.';
    case 'marriage':
      return 'Svatba – nevěsta se přestěhovala k ženichovi.';
    case 'bride-from-outside':
      return 'Muž si přivedl nevěstu ze sousední vsi.';
    case 'married-away':
      return 'Dcera se vdala do sousední vsi.';
    case 'construction-finished':
      return finishedText(event.constructionKind, event.craft);
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'relocation-started':
      return `Domácnost si začala stavět novou ${DWELLING_NAMES[event.type].accusative} – přestěhuje se.`;
    case 'relocation-cancelled':
      return 'Stěhování domácnosti se zrušilo – zůstává ve starém domě.';
    case 'household-relocated':
      return 'Domácnost se přestěhovala do nového domu – starý zůstal prázdný.';
    case 'households-left':
      return householdsLeftText(event.households, event.people, event.direction);
    case 'village-abandoned':
      return `Odešli všichni – ves ${villageName} je opuštěná.`;
    case 'journey-started':
      return `Lidé vyrazili na ${DIRECTION_NAMES[event.direction].name} – na místo nové vsi dorazí ${formatGameDate(dateOfDayIndex(event.arrivalDay))}.`;
    case 'harvest':
      return `${HARVEST_NAMES[event.crop ?? 'any']}: ${formatInteger(event.kg)} kg ${event.crop === 'legume' ? 'luštěnin' : 'obilí'}.`;
    case 'apple-harvest':
      return `Sklizeň ovoce: ${formatInteger(event.kg)} kg.`;
    case 'slaughter':
      return `Podzimní porážka: ${formatInteger(event.kg)} kg masa.`;
    case 'meat-spoiled':
      return `Zbytek uzeného masa se zkazil: ${formatInteger(event.kg)} kg.`;
    case 'herd-starved':
      return `Přes zimu chybělo seno – uhynulo ${formatInteger(
        Object.values(event.animals).reduce((sum, n) => sum + n, 0),
      )} kusů dobytka.`;
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
      return landTakenText(event.land, event.areaM2, event.gone, event.by);
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'part-became-forest':
      return forestText(event.parts ?? 1, event.gone ?? false);
    case 'sacred-spared':
      return event.site === 'oak'
        ? 'Vesničané ušetřili posvátný dub.'
        : 'Vesničané ušetřili dubový háj.';
    case 'sacred-oak-died':
      return 'Posvátný dub stářím uschl – zůstala posvátná souš.';
    case 'sacred-snag-fell':
      return 'Posvátná souš padla.';
    case 'road-formed':
      return 'Kudy se chodí léta, vyšlapala se pevná cesta.';
    case 'road-overgrown':
      return 'Nepoužívaná cesta zarostla.';
    case 'trail-built':
      return `Zemská stezka na ${DIRECTION_NAMES[event.direction].name} je dostavěná – dá se obchodovat se sousedy.`;
    case 'trade-departed':
      return tradeTripText(
        `Nosiči vyrazili po stezce na ${DIRECTION_NAMES[event.direction].name}`,
        'nesou',
        event.give,
        'odchází s nimi',
        event.people,
      );
    case 'trade-returned':
      return tradeTripText(
        `Nosiči se vrátili ${DIRECTION_NAMES[event.direction].from}`,
        'přinesli',
        event.get,
        'přišli s nimi',
        event.people,
      );
    case 'newcomer':
      return newcomerText(event.direction, event.group, event.people);
    case 'structure-fell':
      return STRUCTURE_FELL_TEXTS[event.structure];
    case 'structure-repaired':
      return STRUCTURE_REPAIRED_TEXTS[event.structure];
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

/** Co se opravuje (abandonment.md – Oprava) – popisek stavby. */
const REPAIR_NAMES: Record<AbandonedStructure, string> = {
  idol: 'modla',
  shrine: 'svatyně',
  'cemetery-fence': 'plot hřbitova',
  pen: 'ohrada',
};

/** Průběh opravy stavby 0–1 (abandonment.md – Oprava); bez opravy null. */
function repairProgress(
  constructions: readonly ConstructionSummary[],
  structure: AbandonedStructure,
  id: number,
): number | null {
  const c = constructions.find(
    (x) => x.kind === 'repair' && x.repair?.structure === structure && x.repair.id === id,
  );
  return c ? c.progress : null;
}

function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)}`;
  if (c.craft && c.kind === 'dwelling') return CRAFT_NAMES[c.craft];
  if (c.kind === 'idol' || c.kind === 'shrine') return SACRED_BUILDING_NAMES[c.kind];
  if (c.kind === 'cemetery') return `Hřbitov (${formatCells(c.squares ?? 0)})`;
  if (c.kind === 'orchard') return `Sad ${formatHa(c.areaM2 ?? 0)}`;
  if (c.kind === 'pen') return 'Ohrada';
  if (c.kind === 'ard') return 'Rádlo';
  if (c.kind === 'road') return c.roadGrade === 'causeway' ? 'Hať a lávka' : 'Úprava cesty';
  if (c.kind === 'road-apples') return 'Jabloně u cesty';
  if (c.kind === 'repair') return `Oprava – ${REPAIR_NAMES[c.repair?.structure ?? 'idol']}`;
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
    ...(d.workshop && occupied.has(d.id) && workshopSmokes(d.workshop) ? { working: true } : {}),
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
  // kam stáda dojdou – jen ves se skutečnými stády (bez nich scéna stáda odvodí z domácností)
  const grazed = state.livestock ? pastureGrazedParts(state, day) : null;
  const fields = state.fields.map((f) => ({
    id: f.id,
    ...(f.grid ? { grid: f.grid } : {}),
    // vzhled po čtvercích z jádra (fieldPartLooks); bez něj (starší příloh) odhad scény
    parts: state.parts.flatMap((p): SceneFieldPart[] => {
      if (p.fieldId !== f.id || p.cell === undefined) return [];
      const years = p.state === 'fallow' ? partOvergrowthYears(p) : 0;
      return [
        {
          ...scenePart(landscape, p, p.cell, partStage(p, day), f.grid),
          ...looks.get(p.id),
          ...(p.state === 'sown' && p.crop === 'legume' ? { crop: 'legume' as const } : {}),
          ...(years > 0 ? { overgrowth: years } : {}),
          ...(grazed && isGrazeableFallow(p) ? { grazed: grazed.has(p.id) } : {}),
        },
      ];
    }),
  }));
  const woods = sceneWoods(state, landscape, day);
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    ...(c.grid ? { grid: c.grid } : {}),
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      ...(c.grid ? { rotation: c.grid.rotation } : {}),
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
    progress: cemeteryProgress(c.id, c.builtDay !== null, constructions),
    graves: c.graves,
    ...wearOf(structureCondition(c.fenceWear, 'cemetery-fence', day), 'fence'),
  }));
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    ...(o.grid ? { grid: o.grid } : {}),
    squares: o.squares.map((s) =>
      sceneOrchardSquare(landscape, s, day, state.orchardWork ?? null, o.grid),
    ),
  }));
  const reserved = [...reservedTrees(state)].sort((a, b) => a - b);
  const labor = sceneLabor(state, { ...summary.people, ...summary.family });
  const sacred = sceneSacred(state, landscape, day, summary);
  const obstacles = obstacleChangesAt(state, day);
  const roads = sceneRoads(state, summary.constructions);
  const roadTrees = sceneRoadTrees(state, day, obstacles);
  const kilns = sceneKilns(state, summary);
  const plantedSaplings = plantedSaplingViews(state, day);
  const roadApples = sceneRoadApples(state, day, obstacles);
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
  const hayMeadows = hayMeadowLooks(state, day).map((view): SceneHayMeadow => {
    const center = tileCenterWorld(landscape, view.cell.x, view.cell.y);
    return {
      cell: { x: view.cell.x, y: view.cell.y },
      x: center.x,
      z: center.z,
      size: landscape.cellSizeM,
      look: view.look,
      ...(view.work === undefined ? {} : { work: view.work }),
      ...(view.before === undefined ? {} : { before: view.before }),
    };
  });
  const penned = pens.reduce((sum, pen) => sum + pen.cows, 0);
  const herds = summary.livestock.herds;
  return {
    dwellings: [...built, ...sites],
    ...(ruins.length > 0 ? { ruins } : {}),
    fields,
    cemeteries,
    ...(orchards.length > 0 ? { orchards } : {}),
    obstacles,
    ...(reserved.length > 0 ? { reservedTrees: reserved } : {}),
    woodLogs: wholeLogs(state.woodLogs ?? 0),
    ...(labor ? { labor } : {}),
    ...(sacred ? { sacred } : {}),
    livestock: { ...herds, cow: Math.max(0, herds.cow - penned) },
    ...(hayMeadows.length > 0 ? { hayMeadows } : {}),
    ...(pens.length > 0 ? { pens } : {}),
    ...(summary.crafts.coverage.tools > 0 ? { toolCoverage: summary.crafts.coverage.tools } : {}),
    ...(roads.length > 0 ? { roads } : {}),
    ...(roadTrees.length > 0 ? { roadTrees } : {}),
    ...(woods.length > 0 ? { woods } : {}),
    ...(kilns.length > 0 ? { kilns } : {}),
    ...(plantedSaplings.length > 0 ? { plantedSaplings } : {}),
    ...(roadApples.length > 0 ? { roadApples } : {}),
  };
}

/** Pevné cesty vsi pro scénu (roads.md) – i s rozestavěným vylepšením. */
export function sceneRoads(
  state: Pick<VillageState, 'roads'> & Partial<Pick<VillageState, 'trails' | 'constructions'>>,
  constructions: readonly ConstructionSummary[] = [],
): SceneRoad[] {
  // zemské stezky (trade.md) se staví po úsecích – průběh každého úseku zvlášť
  const trailWork = trailRoadWork({
    trails: state.trails ?? [],
    constructions: state.constructions ?? [],
  });
  const trailRoads = new Set(
    (state.constructions ?? []).flatMap((c) => (c.trail !== undefined ? (c.roadIds ?? []) : [])),
  );
  return (state.roads?.roads ?? []).map((r) => {
    const onTrail = trailWork.get(r.id);
    // dostavěný úsek rozestavěné stezky už stavbu nemá
    const work = onTrail
      ? { roadGrade: onTrail.grade, buildProgress: onTrail.progress }
      : trailRoads.has(r.id)
        ? undefined
        : constructions.find((c) => c.kind === 'road' && c.roadIds?.includes(r.id));
    return {
      id: r.id,
      points: r.points.map((p) => ({ x: p.x, z: p.z })),
      grade: r.grade,
      // vozová cesta (wagons.md – Vyjeté cesty) – dvě koleje
      ...(r.cart ? { cart: true as const } : {}),
      ...(r.ground
        ? {
            ground: {
              wet: r.ground.wet.map(([a, b]): [number, number] => [a, b]),
              fords: [...r.ground.fords],
            },
          }
        : {}),
      // skutečné volné konce (brána, cíl) – jen tam se pás cesty vytrácí
      ...(r.openEnds ? { openEnds: [r.openEnds[0], r.openEnds[1]] as [boolean, boolean] } : {}),
      ...(work?.roadGrade
        ? {
            upgrade: {
              grade: work.roadGrade,
              progress: Math.round(work.buildProgress * 1000) / 1000,
            },
          }
        : {}),
    };
  });
}

/** Les vsi pro scénu (fields.md – Les vsi) – stáří v celých letech (scéna se mění jen občas). */
export function sceneWoods(
  state: Pick<VillageState, 'woods'>,
  landscape: Landscape,
  day: number,
): SceneWood[] {
  return villageWoods(state).map((w) => {
    // les z natočeného pole stojí v jeho mřížce (fields.md – Natočené stavby)
    const center = squareCenter(landscape, w.grid, w.cell);
    return {
      cell: { x: w.cell.x, y: w.cell.y },
      x: center.x,
      z: center.z,
      size: landscape.cellSizeM,
      ...(w.grid ? { grid: w.grid, rotation: w.grid.rotation } : {}),
      surface: w.surface,
      age: Math.floor(woodAgeYears(w, day)),
    };
  });
}

/** Pevné cesty pro panel výběru – i vylepšení, která úsek nabízí (s cenou a důvodem). */
function roadViews(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): VillageRoad[] {
  const roads = state.roads?.roads ?? [];
  if (roads.length === 0) return [];
  const obstacles = obstaclesOf(landscape);
  const walk = villageRoadWalk(state, landscape);
  const standing = (state.roads?.trees ?? []).filter((t) => {
    const look = roadTreeLook(t, day);
    return look !== null && (look.stage === 'shrub' || look.stage === 'tree');
  });
  const removed = new Set(obstacleChangesAt(state, day).removed);
  const apples = (state.roads?.apples ?? []).filter((a) => !removed.has(a.id));
  return roads.map((r) => {
    const spots = new Set(r.spots.map((s) => s.id));
    const work = summary.constructions.find((c) => c.kind === 'road' && c.roadIds?.includes(r.id));
    const planting = summary.constructions.find(
      (c) => c.kind === 'road-apples' && c.roadIds?.includes(r.id),
    );
    const mine = apples.filter((a) => a.roadId === r.id);
    const living = mine.filter((a) => roadAppleStage(a, day) === 'tree');
    return {
      id: r.id,
      grade: r.grade,
      lengthM: Math.round(roadLengthM(r)),
      ageYears: Math.max(0, Math.floor((day - r.bornDay) / DAYS_PER_YEAR)),
      trees: standing.filter((t) => spots.has(t.spot) && !removed.has(t.id)).length,
      wetM: Math.round((r.ground?.wet ?? []).reduce((sum, [a, b]) => sum + (b - a), 0)),
      fords: r.ground?.fords.length ?? 0,
      building:
        work && work.roadGrade
          ? { grade: work.roadGrade, progress: work.progress, treesToFell: work.treesToFell }
          : null,
      upgrades: roadUpgradeOptions(state, r.id, day, obstacles, walk),
      apples: {
        trees: living.length,
        bearing: living.filter((a) => roadAppleBearing(a, day)).length,
        planting: planting
          ? {
              trees: mine.filter((a) => a.constructionId === planting.id).length,
              progress: planting.progress,
              waits: !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month),
            }
          : null,
        option: roadApplesOption(state, r.id, day, landscape, obstacles) ?? {
          trees: 0,
          laborManDays: 0,
          blocked: null,
          warning: null,
        },
      },
    };
  });
}

/**
 * Jabloně u pevných cest pro scénu (roads.md – Vysazení jabloní): velikost podle stáří jako
 * v sadu (po setinách – instance se nepřestavují při každém dotazu), plody od srpna do sklizně
 * u plodících stromů; odstraněné stavbou a zmizelé souše chybí.
 */
export function sceneRoadApples(
  state: Pick<VillageState, 'roads' | 'orchardWork'>,
  day: number,
  obstacles: ObstacleChanges,
): SceneRoadApple[] {
  const removed = new Set(obstacles.removed);
  const month = dateOfDayIndex(day).month;
  const work = state.orchardWork ?? null;
  const harvested = work?.task === 'harvest' ? work.done >= work.required : true;
  const harvestWindow = monthInWindow(ORCHARD_WINDOWS.harvest, month);
  return (state.roads?.apples ?? []).flatMap((a): SceneRoadApple[] => {
    const stage = roadAppleStage(a, day);
    if (stage === null || removed.has(a.id)) return [];
    const planted = a.plantedDay;
    const growth =
      planted === null
        ? 0
        : Math.round(treeGrowth((day - planted) / DAYS_PER_TREE_YEAR) * 100) / 100;
    const fruit =
      stage === 'tree' &&
      fruitVisible({ bearing: roadAppleBearing(a, day), month, harvestWindow, harvested });
    return [{ id: a.id, roadId: a.roadId, x: a.x, z: a.z, stage, growth, fruit }];
  });
}

/** Velikost stromu u cesty ve scéně po dvacetinách – strom se překreslí jen po znatelném přírůstku. */
const ROAD_TREE_GROWTH_STEPS = 20;

/**
 * Stromy u pevných cest pro scénu v den `day` (roads.md) – bez stromů, které odstranila stavba
 * a které už zmizely; velikost po dvacetinách (scéna se mění jen občas).
 */
export function sceneRoadTrees(
  state: Pick<VillageState, 'roads'>,
  day: number,
  obstacles: ObstacleChanges,
): SceneRoadTree[] {
  const removed = new Set(obstacles.removed);
  return (state.roads?.trees ?? []).flatMap((t): SceneRoadTree[] => {
    const look = roadTreeLook(t, day);
    if (look === null || removed.has(t.id)) return [];
    const growth = Math.round(look.growth * ROAD_TREE_GROWTH_STEPS) / ROAD_TREE_GROWTH_STEPS;
    return [{ id: t.id, x: t.x, z: t.z, species: t.species, stage: look.stage, growth }];
  });
}

/**
 * Kouří dílna u domu? Pec a výheň, když vyrábí; milíř uhlíře u zemnice, jen když pálí (u lesního
 * milíře kouří milíř v lese – `sceneKilns`).
 */
function workshopSmokes(
  workshop: NonNullable<VillageState['dwellings'][number]['workshop']>,
): boolean {
  if (workshop.craft !== 'burner') return workshop.activity === 'producing';
  return workshop.kiln?.stage === 'burn' && workshop.kiln.site === null;
}

/** Milíře uhlířů v lese pro scénu – fáze a průběh (crafts.md – Uhlíř). */
function sceneKilns(state: VillageState, summary: VillageSummary): SceneKiln[] {
  return state.dwellings.flatMap((d) => {
    const kiln = d.workshop?.kiln;
    if (!kiln?.site) return [];
    const info = summary.crafts.workshops.find((w) => w.dwellingId === d.id)?.kiln;
    return [
      {
        id: d.id,
        x: kiln.site.x,
        z: kiln.site.z,
        stage: kiln.stage,
        // po 2 % – milíř se nepřestavuje při každém dotazu
        progress: Math.round((info?.progress ?? 0) * 50) / 50,
      },
    ];
  });
}

/** Velikost mladých buků od uhlíře 0–1 po setinách (instance se nepřestavují při každém dotazu). */
function plantedSaplingViews(state: VillageState, day: number): { id: number; growth: number }[] {
  return (state.felledTrees ?? []).flatMap((f) => {
    if (f.planted === undefined) return [];
    const growth = saplingGrowth(f, day);
    return growth === null ? [] : [{ id: f.id, growth: Math.round(growth * 100) / 100 }];
  });
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
      kiln: w.kiln,
      toPlant: w.toPlant,
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
  const stocked = stockedPenIds(state);
  let builtIndex = 0;
  return summary.pens.map((pen) => {
    const construction = state.constructions.find((c) => c.kind === 'pen' && c.penId === pen.id);
    const share = pen.built ? Math.floor(cows / built) + (builtIndex++ < cows % built ? 1 : 0) : 0;
    const wear = (state.pens ?? []).find((p) => p.id === pen.id)?.wear;
    return {
      id: pen.id,
      cell: { x: pen.cell.x, y: pen.cell.y },
      ...(pen.grid ? { grid: pen.grid, rotation: pen.grid.rotation } : {}),
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
      ...wearOf(structureCondition(wear, 'pen', day), 'condition'),
      ...(pen.built && !stocked.has(pen.id) ? { stocked: false as const } : {}),
    };
  });
}

/**
 * Stav stavby pro scénu (abandonment.md): jen pod 1, po setinách – scéna podle něj volí stupeň
 * rozpadu (structure-decay.ts) a přestaví se jen při změně stupně.
 */
function wearOf<K extends string>(condition: number, key: K): { [key in K]?: number } {
  if (condition >= 1) return {};
  return { [key]: Math.floor(condition * 100) / 100 } as { [key in K]?: number };
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
  const wears = new Map((state.sacredBuildings ?? []).map((b) => [b.id, b.wear]));
  const repairing = new Set(
    state.constructions.flatMap((c) =>
      c.kind === 'repair' && (c.repair?.structure === 'idol' || c.repair?.structure === 'shrine')
        ? [c.repair.id]
        : [],
    ),
  );
  const buildings = [
    ...summary.sacred.buildings.map((b) => {
      const wear = wears.get(b.id);
      return {
        id: b.id,
        kind: b.kind,
        position: b.position,
        built: true,
        progress: 1,
        ...wearOf(structureCondition(wear, b.kind, day), 'condition'),
        ...(isAbandoned(wear) ? { abandoned: true as const } : {}),
        // ohniště opravované svatyně se rozhoří až po opravě (abandonment.md – Oprava)
        ...(repairing.has(b.id) ? { repairing: true as const } : {}),
      };
    }),
    ...sites,
  ];
  // zbytky padlých model a svatyní – zarůstání po 5 % (scéna se přestaví jen při změně)
  const ruins = (state.sacredRuins ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    position: r.position,
    overgrowth: Math.floor(sacredRuinOvergrowth(r, day) * 20) / 20,
  }));
  const { oaks, groves } = summary.sacred;
  if (oaks.length === 0 && groves.length === 0 && buildings.length === 0 && ruins.length === 0) {
    return null;
  }
  // souš a padlý kmen mají velikost dubu v den uschnutí
  const sceneOak = (o: (typeof oaks)[number]): SceneSacredOak => ({
    id: o.id,
    x: o.x,
    z: o.z,
    growth: sacredOakGrowth(o.day, o.diedDay ?? day),
    ...(o.stage === 'snag' ? { snag: true as const } : {}),
    ...(o.stage !== 'alive' && o.sizeM !== null ? { sizeM: o.sizeM } : {}),
  });
  const fallen = oaks.filter((o) => o.stage === 'fallen').map(sceneOak);
  return {
    oaks: oaks.filter((o) => o.stage !== 'fallen').map(sceneOak),
    ...(fallen.length > 0 ? { fallenOaks: fallen } : {}),
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
    ...(ruins.length > 0 ? { ruins } : {}),
  };
}

/**
 * Posvátná místa pro panel výběru – kolik které přidává, stáří dubů (souš: stáří, kdy uschla;
 * háj: nejstarší dub podle vrstvy překážek), u staveb průběh. Padlá souš už posvátným dubem není.
 */
function sacredView(
  state: VillageState,
  summary: VillageSummary,
  obstacles: ObstacleLayer,
  day: number,
): VillageSacred {
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
            condition: 1,
            abandoned: false,
            repair: null,
          },
        ]
      : [],
  );
  const wears = new Map((state.sacredBuildings ?? []).map((b) => [b.id, b.wear]));
  return {
    oaks: summary.sacred.oaks.flatMap((o) =>
      o.stage === 'fallen'
        ? []
        : [{ id: o.id, happiness: o.happiness, ageYears: o.ageYears, snag: o.stage === 'snag' }],
    ),
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
        condition: structureCondition(wears.get(b.id), b.kind, day),
        abandoned: isAbandoned(wears.get(b.id)),
        repair: repairProgress(summary.constructions, b.kind, b.id),
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
  return {
    day: labor.day,
    month: dateOfDayIndex(labor.day).month,
    people,
    shares,
    ...(labor.herders ? { herders: { ...labor.herders } } : {}),
  };
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
  grid?: SquareGrid,
): NonNullable<SceneVillage['orchards']>[number]['squares'][number] {
  const center = squareCenter(landscape, grid, square.cell);
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
    ...(grid ? { rotation: grid.rotation } : {}),
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
  grid?: SquareGrid,
): SceneFieldPart {
  // natočené pole (fields.md – Natočené stavby): střed čtverce v mřížce pole a natočení
  const center = squareCenter(landscape, grid, cell);
  const scene: SceneFieldPart = {
    id: part.id,
    cell: { x: cell.x, y: cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    ...(grid ? { rotation: grid.rotation } : {}),
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
      ...(event.kind === 'structure-fell' || event.kind === 'structure-repaired'
        ? { structure: event.structure }
        : {}),
      ...(event.kind === 'newcomer' ? { group: event.group, direction: event.direction } : {}),
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name),
    }));
}

/** Kronika sklizní podle plodiny (fields.md – Ozim a jař); bez plodiny ves seje jen jař. */
const HARVEST_NAMES: Record<Crop | 'any', string> = {
  winter: 'Sklizeň ozimu',
  spring: 'Sklizeň jaře',
  legume: 'Sklizeň luštěnin',
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
    let overgrowingM2 = 0;
    for (const p of parts) {
      if (p.state === 'fallow' && (partOvergrowthYears(p) > 0 || isOvergrown(p))) {
        overgrowingM2 += p.areaM2;
      }
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
    return {
      id: f.id,
      areaM2,
      fertility,
      stages,
      surfaces,
      crops,
      ashParts,
      ashBonus,
      overgrowingM2,
    };
  });
}

/** Co pohled na jednu ves sám neví – zjistí ho vstupní bod přes `dynastyStatus`. */
export interface VillageViewContext {
  /** Hráči vymřely všechny vsi (ne jen tahle). */
  gameOver?: boolean;
  /** Všechny vsi hráče pro přepínač; bez nich jen tahle ves. */
  villages?: VillageListItem[];
  /**
   * Jiné vsi na téže mapě (migration.md) – přehled jejich staveb a pasek (`neighbourSnapshot`)
   * a jejich stavby pro scénu. Bez nich je ves na mapě sama.
   */
  neighbours?: NeighbourSnapshot | null;
  neighbourScenes?: SceneNeighbour[];
  /** Vlastní vsi na sousedních mapách po směrech – tam se neodchází ani neobchoduje. */
  ownMaps?: Partial<Record<Direction8, string>>;
  /** Proč z téhle mapy na novou mapu odejít nejde (mapa bez polohy v mřížce), nebo null. */
  mapsBlocked?: string | null;
}

/** Stavby vsi pro scénu – jako v pohledu na ves (stavby jiné vsi na téže mapě). */
export function sceneOfVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
): SceneVillage {
  const shown = abandonedVillageAt(state, day);
  return sceneVillage(shown, landscape, day, summarizeVillage(shown, day, obstaclesOf(landscape)));
}

/**
 * Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). `context` – konec hry a vsi
 * hráče pro přepínač (vstupní bod je zná ze všech vsí hráče).
 */
export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
  context: VillageViewContext = {},
): VillageView {
  const { name } = record;
  // jiné vsi na téže mapě (paseky, cizí půda) a opuštěná ves jen jako pohled (migration.md)
  const state = abandonedVillageAt(withNeighbours(record.state, context.neighbours ?? null), day);
  const obstacles = obstaclesOf(landscape);
  const summary = summarizeVillage(state, day, obstacles);
  const gameOver = context.gameOver ?? false;
  return {
    id: record.id,
    settlementId: record.settlementId,
    name,
    villages: context.villages ?? [
      {
        id: record.id,
        settlementId: record.settlementId,
        name,
        people: state.people.length,
        extinct: state.extinctDay !== undefined,
        abandoned: state.abandonedDay !== undefined,
        travelling: state.journey !== undefined,
        hungry: summary.hungry,
        starving: summary.starving,
      },
    ],
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
        relocation: householdRelocation(state, summary.constructions, h.dwellingId),
        relocationBlock: householdRelocationBlock(state, h.dwellingId),
      };
    }),
    storesKg: summary.storesKg,
    applesKg: summary.applesKg,
    meatKg: summary.meatKg,
    legumesKg: summary.legumesKg,
    cheeseKg: summary.cheeseKg,
    milkLPerDay: summary.livestock.milkLPerDay,
    hayKg: summary.hayKg,
    diet: {
      energy: summary.diet.energy,
      protein: summary.diet.protein,
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
    relocation: relocationOptions(state, landscape),
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
      relocates: state.constructions.find((x) => x.id === c.id)?.relocates ?? null,
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
    sacred: sacredView(state, summary, obstacles, day),
    extinct: villageLifespan(state),
    abandoned: villageAbandonment(state),
    journey: journeyView(state, day),
    leave: leaveOptions(state, landscape, context.ownMaps ?? {}, context.mapsBlocked ?? null),
    gameOver,
    cemeteries: summary.cemeteries.map((c) => {
      const progress = cemeteryProgress(c.id, c.built, summary.constructions);
      const wear = villageCemeteries(state).find((x) => x.id === c.id)?.fenceWear;
      return {
        ...c,
        progress,
        fenceCondition: structureCondition(wear, 'cemetery-fence', day),
        abandoned: isAbandoned(wear),
        repair: repairProgress(summary.constructions, 'cemetery-fence', c.id),
      };
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
    roads: roadViews(state, landscape, day, summary),
    scene: {
      ...sceneVillage(state, landscape, day, summary),
      trails: sceneTrails(state),
      ...(context.neighbourScenes?.length ? { neighbours: context.neighbourScenes } : {}),
    },
    chronicle: chronicle(state, name),
    lastMarriageDay: lastMarriageDay(state),
    manor: manorView(state, landscape, day, context.ownMaps ?? {}),
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
    const wear = (state.pens ?? []).find((p) => p.id === pen.id)?.wear;
    return {
      id: pen.id,
      built: pen.built,
      progress,
      team: pen.team,
      training: pen.training,
      trainBlocked: pen.trainBlocked,
      cows: winter && pen.built && built > 0 ? Math.round(summary.livestock.herds.cow / built) : 0,
      oxen: (pen.team ? 2 : 0) + (pen.training ? 2 : 0),
      condition: structureCondition(wear, 'pen', day),
      abandoned: isAbandoned(wear),
      repair: repairProgress(summary.constructions, 'pen', pen.id),
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
  // kontrola běží při každém pohybu kurzoru nad stejnou scénou – stejná ves (i rejstřík čtverců
  // staveb v jádru, který se pamatuje podle seznamů staveb)
  const cached = placementCache.get(scene);
  if (cached) return cached;
  const village = scenePlacementVillage(scene);
  placementCache.set(scene, village);
  return village;
}

const placementCache = new WeakMap<SceneVillage, PlacementVillage>();

function scenePlacementVillage(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({
      type: d.type,
      position: d.position,
      // pozemek i s dvorem dvorce (trade.md) a natočením (fields.md – Natočené stavby)
      ...(d.plot ? { plot: plotOfScene(d.plot) } : {}),
      ...(d.craft ? { workshop: { craft: d.craft } } : {}),
    })),
    constructions: [],
    // stavby a půda jiných vsí na téže mapě (migration.md)
    ...(foreignFromScene(scene) ? { foreign: foreignFromScene(scene) } : {}),
    // natočená pole (fields.md – Natočené stavby) – díly jsou čtverce v jejich mřížce
    fields: scene.fields.map((f) => ({ id: f.id, ...(f.grid ? { grid: f.grid } : {}) })),
    // pole a plocha dílu (políčko) pro navazující pole – rozšíření a sloučení (fields.md)
    parts: scene.fields.flatMap((f) =>
      f.parts.map((p) => ({
        ...(p.id !== undefined ? { id: p.id } : {}),
        cell: p.cell,
        fieldId: f.id,
        areaM2: p.size * p.size,
      })),
    ),
    cemeteries: (scene.cemeteries ?? []).map((c) => ({
      ...(c.grid ? { grid: c.grid } : {}),
      squares: c.squares.map((s) => ({ cell: s.cell })),
    })),
    // plocha čtverce (políčko) pro varování, že sad stavbou obydlí zanikne
    orchards: (scene.orchards ?? []).map((o) => ({
      ...(o.grid ? { grid: o.grid } : {}),
      squares: o.squares.map((s) => ({ cell: s.cell, areaM2: s.size * s.size })),
    })),
    pens: (scene.pens ?? []).map((pen) => ({
      cell: pen.cell,
      ...(pen.grid ? { grid: pen.grid } : {}),
    })),
    // les vsi – pole ho vymýtí jako les, ostatní stavby na něj nesmí (fields.md – Les vsi)
    ...(scene.woods
      ? {
          woods: scene.woods.map((w) => ({ cell: w.cell, ...(w.grid ? { grid: w.grid } : {}) })),
        }
      : {}),
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
    // pevné cesty – kácení u kurzoru chůzí jako na serveru (roads.md)
    ...(scene.roads ? { walkRoads: scene.roads } : {}),
  };
}
