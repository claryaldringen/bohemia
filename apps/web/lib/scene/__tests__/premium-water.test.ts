import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscape,
  generateLandscapeAttempt,
  riverCenterline,
  streamCenterline,
} from '@bohemia/game';
import { decorPlacements } from '../decor-placement';
import { fishSchools } from '../fauna-placement';
import { buildRenderSurface, RENDER_SUBDIVISION } from '../render-surface';

// Řeka prémiových krajin jde ve scéně stejnou cestou jako potok (premium-landscapes.md – Vzhled):
// voda, koryto, břehy, rákos, ryby; koryto řeky je hlubší. Průměrná krajina beze změny – hlídají
// testy výškové sítě, ozdob a ryb potoka.

const withRiver = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'navigable-river');
const surface = buildRenderSurface(withRiver);
const river = riverCenterline(withRiver)!;

describe('řeka ve scéně', () => {
  it('výšková síť zná řeku: hladina nad osou řeky, koryto hlubší než potok', () => {
    expect(surface.river).not.toBeNull();
    const depths: number[] = [];
    const n = surface.resolution;
    const origin = surface.position(0);
    const step = withRiver.cellSizeM / RENDER_SUBDIVISION;
    for (const p of river.points.filter((_, k) => k % 10 === 5)) {
      const i = Math.round((p.x - origin.x) / step);
      const j = Math.round((p.z - origin.z) / step);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const v = j * n + i;
      expect(Number.isFinite(surface.waterLevel[v]!)).toBe(true);
      if (p.shallow === 0) depths.push(surface.waterLevel[v]! - surface.heights[v]!);
    }
    depths.sort((a, b) => a - b);
    // hlubší než běžný úsek potoka (1 m) – uprostřed koryta řeky ≈ 2 m
    expect(depths[Math.floor(depths.length / 2)]!).toBeGreaterThan(1.5);
  });

  it('dotazy na vodu scény berou potok i řeku, body osy jsou potoka', () => {
    const p = river.points[Math.floor(river.points.length / 2)]!;
    expect(surface.stream.nearest(p.x, p.z).bankDistance).toBeLessThan(0);
    expect(surface.stream.points).toEqual(streamCenterline(withRiver).points);
  });

  it('rákos a lekníny i podél řeky (stanice řeky), potok má své jako bez řeky', () => {
    const streamOnly = decorPlacements(withRiver, surface.stream);
    const both = decorPlacements(withRiver, surface.stream, surface.rivers);
    expect(both.slice(0, streamOnly.length)).toEqual(streamOnly);
    const alongRiver = both.slice(streamOnly.length);
    expect(
      alongRiver.filter((d) => d.model === 'reeds' || d.model === 'cattails').length,
    ).toBeGreaterThan(100);
    for (const d of alongRiver) {
      expect(river.nearest(d.worldX, d.worldZ, 60).bankDistance).toBeLessThan(4);
    }
  });

  it('ryby smí i do řeky (proud řeky není nad mez ryb), hejn nejvýš jako dřív', () => {
    const schools = fishSchools(surface);
    expect(schools.length).toBeGreaterThan(0);
    expect(schools.length).toBeLessThanOrEqual(7);
  });
});

