import { describe, expect, it } from 'vitest';
import { migrateVillage, VILLAGE_MIGRATIONS } from '../../core/migrations';
import { MARKET } from '../../rules/rules-market';
import type { MarketResult, VillageState } from '../../types';
import { newsPricesOf, withCoinRate } from '../coin-rate';
import { marketResult } from '../market';
import { nextMerchantVisit } from '../merchant-plan';
import { merchantsArrive } from '../merchants';
import { D, marketVillage, report } from './market-fixtures';

// Převod cen na minci 90 kg obilí (gold.md – Mince 2,4 g zlata za 90 kg obilí, bod 3): ceny, které si
// trhy a vsi pamatují v mincích po 15 kg obilí, se jednou vydělí šesti; počty mincí se nepřevádějí.

const CTX = { obstacles: null, landscape: null } as const;

/** Ves z doby 15 kg obilí za minci: trh s cenami a hladinou, zpráva o trhu Lhoty, mince. */
function oldVillage(): VillageState {
  const s = marketVillage(0);
  s.coins = 77;
  s.market = {
    prices: { swords: 150, grain: 0.09, honey: 0.6 },
    level: 2,
    visitors: [],
    nextOrder: 1,
    arrivals: [],
  };
  s.news = [
    { villageId: 'm', name: 'Lhota', report, prices: { swords: 132, mailShirts: 528 }, level: 1.5 },
    { villageId: 'k', name: 'Kozlov', report },
  ];
  return s;
}

describe('převod cen v mincích (bod 3)', () => {
  it('ceny trhu vsi a zprávy o trhu ÷ 6, mince, hladina a zpráva bez cen beze změny', () => {
    const old = oldVillage();
    const given = structuredClone(old);
    const s = withCoinRate(old);
    expect(s.market?.prices.swords).toBe(25);
    expect(s.market?.prices.grain).toBeCloseTo(0.015, 12);
    expect(s.market?.prices.honey).toBeCloseTo(0.1, 12);
    expect(s.market?.coinKg).toBe(90);
    expect(s.market?.level).toBe(2);
    expect(s.news?.[0]).toMatchObject({ prices: { swords: 22, mailShirts: 88 }, coinKg: 90 });
    expect(s.news?.[0]?.level).toBe(1.5);
    expect(s.news?.[1]).toEqual({ villageId: 'k', name: 'Kozlov', report });
    expect(s.coins).toBe(77);
    // vstup se nemění
    expect(old).toEqual(given);
  });

  it('druhý převod nic nezmění; převod je na konci seznamu a běží v migrateVillage', () => {
    expect(VILLAGE_MIGRATIONS.at(-1)?.id).toBe('coin-rate');
    const once = migrateVillage(oldVillage(), CTX);
    expect(once.market?.prices.swords).toBe(25);
    const twice = migrateVillage(once, CTX);
    expect(twice).toEqual(once);
    expect(withCoinRate(once)).toBe(once);
  });

  it('stav po převodu projde JSON beze změny, bez NaN a Infinity', () => {
    const s = withCoinRate(oldVillage());
    const text = JSON.stringify(s);
    expect(JSON.parse(text)).toEqual(s);
    expect(text).not.toMatch(/NaN|Infinity/);
    // ceny bez `null` (JSON tak ukládá NaN i Infinity)
    expect(JSON.stringify([s.market, s.news])).not.toMatch(/null/);
  });

  it('nová ves nemá co převádět (týž objekt); trh založený kupci má značku od založení', () => {
    const s = marketVillage(0);
    expect(withCoinRate(s)).toBe(s);
    const stop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
    s.merchantStops = [stop];
    const visit = nextMerchantVisit([stop], D)!;
    s.lastDay = visit.day - 1;
    merchantsArrive(s, visit.day);
    expect(s.market?.coinKg).toBe(MARKET.grainKgPerCoin);
    s.market!.prices = { swords: 21 };
    expect(withCoinRate(s)).toBe(s);
    expect(s.market?.prices.swords).toBe(21);
  });

  it('výsledek trhu nese kurz; starší výsledek bez kurzu (ze schránky) se převede při návratu', () => {
    const result = marketResult(
      { key: 'market:h:1', goods: {}, horses: [] } as unknown as Parameters<typeof marketResult>[0],
      { report, prices: { swords: 21 } },
    );
    expect(result.coinKg).toBe(90);
    expect(newsPricesOf(result)).toEqual({ prices: { swords: 21 }, coinKg: 90 });
    const older = { ...result, prices: { swords: 120 } } as MarketResult;
    delete older.coinKg;
    expect(newsPricesOf(older)).toEqual({ prices: { swords: 20 }, coinKg: 90 });
    expect(newsPricesOf({ ...result, prices: undefined } as unknown as MarketResult)).toEqual({});
  });
});
