// Výprava na trh – domovská ves (markets.md – Pravidla 2 a 3; Rozhodnutí plánu 2, body 1, 2 a 6).
// Hráč pošle výpravu se zbožím na prodej, seznamem a dny pobytu (`departMarket`); výprava je druh
// karavany (`TradeExpedition.kind` `'market'`, bez stezky). Nosiči, honáci a vozy se spřežením jsou
// pryč v pevné dny cesty a pobytu (Martin 22. 11. 2026: „Po tu dobu bude samozřejmě pracovní síla
// chybět ve zdrojové vsi … ráno se vyrazí a večer vrátí“) – práce v okně dní (`expeditionLaborNeed`
// v trade.ts), vozy doma od `returnDay` (`marketTripsDay`). Příjezd jde do odchozí schránky vsi
// k hostiteli (market.ts – `joinMarket`), výsledek trhu přijde schránkou domů a výpravu uzavře
// (`applyMarketResult`). Kontroly výpravy jsou na jednom místě (`checkMarketTrip`) – volá je server
// i náhled ve webu. Vozy na trhu (Rozhodnutí plánu 3, bod 4): prodaný vůz nejede jako dopravní,
// koupený táhnou domů voli, kteří jdou s výpravou (`MarketTrip.oxen`). Lidé na trhu (bod 10) odejdou
// ze vsi jako tytéž osoby (`takePeople`), nosiči nejsou a s výsledkem se vrátí neprodaní
// (`restorePeople`) a přijdou koupení (`settlePeople`). Mince výpravy (Rozhodnutí plánu 4, bod 4) jsou
// jen ty v nákladu: při odjezdu ubydou vsi, na trhu se platí z nich a co neutratí, vrátí se domů
// v `unsold` – ze zásoby vsi se za výpravu podruhé neplatí.
import { TOTAL_GAME_DAYS } from '../../calendar';
import { cloneState } from '../core/clone';
import { cartOxen, cartsWithOxen, tradeHomeCarts } from '../crafts/carts';
import { ironTripHelpers } from '../crafts/cart-iron';
import { purchaseTravelers } from '../crafts/craft-buying';
import { oxenHome } from '../livestock/oxen';
import { awayFromWork, isAdult } from '../people/people';
import { CARTS, MARKET, TRADE, TRADE_GOOD_VALUES } from '../rules';
import type {
  CartKind,
  ChronicleEvent,
  MarketCart,
  MarketHorse,
  MarketKin,
  MarketOrder,
  MarketPerson,
  MarketResult,
  MarketService,
  MarketTarget,
  MarketTrip,
  TradeGoods,
  TradePeople,
  TripBy,
  VillageState,
} from '../types';
import {
  CART_GOODS,
  COIN_GOOD,
  HORSE_GOODS,
  PEOPLE_GOODS,
  TRADE_GOODS,
  cartGoodKind,
  isCartGood,
  isCattleGood,
  isHorseGood,
  isPeopleGood,
  isPieceGood,
} from './goods';
import { reservedSeedKg } from '../fields/seed';
import { rememberOrders } from './craft-orders';
import { addHorses, takeHorses } from './horse-trade';
import { marketArrivalRef, rememberNews } from './market';
import {
  leavingGroups,
  restorePeople,
  settlePeople,
  takePeople,
  withoutGroups,
} from './market-people';
import { emigrantList } from './people-trade';
import { addGood, addMarketCarts, expeditionLaborNeed, takeCarts, villageGoodStock } from './trade';
import { villageReport } from './village-report';

const EPSILON = 1e-9;

export const MARKET_STAY = 'Na trhu se zůstává aspoň den.';
export const MARKET_OVER_STOCK = 'Tolik ves nemá.';
export const MARKET_BAD_ORDER = 'Objednávka nemá správný tvar.';
export const MARKET_NO_PEOPLE = 'Na výpravu ves nemá dost dospělých.';
export const MARKET_NO_OXEN = 'Koupený vůz by domů neměl kdo táhnout.';
export const MARKET_WORLD_END = 'Výprava by se do konce světa nevrátila.';

/**
 * Dny cesty na trh tam (markets.md – Rozhodnutí plánu 2, bod 2): ves na sousední mapě je ráno tam
 * a večer zpět (0 dní), každá další mapa přidá `MARKET.daysPerCell` tam (a tolik zpět).
 */
export function marketTravelDays(cells: number): number {
  return Math.max(0, cells - MARKET.dayTripCells) * MARKET.daysPerCell;
}

