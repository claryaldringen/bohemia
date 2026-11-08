import { describe, expect, it } from 'vitest';
import { goodsText, tradeAmountText } from '../trade-names';

describe('jednotky zboží obchodu', () => {
  it('kámen je v m³, ne v kusech (trade.md – Kámen)', () => {
    expect(tradeAmountText(3, 'm³')).toBe('3 m³');
    expect(goodsText({ stone: 3 })).toBe('3 m³ kamene');
  });

  it('kg a kusy zůstávají', () => {
    expect(tradeAmountText(1500, 'kg')).toMatch(/^1\s500 kg$/);
    expect(tradeAmountText(4, 'ks')).toBe('4 kusy');
  });
});
