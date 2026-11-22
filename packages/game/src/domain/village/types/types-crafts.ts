// Typy stavu vsi – Řemesla, dílny, milíře, rudiště a vozy.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { CartDrive, CartKind } from './types-roads';
import type { Direction8 } from './types-state';

/** Řemeslo dílny (crafts.md): hrnčíř, kovář, uhlíř, tesař (wagons.md – Tesař). */
export type Craft = 'potter' | 'smith' | 'burner' | 'carpenter';
/**
 * Co dílna dělala poslední odsimulovaný den (crafts.md – Co hráč vidí): vyrábí, kácí dřevo na
 * uhlí nebo palivo, čeká na uhlí (kovář), čeká na dřevo (uhlíř a hrnčíř – není co kácet), nemá
 * kdo pracovat (domácnost bez práce po denním minimu), nebo je prázdná. Uhlíř
 * (crafts.md – Uhlíř): kácí a připravuje dřevo (`felling`), staví milíř (`building`), pálí
 * a hlídá ho (`burning`), rozebírá vypálený milíř a nosí uhlí kováři (`drawing`), sází mladé buky
 * (`planting`), nebo má vypálený milíř a uhlí u kováře dost a pomáhá vsi (`resting`). Tesař (wagons.md – Tesař) dnes jen pomáhá stavbám (`helping`).
 */
export type WorkshopActivity =
  | 'producing'
  | 'helping'
  | 'felling'
  | 'building'
  | 'burning'
  | 'drawing'
  | 'planting'
  | 'resting'
  /**
   * Kovář taví v redukční peci železnou houbu z rudy a uhlí – s měchařem, nebo sám polovičním
   * tempem (production-chains.md – Kovář); `refining` překovává houbu na hřivny. Kování nástrojů
   * z hřiven je `producing`.
   */
  | 'smelting'
  | 'refining'
  | 'no-charcoal'
  /** Kovář nemá rudu a není kde ji kopat (crafts.md – Uhlí a ruda kováře). */
  | 'no-ore'
  /**
   * Kovář (a synové) kope rudu na rudišti, hrnčíř hlínu na hliništi (crafts.md – Uhlí a ruda
   * kováře, Hlína hrnčíře).
   */
  | 'digging'
  /** Hrnčíř nemá hlínu a není kde ji kopat (crafts.md – Hlína hrnčíře). */
  | 'no-clay'
  | 'no-wood'
  | 'idle'
  | 'empty'
  /**
   * Jen v souhrnu (`summarizeVillage`): obyvatelé se do dílny nastěhovali dnes po práci dne
   * (dostavění, osídlení prázdného obydlí) – dílna začne zítra; uložená hodnota je `empty`.
   */
  | 'settled';
/**
 * Fáze milíře (crafts.md – Uhlíř, Milíř stojí vždy): kácení a příprava dřeva, stavba, pálení
 * a vypálený milíř, který se rozebírá podle odběru kovářů (`draw`).
 */
export type KilnStage = 'wood' | 'build' | 'burn' | 'draw';
/**
 * Milíř uhlíře – samostatná stavba, jedna dávka buků od výběru po rozebrání (crafts.md – Milíř
 * u skácených buků): stojí na rovném volném místě uprostřed skácených buků (`site` – střed milíře
 * ve světě, m; null jen u vsi bez vrstvy překážek – testy – milíř bez polohy u zemnice). Buky
 * dávky jsou od výběru vyhrazené; kácí se a připravují strom po stromu v pořadí `trees`. Uhlíř
 * smí mít najednou CHARCOAL_BALANCE.maxKilns milíře – jeden se rozebírá, druhý se připravuje nebo
 * pálí (crafts.md – Rovnováha uhlíř – kovář); rozebraný zmizí a zůstane po něm milířiště.
 */
