import { describe, it, expect } from 'vitest';
import { detAtan2, detCos, detSin, wrapAngle } from '../det-math';
import { generateLandscape } from '../generate';
import { generateObstacles, obstaclesOf } from '../obstacles/generate';
import {
  obstacleIndex,
  obstacleKind,
  obstacleLook,
  obstacleSpecies,
  obstaclesInTile,
  obstaclesNear,
} from '../obstacles/query';
import { OBSTACLE_SOURCES, obstacleId, type ObstacleLayer } from '../obstacles/types';
import { transferPrecision } from '../quantize';
import type { Landscape } from '../types';
import { tileOfWorldPoint } from '../world';

const landscape = generateLandscape(11);
const layer = generateObstacles(landscape);

/** Shodné vrstvy – stejná id, polohy, druhy, podoby i velikosti. */
function sameLayer(a: ObstacleLayer, b: ObstacleLayer): boolean {
  if (a.count !== b.count) return false;
  for (const key of ['id', 'x', 'z', 'kind', 'look', 'rotation', 'scale', 'impostor'] as const) {
    const left = a[key];
    const right = b[key];
    for (let i = 0; i < a.count; i++) if (left[i] !== right[i]) return false;
  }
  return true;
}

describe('generateObstacles – vrstva překážek', () => {
  it('má desítky tisíc stromů, tisíce keřů a stovky kamenů', () => {
    const count = (kind: string): number => {
      let n = 0;
      for (let i = 0; i < layer.count; i++) if (obstacleKind(layer, i) === kind) n++;
      return n;
    };
    expect(count('tree')).toBeGreaterThan(40_000);
    expect(count('youngTree')).toBeGreaterThan(300);
    expect(count('shrub')).toBeGreaterThan(4_000);
    expect(count('stone')).toBeGreaterThan(100);
    expect(count('snag') + count('fallenTree') + count('stump')).toBeGreaterThan(30);
  });

  it('id rostou (hledání půlením) a každé najde svou překážku', () => {
    for (let i = 1; i < layer.count; i++) expect(layer.id[i]!).toBeGreaterThan(layer.id[i - 1]!);
    for (let i = 0; i < layer.count; i += 97) expect(obstacleIndex(layer, layer.id[i]!)).toBe(i);
    expect(obstacleIndex(layer, 1)).toBe(-1);
  });

  it('stejná krajina = stejná vrstva (i jiný objekt krajiny)', () => {
    const again = generateObstacles({ ...landscape, surface: landscape.surface.slice() });
    expect(sameLayer(again, layer)).toBe(true);
  });

  it('z krajiny s přesností prohlížeče vyjde přesně stejná vrstva jako na serveru', () => {
    expect(sameLayer(generateObstacles(transferPrecision(landscape)), layer)).toBe(true);
  });

  it('jiný seed vrstvy = jiné rozmístění, terén se nemění', () => {
    const other: Landscape = { ...landscape, obstacleLayer: { seed: 99, version: 1 } };
    const otherLayer = generateObstacles(other);
    expect(sameLayer(otherLayer, layer)).toBe(false);
    // počty jsou podobné – mění se rozmístění, ne hustota
    expect(Math.abs(otherLayer.count - layer.count) / layer.count).toBeLessThan(0.05);
  });

  it('index po políčkách obsahuje každou překážku právě jednou, v jejím políčku', () => {
    let total = 0;
    for (let y = 0; y < landscape.size; y++) {
      for (let x = 0; x < landscape.size; x++) {
        for (const i of obstaclesInTile(layer, x, y)) {
          const tile = tileOfWorldPoint(landscape, layer.x[i]!, layer.z[i]!)!;
          expect(tile).toEqual({ x, y });
          total++;
        }
      }
    }
    expect(total).toBe(layer.count);
    const near = obstaclesNear(layer, -20, -20, 20, 20);
    for (const i of near) {
      expect(Math.abs(layer.x[i]!)).toBeLessThan(30 + 1e-3);
      expect(Math.abs(layer.z[i]!)).toBeLessThan(30 + 1e-3);
    }
  });

  it('stromy mají dřevinu, keře a kameny ne; impostory jsou jen dospělé stromy', () => {
    for (let i = 0; i < layer.count; i += 13) {
      const kind = obstacleKind(layer, i);
      const species = obstacleSpecies(layer, i);
      if (kind === 'tree' || kind === 'youngTree') expect(species).not.toBeNull();
      if (kind === 'shrub' || kind === 'stone' || kind === 'outcrop') expect(species).toBeNull();
      if (layer.impostor[i]) expect(kind).toBe('tree');
      expect(obstacleLook(layer, i)).toBeTypeOf('string');
    }
  });

  it('krajina bez vrstvy (ručně vyrobená) nemá překážky', () => {
    const empty = generateObstacles({ ...landscape, obstacleLayer: null });
    expect(empty.count).toBe(0);
    expect(obstaclesInTile(empty, 3, 3).length).toBe(0);
  });

  it('obstaclesOf počítá vrstvu jednou na objekt krajiny', () => {
    expect(obstaclesOf(landscape)).toBe(obstaclesOf(landscape));
  });
});

