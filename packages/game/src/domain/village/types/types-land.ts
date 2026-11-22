// Typy stavu vsi – Pole, osev, sady, hřbitovy a posvátná místa.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { CartReach, SacredBuildingKind } from './types-construction';
import type { FieldSurface, Position } from './types-people';

export type PartState = 'founding' | 'ready' | 'sown' | 'fallow';
/**
 * Stadium přílohu (fields.md – Zarůstání): mladý příloh (1–2 roky ladem), louka (pastvina, louka
 * na seno), křoviny a mladý les – nepasený a nesečený příloh zarůstá.
 */
export type FallowStage = 'young-fallow' | 'meadow' | 'shrubs' | 'young-forest';
/**
 * Co roste na přílohu podle let bez pastvy a seče (fields.md – Zarůstání): louka, křoviny, mladý
 * les, les – díl v lese z pole vypadne.
 */
export type OvergrowthStage = 'meadow' | 'shrubs' | 'young-forest' | 'forest';
/**
 * Plodina osetého dílu (fields.md – Ozim a jař, Luštěniny, Len): **ozim** (`winter` – žito
 * a pšenice, kopá se a seje na podzim, sklízí v červenci), **jař** (`spring` – ječmen, kopá se na
 * podzim nebo na jaře, seje na jaře, sklízí v srpnu), **luštěniny** (`legume` – hrách a čočka; jař
 * – kopá se jako jař, seje na jaře, sklízí v červenci; diet.md – Luštěniny; od 9. 11. 2026 jen
 * dorůstající ve starších vsích – fields.md, Luštěniny, zrušeno) a **len** (`flax` – na
 * plátno; jař se setím na jaře, trhá se jen v srpnu po obilí, nejí se – diet.md, Oděv).
 */
export type Crop = 'winter' | 'spring' | 'legume' | 'flax';
/** Políčko krajiny – sloupec x a řádek y mřížky. */
export interface TileCell {
  x: number;
  y: number;
}
/**
 * Vlastní mřížka stavby po čtvercích (fields.md – Natočené stavby, návrh Clauda 18. 10. 2026):
 * čtverce o straně políčka krajiny, střed čtverce (0, 0) ve světě (x, z – m) a natočení
 * `rotation` (rad, násobek 15° mezi 15° a 75° – čtverec otočený o 90° je zase týž čtverec).
 * Čtverce stavby jsou pak `TileCell` v této mřížce. Chybí = mřížka krajiny (čtverec = políčko).
 */
export interface SquareGrid {
  x: number;
  z: number;
  rotation: number;
}
/** Natočený čtverec o straně políčka – střed ve světě (m) a natočení (rad, násobek 15°). */
export interface PlotSquare {
  x: number;
  z: number;
  rotation: number;
}
/** Fáze zakládaného dílu v lese: kácení, schnutí větví, pálení. */
export type ClearingStage = 'fell' | 'dry' | 'burn';

/** Průběh klučení lesa na dílu (forest.md – Klučení lesa pro pole – postup). */
export interface PartClearing {
  /**
   * Stojící stromy čtverce v pořadí kácení – dospělé, mladé, souše (bez vyhrazených jinou
   * stavbou); `log` = dospělý strom, dá kládu na hromadu u lesa.
   */
  fell: { id: number; log: boolean }[];
  /** Kolik stromů z `fell` padlo. */
  felled: number;
  /** Práce pálení (člověkodny); kácení s kameny je zbytek `foundingCost`. */
  burnCost: number;
  /** Den pádu posledního stromu – od něj schnou větve; chybí, dokud se kácí. */
  felledDay?: number;
}

