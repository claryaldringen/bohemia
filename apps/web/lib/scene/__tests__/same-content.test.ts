import { describe, expect, it } from 'vitest';
import { sameContent } from '../same-content';

describe('sameContent', () => {
  it('typovaná pole, pole a objekty po prvcích', () => {
    const grid = (k: number) => ({
      positions: new Float32Array([1, 2, k]),
      alphas: new Float32Array([0.5]),
      indices: new Uint32Array([0, 1, 2]),
    });
    expect(sameContent(grid(3), grid(3))).toBe(true);
    expect(sameContent(grid(3), grid(4))).toBe(false);
    expect(sameContent([grid(1), [0.6, 0.8], 'a'], [grid(1), [0.6, 0.8], 'a'])).toBe(true);
    expect(sameContent([grid(1)], [grid(1), grid(1)])).toBe(false);
    expect(sameContent(new Float32Array([1]), new Float64Array([1]))).toBe(false);
    expect(sameContent(new Float32Array([1]), [1])).toBe(false);
    expect(sameContent({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameContent({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameContent(null, {})).toBe(false);
    expect(sameContent(Number.NaN, Number.NaN)).toBe(false);
  });
});
