import { describe, expect, it } from 'vitest';
import { GATE_RING_RADIUS_M, problemMarks } from '../problem-marks';

describe('značky místa problému', () => {
  it('bez údaje žádné čáry', () => {
    expect(problemMarks(undefined)).toEqual([]);
  });

  it('branka dostane dva uzavřené kroužky kolem svého bodu', () => {
    const lines = problemMarks({ points: [{ x: 10, z: 20 }] });
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line[0]).toEqual(line[line.length - 1]);
    }
    const [x, z] = lines[0]![4]!;
    expect(Math.hypot(x - 10, z - 20)).toBeCloseTo(GATE_RING_RADIUS_M, 6);
  });

  it('obrys se uzavře', () => {
    const lines = problemMarks({
      footprints: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    });
    expect(lines[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });
});
