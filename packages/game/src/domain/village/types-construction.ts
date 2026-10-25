// Typy stavu vsi – Stavby, dřevo a roční plán prací.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { Craft } from './types-crafts';
import type { AbandonedStructure, Crop } from './types-land';
import type { DwellingPlot, DwellingType, Position } from './types-people';
import type { RoadGrade } from './types-roads';

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
  | 'repair';
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
  | 'threshing-floor';
/** Posvátná stavba, kterou staví hráč (happiness.md). */
export type SacredBuildingKind = 'idol' | 'shrine';
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
   * Přestěhování domácnosti (migration.md): id domácnosti (= id jejího obydlí), která si nové
   * obydlí staví a po dostavění se do něj přestěhuje – starý dům zůstane prázdný. Jen u stavby
   * `dwelling`, u ostatních staveb chybí.
   */
  relocates?: number;
  /**
   * Oprava stavby (abandonment.md – Oprava): která stavba a z jakého stavu se opravuje – stav
   * stavby roste s prací. Jen u stavby `repair`, u ostatních chybí.
   */
  repair?: StructureRepair;
}
/**
 * Oprava stavby (abandonment.md – Oprava): druh a id stavby (modla a svatyně – id stavby,
 * hřbitov, ohrada) a stav, ze kterého oprava začala. Práce stavby = plná oprava × (1 − `from`).
 */
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
   * čtvercích): každá dávka dílů (plán k 1. 9., přidané hotové díly) nejblíž obydlím první, při
   * shodě podle id; přidané dávky na konec.
   */
  partIds: number[];
  /** Díly, které se letos vracejí z přílohu s prací navíc (v pořadí `partIds`); chybí = žádné. */
  reclaimIds?: number[];
  required: Record<TaskName, number>;
  done: Record<TaskName, number>;
  harvestedKg: number | null; // čistá úroda ze sklizně (pro ztrátu nevymláceného 1. 3.)
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
/** Obilí, které ves oseje i nad potřebu (fields.md – Osevní postup po dílech, bod 3). */
export type SurplusCrop = 'winter' | 'spring';
/** Práce jedné plodiny hospodářského roku (fields.md – Osevní postup po dílech). */
export interface SeasonCrop extends CropWork {
  crop: Crop;
  /**
   * Díly nad potřebu (fields.md – Osevní postup po dílech, bod 3; jen ozim a jař): všechna jejich
   * práce na poli – příprava půdy, setí, pletí, žně a odnos – jde až po stavbách a opravách
   * obydlí (Martin 25. 10. 2026: „ve chvíli, kdy stavba přijde, prostě vesnice o část úrody
   * přijde“). Chybí = nutné díly (práce proti hladu před stavbami).
   */
  surplus?: true;
}
/**
 * Hospodářský rok 1. 9. – 31. 8. (název `FarmSeason`, protože `Season` je roční období
 * kalendáře): evidence práce dílů po plodinách v pořadí ozim, luštěniny, len, jař, za nimi ozim
 * a jař nad potřebu (`SeasonCrop.surplus`) – plodina v `crops` je jen, když ji ves má.
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
   * Kolik třeného lnu ves při plánu potřebovala na oděv za rok (kg – fields.md, Len): podle toho
   * se při trhání zapíše, na jaký podíl oděvu len je (`VillageState.linen`). Chybí u plánů
   * starších vsí a plánů mimo 1. 9. (ves založená během roku) – ty oděv nezapíší.
   */
  flaxNeedKg?: number;
  /**
   * Podíl dne mužů cvičící vojvodovy rodiny na nutné práci po oknech (lord.md – Kdy jde rodina
   * na pole, bod 1; `lordSowingHelp`): jen když by ves bez rodiny nutnou práci nestihla. Přepočet
   * každý den v oknech (`lordHelpDay`). Chybí = 0 (i plány starších vsí).
   */
  lordHelp?: LordHelp;
}
/** Okna volné práce plánu osevu (`SowingCapacity` bez orby). */
export type LordHelpWindow = 'autumnWinter' | 'autumn' | 'spring' | 'july' | 'august';
/** Podíl dne rodiny 0–1 po oknech; okno bez pomoci chybí. */
export type LordHelp = Partial<Record<LordHelpWindow, number>>;
