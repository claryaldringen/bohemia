import { describe, it, expect } from 'vitest';
import { checkBand, FLAT_MAX_STEP_M } from '../band';
import { maxStep } from '../grid';
import { generateLandscapeAttempt } from '../generate';
import { createRandom, deriveSeed } from '../random';
import type { ChannelSample } from '../stream';
import { ROCK_FREE_SITE, ROCK_SPUR, sculptStreamRocks, sharpBends } from '../stream-rocks';
import { generateTerrain } from '../terrain';
import {
  CURRENT_LAYER_VERSIONS,
  PREVIOUS_LAYER_VERSIONS,
  promontoriesOf,
  SURFACE_CODES,
  type Landscape,
} from '../types';

const SIZE = 128;

/** Osa po bodech 0,5 políčka podél lomené čáry (políčka), tečny z okolních bodů. */
function axis(points: readonly { x: number; y: number }[], halfWidth = 0.5): ChannelSample[] {
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    along.push(along[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const dense: { x: number; y: number }[] = [];
  let segment = 0;
  for (let s = 0; s <= along.at(-1)!; s += 0.5) {
    while (segment < points.length - 2 && along[segment + 1]! < s) segment++;
    const a = points[segment]!;
    const b = points[segment + 1]!;
    const t = (s - along[segment]!) / (along[segment + 1]! - along[segment]! || 1);
    dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return dense.map((p, k) => {
    const a = dense[Math.max(0, k - 1)]!;
    const b = dense[Math.min(dense.length - 1, k + 1)]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      ...p,
      s: k * 0.5,
      tx: (b.x - a.x) / length,
      ty: (b.y - a.y) / length,
      left: halfWidth,
      right: halfWidth,
      shallow: false,
      pool: false,
    };
  });
}

/** Rovně po +x, pak oblouk o poloměru `radius` doleva (k +y) o 90° a rovně po +y. */
function bend(radius: number): ChannelSample[] {
  const corner = { x: 64, y: 40 };
  const points = [{ x: 6, y: corner.y }];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + ((Math.PI / 2) * i) / 12;
    points.push({
      x: corner.x + radius * Math.cos(a),
      y: corner.y + radius + radius * Math.sin(a),
    });
  }
  points.push({ x: corner.x + radius, y: 121 });
  return axis(points);
}

/** Rovný terén s korytem pod osou; `outerRise` zvedne terén vpravo od oblouku (vně). */
function sculptOver(
  samples: ChannelSample[],
  outerRise = 0,
): { heights: Float32Array; orig: Float32Array; result: ReturnType<typeof sculptStreamRocks> } {
  const water = new Uint8Array(SIZE * SIZE);
  for (const p of samples) water[Math.round(p.y) * SIZE + Math.round(p.x)] = 1;
  const orig = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Vně oblouku (vpravo od toku = dole a vpravo od rohu) vyšší terén.
      const outside = y < 40 - 1.5 || x > 64 + 4 + 1.5;
      orig[y * SIZE + x] = 10 + (outside ? outerRise : 0);
    }
  }
  const heights = orig.slice();
  for (let i = 0; i < water.length; i++) if (water[i]) heights[i] = 9;
  const levels = samples.map(() => 9.6);
  const result = sculptStreamRocks(
    heights,
    orig,
    water,
    samples,
    levels,
    SIZE,
    { x: 6, y: 120 },
    null,
    createRandom(7),
  );
  return { heights, orig, result };
}

describe('skály u potoka – ostrý ohyb a nárazový břeh (terén 2)', () => {
  it('ostrý ohyb pozná podle poloměru pod 1,5 šířky koryta a stočení přes 50°, i stranu', () => {
    const sharp = sharpBends(bend(1.2));
    expect(sharp).toHaveLength(1);
    // Stáčí se doleva – vnější strana je pravá (−1).
    expect(sharp[0]!.outer).toBe(-1);
    expect(sharp[0]!.turn).toBeGreaterThan((50 * Math.PI) / 180);
    // Velký oblouk (poloměr 4 šířky) ostrý není.
    expect(sharpBends(bend(4))).toHaveLength(0);
  });

  it('v ostrém ohybu vyroste skalní ostroh na vnější straně, vnitřní zůstane', () => {
    const samples = bend(1.2);
    const { heights, orig, result } = sculptOver(samples);
    const apex = sharpBends(samples)[0]!.apex;
    expect(result.bankRight[apex]!).toBeGreaterThanOrEqual(ROCK_SPUR.minM * 0.85);
    expect(result.bankLeft[apex]!).toBe(0);
    const p = samples[apex]!;
    const at = (side: number, d: number): number => {
      const x = Math.round(p.x - p.ty * side * d);
      const y = Math.round(p.y + p.tx * side * d);
      return heights[y * SIZE + x]! - orig[y * SIZE + x]!;
    };
    expect(at(-1, 2)).toBeGreaterThan(3);
    expect(Math.abs(at(1, 2))).toBeLessThan(0.01);
  });

  it('výška nárazového břehu podle místa: v rovině nízký, pod vyšším okolím stěna', () => {
    const samples = bend(4);
    const low = sculptOver(samples).result;
    const high = sculptOver(samples, 10).result;
    const peak = (list: Float32Array): number => Math.max(...list);
    expect(peak(low.bankLeft)).toBe(0);
    expect(peak(low.bankRight)).toBeGreaterThan(0.8);
    expect(peak(low.bankRight)).toBeLessThan(2.5);
    expect(peak(high.bankRight)).toBeGreaterThan(3);
    expect(peak(high.bankRight)).toBeGreaterThan(peak(low.bankRight) + 1.5);
  });

  it('do koryta skála nezasáhne – vodní políčka mají dno beze změny', () => {
    const samples = bend(1.2);
    const water = new Set(samples.map((p) => Math.round(p.y) * SIZE + Math.round(p.x)));
    const { heights } = sculptOver(samples, 6);
    for (const i of water) expect(heights[i]).toBe(9);
  });
});

