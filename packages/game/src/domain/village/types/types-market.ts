// Typy trhu – ceny v mincovní míře, zápočet tržního dne, trh ve vsi hostitele a výprava na trh
// (markets.md – Pravidla 2, 3, 4, 5 a 8, Rozhodnutí plánu 2, body 2–7). Rozcestník je `types.ts`;
// tento soubor jen drží část typů.

import type { Craft } from './types-crafts';
import type { TradedHorse } from './types-livestock';
import type { Person, Sex } from './types-people';
import type { Direction8 } from './types-state';
import type { CartGood, HorseGood, PeopleGood, TradeGood, TradeGoods, TripBy } from './types-trade';

/**
 * Ceny trhu v mincích za kg, kus nebo m³ (markets.md – Rozhodnutí plánu 2, bod 3): trh si pamatuje
 * cenu každého zboží, které na něm bylo; chybí = výchozí cena (`initialPrice`).
 */
export type MarketPrices = Partial<Record<TradeGood, number>>;

/**
 * Strana tržního dne (markets.md – Pravidla 3 a 5): hostitelská ves nebo výprava – co nabízí
 * (`offer`) a co shání (`wants`, seznam bez cenových mezí). Pořadí stran je pořadí prodávajících
 * i kupujících: napřed hostitel, pak výpravy podle příjezdu (Martin 22. 11. 2026).
 */
export interface MarketParty {
  key: string;
  offer: TradeGoods;
  wants: TradeGoods;
}

/** Obchod tržního dne: prodávající dal kupujícímu `amount` kg, kusů nebo m³ zboží. */
export interface MarketTrade {
  seller: string;
  buyer: string;
  good: TradeGood;
  amount: number;
}

/**
 * Obchody dne v pořadí přidělení; offered / wanted = součty celých nabídek a seznamů (pro cenu).
 */
export interface MarketClearing {
  trades: MarketTrade[];
  offered: TradeGoods;
  wanted: TradeGoods;
}

/**
 * Co hostitelská ves na trhu nabízí a shání (markets.md – Rozhodnutí plánu 2, bod 5): jen
 * makrokomodity výhledu dávek.
 */
export interface MarketStance {
  offer: TradeGoods;
  wants: TradeGoods;
}

/** Příjezd obchodníka na trh vsi: odkud, v který den a s jakým zbožím (markets.md – Pravidla 8). */
export interface MarketArrivalNote {
  name: string;
  /** Domovská ves obchodníka (kvůli maskování jmen cizímu správci); starší záznamy bez ní. */
  villageId?: string;
  day: number;
  goods: TradeGood[];
  /** Přišel kovář kovat koně (`MarketArrival.service`) – ne obchodník s hřivnami; jinak chybí. */
  smith?: true;
  /**
   * Přijeli cizí kupci (Rozhodnutí plánu 4, body 5 a 8) – jméno je prázdné a ves chybí, kupec žádnou
   * nemá; jinak chybí.
   */
  merchants?: true;
}

/**
 * Kůň na trhu (markets.md – Rozhodnutí plánu 2, bod 4): druh, pod kterým se prodává (počty po
 * druzích jdou zápočtem), a kus s věkem a výcvikem – kupující dostane tytéž koně.
 */
export interface MarketHorse {
  good: HorseGood;
  horse: TradedHorse;
}

/**
 * Vůz na trhu (markets.md – Rozhodnutí plánu 3, bod 4): druh, pod kterým se prodává, a stáří
 * (`builtDay` z vozu prodejce) – kupující dostane vůz s tímtéž stářím, neprodaný se vrátí domů
 * stejně starý.
 */
export interface MarketCart {
  good: CartGood;
  builtDay: number;
}

/**
 * Kus lidí na trhu (markets.md – Rozhodnutí plánu 3, bod 10): rodina, nebo jeden svobodný muž či
 * žena – druh, pod kterým se prodává (počty po druzích jdou zápočtem), a celé záznamy osob s id
 * vsi, odkud jsou. Lidé jsou vždy právě na jednom místě: odejdou ze vsi (`takePeople`), prodaní se
 * usadí u kupujícího s novými id (`settlePeople`), neprodaní se vrátí domů s původními
 * (`restorePeople`).
 */
