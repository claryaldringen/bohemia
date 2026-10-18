// Zboží zvenku ve vsi (docs/design/trade.md – Zboží zvenku ve vsi): sůl, železo, med a kožešiny,
// které ves koupí od sousedů. Sůl se spotřebuje (≈ 8 g na člověka denně) a dokud je, přidává
// štěstí; kožešiny se opotřebí a přidají štěstí podle toho, kolik jich na člověka připadá; med se
// jí (diet.ts – `eatDiet`) a přidá štěstí jako ovoce; železo kuje kovář (crafts.ts). Čisté funkce.
import { FOREIGN_GOODS } from './rules';
import type { ForeignGoods, VillageState } from './types';

const DAYS_PER_YEAR = 365;
/** Kožešiny se opotřebí rovnoměrně po dnech – za rok ubude FOREIGN_GOODS.furWearPerYear. */
const DAILY_FUR_KEEP = (1 - FOREIGN_GOODS.furWearPerYear) ** (1 / DAYS_PER_YEAR);
/** Pod tolik soli / kožešin je zásoba pryč (zbytky zaokrouhlení). */
const EMPTY = 1e-6;

/** Zboží zvenku vsi (starší vsi bez něj nic). */
export function foreignGoods(state: Pick<VillageState, 'goods'>): ForeignGoods {
  return state.goods ?? { saltKg: 0, ironKg: 0, honeyKg: 0, furs: 0 };
}

/** Energie medu v kg obilí. */
export function honeyEnergy(kg: number): number {
  return kg * FOREIGN_GOODS.honeyEnergy;
}

/**
 * Štěstí ze zboží zvenku (trade.md, návrh Clauda): sůl +3, dokud je v zásobě; kožešiny až +2 –
 * plně při jedné na člověka, méně poměrně.
 */
export function goodsHappiness(state: Pick<VillageState, 'goods' | 'people'>): number {
  const goods = state.goods;
  if (!goods) return 0;
  const salt = goods.saltKg > EMPTY ? FOREIGN_GOODS.saltHappiness : 0;
  const people = state.people.length;
  const furs =
    people > 0 && goods.furs > EMPTY
      ? FOREIGN_GOODS.furHappiness * Math.min(1, goods.furs / people)
      : 0;
  return salt + furs;
}

/**
 * Den zboží zvenku (mutuje stav): lidé snědí sůl (FOREIGN_GOODS.saltKgPerPersonYear rovnoměrně),
 * kožešiny se opotřebí. Ves bez zboží zvenku nic.
 */
export function goodsDay(state: VillageState): void {
  const goods = state.goods;
  if (!goods) return;
  const salt = (state.people.length * FOREIGN_GOODS.saltKgPerPersonYear) / DAYS_PER_YEAR;
  goods.saltKg = goods.saltKg - salt > EMPTY ? goods.saltKg - salt : 0;
  goods.furs = goods.furs * DAILY_FUR_KEEP > EMPTY ? goods.furs * DAILY_FUR_KEEP : 0;
}
