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
export interface Dwelling {
  id: number;
  type: DwellingType;
  builtDay: number;
  condition: number /* 0–1 */;
  position: Position;
  /**
   * Vzdálenost obydlí k nejbližšímu okraji lesa (m) – z krajiny při zahájení stavby (simulace
   * krajinu nemá); prodražuje palivo (forest.md – Palivo). U starších obydlí chybí (= les blízko).
   */
  forestDistanceM?: number;
}
export type PartState = 'founding' | 'ready' | 'sown' | 'fallow';
/**
 * Plodina osetého dílu (fields.md – Ozim a jař): **ozim** (`winter` – žito a pšenice, kopá se
 * a seje na podzim, sklízí v červenci) a **jař** (`spring` – ječmen, kopá se na podzim nebo na
 * jaře, seje na jaře, sklízí v srpnu).
 */
export type Crop = 'winter' | 'spring';
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
  bonusUntilDay: number | null; // do kdy platí bonus vymýceného lesa (FOREST_BONUS)
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  /** Co je na osetém dílu zaseto; chybí u dílů mimo osev a u starších vsí (= jař). */
  crop?: Crop;
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
export type ConstructionKind = 'dwelling' | 'rebuild' | 'field' | 'cemetery' | 'orchard';
export interface Construction {
  id: number;
  kind: ConstructionKind;
  startedDay: number;
  cost: number;
  done: number;
  dwellingType: DwellingType | null;
  position: Position | null; // dwelling
  /** rebuild: přestavované obydlí; dwelling: domácnost zakladatelů (první zemnice), jinak null. */
  dwellingId: number | null;
  fieldId: number | null; // field – zakládá díly od nejbližšího
  cemeteryId?: number | null; // cemetery (u starších staveb chybí)
  orchardId?: number | null; // orchard – vysazuje čtverce od nejbližšího (u ostatních chybí)
  /** Dřevo obydlí a přestavby (forest.md); u starších staveb a polí chybí. */
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
/** Polní práce s pevnou sazbou na osetý hektar (vracení přílohu se počítá podle stáří přílohu). */
export type FieldTask = Exclude<TaskName, 'reclaim'>;
/**
 * Meze produktivity (Martin): hodnota bez řemesel (`worst`) a s plně pokrytou potřebou výrobků
 * řemeslníků (`best`); mezi nimi lineárně podle pokrytí (productivity.ts).
 */
export interface Bounds {
  readonly worst: number;
  readonly best: number;
}
/** Pokrytí potřeby výrobků řemeslníků 0–1 (crafts.md): nástroje od kováře, nádoby od hrnčíře. */
export interface CraftCoverage {
  readonly tools: number;
  readonly pottery: number;
}
/** Sezónní práce v sadech (orchard.md) – v rozdělení práce vedle polních prací. */
export type OrchardTaskName = 'orchard-care' | 'orchard-harvest';
/** Práce jedné plodiny v ročním plánu – díly, potřebné a odvedené člověkodny po úlohách. */
export interface CropWork {
  partIds: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
  harvestedKg: number | null; // čistá úroda ze sklizně (pro ztrátu nevymláceného 1. 3.)
}
/**
 * Roční plán osevu (k 1. 9.): na nejvyšší úrovni jař (tvar plánu z doby před ozimem), ozim
 * zvlášť v `winter` – chybí u plánů bez ozimu (i u starších vsí).
 */
export interface YearPlan extends CropWork {
  plannedDay: number;
  winter?: CropWork;
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
  /**
   * Sklizeň obilí – plodina, když ves seje ozim i jař (ozim v červenci, jař v srpnu); bez ní jen
   * jař (ves bez ozimu, starší sklizně).
   */
  | { kind: 'harvest'; kg: number; crop?: Crop }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  | { kind: 'part-became-forest'; partId: number }
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
}

/** Změna krajiny sídla nad vygenerovanou vrstvou překážek – id překážky a den. */
export interface ObstacleChange {
  id: number;
  day: number;
}
