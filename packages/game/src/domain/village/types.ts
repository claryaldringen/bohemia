// Stav vsi – JSON-serializovatelný (objekty, pole, čísla, řetězce, null).
export type DwellingType = 'zemnice' | 'polozemnice';
export type FieldSurface = 'meadow' | 'shrub' | 'forest';
export interface Position {
  x: number;
  z: number;
  rotation: number;
} // svět, m; ověřuje plán 3
export interface Person {
  id: number;
  bornDay: number;
  /**
   * Domácnost = id obydlí. Zakladatelé vsi mají id první zemnice už během její stavby (bydlí na
   * staveništi), obydlí s tím id vznikne až s dokončením.
   */
  dwellingId: number;
}
/**
 * Kde na pozemku stojí dům: uprostřed, nebo v jednom ze čtyř rohů (population.md – Umístění
 * obydlí, Martin 18. 10. 2026). „Vpředu“ = strana s brankou, ke které míří vchod (−z světa),
 * „vlevo“ = −x světa.
 */
export type PlotVariant = 'center' | 'back-left' | 'back-right' | 'front-right' | 'front-left';
/**
 * Pozemek obydlí – celé políčko krajiny obehnané plotem a varianta, kde na něm dům stojí.
 * Polozemnice postavené dřív pozemek nemají (volná poloha bez plotu).
 */
export interface DwellingPlot {
  cell: TileCell;
  variant: PlotVariant;
}
export interface Dwelling {
  id: number;
  type: DwellingType;
  builtDay: number;
  condition: number /* 0–1 */;
  position: Position;
  /** Pozemek (polozemnice od 18. 10. 2026); `position` je pak poloha domu na něm. */
  plot?: DwellingPlot;
  /**
   * Vzdálenost obydlí k nejbližšímu okraji lesa (m) – z krajiny při zahájení stavby (simulace
   * krajinu nemá); prodražuje palivo (forest.md – Palivo). U starších obydlí chybí (= les blízko).
   */
  forestDistanceM?: number;
}
export type PartState = 'founding' | 'ready' | 'sown' | 'fallow';
/** Políčko krajiny – sloupec x a řádek y mřížky. */
export interface TileCell {
  x: number;
  y: number;
}
export interface FieldPart {
  id: number;
  fieldId: number;
  areaM2: number;
  distanceM: number;
  naturalFertility: number; // 0–100 z krajiny
  fertilityShare: number; // aktuální úrodnost / přirozená, 0–1
  bonusUntilDay: number | null; // +20 po vymýcení lesa
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  fallowSinceDay: number | null; // od kdy leží v přílohu
  foundingCost: number; // člověkodny (povrch × plocha + překážky)
  foundingDone: number;
  surface: FieldSurface; // povrch při založení
  cell?: TileCell; // políčko krajiny = čtverec pole, který díl zabírá
  /** Překážky na čtverci (id z vrstvy překážek) – zmizí z krajiny, až osadníci díl založí. */
  obstacles?: number[];
  /** Dospělé stromy mezi překážkami – po založení dílu dají klády na hromadu (forest.md). */
  trees?: number;
}
/** Pole – jeho čtverce jsou políčka jeho dílů (`FieldPart.cell`). */
export interface Field {
  id: number;
  /** @deprecated Obrys z prvního prototypu (pole se kreslila volným obrysem) – jen staré vsi. */
  outline?: [number, number][];
}
/** Čtverec pohřebiště – políčko krajiny, jeho střed ve světě (m) a vzdálenost od vody. */
export interface CemeterySquare {
  cell: TileCell;
  x: number;
  z: number;
  /** Vzdálenost čtverce od nejbližší vody (m) – z krajiny při založení (simulace krajinu nemá). */
  waterDistanceM: number;
  /**
   * Rozšíření ve stavbě – id stavby, která čtverec ohrazuje; do jejího dokončení se čtverec
   * nepočítá (hroby, hygiena). Bez údaje je čtverec hotový se hřbitovem.
   */
  constructionId?: number;
  /** Překážky na čtverci (id z vrstvy překážek) – zmizí z krajiny, až osadníci čtverec ohradí. */
  obstacles?: number[];
  /** Dospělé stromy mezi překážkami – po ohrazení čtverce dají klády na hromadu (forest.md). */
  trees?: number;
}
/**
 * Hřbitov (pohřebiště) – souvislá skupina čtverců (cemetery.md); hroby se plní a znovu
 * nepoužívají. Rozšíření přidává čtverce na konec (`constructionId`, dokud se ohrazují).
 */
