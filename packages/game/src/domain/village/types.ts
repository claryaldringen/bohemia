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
  /**
   * Chůze z obydlí k nejbližšímu okraji lesa (m – po pěšinách a pevných cestách, mokřina ×2, brod
   * + 30 m; roads.md – Rychlejší chůze) – palivo (forest.md) ho bere místo `forestDistanceM`.
   * Počítá se jen s krajinou; u starších obydlí chybí do prvního přepočtu.
   */
  forestWalkM?: number;
  /**
   * Řemeslná dílna (crafts.md) – řemeslo patří budově: provozuje ho domácnost, která v ní bydlí,
   * prázdná dílna nic nevyrábí. Obyčejné obydlí ji nemá.
   */
  workshop?: Workshop;
}
/** Řemeslo dílny (crafts.md): hrnčíř, kovář, uhlíř. */
export type Craft = 'potter' | 'smith' | 'burner';
/**
 * Co dílna dělala poslední odsimulovaný den (crafts.md – Co hráč vidí): vyrábí, kácí dřevo na
 * uhlí nebo palivo, čeká na uhlí (kovář), čeká na dřevo (uhlíř a hrnčíř – není co kácet), nemá
 * kdo pracovat (domácnost bez práce po minimu a domácí výrobě), nebo je prázdná.
 */
export type WorkshopActivity =
  'producing' | 'felling' | 'no-charcoal' | 'no-wood' | 'idle' | 'empty';
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
}
/**
 * Zásoby výrobků řemeslníků (crafts.md, kg): uhlí pro kováře, nástroje a keramika. Co ves
 * nespotřebuje, zůstane v zásobě.
 */
export interface CraftStocks {
  charcoalKg: number;
  toolsKg: number;
  potteryKg: number;
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
 * Plodina osetého dílu (fields.md – Ozim a jař, Luštěniny): **ozim** (`winter` – žito a pšenice,
 * kopá se a seje na podzim, sklízí v červenci), **jař** (`spring` – ječmen, kopá se na podzim nebo
 * na jaře, seje na jaře, sklízí v srpnu) a **luštěniny** (`legume` – hrách a čočka; jař – kopá
 * se jako jař, seje na jaře, sklízí v červenci; diet.md – Luštěniny).
 */
export type Crop = 'winter' | 'spring' | 'legume';
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
}
/**
 * Les vsi (fields.md – Zarůstání, Les vsi): čtverec pole, který zarostl lesem a z pole vypadl. Les
 * dál roste – dospělé stromy na něm přibývají se stářím (VILLAGE_WOOD) a jde je kácet na dřevo;
 * pole na čtverci ho vymýtí jako les. Prasatům je lesem, stádům pastvinou už není.
 */
export interface VillageWood {
  /** Políčko krajiny (čtverec dílu). */
  cell: TileCell;
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
  | 'road-apples';
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
  /** Dřevo obydlí, přestavby, modly a svatyně (forest.md); u starších staveb a polí chybí. */
  wood?: ConstructionWood;
  /** Nové obydlí: vzdálenost k nejbližšímu okraji lesa (m) – obydlí ji po dostavění převezme. */
  forestDistanceM?: number;
  /** Nová řemeslná dílna (crafts.md) – obydlí po dostavění převezme řemeslo; jinak chybí. */
  craft?: Craft;
  /** Nová dílna: vzdálenost k potoku (m) – dílna ji po dostavění převezme. */
  waterDistanceM?: number;
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
   * Orba rádlem (oxen.md – Účinek na práci): díly, které místo motyky orá spřežení. Jejich
   * kopání v `required.dig` není. Chybí = ves letos neorá (i plány starších vsí).
   */
  plough?: PloughWork;
}
/**
 * Orba jedné plodiny: díly pro spřežení v pořadí orby, potřebné a odvedené člověkodny a váhy
 * (plocha × vzdálenost) oraných dílů a dílů kopaných motykou – setí jde za obojím. Díly vrácené
 * motyce (vůl uhynul, spřežení dosloužilo, slabí voli po zimě bez sena) se kopou na konci řady
 * kopání (`returned`).
 */
