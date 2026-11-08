import { dateOfDayIndex } from '../calendar';
import type { Landscape } from '../landscape';
import { canDeclareHunt, declareHunt } from './hunt';
import { neighbourOf, neighbourStock } from './neighbours';
import { ageGroup } from './people';
import { NEIGHBOR_DIRECTIONS } from './rules';
import { STEWARD } from './rules-steward';
import { FIELD_DAMAGE } from './rules-wildlife';
import { fieldSowingTargets } from './simulate-plan';
import { stewardAction, type StewardContext } from './steward';
import {
  buyPrice,
  expeditionTo,
  goodWorth,
  sellPrice,
  startExpedition,
  tradeQuote,
  villageGoodStock,
  type TradeOffer,
} from './trade';
import { builtTrail } from './trail';
import type { Direction8, NeighbourStock, TradeGood, TradeGoods, VillageState } from './types';

// Krok 2a dne správce – nouze (steward.md – Obilí a lov v nouzi; Martin 8. 11. 2026: „A“ – obojí,
// ale jen v nouzi): obilí od sousedů kupuje, jen když hrozí hlad, a na lov vyrazí, jen když zvěř
// škodí na polích. Správce jedná stejnými akcemi jako hráč – výprava za obchodem
// (`tradeQuote` + `startExpedition`) a lov navíc (`canDeclareHunt` + `declareHunt`) – se stejnými
// kontrolami (stezka, poptávka a zásoba souseda, bilance, hájení, lovci). Rozhoduje jen ze stavu
// vsi a dne, bez náhody – výsledek nezávisí na kouscích dopočtu.

const EPSILON = 1e-9;
/** Kolikrát správce zmenší nákup, než se výprava vejde do nosičů (`grainPorterShare`). */
const FIT_TRIES = 4;

/** Podklady kroku 0 – den, krajina (sjízdnost stezky pro vozy) a pokrytí řemesly. */
export type NeedContext = Pick<StewardContext, 'day' | 'landscape' | 'coverage'>;

/** Nákup obilí od souseda: výměna, kolik obilí přinese a kolik práce stojí. */
export interface GrainDeal {
  offer: TradeOffer;
  grainKg: number;
  manDays: number;
}

/**
 * Krok 2a (mutuje stav): výprava za obilím, když hrozí hlad, a lov navíc, když zvěř škodí. Oba
 * podle výhledu zásob do žní (`fieldSowingTargets` – tentýž, ze kterého počítá režim a pojistku).
 */
export function needSteps(state: VillageState, ctx: NeedContext): void {
  const targets = fieldSowingTargets(state, ctx.day, ctx.coverage);
  grainStep(state, ctx, targets.shortKg);
  if (huntWanted(state, ctx.day, targets.needKg) && declareHunt(state, ctx.day) === null) {
    countSummerHunt(state, ctx.day);
  }
}

/** Kolik lovů v nouzi správce letos v létě vyhlásil (`steward.summerHunts`). */
function summerHuntsOf(state: VillageState, day: number): number {
  const hunts = state.steward?.summerHunts;
  return hunts?.year === dateOfDayIndex(day).year ? hunts.count : 0;
}

/** Zapíše vyhlášený lov v nouzi do letošního léta (mutuje stav). */
function countSummerHunt(state: VillageState, day: number): void {
  if (!state.steward) return;
  const year = dateOfDayIndex(day).year;
  state.steward.summerHunts = { year, count: summerHuntsOf(state, day) + 1 };
}

/**
 * Výprava za obilím (mutuje stav): hrozí-li hlad (`shortKg` – zásoby do příští sklizně bez osiva
 * nestačí aspoň o `STEWARD.grainMinKg`) a žádná výprava za obchodem není na cestě, pošle výpravu
 * k sousedovi, který obilí přinese nejvíc (`grainDeal`). Vrací, jestli vyrazila.
 */
export function grainStep(state: VillageState, ctx: NeedContext, shortKg: number): boolean {
  if (shortKg < STEWARD.grainMinKg) return false;
  // nejvýš jedna výprava naráz – i hráčova (zásilky dávek pánovi jsou jiná doprava)
  if (state.trade?.expeditions.some((e) => e.kind !== 'shipment')) return false;
  const deal = grainDeal(state, ctx.day, ctx.landscape, shortKg);
  if (!deal) return false;
  stewardAction(state, ctx.day, (s) => startExpedition(s, ctx.day, deal.offer, ctx.landscape));
  return true;
}

/**
 * Nejlepší nákup obilí (stav nemění): mezi sousedy, kteří obilí nabízejí, mají hotovou stezku
 * a k nimž nejde výprava, ten, který přinese nejvíc obilí (při shodě méně práce, pak pořadí
 * směrů). Null, když nikdo nevyhoví.
 */