/** Krajiny skutečných sídel (seed terénu odvozený jako při generování). */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7 + 3);
const pairs = SEEDS.map((seed) => ({
  seed,
  next: generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS),
  previous: generateLandscapeAttempt(seed, PREVIOUS_LAYER_VERSIONS),
}));
const plain = pairs.filter((p) => promontoriesOf(p.next).length === 0);

describe('terén 2 na skutečných krajinách', () => {
  it('bez ostrožny: osa potoka, hladina, brody, tůně, voda i místo vsi jako v terénu 1', () => {
    expect(plain.length).toBeGreaterThan(25);
    for (const { seed, next, previous } of plain) {
      expect(next.villageSite, `seed ${seed}`).toEqual(previous.villageSite);
      expect(next.stream.length, `seed ${seed}`).toBe(previous.stream.length);
      next.stream.forEach((p, k) => {
        const q = previous.stream[k]!;
        expect([p.x, p.y, p.halfWidthLeft, p.halfWidthRight, p.level, p.shallow]).toEqual([
          q.x,
          q.y,
          q.halfWidthLeft,
          q.halfWidthRight,
          q.level,
          q.shallow,
        ]);
      });
      const water = (l: Landscape): number[] =>
        [...l.surface.keys()].filter((i) => l.surface[i] === SURFACE_CODES.water);
      expect(water(next), `seed ${seed}`).toEqual(water(previous));
    }
  });

  it('terén se jen zvedá (skály), nikdy neprohloubí; dno vody zůstane', () => {
    for (const { seed, next, previous } of plain) {
      for (let i = 0; i < next.heights.length; i++) {
        const lower = next.heights[i]! < previous.heights[i]! - 1e-4;
        if (lower) expect.fail(`seed ${seed}, políčko ${i} kleslo`);
        if (previous.surface[i] === SURFACE_CODES.water) {
          expect(next.heights[i], `seed ${seed}`).toBe(previous.heights[i]);
        }
      }
    }
  });

  it('místo vsi bez skal: do 450 m od něj terén i břehy beze změny', () => {
    for (const { seed, next, previous } of plain) {
      const { x: sx, y: sy } = next.villageSite;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (Math.hypot(x - sx, y - sy) > ROCK_FREE_SITE.from) continue;
          const i = y * SIZE + x;
          expect(next.heights[i], `seed ${seed}`).toBe(previous.heights[i]);
        }
      }
      for (const p of next.stream) {
        if (Math.hypot(p.x - sx, p.y - sy) > ROCK_FREE_SITE.from) continue;
        expect(p.bankLeft ?? 0).toBe(0);
        expect(p.bankRight ?? 0).toBe(0);
      }
    }
  });

  it('skály na části břehů: stěny přes 3 m na většině krajin, nejvýš ≈ 9 m mimo ostrožnu', () => {
    const peaks = plain.map(({ next }) =>
      Math.max(...next.stream.map((p) => Math.max(p.bankLeft ?? 0, p.bankRight ?? 0))),
    );
    expect(peaks.filter((h) => h > 3).length / peaks.length).toBeGreaterThan(0.7);
    for (const h of peaks) expect(h).toBeLessThanOrEqual(10.5);
    // Stěny jsou jen u části toku, ne podél celého potoka.
    for (const { next } of plain) {
      const walls = next.stream.filter((p) => Math.max(p.bankLeft ?? 0, p.bankRight ?? 0) > 3);
      expect(walls.length / next.stream.length).toBeLessThan(0.25);
    }
  });

  it('terén 1 se generuje dál stejně – bez výšek břehů i ostrožen', () => {
    const terrain = generateTerrain(deriveSeed(3, 'terrain'), 1);
    expect(terrain.promontories).toBeUndefined();
    expect(terrain.stream.every((p) => p.bankLeft === undefined)).toBe(true);
  });
});

