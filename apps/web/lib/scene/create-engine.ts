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
    const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
    await engine.initAsync();
    return { engine, renderer: 'webgpu' };
  }
  return { engine: new Engine(canvas, true, { stencil: true }, true), renderer: 'webgl' };
}
