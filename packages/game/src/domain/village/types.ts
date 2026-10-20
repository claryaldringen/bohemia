// Stav vsi – JSON-serializovatelný (objekty, pole, čísla, řetězce, null).
/**
 * Typ obydlí: zemnice, polozemnice a dvorec vojvody (trade.md – Dvorec vojvody: delší a vyšší
 * polozemnice se zdobenými štíty na pozemku dvou políček). Dvorec hráč nestaví – vznikne jen
 * přestavbou dvorce vsi (`VillageState.manorId`).
 */
export type DwellingType = 'zemnice' | 'polozemnice' | 'dvorec';
/** Obydlí, která hráč staví z nabídky staveb (dvorec ne – trade.md). */
export type BuildableDwellingType = Exclude<DwellingType, 'dvorec'>;
export type FieldSurface = 'meadow' | 'shrub' | 'forest';
export interface Position {
  x: number;
  z: number;
  rotation: number;
} // svět, m; ověřuje plán 3
/** Pohlaví člověka (kinship.md). */
export type Sex = 'male' | 'female';
/**
 * Směr k sousední vsi (war.md – Svět: mřížka map, 8 sousedů): sever, severovýchod, východ,
 * jihovýchod, jih, jihozápad, západ, severozápad.
 */
export type NeighborDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export interface Person {
  id: number;
  bornDay: number;
  /**
   * Domácnost = id obydlí. Zakladatelé vsi mají id první zemnice už během její stavby (bydlí na
   * staveništi), obydlí s tím id vznikne až s dokončením.
   */
  dwellingId: number;
  /**
   * Pohlaví (kinship.md). U vsí uložených před příbuzenstvím chybí – doplní ho jednou
   * `withKinship`.
   */
  sex?: Sex;
  /** Matka a otec (id) – chybí, když jsou neznámí (zakladatelé, lidé z okolí, starší vsi). */
  motherId?: number;
  fatherId?: number;
  /** Manžel / manželka (id žijícího člověka ve vsi); svobodný, vdovec a vdova ho nemají. */
  spouseId?: number;
  /**
   * Ze které sousední vsi člověk přišel – nevěsta z okolí a lidé z výměny se sousedem (kinship.md,
   * trade.md – Výměna lidí, war.md – příbuzní v cílové vsi); narození ve vsi ho nemají.
   */
  origin?: NeighborDirection;
  /**
   * Den, od kterého žena může znovu porodit (population.md – Růst populace, rozestup porodů): po
   * porodu za BIRTH_SPACING.afterBirthDays, po svatbě za afterWeddingDays. Chybí – kdykoli (i ve
   * vsích uložených dřív).
   */
  nextBirthFrom?: number;
  /**
   * Praxe v řemeslech (crafts.md – Učení řemesla): roky práce v dílně daného řemesla – dospělý ji
   * získává za dny, kdy dílna pracuje, syn řemeslníka jako učeň od 10 let; nejvýš
   * CRAFT_SKILL.fullYears (vyučený). Chybí – žádná praxe (i lidé ve vsích bez dílen).
   */
  practice?: Partial<Record<Craft, number>>;
}
/**
 * Dcera, která se vdala pryč (kinship.md – Sňatky z okolí), nebo člověk, kterého ves dala sousedovi
 * (trade.md – Výměna lidí): jen záznam v rodokmenu, nesimuluje se –
 * id, pohlaví, den narození, rodiče a směr vsi, kam odešla (war.md – muži s příbuznými v cílové
 * vsi útočit nechtějí). Ves ho drží, jen dokud ve vsi žije její rodič, sourozenec nebo dítě.
 */
export interface Emigrant {
  id: number;
  sex: Sex;
  bornDay: number;
  direction: NeighborDirection;
  motherId?: number;
  fatherId?: number;
}
/**
 * Zemřelý nebo odešlý předek v rodokmenu (kinship.md – Příbuzenství): jen id a jeho rodiče, aby
 * šli poznat prarodiče, strýcové a bratranci žijících. Ves ho drží, jen dokud je rodičem
 * někoho žijícího.
 */
export interface Ancestor {
  id: number;
  motherId?: number;
  fatherId?: number;
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
  /** Políčko pozemku; u natočeného pozemku (`square`) políčko pod jeho středem. */
  cell: TileCell;
  variant: PlotVariant;
  /**
   * Natočený pozemek (Martin 18. 10. 2026 – „všechny stavby by měly jít natáčet po 15 stupních“,
   * varianta a: natočí se celý pozemek): čtverec o straně políčka se středem (x, z) ve světě (m)
   * natočený o `rotation` (rad, násobek 15°) – „vpředu“ s brankou je −z pozemku. Chybí = pozemek
   * je políčko `cell` bez natočení (pozemky z doby před natáčením). Dvorec (`yard`) ho nemá.
   */
  square?: PlotSquare;
  /**
   * Dvorec vojvody (trade.md): druhé políčko pozemku – dvůr sousedící stranou s políčkem domu
   * `cell`. Dům stojí uprostřed `cell` vchodem ke dvoru (varianta `center`), brána je na
   * vzdálené straně dvora. U ostatních pozemků chybí.
   */
  yard?: TileCell;
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
  /**
   * Chůze z obydlí k nejbližšímu okraji lesa (m – po pěšinách a pevných cestách, mokřina ×2, brod
   * + 30 m; roads.md – Rychlejší chůze) – palivo (forest.md) ho bere místo `forestDistanceM`.
   * Počítá se jen s krajinou; u starších obydlí chybí do prvního přepočtu.
   */
  forestWalkM?: number;
  /**
   * Chůze z obydlí k nejbližší vodě (m – místo na břehu nejblíž vzdušnou čarou, chůze jako
   * `forestWalkM`; paths.md – Pochůzky pro vodu) – přirážka denního minima domácnosti za vodu
   * (population.md – Práce, `waterFetchingLabor`). Počítá se jen s krajinou; bez vody v okně půdy
   * pro chůzi a u starších obydlí do prvního přepočtu chybí (přirážka 0).
   */
  waterWalkM?: number;
  /**
   * Řemeslná dílna (crafts.md) – řemeslo patří budově: provozuje ho domácnost, která v ní bydlí,
   * prázdná dílna nic nevyrábí. Obyčejné obydlí ji nemá.
   */
  workshop?: Workshop;
}
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
  | 'no-charcoal'
  /** Kovář nemá rudu a není kde ji kopat (crafts.md – Uhlí a ruda kováře). */
  | 'no-ore'
  /** Kovář (a synové) kope rudu na rudišti (crafts.md – Uhlí a ruda kováře). */
  | 'digging'
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
 * Milíř uhlíře – jedna dávka buků od výběru po rozebrání (crafts.md – Uhlíř, Milíř stojí vždy).
 * Stojí u dílny (`site` null – milíř kus od zemnice), nebo v lese u dávky (`site` – střed milíře
 * ve světě, m). Buky dávky jsou od výběru vyhrazené; kácí se a připravují strom po stromu
 * v pořadí `trees`. Uhlíř má nejvýš jeden milíř – rozebraný zmizí a uhlíř staví nový.
 */
export interface CharcoalKiln {
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
   * Milíř v lese: vzdálenost chůze z dílny k němu (m – po pevných cestách s půdou, paths/walking.ts)
   * pro přirážku za chůzi; bez údaje vzdušná vzdálenost (vsi bez krajiny, kalibrace).
   */
  walkM?: number;
  /**
   * Jízda vozu k milíři (wagons.md – Co vozy vozí; spočítá se při prvním odvozu uhlí vozem a uloží):
   * kudy vůz dojede, null = nedojede (uhlí se nosí v koších). Bez údaje se ještě nepočítala.
   */
  cart?: CartDrive | null;
  /**
   * Totéž pro čtyřkolák – jen po pevných cestách (wagons.md – Co se vozí a na čem: uhlí z lesního
   * milíře po cestě). Bez údaje se ještě nepočítala.
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
 * Jáma po kopání rudy (crafts.md – Uhlí a ruda kováře): poloha (m) kousek kolem rudiště, kovárna
 * (id obydlí), kolik rudy z ní vzešlo (kg) a den, kdy se v ní naposledy kopalo – od něj zarůstá
 * a po SMITH_SUPPLY.pitYears zmizí.
 */
export interface OrePit {
  x: number;
  z: number;
  smithId: number;
  kg: number;
  day: number;
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
   * Uhlíř: jeho milíř – staví se, pálí, nebo vypálený čeká na odběr (crafts.md – Milíř stojí
   * vždy); bez údaje nebo null žádný (rozebraný, nebo nejsou buky).
   */
  kiln?: CharcoalKiln | null;
  /**
   * Uhlíř: pařezy buků, které skácel a na které ještě zasadí mladý buk (id z vrstvy překážek,
   * v pořadí kácení – obnova lesa). Bez údaje žádné.
   */
  toPlant?: number[];
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
 * zemská stezka, nebo bod na kraji mapy, kam se jde krajinou), nebo do jiné vsi hráče na téže mapě
 * (kovárna – m). `name` = jméno vsi.
 */
export type IronTripTarget =
  | {
      kind: 'neighbour';
      name: string;
      direction: Direction8;
      trailId: number | null;
      edge: { x: number; z: number };
    }
  | { kind: 'village'; name: string; x: number; z: number };
/**
 * Cesta pro kování k vozu (wagons.md – Kování vozů): kdo jde (syn tesaře od 14 let, nebo tesař –
 * id), den odchodu, dny cesty tam a zpět a kolik jich už ušel, kolik kování nese (kg) a kolik obilí
 * za ně dal (kg), kam jde.
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
   * Páry k rádlům, které ves drží (plán osevu k 1. 9., s hysterezí – `nextPloughPairs`): mění se,
   * jen když potřeba dva roky po sobě leží nad nebo pod nimi.
   */
  ploughPairs?: number;
  /** Kolik párů by loni stačilo zorat celý osev (potřeba z plánu k 1. 9. – pro hysterezi). */
  ploughNeed?: number;
  /** Rok vozů, který běží (od 1. 11.). */
  demand?: CartDemand;
  /**
   * Uzavřený loňský rok vozů (k 1. 11.) a cena vola za rok (čd – seno přes zimu i výcvik): podle
   * něj ves chce vozy. Chybí = ves zatím chce jen vozy, které má.
   */
  lastYear?: CartYear | (CartDemand & { oxCost: number });
}
/**
 * Zásoby výrobků řemeslníků (crafts.md, kg): uhlí u kováře (crafts.md – Milíř stojí vždy: co uhlíř
 * donesl z vypáleného milíře a kovář ještě nespálil, koupené; uhlí ve vypálených milířích nese
 * milíř – celá zásoba `charcoalStockKg`), nástroje a keramika. Co ves nespotřebuje, zůstane
 * v zásobě.
 */
