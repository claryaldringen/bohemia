import { describe, expect, it } from 'vitest';
import { MARKET, TRADE_GOOD_VALUES } from '../../rules';
import { ARMS_GOODS, COIN_GOOD, isPieceGood, withoutCoins } from '../goods';
import { initialPrice } from '../market-prices';
import {
  MARKET_BAD_ORDER,
  MARKET_OVER_STOCK,
  departMarketInPlace,
  marketCrew,
} from '../market-trip';
import { addGood, villageGoodStock } from '../trade';
import { D, homeVillage, target } from './market-fixtures';

// Mince a zbroj jako zboží (markets.md – Rozhodnutí plánu 4, body 1 a 7).

describe('ceny a druhy', () => {
  it('výchozí ceny: mince 1, meč 120, helma 240, kroužková košile 480', () => {
    expect(initialPrice('coins')).toBe(1);
    expect(initialPrice('swords')).toBe(120);
    expect(initialPrice('helmets')).toBe(240);
    expect(initialPrice('mailShirts')).toBe(480);
    expect(TRADE_GOOD_VALUES.coins.valueKg).toBe(MARKET.grainKgPerCoin);
    expect(TRADE_GOOD_VALUES.coins.carryKg).toBe(0);
  });

  it('mince a zbroj jsou kusové zboží; zbroj jsou meče, kroužkové košile a helmy', () => {
    for (const good of [COIN_GOOD, ...ARMS_GOODS]) expect(isPieceGood(good), good).toBe(true);
    expect(ARMS_GOODS).toEqual(['swords', 'mailShirts', 'helmets']);
    expect(ARMS_GOODS).not.toContain(COIN_GOOD);
  });

  it('withoutCoins vyřadí mince a nuly', () => {
    expect(withoutCoins({ grain: 3, coins: 2 })).toEqual({ grain: 3 });
    expect(withoutCoins({ coins: 2, swords: 0, wax: 1 })).toEqual({ wax: 1 });
  });
});

describe('zásoba vsi', () => {
  it('mince: zásoba, odečet a nula ze stavu zmizí', () => {
    const s = homeVillage();
    s.coins = 10;
    expect(villageGoodStock(s, 'coins', D)).toBe(10);
    addGood(s, 'coins', -4, D);
    expect(s.coins).toBe(6);
    addGood(s, 'coins', -10, D);
    expect(s).not.toHaveProperty('coins');
    expect(villageGoodStock(s, 'coins', D)).toBe(0);
    addGood(s, 'coins', 3, D);
    expect(s.coins).toBe(3);
  });

  it('zbroj: přibude po kusech, nula zmizí i s prázdným `arms`, na prázdné vsi nic', () => {
    const s = homeVillage();
    addGood(s, 'swords', 2, D);
    expect(s.arms).toEqual({ swords: 2 });
    addGood(s, 'helmets', 1, D);
    expect(villageGoodStock(s, 'helmets', D)).toBe(1);
    addGood(s, 'swords', -2, D);
    expect(s.arms).toEqual({ helmets: 1 });
    addGood(s, 'helmets', -1, D);
    expect(s).not.toHaveProperty('arms');
    addGood(s, 'helmets', -1, D);
    expect(s).not.toHaveProperty('arms');
    expect(villageGoodStock(s, 'mailShirts', D)).toBe(0);
  });
});

describe('výprava s mincemi', () => {
  const order = (coins: number) => ({ give: { coins }, wants: {}, stayDays: 1 });

  it('mince z vsi ubydou a příjezd je veze', () => {
    const s = homeVillage();
    s.coins = 10;
    const sent = departMarketInPlace(s, D, order(5), target);
    if (!sent.ok) throw new Error(sent.reason);
    expect(s.coins).toBe(5);
    expect(s.outbox!.at(-1)!.body).toMatchObject({ arrival: { goods: { coins: 5 } } });
  });

  it('zlomek mincí je vadná objednávka, víc než ves má přetečení', () => {
    const s = homeVillage();
    s.coins = 10;
    expect(departMarketInPlace(s, D, order(2.5), target)).toEqual({
      ok: false,
      reason: MARKET_BAD_ORDER,
    });
    expect(departMarketInPlace(s, D, order(11), target)).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    expect(s.coins).toBe(10);
  });
});

describe('váha nákladu', () => {
  it('mince nosiče nepřidají', () => {
    expect(marketCrew({ grain: 300, coins: 1000 }, {}, [])).toEqual({ porters: 12, carts: 0 });
    expect(marketCrew({ coins: 1000 }, {}, [])).toEqual({ porters: 1, carts: 0 });
  });

  it('2 meče a 2 kroužkové košile (27 kg) unesou dva nosiči', () => {
    expect(marketCrew({ swords: 2, mailShirts: 2 }, {}, [])).toEqual({ porters: 2, carts: 0 });
  });
});
