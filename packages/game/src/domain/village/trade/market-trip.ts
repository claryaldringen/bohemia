// Výprava na trh – domovská ves (markets.md – Pravidla 2 a 3; Rozhodnutí plánu 2, body 1, 2 a 6).
// Hráč pošle výpravu se zbožím na prodej, seznamem a dny pobytu (`departMarket`); výprava je druh
// karavany (`TradeExpedition.kind` `'market'`, bez stezky). Nosiči, honáci a vozy se spřežením jsou
// pryč v pevné dny cesty a pobytu (Martin 22. 11. 2026: „Po tu dobu bude samozřejmě pracovní síla
// chybět ve zdrojové vsi … ráno se vyrazí a večer vrátí“) – práce v okně dní (`expeditionLaborNeed`
// v trade.ts), vozy doma od `returnDay` (`marketTripsDay`). Příjezd jde do odchozí schránky vsi
// k hostiteli (market.ts – `joinMarket`), výsledek trhu přijde schránkou domů a výpravu uzavře
// (`applyMarketResult`). Kontroly výpravy jsou na jednom místě (`checkMarketTrip`) – volá je server
// i náhled ve webu.
import { TOTAL_GAME_DAYS } from '../../calendar';
import { cloneState } from '../core/clone';
import { cartsWithOxen, tradeHomeCarts } from '../crafts/carts';
import { ironTripHelpers } from '../crafts/cart-iron';
import { purchaseTravelers } from '../crafts/craft-buying';
import { oxenHome } from '../livestock/oxen';
import { awayFromWork, isAdult } from '../people/people';
import { CARTS, MARKET, TRADE, TRADE_GOOD_VALUES } from '../rules';
import type {
  CartKind,
  ChronicleEvent,
  MarketHorse,
  MarketOrder,
  MarketResult,
  MarketTarget,
  MarketTrip,
  TradeGoods,
  VillageState,
} from '../types';
import { HORSE_GOODS, TRADE_GOODS, isCattleGood, isHorseGood, isPieceGood } from './goods';
import { addHorses, takeHorses } from './horse-trade';
import { marketArrivalRef, rememberNews } from './market';
import { addGood, expeditionLaborNeed, villageGoodStock } from './trade';
import { villageReport } from './village-report';

const EPSILON = 1e-9;

export const MARKET_STAY = 'Na trhu se zůstává aspoň den.';
export const MARKET_OVER_STOCK = 'Tolik ves nemá.';
export const MARKET_BAD_ORDER = 'Objednávka nemá správný tvar.';
export const MARKET_NO_PEOPLE = 'Na výpravu ves nemá dost dospělých.';
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

/** Zboží má správný tvar: čísla konečná a nezáporná, kusové zboží celé (server je autorita). */
function goodsShapeOk(goods: TradeGoods): boolean {
  for (const [good, amount] of Object.entries(goods)) {
    if (amount === undefined) continue;
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (isPieceGood(good as keyof TradeGoods) && !Number.isInteger(amount)) return false;
  }
  return true;
}

/** Vstup kontroly bez stavu vsi – server ho skládá ze stavu, web z pohledu dvorce (Úloha 7). */
export interface MarketTripCheck {
  /** Kolik ves má každého zboží z `give` (`villageGoodStock`). */
  stock: TradeGoods;
  /** Druhy vozů doma v pořadí `tradeHomeCarts`, bez ohledu na voly (jede jen, co voli utáhnou). */
  homeCarts: readonly CartKind[];
  /** Vycvičení voli doma (`oxenHome`) – prodaní voli z `give` vůz netáhnou. */
  oxenHome: number;
  /** Volní dospělí v den odjezdu (`marketFreeAdults`) – nosiči jsou lidé vsi. */
  adults: number;
  /** Kolik políček mapy světa je hostitel daleko. */
  cells: number;
  /** Dnešek – den odeslání (dnešek vsi je už spočtený). */
  day: number;
}