export interface CraftStocks {
  charcoalKg: number;
  toolsKg: number;
  potteryKg: number;
  /** Dřevěné nářadí od tesaře (wagons.md – Tesař); u vsí uložených dřív chybí (= 0). */
  woodToolsKg?: number;
}
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
 * – kopá se jako jař, seje na jaře, sklízí v červenci; diet.md – Luštěniny) a **len** (`flax` – na
 * plátno; jař se setím na jaře a trháním v červenci jako luštěniny, nejí se – diet.md, Oděv).
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
   * Vzdálenost chůze z nejbližšího obydlí po vyšlapaných pěšinách (m, paths.md – Pěšiny a práce):
   * po pěšině se chodí rychleji, nikdy víc než `distanceM`. Přepočítá se se změnou rozložení vsi
   * (`refreshWalkDistances`); chybí u vsí uložených dřív a bez krajiny (= `distanceM`).
   */
  walkDistanceM?: number;
  /**
   * Roky přílohu bez pastvy a seče (fields.md – Zarůstání): přibývají 1. 11. za každé vegetační
   * období, kdy díl stáda nespásla a ves neposekla; pastva nebo seč je ve fázi louky vynuluje, od
   * křovin už ne. Chybí = 0 (díly mimo příloh, vsi uložené dřív).
   */
  overgrowthYears?: number;
  /**
   * Příloh, ze kterého se díl letos vrací do osevu (od kdy ležel ladem a roky bez pastvy) – kdyby
   * ho ves podle zásob z plánu ubrala dřív, než na něm začne práce, vrátí se do přílohu, jak byl
   * (fields.md – Osev podle zásob). Smaže se na konci hospodářského roku; chybí = díl se nevrací.
   */
  fallowBeforePlan?: { sinceDay: number | null; overgrowthYears?: number };
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
   * Obnova (orchard.md – Obnova sadu): id stavby obnovy, do které vesničané čtverec zařadili.
   * Dokud na něj práce nedojde, stojí staré stromy (`plantedDay` výsadby, ze které rostou);
   * s první prací se staré stromy skácí a čtverec se sází znovu (`plantedDay` null, výsadba
   * bez překážek). Po výsadbě údaj zmizí. U ostatních čtverců chybí.
   */
  renewal?: number;
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
  | 'road';
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
  /** Dřevo obydlí, přestavby, modly a svatyně (forest.md); u starších staveb a polí chybí. */
  wood?: ConstructionWood;
  /** Nové obydlí: vzdálenost k nejbližšímu okraji lesa (m) – obydlí ji po dostavění převezme. */
  forestDistanceM?: number;
  /** Nová řemeslná dílna (crafts.md) – obydlí po dostavění převezme řemeslo; jinak chybí. */
  craft?: Craft;
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
   * Totéž pro čtyřkolák – jen po pevných cestách (wagons.md – Co se vozí a na čem); chybí = ještě
   * ne.
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
  /**
   * Příprava půdy začatých dílů osevu navíc, která čeká na volnou práci (fields.md – Osev navíc):
   * vrácení přílohu, kopání a orba (člověkodny) – nemají přednost před stavbami, dostanou jen
   * práci, která po nich zbude. Setí, pletí, sklizeň a výmlat těch dílů jsou potřebné. Chybí = nic.
   */
  extraLeft?: Partial<Record<ExtraTask, number>>;
}
/** Příprava půdy dílu osevu navíc, která čeká na volnou práci (`CropWork.extraLeft`). */
export type ExtraTask = 'reclaim' | 'dig' | 'plough';
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
   * Cesta spřežení k bloku, který právě orá (oxen.md – Co nejdelší brázda): blok (`PloughBand.block`)
   * a cena cesty tam (m jízdy po louce – vozová síť, bez krajiny vzdálenost dílů od obydlí). Spočítá
   * se, když spřežení začne nový blok.
   */
  trip?: { block: number; costM: number };
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
/**
 * Roční plán osevu (k 1. 9.): na nejvyšší úrovni jař (tvar plánu z doby před ozimem), ozim
 * zvlášť v `winter` – chybí u plánů bez ozimu (i u starších vsí).
 */
export interface YearPlan extends CropWork {
  plannedDay: number;
  /**
   * Ves letos orá rádlem (oxen.md – Jen rádlo): plán vznikl, když ves měla vycvičené spřežení –
   * ve scéně má pak celé pole kulaté rohy. Zůstane, i když spřežení během roku zmizí a zbytek
   * plánu dokončí motyka. Chybí = ves letos kope motykou (i plány starších vsí).
   */
  ard?: true;
  winter?: CropWork;
  /** Luštěniny (fields.md – Luštěniny) – chybí u plánů bez luštěnin (i u starších vsí). */
  legume?: CropWork;
  /** Len (fields.md – Len) – chybí u plánů bez lnu (i u starších vsí). */
  flax?: CropWork;
  /**
   * Kolik třeného lnu ves při plánu potřebovala na oděv za rok (kg – fields.md, Len): podle toho
   * se při trhání zapíše, na jaký podíl oděvu len je (`VillageState.linen`). Chybí u plánů
   * starších vsí a plánů mimo 1. 9. (ves založená během roku) – ty oděv nezapíší.
   */
  flaxNeedKg?: number;
  /**
   * Osev navíc (fields.md – Osev navíc): díly, které ves smí osít a do potřebného osevu je
   * nevybrala, v pořadí výběru – dostanou jen práci, která zbude po stavbách. Na seznamu jsou,
   * dokud na nich práce nezačne (pak patří k ozimu nebo jaři jako potřebné); po dubnu se seznam
   * smaže. Chybí = žádné (i plány starších vsí).
   */
  extra?: ExtraPart[];
}
/**
 * Díl osevu navíc, na kterém ještě nezačala práce (fields.md – Osev navíc). `sownYears` – díl se
 * před plánem osíval nebo byl připravený (v přílohu leží jen od plánu): když na něm práce začne,
 * osévá se dál s tolika lety v řadě; chybí = díl ležel v přílohu (vrací se z něj).
 */
