import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery';
import '@babylonjs/core/Engines/Extensions/engine.query';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.query';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import type { Scene } from '@babylonjs/core/scene';
import { AverageMeter, RateMeter, type ScenePerfStats } from './perf-stats';

/**
 * Vývojový ukazatel výkonu (/dev/landscape a hra s `?perf=1` – měření něco stojí): doba snímku, výběr meshů,
 * draw cally a trojúhelníky posledního kresleného snímku, GPU snímku (WebGPU s timestamp-query,
 * WebGL 2 s EXT_disjoint_timer_query), průchody smyčky a opravdu kreslící snímky za sekundu.
 */
export class ScenePerf {
  private readonly sceneMeter: SceneInstrumentation;
  private readonly engineMeter: EngineInstrumentation;
  private readonly loops = new RateMeter();
  private readonly drawn = new RateMeter();
  private readonly picks = new AverageMeter();
  /** Stínová mapa – obnovy za sekundu (okno 5 s – obnovují se po krocích) a CPU vykreslení. */
  private readonly shadowRenders = new RateMeter(5000);
  private readonly shadowCpu = new AverageMeter(10);
  private shadowMap: RenderTargetTexture | null = null;
  /** CPU kontroly animací (`animate()`). */
  private readonly animateCpu = new AverageMeter(30);
  /** Kdy naposledy která animace žádala překreslení (performance.now). */
  private readonly animatedAt = new Map<string, number>();

  constructor(
    private readonly scene: Scene,
    engine: AbstractEngine,
    private readonly renderer: string,
  ) {
    this.sceneMeter = new SceneInstrumentation(scene);
    this.sceneMeter.captureFrameTime = true;
    this.sceneMeter.captureActiveMeshesEvaluationTime = true;
    this.engineMeter = new EngineInstrumentation(engine);
    try {
      this.engineMeter.captureGPUFrameTime = true;
    } catch (error) {
      // měření GPU je jen doplněk – bez něj ukazatel ukáže „–“, scéna jede dál
      console.warn('Měření GPU snímku se nepodařilo zapnout.', error);
    }
  }

  /** Průchod smyčky (každý requestAnimationFrame). */
  loop(nowMs: number): void {
    this.loops.tick(nowMs);
  }

  /** Snímek, kdy scéna opravdu kreslila. */
  frameDrawn(nowMs: number): void {
    this.drawn.tick(nowMs);
  }

  /** Doba jedné kontroly animací (ms). */
  animateTime(ms: number): void {
    this.animateCpu.add(ms);
  }

  /** Animace `name` v záběru žádá překreslení. */
  animated(name: string, nowMs: number): void {
    this.animatedAt.set(name, nowMs);
  }

  /** Doba jednoho picku terénu (ms). */
  pick(ms: number): void {
    this.picks.add(ms);
  }

  stats(nowMs: number, animationFps: number): ScenePerfStats {
    this.watchShadowMap();
    const gpu = this.gpuCounter();
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
      animateMs: this.animateCpu.average(),
      animating: [...this.animatedAt]
        .filter(([, at]) => at > nowMs - 1000)
        .map(([name]) => name)
        .sort(),
      ...(this.shadowMap
        ? {
            shadows: {
              perSec: this.shadowRenders.rate(nowMs),
              cpuMs: this.shadowCpu.average(),
            },
          }
        : {}),
    };
  }

  /** Stínová mapa vzniká až s krajinou – měření se na ni napojí, jakmile je. */
  private watchShadowMap(): void {
    if (this.shadowMap) return;
    const sun = this.scene.getLightByName('sun');
    const map = sun?.getShadowGenerator()?.getShadowMap() ?? null;
    if (!map) return;
    this.shadowMap = map;
    let started = 0;
    map.onBeforeRenderObservable.add(() => {
      started = performance.now();
    });
    map.onAfterRenderObservable.add(() => {
      const now = performance.now();
      this.shadowCpu.add(now - started);
      this.shadowRenders.tick(now);
    });
  }

  private gpuCounter(): { lastSecAverage: number; current: number } | null {
    try {
      return this.engineMeter.gpuFrameTimeCounter;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.sceneMeter.dispose();
    this.engineMeter.dispose();
  }
}
