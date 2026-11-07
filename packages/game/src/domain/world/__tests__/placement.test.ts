import { describe, expect, it } from 'vitest';
import { cellLandscapeSeed } from '../cell-seed';
import { cellDistance, placeNewPlayer, ringCells, type OccupiedCell } from '../placement';

const at = (x: number, y: number, ownerId: string): OccupiedCell => ({ cell: { x, y }, ownerId });

describe('ringCells', () => {
  it('poloměr 0 je střed, jinak právě 8·r políček začínajících severem', () => {
    expect(ringCells({ x: 2, y: 2 }, 0)).toEqual([{ x: 2, y: 2 }]);
    const ring = ringCells({ x: 0, y: 0 }, 1);
    expect(ring).toHaveLength(8);
    expect(ring.slice(0, 3)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ]);
    expect(new Set(ring.map((c) => `${c.x},${c.y}`)).size).toBe(8);
    expect(ring.every((c) => cellDistance(c, { x: 0, y: 0 }) === 1)).toBe(true);
    expect(ringCells({ x: 0, y: 0 }, 3)).toHaveLength(24);
  });
});

describe('placeNewPlayer', () => {
  it('prázdný svět: nezávislý začíná ve středu', () => {
    expect(placeNewPlayer([], { kind: 'independent' })).toEqual({ x: 0, y: 0 });
  });

  it('druhý nezávislý je aspoň 3 od prvního a nejblíž středu (první v pořadí prstence)', () => {
    const cell = placeNewPlayer([at(0, 0, 'a')], { kind: 'independent' });
    expect(cell).toEqual({ x: 0, y: 3 });
  });

  it('nezávislý drží odstup 3 od všech map', () => {
    const occupied = [at(0, 0, 'a'), at(0, 3, 'b'), at(3, 3, 'c')];
    const cell = placeNewPlayer(occupied, { kind: 'independent' });
    expect(occupied.every((o) => cellDistance(o.cell, cell) >= 3)).toBe(true);
  });

  it('pozvaný leží nejblíž pánovi a aspoň 2 od všech map včetně pánových', () => {
    const lord = { x: 5, y: 5 };
    const occupied = [at(0, 0, 'a'), at(5, 5, 'lord'), at(5, 8, 'x')];
    const cell = placeNewPlayer(occupied, { kind: 'invited', lordSeat: lord });
    expect(cellDistance(cell, lord)).toBe(2);
    expect(occupied.every((o) => cellDistance(o.cell, cell) >= 2)).toBe(true);
    expect(cell).toEqual({ x: 7, y: 7 });
  });
});

describe('cellLandscapeSeed', () => {
  it('je deterministický a liší se podle políčka', () => {
    expect(cellLandscapeSeed(7, { x: 3, y: -2 })).toBe(cellLandscapeSeed(7, { x: 3, y: -2 }));
    expect(cellLandscapeSeed(7, { x: 3, y: -2 })).not.toBe(cellLandscapeSeed(7, { x: -2, y: 3 }));
  });

  it('zlatá hodnota', () => {
    expect(cellLandscapeSeed(7, { x: 3, y: -2 })).toBe(1700065307);
  });
});
