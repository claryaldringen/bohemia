// Objednávka zbroje u cizích kupců ve vlastní vsi (markets.md – Rozhodnutí plánu 4, bod 15; Martin
// 25. 11. 2026: „Hráč zadá počet“, podrobnosti návrh Clauda). Hráč zadá, kolik mečů, kroužkových
// košil a helem chce (`setArmsOrder`); v mincovní fázi dne kupců (`coinPhase` v market.ts) je ves
// koupí za své mince (a zlato po 2,4 g za minci – gold.md, Rozhodnutí plánu 6, bod 3) jako kupující
// `armsBuyer` – jen od kupců, po kusech, dokud na ně má. O koupené
// se objednávka zmenší (`reduceArmsOrder`), zbytek čeká na další kupce. Přání zbroje nepatří do
// zápočtu, `marketStance`, `nextPrices` ani do výhledů správce. Nic jiného ves za mince nekoupí
// (Martin 25. 11. 2026: „Mince utrácí jen vojvoda/správce“).
import type { ArmsGood, MarketVisitor, TradeGoods, VillageState } from '../types';
import { ARMS_GOODS, COIN_GOOD, GOLD_GOOD, onlyGoods } from './goods';
import { jewelleryOf } from './jewellery';
import type { CoinParty } from './market-coins';
import { villageGoodStock } from './trade';

export const ARMS_BAD_ORDER = 'Počet kusů musí být celé nezáporné číslo.';
export const ARMS_NO_MERCHANTS = 'Do téhle vsi cizí kupci nejezdí.';

/** Zapíše objednávku (mutuje stav): jen kladné počty v pořadí `ARMS_GOODS`, prázdná zmizí. */
function writeOrder(state: VillageState, order: TradeGoods): void {
  const kept = onlyGoods(order, ARMS_GOODS);
  if (Object.keys(kept).length > 0) state.armsOrder = kept;
  else delete state.armsOrder;
}

/** Nastaví objednaný počet zboží (mutuje stav): 0 položku smaže, prázdná objednávka ze stavu zmizí. */
export function setArmsOrder(
  state: VillageState,
  good: ArmsGood,
  amount: number,
): { ok: true } | { ok: false; reason: string } {
  if (!state.merchantStops?.length) return { ok: false, reason: ARMS_NO_MERCHANTS };
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: ARMS_BAD_ORDER };
  writeOrder(state, { ...state.armsOrder, [good]: amount });
  return { ok: true };
}

/**
 * Hostitel jako kupující mincovní fáze: mince vsi (i nula – utržit je smí týž den), zlato vsi,
 * kterým po mincích doplatí (`goldPurse` – po celých mincích, 2,4 g za minci; Rozhodnutí plánu 6,
 * bod 3, gold.md – Mince 2,4 g, bod 4), kapacita
 * šperkaře (`jewelleryOf` – gold.md, Pravidla 4) a objednaná zbroj, jen od cizích kupců. Zlato
 * a kapacita jen kladné. Null = nic neobjednal, nebo na trhu žádný kupec nestojí (`visitors`).
 */
export function armsBuyer(
  state: VillageState,
  day: number,
  visitors: readonly MarketVisitor[],
): Pick<CoinParty, 'coins' | 'goldPurse' | 'jewelleryG' | 'wants' | 'fromMerchants'> | null {
  if (!state.armsOrder || !visitors.some((v) => v.merchant)) return null;
  const goldPurse = villageGoodStock(state, GOLD_GOOD, day);
  const jewelleryG = jewelleryOf(state);
  return {
    coins: villageGoodStock(state, COIN_GOOD, day),
    ...(goldPurse > 0 ? { goldPurse } : {}),
    ...(jewelleryG > 0 ? { jewelleryG } : {}),
    wants: onlyGoods(state.armsOrder, ARMS_GOODS),
    fromMerchants: true,
  };
}

/** Objednávka po nákupu `bought` (mutuje stav): o koupené menší, nula ze stavu zmizí. */
export function reduceArmsOrder(state: VillageState, bought: TradeGoods): void {
  if (!state.armsOrder) return;
  const rest: TradeGoods = {};
  for (const good of ARMS_GOODS) rest[good] = (state.armsOrder[good] ?? 0) - (bought[good] ?? 0);
  writeOrder(state, rest);
}
