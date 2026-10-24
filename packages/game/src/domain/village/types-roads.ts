// Typy stavu vsi – Pevné cesty, stromy u cest a vozová síť.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { LaborTarget } from './types-chronicle';

/** Bod osy pevné cesty ve světě (m, na centimetry). */
export interface RoadPoint {
  x: number;
  z: number;
}

/**
 * Stupeň pevné cesty (roads.md – Vylepšení cesty): vyšlapaná (vznikne sama), upravená a vozová
 * cesta (staví hráč – roads.md, Vozová cesta: vlastní přímější trasa se zemními pracemi
 * a zpevněnými kolejemi). Hať přes mokřinu a lávka přes brod jsou součástí úpravy (Martin,
 * 24. 10. 2026) – upravená cesta je má, pokud není `unbridged`.
 */
export type RoadGrade = 'trodden' | 'improved' | 'wagon';

/**
 * Cesta s hatí přes mokřinu a lávkou přes brod (chůzí v mokřině ani na brodu neztrácí): upravená,
 * pokud není `unbridged`, a vozová cesta (hať jako zpevněné koleje, lávka pro pěší vedle brodu).
 */
export function roadBridged(road: { grade: RoadGrade; unbridged?: boolean | undefined }): boolean {
  return road.grade === 'wagon' || (road.grade === 'improved' && !road.unbridged);
}

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
   * Upravená cesta přes mokřinu nebo brod bez hatě a lávky (starší cesty upravené před tím, než
   * se hať a lávka staly součástí úpravy; roads.md – Vylepšení cesty). Dostaví je „Upravit cestu“.
   */
  unbridged?: true;
  /**
   * Provoz posledních let (cest za den – roční průměr, nejnovější poslední; nejvýš
   * ROADS.overgrowYears) – historie pro převod starých vsí a vyjížďky vozů; zarůstání řídí
   * stav kusů (`condition`).
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
   * Stav kusů osy (≈ ROADS.pieceM; paths.md – Zarůstání): střed kusu (m, na cm) a stav `c`
   * (`ROAD_DECAY`) jen u kusů pod plným stavem; kus bez záznamu je plný, chybí-li pole, je plná
   * celá cesta. Na nule kus zmizí (`roadsMonth`).
   */
  condition?: RoadConditionPiece[];
  /**
   * Opuštěný kus (paths.md – Stavba přes cestu): leží pod hotovou stavbou. Vypadne ze sítě –
   * není řetězem, partnerem souběžné cesty ani cílem napojení – a jen bledne, dokud nezmizí.
   */
  abandoned?: true;
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
   * Spojka dvou křižovatek (paths.md – Křižovatky): krátká cesta mezi dvěma křižovatkami, na které
   * se rozdělil uzel s 5+ cestami. Drží se jako živá (nezarůstá) a neohýbá se.
   */
  link?: true;
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