export type MarketCheck =
  | {
      ok: true;
      porters: number;
      carts: number;
      travelDays: number;
      departDay: number;
      arriveDay: number;
      returnDay: number;
    }
  | { ok: false; reason: string };

/**
 * Jediné místo kontrol výpravy (markets.md – Rozhodnutí plánu 2, bod 2) – volá ho planMarketTrip
 * i náhled ve webu. V pořadí: pobyt celé dny, nejméně `MARKET.minStayDays`; zboží `give` nejvýš,
 * co ves má (`stock` – chovné krávy ani koně pod jezdci se tak prodat nedají); vozy jen s voly,
 * které zbudou po prodeji (`cartsWithOxen`); nosiči nejvýš volní dospělí; tvar objednávky
 * (konečná nezáporná čísla, kusy celé) napřed; návrat před koncem světa. Prázdné `give` i `wants`
 * jsou dovolené (výprava „na pivo“). Data: výprava vyrazí ráno dne po odeslání (`departDay`),
 * na trh přijde po dnech cesty (`arriveDay`), tržní dny `arriveDay` … `arriveDay` + pobyt − 1,
 * `returnDay` je první den doma.
 */
export function checkMarketTrip(order: MarketOrder, input: MarketTripCheck): MarketCheck {
  if (!goodsShapeOk(order.give) || !goodsShapeOk(order.wants)) {
    return { ok: false, reason: MARKET_BAD_ORDER };
  }
  if (!Number.isInteger(order.stayDays) || order.stayDays < MARKET.minStayDays) {
    return { ok: false, reason: MARKET_STAY };
  }
  for (const good of TRADE_GOODS) {
    const amount = order.give[good] ?? 0;
    if (amount > 0 && amount > (input.stock[good] ?? 0)) {
      return { ok: false, reason: MARKET_OVER_STOCK };
    }
  }
  // vůz jede jen se svými voly – prodaní voli ho netáhnou
  const carts = cartsWithOxen(
    input.homeCarts.map((kind) => ({ kind })),
    input.oxenHome - (order.give.trainedOxen ?? 0),
  ).map((cart) => cart.kind);
  const crew = marketCrew(order.give, order.wants, carts);
  if (crew.porters > input.adults) return { ok: false, reason: MARKET_NO_PEOPLE };
  const travelDays = marketTravelDays(input.cells);
  const departDay = input.day + 1;
  const arriveDay = departDay + travelDays;
  const returnDay = arriveDay + order.stayDays + travelDays;
  if (returnDay >= TOTAL_GAME_DAYS) return { ok: false, reason: MARKET_WORLD_END };
  return { ok: true, ...crew, travelDays, departDay, arriveDay, returnDay };
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

/**
 * checkMarketTrip nad stavem: stock = villageGoodStock(state, g, day) zboží z give, homeCarts =
 * druhy z tradeHomeCarts, oxenHome = oxenHome(state, day), adults = marketFreeAdults; cartIds =
 * prvních `carts` vozů, které po prodeji voli utáhnou.
 */
export function planMarketTrip(
  state: VillageState,
  day: number,
  order: MarketOrder,
  target: MarketTarget,
): MarketPlan {
  const homeCarts = tradeHomeCarts(state);
  const oxen = oxenHome(state, day);
  const stock: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    if ((order.give[good] ?? 0) > 0) stock[good] = villageGoodStock(state, good, day);
  }
  const check = checkMarketTrip(order, {
    stock,
    homeCarts: homeCarts.map((c) => c.kind),
    oxenHome: oxen,
    adults: marketFreeAdults(state, day),
    cells: target.cells,
    day,
  });
  if (!check.ok) return check;
  const going = cartsWithOxen(homeCarts, oxen - (order.give.trainedOxen ?? 0));
  return { ...check, cartIds: going.slice(0, check.carts).map((c) => c.id) };
}

