// Cizí kupci ve vsi u stezky (markets.md – Rozhodnutí plánu 4, body 3 a 5 – návrh Clauda, čísla
// v rules-merchants.ts). Kupec je tržní den ve vsi, ne karavana posouvaná světem: v den plánu
// (`merchantVisits` ze zastávek vsi) přijede na trh jako návštěvník bez domovské vsi, obchoduje
// v zápočtech i v mincovní fázi, na rušném trhu zůstane déle a odjede bez pošty (`departVisitors`
// v market.ts). Zbroj vznikne jen jeho příjezdem; co mu zbude a co koupil, zanikne jen jeho odjezdem
// – i z trhu vsi, která zanikla (`merchantsLeave`). Mince kupec nedrží: platí z měšce bez dna, takže
// jeho platbou mince vznikají a platbou jemu zanikají (markets.md – Měšec kupců bez dna, bod 1;
// `coinPhase` a `payCoins` v market.ts) – za drahé zboží ale chce méně (`merchantDemand`, bod 6:
// zákon nabídky a poptávky). Koupení otroci (`boughtPeople`) odjedou s ním ze světa –
// jediný odchod lidí ze světa kromě smrti (markets.md – Rozhodnutí plánu 5, bod 7).
// Příjezd i pobyt (mutují stav jako kroky dne) počítá jen ze stavu vsi a dne, takže výsledek
// nezávisí na kouscích dopočtu.
import { dateOfDayIndex } from '../../calendar';
import { MARKET, MERCHANTS } from '../rules';
import { newMarket } from './coin-rate';
import type {
  ChronicleEvent,
  MarketPrices,
  TradeGoods,
  VillageMarket,
  VillageState,
} from '../types';
import { COIN_GOOD, GOLD_GOOD, TRADE_GOODS } from './goods';
import { merchantVisits } from './merchant-plan';
import { initialPrice, priceOf } from './market-prices';

/**
 * Poptávka cizího kupce za ceny trhu `prices` (markets.md – Měšec kupců bez dna, bod 6 – návrh
 * Clauda k Martinovu „zákonu nabídky a poptávky“, 27. 11. 2026): kupec platí z měšce bez dna, ale za
 * drahé zboží chce méně. U zboží s cenou trhu P (bez hladiny, `priceOf`) a výchozí cenou P0
 * (`initialPrice`) chce nejvýš seznam × P0 ÷ P bez toho, co za průjezd už koupil (`bought`), a nejvýš
 * to, co mu ze seznamu zbývá (`wants`) – za výchozí cenu celý seznam, za dvojnásobnou polovinu.
 * Seznam průjezdu je zbytek seznamu a koupené (`MERCHANTS.wants` z příjezdu – stav nic dalšího
 * nenese). Zlato má pevnou cenu (`goldCoinPrice`) a mince cenu nemají – chce jich celý zbytek
 * seznamu. Cena trhu se tak zastaví, kde kupci chtějí právě tolik, kolik je na trhu, a s větší
 * nabídkou klesá (`nextPrices`). Čistá funkce, vstup nemění; jen kladné položky v pořadí `TRADE_GOODS`.
 */
export function merchantDemand(
  wants: TradeGoods,
  bought: TradeGoods,
  prices: MarketPrices | undefined,
): TradeGoods {
  const demand: TradeGoods = {};
  for (const good of TRADE_GOODS) {
    const left = wants[good] ?? 0;
    if (!(left > 0)) continue;
    const had = bought[good] ?? 0;
    // cena pod výchozí není (`nextPrices`) – za výchozí celý zbytek, bez šumu dělení
    const ratio =
      good === GOLD_GOOD || good === COIN_GOOD ? 1 : initialPrice(good) / priceOf(prices, good);
    const amount = ratio >= 1 ? left : Math.min(left, (left + had) * ratio - had);
    if (amount > 0) demand[good] = amount;
  }
  return demand;
}

/**
 * Cizí kupci, kteří dnes přijeli (mutuje stav – krok dne po událostech schránky a před tržním dnem):
 * za každý příjezd plánu `merchantVisits` jeden kupec se zbrojí a seznamem, bez mincí (platí z měšce
 * bez dna – markets.md, Měšec kupců bez dna, bod 1). Trh vznikne, chybí-li; kupec na něm stojí
 * v pořadí příjezdu a má pobyt na den (`extendMerchants`), poznámka jde do paměti příjezdů
 * (posledních `MARKET.report.traders` – technický strop paměti vsi, ne pravidlo hry). Vrací zápis
 * kroniky `merchants-arrived` – jen za první příjezd v herním roce (`VillageMarket.merchantsYear`;
 * návrh Clauda: na křižovatce by kupci kroniku zaplnili). Klíč, který na trhu už stojí, se znovu
 * nezaloží; ves bez zastávek stezky se nezmění.
 */
export function merchantsArrive(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (const { key } of merchantVisits(state.merchantStops ?? [], day, day)) {
    if (state.market?.visitors.some((v) => v.key === key)) continue;
    const market = (state.market ??= newMarket());
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
      goods: { ...sells },
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
    const { year } = dateOfDayIndex(day);
    if (market.merchantsYear === year) continue;
    market.merchantsYear = year;
    events.push({ day, kind: 'merchants-arrived', sells, buys });
  }
  return events;
}

/**
 * Cizí kupci odjedou z trhu vsi, která zanikla (mění jen horní úroveň stavu – `endVillage`):
 * neprodaná zbroj, koupené zboží i koupení otroci zaniknou s nimi jako při obvyklém odjezdu
 * (markets.md – Rozhodnutí plánu 4, bod 9, návrh Clauda; otroci Rozhodnutí plánu 5, bod 9), mince
 * kupce ze starého stavu také (Měšec kupců bez dna, bod 5). Výpravy na trhu zůstanou i s neprodanými
 * otroky – vrátí je jejich domovské vsi (pošta mezi vsemi). Trh bez kupců se nezmění.
 */
export function merchantsLeave(state: VillageState): void {
  const { market } = state;
  if (!market?.visitors.some((v) => v.merchant)) return;
  state.market = { ...market, visitors: market.visitors.filter((v) => !v.merchant) };
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
