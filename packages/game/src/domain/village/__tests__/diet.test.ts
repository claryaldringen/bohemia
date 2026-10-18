import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import {
  DIET,
  daysUntilSlaughter,
  dietDiversity,
  dietOf,
  eatDiet,
  fruitEnergy,
  meatEnergy,
  type DietInput,
} from '../diet';
import { NO_CRAFTS } from '../productivity';
import { advanceVillage } from '../simulate';
import { withBuiltFirstDwelling } from './village-fixtures';

// Strava (diet.md): energie × pestrost, podíly a stropy, ovoce přednostně, hlad jen z energie.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** Potřeba energie 10 kg obilí za den – podíly v kg jsou pak desetiny. */
const NEED = 10;

function input(over: Partial<DietInput>): DietInput {
  return {
    grainKg: 1e6,
    meatKg: 0,
    fruitKg: 0,
    needPerDay: NEED,
    daysToHarvest: 100,
    daysToRot: 0,
    daysToSlaughter: 100,
    potteryCoverage: NO_CRAFTS.pottery,
    ...over,
  };
}

describe('nasycení = energie × pestrost (tabulka z diet.md)', () => {
  const grain = (share: number): number => share * NEED;
  const meat = (share: number): number => (share * NEED) / DIET.meatEnergy;
  const fruit = (share: number): number => share * NEED * 7;

  it('jen obilí 80 %, obilí + maso 94 %, obilí + ovoce 86 %, všechno 100 %', () => {
    expect(dietOf(NEED, grain(1), 0, 0).satiation).toBeCloseTo(0.8, 9);
    expect(dietOf(NEED, grain(0.8), meat(0.2), 0).satiation).toBeCloseTo(0.94, 9);
    expect(dietOf(NEED, grain(0.95), 0, fruit(0.05)).satiation).toBeCloseTo(0.86, 9);
    expect(dietOf(NEED, grain(0.75), meat(0.2), fruit(0.05)).satiation).toBeCloseTo(1, 9);
  });

  it('pestrost 0,80 + 0,14 × pokrytí masa + 0,06 × pokrytí ovoce, pokrytí nejvýš 1', () => {
    expect(dietDiversity(0, 0)).toBeCloseTo(0.8, 9);
    expect(dietDiversity(0.5, 0.5)).toBeCloseTo(0.9, 9);
    expect(dietDiversity(3, 2)).toBeCloseTo(1, 9);
    // polovina masa (10 % energie) – pestrost 0,87
    expect(dietOf(NEED, grain(0.9), meat(0.1), 0).diversity).toBeCloseTo(0.87, 9);
  });

  it('energie masa 0,6 a ovoce 1/7 kg obilí na kg', () => {
    expect(meatEnergy(10)).toBeCloseTo(6, 9);
    expect(fruitEnergy(7)).toBeCloseTo(1, 9);
  });
});

