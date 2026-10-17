import { describe, expect, it } from 'vitest';
import { foundField, foundVillage, startNewDwelling } from '../actions';
import {
  BUILD_COSTS,
  affordability,
  buildAffordability,
  payUpfront,
  villageStock,
  type BuildCost,
  type BuildKind,
} from '../costs';
import { DWELLINGS, FOUNDING_COST_PER_HA } from '../rules';
import type { Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

const DAY = 1000;
const POSITION = { x: 10, z: 20, rotation: 0 };
const start = (): VillageState => foundVillage({ seed: 7, day: DAY, dwellingPosition: POSITION });
const YEAR = 365.25;

/**
 * Zemnice zakladatelů stojí a domácnost v ní je plná se 4 dospělými 14–44 – může se z ní
 * oddělit jeden mladý pár (jeden člověk k osídlení).
 */
const fullHousehold = (): VillageState => {
  const s = withBuiltFirstDwelling(start());
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: DAY - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 20), adult(5, 19), adult(6, 5), adult(7, 3)];
  return s;
};

/** Hypotetická cena předem – kontrola mechanismu, než vznikne první surovina (dřevo, kámen). */
const withUpfront = (kind: BuildKind, grain: number): Record<BuildKind, BuildCost> => ({
  ...BUILD_COSTS,
  [kind]: { ...BUILD_COSTS[kind], upfront: { ...BUILD_COSTS[kind].upfront, grain } },
});

describe('ceny staveb', () => {
  it('práce podle pravidel; obydlí chce předem jednu domácnost k osídlení, pole nic', () => {
    expect(BUILD_COSTS.zemnice).toEqual({
      laborManDays: DWELLINGS.zemnice.cost,
      perHa: false,
      upfront: { settlers: 1 },
    });
    expect(BUILD_COSTS.polozemnice).toEqual({
      laborManDays: DWELLINGS.polozemnice.cost,
      perHa: false,
      upfront: { settlers: 1 },
    });
    expect(BUILD_COSTS.field).toEqual({
      laborManDays: FOUNDING_COST_PER_HA.meadow,
      perHa: true,
      upfront: {},
    });
  });

  it('čerstvá ves (zemnice se staví) nemá koho osadit – obydlí nejde, pole ano i bez zásob', () => {
    const s = start();
    s.storesKg = 0;
    expect(villageStock(s)).toEqual({ grain: 0, settlers: 0 });
    for (const kind of ['zemnice', 'polozemnice'] as const) {
      expect(buildAffordability(s, kind)).toEqual({ affordable: false, missing: { settlers: 1 } });
    }
    expect(buildAffordability(s, 'field')).toEqual({ affordable: true, missing: {} });
  });

  it('plná domácnost dá jednoho k osídlení; rozestavěné obydlí ho zamluví', () => {
    const s = fullHousehold();
    expect(villageStock(s).settlers).toBe(1);
    expect(buildAffordability(s, 'polozemnice')).toEqual({ affordable: true, missing: {} });
    const building = startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(villageStock(building).settlers).toBe(0);
    expect(buildAffordability(building, 'polozemnice').missing).toEqual({ settlers: 1 });
  });

  it('prázdné hotové obydlí čeká na pár taky – další obydlí nejde', () => {
    const s = fullHousehold();
    s.dwellings.push({ id: 50, type: 'zemnice', builtDay: DAY, condition: 1, position: POSITION });
    expect(villageStock(s).settlers).toBe(0);
    expect(buildAffordability(s, 'zemnice').affordable).toBe(false);
  });
});

describe('affordability', () => {
  it('chybějící část po surovinách', () => {
    expect(affordability({ grain: 30, settlers: 0 }, { grain: 50 })).toEqual({
      affordable: false,
      missing: { grain: 20 },
    });
    expect(affordability({ grain: 50, settlers: 0 }, { grain: 50 })).toEqual({
      affordable: true,
      missing: {},
    });
    expect(affordability({ grain: 0, settlers: 0 }, {})).toEqual({ affordable: true, missing: {} });
    expect(affordability({ grain: 0, settlers: 0 }, { grain: 5, settlers: 1 })).toEqual({
      affordable: false,
      missing: { grain: 5, settlers: 1 },
    });
  });

  it('hypotetická cena předem: bez zásob stavba nejde, se zásobami se zaplatí', () => {
    const s = fullHousehold();
    const costs = withUpfront('zemnice', s.storesKg + 40);
    expect(buildAffordability(s, 'zemnice', costs)).toEqual({
      affordable: false,
      missing: { grain: expect.closeTo(40, 6) },
    });
    expect(buildAffordability(s, 'polozemnice', costs).affordable).toBe(true);
    const cheap = withUpfront('zemnice', 100);
    const paid = structuredClone(s);
    payUpfront(paid, 'zemnice', cheap);
    // lidé k osídlení se neplatí – zamluví je rozestavěná stavba
    expect(paid).toEqual({ ...s, storesKg: expect.closeTo(s.storesKg - 100, 6) });
  });
});

describe('akce s cenou předem', () => {
  it('startNewDwelling a foundField dnes nic ze zásob neberou', () => {
    const s = fullHousehold();
    const built = startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(built.storesKg).toBe(s.storesKg);
    const field = foundField(s, DAY, {
      parts: [
        {
          areaM2: 1500,
          distanceM: 100,
          naturalFertility: 60,
          surface: 'meadow',
          obstacleCost: 0,
        },
      ],
    });
    expect(field.storesKg).toBe(s.storesKg);
  });

  it('obydlí bez lidí k osídlení vyhodí RangeError – i druhé za jediný pár', () => {
    const s = start();
    expect(() => startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0)).toThrow(
      RangeError,
    );
    const once = startNewDwelling(fullHousehold(), DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(() => startNewDwelling(once, DAY, 'polozemnice', { ...POSITION, x: 80 }, 0)).toThrow(
      RangeError,
    );
  });
});