export interface FieldPart {
  id: number;
  fieldId: number;
  areaM2: number;
  distanceM: number;
  naturalFertility: number; // 0–100 z krajiny
  fertilityShare: number; // aktuální úrodnost / přirozená, 0–1 (naplavenina povodně až 1,3)
  bonusUntilDay: number | null; // do kdy platí bonus vymýceného lesa (FOREST_BONUS)
  state: PartState;
  sownYears: number; // kolik let v řadě oseto
  /** Co je na osetém dílu zaseto; chybí u dílů mimo osev a u starších vsí (= jař). */
  crop?: Crop;
  /**
   * Rok sklizně posledního lnu na dílu (fields.md – Len; Martin 9. 11. 2026: „Tam, kde už jednou
   * rostl, se může vrátit až po 6 nebo 7 letech“): len se na díl vrátí nejdřív za
   * `FLAX.returnYears` let. Zapíše `rotateAfterSeason` 1. 9. po osetém lnu (i nevytrhaném).
   * Chybí = len tu nerostl nebo ves uložená dřív – len smí hned.
   */
  flaxYear?: number;
  fallowSinceDay: number | null; // od kdy leží v přílohu
  foundingCost: number; // člověkodny (povrch × plocha + překážky)
  foundingDone: number;
  surface: FieldSurface; // povrch při založení
  /**
   * Čtverec pole, který díl zabírá – políčko krajiny, u natočeného pole čtverec v mřížce pole
   * (`Field.grid`).
   */
  cell?: TileCell;
  /** Překážky na čtverci (id z vrstvy překážek) – zmizí z krajiny, až osadníci díl založí. */
  obstacles?: number[];
  /** Dospělé stromy mezi překážkami – po založení dílu dají klády na hromadu (forest.md). */
  trees?: number;
  /**
   * Klučení lesa po fázích (forest.md – Klučení lesa pro pole – postup): jen díl v lese
   * založený od zavedení fází; díl s `clearing` nemá `trees` – klády dávají stromy při pádu.
   */
  clearing?: PartClearing;
  /** Den dohoření ohně na dílu (doutnání, panel). */
  burnedDay?: number;
  /**
   * Vzdálenost chůze z nejbližšího obydlí po vyšlapaných pěšinách (m, paths.md – Pěšiny a práce):
   * po pěšině se chodí rychleji, nikdy víc než `distanceM`. Přepočítá se se změnou rozložení vsi
   * (`refreshWalkDistances`); chybí u vsí uložených dřív a bez krajiny (= `distanceM`).
   */
  walkDistanceM?: number;
  /**
   * Na díl se nedojde – leží za vodou a mapa nemá brod (paths.md – Odhad vzdáleností, Jen brodem;
   * Martin 14. 11. 2026): ves ho neobdělává a zaroste jako každý příloh (fields.md – Zarůstání).
   * Nastaví ho `refreshWalkDistances` místo `walkDistanceM`; chybí = dojde se.
   */
  unreachable?: true;
  /**
   * Roky přílohu bez pastvy a seče (fields.md – Zarůstání): přibývají 1. 11. za každé vegetační
   * období, kdy díl stáda nespásla a ves neposekla; pastva nebo seč je ve fázi louky vynuluje, od
   * křovin už ne. Chybí = 0 (díly mimo příloh, vsi uložené dřív).
   */
  overgrowthYears?: number;
  /**
   * Příloh, ze kterého se díl letos vrací do osevu (od kdy ležel ladem a roky bez pastvy) – kdyby
   * ho ves z letošní práce vyřadila (nezasetá jař na konci okna – `returnPart`), vrátí se do
   * přílohu, jak byl (fields.md – Osevní postup po dílech, bod 2). Smaže se na konci hospodářského roku; chybí = díl se nevrací.
   */
  fallowBeforeSeason?: { sinceDay: number | null; overgrowthYears?: number };
  /**
   * Opuštěný díl (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“): trvalý příloh, který se už
   * neoseje – zarůstá podle Zarůstání (pastva a seč ve fázi louky ho drží loukou), po 30 letech
   * z pole vypadne. Osetý díl se opustí až po žních (`rotateAfterSeason` 1. 9.). Chybí = díl je
   * v osevním postupu (vsi uložené dřív).
   */
  abandoned?: true;
  /**
   * Na dílu leží drn – louka, kterou ves se spřežením založila bez motyky (oxen.md – Jen rádlo):
   * rozorá ho až první orba (`PLOUGH_SOD_FACTOR`), bez spřežení ho rozruší motyka jako vrácení
   * louky. Smaže se na konci hospodářského roku, ve kterém byl díl v osevu; chybí = drn není.
   */
  sod?: true;
  /**
   * Kolik čtverce dílu berou pevné cesty (m² – roads.md a fields.md, Cesta přes pole): pás cest,
   * plácky rozcestí a kousky oddělené cestou, které zůstaly loukou. Už je odečtené z `areaM2`
   * (`giveWayToRoads`) – cesta, která zaroste nebo se přesune, půdu vrátí. Chybí = nic.
   */
  roadM2?: number;
  /**
   * Oddělené kousky dílu, které zůstaly loukou (`roadLand` – řádky buněk po ROAD_LAND.cells
   * bitech) – scéna na nich nekreslí obilí ani obtisk pole. Chybí = žádné.
   */
  roadCut?: number[];
}
/**
 * Les vsi (fields.md – Zarůstání, Les vsi): čtverec pole, který zarostl lesem a z pole vypadl. Les
 * dál roste – dospělé stromy na něm přibývají se stářím (VILLAGE_WOOD) a jde je kácet na dřevo;
 * pole na čtverci ho vymýtí jako les, ostatní stavby ho vyklučí jako les krajiny – les, ze kterého
 * stavby odstranily všechny stromy, zmizí (`dropClearedWoods`). Prasatům je lesem, stádům
 * pastvinou už není.
 */
