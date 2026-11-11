import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { withSowingRotation } from '../rotation';
import type { FieldPart, TaskName, VillageState } from '../../types';
import { seasonCrops, withSeason } from '../../core/year-plan';
import fixture from './fixtures/legacy-plan-vlkov.json';

// Převod ze skutečného starého tvaru stavu (fields.md – Osevní postup po dílech, bod 7): výřez
// Vlkova uložený feat/landscape (`plan` s dílem osevu navíc rozdělaným i čekajícím) – ne zpětný
// převod z nového stavu.

type Json = Record<string, unknown>;
const TASKS: TaskName[] = ['dig', 'sow', 'weed', 'thresh', 'harvest', 'reclaim'];

/** Stav ve starém tvaru: výřez Vlkova + díl osevu navíc (`extra`) a čekající příprava (`extraLeft`). */
function oldState(): VillageState {
  const plan = structuredClone(fixture.plan) as Json & {
    winter: Json;
    partIds: number[];
  };
  const parts = structuredClone(fixture.parts) as unknown as (FieldPart & Json)[];
  const sownInPlan = parts.find((p) => p.id === plan.partIds[0])!;
  const waiting = parts.find((p) => p.state === 'fallow')!;
  waiting.sownYears = 0;
  // osev navíc: rozdělaný díl (už v plodině plánu) a čekající (ležel ladem jen od plánu)
  plan.extra = [
    { id: sownInPlan.id, sownYears: 1 },
    { id: waiting.id, sownYears: 2 },
  ];
  plan.winter.extraLeft = { dig: 1.5, plough: 0.5 };
  plan.extraLeft = { reclaim: 2 };
  waiting.fallowBeforePlan = {
    sinceDay: dayIndexOf({ year: 590, month: 9, day: 1 }),
    overgrowthYears: 1,
  };
  return {
    seed: 1,
    lastDay: dayIndexOf({ year: 600, month: 6, day: 1 }),
    parts,
    people: [],
    plan,
    threshingFromPlan: null,
  } as unknown as VillageState;
}

const convert = (s: VillageState): VillageState => withSowingRotation(withSeason(s));

/** Součty práce (hotová, potřebná) a zasetá plocha (ha) přes všechny plodiny. */
function totals(s: VillageState): { done: number; required: number; sownHa: number } {
  const byId = new Map(s.parts.map((p) => [p.id, p]));
  let done = 0;
  let required = 0;
  let sownHa = 0;
  for (const { work } of seasonCrops(s.season!)) {
    for (const t of TASKS) {
      done += work.done[t];
      required += work.required[t];
    }
    done += work.plough?.done ?? 0;
    required += work.plough?.required ?? 0;
    for (const id of work.partIds) sownHa += byId.get(id)!.areaM2 / 10_000;
  }
  return { done, required, sownHa };
}

describe('převod ze starého tvaru stavu (výřez Vlkova)', () => {
  it('zaseté, rozdělané i osev navíc se neztratí; staré klíče zmizí', () => {
    const old = oldState();
    const before = convert(structuredClone(old));
    const stripped = structuredClone(old) as unknown as { plan: Json };
    delete stripped.plan.extra;
    const reference = totals(withSeason(stripped as unknown as VillageState));
    const after = totals(before);
    expect(after.done).toBeCloseTo(reference.done, 9);
    expect(after.required).toBeCloseTo(reference.required, 9);
    expect(after.sownHa).toBeCloseTo(reference.sownHa, 9);
    expect(reference.sownHa).toBeGreaterThan(0);
    expect(reference.done).toBeGreaterThan(0);
    for (const crop of before.season!.crops) expect('extraLeft' in crop).toBe(false);
    expect('extra' in before.season!).toBe(false);
    expect(before.sowingRotation).toBe(true);
    expect(before.sowingRotationFailed).toBeUndefined();
    // rozdělaný díl z osevu navíc zůstal zasetý, čekající je na řadě s léty v řadě
    const byId = new Map(before.parts.map((p) => [p.id, p]));
    expect(
      byId.get(old.parts.find((p) => p.sownYears === 0 && p.state === 'fallow')!.id),
    ).toMatchObject({
      state: 'ready',
      sownYears: 2,
      fallowSinceDay: null,
    });
    expect(old.parts.filter((p) => p.state === 'sown')).toHaveLength(
      before.parts.filter((p) => p.state === 'sown').length,
    );
    expect(before.parts.some((p) => 'fallowBeforePlan' in p)).toBe(false);
  });

  it('idempotence: druhý převod vrátí tentýž objekt', () => {
    const once = convert(oldState());
    expect(convert(once)).toBe(once);
  });

  it('chyba převodu: ves se načte se značkou i zprávou', () => {
    const broken = oldState();
    (broken as unknown as { parts: unknown }).parts = null;
    const loaded = withSowingRotation(broken);
    expect(loaded.sowingRotation).toBe(true);
    expect(loaded.sowingRotationFailed).toEqual(expect.any(String));
    expect(loaded.sowingRotationFailed).not.toBe('');
    // značka brání opakování
    expect(withSowingRotation(loaded)).toBe(loaded);
  });
});
