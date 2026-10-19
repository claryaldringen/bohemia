/**
 * Vývojový ukazatel výkonu scény (/dev/landscape) – čisté počítadlo a čísla bez Babylonu. Údaje
 * z enginu (draw cally, doba snímku, GPU) sbírá `ScenePerf` (scene-perf.ts).
 */

/** Události za poslední okno (klouzavě) – průchody smyčky, opravdu kreslící snímky. */
export class RateMeter {
  private readonly times: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  tick(nowMs: number): void {
    this.times.push(nowMs);
    this.trim(nowMs);
  }

  /** Událostí za sekundu v posledním okně. */
  rate(nowMs: number): number {
    this.trim(nowMs);
    return (this.times.length * 1000) / this.windowMs;
  }

  private trim(nowMs: number): void {
    let old = 0;
    while (old < this.times.length && this.times[old]! <= nowMs - this.windowMs) old++;
    if (old > 0) this.times.splice(0, old);
  }
}

/** Průměr posledních `size` vzorků (doba picku); bez vzorku null. */
export class AverageMeter {
  private readonly samples: number[] = [];

  constructor(private readonly size = 30) {}

  add(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.size) this.samples.shift();
  }

  average(): number | null {
    if (this.samples.length === 0) return null;
    return this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
  }
}

/** Čísla výkonu scény pro vývojový ukazatel. */
export interface ScenePerfStats {
  renderer: string;
  /** Průchodů smyčky (requestAnimationFrame) za sekundu. */
  loopFps: number;
  /** Snímků za sekundu, kdy scéna opravdu kreslila. */
  drawnFps: number;
  /** Plynulost animací (voda, zvířata, lidé) – snímků za sekundu, na pozadí méně. */
  animationFps: number;
  /** CPU kreslení snímku (`scene.render`) – průměr za poslední sekundu (ms). */
  frameMs: number;
  /** Z toho výběr meshů v záběru (ms). */
  activeMeshesMs: number;
  /** GPU snímku (ms), když to prohlížeč umí měřit; jinak null. */
  gpuMs: number | null;
  /** Posledního kresleného snímku. */
  drawCalls: number;
  activeMeshes: number;
  triangles: number;
  /** Doba picku terénu pod kurzorem – průměr posledních (ms); bez picku null. */
  pickMs: number | null;
  /**
   * Stínová mapa (den a noc – obnovuje se s pohybem slunce): obnov za sekundu a CPU jednoho
   * vykreslení mapy (průměr posledních, ms; bez obnovy null). Bez stínové mapy chybí.
   */
  shadows?: { perSec: number; cpuMs: number | null };
}

/** Řádky ukazatele: popisek a hodnota (česky, čísla zaokrouhlená). */
export function perfStatsRows(stats: ScenePerfStats): [string, string][] {
  const ms = (value: number | null): string => (value === null ? '–' : `${value.toFixed(2)} ms`);
  return [
    ['Engine', stats.renderer],
    ['Kreslí', `${Math.round(stats.drawnFps)} sn./s`],
    ['Smyčka', `${Math.round(stats.loopFps)} /s`],
    ['Animace', `${Math.round(stats.animationFps)} sn./s`],
    ['CPU snímku', ms(stats.frameMs)],
    ['Výběr meshů', ms(stats.activeMeshesMs)],
    ['GPU snímku', ms(stats.gpuMs)],
    ['Draw cally', String(stats.drawCalls)],
    ['Meshe', String(stats.activeMeshes)],
    ['Trojúhelníky', formatCount(stats.triangles)],
    ['Pick', ms(stats.pickMs)],
    ...(stats.shadows
      ? ([
          [
            'Stínová mapa',
            `${stats.shadows.perSec.toFixed(1)} /s · CPU ${ms(stats.shadows.cpuMs)}`,
          ],
        ] as [string, string][])
      : []),
  ];
}

function formatCount(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
  return String(Math.round(value));
}
