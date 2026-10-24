import { describe, expect, it } from 'vitest';
import { chronicleText } from '../village-view-chronicle';

// Zprávy o vojvodově rodině (lord.md – Co hráč vidí): jen při změně, s důvodem.

describe('kronika – vojvodova rodina', () => {
  it('jde na pole s důvodem a vrací se k výcviku', () => {
    expect(chronicleText({ day: 1, kind: 'lord-to-field', reason: 'hunger' }, 'Ves')).toBe(
      'Vojvodova rodina jde na pole – ves šetří jídlem.',
    );
    expect(chronicleText({ day: 1, kind: 'lord-to-field', reason: 'sowing' }, 'Ves')).toBe(
      'Vojvodova rodina jde na pole – ves nestihne osev.',
    );
    expect(chronicleText({ day: 2, kind: 'lord-to-training' }, 'Ves')).toBe(
      'Vojvodova rodina se vrací k výcviku.',
    );
  });

  it('jméno muže rodu v 1. pádu (lord.md – Jména)', () => {
    expect(chronicleText({ day: 3, kind: 'line-named', name: 'Mrdomír' }, 'Ves')).toBe(
      'Muž rodu dostal jméno Mrdomír.',
    );
  });
});
