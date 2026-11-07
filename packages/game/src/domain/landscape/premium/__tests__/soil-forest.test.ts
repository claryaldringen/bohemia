// Typy půdy a lesa (premium-landscapes.md – Typy krajin): co průchod udělá s krajinou proti
// průměrné krajině téhož seedu a jaké prvky typu vrátí. Hodnoty z plánu (návrh Clauda).
import { describe, expect, it } from 'vitest';
import { NEAR_SITE_RADIUS_CELLS } from '../../band';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { distanceToMask } from '../../grid';
import { obstaclesOf } from '../../obstacles/generate';
import { obstacleIndex, obstacleKind, obstacleSpecies } from '../../obstacles/query';
import { OBSTACLE_SOURCES } from '../../obstacles/types';
import { transferPrecision } from '../../quantize';
import { buildRelief } from '../../relief';
import { CURRENT_LAYER_VERSIONS, SURFACE_CODES, type Landscape } from '../../types';
import { tileCenterWorld, tileOfWorldPoint } from '../../world';
import { sacredSitesOf } from '../../../village/sacred';
import { premiumFeaturesOf } from '../generate';
import type { PremiumSite, PremiumSiteKind, PremiumType } from '../types';

/** Přijatá prémiová krajina a průměrná krajina z téhož (přijatého) seedu pokusu. */
interface Pair {
  readonly premium: Landscape;
  readonly average: Landscape;
}

const pairCache = new Map<string, readonly Pair[]>();

function pairs(type: PremiumType, count: number): readonly Pair[] {
  const key = `${type}|${count}`;
  const cached = pairCache.get(key);
  if (cached) return cached;
  const result = Array.from({ length: count }, (_, i): Pair => {
    const accepted = generateAcceptedLandscape(i + 1, CURRENT_LAYER_VERSIONS, type);
    return {
      premium: accepted.landscape,
      average: generateLandscapeAttempt(accepted.seed, CURRENT_LAYER_VERSIONS),
    };
  });
  pairCache.set(key, result);
  return result;
}

const LANDSCAPE_SAMPLE = 16;
/** Vrstva překážek trvá stovky ms – u typů lesa méně seedů. */
const OBSTACLE_SAMPLE = 8;
const TIMEOUT_MS = 120_000;
const HA = 10_000;

const village = (l: Landscape): { x: number; z: number } =>
  tileCenterWorld(l, l.villageSite.x, l.villageSite.y);

/** Vzdálenost políčka od místa pro vesnici (políčka). */
const tileDistance = (l: Landscape, i: number): number =>
  Math.hypot((i % l.size) - l.villageSite.x, Math.floor(i / l.size) - l.villageSite.y);

function sitesOf(l: Landscape, kind: PremiumSiteKind): readonly PremiumSite[] {
  const features = premiumFeaturesOf(l);
  expect(features).not.toBeNull();
  return features!.sites.filter((s) => s.kind === kind);
}

/** Plocha mnohoúhelníku (m²). */
function area(points: readonly (readonly [number, number])[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    twice += ax * bz - bx * az;
  }
  return Math.abs(twice) / 2;
}

function inside(points: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) result = !result;
  }
  return result;
}

function count(l: Landscape, test: (i: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < l.surface.length; i++) if (test(i)) n++;
  return n;
}

const isNear = (l: Landscape, i: number): boolean => tileDistance(l, i) <= NEAR_SITE_RADIUS_CELLS;
const nearMeadow = (l: Landscape): number =>
  count(l, (i) => isNear(l, i) && l.surface[i] === SURFACE_CODES.meadow);
const forestShare = (l: Landscape): number =>
  count(l, (i) => l.surface[i] === SURFACE_CODES.forest) / l.surface.length;

