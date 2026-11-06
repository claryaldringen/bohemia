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

  it('tažení vyrazilo a vrátilo se (war.md – Velení)', () => {
    expect(
      chronicleText({ day: 4, kind: 'campaign', step: 'set-out', leader: 'Bořivoj' }, 'Ves'),
    ).toBe('Vojsko Bořivoje vyrazilo.');
    expect(
      chronicleText({ day: 5, kind: 'campaign', step: 'returned', leader: 'Bořivoj' }, 'Ves'),
    ).toBe('Vojsko Bořivoje se vrátilo.');
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

  it('odchod syna vojvody: jméno syna a nové vsi (lord.md – Dělení vsi)', () => {
    const left = {
      day: 5,
      kind: 'son-left-village',
      name: 'Bořivoj',
      village: 'Lhota',
      households: 2,
      people: 10,
    } as const;
    expect(chronicleText(left, 'Ves')).toBe('Bořivoj odešel založit ves Lhota – 10 lidí.');
    expect(chronicleText({ ...left, direction: 'N' }, 'Ves')).toBe(
      'Bořivoj odešel založit ves Lhota na sever – 10 lidí.',
    );
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

describe('kronika – požár', () => {
  it('rozlišuje vyhořelé a ohořelé domy', () => {
    const fire = {
      day: 1,
      kind: 'fire' as const,
      startedDwellingId: 1,
      burnedDwellingIds: [1, 2, 3, 4, 5, 6],
      lostGrainKg: 0,
      lostMeatKg: 0,
      lostCheeseKg: 0,
      lostHayKg: 0,
    };
    expect(chronicleText({ ...fire, collapsedDwellingIds: [1, 2, 3] }, 'Ves')).toBe(
      'Požár – vyhořely 3 domy, 3 ohořely.',
    );
    expect(chronicleText({ ...fire, collapsedDwellingIds: [1, 2, 3, 4, 5] }, 'Ves')).toBe(
      'Požár – vyhořelo 5 domů, jeden ohořel.',
    );
    expect(chronicleText({ ...fire, collapsedDwellingIds: [] }, 'Ves')).toBe(
      'Požár – ohořelo 6 domů.',
    );
    expect(chronicleText(fire, 'Ves')).toBe('Požár – vyhořelo 6 domů.');
  });
});

describe('kronika – odchod domácností: skloňování lidí', () => {
  it('1 člověk, 2 lidé, 5 lidí', () => {
    const left = (people: number): string =>
      chronicleText({ day: 1, kind: 'households-left', households: 1, people }, 'Ves');
    expect(left(1)).toBe('Jedna domácnost odešla založit novou ves – 1 člověk.');
    expect(left(2)).toBe('Jedna domácnost odešla založit novou ves – 2 lidé.');
    expect(left(5)).toBe('Jedna domácnost odešla založit novou ves – 5 lidí.');
  });
});
