import { describe, expect, it, vi } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { goldenWorld } from '../../core/__tests__/village-golden-fixture';
import { advanceVillage } from '../../core/simulate';
import { summerWinterInput } from '../husbandry';
import { summerSlaughterCandidates } from '../summer-slaughter';
import type { HerdSpecies, VillageState } from '../../types';
import { withRoomyPens } from '../../__tests__/village-fixtures';

// Letní porážka nevybije stádo (diet.md – Strava po vrstvách a porážka celý rok; kontrola Úlohy 4,
// 18. 11. 2026): zlatá ves se 40 kozami a 30 prasaty, prostornými ohradami a loukou. Léto nevezme
// víc než kandidáti 1. 4., sena je k 31. 10. aspoň 97 % sena vsi bez letní porážky a při stejném
// seně je stádo přes zimu stejné jako bez letní porážky (táž ves, letní porážka vypnutá). Vliv
// menší seče na stádo přes zimu test neměří (diet.md – Důsledky k vědomí: kozy dostávají seno
// poslední, D98 kolo 1 −14 %). Pomalý test (zlatá ves se staví ≈ 12 s) – `npm run test:slow`.

const summer = vi.hoisted(() => ({ off: false }));
vi.mock('../summer-slaughter', async (importOriginal) => {
  const real = await importOriginal<typeof import('../summer-slaughter')>();
  return {
    ...real,
    summerSlaughterDay: (...args: Parameters<typeof real.summerSlaughterDay>): void => {
      if (!summer.off) real.summerSlaughterDay(...args);
    },
  };
});

const SPECIES: readonly HerdSpecies[] = ['goat', 'pig'];

describe('letní porážka ve zlaté vsi', () => {
  it('léto nevezme víc než kandidáti 1. 4. a při stejném seně je stádo přes zimu jako bez letní porážky', () => {
    const w = goldenWorld();
    const year = dateOfDayIndex(w.start.lastDay).year + 1;
    const march = dayIndexOf({ year, month: 3, day: 31 });
    const s = structuredClone(advanceVillage(w.start, march, w.obstacles, w.landscape));
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    withRoomyPens(s);
    s.livestock!.herds.goat = 40;
    s.livestock!.herds.pig = 30;
    s.livestock!.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
    const at = (state: VillageState, month: number, day: number): VillageState =>
      advanceVillage(state, dayIndexOf({ year, month, day }), w.obstacles, w.landscape);
    const run = (off: boolean): { october: VillageState; winter: VillageState } => {
      summer.off = off;
      const october = at(structuredClone(s), 10, 31);
      return { october, winter: at(october, 11, 2) };
    };
    // kandidáti 1. 4. po narození mláďat (i s kusem, který ten den ves porazila)
    summer.off = false;
    const april = at(structuredClone(s), 4, 1);
    const first = summerSlaughterCandidates(april, march + 1, summerWinterInput(april, march + 1));
    const takenApril = april.livestock!.summerSlaughtered ?? {};
    const on = run(false);
    const off = run(true);
    // seno k 31. 10.: menší stádo v létě potřebuje méně sena, seč je o kousek menší (zlatá ves po
    // D98 kolo 1, 18. 11. 2026: 8 681 proti 8 809 kg)
    expect(on.october.hay!.kg).toBeGreaterThan(0.97 * off.october.hay!.kg);
    // stádo přes zimu se srovnává při stejném seně: kozy dostávají seno poslední, takže by na nich
    // ležel celý rozdíl sena (128 kg ≈ 1,4 kozy – 14 %) a test by měřil seč, ne letní porážku
    // (D98 kolo 1, 18. 11. 2026 – dřív se srovnávalo i s jiným senem)
    const sameHay = structuredClone(on.october);
    sameHay.hay!.kg = off.october.hay!.kg;
    summer.off = false;
    const onWinter = at(sameHay, 11, 2);
    const taken = on.october.livestock!.summerSlaughtered ?? {};
    expect(SPECIES.reduce((sum, sp) => sum + (taken[sp] ?? 0), 0)).toBeGreaterThan(0);
    for (const sp of SPECIES) {
      expect(taken[sp] ?? 0).toBeLessThanOrEqual(
        Math.floor(first[sp] + (takenApril[sp] ?? 0) + 1e-9),
      );
      const kept = (r: VillageState): number =>
        r.livestock!.herds[sp] - (r.livestock!.culling?.[sp] ?? 0);
      // stejně až na ztráty stáda a jiné jídlo a práci za léto (≈ 0,6 %; po D113 – jiné dny dřiny, tedy
      // štěstí a práce – ≈ 2,8 % na stádě kolem 7 kusů; bez opravy ≈ 50 %)
      expect(Math.abs(kept(onWinter) - kept(off.winter))).toBeLessThanOrEqual(
        0.04 * kept(off.winter),
      );
    }
  }, 600_000);
});