export interface CharcoalKiln {
  /**
   * Id milíře (z `VillageState.nextId` – výběr ve scéně, milířiště); chybí jen u milíře ze starší
   * vsi před převodem (`migrateKilns`).
   */
  id?: number;
  /** Den výběru dávky buků – od něj se měří doba cyklu milíře (`Workshop.kilnCycles`). */
  startDay?: number;
  /**
   * Vyklizení milířiště (crafts.md – Milíř u skácených buků): překážky v kruhu milíře mimo buky dávky
   * (stromy, keře, kameny, pařezy – id z vrstvy i stromy u cest a lesa vsi) a dospělé stromy
   * v pruhu KILN_SITE.crownM kolem něj (koruny), práce za ně (čd) a kolik z nich je dospělých
   * stromů (klády na hromadu). Uhlíř je vyklidí napřed; pak údaj zmizí. Bez údaje není co
   * vyklízet.
   */
  clearing?: { ids: number[]; cost: number; logs: number };
  site: { x: number; z: number } | null;
  /**
   * Buky dávky: id z vrstvy překážek (null = kácení bez polohy – ves bez vrstvy, jen testy)
   * a práce za skácení a dovoz k milíři (člověkodny, i se vzdáleností).
   */
  trees: { id: number | null; cost: number }[];
  stage: KilnStage;
  /** Kolik buků dávky je skácených a připravených (fáze `wood`). */
  prepared: number;
  /**
   * Práce odvedená v rozdělané části fáze (čd; u buku kácení a pak příprava), u pálení dny;
   * u vypáleného milíře 0.
   */
  done: number;
  /**
   * Vypálený milíř (`draw`): uhlí, které v něm ještě zbývá (kg) – uhlíř ho donese kovářům, jak
   * ho spotřebují. Bez údaje celá dávka (milíř ze starší vsi, kde se uhlí vytahovalo najednou –
   * `migrateKiln`).
   */
  charcoalKg?: number;
  /**
   * Vzdálenost chůze ze zemnice uhlíře k milíři (m – po pevných cestách s půdou, paths/walking.ts)
   * pro přirážku za chůzi na veškerou práci u milíře; bez údaje vzdušná vzdálenost (vsi bez
   * krajiny, kalibrace).
   */
  walkM?: number;
  /**
   * Jízda vozu k milíři (wagons.md – Co vozy vozí; spočítá se při prvním odvozu uhlí vozem a uloží):
   * kudy vůz dojede, null = nedojede (uhlí se nosí v koších). Bez údaje se ještě nepočítala.
   */
  cart?: CartDrive | null;
  /**
   * Totéž pro čtyřkolák – širší oblouk, na zoraný díl ne (wagons.md – Co se vozí a na čem); lesem
   * jen po pevné cestě jako dvoukolák. Bez údaje se ještě nepočítala.
   */
  cart4?: CartDrive | null;
  /**
   * Kdo z milíře nosí uhlí ke kováři (crafts.md – Uhlí a ruda kováře): kovárna (id obydlí – nejbližší
   * kovář) a vzdálenost chůze od ní k milíři (m po pevných cestách s půdou – paths/walking.ts;
   * bez krajiny vzdušně). Spočítá se při prvním nošení a uloží; jiný kovář = přepočet.
   */
  carry?: { smithId: number; walkM: number };
}
/**
 * Rudiště kováře (crafts.md – Uhlí a ruda kováře, návrh Clauda): místo v mokřině u potoka nejblíž
 * kovárně, kde kovář kope bahenní rudu – poloha (m), kolik rudy se z ložiska už vytěžilo (kg), den
 * výběru a vzdálenost chůze z kovárny (m po pevných cestách s půdou; bez krajiny vzdálenost
 * k vodě). Ložisko vydrží SMITH_SUPPLY.depositKg, pak kovář vybere další místo. `cart` = jízda
 * vozu k rudišti (null = vůz nedojede; bez údaje se ještě nepočítala).
 */
export interface OreSite {
  x: number;
  z: number;
  minedKg: number;
  day: number;
  walkM: number;
  cart?: CartDrive | null;
  /**
   * Bohaté naleziště prémiové krajiny (premium-landscapes.md – Bohatá železná ruda, Dobrá
   * keramická hlína): méně suroviny na kg výrobku (`dugMaterialFactor`), ložisko se nevyčerpá –
   * po každých `depositKg` se kope dál na témž místě. Jinde chybí.
   */
  rich?: true;
}
/**
 * Rozdělaná dávka rudy (crafts.md – Uhlí a ruda kováře): kolik rudy kovář nakope (kg), kolik už
 * vykopal a kolik vykopané rudy leží na hromadě u jámy (kg – čeká na odnos nebo vůz) a jestli se
 * kope na celý vůz (`cart` – rudu pak odveze vůz se sedlákem).
 */
