import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../simulate';
import { goldenWorld, stateFingerprint, YEAR } from './village-golden-fixture';

// Pomalá sada (npm run test:slow): zlatý otisk vsi z village-golden.test.ts po 2. a 3. roce
// dopočtu, vcelku po jednotlivých letech. Vědomé přepsání otisků: viz village-golden.test.ts.

const EXPECTED_YEAR_2 = '04d2376dba35d0d3';
const EXPECTED_YEAR_3 = 'f71423c436b19b5e';

describe('zlatý otisk vsi – delší běh', () => {
  it('po 2. a 3. roce dopočtu dá zapsané otisky', () => {
    const world = goldenWorld();
    let s = world.start;
    const prints: string[] = [];
    for (let year = 1; year <= 3; year++) {
      s = advanceVillage(s, s.lastDay + YEAR, world.obstacles, world.landscape);
      prints.push(stateFingerprint(s));
    }
    expect(prints.slice(1)).toEqual([EXPECTED_YEAR_2, EXPECTED_YEAR_3]);
  });
});
