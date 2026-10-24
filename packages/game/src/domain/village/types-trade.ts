// Typy stavu vsi – Obchod se sousedy.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { TradedHorse } from './types-livestock';
import type { Sex } from './types-people';
import type { Direction8 } from './types-state';

/**
 * Dobytek v obchodu (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s dobytkem by také
 * mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se vycvičit)
 * a vycvičené voly“): krávy (do stáda skotu), mladí voli (do ohrady volů na výcvik) a vycvičení
 * voli (do ohrady volů, táhnou hned) – kusy. Dřív jeden druh `cattle` = krávy (`withCattleKinds`).
 */
export type CattleGood = 'cows' | 'youngOxen' | 'trainedOxen';

/**
 * Koně v obchodu (horses.md – Nákup a prodej; Martin 23. 10. 2026: koně jde nakupovat a prodávat
 * jako ostatní zvířata; druhy návrh Clauda): hříbata (do 3 let), chovné klisny a jezdečtí koně –
 * kusy, do ohrady koní. Jezdecký kůň má cenu za kus podle výcviku (`horseValueKg`).
 */
export type HorseGood = 'foals' | 'mares' | 'ridingHorses';

/**
 * Zboží obchodu (trade.md – Sousedé): jen to, co ves sama má – obilí, maso, sýr, luštěniny (kg),
 * dobytek (kusy – krávy, mladí a vycvičení voli – `CattleGood`), klády (kusy), keramika, železné
 * hřivny, uhlí (kg). Nástroje od 20. 10. 2026 nejsou zboží obchodu – jsou vybavení domácností, na
 * obchod jdou hřivny (production-chains.md – Kovář; starší vsi `withIronBarsTrade`). Zboží zvenku (sůl, železo, med, kožešiny) obchod od 19. 10. 2026 nezná (Martin: „Nech
 * jen společné suroviny, nezaváděj nové.“) – starší vsi o něj přijdou (`withoutForeignGoods`).
 */
export type TradeGood =
  | 'grain'
  | 'meat'
  | 'cheese'
  | 'legumes'
  | CattleGood
  | HorseGood
  | 'logs'
  | 'pottery'
  | 'ironBars'
  | 'charcoal';

/**
 * Zboží v povaze souseda (NEIGHBOURS.kinds): zboží obchodu, nebo dobytek vcelku (`cattle`) – ten
 * se podle druhu souseda rozloží na krávy a voly (`NEIGHBOURS.cattleKinds`, `neighbourOf`).
 */
export type NeighbourGood = Exclude<TradeGood, CattleGood | HorseGood> | 'cattle';

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
  /**
   * Kolikrát vozy výpravy jedou tam a zpět (wagons.md – Obchod, Opakované jízdy vozu); `days` je
   * součet všech jízd. Chybí = jedna jízda (výprava uložená dřív).
   */
  trips?: number;
  /** Dny cesty tam a zpět i s cestou za krajem mapy (všechny jízdy dohromady). */
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
  /**
   * Koně, které výprava přivede (horses.md – Nákup a prodej) – věk a výcvik z nabídky souseda
   * v den odchodu (`offeredHorses`), v pořadí hříbata, klisny, jezdečtí koně. Chybí = žádní.
   */
  horses?: TradedHorse[];
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
