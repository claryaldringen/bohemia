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
      'Muž rodu dostal jméno – Mrdomír.',
    );
    // kronika říká, koho se jméno týká (lord.md – Kde se jméno ukazuje)
    const son = { day: 3, kind: 'line-named', name: 'Bořivoj', who: 'son' } as const;
    expect(chronicleText(son, 'Ves')).toBe('Syn vojvody dostal jméno – Bořivoj.');
    expect(chronicleText({ ...son, who: 'lord' }, 'Ves')).toBe('Vojvoda dostal jméno – Bořivoj.');
  });

  it('konec rodu ve vsi a opuštěná ves (lord.md – Konec rodu)', () => {
    expect(chronicleText({ day: 4, kind: 'line-ended', name: 'Ctibor' }, 'Ves')).toBe(
      'Ve vsi už nežije žádný muž rodu – posledním vojvodou byl Ctibor.',
    );
    expect(chronicleText({ day: 4, kind: 'line-ended' }, 'Ves')).toBe(
      'Ve vsi už nežije žádný muž rodu.',
    );
    expect(
      chronicleText({ day: 5, kind: 'village-abandoned', reason: 'line-ended' }, 'Libice'),
    ).toBe('Ves Libice opuštěna – rod vymřel.');
    expect(chronicleText({ day: 5, kind: 'village-abandoned' }, 'Libice')).toBe(
      'Odešli všichni – ves Libice je opuštěná.',
    );
  });
});
