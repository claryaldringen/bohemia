// Typy stavu vsi – Stav vsi, cesta vsi, sousedé a stezka.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { ChronicleEvent, LaborDay } from './types-chronicle';
import type { StewardState } from './types-steward';
import type { Construction, FarmSeason } from './types-construction';
import type { Fortification, ThreatSignal } from './fortification/types';
import type {
  Cart,
  CharcoalUse,
  CraftStocks,
  DraftState,
  KilnRemnant,
  OrePit,
} from './types-crafts';
import type {
  Cemetery,
  Field,
  FieldPart,
  GrainPit,
  GrainPitWork,
  Grove,
  ObstacleChange,
  Orchard,
  OrchardWork,
  SacredBuilding,
  SacredOak,
  SacredRuin,
  Sheaves,
  ThreshingFloor,
  VillageWood,
  WildTree,
} from './types-land';
import type {
  DietDay,
  FieldFoodYear,
  HappinessState,
  HayState,
  Horse,
  LivestockState,
  Ox,
  Pen,
} from './types-livestock';
import type {
  Ancestor,
  Dwelling,
  DwellingRuin,
  Emigrant,
  Guest,
  Prisoner,
  NeighborDirection,
  Person,
} from './types-people';
import type { CartDrive, RoadGrade, VillageRoads } from './types-roads';
import type { VillageRoutes } from './types-routes';
import type { CraftPurchase, VillageTrade } from './types-trade';
import type { WildlifeState } from './types-wildlife';
import type { DisasterState } from './types-disasters';

/**
 * Hromada klád (forest.md – Mýcení a hromada klád): klády z mýcení složené u cesty nejblíž místu
 * kácení, bez cesty v dosahu u místa kácení (`logPilePlace`); padlé kmeny po smršti leží, kde
 * stromy stály. Podmnožina `woodLogs` – zbytek bez hromady má jen ves před převodem
 * (`withRoadLogPiles`) a scéna ho kreslí u obydlí jako dřív.
 */
export interface LogStack {
  id: number; // z nextId
  /** Pole, z jehož klučení klády jsou (další klády téhož klučení přibývají sem); 0 = jiné mýcení. */
  fieldId: number;
  /**
   * Místo hromady (m, svět) – určí se při vzniku a nemění se: vedle cesty (`road`), bez cesty
   * v dosahu místo kácení (u klučení pole střed čtverce prvního dospělého stromu).
   */
  x: number;
  z: number;
  /** Bod osy cesty, u které hromada leží (klády čely k ní); chybí = hromada u místa kácení. */
  road?: { x: number; z: number };
  /**
   * Bývalá hromada u vsi (převod `withRoadLogPiles`): leží u tohoto obydlí na dnešním místě, po
   * jeho zániku u `x`, `z` (poloha obydlí). Chybí = ne.
   */
  dwellingId?: number;
  /** Hnije, proto neceločíselné. */
  logs: number;
}

/**
 * Hromada kamene (fortifications.md – Hradby a obrana, Kámen): kámen odklizený z polí, staveb
 * a ze skal složený u cesty jako klády (`stone.ts`). Podmnožina `stoneM3`.
 */
export interface StoneStack {
  /** Z `nextStoneStackId` – ne z `nextId`, aby se neposunula id ostatních věcí vsi. */
  id: number;
  /** Místo hromady (m, svět) – určí se při vzniku a nemění se. */
  x: number;
  z: number;
  /** Kámen na hromadě (m³), i neceločíselně (kámen z pole po desetinách). */
  m3: number;
  /** Bod osy cesty, u které hromada leží; chybí = hromada u místa sběru. */
  road?: { x: number; z: number };
}

/**
 * Lom na skalním výchozu (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026) –
 * dostavěný; kámen se v něm láme na zakázku (`quarry.ts`). Na výchozu nejvýš jeden lom.
 */
export interface Quarry {
  /** Id skalního výchozu ve vrstvě překážek – zároveň id lomu. */
  outcropId: number;
  /** Střed výchozu (m, svět) a natočení značky lomu (rad). */
  x: number;
  z: number;
  rotation: number;
  builtDay: number;
}