describe('eatDiet – příděl', () => {
  it('maso a ovoce v hojnosti: strop masa 40 % a ovoce 25 % energie, obilí dorovná', () => {
    const meal = eatDiet(input({ meatKg: 1e6, fruitKg: 1e6, daysToRot: 50 }));
    expect(meal.diet.shares.meat).toBeCloseTo(DIET.caps.meat, 9);
    expect(meal.diet.shares.fruit).toBeCloseTo(DIET.caps.fruit, 9);
    expect(meal.diet.shares.grain).toBeCloseTo(1 - DIET.caps.meat - DIET.caps.fruit, 9);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
    expect(meal.diet.satiation).toBeCloseTo(1, 9);
  });

  it('ovoce rovným dílem do zkažení, maso rovným dílem do porážky', () => {
    // ovoce na 2 % energie denně do 1. 3., maso na 10 % do porážky
    const fruitKg = 0.02 * NEED * 7 * 40;
    const meatKg = (0.1 * NEED * 60) / DIET.meatEnergy;
    const meal = eatDiet(input({ fruitKg, meatKg, daysToRot: 40, daysToSlaughter: 60 }));
    expect(meal.diet.shares.fruit).toBeCloseTo(0.02, 9);
    // maso se ztrátou uzením za den
    expect(meal.diet.shares.meat).toBeCloseTo(0.1 * (1 - DIET.meatLossPerYear) ** (1 / 365), 9);
    expect(meal.diet.energy).toBeCloseTo(1, 9);
  });

  it('samo ovoce ani maso nenasytí – bez obilí nejvýš strop a ves hladoví', () => {
    const meal = eatDiet(input({ grainKg: 0, meatKg: 1e6, fruitKg: 1e6, daysToRot: 50 }));
    expect(meal.diet.energy).toBeCloseTo(DIET.caps.meat + DIET.caps.fruit, 9);
    expect(meal.outlook).toBeLessThan(1);
    const fruitOnly = eatDiet(input({ grainKg: 0, fruitKg: 1e6, daysToRot: 50 }));
    expect(fruitOnly.diet.energy).toBeCloseTo(DIET.caps.fruit, 9);
    expect(fruitOnly.diet.satiation).toBeLessThan(0.25);
  });

  it('obilí nevystačí do sklizně: energie se dělí rovně (s masem, které ještě přijde)', () => {
    const meatKg = (0.2 * NEED * 100) / DIET.meatEnergy;
    const grainKg = 0.4 * NEED * 100; // s masem 60 % energie do sklizně
    const meal = eatDiet(input({ grainKg, meatKg, potteryCoverage: 1 }));
    expect(meal.diet.energy).toBeCloseTo(0.6, 2);
    expect(meal.outlook).toBeCloseTo(meal.diet.energy, 2);
  });

  it('bez lidí nikdo nejí – plné nasycení, zásoby jen ztrácejí', () => {
    const meal = eatDiet(input({ needPerDay: 0, meatKg: 100 }));
    expect(meal.diet.satiation).toBe(1);
    expect(meal.meatKg).toBeLessThan(100);
  });

  it('maso se uzením ztrácí 20 % ročně', () => {
    let meat = 100;
    for (let i = 0; i < 365; i++) meat = eatDiet(input({ needPerDay: 0, meatKg: meat })).meatKg;
    expect(meat).toBeCloseTo(80, 6);
  });

  it('dní do porážky (1. 11.) bez jejího dne', () => {
    expect(daysUntilSlaughter(at(601, 10, 31))).toBe(1);
    expect(daysUntilSlaughter(at(601, 11, 1))).toBe(365);
    expect(daysUntilSlaughter(at(603, 11, 1))).toBe(366); // únor 604 je přestupný
    expect(daysUntilSlaughter(at(601, 1, 1))).toBe(at(601, 11, 1) - at(601, 1, 1));
    // poslední podzim světa – příští porážka by byla v roce 1500
    expect(daysUntilSlaughter(at(1499, 12, 31))).toBeGreaterThan(300);
  });
});

describe('simulace – hlad jen z energie', () => {
  it('ves jen s obilím (dost energie) je nasycená na 80 %, ale nehladoví a hlad nenarůstá', () => {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 1, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.storesKg = 50_000;
    s.livestock = {
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    };
    const end = advanceVillage(s, at(601, 3, 1), null);
    expect(end.diet!.energy).toBeCloseTo(1, 9);
    // vejce slepic dají kousek masa – pestrost těsně nad 0,8
    expect(end.diet!.satiation).toBeGreaterThan(0.8);
    expect(end.diet!.satiation).toBeLessThan(0.82);
    expect(end.starvationDays ?? 0).toBe(0);
    expect(end.hungry).toBe(false);
  });

  it('ovoce, které se jí, přidá štěstí +5 (diet.md)', () => {
    const base = withBuiltFirstDwelling(
      foundVillage({ seed: 2, day: at(600, 9, 2), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    base.storesKg = 50_000;
    const withFruit = structuredClone(base);
    withFruit.applesKg = 2000;
    const a = advanceVillage(base, at(600, 12, 1), null);
    const b = advanceVillage(withFruit, at(600, 12, 1), null);
    expect(b.happiness!.value).toBeGreaterThan(a.happiness!.value + 1);
  });
});
