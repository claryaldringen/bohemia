import '@babylonjs/core/Engines/Extensions/engine.query';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.query';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { Scene } from '@babylonjs/core/scene';
import { AverageMeter, RateMeter, type ScenePerfStats } from './perf-stats';

/**
 * Vývojový ukazatel výkonu (jen /dev/landscape – měření něco stojí): doba snímku, výběr meshů,
 * draw cally a trojúhelníky posledního kresleného snímku, GPU snímku (WebGPU s timestamp-query,
 * WebGL 2 s EXT_disjoint_timer_query), průchody smyčky a opravdu kreslící snímky za sekundu.
 */
export class ScenePerf {
  private readonly sceneMeter: SceneInstrumentation;
  private readonly engineMeter: EngineInstrumentation;
  private readonly loops = new RateMeter();
  private readonly drawn = new RateMeter();
  private readonly picks = new AverageMeter();

  constructor(
    private readonly scene: Scene,
    engine: AbstractEngine,
    private readonly renderer: string,
  ) {
    this.sceneMeter = new SceneInstrumentation(scene);
    this.sceneMeter.captureFrameTime = true;
    this.sceneMeter.captureActiveMeshesEvaluationTime = true;
    this.engineMeter = new EngineInstrumentation(engine);
    this.engineMeter.captureGPUFrameTime = true;
  }

  /** Průchod smyčky (každý requestAnimationFrame). */
  loop(nowMs: number): void {
    this.loops.tick(nowMs);
  }

  /** Snímek, kdy scéna opravdu kreslila. */
  frameDrawn(nowMs: number): void {
    this.drawn.tick(nowMs);
  }

  /** Doba jednoho picku terénu (ms). */
  pick(ms: number): void {
    this.picks.add(ms);
  }

  stats(nowMs: number, animationFps: number): ScenePerfStats {
    const gpu = this.engineMeter.gpuFrameTimeCounter;
    // čítač GPU je v nanosekundách; bez podpory měření zůstane nula
    const gpuNs = gpu?.lastSecAverage || gpu?.current || 0;
    return {
      renderer: this.renderer,
      loopFps: this.loops.rate(nowMs),
      drawnFps: this.drawn.rate(nowMs),
      animationFps,
      frameMs: this.sceneMeter.frameTimeCounter.lastSecAverage,
      activeMeshesMs: this.sceneMeter.activeMeshesEvaluationTimeCounter.lastSecAverage,
      gpuMs: gpuNs > 0 ? gpuNs / 1e6 : null,
      drawCalls: this.sceneMeter.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      triangles: this.scene.getActiveIndices() / 3,
      pickMs: this.picks.average(),
    };
  }

  dispose(): void {
    this.sceneMeter.dispose();
    this.engineMeter.dispose();
  }
}