/** Kopie zboží jen s kladnými položkami v pořadí `TRADE_GOODS`. */
function positiveGoods(goods: TradeGoods): TradeGoods {
  const out: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (amount > 0) out[good] = amount;
  }
  return out;
}

/**
 * Lidé jedné cesty se zbožím `goods` a vozy `carts` (jedna jízda): s každým vozem
 * `CARTS.tradeCrew` lidí; na vozy kg zboží (nosič unese `TRADE.porterKg`), pak celé klády (kládu
 * bez vozu nesou `TRADE.logCarriers`); co se na vozy nevejde, nesou lidé; dobytek a koně ženou
 * honáci (`TRADE.headsPerDrover`, `TRADE.horsesPerDrover`). Kámen se nakládá jako u zásilky vazala
 * (`shipment.ts`): na každý započatý náklad čtyřkoláku `CARTS.tradeCrew` lidí, na vozy výpravy
 * nezáleží.
 */
function legCrew(goods: TradeGoods, carts: readonly CartKind[]): number {
  let kg = 0;
  let logs = 0;
  let stone = 0;
  let heads = 0;
  let horses = 0;
  for (const good of TRADE_GOODS) {
    const amount = goods[good] ?? 0;
    if (!(amount > 0)) continue;
    if (isCattleGood(good)) heads += amount;
    else if (isHorseGood(good)) horses += amount;
    else if (good === 'logs') logs += amount;
    else if (good === 'stone') stone += amount;
    else kg += amount * TRADE_GOOD_VALUES[good].carryKg;
  }
  let room = carts.reduce((sum, kind) => sum + CARTS.loadKg[kind], 0);
  const kgOnCarts = Math.min(kg, room);
  room -= kgOnCarts;
  const logsOnCarts = Math.min(logs, Math.floor(room / TRADE_GOOD_VALUES.logs.carryKg + EPSILON));
  const porters = Math.max(0, Math.ceil((kg - kgOnCarts) / TRADE.porterKg - EPSILON));
  const logCarriers = Math.max(0, Math.ceil(logs - logsOnCarts - EPSILON)) * TRADE.logCarriers;
  const stoneLoads = Math.ceil(
    (stone * TRADE_GOOD_VALUES.stone.carryKg) / CARTS.loadKg['four-wheel'] - EPSILON,
  );
  const stoneCrew = Math.max(0, stoneLoads) * CARTS.tradeCrew;
  const drovers =
    Math.max(0, Math.ceil(heads / TRADE.headsPerDrover - EPSILON)) +
    Math.max(0, Math.ceil(horses / TRADE.horsesPerDrover - EPSILON));
  return carts.length * CARTS.tradeCrew + porters + logCarriers + stoneCrew + drovers;
}

/**
 * Jedna jízda (Rozhodnutí 2): vozy z `carts` (v pořadí tradeCarts) vezou kg zboží a klády,
 * CARTS.tradeCrew lidí s každým vozem; zbytek nosiči TRADE.porterKg, klády bez vozu
 * TRADE.logCarriers, honáci TRADE.headsPerDrover / horsesPerDrover, kámen po nákladech čtyřkoláku
 * jako u zásilky vazala; porters = max(cesta tam s give, zpět s wants), aspoň 1; zvolí počet vozů
 * s nejméně lidmi, při shodě méně vozů.
 */
export function marketCrew(
  give: TradeGoods,
  wants: TradeGoods,
  carts: readonly CartKind[],
): { porters: number; carts: number } {
  let best = { porters: Math.max(1, legCrew(give, []), legCrew(wants, [])), carts: 0 };
  for (let n = 1; n <= carts.length; n++) {
    const used = carts.slice(0, n);
    const porters = Math.max(1, legCrew(give, used), legCrew(wants, used));
    if (porters < best.porters) best = { porters, carts: n };
  }
  return best;
}

/**
 * Voli na koupené vozy ze seznamu `wants` (markets.md – Rozhodnutí plánu 3, bod 4): Σ
 * `cartOxen(druh)` × kusy – dvoukolák táhne jeden, čtyřkolák dva (oxen.md – Potah). Jdou
 * s výpravou bez vozu a koupené vozy dovedou domů; hráč je nezadává, spočítá je server i náhled.
 */
export function oxenForCarts(wants: TradeGoods): number {
  return CART_GOODS.reduce(
    (sum, good) => sum + cartOxen(cartGoodKind(good)) * (wants[good] ?? 0),
    0,
  );
}

