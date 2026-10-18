import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { cellsBoundary } from '../field-cells';
import { chainSegments, existingOutlines } from '../placement-outlines';
import type { Point } from '../village-layout';

/** Čtverec 10 × 10 m: políčko (x, y) má střed (5 + 10x, 5 + 10y). */
const part = (x: number, y: number) => ({
  cell: { x, y },
  x: 5 + 10 * x,
  z: 5 + 10 * y,
  size: 10,
});

describe('chainSegments', () => {
  it('spojí obrys jednoho čtverce do uzavřené smyčky o pěti bodech', () => {
    const lines = chainSegments(cellsBoundary([part(0, 0)]));
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toHaveLength(5);
    expect(line[0]).toEqual(line[4]);
  });

  it('pole z dvou sousedních čtverců má jednu smyčku bez vnitřní hrany', () => {
    const lines = chainSegments(cellsBoundary([part(0, 0), part(1, 0)]));
    expect(lines).toHaveLength(1);
    // obdélník 20 × 10: 4 rohy + uzavření
    expect(lines[0]).toHaveLength(5);
  });

  it('dva oddělené čtverce dají dvě čáry', () => {
    expect(chainSegments(cellsBoundary([part(0, 0), part(5, 5)]))).toHaveLength(2);
  });

  it('otevřená čára zůstane otevřená a bez úseček nic nevrátí', () => {
    const open: Point[][] = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [1, 0],
      ],
    ];
    expect(chainSegments(open)).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ]);
    expect(chainSegments([])).toEqual([]);
  });
});

describe('existingOutlines', () => {
  const village = {
    dwellings: [{ id: 1, type: 'zemnice', position: { x: 50, z: 50, rotation: 0 }, built: true }],
    fields: [{ id: 7, parts: [part(0, 0), part(1, 0)] }],
    orchards: [{ id: 2, squares: [part(3, 3)] }],
    cemeteries: [],
    sacred: { oaks: [{ id: 9, x: 80, z: 80 }], groves: [], buildings: [] },
  } as unknown as SceneVillage;

  it('seskupí obrysy podle druhu a vynechá prázdné druhy', () => {
    const groups = existingOutlines(village);
    expect(groups.map((g) => g.kind).sort()).toEqual(['dwelling', 'field', 'orchard', 'sacred']);
    expect(groups.find((g) => g.kind === 'field')!.lines).toHaveLength(1);
  });

  it('polozemnice s pozemkem má obrys celého pozemku jako jednu smyčku', () => {
    const plotVillage = {
      dwellings: [
        {
          id: 3,
          type: 'polozemnice',
          position: { x: 50, z: 50, rotation: 0 },
          built: true,
          plot: { ...part(2, 2), variant: 0 },
        },
      ],
      fields: [],
    } as unknown as SceneVillage;
    const lines = existingOutlines(plotVillage)[0]!.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(5);
    expect(lines[0]).toContainEqual([20, 20]);
    expect(lines[0]).toContainEqual([30, 30]);
  });

  it('prázdná ves nemá žádné obrysy', () => {
    expect(existingOutlines({ dwellings: [], fields: [] } as unknown as SceneVillage)).toEqual([]);
  });
});
