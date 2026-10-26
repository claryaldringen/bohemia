import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { SMALL_GAME, WILDLIFE_CAPS } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import { smallGameCapacity, smallGameDay, wantsProtein } from '../small-game';
import type { VillageState } from '../types';
import { withWildlife } from '../wildlife';
import { withBuiltFirstDwelling } from './village-fixtures';

// Ryby a oka vesničanů (wildlife.md – Drobná zvěř a ryby – vesničané sami).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const SUMMER = at(601, 7, 10);
const WINTER = at(601, 1, 10);

/** Ves se zvěří na stropu (výchozí krajina: voda 2,5 ha, 2 tůně, 120 ha luk). */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({
      seed: 7,
      day: at(599, 8, 20),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: [
          {
            areaM2: 5000,
            distanceM: 50,
            naturalFertility: 70,
            surface: 'meadow' as const,
            obstacleCost: 0,
          },
        ],
      },
    }),
  );
  return withWildlife(s, null);
}

/** Ves, která bílkoviny chce (hlad), nebo nechce (loňský úlovek přebíjí potřebu). */
function wanting(s: VillageState, want: boolean): VillageState {
  if (want) s.hungry = true;
  else {
    s.hungry = false;
    s.wildlife!.smallGame = {
      today: null,
      year: { fishKg: 0, hares: 0, meatKg: 0, days: 0 },
      lastWildMeatKg: 1e9,
    };
  }
  return s;
}

describe('ryby a oka vesničanů', () => {
  it('bez potřeby bílkovin nikdo nerybaří', () => {
    const s = wanting(village(), false);
    expect(wantsProtein(s, SUMMER)).toBe(false);
    const fish = s.wildlife!.fishKg;
    expect(smallGameDay(s, SUMMER, 5, false).manDays).toBe(0);
    expect(s.wildlife!.fishKg).toBe(fish);
  });

  it('úlovek ryb = hodiny × 0,4 kg × biomasa ÷ strop, maso 0,6; čerstvé bez práce porážky', () => {
    const s = wanting(village(), true);
    const cap = 2.5 * WILDLIFE_CAPS.fishKgPerHa;
    s.wildlife!.fishKg = cap / 2;
    const meat = s.meatKg ?? 0;
    const r = smallGameDay(s, SUMMER, 2, true);
    expect(r.manDays).toBe(2);
    const kg = 2 * SMALL_GAME.hoursPerManDay * SMALL_GAME.fish.kgPerHour * 0.5;
    expect(s.wildlife!.fishKg).toBeCloseTo(cap / 2 - kg, 6);
    expect((s.meatKg ?? 0) - meat).toBeCloseTo(kg * 0.6, 6);
    expect(s.livestock?.slaughterWork?.required ?? 0).toBe(0);
    expect(r.shares.every((x) => x.activity === 'fish' && x.target.kind === 'pool')).toBe(true);
  });

  it('nejvýš 3 rybáři na tůň (2 tůně = 6 člověkodní)', () => {
    const s = wanting(village(), true);
    expect(smallGameCapacity(s, SUMMER)).toBe(6);
    const r = smallGameDay(s, SUMMER, 50, true);
    expect(r.manDays).toBe(6);
    expect(s.wildlife!.smallGame!.today!.pools).toEqual([3, 3]);
  });

  it('pod čtvrtinou stropu se nechytá, výlov končí na čtvrtině', () => {
    const s = wanting(village(), true);
    const cap = 2.5 * WILDLIFE_CAPS.fishKgPerHa;
    s.wildlife!.fishKg = cap * 0.25;
    expect(smallGameCapacity(s, SUMMER)).toBe(0);
    s.wildlife!.fishKg = cap * 0.251;
    smallGameDay(s, SUMMER, 6, true);
    expect(s.wildlife!.fishKg).toBeCloseTo(cap * 0.25, 6);
  });

  it('v zimě oka: 0,05 zajíce za hodinu × zajíci ÷ strop, 2 kg masa', () => {
    const s = wanting(village(), true);
    const cap = (120 * WILDLIFE_CAPS.haresPer100Ha) / 100;
    const r = smallGameDay(s, WINTER, 1, true);
    expect(r.shares[0]!.activity).toBe('snare');
    const hares = 10 * SMALL_GAME.snares.perHour;
    expect(s.wildlife!.hares).toBeCloseTo(cap - hares, 6);
    expect(s.meatKg).toBeCloseTo(hares * 2, 6);
  });

  it('rok chytání: ≈ 150–200 kg ryb a ≈ 20 kg masa ze zajíců při 0,25 člověkodne denně', () => {
    const s = wanting(village(), true);
    for (let d = at(601, 4, 1); d <= at(601, 11, 30); d++) smallGameDay(s, d, 0.25, true);
    const fishKg = s.wildlife!.smallGame!.year.fishKg;
    expect(fishKg).toBeGreaterThan(120);
    expect(fishKg).toBeLessThan(250);
    const meat = s.wildlife!.smallGame!.year.meatKg;
    for (let d = at(601, 12, 1); d <= at(602, 3, 31); d++) smallGameDay(s, d, 0.5, true);
    const hareMeat = s.wildlife!.smallGame!.year.meatKg - meat;
    expect(hareMeat).toBeGreaterThan(10);
    expect(hareMeat).toBeLessThan(30);
  });

  it('po kouscích: týž výsledek po dnech i po větších krocích', () => {
    const a = village();
    a.hungry = true;
    const b = JSON.parse(JSON.stringify(a)) as VillageState;
    let x = a;
    for (let i = 0; i < 40; i++) x = advanceVillage(x, SUMMER + i + 1, null);
    const y = advanceVillage(b, SUMMER + 40, null);
    expect(JSON.stringify(x.wildlife?.smallGame ?? null)).toBe(
      JSON.stringify(y.wildlife?.smallGame ?? null),
    );
  });
});
