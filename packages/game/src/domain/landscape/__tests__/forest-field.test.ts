import { describe, it, expect } from 'vitest';
import { buildForestField } from '../forest-field';
import { generateLandscape } from '../generate';
import { SURFACE_CODES } from '../types';
import { tileCenterWorld } from '../world';

const landscape = generateLandscape(5);
const field = buildForestField(landscape);
const size = landscape.size;
const cell = landscape.cellSizeM;
const half = (size * cell) / 2;
const isForest = (x: number, y: number): boolean =>
  landscape.surface[
    Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))
  ] === SURFACE_CODES.forest;

describe('buildForestField', () => {
  it('uprostřed souvislého lesa je vzdálenost kladná, uprostřed louky záporná', () => {
    let inside = 0;
    let outside = 0;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const around = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => isForest(x + dx, y + dy)));
        const { x: worldX, z: worldZ } = tileCenterWorld(landscape, x, y);
        if (around.every(Boolean)) {
          expect(field.distanceAt(worldX, worldZ)).toBeGreaterThan(4);
          inside++;
        } else if (around.every((f) => !f)) {
          expect(field.distanceAt(worldX, worldZ)).toBeLessThan(-4);
          outside++;
        }
      }
    }
    expect(inside).toBeGreaterThan(100);
    expect(outside).toBeGreaterThan(100);
  });

  it('hranice lesa je zvlněná, ne po hranách políček, a drží se u nich', () => {
    let crossings = 0;
    let offGrid = 0;
    for (let y = 2; y < size - 2; y++) {
      const z = -half + (y + 0.5) * cell;
      let previous = field.distanceAt(-half, z);
      for (let x = -half + 0.5; x < half; x += 0.5) {
        const d = field.distanceAt(x, z);
        if (Math.sign(d) !== Math.sign(previous)) {
          crossings++;
          const tile = Math.floor((x + half) / cell);
          // Hranice smí vést jen tam, kde se do políčka od ní střídá les a nelesní povrch.
          const near = [-1, 0, 1].map((dx) => isForest(tile + dx, y));
          expect(near.some(Boolean) && near.some((f) => !f)).toBe(true);
          const offset = Math.abs(((x + half) % cell) - ((x + half) % cell > cell / 2 ? cell : 0));
          if (offset > 1.5) offGrid++;
        }
        previous = d;
      }
    }
    expect(crossings).toBeGreaterThan(100);
    expect(offGrid / crossings).toBeGreaterThan(0.3);
  });

  it('vzdálenost se mění plynule – sousední body sítě se liší nejvýš o jejich vzdálenost', () => {
    const n = field.resolution;
    const step = (size * cell) / n;
    // Největší skok mezi sousedy – jedno expect místo statisíců (rychlost testu).
    let worst = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = field.distance[j * n + i]!;
        worst = Math.max(worst, Math.abs(field.distance[j * n + i + 1]! - a));
        if (j < n - 1) worst = Math.max(worst, Math.abs(field.distance[(j + 1) * n + i]! - a));
      }
    }
    expect(worst).toBeLessThanOrEqual(step * 1.5);
  });

  it('pole je deterministické (i bez mezipaměti – nové pole povrchu)', () => {
    const again = buildForestField({ ...landscape, surface: landscape.surface.slice() }).distance;
    expect(again).not.toBe(field.distance);
    let differences = 0;
    for (let i = 0; i < again.length; i++) if (again[i] !== field.distance[i]) differences++;
    expect(differences).toBe(0);
  });

  it('stejný povrch = stejné pole z mezipaměti', () => {
    expect(buildForestField({ ...landscape })).toBe(field);
  });

  it('bez zapamatování se pole do mezipaměti neuloží (vrstva překážek na serveru)', () => {
    const other = { ...landscape, surface: landscape.surface.slice() };
    const once = buildForestField(other, { remember: false });
    expect(buildForestField(other, { remember: false })).not.toBe(once);
    const remembered = buildForestField(other);
    expect(buildForestField(other, { remember: false })).toBe(remembered);
  });
});
