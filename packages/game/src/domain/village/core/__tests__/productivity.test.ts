import { describe, expect, it } from 'vitest';
import {
  NO_CRAFTS,
  dailyMinPerHousehold,
  fieldWorkPerHa,
  foundingCostPerHa,
  storageLossPerYear,
  withinBounds,
} from '../productivity';
import type { FieldTask } from '../../types';

const TASKS: FieldTask[] = ['dig', 'sow', 'weed', 'harvest', 'thresh'];
const totalFieldWork = (toolCoverage: number): number =>
  TASKS.reduce((sum, task) => sum + fieldWorkPerHa(task, toolCoverage), 0);

describe('withinBounds – meze produktivity', () => {
  const bounds = { worst: 100, best: 50 };

  it('pokrytí 0 dá horní mez, 1 dolní, mezi tím lineárně', () => {
    expect(withinBounds(bounds, 0)).toBe(100);
    expect(withinBounds(bounds, 1)).toBe(50);
    expect(withinBounds(bounds, 0.5)).toBe(75);
    expect(withinBounds(bounds, 0.2)).toBeCloseTo(90, 9);
  });

  it('pokrytí mimo 0–1 se ořízne', () => {
    expect(withinBounds(bounds, -1)).toBe(100);
    expect(withinBounds(bounds, 2)).toBe(50);
  });

  it('jedno číslo z literatury (worst = best) platí při každém pokrytí', () => {
    expect(withinBounds({ worst: 10, best: 10 }, 0.3)).toBe(10);
  });
});

describe('meze z rešerše 17. 10. 2026', () => {
  it('polní práce na osetý hektar: bez řemesel 149, s plným pokrytím nástroji 88 (pletí od 25. 10. 2026, setí od 9. 11. 2026, žeň od 10. 11. 2026)', () => {
    // součet dolních mezí: kopání 50 + setí 3,3 + pletí 5 + sklizeň 12 + odnos 8 + výmlat 10;
    // setí motykou 1 / 0,3 čd/ha (rozsévač za spřežením, Martin 9. 11. 2026 – dřív 10: 163 a 100);
    // zprůměrovaná žeň (10. 11. 2026 – dřív 20 / 15 + 10: 156 a 93)
    expect(totalFieldWork(NO_CRAFTS.tools)).toBeCloseTo(146 + 10 / 3, 9);
    expect(totalFieldWork(1)).toBeCloseTo(85 + 10 / 3, 9);
    expect(fieldWorkPerHa('dig', NO_CRAFTS.tools)).toBe(100);
    expect(fieldWorkPerHa('dig', 1)).toBe(50);
  });

  it('založení hektaru: louka 100 → 90, křoviny 100 → 60, les 250 → 150', () => {
    expect(foundingCostPerHa('meadow', NO_CRAFTS.tools)).toBe(100);
    expect(foundingCostPerHa('meadow', 1)).toBe(90);
    expect(foundingCostPerHa('shrub', 1)).toBe(60);
    expect(foundingCostPerHa('forest', NO_CRAFTS.tools)).toBe(250);
    expect(foundingCostPerHa('forest', 1)).toBe(150);
  });

  it('hrnčíř: ztráty zásob 10 → 5 %, denní minimum 0,5 → 0,45', () => {
    expect(storageLossPerYear(NO_CRAFTS.pottery)).toBe(0.1);
    expect(storageLossPerYear(1)).toBe(0.05);
    expect(dailyMinPerHousehold(NO_CRAFTS.pottery)).toBe(0.5);
    expect(dailyMinPerHousehold(1)).toBe(0.45);
  });
});
