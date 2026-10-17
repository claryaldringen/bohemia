// Společná ves a terén pro testy domácích zvířat (livestock-placement, livestock-motion).
import type { LivestockGround, LivestockVillage } from '../livestock-placement';

/** Louka všude kolem, potok v pásu z ∈ (150, 170), les od x = 85 (prasata do x = 105). */
export const GROUND: LivestockGround = {
  pasture: (x, z) => Math.abs(x) < 400 && Math.abs(z) < 400 && !(z > 150 && z < 170) && x < 80,
  forestEdge: (x, z) => x >= 85 && x <= 105 && Math.abs(z) < 400,
  walkable: (x, z) => !(z > 150 && z < 170),
};

export const dwelling = (
  id: number,
  type: 'zemnice' | 'polozemnice',
  x: number,
  z: number,
  extra: { built?: boolean; inhabited?: boolean; rotation?: number } = {},
): LivestockVillage['dwellings'][number] => ({
  id,
  type,
  position: { x, z, rotation: extra.rotation ?? 0 },
  built: extra.built ?? true,
  inhabited: extra.inhabited,
});

const square = (x: number, z: number): { x: number; z: number; size: number } => ({
  x,
  z,
  size: 15,
});

export const VILLAGE: LivestockVillage = {
  dwellings: [
    dwelling(1, 'zemnice', 0, 0),
    dwelling(2, 'polozemnice', 14, 2, { rotation: 0.4 }),
    dwelling(3, 'zemnice', -12, 6, { rotation: Math.PI }),
    dwelling(4, 'polozemnice', 3, -14, { rotation: -1.2 }),
  ],
  fields: [{ parts: [square(37.5, 0), square(37.5, 15), square(52.5, 0)] }],
  cemeteries: [{ squares: [square(-37.5, -22.5)] }],
};

export const inSquares = (village: LivestockVillage, x: number, z: number): boolean =>
  [
    ...village.fields.flatMap((f) => f.parts),
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
  ].some((s) => Math.abs(x - s.x) < s.size / 2 && Math.abs(z - s.z) < s.size / 2);