export interface MarketPerson {
  good: PeopleGood;
  people: Person[];
  /**
   * Skupinu prodal sám hostitel trhu (`settleTrades` – ne jiná výprava), lidé nesou jeho id
   * (Rozhodnutí plánu 3, bod 13): zanikne-li domovská ves kupujícího, vrátí se hostiteli s původními
   * id (`stranded-people` – `own`). Chybí = vlastní lidé výpravy nebo koupení od jiné výpravy.
   */
  fromHost?: true;
}

/**
 * Služba, se kterou výprava přijela (markets.md – Rozhodnutí plánu 3, bod 9): kovář jde okovat
 * `horses` jezdeckých koní vsi, která se ptala (`smith-ask`). Výprava se službou do zápočtu
 * nevstupuje – hřivny kováře se na trhu neprodají.
 */
export interface MarketService {
  kind: 'shoeing';
  horses: number;
}

/**
 * Výprava přijela na trh vsi – tělo události schránky `market-arrive` (markets.md – Pravidla 2
 * a 3, Rozhodnutí plánu 2, body 2 a 6).
 */
export interface MarketArrival {
  /** Klíč výpravy `market:<domovská ves>:<id výpravy>`. */
  key: string;
  fromVillageId: string;
  fromName: string;
  /** Dní na trhu (tržní dny příjezd … příjezd + `stayDays` − 1). */
  stayDays: number;
  /** Dní cesty domů – výsledek dojde v den po posledním tržním dni + `travelDays`. */
  travelDays: number;
  /** Co výprava veze na prodej – koně i tady jako počty po druzích. */
  goods: TradeGoods;
  /** Koně výpravy po kusech. */
  horses: MarketHorse[];
  /** Vozy výpravy po kusech se stářím (chybí = výprava z doby před stářím vozů). */
  carts?: MarketCart[];
  /**
   * Lidé na prodej po skupinách (Rozhodnutí plánu 3, bod 10) – už odešli ze vsi (`takePeople`);
   * počty po druzích jsou i v `goods`. Chybí = žádní.
   */
  people?: MarketPerson[];
  /** Co výprava shání (seznam bez cenových mezí – Martin 22. 11. 2026). */
  wants: TradeGoods;
  /** Zpráva na pivo o domovské vsi – „obchodník, který přijel k nám“ (Pravidla 8). */
  report: VillageReport;
  /**
   * Směr od domovské vsi k hostiteli (`MarketTarget.firstStep`; Rozhodnutí plánu 3, bod 7).
   * Chybí = příjezd z doby před ním.
   */
  firstStep?: Direction8;
  /** Kovář jde kovat koně (Rozhodnutí plánu 3, bod 9); chybí = obyčejná výprava na trh. */
  service?: MarketService;
  /**
   * Partner jde za hledajícím (Rozhodnutí plánu 3, bod 11) – je v `people`, ale zbožím není (do
   * `goods` se nepočítá); chybí = obyčejná výprava na trh.
   */
  kin?: MarketKin;
  /**
   * Kdo výpravu poslal (`TripBy`; Rozhodnutí plánu 4 – opravné kolo): výprava vesničanů v mincovní
   * fázi jen prodává, mince neutrácí (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“).
   * Chybí = hráč (nebo příjezd z doby před příznakem).
   */
  by?: TripBy;
  /**
   * Kapacita šperkaře, kterou si výprava veze (g; gold.md – Pravidla 4, Rozhodnutí plánu 6, bod 6 –
   * `tripJewelleryG`): nejvýš kov v nákladu, ve vsi o ni ubylo. Chybí = žádná (i výprava vesničanů).
   */
  jewelleryG?: number;
}

/**
 * Za kým jde partner výpravy `kin` (markets.md – Rozhodnutí plánu 3, body 11 a 12): id hledajícího
 * ve vsi hostitele; `extraWife` – další manželka muže rodu.
 */
export interface MarketKin {
  seekerId: number;
  extraWife?: true;
}

/**
 * Výprava nebo cizí kupec (`merchant`) na trhu vsi hostitele (markets.md – Pravidla 3): v pořadí
 * příjezdu (`order`) prodává a kupuje každý tržní den až do `lastDay` včetně, pak odjede.
 */
