import { describe, expect, it } from 'vitest';
import { LANDSCAPE_SIZE } from '../../../landscape/types';
import { SKELETON, trailEdgeExists, trailNode, trailPortAt, trailSides } from '..';
import { skeletonSlice } from '..';

const SEAT = 20270101;

describe('stezky kostry', () => {
  it('uzel leží uvnitř bloku aspoň nodeMargin od kraje', () => {
    const { block, nodeMargin } = SKELETON.trail;
    for (let bx = -6; bx < 6; bx++) {
      for (let by = -6; by < 6; by++) {
        const n = trailNode(7, { x: bx, y: by });
        expect(n.x - bx * block).toBeGreaterThanOrEqual(nodeMargin);
        expect(n.x - bx * block).toBeLessThan(block - nodeMargin);
        expect(n.y - by * block).toBeGreaterThanOrEqual(nodeMargin);
        expect(n.y - by * block).toBeLessThan(block - nodeMargin);
      }
    }
  });

  it('políčko stezky má 2 strany, uzel 1, 3 nebo 4 (okno 120 × 120, seed 7)', () => {
    let trailCells = 0;
    for (let x = -60; x < 60; x++) {
      for (let y = -60; y < 60; y++) {
        const sides = trailSides(7, { x, y });
        if (sides.length === 0) continue;
        trailCells++;
        const bx = Math.floor(x / 20);
        const by = Math.floor(y / 20);
        const node = trailNode(7, { x: bx, y: by });
        if (node.x === x && node.y === y) expect(sides.length).toBeGreaterThanOrEqual(1);
        else expect(sides).toHaveLength(2);
      }
    }
    expect(trailCells).toBeGreaterThan(0);
  });

  it('spojení: soused na straně stezky má stezku na opačné straně', () => {
    const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' } as const;
    const step = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] } as const;
    for (let x = -40; x < 40; x++) {
      for (let y = -40; y < 40; y++) {
        for (const side of trailSides(7, { x, y })) {
          const [dx, dy] = step[side];
          expect(trailSides(7, { x: x + dx, y: y + dy })).toContain(opposite[side]);
        }
      }
    }
  });

  it('body stezky na společné hraně se shodují u obou políček', () => {
    for (let x = -40; x < 40; x++) {
      for (let y = -40; y < 40; y++) {
        const a = skeletonSlice(7, { x, y });
        const e = skeletonSlice(7, { x: x + 1, y });
        const pa = a?.trails.find((p) => p.side === 'E');
        const pe = e?.trails.find((p) => p.side === 'W');
        expect(pa?.at).toBe(pe?.at);
        const n = skeletonSlice(7, { x, y: y + 1 });
        expect(a?.trails.find((p) => p.side === 'N')?.at).toBe(
          n?.trails.find((p) => p.side === 'S')?.at,
        );
      }
    }
  });

  it('spojení existuje s určitou pravděpodobností kolem edgeShare', () => {
    let yes = 0;
    for (let i = 0; i < 400; i++) if (trailEdgeExists(SEAT, { x: i, y: -i }, 'E')) yes++;
    expect(yes / 400).toBeGreaterThan(0.6);
    expect(yes / 400).toBeLessThan(0.8);
  });

  it('trailPortAt je v 24–103 a ≥ trailGap od bodu řeky', () => {
    const a = { x: 3, y: 4 };
    const b = { x: 4, y: 4 };
    const { margin, trailGap } = SKELETON.port;
    const riverAts = [null, ...Array.from({ length: LANDSCAPE_SIZE }, (_, i) => i)];
    for (const riverAt of riverAts) {
      for (let i = 0; i < 30; i++) {
        const at = trailPortAt(i, { x: a.x + i, y: a.y }, { x: b.x + i, y: b.y }, riverAt);
        expect(at).toBeGreaterThanOrEqual(margin);
        expect(at).toBeLessThanOrEqual(LANDSCAPE_SIZE - 1 - margin);
        if (riverAt !== null) expect(Math.abs(at - riverAt)).toBeGreaterThanOrEqual(trailGap);
      }
    }
  });

  it('podíl políček se stezkou je 6–11 % (seedy 1–3)', () => {
    for (const seed of [1, 2, 3]) {
      let n = 0;
      for (let x = 0; x < 200; x++) {
        for (let y = 0; y < 200; y++) if (trailSides(seed, { x, y }).length > 0) n++;
      }
      expect(n / 40000).toBeGreaterThan(0.06);
      expect(n / 40000).toBeLessThan(0.11);
    }
  });
});
