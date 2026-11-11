import { describe, expect, it } from 'vitest';
import { HORSES } from '../../village/rules';
import { armsCap, trainArms, trainingCap } from '../../village/people/lord';
import { withArmsCaps } from '../../village/people/arms-caps';
import { DAY, kin, village } from '../../village/__tests__/kin-fixtures';
import { armyStrength, lineManStrength, militaryExperience, villagerStrength } from '../strength';

const arms = (
  bow: number,
  combat: number,
  riding = 0,
): { arms: { bow: number; combat: number; riding: number } } => ({
  arms: { bow, combat, riding },
});

describe('síla muže rodu (war.md – Síla)', () => {
  it('pěšky 1 + 2 × zkušenost ÷ 100', () => {
    expect(lineManStrength(arms(10, 10), null)).toBeCloseTo(1.2);
    expect(lineManStrength(arms(50, 50), null)).toBeCloseTo(2);
    expect(lineManStrength(arms(70, 70), null)).toBeCloseTo(2.4);
    expect(lineManStrength(arms(90, 90), null)).toBeCloseTo(2.8);
  });

  it('zkušenost je průměr boje a luku, jízda se nepočítá', () => {
    expect(militaryExperience({ bow: 40, combat: 80 })).toBe(60);
    expect(militaryExperience(undefined)).toBe(0);
  });

  it('jezdec s jízdou 60 na vycvičeném koni × 1,3', () => {
    const horse = { training: HORSES.trainingFull };
    const foot = lineManStrength(arms(60, 60, 60), null);
    expect(lineManStrength(arms(60, 60, 60), horse) / foot).toBeCloseTo(1.3);
  });

  it('nejvýš 3 × 1,5 = 4,5', () => {
    expect(lineManStrength(arms(100, 100, 100), { training: HORSES.trainingFull })).toBeCloseTo(
      4.5,
    );
  });
});

describe('síla vesničana a vojska', () => {
  it('vesničan 0,4, nucený 0,2, štěstí × 0,8–1,1', () => {
    expect(villagerStrength(false, 50)).toBeCloseTo(0.4);
    expect(villagerStrength(true, 50)).toBeCloseTo(0.2);
    expect(villagerStrength(false, 0)).toBeCloseTo(0.32);
    expect(villagerStrength(false, 100)).toBeCloseTo(0.44);
  });

  it('kovárna až × 1,5', () => {
    expect(armyStrength([2, 2], 0)).toBeCloseTo(4);
    expect(armyStrength([2, 2], 1)).toBeCloseTo(6);
    expect(armyStrength([2, 2], 5)).toBeCloseTo(6);
  });
});

describe('stropy výcviku', () => {
  const man = kin({ id: 1, age: 30, sex: 'male' });
  const grow = (source: 'home' | 'hunt'): number => {
    let s = { bow: 0, combat: 0, riding: 0 };
    for (let i = 0; i < 20000; i++)
      s = trainArms(s, { bow: 6, combat: 0, riding: 0 }, trainingCap(man, DAY, source));
    return s.bow;
  };

  it('strop je menší z věku a zdroje', () => {
    expect(trainingCap(man, DAY, 'home')).toBe(50);
    expect(trainingCap(man, DAY, 'hunt')).toBe(70);
    expect(trainingCap(man, DAY, 'war')).toBe(armsCap(man, DAY));
    const boy = kin({ id: 2, age: 8, sex: 'male' });
    expect(trainingCap(boy, DAY, 'hunt')).toBe(40);
  });

  it('výcvik doma se zastaví na 50, lov na 70', () => {
    expect(grow('home')).toBeGreaterThan(49.9);
    expect(grow('home')).toBeLessThanOrEqual(50);
    expect(grow('hunt')).toBeGreaterThan(69.9);
    expect(grow('hunt')).toBeLessThanOrEqual(70);
  });
});

describe('withArmsCaps', () => {
  it('stáhne dovednosti nad 70 jednou a idempotentně; válka pak smí nad 70', () => {
    const p = kin({ id: 1, age: 30, sex: 'male' });
    p.arms = { bow: 95, combat: 80, riding: 60, best: { bow: 99, combat: 90, riding: 60 } };
    const s = village([p], []);
    const once = withArmsCaps(s);
    expect(s.people[0]?.arms?.bow).toBe(95);
    expect(once.people[0]?.arms).toEqual({
      bow: 70,
      combat: 70,
      riding: 60,
      best: { bow: 70, combat: 70, riding: 60 },
    });
    // později získaná zkušenost z války se už nesráží
    const person = once.people[0];
    if (person) person.arms = { bow: 85, combat: 85, riding: 0 };
    const twice = withArmsCaps(once);
    expect(twice).toBe(once);
    expect(twice.people[0]?.arms?.bow).toBe(85);
  });
});