/**
 * Vozy doma bez vozů, které výprava prodá (`give`): z každého druhu posledních `give[g]` – v pořadí
 * `tradeHomeCarts` (druh, pak id) nejmladší volné, tytéž, které při odjezdu prodá `addGood` →
 * `removeIdleCart`. Prodaný vůz odjede bez spřežení jako prodaní voli a dopravní není.
 */
function withoutSoldCarts<T extends { kind: CartKind }>(
  homeCarts: readonly T[],
  give: TradeGoods,
): T[] {
  const out = [...homeCarts];
  for (const good of CART_GOODS) {
    const kind = cartGoodKind(good);
    let sold = give[good] ?? 0;
    for (let i = out.length - 1; i >= 0 && sold > 0; i--) {
      if (out[i]!.kind !== kind) continue;
      out.splice(i, 1);
      sold--;
    }
  }
  return out;
}

/** Zboží má správný tvar: čísla konečná a nezáporná, kusové zboží celé (server je autorita). */
function goodsShapeOk(goods: TradeGoods): boolean {
  for (const [good, amount] of Object.entries(goods)) {
    if (amount === undefined) continue;
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (isPieceGood(good as keyof TradeGoods) && !Number.isInteger(amount)) return false;
  }
  return true;
}

/**
 * Objednávka má správný tvar: zboží obou seznamů (`goodsShapeOk`) a mince jen v „Dáš“ – na seznam
 * „Dostaneš“ se nedávají, prodávající je bere za cokoli, co nabízí (markets.md – Rozhodnutí plánu 4,
 * bod 1).
 */
function orderShapeOk({ give, wants }: MarketOrder): boolean {
  return goodsShapeOk(give) && goodsShapeOk(wants) && !((wants[COIN_GOOD] ?? 0) > 0);
}

/** Vstup kontroly bez stavu vsi – server ho skládá ze stavu, web z pohledu dvorce (Úloha 7). */
export interface MarketTripCheck {
  /** Kolik ves má každého zboží z `give` (`villageGoodStock`). */
  stock: TradeGoods;
  /**
   * Druhy vozů doma v pořadí `tradeHomeCarts`, bez ohledu na voly (jede jen, co voli utáhnou;
   * prodané vozy z `give` – poslední svého druhu – nejedou).
   */
  homeCarts: readonly CartKind[];
  /**
   * Vycvičení voli doma (`oxenHome`) – prodaní voli z `give` vůz netáhnou; koupené vozy táhnou
   * voli, kteří zbudou po dopravních vozech.
   */
  oxenHome: number;
  /** Volní dospělí v den odjezdu (`marketFreeAdults`) – nosiči jsou lidé vsi. */
  adults: number;
  /** Kolik políček mapy světa je hostitel daleko. */
  cells: number;
  /** Dnešek – den odeslání (dnešek vsi je už spočtený). */
  day: number;
  /**
   * Kovář jde sám (markets.md – Rozhodnutí plánu 3, bod 9): bez nosičů a vozů (porters 0, carts 0),
   * bez kontroly volných dospělých – je pryč jako `Person.away` (`'craft'`), práce výpravy 0.
   * Chybí = výprava s posádkou (`marketCrew`).
   */
  alone?: true;
}

export type MarketCheck =
  | {
      ok: true;
      porters: number;
      carts: number;
      /** Voli bez vozu, kteří jdou s výpravou pro koupené vozy (`oxenForCarts(wants)`). */
      oxen: number;
      travelDays: number;
      departDay: number;
      arriveDay: number;
      returnDay: number;
    }
  | { ok: false; reason: string };