export interface VillageWood {
  /** Čtverec dílu – políčko krajiny, u lesa z natočeného pole čtverec v jeho mřížce (`grid`). */
  cell: TileCell;
  /** Mřížka pole, ze kterého les vyrostl (natočené pole); chybí = mřížka krajiny. */
  grid?: SquareGrid;
  /**
   * Střed políčka ve světě (m) – stromy lesa stojí kolem něj (`woodTreeSpots`). Chybí ve vsi
   * simulované bez krajiny (testy) – les pak stromy nemá.
   */
  x?: number;
  z?: number;
  /** Plocha dílu, ze kterého les vyrostl (m², bez skalních výchozů). */
  areaM2: number;
  /** Povrch dílu při založení – les na louce ubere pastvu, les v lese vrátí les prasatům. */
  surface: FieldSurface;
  /** Den, kdy díl z pole vypadl – les byl tehdy starý OVERGROWTH_STAGES (30 let). */
  day: number;
}
/** Pole – jeho čtverce jsou políčka jeho dílů (`FieldPart.cell`). */
export interface Field {
  id: number;
  /**
   * Vlastní natočená mřížka pole (fields.md – Natočené stavby): díly jsou čtverce v ní. Chybí =
   * mřížka krajiny (díl = políčko) – všechna pole z doby před natáčením.
   */
  grid?: SquareGrid;
  /** @deprecated Obrys z prvního prototypu (pole se kreslila volným obrysem) – jen staré vsi. */
  outline?: [number, number][];
}
/** Čtverec pohřebiště – políčko krajiny, jeho střed ve světě (m) a vzdálenost od vody. */
export interface CemeterySquare {
  /** Čtverec v mřížce hřbitova (`Cemetery.grid`); bez ní políčko krajiny. */
  cell: TileCell;
  /** Střed čtverce ve světě (m). */
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
  /**
   * Natočená mřížka hřbitova (fields.md – Natočené stavby, cemetery.md) – čtverce jsou v ní; bez
   * ní mřížka krajiny (čtverec = políčko). Rozšíření jde jen v téže mřížce.
   */
  grid?: SquareGrid;
  /** Strana čtverce (m) – vzdálenost od obydlí se měří k okraji čtverce. */
  squareSizeM: number;
  /**
   * Pohřbení – kolik lidí tu leží. Hroby uložené před mohylami (`graves` − `mounds.length`, staré
   * hroby) leží po jednom místě na prvních místech po řadách (cemetery.md – Mohyly podle významu).
   */
  graves: number;
  /**
   * Mohyly pohřbených od zavedení mohyl podle významu (cemetery.md) – místo, velikost, den a druh;
   * u hřbitovů uložených dřív chybí (jen staré hroby).
   */
  mounds?: GraveMound[];
  /** Den dokončení (vytyčení a ohrazení); dokud se zakládá, null. */
  builtDay: number | null;
  /**
   * Chátrání pleteného plotu (abandonment.md): ke hřbitovu, kam nikdo nechodí, plot chátrá
   * a rozpadne se – hroby zůstávají a pohřbívá se dál. Chybí = celý plot.
   */
  fenceWear?: StructureWear;
  /**
   * Den, kdy pokřtěný rod začal hřbitov bourat (christianity.md – Co křest rodu umožní) – od té
   * doby se na něj nepohřbívá. Chybí = slouží.
   */
  disusedDay?: number;
}
/**
 * Druh pohřbeného (cemetery.md – Mohyly podle významu): vojvoda a jeho žena (`voivode`), ostatní
 * dospělí a děti vojvodovy rodiny (`manor-adult`, `manor-child` – domácnost dvorce), zasloužilá
 * hlava rodiny, ostatní dospělí a dítě (zemřelé v dětském věku). `manor` = celá vojvodova rodina
 * podle prvního pravidla (19. 10. 2026, před odstupňováním) – jen v mohylách uložených tehdy.
 */
