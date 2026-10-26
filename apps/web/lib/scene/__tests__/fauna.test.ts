import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/** Úvodní JSON část GLB (bez Babylonu – jen počty atributů, morph targetů a klipů). */
interface GlbJson {
  meshes: { primitives: { attributes: Record<string, number>; targets?: unknown[] }[] }[];
  animations?: { name: string }[];
}

function readGlb(relativePath: string): GlbJson {
  const url = new URL(`../../../public/models/${relativePath}`, import.meta.url);
  const bytes = readFileSync(fileURLToPath(url));
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GlbJson;
}

/** Vertex buffery zvířete ve scéně: atributy GLB + morph targety (klíčové pózy) + „stav“
 *  instance (livestock.ts). WebGPU dovoluje nejvýš 8 (CLAUDE.md). */
function livestockBuffers(name: string): number {
  const primitive = readGlb(`fauna/${name}.glb`).meshes[0]?.primitives[0];
  if (!primitive) throw new Error(`${name}: GLB bez meshe`);
  return Object.keys(primitive.attributes).length + (primitive.targets?.length ?? 0) + 1;
}

describe('modely koně a hříběte z 0 A.D.', () => {
  it('kůň a hříbě mají stejné buffery jako kráva a vejdou se do 8', () => {
    for (const name of ['horse', 'foal']) {
      expect(livestockBuffers(name)).toBe(livestockBuffers('cow'));
      expect(livestockBuffers(name)).toBeLessThanOrEqual(8);
    }
  });

  it('kůň a hříbě mají tři klíčové pózy (krok, krok, pastva)', () => {
    for (const name of ['horse', 'foal']) {
      expect(readGlb(`fauna/${name}.glb`).meshes[0]?.primitives[0]?.targets).toHaveLength(3);
    }
  });
});

describe('jezdec a výcvik – postava man.glb', () => {
  it('nepřidává vertex atributy a nese klipy sedu a výcviku', () => {
    const glb = readGlb('people/man.glb');
    const attributes = Object.keys(glb.meshes[0]?.primitives[0]?.attributes ?? {}).sort();
    expect(attributes).toEqual(['JOINTS_0', 'NORMAL', 'POSITION', 'TEXCOORD_0', 'WEIGHTS_0']);
    const clips = (glb.animations ?? []).map((a) => a.name);
    for (const name of [
      'ride',
      'ride-trot',
      'ride-idle',
      'bow-draw',
      'bow-release',
      'spear-thrust',
      'sword-strike',
      'shield-block',
      'butcher',
      'bleed',
      'gut',
      'carry-meat',
      'carry-meat-idle',
    ]) {
      expect(clips).toContain(name);
    }
  });
});
