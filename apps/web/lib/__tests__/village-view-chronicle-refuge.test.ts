import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

// Kronika útěku před vojskem (war.md – Varování, poslové a útěk do hradiště; plán 2026-11-09 –
// Úloha 7, texty návrh Clauda).

const text = (event: ChronicleEvent): string => chronicleText(event, 'Ves');

describe('kronika – útěk do hradiště a posel', () => {
  it('odchod, les, příchod a návrat', () => {
    expect(text({ day: 1, kind: 'refuge-left', people: 12, villageName: 'Vyšehrad' })).toBe(
      'Lidé odešli do hradiště Vyšehrad.',
    );
    expect(text({ day: 1, kind: 'refuge-left', people: 12 })).toBe('Lidé odešli do hradiště.');
    expect(text({ day: 1, kind: 'refuge-hidden', people: 12 })).toBe('Lidé se ukryli v lese.');
    expect(
      text({ day: 1, kind: 'guests-came', away: 'refuge', people: 5, villageName: 'Lhota' }),
    ).toBe('Ze vsi Lhota přišlo 5 lidí do útočiště.');
    expect(text({ day: 1, kind: 'people-back', away: 'refuge', people: 5 })).toBe(
      '5 lidí se vrátilo domů z útočiště.',
    );
    // Úloha 10 – vrátil je správce
    expect(text({ day: 1, kind: 'people-back', away: 'refuge', people: 5, steward: true })).toBe(
      'Správce vrátil lidi domů.',
    );
  });

  it('dostižení a chycený posel', () => {
    expect(text({ day: 1, kind: 'refuge-caught', killed: 2, led: 3 })).toBe(
      'Vojsko dostihlo uprchlíky: padli 2, odvedeno 3.',
    );
    expect(text({ day: 1, kind: 'refuge-caught', killed: 0, led: 3 })).toBe(
      'Vojsko dostihlo uprchlíky: odvedeno 3.',
    );
    expect(text({ day: 1, kind: 'messenger-caught', fate: 'killed', name: 'Radim' })).toBe(
      'Posel Radim padl.',
    );
    expect(text({ day: 1, kind: 'messenger-caught', fate: 'killed' })).toBe('Posel padl.');
    expect(text({ day: 1, kind: 'messenger-caught', fate: 'led' })).toBe('Posla odvedlo vojsko.');
    expect(text({ day: 1, kind: 'messenger-caught', fate: 'captured', name: 'Ctibor' })).toBe(
      'Posla Ctibor zajalo vojsko.',
    );
  });
});