export type GraveRank =
  'voivode' | 'manor-adult' | 'manor-child' | 'manor' | 'head' | 'adult' | 'child';
/** Velikost mohyly – kolik míst na hroby zabere (`MOUND_SIZES` v rules.ts). */
export type MoundSize = 'great' | 'large' | 'normal' | 'small';
/**
 * Mohyla na hřbitově (cemetery.md – Mohyly podle významu): čtverec hřbitova (v jeho mřížce), první
 * místo mřížky 7 × 8 (sloupec, řada) a velikost – zabere `MOUND_SIZES[size]` míst od něj; den
 * pohřbu a druh pohřbeného. Velikost je menší než druhu, když se větší mohyla nevešla.
 */
export interface GraveMound {
  cell: TileCell;
  column: number;
  row: number;
  size: MoundSize;
  rank: GraveRank;
  day: number;
  /**
   * Obřad: `inhumation` = kostrový hrob křesťana (christianity.md – Pohřby) – bez mohyly, zabere
   * jedno místo (`size` 'small'); chybí = žárový pohřeb pod mohylou (pohané a hroby uložené dřív).
   */
  rite?: 'inhumation';
  /**
   * Domácnost (id obydlí) zemřelého v den pohřbu – odtud vychází pohřební průvod ve scéně
   * (cemetery.md – Pohřeb ve scéně). Mohyly uložené dřív ho nemají (průvod pak vyjde od obydlí
   * nejblíž k brance hřbitova); bez člověka (testy) taky ne.
   */
  from?: number;
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
  /**
   * Chůze z nejbližšího obydlí po pěšinách a pevných cestách (m – roads.md, jako díl pole); bez
   * krajiny (kalibrace) chybí – práce se počítá z `distanceM`.
   */
  walkDistanceM?: number;
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
  /**
   * Čtverec na teplém jižním svahu prémiové krajiny (premium-landscapes.md – Teplé jižní svahy):
   * úroda × PREMIUM_EFFECTS.southSlopeOrchard (`markSunnyOrchards`). Jinde chybí.
   */
  sunny?: true;
  /**
   * Obnova (orchard.md – Obnova sadu): id stavby obnovy, do které vesničané čtverec zařadili.
   * Dokud na něj práce nedojde, stojí staré stromy (`plantedDay` výsadby, ze které rostou);
   * s první prací se staré stromy skácí a čtverec se sází znovu (`plantedDay` null, výsadba
   * bez překážek). Po výsadbě údaj zmizí. U ostatních čtverců chybí.
   */
  renewal?: number;
  /**
   * Kolik náletových stromků už na čtverci opuštěného sadu vyrostlo (wild-orchard.md, návrh
   * Clauda – demolition.md); strop ORCHARD_WILD.maxPerSquare. Chybí = žádný.
   */
  wild?: number;
}
/**
 * Náletový strom opuštěného sadu (demolition.md – Rozhodnutí; orchard.md – Zdivočelý sad): jabloň
 * ze spadaných plodů, nebo jiná dřevina z okolí. Je to herní strom jako strom lesa vsi (překážka,
 * dřevo na stavby) a přežije zánik čtverce sadu – z opuštěného sadu zbyde neuspořádaný les.
 * Id leží nad stromy lesa vsi (WILD_TREE_ID_BASE).
 */