/**
 * Jediné místo kontrol výpravy (markets.md – Rozhodnutí plánu 2, bod 2) – volá ho planMarketTrip
 * i náhled ve webu. V pořadí: pobyt celé dny, nejméně `MARKET.minStayDays`; zboží `give` nejvýš,
 * co ves má (`stock` – chovné krávy ani koně pod jezdci se tak prodat nedají); prodané vozy nejedou
 * jako dopravní (`withoutSoldCarts`); napřed se rezervují voli pro koupené vozy (`oxenForCarts`,
 * nestačí-li voli po prodeji, `MARKET_NO_OXEN`; Rozhodnutí plánu 3, bod 4) a dopravní vozy jedou jen
 * s ostatními voly (`cartsWithOxen`); nosiči nejvýš volní dospělí; tvar objednávky (konečná
 * nezáporná čísla, kusy celé, mince ne v seznamu – `orderShapeOk`) napřed; návrat před koncem světa.
 * Prázdné `give` i `wants` jsou dovolené (výprava „na pivo“). Mince v `give` (Rozhodnutí plánu 4,
 * bod 4) jdou týmiž kontrolami – celé kusy, nejvýš zásoba – a nic neváží; nákup za ně drží nosnost
 * cesty domů, protože nosiče určuje celý seznam `wants` (`marketCrew`) a koupit jde nejvýš on. Kovář,
 * který jde sám (`alone`), nebere nosiče ani vozy a volné dospělé se nekontroluje (Rozhodnutí
 * plánu 3, bod 9). Data: výprava vyrazí ráno dne po odeslání (`departDay`), na trh přijde po dnech
 * cesty (`arriveDay`), tržní dny `arriveDay` … `arriveDay` + pobyt − 1, `returnDay` je první den doma.
 */
export function checkMarketTrip(order: MarketOrder, input: MarketTripCheck): MarketCheck {
  if (!orderShapeOk(order)) return { ok: false, reason: MARKET_BAD_ORDER };
  if (!Number.isInteger(order.stayDays) || order.stayDays < MARKET.minStayDays) {
    return { ok: false, reason: MARKET_STAY };
  }
  for (const good of TRADE_GOODS) {
    const amount = order.give[good] ?? 0;
    if (amount > 0 && amount > (input.stock[good] ?? 0)) {
      return { ok: false, reason: MARKET_OVER_STOCK };
    }
  }
  // voli pro koupené vozy jsou rezervovaní napřed – dopravní vozy jedou jen s ostatními; prodaní
  // voli ani prodaný vůz nejedou (vůz jede jen se svými voly)
  const oxen = input.oxenHome - (order.give.trainedOxen ?? 0);
  const reserved = oxenForCarts(order.wants);
  if (reserved > oxen) return { ok: false, reason: MARKET_NO_OXEN };
  // kovář jde sám – bez nosičů a vozů, volní dospělí se nekontrolují
  const crew = input.alone
    ? { porters: 0, carts: 0 }
    : marketCrew(
        order.give,
        order.wants,
        cartsWithOxen(
          withoutSoldCarts(
            input.homeCarts.map((kind) => ({ kind })),
            order.give,
          ),
          oxen - reserved,
        ).map((cart) => cart.kind),
      );
  if (!input.alone && crew.porters > input.adults) return { ok: false, reason: MARKET_NO_PEOPLE };
  const travelDays = marketTravelDays(input.cells);
  const departDay = input.day + 1;
  const arriveDay = departDay + travelDays;
  const returnDay = arriveDay + order.stayDays + travelDays;
  if (returnDay >= TOTAL_GAME_DAYS) return { ok: false, reason: MARKET_WORLD_END };
  return {
    ok: true,
    ...crew,
    oxen: reserved,
    travelDays,
    departDay,
    arriveDay,
    returnDay,
  };
}

export type MarketPlan =
  (Extract<MarketCheck, { ok: true }> & { cartIds: number[] }) | { ok: false; reason: string };

/**
 * Volní dospělí v den odjezdu (`day` + 1): dospělí vsi bez lidí pryč (`awayFromWork`) bez lidí na
 * výpravách, které jsou na cestě i zítra (`expeditionLaborNeed`), na nákupech u sousedů
 * a s vozy pro kování – stejné lidi bere `expeditionLaborToday`. Nosiči výpravy jsou nejvýš oni;
 * pomocník je jeden a použije ho i náhled ve webu.
 */
export function marketFreeAdults(state: VillageState, day: number): number {
  const adults = state.people.filter((p) => isAdult(p, day) && !awayFromWork(p, day)).length;
  const busy =
    expeditionLaborNeed(state, day + 1) + purchaseTravelers(state) + ironTripHelpers(state);
  return Math.max(0, adults - busy);
}

/** Lidé na prodej výpravy a volní nosiči bez nich (`marketTripPeople`). */
export interface MarketTripPeople {
  /** Kolik skupin každého druhu s celým `give` doopravdy odejde. */
  stock: TradePeople;
  /** Volní dospělí bez odcházejících (`marketFreeAdults`). */
  adults: number;
}

