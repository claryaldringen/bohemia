// Typy stavu vsi – Stavby, dřevo a roční plán prací.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { ChronicleFortGate } from './types-chronicle';
import type { Craft } from './types-crafts';
import type { ChurchSite } from './types-masonry';
import type { FortBuildWork, FortSegmentWork } from '../fortification/types';
import type { WallKind } from './types-fortifications';
import type { AbandonedStructure, Crop, UsableStructure } from './types-land';
import type { HorseGood } from './types-trade';
import type { TradedHorse } from './types-livestock';
import type { DwellingPlot, DwellingType, Position } from './types-people';
import type { CartDrive, RoadGrade } from './types-roads';

export type ConstructionKind =
  | 'dwelling'
  | 'rebuild'
  | 'field'
  | 'cemetery'
  | 'orchard'
  /** Dřevěná modla a svatyně (happiness.md) – stavba se polohou v `position`. */
  | SacredBuildingKind
  /** Ohrada s přístřeškem (oxen.md) – čtverec v `penId`. */
  | 'pen'
  /** Rádlo pro výcvik spřežení v ohradě `penId` (oxen.md – 1 strom a 5 člověkodní). */
  | 'ard'
  /** Vylepšení pevné cesty `roadIds` na stupeň `roadGrade` (roads.md – Vylepšení cesty). */
  | 'road'
  /** Výsadba jabloní podél pevné cesty `roadIds` (roads.md – Vysazení jabloní). */
  | 'road-apples'
  /**
   * Humno (production-chains.md – Humno) – stavba se polohou v `position`; humno má id stavby
   * (`VillageState.threshingFloors`).
   */
  | 'threshing-floor'
  /**
   * Oprava stavby, ke které se zase chodí (abandonment.md – Oprava): modla, svatyně, plot
   * hřbitova a ohrada v `repair` – vesničané ji založí sami ze společné práce.
   */
  | 'repair'
  /**
   * Opevnění (fortifications.md – Cena a stavba): stavba, vylepšení nebo nástavba opevnění
   * `fortificationId` po úsecích (`fortSegments`) – co dělá, říká `fortWork`.
   */
  | 'fortification'
  /**
   * Bourání stavby (demolition.md – Bourání): společná práce vsi, po dokončení stavba zmizí a dá
   * klády na hromadu u cesty – co se bourá, říká `demolition`.
   */
  | 'demolition'
  /** Lom na skalním výchozu `quarryOutcrop` (fortifications.md – Kámen) – poloha v `position`. */
  | 'quarry'
  /** Lámání `stoneOrderM3` m³ kamene do zásoby v lomu `quarryOutcrop` (fortifications.md – Kámen). */
  | 'quarrying'
  /** Kostel (churches.md – Stavba) – typ, rozměry a postup v `church`, střed lodi v `position`. */
  | 'church';
/**
 * Co může vzít půdu poli (fields.md – Pole jako krajina; Martin 18. 10. 2026): obydlí (i dílna),
 * sad, hřbitov, ohrada, modla, svatyně, jabloně u cesty a stromy u cesty – cokoli kromě pole.
 */
export type LandTaker =
  | 'dwelling'
  | 'orchard'
  | 'cemetery'
  | 'pen'
  | 'idol'
  | 'shrine'
  | 'road-apples'
  | 'road-trees'
  /** Pevná cesta přes pole – pás, rozcestí a oddělené kousky (roads.md – Cesta přes pole). */
  | 'road'
  /** Humno (production-chains.md – Humno). */
  | 'threshing-floor'
  /** Val s příkopem (fortifications.md – Obvod: val díl pole nebo sadu pod sebou vezme). */
  | 'fortification'
  /** Kostel s hřbitůvkem (churches.md – Stavba). */
  | 'church';
