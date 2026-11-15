// Zápisy o ženách muže rodu – postavení a jméno muže, jméno ženy (Martin 15. 11. 2026: „Vojvoda
// Lutobor si vzal Dobravu.“, „Dobrava se stala hlavní manželkou vojvody Lutobora.“); `name` je
// jméno muže (k „Další žena – Lutobor.“: „Jako že Lutobor podstoupil tranzici?“).
import { describe, expect, it } from 'vitest';
import { FEMALE_NAMES, MALE_NAMES, type ChronicleEstate, type ChronicleEvent } from '@bohemia/game';
import { chronicleText, feminineAccusative } from '../village-view-chronicle';

const LORD: ChronicleEstate = { title: 'voivode', kin: 'head' };
const SON: ChronicleEstate = { title: 'voivode', kin: 'child', headName: 'Lutobor' };

const wife = (
  kind: 'extra-wife' | 'main-wife',
  fields: { name?: string; estate?: ChronicleEstate; wife?: string } = {},
): ChronicleEvent => ({ day: 100, kind, ...fields });

describe('kronika – ženy muže rodu', () => {
  it('další žena: postavení a jméno muže, jméno ženy ve 4. pádě', () => {
    const text = (fields: Parameters<typeof wife>[1] = {}): string =>
      chronicleText(wife('extra-wife', fields), 'Vlkov');
    expect(text({ name: 'Lutobor', estate: LORD, wife: 'Dobrava' })).toBe(
      'Vojvoda Lutobor si vzal Dobravu.',
    );
    expect(text({ name: 'Radim', estate: SON, wife: 'Libuše' })).toBe(
      'Syn vojvody Lutobora Radim si vzal Libuši.',
    );
    expect(text({ estate: LORD, wife: 'Mlada' })).toBe('Vojvoda si vzal Mladu.');
    // nejistý tvar jména – opis
    expect(text({ name: 'Lutobor', estate: LORD, wife: 'Kazi' })).toBe(
      'Vojvoda Lutobor si vzal další ženu jménem Kazi.',
    );
    // zápis bez ženy a starší zápisy bez postavení
    expect(text({ name: 'Lutobor', estate: LORD })).toBe('Vojvoda Lutobor si vzal další ženu.');
    expect(text({ name: 'Lutobor' })).toBe('Lutobor si vzal další ženu.');
    expect(text()).toBe('Muž rodu si vzal další ženu.');
  });

  it('nová hlavní manželka: jméno ženy, postavení a jméno muže ve 2. pádě', () => {
    const text = (fields: Parameters<typeof wife>[1] = {}): string =>
      chronicleText(wife('main-wife', fields), 'Vlkov');
    expect(text({ name: 'Lutobor', estate: LORD, wife: 'Dobrava' })).toBe(
      'Dobrava se stala hlavní manželkou vojvody Lutobora.',
    );
    expect(text({ name: 'Radim', estate: SON, wife: 'Dobrava' })).toBe(
      'Dobrava se stala hlavní manželkou syna vojvody Lutobora Radima.',
    );
    expect(text({ name: 'Hněvsa', estate: LORD, wife: 'Mlada' })).toBe(
      'Mlada se stala hlavní manželkou vojvody Hněvsy.',
    );
    expect(
      text({ name: 'Bořivoj', estate: { title: 'farmer', kin: 'head' }, wife: 'Vlasta' }),
    ).toBe('Vlasta se stala hlavní manželkou sedláka Bořivoje.');
    expect(text({ name: 'Lutobor', estate: LORD })).toBe(
      'Vojvoda Lutobor má novou hlavní manželku.',
    );
    expect(text({ name: 'Lutobor' })).toBe('Lutobor má novou hlavní manželku.');
    expect(text()).toBe('Muž rodu má novou hlavní manželku.');
  });

  it('každé ženské jméno ze seznamu má 4. pád pravidlem', () => {
    for (const name of FEMALE_NAMES) {
      const accusative = feminineAccusative(name);
      expect(accusative).toBe(`${name.slice(0, -1)}${name.endsWith('a') ? 'u' : 'i'}`);
    }
    expect(feminineAccusative('Kazi')).toBeNull();
  });

  it('každé mužské jméno ze seznamu má 2. pád pravidlem', () => {
    const lead = 'Dobrava se stala hlavní manželkou vojvody ';
    for (const name of MALE_NAMES) {
      const text = chronicleText(
        wife('main-wife', { name, estate: LORD, wife: 'Dobrava' }),
        'Vlkov',
      );
      expect(text.startsWith(lead)).toBe(true);
      const genitive = text.slice(lead.length, -1);
      if (name.endsWith('a')) expect(genitive).toBe(`${name.slice(0, -1)}y`);
      else if (/[šžčřcj]$/u.test(name)) expect(genitive).toBe(`${name}e`);
      else expect(genitive).toBe(`${name}a`);
    }
  });
});
