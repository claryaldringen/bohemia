import { dateOfDayIndex } from '../../calendar';
import { tradeHomeCarts } from '../crafts/carts';
import { oxenHome } from '../livestock/oxen';
import { ageGroup } from '../people/people';
import { CRAFT_BUYING, MARKET, TRADE_GOOD_VALUES } from '../rules';
import { STEWARD } from '../rules/rules-steward';
import { NOISE_KG, marketStance } from '../trade/market-stance';
import { leavingGroups, withoutGroups } from '../trade/market-people';
import { departMarketInPlace, marketCrew, marketFreeAdults, tripCarts } from '../trade/market-trip';
import { emigrantList } from '../trade/people-trade';
import { offeredSlaveIds } from '../trade/slaves';
import { nearbyTarget } from '../trade/nearby';
import { villageGoodStock } from '../trade/trade';
import { coinsGold, goldCoins } from '../trade/market-prices';
import { priceKg } from '../trade/villager-trips';
import { COIN_GOOD, GOLD_GOOD, TRADE_GOODS, isPieceGood } from '../trade/goods';
import type { CartKind, NearbyVillage, TradeGood, TradeGoods, VillageState } from '../types';
import type { NeedContext } from './steward-needs';
import { isStewardOn } from './steward-state';

// Správce na trhu (markets.md – Rozhodnutí plánu 3, bod 8; Martin 22. 11. 2026: „Správce je
// vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“; steward.md – Obilí
// a lov v nouzi, Martin 8. 11. 2026: „A“): správce jedná stejnou akcí jako hráč
// (`departMarketInPlace`, `by: 'steward'`), jen s okolím vsi (`VillageState.nearby`). Volní lidé
// a vozy se dělí s výpravami vesničanů téhož dne přes stav – vesničané jedou v kroku dne dřív
// (`villagerTripsDay`), správce bere, co zbylo (`marketFreeAdults`, `tradeHomeCarts`). Platí
// i mincemi (Rozhodnutí plánu 4, bod 4; Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“):
// obilí v nouzi napřed jimi, roční výprava jich veze nejvýš v hodnotě svého seznamu. Bere je vždy jen
// ze zásoby vsi v okamžiku odjezdu (`departMarketInPlace` je hned odečte), takže dvě výpravy téhož
// dne tytéž mince neutratí; co výprava neutratí, přijde domů (`unsold`). Rozhoduje jen ze stavu vsi
// a dne, bez náhody – výsledek nezávisí na kouscích dopočtu.

const EPSILON = 1e-9;

/** Kolik kg obilí stojí kg zboží, které se nese (`TRADE_GOOD_VALUES`; jen zboží s váhou). */
function valuePerCarriedKg(good: TradeGood): number {
  const { valueKg, carryKg } = TRADE_GOOD_VALUES[good];
  return valueKg / carryKg;
}

/**
 * Pořadí, ve kterém správce nakládá (Rozhodnutí plánu 4, bod 4 – návrh Clauda: drahé napřed): zboží
 * bez váhy (dobytek, koně, vozy, lidé), pak podle hodnoty na kg sestupně, při shodě pořadí
 * `TRADE_GOODS` (řazení je stabilní). Jinak by obilí vždycky zaplnilo posádku a vosk, kožešiny
 * a med by ves kupcům nikdy nepřivezla.
 */
const LOAD_ORDER: readonly TradeGood[] = [
  ...TRADE_GOODS.filter((good) => TRADE_GOOD_VALUES[good].carryKg === 0),
  ...TRADE_GOODS.filter((good) => TRADE_GOOD_VALUES[good].carryKg > 0).sort(
    (a, b) => valuePerCarriedKg(b) - valuePerCarriedKg(a),
  ),
];

/**
 * Kolikrát správce zmenší nákup obilí, než se výprava vejde do nosičů (`grainPorterShare`).
 * Technická mez, ne pravidlo: výpočet musí skončit – každé zmenšení je úměrné, takže po pár
 * krocích výprava sedí, nebo se jí vzdá.
 */
const FIT_TRIES = 4;

/**
 * Cíl výpravy za obilím (stav nemění; Rozhodnutí plánu 3, bod 8 – rotace cílů): nejbližší ves okolí
 * mimo ty, odkud se správcova výprava vrátila bez obilí (`trade.grainMisses`, platí jen se stejným
 * `nearby.day`). Všechny vyzkoušené nebo bez okolí → null.
 */
