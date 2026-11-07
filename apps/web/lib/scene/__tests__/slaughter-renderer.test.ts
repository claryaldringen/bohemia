import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import type { HerdSpecies } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import { CARCASS, TRESTLE } from '../slaughter-plan';
import { CarcassPlugin, alignCarcass, carcassShifts } from '../slaughter-renderer';

const SPECIES: readonly HerdSpecies[] = ['cow', 'pig', 'sheep', 'goat'];

interface Glb {
  accessors: { bufferView: number; byteOffset?: number; count: number }[];
  bufferViews: { byteOffset?: number }[];
  meshes: { primitives: { attributes: { POSITION: number }; targets: { POSITION: number }[] }[] }[];
}

/**
 * Mršina z GLB jako ve scéně (`loadGeometry`): převod os z glTF zrcadlí x, klíče jsou
 * parabola přes pózy visí (−1), leží (0) a stojí (+1).
 */
function carcass(species: HerdSpecies): { base: Float32Array; a: Float32Array; b: Float32Array } {
  const url = new URL(`../../../public/models/fauna/carcass-${species}.glb`, import.meta.url);
  const bytes = readFileSync(fileURLToPath(url));
  const jsonLength = bytes.readUInt32LE(12);
  const glb = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Glb;
  const bin = 20 + jsonLength + 8;
  const read = (index: number): Float32Array => {
    const accessor = glb.accessors[index]!;
    const view = glb.bufferViews[accessor.bufferView]!;
    const offset = bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out = new Float32Array(accessor.count * 3);
    for (let i = 0; i < out.length; i++) out[i] = bytes.readFloatLE(offset + i * 4);
    return out;
  };
  const primitive = glb.meshes[0]!.primitives[0]!;
  const raw = read(primitive.attributes.POSITION);
  const stands = read(primitive.targets[0]!.POSITION);
  const hangs = read(primitive.targets[1]!.POSITION);
  const base = new Float32Array(raw.length);
  const a = new Float32Array(raw.length);
  const b = new Float32Array(raw.length);
  for (let j = 0; j < raw.length; j++) {
    const flip = j % 3 === 0 ? -1 : 1;
    const p = raw[j]! * flip;
    const s = (raw[j]! + stands[j]!) * flip;
    const h = (raw[j]! + hangs[j]!) * flip;
    base[j] = p;
    a[j] = (s - h) / 2;
    b[j] = (s + h) / 2 - p;
  }
  return { base, a, b };
}

/** Rozsah souřadnice `c` pózy p (−1 visí, 0 leží, 1 stojí). */
function range(
  g: { base: ArrayLike<number>; a: ArrayLike<number>; b: ArrayLike<number> },
  p: number,
  c: number,
): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (let j = c; j < g.base.length; j += 3) {
    const v = g.base[j]! + g.a[j]! * p + g.b[j]! * p * p;
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  return [low, high];
}

describe('mršina srovnaná na místo (alignCarcass)', () => {
  it('leží i stojí na zemi uprostřed místa, visí kotvou háku nad počátkem', () => {
    for (const species of SPECIES) {
      const g = carcass(species);
      const top = range(g, -1, 1)[1];
      const vertexData = new VertexData();
      vertexData.positions = g.base;
      const aligned = alignCarcass({
        vertexData,
        keyA: g.a,
        keyB: g.b,
        keyC: null,
        texture: null,
      });
      const out = { base: aligned.vertexData.positions!, a: aligned.keyA, b: aligned.keyB };
      for (const pose of [0, 1]) {
        expect(range(out, pose, 1)[0]).toBeCloseTo(0, 5);
        const [x0, x1] = range(out, pose, 0);
        const [z0, z1] = range(out, pose, 2);
        expect((x0 + x1) / 2).toBeCloseTo(0, 5);
        expect((z0 + z1) / 2).toBeCloseTo(0, 5);
      }
      // výška visícího se nemění (CARCASS.hangTop je v souřadnicích GLB), kotva nad počátkem
      expect(range(out, -1, 1)[1]).toBeCloseTo(top, 5);
      const shift = carcassShifts(out.base, out.a, out.b);
      expect(Math.hypot(shift.hang.x, shift.hang.z)).toBeLessThan(1e-5);
      // ležící zvíře má délku a šíři z plánu (CARCASS.length, halfWidth – místo na dvoře)
      expect(range(out, 0, 2)[1] - range(out, 0, 2)[0]).toBeCloseTo(CARCASS[species].length, 1);
    }
  });

  it('visí hlavou dolů: kopyta kousek nad háky, hlava nad zemí (kozlina podle druhu)', () => {
    for (const species of SPECIES) {
      const g = carcass(species);
      const hooks = species === 'cow' ? TRESTLE.large.hookY : TRESTLE.small.hookY;
      const lift = hooks - CARCASS[species].hangTop;
      const [bottom, top] = range(g, -1, 1);
      expect(lift + top - hooks).toBeGreaterThan(0.05);
      expect(lift + top - hooks).toBeLessThan(0.2);
      expect(lift + bottom).toBeGreaterThan(0.03);
      // hlava (přední konec stojícího zvířete, +z) je dole – zadní nohy nahoře
      let head = 0;
      let tail = 0;
      const [z0, z1] = range(g, 1, 2);
      let heads = 0;
      let tails = 0;
      for (let j = 0; j < g.base.length; j += 3) {
        const z = g.base[j + 2]! + g.a[j + 2]! + g.b[j + 2]!;
        const y = g.base[j + 1]! - g.a[j + 1]! + g.b[j + 1]!;
        if (z > z1 - 0.1) {
          head += y;
          heads++;
        } else if (z < z0 + 0.1) {
          tail += y;
          tails++;
        }
      }
      expect(head / heads).toBeLessThan(tail / tails);
    }
  });
});

describe('shader mršiny (CarcassPlugin)', () => {
  it('póza a stav instance – 7 vertex bufferů, čtvrtiny zahodí fragment (GLSL i WGSL)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial('carcass', scene);
    const plugin = new CarcassPlugin(material);
    const attributes: string[] = [];
    plugin.getAttributes(attributes);
    // pozice, normála, uv + klíče stojí/visí + stav instance + matice instance (WebGPU ≤ 8)
    expect(3 + attributes.length + 1).toBe(7);
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const vertex = plugin.getCustomCode('vertex', language);
      const fragment = plugin.getCustomCode('fragment', language);
      expect(vertex?.['CUSTOM_VERTEX_UPDATE_POSITION']).toContain('carcassKeyB');
      expect(fragment?.['CUSTOM_FRAGMENT_MAIN_BEGIN']).toContain('discard');
    }
    scene.dispose();
    engine.dispose();
  });
});
