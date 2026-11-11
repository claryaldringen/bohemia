import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ScenePerfStats } from '@/lib/scene/perf-stats';
import { ScenePerfReadout } from '../ScenePerfPanel';

const STATS: ScenePerfStats = {
  renderer: 'webgpu',
  loopFps: 120,
  drawnFps: 30,
  animationFps: 30,
  frameMs: 4.256,
  activeMeshesMs: 0.5,
  gpuMs: null,
  drawCalls: 412,
  activeMeshes: 230,
  triangles: 1_234_567,
  pickMs: 0.031,
};

/** Dvojice popisek – hodnota ze statického renderu. */
function rows(html: string): [string, string][] {
  return [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [
    m[1]!,
    m[2]!,
  ]);
}

describe('ScenePerfReadout – vývojový ukazatel výkonu', () => {
  it('bez čísel ukáže, že se měří', () => {
    const html = renderToStaticMarkup(<ScenePerfReadout stats={null} />);
    expect(html).toContain('data-testid="dev-perf"');
    expect(html).toContain('měří se');
  });

  it('ukáže kreslící snímky, smyčku, dobu snímku, draw cally a trojúhelníky', () => {
    const html = renderToStaticMarkup(<ScenePerfReadout stats={STATS} />);
    expect(rows(html)).toEqual([
      ['Engine', 'webgpu'],
      ['Kreslí', '30 sn./s'],
      ['Smyčka', '120 /s'],
      ['Animace', '30 sn./s'],
      ['CPU snímku', '4.26 ms'],
      ['Výběr meshů', '0.50 ms'],
      ['GPU snímku', '–'],
      ['Draw cally', '412'],
      ['Meshe', '230'],
      ['Trojúhelníky', '1.23 M'],
      ['Pick', '0.03 ms'],
    ]);
  });

  it('se stínovou mapou ukáže i její obnovy za sekundu a CPU vykreslení', () => {
    const html = renderToStaticMarkup(
      <ScenePerfReadout stats={{ ...STATS, shadows: { perSec: 2, cpuMs: 1.234 } }} />,
    );
    expect(rows(html).at(-1)).toEqual(['Stínová mapa', '2.0 /s · CPU 1.23 ms']);
  });

  it('ve hře ukáže i CPU animací, co se hýbe, a dobu načtení', () => {
    const html = renderToStaticMarkup(
      <ScenePerfReadout
        stats={{ ...STATS, animateMs: 0.8, animating: ['lidé', 'voda'], loadMs: 4321 }}
      />,
    );
    expect(rows(html).slice(-3)).toEqual([
      ['CPU animací', '0.80 ms'],
      ['Hýbe se', 'lidé voda'],
      ['Načtení', '4.3 s'],
    ]);
  });
});
