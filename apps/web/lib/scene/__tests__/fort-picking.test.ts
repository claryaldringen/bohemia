import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import { pickVillageTarget, targetExists } from '../village-picking';

// Opevnění ve výběru (fortifications.md – Rozhraní): klik na pás nebo těsně u okraje obvodu;
// výběr nese díl nejblíž kliku, zbořený díl je mezera (demolition.md – Opevnění).

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
      // díly po stranách čtverce: 0 jih, 1 východ, 2 sever, 3 západ
      shapes: [
        { index: 0, lengthM: 45, path: [OUTLINE[0]!, OUTLINE[1]!] },
        { index: 1, lengthM: 45, path: [OUTLINE[1]!, OUTLINE[2]!] },
        { index: 2, lengthM: 45, path: [OUTLINE[2]!, OUTLINE[3]!] },
        { index: 3, lengthM: 45, path: [OUTLINE[3]!, OUTLINE[4]!] },
      ],
      corners: { outer: 3, inner: 1.5 },
      looks: [],
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
      bandSegments: [0],
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
  it('pás i těsně vedle okraje vybere opevnění s dílem nejblíž kliku, střed plochy ne', () => {
    expect(pick(20, 0.7)).toEqual({ kind: 'fortification', id: 4, segment: 0 });
    expect(pick(20, -1.5)).toEqual({ kind: 'fortification', id: 4, segment: 0 });
    expect(pick(45, 20)).toEqual({ kind: 'fortification', id: 4, segment: 1 });
    expect(pick(1, 30)).toEqual({ kind: 'fortification', id: 4, segment: 3 });
    expect(pick(22, 22)).toBeNull();
  });

  it('zbořený díl je mezera – klik na něj opevnění nevybere', () => {
    const fort = village.forts![0]!;
    const gap: SceneVillage = {
      ...village,
      forts: [
        {
          ...fort,
          segments: [0, 1, 2, 3].map((index) => ({
            index,
            builtDay: 0,
            state: index === 0 ? 0 : 1,
            ...(index === 0 ? { demolishedDay: 10 } : {}),
          })),
        },
      ],
    };
    const at = (x: number, z: number): ReturnType<typeof pickVillageTarget> =>
      pickVillageTarget(
        gap,
        { origin: { x, y: 50, z }, direction: { x: 0, y: -1, z: 0 } },
        { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
      );
    expect(at(20, 0.7)).toBeNull();
    expect(at(45, 20)).toEqual({ kind: 'fortification', id: 4, segment: 1 });
  });

  it('výběr zanikne s opevněním', () => {
    expect(targetExists(village, { kind: 'fortification', id: 4, segment: 0 })).toBe(true);
    expect(targetExists(village, { kind: 'fortification', id: 5, segment: 0 })).toBe(false);
  });
});