export interface OreBatch {
  kg: number;
  dug: number;
  heap: number;
  cart: boolean;
  /** Den, kdy se dávka dokopala (hromada pak čeká na vůz nejvýš do dalšího dne); jinak chybí. */
  readyDay?: number;
}
/**
 * Jáma po kopání rudy (crafts.md – Uhlí a ruda kováře) nebo hlíny (`clay` – crafts.md, Hlína
 * hrnčíře): poloha (m) kousek kolem rudiště či hliniště, dílna (id obydlí – `smithId`), kolik
 * suroviny z ní vzešlo (kg) a den, kdy se v ní naposledy kopalo – od něj zarůstá a po
 * SMITH_SUPPLY.pitYears zmizí.
 */
export interface OrePit {
  x: number;
  z: number;
  smithId: number;
  kg: number;
  day: number;
  clay?: true;
}
/**
 * Milířiště po rozebraném milíři (crafts.md – Milíř u skácených buků): milíř (id), uhlíř (id
 * obydlí), střed (m) a den, kdy se rozebral – od něj zarůstá a po CHARCOAL_BALANCE.remnantYears
 * zmizí.
 */
export interface KilnRemnant {
  id: number;
  burnerId: number;
  x: number;
  z: number;
  day: number;
}
/**
 * Zemnice uhlíře u milíře (workshops.md – Uhlíř – zemnice u milíře): id (z `VillageState.nextId`),
 * střed (m) a natočení (vchod k milíři, u kterého vznikla), odvedená práce (čd – hotová při
 * BURNER_CAMP.buildManDays) a den dokončení. Bez `builtDay` se staví.
 */
export interface BurnerCamp {
  id: number;
  x: number;
  z: number;
  rotation: number;
  done: number;
  builtDay?: number;
}
/**
 * Opuštěná zemnice uhlíře (workshops.md – Uhlíř – zemnice u milíře): zemnice (id), uhlíř (id
 * obydlí), střed (m), natočení a den opuštění – od něj chátrá a po BURNER_CAMP.abandonedYears zmizí.
 * Nedostavěná nese odvedenou práci (`done`, čd – jako `BurnerCamp.done`); bez ní byla hotová.
 */
export interface CampRemnant {
  id: number;
  burnerId: number;
  x: number;
  z: number;
  rotation: number;
  day: number;
  done?: number;
}
/**
 * Měření spotřeby uhlí kovářů (crafts.md – Rovnováha uhlíř – kovář): kg uhlí po obdobích
 * CHARCOAL_BALANCE.bucketDays dní – dokončená období (`buckets`, nejstarší první, nejvýš tolik, kolik
 * se vejde do CHARCOAL_BALANCE.windowDays) a rozběhnuté od dne `from` (`currentKg`).
 */
export interface CharcoalUse {
  from: number;
  currentKg: number;
  buckets: number[];
}
/**
 * Strom, který dílna kácí (uhlíř na uhlí, hrnčíř na palivo pece – forest.md, kácení): id z vrstvy
 * překážek (null = kácení bez polohy – ves bez vrstvy, jen testy), práce za skácení a dovoz
 * (člověkodny, i se vzdáleností) a kolik je hotovo. Strom je od výběru vyhrazený.
 */
