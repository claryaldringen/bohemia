import {
  DIRECTIONS,
  startExpedition,
  tradeQuote,
  type Direction8,
  type TradeGoods,
} from '../domain/village';
import type { Landscape } from '../domain/landscape';
import { updateLivingVillage } from './update-village';
import { UNKNOWN_DIRECTION } from './build-trail';
import type { VillageRepository, VillageResult } from './villages';

export interface SendExpeditionInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  direction: Direction8;
  give: TradeGoods;
  get: TradeGoods;
  /**
   * Směry, kde na sousední mapě leží vlastní ves hráče (migration.md) – soused bez simulace tam
   * není a obchod mezi vlastními vsemi zatím není. Bez údaje žádné.
   */
  ownDirections?: readonly Direction8[];
}

/** Tím směrem leží vlastní ves – obchodovat s ní zatím nejde (migration.md). */
export const OWN_VILLAGE_TRADE =
  'Tím směrem leží tvoje ves – obchod mezi vlastními vsemi zatím není.';

/**
 * Hráč pošle ve dvorci výpravu nosičů k sousedovi (trade.md – Obchod; ves se nejdřív dopočítá do
 * dneška). Server výměnu ověří znovu (`tradeQuote` – stezka, zásoby a poptávka souseda, zásoby
 * vsi, bilance pro souseda) a vrátí důvod česky, když nejde.
 */
export function sendExpedition(
  deps: { villages: VillageRepository },
  input: SendExpeditionInput,
): Promise<VillageResult> {
  if (!DIRECTIONS.includes(input.direction)) {
    return Promise.resolve({ ok: false, reason: UNKNOWN_DIRECTION });
  }
  if (input.ownDirections?.includes(input.direction)) {
    return Promise.resolve({ ok: false, reason: OWN_VILLAGE_TRADE });
  }
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) => {
      const day = state.lastDay;
      const offer = { direction: input.direction, give: input.give, get: input.get };
      const quote = tradeQuote(state, offer, day);
      if (quote.blocked) return { ok: false, reason: quote.blocked };
      return { ok: true, state: startExpedition(state, day, offer) };
    },
  );
}