export interface MarketVisitor {
  key: string;
  fromVillageId: string;
  fromName: string;
  /** Směr od domovské vsi výpravy k hostiteli (`MarketArrival.firstStep`); chybí = neznámý. */
  firstStep?: Direction8;
  /** Pořadí příjezdu – mezi přespolními prodává a kupuje dřív, kdo přijel dřív (Martin). */
  order: number;
  arrivedDay: number;
  /** Poslední tržní den výpravy – večer odjede. */
  lastDay: number;
  travelDays: number;
  /** Co zbývá prodat (koně jako počty po druzích). */
  goods: TradeGoods;
  /** Neprodaní koně výpravy po kusech. */
  horses: MarketHorse[];
  /** Neprodané vozy výpravy po kusech se stářím. */
  carts?: MarketCart[];
  /** Neprodaní lidé výpravy po skupinách (Rozhodnutí plánu 3, bod 10); chybí = žádní. */
  people?: MarketPerson[];
  /** Co zbývá koupit. */
  wants: TradeGoods;
  /** Co výprava na trhu prodala a koupila (součty za všechny tržní dny). */
  sold: TradeGoods;
  bought: TradeGoods;
  /** Koupení koně po kusech. */
  boughtHorses: MarketHorse[];
  /** Koupené vozy po kusech se stářím. */
  boughtCarts?: MarketCart[];
  /** Koupení lidé po skupinách – s výpravou půjdou do její vsi; chybí = žádní. */
  boughtPeople?: MarketPerson[];
  /**
   * Výrobky, jejichž hotovou zakázku výprava vyzvedla (Rozhodnutí plánu 3, bod 6) – hostitel jí je
   * při odjezdu znovu nezapíše (`recordOrders`). Chybí = žádné.
   */
  pickedUp?: OrderGood[];
  /**
   * Kovář, který přišel kovat koně (`MarketArrival.service`; Rozhodnutí plánu 3, bod 9) – do zápočtu
   * nevstupuje, poplatek má v `bought`, spotřebované hřivny v `sold`. Chybí = obyčejná výprava.
   */
  service?: MarketService;
  /**
   * Partner, který šel za hledajícím (nevěsta, ženich, další manželka – Rozhodnutí plánu 3, body 11
   * a 12; `MarketArrival.kin`): po příjezdu se usadí (`receiveKin`), doprovod do zápočtu nevstupuje
   * a večer posledního dne odjede s prázdným výsledkem. Chybí = obyčejná výprava.
   */
  kin?: MarketKin;
  /**
   * Cizí kupec, ne výprava z jiné vsi (markets.md – Rozhodnutí plánu 4, body 2 a 5) – nemá domovskou
   * ves (`fromVillageId` a `fromName` prázdné), v mincovní fázi kupuje první, na rušném trhu zůstane
   * déle (`extendMerchants`) a odjede bez pošty (`departVisitors`). Chybí = výprava.
   */
  merchant?: true;
  /**
   * Kdo výpravu poslal (`MarketArrival.by` – vesničané, správce `steward`, kovář, ves partnera);
   * chybí = hráč (nebo příjezd z doby před příznakem).
   */
  by?: TripBy;
  /**
   * Mince, které na tomto trhu zaplatila a dostala (součty za všechny tržní dny, `payCoins`;
   * markets.md – Rozhodnutí plánu 4, bod 9) – jen do kroniky návratu, měšec je `goods.coins`.
   * Cizí kupec je nemá (domů nic neposílá). Chybí = 0.
   */
  coinsPaid?: number;
  coinsGot?: number;
  /**
   * Kapacita šperkaře, kterou výprava veze (g; gold.md – Pravidla 4; z příjezdu – `joinMarket`):
   * v mincovní fázi s ní prodá zlato dráž a mincemi zaplatí víc, spotřebovaná ubude (`coinPhase`),
   * zbytek jde domů ve výsledku (`MarketResult.jewelleryG`). Chybí = žádná.
   */
  jewelleryG?: number;
}

/**
 * Výrobek dílny, na který jde zakázka (markets.md – Rozhodnutí plánu 3, bod 6): nástroje, keramika,
 * dřevěné nářadí, hřivny a vozy.
 */
