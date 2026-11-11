import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { rayAtHeight } from './village-picking';

/** Záběr kamery na zemi (4 rohy obrazovky jako body krajiny [x, z]) a natočení kamery. */
export interface ViewFootprint {
  corners: [number, number][];
  /** Natočení kamery kolem svislé osy (rad, Babylon alpha). */
  alpha: number;
}

/** Bod světa na obrazovce v CSS px plátna (null – za kamerou). */
export type ScreenProjector = (
  wx: number,
  wy: number,
  wz: number,
) => { x: number; y: number } | null;

/**
 * Převod bodu světa na CSS px plátna pro výběr postav – matice kamery jednou na kliknutí; bod za
 * kamerou null.
 */
export function screenProjector(
  engine: AbstractEngine,
  canvas: HTMLCanvasElement,
  camera: Camera,
): ScreenProjector {
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  const transform = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
  const viewport = camera.viewport.toGlobal(width, height);
  const scaleX = canvas.clientWidth / Math.max(1, width);
  const scaleY = canvas.clientHeight / Math.max(1, height);
  const identity = Matrix.Identity();
  const world = new Vector3();
  return (wx, wy, wz) => {
    const point = Vector3.Project(world.set(wx, wy, wz), identity, transform, viewport);
    if (point.z < 0 || point.z > 1) return null;
    return { x: point.x * scaleX, y: point.y * scaleY };
  };
}

/** Bod krajiny (x, y, z) na obrazovce v CSS px plátna, nebo null mimo záběr (testovací háček). */
export function groundToScreen(
  engine: AbstractEngine,
  canvas: HTMLCanvasElement,
  camera: Camera,
  x: number,
  y: number,
  z: number,
): { x: number; y: number } | null {
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  const point = Vector3.Project(
    new Vector3(x, y, z),
    Matrix.Identity(),
    camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)),
    camera.viewport.toGlobal(width, height),
  );
  if (point.z < 0 || point.z > 1) return null;
  const scaleX = canvas.clientWidth / width;
  const scaleY = canvas.clientHeight / height;
  const screen = { x: point.x * scaleX, y: point.y * scaleY };
  const inside =
    screen.x >= 0 &&
    screen.y >= 0 &&
    screen.x <= canvas.clientWidth &&
    screen.y <= canvas.clientHeight;
  return inside ? screen : null;
}

/** Záběr kamery na zemi – rohy obrazovky promítnuté do roviny cíle kamery. */
export function viewFootprint(
  scene: Scene,
  canvas: HTMLCanvasElement,
  camera: ArcRotateCamera,
): ViewFootprint | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return null;
  const groundY = camera.target.y;
  const corners: [number, number][] = [];
  for (const [x, y] of [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ] as const) {
    const pick = scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
    const point = rayAtHeight(
      {
        origin: { x: pick.origin.x, y: pick.origin.y, z: pick.origin.z },
        direction: { x: pick.direction.x, y: pick.direction.y, z: pick.direction.z },
      },
      groundY,
    );
    if (!point) return null;
    corners.push([point.x, point.z]);
  }
  return { corners, alpha: camera.alpha };
}
