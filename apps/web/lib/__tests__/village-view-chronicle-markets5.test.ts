// Kronika plánu 5 (markets.md – Rozhodnutí plánu 5, body 1, 7 a 11): odvedení z tažení – otroci
// a křesťané, kupci kupují otroky.
import { describe, expect, it } from 'vitest';
import { MERCHANTS, type ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

const text = (event: Record<string, unknown>): string =>
  chronicleText({ day: 100, ...event } as unknown as ChronicleEvent, 'Vlkov', 7);

describe('kronika – příjezd kupců, kteří kupují i otroky', () => {
  it('seznam kupců z pravidel: otroci ve 4. pádě na konci výčtu', () => {
    expect(
      text({
        kind: 'merchants-arrived',
        sells: MERCHANTS.goods,
        buys: MERCHANTS.wants,
        coins: MERCHANTS.coins,
      }),
    ).toBe(
      'Přijeli kupci z daleka – prodávají meče, kroužkové košile a helmy, kupují med, vosk, kožešiny a otroky.',
    );
  });
});

describe('kronika – odvedení z tažení', () => {
  it('otroci a křesťané v 4. pádě, nulová část se vynechá', () => {
    const led = (slaves: number, free: number): string =>
      text({ kind: 'led-settled', slaves, free });
    expect(led(3, 1)).toBe('Z tažení přivedli 3 otroky a 1 křesťana.');
    expect(led(1, 0)).toBe('Z tažení přivedli 1 otroka.');
    expect(led(5, 0)).toBe('Z tažení přivedli 5 otroků.');
    expect(led(0, 2)).toBe('Z tažení přivedli 2 křesťany.');
    expect(led(0, 5)).toBe('Z tažení přivedli 5 křesťanů.');
  });
});

describe('kronika – otrokyně od souseda', () => {
  const newcomer = (extra: Record<string, unknown>): string =>
    text({
      kind: 'newcomer',
      group: 'slave',
      direction: 'N',
      people: 1,
      dwellingId: 1,
      villageName: 'Lhota',
      ...extra,
    });

  it('ženský rod u female, mužský bez něj', () => {
    expect(newcomer({ female: true })).toBe('Do vsi přišla otrokyně z Lhoty.');
    expect(newcomer({ female: true, returned: true })).toBe(
      'Do vsi se vrátila prodaná otrokyně z Lhoty.',
    );
    expect(newcomer({})).toBe('Do vsi přišel otrok z Lhoty.');
  });

  it('prázdné jméno vsi (cizí správce) – „ze sousední vsi“', () => {
    expect(newcomer({ female: true, villageName: '' })).toBe(
      'Do vsi přišla otrokyně ze sousední vsi.',
    );
  });
});

describe('kronika – trh s otroky a příchod otroka', () => {
  it('market-held a market-returned s otroky', () => {
    expect(text({ kind: 'market-held', sold: { slaves: 2 }, bought: { coins: 48 } })).toBe(
      'Na trhu ves prodala 2 ks otroků, dostala 48 mincí.',
    );
    expect(
      text({
        kind: 'market-returned',
        sold: { slaves: 1 },
        bought: { coins: 24 },
      }),
    ).toContain('prodala 1 ks otroků, dostala 24 mincí');
  });

  it('příchod otroka: vlastní ves, cizí správce, vrácený', () => {
    const slave = (extra: Record<string, unknown>): string =>
      text({
        kind: 'newcomer',
        group: 'slave',
        direction: 'N',
        people: 1,
        dwellingId: 1,
        villageName: 'Lhota',
        ...extra,
      });
    expect(slave({})).toBe('Do vsi přišel otrok z Lhoty.');
    expect(slave({ villageName: '' })).toBe('Do vsi přišel otrok ze sousední vsi.');
    expect(slave({ returned: true })).toBe('Do vsi se vrátil prodaný otrok z Lhoty.');
  });
});
