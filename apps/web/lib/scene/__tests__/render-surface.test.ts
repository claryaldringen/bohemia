import { describe, it, expect } from 'vitest';
import { generateLandscape, PREVIOUS_LAYER_VERSIONS, type Landscape } from '@bohemia/game';
import { buildRenderSurface, RENDER_SUBDIVISION } from '../render-surface';
import { streamCenterline } from '../stream-geometry';

const landscape = generateLandscape(3);
const surface = buildRenderSurface(landscape);
const stream = streamCenterline(landscape);

describe('buildRenderSurface', () => {
  it('má 4× hustší síť než políčka', () => {
    expect(RENDER_SUBDIVISION).toBe(4);
    expect(surface.resolution).toBe((landscape.size - 1) * 4 + 1);
    expect(surface.heights).toHaveLength(surface.resolution ** 2);
  });

  it('daleko od potoka prochází přesně výškami středů políček', () => {
    for (const [x, y] of [
      [10, 10],
      [100, 20],
      [64, 120],
    ] as const) {
      const v = y * RENDER_SUBDIVISION * surface.resolution + x * RENDER_SUBDIVISION;
      const p = surface.position(v);
      if (stream.nearest(p.x, p.z, 60).distance < 60) continue;
      expect(surface.heights[v]).toBeCloseTo(landscape.heights[y * 128 + x]!, 4);
    }
  });

  it('na ose potoka je dno pod hladinou a hladina je známá', () => {
    let checked = 0;
    for (let v = 0; v < surface.heights.length; v += 7) {
      const p = surface.position(v);
      if (stream.nearest(p.x, p.z).distance > 2) continue;
      expect(surface.waterLevel[v]).toBeGreaterThan(surface.heights[v]! + 0.3);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('daleko od potoka hladina není', () => {
    const v = 0;
    const p = surface.position(v);
    if (stream.nearest(p.x, p.z, 60).distance >= 60) {
      expect(surface.waterLevel[v]).toBe(-Infinity);
    }
  });

  /** Hloubka vody (hladina − dno) v libovolném bodě – z bodů sítě. */
  const depthAt = (x: number, z: number): number =>
    stream.nearest(x, z).level - surface.heightAt(x, z);
  const axis = stream.points.slice(30, -30);

  it('tůně jsou hlubší než běžné koryto, mělčiny mělčí', () => {
    const pools = axis.filter((p) => p.pool > 0.9);
    const shallows = axis.filter((p) => p.shallow > 0.9 && p.pool < 0.1);
    const plain = axis.filter((p) => p.pool < 0.1 && p.shallow < 0.1);
    const mean = (ps: typeof axis): number =>
      ps.reduce((sum, p) => sum + depthAt(p.x, p.z), 0) / ps.length;
    expect(pools.length).toBeGreaterThan(0);
    expect(shallows.length).toBeGreaterThan(0);
    expect(mean(pools)).toBeGreaterThan(1.5);
    expect(mean(shallows)).toBeLessThan(0.6);
    expect(mean(plain)).toBeGreaterThan(mean(shallows));
    expect(mean(plain)).toBeLessThan(mean(pools));
  });

  it('okraj vody kopíruje šířku břehu: kousek uvnitř je voda, kousek venku souš', () => {
    let checked = 0;
    for (let k = 0; k < axis.length - 1; k += 9) {
      const a = axis[k]!;
      const b = axis[k + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / length;
      const nz = (b.x - a.x) / length;
      for (const [side, half] of [
        [1, a.halfLeft],
        [-1, a.halfRight],
      ] as const) {
        const inside = { x: a.x + nx * side * half * 0.5, z: a.z + nz * side * half * 0.5 };
        // Síť terénu má rozestup 3,75 m – souš se ověřuje o jeden krok sítě za okrajem vody.
        const outside = { x: a.x + nx * side * (half + 5), z: a.z + nz * side * (half + 5) };
        if (stream.nearest(outside.x, outside.z).bankDistance < 4) continue; // jiný úsek blíž
        expect(depthAt(inside.x, inside.z)).toBeGreaterThan(0);
        expect(depthAt(outside.x, outside.z)).toBeLessThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('v oblouku je vnitřní strana mělčí než vnější (náplav × nárazový břeh)', () => {
    let deeperOutside = 0;
    let bends = 0;
    for (let k = 1; k < axis.length - 1; k += 3) {
      const a = axis[k]!;
      if (Math.abs(a.turn) < 0.6 || a.pool > 0.1 || a.shallow > 0.1) continue;
      const b = axis[k + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / length;
      const nz = (b.x - a.x) / length;
      const inner = Math.sign(a.turn); // kladné stočení = doleva = levá strana je vnitřní
      const innerHalf = inner > 0 ? a.halfLeft : a.halfRight;
      const outerHalf = inner > 0 ? a.halfRight : a.halfLeft;
      const innerDepth = depthAt(
        a.x + nx * inner * innerHalf * 0.5,
        a.z + nz * inner * innerHalf * 0.5,
      );
      const outerDepth = depthAt(
        a.x - nx * inner * outerHalf * 0.5,
        a.z - nz * inner * outerHalf * 0.5,
      );
      bends++;
      if (outerDepth > innerDepth) deeperOutside++;
    }
    expect(bends).toBeGreaterThan(5);
    expect(deeperOutside / bends).toBeGreaterThan(0.8);
  });
});

describe('buildRenderSurface – napojení břehů na okolní terén', () => {
  it('dál od vody nemá terén schody – úprava břehu plynule dozní do okolního terénu', () => {
    // Generátor dovolí svah nejvýš 2,4 m na políčko (15 m) → 0,6 m na krok sítě (3,75 m).
    // U vody smí být břeh strmější (nárazový břeh), proto se hlídá až od 12 m od okraje vody.
    for (const seed of [3, 5, 42]) {
      // Terén 1 – bez skal u potoka (skalní stěny hlídá test níž).
      const l = generateLandscape(seed, PREVIOUS_LAYER_VERSIONS);
      const s = buildRenderSurface(l);
      const nearStream = streamCenterline(l);
      const n = s.resolution;
      let worst = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n - 1; i++) {
          for (const [a, b] of [
            [j * n + i, j * n + i + 1],
            [i * n + j, (i + 1) * n + j],
          ] as const) {
            const { x, z } = s.position(a);
            if (nearStream.nearest(x, z).bankDistance < 12) continue;
            worst = Math.max(worst, Math.abs(s.heights[a]! - s.heights[b]!));
          }
        }
      }
      expect(worst, `seed ${seed}`).toBeLessThanOrEqual(0.75);
    }
  }, 30_000);
});

describe('buildRenderSurface – skály u potoka (terén 2)', () => {
  const rocky = generateLandscape(16);
  const surface = buildRenderSurface(rocky);
  const stream = streamCenterline(rocky);
  // Táž krajina bez výšek stěn – scéna by kreslila břehy jako v terénu 1.
  const withoutBanks: Landscape = {
    ...rocky,
    stream: rocky.stream.map(({ bankLeft: _l, bankRight: _r, ...p }) => p),
  };
  const plain = buildRenderSurface(withoutBanks);

  it('stěna do koryta nezasáhne – ve vodě je dno stejné jako bez stěn', () => {
    let checked = 0;
    for (let v = 0; v < surface.heights.length; v += 3) {
      const p = surface.position(v);
      const near = stream.nearest(p.x, p.z);
      if (near.bankDistance >= 0 || near.bank <= 0) continue;
      expect(surface.heights[v]).toBe(plain.heights[v]);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('u vysoké stěny terén nad čelem prudce stoupne – skalní stěna, ne mírný břeh', () => {
    let walls = 0;
    let steep = 0;
    for (let v = 0; v < surface.heights.length; v += 2) {
      const p = surface.position(v);
      const near = stream.nearest(p.x, p.z);
      if (near.bank < 5 || near.innerBend > 0 || near.bankDistance < 7 || near.bankDistance > 9) {
        continue;
      }
      walls++;
      if (surface.heights[v]! - near.level > 0.6 * near.bank) steep++;
    }
    expect(walls).toBeGreaterThan(20);
    expect(steep / walls).toBeGreaterThan(0.8);
  });

  it('dál od stěn terén schody nemá', () => {
    const n = surface.resolution;
    let worst = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const { x, z } = surface.position(a);
        const near = stream.nearest(x, z, 120);
        if (near.bankDistance < 12 || (near.bank > 0 && near.bankDistance < 100)) continue;
        if (Number.isFinite(near.distance) && near.bank > 0) continue;
        worst = Math.max(worst, Math.abs(surface.heights[a]! - surface.heights[a + 1]!));
      }
    }
    expect(worst).toBeLessThanOrEqual(0.9);
  });
});