export interface ExtraPart {
  id: number;
  sownYears?: number;
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
  /**
   * Svatba ve vsi (kinship.md – Sňatky) – nevěsta (s vlastními dětmi do 16 let) z domu `from` se
   * přestěhovala k muži do domu `to` (ze stejného domu from = to); `groomMoved` – naopak ženich se
   * přiženil k nevěstě, která drží dům; `widow` – vdávala se vdova (už má děti).
   */
  | {
      kind: 'marriage';
      fromDwellingId: number;
      toDwellingId: number;
      groomMoved?: true;
      widow?: true;
    }
  /** Muž z domu `dwellingId` si přivedl nevěstu z okolí (kinship.md – Sňatky z okolí). */
  | { kind: 'bride-from-outside'; dwellingId: number }
  /**
   * K ženě z domu `dwellingId` se přiženil muž z okolí (kinship.md – Sňatky z okolí); `widow` –
   * k vdově.
   */
  | { kind: 'groom-from-outside'; dwellingId: number; widow?: true }
  /** Dcera z domu `dwellingId` se vdala pryč – odešla ze vsi (kinship.md – Sňatky z okolí). */
  | { kind: 'married-away'; dwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
      /** Dostavěná řemeslná dílna (crafts.md); u ostatních staveb chybí. */
      craft?: Craft;
    }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  /** Domácnost obydlí `dwellingId` si začala stavět nový dům typu `type` (migration.md). */
  | { kind: 'relocation-started'; dwellingId: number; type: DwellingType }
  /** Hráč zrušil rozestavěné přestěhování domácnosti `dwellingId` (migration.md). */
  | { kind: 'relocation-cancelled'; dwellingId: number }
  /** Domácnost se přestěhovala do dostavěného domu – starý dům zůstal prázdný (migration.md). */
  | { kind: 'household-relocated'; fromDwellingId: number; toDwellingId: number }
  /**
   * Domácnosti odešly založit novou ves (migration.md – Odchod do nové vsi): kolik domácností
   * a lidí, na novou mapu i se směrem (na téže mapě bez směru).
   */
  | { kind: 'households-left'; households: number; people: number; direction?: Direction8 }
  /** Odešli všichni – ves je opuštěná (migration.md). */
  | { kind: 'village-abandoned' }
  /** Lidé vyrazili na novou mapu – dorazí v den `arrivalDay` (migration.md – fáze 4). */
  | { kind: 'journey-started'; direction: Direction8; arrivalDay: number }
  /**
   * Sklizeň – plodina, když ves seje ozim i jař (ozim v červenci, jař v srpnu); bez ní jen jař
   * (ves bez ozimu, starší sklizně). `legume` – luštěniny (kg do zásoby luštěnin, ne obilí).
   */
  | { kind: 'harvest'; kg: number; crop?: Crop }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number }
  /**
   * Při trhání lnu (31. 7.): ves sklidila jen `kg` třeného lnu z `neededKg`, které potřebuje na
   * oděv (fields.md – Len, diet.md – Oděv).
   */
  | { kind: 'linen-short'; kg: number; neededKg: number }
  /** Podzimní porážka (diet.md – 1. 11.): kolik kg masa a kolik kusů kterého druhu. */
  | {
      kind: 'slaughter';
      kg: number;
      animals: Partial<Record<HerdSpecies, number>>;
      /** Z toho maso kusů, které se porážejí po dnech přes zimu (diet.md – Porážka v zimě). */
      fresh?: number;
    }
  /**
   * Nouzová porážka (diet.md – Nouzová porážka): výhled jídla do sklizně nevycházel, ves porazila
   * zvířata navíc – kolik kg masa a kusů (na setiny) kterého druhu.
   */
  | { kind: 'emergency-slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Zbytek uzeného masa se zkazil (diet.md – Trvanlivost masa, 1. 9.) – kolik kg; méně než kilo
   * se nezapíše.
   */
  | { kind: 'meat-spoiled'; kg: number }
  /**
   * Přes zimu chybělo přes polovinu sena – část stáda uhynula (diet.md – Zimní úhyn, 1. 3.); kusy
   * po druzích na setiny.
   */
  | { kind: 'herd-starved'; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Při porážce: ovce, které ves nechala přes zimu (`sheep`, na desetiny), nedají vlnu na oděv pro
   * všechny – potřeba by byla `needed` ovcí (diet.md – Oděv).
   */
  | { kind: 'wool-short'; sheep: number; needed: number }
  /**
   * Voli v ohradě jsou vycvičení – táhnou rádla a vozy (oxen.md; `oxen` – kolik, chybí = pár ve
   * vsích uložených dřív).
   */
  | { kind: 'team-ready'; penId: number; oxen?: number }
  /** Voli dosloužili – zestárli (oxen.md, ≈ 10 let), šli na maso (`oxen` jako u `team-ready`). */
  | { kind: 'team-retired'; penId: number; oxen?: number }
  /**
   * Přes zimu chybělo přes polovinu sena – voli (`training` – telata ve výcviku) uhynuli
   * (`oxen` – kolik; chybí = spřežení se rozpadlo ve vsích uložených dřív).
   */
  | { kind: 'ox-died'; penId: number; training: boolean; oxen?: number }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  /** Vesničané zařadili čtverce starého sadu do obnovy (orchard.md – Obnova sadu). */
  | { kind: 'orchard-renewal-started'; orchardId: number; squares: number }
  /**
   * Pole nebo sad ustoupil stavbě obydlí (population.md – Obydlí na poli a v sadu): o kolik m² se
   * zmenšil, a jestli tím zanikl (dům sebral poslední čtverec).
   */
  | {
      kind: 'land-taken';
      land: 'field' | 'orchard';
      id: number;
      areaM2: number;
      gone: boolean;
      /** Co půdu vzalo (fields.md – Pole jako krajina); bez údaje obydlí (starší události). */
      by?: LandTaker;
    }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  /**
   * Nepasený a nesečený příloh zarostl lesem a z pole vypadl (fields.md – Zarůstání): první díl,
   * pole, kolik dílů a jestli pole zaniklo. U událostí ze staršího pravidla (do 18. 10. 2026)
   * je jen `partId`.
   */
  | {
      kind: 'part-became-forest';
      partId: number;
      fieldId?: number;
      parts?: number;
      gone?: boolean;
    }
  /** Vesničané při mýcení ušetřili posvátný dub nebo dubový háj (happiness.md) – id místa. */
  | { kind: 'sacred-spared'; site: 'oak' | 'grove'; id: number }
  /** Ušetřený posvátný dub stářím uschl – zůstala posvátná souš (happiness.md) – id dubu. */
  | { kind: 'sacred-oak-died'; id: number }
  /** Posvátná souš padla – místo už není posvátný dub (happiness.md) – id dubu. */
  | { kind: 'sacred-snag-fell'; id: number }
  /** Z dlouhodobého provozu vznikla pevná cesta (roads.md) – id úseku. */
  | { kind: 'road-formed'; roadId: number }
  /** Nepoužívaná vyšlapaná cesta zarostla (roads.md – Zarůstání) – id úseku. */
  | { kind: 'road-overgrown'; roadId: number }
  /** Zemská stezka ke kraji mapy je dostavěná – obchod se sousedem (trade.md). */
  | { kind: 'trail-built'; trailId: number; direction: Direction8 }
  /**
   * Výprava nosičů vyrazila k sousedovi – co nesou (trade.md – Obchod) a kdo s ní odešel do
   * sousední vsi (`people` – trade.md, Výměna lidí; chybí = nikdo).
   */
  | { kind: 'trade-departed'; direction: Direction8; give: TradeGoods; people?: TradePeople }
  /**
   * Výprava se vrátila – co přinesla (trade.md – Obchod) a kdo s ní přišel (`people`; chybí =
   * nikdo).
   */
  | { kind: 'trade-returned'; direction: Direction8; get: TradeGoods; people?: TradePeople }
  /**
   * Vesničané koupili výrobky řemeslníků u souseda (crafts.md – Nákup u sousedů) – kg nástrojů,
   * keramiky a dřevěného nářadí, čím platili (kg obilí a luštěnin).
   */
  | {
      kind: 'crafts-bought';
      direction: Direction8;
      get: CraftPurchaseGoods;
      pay: CraftPurchasePay;
    }
  /** Tesař vyrobil vůz (wagons.md – Tesař). */
  | { kind: 'cart-made'; cart: CartKind }
  /**
   * Ves nemá kováře – tesař (`son` – jeho syn) šel pro kování k vozu do nejbližší vsi s kovářem
   * `to` (jméno; soused za krajem mapy ve směru `direction`, jinak jiná ves hráče na téže mapě –
   * wagons.md, Kování vozů).
   */
  | { kind: 'iron-trip'; cart: CartKind; to: string; son: boolean; direction?: Direction8 }
  /** Tesař (`son` – jeho syn) přinesl kování k vozu – vůz je hotový (wagons.md – Kování vozů). */
  | { kind: 'iron-brought'; cart: CartKind; son: boolean }
  /** Vůz dosloužil (wagons.md – Vůz) – tesař vyrobí nový, když ho ves potřebuje. */
  | { kind: 'cart-worn-out'; cart: CartKind }
  /**
   * S výpravou přišli lidé od souseda (trade.md – Výměna lidí): rodina, svobodný muž nebo žena,
   * kolik jich je a do kterého obydlí šli.
   */
  | {
      kind: 'newcomer';
      direction: Direction8;
      group: NewcomerGroup;
      people: number;
      dwellingId: number;
    }
  /**
   * Opuštěná stavba, ke které léta nikdo nechodil, se rozpadla (abandonment.md): modla padla,
   * svatyně se rozpadla, plot hřbitova se rozpadl, ohrada se rozpadla – id stavby.
   */
  | { kind: 'structure-fell'; structure: AbandonedStructure; id: number }
  /**
   * Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava): modlu, svatyni,
   * plot hřbitova (i spadlý postavili znovu) nebo ohradu – id stavby.
   */
  | { kind: 'structure-repaired'; structure: AbandonedStructure; id: number }
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
  /** Orba rádlem – oráč a honáček se spřežením (oxen.md). */
  | 'plough'
  /** Sečení, sušení a stohování sena (oxen.md – Seno). */
  | 'mow'
  /** Porážka a uzení masa (diet.md). */
  | 'slaughter'
  /**
   * Dojení a zpracování mléka na sýr (diet.md – Práce se zvířaty) – bokem, ne z práce vsi
   * (`LaborDay.aside`).
   */
  | 'milking'
  /** Pasení dospělými – jen v rozdělení práce z doby před 19. 10. 2026 (pasou výrostci). */
  | 'herding'
  /**
   * Péče o zvířata – zimní krmení, voda a kydání krav a volů, prasata a slepice; bokem
   * (`LaborDay.aside`).
   */
  | 'animal-care'
  /** Sezónní práce v sadech (orchard.md). */
  | 'orchard-care'
  | 'orchard-harvest'
  /** Společná práce do staveb: stavba obydlí, kácení jeho dřeva, zakládání pole, výsadba sadu, hřbitov. */
  | 'build'
  /** Stavba ohrady a výroba rádla (oxen.md). */
  | 'pen'
  | 'fell'
  | 'found-field'
  | 'orchard-plant'
  | 'cemetery'
  /** Opravy obydlí (population.md), oprava modly a svatyně (abandonment.md – Oprava). */
  | 'repair'
  /** Řemeslník v dílně (crafts.md) – výroba uhlí, nástrojů nebo keramiky. */
  | 'craft'
  /** Uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa). */
  | 'plant'
  /**
   * Kopání, praní a pražení bahenní rudy na rudišti – kovář a synové od 14 let (crafts.md – Uhlí
   * a ruda kováře).
   */
  | 'ore'
  /**
   * Nošení uhlí od milíře a rudy z rudiště do kovárny v koších – synové kováře (uhlí od 10 let,
   * rudu od 14) nebo kovář sám (crafts.md – Uhlí a ruda kováře); kdo nese, je v `LaborShare.ages`.
   */
  | 'fetch'
  /**
   * Denní minimum domácností (fields.md – Práce, bod 1); domácí výroba žen jde bokem
   * (`LaborDay.aside`).
   */
  | 'domestic'
  /** Nosiči výpravy k sousedovi po zemské stezce (trade.md – Obchod). */
  | 'trade'
  /**
   * Svoz vozem (wagons.md – Vůz): honák a nakladač s vozem – snopy z pole, seno z luk, klády ke
   * stavbám, a co vozy vozí mimo svoz (Co vozy vozí – `LaborShare.job`): uhlí z milíře, osivo na
   * pole, vodu v sudech. Kolik vozů jede, je v `LaborShare.carts`.
   */
  | 'haul'
  /** Společná práce, na kterou nezbyla žádná stavba ani oprava (propadla). */
  | 'idle';

/** Kde se práce dělá. */
export type LaborTarget =
  /**
   * Pole (id) – osévané díly plánu, zakládané díly. U polních prací `parts` = díly pole, přes
   * které dnes práce postoupila (čelo práce, v pořadí postupu); bez nich celé pole.
   */
  | {
      kind: 'field';
      id: number;
      parts?: number[];
      /**
       * U orby: kolik orby dílu bylo hotovo na začátku a na konci dne (0–1, ke každému dílu
       * `parts`) – kudy dnes spřežení prošlo (scéna projede celou dnešní orbu – oxen.md).
       */
      progress?: [number, number][];
    }
  /** Hotové obydlí (id) – opravy, přestavba, práce řemeslníka v dílně. */
  | { kind: 'dwelling'; id: number }
  /** Staveniště nového obydlí – id stavby. */
  | { kind: 'site'; id: number }
  /** Sad (id) – výsadba, péče, sklizeň. */
  | { kind: 'orchard'; id: number }
  /** Hřbitov (id) – zakládání, rozšíření a oprava plotu (abandonment.md – Oprava). */
  | { kind: 'cemetery'; id: number }
  /** Hotová modla nebo svatyně (id stavby) – oprava (abandonment.md – Oprava). */
  | { kind: 'sacred'; id: number }
  /** Ohrada (id) – stavba, rádlo, péče o krávy a voly v zimě. */
  | { kind: 'pen'; id: number }
  /** Pevná cesta (id úseku) – vylepšení a jabloně podél ní (roads.md). */
  | { kind: 'road'; id: number }
  /** Přirozená louka – políčka, na kterých se dnes seče seno (oxen.md – Seno). */
  | { kind: 'meadow'; cells: TileCell[] }
  /** Stromy z vrstvy překážek, které se pro stavbu nebo dílnu právě kácejí (i pařezy k sázení). */
  | { kind: 'trees'; ids: number[] }
  /**
   * Milíř uhlíře (crafts.md – Uhlíř) – dílna (id obydlí) a střed milíře ve světě (m): lesní milíř,
   * a odkud se nosí uhlí ke kováři (`from` = id kovárny – nosí se z milíře do ní; crafts.md – Uhlí
   * a ruda kováře) i milíř u dílny.
   */
  | { kind: 'kiln'; id: number; x: number; z: number; from?: number }
  /**
   * Rudiště kováře (crafts.md – Uhlí a ruda kováře) – kovárna (id obydlí) a místo, kde se kope
   * (m): kopání u jámy, nošení rudy z něj do kovárny, jízda vozu pro rudu.
   */
  | { kind: 'ore'; id: number; x: number; z: number }
  /** Zemská stezka (id) – nosiči výpravy k sousedovi (trade.md – Obchod). */
  | { kind: 'trail'; id: number }
  /**
   * Cesta krajinou ke kraji mapy ve směru (bez zemské stezky) – nákup u souseda (crafts.md –
   * Nákup u sousedů); bod na kraji mapy (m).
   */
  | { kind: 'edge'; direction: Direction8; x: number; z: number }
  /** Břeh vody, kam vůz jezdí pro vodu v sudech (wagons.md – Co vozy vozí); bod ve světě (m). */
  | { kind: 'water'; x: number; z: number }
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
  /** Svoz a výprava s vozy (wagons.md): kolik vozů tu dnes jezdí; u ostatní práce chybí. */
  carts?: number;
  /** Z nich čtyřkoláky (svoz podél cest – wagons.md, Co se vozí a na čem); chybí = žádný. */
  fourWheel?: number;
  /**
   * Co vůz veze, když nesváží úrodu, seno ani klády (wagons.md – Co vozy vozí): uhlí z milíře,
   * osivo na pole, vodu v sudech. U svozu a ostatní práce chybí.
   */
  job?: CartJob;
  /**
   * Kdo práci dělá (věk v letech, od nejstaršího) – u kopání a nošení kováře (crafts.md – Uhlí
   * a ruda kováře): kovář, nebo jeho synové; postavy pod 14 let jsou děti. U ostatní práce chybí.
   */
  ages?: number[];
}

/** Rozdělení práce jednoho dne – uložené ve stavu vsi (`VillageState.labor`). */
export interface LaborDay {
  day: number;
  shares: LaborShare[];
  /**
   * Kolik výrostků 7–13 let dnes pase (diet.md – Pasáci) – pasou bez práce vsi, proto nejsou
   * v `shares`. Starší (`elders`) jen v rozdělení práce z doby před 19. 10. 2026. Bez údaje se
   * neví (dřívější rozdělení).
   */
  herders?: { children: number; elders?: number };
  /**
   * Práce bokem – mimo práci vsi (population.md – Práce; Martin 19. 10. 2026): dojení a péče
   * o zvířata a domácí výroba (ženy), denní minimum, které pokryli starší – jen pro postavy ve
   * scéně, v `shares` nejsou.
   */
  aside?: LaborShare[];
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
  /**
   * Nedodělek domácí výroby – jen ve vsích uložených před 19. 10. 2026; domácí výroba z práce
   * vsi nebere (population.md – Práce), simulace ho nečte ani nepíše.
   */
  domesticBacklog?: number;
  hungry: boolean;
  /**
   * Příděl energie do sklizně podle výhledu z jídla posledního dne (0–1) – jen když ves šetří
   * (`hungry`); jinak chybí (population.md – Co hráč vidí: šetří jídlem / hladoví).
   */
  ration?: number;
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
  /**
   * Roční průměr denní společné práce (člověkodny za den) – klouzavý exponenciální průměr
   * s časovou konstantou COMMON_LABOR_YEAR_DAYS; podle něj se obyvatelé rozhodují o přestavbě na
   * lepší obydlí. U vsí uložených před ním chybí – začne průměrem `commonLaborHistory`.
   */
  commonLaborYearly?: number;
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
   * Rozdělení práce posledního odsimulovaného dne (labor-report.ts) – pro zobrazení; simulace ho
   * čte jen přes síť pěšin (kam se chodí – vzdálenost chůze dílů, paths.md). U vsí uložených
   * před jeho zavedením chybí do prvního dopočítaného dne.
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
  /**
   * Dobytek (diet.md – Dobytek): stáda ovcí, koz, prasat a krav. U vsí uložených před dobytkem
   * chybí – výchozí stádo z domácností doplní `withLivestock` (nebo první dopočítaný den).
   */
  livestock?: LivestockState;
  /** Zásoba masa (kg) – uzené a sušené (diet.md). Chybí = žádná. */
  meatKg?: number;
  /**
   * Čerstvé maso dne (kg) ze zimní porážky (diet.md – Porážka v zimě): porážka ho dá ráno, jídlo
   * dne ho sní napřed, co zbude, se udí. Mezi dny chybí.
   */
  freshMeatKg?: number;
  /** Zásoba sýra (kg) – z mléka, které se nevypije čerstvé (diet.md). Chybí = žádná. */
  cheeseKg?: number;
  /** Zásoba luštěnin (kg suchého semene – diet.md, Luštěniny). Chybí = žádná. */
  legumesKg?: number;
  /**
   * Na jaký podíl oděvu má ves len (0–1) – zapsaný při posledním trhání lnu, platí do dalšího
   * (fields.md – Len, diet.md – Oděv). Len není zásoba: v rámci roku se zpracuje v domácí práci.
   * Chybí = dost (vsi uložené dřív a nové vsi do prvního trhání po plánu k 1. 9.).
   */
  linen?: number;
  /** Seno (oxen.md – Seno): zásoba, sečení a zima. Chybí = žádné. */
  hay?: HayState;
  /** Ohrady s přístřeškem (oxen.md); chybí = žádné. */
  pens?: Pen[];
  /**
   * Hotová rádla vsi (oxen.md – Voli po kusech): pár vycvičených volů orá, jen když má rádlo; ves
   * staví rádlo s výcvikem nového páru k orbě. Chybí = žádné – u vsí uložených dřív jedno na každé
   * vycvičené spřežení (`withOxen`).
   */
  ards?: number;
  /** Kolik volů a vozů ves chce (oxen.md – Kolik volů ves chce, wagons.md); chybí = nic. */
  draft?: DraftState;
  /**
   * Zbytky padlých model a svatyní (abandonment.md – Následky) – zarůstají a zmizí. Chybí =
   * žádné (i u vsí uložených před chátráním staveb).
   */
  sacredRuins?: SacredRuin[];
  /** Jídlo posledního odsimulovaného dne – energie, pestrost a podíly (jen pro zobrazení). */
  diet?: DietDay;
  /**
   * Kolik jídla ves potřebuje z pole (fields.md – Kolik ves oseje, Osev podle stravy): součty
   * běžícího hospodářského roku a podíl uplynulého – podle něj ves oseje obilí a luštěniny. Chybí
   * u vsí uložených dřív a do prvního 1. 9. po založení (ves pak plánuje, jako by jedla jen obilí).
   */
  fieldFood?: FieldFoodYear;
  /** Zásoby výrobků řemeslníků (crafts.md) – u vsí uložených před řemesly chybí (= 0). */
  crafts?: CraftStocks;
  /**
   * Starší polozemnice už dostaly pozemky (`withPlots`, Martin 18. 10. 2026). Chybí u vsí
   * uložených před převodem – při načtení se jednou převedou.
   */
  /**
   * Zemřelí a odešlí rodiče žijících (kinship.md – Příbuzenství) – jen pro poznání blízkých
   * příbuzných. U vsí uložených před příbuzenstvím chybí (= žádní).
   */
  ancestors?: Ancestor[];
  /** Dcery, které se vdaly pryč – záznam se směrem jejich nové vsi (kinship.md); chybí = žádné. */
  emigrants?: Emigrant[];
  plotsMigrated?: true;
  /**
   * Otisk rozložení vsi (`walkLayoutKey` se stadii `walkStages`), pro které se naposledy spočítaly
   * vzdálenosti chůze po pěšinách (`FieldPart.walkDistanceM`…). Chybí, dokud se nespočítaly
   * (starší vsi, simulace bez krajiny); klíč z doby před měsíčními stadii se jednou přepočítá.
   */
  walkLayoutKey?: string;
  /**
   * Otisk stadií dílů a pastvy úhoru (`walkStageKey`) z posledního 1. dne v měsíci – do klíče
   * chůze se stadia promítají jen jednou za měsíc (Martin, 18. 10. 2026). Chybí jako výše.
   */
  walkStages?: string;
  /**
   * Jízda vozu pro vodu (wagons.md – Co vozy vozí): břeh nejblíž ohradě se spřežením, kam vůz
   * sjede (null = nesjede nikam – voda se nosí), spočítaný pro rozložení vsi `key` (klíč chůze
   * a ohrada – přepočítá se, když se změní). Chybí, dokud vůz pro vodu nejel.
   */
  waterCart?: { key: string; drive: CartDrive | null };
  /** Totéž pro čtyřkolák – jen po pevných cestách (wagons.md – Co se vozí a na čem). */
  waterCart4?: { key: string; drive: CartDrive | null };
  /**
   * Pevné cesty, stromy u nich a roční součty práce (roads.md). Chybí u vsí uložených před nimi
   * a ve vsích simulovaných bez krajiny (kalibrace, testy) – začnou při prvním dopočtu s krajinou.
   */
  roads?: VillageRoads;
  /**
   * Otisk pevných cest a čtverců polí, pro který naposledy platí plocha dílů pod cestami
   * (`roadFieldsDay` – roads.md a fields.md, Cesta přes pole); chybí = ještě se nepočítala.
   */
  roadLandKey?: number;
  /**
   * Zbytky jam po zaniklých obydlích (population.md – Chátrání a přestavba, Po zániku) – zarůstají
   * RUIN_YEARS let, pak zmizí (ruins.ts). Chybí = žádné (i u vsí uložených před nimi).
   */
  ruins?: DwellingRuin[];
  /**
   * Jámy po kopání rudy kovářů (crafts.md – Uhlí a ruda kováře) – zarůstají SMITH_SUPPLY.pitYears
   * let, pak zmizí. Chybí = žádné (i u vsí uložených před rudou).
   */
  orePits?: OrePit[];
  /**
   * Les vsi – čtverce polí, které zarostly lesem a z pole vypadly (fields.md – Zarůstání). Chybí
   * = žádný (i u vsí uložených před zarůstáním).
   */
  woods?: VillageWood[];
  /**
   * Dvorec vojvody (trade.md – Dvorec vojvody): id obydlí (= domácnosti), které je dvorcem vsi –
   * v nové vsi první zemnice zakladatelů, ve starší vsi nejstarší obydlí (`withManor`). Odtud jdou
   * vylepšení vsi. Chybí u vsí uložených dřív – doplní ho `withManor` nebo první dopočítaný den.
   */
  manorId?: number;
  /** Zemské stezky k sousedům (trade.md – Zemská stezka); chybí = žádné. */
  trails?: Trail[];
  /** Obchod se sousedy – zásoby a poptávka sousedů a výpravy (trade.md – Obchod); chybí = nic. */
  trade?: VillageTrade;
  /** Vozy vsi (wagons.md – Vůz) – vyrábí je tesař; chybí = žádné. */
  carts?: Cart[];
  /**
   * Nákupy výrobků řemeslníků u sousedů na cestě (crafts.md – Nákup u sousedů); chybí = žádný.
   */
  purchases?: CraftPurchase[];
  /**
   * Ves je opuštěná (migration.md – Odchod do nové vsi): odešli z ní všichni lidé. Dál se
   * nesimuluje, obydlí se rozpadají podle dne odchodu (`abandonedVillageAt`). Žijící ves ho nemá.
   */
  abandonedDay?: number;
  /**
   * Lidé jsou na cestě na novou mapu (migration.md – fáze 4): ves ještě nestojí, nesimuluje se;
   * po příjezdu hráč umístí první zemnici (`settleJourney`). Založená ves ho nemá.
   */
  journey?: VillageJourney;
  /**
   * Stavby a změny překážek jiných vsí na téže mapě (migration.md – Vsi na téže mapě) – jen
   * dočasně při dopočtu a pohledu (`withNeighbours`), neukládá se. Kontroly umístění je znají,
   * kácení se s nimi nekříží.
   */
  neighbours?: NeighbourSnapshot;
}

/** Cesta lidí na novou mapu – směr, den odchodu a příjezdu (migration.md – fáze 4). */
export interface VillageJourney {
  direction: Direction8;
  departedDay: number;
  /** Den příjezdu – od něj hráč umisťuje první zemnici. */
  arrivalDay: number;
}

/**
 * Jiné vsi na téže mapě pro jednu ves (migration.md – Vsi na téže mapě): co zabírají (obydlí
 * a rozestavěná obydlí, posvátné stavby, políčka polí, sadů, hřbitovů, ohrad a lesa vsi) a které
 * překážky krajiny už odstranily, pokácely nebo si vyhradily.
 */
export interface NeighbourSnapshot {
  dwellings: { type: DwellingType; position: Position; plot?: DwellingPlot; craft?: Craft }[];
  sacredBuildings: { kind: SacredBuildingKind; position: Position }[];
  /** Políčka krajiny, která zabírají (v mřížce krajiny). */
  cells: TileCell[];
  /**
   * Čtverce natočených polí, sadů, hřbitovů, ohrad a lesa vsi v jejich mřížce (fields.md –
   * Natočené stavby) – v `cells` nejsou. Natočené pozemky nese obydlí (`plot.square`). Chybí =
   * žádné.
   */
  squares?: { cell: TileCell; grid: SquareGrid }[];
  /**
   * Obývané kovárny jiných vsí (wagons.md – Kování vozů): poloha (m) a jméno vsi – tesař ves bez
   * kováře pro kování dojde k nejbližší. Chybí = žádné.
   */
  smithies?: { x: number; z: number; name: string }[];
  cleared: ObstacleChange[];
  felled: ObstacleChange[];
  reserved: number[];
}

// --- dvorec, zemská stezka a obchod (trade.md) ----------------------------------------------

/**
 * Osm směrů od vsi ke kraji mapy – sever je +z, východ +x (trade.md – Zemská stezka); stejné
 * směry jako původ nevěst z okolí (`NeighborDirection` – kinship.md).
 */
export type Direction8 = NeighborDirection;

/**
 * Úsek zemské stezky – pevná cesta (`Road`), po které stezka vede, na jaký stupeň se při stavbě
 * vylepší (upravená, nebo hať a lávka přes mokřinu a brod) a práce na něm (člověkodny i s kácením
 * dřeva hatě).
 */
export interface TrailPiece {
  roadId: number;
  grade: Exclude<RoadGrade, 'trodden'>;
  manDays: number;
}

/**
 * Zemská stezka (trade.md – Zemská stezka): od dvorce ke kraji mapy ve směru `direction`. Osa je
 * uložená jako pevné cesty `pieces` (od vsi ven); stavba je vylepšení cesty (`Construction.trail`)
 * po úsecích od vsi ven. Hotová stezka (`builtDay`) otevře obchod se sousedem v tom směru.
 */
export interface Trail {
  id: number;
  direction: Direction8;
  pieces: TrailPiece[];
  /** Délka osy od dvorce ke kraji mapy (m). */
  lengthM: number;
  /** Den zadání stavby. */
  startedDay: number;
  /** Den dostavění; dokud se staví, null. */
  builtDay: number | null;
}

/**
 * Zboží obchodu (trade.md – Sousedé): jen to, co ves sama má – obilí, maso, sýr, luštěniny (kg),
 * dobytek (kusy – krávy), klády (kusy), keramika, nástroje, uhlí (kg). Zboží zvenku (sůl, železo,
 * med, kožešiny) obchod od 19. 10. 2026 nezná (Martin: „Nech jen společné suroviny, nezaváděj
 * nové.“) – starší vsi o něj přijdou (`withoutForeignGoods`).
 */
export type TradeGood =
  'grain' | 'meat' | 'cheese' | 'legumes' | 'cattle' | 'logs' | 'pottery' | 'tools' | 'charcoal';

/** Množství zboží (jen uvedené druhy, kg nebo kusy podle druhu). */
export type TradeGoods = Partial<Record<TradeGood, number>>;

/**
 * Soused v jednom směru – co mu letos zbývá z nabídky a kolik ještě vezme ze sháněného
 * (trade.md – Sousedé: roční zásoby a poptávka, doplnění 1. 11.). Povaha (co nabízí a shání) se
 * nemění a počítá se ze seedu světa (`neighbourOf`), ukládá se jen, co z roku zbývá.
 */
export interface NeighbourStock {
  direction: Direction8;
  /** Rok obchodu (herní rok, ve kterém začal 1. 11.), ke kterému zásoby platí. */
  season: number;
  /** Co soused ještě letos dá (nabízené zboží). */
  supply: TradeGoods;
  /** Kolik soused ještě letos vezme (sháněné zboží). */
  demand: TradeGoods;
  /**
   * Lidé, které soused letos ještě dá a vezme (trade.md – Výměna lidí). Chybí u zbytku roku
   * uloženého před výměnou lidí – pak platí celý rok podle povahy (`neighbourPeople`).
   */
  people?: NeighbourPeople;
}

/**
 * Lidé ve výměně se sousedem (trade.md – Výměna lidí): rodiny a svobodní muži a ženy zvlášť
 * (Martin 19. 10. 2026). Kronika uložená dřív může mít místo mužů a žen `adults`.
 */
export interface TradePeople {
  families: number;
  men: number;
  women: number;
}

/**
 * Kdo s výpravou přijde (`TradeExpedition.getPeople`): rodiny souseda (počet dětí v každé)
 * a svobodní muži a ženy; výprava uložená před muži a ženami zvlášť má `adults` (pohlaví se losuje
 * při příchodu jako dřív).
 */
export interface ComingPeople {
  families: readonly number[];
  men?: number;
  women?: number;
  adults?: number;
}

/** Kdo přišel od souseda (trade.md – Výměna lidí): rodina, svobodný muž, svobodná žena. */
export type NewcomerGroup = 'family' | 'man' | 'woman';

/**
 * Lidé souseda na rok obchodu (trade.md – Výměna lidí): rodiny a svobodní muži a ženy, které
 * neuživí a dá je, a kolik lidí naopak vezme. Zbytek roku uložený před muži a ženami zvlášť má
 * `adults` – převede ho `storedNeighbourPeople`.
 */
export interface NeighbourPeople {
  /** Rodiny, které soused dá – počet dětí v každé; ves bere od první. */
  families: number[];
  /** Svobodní muži a ženy, které soused dá. */
  men: number;
  women: number;
  /** Kolik rodin a svobodných mužů a žen soused vezme. */
  takes: TradePeople;
}

/**
 * Výprava nosičů k sousedovi (trade.md – Obchod): zboží, které nesou tam (už odebrané ze zásob
 * vsi), a co přinesou zpět; nosiči a práce (lidé × dny ze společné práce vsi). Zboží dorazí, až se
 * nosiči vrátí (odvedená práce = celá cena).
 */
export interface TradeExpedition {
  id: number;
  direction: Direction8;
  trailId: number;
  startedDay: number;
  give: TradeGoods;
  get: TradeGoods;
  porters: number;
  /** Dny cesty tam a zpět i s cestou za krajem mapy. */
  days: number;
  /** Práce celkem (člověkodny = nosiči × dny) a kolik je odvedeno. */
  cost: number;
  done: number;
  /**
   * Kdo s výpravou odešel do sousední vsi (trade.md – Výměna lidí) – rodiny, muži, ženy a lidí
   * celkem; už nejsou ve vsi. `members` – pohlaví a den narození každého (postavy karavany ve
   * scéně jdou tam s ní). Chybí = nikdo; výprava uložená dřív má místo mužů a žen `adults` a nemá
   * `members`.
   */
  givePeople?: TradePeople & {
    people: number;
    members?: { sex: Sex; bornDay: number; group: NewcomerGroup }[];
  };
  /**
   * Kdo s výpravou přijde – rodiny souseda (počet dětí v každé) a svobodní muži a ženy; ve vsi se
   * objeví po návratu. Chybí = nikdo.
   */
  getPeople?: { families: number[]; men?: number; women?: number; adults?: number };
  /**
   * Vozy, které jedou s výpravou (wagons.md – Vůz, id) – s nimi jejich spřežení; doma nevozí ani
   * neorají, dokud se výprava nevrátí. Chybí = výprava bez vozů.
   */
  carts?: number[];
}

/** Výrobky řemeslníků, které ves kupuje u sousedů (kg – crafts.md, Nákup u sousedů). */
export interface CraftPurchaseGoods {
  toolsKg?: number;
  potteryKg?: number;
  woodToolsKg?: number;
}
/** Čím ves platí (kg) – obilí a luštěniny z přebytku nad pojistkou zásob. */
export interface CraftPurchasePay {
  grainKg?: number;
  legumesKg?: number;
}
/**
 * Nákup u souseda na cestě (crafts.md – Nákup u sousedů): malá skupina `group` lidí jde ve směru
 * `direction` po zemské stezce (`trailId`), nebo krajinou ke kraji mapy (`edge` – bod na kraji),
 * `days` dní (i s opakovanými cestami, když nesou víc, než unesou naráz); platbu nese tam, výrobky
 * přinesou zpět. `done` = dny, které už šli – lidé jsou celé dny pryč (práce vsi bez nich).
 */
export interface CraftPurchase {
  direction: Direction8;
  startedDay: number;
  group: number;
  days: number;
  /**
   * Dny jedné cesty tam a zpět – `days` je jejich násobek, když skupina jde vícekrát (karavana ve
   * scéně jde každou cestu zvlášť); chybí = jedna cesta (`days`).
   */
  tripDays?: number;
  done: number;
  trailId: number | null;
  edge: { x: number; z: number };
  get: CraftPurchaseGoods;
  pay: CraftPurchasePay;
}

/** Obchod vsi se sousedy (trade.md). */
export interface VillageTrade {
  neighbours: NeighbourStock[];
  expeditions: TradeExpedition[];
  /** Další id výpravy. */
  nextId: number;
}

// --- pevné cesty (roads.md) ------------------------------------------------------------------

/** Bod osy pevné cesty ve světě (m, na centimetry). */
export interface RoadPoint {
  x: number;
  z: number;
}

/**
 * Stupeň pevné cesty (roads.md – Vylepšení cesty): vyšlapaná (vznikne sama), upravená a hať
 * s lávkou (staví hráč – zatím jen vyšlapaná).
 */
export type RoadGrade = 'trodden' | 'improved' | 'causeway';

/** Místo na strom u pevné cesty – určené jednou při vzniku cesty (roads.md – Stromy). */
export interface RoadTreeSpot {
  id: number;
  x: number;
  z: number;
}

/**
 * Pevná cesta – úsek mezi rozcestími a konci (roads.md – Dvě vrstvy cest): osa se uloží při
 * vzniku a od té doby se nehýbe (jen se při napojení nové cesty rozdělí na dva úseky).
 */
export interface Road {
  id: number;
  /** Osa – lomená čára ve světě (m, na cm); rozcestí sdílejí bod. */
  points: RoadPoint[];
  /** Herní den vzniku (rozdělený úsek ho zdědí). */
  bornDay: number;
  grade: RoadGrade;
  /**
   * Provoz posledních let (cest za den – roční průměr, nejnovější poslední; nejvýš
   * ROADS.overgrowYears) – podle něj vyšlapaná cesta zaroste.
   */
  traffic: number[];
  spots: RoadTreeSpot[];
  /**
   * Kudy úsek vede (roads.md – Vylepšení cesty): mokřinou (úseky osy od–do v m) a přes brody
   * (polohy na ose v m). Určí se z krajiny při vzniku (u starších úseků při roční kontrole).
   */
  ground?: RoadGround;
  /**
   * Skutečné volné konce [začátek, konec] – brána domu, cíl (pole, voda, les) –, kde se pás cesty
   * ve scéně vytrácí; konec, kde trasa pokračuje pěšinou dne, a rozcestí ne. Určí roční kontrola;
   * chybí = podle napojení na jiný úsek.
   */
  openEnds?: [boolean, boolean];
  /**
   * Kusy osy (≈ ROADS.pieceM), kudy se chodí pod polovinou prahu (roads.md – Zarůstá jen
   * nepoužívaný kus): střed kusu (m, na cm) a kolik ročních kontrol po sobě (nejvýš
   * ROADS.overgrowYears). Jen u vyšlapané cesty; chybí = žádný (i u starších vsí – počítá se od
   * další roční kontroly).
   */
  quiet?: RoadQuietPiece[];
  /**
   * Vozová cesta (wagons.md – Vyjeté cesty): vyjetá vozy, širší, ve scéně dvě koleje, vůz po ní
   * projede i lesem. Chybí = pěší cesta.
   */
  cart?: true;
  /**
   * Provoz vozů posledních let (jízd za den – roční průměr, nejnovější poslední; nejvýš
   * CART_ROADS.dropYears) – podle něj cesta příznak vozová dostane a ztratí. Chybí = bez vozů.
   */
  cartTraffic?: number[];
  /**
   * Průsek lesem je vykácený (trade.md – Zemská stezka, roads.md – Průsek lesem; Martin,
   * 19. 10. 2026: „Tam, kde zemská stezka prochází lesem, ať se les vykácí.“) – upravená cesta
   * a stezka v pruhu ROAD_SWATH kolem osy. Rozdělený i spojený úsek ho zdědí; chybí = ne.
   */
  swath?: true;
  /**
   * Kolik délky úseku lemují stromy u cesty a jabloně (roads.md – Stromy u cesty zrychlí chůzi)
   * – podle toho je chůze i jízda vozem po úseku rychlejší (`roadTreeSpeed`). Určí se 1. dne
   * v měsíci (`lineRoads`); chybí = ještě neurčeno (nový úsek, starší ves – určí se hned další
   * den).
   */
  lined?: RoadLining;
}

/**
 * Olemování úseku pevné cesty (roads.md – Stromy u cesty zrychlí chůzi): podíl délky osy, který
 * lemují stojící stromy u cesty (bez úseků s jabloněmi) a živé jabloně – po desetinách
 * (ROAD_TREE_SPEED.steps), dohromady nejvýš 1.
 */
export interface RoadLining {
  trees: number;
  apples: number;
}

/** Tichý kus osy pevné cesty – střed kusu a roky po sobě pod polovinou prahu. */
export interface RoadQuietPiece {
  x: number;
  z: number;
  years: number;
}

/** Mokřina a brody na ose úseku – vzdálenosti od začátku osy (m, na decimetry). */
export interface RoadGround {
  wet: [number, number][];
  fords: number[];
}

/** Druh stromu u cesty (roads.md – Druhy): dub, jilm, topol. */
export type RoadTreeSpecies = 'oak' | 'elm' | 'poplar';

/**
 * Strom u pevné cesty (roads.md – Stromy u pevných cest) – herní data: uchytil se na místě
 * `spot` a stojí tam do smrti; keř, strom, souš a pařez se odvozují ze dne (`roadTreeLook`). Id
 * leží nad rozsahem vrstvy překážek (ROAD_TREE_ID_BASE) – stavba přes strom ho odstraní jako
 * ostatní překážky (`clearedObstacles`).
 */
export interface RoadTree {
  id: number;
  spot: number;
  x: number;
  z: number;
  species: RoadTreeSpecies;
  rootedDay: number;
  /** Den smrti stářím – pak souš, pařez a místo je zase volné. */
  diesDay: number;
}

/** Práce za rok cest na jednom místě (člověkodny celkem) – `field` bez dílů. */
export interface RoadLaborShare {
  target: LaborTarget;
  manDays: number;
}

/** Pevné cesty vsi (roads.md). */
export interface VillageRoads {
  /** Další id úseku, místa a stromu (strom: ROAD_TREE_ID_BASE + id). */
  nextId: number;
  roads: Road[];
  trees: RoadTree[];
  /**
   * Úseky roční sítě nad prahem z minulé roční kontroly (osy po ≈ 4 m) – kde se nad prahem chodí
   * i letos, vznikne pevná cesta.
   */
  candidates: RoadPoint[][];
  /**
   * Práce od poslední roční kontroly (od 1. 11.) po místech – z rozdělení práce dne. Roční síť
   * z ní bere průměrné člověkodny na den (`manDays / days`).
   */
  labor: {
    from: number;
    days: number;
    shares: RoadLaborShare[];
    /**
     * Jízdy vozů od poslední roční kontroly po cílech (wagons.md – Vozová síť): kam vozy jezdily
     * (bod cíle), jakým vozem a kolikrát – sčítá svoz (`addRoadCartTrips`). Chybí = žádné.
     */
    cart?: RoadCartTrips[];
  };
  /** Jabloně vysazené hráčem podél úseků (roads.md – Vysazení jabloní); chybí = žádné. */
  apples?: RoadApple[];
  /**
   * Díry mezi úseky zacelené a volné konce určené (roads.md – Úseky a rozcestí) – roční kontrolou
   * nebo převodem starší vsi při načtení (`withJoinedRoads`); chybí = ještě ne.
   */
  endsChecked?: true;
  /**
   * Souběžné cesty sloučené (roads.md – Úseky a rozcestí) – roční kontrolou nebo převodem starší
   * vsi při načtení; chybí = ještě ne.
   */
  parallelsChecked?: true;
  /**
   * Konce úseků, od kterých zarostl nepoužívaný kus (roads.md – Zarůstá jen nepoužívaný kus) –
   * zůstávají volnými konci (pás cesty se tam vytrácí) a díra se k nim nedoplňuje; zmizí, když tam
   * už žádný úsek nekončí. Chybí = žádné.
   */
  cutEnds?: RoadPoint[];
  /**
   * Úseky sítě vozů nad prahem z minulé roční kontroly (osy po ≈ 4 m) – kde vozy jezdí nad prahem
   * i letos, vznikne vozová cesta (wagons.md – Vyjeté cesty). Chybí = žádné.
   */
  cartCandidates?: RoadPoint[][];
  /**
   * Pařezy v průsecích lesem (roads.md – Průsek lesem): stromy pokácené v pruhu kolem osy upravené
   * cesty – dokud cesta stojí, nedorostou (zůstanou pařezem, nesází se na ně). Vzestupně; chybí =
   * žádné.
   */
  swath?: number[];
  /** Hotové upravené cesty a stezky dostaly průsek převodem starší vsi (`withRoadSwaths`). */
  swathChecked?: true;
}

/** Druh vozu (wagons.md – Vůz): dvoukolák (svoz), čtyřkolák (obchod – hůř se otáčí). */
export type CartKind = 'two-wheel' | 'four-wheel';

/**
 * Jízda vozu, když nesváží úrodu, seno ani klády (wagons.md – Co vozy vozí): uhlí z milíře ke
 * kováři, ruda z rudiště do kovárny (crafts.md – Uhlí a ruda kováře), osivo na pole, voda v sudech
 * – v tomto pořadí přednosti (CART_JOBS.order).
 */
export type CartJob = 'charcoal' | 'ore' | 'seed' | 'water';

/**
 * Jízda vozu od ohrady se spřežením k cíli (wagons.md – Co vozy vozí): cena trasy vozové sítě (m
 * jízdy po louce – cesta levněji, svah a strniště dráž) a kde trasa končí (m – sem jezdí jízdy do
 * ročního provozu cest).
 */
export interface CartDrive {
  costM: number;
  x: number;
  z: number;
}

/** Jízdy vozů k jednomu cíli za rok cest (wagons.md – Vozová síť). */
export interface RoadCartTrips {
  x: number;
  z: number;
  kind: CartKind;
  trips: number;
}

/**
 * Jabloň u pevné cesty (roads.md – Vysazení jabloní): jako strom sadu – výsadba v oknech jara
 * a podzimu, plody od 6. roku, život ≈ 60 let, pak souš. Id leží v rozsahu stromů u cest
 * (ROAD_TREE_ID_BASE) – stavba přes jabloň ji odstraní jako ostatní překážky.
 */
export interface RoadApple {
  id: number;
  /** Úsek, podél kterého hráč jabloně vysadil. */
  roadId: number;
  x: number;
  z: number;
  /** Vzdálenost od nejbližšího obydlí při zadání (m) – péče a sklizeň dražší jako v sadu. */
  distanceM: number;
  /** Den výsadby; dokud čeká na výsadbu, null. */
  plantedDay: number | null;
  /** Stavba výsadby, dokud se sází; pak chybí. */
  constructionId?: number;
}

/**
 * Zbytek jámy po zaniklém obydlí: zarostlá prohlubeň s kopřivami a pár trámy (population.md –
 * Po zániku). Poloha, typ, pozemek a řemeslo zaniklého obydlí (jen pro vzhled) a den zániku; id =
 * id zaniklého obydlí. Na místo zříceniny jde stavět – stavba ji odstraní.
 */
export interface DwellingRuin {
  id: number;
  type: DwellingType;
  position: Position;
  plot?: DwellingPlot;
  craft?: Craft;
  /** Den zániku obydlí – od něj jáma zarůstá. */
  day: number;
}

/** Druh stáda (diet.md – Dobytek); slepice patří k obydlím, voli k ohradám. */
export type HerdSpecies = 'sheep' | 'goat' | 'pig' | 'cow';

/**
 * Stáda vsi (diet.md – Dobytek). Počty mohou být neceločíselné – mláďata a porážka se počítají
 * podílem stáda; panel a scéna je zaokrouhlí.
 */
export interface LivestockState {
  herds: Record<HerdSpecies, number>;
  /** Mláďata letošního jara (přibyla 1. 4.) – z nich ves v listopadu bere maso navíc. */
  young: Record<HerdSpecies, number>;
  /**
   * Louka a les (ha) do LIVESTOCK.reachM od vsi podle krajiny (simulace krajinu nemá) – pastva
   * a žaludy. Bez údaje výchozí hodnoty typické krajiny (LIVESTOCK.defaultLand).
   */
  land?: { meadowHa: number; forestHa: number };
  /**
   * Porážka a uzení (listopad) – potřebné a odvedené člověkodny; chybí = žádná. `emergency` –
   * práce nouzové porážky mimo listopad (diet.md – Nouzová porážka), dělá se hned.
   */
  slaughterWork?: { required: number; done: number; emergency?: boolean } | null;
  /**
   * Pasení od poslední porážky (diet.md – Pasáci): součet denní potřeby pasáků a co z ní
   * výrostci uhlídali (v plných pasácích). Chybí = zatím nic (vsi uložené dřív).
   */
  herding?: { needDays: number; watchedDays: number };
  /**
   * Na jaký podíl oděvu dají vlnu ovce přezimující od poslední porážky (diet.md – Oděv; 0–1,
   * `recordWool`). Chybí = dost (vsi uložené dřív a nové vsi do první porážky).
   */
  wool?: number;
  /**
   * Kusy na maso, které čekají na zimní porážku (diet.md – Porážka v zimě): rozhodne je porážka
   * 1. 11., žijí ve stádech (`herds`) a žerou seno nebo les, ves je porazí po dnech podle čerstvé
   * spotřeby do konce zimy. Chybí = žádné (i vsi uložené dřív).
   */
  culling?: Record<HerdSpecies, number>;
  /**
   * Od kterého dne stádo omezují místa ohrad a u domů (oxen.md – Ohrady podle druhu, roční
   * odklad – návrh Clauda): rok po založení vsi, u vsi uložené dřív rok po zavedení pravidla
   * (`withPenSpecies`). Chybí = platí hned (testy, vsi bez převodu).
   */
  pensFromDay?: number;
}

/** Seno (oxen.md – Seno): zásoba, letošní seč a zima. */
export interface HayState {
  kg: number;
  /** Sečení (červen–červenec) – díly úhoru ve fázi louky v pořadí seče; null = letos se neseče. */
  mowing: HayMowing | null;
  /**
   * Zima (listopad–březen): kolik sena voli potřebovali a dostali do včerejška – pokrytí rozhodne
   * o jarní orbě a úhynu (oxen.md) – a totéž pro krávy, ovce a kozy (`herdNeedKg`,
   * `herdEatenKg` – zimní úhyn, diet.md; zimy začaté před senem pro ovce a kozy je nemají).
   * Chybí mimo zimu.
   */
  winter?: { oxenNeedKg: number; oxenEatenKg: number; herdNeedKg?: number; herdEatenKg?: number };
}

/**
 * Seč jednoho léta – díly úhoru (`partIds`) a v pořadí seče i čtverce přirozených luk
 * (`squares`; bez nich jen díly), potřebné a odvedené člověkodny a seno při plné seči (kg).
 */
export interface HayMowing {
  partIds: number[];
  /** Louky v pořadí seče (od obydlí) – díl úhoru (`partId`), nebo políčko přirozené louky. */
  squares?: HaySquare[];
  required: number;
  done: number;
  yieldKg: number;
  /** Svoz sena, který převzaly vozy (wagons.md – Vůz; člověkodny seče); chybí = 0. */
  hauled?: number;
  /** Kam vůz při seči dojede – spočítá se při prvním svozu (wagons.md). Chybí = ještě ne. */
  cartReach?: CartReach;
  /** Kam při seči dojede čtyřkolák – jen podél pevných cest. Chybí = ještě ne. */
  cartReach4?: CartReach;
}

/** Louka v seči: díl úhoru ve fázi louky, nebo políčko přirozené louky krajiny (oxen.md – Seno). */
export interface HaySquare {
  partId?: number;
  cell?: TileCell;
  areaM2: number;
  /**
   * Vzdálenost chůze z nejbližšího obydlí po pěšinách při plánu seče (m, paths.md – Pěšiny
   * a práce; díl `partWalkDistance`, políčko ke středu); bez pěšin přímá.
   */
  distanceM: number;
}

/**
 * Druh ohrady (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Každý druh zvířete by měl mít
 * vlastní ohradu, ať se nemíchají.“): ovce, kozy, prasata, skot (krávy a telata) a spřežení volů
 * (výcvik a voli – s kravami se nemíchají).
 */
export type PenSpecies = 'sheep' | 'goat' | 'pig' | 'cattle' | 'team';

/**
 * Další čtverec ohrady za prvním (oxen.md – Ohrady podle druhu): ohrada se maluje po čtvercích
 * jako hřbitov, nejvýš PEN_SQUARES.max čtverců. Rozšíření ve stavbě nese `constructionId` – do
 * dokončení se čtverec nepočítá do kapacity.
 */
export interface PenSquare {
  /** Čtverec v mřížce ohrady (`Pen.grid`); bez ní políčko krajiny. */
  cell: TileCell;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Rozšíření ve stavbě – id stavby, která čtverec ohrazuje; bez údaje hotový s ohradou. */
  constructionId?: number;
}

/**
 * Ohrada s přístřeškem (oxen.md) – čtverce 15 × 15 m pro jeden druh zvířat; u spřežení voli
 * a výcvik nového. Stavba a rádlo jsou stavby (`Construction.penId`). První čtverec (`cell`, `x`,
 * `z`) nese přístřešek a jesle, další čtverce jsou v `extraSquares`.
 */
/**
 * Vůl v ohradě volů (oxen.md – Voli po kusech): od `trainedDay` je vycvičený a táhne rádlo nebo
 * vůz (do té doby je to tele ve výcviku – OXEN.trainingYears), slouží OXEN.serviceYears let, pak
 * jde na maso. `weak` – slabý vůl po zimě bez dost sena (pokrytí sena k 1. 3., 0,5–1): na jaře orá
 * jen tímto podílem své denní kapacity (oxen.md – Jen rádlo); chybí = plná síla.
 */
export interface Ox {
  trainedDay: number;
  weak?: number;
}

export interface Pen {
  id: number;
  /**
   * Druh zvířat (oxen.md – Ohrady podle druhu); ohrady uložené dřív ho dostanou při načtení
   * (`withPenSpecies` – se spřežením nebo výcvikem `team`, jinak `cattle`).
   */
  species?: PenSpecies;
  /** První čtverec ohrady (přístřešek a jesle) v její mřížce (`grid`); bez ní políčko krajiny. */
  cell: TileCell;
  /** Další čtverce ohrady (rozšíření i čtverce namalované najednou); bez údaje jen první. */
  extraSquares?: PenSquare[];
  /**
   * Natočená mřížka ohrady (fields.md – Natočené stavby, oxen.md) – natočený čtverec ohrady je
   * její čtverec `cell`; bez ní políčko krajiny.
   */
  grid?: SquareGrid;
  /** Střed prvního čtverce ve světě (m). */
  x: number;
  z: number;
  /** Den dostavění; dokud se staví, null. */
  builtDay: number | null;
  /**
   * Voli ohrady volů po kusech (oxen.md – Voli po kusech, Martin 20. 10. 2026) – vycvičení
   * i telata ve výcviku; jiné druhy ohrad bez údaje. Ohrady uložené dřív mají místo nich
   * spřežení a výcvik (`team`, `training`) – převede je `withOxen`.
   */
  oxen?: Ox[];
  /**
   * Jen ohrady uložené před voly po kusech (do převodu `withOxen`): vycvičené spřežení (2 voli) –
   * den, kdy začalo orat, `weak` jako u vola.
   */
  team?: { readyDay: number; weak?: number } | null;
  /** Jen ohrady uložené před voly po kusech: výcvik dvou telat – den zadání. */
  training?: { startDay: number } | null;
  /** Překážky na čtverci (id z vrstvy) – zmizí se zahájením stavby. */
  obstacles?: number[];
  /** Chátrání ohrady bez zvířat, kam nikdo nechodí (abandonment.md); chybí = celá. */
  wear?: StructureWear;
}

/**
 * Jídlo jednoho dne (diet.md) – energie a bílkoviny proti potřebě, kvalita stravy a podíly zdrojů
 * na energii.
 */
export interface DietDay {
  /** Pokrytí energie 0–1 (obilí, maso, mléko a sýr, vejce, ovoce v obilních ekvivalentech). */
  energy: number;
  /** Pokrytí bílkovin 0–1 (1,6 g na kg tělesné váhy – Martin). */
  protein: number;
  /** Kvalita stravy 0,6–1 z bílkovin a ovoce (`dietQuality`). */
  diversity: number;
  /** Nasycení = energie × kvalita stravy. */
  satiation: number;
  /**
   * Podíly na potřebě energie 0–1 – obilí, maso, mléko a sýr, vejce, ovoce a luštěniny (chybí
   * u jídla uloženého před luštěninami = 0).
   */
  shares: {
    grain: number;
    meat: number;
    dairy: number;
    eggs: number;
    fruit: number;
    legumes?: number;
    /** Z toho čerstvé maso ze zimní porážky (diet.md – Porážka v zimě); chybí = žádné. */
    freshMeat?: number;
  };
}

/**
 * Jídlo z pole za hospodářský rok (fields.md – Kolik ves oseje, Osev podle stravy). Součty běží od
 * 1. 9. (začnou prvním 1. 9. po založení vsi, takže vždy pokrývají celý rok): potřeba energie
 * a z ní část, kterou nepokrylo maso, mléko a sýr, vejce a ovoce – tu musí dát pole (obilí
 * a luštěniny), i když ves zrovna hladověla. 1. 9. se z nich spočítá podíl uplynulého roku.
 */
export interface FieldFoodYear {
  /** Potřeba energie od 1. 9. (kg obilí). */
  needKg: number;
  /** Z toho potřeba jídla z pole (kg obilí). */
  fieldKg: number;
  /** Podíl jídla z pole za poslední celý hospodářský rok (0–1); chybí po prvním 1. 9. */
  share?: number;
  /**
   * Dlouhodobý podíl jídla z pole (0–1) – klouzavý průměr ročních podílů, každý rok o třetinu
   * rozdílu (FIELD_STORES.balanceYears; fields.md – Osev podle zásob, plynulost). Podle něj ves
   * seje. Chybí u vsí uložených dřív – začne posledním ročním podílem.
   */
  longShare?: number;
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
  /** Chátrání opuštěné stavby (abandonment.md); chybí = celá. */
  wear?: StructureWear;
}

/**
 * Stavby, které chátrají, když k nim léta nikdo nechodí (abandonment.md): modla, svatyně, plot
 * hřbitova a ohrada.
 */
export type AbandonedStructure = 'idol' | 'shrine' | 'cemetery-fence' | 'pen';

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
