import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { goldenWorld } from '../../core/__tests__/village-golden-fixture';
import { advanceVillage } from '../../core/simulate';
import { summerWinterInput } from '../husbandry';
import { retiringHeads, winterKeepTargets } from '../livestock';
import { withRoomyPens } from '../../__tests__/village-fixtures';

// Letní porážka nevybije stádo (diet.md – Strava po vrstvách a porážka celý rok; kontrola Úlohy 4,
// 18. 11. 2026): zlatá ves se 40 kozami a 30 prasaty, prostornými ohradami a loukou – co ves
// v létě porazí pro rod vojvody, stádo přes zimu nezmenší pod odhad 1. 4. bez starých kusů.
// Pomalý test (zlatá ves se staví ≈ 12 s) – `npm run test:slow`.

describe('letní porážka ve zlaté vsi', () => {
  it('stádo přes zimu se letní porážkou nezmenší pod odhad 1. 4. minus staré kusy', () => {
    const w = goldenWorld();
    const start = dateOfDayIndex(w.start.lastDay);
    const year = start.year + 1;
    const march = dayIndexOf({ year, month: 3, day: 31 });
    const s = structuredClone(advanceVillage(w.start, march, w.obstacles, w.landscape));
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    withRoomyPens(s);
    s.livestock!.herds.goat = 40;
    s.livestock!.herds.pig = 30;
    s.livestock!.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    const april = advanceVillage(s, march + 1, w.obstacles, w.landscape);
    const keep = winterKeepTargets(april, march + 1, summerWinterInput(april, march + 1));
    const old = retiringHeads(april.livestock!.herds, april.livestock!.young);
    const october = advanceVillage(
      april,
      dayIndexOf({ year, month: 10, day: 31 }),
      w.obstacles,
      w.landscape,
    );
    const taken = october.livestock!.summerSlaughtered ?? {};
    expect(Object.values(taken).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
    const winter = advanceVillage(
      october,
      dayIndexOf({ year, month: 11, day: 2 }),
      w.obstacles,
      w.landscape,
    );
    const herds = winter.livestock!.herds;
    const culling = winter.livestock!.culling;
    for (const species of ['goat', 'pig'] as const) {
      const kept = herds[species] - (culling?.[species] ?? 0);
      expect(kept).toBeGreaterThanOrEqual(keep[species] - old[species]);
    }
  }, 600_000);
});
