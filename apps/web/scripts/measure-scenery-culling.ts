/**
 * Trojúhelníky a draw cally stromů, dekorací a impostorů krajiny za snímek – bez ořezu a s ořezem
 * po čtvercích (scenery-chunks.ts) pro výchozí pohled kamery a oddálené pohledy. Bez prohlížeče:
 * vrstva překážek z herního jádra, počty trojúhelníků a obaly modelů z GLB, záběr z Babylonu
 * v NullEngine.
 *
 * Krajina jako uložené sídlo: seed přijatého pokusu a verze vrstev (výchozí ves Vlkov
 * z výkonnostního rozboru – 1138310652, původní vrstvy).
 *
 *   npx tsx apps/web/scripts/measure-scenery-culling.ts [seed] [initial|current]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import {
  CURRENT_LAYER_VERSIONS,
  INITIAL_LAYER_VERSIONS,
  generateLandscapeAttempt,
  obstaclesOf,
} from '@bohemia/game';
import { HEIGHT_SCALE } from '../lib/scene/constants';
import { decorPlacements } from '../lib/scene/decor-placement';
import { IMPOSTOR_ATLAS } from '../lib/scene/impostor-atlas';
import { obstacleScenery } from '../lib/scene/obstacle-scenery';
import { buildRenderSurface } from '../lib/scene/render-surface';
import {
  boxInFrustum,
  chunkBounds,
  chunkGrid,
  chunkOrder,
  emptyBounds,
  mergeBounds,
  type LocalBounds,
} from '../lib/scene/scenery-chunks';
import { tileCenter } from '../lib/scene/tile-at';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

interface Group {
  tris: number;
  /** Draw callů na snímek (materiálů modelu). */
  prims: number;
  matrices: Float32Array;
  local: LocalBounds;
}

/** Trojúhelníky, primitiva a obal modelu z GLB (glTF → Babylon převrací osu z). */
function glbInfo(file: string): Omit<Group, 'matrices'> {
  const buffer = readFileSync(`${PUBLIC}${file}`);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8')) as {
    meshes?: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
    accessors: { count: number; min?: number[]; max?: number[] }[];
  };
  let tris = 0;
  let prims = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      prims++;
      const position = json.accessors[primitive.attributes.POSITION]!;
      const indices =
        primitive.indices === undefined ? position.count : json.accessors[primitive.indices]!.count;
      tris += indices / 3;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, position.min?.[k] ?? 0);
        max[k] = Math.max(max[k]!, position.max?.[k] ?? 0);
      }
    }
  }
  return { tris, prims, local: [min[0]!, min[1]!, -max[2]!, max[0]!, max[1]!, -min[2]!] };
}

const seed = Number(process.argv[2] ?? 1138310652);
const versions = process.argv[3] === 'current' ? CURRENT_LAYER_VERSIONS : INITIAL_LAYER_VERSIONS;
const landscape = generateLandscapeAttempt(seed, versions);
const surface = buildRenderSurface(landscape);
const height = (x: number, z: number): number => surface.heightAt(x, z) * HEIGHT_SCALE;
const scenery = obstacleScenery(obstaclesOf(landscape));
const decor = [...scenery.decor, ...decorPlacements(landscape, surface.stream)];

function compose(
  list: { x: number; z: number; y?: number; rotation: number; scale: number }[],
): Float32Array {
  const out = new Float32Array(list.length * 16);
  const matrix = new Matrix();
  list.forEach((t, i) => {
    Matrix.ComposeToRef(
      new Vector3(t.scale, t.scale, t.scale),
      Quaternion.RotationAxis(Vector3.Up(), t.rotation),
      new Vector3(t.x, t.y ?? height(t.x, t.z), t.z),
      matrix,
    );
    matrix.copyToArray(out, i * 16);
  });
  return out;
}