export interface PloughWork {
  partIds: number[];
  required: number;
  done: number;
  /** Váha oraných dílů (ha × příplatek za vzdálenost). */
  weight: number;
  /** Váha dílů kopaných motykou (i vrácených). */
  digWeight: number;
  /** Díly vrácené motyce – kopou se po ostatních dílech plodiny. */
  returned?: number[];
}
/**
 * Roční plán osevu (k 1. 9.): na nejvyšší úrovni jař (tvar plánu z doby před ozimem), ozim
 * zvlášť v `winter` – chybí u plánů bez ozimu (i u starších vsí).
 */
export interface YearPlan extends CropWork {
  plannedDay: number;
  winter?: CropWork;
  /** Luštěniny (fields.md – Luštěniny) – chybí u plánů bez luštěnin (i u starších vsí). */
  legume?: CropWork;
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
  /** Sňatek mezi domy (population.md) – svobodný z domu `from` se přestěhoval k protějšku. */
  | { kind: 'marriage'; fromDwellingId: number; toDwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
      /** Dostavěná řemeslná dílna (crafts.md); u ostatních staveb chybí. */
      craft?: Craft;
    }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  /**
   * Sklizeň – plodina, když ves seje ozim i jař (ozim v červenci, jař v srpnu); bez ní jen jař
   * (ves bez ozimu, starší sklizně). `legume` – luštěniny (kg do zásoby luštěnin, ne obilí).
   */
  | { kind: 'harvest'; kg: number; crop?: Crop }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number }
  /** Podzimní porážka (diet.md – 1. 11.): kolik kg masa a kolik kusů kterého druhu. */
  | { kind: 'slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /** Spřežení volů v ohradě je vycvičené a orá (oxen.md). */
  | { kind: 'team-ready'; penId: number }
  /** Spřežení dosloužilo – voli zestárli (oxen.md, ≈ 10 let), šli na maso. */
  | { kind: 'team-retired'; penId: number }
  /** Přes zimu chybělo přes polovinu sena – vůl uhynul, spřežení (nebo výcvik) se rozpadlo. */
  | { kind: 'ox-died'; penId: number; training: boolean }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  /** Vesničané zařadili čtverce starého sadu do obnovy (orchard.md – Obnova sadu). */
  | { kind: 'orchard-renewal-started'; orchardId: number; squares: number }
  /**
   * Pole nebo sad ustoupil stavbě obydlí (population.md – Obydlí na poli a v sadu): o kolik m² se
   * zmenšil, a jestli tím zanikl (dům sebral poslední čtverec).
   */
  | { kind: 'land-taken'; land: 'field' | 'orchard'; id: number; areaM2: number; gone: boolean }
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
  /** Dojení a zpracování mléka na sýr (diet.md – Práce se zvířaty). */
  | 'milking'
  /** Péče o zvířata – zimní krmení, voda a kydání krav a volů, prasata a slepice. */
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
  /** Opravy obydlí (population.md). */
  | 'repair'
  /** Řemeslník v dílně (crafts.md) – výroba uhlí, nástrojů nebo keramiky. */
  | 'craft'
  /** Denní minimum domácností a domácí výroba (fields.md – Práce, body 1 a 4). */
  | 'domestic'
  /** Společná práce, na kterou nezbyla žádná stavba (propadla). */
  | 'idle';

/** Kde se práce dělá. */
export type LaborTarget =
  /**
   * Pole (id) – osévané díly plánu, zakládané díly. U polních prací `parts` = díly pole, přes
   * které dnes práce postoupila (čelo práce, v pořadí postupu); bez nich celé pole.
   */
  | { kind: 'field'; id: number; parts?: number[] }
  /** Hotové obydlí (id) – opravy, přestavba, práce řemeslníka v dílně. */
  | { kind: 'dwelling'; id: number }
  /** Staveniště nového obydlí – id stavby. */
  | { kind: 'site'; id: number }
  /** Sad (id) – výsadba, péče, sklizeň. */
  | { kind: 'orchard'; id: number }
  /** Hřbitov (id) – zakládání a rozšíření. */
  | { kind: 'cemetery'; id: number }
  /** Ohrada (id) – stavba, rádlo, péče o krávy a voly v zimě. */
  | { kind: 'pen'; id: number }
  /** Pevná cesta (id úseku) – vylepšení a jabloně podél ní (roads.md). */
  | { kind: 'road'; id: number }
  /** Přirozená louka – políčka, na kterých se dnes seče seno (oxen.md – Seno). */
  | { kind: 'meadow'; cells: TileCell[] }
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
  /** Zásoba sýra (kg) – z mléka, které se nevypije čerstvé (diet.md). Chybí = žádná. */
  cheeseKg?: number;
  /** Zásoba luštěnin (kg suchého semene – diet.md, Luštěniny). Chybí = žádná. */
  legumesKg?: number;
  /** Seno (oxen.md – Seno): zásoba, sečení a zima. Chybí = žádné. */
  hay?: HayState;
  /** Ohrady s přístřeškem (oxen.md); chybí = žádné. */
  pens?: Pen[];
  /** Jídlo posledního odsimulovaného dne – energie, pestrost a podíly (jen pro zobrazení). */
  diet?: DietDay;
  /** Zásoby výrobků řemeslníků (crafts.md) – u vsí uložených před řemesly chybí (= 0). */
  crafts?: CraftStocks;
  /**
   * Starší polozemnice už dostaly pozemky (`withPlots`, Martin 18. 10. 2026). Chybí u vsí
   * uložených před převodem – při načtení se jednou převedou.
   */
  plotsMigrated?: true;
  /**
   * Klíč rozložení vsi, pro které se naposledy spočítaly vzdálenosti chůze dílů po pěšinách
   * (`FieldPart.walkDistanceM`). Chybí, dokud se nespočítaly (starší vsi, simulace bez krajiny).
   */
  walkLayoutKey?: string;
  /**
   * Pevné cesty, stromy u nich a roční součty práce (roads.md). Chybí u vsí uložených před nimi
   * a ve vsích simulovaných bez krajiny (kalibrace, testy) – začnou při prvním dopočtu s krajinou.
   */
  roads?: VillageRoads;
  /**
   * Zbytky jam po zaniklých obydlích (population.md – Chátrání a přestavba, Po zániku) – zarůstají
   * RUIN_YEARS let, pak zmizí (ruins.ts). Chybí = žádné (i u vsí uložených před nimi).
   */
  ruins?: DwellingRuin[];
  /**
   * Les vsi – čtverce polí, které zarostly lesem a z pole vypadly (fields.md – Zarůstání). Chybí
   * = žádný (i u vsí uložených před zarůstáním).
   */
  woods?: VillageWood[];
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
  labor: { from: number; days: number; shares: RoadLaborShare[] };
  /** Jabloně vysazené hráčem podél úseků (roads.md – Vysazení jabloní); chybí = žádné. */
  apples?: RoadApple[];
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
  /** Porážka a uzení (listopad) – potřebné a odvedené člověkodny; chybí = žádná. */
  slaughterWork?: { required: number; done: number } | null;
}

