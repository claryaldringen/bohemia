import { describe, expect, it } from 'vitest';
import { scaledMatrices } from '../instance-hider';

describe('scaledMatrices – zvětšení instance kolem paty', () => {
  it('násobí otočení a měřítko, posun zůstane; ostatní instance beze změny', () => {
    const one = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 5, -3, 1];
    const matrices = Float32Array.from([...one, ...one]);
    const out = scaledMatrices(matrices, [[1, 1.5]]);
    expect([...out.slice(0, 16)]).toEqual(one);
    expect([...out.slice(16)]).toEqual([3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 10, 5, -3, 1]);
    // původní pole se nemění (hider si pamatuje původní instance)
    expect([...matrices.slice(16)]).toEqual(one);
  });
});