/**
 * Lidé na prodej výpravy se zbožím `give` (markets.md – Rozhodnutí plánu 3, bod 10): kolik skupin
 * druhu odejde (`leavingGroups` – rodiny, muži a ženy berou z týchž lidí) a volní dospělí nad
 * mělkou kopií vsi bez nich – nosičem není nikdo z prodávaných. Bere to kontrola výpravy
 * (`planMarketTrip`) a náhled ve webu se na to ptá serveru pro vybrané počty (návrh Clauda, plán 3,
 * Úloha 11): výběr je postupný a pořadí mužů a žen se s odchodem rodin a mužů mění (přeplnění
 * domů), takže model všech kombinací by stál (F+1)·(M+2) výběrů. Stav nemění.
 */
export function marketTripPeople(
  state: VillageState,
  day: number,
  give: TradeGoods,
): MarketTripPeople {
  const leaving = leavingGroups(state, day, give);
  return {
    stock: {
      families: leaving.families.length,
      men: leaving.men.length,
      women: leaving.women.length,
    },
    adults: marketFreeAdults(withoutGroups(state, emigrantList(leaving)), day),
  };
}

/**
 * checkMarketTrip nad stavem: stock = villageGoodStock(state, g, day) zboží z give, homeCarts =
 * druhy z tradeHomeCarts, oxenHome = oxenHome(state, day), adults = marketFreeAdults (kovář, který
 * jde sám – `alone` –, dospělé nepočítá: 0); cartIds = prvních `carts` vozů bez prodaných
 * (`withoutSoldCarts`), které po prodeji voli utáhnou. Lidé na prodej (markets.md – Rozhodnutí
 * plánu 3, bod 10) a volní dospělí bez nich z `marketTripPeople` – na totéž se ptá náhled ve webu.
 */
export function planMarketTrip(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
  { alone }: { alone?: true } = {},
): MarketPlan {
  const homeCarts = tradeHomeCarts(state);
  const oxen = oxenHome(state, day);
  const people = marketTripPeople(state, day, order.give);
  const stock: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    if (!((order.give[good] ?? 0) > 0)) continue;
    stock[good] = isPeopleGood(good) ? people.stock[good] : villageGoodStock(state, good, day);
  }
  const check = checkMarketTrip(order, {
    stock,
    homeCarts: homeCarts.map((c) => c.kind),
    oxenHome: oxen,
    adults: alone ? 0 : people.adults,
    cells: target.cells,
    day,
    ...(alone ? { alone } : {}),
  });
  if (!check.ok) return check;
  // rezervace volů pro koupené vozy je z kontroly (`check.oxen`) – plán a kontrola se nerozejdou
  const going = cartsWithOxen(
    withoutSoldCarts(homeCarts, order.give),
    oxen - (order.give.trainedOxen ?? 0) - check.oxen,
  );
  return { ...check, cartIds: going.slice(0, check.carts).map((c) => c.id) };
}

/**
 * Kolik kg zboží nošeného po kg unese jedna cesta výpravy s nejvýš `adults` lidmi a vozy `carts`
 * (v pořadí jako `marketCrew`) – obráceně k `marketCrew`: s n prvními vozy jejich náklad
 * (`CARTS.loadKg`) a ostatní lidé po `TRADE.porterKg` (s každým vozem `CARTS.tradeCrew` lidí),
 * nejvíc přes n. Bez lidí 0. Vesničané podle toho nakoupí jen to, co unesou (Rozhodnutí plánu 3,
 * bod 7 – dřívější `carryKg` nákupu).
 */
export function marketCarryKg(adults: number, carts: readonly CartKind[]): number {
  if (adults < 1) return 0;
  let best = adults * TRADE.porterKg;
  let room = 0;
  for (let n = 1; n <= carts.length && n * CARTS.tradeCrew <= adults; n++) {
    room += CARTS.loadKg[carts[n - 1]!];
    best = Math.max(best, room + (adults - n * CARTS.tradeCrew) * TRADE.porterKg);
  }
  return best;
}

/**
 * Výprava vyrazí na trh (markets.md – Pravidla 2 a 3; stav vstupu nemění – kopie
 * a `departMarketInPlace`).
 */
export function departMarket(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
): { ok: true; state: VillageState; trip: MarketTrip } | { ok: false; reason: string } {
  const plan = planMarketTrip(state, day, order, target);
  if (!plan.ok) return plan;
  const next = cloneState(state);
  return { ...departPlanned(next, day, order, target, plan), state: next };
}

