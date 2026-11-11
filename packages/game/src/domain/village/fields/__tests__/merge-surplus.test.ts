import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
import { allocateDay } from '../../core/labor';
import { withoutSurplusCrops } from '../merge-surplus';
import { NO_CRAFTS } from '../../core/productivity';
import type { FarmSeason, SeasonCrop, VillageState } from '../../types';
import { createCropWork, seasonCrop } from '../../core/year-plan';

// Díly jedna fronta (fields.md – Osevní postup po dílech, bod 3, 9. 11. 2026): převod plodin nad
// potřebu a pletí mužů po stavbách.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 9, 20);

function village(): VillageState {
  const parts: PartInput[] = Array.from({ length: 6 }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 3,
    day: at(600, 6, 1),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      parts,
    },
  });
  s.lastDay = DAY;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'winter';
  }
  return s;
}

/** Plodina z dílů `from`–`to` s podílem hotové práce. */
function crop(s: VillageState, from: number, to: number, done: number): SeasonCrop {
  const work = createCropWork(
    s.parts.slice(from, to),
    DAY,
    NO_CRAFTS.tools,
    false,
    undefined,
    'winter',
  );
  for (const task of ['dig', 'sow'] as const) work.done[task] = work.required[task] * done;
  work.seedKg = 0;
  return { crop: 'winter', ...work };
}

describe('převod dílů nad potřebu (withoutSurplusCrops)', () => {
  it('ozim nad potřebu se slije s ozimem i s hotovou prací – jednou, vstup beze změny', () => {
    const s = village();
    const needed = crop(s, 0, 3, 1);
    const surplus = { ...crop(s, 3, 6, 0.5), surplus: true } as SeasonCrop;
    const season = {
      startDay: at(600, 9, 1),
      crops: [needed, surplus],
      selection: { window: 'x', waiting: [], floorKg: 5 },
    } as FarmSeason;
    s.season = season;
    const before = structuredClone(s);
    const done = needed.done.dig + surplus.done.dig;
    const next = withoutSurplusCrops(s);
    expect(s).toEqual(before);
    expect(next.season!.crops).toHaveLength(1);
    const winter = seasonCrop(next.season, 'winter')!;
    expect([...winter.partIds].sort()).toEqual(s.parts.map((p) => p.id).sort());
    expect(winter.done.dig).toBeCloseTo(done, 9);
    expect('surplus' in winter).toBe(false);
    expect('floorKg' in next.season!.selection!).toBe(false);
    expect(withoutSurplusCrops(next)).toBe(next);
  });

  it('po žních se úroda ve snopech sečte; jen nad potřebu se stane plodinou roku', () => {
    const s = village();
    const needed = { ...crop(s, 0, 3, 1), harvestedKg: 300 };
    const surplus = { ...crop(s, 3, 6, 1), harvestedKg: 200, surplus: true } as SeasonCrop;
    s.season = null;
    s.threshingSeason = { startDay: at(599, 9, 1), crops: [needed, surplus] };
    const next = withoutSurplusCrops(s);
    expect(seasonCrop(next.threshingSeason, 'winter')!.harvestedKg).toBe(500);
    const only = village();
    only.season = {
      startDay: at(600, 9, 1),
      crops: [{ ...crop(only, 0, 3, 0), surplus: true } as SeasonCrop],
    };
    const one = withoutSurplusCrops(only).season!;
    expect(one.crops).toHaveLength(1);
    expect('surplus' in one.crops[0]!).toBe(false);
  });
});

describe('pletí mužů až po stavbách (allocateDay – menWeedLater)', () => {
  it('muži práci vsi na pletí neberou – jejich díl se vrátí a společná práce zůstane', () => {
    const input = {
      capacity: 10,
      householdElders: [0],
      potteryCoverage: 1,
      womenLabor: 0,
      weedDaysLeft: 1,
      tasks: [{ name: 'weed' as const, remaining: 6 }],
    };
    const before = allocateDay(input);
    const later = allocateDay({ ...input, menWeedLater: true });
    expect(later.taskAmounts[0]).toBe(0);
    expect(later.menWeed).toEqual([{ index: 0, manDays: before.taskAmounts[0]! }]);
    expect(later.common).toBeCloseTo(before.common + before.taskAmounts[0]!, 9);
  });
});