export interface WildTree {
  id: number;
  /** Sad, ze kterého nálet vyrostl – vrácení nebo zbourání sadu nálet odstraní. */
  orchardId: number;
  x: number;
  z: number;
  /** Jabloň (jinak jiná dřevina – bříza, osika, dub, buk podle id). */
  apple: boolean;
  /** Den, kdy strom vyrostl. */
  day: number;
}
/** Jabloňový sad – souvislá skupina čtverců (orchard.md). */
export interface Orchard {
  id: number;
  squares: OrchardSquare[];
  /**
   * Vlastní natočená mřížka sadu (fields.md – Natočené stavby): čtverce jsou v ní. Chybí =
   * mřížka krajiny (čtverec = políčko).
   */
  grid?: SquareGrid;
  /**
   * Hospodářský rok sadu (rok jeho jara), ve kterém vesničané naposledy zařadili čtverce do
   * obnovy – za rok sadu jen jednou (orchard.md – Obnova sadu). Chybí = ještě nikdy.
   */
  renewedSeason?: number;
  /**
   * Den pokynu „Opustit“ (demolition.md – Opuštění): sad se neošetřuje, nesklízí ani neobnovuje,
   * stromy dožijí stářím. Chybí = používá se.
   */
  disusedDay?: number;
}
/** Sezónní práce v sadech celé vsi – sklizeň (září–říjen), nebo péče (prosinec–únor). */
export interface OrchardWork {
  task: 'harvest' | 'care';
  /** Potřebné a hotové člověkodny. */
  required: number;
  done: number;
  /** Sklizeň: kg jablek při plné sklizni (péče 0). */
  yieldKg: number;
  /**
   * Sklizeň zkrácená na cíl ovoce (orchard.md – Práce; `orchardSeasonDay`): díl úrody stromů, který
   * se sklízí (0–1) – zábor čtverce ubere úrodu i práci sklizně jen tímto dílem
   * (`shrinkOrchardWork`). Chybí = celá úroda.
   */
  share?: number;
  /**
   * Odnos jablek, který převzaly vozy (orchard.md – Jablka vozem; čd sklizně) – nejvýš
   * ORCHARD.harvestCarryShare sklizně na čtvercích, kam vůz dojede. Chybí = 0.
   */
  hauled?: number;
  /** Kam vůz při sklizni dojede (dvoukolák, čtyřkolák – `cartReach4`); chybí = ještě ne. */
  cartReach?: CartReach;
  cartReach4?: CartReach;
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

/**
 * Humno (production-chains.md – Humno): udusaná a vymazaná mlatová plocha s přístřeškem, kterou
 * staví hráč – půdorys HUMNO.sizeM natočený jako obydlí (`position`). Id = id stavby humna; dokud
 * se staví, `builtDay` je null.
 */
export interface ThreshingFloor {
  id: number;
  position: Position;
  builtDay: number | null;
  /**
   * Den pokynu „Opustit“ (demolition.md – Opuštění): od něj se na humně nemlátí, ale stojí. Chybí =
   * používá se. Vrátit = záznam smazat.
   */
  disusedDay?: number;
  /**
   * Dnes nebo od poslední roční kontroly (1. 11.) se na humně mlátilo – kontrola údaj smaže
   * (demolition.md – Chátrání humna). Chybí = od kontroly se nemlátilo.
   */
  threshed?: true;
  /**
   * Den, od kterého se na humně nemlátí (opuštěné od pokynu, jinak od roční kontroly, která
   * rok bez výmlatu zjistila): po ABANDONMENT.overgrowYears let zaroste trávou. Chybí = mlátí se.
   */
  idleSince?: number;
}

/**
 * Stav obilné jámy (production-chains.md – Obilné jámy): zapečetěná se zrnem (není vidět),
 * otevřená – jí se z ní (je vidět a jde označit), prázdná – čeká na další sklizeň.
 */
export type GrainPitState = 'sealed' | 'open' | 'empty';

/**
 * Obilná jáma (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „na příhodném místě obilné
 * jámy po sklizni vykopou, naplní obilím a utěsní/zamaskují“): vesničané ji vykopou u humna,
 * naplní vymláceným zrnem a zapečetí; během roku otvírají jednu jámu po druhé a zrno z ní
 * spotřebovávají. Prázdná jáma se příští sklizní naplní znovu, po GRAIN_PITS.lifeYears od
 * vykopání se zasype. Id z `VillageState.nextId`.
 */
export interface GrainPit {
  id: number;
  /** Střed jámy ve světě (m, na cm). */
  x: number;
  z: number;
  /** Kolik zrna se do jámy vejde (kg). */
  capacityKg: number;
  /** Zrno v jámě (kg). */
  grainKg: number;
  state: GrainPitState;
  /** Den, kdy jámu vykopali – po GRAIN_PITS.lifeYears se prázdná zasype. */
  dugDay: number;
  /**
   * Den, kdy jámu naposledy naplnili a zapečetili – otvírá se ta, která je zapečetěná nejdéle;
   * prázdná ho nemá.
   */
  filledDay?: number;
  /**
   * Den pokynu „Opustit“ (demolition.md – Opuštění): jáma je vyprázdněná, nepoužívá se a po
   * ABANDONMENT.overgrowYears letech se zasype. Chybí = používá se.
   */
  disusedDay?: number;
}

/**
 * Ukládání vymláceného obilí do jam (production-chains.md – Obilné jámy): co z vymláceného zrna
 * ještě čeká na humně, kolik práce už vesničané vložili do další dávky (vykopat jámu, vypálit ji,
 * nanosit do ní zrno a zapečetit) a kde kopou novou jámu.
 */
export interface GrainPitWork {
  /** Vymlácené obilí, které čeká na uložení do jam (kg – část zásob mimo jámy). */
  queueKg: number;
  /** Práce vložená do další dávky (člověkodny). */
  manDays: number;
  /** Nová jáma, kterou vesničané kopou – id (z `nextId`) a místo; chybí, když se plní stará. */
  site?: { id: number; x: number; z: number };
  /**
   * Rok, kdy pro novou jámu nebylo vhodné místo (do 180 m od humna) – letos se nové jámy nekopou,
   * zrno navíc zůstane mimo jámy; chybí = místo se hledá.
   */
  noSiteYear?: number;
}

/** Plodina, jejíž snopy se mlátí – ozim, jař a luštěniny (len se nemlátí – fields.md, Len). */
export type ThreshedCrop = Extract<Crop, 'winter' | 'spring' | 'legume'>;

/**
 * Nevymlácené snopy vsi (production-chains.md – Humno): zrno ve snopech (kg čisté úrody – obilí
 * ozimu i jaře dohromady, luštěniny zvlášť) a zbývající práce výmlatu po plodinách (člověkodny na
 * humně – sklizená část práce `thresh` plánu). Výmlat převádí snopy do zásob podílem postupu práce
 * svého druhu (obilí, luštěniny).
 */
export interface Sheaves {
  grainKg: number;
  legumesKg: number;
  /** Zbývající práce výmlatu po plodinách; chybí = žádná. */
  work?: Partial<Record<ThreshedCrop, number>>;
  /**
   * Práce `work` je podle kg snopů (production-chains.md – Humno, Práce výmlatu podle snopů; D95) –
   * sklizeň od 18. 11. 2026 a převod `sheaf-work-by-kg`. Jen u snopů s prací; chybí – práce podle
   * plochy (snopy uložené dřív), nebo práce žádná.
   */
  byKg?: true;
}

/** Hotová dřevěná modla nebo svatyně (happiness.md). */
export interface SacredBuilding {
  id: number;
  kind: SacredBuildingKind;
  position: Position;
  builtDay: number;
  /** Chátrání opuštěné stavby (abandonment.md); chybí = celá. */
  wear?: StructureWear;
  /**
   * Den pokynu „Opustit“ (demolition.md – Opuštění): od něj se stavba nepoužívá, ale stojí. Chybí =
   * stavba se používá. Vrátit stavbu = záznam smazat.
   */
  disusedDay?: number;
}

/**
 * Stavby, které chátrají, když k nim léta nikdo nechodí (abandonment.md): modla, svatyně, plot
 * hřbitova a ohrada.
 */
export type AbandonedStructure = 'idol' | 'shrine' | 'cemetery-fence' | 'pen';

/**
 * Stavby, které jde opustit a vrátit (demolition.md – Opuštění); hřbitov jen zbourat, a to jen
 * pokřtěný rod (christianity.md – Co křest rodu umožní).
 */
export type UsableStructure =
  'dwelling' | 'pen' | 'idol' | 'shrine' | 'threshing-floor' | 'grain-pit' | 'orchard' | 'cemetery';

/**
 * Chátrání stavby (abandonment.md – Chátrání): stav 0–1 a od kdy je stavba opuštěná. Opuštěná
 * stavba ztrácí stav rovnoměrně (`ABANDONMENT.fallYears` od plného stavu do pádu); když se k ní
 * lidé znovu začnou chodit, `abandonedDay` zmizí a chátrání se zastaví – stav pak roste jen
 * s prací opravy (abandonment.md – Oprava, stavba `repair`); opravená stavba záznam nemá.
 */
export interface StructureWear {
  /** Stav 0–1 v den `abandonedDay` (opuštěná stavba), jinak trvale. */
  condition: number;
  /** Den roční kontroly cest, která zjistila, že sem nikdo nechodí; chybí = navštěvovaná. */
  abandonedDay?: number;
}

/**
 * Zbytek padlé modly nebo svatyně (abandonment.md – Následky): padlá modla na zemi, ze svatyně
 * zarůstající příkop. Jen vzhled – zarůstá `ABANDONMENT.remnantYears` let a zmizí, stavba přes něj
 * ho odstraní.
 */
export interface SacredRuin {
  id: number;
  kind: SacredBuildingKind;
  position: Position;
  /** Den pádu – od něj zbytek zarůstá. */
  day: number;
}

/** Změna krajiny sídla nad vygenerovanou vrstvou překážek – id překážky a den. */
export interface ObstacleChange {
  id: number;
  day: number;
  /**
   * Pokácený strom: den, kdy na pařez někdo zasadil mladý strom (uhlíř buk – crafts.md, Uhlíř).
   * Sazenice je hned mladý stromek a dospěje za BEECH_PLANTING.matureYears; bez údaje strom
   * dorůstá z náletu (TREE_SAPLING_AFTER_YEARS, TREE_REGROWTH_YEARS).
   */
  planted?: number;
}
