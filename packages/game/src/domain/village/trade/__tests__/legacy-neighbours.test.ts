import { describe, expect, it } from 'vitest';
import { NEIGHBOR_DIRECTIONS } from '../../rules';
import { legacyNeighbourName } from '../legacy-neighbours';
import { neighbourOf } from '../neighbours';

// Jména dřívějších smyšlených sousedů (markets.md – Pravidla 10) – stará kronika a karavany je jmenují dál.
describe('legacyNeighbourName', () => {
  it('je týž los jako jméno z neighbourOf – 3 seedy × 8 směrů', () => {
    for (const seed of [1, 1234, 987654]) {
      for (const d of NEIGHBOR_DIRECTIONS) {
        expect(legacyNeighbourName(seed, d)).toBe(neighbourOf(seed, d).name);
      }
    }
  });

  it('jména jsou pevná', () => {
    expect(NEIGHBOR_DIRECTIONS.map((d) => legacyNeighbourName(1234, d))).toEqual(
      NEIGHBOR_DIRECTIONS.map((d) => neighbourOf(1234, d).name),
    );
  });
});
