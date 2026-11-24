// Kronika plánu 3 (markets.md – Rozhodnutí plánu 3, bod 14): kdo a kam jel na trh, nevěsty a ženichové
// ze skutečných sousedů, kovář souseda, lidé a zakázky; prázdné jméno vsi = sousední ves (cizí správce).
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { shownInChronicle } from '../chronicle-view';
import { chronicleText } from '../village-view-chronicle';

const text = (event: Record<string, unknown>): string =>
  chronicleText({ day: 100, ...event } as unknown as ChronicleEvent, 'Vlkov', 7);

const departed = (by: 'villagers' | 'steward' | 'smith' | 'kin' | undefined, villageName: string) =>
  ({
    kind: 'market-departed',
    villageName,
    give: { grain: 100 },
    wants: {},
    returnDay: 120,
    villageId: 'v-2',
    ...(by ? { by } : {}),
  }) as const;

describe('kronika – výpravy na trh podle toho, kdo je poslal', () => {
  it('vesničané, správce, kovář', () => {
    expect(text(departed('villagers', 'Lhota'))).toBe('Vesničané jeli na trh do Lhoty.');
    expect(text(departed('steward', 'Lhota'))).toBe('Správce poslal výpravu do Lhoty.');
    expect(text(departed('smith', 'Lhota'))).toBe('Kovář šel kovat koně do Lhoty.');
  });

  it('výprava hráče je beze změny, partner za hledajícím bez řádku', () => {
    expect(text(departed(undefined, 'Lhota'))).toBe(
      'Výprava vyrazila na trh do vsi Lhota – veze 100 kg obilí; doma bude 30. dubna 500.',
    );
    expect(shownInChronicle({ day: 1, ...departed('kin', 'Lhota') })).toBe(false);
    expect(shownInChronicle({ day: 1, ...departed('villagers', 'Lhota') })).toBe(true);
  });

  it('cizí správce: jméno vsi držitele je prázdné – sousední ves', () => {
    expect(text(departed('villagers', ''))).toBe('Vesničané jeli na trh do sousední vsi.');
    expect(text(departed('steward', ''))).toBe('Správce poslal výpravu do sousední vsi.');
    expect(text(departed('smith', ''))).toBe('Kovář šel kovat koně do sousední vsi.');
  });
});

describe('kronika – sňatky a lidé ze skutečných sousedů', () => {
  const wed = { dwellingId: 1, manId: 1, womanId: 2 } as const;
  it('nevěsta, ženich, dcera, syn', () => {
    expect(text({ kind: 'bride-from-outside', ...wed, villageName: 'Lhota' })).toBe(
      'Nevěsta z Lhoty.',
    );
    expect(text({ kind: 'groom-from-outside', ...wed, villageName: 'Lhota' })).toBe(
      'Ženich z Lhoty.',
    );
    expect(text({ kind: 'married-away', dwellingId: 1, villageName: 'Lhota' })).toBe(
      'Dcera se vdala do Lhoty.',
    );
    expect(text({ kind: 'married-away', dwellingId: 1, groom: true, villageName: 'Lhota' })).toBe(
      'Syn se přiženil do Lhoty.',
    );
  });

  it('staré záznamy bez jména vsi zůstávají', () => {
    expect(text({ kind: 'bride-from-outside', ...wed })).toBe(
      'Muž si přivedl nevěstu ze sousední vsi.',
    );
    expect(text({ kind: 'married-away', dwellingId: 1 })).toBe('Dcera se vdala do sousední vsi.');
  });

  it('cizí správce: prázdné jméno', () => {
    expect(text({ kind: 'bride-from-outside', ...wed, villageName: '' })).toBe(
      'Nevěsta ze sousední vsi.',
    );
    expect(text({ kind: 'married-away', dwellingId: 1, villageName: '' })).toBe(
      'Dcera se vdala do sousední vsi.',
    );
  });

  it('další manželka vojvody: dosavadní text a „z <ves>“', () => {
    expect(
      text({
        kind: 'extra-wife',
        name: 'Lutobor',
        estate: { title: 'voivode', kin: 'head' },
        wife: 'Dobrava',
        villageName: 'Lhota',
      }),
    ).toBe('Vojvoda Lutobor si vzal Dobravu z Lhoty.');
    expect(
      text({ kind: 'extra-wife', name: 'Lutobor', estate: { title: 'voivode', kin: 'head' } }),
    ).toBe('Vojvoda Lutobor si vzal další ženu.');
  });

  it('lidé od souseda a vrácená rodina', () => {
    const came = {
      kind: 'newcomer',
      direction: 'N',
      group: 'family',
      people: 4,
      dwellingId: 1,
    } as const;
    expect(text({ ...came, villageName: 'Lhota' })).toBe('Do vsi přišla rodina z Lhoty.');
    expect(text({ ...came, villageName: 'Lhota', returned: true })).toBe(
      'Do vsi se vrátila prodaná rodina z Lhoty.',
    );
    expect(text({ ...came })).toBe('Ze severu přišla rodina – 4 lidé.');
  });
});

describe('kronika – kovář, zakázky a trh', () => {
  it('kovář souseda okul koně', () => {
    expect(text({ kind: 'horses-shod', horses: 2, own: false, villageName: 'Lhota' })).toBe(
      'Kovář z Lhoty okul koně.',
    );
    expect(text({ kind: 'horses-shod', horses: 2, own: false, villageName: '' })).toBe(
      'Kovář ze sousední vsi okul koně.',
    );
    expect(text({ kind: 'horses-shod', horses: 2, own: true })).toBe('Kovář okul koně.');
  });

  it('zakázka je hotová', () => {
    const ready = { kind: 'order-ready', villageId: 'v-2', good: 'tools' } as const;
    expect(text({ ...ready, villageName: 'Lhota' })).toBe('Zakázka v Lhotě je hotová.');
    expect(text({ ...ready, villageName: '' })).toBe('Zakázka v sousední vsi je hotová.');
  });

  it('na trh přišel kovář, ne obchodník s hřivnami; jinak výprava', () => {
    const arrived = {
      kind: 'market-arrived',
      villageName: 'Lhota',
      goods: { ironBars: 1 },
    } as const;
    expect(text({ ...arrived, smith: true })).toBe('Na trh přišel kovář z Lhoty.');
    expect(text(arrived)).toBe('Na trh přišla výprava ze vsi Lhota – 1 kg hřiven.');
    expect(text({ ...arrived, villageName: '', goods: {} })).toBe(
      'Na trh přišla výprava ze sousední vsi.',
    );
  });

  it('výprava se vrátila ze sousední vsi (prázdné jméno) bez jména', () => {
    expect(
      text({ kind: 'market-returned', villageName: '', sold: {}, bought: {}, unsold: {} }),
    ).toBe('Výprava se vrátila z trhu – nic nevyměnila.');
  });
});
