import '@babylonjs/core/Meshes/thinInstanceMesh';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { HEIGHT_SCALE } from '../constants';
import { InstanceHider } from '../instance-hider';
import { addSunShadows } from '../sun-shadows';
import { setStaticInstances } from '../instanced-model';
import { chunkGrid } from '../scenery-chunks';
import { SHADOW_ONLY_LAYER, SceneryCulling } from '../scenery-culling';

const COUNT = 2000;

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Stromy po krajině 1 920 m (model 2 × 10 × 2 m s patou v počátku). */
function treeMatrices(count: number, seed = 1): Float32Array {
  const next = random(seed);
  const out = new Float32Array(count * 16);
  const matrix = new Matrix();
  for (let i = 0; i < count; i++) {
    const scale = 0.7 + next() * 0.8;
    Matrix.ComposeToRef(
      new Vector3(scale, scale, scale),
      Quaternion.RotationAxis(Vector3.Up(), next() * 6.28),
      new Vector3(-960 + next() * 1920, next() * 30, -960 + next() * 1920),
      matrix,
    );
    matrix.copyToArray(out, i * 16);
  }
  return out;
}

/** Instance v bufferu meshe jako řetězce matic (porovnání bez ohledu na pořadí). */
function drawn(mesh: Mesh): string[] {
  if (!mesh.isEnabled()) return [];
  const data = (mesh as unknown as { _thinInstanceDataStorage: { matrixData: Float32Array } })
    ._thinInstanceDataStorage.matrixData;
  const out: string[] = [];
  for (let i = 0; i < mesh.thinInstanceCount; i++)
    out.push(data.slice(i * 16, i * 16 + 16).join(','));
  return out.sort();
}

function all(matrices: Float32Array, skip: (i: number) => boolean = () => false): string[] {
  const out: string[] = [];
  for (let i = 0; i < matrices.length / 16; i++) {
    if (!skip(i)) out.push(matrices.slice(i * 16, i * 16 + 16).join(','));
  }
  return out.sort();
}

let engine: NullEngine;
let scene: Scene;
let camera: ArcRotateCamera;
let culling: SceneryCulling;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  camera = new ArcRotateCamera('camera', -Math.PI / 2, 0.85, 120, new Vector3(100, 0, -200), scene);
  camera.minZ = 1;
  camera.maxZ = 6000;
  scene.activeCamera = camera;
  culling = new SceneryCulling(scene, chunkGrid(1920));
});

afterEach(() => {
  culling.dispose();
  scene.dispose();
  engine.dispose();
});

function tree(name = 'trees-oak-1', matrices = treeMatrices(COUNT), ids?: Uint32Array): Mesh {
  const mesh = CreateBox(name, { width: 2, height: 10, depth: 2 }, scene);
  mesh.bakeTransformIntoVertices(Matrix.Translation(0, 5, 0));
  mesh.material = new StandardMaterial('m', scene);
  setStaticInstances(mesh, matrices, { ids });
  return mesh;
}

