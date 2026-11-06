import { describe, expect, it } from 'vitest';
import { noMacroGoods } from '../macro';
import {
  AID_REASONS,
  checkAidItems,
  checkAidLine,
  checkSchedule,
  dueGoods,
  dueValue,
  installmentValue,
  overdueDebt,
  remainingDebt,
  scheduleValue,
  type LoanInstallment,
} from '../loan';
import type { MacroBundle } from '../macro';

const goods = (
  over: Partial<ReturnType<typeof noMacroGoods>> = {},
): ReturnType<typeof noMacroGoods> => ({
  ...noMacroGoods(),
  ...over,
});
const bundle = (over: Partial<ReturnType<typeof noMacroGoods>> = {}): MacroBundle => ({
  ...goods(over),
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
});
const plan: LoanInstallment[] = [
  { year: 504, goods: goods({ grainKg: 100 }) },
  { year: 505, goods: goods({ hayKg: 400 }) },
];

describe('hodnota splátek', () => {
  it('obilí je kg, seno čtvrtina, dobytek a klády podle cen obchodu', () => {
    expect(installmentValue(goods({ grainKg: 100 }))).toBe(100);
    expect(installmentValue(goods({ hayKg: 400 }))).toBe(100);
    expect(installmentValue(goods({ logs: 2 }))).toBe(80);
    expect(installmentValue(goods({ cattle: { cows: 1, youngOxen: 0, trainedOxen: 0 } }))).toBe(
      600,
    );
  });

  it('splátka jiným zbožím platí podle hodnoty a dluh se kumuluje', () => {
    expect(scheduleValue(plan)).toBe(200);
    expect(dueValue(plan, 503)).toBe(0);
    expect(dueValue(plan, 504)).toBe(100);
    expect(dueValue(plan, 505)).toBe(200);
    expect(dueGoods(plan, 505).hayKg).toBe(400);
    // 100 kg obilí + 400 kg sena = 200; zaplaceno 100 → zbývá 100, po splatnosti 505 též 100
    expect(remainingDebt(plan, 100)).toBe(100);
    expect(overdueDebt(plan, 100, 505)).toBe(100);
    expect(overdueDebt(plan, 250, 505)).toBe(0);
    expect(remainingDebt(plan, 999)).toBe(0);
  });
});

describe('kontrola řádků o pomoci', () => {
  it('kalendář: neprázdný, roky rostou, zboží neprázdné', () => {
    expect(checkSchedule(plan)).toBeNull();
    expect(checkSchedule([])).toBe(AID_REASONS.badSchedule);
    expect(checkSchedule([plan[1]!, plan[0]!])).toBe(AID_REASONS.badSchedule);
    expect(checkSchedule([{ year: 504, goods: goods() }])).toBe(AID_REASONS.badSchedule);
  });

  it('pomoc nesmí být lidé ani robota', () => {
    const people = { ...bundle({ grainKg: 10 }), laborDays: 3 };
    expect(checkAidLine({ kind: 'aid-request', bundle: people, villageId: 'v' })).toBe(
      AID_REASONS.badBundle,
    );
  });

  it('žádost posílá vazal, dar a půjčku pán; v kole je jeden řádek', () => {
    const request = {
      kind: 'aid-request',
      bundle: bundle({ grainKg: 10 }),
      villageId: 'v',
    } as const;
    const gift = { kind: 'gift', bundle: bundle({ grainKg: 10 }), fromVillageId: 'v' } as const;
    expect(checkAidItems([request], true)).toBeNull();
    expect(checkAidItems([request], false)).toBe(AID_REASONS.requestFromVassal);
    expect(checkAidItems([gift], false)).toBeNull();
    expect(checkAidItems([gift], true)).toBe(AID_REASONS.answerFromLord);
    expect(checkAidItems([gift, request], false)).toBe(AID_REASONS.oneAnswer);
    expect(checkAidItems([{ kind: 'oath' }, gift], false)).toBe(AID_REASONS.mixed);
  });
});
