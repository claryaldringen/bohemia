import { describe, expect, it } from 'vitest';
import { DOMESTIC } from '../rules';
import { allocateDay } from '../labor';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';

const DOMESTIC_FOR_4 = DOMESTIC.perHousehold + DOMESTIC.perPerson * 4;
const base = {
  capacity: 2.6,
  households: 1,
  people: 4,
  tasks: [],
  repairNeed: 0,
  domesticBacklog: 0,
  potteryCoverage: NO_CRAFTS.pottery,
};
const DAILY_MIN = dailyMinPerHousehold(NO_CRAFTS.pottery);

function sum(r: ReturnType<typeof allocateDay>): number {
  return (
    r.dailyMin +
    r.away +
    Object.values(r.tasks).reduce((a, b) => a + b, 0) +
    r.repairs +
    r.domestic +
    r.common
  );
}

describe('allocateDay', () => {
  it('bez úloh: minimum, domácí výroba, zbytek společná práce', () => {
    const r = allocateDay(base);
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.domestic).toBeCloseTo(DOMESTIC_FOR_4);
    expect(r.common).toBeCloseTo(2.6 - DAILY_MIN - DOMESTIC_FOR_4);
    expect(sum(r)).toBeCloseTo(2.6);
    expect(r.tasks.dig).toBe(0);
  });
  it('denní minimum podle pokrytí nádobami: bez hrnčíře 0,5, s plným pokrytím 0,45', () => {
    expect(allocateDay(base).dailyMin).toBeCloseTo(0.5, 9);
    expect(allocateDay({ ...base, households: 2, potteryCoverage: 1 }).dailyMin).toBeCloseTo(
      0.9,
      9,
    );
  });
  it('úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.tasks.dig).toBeCloseTo(1.1);
    expect(r.domestic).toBe(0);
    expect(r.domesticBacklog).toBeCloseTo(DOMESTIC_FOR_4);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('stejná úloha dvou plodin: práce po úlohách vstupu v jejich pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'dig', remaining: 1.5 },
        { name: 'orchard-harvest', remaining: 0.2 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.taskAmounts.map((a) => Number(a.toFixed(6)))).toEqual([1.5, 0.2, 0.4]);
    expect(r.tasks.dig).toBeCloseTo(1.9);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('práce v sadu jde mezi polní úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'orchard-harvest', remaining: 1.5 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks['orchard-harvest']).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(0.6);
    expect(r.tasks['orchard-care']).toBe(0);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('lidé na výpravách: po denním minimu, před úlohami dne (trade.md – Doprava)', () => {
    const r = allocateDay({ ...base, away: 1.5, tasks: [{ name: 'dig', remaining: 5 }] });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.away).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 1.5);
    expect(sum(r)).toBeCloseTo(2.6);
    // bez práce navíc dostane výprava jen to, co zbude po denním minimu
    const short = allocateDay({ ...base, capacity: 1, away: 3 });
    expect(short.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(short.away).toBeCloseTo(1 - DAILY_MIN);
    expect(short.common).toBe(0);
    expect(allocateDay(base).away).toBe(0);
  });
  it('opravy před domácí výrobou', () => {
    const r = allocateDay({ ...base, repairNeed: 1 });
    expect(r.repairs).toBeCloseTo(1);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('malá kapacita: vše ostatní nula, nic záporné', () => {
    const r = allocateDay({ ...base, capacity: 0.3, tasks: [{ name: 'dig', remaining: 3 }] });
    expect(r.dailyMin).toBeCloseTo(0.3);
    expect(r.tasks.dig).toBe(0);
    expect(r.domestic).toBe(0);
    expect(r.common).toBe(0);
    expect(r.domesticBacklog).toBeGreaterThanOrEqual(0);
  });
  it('nedodělek se v zimě dožene a nepřekročí 60denní potřebu', () => {
    const need = DOMESTIC_FOR_4;
    const r = allocateDay({ ...base, capacity: 100, domesticBacklog: 30 });
    expect(r.domestic).toBeCloseTo(need + 30);
    expect(r.domesticBacklog).toBe(0);
    let backlog = 0;
    for (let i = 0; i < 200; i++) {
      backlog = allocateDay({ ...base, capacity: 0.5, domesticBacklog: backlog }).domesticBacklog;
    }
    expect(backlog).toBeCloseTo(DOMESTIC.backlogMaxDays * need);
  });
});