export interface Cemetery {
  id: number;
  squares: CemeterySquare[];
  /** Strana čtverce (m) – vzdálenost od obydlí se měří k okraji čtverce. */
  squareSizeM: number;
  /** Obsazené hroby. */
  graves: number;
  /** Den dokončení (vytyčení a ohrazení); dokud se zakládá, null. */
  builtDay: number | null;
}
/**
 * Čtverec jabloňového sadu – políčko krajiny (orchard.md). Sází se jako stavba ze společné práce
 * (od nejbližšího k obydlím), od výsadby stromy rostou a plodí podle roku sadu.
 */
export interface OrchardSquare {
  cell: TileCell;
  /** Plocha čtverce bez skalních výchozů (m²) – jako u dílu pole. */
  areaM2: number;
  /** Vzdálenost středu čtverce od nejbližšího obydlí při založení (m) – práce v sadu dražší. */
  distanceM: number;
  /** Výsadba: člověkodny (80/ha + překážky) a kolik je hotovo. */
  plantingCost: number;
  plantingDone: number;
  /** Den, kdy osadníci čtverec vysadili; dokud se sází, null. */
  plantedDay: number | null;
  /**
   * Překážky na čtverci (id z vrstvy překážek) – zmizí z krajiny, jakmile ho osadníci začnou
   * sázet (vyklizení je první část výsadby).
   */
  obstacles?: number[];
  /** Dospělé stromy mezi překážkami – s vyklizením čtverce dají klády na hromadu (forest.md). */
  trees?: number;
}
/** Jabloňový sad – souvislá skupina čtverců (orchard.md). */
export interface Orchard {
  id: number;
  squares: OrchardSquare[];
}
/** Sezónní práce v sadech celé vsi – sklizeň (září–říjen), nebo péče (prosinec–únor). */
export interface OrchardWork {
  task: 'harvest' | 'care';
  /** Potřebné a hotové člověkodny. */
  required: number;
  done: number;
  /** Sklizeň: kg jablek při plné sklizni (péče 0). */
  yieldKg: number;
}
export type ConstructionKind =
  | 'dwelling'
  | 'rebuild'
  | 'field'
  | 'cemetery'
  | 'orchard'
  /** Dřevěná modla a svatyně (happiness.md) – stavba se polohou v `position`. */
  | SacredBuildingKind;
/** Posvátná stavba, kterou staví hráč (happiness.md). */
export type SacredBuildingKind = 'idol' | 'shrine';
export interface Construction {
  id: number;
  kind: ConstructionKind;
  startedDay: number;
  cost: number;
  done: number;
  dwellingType: DwellingType | null;
  position: Position | null; // dwelling, idol, shrine
  /** Nové obydlí na pozemku – obydlí ho po dostavění převezme (u volných obydlí chybí). */
  plot?: DwellingPlot;
  /** rebuild: přestavované obydlí; dwelling: domácnost zakladatelů (první zemnice), jinak null. */
  dwellingId: number | null;
  fieldId: number | null; // field – zakládá díly od nejbližšího
  cemeteryId?: number | null; // cemetery (u starších staveb chybí)
  orchardId?: number | null; // orchard – vysazuje čtverce od nejbližšího (u ostatních chybí)
  /** Dřevo obydlí, přestavby, modly a svatyně (forest.md); u starších staveb a polí chybí. */
  wood?: ConstructionWood;
  /** Nové obydlí: vzdálenost k nejbližšímu okraji lesa (m) – obydlí ji po dostavění převezme. */
  forestDistanceM?: number;
}
/**
 * Dřevo stavby (forest.md – Stavby a kácení): kolik ho stavba spotřebuje, kolik klád vzala při
 * zahájení z hromady a které stromy se pro ni kácí. Stromy jsou vyhrazené od zahájení a kácí se
 * jako první část práce stavby – pokácený strom nechá pařez (`felledTrees`).
 */