/** Podíl dubu a buku mezi dospělými stromy na políčkách lesa do `radiusM` od vsi. */
function oakBeechShare(l: Landscape, radiusM: number): number {
  const layer = obstaclesOf(l);
  const c = village(l);
  let all = 0;
  let oakBeech = 0;
  for (let i = 0; i < layer.count; i++) {
    if (obstacleKind(layer, i) !== 'tree') continue;
    const x = layer.x[i]!;
    const z = layer.z[i]!;
    if (Math.hypot(x - c.x, z - c.z) > radiusM) continue;
    const tile = tileOfWorldPoint(l, x, z)!;
    if (l.surface[tile.y * l.size + tile.x] !== SURFACE_CODES.forest) continue;
    all++;
    const species = obstacleSpecies(layer, i);
    if (species === 'oak' || species === 'beech') oakBeech++;
  }
  return oakBeech / all;
}

/** Stromy, které se nikdy nekácí (posvátné duby, stromy hájů – `protectedTrees`), do 600 m od vsi. */
function protectedNearVillage(l: Landscape): number {
  const layer = obstaclesOf(l);
  const c = village(l);
  let n = 0;
  for (const id of sacredSitesOf(layer).protectedTrees) {
    const i = obstacleIndex(layer, id);
    if (Math.hypot(layer.x[i]! - c.x, layer.z[i]! - c.z) <= 600) n++;
  }
  return n;
}

