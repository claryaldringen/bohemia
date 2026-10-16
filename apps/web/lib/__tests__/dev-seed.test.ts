import { describe, it, expect } from 'vitest';
import { parseSeed } from '../dev-seed';

describe('parseSeed', () => {
  it.each([
    ['123', 123],
    ['0', 0],
    ['2147483647', 2147483647],
  ])('„%s“ → %i', (value, seed) => {
    expect(parseSeed(value)).toBe(seed);
  });

  it.each([undefined, '', 'abc', '-5', '1.5', '2147483648'])(
    'neplatné „%s“ → výchozí seed 1',
    (value) => {
      expect(parseSeed(value)).toBe(1);
    },
  );
});
