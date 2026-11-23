// Jména dřívějších smyšlených sousedů (markets.md – Pravidla 10): ves už s okolím neobchoduje, ale
// stará kronika a karavany na cestě je jmenují dál – jméno je týž los jako dřív, čistá funkce seedu.
import { deriveSeed } from '../../landscape/random';
import { suggestVillageName } from '../people/names';
import type { Direction8 } from '../types';

export function legacyNeighbourName(seed: number, direction: Direction8): string {
  return suggestVillageName(deriveSeed(seed, `neighbour-name:${direction}`));
}