describe('fertile – velmi úrodná krajina', () => {
  it(
    'úrodnost do 600 m je v průměru aspoň o 12 vyšší než v průměrné krajině téhož seedu',
    () => {
      for (const { premium, average } of pairs('fertile', LANDSCAPE_SAMPLE)) {
        let sumPremium = 0;
        let sumAverage = 0;
        let cells = 0;
        for (let i = 0; i < premium.surface.length; i++) {
          if (!isNear(premium, i) || premium.surface[i] === SURFACE_CODES.water) continue;
          sumPremium += premium.fertility[i]!;
          sumAverage += average.fertility[i]!;
          cells++;
        }
        expect(sumPremium / cells - sumAverage / cells).toBeGreaterThanOrEqual(12);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'mění jen úrodnost – nikde ji nesníží, dál než 750 m je stejná',
    () => {
      for (const { premium, average } of pairs('fertile', LANDSCAPE_SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        expect(premium.surface).toEqual(average.surface);
        expect(premium.stream).toEqual(average.stream);
        for (let i = 0; i < premium.fertility.length; i++) {
          expect(premium.fertility[i]!).toBeGreaterThanOrEqual(average.fertility[i]!);
          expect(premium.fertility[i]!).toBeLessThanOrEqual(100);
          if (tileDistance(premium, i) > 50) {
            expect(premium.fertility[i]).toBe(average.fertility[i]);
          }
        }
      }
    },
    TIMEOUT_MS,
  );

  it('prvek louka – obrys 600 m kolem vsi', () => {
    const { premium } = pairs('fertile', LANDSCAPE_SAMPLE)[0]!;
    const [meadow, ...rest] = sitesOf(premium, 'meadow');
    expect(rest).toEqual([]);
    const c = village(premium);
    expect(meadow!.x).toBe(c.x);
    expect(meadow!.z).toBe(c.z);
    expect(inside(meadow!.outline!, c.x, c.z)).toBe(true);
    for (const [x, z] of meadow!.outline!) {
      expect(Math.hypot(x - c.x, z - c.z)).toBeLessThanOrEqual(600 + 1e-6);
    }
    expect(area(meadow!.outline!)).toBeGreaterThan(0.5 * Math.PI * 600 * 600);
  });
});

describe('oak-beech – doubravy a bučiny', () => {
  it(
    'dub a buk tvoří do 900 m aspoň 80 % stromů lesa (v průměrné krajině méně)',
    () => {
      for (const { premium, average } of pairs('oak-beech', OBSTACLE_SAMPLE)) {
        expect(oakBeechShare(premium, 900)).toBeGreaterThanOrEqual(0.8);
        expect(oakBeechShare(average, 900)).toBeLessThan(0.8);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'krajina je jako průměrná, ve vrstvě překážek se jedle a bříza u vsi mění na buk, duby zůstanou',
    () => {
      for (const { premium, average } of pairs('oak-beech', OBSTACLE_SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        expect(premium.surface).toEqual(average.surface);
        expect(premium.fertility).toEqual(average.fertility);
        const a = obstaclesOf(premium);
        const b = obstaclesOf(average);
        expect(a.id).toEqual(b.id);
        expect(a.x).toEqual(b.x);
        expect(a.z).toEqual(b.z);
        expect(a.kind).toEqual(b.kind);
        expect(a.scale).toEqual(b.scale);
        const c = village(premium);
        let changed = 0;
        for (let i = 0; i < a.count; i++) {
          // Duby jsou tytéž stromy jako v průměrné krajině (posvátné duby a háje se nemnoží).
          expect(obstacleSpecies(a, i) === 'oak').toBe(obstacleSpecies(b, i) === 'oak');
          if (a.look[i] === b.look[i]) continue;
          changed++;
          // Dřevina se mění jen do 1000 m od vsi (900 m naplno, pak plynule zpět), jedle
          // a bříza na buk.
          expect(Math.hypot(a.x[i]! - c.x, a.z[i]! - c.z)).toBeLessThanOrEqual(1000);
          expect(['fir', 'birch']).toContain(obstacleSpecies(b, i));
          expect(obstacleSpecies(a, i)).toBe('beech');
        }
        expect(changed).toBeGreaterThan(1000);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'chráněných stromů (posvátné duby a háje) do 600 m je nejvýš 1,5× víc než v průměrné krajině',
    () => {
      for (const { premium, average } of pairs('oak-beech', OBSTACLE_SAMPLE)) {
        expect(protectedNearVillage(premium)).toBeLessThanOrEqual(
          1.5 * protectedNearVillage(average),
        );
      }
    },
    TIMEOUT_MS,
  );

  it('prvek les – obrys 900 m kolem vsi', () => {
    const { premium } = pairs('oak-beech', OBSTACLE_SAMPLE)[0]!;
    const [woodland, ...rest] = sitesOf(premium, 'woodland');
    expect(rest).toEqual([]);
    const c = village(premium);
    expect(inside(woodland!.outline!, c.x, c.z)).toBe(true);
    for (const [x, z] of woodland!.outline!) {
      expect(Math.hypot(x - c.x, z - c.z)).toBeLessThanOrEqual(900 + 1e-6);
    }
  });
});

describe('floodplain – rozsáhlé nivní louky', () => {
  it(
    'louky do 600 m je aspoň 1,25× víc než v průměrné krajině téhož seedu',
    () => {
      for (const { premium, average } of pairs('floodplain', LANDSCAPE_SAMPLE)) {
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(1.25 * nearMeadow(average));
      }
    },
    TIMEOUT_MS,
  );

  it(
    'v pásu ±60 m od potoka není les, terén je beze změny',
    () => {
      for (const { premium, average } of pairs('floodplain', LANDSCAPE_SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        const water = premium.surface.map((v) => (v === SURFACE_CODES.water ? 1 : 0));
        const waterDistance = distanceToMask(water, premium.size);
        for (let i = 0; i < premium.surface.length; i++) {
          if (waterDistance[i]! <= 4) expect(premium.surface[i]).not.toBe(SURFACE_CODES.forest);
        }
      }
    },
    TIMEOUT_MS,
  );

  it(
    'les ubraný nivou doroste na suchých loukách daleko od vsi – podíl lesa skoro stejný',
    () => {
      // Obvykle stejný; když suché louky daleko od vsi nestačí, nejvýš o 0,04 nižší (pásmo pak
      // hlídá dolní mez podílu lesa).
      for (const { premium, average } of pairs('floodplain', LANDSCAPE_SAMPLE)) {
        const change = forestShare(premium) - forestShare(average);
        expect(change).toBeGreaterThanOrEqual(-0.04);
        expect(change).toBeLessThanOrEqual(0.005);
      }
    },
    TIMEOUT_MS,
  );

  it('prvek louka – osa nivy podél potoka', () => {
    const { premium } = pairs('floodplain', LANDSCAPE_SAMPLE)[0]!;
    const [meadow, ...rest] = sitesOf(premium, 'meadow');
    expect(rest).toEqual([]);
    expect(meadow!.line!.length).toBe(premium.stream.length);
    const [x, z] = meadow!.line![0]!;
    const first = premium.stream[0]!;
    const half = (premium.size * premium.cellSizeM) / 2;
    // Osa potoka s přesností prohlížeče (Float32) – na milimetry stejná.
    expect(x).toBeCloseTo(-half + (first.x + 0.5) * premium.cellSizeM, 2);
    expect(z).toBeCloseTo(-half + (first.y + 0.5) * premium.cellSizeM, 2);
  });
});

/** Sklon 5–15 % ke slunci (±45° od směru ke slunci) na políčku – nezávisle na průchodu. */
function sunSlopeTiles(l: Landscape): Uint8Array {
  const relief = buildRelief(transferPrecision(l));
  const mask = new Uint8Array(l.size * l.size);
  for (let i = 0; i < mask.length; i++) {
    const c = tileCenterWorld(l, i % l.size, Math.floor(i / l.size));
    const slope = relief.slopeAt(c.x, c.z);
    const sunward = relief.sunwardAt(c.x, c.z);
    mask[i] = slope >= 0.05 && slope <= 0.15 && sunward >= slope * Math.SQRT1_2 ? 1 : 0;
  }
  return mask;
}

describe('south-slopes – teplé jižní svahy', () => {
  it(
    "prvek 'slope' má plochu aspoň 2 ha do 500 m od vsi",
    () => {
      for (const { premium } of pairs('south-slopes', LANDSCAPE_SAMPLE)) {
        const [slope, ...rest] = sitesOf(premium, 'slope');
        expect(rest).toEqual([]);
        expect(area(slope!.outline!)).toBeGreaterThanOrEqual(2 * HA);
        const c = village(premium);
        // Políčka do 500 m – rohy políček nejvýš o půl úhlopříčky dál.
        for (const [x, z] of slope!.outline!) {
          expect(Math.hypot(x - c.x, z - c.z)).toBeLessThanOrEqual(500 + 7.5 * Math.SQRT2);
        }
      }
    },
    TIMEOUT_MS,
  );

  it(
    'svah je louka se sklonem 5–15 % ke slunci',
    () => {
      for (const { premium } of pairs('south-slopes', LANDSCAPE_SAMPLE)) {
        const [slope] = sitesOf(premium, 'slope');
        const sun = sunSlopeTiles(premium);
        let tiles = 0;
        let warmMeadow = 0;
        for (let i = 0; i < premium.surface.length; i++) {
          const c = tileCenterWorld(premium, i % premium.size, Math.floor(i / premium.size));
          if (!inside(slope!.outline!, c.x, c.z)) continue;
          tiles++;
          if (sun[i] && premium.surface[i] === SURFACE_CODES.meadow) warmMeadow++;
        }
        expect(tiles * 225).toBeGreaterThanOrEqual(2 * HA);
        expect(warmMeadow / tiles).toBeGreaterThanOrEqual(0.8);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'les ze slunného svahu ustoupí na odvrácené svahy – louky do 600 m a podíl lesa skoro stejné',
    () => {
      for (const { premium, average } of pairs('south-slopes', LANDSCAPE_SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        expect(premium.fertility).toEqual(average.fertility);
        expect(Math.abs(nearMeadow(premium) / nearMeadow(average) - 1)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.005);
      }
    },
    TIMEOUT_MS,
  );
});

describe('game-furs – hojná zvěř a kožešiny', () => {
  it(
    "prvek 'hunting-ground' má obrys aspoň 60 ha",
    () => {
      for (const { premium } of pairs('game-furs', LANDSCAPE_SAMPLE)) {
        const [ground, ...rest] = sitesOf(premium, 'hunting-ground');
        expect(rest).toEqual([]);
        expect(area(ground!.outline!)).toBeGreaterThanOrEqual(60 * HA);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'honitba je souvislý les za dosahem polí, u potoka s mokřadem',
    () => {
      for (const { premium } of pairs('game-furs', LANDSCAPE_SAMPLE)) {
        const [ground] = sitesOf(premium, 'hunting-ground');
        const c = village(premium);
        for (const [x, z] of ground!.outline!) {
          expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThanOrEqual(600 - 7.5 * Math.SQRT2);
        }
        // Les uvnitř obrysu: aspoň 60 ha políček lesa.
        let forest = 0;
        for (let i = 0; i < premium.surface.length; i++) {
          if (premium.surface[i] !== SURFACE_CODES.forest) continue;
          const t = tileCenterWorld(premium, i % premium.size, Math.floor(i / premium.size));
          if (inside(ground!.outline!, t.x, t.z)) forest++;
        }
        expect(forest * 225).toBeGreaterThanOrEqual(60 * HA);
        // Mokřad: úsek osy potoka podél honitby, aspoň 200 m.
        const line = ground!.line!;
        let length = 0;
        for (let i = 1; i < line.length; i++) {
          length += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
        }
        expect(length).toBeGreaterThanOrEqual(200);
        const half = (premium.size * premium.cellSizeM) / 2;
        const axis = premium.stream.map((p) => [
          -half + (p.x + 0.5) * premium.cellSizeM,
          -half + (p.y + 0.5) * premium.cellSizeM,
        ]);
        // Osa potoka s přesností prohlížeče (Float32) – na milimetry stejná.
        for (const [x, z] of line) {
          expect(axis.some(([ax, az]) => Math.hypot(ax! - x, az! - z) < 0.01)).toBe(true);
        }
      }
    },
    TIMEOUT_MS,
  );
});

describe('wild-bees – brtě a lesní včely', () => {
  it(
    "aspoň 12 brtí ('bee-trees') do 900 m od vsi",
    () => {
      for (const { premium } of pairs('wild-bees', OBSTACLE_SAMPLE)) {
        const bees = sitesOf(premium, 'bee-trees');
        expect(bees.length).toBeGreaterThanOrEqual(12);
        const c = village(premium);
        for (const bee of bees) {
          expect(Math.hypot(bee.x - c.x, bee.z - c.z)).toBeLessThanOrEqual(900);
        }
      }
    },
    TIMEOUT_MS,
  );

  it(
    'každá brť je starý dub ve vrstvě překážek a kolem ní je volno',
    () => {
      for (const { premium, average } of pairs('wild-bees', OBSTACLE_SAMPLE)) {
        expect(premium.surface).toEqual(average.surface);
        expect(premium.fertility).toEqual(average.fertility);
        const layer = obstaclesOf(premium);
        for (const bee of sitesOf(premium, 'bee-trees')) {
          const near: number[] = [];
          for (let i = 0; i < layer.count; i++) {
            if (Math.hypot(layer.x[i]! - bee.x, layer.z[i]! - bee.z) < 6) near.push(i);
          }
          expect(near.length).toBe(1);
          const i = near[0]!;
          expect(layer.x[i]).toBe(Math.fround(bee.x));
          expect(layer.z[i]).toBe(Math.fround(bee.z));
          expect(obstacleKind(layer, i)).toBe('tree');
          expect(obstacleSpecies(layer, i)).toBe('oak');
          expect(layer.scale[i]!).toBeGreaterThanOrEqual(1.2);
          expect(Math.floor(layer.id[i]! / 4_194_304)).toBe(OBSTACLE_SOURCES.beeTree);
        }
        const plain = obstaclesOf(average);
        for (let i = 0; i < plain.count; i++) {
          expect(Math.floor(plain.id[i]! / 4_194_304)).not.toBe(OBSTACLE_SOURCES.beeTree);
        }
      }
    },
    TIMEOUT_MS,
  );
});
