import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/** Úvodní JSON část GLB (bez Babylonu – jen počty atributů, morph targetů a klipů). */
interface GlbJson {
  meshes: {
    extras?: { targetNames?: string[] };
    primitives: { attributes: Record<string, number>; targets?: unknown[] }[];
  }[];
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

describe('divoká zvěř a pes z 0 A.D. (wild-*, dog)', () => {
  const NAMES = [
    'wild-boar',
    'wild-stag',
    'wild-hind',
    'wild-wolf',
    'wild-bear',
    'wild-fox',
    'wild-hare',
    'dog',
  ];

  it('mají nejvýš 8 vertex bufferů ve scéně a nejvýš 3 morph targety', () => {
    for (const name of NAMES) {
      expect(livestockBuffers(name), name).toBeLessThanOrEqual(8);
      const targets = readGlb(`fauna/${name}.glb`).meshes[0]?.primitives[0]?.targets;
      expect(targets?.length, name).toBeLessThanOrEqual(3);
    }
  });

  it('mají tři klíčové pózy (krok, krok, pastva nebo ležení)', () => {
    for (const name of NAMES) {
      expect(readGlb(`fauna/${name}.glb`).meshes[0]?.primitives[0]?.targets, name).toHaveLength(3);
    }
  });

  it('GLB má nejvýš 200 kB', () => {
    for (const name of NAMES) {
      const size = statSync(
        fileURLToPath(new URL(`../../../public/models/fauna/${name}.glb`, import.meta.url)),
      ).size;
      expect(size, name).toBeLessThanOrEqual(200_000);
    }
  });
});

describe('mršiny pro porážku (carcass-*)', () => {
  const NAMES = ['carcass-cow', 'carcass-pig', 'carcass-sheep', 'carcass-goat'];

  it('mají klíče stojí a visí (základ = leží) a o buffer méně než živé zvíře', () => {
    for (const name of NAMES) {
      const mesh = readGlb(`fauna/${name}.glb`).meshes[0];
      expect(mesh?.extras?.targetNames).toEqual(['stands', 'hangs']);
      expect(mesh?.primitives[0]?.targets).toHaveLength(2);
      // pozice, normála, uv + 2 klíče + stav instance + matice instance
      const buffers = livestockBuffers(name) + 1;
      expect(buffers).toBe(7);
      expect(buffers).toBeLessThanOrEqual(8);
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

describe('humno – postavy man.glb a woman.glb', () => {
  it('nepřidávají vertex atributy a nesou klipy mlácení holí a prohazování lopatou', () => {
    for (const file of ['people/man.glb', 'people/woman.glb']) {
      const glb = readGlb(file);
      const attributes = Object.keys(glb.meshes[0]?.primitives[0]?.attributes ?? {}).sort();
      // pozice, normála, uv, klouby a váhy + VAT a barva instance = 8 bufferů (CLAUDE.md)
      expect(attributes, file).toEqual([
        'JOINTS_0',
        'NORMAL',
        'POSITION',
        'TEXCOORD_0',
        'WEIGHTS_0',
      ]);
      const clips = (glb.animations ?? []).map((a) => a.name);
      expect(clips, file).toContain('thresh');
      expect(clips, file).toContain('winnow');
    }
  });
});