export function grainDeal(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  shortKg: number,
): GrainDeal | null {
  const adults = state.people.filter((p) => ageGroup(p, day) === 'adult').length;
  const maxPorters = Math.max(1, Math.floor(adults * STEWARD.grainPorterShare + EPSILON));
  let best: GrainDeal | null = null;
  for (const direction of NEIGHBOR_DIRECTIONS) {
    const deal = grainDealWith(state, day, landscape, direction, shortKg, maxPorters);
    if (!deal) continue;
    if (
      !best ||
      deal.grainKg > best.grainKg ||
      (deal.grainKg === best.grainKg && deal.manDays < best.manDays)
    ) {
      best = deal;
    }
  }
  return best;
}

/**
 * Nákup obilí u souseda ve směru `direction`: chybějící obilí (nejvýš co soused letos má), platba
 * zbožím z `STEWARD.grainPayment`, které soused shání; co platba nepokryje, ves nekoupí, za
 * přeplatek posledního kusu vezme obilí navíc (jako nákup osiva). Výprava nese nejvýš
 * `maxPorters` nosičů – jinak správce nákup úměrně zmenší. Kontrola i ocenění `tradeQuote`.
 */
function grainDealWith(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  direction: Direction8,
  shortKg: number,
  maxPorters: number,
): GrainDeal | null {
  const neighbour = neighbourOf(state.seed, direction);
  if (!neighbour.offers.includes('grain')) return null;
  if (!builtTrail(state, direction) || expeditionTo(state, direction)) return null;
  const stock = neighbourStock(state, direction, day);
  const supply = Math.floor((stock.supply.grain ?? 0) + EPSILON);
  const unitPrice = buyPrice('grain') * goodWorth(state, 'grain', day);
  let want = Math.min(Math.ceil(shortKg - EPSILON), supply);
  for (let i = 0; i < FIT_TRIES; i++) {
    if (want < STEWARD.grainMinKg) return null;
    const pay = grainPayment(state, day, neighbour.demands, stock, want * unitPrice);
    const grainKg = Math.min(supply, Math.floor(pay.creditKg / unitPrice + EPSILON));
    if (grainKg < STEWARD.grainMinKg) return null;
    const offer: TradeOffer = { direction, give: pay.give, get: { grain: grainKg } };
    const quote = tradeQuote(state, offer, day, landscape);
    if (quote.blocked) return null;
    if (quote.porters <= maxPorters) return { offer, grainKg, manDays: quote.manDays };
    want = Math.floor((Math.min(want, grainKg) * maxPorters) / quote.porters);
  }
  return null;
}

/**
 * Čím ves zaplatí `dueKg` (kg obilí u souseda): zboží `STEWARD.grainPayment` v jeho pořadí, jen
 * které soused shání, nejvýš co ves má a co soused letos ještě vezme; každý druh do pokrytí ceny.
 * Klády jen nad rezervu staveb (`constructionLogsLeft`).
 */
function grainPayment(
  state: VillageState,
  day: number,
  demands: readonly TradeGood[],
  stock: NeighbourStock,
  dueKg: number,
): { give: TradeGoods; creditKg: number } {
  const give: TradeGoods = {};
  let creditKg = 0;
  for (const good of STEWARD.grainPayment) {
    if (creditKg >= dueKg - EPSILON) break;
    if (!demands.includes(good)) continue;
    const unit = sellPrice(good) * goodWorth(state, good, day);
    if (unit <= EPSILON) continue;
    const reserve = good === 'logs' ? constructionLogsLeft(state) : 0;
    const have = Math.min(
      Math.max(0, villageGoodStock(state, good, day) - reserve),
      Math.floor((stock.demand[good] ?? 0) + EPSILON),
    );
    const n = Math.min(have, Math.max(0, Math.ceil((dueKg - creditKg) / unit - EPSILON)));
    if (n <= 0) continue;
    give[good] = n;
    creditKg += n * unit;
  }
  return { give, creditKg };
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
 * Lov navíc (stav nemění): zvěř škodí na polích – v měsících škod (`FIELD_DAMAGE.windowMonths`)
 * je škoda letos nebo loni aspoň `STEWARD.huntDamageShare` roční potřeby obilí z pole `needKg` –
 * a lov navíc na zítřek pravidla lovu dovolí (`canDeclareHunt` – hájení, 3 dny od minulého, lovci).
 * Nejvýš `STEWARD.huntsPerSummer` lovů za léto (den lovu chybí v hlídce, výcviku a práci synů).
 */
export function huntWanted(state: VillageState, day: number, needKg: number): boolean {
  const damage = state.wildlife?.damage;
  if (!damage) return false;
  const { month } = dateOfDayIndex(day);
  const window = FIELD_DAMAGE.windowMonths;
  if (month < window.from || month > window.to) return false;
  if (summerHuntsOf(state, day) >= STEWARD.huntsPerSummer) return false;
  const kg = Math.max(damage.totalKg, damage.lastYearKg ?? 0);
  if (kg <= EPSILON || kg < STEWARD.huntDamageShare * needKg) return false;
  return canDeclareHunt(state, day) === null;
}
