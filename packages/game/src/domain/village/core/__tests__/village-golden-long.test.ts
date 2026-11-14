import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../simulate';
import { goldenWorld, stateFingerprint, YEAR } from './village-golden-fixture';

// Pomalá sada (npm run test:slow): zlatý otisk vsi z village-golden.test.ts po 2. a 3. roce
// dopočtu, vcelku po jednotlivých letech. Vědomé přepsání otisků: viz village-golden.test.ts.

// 14. 11. 2026 – stavby staví muži (population.md – Práce): na stavby jde jen díl mužů ze
// společné práce; dřív c99147eba93dbf6e a 2f3ab71db19f73c6
const EXPECTED_YEAR_2 = '1a766c1232b112a9';
const EXPECTED_YEAR_3 = '02b6d592aeb6b165';

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
