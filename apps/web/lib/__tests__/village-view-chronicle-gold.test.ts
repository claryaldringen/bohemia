// Kronika plánu 6 (gold.md – Pravidla 1 a 2): rýžovník vyrýžoval náplav – kolik náplavů se zlatem
// zbývá, poslední náplav vlastní větou (žádná „0“); kupci kupují i zlato.
import { describe, expect, it } from 'vitest';
import { MERCHANTS, type ChronicleEvent, type VillageState } from '@bohemia/game';
import { chronicle } from '../village-view';
import { chronicleText } from '../village-view-chronicle';

describe('kronika – příjezd kupců, kteří kupují i zlato (Rozhodnutí plánu 6, bod 8)', () => {
  it('seznam kupců z pravidel: zlato první, otroci ve 4. pádě na konci', () => {
    const event = {
      day: 100,
      kind: 'merchants-arrived',
      sells: MERCHANTS.goods,
      buys: MERCHANTS.wants,
    } as unknown as ChronicleEvent;
    expect(chronicleText(event, 'Vlkov')).toBe(
      'Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují zlato, med, vosk, kožešiny a otroky.',
    );
  });
});

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

describe('kronika – zlato ze zaniklé vsi (Rozhodnutí plánu 6, bod 9)', () => {
  const text = (event: Record<string, unknown>, name = 'Vlkov'): string =>
    chronicleText({ day: 100, ...event } as unknown as ChronicleEvent, name);

  it('jen zlato – bez „0 mincí“; s mincemi obojí; cizí správce vidí sousední ves', () => {
    const base = { kind: 'stranded-coins', villageName: 'Lhota', villageId: 'h' };
    expect(text({ ...base, coins: 0, gold: 40 })).toBe(
      'Ze zaniklé vsi Lhota se vrátilo 40 g zlata.',
    );
    expect(text({ ...base, coins: 10, gold: 40 })).toBe(
      'Do vsi přišlo 10 mincí a 40 g zlata z Lhoty.',
    );
    expect(text({ ...base, coins: 17 })).toBe('Do vsi přišlo 17 mincí z Lhoty.');
    expect(text({ ...base, coins: 0, gold: 40, villageName: '' })).toBe(
      'Ze sousední vsi se vrátilo 40 g zlata.',
    );
  });

  it('zlato s lidmi v zápisu newcomer', () => {
    expect(
      text({
        kind: 'newcomer',
        direction: 'W',
        group: 'family',
        people: 4,
        dwellingId: 3,
        villageName: 'Lhota',
        villageId: 'h',
        returned: true,
        gold: 40,
      }),
    ).toBe('Do vsi se vrátila prodaná rodina z Lhoty a 40 g zlata.');
  });
});
