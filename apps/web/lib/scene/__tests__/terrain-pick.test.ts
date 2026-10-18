import '@babylonjs/core/Culling/ray';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray.core';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import { afterAll, describe, expect, it } from 'vitest';
import { terrainGeometry } from '../terrain-mesh';
import { createTerrainPicker, type TerrainRay } from '../terrain-pick';

/** Malá krajina: hladké kopce, ostrý hřbet a jáma – síť jako ve hře (krok 3,75 m). */
const N = 65;
const STEP = 3.75;
const ORIGIN = -((N - 1) * STEP) / 2;
const heights = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = i * STEP;
    const z = j * STEP;
    heights[j * N + i] =
      6 * Math.sin(x / 31) * Math.cos(z / 23) +
      (i === 30 ? 9 : 0) - // hřbet
      (Math.hypot(i - 45, j - 15) < 3 ? 5 : 0) + // jáma
      0.4 * Math.sin(i * 1.7 + j * 2.3);
  }
}
const surface = {
  resolution: N,
  heights,
  position: (v: number): { x: number; z: number } => ({
    x: ORIGIN + (v % N) * STEP,
    z: ORIGIN + Math.floor(v / N) * STEP,
  }),
};

const engine = new NullEngine({
  renderWidth: 1200,
  renderHeight: 800,
  textureSize: 256,
  deterministicLockstep: false,
  lockstepMaxSteps: 1,
});
const scene = new Scene(engine);
const { positions, indices } = terrainGeometry(surface);
const mesh = new Mesh('terrain', scene);
const data = new VertexData();
data.positions = positions;
data.indices = indices;
data.applyToMesh(mesh);
mesh.freezeWorldMatrix();
const pick = createTerrainPicker(positions, N);

afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** Deterministická náhoda pro paprsky. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Políčko sítě pod bodem (jako tileAt – po čtvercích sítě). */
function cellOf(x: number, z: number): [number, number] {
  return [Math.floor((x - ORIGIN) / STEP), Math.floor((z - ORIGIN) / STEP)];
}

function compare(ray: Ray): { hit: boolean } {
  const babylon = scene.pickWithRay(ray, (m) => m === mesh);
  const ours = pick(ray as TerrainRay);
  const expected = babylon?.hit ? babylon.pickedPoint : null;
  if (!expected) {
    expect(ours).toBeNull();
    return { hit: false };
  }
  expect(ours).not.toBeNull();
  expect(ours!.x).toBeCloseTo(expected.x, 4);
  expect(ours!.y).toBeCloseTo(expected.y, 4);
  expect(ours!.z).toBeCloseTo(expected.z, 4);
  expect(cellOf(ours!.x, ours!.z)).toEqual(cellOf(expected.x, expected.z));
  return { hit: true };
}

describe('createTerrainPicker – stejný bod jako scene.pick na síti terénu', () => {
  it('náhodné paprsky shora, šikmé i skoro vodorovné, i paprsky mimo krajinu', () => {
    const next = random(7);
    let hits = 0;
    for (let k = 0; k < 600; k++) {
      const origin = new Vector3(
        ORIGIN * 1.6 + next() * -ORIGIN * 3.2,
        20 + next() * 150,
        ORIGIN * 1.6 + next() * -ORIGIN * 3.2,
      );
      // skoro vodorovné paprsky každý pátý (kopce, hřbet zezadu)
      const down = k % 5 === 0 ? -0.02 - next() * 0.1 : -0.2 - next();
      const direction = new Vector3(next() - 0.5, down, next() - 0.5).normalize();
      if (compare(new Ray(origin, direction, 6000)).hit) hits++;
    }
    // většina paprsků terén trefí, některé míjejí – obojí musí sedět
    expect(hits).toBeGreaterThan(150);
    expect(hits).toBeLessThan(600);
  });

  it('svislé paprsky a paprsky přesně nad vrcholy a hranami sítě', () => {
    for (let k = 0; k < 40; k++) {
      const x = ORIGIN + (k % 8) * STEP * 3 + (k % 3 === 0 ? 0 : STEP / 2);
      const z = ORIGIN + Math.floor(k / 8) * STEP * 5;
      compare(new Ray(new Vector3(x, 200, z), new Vector3(0, -1, 0), 6000));
    }
  });

  it('paprsky z kamery hry (pohled šikmo shora) na mřížce pixelů obrazovky', () => {
    for (const [alpha, radius] of [
      [-Math.PI / 2, 120],
      [0.7, 60],
      [2.4, 400],
    ] as const) {
      const camera = new ArcRotateCamera('c', alpha, 0.85, radius, new Vector3(10, 4, -20), scene);
      camera.minZ = 1;
      camera.maxZ = 6000;
      scene.activeCamera = camera;
      scene.render();
      for (let y = 0; y <= 800; y += 80) {
        for (let x = 0; x <= 1200; x += 100) {
          compare(scene.createPickingRay(x, y, Matrix.Identity(), camera, false));
          // a stejné jako scene.pick (to volala hra dřív)
          const old = scene.pick(x, y, (m) => m === mesh, false, camera);
          const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
          const ours = pick(ray);
          if (old?.hit && old.pickedPoint) {
            expect(cellOf(ours!.x, ours!.z)).toEqual(cellOf(old.pickedPoint.x, old.pickedPoint.z));
          } else {
            expect(ours).toBeNull();
          }
        }
      }
      camera.dispose();
    }
  });
});
