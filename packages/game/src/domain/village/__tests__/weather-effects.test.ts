import { beforeAll, describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { dayPartLosses } from '../disasters';
import { hayWinterDaysLeft, isHayWinter } from '../hay';
import { advanceVillage } from '../simulate';
import type { HayMowing, PartProtection, VillageState, WeatherOverride } from '../types';
import {
  bufferEnergyYearsOf,
  famineMemoryDay,
  hayWeatherFactor,
  isLongWinter,
  mowingWeatherFactor,
  partWeatherFactor,
  springSowingHeld,
  threshWorkFactor,
} from '../weather-effects';
import { withBuiltFirstDwelling } from './village-fixtures';

// Sucho, deštivé léto a krutá zima (disasters.md – Léto, Zima, Ochrana dílu, Dopady).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

const forest: PartProtection = { green: 1 };
const bare: PartProtection = { green: 0 };

/** Ves jen s vynuceným počasím roku (bez seedu) a ochranou dílů 1 (u lesa) a 2 (uprostřed lánu). */
const forced = (year: number, weather: WeatherOverride): Pick<VillageState, 'disasters'> => ({
  disasters: {
    override: { weather: { [year]: weather } },
    protection: { year, parts: { '1': forest, '2': bare } },
  },
});

describe('násobek úrody dílu podle počasí a ochrany', () => {
  it('kruté sucho: jař u lesa ×0,75, uprostřed lánu ×0,5; ozim ×0,875 a ×0,75', () => {
    expect(partWeatherFactor({ summer: 'drought' }, 'spring', forest)).toBeCloseTo(0.75, 9);
    expect(partWeatherFactor({ summer: 'drought' }, 'spring', bare)).toBeCloseTo(0.5, 9);
    expect(partWeatherFactor({ summer: 'drought' }, 'legume', bare)).toBeCloseTo(0.5, 9);
    expect(partWeatherFactor({ summer: 'drought' }, 'winter', forest)).toBeCloseTo(0.875, 9);
    expect(partWeatherFactor({ summer: 'drought' }, 'winter', bare)).toBeCloseTo(0.75, 9);
  });

  it('sucho: díl u vody +0,2, vyvýšený −0,2; bez údaje typická ves (zeleň 0,25)', () => {
    expect(
      partWeatherFactor({ summer: 'dry' }, 'spring', { green: 0, nearWater: true }),
    ).toBeCloseTo(1 - 0.25 * 0.9, 9);
    expect(
      partWeatherFactor({ summer: 'dry' }, 'spring', { green: 0.5, raised: true }),
    ).toBeCloseTo(1 - 0.25 * 0.85, 9);
    expect(partWeatherFactor({ summer: 'drought' }, 'spring', undefined)).toBeCloseTo(
      1 - 0.5 * 0.875,
      9,
    );
  });

  it('mokré žně: niva ×0,56, svah ×0,64, zeleň nepomáhá', () => {
    expect(
      partWeatherFactor({ summer: 'wetHarvest' }, 'winter', { green: 1, lowland: true }),
    ).toBeCloseTo(0.56, 9);
    expect(
      partWeatherFactor({ summer: 'wetHarvest' }, 'spring', { green: 0, slope: true }),
    ).toBeCloseTo(0.64, 9);
    expect(partWeatherFactor({ summer: 'wetHarvest' }, 'spring', forest)).toBeCloseTo(0.6, 9);
    expect(partWeatherFactor({ summer: 'wet' }, 'spring', bare)).toBeCloseTo(0.85, 9);
  });

  it('holomráz: ozim ×0,65 bez zeleně, u lesa ×0,825, vyvýšený hůř; jař beze změny', () => {
    const frost = { winter: 'blackFrost' } as const;
    expect(partWeatherFactor(frost, 'winter', bare)).toBeCloseTo(0.65, 9);
    expect(partWeatherFactor(frost, 'winter', forest)).toBeCloseTo(0.825, 9);
    expect(partWeatherFactor(frost, 'winter', { green: 0.2, raised: true })).toBeCloseTo(0.65, 9);
    expect(partWeatherFactor(frost, 'spring', bare)).toBe(1);
    // holomráz a sucho se násobí
    expect(partWeatherFactor({ ...frost, summer: 'drought' }, 'winter', bare)).toBeCloseTo(
      0.65 * 0.75,
      9,
    );
  });

  it('dobré léto ×1,15 bez ohledu na ochranu; seno v krutém suchu s ochranou louky', () => {
    expect(partWeatherFactor({ summer: 'good' }, 'spring', bare)).toBeCloseTo(1.15, 9);
    expect(partWeatherFactor({ summer: 'good' }, 'winter', forest)).toBeCloseTo(1.15, 9);
    expect(partWeatherFactor({}, 'winter', bare)).toBe(1);
    expect(hayWeatherFactor('drought', bare)).toBeCloseTo(0.45, 9);
    expect(hayWeatherFactor('drought', forest)).toBeCloseTo(1 - 0.55 * 0.5, 9);
    expect(hayWeatherFactor('wetHarvest', bare)).toBeCloseTo(0.6, 9);
  });
});

describe('ztráty dílů při sklizni a v odhadu', () => {
  const day = at(601, 8, 31);

  it('ves bez počasí vrací škodu zvěře beze změny (týž objekt)', () => {
    const base = { '1': { share: 0.1 } };
    expect(dayPartLosses({}, day, 'spring', [1, 2], base)).toBe(base);
    expect(dayPartLosses({}, day, 'spring', [1, 2], undefined)).toBeUndefined();
  });

  it('normální rok vrací škodu zvěře beze změny i ve vsi s počasím', () => {
    const base = { '1': { share: 0.1 } };
    const state = forced(601, { summer: 'normal', winter: 'normal' });
    expect(dayPartLosses(state, day, 'spring', [1, 2], base)).toBe(base);
  });

  it('kruté sucho se škodou zvěře: úroda dílu = počasí × (1 − škoda)', () => {
    const state = forced(601, { summer: 'drought' });
    const losses = dayPartLosses(state, day, 'spring', [1, 2], { '1': { share: 0.1 } });
    expect(losses?.['1']?.share).toBeCloseTo(1 - 0.75 * 0.9, 9);
    expect(losses?.['2']?.share).toBeCloseTo(0.5, 9);
  });

  it('odhad vidí sucho až od 1. 5.; na podzim počasí příštího roku sklizně ne', () => {
    const state = forced(601, { summer: 'drought' });
    expect(dayPartLosses(state, at(601, 4, 30), 'winter', [2], undefined, true)).toBeUndefined();
    expect(
      dayPartLosses(state, at(601, 5, 1), 'winter', [2], undefined, true)?.['2']?.share,
    ).toBeCloseTo(0.25, 9);
    expect(dayPartLosses(state, at(600, 10, 15), 'winter', [2], undefined, true)).toBeUndefined();
    // sklizeň počítá s celým rokem i před odhalením
    expect(
      dayPartLosses(state, at(601, 4, 30), 'winter', [2], undefined)?.['2']?.share,
    ).toBeCloseTo(0.25, 9);
  });
});

describe('seno, krutá zima, výmlat a paměť hladu', () => {
  it('seno seče vážené plochou luk – díly podle ochrany, přirozené louky jako typická ves', () => {
    const state = forced(601, { summer: 'drought' });
    const mowing = {
      squares: [
        { partId: 1, areaM2: 100, distanceM: 0 },
        { partId: 2, areaM2: 100, distanceM: 0 },
        { cell: { x: 0, y: 0 }, areaM2: 200, distanceM: 0 },
      ],
    } as unknown as HayMowing;
    const expected =
      (hayWeatherFactor('drought', forest) +
        hayWeatherFactor('drought', bare) +
        2 * hayWeatherFactor('drought', undefined)) /
      4;
    expect(mowingWeatherFactor(state, at(601, 6, 10), mowing)).toBeCloseTo(expected, 9);
    expect(mowingWeatherFactor({}, at(601, 6, 10), mowing)).toBe(1);
  });

  it('dlouhá zima: prosinec patří k zimě příštího roku, seno do 30. 4., setí jařin od 22. 3.', () => {
    const state = forced(601, { winter: 'long' });
    expect(isLongWinter(state, at(600, 12, 10))).toBe(true);
    expect(isLongWinter(state, at(601, 4, 10))).toBe(true);
    expect(isLongWinter(state, at(601, 12, 10))).toBe(false);
    expect(isHayWinter(at(601, 4, 30), true)).toBe(true);
    expect(isHayWinter(at(601, 4, 30), false)).toBe(false);
    expect(isHayWinter(at(601, 5, 1), true)).toBe(false);
    expect(hayWinterDaysLeft(at(601, 4, 1), true)).toBe(30);
    expect(hayWinterDaysLeft(at(601, 3, 1), false)).toBe(31);
    expect(springSowingHeld(state, at(601, 3, 21), 'spring')).toBe(true);
    expect(springSowingHeld(state, at(601, 3, 21), 'flax')).toBe(true);
    expect(springSowingHeld(state, at(601, 3, 22), 'spring')).toBe(false);
    expect(springSowingHeld(state, at(601, 3, 21), 'winter')).toBe(false);
    expect(springSowingHeld(forced(601, { winter: 'normal' }), at(601, 3, 5), 'spring')).toBe(
      false,
    );
  });

  it('deštivé léto: výmlat o 20 % víc práce; sucho ne', () => {
    expect(threshWorkFactor(forced(601, { summer: 'wet' }), at(601, 7, 31))).toBeCloseTo(1.2, 9);
    expect(threshWorkFactor(forced(601, { summer: 'wetHarvest' }), at(601, 8, 31))).toBeCloseTo(
      1.2,
      9,
    );
    expect(threshWorkFactor(forced(601, { summer: 'drought' }), at(601, 8, 31))).toBe(1);
    expect(threshWorkFactor({}, at(601, 8, 31))).toBe(1);
  });

  it('paměť hladu: po krutém roce 10 let pojistka 0,75, pak zase 0,5', () => {
    const cruel = forced(601, { summer: 'drought' }) as VillageState;
    famineMemoryDay(cruel, at(601, 8, 31));
    expect(cruel.disasters?.famineMemoryUntilYear).toBeUndefined();
    famineMemoryDay(cruel, at(601, 9, 1));
    expect(cruel.disasters?.famineMemoryUntilYear).toBe(611);
    expect(bufferEnergyYearsOf(cruel, at(601, 9, 1), 0.5)).toBe(0.75);
    expect(bufferEnergyYearsOf(cruel, at(611, 9, 1), 0.5)).toBe(0.75);
    expect(bufferEnergyYearsOf(cruel, at(612, 9, 1), 0.5)).toBe(0.5);
    // holomráz se zlým létem je krutý, holomráz s normálním létem ne
    const frost = forced(601, { winter: 'blackFrost', summer: 'wet' }) as VillageState;
    famineMemoryDay(frost, at(601, 9, 1));
    expect(frost.disasters?.famineMemoryUntilYear).toBe(611);
    const mild = forced(601, { winter: 'blackFrost' }) as VillageState;
    famineMemoryDay(mild, at(601, 9, 1));
    expect(mild.disasters?.famineMemoryUntilYear).toBeUndefined();
  });
});

describe('sklizeň v simulaci – kruté sucho, vcelku = po kouscích', () => {
  const FROM = at(601, 7, 20);
  const TO = at(601, 9, 5);
  let before: VillageState;

  beforeAll(() => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: at(600, 8, 25), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 5_000;
    // připravené díly pole (jako holdings.test.ts) – ves je 1. 9. oseje ozimem a jaří
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: 40 }, (_, i) => ({
      id: 100 + i,
      fieldId: 1,
      areaM2: 225,
      distanceM: 100,
      naturalFertility: 70,
      fertilityShare: 1,
      bonusUntilDay: null,
      state: 'ready' as const,
      sownYears: 0,
      fallowSinceDay: null,
      foundingCost: 1,
      foundingDone: 1,
      surface: 'meadow' as const,
    }));
    before = advanceVillage(s, FROM, null);
  }, 120_000);

  const withWeather = (summer: 'normal' | 'drought'): VillageState => ({
    ...structuredClone(before),
    disasters: { override: { weather: { 601: { summer, winter: 'normal' } } } },
  });
  const harvested = (s: VillageState): number =>
    s.chronicle
      .filter((e) => e.kind === 'harvest' && e.day > FROM)
      .reduce((sum, e) => sum + (e.kind === 'harvest' ? e.kg : 0), 0);

  it('kruté sucho ubere čistou úrodu víc než hrubou (osivo celé); po 1, 7 a 30 dnech stejně', () => {
    const normal = advanceVillage(withWeather('normal'), TO, null);
    const drought = advanceVillage(withWeather('drought'), TO, null);
    expect(harvested(normal)).toBeGreaterThan(0);
    // hrubá úroda bez ochrany ozim ×0,75·, jař ×0,5· (typická ves – zeleň 0,25); čistá klesne víc
    expect(harvested(drought)).toBeLessThan(harvested(normal) * 0.8);
    const json = JSON.stringify(drought);
    for (const step of [1, 7, 30]) {
      let s = withWeather('drought');
      while (s.lastDay < TO) s = advanceVillage(s, Math.min(TO, s.lastDay + step), null);
      expect(JSON.stringify(s)).toBe(json);
    }
  }, 120_000);
});
