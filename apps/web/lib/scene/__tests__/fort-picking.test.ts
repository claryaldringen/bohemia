import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { pickVillageTarget, targetExists } from '../village-picking';

// Opevnění ve výběru (fortifications.md – Rozhraní): klik na pás nebo těsně u okraje obvodu.

const OUTLINE: [number, number][] = [
  [0, 0],
  [45, 0],
  [45, 45],
  [0, 45],
  [0, 0],
];

const village: SceneVillage = {
  dwellings: [],
  fields: [],
  forts: [
    {
      id: 4,
      grid: null,
      cells: [],
      kind: 'palisade',
      segments: [],
      gates: [],
      building: false,
      outline: OUTLINE,
      // pás u jižní strany: 1,5 m dovnitř plochy
      band: [
        [
          [0, 0],
          [45, 0],
          [45, 1.5],
          [0, 1.5],
        ],
      ],
    },
  ],
};

const pick = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
  pickVillageTarget(
    village,
    { origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } },
    { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
  );

describe('výběr opevnění', () => {
  it('pás i těsně vedle okraje vybere opevnění, střed plochy ne', () => {
    expect(pick(20, 0.7)).toEqual({ kind: 'fortification', id: 4 });
    expect(pick(20, -1.5)).toEqual({ kind: 'fortification', id: 4 });
    expect(pick(45, 20)).toEqual({ kind: 'fortification', id: 4 });
    expect(pick(22, 22)).toBeNull();
  });

  it('výběr zanikne s opevněním', () => {
    expect(targetExists(village, { kind: 'fortification', id: 4 })).toBe(true);
    expect(targetExists(village, { kind: 'fortification', id: 5 })).toBe(false);
  });
});
