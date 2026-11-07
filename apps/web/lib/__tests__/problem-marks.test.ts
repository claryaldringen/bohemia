import { describe, expect, it } from 'vitest';
import { GATE_RING_RADIUS_M, problemMarks } from '../problem-marks';

describe('značky místa problému', () => {
  it('bez údaje žádné čáry', () => {
    expect(problemMarks(undefined)).toEqual([]);
  });

  it('branka dostane terč – čtyři uzavřené kroužky a kříž se středem v jejím bodě', () => {
    const lines = problemMarks({ points: [{ x: 10, z: 20 }] });
    expect(lines).toHaveLength(6);
    for (const line of lines.slice(0, 4)) {
      expect(line[0]).toEqual(line[line.length - 1]);
    }
    const [x, z] = lines[0]![4]!;
    expect(Math.hypot(x - 10, z - 20)).toBeCloseTo(GATE_RING_RADIUS_M, 6);
    expect(lines[4]).toEqual([
      [10 - GATE_RING_RADIUS_M, 20],
      [10 + GATE_RING_RADIUS_M, 20],
    ]);
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
