import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import {
  boxInFrustum,
  chunkBounds,
  chunkGrid,
  chunkIndexOf,
  chunkOrder,
  compactChunks,
  transformBounds,
  type LocalBounds,
} from '../scenery-chunks';

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Náhodné instance po krajině 1 920 m: otočení, měřítko, někdy náklon (skály). */
function instances(count: number, seed = 1): Float32Array {
  const next = random(seed);
  const out = new Float32Array(count * 16);
  const matrix = new Matrix();
  for (let i = 0; i < count; i++) {
    const tilt =
      i % 3 === 0
        ? Quaternion.RotationAxis(new Vector3(1, 0, 0.4).normalize(), 0.5)
        : Quaternion.Identity();
    const rotation = tilt.multiply(Quaternion.RotationAxis(Vector3.Up(), next() * 6.28));
    const scale = 0.6 + next();
    Matrix.ComposeToRef(
      new Vector3(scale, scale, scale),
      rotation,
      new Vector3(-960 + next() * 1920, next() * 40, -960 + next() * 1920),
      matrix,
    );
    matrix.copyToArray(out, i * 16);
  }
  return out;
}

const GRID = chunkGrid(1920);
const LOCAL: LocalBounds = [-4, 0, -3, 5, 18, 4];

describe('chunkOrder – instance po čtvercích', () => {
  it('každá instance právě jednou, ve svém čtverci a uvnitř čtverce v původním pořadí', () => {
    const matrices = instances(500);
    const { order, offsets } = chunkOrder(matrices, GRID);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(500).keys()]);
    expect(offsets[offsets.length - 1]).toBe(500);
    for (let c = 0; c < offsets.length - 1; c++) {
      const members = [...order.slice(offsets[c], offsets[c + 1])];
      expect(members).toEqual([...members].sort((a, b) => a - b));
      for (const i of members) {
        expect(chunkIndexOf(GRID, matrices[i * 16 + 12]!, matrices[i * 16 + 14]!)).toBe(c);
      }
    }
  });

  it('body mimo krajinu padnou do okrajových čtverců', () => {
    expect(chunkIndexOf(GRID, -5000, -5000)).toBe(0);
    expect(chunkIndexOf(GRID, 5000, 5000)).toBe(GRID.count * GRID.count - 1);
  });
});

describe('chunkBounds – obal čtverce', () => {
  it('je stejný kvádr jako z 8 převedených rohů obalu modelu u všech instancí čtverce', () => {
    const matrices = instances(400, 3);
    const chunk = chunkOrder(matrices, GRID);
    const bounds = chunkBounds(matrices, chunk, LOCAL);
    const box = new BoundingBox(
      new Vector3(LOCAL[0], LOCAL[1], LOCAL[2]),
      new Vector3(LOCAL[3], LOCAL[4], LOCAL[5]),
    );
    for (let c = 0; c < chunk.offsets.length - 1; c++) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let k = chunk.offsets[c]!; k < chunk.offsets[c + 1]!; k++) {
        const m = Matrix.FromArray(matrices, chunk.order[k]! * 16);
        for (const corner of box.vectors) {
          const p = Vector3.TransformCoordinates(corner, m);
          [p.x, p.y, p.z].forEach((v, a) => {
            min[a] = Math.min(min[a]!, v);
            max[a] = Math.max(max[a]!, v);
          });
        }
      }
      const got = [...bounds.slice(c * 6, c * 6 + 6)];
      if (min[0] === Infinity) {
        expect(got[0]).toBe(Infinity);
        continue;
      }
      [...min, ...max].forEach((v, a) => expect(got[a]).toBeCloseTo(v, 3));
    }
  });
});

describe('boxInFrustum – kvádr v záběru kamery', () => {
  it('rozhodne stejně jako Babylon BoundingBox.IsInFrustum', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera(
      'c',
      -Math.PI / 2,
      0.85,
      120,
      new Vector3(20, 0, -40),
      scene,
    );
    camera.minZ = 1;
    camera.maxZ = 6000;
    const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
    const planes = Frustum.GetPlanes(transform);
    const data = Float64Array.from(
      planes.flatMap((p) => [p.normal.x, p.normal.y, p.normal.z, p.d]),
    );
    const next = random(9);
    let inside = 0;
    for (let k = 0; k < 2000; k++) {
      const x = -400 + next() * 800;
      const z = -400 + next() * 800;
      const min = new Vector3(x, next() * 10, z);
      const max = min.add(new Vector3(next() * 60, next() * 30, next() * 60));
      const bounds = Float32Array.from([min.x, min.y, min.z, max.x, max.y, max.z]);
      const expected = BoundingBox.IsInFrustum(new BoundingBox(min, max).vectorsWorld, planes);
      expect(boxInFrustum(bounds, 0, data)).toBe(expected);
      if (expected) inside++;
    }
    expect(inside).toBeGreaterThan(50);
    expect(
      boxInFrustum(
        Float32Array.from([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]),
        0,
        data,
      ),
    ).toBe(false);
    scene.dispose();
    engine.dispose();
  });
});

describe('compactChunks – instance viditelných čtverců', () => {
  it('kopíruje instance zadaných čtverců v pořadí po čtvercích a vynechá skryté', () => {
    const matrices = instances(300, 5);
    const chunk = chunkOrder(matrices, GRID);
    const chunks = [3, 17, 40, 41, 100];
    const hidden = new Uint8Array(300);
    const members = chunks.flatMap((c) => [
      ...chunk.order.slice(chunk.offsets[c], chunk.offsets[c + 1]),
    ]);
    hidden[members[0]!] = 1;
    const out = new Float32Array(matrices.length);
    const count = compactChunks(matrices, 16, chunk, chunks, hidden, out);
    const expected = members.filter((i) => !hidden[i]);
    expect(count).toBe(expected.length);
    expected.forEach((i, n) => {
      expect([...out.slice(n * 16, n * 16 + 16)]).toEqual([...matrices.slice(i * 16, i * 16 + 16)]);
    });
  });
});

describe('transformBounds – obaly čtverců do světa maticí meshe', () => {
  it('stejný kvádr jako 8 rohů převedených světovou maticí (zrcadlení os glTF, převýšení)', () => {
    const world = Matrix.Compose(
      new Vector3(1, 3, -1),
      Quaternion.RotationAxis(Vector3.Up(), Math.PI),
      new Vector3(40, 2, -25),
    );
    const bounds = Float32Array.from([
      -10,
      0,
      5,
      30,
      18,
      40,
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ]);
    const out = transformBounds(bounds, world.m);
    const box = new BoundingBox(new Vector3(-10, 0, 5), new Vector3(30, 18, 40), world);
    [...box.minimumWorld.asArray(), ...box.maximumWorld.asArray()].forEach((v, i) =>
      expect(out[i]).toBeCloseTo(v, 4),
    );
    // prázdný čtverec zůstane prázdný
    expect(out[6]).toBe(Infinity);
    expect(out[9]).toBe(-Infinity);
  });
});