/**
 * Výprava vyrazí na trh (mutuje stav – i krok dne, bez klonu celé vsi; markets.md – Pravidla 2
 * a 3, Rozhodnutí plánu 3, bod 7). Odmítnutí `planMarketTrip` vrátí jeho důvod a stav nezmění.
 * Jinak zboží `give` odejde ze vsi (`addGood` záporně – prodané vozy jsou nejmladší volné,
 * `removeIdleCart`; koně po kusech `takeHorses` – kupující dostane tytéž; lidé jako tytéž osoby
 * `takePeople` se směrem cesty, v příjezdu `people` – Rozhodnutí plánu 3, bod 10), do
 * `trade.expeditions` přibude výprava `'market'` bez stezky (`trailId` −1; nosiči, dopravní vozy
 * `cartIds`, dny 2 × cesta + pobyt, práce nosiči × dny, kam a kdy domů – `market`, s voly pro
 * koupené vozy `oxen`, kdo ji poslal – `by`), klíč `market:<domovská ves>:<id>`. Do odchozí
 * schránky jde příjezd k hostiteli na den příjezdu (se zprávou na pivo o domovské vsi a směrem
 * `firstStep`) a do kroniky `market-departed` s hostitelem (`villageId`) a `by`. Den jde
 * parametrem – `lastDay` se nemění.
 * `seedKg` – kolik obilí ze seznamu je osivo (výprava vesničanů za osivem, `MarketTrip.seedKg`).
 * Kovář souseda (Rozhodnutí plánu 3, bod 9): `alone` – jde sám bez nosičů a vozů
 * (`planMarketTrip`), `service` – příjezd nese službu, kvůli které jde (`MarketArrival.service`).
 * Partner za hledajícím (Rozhodnutí plánu 3, bod 11): `kin` – za kým jde (`MarketArrival.kin`),
 * `people` – lidé, kteří už odešli ze vsi (`removePeople` volajícího) a jdou s výpravou mimo zboží
 * (v příjezdu `people` za lidmi z `give`, ve zboží ani v `give` výpravy nejsou).
 */
export function departMarketInPlace(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
  options: DepartOptions = {},
): { ok: true; trip: MarketTrip } | { ok: false; reason: string } {
  const plan = planMarketTrip(state, day, order, target, options);
  if (!plan.ok) return plan;
  return departPlanned(state, day, order, target, plan, options);
}

/** Kdo výpravu poslal, osivo v seznamu, kovář souseda a partner – viz `departMarketInPlace`. */
interface DepartOptions {
  by?: TripBy;
  seedKg?: number;
  alone?: true;
  service?: MarketService;
  kin?: MarketKin;
  people?: readonly MarketPerson[];
}

