import { describe, expect, it } from 'vitest';
import { packObstacles } from '../../src/domain/landscape';
import { addHorses } from '../../src/domain/village/horse-trade';
import { advanceVillage } from '../../src/domain/village/simulate';
import { START, horse, horseVillage } from '../../src/domain/village/__tests__/horse-fixtures';
import { addLordStep, lordColumns } from '../lib/lord-columns';

const EMPTY = packObstacles([], 16, 15);

describe('sloupce rodiny a koní', () => {
  it('ves s ohradou koní a koupenými koňmi: rodina cvičí, koně a obilí koní se počítají', () => {
    let s = horseVillage([horse(1, 6, 'male', 20), horse(2, 5, 'female')]);
    // koupě (obchod): dva koně navíc do ohrady koní
    addHorses(
      s,
      [
        { bornDay: START - 4 * 365, sex: 'female', training: 0 },
        { bornDay: START - 3 * 365, sex: 'male', training: 30 },
      ],
      START,
    );
    let year = undefined;
    for (let i = 0; i < 12; i++) {
      s = advanceVillage(s, s.lastDay + 10, EMPTY);
      year = addLordStep(year, s, 10);
    }
    if (!year) throw new Error('bez dat');
    expect(year.days).toBe(120);
    expect(year.horseDays / year.days).toBeGreaterThanOrEqual(4);
    expect(year.trainingCd + year.fieldCd).toBeCloseTo(year.familyCd, 6);
    expect(year.familyCd).toBeGreaterThan(0);
    expect(year.arms?.men).toBeGreaterThan(0);
    const row = lordColumns([year], year.familyCd * 4);
    expect(row).toContain('podíl rodiny na kapacitě 25,0 %');
    expect(row).toMatch(/koní [4-9],\d/);
  });

  it('ves bez koní: koně nula, prázdný vstup nespadne', () => {
    const s = horseVillage(null);
    const year = addLordStep(undefined, s, 1);
    expect(year.horseDays).toBe(0);
    expect(year.horseGrainKg).toBe(0);
    expect(lordColumns([], 0)).toBe('bez dat');
  });
});
