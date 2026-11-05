import { describe, expect, it } from 'vitest';
import { INVITE_ALPHABET, formatInviteCode, newInviteCode, parseInviteCode } from '../invite';

describe('pozvánkový kód', () => {
  it('abeceda nemá O, I, L, 0 ani 1', () => {
    for (const c of 'OIL01') expect(INVITE_ALPHABET).not.toContain(c);
  });

  it('newInviteCode dá 8 znaků z abecedy, i na krajích rozsahu', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const code = newInviteCode(() => r);
      expect(code).toHaveLength(8);
      for (const c of code) expect(INVITE_ALPHABET).toContain(c);
    }
  });

  it('formatInviteCode a parseInviteCode', () => {
    expect(formatInviteCode('BH7KM2QX')).toBe('BH7K-M2QX');
    expect(parseInviteCode('bh7k m2qx')).toBe('BH7KM2QX');
    expect(parseInviteCode(' BH7K-M2QX ')).toBe('BH7KM2QX');
    expect(parseInviteCode('BH7KM2Q')).toBeNull();
    expect(parseInviteCode('BH7KM2Q0')).toBeNull();
    expect(parseInviteCode('')).toBeNull();
  });
});
