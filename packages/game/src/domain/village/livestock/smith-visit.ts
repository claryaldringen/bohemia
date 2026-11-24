import { craftCoverage, shoeingBarsKg } from '../crafts/crafts';
import { paymentPool, workingWorkshops } from '../crafts/craft-buying';
import { isAway, laborPerDay } from '../people/people';
import { OPPOSITE } from '../people/world-grid';
import { CARPENTRY, HORSE_SHOEING, MARKET, TRADE_GOOD_VALUES } from '../rules';
import { rememberNews } from '../trade/market';
import { departMarketInPlace, marketTravelDays } from '../trade/market-trip';
import { nearestWith } from '../trade/nearby';
import { addGood } from '../trade/trade';
import { villageReport } from '../trade/village-report';
import type {
  ChronicleEvent,
  MarketVisitor,
  NearbyVillage,
  Person,
  SmithAsk,
  TradeGood,
  TradeGoods,
  VillageState,
} from '../types';
import { planShoeing } from './horse-shoeing';
import { shoeingDue } from './horse-shoeing-term';
import { ridingHorses } from './horses';

// Kovář souseda ke koním (markets.md – Rozhodnutí plánu 3, bod 9; Martin 26. 10. 2026: „kovář
// z jiné vsi, ale bude to násobně dražší, protože musí přijít“ – „musí fyzicky dojít do té
// ohrady“). Ves s koňmi po termínu bez vlastního kováře se zeptá vsi okolí, o jejímž kováři ví ze
// zprávy na pivo (`askSmithDay` – zpráva `smith-ask`, žádný náklad). Ves kováře, může-li, pošle
// kováře samotného jako výpravu na trh (`answerSmithAsk` – `departMarketInPlace` s `alone`,
// hřivny v `give`, služba `service`); kovář je doma pryč (`Person.away` `'craft'`), jeho kovárna ty
// dny nekuje. U koní kuje hned po příjezdu (`serveShoeing` z `joinMarket`) a vezme poplatek –
// výprava do zápočtu nevstupuje, hřivny i poplatek jdou výsledkem trhu domů. Rozhoduje se jen ze
// stavu vsi a událostí schránky dne – výsledek nezávisí na kouscích dopočtu. Mutuje stav jako
// kroky dne.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/**
 * Den řemeslníka v kg obilí (Rozhodnutí plánu 3, bod 9 – žádné nové číslo): hodnota dřevěného
 * nářadí ÷ práce tesaře na kg (2 kg ÷ 0,5 čd = 4 kg za den) – jako den tesaře v ceně vozu
 * (`TRADE_GOOD_VALUES.twoWheelCarts`, dřívější `cartValueKg` @ b4f8dadc).
 */
const CRAFTSMAN_DAY_KG = TRADE_GOOD_VALUES.woodTools.valueKg / CARPENTRY.woodToolsManDaysPerKg;

/**
 * Poplatek kováři souseda v kg obilí (Rozhodnutí plánu 3, bod 9): (práce kování
 * `HORSE_SHOEING.manDays` × koně + dny cesty tam a zpět + pobyt `MARKET.minStayDays`) × den
 * řemeslníka + hodnota hřiven na koně (`HORSE_SHOEING.ironBarsKg` × `TRADE_GOOD_VALUES.ironBars`).
 * Dva koně u sousední mapy: (1 + 0 + 1) × 4 + 1 × 45 = 53 kg.
 */
export function smithFeeKg(horses: number, travelDays: number): number {
  const days = horses * HORSE_SHOEING.manDays + 2 * travelDays + MARKET.minStayDays;
  const barsKg = horses * HORSE_SHOEING.ironBarsKg;
  return days * CRAFTSMAN_DAY_KG + barsKg * TRADE_GOOD_VALUES.ironBars.valueKg;
}

/** `ref` dotazu na kováře ve schránce vsi kováře (Rozhodnutí plánu 3, bod 13). */
function smithAskRef(key: string): string {
  return `${key}:ask`;
}

/** Ví ves ze zprávy na pivo o kováři ve vsi okolí `village`? (jako `nearestWith`) */
function knowsSmith(state: VillageState, village: NearbyVillage): boolean {
  return (state.news ?? []).some(
    (n) => n.villageId === village.villageId && n.report.crafts.includes('smith'),
  );
}