const groups: Group[] = [];
for (const model of new Set(scenery.trees.map((t) => t.model))) {
  const list = scenery.trees.filter((t) => t.model === model);
  groups.push({
    ...glbInfo(`models/trees/${model}.glb`),
    matrices: compose(
      list.map((t) => ({ x: t.worldX, z: t.worldZ, rotation: t.rotationY, scale: t.scale })),
    ),
  });
}
for (const model of new Set(decor.map((d) => d.model))) {
  const list = decor.filter((d) => d.model === model);
  groups.push({
    ...glbInfo(`models/decor/${model}.glb`),
    matrices: compose(
      list.map((d) => ({
        x: d.worldX,
        z: d.worldZ,
        y: d.waterLevel === undefined ? undefined : d.waterLevel * HEIGHT_SCALE,
        rotation: d.rotationY,
        scale: d.scale,
      })),
    ),
  });
}
const stretch = 1 / Math.cos(IMPOSTOR_ATLAS.elevation);
IMPOSTOR_ATLAS.cells.forEach((cell, index) => {
  for (const mirror of [false, true]) {
    const list = scenery.impostors.filter((p) => p.cell === index && p.mirror === mirror);
    if (list.length === 0) continue;
    const pivotU = mirror ? 1 - cell.pivotU : cell.pivotU;
    const reach = Math.max(pivotU, 1 - pivotU) * cell.sideM;
    groups.push({
      tris: 2,
      prims: 1,
      matrices: compose(
        list.map((p) => ({ x: p.worldX, z: p.worldZ, rotation: 0, scale: p.scale })),
      ),
      local: [
        -reach,
        -cell.pivotV * cell.sideM * stretch,
        -reach,
        reach,
        (1 - cell.pivotV) * cell.sideM * stretch,
        reach,
      ],
    });
  }
});

const extent = landscape.size * landscape.cellSizeM;
const instances = groups.reduce((sum, g) => sum + g.matrices.length / 16, 0);
const allTris = groups.reduce((sum, g) => sum + (g.tris * g.matrices.length) / 16, 0);
const allDraws = groups.reduce((sum, g) => sum + g.prims, 0);
console.log(`seed ${seed}, krajina ${extent} m, ${groups.length} meshů, ${instances} instancí`);
console.log(`bez ořezu: ${(allTris / 1e6).toFixed(2)} M trojúhelníků, ${allDraws} draw callů`);

const engine = new NullEngine({
  renderWidth: 1512,
  renderHeight: 900,
  textureSize: 256,
  deterministicLockstep: false,
  lockstepMaxSteps: 1,
});
const scene = new Scene(engine);
const site = tileCenter(landscape, landscape.villageSite.x, landscape.villageSite.y);
for (const count of [8, 16, 32]) {
  const grid = chunkGrid(extent, count);
  const prepared = groups.map((g) => {
    const chunk = chunkOrder(g.matrices, grid);
    return { g, chunk, bounds: chunkBounds(g.matrices, chunk, g.local) };
  });
  const union = emptyBounds(count * count);
  for (const p of prepared) mergeBounds(union, p.bounds);
  for (const radius of [120, 400, 1400]) {
    const target = new Vector3(site.worldX, height(site.worldX, site.worldZ), site.worldZ);
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, 0.85, radius, target, scene);
    camera.fov = Math.PI / 4;
    camera.minZ = 1;
    camera.maxZ = 6000;
    const planes = Frustum.GetPlanes(
      camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)),
    );
    const data = Float64Array.from(
      planes.flatMap((p) => [p.normal.x, p.normal.y, p.normal.z, p.d]),
    );
    const started = performance.now();
    const visible = [...Array(count * count).keys()].filter((c) => boxInFrustum(union, c, data));
    let tris = 0;
    let draws = 0;
    for (const { g, chunk, bounds } of prepared) {
      const drawn = visible
        .filter((c) => boxInFrustum(bounds, c, data))
        .reduce((sum, c) => sum + chunk.offsets[c + 1]! - chunk.offsets[c]!, 0);
      if (drawn === 0) continue;
      draws += g.prims;
      tris += drawn * g.tris;
    }
    const ms = performance.now() - started;
    console.log(
      `${count}×${count} (${(extent / count).toFixed(0)} m), odstup ${radius} m: ${visible.length} čtverců, ` +
        `${(tris / 1e6).toFixed(3)} M trojúhelníků (${((100 * tris) / allTris).toFixed(1)} %), ` +
        `${draws} draw callů, testy ${ms.toFixed(2)} ms`,
    );
    camera.dispose();
  }
}
scene.dispose();
engine.dispose();
