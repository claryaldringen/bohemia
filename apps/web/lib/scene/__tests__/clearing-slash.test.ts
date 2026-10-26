import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { packObstacles } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneVillage } from '../../village-view';
import { ClearingSlash, charRemnantVertexData, slashHeapVertexData } from '../clearing-slash';

const part = (id: number, x: number, extra: Partial<SceneFieldPart>): SceneFieldPart => ({
  id,
  cell: { x, y: 16 },
  x: x * 15 - 232.5,
  z: 7.5,
  size: 15,
  stage: 'founding',
  ...extra,
});
const village = (parts: SceneFieldPart[]): Pick<SceneVillage, 'fields' | 'dwellings'> => ({
  dwellings: [],
  fields: [{ id: 1, parts }],
});

describe('ClearingSlash – sítě hromad větví a ohořelých zbytků', () => {
  it('sítě mají jen pozici, normálu a barvu – s maticí instance 7 vertex bufferů (WebGPU ≤ 8)', () => {
    for (const data of [slashHeapVertexData(), charRemnantVertexData()]) {
      expect(data.uvs ?? null).toBeNull();
      expect(data.positions!.length / 3).toBe(data.colors!.length / 4);
      expect(data.normals!.length).toBe(data.positions!.length);
      // klacky leží nad zemí (pata sítě v 0)
      for (let i = 1; i < data.positions!.length; i += 3) {
        expect(data.positions![i]!).toBeGreaterThanOrEqual(-1e-9);
      }
    }
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const slash = new ClearingSlash(scene, {
      layer: packObstacles([], 32, 15),
      groundHeight: () => 0,
      addShadowCaster: () => {},
    });
    // paseka po kácení (samé větve) a dohořelý čtverec (samé ohořelé zbytky)
    const parts = [part(1, 20, { look: 'slash' }), part(2, 21, { look: 'burnt' })];
    expect(slash.update(village(parts))).toBe(true);
    // beze změny dílů a fází se nic nepřestaví
    expect(slash.update(village(parts.map((p) => ({ ...p }))))).toBe(false);
    for (const name of ['clearing-slash', 'clearing-char']) {
      const mesh = scene.getMeshByName(name) as Mesh | null;
      expect(mesh).not.toBeNull();
      expect(mesh!.thinInstanceCount).toBeGreaterThan(0);
      const buffers = Object.keys(mesh!.geometry?.getVertexBuffers() ?? {}).sort();
      expect(buffers).toEqual([
        'color',
        'normal',
        'position',
        'world0',
        'world1',
        'world2',
        'world3',
      ]);
    }
    // po první práci na spálenině nic
    expect(slash.update(village([parts[0]!, part(2, 21, { look: 'sown' })]))).toBe(true);
    expect(scene.getMeshByName('clearing-slash')!.isEnabled()).toBe(true);
    expect(scene.getMeshByName('clearing-char')!.isEnabled()).toBe(false);
    slash.dispose();
    scene.dispose();
    engine.dispose();
  });
});