/** Odchod výpravy, kterou `planMarketTrip` schválil (mutuje stav) – viz `departMarketInPlace`. */
function departPlanned(
  next: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
  plan: Extract<MarketPlan, { ok: true }>,
  { by, seedKg = 0, service, kin, people: partners = [] }: DepartOptions = {},
): { ok: true; trip: MarketTrip } {
  // zpráva na pivo o vsi před odchodem zboží (jako dřív ze stavu vstupu)
  const report = villageReport(next, day);
  const give = positiveGoods(order.give);
  const wants = positiveGoods(order.wants);
  const horses: MarketHorse[] = [];
  const carts: MarketCart[] = [];
  const people: MarketPerson[] = [];
  for (const good of TRADE_GOODS) {
    const amount = give[good] ?? 0;
    if (amount <= 0) continue;
    if (isHorseGood(good)) {
      horses.push(...takeHorses(next, good, amount, day).map((horse) => ({ good, horse })));
    } else if (isCartGood(good)) {
      // vozy jdou po kusech se stářím – neprodaný se vrátí stejně starý
      carts.push(...takeCarts(next, good, amount));
    } else if (isPeopleGood(good)) {
      // lidé odejdou ze vsi ve směru cesty jako tytéž osoby (Rozhodnutí plánu 3, bod 10) – rodiny,
      // pak muži, pak ženy, stejně jako je vybral `planMarketTrip`
      people.push(...takePeople(next, day, good, amount, target.firstStep));
    } else {
      addGood(next, good, -amount, day);
    }
  }
  // koně a lidé ve zboží jsou počty kusů, které odešly
  for (const good of HORSE_GOODS) {
    const n = horses.filter((h) => h.good === good).length;
    if (n > 0) give[good] = n;
    else delete give[good];
  }
  for (const good of PEOPLE_GOODS) {
    const n = people.filter((g) => g.good === good).length;
    if (n > 0) give[good] = n;
    else delete give[good];
  }
  // partner za hledajícím (Rozhodnutí plánu 3, bod 11) jde s výpravou, zbožím není
  const travelling = [...people, ...structuredClone(partners)];
  const trade = (next.trade ??= { expeditions: [], nextId: 1 });
  const id = trade.nextId++;
  const key = `market:${target.homeVillageId}:${id}`;
  const trip: MarketTrip = {
    key,
    villageId: target.villageId,
    name: target.name,
    wants,
    stayDays: order.stayDays,
    travelDays: plan.travelDays,
    arriveDay: plan.arriveDay,
    returnDay: plan.returnDay,
    // voli pro koupené vozy jdou s výpravou (pryč do `returnDay` – `oxenAway`)
    ...(plan.oxen > 0 ? { oxen: plan.oxen } : {}),
    ...(seedKg > 0 && (wants.grain ?? 0) > 0 ? { seedKg: Math.min(seedKg, wants.grain!) } : {}),
  };
  const days = 2 * plan.travelDays + order.stayDays;
  trade.expeditions.push({
    id,
    ...(by ? { by } : {}),
    kind: 'market',
    direction: target.firstStep,
    trailId: -1,
    startedDay: plan.departDay,
    give: { ...give },
    get: {},
    porters: plan.porters,
    ...(plan.cartIds.length > 0 ? { carts: plan.cartIds } : {}),
    days,
    cost: plan.porters * days,
    done: 0,
    destination: { cells: target.cells, firstStep: target.firstStep },
    market: trip,
  });
  (next.outbox ??= []).push({
    villageId: target.villageId,
    day: plan.arriveDay,
    ref: marketArrivalRef(key),
    body: {
      kind: 'market-arrive',
      arrival: {
        key,
        fromVillageId: target.homeVillageId,
        fromName: target.homeName,
        stayDays: order.stayDays,
        travelDays: plan.travelDays,
        goods: { ...give },
        horses,
        ...(carts.length > 0 ? { carts } : {}),
        ...(travelling.length > 0 ? { people: travelling } : {}),
        wants: { ...wants },
        report,
        firstStep: target.firstStep,
        ...(service ? { service: { ...service } } : {}),
        ...(kin ? { kin: { ...kin } } : {}),
        ...(by ? { by } : {}),
      },
    },
  });
  next.chronicle.push({
    day,
    kind: 'market-departed',
    villageName: target.name,
    give: { ...give },
    wants: { ...wants },
    returnDay: plan.returnDay,
    ...(by ? { by } : {}),
    villageId: target.villageId,
  });
  return { ok: true, trip: { ...trip, wants: { ...wants } } };
}

/**
 * Výprava na trh je doma (mutuje stav – krok dne hned za návraty domů): od `returnDay` jsou vozy
 * se spřežením i voli pro koupené vozy zase ve vsi (výpravě zmizí `carts` a `market.oxen`), i když
 * výsledek trhu ještě nepřišel – lidé jsou doma týž den (práce nosičů jen v okně dní –
 * `expeditionLaborNeed`), zboží a koupené vozy přijdou se zprávou z trhu.
 */
export function marketTripsDay(state: VillageState, day: number): void {
  for (const e of state.trade?.expeditions ?? []) {
    if (e.kind !== 'market' || !e.market || day < e.market.returnDay) continue;
    if (e.carts) delete e.carts;
    if (e.market.oxen !== undefined) delete e.market.oxen;
  }
}

/**
 * Výsledek trhu přišel domů (mutuje stav – událost schránky `market-result`; markets.md – Pravidla
 * 3, Rozhodnutí plánu 2, bod 6): koupené i neprodané zboží do vsi (`addGood`, koně po kusech
 * `addHorses`, vozy po kusech se stářím `addMarketCarts` – neprodaný vůz se vrátí stejně starý,
 * koupený má stáří prodejce; neprodaní vlastní lidé s původními id `restorePeople`, koupení
 * s novými `settlePeople` – přišli od hostitele ve směru cesty výpravy, Rozhodnutí plánu 3, bod 10)
 * – i když záznam výpravy chybí, nic nesmí zmizet (lidé se pak usadí bez směru). Výprava s klíčem
 * výsledku se smaže; je-li výprava a zpráva na pivo, ves si ji zapamatuje i s cenami a hladinou trhu
 * (`rememberNews`; Rozhodnutí plánu 4, bod 3), a s výpravou i své zakázky u hostitele
 * (`rememberOrders` – Rozhodnutí plánu 3, bod 6).
 * Vrací zápis kroniky `market-returned` s hostitelem (`villageId`) a tím, kdo výpravu poslal (`by`);
 * bez záznamu výpravy s prázdným jménem vsi a bez obojího; za ním `newcomer` koupených lidí.
 */
