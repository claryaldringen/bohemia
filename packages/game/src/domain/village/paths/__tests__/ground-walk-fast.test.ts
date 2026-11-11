import { describe, expect, it } from 'vitest';
import { createRandom, type Random } from '../../../landscape/random';
import { ROAD_WALK } from '../../rules';
import { PATH_WATER, PATH_WETLAND, type PathTerrain } from '../terrain';
import { groundWalkLength, type WalkGround } from '../walking';
import { referenceGroundWalkLength } from './fixtures/ground-walk-reference';

// Rychlejší chůze rovně (docs/code/village-roads.md – Trasy v paměti): půda po buňkách a kusy
// úsečky po stejné půdě sečtené bez čtení buněk – výsledek bit po bitu týž jako po krocích.

const CELL_M = 3.75;

/** Náhodná půda: louka s ostrovy mokřiny, vodou (potok) a díly polí (rychlost, osev). */
function randomGround(r: Random, withFields: boolean): WalkGround {
  const width = 20 + Math.floor(r.next() * 60);
  const height = 20 + Math.floor(r.next() * 60);
  const all = width * height;
  const flags = new Uint8Array(all);
  const speed = new Float32Array(all).fill(1);
  const crop = new Uint8Array(all);
  const patch = (fill: (c: number) => void): void => {
    const i0 = Math.floor(r.next() * width);
    const j0 = Math.floor(r.next() * height);
    const size = 1 + Math.floor(r.next() * 12);
    for (let j = j0; j < Math.min(height, j0 + size); j++) {
      for (let i = i0; i < Math.min(width, i0 + size); i++) fill(j * width + i);
    }
  };
  for (let q = 0; q < 6; q++) patch((c) => (flags[c] = flags[c]! | PATH_WETLAND));
  for (let q = 0; q < 3; q++) patch((c) => (flags[c] = flags[c]! | PATH_WATER));
  const speeds = [0.5, 0.8, 1, ROAD_WALK.wetSpeed];
  for (let q = 0; q < 10; q++) {
    const v = speeds[Math.floor(r.next() * speeds.length)]!;
    const sown = r.next() < 0.5 ? 1 : 0;
    patch((c) => {
      speed[c] = v;
      crop[c] = sown;
    });
  }
  // osamělé odlišné buňky – švy uprostřed louky
  for (let q = 0; q < 20; q++) speed[Math.floor(r.next() * all)] = 0.8;
  const terrain: PathTerrain = {
    width,
    height,
    originX: -40 + Math.floor(r.next() * 8) * CELL_M,
    originZ: -30 + Math.floor(r.next() * 8) * CELL_M,
    cellM: CELL_M,
    window: { i0: 0, j0: 0, i1: width - 1, j1: height - 1 },
    cost: new Float32Array(all).fill(1),
    flags,
  };
  return withFields ? { terrain, fields: { speed, crop } } : { terrain };
}

describe('groundWalkLength – půda po buňkách', () => {
  it('na 40 náhodných půdách dá bit po bitu totéž co chůze po krocích', () => {
    const r = createRandom(20261026);
    let calls = 0;
    for (let map = 0; map < 40; map++) {
      const ground = randomGround(r, map % 4 !== 0);
      const t = ground.terrain;
      // body i kus za okrajem mřížky (mimo okno je louka)
      const point = (): { x: number; z: number } => ({
        x: t.originX + (r.next() * 1.4 - 0.2) * t.width * t.cellM,
        z: t.originZ + (r.next() * 1.4 - 0.2) * t.height * t.cellM,
      });
      for (let q = 0; q < 200; q++) {
        const a = point();
        // úsečky po ose, po úhlopříčce i obecně, krátké i přes celou mřížku
        const b =
          q % 5 === 0 ? { x: a.x, z: point().z } : q % 7 === 0 ? { x: point().x, z: a.z } : point();
        const strength = q % 3 === 0 ? 0 : r.next();
        const expected = referenceGroundWalkLength(ground, a, b, strength);
        const actual = groundWalkLength(ground, a, b, strength);
        expect(Object.is(actual, expected), `mapa ${map}, úsečka ${q}`).toBe(true);
        calls++;
      }
      expect(groundWalkLength(ground, { x: 1, z: 2 }, { x: 1, z: 2 })).toBe(0);
    }
    expect(calls).toBe(8000);
  });
});