describe('horský průsmyk – vnější svah u okraje mapy', () => {
  it('vnější svah dobíhá k okraji už v generátoru – scéna kreslí okraj podle dat, hřeben zůstane', () => {
    const pass = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'mountain-pass');
    const plain = generateLandscapeAttempt(
      generateAcceptedLandscape(42, CURRENT_LAYER_VERSIONS, 'mountain-pass').seed,
      CURRENT_LAYER_VERSIONS,
    );
    const scene = buildRenderSurface(pass);
    const n = scene.resolution;
    const size = pass.size;
    // okraj mapy v datech jako v průměrné krajině (hora za okrajem nekončí stěnou)
    for (let k = 0; k < size; k++) {
      for (const i of [k * size, k * size + size - 1, k, (size - 1) * size + k]) {
        expect(pass.heights[i]).toBe(plain.heights[i]);
      }
    }
    // scéna okraj nemění – střed krajního políčka v datech = krajní bod sítě (mimo vodu)
    for (let k = 0; k < size; k += 9) {
      const v = k * RENDER_SUBDIVISION * n;
      if (Number.isFinite(scene.waterLevel[v]!)) continue;
      expect(scene.heights[v]).toBeCloseTo(pass.heights[k * size]!, 4);
    }
    // hřeben dál od okraje zůstane – nejvyšší místo scény jako v datech
    const top = (a: Float32Array): number => a.reduce((m, h) => Math.max(m, h), -Infinity);
    expect(top(scene.heights)).toBeGreaterThan(top(pass.heights) - 1);
    expect(top(pass.heights)).toBeGreaterThan(top(plain.heights) + 30);
  });

  it('průměrná krajina téhož seedu okraje nemění', () => {
    const plain = generateLandscape(42);
    const scene = buildRenderSurface(plain);
    const n = scene.resolution;
    // střed krajního políčka v datech = krajní bod sítě scény (mimo vodu)
    for (let k = 0; k < plain.size; k += 9) {
      const v = k * RENDER_SUBDIVISION * n;
      if (Number.isFinite(scene.waterLevel[v]!)) continue;
      expect(scene.heights[v]).toBeCloseTo(plain.heights[k * plain.size]!, 4);
    }
  });
});

describe('louky prémiové krajiny v povrchu terénu', () => {
  it('úrodná krajina: u vsi bez suché trávy, víc květů a syté trávy, dál beze změny', async () => {
    const { groundWeights, GROUND_LAYERS } = await import('../ground-layers');
    const { premiumMeadow } = await import('../premium-sites-layout');
    const { premiumFeaturesOf } = await import('@bohemia/game');
    const fertile = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'fertile');
    const stream = streamCenterline(fertile);
    const plain = groundWeights(fertile, stream);
    const tweak = premiumMeadow(fertile, premiumFeaturesOf(fertile));
    const lush = groundWeights(fertile, stream, undefined, tweak);
    const res = plain.resolution;
    const half = (fertile.size * fertile.cellSizeM) / 2;
    const texel = (x: number, z: number): number =>
      Math.floor(((z + half) / (2 * half)) * res) * res +
      Math.floor(((x + half) / (2 * half)) * res);
    const v = {
      x: -half + (fertile.villageSite.x + 0.5) * fertile.cellSizeM,
      z: -half + (fertile.villageSite.y + 0.5) * fertile.cellSizeM,
    };
    /** Součet váhy vrstvy v okolí vsi (± 150 m po 10 m). */
    const near = (w: typeof plain, name: (typeof GROUND_LAYERS)[number]): number => {
      const k = GROUND_LAYERS.indexOf(name);
      let sum = 0;
      for (let dz = -150; dz <= 150; dz += 10) {
        for (let dx = -150; dx <= 150; dx += 10) sum += w.layers[k]![texel(v.x + dx, v.z + dz)]!;
      }
      return sum;
    };
    expect(near(plain, 'dryGrass')).toBeGreaterThan(0);
    expect(near(lush, 'dryGrass')).toBeLessThan(near(plain, 'dryGrass') * 0.1);
    expect(near(lush, 'flowers')).toBeGreaterThan(near(plain, 'flowers') * 2);
    expect(near(lush, 'grass') + near(lush, 'grassDirt')).toBeLessThan(
      (near(plain, 'grass') + near(plain, 'grassDirt')) * 0.2,
    );
    // daleko za kruhem úrodné krajiny (roh mapy) stejné
    const corner = texel(-half + 20, -half + 20);
    for (let k = 0; k < GROUND_LAYERS.length; k++) {
      expect(lush.layers[k]![corner]).toBe(plain.layers[k]![corner]);
    }
  });
});