export type OrderGood =
  'tools' | 'pottery' | 'woodTools' | 'ironBars' | 'twoWheelCarts' | 'fourWheelCarts';

/**
 * Zakázka u hostitele (`VillageMarket.orders`; markets.md – Rozhodnutí plánu 3, bod 6): ves
 * kupujícího, zboží, množství a den zápisu (odjezd výpravy). `readyDay` – den, kdy ji zásoba nad
 * vlastní potřebou pokryla a hostitel ji ohlásil (`order-ready`); chybí = ještě ne.
 */
export interface CraftOrder {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
  day: number;
  readyDay?: number;
}

/**
 * Zakázka kupujícího (`VillageState.orders`; markets.md – Rozhodnutí plánu 3, bod 6): ves
 * hostitele, zboží, množství, den výsledku výpravy a stav – `open` (hostitel ji vzal), `ready`
 * (hostitel ji ohlásil jako hotovou), `refused` (výprava zboží nekoupila ani neobjednala).
 */
export interface PlacedOrder {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
  day: number;
  status: 'open' | 'ready' | 'refused';
}

/**
 * Ohlášení hotové zakázky – tělo zprávy `order-ready` pro kupujícího (markets.md – Rozhodnutí
 * plánu 3, bod 6): `villageId` a `name` jsou hostitel.
 */
export interface OrderReady {
  villageId: string;
  name: string;
  good: OrderGood;
  amount: number;
}

/**
 * Trh vsi (markets.md – Pravidla 3 a 4, Rozhodnutí plánu 2): ceny, výpravy na trhu a paměť
 * příjezdů obchodníků. Chybí = na trhu ještě nikdo nebyl.
 */
export interface VillageMarket {
  /** Ceny trhu po posledním tržním dni; chybí = výchozí cena. */
  prices: MarketPrices;
  /**
   * Hladina trhu (markets.md – Rozhodnutí plánu 4, bod 3): kolik mincí proti zboží na trhu je – cena
   * v mincích = cena × hladina (`coinPriceOf`), posune ji jen mincovní fáze (`nextLevel`). Nejméně 1;
   * chybí = 1.
   */
  level?: number;
  /** Výpravy a cizí kupci, kteří na trhu stojí, v pořadí příjezdu. */
  visitors: MarketVisitor[];
  /** Pořadí příští výpravy nebo kupce, který přijede. */
  nextOrder: number;
  /** Posledních `MARKET.report.traders` příjezdů, pořadí zápisu. */
  arrivals: MarketArrivalNote[];
  /**
   * Zakázky u řemeslníků vsi (markets.md – Rozhodnutí plánu 3, bod 6) – jedna na ves a zboží,
   * v pořadí zápisu; chybí = žádné.
   */
  orders?: CraftOrder[];
  /**
   * Herní rok posledního zápisu kroniky o příjezdu kupců (`merchants-arrived` – jen první příjezd
   * v roce, návrh Clauda); chybí = ještě žádný.
   */
  merchantsYear?: number;
}

/**
 * Výsledek trhu pro výpravu – tělo události schránky `market-result` domovské vsi (markets.md –
 * Pravidla 3, Rozhodnutí plánu 2, bod 6). Vzniká jen v `marketResult`.
 */