/** Postoj vsi: bránit se (stěna štítů), vzdát se při přesile (bílá vlajka), raději utéct (stromy). */
export type DefenseStance = 'defend' | 'surrender' | 'flee';

/** Obrana vsi – postoj nastavený hráčem. */
export interface VillageDefense {
  stance: DefenseStance;
}

/** Zpráva posla o cizím vojsku (`VillageState.armySeen`): den příchodu, tažení a odkud posel šel. */
export interface ArmySeen {
  day: number;
  campaignId: string;
  fromVillageId: string;
}

/**
 * Hromada osiva okna setí (fields.md – Osivo bez cíle osevu; Martin 9. 11. 2026): ozim v září–říjnu,
 * jař v březnu–dubnu (po dlouhé zimě do 14. 5.). Ideální denní díl je `totalKg` / `days`. Od
 * listopadu do konce února zimní osivo (`beforeWindow`; fields.md – Zimní osivo, Martin 9. 11. 2026).
 */
export interface SowingSeed {
  /** Obilí okna – ozim (podzim), nebo jař (jaro; i zimní osivo). */
  crop: 'winter' | 'spring';
  /** Osivo na všechny díly na řadě v první den okna (kg obilí; v zimě dnes). */
  totalKg: number;
  /** Dny setí okna od jeho prvního dne (bez dní, kdy dlouhá zima setí drží; v zimě 0). */
  days: number;
  /** Odložené osivo dnes (kg obilí ve `storesKg`, bez `reservedSeedKg`). */
  kg: number;
  /**
   * Zimní osivo – osivo na jarní díly na řadě, které ves drží od konce podzimního okna do začátku
   * jarního (listopad – únor); 1. 3. ho převezme hromada jarního okna. Chybí = hromada okna.
   */
  beforeWindow?: true;
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
  season: FarmSeason | null;
  threshingSeason: FarmSeason | null;
  storesKg: number;
  /**
   * Osivo ve `storesKg`, které ves má jen na setí a nesní ho (fields.md – Osivo ze zásob, Osivo pro
   * ves bez zásob): přinesené osadníky dceřiné vsi a koupené u sousedů. Do země smí i pod přežívací
   * zásobou (setí ho bere až po běžném zrnu nad ní); co do 1. 6. nezaseje, je obyčejné zrno. Chybí = žádné.
   */
  reservedSeedKg?: number;
  /**
   * Osivo zakladatelů první vsi (fields.md – Zásoby a nasycení, Start; FOUNDERS_STORES): před tímto
   * dnem se `reservedSeedKg` neuvolní 1. 6. ani 1. 12. a výhled zásob ho nepočítá za jídlo – slouží
   * na víc osevů. Ve skutečném hladu ves rezervu sní i dřív. Chybí = rezerva bez ochrany.
   */
  reservedSeedUntilDay?: number;
  /**
   * Hromada osiva okna setí (fields.md – Osivo bez cíle osevu; Martin 9. 11. 2026): obilí ve
   * `storesKg` odložené na setí v okně, které dnes běží, v zimě na jarní okno (zimní osivo). Ves
   * ho nejí; od konce jarního okna do září chybí.
   */
  sowingSeed?: SowingSeed;
  /**
   * Den, kdy do vsi naposledy přišlo jídlo domény (zásilka s `domain`; hillfort.md – Hradiště
   * staví hráč). Chybí = nikdy.
   */
  domainFoodDay?: number;
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
  /**
   * Voli bez ohrady (migration.md – Vůz při odchodu): přišli s vozem osadníků do vsi, která ještě
   * nemá ohradu volů – s první hotovou ohradou volů do ní přejdou (`looseOxenDay`), do té doby jen
   * žerou seno. Chybí = žádní.
   */
  looseOxen?: Ox[];
  /**
   * Koně bez ohrady (lord.md – Dělení vsi, Kůň syna): jezdecký kůň syna vojvody, který odvedl
   * díl vsi – čeká bez ohrady jako voli z vozu, žere seno (bez obilí), nejezdí se na něm a výcvik
   * stojí; s první hotovou ohradou koní s volným místem do ní přejde (`looseHorsesDay`). Chybí =
   * žádní.
   */
  looseHorses?: Horse[];
  /** Rozběhnutá sezónní práce v sadech (sklizeň, péče); chybí nebo null = žádná. */
  orchardWork?: OrchardWork | null;
  /**
   * Klády vsi celkem (forest.md – Mýcení a hromada klád) – z mýcení přibývají, stavby je berou,
   * hnijí (proto i neceločíselné). U vsí uložených před dřevem chybí (= 0).
   */
  woodLogs?: number;
  /**
   * Hromady klád u cest a u míst kácení – podmnožina `woodLogs` (klády bez hromady = woodLogs − Σ
   * logs má jen ves před převodem `withRoadLogPiles`). Chybí = žádné.
   */
  logStacks?: LogStack[];
  /**
   * Kámen vsi celkem v m³ (fortifications.md – Hradby a obrana, Kámen) – stavby hradeb ho berou
   * (`takeStone`). U vsí bez kamene chybí (= 0).
   */
  stoneM3?: number;
  /** Hromady kamene u cest – podmnožina `stoneM3` (`stone.ts`). Chybí = žádné. */
  stoneStacks?: StoneStack[];
  /** Id další hromady kamene (`StoneStack.id`); chybí = 1. */
  nextStoneStackId?: number;
  /** Dostavěné lomy vsi (`quarry.ts`). Chybí = žádný. */
  quarries?: Quarry[];
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
   * Humna (production-chains.md – Humno) – hotová i rozestavěná (`builtDay` null). U vsí
   * uložených dřív chybí (= žádné).
   */
  threshingFloors?: ThreshingFloor[];
  /**
   * Nevymlácené snopy (production-chains.md – Humno, Výmlat hned po žni): sklizeň jde do snopů,
   * výmlat je převádí do zásob obilí a luštěnin. U vsí uložených dřív chybí – převod
   * (`withThreshingGrace`) je doplní s ročním odkladem; nová ves začíná prázdnými.
   */
  sheaves?: Sheaves;
  /**
   * Den, kdy končí rok odkladu starší vsi (production-chains.md – Starší vsi): do něj (bez něj)
   * mlátí ves bez humna nouzově na udusané zemi; od něj platí podmínka humna. Nová ves ho nemá.
   */
  threshingGraceUntil?: number;
  /**
   * Ruce pro výmlat (člověkodny za den – production-chains.md, Humno, Výhled jídla): práce vsi
   * ve žních (`harvestLaborPerDay` – tatáž jako výhled práce `sowingCapacity`), spočítaná na
   * začátku dne simulace; podle ní výhled výmlatu do konce okna (`sheavesOutlook`). Chybí (ves
   * před prvním dopočítaným dnem) = výhled bez omezení rukou – výmlat dne.
   */
  threshHands?: number;
  /**
   * Obilné jámy (production-chains.md – Obilné jámy) – zapečetěné, otevřená a prázdné. Zásoba
   * obilí `storesKg` zůstává celá (zrno v jamách i mimo ně – na humně a doma); jámy jen říkají, kde
   * zrno leží a jak rychle ubývá. U vsí uložených dřív chybí – převod (`withGrainPits`) uloží
   * zásoby do jam; nová ves začíná bez jam (`[]`).
   */
  grainPits?: GrainPit[];
  /** Ukládání vymláceného obilí do jam (production-chains.md – Obilné jámy); chybí = nic nečeká. */
  grainPitWork?: GrainPitWork;
  /**
   * Dobytek (diet.md – Dobytek): stáda ovcí, koz, prasat a krav. U vsí uložených před dobytkem
   * chybí – výchozí stádo z domácností doplní `withLivestock` (nebo první dopočítaný den).
   */
  livestock?: LivestockState;
  /**
   * Divoká zvěř vsi (wildlife.md): stavy, strop z krajiny. U vsí uložených před zvěří chybí –
   * zvěř na stropu doplní `withWildlife`.
   */
  wildlife?: WildlifeState;
  /**
   * Kopie seedu počasí kraje – mapy (disasters.md – Kraj a ochrana nové vsi): všechny vsi mapy
   * počítají z něj totéž počasí samy (`yearWeather`). Dá ho server při načtení (`withWeatherSeed`);
   * ves bez něj (testy, kalibrace) má všechny roky normální. Klientovi se nikdy neposílá.
   */
  weatherSeed?: number;
  /** Přírodní pohromy vsi (disasters.md); chybí = žádné. */
  disasters?: DisasterState;
  /** Převod na zvěř selhal (zpráva chyby) – ves dostala výchozí krajinu; aplikace chybu zapíše do logu. */
  wildlifeFailed?: string;
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
   * Opevnění vsi (fortifications.md) – hotová i rozestavěná (úseky s `builtDay` null). U vsí
   * uložených dřív chybí (= žádné), nic se nepřevádí.
   */
  fortifications?: Fortification[];
  /**
   * Signály hrozby (fortifications.md – Hrozba): nájezdy, spatřená vojska, válka – zapisuje je
   * schránka (`threat-signal`), čte správce (`villageThreat`). Ves si pamatuje 50 let; chybí = žádné.
   */
  threats?: ThreatSignal[];
  /**
   * Hosté z jiných vsí na čas (plán 2026-11-03 – rozhodnutí 11): robota, později služba, zajetí,
   * ochrana. Zapisuje je schránka (`guests-arrive`), odcházejí v pevný den (`returnHome`). Chybí
   * = žádní.
   */
  guests?: Guest[];
  /**
   * Zajatci ve vsi (war.md – Vzdaní, zajetí a výkupné): muži rodu a šlechtici, které tažení odvedlo
   * (`campaign-return`). Jedí z jejích zásob (jako hosté druhu `captive`), nepracují a necvičí.
   * Chybí – nikdo.
   */
  prisoners?: Prisoner[];
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
   * Nástroje ve vybavení domácností (kg – production-chains.md, Nástroje jako vybavení
   * domácností): nejsou zásoba vsi, opotřebují se v užívání a kovář je doplňuje z hřiven; nákup
   * u sousedů je přidá sem. Pokrytí potřeby nástroji = vybavení ÷ potřeba (`craftCoverage`). Ves
   * uložená před hřivnami ho dostane ze zásoby nástrojů (`withToolEquipment`); chybí = 0.
   */
  toolEquipmentKg?: number;
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
   * Ves prošla převodem na osevní postup po dílech (`withSowingRotation`, fields.md – Osevní
   * postup po dílech, bod 7) – i ves bez ročního plánu; chybí = ještě ne.
   */
  sowingRotation?: true;
  /**
   * Převod na osevní postup selhal (zpráva chyby) – ves zůstala beze změny, jen se značkou
   * `sowingRotation`; aplikace chybu zapíše do logu (`updateVillage`).
   */
  sowingRotationFailed?: string;
  /** Převod starších ohrad koní na koně zdarma selhal (`withHorsePenStock`) – text chyby, do logu. */
  horsePenStockFailed?: string;
  /** Převod rozestavěných dílů v lese na fáze klučení selhal (`withForestClearing`) – text chyby, do logu. */
  forestClearingFailed?: string;
  /**
   * Stavby uložené před variantami rozměrů (population.md – Varianty rozměrů) prošly kontrolou,
   * jestli se do své varianty vejdou (`withDwellingShapes`) – nové vsi ho mají od založení.
   */
  shapesChecked?: true;
  /**
   * Otisk mapy tras (`routeMapKey` – stavby od postavení po zánik, paths.md, Stálé trasy,
   * pravidlo 5), pro který se naposledy spočítaly stálé trasy (vzdálenosti chůze po pěšinách
   * s nimi jen při jiném `walkDistanceKey`). Obsazenost ani obilné jámy v něm nejsou – obsazenost
   * jen převáží (`VillageRoutes.placesKey`).
   * Chybí, dokud se nespočítaly (starší vsi, simulace bez krajiny); otisk starší verze
   * (`WALK_VERSION`) se jednou přepočítá. (Dřívější otisk stadií `walkStages`
   * se při načtení smaže – `withoutWalkStages`.)
   */
  walkLayoutKey?: string;
  /**
   * Otisk vstupů vzdáleností chůze kromě pěšin (`walkDistanceKey` v `paths/village.ts` – obydlí,
   * pole, sady, pevné cesty, opevnění; paths.md – Obilné jámy a vzdálenosti chůze, Martin 9. 11.
   * 2026), pro který se naposledy změřily `FieldPart.walkDistanceM`, `OrchardSquare.walkDistanceM`,
   * `Dwelling.forestWalkM` a `waterWalkM`. Přepočet tras se stejným otiskem vzdálenosti nechá.
   * Chybí u vsí uložených dřív (změří je nejbližší přepočet tras) a bez sítě pěšin.
   */
  walkDistanceKey?: string;
  /**
   * Trasy sítě pěšin (paths.md – Kdy se trasy počítají a co se ukládá) – kudy kdo kam chodí,
   * spočítané s přepočtem chůze pro otisk `walkLayoutKey`. Chybí u vsí uložených dřív (doplní je
   * `withRoutes` při načtení) a ve vsích simulovaných bez krajiny.
   */
  routes?: VillageRoutes;
  /**
   * Jízda vozu pro vodu (wagons.md – Co vozy vozí): břeh nejblíž ohradě se spřežením, kam vůz
   * sjede (null = nesjede nikam – voda se nosí), spočítaný pro rozložení vsi `key` (klíč chůze
   * a ohrada – přepočítá se, když se změní). Chybí, dokud vůz pro vodu nejel.
   */
  waterCart?: { key: string; drive: CartDrive | null };
  /** Totéž pro čtyřkolák – širší oblouk, na zoraný díl ne (wagons.md – Co se vozí a na čem). */
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
   * Jámy po kopání rudy kovářů a hlíny hrnčířů (crafts.md – Uhlí a ruda kováře, Hlína hrnčíře) –
   * zarůstají SMITH_SUPPLY.pitYears let, pak zmizí. Chybí = žádné (i u vsí uložených před rudou).
   */
  orePits?: OrePit[];
  /**
   * Milířiště po rozebraných milířích uhlířů (crafts.md – Milíř u skácených buků): černá kruhová
   * plocha uhlíkaté zeminy – zarůstá CHARCOAL_BALANCE.remnantYears let, pak zmizí. Jen vzhled.
   * Chybí = žádná.
   */
  kilnRemnants?: KilnRemnant[];
  /**
   * Spotřeba uhlí kovářů (crafts.md – Rovnováha uhlíř – kovář) – klouzavě za posledních
   * CHARCOAL_BALANCE.windowDays dní; podle ní uhlíř začne další milíř a kovář si drží zásobu.
   * Měří se jen ve vsi s uhlířem; chybí = ještě se neměřila.
   */
  charcoalUse?: CharcoalUse;
  /**
   * Les vsi – čtverce polí, které zarostly lesem a z pole vypadly (fields.md – Zarůstání). Chybí
   * = žádný (i u vsí uložených před zarůstáním).
   */
  woods?: VillageWood[];
  /**
   * Náletové stromy opuštěných sadů (orchard.md – Zdivočelý sad). Chybí = žádné (i u vsí bez
   * opuštěného sadu).
   */
  wildTrees?: WildTree[];
  /**
   * Dvorec vojvody (trade.md – Dvorec vojvody): id obydlí (= domácnosti), které je dvorcem vsi –
   * v nové vsi první zemnice zakladatelů, ve starší vsi nejstarší obydlí (`withManor`). Odtud jdou
   * vylepšení vsi. Chybí u vsí uložených dřív – doplní ho `withManor` nebo první dopočítaný den.
   */
  manorId?: number;
  /**
   * Dočasně ubytované domácnosti (demolition.md – Obydlí s obyvateli): obyvatelé opuštěného nebo
   * zbouraného obydlí bydlí v cizích obydlích (`Person.dwellingId` = hostitel). Záznam drží, kdo
   * patří k jaké domácnosti a kam se má nastěhovat první – do nového obydlí. Chybí = nikdo.
   */
  displaced?: DisplacedHousehold[];
  /**
   * Režim vojvodovy rodiny (lord.md – Zakládání vsi, Kdy jde rodina na pole): chybí = rodina
   * pracuje jako ostatní (ves má málo dospělých mimo rodinu, i starší ves před výcvikem).
   */
  lord?: LordState;
  /**
   * Pokrytí péče o koně dnes 0–1 (horses.md – Péče): kolik z hodiny na koně dala práce vsi – bez
   * péče výcvik koně stojí. Chybí = ves bez koní.
   */
  horsesCaredToday?: number;
  /**
   * Dostali jezdečtí koně dnes obilí (horses.md – Krmení)? Lidé napřed – když ves šetří, nebo obilí
   * do sklizně nevystačí lidem i koním, koně ho nedostanou (seno 7 kg, výcvik polovičním tempem).
   * Chybí = ves bez koní.
   */
  horsesFed?: boolean;
  /**
   * Kování jezdeckých koní (horses.md – Kování): den posledního kování celé vsi; další termín
   * `lastDay + HORSE_SHOEING.everyDays`. Vznikne první den, kdy ves má jezdecké koně (termín se
   * počítá od něj – i u starších vsí), a zanikne, když je ves nemá. Chybí = ves bez jezdeckých koní.
   */
  shoeing?: { lastDay: number };
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
   * Rod vojvody (lord.md – Rod vojvody, fáze 1): dnešní vojvoda a vojvodové po sobě. Chybí – ves
   * uložená před rodem (`withDynasty` ji převede); `lords` prázdné – ves bez rodu (chová se jako
   * před rodem, končí jen vymřením).
   */
  dynasty?: DynastyState;
  /** Dovednosti nad stropem lovu (70) už jednou stažené na 70 (war.md – Síla; `withArmsCaps`). */
  armsCapped?: true;
  /**
   * Ves zůstala bez muže rodu a čeká na vojvodu z jiné vsi rodu (seniorate.md – Ves bez muže rodu –
   * dosazení vojvody): `sinceDay` = den, od kterého je bez vojvody; `appointee` = muž, který už
   * vyrazil (ves, kde žil, jeho číslo tam a den příjezdu). Chybí – ves nic nečeká (i starší vsi,
   * `withAwaitingLord` je převede jednou).
   */
  awaitingLord?: AwaitingLord;
  /**
   * Muži rodu, kteří do vsi přišli z jiné vsi rodu a dostali nové místní id (dosazení vojvody,
   * postoupení vsi) – podle toho hráčův rod najde svého muže (`followLineMoves`). Nejnovější
   * poslední, zachovává se `LINE_MOVES_KEPT` záznamů.
   */
  lineMoves?: LineMove[];
  /**
   * Ves řídí povýšený vesničan (vassalage.md – Povýšení vesničana): NPC rod `houseId` a číslo jeho
   * hlavy ve vsi. Ves dál patří hráči, rod hráče v ní nemá své muže (senior ani dosazení vojvody ji
   * nepočítá). Chybí – ves řídí rod hráče.
   */
  nobles?: { houseId: string; headId: number };
  /**
   * Správce vsi (steward.md – Stav správce): zapnutý, značka „postavil správce“, plán. Chybí –
   * správce vypnutý (`withSteward` ji převede).
   */
  steward?: StewardState;
  /**
   * Obrana vsi před cizím vojskem (war.md – Obránci – postoje a útěk): postoj, který hráč nastavil
   * dopředu. Chybí = výchozí `flee` (raději utéct).
   */
  defense?: VillageDefense;
  /**
   * Den nájezdu (war.md – Ves během nájezdu nepracuje): poslední den, kdy bylo na mapě vsi cizí
   * vojsko – lidé se ten den skrývají a ves nepracuje (`raidHiding`). Zapisuje ho schránka
   * (`raid-day`) na začátku dne; chybí – ves nájezd nezažila.
   */
  raidDay?: number;
  /**
   * Posel z jiné vsi rodu, kterou prošlo cizí vojsko (war.md – Obránci, Kdy): ves se podle postoje
   * zachová dřív, než vojsko spatří (`planDefense` – `warned`), u tažení `campaignId`. Zapisuje
   * schránka (`army-seen`); chybí – žádný posel.
   */
  armySeen?: ArmySeen;
  /**
   * Klíč založení vsi ze schránky odchodu syna (`settleStewardDepartures` – mateřská ves a id
   * záznamu): podle něj úložiště ves nezaloží dvakrát. Simulace ho nečte. Chybí – ves vznikla jinak.
   */
  origin?: string;
}

