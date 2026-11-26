// Kronika plánu 4 (markets.md – Rozhodnutí plánu 4, body 5 a 9): cizí kupci a mince v tržních větách.
import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

const text = (event: Record<string, unknown>): string =>
  chronicleText({ day: 100, ...event } as unknown as ChronicleEvent, 'Vlkov', 7);

describe('kronika – kupci a mince', () => {
  it('příjezd kupců: co prodávají a co kupují, bez počtů', () => {
    expect(
      text({
        kind: 'merchants-arrived',
        sells: { swords: 4, mailShirts: 2, helmets: 6 },
        buys: { honey: 100, wax: 50, furs: 80 },
        coins: 500,
      }),
    ).toBe(
      'Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují med, vosk a kožešiny.',
    );
  });

  it('výprava se vrátila: mince se píšou zvlášť', () => {
    expect(
      text({
        kind: 'market-returned',
        villageName: 'Lhota',
        sold: { furs: 30, coins: 4 },
        bought: { grain: 100 },
        unsold: {},
      }),
    ).toBe(
      'Výprava se vrátila z trhu ve vsi Lhota – prodala 30 ks kožešin, koupila 100 kg obilí, zaplatila 4 mince.',
    );
    expect(
      text({
        kind: 'market-returned',
        villageName: 'Lhota',
        sold: { honey: 10 },
        bought: { coins: 1 },
        unsold: {},
      }),
    ).toBe('Výprava se vrátila z trhu ve vsi Lhota – prodala 10 kg medu, dostala 1 minci.');
    expect(
      text({
        kind: 'market-returned',
        villageName: 'Lhota',
        sold: { grain: 5 },
        bought: { wax: 2 },
        unsold: {},
      }),
    ).toBe('Výprava se vrátila z trhu ve vsi Lhota – prodala 5 kg obilí, koupila 2 kg vosku.');
  });

  it('tržní den vsi: mince zvlášť, prázdné části se vynechají, bez mincí dnešní věta', () => {
    expect(text({ kind: 'market-held', sold: { honey: 20, wax: 2 }, bought: { coins: 23 } })).toBe(
      'Na trhu ves prodala 20 kg medu, 2 kg vosku, dostala 23 mincí.',
    );
    expect(text({ kind: 'market-held', sold: { coins: 120 }, bought: { swords: 1 } })).toBe(
      'Na trhu ves koupila 1 ks mečů, zaplatila 120 mincí.',
    );
    expect(text({ kind: 'market-held', sold: { grain: 5 }, bought: { wax: 2 } })).toBe(
      'Na trhu ves prodala 5 kg obilí a koupila 2 kg vosku.',
    );
  });

  it('výprava s mincemi: žádné „ks mincí“', () => {
    expect(
      text({
        kind: 'market-departed',
        villageName: 'Lhota',
        give: { coins: 20 },
        wants: { swords: 1 },
        returnDay: 120,
      }),
    ).toBe(
      'Výprava vyrazila na trh do vsi Lhota – veze 20 mincí, shání 1 ks mečů; doma bude 30. dubna 500.',
    );
    expect(text({ kind: 'market-arrived', villageName: 'Lhota', goods: { coins: 3 } })).toBe(
      'Na trh přišla výprava ze vsi Lhota – 3 mince.',
    );
  });
});
