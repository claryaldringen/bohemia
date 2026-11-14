import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../simulate';
import { goldenWorld, stateFingerprint, YEAR } from './village-golden-fixture';

// Pomalá sada (npm run test:slow): zlatý otisk vsi z village-golden.test.ts po 2. a 3. roce
// dopočtu, vcelku po jednotlivých letech. Vědomé přepsání otisků: viz village-golden.test.ts.

// 14. 11. 2026 – stavby staví muži (population.md – Práce, „D24 ano“): denní práci nesou napřed
// ženy, na stavby jde jen práce mužů, která zbude; dřív c99147eba93dbf6e a 2f3ab71db19f73c6
// (před D24), 1a766c1232b112a9 a 02b6d592aeb6b165 (D24 s dělením poměrem)
// 14. 11. 2026 – sloučení zboží vsi (hides-honey.md) s D24: dřív 69109b1f98faa831
// a f081cee3459719e2 (zboží bez D24), 8a0abe82b58bcef8 a 91a89a9500dcce15 (D24 bez zboží)
const EXPECTED_YEAR_2 = 'f81e4a064771f2bd';
const EXPECTED_YEAR_3 = 'e52babe3f8cdc2b0';

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
