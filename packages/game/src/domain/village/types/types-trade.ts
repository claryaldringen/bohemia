// Typy stavu vsi – zboží obchodu, výpravy na cestě a zásilky.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { CartKind } from './types-roads';
import type { TradedHorse } from './types-livestock';
import type { MarketTrip } from './types-market';
import type { Person, Sex } from './types-people';
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
 * Vozy na trhu (markets.md – Rozhodnutí plánu 3, bod 4): dvoukoláky a čtyřkoláky – kusy, volné vozy
 * vsi; prodá se nejmladší volný vůz druhu, kupující dostane vůz nový (`cartGoodKind`).
 */
export type CartGood = 'twoWheelCarts' | 'fourWheelCarts';

/**
 * Zboží obchodu (trade.md – Sousedé): jen to, co ves sama má – obilí, maso, sýr, luštěniny (kg),
 * dobytek (kusy – krávy, mladí a vycvičení voli – `CattleGood`), klády (kusy), keramika, železné
 * hřivny, uhlí (kg). Nástroje (`tools`) jsou od 20. 10. 2026 vybavení domácností – od plánu 3
 * trhu se zase prodávají a kupují rovnou z vybavení a do něj, dřevěné nářadí (`woodTools`) ze
 * zásoby tesaře a vozy (`CartGood`, kusy) z volných vozů vsi (markets.md – Rozhodnutí plánu 3,
 * bod 4); nástroje ve starších výpravách k sousedovi po stezce převede na hřivny
 * `withIronBarsTrade` (production-chains.md – Kovář). Zboží zvenku (sůl, železo, med, kožešiny)
 * obchod od 19. 10. 2026 nezná (Martin: „Nech jen společné suroviny, nezaváděj nové.“) – starší
 * vsi o něj přijdou (`withoutForeignGoods`).
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
  | 'tools'
  | 'woodTools'
  | CartGood
  | 'ironBars'
  | 'charcoal'
  | 'stone'
  | 'honey'
  | 'hides'
  | 'furs'
  | 'wax';

/** Množství zboží (jen uvedené druhy, kg nebo kusy podle druhu). */
export type TradeGoods = Partial<Record<TradeGood, number>>;

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
 * Výprava nosičů k sousedovi (trade.md – Obchod): zboží, které nesou tam (už odebrané ze zásob
 * vsi), a co přinesou zpět; nosiči a práce (lidé × dny ze společné práce vsi). Zboží dorazí, až se
 * nosiči vrátí (odvedená práce = celá cena).
 */
export interface TradeExpedition {
  id: number;
  /**
   * Druh výpravy: `'shipment'` = zásilka do vsi jiného hráče (vassalage.md – Doprava a cílová
   * ves; `dispatchShipment`) – nosiči a honáci se vrátí bez zboží, zboží a lidé dojdou schránkou
   * cílové vsi. `'market'` = výprava na trh jiné vsi (markets.md – Rozhodnutí plánu 2, body 1, 2
   * a 6; `departMarket`) – lidé a vozy pryč v pevné dny (`market.returnDay`), zboží přijde
   * s výsledkem trhu schránkou (`applyMarketResult`). Chybí = obchod se sousedem po stezce. Zásilka
   * ani výprava na trh nemá stezku (`trailId` −1).
   */
  kind?: 'shipment' | 'market';
  /**
   * Zásilka a výprava na trh: kolik políček mapy světa výprava urazí a kam první krok (karavana
   * ve scéně).
   */
  destination?: { cells: number; firstStep: Direction8 };
  /** Výprava na trh (`kind` `'market'`): kam, s jakým seznamem a kdy je doma. */
  market?: MarketTrip;
  /**
   * Zásilka: id řádku `shipment` v databázi (application/shipments.ts) – značka, že zboží už ze
   * vsi odešlo; obnova po pádu podle ní pozná, že zásilku stačí dopsat do schránky.
   */
  shipmentId?: string;
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
   * v den odchodu, v pořadí hříbata, klisny, jezdečtí koně. Chybí = žádní.
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
  /**
   * Vozy vsi, které s nákupem jedou (id) – náklad na voze místo nosičů, s každým vozem honák
   * a pomocník (crafts.md – Nákup u sousedů, Vozy); vozy i jejich voli jsou do návratu pryč. Chybí =
   * skupina jde pěšky.
   */
  carts?: number[];
  /**
   * Vůz, který ves u souseda s tesařem kupuje (crafts.md – Nákup u sousedů, Vozy) – voli ho táhnou
   * domů (dvoukolák jeden, čtyřkolák pár) a jsou se skupinou do návratu pryč. Chybí = žádný.
   */
  cart?: CartKind;
}

/**
 * Výpravy vsi na cestě (markets.md – Pravidla 10): výprava k dřívějšímu sousedovi uložená před
 * koncem smyšlených sousedů a zásilky vazalů. Zbytky roku sousedů (`neighbours`) smazal převod
 * `withoutFictionalNeighbours`.
 */
export interface VillageTrade {
  expeditions: TradeExpedition[];
  /** Další id výpravy. */
  nextId: number;
}

// --- pevné cesty (roads.md) ------------------------------------------------------------------

/**
 * Co zásilka veze (kronika, souhrn): obilí a seno (kg), klády, dobytek po druzích, koně (kusy)
 * a lidé (rodiny, muži, ženy).
 */
export interface ShipmentManifest {
  grainKg: number;
  hayKg: number;
  logs: number;
  cattle: Record<CattleGood, number>;
  horses: number;
  people: TradePeople;
  /** Kámen (m³); starší zásilky ho nemají. */
  stoneM3?: number;
}

/**
 * Tělo události schránky `shipment` (vassalage.md – Doprava a cílová ves; plán – rozhodnutí 10):
 * zboží a lidé, kteří dojdou do cílové vsi. Koně putují jako kusy s věkem a výcvikem, lidé jako
 * skuteční lidé ve skupinách (rodina, svobodný muž či žena) – stejní, jen s novými místními id
 * (`rehomePeople`). `key` je id zásilky, `direction` odkud přišli (odkud je odesílatel, vzhledem
 * k cílové vsi).
 */
export interface ShipmentBody {
  key: string;
  fromVillageId: string;
  fromName: string;
  direction: Direction8;
  /** K čemu zásilka slouží (dávka, dar, půjčka…) – jen popisek do kroniky. */
  purpose?: string;
  /** Zásilka se vrací odesílateli (cíl zanikl) – kronika to řekne. */
  returned?: true;
  /**
   * Jídlo domény (hillfort.md – Jídlo domény; Martin 8. 11. 2026): dobytek se v cílové vsi hned
   * porazí do zásob masa a do stád se nepřidá. Chybí = obyčejná zásilka.
   */
  domain?: true;
  grainKg: number;
  hayKg: number;
  logs: number;
  /** Kámen (m³); zásilky z doby před kamenem ho nemají. */
  stoneM3?: number;
  cattle: Record<CattleGood, number>;
  horses: TradedHorse[];
  /** Skupiny lidí s původními údaji (id patří vsi odesílatele). */
  groups: ShipmentGroup[];
}

/** Skupina lidí v zásilce – rodina, nebo svobodný muž či žena. */
export interface ShipmentGroup {
  kind: NewcomerGroup;
  people: Person[];
}