describe('ostrožna nad zaříznutým meandrem', () => {
  // Seedy, kde ji generátor plánuje (krajina na první pokus).
  const SITES = [2, 16, 25, 38];
  const withPromontory = SITES.map((seed) => ({
    seed,
    l: generateLandscapeAttempt(seed, CURRENT_LAYER_VERSIONS),
  }));
  const heightAt = (l: Landscape, x: number, y: number): number => {
    const cx = Math.min(SIZE - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(SIZE - 1, Math.max(0, Math.round(y)));
    return l.heights[cy * SIZE + cx]!;
  };

  it('vznikne na plánovaných seedech, plocha 0,5–2 ha, 8–12 m nad potokem', () => {
    for (const { seed, l } of withPromontory) {
      const [p] = promontoriesOf(l);
      expect(p, `seed ${seed}`).toBeDefined();
      expect(p!.kind).toBe('meander');
      expect(p!.areaHa, `seed ${seed}`).toBeGreaterThanOrEqual(0.5);
      expect(p!.areaHa, `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(p!.heightM).toBeGreaterThanOrEqual(8);
      expect(p!.heightM).toBeLessThanOrEqual(12);
      // Plocha nahoře je opravdu nahoře nad hladinou okolního potoka.
      let level = Infinity;
      for (const s of l.stream) {
        if (Math.hypot(s.x - p!.center.x, s.y - p!.center.y) < 9) level = Math.min(level, s.level);
      }
      expect(heightAt(l, p!.center.x, p!.center.y) - level, `seed ${seed}`).toBeGreaterThan(6);
    }
  });

  it('ze 2–3 stran prudké svahy k vodě, na jedné úzká šíje', () => {
    for (const { seed, l } of withPromontory) {
      const p = promontoriesOf(l)[0]!;
      const top = heightAt(l, p.center.x, p.center.y);
      // Za obrysem terén prudce klesne – aspoň o 4 m do 3 políček aspoň na polovině obvodu.
      const steep = p.outline.filter((q) => {
        const dx = q.x - p.center.x;
        const dy = q.y - p.center.y;
        const length = Math.hypot(dx, dy) || 1;
        return top - heightAt(l, q.x + (dx / length) * 3, q.y + (dy / length) * 3) > 4;
      });
      expect(steep.length / p.outline.length, `seed ${seed}`).toBeGreaterThanOrEqual(0.5);
      // Šíje je užší než plocha nahoře.
      const neck = Math.hypot(p.neck[0].x - p.neck[1].x, p.neck[0].y - p.neck[1].y);
      const span = Math.max(
        ...p.outline.map((q) => Math.hypot(q.x - p.center.x, q.y - p.center.y)),
      );
      expect(neck, `seed ${seed}`).toBeLessThan(span * 1.2);
      expect(neck, `seed ${seed}`).toBeGreaterThan(0.5);
      // Potok obtéká ostrožnu: voda do 7 políček od středu ve většině směrů.
      let around = 0;
      for (let j = 0; j < 16; j++) {
        const a = (2 * Math.PI * j) / 16;
        for (let r = 0; r < 8; r += 0.5) {
          const x = Math.round(p.center.x + Math.cos(a) * r);
          const y = Math.round(p.center.y + Math.sin(a) * r);
          if (l.surface[y * SIZE + x] === SURFACE_CODES.water) {
            around++;
            break;
          }
        }
      }
      expect(around / 16, `seed ${seed}`).toBeGreaterThan(0.55);
    }
  });

  it('nepřekrývá místo vsi – ostrožna daleko od vsi, ves na rovině a v pásmu', () => {
    for (const { seed, l } of withPromontory) {
      const p = promontoriesOf(l)[0]!;
      const site = l.villageSite;
      for (const q of p.outline) {
        expect(Math.hypot(q.x - site.x, q.y - site.y), `seed ${seed}`).toBeGreaterThan(36);
      }
      const previous = generateLandscapeAttempt(seed, PREVIOUS_LAYER_VERSIONS);
      expect(site).toEqual(previous.villageSite);
      // Ves zůstane na rovině: smyčka změní dno potoka po proudu (nejnižší místo cesty přes
      // návrší), údolí u vsi se může o kus posunout – ale skály ani ostrožna u vsi nejsou
      // a krajina projde pásmem (místo pro vesnici, louky u vsi).
      let steepest = 0;
      for (let y = site.y - 6; y <= site.y + 6; y++) {
        for (let x = site.x - 6; x <= site.x + 6; x++) {
          steepest = Math.max(steepest, maxStep(l.heights, SIZE, x, y));
        }
      }
      expect(steepest, `seed ${seed}`).toBeLessThanOrEqual(FLAT_MAX_STEP_M);
      expect(checkBand(l, CURRENT_LAYER_VERSIONS).ok, `seed ${seed}`).toBe(true);
      for (const p of l.stream) {
        if (Math.hypot(p.x - site.x, p.y - site.y) > ROCK_FREE_SITE.from) continue;
        expect(Math.max(p.bankLeft ?? 0, p.bankRight ?? 0), `seed ${seed}`).toBe(0);
      }
    }
  });

  it('jen na části map – zhruba na každé šesté až desáté', () => {
    const share = pairs.filter((p) => promontoriesOf(p.next).length > 0).length / pairs.length;
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.25);
  });
});