/**
 * Výprava vyrazí na trh (markets.md – Pravidla 2 a 3; stav vstupu nemění – kopie). Odmítnutí
 * `planMarketTrip` vrátí jeho důvod. Jinak zboží `give` odejde ze vsi (`addGood` záporně, koně po
 * kusech `takeHorses` – kupující dostane tytéž), do `trade.expeditions` přibude výprava `'market'`
 * bez stezky (`trailId` −1; nosiči, vozy, dny 2 × cesta + pobyt, práce nosiči × dny, kam a kdy
 * domů – `market`), klíč `market:<domovská ves>:<id>`. Do odchozí schránky jde příjezd
 * k hostiteli na den příjezdu (se zprávou na pivo o domovské vsi) a do kroniky `market-departed`.
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
  const give = positiveGoods(order.give);
  const wants = positiveGoods(order.wants);
  const horses: MarketHorse[] = [];
  for (const good of TRADE_GOODS) {
    const amount = give[good] ?? 0;
    if (amount <= 0) continue;
    if (isHorseGood(good)) {
      horses.push(...takeHorses(next, good, amount, day).map((horse) => ({ good, horse })));
    } else {
      addGood(next, good, -amount, day);
    }
  }
  // koně ve zboží jsou počty kusů, které odešly
  for (const good of HORSE_GOODS) {
    const n = horses.filter((h) => h.good === good).length;
    if (n > 0) give[good] = n;
    else delete give[good];
  }
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
  };
  const days = 2 * plan.travelDays + order.stayDays;
  trade.expeditions.push({
    id,
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
        wants: { ...wants },
        report: villageReport(state, day),
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
  });
  return { ok: true, state: next, trip: { ...trip, wants: { ...wants } } };
}

/**
 * Výprava na trh je doma (mutuje stav – krok dne hned za návraty domů): od `returnDay` jsou vozy
 * se spřežením zase ve vsi (výpravě zmizí `carts`), i když výsledek trhu ještě nepřišel – lidé
 * jsou doma týž den (práce nosičů jen v okně dní – `expeditionLaborNeed`), zboží přijde se
 * zprávou z trhu.
 */
export function marketTripsDay(state: VillageState, day: number): void {
  for (const e of state.trade?.expeditions ?? []) {
    if (e.kind === 'market' && e.carts && e.market && day >= e.market.returnDay) delete e.carts;
  }
}

/**
 * Výsledek trhu přišel domů (mutuje stav – událost schránky `market-result`; markets.md – Pravidla
 * 3, Rozhodnutí plánu 2, bod 6): koupené i neprodané zboží do vsi (`addGood`, koně po kusech
 * `addHorses`) – i když záznam výpravy chybí, nic nesmí zmizet. Výprava s klíčem výsledku se
 * smaže; je-li výprava a zpráva na pivo, ves si ji zapamatuje i s cenami trhu (`rememberNews`).
 * Vrací zápis kroniky `market-returned` (bez záznamu výpravy s prázdným jménem vsi).
 */
export function applyMarketResult(
  state: VillageState,
  day: number,
  result: MarketResult,
): ChronicleEvent[] {
  const trade = state.trade;
  const trip = trade?.expeditions.find(
    (e) => e.kind === 'market' && e.market?.key === result.key,
  )?.market;
  for (const goods of [result.bought, result.unsold]) {
    for (const good of TRADE_GOODS) {
      const amount = goods[good] ?? 0;
      if (amount > 0 && !isHorseGood(good)) addGood(state, good, amount, day);
    }
  }
  addHorses(
    state,
    result.horses.map((h) => h.horse),
    day,
  );
  if (trade && trip) trade.expeditions = trade.expeditions.filter((e) => e.market !== trip);
  if (trip && result.report) {
    rememberNews(state, {
      villageId: trip.villageId,
      name: trip.name,
      report: result.report,
      ...(result.prices ? { prices: result.prices } : {}),
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
    },
  ];
}