/**
 * Další ves okolí s kovářem (podle zprávy) za vsí `after` v pořadí okolí, dokola – jediná taková
 * ves je zase ona; `after` mimo okolí → první od začátku. Žádná null.
 */
function nextSmithVillage(state: VillageState, after: string): NearbyVillage | null {
  const villages = state.nearby?.villages ?? [];
  const n = villages.length;
  const from = villages.findIndex((v) => v.villageId === after);
  for (let i = 1; i <= n; i++) {
    const village = villages[(from + i + n) % n]!;
    if (knowsSmith(state, village)) return village;
  }
  return null;
}

/**
 * Ves s koňmi se ptá kováře souseda (mutuje; krok dne za `finishShoeing` – Rozhodnutí plánu 3,
 * bod 9): jen ves s okolím, po termínu kování (`shoeingDue`), když vlastní kovář nemůže
 * (`planShoeing` null) a dotaz nečeká (`shoeing.asked` – po `untilDay` uplynul bez kování). Cíl:
 * bez dotazu nejbližší ves okolí s kovářem podle zprávy (`nearestWith`), po neúspěchu další taková
 * ves za tou minulou v pořadí okolí (dokola). Do odchozí schránky jde `smith-ask` (klíč
 * `smith:<ves>:<den>`, `ref` `…:ask`) na den dotazu = dnes + 1 + dny cesty, `asked` čeká do dne,
 * kdy by kovář dorazil, kdyby vyrazil hned (den dotazu + 1 + dny cesty), + `MARKET.minStayDays`.
 */
export function askSmithDay(state: VillageState, day: number): void {
  const nearby = state.nearby;
  if (!nearby || nearby.villages.length === 0) return;
  if (!state.shoeing || !shoeingDue(state, day)) return;
  const asked = state.shoeing.asked;
  if (asked && day <= asked.untilDay) return;
  if (planShoeing(state, day)) return;
  const target = asked ? nextSmithVillage(state, asked.villageId) : nearestWith(state, 'smith');
  if (!target) return;
  const key = `smith:${nearby.self.villageId}:${day}`;
  const travelDays = marketTravelDays(target.cells);
  const askDay = day + 1 + travelDays;
  const ask: SmithAsk = {
    key,
    fromVillageId: nearby.self.villageId,
    fromName: nearby.self.name,
    cells: target.cells,
    firstStep: target.firstStep,
    horses: ridingHorses(state, day).length,
    report: villageReport(state, day),
  };
  (state.outbox ??= []).push({
    villageId: target.villageId,
    day: askDay,
    ref: smithAskRef(key),
    body: { kind: 'smith-ask', ask },
  });
  state.shoeing.asked = {
    key,
    villageId: target.villageId,
    name: target.name,
    untilDay: askDay + 1 + travelDays + MARKET.minStayDays,
  };
}

/**
 * Kovář, který může jít: muž domácnosti pracující kovárny (`workingWorkshops`), který dnes pracuje
 * a není pryč – v kovárnách podle id, v domácnosti od nejstaršího (jako `smithHead`); jinak null.
 */
function smithAtHome(state: VillageState, day: number): Person | null {
  for (const forge of workingWorkshops(state, 'smith')) {
    const smith = state.people
      .filter(
        (p) =>
          p.dwellingId === forge.id &&
          p.sex !== 'female' &&
          laborPerDay(p, day) > 0 &&
          !isAway(p, day),
      )
      .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)[0];
    if (smith) return smith;
  }
  return null;
}

/**
 * Ves kováře dostala dotaz `smith-ask` (mutuje – událost schránky; Rozhodnutí plánu 3, bod 9). Ves
 * bez okolí (nezná své id) nic. Posel „zašel na pivo“ – zpráva o vsi, která se ptá, do `news`
 * (`rememberNews`). Kovář (`smithAtHome`) vyrazí, když hřivny vsi stačí na koně
 * (`HORSE_SHOEING.ironBarsKg` na koně) nad její rezervu na vlastní kování (`shoeingBarsKg`): výprava
 * na trh k té vsi (`departMarketInPlace` – `by: 'smith'`, sám bez nosičů a vozů `alone`, hřivny
 * v `give`, služba `service`, pobyt `MARKET.minStayDays`, první krok opačně než dotaz). Kovář je
 * pryč (`away` `'craft'`) do `returnDay` výpravy. Kroniku `market-departed` zapíše
 * `departMarketInPlace` sám (jako u vesničanů a správce), proto vrací prázdný seznam.
 */
