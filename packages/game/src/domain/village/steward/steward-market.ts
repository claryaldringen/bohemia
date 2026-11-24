import { dateOfDayIndex } from '../../calendar';
import { cartsWithOxen, tradeHomeCarts } from '../crafts/carts';
import { oxenHome } from '../livestock/oxen';
import { ageGroup } from '../people/people';
import { CRAFT_BUYING, MARKET } from '../rules';
import { STEWARD } from '../rules/rules-steward';
import { marketStance } from '../trade/market-stance';
import { departMarketInPlace, marketCrew, marketFreeAdults } from '../trade/market-trip';
import { nearbyTarget } from '../trade/nearby';
import { villageGoodStock } from '../trade/trade';
import { priceKg } from '../trade/villager-trips';
import { isPieceGood } from '../trade/goods';
import type { NearbyVillage, TradeGoods, VillageState } from '../types';
import type { NeedContext } from './steward-needs';
import { isStewardOn } from './steward-state';

// Správce na trhu (markets.md – Rozhodnutí plánu 3, bod 8; Martin 22. 11. 2026: „Správce je
// vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný hráč“; steward.md – Obilí
// a lov v nouzi, Martin 8. 11. 2026: „A“): správce jedná stejnou akcí jako hráč
// (`departMarketInPlace`, `by: 'steward'`), jen s okolím vsi (`VillageState.nearby`). Volní lidé
// a vozy se dělí s výpravami vesničanů téhož dne přes stav – vesničané jedou v kroku dne dřív
// (`villagerTripsDay`), správce bere, co zbylo (`marketFreeAdults`, `tradeHomeCarts`). Rozhoduje
// jen ze stavu vsi a dne, bez náhody – výsledek nezávisí na kouscích dopočtu.

const EPSILON = 1e-9;

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
 * (`villageGoodStock`). Klády jen nad rezervu staveb (`constructionLogsLeft`), kusové zboží celé.
 * Vrací, čím platí a kolik kg obilí to kryje.
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
 * Krok 2a (mutuje stav; Rozhodnutí plánu 3, bod 8): obilí v nouzi – chybí-li zásoby do příští
 * sklizně aspoň `STEWARD.grainMinKg` (`shortKg`) a nic správcova není na cestě, pošle výpravu do
 * vsi `stewardGrainTarget`. Platí zbožím `STEWARD.grainPayment`; nosičů nejvýš
 * `max(1, floor(dospělí × grainPorterShare))` a nejvýš volných (`marketFreeAdults`) – nevejde-li se
 * výprava, zmenší nákup úměrně, nejvýš `FIT_TRIES`×. Vrací, jestli vyrazila.
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
  const carts = cartsWithOxen(tradeHomeCarts(state), oxenHome(state, day)).map((c) => c.kind);
  const grainPrice = priceKg(state, village.villageId, 'grain');
  let want = Math.ceil(shortKg - EPSILON);
  for (let i = 0; i < FIT_TRIES; i++) {
    if (want < STEWARD.grainMinKg) return false;
    const pay = grainPayment(state, day, village.villageId, want * grainPrice);
    const grainKg = Math.min(want, Math.floor(pay.creditKg / grainPrice + EPSILON));
    if (grainKg < STEWARD.grainMinKg) return false;
    const wants: TradeGoods = { grain: grainKg };
    const crew = marketCrew(pay.give, wants, carts);
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
    want = Math.floor((grainKg * maxPorters) / crew.porters);
  }
  return false;
}

/**
 * Krok dne správce 15. 11. (`CRAFT_BUYING.day` – jako vesničané), mutuje stav: výprava s nabídkou
 * a sháňkou vsi (`marketStance`) do vsi okolí `nearby.villages[rok % počet]` (okolí řazené podle
 * `cells`, pak `villageId`), ať správce okolí pozná; jen shání-li ves něco. Návrh Clauda (Martin
 * 22. 11. 2026: „Správce je vlastně NPC hráč, takže by měl mít možnost dělat téměř vše, co skutečný
 * hráč“; pravidlo 9 – správce sestavuje výpravy jako hráč). Bez paměti navíc. Vrací, jestli
 * vyrazil.
 */
export function stewardMarketStep(state: VillageState, ctx: NeedContext): boolean {
  const villages = state.nearby?.villages;
  if (!isStewardOn(state) || !villages || villages.length === 0) return false;
  const { day } = ctx;
  const date = dateOfDayIndex(day);
  if (date.month !== CRAFT_BUYING.day.month || date.day !== CRAFT_BUYING.day.day) return false;
  const stance = marketStance(state, day);
  if (Object.keys(stance.wants).length === 0) return false;
  const village = villages[date.year % villages.length]!;
  const target = nearbyTarget(state, village.villageId);
  if (!target) return false;
  const sent = departMarketInPlace(
    state,
    day,
    { give: stance.offer, wants: stance.wants, stayDays: MARKET.minStayDays },
    target,
    { by: 'steward' },
  );
  return sent.ok;
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
