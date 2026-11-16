import { describe, expect, it } from 'vitest';
import { buildForestField, generateLandscape } from '../../landscape';
import type { ClearedForest } from '../../village/core/cleared-forest';
import { forestInterior, withoutClearings } from '../dense-forest';
import type { MarchGeometry } from '../march-grid';
import { WAR } from '../rules-war';

// Mapa 1 se středem v počátku: buňky mřížky pochodu přes celou krajinu o straně `cellM`.
function geometryOf(extent: number, cellM: number): MarchGeometry {
  const width = Math.round(extent / cellM);
  return {
    width,
    height: width,
    originX: -extent / 2 + cellM / 2,
    originZ: -extent / 2 + cellM / 2,
    cellM,
  };
}

describe('forestInterior', () => {
  const landscape = generateLandscape(1);
  const extent = landscape.size * landscape.cellSizeM;

  for (const cellM of [10, 2]) {
    it(`buňka ${cellM} m: 1 právě tam, kde je střed dál než ${WAR.march.denseForestM} m od okraje lesa`, () => {
      const geo = geometryOf(extent, cellM);
      const interior = forestInterior(landscape, geo);
      const field = buildForestField(landscape);
      let dense = 0;
      for (let j = 0; j < geo.height; j++) {
        for (let i = 0; i < geo.width; i++) {
          const d = field.distanceAt(geo.originX + i * cellM, geo.originZ + j * cellM);
          const value = interior[j * geo.width + i];
          if (d > WAR.march.denseForestM) expect(value).toBe(1);
          else expect(value).toBe(0);
          if (value === 1) dense++;
        }
      }
      expect(dense).toBeGreaterThan(0);
    });
  }

  it('podruhé pro tutéž krajinu a velikost buňky tentýž objekt, jiná velikost jiný', () => {
    const geo = geometryOf(extent, 10);
    const first = forestInterior(landscape, geo);
    expect(forestInterior(landscape, geo)).toBe(first);
    expect(forestInterior(landscape, geometryOf(extent, 20))).not.toBe(first);
  });
});

describe('withoutClearings', () => {
  // 100 × 100 buněk po 2 m; středy buněk x = -99 + 2i (liché), z = -99 + 2j
  const geo: MarchGeometry = { width: 100, height: 100, originX: -99, originZ: -99, cellM: 2 };
  const all = new Uint8Array(100 * 100).fill(1);
  // krajina 20 × 20 políček po 10 m: políčko (10, 10) = svět 0–10 m; „15 m“ políčko dává 20 × 15
  const base: Omit<ClearedForest, 'tiles' | 'areas'> = {
    size: 20,
    cellSizeM: 15,
    share: new Float32Array(400),
    mask: new Uint8Array(400),
  };
  const cell = (x: number, z: number): number => ((z + 99) / 2) * 100 + (x + 99) / 2;

  it('bez vymýcených políček a ploch vrátí tentýž objekt', () => {
    expect(withoutClearings(all, geo, { ...base, tiles: [], areas: [] })).toBe(all);
  });

  it('políčko 15 m: do 10 m od něj 0, o buňku dál 1; vstup se nemění', () => {
    // políčko (10, 10) = svět od 0 do 15 m v obou osách (krajina 300 m, střed v počátku)
    const result = withoutClearings(all, geo, { ...base, tiles: [10 * 20 + 10], areas: [] });
    expect(result).not.toBe(all);
    expect(all.every((v) => v === 1)).toBe(true);
    // buňky se středem uvnitř políčka jsou středy 1 … 15; pás 10 m sahá k 25 (a k −9)
    expect(result[cell(7, 7)]).toBe(0);
    expect(result[cell(25, 7)]).toBe(0);
    expect(result[cell(7, -9)]).toBe(0);
    expect(result[cell(7, 25)]).toBe(0);
    expect(result[cell(-9, 7)]).toBe(0);
    // o 2 m dál (12 m od nejbližšího středu) zůstává les
    expect(result[cell(27, 7)]).toBe(1);
    expect(result[cell(7, 27)]).toBe(1);
    expect(result[cell(7, -11)]).toBe(1);
    expect(result[cell(-11, 7)]).toBe(1);
    // diagonála od středu (15, 15): posun 6 m v obou osách (8,5 m) je ještě paseka, 8 m (11,3 m) už ne
    expect(result[cell(21, 21)]).toBe(0);
    expect(result[cell(23, 23)]).toBe(1);
  });

  it('plocha pod stavbou (mnohoúhelník) odebere les do 10 m od ní', () => {
    const area = [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
    ] as const;
    const result = withoutClearings(all, geo, { ...base, tiles: [], areas: [area] });
    expect(result[cell(25, 25)]).toBe(0);
    expect(result[cell(39, 25)]).toBe(0);
    expect(result[cell(41, 25)]).toBe(1);
  });
});
