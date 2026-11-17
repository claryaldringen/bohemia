import { describe, expect, it } from 'vitest';
import { createFog, exploreTrail, fogCell, fogPixels, litCells, FOG_ALPHA } from '../fog-of-war';

// Mlha cizí mapy výjezdu (journey.md – Scéna cizí mapy): stopa rodu (`SeenCell.trail`) odkryje
// mlhu stejným dohledem jako muži – objevené je šeré, v dohledu není.

const explored = (fog: ReturnType<typeof createFog>, x: number, z: number): boolean =>
  fog.explored[fogCell(fog, x, z)] === 1;

describe('exploreTrail – odkrytí ze stopy', () => {
  it('bod stopy odkryje okolí v dohledu, dál ne; v dohledu nic není (šeré)', () => {
    const fog = createFog(1000);
    const done = new Set<string>();
    expect(exploreTrail(fog, [[0, 0]], done)).toBe(1);
    expect(explored(fog, 5, 5)).toBe(true);
    expect(explored(fog, 135, 5)).toBe(true);
    expect(explored(fog, 175, 5)).toBe(false);
    const px = fogPixels(fog, new Uint8Array(fog.size * fog.size));
    expect(px[fogCell(fog, 5, 5) * 4 + 3]).toBe(FOG_ALPHA.explored);
    expect(px[fogCell(fog, 175, 5) * 4 + 3]).toBe(FOG_ALPHA.hidden);
  });

  it('opakovaně jen nové body stopy; z lesa a do lesa kratší dohled', () => {
    const fog = createFog(1000);
    const done = new Set<string>();
    exploreTrail(fog, [[0, 0]], done);
    expect(exploreTrail(fog, [[0, 0]], done)).toBe(0);
    const forest = (x: number): boolean => x > 250;
    expect(
      exploreTrail(
        fog,
        [
          [0, 0],
          [300, 0],
        ],
        done,
        forest,
      ),
    ).toBe(1);
    expect(explored(fog, 335, 5)).toBe(true);
    expect(explored(fog, 375, 5)).toBe(false);
  });
});

describe('litCells – pokračování stezky nad závojem (mapa rodu a vazala)', () => {
  it('pás podél osy závoj nekryje, jinde zůstává; bez pásu nic', () => {
    const fog = createFog(400);
    const band = {
      points: [
        { x: -150, z: 0 },
        { x: 150, z: 0 },
      ],
      halfM: 3,
    };
    const lit = litCells(fog, [band]);
    const px = fogPixels(fog, new Uint8Array(fog.size * fog.size), undefined, lit);
    const alpha = (x: number, z: number): number => px[fogCell(fog, x, z) * 4 + 3]!;
    expect(alpha(0, 0)).toBe(FOG_ALPHA.seen);
    expect(alpha(-140, 2)).toBe(FOG_ALPHA.seen);
    expect(alpha(0, 60)).toBe(FOG_ALPHA.hidden);
    expect(litCells(fog, []).every((v) => v === 0)).toBe(true);
  });
});
