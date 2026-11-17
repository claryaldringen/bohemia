import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../actions';
import {
  daysUntilMeatSpoil,
  grainKeepPerDay,
  honeyEnergy,
  meatEnergy,
  villageFoodNeed,
} from '../diet';
import { legumeEnergy } from '../../fields/legumes';
import { foodLastsDays, stockLastsDays } from '../food-lasts';
import { NO_CRAFTS } from '../productivity';
import type { VillageState } from '../../types';

// D56 (Martin 15. 11. 2026: „dolů do panelu s plodinami napiš, na jak dlouho vystačí zásoby“):
// kolik dní uživí dnešní zásoby lidi plným přídělem bez sklizní a příjmů.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const NOVEMBER = at(600, 11, 10);

const parts = (count: number): PartInput[] =>
  Array.from({ length: count }, () => ({
    areaM2: 225,
    distanceM: 60,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/** Ves zakladatelů (2 dospělí a 2 děti) jen se zásobami, které test nastaví – bez osiva. */
function village(stores: Partial<VillageState> & { honeyKg?: number } = {}): VillageState {
  const state = foundVillage({
    seed: 3,
    day: at(600, 4, 12),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      parts: parts(8),
    },
  });
  const { honeyKg = 0, ...rest } = stores;
  const clean: VillageState = { ...state, storesKg: 0, meatKg: 0, cheeseKg: 0, legumesKg: 0 };
  delete clean.reservedSeedKg;
  delete clean.reservedSeedUntilDay;
  delete clean.sowingSeed;
  delete clean.sheaves;
  delete clean.applesKg;
  return {
    ...clean,
    wares: {
      hides: 0,
      sheepFurs: 0,
      wildFurs: 0,
      waxKg: 0,
      ...clean.wares,
      honeyKg,
    },
    ...rest,
  };
}

const need = (state: VillageState, day: number): number => villageFoodNeed(state, day + 1);
const lasts = (state: VillageState, day: number = NOVEMBER): number =>
  foodLastsDays(state, day) ?? Number.NaN;

describe('foodLastsDays', () => {
  it('jen obilí: dny ≈ zásoba ÷ potřeba, se ztrátou ve skladu den po dni', () => {
    const grain = 500;
    const state = village({ storesKg: grain });
    const perDay = need(state, NOVEMBER);
    expect(perDay).toBeGreaterThan(0);
    // ráno ztráta, pak příděl: vydrží t dní, dokud Σ potřeba × keep^−j (j = 1 … t) ≤ zásoba
    const grow = 1 / grainKeepPerDay({ potteryCoverage: NO_CRAFTS.pottery });
    const expected = Math.floor(
      Math.log(1 + (grain * (grow - 1)) / (perDay * grow)) / Math.log(grow),
    );
    expect(lasts(state)).toBe(expected);
    // bez ztrát by vydržela o něco déle (do roka ztráta pod 10 %)
    expect(expected).toBeLessThan(grain / perDay);
    expect(expected).toBeGreaterThan(0.9 * (grain / perDay));
    // větší zásoba vydrží déle, ale ne úměrně – ztráta ve skladu roste s dobou
    const big = lasts(village({ storesKg: 6 * grain }));
    expect(big).toBeGreaterThan(4 * expected);
    expect(big).toBeLessThan(6 * expected);
  });

  it('bez jídla 0, bez lidí null', () => {
    expect(foodLastsDays(village(), NOVEMBER)).toBe(0);
    expect(foodLastsDays(village({ storesKg: 3000, people: [] }), NOVEMBER)).toBeNull();
  });

  it('osivo, které ves nejí, se nepočítá', () => {
    const withSeed = village({ storesKg: 3000, reservedSeedKg: 1000 });
    expect(lasts(withSeed)).toBe(lasts(village({ storesKg: 2000 })));
  });

  it('maso jen do stropu a do zkažení 1. 9. – samo plný příděl nedá', () => {
    // krátký výhled – obilí, které maso ušetří, se do konce zásob skoro nezkazí
    const grain = 300;
    const meat = 100;
    // maso samo pokryje nejvýš 40 % potřeby – plný příděl ani den
    expect(lasts(village({ meatKg: meat }))).toBe(0);
    // v listopadu se maso sní celé (do 1. 9. daleko) – přidá skoro celou svou energii
    const plain = village({ storesKg: grain });
    const perDay = need(plain, NOVEMBER);
    const novemberGain = lasts(village({ storesKg: grain, meatKg: meat })) - lasts(plain);
    expect(novemberGain).toBeGreaterThan((0.8 * meatEnergy(meat)) / perDay);
    expect(novemberGain).toBeLessThanOrEqual(meatEnergy(meat) / perDay + 1);
    // 20. 8. se do zkažení stihne jen 11 dní nejvýš po 40 % potřeby, zbytek přijde nazmar
    const august = at(601, 8, 20);
    const augustGain =
      lasts(village({ storesKg: grain, meatKg: meat }), august) - lasts(plain, august);
    expect(augustGain).toBeGreaterThan(0);
    expect(augustGain).toBeLessThanOrEqual(Math.ceil(11 * 0.4));
  });

  it('med a luštěniny přidají', () => {
    const grain = 300;
    const plain = village({ storesKg: grain });
    const perDay = need(plain, NOVEMBER);
    // med se nekazí – jí se po obilí, přidá celou svou energii
    const honey = 60;
    const honeyGain = lasts(village({ storesKg: grain, honeyKg: honey })) - lasts(plain);
    expect(Math.abs(honeyGain - honeyEnergy(honey) / perDay)).toBeLessThanOrEqual(1);
    // luštěniny do stropu, se ztrátou ve skladu
    const legumes = 100;
    const legumeGain = lasts(village({ storesKg: grain, legumesKg: legumes })) - lasts(plain);
    expect(legumeGain).toBeGreaterThan((0.8 * legumeEnergy(legumes)) / perDay);
    expect(legumeGain).toBeLessThanOrEqual(legumeEnergy(legumes) / perDay + 1);
  });
});

describe('daysUntilMeatSpoil', () => {
  it('uzené maso do 31. 8. včetně, 1. 9. ráno se zkazí', () => {
    expect(daysUntilMeatSpoil(at(601, 8, 31))).toBe(1);
    expect(daysUntilMeatSpoil(at(601, 9, 1))).toBe(0);
    expect(daysUntilMeatSpoil(at(601, 9, 2))).toBe(at(602, 9, 1) - at(601, 9, 2));
    expect(daysUntilMeatSpoil(at(601, 8, 21))).toBe(11);
  });
});

// D90 (Martin 17. 11. 2026): zásoba jedné potraviny a na kolik dní vystačí – do kroniky u sklizně.
describe('stockLastsDays', () => {
  it('obilí: kg bez osiva a dny jako foodLastsDays, když je obilí jediné jídlo', () => {
    const state = village({ storesKg: 3000, reservedSeedKg: 1000 });
    const out = stockLastsDays(state, NOVEMBER, 'grain');
    expect(out.kg).toBe(2000);
    expect(out.days).toBe(foodLastsDays(state, NOVEMBER));
  });

  it('luštěniny jen do stropu stravy – vystačí na víc dní než obilí téže energie', () => {
    const state = village({ legumesKg: 400 });
    const out = stockLastsDays(state, NOVEMBER, 'legumes');
    expect(out.kg).toBe(400);
    const perDay = need(state, NOVEMBER);
    expect(out.days ?? 0).toBeGreaterThan(legumeEnergy(400) / perDay);
  });

  it('jablka jen do dne, kdy shnijí', () => {
    const state = village({ applesKg: 100000 });
    const day = at(600, 11, 2);
    const out = stockLastsDays(state, day, 'apples');
    expect(out.days ?? 0).toBeGreaterThan(0);
    expect(out.days ?? 0).toBeLessThanOrEqual(365);
  });

  it('bez lidí null, bez zásoby 0', () => {
    expect(
      stockLastsDays(village({ storesKg: 3000, people: [] }), NOVEMBER, 'grain').days,
    ).toBeNull();
    expect(stockLastsDays(village(), NOVEMBER, 'grain').days).toBe(0);
  });
});
