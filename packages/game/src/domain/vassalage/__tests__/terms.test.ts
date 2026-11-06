import { describe, expect, it } from 'vitest';
import { noMacroGoods, type MacroBundle } from '../macro';
import {
  checkBundle,
  checkTermLines,
  linesOfTerms,
  termsOfLines,
  TERM_REASONS,
  type TermLine,
} from '../terms';

const bundle = (over: Partial<MacroBundle> = {}): MacroBundle => ({
  ...noMacroGoods(),
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
  grainKg: 100,
  ...over,
});

describe('podmínky vazalství', () => {
  it('svazek: záporné, zlomkové kusy a nesmysly odmítne, prázdný také', () => {
    expect(checkBundle(bundle())).toBeNull();
    expect(checkBundle(bundle({ grainKg: -1 }))).toBe(TERM_REASONS.badAmount);
    expect(checkBundle(bundle({ horses: 1.5 }))).toBe(TERM_REASONS.badAmount);
    expect(checkBundle(bundle({ grainKg: Number.NaN }))).toBe(TERM_REASONS.badAmount);
    expect(checkBundle(bundle({ grainKg: 1e12 }))).toBe(TERM_REASONS.badAmount);
    expect(checkBundle(bundle({ grainKg: 0 }))).toBe(TERM_REASONS.emptyGoods);
    expect(checkBundle(bundle({ grainKg: 0, laborDays: 40 }))).toBeNull();
  });

  it('řádky: každý druh jednou, služba v mezích', () => {
    const tribute: TermLine = { kind: 'tribute', goods: bundle() };
    expect(checkTermLines([tribute, tribute])).toBe(TERM_REASONS.duplicate);
    expect(checkTermLines([{ kind: 'service', men: 4, days: 30 }])).toBeNull();
    expect(checkTermLines([{ kind: 'service', men: 4, days: 366 }])).toBe(TERM_REASONS.badAmount);
  });

  it('řádky a podmínky se převádějí tam i zpět', () => {
    const lines: TermLine[] = [
      { kind: 'tribute', goods: bundle() },
      { kind: 'service', men: 2, days: 10 },
      { kind: 'target-village', villageId: 'v1' },
      { kind: 'reward', goods: bundle({ hayKg: 5, grainKg: 0 }) },
    ];
    expect(linesOfTerms(termsOfLines(lines))).toEqual(lines);
    expect(termsOfLines([])).toEqual({});
  });
});
