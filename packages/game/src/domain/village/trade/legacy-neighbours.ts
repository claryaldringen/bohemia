// Dřívější smyšlení sousedé (markets.md – Pravidla 10): ves už s okolím neobchoduje, ale stará
// kronika a karavany na cestě je jmenují dál – jméno je týž los jako dřív, čistá funkce seedu.
// Převod `fictional-neighbours` smaže, co sousedům z roku zbývalo (zásoby a poptávka do 1. 11.
// podle povahy souseda – dřív `neighbourOf`); výpravy, nákupy a cesty pro kování na cestě doběhnou.
import { deriveSeed } from '../../landscape/random';
import { suggestVillageName } from '../people/names';
import type { Direction8, VillageState, VillageTrade } from '../types';

/** Obchod vsi uložené před koncem smyšlených sousedů – se zbytky roku sousedů. */
type LegacyTrade = VillageTrade & { neighbours?: unknown[] };

export function legacyNeighbourName(seed: number, direction: Direction8): string {
  return suggestVillageName(deriveSeed(seed, `neighbour-name:${direction}`));
}

/**
 * Převod `fictional-neighbours` (markets.md – Pravidla 10): smaže `trade.neighbours`; výpravy na
 * cestě a další id výpravy nechá (nákupy a cesty pro kování leží mimo obchod). Na kopii jen když
 * ves zbytky roku sousedů má, jinak týž objekt; vstupní stav nemění.
 */
export function withoutFictionalNeighbours(state: VillageState): VillageState {
  const trade = state.trade as LegacyTrade | undefined;
  if (trade?.neighbours === undefined) return state;
  const next: LegacyTrade = { ...trade };
  delete next.neighbours;
  return { ...state, trade: next };
}