export interface WorkshopFelling {
  id: number | null;
  cost: number;
  done: number;
}
/** Řemeslná dílna obydlí (crafts.md). */
export interface Workshop {
  craft: Craft;
  /**
   * Vzdálenost dílny k potoku (m) – ruda a hlína dál od vody stojí víc práce (+1 % za 10 m nad
   * 100 m); z krajiny při zahájení stavby, bez údaje voda blízko.
   */
  waterDistanceM?: number;
  /** Strom, který dílna právě kácí (uhlíř, hrnčíř); jinak null. */
  felling: WorkshopFelling | null;
  /** Kolik výrobku ještě dá skácené dřevo – uhlíř kg uhlí, hrnčíř kg vypálené keramiky. */
  fuelKg: number;
  /** Co dílna dělala poslední odsimulovaný den (panel výběru, dým ve scéně). */
  activity: WorkshopActivity;
  /**
   * Uhlíř: jeho milíře (crafts.md – Milíř u skácených buků, Rovnováha uhlíř – kovář) – nejvýš
   * CHARCOAL_BALANCE.maxKilns: staví se, pálí, nebo vypálený čeká na odběr; v pořadí, jak je začal.
   * Bez údaje žádný (u starší vsi se převede z `kiln` – `migrateKilns`).
   */
  kilns?: CharcoalKiln[];
  /**
   * Uhlíř ve vsi uložené před samostatnými milíři: jeho jediný milíř (u zemnice – `site` null –,
   * nebo v lese). Převede se do `kilns` v prvním dopočítaném dni (`migrateKilns`).
   */
  kiln?: CharcoalKiln | null;
  /**
   * Uhlíř: doby posledních cyklů milíře (dny od výběru buků po vypálení, nejvýš
   * CHARCOAL_BALANCE.cycles – nejstarší první); podle nich začne další milíř včas. Bez údaje se
   * doba odhadne z práce (`kilnCycleDays`).
   */
  kilnCycles?: number[];
  /**
   * Uhlíř: kolik uhlí z dávky pro kováře (crafts.md – Rovnováha uhlíř – kovář – dávka na
   * CHARCOAL_BALANCE.fetchDays dní) ještě zbývá vytahat (kg) – uhlíř ji tahá den po dni, kolik
   * stihne, a kovář nosí, co je vytahané. Bez údaje žádná dávka.
   */
  charcoalOrderKg?: number;
  /**
   * Uhlíř: pařezy buků, které skácel a na které ještě zasadí mladý buk (id z vrstvy překážek,
   * v pořadí kácení – obnova lesa). Bez údaje žádné.
   */
  toPlant?: number[];
  /**
   * Uhlíř: zemnice u milíře (workshops.md – Uhlíř – zemnice u milíře), ve které přespává, dokud
   * milíř pálí – hotová nebo rozestavěná. Bez údaje žádná (i dílny ze starší vsi – zemnici postaví
   * až další milíř).
   */
  camp?: BurnerCamp;
  /**
   * Tesař (wagons.md – Tesař): klády v dílně (i rozdělané – nářadí bere po setinách), ze kterých
   * vyrábí vozy a dřevěné nářadí. Bez údaje 0.
   */
  timber?: number;
  /**
   * Tesař: rozdělaný vůz – druh a odvedená práce (čd bez přirážky za nástroje – hotový při
   * CARPENTRY.cartManDays); bez údaje nebo null žádný.
   */
  cart?: { kind: CartKind; done: number } | null;
  /**
   * Tesař: pokrytí dřevěné práce staveb tesaři posledního odsimulovaného dne 0–1 (wagons.md –
   * Tesař, pomoc stavbám) – panel dílny; bez údaje 0.
   */
  woodworkCoverage?: number;
  /**
   * Kovář (crafts.md – Uhlí a ruda kováře): zásoba bahenní rudy u kovárny (kg). Bez údaje dílna
   * z doby před rudou – při prvním dni kroku práce dostane zásobu na dávku (`migrateSmith`).
   */
  oreKg?: number;
  /**
   * Kovář: rudiště, kde kope rudu; null = v okolí není mokřina ani voda (kovář nemá kde kopat –
   * `no-ore`); bez údaje se ještě nevybíralo (vybere se při prvním kopání).
   */
  oreSite?: OreSite | null;
  /** Kovář: rozdělaná dávka rudy; bez údaje nebo null žádná. */
  oreBatch?: OreBatch | null;
  /** Kovář: vyčerpaná ložiska (m) – další rudiště aspoň SMITH_SUPPLY.siteSpacingM od nich. */
  oreSitesUsed?: { x: number; z: number }[];
  /**
   * Hrnčíř (crafts.md – Hlína hrnčíře): zásoba hlíny u dílny (kg). Bez údaje dílna z doby před
   * hlínou – při prvním dni kroku práce dostane zásobu na dávku (`migratePotter`).
   */
  clayKg?: number;
  /**
   * Hrnčíř: hliniště, kde kope hlínu (jako rudiště – `OreSite`); null = v okolí není mokřina ani
   * voda (`no-clay`); bez údaje se ještě nevybíralo.
   */
  claySite?: OreSite | null;
  /** Hrnčíř: rozdělaná dávka hlíny (jako dávka rudy); bez údaje nebo null žádná. */
  clayBatch?: OreBatch | null;
  /** Hrnčíř: vyčerpaná hliniště (m) – další aspoň SMITH_SUPPLY.siteSpacingM od nich. */
  claySitesUsed?: { x: number; z: number }[];
  /**
   * Tesař (wagons.md – Kování vozů): cesta pro kování k vozu do nejbližší vsi s kovářem – ves
   * vlastního kováře nemá; bez údaje nebo null nikdo nejde.
   */
  ironTrip?: IronTrip | null;
  /**
   * Dílna zná učení řemesla (crafts.md – Učení řemesla): výkon dílny jde podle praxe jejích lidí
   * (`workshopSkill`). Dílna z doby před učením ho nemá – do převodu (`withCraftSkill`) pracuje
   * jako vyučená.
   */
  skillTracked?: true;
}
/**
 * Kam jde tesař pro kování (wagons.md – Kování vozů): k sousedovi za krajem mapy (směr, hotová
 * zemská stezka, nebo bod na kraji mapy, kam se jde krajinou). `name` = jméno souseda.
 */