describe('SceneryCulling – ořez po čtvercích', () => {
  it('kamera kreslí klon, původní mesh se všemi instancemi jen stínová mapa', () => {
    const source = tree();
    const view = culling.viewOf(source)!;
    expect(view).not.toBeNull();
    expect(view.name).toBe('view-trees-oak-1');
    expect(source.layerMask).toBe(SHADOW_ONLY_LAYER);
    expect(source.layerMask & camera.layerMask).toBe(0);
    expect(view.layerMask & camera.layerMask).not.toBe(0);
    // stejný materiál (roční období), stejné vrcholy, ale vlastní geometrie
    expect(view.material).toBe(source.material);
    expect(view.geometry).not.toBe(source.geometry);
    expect(Array.from(view.getVerticesData('position')!)).toEqual(
      Array.from(source.getVerticesData('position')!),
    );
    // zdroj má dál všechny instance (stínová mapa přes celou krajinu)
    expect(source.thinInstanceCount).toBe(COUNT);
  });

  it('buffery instancí klonu a zdroje jsou na GPU oddělené (Babylon je drží na geometrii)', () => {
    const matrices = treeMatrices(COUNT);
    const source = tree('trees-oak-1', matrices);
    culling.update(camera);
    const view = culling.viewOf(source)!;
    expect(view.thinInstanceCount).toBeGreaterThan(0);
    expect(view.thinInstanceCount).toBeLessThan(COUNT);
    // každý z nich kreslí svůj buffer – klon jen instance v záběru, zdroj všechny; dřív sdílená
    // geometrie vázala buffer zdroje i ke klonu (klon kreslil prvních N instancí odjinud)
    const ownBuffer = (mesh: Mesh): unknown =>
      (
        mesh as unknown as {
          _thinInstanceDataStorage: { matrixBuffer: { getBuffer(): unknown } };
        }
      )._thinInstanceDataStorage.matrixBuffer.getBuffer();
    const viewWorld = view.getVertexBuffer('world0')!;
    const sourceWorld = source.getVertexBuffer('world0')!;
    expect(viewWorld.getBuffer()).toBe(ownBuffer(view));
    expect(sourceWorld.getBuffer()).toBe(ownBuffer(source));
    expect(viewWorld.getBuffer()).not.toBe(sourceWorld.getBuffer());
    // skrytí ve zdroji (nový buffer zdroje) buffer klonu nepřepíše
    source.thinInstanceSetBuffer('matrix', matrices.slice(0, 32), 16, true);
    expect(view.getVertexBuffer('world0')!.getBuffer()).toBe(ownBuffer(view));
    expect(drawn(view).length).toBe(view.thinInstanceCount);
  });

  it('změny vrcholů zdroje (impostory se natáčejí ke kameře) se přenesou do klonu', () => {
    const source = tree('impostors-0');
    const view = culling.viewOf(source)!;
    source.markVerticesDataAsUpdatable('position', true);
    view.markVerticesDataAsUpdatable('position', true);
    const moved = Float32Array.from(source.getVerticesData('position')!, (v, i) => v + (i % 3));
    source.updateVerticesData('position', moved, false, false);
    expect([...view.getVerticesData('position')!]).toEqual([...moved]);
  });

  it('mesh pod rodičem se zrcadlením os (glTF __root__) a převýšením: ořez ve světových souřadnicích', () => {
    const matrices = treeMatrices(COUNT, 7);
    const root = new TransformNode('__root__', scene);
    root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
    root.scaling = new Vector3(1, HEIGHT_SCALE, -1);
    root.position.set(40, 0, -25);
    const mesh = CreateBox('trees-pine-1', { width: 2, height: 10, depth: 2 }, scene);
    mesh.bakeTransformIntoVertices(Matrix.Translation(0, 5, 0));
    mesh.parent = root;
    setStaticInstances(mesh, matrices);
    culling.update(camera);
    const view = culling.viewOf(mesh)!;
    const world = mesh.computeWorldMatrix(true);
    const planes = Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix()));
    const local = new BoundingBox(new Vector3(-1, 0, -1), new Vector3(1, 10, 1));
    const inView = all(matrices, (i) => {
      const box = new BoundingBox(
        local.minimum,
        local.maximum,
        Matrix.FromArray(matrices, i * 16).multiply(world),
      );
      return !BoundingBox.IsInFrustum(box.vectorsWorld, planes);
    });
    expect(inView.length).toBeGreaterThan(0);
    const got = new Set(drawn(view));
    for (const instance of inView) expect(got.has(instance)).toBe(true);
    expect(got.size).toBeLessThan(COUNT / 5);
    // obal klonu pro Babylon je ve světě tam, kde jsou instance v záběru
    expect(view.isInFrustum(planes)).toBe(true);
  });

  it('stínová mapa má zdroj se všemi instancemi a vrstvy nekontroluje – ořez kamery ji neovlivní', () => {
    const source = tree();
    const sun = new DirectionalLight('sun', new Vector3(-0.8, -0.6, -0.35), scene);
    addSunShadows(sun, { casters: [source], receivers: [], extentM: 1920 });
    const map = (sun.getShadowGenerator() as ShadowGenerator).getShadowMap()!;
    expect(map.renderList).toContain(source);
    expect(map.renderList).not.toContain(culling.viewOf(source));
    expect(map.forceLayerMaskCheck).toBe(false);
    culling.update(camera);
    expect(source.thinInstanceCount).toBe(COUNT);
  });

  it('výchozí záběr: v bufferu kamery je každá instance, jejíž obal je v záběru, a málo jiných', () => {
    const matrices = treeMatrices(COUNT);
    const source = tree('trees-oak-1', matrices);
    culling.update(camera);
    const view = culling.viewOf(source)!;
    const planes = Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix()));
    const local = new BoundingBox(new Vector3(-1, 0, -1), new Vector3(1, 10, 1));
    const inView = all(matrices, (i) => {
      const box = new BoundingBox(local.minimum, local.maximum, Matrix.FromArray(matrices, i * 16));
      return !BoundingBox.IsInFrustum(box.vectorsWorld, planes);
    });
    const got = new Set(drawn(view));
    for (const instance of inView) expect(got.has(instance)).toBe(true);
    expect(inView.length).toBeGreaterThan(0);
    // ořez: zlomek všech instancí
    expect(got.size).toBeLessThan(COUNT / 10);
  });

  it('celá krajina v záběru: kamera kreslí stejné instance jako dřív (všechny)', () => {
    const matrices = treeMatrices(COUNT);
    const source = tree('trees-oak-1', matrices);
    camera.radius = 4000;
    camera.beta = 0.01;
    camera.target.set(0, 0, 0);
    culling.update(camera);
    expect(drawn(culling.viewOf(source)!)).toEqual(all(matrices));
  });

  it('InstanceHider skryje vykácené stromy v klonu i ve stínu a zvětšený strom roste v obou', () => {
    const matrices = treeMatrices(COUNT);
    const ids = Uint32Array.from({ length: COUNT }, (_, i) => 1000 + i);
    const source = tree('trees-oak-1', matrices, ids);
    const hider = new InstanceHider((mesh, m, hidden, colors) =>
      culling.setInstances(mesh, m, hidden, colors),
    );
    hider.track([source]);
    camera.radius = 4000;
    camera.beta = 0.01;
    camera.target.set(0, 0, 0);
    const felled = new Set([1000, 1005, 2999]);
    hider.apply([], felled, new Map([[1001, 1.5]]));
    culling.update(camera);
    const view = culling.viewOf(source)!;
    const got = drawn(view);
    expect(got).toHaveLength(COUNT - felled.size);
    expect(got).toEqual(drawn(source));
    // zvětšený strom (id 1001) – matice s měřítkem × 1,5 v klonu i ve zdroji
    const grown = Matrix.FromArray(matrices, 16);
    expect(got.some((m) => Math.abs(Number(m.split(',')[0]) - grown.m[0]! * 1.5) < 1e-5)).toBe(
      true,
    );
    // vrácení
    hider.apply([], new Set());
    culling.update(camera);
    expect(drawn(view)).toEqual(all(matrices));
  });

  it('vypnutý zdroj (bez instancí, vše skryté) vypne i klon; nové instance (les vsi) se přestaví', () => {
    const source = tree('decor-shrub-1', treeMatrices(50, 2));
    camera.radius = 4000;
    camera.beta = 0.01;
    camera.target.set(0, 0, 0);
    culling.update(camera);
    const view = culling.viewOf(source)!;
    expect(view.isEnabled()).toBe(true);
    source.setEnabled(false);
    culling.update(camera);
    expect(view.isEnabled()).toBe(false);
    source.setEnabled(true);
    const more = treeMatrices(80, 3);
    setStaticInstances(source, more);
    culling.update(camera);
    expect(culling.viewOf(source)).toBe(view);
    expect(drawn(view)).toEqual(all(more));
  });

  it('meshe mimo stromy, dekorace a impostory se neořezávají; zrušený zdroj zruší klon', () => {
    const fence = tree('woven-fence-post', treeMatrices(10, 4));
    expect(culling.viewOf(fence)).toBeNull();
    const source = tree('felled-stump');
    const view = culling.viewOf(source)!;
    source.dispose();
    expect(view.isDisposed()).toBe(true);
  });
});