/** Rod vojvody ve vsi (lord.md – Rod vojvody). */
export interface DynastyState {
  /** Id dnešního vojvody (muž rodu); null – vojvoda není. */
  lordId: number | null;
  /** Vojvodové po sobě – pro kroniku rodu (kronika vsi se ořezává). */
  lords: LordRecord[];
  /** Den, kdy rod vymřel po meči (lord.md – Konec rodu); chybí – rod žije. */
  endedDay?: number;
  /**
   * Pojmenovaní muži rodu, kteří odešli (zemřeli) – jméno a otec; z nich se bere jméno po dědovi
   * či strýci (absence.md – Jména synů). Nejvýš `DECEASED_NAMES_MAX` nejnovějších; chybí – žádný.
   */
  deceased?: DeceasedLineMan[];
}

/** Zemřelý pojmenovaný muž rodu v `DynastyState.deceased`. */
export interface DeceasedLineMan {
  id: number;
  name: string;
  fatherId?: number;
}

/** Přesun muže rodu do vsi: odkud (ves a číslo osoby) a pod jakým číslem tu žije. */
export interface LineMove {
  fromVillageId: string;
  fromPersonId: number;
  personId: number;
  day: number;
}

/** Čekání vsi bez muže rodu na vojvodu z jiné vsi (`VillageState.awaitingLord`). */
export interface AwaitingLord {
  sinceDay: number;
  appointee?: { fromVillageId: string; personId: number; arrivesDay: number };
}

