import { describe, expect, it } from 'vitest';
import {
  cellSkeletonVersions,
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  riverCenterlines,
  streamCenterline,
  type SkeletonSlice,
} from '@bohemia/game';
import { ambientMix, type AmbientEnvironment } from '../ambient-mix';
import { decorPlacements } from '../decor-placement';
import { fishSchools } from '../fauna-placement';
import { buildRenderSurface } from '../render-surface';

// Řeky kostry světa ve scéně (world-skeleton.md – Mapa z kostry): voda, koryto a břehy berou
// všechny toky (osa vod), stanice podél vody – rákos, ryby, zvuk – jdou po každé řece zvlášť,
// tedy i po přítoku; potok ústí do řeky bez schodu na hladině.

const junction: SkeletonSlice = {
  world: 1,
  rivers: [
    { side: 'N', at: 50, widthM: 40, flow: 'in' },
    { side: 'E', at: 64, widthM: 25, flow: 'in' },
    { side: 'S', at: 80, widthM: 45, flow: 'out' },
  ],
  trails: [],
};
const l = generateLandscape(
  1,
  cellSkeletonVersions(junction, CURRENT_LAYER_VERSIONS),
  undefined,
  junction,
);
const surface = buildRenderSurface(l);
const [main, tributary] = riverCenterlines(l);

/** Bod osy přítoku daleko od hlavního toku i od potoka (m). */
function tributaryPoint(): { x: number; z: number } {
  let best = tributary!.points[0]!;
  let bestScore = -Infinity;
  for (const p of tributary!.points) {
    const score = Math.min(
      main!.nearest(p.x, p.z, 1000).bankDistance,
      streamCenterline(l).nearest(p.x, p.z, 1000).bankDistance,
    );
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

describe('řeky kostry ve scéně', () => {
  it('výšková síť zná obě řeky soutoku, osy každé řeky zvlášť', () => {
    expect(surface.rivers.length).toBe(2);
    expect(surface.rivers.map((r) => r.points)).toEqual([main!.points, tributary!.points]);
    const p = tributaryPoint();
    expect(surface.stream.nearest(p.x, p.z).bankDistance).toBeLessThan(0);
  });

  it('rákos i podél přítoku, hlavní tok má své stanice jako jediná řeka', () => {
    const mainOnly = decorPlacements(l, surface.stream, [main!]);
    const both = decorPlacements(l, surface.stream, surface.rivers);
    expect(both.slice(0, mainOnly.length)).toEqual(mainOnly);
    const alongTributary = both.slice(mainOnly.length);
    expect(
      alongTributary.filter((d) => d.model === 'reeds' || d.model === 'cattails').length,
    ).toBeGreaterThan(20);
    for (const d of alongTributary) {
      expect(tributary!.nearest(d.worldX, d.worldZ, 80).bankDistance).toBeLessThan(6);
    }
  });

  it('zvuk vody i u přítoku daleko od hlavního toku a potoka', () => {
    const p = tributaryPoint();
    const env = (rivers: AmbientEnvironment['rivers']): AmbientEnvironment => ({
      stream: surface.stream,
      rivers,
      forest: { distanceAt: () => 1000 },
    });
    const view = { x: p.x, z: p.z, radius: 40 };
    const loudness = (e: AmbientEnvironment): number => {
      const g = ambientMix(view, e);
      return g.streamMedium + g.streamFast;
    };
    expect(loudness(env(surface.rivers))).toBeGreaterThan(loudness(env([main!])) + 0.05);
  });

  it('ryby smí do obou řek, hejn nejvýš jako dřív', () => {
    const schools = fishSchools(surface);
    expect(schools.length).toBeGreaterThan(0);
    expect(schools.length).toBeLessThanOrEqual(7);
  });

  it('potok ústí do řeky: konec osy potoka ve vodě řeky a na její hladině', () => {
    const mouth = streamCenterline(l).points.at(-1)!;
    const river = surface.river!.nearest(mouth.x, mouth.z, 100);
    expect(river.bankDistance).toBeLessThan(0);
    expect(Math.abs(mouth.level - river.level)).toBeLessThan(0.05);
  });
});
