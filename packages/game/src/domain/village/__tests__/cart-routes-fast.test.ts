import { describe, expect, it } from 'vitest';
import { createRandom, type Random } from '../../landscape/random';
import { CART_ROUTES, CART_SPEED } from '../rules';
import { cartRoutesOn, type CartGrid, type CartTarget } from '../paths/cart';
import type { PathPoint } from '../paths/network';
import type { CartKind } from '../types';
import { referenceCartRoutesOn } from './fixtures/cart-routes-reference';

// Rychlejší hledání tras vozu (docs/code/village-roads.md – Trasy v paměti): typovaná pole,
// opakovaná pole s razítkem běhu a konec hledání, když zbylé cíle leží mimo dosažitelnou část
// mřížky – výsledek bit po bitu týž jako původní hledání (stejné body, buňky, cena, délka, remízy).

const CELL_M = 3.75;

/** Náhodná mřížka vozu – povrch, neprůjezdná místa, výšky (i strmé) a pevné cesty. */
function randomGrid(r: Random, variant: number): CartGrid {
  const width = 12 + Math.floor(r.next() * 44);
  const height = 12 + Math.floor(r.next() * 44);
  const all = width * height;
  const cost = new Float32Array(all);
  // varianta 0: rovná louka se samými remízami; 1: pestrý povrch; 2: drahý povrch (mez maxCost)
  const blockedShare = variant === 0 ? 0.05 : 0.08 + r.next() * 0.25;
  const surfaces = [1, 1, 1, 1 / CART_SPEED.wet, CART_ROUTES.fordCost, 1 / CART_SPEED.field, 2.5];
  for (let c = 0; c < all; c++) {
    if (r.next() < blockedShare) cost[c] = Infinity;
    else if (variant === 0) cost[c] = 1;
    else if (variant === 2) cost[c] = 20 + Math.floor(r.next() * 40);
    else cost[c] = surfaces[Math.floor(r.next() * surfaces.length)]!;
  }
  // souvislé zdi s mezerami – oddělené kusy mřížky (nedosažitelné cíle)
  const walls = Math.floor(r.next() * 3);
  for (let wall = 0; wall < walls; wall++) {
    const vertical = r.next() < 0.5;
    const at = Math.floor(r.next() * (vertical ? width : height));
    const gap = r.next() < 0.5 ? -1 : Math.floor(r.next() * (vertical ? height : width));
    const len = vertical ? height : width;
    for (let q = 0; q < len; q++) {
      if (q === gap) continue;
      cost[vertical ? q * width + at : at * width + q] = Infinity;
    }
  }
  let heights: Float32Array | null = null;
  if (variant !== 0 && r.next() < 0.8) {
    heights = new Float32Array(all);
    const slopeI = (r.next() - 0.5) * 0.6;
    const slopeJ = (r.next() - 0.5) * 0.6;
    const noise = r.next() * 0.8;
    for (let c = 0; c < all; c++) {
      const i = c % width;
      const j = Math.floor(c / width);
      heights[c] = (i * slopeI + j * slopeJ) * CELL_M * 0.1 + r.next() * noise;
    }
  }
  const grid: CartGrid = {
    width,
    height,
    originX: -60 + Math.floor(r.next() * 8) * CELL_M,
    originZ: -45 + Math.floor(r.next() * 8) * CELL_M,
    cellM: CELL_M,
    cost,
    heights,
  };
  if (r.next() < 0.5) {
    // pevná cesta: lomená čára přes mřížku, levnější a sjízdná i přes neprůjezdné
    const road = new Uint8Array(all);
    let i = Math.floor(r.next() * width);
    let j = 0;
    while (j < height) {
      const c = j * width + i;
      road[c] = 1;
      cost[c] = 1 / CART_SPEED.road.improved;
      if (r.next() < 0.6) j++;
      else i = Math.min(width - 1, Math.max(0, i + (r.next() < 0.5 ? -1 : 1)));
    }
    grid.road = road;
  }
  return grid;
}

const point = (r: Random, g: CartGrid): PathPoint => ({
  x: g.originX + r.next() * (g.width - 1) * g.cellM,
  z: g.originZ + r.next() * (g.height - 1) * g.cellM,
});

describe('cartRoutesOn – rychlé hledání', () => {
  it('na 50 náhodných mapách dá bit po bitu totéž co původní hledání', () => {
    const r = createRandom(20261026);
    let reached = 0;
    let unreached = 0;
    for (let map = 0; map < 50; map++) {
      const grid = randomGrid(r, map % 3);
      const kind: CartKind = r.next() < 0.5 ? 'two-wheel' : 'four-wheel';
      const depots = Array.from({ length: 1 + Math.floor(r.next() * 3) }, () => point(r, grid));
      const reaches = [0.5, 2, 4, 8, 15];
      const targets: CartTarget[] = Array.from({ length: 1 + Math.floor(r.next() * 30) }, () => ({
        ...point(r, grid),
        reachM: reaches[Math.floor(r.next() * reaches.length)]!,
      }));
      // týž cíl dvakrát – sdílené buňky cílů
      if (targets.length > 2) targets.push({ ...targets[1]! });
      const input = { kind, depots, targets };
      const expected = referenceCartRoutesOn(grid, input);
      expect(cartRoutesOn(grid, input), `mapa ${map}`).toEqual(expected);
      // podruhé po téže mřížce (opakovaná pole s razítkem) i po kouscích cílů
      expect(cartRoutesOn(grid, input), `mapa ${map} podruhé`).toEqual(expected);
      const half = Math.ceil(targets.length / 2);
      expect(cartRoutesOn(grid, { kind, depots, targets: targets.slice(half) })).toEqual(
        expected.slice(half),
      );
      for (const route of expected) {
        if (route.reached) reached++;
        else unreached++;
      }
    }
    // mapy pokrývají dosažené i nedosažitelné cíle
    expect(reached).toBeGreaterThan(200);
    expect(unreached).toBeGreaterThan(20);
  });
});