export function stewardGrainTarget(state: VillageState): NearbyVillage | null {
  const nearby = state.nearby;
  if (!nearby) return null;
  const misses = state.trade?.grainMisses;
  const tried = misses?.nearbyDay === nearby.day ? misses.villageIds : [];
  return nearby.villages.find((v) => !tried.includes(v.villageId)) ?? null;
}

/**
 * Čím ves zaplatí `dueKg` obilí u vsi `villageId`: zboží `STEWARD.grainPayment` v jeho pořadí, každý
 * druh do pokrytí ceny cílem (cena ze zprávy na pivo, jinak výchozí – `priceKg`), nejvýš co ves má
 * (`villageGoodStock`). Napřed mince (Rozhodnutí plánu 4, bod 4), klády jen nad rezervu staveb
 * (`constructionLogsLeft`), kusové zboží celé. Vrací, čím platí a kolik kg obilí to kryje.
 */
function grainPayment(
  state: VillageState,
  day: number,
  villageId: string,
  dueKg: number,
): { give: TradeGoods; creditKg: number } {
  const give: TradeGoods = {};
  let creditKg = 0;
  for (const good of STEWARD.grainPayment) {
    if (creditKg >= dueKg - EPSILON) break;
    const unit = priceKg(state, villageId, good);
    if (unit <= EPSILON) continue;
    const reserve = good === 'logs' ? constructionLogsLeft(state) : 0;
    const have = Math.max(0, villageGoodStock(state, good, day) - reserve);
    if (good === GOLD_GOOD) {
      // zlato po celých mincích (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 4): hostitel ho
      // vymění 2,4 g za minci, výprava veze celé gramy – na mince, které ještě chybí
      const coinKg = priceKg(state, villageId, COIN_GOOD);
      const coins = Math.min(
        goldCoins(Math.floor(have + EPSILON)),
        Math.ceil((dueKg - creditKg) / coinKg - EPSILON),
      );
      if (coins <= 0) continue;
      give[good] = Math.ceil(coinsGold(coins) - EPSILON);
      creditKg += coins * coinKg;
      continue;
    }
    const need = (dueKg - creditKg) / unit;
    const n = isPieceGood(good)
      ? Math.min(Math.floor(have + EPSILON), Math.ceil(need - EPSILON))
      : Math.min(have, need);
    if (n <= EPSILON) continue;
    give[good] = n;
    creditKg += n * unit;
  }
  return { give, creditKg };
}

/**
 * Seznam `wants`, který výprava platí jen penězi, s hodnotou na celé mince za ceny cíle (`priceKg`;
 * gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 9): za zboží v kg platí celé mince dolů
 * (`wholeCoinsDown` na trhu), proto správce zadá seznam nahoru na celé mince (`up` – přidá poslednímu
 * zboží v kg v pořadí `TRADE_GOODS`), dostane aspoň, co ves potřebuje, a nepřeplatí; dolů (ubere
 * zboží v kg od konce jako trh), když víc neunese – tolik by mu trh stejně dal. Kusy se nedělí;
 * stojí-li samy přes celé mince, vejdou se kg do přeplatku. 400 kg obilí (4,44 mince) je nahoru
 * 450 kg, dolů 360 kg. Stav nemění.
 */
function wholeCoinList(
  state: VillageState,
  villageId: string,
  wants: TradeGoods,
  up: boolean,
): TradeGoods {
  const coinKg = priceKg(state, villageId, COIN_GOOD);
  const unit = (good: TradeGood): number => priceKg(state, villageId, good) / coinKg;
  const goods = TRADE_GOODS.filter((good) => good !== COIN_GOOD && (wants[good] ?? 0) > 0);
  const kg = goods.filter((good) => !isPieceGood(good));
  const worth = (list: readonly TradeGood[]): number =>
    list.reduce((sum, good) => sum + (wants[good] ?? 0) * unit(good), 0);
  const total = worth(goods);
  const pieces = worth(goods.filter((good) => isPieceGood(good)));
  const whole = up ? Math.ceil(total - EPSILON) : Math.floor(total + EPSILON);
  let change = Math.max(whole, Math.ceil(pieces - EPSILON)) - total;
  // bez zboží v kg, hodnota už celá, nebo se kg vejdou do přeplatku za kusy
  if (kg.length === 0 || Math.abs(change) <= EPSILON || (!up && change > 0)) return wants;
  const out: TradeGoods = { ...wants };
  if (change > 0) {
    const last = kg[kg.length - 1]!;
    out[last] = (out[last] ?? 0) + change / unit(last);
    return out;
  }
  for (let i = kg.length - 1; i >= 0 && change < -EPSILON; i--) {
    const good = kg[i]!;
    const value = (out[good] ?? 0) * unit(good);
    const cut = Math.min(value, -change);
    out[good] = (value - cut) / unit(good);
    change += cut;
    if (!((out[good] ?? 0) > NOISE_KG)) delete out[good];
  }
  return out;
}

