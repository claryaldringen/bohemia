import { describe, expect, it } from 'vitest';
import { allocateDay } from '../labor';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';
import { type DayTask } from '../simulate-plan';
import { plantingOrder } from '../simulate-work';

// Výsadba jabloní u cest a sadu před klučením (orchard.md – Výsadba; Martin 22. 11. 2026: „ano“ na
// otázku „Má výsadba jabloní a sadu dostat v jarních a podzimních oknech přednost před klučením
// zarostlých přílohů?“ – orba a setí na daný rok dál mají přednost před výsadbou): v oknech výsadby
// dostane rozestavěná výsadba práci vsi po orbě, kopání a setí, ale před vracením přílohu.

const DAILY_MIN = dailyMinPerHousehold(NO_CRAFTS.pottery);

describe('výsadba v práci dne – po setí, před vracením přílohu', () => {
  const task = (name: DayTask['name'], extra: Partial<DayTask> = {}): DayTask => ({
    name,
    remaining: 10,
    end: 10,
    tie: 1,
    rank: 0,
    ...extra,
  });

  it('pořadí: úlohy před přípravou půdy a orba, kopání, setí, pak výsadba, pak klučení a zbytek', () => {
    const tasks = [
      task('harvest'),
      task('reclaim', { end: 5 }),
      task('sow'),
      task('plough'),
      task('orchard-care'),
      task('thresh'),
    ];
    const planting = plantingOrder(tasks, 2);
    expect(planting).toEqual({ manDays: 2, order: [0, 2, 3, 1, 4, 5], slot: 3 });
    // bez práce výsadby (mimo okna) pořadí beze změny
    expect(plantingOrder(tasks, 0)).toBeUndefined();
  });

  it('ves, která klučí, dá výsadbě práci před klučením; setí ji dostane napřed', () => {
    const tasks = [
      { name: 'reclaim' as const, remaining: 5 },
      { name: 'sow' as const, remaining: 0.5 },
      { name: 'orchard-care' as const, remaining: 0.3 },
    ];
    const base = {
      capacity: 2.6,
      householdElders: [0],
      tasks,
      potteryCoverage: NO_CRAFTS.pottery,
    };
    const free = 2.6 - DAILY_MIN;
    // bez výsadby vezme klučení všechno, co zbude po minimu
    const before = allocateDay(base);
    expect(before.taskAmounts[0]).toBeCloseTo(free, 9);
    expect(before.planting).toBeUndefined();
    // s výsadbou (pořadí setí → výsadba → klučení → péče o sad)
    const r = allocateDay({ ...base, planting: { manDays: 0.8, order: [1, 0, 2], slot: 1 } });
    expect(r.taskAmounts[1]).toBeCloseTo(0.5, 9);
    expect(r.planting).toBeCloseTo(0.8, 9);
    expect(r.taskAmounts[0]).toBeCloseTo(free - 0.5 - 0.8, 9);
    expect(r.taskAmounts[2]).toBe(0);
    expect(r.common).toBeCloseTo(0, 9);
    // práce celkem se nezmění
    expect(
      r.dailyMin + r.taskAmounts.reduce((a, b) => a + b, 0) + r.planting! + r.common,
    ).toBeCloseTo(2.6, 9);
  });
});
