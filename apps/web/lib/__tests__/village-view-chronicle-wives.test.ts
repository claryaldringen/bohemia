// Zápisy o ženách muže rodu – jméno je jméno muže (Martin 15. 11. 2026 k „Další žena – Lutobor.“:
// „Jako že Lutobor podstoupil tranzici?“).
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

const wife = (kind: 'extra-wife' | 'main-wife', name?: string): ChronicleEvent =>
  name === undefined ? { day: 100, kind } : { day: 100, kind, name };

describe('kronika – ženy muže rodu', () => {
  it('další žena: muž si ji vzal', () => {
    expect(chronicleText(wife('extra-wife', 'Lutobor'), 'Vlkov')).toBe(
      'Lutobor si vzal další ženu.',
    );
    expect(chronicleText(wife('extra-wife'), 'Vlkov')).toBe('Muž rodu si vzal další ženu.');
  });

  it('nová hlavní žena: muž ji má', () => {
    expect(chronicleText(wife('main-wife', 'Lutobor'), 'Vlkov')).toBe(
      'Lutobor má novou hlavní ženu.',
    );
  });
});