export interface ConstructionWood {
  /** Dřevo, které stavba spotřebuje (stromy = klády). */
  trees: number;
  /** Klády vzaté při zahájení z hromady. */
  fromPile: number;
  /**
   * Stromy ke kácení v pořadí kácení (nejbližší ke staveništi první): id z vrstvy překážek (null =
   * kácení bez polohy – ves bez vrstvy překážek, jen testy) a práce za skácení a dovoz
   * (člověkodny, i se vzdáleností).
   */
  fell: { id: number | null; cost: number }[];
  /** Kolik stromů z `fell` už je pokácených. */
  felled: number;
}
export type TaskName = 'reclaim' | 'dig' | 'sow' | 'weed' | 'harvest' | 'thresh';
/** Sezónní práce v sadech (orchard.md) – v rozdělení práce vedle polních prací. */
export type OrchardTaskName = 'orchard-care' | 'orchard-harvest';
export interface YearPlan {
  plannedDay: number;
  partIds: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
  harvestedKg: number | null; // čistá úroda sklizená 31. 8. (pro ztrátu nevymláceného 1. 3.)
}
export type ChronicleEvent = { day: number } & (
  | { kind: 'village-founded' }
  | { kind: 'birth' }
  /** `cause: 'hunger'` – zemřel hlady (nahromaděný hlad, population.md); jinak bez údaje. */
  | { kind: 'death'; group: 'child' | 'adult' | 'elder'; cause?: 'hunger' }
  /** Zemřel poslední člověk – ves vymřela (population.md – Hlad a vymření). */
  | { kind: 'village-extinct' }
  | { kind: 'household-founded'; dwellingId: number }
  | { kind: 'household-merged'; fromDwellingId: number; toDwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
    }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  | { kind: 'harvest'; kg: number }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  | { kind: 'part-became-forest'; partId: number }
  /** Vesničané při mýcení ušetřili posvátný dub nebo dubový háj (happiness.md) – id místa. */
  | { kind: 'sacred-spared'; site: 'oak' | 'grove'; id: number }
  | {
      kind: 'cemetery-full';
      cemeteryId: number;
      /** Jiný hotový hřbitov má volný hrob. */
      othersFree: boolean;
      /** Nějaký hřbitov nebo rozšíření se právě staví (u starších událostí chybí). */
      othersBuilding?: boolean;
    }
);
// Rozdělení práce dne po činnostech a místech (labor-report.ts) – jen pro zobrazení postav.
/** Činnost, na kterou šla práce dne. */
export type LaborActivity =
  /** Polní práce plánu (fields.md – Práce); sklizeň srpem a odnos v nůších zvlášť. */
  | 'reclaim'
  | 'dig'
  | 'sow'
  | 'weed'
  | 'harvest'
  | 'carry'
  | 'thresh'
  /** Sezónní práce v sadech (orchard.md). */
  | 'orchard-care'
  | 'orchard-harvest'
  /** Společná práce do staveb: stavba obydlí, kácení jeho dřeva, zakládání pole, výsadba sadu, hřbitov. */
  | 'build'
  | 'fell'
  | 'found-field'
  | 'orchard-plant'
  | 'cemetery'
  /** Opravy obydlí (population.md). */
  | 'repair'
  /** Denní minimum domácností a domácí výroba (fields.md – Práce, body 1 a 4). */
  | 'domestic'
  /** Společná práce, na kterou nezbyla žádná stavba (propadla). */
  | 'idle';

/** Kde se práce dělá. */
export type LaborTarget =
  /** Pole (id) – osévané díly plánu, zakládané díly. */
  | { kind: 'field'; id: number }
  /** Hotové obydlí (id) – opravy, přestavba. */
  | { kind: 'dwelling'; id: number }
  /** Staveniště nového obydlí – id stavby. */
  | { kind: 'site'; id: number }
  /** Sad (id) – výsadba, péče, sklizeň. */
  | { kind: 'orchard'; id: number }
  /** Hřbitov (id) – zakládání a rozšíření. */
  | { kind: 'cemetery'; id: number }
  /** Stromy z vrstvy překážek, které se pro stavbu právě kácejí. */
  | { kind: 'trees'; ids: number[] }
  /** Ves celkově – výmlat, domácí práce, nevyužitá společná práce. */
  | { kind: 'village' };

export interface LaborShare {
  activity: LaborActivity;
  target: LaborTarget;
  /** Člověkodny (na tisíciny). */
  manDays: number;
  /**
   * Stavba, do které práce šla (stavba i kácení jejího dřeva, zakládání pole, výsadba sadu,
   * hřbitov) – scéna podle ní ukáže u každé stavby, která dnes dostala práci, aspoň jednoho
   * člověka. U ostatní práce (a u rozdělení uložených dřív) chybí.
   */
  construction?: number;
}

/** Rozdělení práce jednoho dne – uložené ve stavu vsi (`VillageState.labor`). */
export interface LaborDay {
  day: number;
  shares: LaborShare[];
}