/**
 * Platí výprava jen penězi – mincemi a zlatem, které hostitel vymění za celé mince? Jen tehdy kupuje
 * celý seznam za mince; se zbožím jde zbytek zápočtem a mince platí celé (jejich kg je na celé mince).
 */
function paysOnlyMoney(give: TradeGoods): boolean {
  const goods = Object.keys(give);
  return goods.length > 0 && goods.every((good) => good === COIN_GOOD || good === GOLD_GOOD);
}

/**
 * Krok 2a (mutuje stav; Rozhodnutí plánu 3, bod 8): obilí v nouzi – chybí-li zásoby do příští
 * sklizně aspoň `STEWARD.grainMinKg` (`shortKg`) a nic správcova není na cestě, pošle výpravu do
 * vsi `stewardGrainTarget`. Platí zbožím `STEWARD.grainPayment`; nosičů nejvýš
 * `max(1, floor(dospělí × grainPorterShare))` a nejvýš volných (`marketFreeAdults`) – nevejde-li se
 * výprava, zmenší nákup úměrně, nejvýš `FIT_TRIES`×. Platí-li jen penězi (`paysOnlyMoney`), je seznam
 * na celé mince (`wholeCoinList`): nahoru, při zmenšení dolů na celé mince, které se vejdou. Vrací,
 * jestli vyrazila.
 */
export function stewardGrainStep(state: VillageState, ctx: NeedContext, shortKg: number): boolean {
  if (!isStewardOn(state) || shortKg < STEWARD.grainMinKg) return false;
  if (state.trade?.expeditions.some((e) => e.by === 'steward')) return false;
  const village = stewardGrainTarget(state);
  const target = village ? nearbyTarget(state, village.villageId) : null;
  if (!village || !target) return false;
  const { day } = ctx;
  const adults = state.people.filter((p) => ageGroup(p, day) === 'adult').length;
  const maxPorters = Math.min(
    Math.max(1, Math.floor(adults * STEWARD.grainPorterShare + EPSILON)),
    marketFreeAdults(state, day),
  );
  if (maxPorters < 1) return false;
  const homeCarts = tradeHomeCarts(state).map((c) => c.kind);
  const oxen = oxenHome(state, day);
  const grainPrice = priceKg(state, village.villageId, 'grain');
  let want = Math.ceil(shortKg - EPSILON);
  // za kg se platí celé mince dolů – seznam placený mincemi je na celé mince nahoru (400 kg → 450 kg)
  if (paysOnlyMoney(grainPayment(state, day, village.villageId, want * grainPrice).give)) {
    want = wholeCoinList(state, village.villageId, { grain: want }, true).grain ?? want;
  }
  for (let i = 0; i < FIT_TRIES; i++) {
    if (want < STEWARD.grainMinKg) return false;
    const pay = grainPayment(state, day, village.villageId, want * grainPrice);
    // kryje-li platba celý seznam, zůstane (i po celých mincích), jinak celé kg, které kryje
    const coveredKg = pay.creditKg / grainPrice;
    const grainKg = coveredKg >= want - EPSILON ? want : Math.floor(coveredKg + EPSILON);
    if (grainKg < STEWARD.grainMinKg) return false;
    const wants: TradeGoods = { grain: grainKg };
    const crew = marketCrew(pay.give, wants, tripCarts(homeCarts, oxen, pay.give, wants));
    if (crew.porters <= maxPorters) {
      const sent = departMarketInPlace(
        state,
        day,
        { give: pay.give, wants, stayDays: MARKET.minStayDays },
        target,
        { by: 'steward' },
      );
      return sent.ok;
    }
    const fit = Math.floor((grainKg * maxPorters) / crew.porters);
    want = paysOnlyMoney(pay.give)
      ? (wholeCoinList(state, village.villageId, { grain: fit }, false).grain ?? 0)
      : fit;
  }
  return false;
}

