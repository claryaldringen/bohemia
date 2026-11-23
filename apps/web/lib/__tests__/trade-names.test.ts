import { describe, expect, it } from 'vitest';
import { TRADE_GOODS, isPieceGood } from '@bohemia/game';
import { TRADE_GOOD_NAMES, goodsText, tradeAmountText } from '../trade-names';

describe('jednotky zboží obchodu', () => {
  it('kámen je v m³, ne v kusech (trade.md – Kámen)', () => {
    expect(tradeAmountText(3, 'm³')).toBe('3 m³');
    expect(goodsText({ stone: 3 })).toBe('3 m³ kamene');
  });

  it('kg a kusy zůstávají', () => {
    expect(tradeAmountText(1500, 'kg')).toMatch(/^1\s500 kg$/);
    expect(tradeAmountText(4, 'ks')).toBe('4 kusy');
  });

  it('kusové zboží jádra (`isPieceGood`) je právě to, co web nemá v kg', () => {
    for (const good of TRADE_GOODS) {
      expect(isPieceGood(good), good).toBe(TRADE_GOOD_NAMES[good].unit !== 'kg');
    }
  });
});
