import { describe, expect, it } from 'vitest';
import { PEG_SPACING_M, closedLine, stakingLine, stakingPegs } from '../staking-layout';
import type { Point } from '../village-layout';

describe('vytyčení staveniště', () => {
  const square: Point[] = [
    [0, 0],
    [15, 0],
    [15, 15],
    [0, 15],
  ];

  it('dá kolík do každého rohu a podél dlouhých úseků rozestup nejvýš PEG_SPACING_M', () => {
    const pegs = stakingPegs([closedLine(square)]);
    for (const corner of square) expect(pegs).toContainEqual(corner);
    // 4 strany po 15 m = 4 × 5 úseků, uzavřený obrys má o kolík méně než úseků + 1
    expect(pegs).toHaveLength(20);
    const line = stakingLine(closedLine(square));
    for (let k = 1; k < line.length; k++) {
      const d = Math.hypot(line[k]![0] - line[k - 1]![0], line[k]![1] - line[k - 1]![1]);
      expect(d).toBeLessThanOrEqual(PEG_SPACING_M + 1e-9);
    }
  });

  it('kolíky, kde se čáry potkají, splynou', () => {
    const a: Point[] = [
      [0, 0],
      [15, 0],
    ];
    const b: Point[] = [
      [15, 0],
      [15, 15],
    ];
    expect(stakingPegs([a, b])).toHaveLength(stakingPegs([[...a, ...b.slice(1)]]).length);
  });

  it('prázdný obrys nemá kolíky', () => {
    expect(stakingPegs([])).toEqual([]);
    expect(closedLine([])).toEqual([]);
  });
});
