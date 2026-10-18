import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { eatDiet } from '../diet';
import { goodsDay, goodsHappiness, honeyEnergy } from '../goods';
import { happinessFactors, happinessTarget } from '../happiness';
import { FOREIGN_GOODS } from '../rules';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Zboží zvenku ve vsi (trade.md – Zboží zvenku): sůl a kožešiny přidávají štěstí a ubývají, med se
// jí (energie, štěstí jako ovoce).

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 4, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = DAY;
  return s;
}

describe('sůl a kožešiny', () => {
  it('štěstí: sůl +3, dokud je; kožešiny až +2 podle počtu na člověka', () => {
    const s = village();
    expect(goodsHappiness(s)).toBe(0);
    s.goods = { saltKg: 1, ironKg: 0, honeyKg: 0, furs: 0 };
    expect(goodsHappiness(s)).toBe(FOREIGN_GOODS.saltHappiness);
    s.goods.furs = s.people.length / 2;
    expect(goodsHappiness(s)).toBeCloseTo(FOREIGN_GOODS.saltHappiness + 1);
    s.goods.furs = 100;
    expect(goodsHappiness(s)).toBeCloseTo(FOREIGN_GOODS.saltHappiness + FOREIGN_GOODS.furHappiness);
    const f = happinessFactors(s, DAY, 1);
    expect(f.goods).toBeCloseTo(5);
    expect(happinessTarget(f)).toBeCloseTo(happinessTarget({ ...f, goods: 0 }) + 5);
    // bez zboží zvenku složka chybí (starší složky beze změny)
    expect(happinessFactors(village(), DAY, 1).goods).toBeUndefined();
  });

  it('sůl se jí 3 kg na člověka a rok, kožešiny se opotřebí 20 % ročně', () => {
    const s = village();
    const people = s.people.length;
    s.goods = { saltKg: 10, ironKg: 0, honeyKg: 0, furs: 10 };
    for (let i = 0; i < 365; i++) goodsDay(s);
    expect(s.goods.saltKg).toBeCloseTo(Math.max(0, 10 - people * 3), 6);
    expect(s.goods.furs).toBeCloseTo(8, 6);
  });
});

describe('med', () => {
  it('jí se rovným dílem do roka, nejvýš 5 % energie – ušetří obilí', () => {
    const base = {
      grainKg: 1000,
      meatKg: 0,
      fruitKg: 0,
      needPerDay: 2,
      daysToHarvest: 100,
      daysToRot: 0,
      daysToSlaughter: 100,
      potteryCoverage: 0,
    };
    const plain = eatDiet(base);
    const sweet = eatDiet({ ...base, honeyKg: 365 });
    const eaten = 365 - sweet.honeyKg;
    expect(honeyEnergy(eaten)).toBeCloseTo(Math.min(0.05 * 2, honeyEnergy(365) / 365), 9);
    expect(sweet.diet.shares.honey).toBeGreaterThan(0);
    expect(sweet.grainKg).toBeGreaterThan(plain.grainKg);
    expect(eatDiet({ ...base, honeyKg: 0 }).diet.shares.honey).toBeUndefined();
  });

  it('v simulaci med ubývá a přidá štěstí jako ovoce', () => {
    const s = village();
    s.goods = { saltKg: 0, ironKg: 0, honeyKg: 50, furs: 0 };
    const next = advanceVillage(s, DAY + 30, null);
    expect(next.goods!.honeyKg).toBeLessThan(50);
    expect(next.diet!.shares.honey).toBeGreaterThan(0);
    const without = advanceVillage(village(), DAY + 30, null);
    expect(next.happiness!.value).toBeGreaterThan(without.happiness!.value);
  });
});