export interface IronTripTarget {
  kind: 'neighbour';
  name: string;
  direction: Direction8;
  trailId: number | null;
  edge: { x: number; z: number };
}
/**
 * Cesta pro kování k vozu (wagons.md – Kování vozů): kdo vede (syn tesaře od 14 let, nebo tesař –
 * id), den odchodu, dny cesty tam a zpět a kolik jich už ušel, kolik kování nese (kg) a kolik obilí
 * za ně dal (kg), kam jde. Platbu veze vůz se sedlákem (`cartId`), nebo ji nesou nosiči z vsi
 * (`porters` navíc k tesaři, po TRADE.porterKg) – když jich ves tolik nemá, jdou víckrát
 * (`tripDays` – dny jedné cesty tam a zpět; `days` = všechny cesty).
 */
export interface IronTrip {
  personId: number;
  son: boolean;
  startedDay: number;
  days: number;
  done: number;
  kg: number;
  grainKg: number;
  to: IronTripTarget;
  /** Nosiči z vsi navíc k tesaři (chybí v práci vsi po celou cestu); bez údaje 0. */
  porters?: number;
  /** Vůz (id), který veze platbu – jede s ním sedlák z vsi; bez údaje pěšky. */
  cartId?: number;
  /** Dny jedné cesty tam a zpět, když se jde víckrát; bez údaje jedna cesta (`days`). */
  tripDays?: number;
}
/**
 * Vůz vsi – zásoba, ne stavba ve scéně (stojí u ohrady se spřežením): vyrobil ho tesař v den
 * `builtDay`, po CARTS.lifespanYears doslouží.
 */
export interface Cart {
  id: number;
  kind: CartKind;
  builtDay: number;
}

/**
 * Den roku vozů (wagons.md – Kolik vozů ves chce): nošení, které dnes proběhlo tam, kam dojede vůz
 * (čd) – podél pevných cest, kam dojede i čtyřkolák (`r`), a jinam jen dvoukolákem (`o`) –, úspory
 * jízd dvoukoláku pro uhlí, rudu, hlínu a vodu (`j` – čd na vůz) a den orby (`p` – vozy táhnou jen
 * voli, kteří neorají). Chybějící údaj = 0.
 */
export interface CartDemandDay {
  r?: number;
  o?: number;
  j?: number[];
  p?: 1;
}