export interface MarketResult {
  key: string;
  sold: TradeGoods;
  bought: TradeGoods;
  /**
   * Co se neprodalo a jde domů (koně jako počty po druzích) – i mince, které výprava při odjezdu má
   * (měšec `unsold.coins`; markets.md – Rozhodnutí plánu 4, bod 9).
   */
  unsold: TradeGoods;
  /** Koně domů po kusech – neprodaní i koupení. */
  horses: MarketHorse[];
  /** Vozy domů po kusech se stářím – neprodané i koupené (počty jsou i v `unsold` a `bought`). */
  carts?: MarketCart[];
  /**
   * Neprodaní vlastní lidé – doma dostanou zpět svá id (`restorePeople`; Rozhodnutí plánu 3, bod 10);
   * počty jsou i v `unsold`. Chybí = žádní.
   */
  people?: MarketPerson[];
  /**
   * Koupení lidé – doma se usadí s novými id (`settlePeople`); počty jsou i v `bought`. Chybí =
   * žádní.
   */
  newcomers?: MarketPerson[];
  /** Zpráva na pivo o hostiteli v den odjezdu. */
  report?: VillageReport;
  /** Ceny trhu v den odjezdu. */
  prices?: MarketPrices;
  /** Hladina trhu v den odjezdu (`VillageMarket.level`); chybí = 1. */
  level?: number;
  /** Hostitel zanikl – výprava se vrátila se vším, co drží. */
  returned?: true;
  /**
   * Zakázky, které hostitel při odjezdu výpravy zapsal (markets.md – Rozhodnutí plánu 3, bod 6);
   * chybí = žádné.
   */
  ordered?: TradeGoods;
  /**
   * Výprava, jak ji viděl hostitel – domovská ves, její jméno a směr od hostitele k ní
   * (`OPPOSITE[visitor.firstStep]`; markets.md – Rozhodnutí plánu 3, bod 13). Jen u výsledku
   * s lidmi, mincemi nebo zlatem (neprodaným i koupeným – gold.md, Rozhodnutí plánu 6, bod 9):
   * zanikne-li domovská ves, jdou lidé zpět k hostiteli (`stranded-people`) a kdo se u něj usadí,
   * přišel odtud. Chybí = výsledek bez nich, nebo výprava bez směru cesty.
   */
  origin?: { villageId: string; villageName: string; direction: Direction8 };
  /**
   * Mince, které výprava na trhu zaplatila a dostala (`MarketVisitor.coinsPaid`, `coinsGot`; jen
   * kladné) – do kroniky `market-returned`. V `sold` a `bought` nejsou: domů přijdou jen s měšcem
   * (`unsold.coins`) a podruhé by se připsaly. Chybí = žádné (i výsledek z doby před nimi).
   */
  coinsPaid?: number;
  coinsGot?: number;
  /**
   * Nepoužitá kapacita šperkaře výpravy (g; `MarketVisitor.jewelleryG` při odjezdu, u nepoužitého
   * příjezdu `MarketArrival.jewelleryG`; jen kladná) – doma ji `addJewellery` přičte až po zboží
   * a uloženou ořízne na kov vsi. Zboží to není: se zaniklou domovskou vsí zanikne (Rozhodnutí plánu
   * 6, bod 6). Chybí = žádná.
   */
  jewelleryG?: number;
}

/**
 * Dotaz na kováře – tělo zprávy `smith-ask` (markets.md – Rozhodnutí plánu 3, bod 9): ves s koňmi
 * po termínu bez vlastního kováře se ptá vsi okolí s kovářem. Klíč `smith:<ves>:<den>`, ves, která
 * se ptá, jak daleko je (`cells`) a první krok cesty od ní ke kováři (`firstStep`), kolik koní
 * a zpráva na pivo o ní (posel „zašel na pivo“ – Rozhodnutí plánu 3, bod 2).
 */
export interface SmithAsk {
  key: string;
  fromVillageId: string;
  fromName: string;
  cells: number;
  firstStep: Direction8;
  horses: number;
  report: VillageReport;
}

/**
 * Kdo hledá partnera v jiné vsi (markets.md – Rozhodnutí plánu 3, body 11 a 12): id ve vsi, která se
 * ptá, pohlaví, den narození, vdova či vdovec (`isWidowed` – větší věkový rozdíl) a `extraWife` –
 * muž rodu hledá další manželku.
 */
export interface KinSeeker {
  personId: number;
  sex: Sex;
  bornDay: number;
  widowed: boolean;
  extraWife?: true;
}

/**
 * Dotaz na nevěstu, ženicha nebo další manželku – tělo zprávy `kin-ask` (markets.md – Rozhodnutí
 * plánu 3, bod 11): klíč `kin:<ves>:<den>:<id hledajícího>`, ves, která se ptá, jak daleko je
 * (`cells`) a první krok cesty od ní k vsi partnera (`firstStep`), kdo hledá a zpráva na pivo o ní
 * (posel „zašel na pivo“ – Rozhodnutí plánu 3, bod 2).
 */