export interface VillageState {
  seed: number;
  foundedDay: number;
  lastDay: number; // poslední už odsimulovaný den
  nextId: number;
  people: Person[];
  dwellings: Dwelling[];
  fields: Field[];
  parts: FieldPart[];
  constructions: Construction[];
  plan: YearPlan | null;
  threshingFromPlan: YearPlan | null;
  storesKg: number;
  domesticBacklog: number;
  hungry: boolean;
  /**
   * Nahromaděný hlad ve „dnech bez jídla“ (population.md – Hlad a vymření). U vsí uložených
   * před zavedením hladovění chybí (= 0).
   */
  starvationDays?: number;
  /**
   * Den, kdy zemřel poslední člověk – ves vymřela a simulace se zastavila (lidé, pole i stavby
   * stojí). Žijící ves ho nemá.
   */
  extinctDay?: number;
  commonLaborHistory: number[]; // společná práce posledních 30 dní (pro „má na to“)
  chronicle: ChronicleEvent[];
  /** Pohřebiště – u vsí uložených před zavedením pohřebišť chybí (= žádné). */
  cemeteries?: Cemetery[];
  /**
   * Překážky krajiny odstraněné natrvalo i s pařezy (pole, obydlí, hřbitovy, sady). Chybí u vsí
   * založených před vrstvou překážek – doplní je `withObstacleClearing`.
   */
  clearedObstacles?: ObstacleChange[];
  /** Pokácené stromy – zbyl po nich pařez a z náletu znovu dorostou (TREE_REGROWTH_YEARS). */
  felledTrees?: ObstacleChange[];
  /** Jabloňové sady – u vsí uložených před zavedením sadů chybí (= žádné). */
  orchards?: Orchard[];
  /** Zásoby jablek (kg) – jí se před obilím, 1. 3. shnijí. Chybí = žádná. */
  applesKg?: number;
  /** Rozběhnutá sezónní práce v sadech (sklizeň, péče); chybí nebo null = žádná. */
  orchardWork?: OrchardWork | null;
  /**
   * Klády na hromadě u vsi (forest.md – Mýcení a hromada klád) – z mýcení přibývají, stavby je
   * berou, hnijí (proto i neceločíselné). U vsí uložených před dřevem chybí (= 0).
   */
  woodLogs?: number;
  /**
   * Rozdělení práce posledního odsimulovaného dne (labor-report.ts) – jen pro zobrazení, simulace
   * ho nečte. U vsí uložených před jeho zavedením chybí do prvního dopočítaného dne.
   */
  labor?: LaborDay;
  /** Štěstí obyvatel (happiness.md) – u vsí uložených před jeho zavedením chybí (= výchozí 50). */
  happiness?: HappinessState;
  /** Posvátné duby, které vesničané při mýcení ušetřili (happiness.md); chybí = žádné. */
  sacredOaks?: SacredOak[];
  /** Dubové háje, které vesničané při mýcení ušetřili – stavby po čtvercích; chybí = žádné. */
  groves?: Grove[];
  /** Hotové modly a svatyně (happiness.md); chybí = žádné. */
  sacredBuildings?: SacredBuilding[];
}

/**
 * Štěstí obyvatel (happiness.md): hodnota 0–100 a paměť pro cílovou hodnotu – úmrtí za poslední
 * rok a dny dřiny za posledních 60 dní. Simulace ji vede den po dni (na kouscích nezávisí).
 */
export interface HappinessState {
  value: number;
  /** Úmrtí posledního roku: den a kolik ubírá (dítě 5, dospělý a starší 3). */
  deaths: { day: number; points: number }[];
  /**
   * Dřina posledních dní (nejstarší první, nejvýš HAPPINESS_PENALTY.toilWindowDays): 1 = ves ten
   * den nestíhala polní práce v období, 0 = stíhala.
   */
  toil: number[];
}

/** Posvátný dub ušetřený při mýcení – id stromu z vrstvy překážek, den a poloha kmene (m). */
export interface SacredOak {
  id: number;
  day: number;
  x: number;
  z: number;
}

/**
 * Dubový háj ušetřený při mýcení – stavba po čtvercích (happiness.md). Id = id středového dubu
 * z vrstvy překážek, střed (m), čtverce háje a kolik dospělých dubů v okruhu 25 m roste.
 */
export interface Grove {
  id: number;
  day: number;
  x: number;
  z: number;
  cells: TileCell[];
  oaks: number;
}

/** Hotová dřevěná modla nebo svatyně (happiness.md). */
export interface SacredBuilding {
  id: number;
  kind: SacredBuildingKind;
  position: Position;
  builtDay: number;
}

/** Změna krajiny sídla nad vygenerovanou vrstvou překážek – id překážky a den. */
export interface ObstacleChange {
  id: number;
  day: number;
}