/**
 * Krok dne správce 15. 11. (`CRAFT_BUYING.day` – jako vesničané), mutuje stav: výprava s nabídkou
 * a sháňkou vsi (`marketStance`) do vsi okolí `nearby.villages[rok % počet]` (okolí řazené podle
 * `cells`, pak `villageId`), ať správce okolí pozná; jen shání-li ves něco. Návrh Clauda (Martin
 * 22. 11. 2026: „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný
 * hráč“; pravidlo 9 – správce sestavuje výpravy jako hráč). Seznam zkrátí na to, co lidé a vozy
 * unesou domů, náklad na to, co unesou tam (`fitToCrew`), a přidá mince na seznam, chybí-li, i zlato (`moneyFor` –
 * Rozhodnutí plánu 4, bod 4 a plánu 6, bod 8; nic neváží, nosiče nepřidají). Bez paměti navíc. Vrací, jestli vyrazil.
 * Otroky správce zatím neprodává ani nekupuje (markets.md – Rozhodnutí plánu 5, bod 8 – návrh
 * Clauda): z nabídky vsi je vyřadí a otroci z nabídky hráče (`offeredSlaveIds`, spočtená jednou
 * před výpravou) zůstanou doma – jako rodina, muž ani žena neodejdou (`leavingGroups`
 * i `departMarketInPlace` s `reserved`). Nabídku `slavesForSale` nezadává ani nemění.
 */
export function stewardMarketStep(state: VillageState, ctx: NeedContext): boolean {
  const villages = state.nearby?.villages;
  if (!isStewardOn(state) || !villages || villages.length === 0) return false;
  const { day } = ctx;
  const date = dateOfDayIndex(day);
  if (date.month !== CRAFT_BUYING.day.month || date.day !== CRAFT_BUYING.day.day) return false;
  const reserved = offeredSlaveIds(state, day);
  const stance = marketStance(state, day, reserved);
  if (Object.keys(stance.wants).length === 0) return false;
  // otroky správce neprodává – z nabídky dřív, než se počítají nosiči a náklad
  const offer = { ...stance.offer };
  delete offer.slaves;
  const carts = { homeCarts: tradeHomeCarts(state).map((c) => c.kind), oxen: oxenHome(state, day) };
  // nosiči jen z lidí, kteří zůstávají – lidé z nabídky odejdou jako zboží (Rozhodnutí plánu 3,
  // bod 10; stejně počítá `planMarketTrip`)
  const staying = withoutGroups(state, emigrantList(leavingGroups(state, day, offer, reserved)));
  const adults = marketFreeAdults(staying, day);
  const fitted = fitToCrew(stance.wants, {}, carts, adults);
  // seznam jen ze šumu, nebo ho nemá kdo nést
  if (Object.keys(fitted).length === 0) return false;
  const village = villages[date.year % villages.length]!;
  const target = nearbyTarget(state, village.villageId);
  if (!target) return false;
  // platí-li výprava jen penězi (nic ze zboží neveze), zboží v kg na celé mince (`wholeCoinWants`)
  const goods = fitToCrew(offer, fitted, carts, adults);
  const coined =
    Object.keys(goods).length === 0 &&
    paysOnlyMoney(moneyFor(state, day, village.villageId, fitted));
  const wants = coined ? wholeCoinWants(state, village.villageId, fitted, carts, adults) : fitted;
  const give = coined ? fitToCrew(offer, wants, carts, adults) : goods;
  Object.assign(give, moneyFor(state, day, village.villageId, wants));
  const sent = departMarketInPlace(
    state,
    day,
    { give, wants, stayDays: MARKET.minStayDays },
    target,
    { by: 'steward', reserved },
  );
  return sent.ok;
}

/**
 * Čím roční výprava platí seznam `wants` ve vsi `villageId` (Rozhodnutí plánu 4, bod 4 a plánu 6,
 * bod 8): hodnota seznamu za ceny cíle (`priceKg`) v celých mincích nahoru – šum z půlení (`fitToCrew`)
 * minci nepřidá. Napřed mince, nejvýš co ves dnes má; chybí-li, zbytek zlatem po 2,4 g za minci
 * (`coinsGold` – gold.md, Mince 2,4 g zlata za 90 kg obilí, bod 4) v celých gramech nahoru, nejvýš
 * celé gramy, které ves má. Mince ani zlato neváží – nosiče nepřidají.
 */
