import { describe, expect, it } from 'vitest';
import { startNewDwelling } from '../actions';
import { advanceVillage } from '../simulate';
import { waitingHouseholds } from '../households';
import { at, field, found, YEAR } from './simulate-fixtures';

// Pomalý test dopočtu vsi (80 let) – jede v `npm run test:slow`.

describe('advanceVillage – dlouhý dopočet', () => {
  it('bez stěhování tam a zpět: ves, kde hráč staví, kdykoli může (80 let, 3 vsi)', () => {
    for (const seed of [3, 8, 21]) {
      const day = at(600, 3, 15);
      let s = found(day, seed, field(250));
      s.storesKg = 50_000;
      let worst = 0;
      for (let year = 1; year <= 80 && !s.extinctDay; year++) {
        const from = s.lastDay;
        s = advanceVillage(s, day + Math.ceil(year * YEAR), null);
        const moves = s.chronicle.filter(
          (e) =>
            e.day > from &&
            (e.kind === 'household-founded' ||
              e.kind === 'marriage' ||
              e.kind === 'household-merged'),
        ).length;
        worst = Math.max(worst, moves);
        while (waitingHouseholds(s, s.lastDay) > 0) {
          s = startNewDwelling(s, s.lastDay, 'zemnice', { x: 5, z: 5, rotation: 0 }, 0);
        }
      }
      // pár svateb a nových domácností za rok – ne stovky (stěhování každý den)
      expect(worst).toBeLessThan(12);
    }
  }, 120_000);
});
