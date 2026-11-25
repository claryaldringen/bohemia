// Cizí kupci ve vsi u stezky (markets.md – Rozhodnutí plánu 4, body 3 a 5 – návrh Clauda, čísla
// v rules-merchants.ts). Kupec je tržní den ve vsi, ne karavana posouvaná světem: v den plánu
// (`merchantVisits` ze zastávek vsi) přijede na trh jako návštěvník bez domovské vsi, obchoduje
// v zápočtech i v mincovní fázi, na rušném trhu zůstane déle a odjede bez pošty (`departVisitors`
// v market.ts). Měšec a zbroj vzniknou jen jeho příjezdem; co mu zbude a co koupil, zanikne jen jeho
// odjezdem. Příjezd i pobyt (mutují stav jako kroky dne) počítá jen ze stavu vsi a dne, takže
// výsledek nezávisí na kouscích dopočtu.
import { MARKET, MERCHANTS } from '../rules';
import type {
  ChronicleEvent,
  MarketPrices,
  MarketVisitor,
  TradeGoods,
  VillageMarket,
  VillageState,
} from '../types';
import { COIN_GOOD, TRADE_GOODS } from './goods';
import { coinPriceOf } from './market-prices';
import { merchantVisits } from './merchant-plan';

/**
 * Šum plovoucí čárky, technická mez, ne pravidlo: dělení, které vyjde 2,999…, jsou tři celé jednotky
 * (jako kusy v mincovní fázi, market-coins.ts).
 */
const NOISE = 1e-9;

/**
 * Cizí kupci, kteří dnes přijeli (mutuje stav – krok dne po událostech schránky a před tržním dnem):
 * za každý příjezd plánu `merchantVisits` jeden kupec s vlastním měšcem, zbrojí a seznamem. Trh
 * vznikne, chybí-li; kupec na něm stojí v pořadí příjezdu a má pobyt na den (`extendMerchants`),
 * poznámka jde do paměti příjezdů (posledních `MARKET.report.traders` – technický strop paměti vsi,
 * ne pravidlo hry). Vrací zápis kroniky `merchants-arrived` za každého kupce. Klíč, který na trhu už
 * stojí, se znovu nezaloží; ves bez zastávek stezky se nezmění.
 */
export function merchantsArrive(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (const { key } of merchantVisits(state.merchantStops ?? [], day, day)) {
    if (state.market?.visitors.some((v) => v.key === key)) continue;
    const market = (state.market ??= { prices: {}, visitors: [], nextOrder: 1, arrivals: [] });
    const sells: TradeGoods = { ...MERCHANTS.goods };
    const buys: TradeGoods = { ...MERCHANTS.wants };
    market.visitors.push({
      key,
      fromVillageId: '',
      fromName: '',
      order: market.nextOrder++,
      arrivedDay: day,
      lastDay: day,
      travelDays: 0,
      goods: { ...sells, [COIN_GOOD]: MERCHANTS.coins },
      horses: [],
      wants: { ...buys },
      sold: {},
      bought: {},
      boughtHorses: [],
      merchant: true,
    });
    market.arrivals.push({
      name: '',
      day,
      goods: TRADE_GOODS.filter((good) => (sells[good] ?? 0) > 0),
      merchants: true,
    });
    const excess = market.arrivals.length - MARKET.report.traders;
    if (excess > 0) market.arrivals.splice(0, excess);
    events.push({ day, kind: 'merchants-arrived', sells, buys, coins: MERCHANTS.coins });
  }
  return events;
}

/**
 * Na rušném trhu kupci zůstanou další den (mutuje návštěvníky – `marketDay` před odjezdy): kupec,
 * kterému pobyt dnes končí, když je na trhu aspoň `MERCHANTS.busyVisitors` výprav (bez kupců, kováře
 * souseda a doprovodu partnera) a stojí tu méně než `MERCHANTS.maxStayDays` dní.
 */
export function extendMerchants(market: VillageMarket, day: number): void {
  const trips = market.visitors.filter((v) => !v.merchant && !v.service && !v.kin);
  if (trips.length < MERCHANTS.busyVisitors) return;
  for (const visitor of market.visitors) {
    if (!visitor.merchant || visitor.lastDay !== day) continue;
    const stayed = day - visitor.arrivedDay + 1;
    if (stayed < MERCHANTS.maxStayDays) visitor.lastDay += 1;
  }
}

/**
 * Co by kupec za svůj měšec koupil (Rozhodnutí plánu 4, bod 3) – jeho poptávka pro cenu dne: u každého
 * zboží seznamu zvlášť nejvýš tolik celých jednotek, kolik jich za cenu v mincích (`coinPriceOf`)
 * pořídí za celý měšec; nic = chybí. Cena zboží, které na trhu nikdo nenabízí, tak přestane růst,
 * jakmile by kupec za měšec nekoupil ani jednu jednotku.
 */
export function affordableWants(
  visitor: MarketVisitor,
  prices: MarketPrices,
  level: number,
): TradeGoods {
  const purse = visitor.goods[COIN_GOOD] ?? 0;
  const out: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const units = Math.floor(purse / coinPriceOf(prices, level, good) + NOISE);
    const amount = Math.min(visitor.wants[good] ?? 0, units);
    if (amount > 0) out[good] = amount;
  }
  return out;
}
