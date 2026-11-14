import { describe, it, expect } from 'vitest';
import { DWELLING_FOOTPRINT_M, PLAIN_FRAME, type DwellingType } from '@bohemia/game';
import { DWELLING_EAVES } from '../dwelling-decor';
import { chickenBox } from '../livestock-placement';
import { hideFrameDwellings, hideFramePlacement, hivePlacement } from '../wares-placement';

const TYPES = Object.keys(DWELLING_EAVES) as DwellingType[];
const POSITION = { x: 40, z: -20, rotation: 0.7 };

/** Bod ve světě → souřadnice modelu obydlí (x napříč, z k vchodu). */
function local(x: number, z: number): { lx: number; lz: number } {
  const dx = x - POSITION.x;
  const dz = z - POSITION.z;
  const c = Math.cos(POSITION.rotation);
  const s = Math.sin(POSITION.rotation);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

describe('klát a rám s kůží u obydlí', () => {
  for (const type of TYPES) {
    it(`${type}: klát ani rám neleží v domě ani mezi slepicemi`, () => {
      const box = chickenBox(type, PLAIN_FRAME);
      const { width, depth } = DWELLING_FOOTPRINT_M[type];
      for (const p of [
        hivePlacement(type, PLAIN_FRAME, POSITION),
        hideFramePlacement(type, PLAIN_FRAME, POSITION),
      ]) {
        const { lx, lz } = local(p.x, p.z);
        const inHouse = Math.abs(lx) < width / 2 && Math.abs(lz) < depth / 2;
        const inChickens = Math.abs(lx) < box.halfX && lz > box.minZ && lz < box.maxZ;
        expect(inHouse).toBe(false);
        expect(inChickens).toBe(false);
      }
    });

    it(`${type}: klát stojí u zadního štítu a česno míří ven`, () => {
      const hive = hivePlacement(type, PLAIN_FRAME, POSITION);
      const { lx, lz } = local(hive.x, hive.z);
      expect(lz).toBeLessThan(0);
      expect(lx).toBeLessThan(0);
      // česno (+z modelu) míří do −x obydlí
      const out = local(hive.x + Math.sin(hive.rotationY), hive.z + Math.cos(hive.rotationY));
      expect(out.lx).toBeLessThan(lx);
    });
  }
});

describe('hideFrameDwellings', () => {
  const dwellings = [
    { id: 1 },
    { id: 2, inhabited: false },
    { id: 3 },
    { id: 4, inhabited: false },
    { id: 5 },
  ];

  it('bere obývaná obydlí podle rotace dne', () => {
    // obývaná 1, 3, 5; den 7 → index 1
    expect(hideFrameDwellings(dwellings, 2, 7)).toEqual([3, 5]);
    expect(hideFrameDwellings(dwellings, 2, 8)).toEqual([5, 1]);
    expect(hideFrameDwellings(dwellings, 9, 7)).toEqual([3, 5, 1]);
  });

  it('bez rámů nebo obydlí nic', () => {
    expect(hideFrameDwellings(dwellings, 0, 7)).toEqual([]);
    expect(hideFrameDwellings([{ id: 1, inhabited: false }], 2, 7)).toEqual([]);
  });

  it('je deterministické', () => {
    expect(hideFrameDwellings([...dwellings].reverse(), 2, 7)).toEqual(
      hideFrameDwellings(dwellings, 2, 7),
    );
  });
});
