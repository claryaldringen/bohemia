import { describe, expect, it } from 'vitest';
import { bundle } from './shipment-fixtures';
import { flattenBundle, scaleBundle, spareSplit, suggestSplit } from '../levy';

describe('rozdělení Odvodů po vsích', () => {
  it('rozdělí podle přebytku, součet dá domluvené', () => {
    const split = suggestSplit(bundle({ grainKg: 150, logs: 5 }), [
      { id: 'a', spare: bundle({ grainKg: 300, logs: 6 }) },
      { id: 'b', spare: bundle({ grainKg: 100, logs: 2 }) },
    ]);
    expect(split.a!.grainKg + split.b!.grainKg).toBeCloseTo(150, 5);
    expect(split.a!.grainKg).toBeGreaterThan(split.b!.grainKg);
    expect(split.a!.logs + split.b!.logs).toBe(5);
    expect(Number.isInteger(split.a!.logs)).toBe(true);
  });

  it('co přebytek nepokryje, dostane ves s největším přebytkem', () => {
    const split = suggestSplit(bundle({ grainKg: 500 }), [
      { id: 'a', spare: bundle({ grainKg: 50 }) },
      { id: 'b', spare: bundle({ grainKg: 100 }) },
    ]);
    expect(split.a!.grainKg).toBe(50);
    expect(split.b!.grainKg).toBe(450);
  });

  it('scaleBundle násobí všechny řádky', () => {
    const scaled = scaleBundle(bundle({ grainKg: 10, horses: 1 }), 3);
    expect(flattenBundle(scaled)).toMatchObject({ grainKg: 30, horses: 3, logs: 0 });
  });

  it('spareSplit (správce) nepošle z žádné vsi víc, než může postrádat', () => {
    const split = spareSplit(bundle({ grainKg: 500, logs: 3 }), [
      { id: 'a', spare: bundle({ grainKg: 120.55, logs: 10 }) },
      { id: 'b', spare: bundle({ grainKg: 80 }) },
    ]);
    expect(flattenBundle(split.a!).grainKg).toBeLessThanOrEqual(120.55);
    expect(flattenBundle(split.b!).grainKg).toBeLessThanOrEqual(80);
    expect(flattenBundle(split.a!).grainKg + flattenBundle(split.b!).grainKg).toBeCloseTo(200.5);
    expect(flattenBundle(split.a!).logs).toBe(3);
  });
});
