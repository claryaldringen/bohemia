import { describe, expect, it } from 'vitest';
import {
  fieldPreviewLabel,
  formatCells,
  formatHa,
  formatInteger,
  formatLaborPerDay,
  formatManDays,
  formatPercent,
  formatStoresMonths,
  plural,
} from '../village-format';

describe('čísla vsi česky', () => {
  it('mezery po tisících', () => {
    expect(formatInteger(999)).toBe('999');
    expect(formatInteger(1234)).toBe('1 234');
    expect(formatInteger(1234567.4)).toBe('1 234 567');
  });

  it('tvary podle počtu', () => {
    expect([0, 1, 2, 4, 5, 22].map((n) => plural(n, 'a', 'b', 'c'))).toEqual([
      'c',
      'a',
      'b',
      'b',
      'c',
      'c',
    ]);
  });

  it('výměra, cena práce a procenta', () => {
    expect(formatHa(4200)).toBe('0,42 ha');
    expect(formatManDays(1)).toBe('1 člověkoden');
    expect(formatManDays(3.2)).toBe('3 člověkodny');
    expect(formatManDays(60)).toBe('60 člověkodnů');
    expect(formatManDays(1220)).toBe('1 220 člověkodnů');
    expect(formatPercent(0.857)).toBe('86 %');
    expect(formatPercent(1.2)).toBe('100 %');
  });

  it('zásoby na měsíce a práce za den', () => {
    expect(formatStoresMonths(17.9)).toBe('na 17 měsíců');
    expect(formatStoresMonths(3.5)).toBe('na 3 měsíce');
    expect(formatStoresMonths(1)).toBe('na 1 měsíc');
    expect(formatStoresMonths(0.4)).toBe('méně než na měsíc');
    expect(formatLaborPerDay(2.64)).toBe('2,6 člověkodne za den');
  });

  it('popisek náhledu pole', () => {
    const cells = Array.from({ length: 19 }, (_, x) => ({ x, y: 0 }));
    expect(
      fieldPreviewLabel({ cells, areaM2: 4275, averageFertility: 62.6, foundingCost: 17.1 }),
    ).toBe('19 čtverců · 0,43 ha · úrodnost 63 · 17 člověkodnů');
    expect(formatCells(1)).toBe('1 čtverec');
    expect(formatCells(3)).toBe('3 čtverce');
  });
});
