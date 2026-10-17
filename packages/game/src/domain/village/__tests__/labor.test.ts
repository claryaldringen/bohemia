import { describe, expect, it } from 'vitest';
import { DAILY_MIN_PER_HOUSEHOLD, DOMESTIC } from '../rules';
import { allocateDay } from '../labor';

const base = {
  capacity: 2.6,
  households: 1,
  people: 4,
  tasks: [],
  repairNeed: 0,
  domesticBacklog: 0,
};

function sum(r: ReturnType<typeof allocateDay>): number {
  return (
    r.dailyMin +
    Object.values(r.tasks).reduce((a, b) => a + b, 0) +
    r.repairs +
    r.domestic +
    r.common
  );
}

describe('allocateDay', () => {
  it('bez úloh: minimum, domácí výroba, zbytek společná práce', () => {
    const r = allocateDay(base);
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN_PER_HOUSEHOLD);
    expect(r.domestic).toBeCloseTo(DOMESTIC.perHousehold + DOMESTIC.perPerson * 4);
    expect(r.common).toBeCloseTo(2.6 - 0.5 - 0.78);
    expect(sum(r)).toBeCloseTo(2.6);
    expect(r.tasks.dig).toBe(0);
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
    expect(r.domesticBacklog).toBeCloseTo(0.78);
    expect(sum(r)).toBeCloseTo(2.6);
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
    const need = DOMESTIC.perHousehold + DOMESTIC.perPerson * 4;
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