/** Otisk vrstvy: počet a FNV-1a přes bajty všech sloupců. */
function layerHash(l: ObstacleLayer): string {
  let h = 0x811c9dc5;
  const columns = [l.id, l.x, l.z, l.kind, l.look, l.rotation, l.scale, l.impostor];
  for (const column of columns) {
    const bytes = new Uint8Array(column.buffer, column.byteOffset, column.byteLength);
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
  }
  return `${l.count}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

describe('vrstva překážek verze 1 – zlatý otisk', () => {
  // Vrstva po ostrém spuštění nesmí změnit ani bit (přepsala by krajiny hráčů). Když tenhle
  // test spadne, změnilo se něco, na čem vrstva stojí (rozmisťovače, pole lesa, osa potoka,
  // tvar terénu, det-math, generátor krajiny, simplex-noise…). Před spuštěním stačí otisk
  // vědomě přepsat; po spuštění je potřeba nová verze vrstvy a v1 zachovat.
  it.each([
    [1, '66989:537aa60a'],
    [42, '66959:75f4c88b'],
    [123, '70442:f720e62c'],
  ])('seed %i', (seed, expected) => {
    expect(layerHash(generateObstacles(generateLandscape(seed)))).toBe(expected);
  });
});

describe('obstacleId', () => {
  it('skládá zdroj, buňku a pořadí ve skupině', () => {
    expect(obstacleId('edgeTree', 0)).toBe(OBSTACLE_SOURCES.edgeTree * 2 ** 22);
    expect(obstacleId('stone', 10, 3)).toBe(OBSTACLE_SOURCES.stone * 2 ** 22 + 83);
  });

  it('nepřijme pořadí mimo 0–7 ani buňku, která se nevejde', () => {
    expect(() => obstacleId('pine', 1, 8)).toThrow(RangeError);
    expect(() => obstacleId('pine', 2 ** 20)).toThrow(RangeError);
    expect(() => obstacleId('pine', -1)).toThrow(RangeError);
  });
});

describe('deterministická matematika', () => {
  it('sinus, kosinus a arkustangens odpovídají Math na 1e-9', () => {
    for (let i = -400; i <= 400; i++) {
      const a = i * 0.037;
      expect(Math.abs(detSin(a) - Math.sin(a))).toBeLessThan(1e-9);
      expect(Math.abs(detCos(a) - Math.cos(a))).toBeLessThan(1e-9);
      const y = Math.sin(i * 0.71) * (1 + Math.abs(i % 7));
      const x = Math.cos(i * 1.13) * (1 + Math.abs(i % 5));
      expect(Math.abs(detAtan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-9);
    }
    expect(detAtan2(0, 0)).toBe(0);
  });

  it('úhel se převede do [−π, π]', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-0.5)).toBe(-0.5);
    expect(wrapAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 12);
  });
});