export function answerSmithAsk(state: VillageState, day: number, ask: SmithAsk): ChronicleEvent[] {
  const self = state.nearby?.self;
  if (!self) return [];
  rememberNews(state, { villageId: ask.fromVillageId, name: ask.fromName, report: ask.report });
  if (!(ask.horses >= 1)) return [];
  const smith = smithAtHome(state, day);
  if (!smith) return [];
  const barsKg = ask.horses * HORSE_SHOEING.ironBarsKg;
  if ((state.crafts?.ironBarsKg ?? 0) + EPSILON < barsKg + shoeingBarsKg(state, day)) return [];
  const sent = departMarketInPlace(
    state,
    day,
    { give: { ironBars: barsKg }, wants: {}, stayDays: MARKET.minStayDays },
    {
      villageId: ask.fromVillageId,
      name: ask.fromName,
      cells: ask.cells,
      firstStep: OPPOSITE[ask.firstStep],
      homeVillageId: self.villageId,
      homeName: self.name,
    },
    { by: 'smith', alone: true, service: { kind: 'shoeing', horses: ask.horses } },
  );
  if (!sent.ok) return [];
  smith.away = { kind: 'craft', untilDay: sent.trip.returnDay };
  return [];
}

/** Přesune `amount` zboží `good` z `from` do `into` (mutuje; zbytek do šumu se smaže). */
function moveGood(from: TradeGoods, into: TradeGoods, good: TradeGood, amount: number): void {
  const rest = (from[good] ?? 0) - amount;
  if (rest > EPSILON) from[good] = rest;
  else delete from[good];
  into[good] = (into[good] ?? 0) + amount;
}

/**
 * Kovář souseda u koní (mutuje – z `joinMarket` hned po příjezdu; Rozhodnutí plánu 3, bod 9): jen
 * návštěvník se službou kování. Má-li ves jezdecké koně po termínu (`shoeingDue`) a kovář dost
 * hřiven na všechny, okuje: termín je dnes (dotaz `asked` zmizí), hřivny se spotřebují (z `goods`
 * do `sold`) a ves zaplatí poplatek `smithFeeKg` z přebytku i z pojistky (`paymentPool(…, true)`) –
 * obilí, pak luštěniny, nejvýš co má – do `visitor.bought`. Kronika `horses-shod` s vsí kováře.
 * Jinak nic – hřivny zůstanou v `goods` a výsledek trhu je vrátí (`unsold`).
 */
export function serveShoeing(
  state: VillageState,
  day: number,
  visitor: MarketVisitor,
): ChronicleEvent[] {
  if (visitor.service?.kind !== 'shoeing') return [];
  if (!state.shoeing || !shoeingDue(state, day)) return [];
  const horses = ridingHorses(state, day).length;
  const barsKg = horses * HORSE_SHOEING.ironBarsKg;
  if ((visitor.goods.ironBars ?? 0) + EPSILON < barsKg) return [];
  moveGood(visitor.goods, visitor.sold, 'ironBars', barsKg);
  // poplatek: obilí, pak luštěniny (hodnota v kg obilí), nejvýš co ves má i s pojistkou
  const pool = paymentPool(state, day, craftCoverage(state, day), true);
  const feeKg = smithFeeKg(horses, visitor.travelDays);
  const grainValue = TRADE_GOOD_VALUES.grain.valueKg;
  const legumesValue = TRADE_GOOD_VALUES.legumes.valueKg;
  const grainKg = Math.max(0, Math.min(feeKg / grainValue, pool.grainKg, pool.energyKg));
  const left = feeKg - grainKg * grainValue;
  const legumesKg =
    left > EPSILON
      ? Math.max(0, Math.min(left / legumesValue, pool.legumesKg, pool.energyKg - grainKg))
      : 0;
  for (const [good, kg] of [
    ['grain', grainKg],
    ['legumes', legumesKg],
  ] as const) {
    if (kg <= 0) continue;
    addGood(state, good, -kg, day);
    visitor.bought[good] = (visitor.bought[good] ?? 0) + kg;
  }
  state.shoeing = { lastDay: day };
  return [
    {
      day,
      kind: 'horses-shod',
      horses,
      own: false,
      ...(visitor.firstStep ? { direction: OPPOSITE[visitor.firstStep] } : {}),
      villageName: visitor.fromName,
      villageId: visitor.fromVillageId,
    },
  ];
}