/** Stav kusu osy pevné cesty – střed kusu a stav (setiny cest za den × dny, `ROAD_DECAY`). */
export interface RoadConditionPiece {
  x: number;
  z: number;
  c: number;
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

/**
 * Vyšlapanost (paths.md – Vyšlapanost a vznik cesty): setiny cesty na políčko 7,5 m, sčítá se po
 * intervalech (`paths/wear.ts` – `settleWear`).
 */
export interface RoadWear {
  /** Den posledního sčtu – `cells` platí na jeho začátek. */
  day: number;
  /** Nenulová políčka – seřazené klíče, rozdíly a hodnoty jako varint v base64 (`encodeWear`). */
  cells: string;
  /** Práce od `day` po místech (člověkodny celkem) – v intervalu ji nesou trasy za prací. */
  labor: RoadLaborShare[];
}

/** Pevné cesty vsi (roads.md). */
export interface VillageRoads {
  /** Další id úseku, místa a stromu (strom: ROAD_TREE_ID_BASE + id). */
  nextId: number;
  roads: Road[];
  trees: RoadTree[];
  /**
   * Úseky roční sítě nad prahem z poslední roční kontroly před vyšlapaností (osy po ≈ 4 m). Cesty
   * z nich už nevznikají (vznik z vyšlapanosti – `roadsMonth`) a nic je nepíše; čte je jen převod
   * starší vsi – podél nich se zaseje vyšlapanost (`withWearSeed`). Smaže se s převodem cest
   * (plán cest v2, Úloha 14).
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
  /**
   * Provoz ke stavbám od `from` (paths.md – Vyšlapanost, chátrání staveb): cesto-dny (cesty za den
   * v setinách × dny) po klíči stavby (`<druh>:<id>`, `visitKey`), sčítá se z uložených tras po
   * intervalech jako vyšlapanost (`settleVillageWear`). Roční kontrola (1. 11.) z něj rozhodne,
   * kam se chodilo, a začne znovu. Starší ves ho dostane od dneška (`withVisitsSeed`) a rozhodne
   * se až po roce dat. Chybí = ještě neexistuje.
   */
  visits?: { from: number; byKey: [string, number][] };
  /**
   * Stav kusů cest je založený (`Road.condition`, paths.md – Převod starých vsí, bod 2): nová ves
   * ho má od začátku, starší ves ho dostane při načtení z historie provozu (`withRoadCondition`)
   * jednou. Chybí = ještě ne.
   */
  conditionSeeded?: true;
  /**
   * Hať a lávka jsou součástí úpravy (roads.md – Vylepšení cesty): nová ves to má od začátku,
   * starší ves ho dostane při načtení (`withBridgedRoads` – stupeň `causeway` se stane upravenou
   * cestou, upravená přes mokřinu nebo brod bez hatě dostane `unbridged`) jednou. Chybí = ještě ne.
   */
  bridgesSeeded?: true;
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
   * Otisk sítě po posledním měsíčním úklidu (paths.md – Síť – kotvy, pahýly a úklid): trasy
   * (`VillageRoutes.key`) a osy úseků – bez změny se úklid nepouští. Chybí = ještě neproběhl.
   */
  tidyKey?: number;
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
  /**
   * Zemní práce vozových cest (roads.md – Vozová cesta): profil osy s navrženými výškami pláně –
   * terén se v úvozu sníží a v náspu zvedne (`terrainEditsOf` – čistá funkce stavu). Zůstávají
   * i bez cesty (úvoz je v krajině). Chybí = žádné.
   */
  earthworks?: RoadEarthwork[];
  /** Vyšlapanost (paths.md – Vyšlapanost a vznik cesty); chybí = ještě se nesčítá. */
  wear?: RoadWear;
  /**
   * Křižovatky (paths.md – Křižovatky) – samostatné objekty v uzlech, kde se potkají 3–4 živé
   * cesty. Chybí = žádné (zapojí je Úloha 9b plánu cest v2).
   */
  junctions?: RoadJunction[];
}

/** Tvar křižovatky (paths.md – Křižovatky): kříž se 4 vchody, nebo Y se 3 vchody. */
export type JunctionShape = 'cross' | 'y';

/** Znamení křižovatky: strom (strom u cesty), vztyčený kámen, nebo dřevěný kůl. */
export type JunctionLandmarkKind = 'tree' | 'stone' | 'post';

/** Znamení – jednou vylosované (seed vsi a id křižovatky), zůstane, dokud křižovatka stojí. */
export interface JunctionLandmark {
  kind: JunctionLandmarkKind;
  /** Poloha (m, na cm) – v nejširší mezeře mezi rameny, `JUNCTION.landmarkGapM` za vchody. */
  x: number;
  z: number;
  /** Natočení modelu (rad, celé stupně v [0, 2π)). */
  turn: number;
  /** Podoba kamene nebo kůlu (1–`JUNCTION.landmarkLooks`). */
  look: number;
  /** Strom – id v `VillageRoads.trees` (roste jako strom u cesty). */
  treeId?: number;
}

/** Křižovatka (paths.md – Křižovatky; Martin, #6, pravidlo 9). */
export interface RoadJunction {
  id: number;
  /** Střed (m, na cm). */
  x: number;
  z: number;
  shape: JunctionShape;
  /** Natočení (rad, [0, 2π)) – směr ramene 0 od středu (u Y kmen). */
  rotation: number;
  /** β (rad) – úhel větví Y od směru proti kmeni (30–60° po 5°); u kříže chybí. */
  spread?: number;
  /** Id úseku ve vchodu každého ramene (pořadí `junctionArmDirs`), null = rameno bez cesty. */
  arms: (number | null)[];
  landmark: JunctionLandmark;
  bornDay: number;
}

/** Bod profilu vozové cesty – osa (m, na cm) a navržená výška pláně (m, na cm). */
export interface RoadProfilePoint {
  x: number;
  z: number;
  y: number;
}

/** Úsek stavby vozové cesty – konec (m od začátku osy), práce (čd) a den dostavění. */
export interface RoadEarthworkPiece {
  toM: number;
  manDays: number;
  /** Den dostavění (úsek je pevná cesta – `Road` stupně `wagon`); dokud se staví, null. */
  builtDay: number | null;
}

/**
 * Zemní práce vozové cesty (roads.md – Vozová cesta): osa od vsi ven s navrženou výškou pláně
 * v každém bodě (po ≈ WAGON_ROAD.profileStepM), úseky stavby a body osy v brodu (tam se terén
 * neupravuje – brod zůstává brodem). Terén scény i sítí upravuje jen hotová část osy a rozestavěný
 * úsek podle průběhu (`terrainEditsOf`).
 */
export interface RoadEarthwork {
  id: number;
  profile: RoadProfilePoint[];
  pieces: RoadEarthworkPiece[];
  /** Indexy bodů profilu v brodu (vzestupně); chybí = žádné. */
  fords?: number[];
  /** Den zadání stavby. */
  startedDay: number;
  /** Stavba (id), dokud se staví; pak chybí. */
  constructionId?: number;
}

/** Druh vozu (wagons.md – Vůz): dvoukolák (svoz), čtyřkolák (obchod – hůř se otáčí). */
export type CartKind = 'two-wheel' | 'four-wheel';

/**
 * Jízda vozu, když nesváží úrodu, seno ani klády (wagons.md – Co vozy vozí): uhlí z milíře ke
 * kováři, ruda z rudiště do kovárny (crafts.md – Uhlí a ruda kováře), hlína z hliniště k hrnčíři
 * (crafts.md – Hlína hrnčíře), osivo na pole, voda v sudech – v tomto pořadí přednosti
 * (CART_JOBS.order).
 */
export type CartJob = 'charcoal' | 'ore' | 'clay' | 'seed' | 'water';

/**
 * Jízda vozu od ohrady se spřežením k cíli (wagons.md – Co vozy vozí): cena trasy vozové sítě (m
 * jízdy po louce – cesta levněji, svah a strniště dráž) a kde trasa končí (m – sem jezdí jízdy do
 * ročního provozu cest).
 */
export interface CartDrive {
  costM: number;
  x: number;
  z: number;
  /** Kolik metrů trasy vede přes osetý díl pole (podle id dílu) – vůz tam pošlapává úrodu. */
  sown?: { partId: number; m: number }[];
}

/** Jízdy vozů k jednomu cíli za rok cest (wagons.md – Vozová síť). */
export interface RoadCartTrips {
  x: number;
  z: number;
  kind: CartKind;
  trips: number;
  /** Metry trasy přes osetý díl, když je známe (voda) – jinak je najde `flushCartTrips`. */
  sown?: { partId: number; m: number }[];
  /** Díly, které vůz právě sklízí nebo seje (cíl jízdy) – ty se nepošlapávají. */
  spare?: readonly number[];
}

/** Deník jízd vozů za den – zapíše je `flushCartTrips` (provoz cest, pošlapání úrody). */
export type CartTripLog = RoadCartTrips[];

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
