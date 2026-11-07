import { describe, expect, it } from 'vitest';
import { cellDistance, placeCluster, placeNewPlayer, type OccupiedCell } from '../placement';
import { WORLD } from '../rules-world';

const at = (x: number, y: number, ownerId = 'a'): OccupiedCell => ({ cell: { x, y }, ownerId });
const occ = [at(0, 0), at(5, 1, 'b')];

describe('placeCluster', () => {
  it('jedna buňka = placeNewPlayer (nezávislý i pozvaný)', () => {
    for (const req of [
      { kind: 'independent' } as const,
      { kind: 'invited', lordSeat: { x: 5, y: 1 } } as const,
    ]) {
      const r = placeCluster(occ, [{ x: 3, y: 3 }], req);
      expect(r.offset).toEqual(placeNewPlayer(occ, req));
      expect(r.cells).toEqual([r.offset]);
    }
  });

  it('shluk vedle pána drží odstup 2 u obou buněk a vzájemnou polohu', () => {
    const r = placeCluster(
      [at(0, 0)],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      { kind: 'invited', lordSeat: { x: 0, y: 0 } },
    );
    expect(r.cells).toHaveLength(2);
    expect(r.cells[1]!.x - r.cells[0]!.x).toBe(1);
    expect(r.cells[1]!.y - r.cells[0]!.y).toBe(0);
    for (const cell of r.cells)
      expect(cellDistance(cell, { x: 0, y: 0 })).toBeGreaterThanOrEqual(WORLD.invitedGap);
  });

  it('svobodný se sameLanguage skončí blíž jejich mapě než středu', () => {
    const lang = { x: 10, y: 10 };
    const r = placeNewPlayer([at(0, 0), at(10, 10, 'b')], {
      kind: 'independent',
      sameLanguage: [lang],
    });
    expect(cellDistance(r, lang)).toBeLessThan(cellDistance(r, { x: 0, y: 0 }));
    expect(cellDistance(r, lang)).toBeGreaterThanOrEqual(WORLD.independentGap);
  });

  it('prázdné sameLanguage = jako dnes', () => {
    expect(placeNewPlayer([at(0, 0)], { kind: 'independent', sameLanguage: [] })).toEqual(
      placeNewPlayer([at(0, 0)], { kind: 'independent' }),
    );
  });
});