function moneyFor(
  state: VillageState,
  day: number,
  villageId: string,
  wants: TradeGoods,
): TradeGoods {
  const dueKg = TRADE_GOODS.reduce(
    (sum, good) => sum + (wants[good] ?? 0) * priceKg(state, villageId, good),
    0,
  );
  const due = Math.ceil(dueKg / priceKg(state, villageId, COIN_GOOD) - NOISE_KG);
  const money: TradeGoods = {};
  const coins = Math.min(villageGoodStock(state, COIN_GOOD, day), due);
  if (coins > 0) money[COIN_GOOD] = coins;
  const rest = due - coins;
  if (rest > 0) {
    const gold = Math.min(
      Math.floor(villageGoodStock(state, GOLD_GOOD, day) + EPSILON),
      Math.ceil(coinsGold(rest) - EPSILON),
    );
    if (gold > 0) money[GOLD_GOOD] = gold;
  }
  return money;
}

/**
 * Rezerva klád rozestavěných staveb vsi (steward.md – Obilí a lov v nouzi): dřevo, které stavby
 * ještě vezmou – stromy, které pro ně ještě nikdo neskácel (`wood.fell` bez `felled`). Klády
 * z hromady si stavba bere při zahájení; správce prodá jen klády nad tuto rezervu.
 */
export function constructionLogsLeft(state: Pick<VillageState, 'constructions'>): number {
  let logs = 0;
  for (const c of state.constructions) {
    if (c.wood) logs += Math.max(0, c.wood.fell.length - c.wood.felled);
  }
  return logs;
}

/**
 * Seznam roční výpravy, která platí jen penězi, na celé mince (`wholeCoinList`): nahoru, unesou-li to
 * volní lidé a vozy (`marketCrew` jako ve `fitToCrew`), jinak dolů. Stav nemění.
 */
function wholeCoinWants(
  state: VillageState,
  villageId: string,
  wants: TradeGoods,
  carts: { homeCarts: readonly CartKind[]; oxen: number },
  adults: number,
): TradeGoods {
  const more = wholeCoinList(state, villageId, wants, true);
  const fits =
    marketCrew(more, {}, tripCarts(carts.homeCarts, carts.oxen, more, {})).porters <= adults;
  return fits ? more : wholeCoinList(state, villageId, wants, false);
}

/**
 * Ze zboží `goods` (nabídka vsi, nebo její seznam) to, co unesou volní lidé a dopravní vozy na jednu
 * cestu (`marketCrew` – stejná mez jako u vesničanů, `marketCarryKg`): drahé napřed (`LOAD_ORDER`),
 * každý druh nejvýš tolik, aby výprava s `wants` nepotřebovala víc než `adults` lidí; kusové zboží
 * celé, zlomek do `NOISE_KG` se nenakládá. Celá hromada klád a kamene tak výpravu nepoloží kontrolou;
 * co se nevejde, zůstane doma. Pořadí je pevné, výsledek deterministický.
 */
function fitToCrew(
  goods: TradeGoods,
  wants: TradeGoods,
  carts: { homeCarts: readonly CartKind[]; oxen: number },
  adults: number,
): TradeGoods {
  const fits = (give: TradeGoods): boolean =>
    marketCrew(give, wants, tripCarts(carts.homeCarts, carts.oxen, give, wants)).porters <= adults;
  const give: TradeGoods = {};
  for (const good of LOAD_ORDER) {
    const amount = goods[good] ?? 0;
    if (!(amount > 0)) continue;
    const piece = isPieceGood(good);
    const whole = piece ? Math.floor(amount + EPSILON) : amount;
    let low = 0;
    let high = whole;
    if (fits({ ...give, [good]: high })) low = high;
    // půlení: technická mez 40 kroků (výsledek je pevný – bez náhody)
    else {
      for (let i = 0; i < 40; i++) {
        const mid = piece ? Math.floor((low + high) / 2) : (low + high) / 2;
        if (mid === low || mid === high) break;
        if (fits({ ...give, [good]: mid })) low = mid;
        else high = mid;
      }
    }
    if (low > NOISE_KG) give[good] = low;
  }
  return give;
}