/** Vojvoda v kronice rodu – od kterého dne do kterého vládl (`toDay` chybí – vládne). */
export interface LordRecord {
  id: number;
  name?: string;
  fromDay: number;
  toDay?: number;
}

/** Cesta lidí na novou mapu – směr, den odchodu a příjezdu (migration.md – fáze 4). */
export interface VillageJourney {
  direction: Direction8;
  departedDay: number;
  /** Den příjezdu – od něj hráč umisťuje první zemnici. */
  arrivalDay: number;
  /**
   * Vůdce odchodu (lord.md – Dělení vsi: syn vojvody, nebo vojvoda s celou vsí) – po založení vsi
   * je jejím vojvodou (`Settlers.lordId`). Chybí = nejstarší muž rodu mezi osadníky.
   */
  lordId?: number;
  /** Ves založí syn (`Settlers.stewarded`) – správce od založení; chybí = vypnutý. */
  stewarded?: true;
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

/** Režim vojvodovy rodiny (lord.md) – uložený kvůli hysterezi, ať rodina nekmitá den po dni. */
export interface LordState {
  /** Rodina cvičí místo práce (`familyTrains` s hysterezí); chybí = pracuje jako ostatní. */
  trains?: true;
}

/** Vystěhovaná domácnost (`VillageState.displaced`). */
export interface DisplacedHousehold {
  /** Původní domácnost = id obydlí, ze kterého se lidé vystěhovali. */
  household: number;
  /** Den vystěhování – nejstarší záznam se nastěhuje první. */
  day: number;
  /** Lidé a obydlí, kde teď bydlí (hostitel). */
  people: { id: number; host: number }[];
}