export interface KinAsk {
  key: string;
  fromVillageId: string;
  fromName: string;
  cells: number;
  firstStep: Direction8;
  seeker: KinSeeker;
  report: VillageReport;
}

/**
 * Zpráva trhu pro jinou ves (markets.md – Rozhodnutí plánu 2, bod 6; Rozhodnutí plánu 3, bod 6 –
 * ohlášení hotové zakázky `order-ready`, bod 9 – dotaz na kováře `smith-ask`, bod 11 – dotaz na
 * partnera `kin-ask`; všechny tři zprávy bez nákladu). `stranded-people` (bod 13) – lidé a mince
 * (Rozhodnutí plánu 4, bod 9) z výsledku pro zaniklou domovskou ves jdou zpět k hostiteli: `key`
 * výsledku, `own` = skupiny, které prodal sám hostitel (`MarketPerson.fromHost` – vrátí se
 * s původními id), `people` = ostatní (vlastní lidé výpravy, koupení od jiné výpravy – usadí se
 * s novými id), `coins` = celé mince, které hostitel dostane (`unsold.coins`; chybí = žádné),
 * `from` = `MarketResult.origin`. Zapíše ji pošta rovnou do schránky hostitele
 * (`deliverVillageMail`, `returnStrandedPeople`), v odchozí schránce nebývá. U příjezdu a výsledku je
 * `from` id vsi, která zprávu vydala (Rozhodnutí plánu 4, bod 10) – doplní ho pošta při zápisu do
 * schránky, v odchozí schránce a u starších řádků chybí; úklid schránky podle něj pozná, kdo by zprávu
 * mohl poslat znovu (`pruneSettledMail`).
 */
export type MarketMailBody =
  | { kind: 'market-arrive'; arrival: MarketArrival; from?: string }
  | { kind: 'market-result'; result: MarketResult; from?: string }
  | { kind: 'order-ready'; ready: OrderReady }
  | { kind: 'smith-ask'; ask: SmithAsk }
  | { kind: 'kin-ask'; ask: KinAsk }
  | {
      kind: 'stranded-people';
      key: string;
      people: MarketPerson[];
      own?: MarketPerson[];
      coins?: number;
      /** Zlato (g) výsledku: neprodané i koupené (`unsold.gold + bought.gold`); chybí = žádné. */
      gold?: number;
      from: MarketResult['origin'];
    };

/**
 * Zpráva v odchozí schránce vsi (`VillageState.outbox`) – do schránky vsi `villageId` na den `day`
 * s jedinečným `ref` (stejný tvar jako nová událost schránky, `NewVillageEvent`).
 */
export interface VillageMail {
  villageId: string;
  day: number;
  ref: string;
  body: MarketMailBody;
}

/**
 * Zpráva na pivo o jiné vsi (markets.md – Pravidla 8): od obchodníka, který přijel k nám, nebo
 * od vlastní výpravy, která se vrátila – ta přinese i ceny a hladinu trhu.
 */
export interface VillageNews {
  villageId: string;
  name: string;
  report: VillageReport;
  prices?: MarketPrices;
  /** Hladina trhu (`MarketResult.level`; Rozhodnutí plánu 4, bod 3); chybí = 1. */
  level?: number;
}

/**
 * Co hráč výpravě na trh zadá (markets.md – Pravidla 2 a 3; Martin 22. 11. 2026: „Výprava bude
 * mít určeno, jak dlouho na místě zůstane.“): zboží na prodej `give` (koně jako počty po druzích),
 * seznam `wants` (bez cenových mezí) a celé dny na trhu `stayDays`.
 */
export interface MarketOrder {
  give: TradeGoods;
  wants: TradeGoods;
  stayDays: number;
}

/**
 * Kam výprava na trh jede (markets.md – Rozhodnutí plánu 2, body 2 a 6): hostitelská ves, kolik
 * políček mapy světa je daleko, první krok cesty (karavana ve scéně jde ke kraji mapy v tom směru)
 * a domovská ves výpravy (klíč výpravy a jméno pro hostitele).
 */
export interface MarketTarget {
  villageId: string;
  name: string;
  cells: number;
  firstStep: Direction8;
  homeVillageId: string;
  homeName: string;
}