/**
 * Rok provozu vozů, který běží (wagons.md – Kolik vozů ves chce): dny s prací pro vozy (`days`)
 * a co by ušetřil k-tý čtyřkolák na výpravách (`'four-wheel'` – čd, index 0 = první vůz). Rok
 * uložený před dny (do 20. 10. 2026) má místo dnů úspory k-tého dvoukoláku mimo dny orby
 * (`'two-wheel'`) a ve dny orby (`plough`).
 */
export interface CartDemand {
  /** Den začátku roku vozů (1. 11.). */
  from: number;
  days?: CartDemandDay[];
  'four-wheel': number[];
  'two-wheel'?: number[];
  plough?: number[];
}

/**
 * Uzavřený rok vozů (wagons.md – Kolik vozů ves chce): úspora za rok (čd, přepočtená na rok) podle
 * počtu dvoukoláků × čtyřkoláků mimo dny orby i s výpravami (`base[dvoukoláky][čtyřkoláky]`) a ve
 * dny orby podle volů, kteří neorají (`plough[dvoukoláky][čtyřkoláky][voli]`), a cena vola za rok
 * (`oxCost` – čd, seno přes zimu i výcvik).
 */
export interface CartYear {
  from: number;
  oxCost: number;
  base: number[][];
  plough: number[][][];
}

/** Kolik volů a vozů ves chce (oxen.md – Kolik volů ves chce, wagons.md – Kolik vozů ves chce). */
export interface DraftState {
  /**
   * Páry k rádlům, které ves drží (k 1. 9. podle lidí, kteří je obslouží – `staffedPloughPairs`,
   * s hysterezí – `nextPloughPairs`): nahoru hned, dolů, jen když potřeba dva roky po sobě leží
   * pod nimi.
   */
  ploughPairs?: number;
  /**
   * Kolik párů ves loni obsloužila lidmi (potřeba k 1. 9. – pro hysterezi; uložené před 22. 11. 2026
   * nejméně párů, které zorají díly na řadě – do příštího 1. 9.).
   */
  ploughNeed?: number;
  /** Rok vozů, který běží (od 1. 11.). */
  demand?: CartDemand;
  /**
   * Uzavřený loňský rok vozů (k 1. 11.) a cena vola za rok (čd – seno přes zimu i výcvik): podle
   * něj ves chce vozy. Chybí = ves zatím chce jen vozy, které má.
   */
  lastYear?: CartYear | (CartDemand & { oxCost: number });
  /**
   * Dosahy čtyřkoláku spočítané podle pravidla „po louce a strništi kamkoli“ (wagons.md – Co se
   * vozí a na čem, 20. 10. 2026) – dřív uložené (jen po pevných cestách) se jednou zahodí
   * (`withFourWheelReach`). Chybí = ještě ne.
   */
  fourWheelOffRoad?: true;
}
/**
 * Zásoby výrobků řemeslníků (crafts.md, kg): uhlí u kováře (crafts.md – Milíř stojí vždy: co uhlíř
 * donesl z vypáleného milíře a kovář ještě nespálil, koupené; uhlí ve vypálených milířích nese
 * milíř – celá zásoba `charcoalStockKg`), keramika, železná houba a hřivny u kovárny
 * (production-chains.md – Kovář). Nástroje nejsou zásoba – jsou ve vybavení domácností
 * (`VillageState.toolEquipmentKg`). Co ves nespotřebuje, zůstane v zásobě.
 */
export interface CraftStocks {
  charcoalKg: number;
  potteryKg: number;
  /**
   * Železné hřivny (production-chains.md – Kovář): kovář z nich kove nástroje do vybavení
   * a kování k vozům, jdou na obchod; v liště místo nástrojů. Chybí = 0.
   */
  ironBarsKg?: number;
  /** Železná houba z tavby, kterou kovář ještě nepřekoval na hřivny. Chybí = 0. */
  bloomKg?: number;
  /** Dřevěné nářadí od tesaře (wagons.md – Tesař); u vsí uložených dřív chybí (= 0). */
  woodToolsKg?: number;
}