/** Seno (oxen.md – Seno): zásoba, letošní seč a zima. */
export interface HayState {
  kg: number;
  /** Sečení (červen–červenec) – díly úhoru ve fázi louky v pořadí seče; null = letos se neseče. */
  mowing: HayMowing | null;
  /**
   * Zima (listopad–březen): kolik sena voli potřebovali a dostali do včerejška – pokrytí rozhodne
   * o jarní orbě a úhynu (oxen.md). Chybí mimo zimu.
   */
  winter?: { oxenNeedKg: number; oxenEatenKg: number };
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
 * Ohrada s přístřeškem (oxen.md) – čtverec 15 × 15 m, spřežení volů a výcvik nového. Stavba
 * a rádlo jsou stavby (`Construction.penId`).
 */
export interface Pen {
  id: number;
  cell: TileCell;
  /** Střed čtverce ve světě (m). */
  x: number;
  z: number;
  /** Den dostavění; dokud se staví, null. */
  builtDay: number | null;
  /** Vycvičené spřežení (2 voli) – den, kdy začalo orat; úhyn vola ho rozpadne. */
  team: { readyDay: number } | null;
  /** Výcvik dvou telat – den zadání (spřežení za OXEN.trainingYears let a s hotovým rádlem). */
  training: { startDay: number } | null;
  /** Překážky na čtverci (id z vrstvy) – zmizí se zahájením stavby. */
  obstacles?: number[];
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
  };
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
