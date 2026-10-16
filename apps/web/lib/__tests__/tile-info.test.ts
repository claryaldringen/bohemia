import { describe, it, expect } from 'vitest';
import { formatTileInfo } from '../tile-info';

const tile = { x: 3, y: 4, heightM: 12.3 };

describe('formatTileInfo', () => {
  it.each([
    ['meadow', 72, 'Louka · úrodnost 72'],
    ['forest', 40, 'Les · úrodnost 40'],
    ['water', 0, 'Voda · úrodnost 0'],
  ] as const)('%s s úrodností %i → „%s“', (surface, fertility, text) => {
    expect(formatTileInfo({ ...tile, surface, fertility })).toBe(text);
  });
});
