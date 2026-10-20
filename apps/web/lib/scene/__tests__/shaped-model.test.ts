import '@babylonjs/core/Meshes/thinInstanceMesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAIN_FRAME, shapeFrame, shapeX, shapeY, shapeZ } from '@bohemia/game';
import { SHAPE_BONES, shapeRegion } from '../shape-bones';
import { isShapeable, makeShapeable, setShapeFrames, shapeGhost } from '../shaped-model';

// population.md – Varianty rozměrů: model domu v instancích dostane kosti oblastí a VAT se
// snímkem na variantu; duch u kurzoru tvar do vlastních vrcholů (geometrie modelu se nemění).

const engine = new NullEngine({
  renderWidth: 64,
  renderHeight: 64,
  textureSize: 64,
  deterministicLockstep: false,
  lockstepMaxSteps: 1,
});
const scene = new Scene(engine);
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** „Dům“ z pár vrcholů v různých oblastech (dveře, stěny, šíje, pod terénem). */
function house(name: string): Mesh {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = [-2.5, 0, -2, 2.5, 0, -2, 0.3, 2.4, 1, 0, -0.5, 3, -0.42, 0.8, 2.1, 2.5, 1, 2.1];
  data.indices = [0, 1, 2, 3, 4, 5];
  data.normals = new Array<number>(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0));
  data.applyToMesh(mesh);
  return mesh;
}

const FRAME = shapeFrame('polozemnice', { area: 1.1, ratio: 0.92, height: 1.08 });

describe('model v instancích', () => {
  it('každý vrchol dostane kost své oblasti s váhou 1', () => {
    const mesh = house('dum');
    makeShapeable(mesh, 'polozemnice');
    expect(isShapeable(mesh)).toBe(true);
    expect(mesh.skeleton?.bones).toHaveLength(SHAPE_BONES);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const bones = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
    const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
    for (let i = 0; i < positions.length / 3; i++) {
      const [x, y, z] = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
      expect(bones[i * 4]).toBe(shapeRegion('polozemnice', x, y, z));
      expect(weights[i * 4]).toBe(1);
    }
  });

  it('instance se stejnou variantou sdílejí snímek, dnešní tvar je snímek 0', () => {
    const mesh = house('dum-2');
    makeShapeable(mesh, 'polozemnice');
    const matrices = new Float32Array(48);
    for (let i = 0; i < 3; i++)
      matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * 10, 0, 0, 1], i * 16);
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    setShapeFrames(mesh, [FRAME, PLAIN_FRAME, FRAME]);
    const vat = mesh.bakedVertexAnimationManager?.texture;
    expect(vat?.getSize()).toEqual({ width: SHAPE_BONES * 4, height: 2 });
    // nastavení snímku na instanci: od–do stejný snímek, rychlost 0
    const storage = (
      mesh as unknown as {
        _userThinInstanceBuffersStorage?: { data: Record<string, Float32Array> };
      }
    )._userThinInstanceBuffersStorage;
    expect([...storage!.data['bakedVertexAnimationSettingsInstanced']!]).toEqual([
      1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0,
    ]);
  });
});

describe('duch u kurzoru', () => {
  it('tvar varianty do vlastních vrcholů – model (sdílená geometrie) zůstane', () => {
    const model = house('vzor');
    const ghost = model.clone('duch');
    const before = Float32Array.from(model.getVerticesData(VertexBuffer.PositionKind)!);
    shapeGhost(ghost, FRAME);
    shapeGhost(ghost, FRAME);
    expect(Float32Array.from(model.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(before);
    const shaped = ghost.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < before.length; i += 3) {
      expect(shaped[i]).toBeCloseTo(shapeX(FRAME, before[i]!), 5);
      expect(shaped[i + 1]).toBeCloseTo(shapeY(FRAME, before[i + 1]!), 5);
      expect(shaped[i + 2]).toBeCloseTo(shapeZ(FRAME, before[i + 2]!), 5);
    }
    // zpět na dnešní tvar
    shapeGhost(ghost, PLAIN_FRAME);
    expect(Float32Array.from(ghost.getVerticesData(VertexBuffer.PositionKind)!)).toEqual(before);
  });
});
