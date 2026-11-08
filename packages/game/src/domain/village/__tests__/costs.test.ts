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
import { DWELLING_TREES, DWELLINGS, FOUNDING_COST_PER_HA } from '../rules';
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
  it('práce podle pravidel; obydlí chce předem jen dřevo (ne lidi k osídlení), pole nic', () => {
    expect(BUILD_COSTS.zemnice).toEqual({
      laborManDays: DWELLINGS.zemnice.cost,
      perHa: false,
      upfront: { wood: DWELLING_TREES.zemnice },
    });
    expect(BUILD_COSTS.polozemnice).toEqual({
      laborManDays: DWELLINGS.polozemnice.cost,
      perHa: false,
      upfront: { wood: DWELLING_TREES.polozemnice },
    });
    expect(DWELLING_TREES).toEqual({ zemnice: 7, polozemnice: 18, dvorec: 27 });
    expect(BUILD_COSTS.field).toEqual({
      laborManDays: FOUNDING_COST_PER_HA.meadow.worst, // řemesla zatím nejsou – horní mez
      perHa: true,
      upfront: {},
    });
  });

  it('čerstvá ves nemá koho osadit – obydlí i pole jdou i bez lidí a zásob', () => {
    const s = start();
    s.storesKg = 0;
    // bez vrstvy překážek (testy, kalibrace) se kácí bez polohy – stromů neomezeně
    expect(villageStock(s)).toEqual({ grain: 0, wood: Infinity, oaks: Infinity, settlers: 0 });
    for (const kind of ['zemnice', 'polozemnice'] as const) {
      expect(buildAffordability(s, kind)).toEqual({ affordable: true, missing: {} });
    }
    expect(buildAffordability(s, 'field')).toEqual({ affordable: true, missing: {} });
  });

  it('plná domácnost dá jednoho k osídlení; rozestavěné obydlí ho zamluví', () => {
    const s = fullHousehold();
    expect(villageStock(s).settlers).toBe(1);
    expect(buildAffordability(s, 'polozemnice')).toEqual({ affordable: true, missing: {} });
    const building = startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(villageStock(building).settlers).toBe(0);
    // dřevo stačí – rozestavěné obydlí další obydlí nezablokuje
    expect(buildAffordability(building, 'polozemnice').affordable).toBe(true);
    // dílna lidi k osídlení dál chce
    expect(buildAffordability(building, 'potter').missing).toEqual({ settlers: 1 });
  });

  it('prázdné hotové obydlí čeká na pár taky – další obydlí jde, dílna ne', () => {
    const s = fullHousehold();
    s.dwellings.push({ id: 50, type: 'zemnice', builtDay: DAY, condition: 1, position: POSITION });
    expect(villageStock(s).settlers).toBe(0);
    expect(buildAffordability(s, 'zemnice').affordable).toBe(true);
    expect(buildAffordability(s, 'potter').affordable).toBe(false);
  });
});

describe('affordability', () => {
  it('chybějící část po surovinách', () => {
    const stock = (
      grain: number,
      wood = 0,
    ): Record<'grain' | 'wood' | 'oaks' | 'settlers', number> => ({
      grain,
      wood,
      oaks: 0,
      settlers: 0,
    });
    expect(affordability(stock(30), { grain: 50 })).toEqual({
      affordable: false,
      missing: { grain: 20 },
    });
    expect(affordability(stock(50), { grain: 50 })).toEqual({
      affordable: true,
      missing: {},
    });
    expect(affordability(stock(0), {})).toEqual({ affordable: true, missing: {} });
    expect(affordability(stock(0), { grain: 5, settlers: 1 })).toEqual({
      affordable: false,
      missing: { grain: 5, settlers: 1 },
    });
    expect(affordability(stock(0, 4), { wood: 7 })).toEqual({
      affordable: false,
      missing: { wood: 3 },
    });
  });

  it('hypotetická cena předem: bez zásob stavba nejde, se zásobami se zaplatí', () => {
    const s = fullHousehold();
    const costs = withUpfront('zemnice', s.storesKg + 40);
    expect(buildAffordability(s, 'zemnice', undefined, costs)).toEqual({
      affordable: false,
      missing: { grain: expect.closeTo(40, 6) },
    });
    expect(buildAffordability(s, 'polozemnice', undefined, costs).affordable).toBe(true);
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

  it('obydlí bez lidí k osídlení se začne stavět – dílna ne (RangeError)', () => {
    const s = start();
    const built = startNewDwelling(s, DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(built.constructions.some((c) => c.kind === 'dwelling')).toBe(true);
    const once = startNewDwelling(fullHousehold(), DAY, 'zemnice', { ...POSITION, x: 40 }, 0);
    expect(() =>
      startNewDwelling(once, DAY, 'polozemnice', { ...POSITION, x: 80 }, 0),
    ).not.toThrow();
  });
});
