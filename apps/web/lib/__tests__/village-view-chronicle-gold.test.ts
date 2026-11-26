// Kronika plánu 6 (gold.md – Pravidla 1): rýžovník vyrýžoval náplav – kolik náplavů se zlatem
// zbývá, poslední náplav vlastní větou (žádná „0“).
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent, VillageState } from '@bohemia/game';
import { chronicle } from '../village-view';
import { chronicleText } from '../village-view-chronicle';

const exhausted = (left: number): ChronicleEvent => ({ day: 100, kind: 'placer-exhausted', left });

describe('kronika – vyrýžovaný náplav', () => {
  it('zbývá 1 / 2 / 5 náplavů – 6. pád podle počtu', () => {
    expect(chronicleText(exhausted(1), 'Vlkov')).toBe(
      'Rýžovník vyrýžoval náplav. Zlato zbývá na 1 náplavu.',
    );
    expect(chronicleText(exhausted(2), 'Vlkov')).toBe(
      'Rýžovník vyrýžoval náplav. Zlato zbývá na 2 náplavech.',
    );
    expect(chronicleText(exhausted(5), 'Vlkov')).toBe(
      'Rýžovník vyrýžoval náplav. Zlato zbývá na 5 náplavech.',
    );
  });

  it('poslední náplav – vlastní věta bez „0“', () => {
    const text = chronicleText(exhausted(0), 'Vlkov');
    expect(text).toBe('Rýžovník vyrýžoval poslední náplav.');
    expect(text).not.toMatch(/\d/);
  });

  it('pohled kroniky nese left pro upozornění (i 0)', () => {
    const state = { seed: 7, chronicle: [exhausted(3), { ...exhausted(0), day: 101 }] };
    const view = chronicle(state as unknown as VillageState, 'Vlkov');
    expect(view.map((e) => [e.kind, e.left])).toEqual([
      ['placer-exhausted', 0],
      ['placer-exhausted', 3],
    ]);
  });
});