export function applyMarketResult(
  state: VillageState,
  day: number,
  result: MarketResult,
): ChronicleEvent[] {
  const trade = state.trade;
  const expedition = trade?.expeditions.find(
    (e) => e.kind === 'market' && e.market?.key === result.key,
  );
  const trip = expedition?.market;
  // koupené osivo ves nesní (fields.md – Osivo pro ves bez zásob; jako dřívější `buySeed`): rezerva
  // osiva vzroste o koupené obilí, nejvýš o osivo, pro které výprava jela – zbytek je v zásobách
  const seedKg = Math.min(result.bought.grain ?? 0, trip?.seedKg ?? 0);
  const reservedBefore = reservedSeedKg(state);
  for (const goods of [result.bought, result.unsold]) {
    for (const good of TRADE_GOODS) {
      const amount = goods[good] ?? 0;
      // koně, vozy a lidé jdou po kusech níž
      if (amount > 0 && !isHorseGood(good) && !isCartGood(good) && !isPeopleGood(good)) {
        addGood(state, good, amount, day);
      }
    }
  }
  if (seedKg > 0) state.reservedSeedKg = reservedBefore + seedKg;
  // vozy se stářím; kus bez záznamu stáří (výsledek uložený dřív) přijde nový
  const carts = result.carts ?? [];
  addMarketCarts(state, carts);
  for (const good of CART_GOODS) {
    const total = (result.bought[good] ?? 0) + (result.unsold[good] ?? 0);
    const missing = total - carts.filter((c) => c.good === good).length;
    if (missing > 0) addGood(state, good, missing, day);
  }
  addHorses(
    state,
    result.horses.map((h) => h.horse),
    day,
  );
  // lidé (Rozhodnutí plánu 3, bod 10): neprodaní vlastní zpět s původními id, koupení s novými –
  // přišli od hostitele, ze směru cesty výpravy
  restorePeople(state, result.people ?? []);
  const newcomers = settlePeople(state, day, result.newcomers ?? [], {
    villageId: trip?.villageId ?? '',
    villageName: trip?.name ?? '',
    ...(expedition ? { direction: expedition.direction } : {}),
  });
  if (trip) rememberOrders(state, day, trip, result);
  // správcova výprava za obilím bez obilí: ves se zapíše, příště jede jinam (Rozhodnutí plánu 3,
  // bod 8 – rotace cílů; platí jen se stejným `nearby.day`)
  if (trip && expedition?.by === 'steward' && (trip.wants.grain ?? 0) > 0) {
    if ((result.bought.grain ?? 0) <= 0) rememberGrainMiss(state, trip.villageId);
  }
  if (trade && trip) trade.expeditions = trade.expeditions.filter((e) => e.market !== trip);
  if (trip && result.report) {
    rememberNews(state, {
      villageId: trip.villageId,
      name: trip.name,
      report: result.report,
      ...(result.prices ? { prices: result.prices } : {}),
      ...(result.level !== undefined ? { level: result.level } : {}),
    });
  }
  return [
    {
      day,
      kind: 'market-returned',
      villageName: trip?.name ?? '',
      sold: positiveGoods(result.sold),
      bought: positiveGoods(result.bought),
      unsold: positiveGoods(result.unsold),
      ...(result.returned ? { returned: true as const } : {}),
      ...(expedition?.by ? { by: expedition.by } : {}),
      ...(trip ? { villageId: trip.villageId } : {}),
    },
    ...newcomers,
  ];
}

/** Ves, odkud se správcova výprava za obilím vrátila bez obilí (`VillageTrade.grainMisses`). */
function rememberGrainMiss(state: VillageState, villageId: string): void {
  const nearbyDay = state.nearby?.day;
  if (nearbyDay === undefined) return;
  const trade = (state.trade ??= { expeditions: [], nextId: 1 });
  const misses = trade.grainMisses;
  if (misses?.nearbyDay !== nearbyDay) trade.grainMisses = { nearbyDay, villageIds: [villageId] };
  else if (!misses.villageIds.includes(villageId)) misses.villageIds.push(villageId);
}
