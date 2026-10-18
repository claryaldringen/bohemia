import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import {
  NEIGHBOUR_ID_BASE,
  distanceToPoints,
  foreignFromScene,
  isNeighbourTarget,
  scenePoints,
  withNeighbourVillages,
} from '../neighbour-villages';

// Stavby jiných vsí na téže mapě ve scéně (migration.md – Vsi na téže mapě).

const dwelling = (id: number, x: number): SceneVillage['dwellings'][number] => ({
  id,
  type: 'zemnice',
  position: { x, z: 0, rotation: 0 },
  built: true,
  progress: 1,
});

const own: SceneVillage = { dwellings: [dwelling(1, 0)], fields: [] };
const withNeighbour: SceneVillage = {
  ...own,
  neighbours: [
    {
      dwellings: [
        dwelling(1, 400),
        {
          ...dwelling(2, 420),
          type: 'polozemnice',
          plot: { cell: { x: 30, y: 10 }, x: 420, z: 0, size: 15, variant: 'center' },
        },
      ],
      fields: [
        {
          id: 7,
          parts: [{ id: 8, cell: { x: 31, y: 11 }, x: 430, z: 15, size: 15, stage: 'ready' }],
        },
      ],
      pens: [
        {
          id: 3,
          cell: { x: 32, y: 10 },
          x: 445,
          z: 0,
          size: 15,
          built: true,
          progress: 1,
          oxen: 0,
          trainees: 0,
          cows: 0,
        },
      ],
      sacredBuildings: [
        { id: 9, kind: 'idol', position: { x: 410, z: 30, rotation: 0 }, built: true, progress: 1 },
      ],
    },
  ],
};

describe('withNeighbourVillages', () => {
  it('stavby jiné vsi přibudou s posunutými id, vlastní zůstanou', () => {
    const drawn = withNeighbourVillages(withNeighbour);
    expect(drawn.dwellings.map((d) => d.id)).toEqual([
      1,
      NEIGHBOUR_ID_BASE + 1,
      NEIGHBOUR_ID_BASE + 2,
    ]);
    expect(drawn.fields[0]).toMatchObject({ id: NEIGHBOUR_ID_BASE + 7 });
    expect(drawn.fields[0]!.parts[0]!.id).toBe(NEIGHBOUR_ID_BASE + 8);
    expect(drawn.pens?.map((p) => p.id)).toEqual([NEIGHBOUR_ID_BASE + 3]);
    expect(drawn.sacred?.buildings.map((b) => b.id)).toEqual([NEIGHBOUR_ID_BASE + 9]);
    expect(withNeighbourVillages(own)).toBe(own);
  });

  it('stavby jiné vsi se nevybírají', () => {
    expect(isNeighbourTarget({ kind: 'dwelling', id: NEIGHBOUR_ID_BASE + 1 })).toBe(true);
    expect(isNeighbourTarget({ kind: 'dwelling', id: 1 })).toBe(false);
    expect(isNeighbourTarget({ kind: 'field', id: NEIGHBOUR_ID_BASE + 7 })).toBe(true);
    expect(isNeighbourTarget({ kind: 'sacred-oak', id: NEIGHBOUR_ID_BASE + 7 })).toBe(false);
  });
});

describe('foreignFromScene a vzdálenost', () => {
  it('cizí půda pro kontrolu umístění: obydlí, pozemky, díly polí, ohrady a modly', () => {
    const foreign = foreignFromScene(withNeighbour)!;
    expect(foreign.dwellings).toHaveLength(2);
    expect(foreign.dwellings[1]!.plot).toEqual({ cell: { x: 30, y: 10 }, variant: 'center' });
    expect(foreign.cells).toEqual([
      { x: 30, y: 10 },
      { x: 31, y: 11 },
      { x: 32, y: 10 },
    ]);
    expect(foreign.sacredBuildings).toEqual([
      { kind: 'idol', position: { x: 410, z: 30, rotation: 0 } },
    ]);
    expect(foreignFromScene(own)).toBeUndefined();
  });

  it('natočené pole, sad a pozemek jiné vsi (fields.md – Natočené stavby) s mřížkou zvlášť', () => {
    const grid = { x: 7.5, z: 7.5, rotation: Math.PI / 6 };
    const turned: SceneVillage = {
      ...own,
      neighbours: [
        {
          dwellings: [
            {
              ...dwelling(2, 420),
              type: 'polozemnice',
              plot: {
                cell: { x: 30, y: 10 },
                x: 421,
                z: 3,
                size: 15,
                variant: 'back-left',
                rotation: Math.PI / 4,
              },
            },
          ],
          fields: [
            {
              id: 7,
              grid,
              parts: [
                {
                  id: 8,
                  cell: { x: 0, y: -1 },
                  x: 0,
                  z: 0,
                  size: 15,
                  rotation: grid.rotation,
                  stage: 'ready',
                },
              ],
            },
          ],
          orchards: [
            {
              id: 4,
              grid,
              squares: [
                {
                  cell: { x: 2, y: 0 },
                  x: 0,
                  z: 0,
                  size: 15,
                  rotation: grid.rotation,
                  planting: 1,
                  growth: 1,
                  fruit: false,
                },
              ],
            },
          ],
        },
      ],
    };
    const foreign = foreignFromScene(turned)!;
    expect(foreign.cells).toEqual([]);
    expect(foreign.squares).toEqual([
      { cell: { x: 0, y: -1 }, grid },
      { cell: { x: 2, y: 0 }, grid },
    ]);
    expect(foreign.dwellings[0]!.plot).toEqual({
      cell: { x: 30, y: 10 },
      variant: 'back-left',
      square: { x: 421, z: 3, rotation: Math.PI / 4 },
    });
    expect(foreignFromScene(withNeighbour)).not.toHaveProperty('squares');
  });

  it('nejbližší stavba vlastní i jiné vsi', () => {
    const points = scenePoints(withNeighbour);
    expect(distanceToPoints({ x: 200, z: 0 }, points)).toBeCloseTo(200, 6);
    expect(distanceToPoints({ x: 400, z: 300 }, points)).toBeCloseTo(270, 0);
    expect(distanceToPoints({ x: 0, z: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});
