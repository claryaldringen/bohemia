import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';

export type RendererName = 'webgpu' | 'webgl';

/** WebGPU, kde ho prohlížeč umí, jinak WebGL 2 (Firefox na Macu a Linuxu, starší zařízení). */
export async function createEngine(
  canvas: HTMLCanvasElement,
  preferred: 'auto' | 'webgl',
): Promise<{ engine: AbstractEngine; renderer: RendererName }> {
  if (preferred === 'auto' && (await WebGPUEngine.IsSupportedAsync)) {
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      adaptToDeviceRatio: true,
      // Měření GPU snímku ve vývojovém ukazateli výkonu (scene-perf.ts) – bez zapnutého měření
      // nic nestojí; Babylon si vyžádá jen to, co adaptér umí.
      deviceDescriptor: { requiredFeatures: ['timestamp-query'] },
    });
    try {
      await engine.initAsync();
      return { engine, renderer: 'webgpu' };
    } catch (error) {
      // Prohlížeč WebGPU hlásí, ale zařízení nejde vytvořit (ovladač, blocklist…) – WebGL 2.
      console.warn('WebGPU se nepodařilo spustit, přepínám na WebGL 2.', error);
      try {
        engine.dispose();
      } catch {
        // Napůl inicializovaný WebGPUEngine při uvolnění sám padá – nemá co uvolnit.
      }
    }
  }
  // Bez WebGL 2 vyhodí konstruktor chybu – herní plocha pak hráči ukáže vysvětlení.
  return { engine: new Engine(canvas, true, { stencil: true }, true), renderer: 'webgl' };
}