/** Posvátná stavba, kterou staví hráč (happiness.md). */
export type SacredBuildingKind = 'idol' | 'shrine';
/**
 * Platba za koně nové ohrady koní (horses.md – Koně se stavbou ohrady): hřivny (kg), krávy, prodaní
 * koně a obilí a luštěniny (kg) z přebytku nad pojistkou.
 */
export interface HorsePenPayment {
  ironBarsKg: number;
  cows: number;
  /** Kolik koní kterého druhu se prodalo, a kteří to byli (vrácení při zrušení). */
  horseCounts: Partial<Record<HorseGood, number>>;
  horses: TradedHorse[];
  grainKg: number;
  legumesKg: number;
}

export interface Construction {
  id: number;
  kind: ConstructionKind;
  startedDay: number;
  cost: number;
  done: number;
  dwellingType: DwellingType | null;
  position: Position | null; // dwelling, idol, shrine, threshing-floor
  /** Nové obydlí na pozemku – obydlí ho po dostavění převezme (u volných obydlí chybí). */
  plot?: DwellingPlot;
  /** rebuild: přestavované obydlí; dwelling: domácnost zakladatelů (první zemnice), jinak null. */
  dwellingId: number | null;
  fieldId: number | null; // field – zakládá díly od nejbližšího
  /**
   * Pole v lese (forest.md – Klučení lesa pro pole – trasy): překážky dílů, které už dohořely – pro
   * trasy chodců a vozů stojí dál jako les, dokud stavba pole neskončí (`clearingRouteObstacles`).
   * U ostatních staveb a polí bez dohořelého dílu chybí.
   */
  burntObstacles?: number[];
  cemeteryId?: number | null; // cemetery (u starších staveb chybí)
  orchardId?: number | null; // orchard – vysazuje čtverce od nejbližšího (u ostatních chybí)
  /**
   * Obnova sadu (orchard.md – Obnova sadu): stavbu založili vesničané sami a sází znovu jen
   * čtverce s `OrchardSquare.renewal` = id stavby. U výsadby a ostatních staveb chybí.
   */
  renewal?: true;
  /** Ohrada – stavba ohrady a rádlo pro její spřežení (oxen.md); u ostatních chybí. */
  penId?: number | null;
  /**
   * Čím ves zaplatila koně nové ohrady koní (horses.md – Koně se stavbou ohrady); při zrušení
   * stavby se vrátí přesně to.
   */
  horsePenPaid?: HorsePenPayment;
  /**
   * Vylepšení pevné cesty (roads.md): úseky (rozdělení úseku přidá i nový) a stupeň, na který se
   * vylepšují; u ostatních staveb chybí.
   */
  roadIds?: number[];
  roadGrade?: RoadGrade;
  /**
   * Stavba zemské stezky (trade.md – Zemská stezka): id stezky – úseky stavby jsou úseky stezky
   * (`Trail.pieces`) se svým stupněm a prací, staví se po úsecích od vsi ven. Jen u stavby `road`.
   */
  trail?: number;
  /**
   * Stavba vozové cesty (roads.md – Vozová cesta): id zemních prací (`VillageRoads.earthworks`) –
   * úseky se staví od vsi ven, hotový úsek je hned pevná cesta stupně `wagon`. Jen u stavby `road`.
   */
  earthwork?: number;
  /** Dřevo obydlí, přestavby, modly a svatyně (forest.md); u starších staveb a polí chybí. */
  wood?: ConstructionWood;
  /** Nové obydlí: vzdálenost k nejbližšímu okraji lesa (m) – obydlí ji po dostavění převezme. */
  forestDistanceM?: number;
  /** Nová řemeslná dílna (crafts.md) – obydlí po dostavění převezme řemeslo; jinak chybí. */
  craft?: Craft;
  /** Rozestavěné obydlí s dnešním tvarem (jako `Dwelling.plainShape`) – obydlí ho převezme. */
  plainShape?: true;
  /** Nová dílna: vzdálenost k potoku (m) – dílna ji po dostavění převezme. */
  waterDistanceM?: number;
  /**
   * Nový dům domácnosti (migration.md, demolition.md – Správce): id domácnosti (= id jejího
   * obydlí), která si nové obydlí staví a po dostavění se do něj přestěhuje. Jen u stavby
   * `dwelling`, u ostatních staveb chybí. Bez `replaces` (rozestavěné přestěhování ze starší vsi)
   * zůstane starý dům stát prázdný.
   */
  relocates?: number;
  /**
   * Náhrada domu správcem (demolition.md – Správce): po dostavění a přestěhování domácnosti
   * `relocates` se starý, už prázdný dům zbourá (`startDemolition`). Jen spolu s `relocates`.
   */
  replaces?: true;
  /**
   * Oprava stavby (abandonment.md – Oprava): která stavba a z jakého stavu se opravuje – stav
   * stavby roste s prací. Jen u stavby `repair`, u ostatních chybí.
   */
  repair?: StructureRepair;
  /** Bourání (demolition.md): která stavba se boří; jen u stavby `demolition`. */
  demolition?: DemolitionTarget;
  /**
   * Stavba rozšiřuje už stojící pole, ohradu nebo hřbitov (ne vlastní nová entita) – značka
   * „postavil správce“ pak nepřejde na celek (steward.md – Stav správce). Jinak chybí.
   */
  extends?: true;
  /** Opevnění (fortifications.md), které stavba `fortification` staví; u ostatních chybí. */
  fortificationId?: number;
  /** Co stavba opevnění dělá – stavba, vylepšení, nástavba, přestavba, obnova valu. */
  fortWork?: FortBuildWork;
  /**
   * Cílový druh hradby vylepšení nebo hradby na valu (fortifications.md – Hradby a obrana, Druhy
   * a postup vylepšení). Chybí = starší stavby: `upgrade` na palisádu, `top` = `Fortification.top`.
   */
  fortTarget?: WallKind;
  /** Stavba u brány (`fortWork` `gate`): úsek brány a klešťová brána, nebo věž. Jinak chybí. */
  fortGate?: { segment: number; level: 'pincer' | 'tower' };
  /**
   * Úseky stavby opevnění v pořadí práce (od brány nejblíž dvorci po směru hodin) a práce každého
   * (čd). Práce stavby jde napřed do kácení dřeva (`wood`), pak do úseků jeden po druhém – úsek je
   * hotový, když práce stavby přejde jeho konec (`workFortification`).
   */
  fortSegments?: FortSegmentWork[];
  /**
   * Zboření úseku opevnění (`fortWork` `demolish`): střed úseku (m) – klády zboření jdou na
   * hromadu u cesty nejblíž (`addLogs`). U ostatních staveb chybí.
   */
  fortLogsAt?: { x: number; z: number };
  /**
   * Zboření či srovnání úseku opevnění – zápis do kroniky z rozkazu (demolition.md – Opevnění;
   * Martin 14. 11. 2026: „Vojvoda Lutobor přikázal zbořit 26 loktů opevnění od severní brány
   * k věži.“): jméno vojvody v den rozkazu, délka kusů (m) a brány na koncích úseku. U ostatních
   * staveb a starších zboření chybí.
   */
  fortNote?: {
    lord?: string;
    lengthM: number;
    gates?: [ChronicleFortGate, ChronicleFortGate];
    around?: true;
  };
  /**
   * Lom (fortifications.md – Kámen): stavba lomu (`quarry`) a lámání do zásoby (`quarrying`) –
   * id skalního výchozu, na kterém lom stojí; lámání nese i množství (m³).
   */
  quarryOutcrop?: number;
  stoneOrderM3?: number;
  /** Kámen, který stavba hradby vzala z hromad (m³) – zrušení vrátí nezabudovaný podíl. */
  stoneFromPile?: number;
  /**
   * Kámen hradby lámaný na zakázku (fortifications.md – Kámen, Nošení kamene a vůz): lom (id
   * výchozu), kolik m³, vzdušná vzdálenost lomu od středu stavby (m) a ten střed – lámání a nošení
   * je v práci úseků. Stavba ze starší vsi (příplatek za vzdálenost) a bez kamene z lomu ho nemá.
   */
  fortStone?: {
    outcropId: number;
    m3: number;
    distanceM: number;
    at: { x: number; z: number };
  };
  /**
   * Jízda vozu s kamenem z lomu ke stavbě (wagons.md – Co vozy vozí, bod 5; kostel, hradba,
   * zásoba): spočítá se při první úvaze o voze a uloží (null = vůz nedojede). Jinak chybí.
   */
  stoneCart?: CartDrive | null;
  /** Staveniště kostela (churches.md – Stavba); jen u stavby `church`. */
  church?: ChurchSite;
}
/**
 * Oprava stavby (abandonment.md – Oprava): druh a id stavby (modla a svatyně – id stavby,
 * hřbitov, ohrada) a stav, ze kterého oprava začala. Práce stavby = plná oprava × (1 − `from`).
 */