/**
 * Výprava na trh na cestě (`TradeExpedition.market` – markets.md, Rozhodnutí plánu 2, body 2
 * a 6): klíč `market:<domovská ves>:<id výpravy>`, hostitelská ves, seznam, dny pobytu a cesty
 * tam, den příjezdu na trh a `returnDay` – první den doma (lidé a vozy jsou pryč ve dnech
 * `startedDay` … `returnDay` − 1). Zboží přijde s výsledkem trhu (`applyMarketResult`).
 */
export interface MarketTrip {
  key: string;
  villageId: string;
  name: string;
  wants: TradeGoods;
  stayDays: number;
  travelDays: number;
  arriveDay: number;
  returnDay: number;
  /**
   * Vycvičení voli bez vozu, kteří jdou s výpravou a potáhnou koupené vozy domů (markets.md –
   * Rozhodnutí plánu 3, bod 4; `oxenForCarts` ze seznamu) – pryč jako voli vozů výpravy
   * (`oxenAway`), v `returnDay` je `marketTripsDay` smaže. Chybí = žádní.
   */
  oxen?: number;
  /**
   * Kolik kg obilí ze seznamu je osivo (výprava vesničanů za osivem – markets.md, Rozhodnutí plánu 3,
   * bod 7; fields.md – Osivo pro ves bez zásob): koupené obilí do této míry ves nesní, výsledek ho
   * přidá do rezervy osiva (`reservedSeedKg`), zbytek jde do zásob. Chybí = žádné.
   */
  seedKg?: number;
}

/**
 * Svobodný ve vsi okolí, který by šel za partnerem odjinud (`kinCandidates`; markets.md – Rozhodnutí
 * plánu 3, body 1 a 11) – jen pohlaví a věk po 5 letech (`ageFrom` = 5 × floor(věk ÷ 5)), veřejná
 * zpráva jako na pivu.
 */
export interface NearbySingle {
  sex: Sex;
  ageFrom: number;
}

/**
 * Ves okolí (markets.md – Rozhodnutí plánu 3, bod 1): ves na jedné z 8 sousedních map, kolik
 * políček mapy světa je daleko a první krok cesty k ní (jako `MarketTarget`); `singles` – její
 * svobodní ze souhrnu vsi (`VillageDigest.singles`, bod 11), chybí = nikdo (i okolí zapsané dřív).
 */
export interface NearbyVillage {
  villageId: string;
  name: string;
  cells: number;
  firstStep: Direction8;
  singles?: NearbySingle[];
}

/**
 * Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): snímek žijících vsí na 8 sousedních mapách –
 * i vsí téhož hráče –, který ves dostane událostí schránky `nearby` a další snímek ho celý nahradí.
 * Simulace nezná ostatní vsi ani své id; vesničané se podle okolí rozhodují uvnitř dne.
 */
export interface VillageNearby {
  /** Den, kdy ves okolí dostala (událost `nearby`). */
  day: number;
  self: { villageId: string; name: string };
  /** Vsi na 8 sousedních mapách, řazené podle `cells`, pak `villageId`. */
  villages: NearbyVillage[];
}

/** Zpráva na pivo o vsi (markets.md – Pravidla 8). */
export interface VillageReport {
  day: number;
  people: number;
  houses: number;
  crafts: Craft[];
  traders: MarketArrivalNote[];
  /**
   * Den příštího příjezdu cizích kupců (≥ den zprávy; Rozhodnutí plánu 4, bod 8); chybí = ves nemá
   * zastávky stezky nebo žádný příjezd do konce světa.
   */
  merchants?: number;
}

/** Zastávka dálkové stezky ve vsi – spojení, kterým vede (markets.md – Rozhodnutí plánu 4, bod 5). */
export interface MerchantStop {
  /** `<blok x>,<blok y>,<E|N>` – spojení uzlů kostry. */
  key: string;
  /** `deriveSeed(worldSeed, 'merchants:' + key)`. */
  seed: number;
  /** Pořadí políčka vsi na cestě od prvního uzlu (0 … `length` − 1). */
  index: number;
  /** Políček cesty spojení (i oba uzly). */
  length: number;
}
