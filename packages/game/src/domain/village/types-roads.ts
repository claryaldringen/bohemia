// Typy stavu vsi – Pevné cesty, stromy u cest a vozová síť.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { LaborTarget } from './types-chronicle';

/** Bod osy pevné cesty ve světě (m, na centimetry). */
export interface RoadPoint {
  x: number;
  z: number;
}

/**
 * Stupeň pevné cesty (roads.md – Vylepšení cesty): vyšlapaná (vznikne sama), upravená, hať
 * s lávkou a vozová cesta (staví hráč – roads.md, Vozová cesta: vlastní přímější trasa se zemními
 * pracemi a zpevněnými kolejemi).
 */
export type RoadGrade = 'trodden' | 'improved' | 'causeway' | 'wagon';

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
  /**
   * Zemní práce vozových cest (roads.md – Vozová cesta): profil osy s navrženými výškami pláně –
   * terén se v úvozu sníží a v náspu zvedne (`terrainEditsOf` – čistá funkce stavu). Zůstávají
   * i bez cesty (úvoz je v krajině). Chybí = žádné.
   */
  earthworks?: RoadEarthwork[];
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