/** Zbourání se týká stavby – druh a id (jako `UsableRef` ze structure-use.ts). */
export interface DemolitionTarget {
  structure: UsableStructure;
  id: number;
}
export interface StructureRepair {
  structure: AbandonedStructure;
  id: number;
  /** Stav 0–1 v den zahájení opravy (spadlý plot hřbitova 0). */
  from: number;
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
  /** Dovoz klád, který převzaly vozy (wagons.md – Vůz; člověkodny kácení); chybí = 0. */
  hauled?: number;
  /**
   * Ke kterým stromům (v pořadí `fell`) vůz dojede a body jízd – spočítá se při prvním svozu klád
   * (wagons.md). Chybí = ještě ne.
   */
  cartReach?: { trees: boolean[]; points: CartReach['points'] };
  /**
   * Totéž pro čtyřkolák – širší oblouk, na zoraný díl ne (wagons.md – Co se vozí a na čem); chybí
   * = ještě ne.
   */
  cartReach4?: { trees: boolean[]; points: CartReach['points'] };
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
/**
 * Pokrytí potřeby výrobků řemeslníků 0–1 (crafts.md): nástroje od kováře, nádoby od hrnčíře
 * a dřevěné nářadí od tesaře (wagons.md – chybí = 0).
 */
export interface CraftCoverage {
  readonly tools: number;
  readonly pottery: number;
  readonly woodTools?: number;
}
/** Sezónní práce v sadech (orchard.md) – v rozdělení práce vedle polních prací. */
export type OrchardTaskName = 'orchard-care' | 'orchard-harvest';
/** Práce jedné plodiny v ročním plánu – díly, potřebné a odvedené člověkodny po úlohách. */
export interface CropWork {
  /**
   * Díly plodiny v pořadí, ve kterém k nim práce postupuje (fields.md – Postup práce po
   * čtvercích): každá dávka dílů (přidaná na čele práce) nejblíž obydlím první, při
   * shodě podle id; přidané dávky na konec.
   */
  partIds: number[];
  /** Díly, které se letos vracejí z přílohu s prací navíc (v pořadí `partIds`); chybí = žádné. */
  reclaimIds?: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
  harvestedKg: number | null; // úroda ze sklizně do snopů (pro ztrátu nevymláceného 1. 3.)
  /**
   * Červencová žeň plodiny, kterou červenec nedosklidil (fields.md – Žně i v srpnu): 31. 7. šla
   * do snopů úroda `kg` z hotové práce žně `harvest` (člověkodny), zbytek se žne v srpnu a do snopů
   * jde 31. 8. – teprve pak je plodina sklizená (`harvestedKg`). Chybí = 31. 7. nic do snopů nešlo.
   */
  sheaved?: { harvest: number; kg: number };
  /**
   * Osivo, které ves pro plodinu vzala ze zásob při setí (kg – fields.md, Úroda, Osivo ze zásob;
   * Martin 27. 10. 2026): roste se zasetým podílem, sklizeň pak osivo neodečítá. Chybí = práce
   * z doby před osivem ze zásob – převod (`withSeedForgiven`) jí osivo zaseté části odpustí.
   */
  seedKg?: number;
  /**
   * Orba rádlem (oxen.md – Jen rádlo): ves se spřežením orá všechny díly plodiny, nic nekope
   * motykou (`required.dig` 0). Chybí = plodinu kope motyka (ves bez spřežení, plán, který po
   * ztrátě posledního spřežení dokončí motyka, i plány starších vsí).
   */
  plough?: PloughWork;
  /**
   * Odnos snopů, který převzaly vozy (wagons.md – Vůz; člověkodny sklizně) – nejvýš podíl odnosu
   * na dílech, kam vůz dojede. Chybí = 0.
   */
  hauled?: number;
  /** Kam vůz při žni dojede – spočítá se při prvním svozu (wagons.md – Svoz). Chybí = ještě ne. */
  cartReach?: CartReach;
  /** Kam při žni dojede čtyřkolák – jen podél pevných cest. Chybí = ještě ne. */
  cartReach4?: CartReach;
  /**
   * Nošení osiva, které převzaly vozy (wagons.md – Co vozy vozí; člověkodny setí) – nejvýš podíl
   * CART_JOBS.seed.carryShare setí na dílech, kam vůz dojede. Chybí = 0.
   */
  seedHauled?: number;
  /** Kam vůz s osivem dojede – spočítá se při prvním odvozu osiva. Chybí = ještě ne. */
  seedReach?: CartReach;
}
/**
 * Kam vozy na úloze dojedou (wagons.md – Vůz, vozová síť): podíl práce úlohy na místech, kam vůz
 * dojede (0–1), a body jízd s vahou (podíl jízd) – do ročního provozu cest.
 */
export interface CartReach {
  share: number;
  points: { x: number; z: number; weight: number }[];
}
/**
 * Orba jedné plodiny: díly v pořadí orby, potřebné a odvedené člověkodny a váha oraných dílů
 * (plocha × vzdálenost) – setí jde za orbou.
 */
export interface PloughWork {
  partIds: number[];
  required: number;
  done: number;
  /** Váha oraných dílů (ha × příplatek za vzdálenost). */
  weight: number;
  /**
   * Díly s drnem (`hasSod` při plánu – louka založená rádlem, příloh ve fázi louky): orba na nich
   * stojí `PLOUGH_SOD_FACTOR`× víc práce a před orbou jsou pastvinou. Chybí = žádné.
   */
  sodIds?: number[];
  /**
   * Váha dílů kopaných motykou – jen plány starších vsí, kde spřežení oralo jen díly bez drnu
   * a zbytek kopala motyka; chybí = 0.
   */
  digWeight?: number;
  /**
   * Pásy orby v pořadí (oxen.md – Co nejdelší brázda): souvislé řady dílů podél brázdy, které
   * spřežení orá spolu, pruh po pruhu – díly pásu postupují stejně. Chybí = každý díl sám (plány
   * starších vsí).
   */
  bands?: PloughBand[];
  /**
   * Spřežení na poli (oxen.md – Spřežení zůstane na poli): blok (`PloughBand.block`), u kterého je,
   * a cena poslední cesty k němu (m jízdy po louce – vozová síť z ohrady nebo od předchozího bloku,
   * bez krajiny vzdálenost dílů od obydlí). Zapíše se večer dne, kdy spřežení k bloku přijelo
   * a oralo. Chybí = spřežení plodiny je v ohradě.
   */
  trip?: PloughTrip;
}
/** Kde je spřežení plodiny (`PloughWork.trip`). */
export interface PloughTrip {
  block: number;
  costM: number;
  /**
   * Den příjezdu k bloku a odkud – blok (`PloughBand.block`), null = z ohrady. Chybí = starší ves
   * (spřežení u bloku, kde naposled oralo).
   */
  arrived?: { day: number; from: number | null };
  /** Den, kdy se spřežení večer vrátilo do ohrady – od dalšího dne je doma. Chybí = na poli. */
  home?: number;
}
/**
 * Pás orby: díly v řadě podél brázdy (v pořadí podél), osa brázd v mřížce pole (`x` – podél
 * sloupců políček, `y` – podél řad), směr postupu napříč (+1 rostoucí souřadnice, −1 klesající)
 * a blok (souvislé díly pole – pořadí bloku v plodině).
 */
export interface PloughBand {
  partIds: number[];
  axis: 'x' | 'y';
  sweep: 1 | -1;
  block: number;
}
/** Práce jedné plodiny hospodářského roku (fields.md – Osevní postup po dílech). */
export interface SeasonCrop extends CropWork {
  crop: Crop;
}
/**
 * Hospodářský rok 1. 9. – 31. 8. (název `FarmSeason`, protože `Season` je roční období
 * kalendáře): evidence práce dílů po plodinách v pořadí ozim, luštěniny, len, jař – plodina
 * v `crops` je jen, když ji ves má.
 */
export interface FarmSeason {
  startDay: number;
  crops: SeasonCrop[];
  /**
   * Ves letos orá rádlem (oxen.md – Jen rádlo): plán vznikl, když ves měla vycvičené spřežení –
   * ve scéně má pak celé pole kulaté rohy. Zůstane, i když spřežení během roku zmizí a zbytek
   * plánu dokončí motyka. Chybí = ves letos kope motykou (i plány starších vsí).
   */
  ard?: true;
  /**
   * Kolik třeného lnu ves při plánu potřebovala na oděv za rok (kg – fields.md, Len): do ní ves
   * vybírá díly lnu (`turnSelection`) a podle ní se při trhání zapíše, na jaký podíl oděvu len je
   * (`VillageState.linen`). Chybí u plánů starších vsí, plánů z doby lnu na zahrádkách
   * (9. 11. 2026) a plánů mimo 1. 9. (ves založená během roku) – ty len nevybírají a oděv
   * nezapíší.
   */
  flaxNeedKg?: number;
  /**
   * Podíl dne celé cvičící vojvodovy rodiny ve žních po oknech (lord.md – Kdy jde rodina na pole;
   * `lordHarvestHelp`): jen když by ves bez rodiny žně nestihla (červenec, srpen). Přepočet každý
   * den ve žních (`lordHelpDay`). Chybí = 0. Plány starších vsí s pomocí s osevem převod zbaví
   * oken setí (`withoutSowingHelp`).
   */
  lordHelp?: LordHelp;
  /**
   * Výběr dílů z posledního dne, kdy bylo na čele práce místo (fields.md – Postup práce po dílech,
   * výkon): čekající díly. Ve dny bez místa na čele ves nový výběr nedělá
   * a počítá s tímto; platí jen ve stejném měsíci a se stejnými plodinami, které smí začít
   * (`window`). Mimo dny, kdy smí začít díl, chybí; chybí-li, ves vybírá znovu (starší ves taky).
   */
  selection?: {
    window: string;
    waiting: { id: number; crop: Crop }[];
  };
}
/** Osivo po zásobách (kg): obilí (ozim, jař) a luštěniny. */
export interface SeedKg {
  grain: number;
  legumes: number;
}
/** Okna volné práce vsi (`SowingCapacity` bez orby). */
export type LordHelpWindow = 'autumnWinter' | 'autumn' | 'spring' | 'july' | 'august' | 'september';
/** Podíl dne rodiny 0–1 po oknech žní (`HARVEST_HELP_WINDOWS`); okno bez pomoci chybí. */
export type LordHelp = Partial<Record<LordHelpWindow, number>>;
