import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DwellingType } from '@bohemia/game';
import {
  DECAY_LOOKS,
  DECAY_STAGES,
  decayModelParts,
  decayNettles,
  decayStage,
  ruinHollowData,
  ruinHollowY,
  ruinLook,
  ruinPitShape,
} from '../dwelling-decay';
import { PIT_SHAPES, insidePit, worldToLocal } from '../dwelling-pit';

const TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
const POSITION = { x: 12, z: -7, rotation: 0.7 };

/** Uzly s meshem a jména materiálů v GLB (JSON blok souboru). */
function glb(file: string): { nodes: string[]; materials: string[] } {
  const data = readFileSync(join(__dirname, '../../../public/models', file));
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; mesh?: number }[];
    materials: { name?: string }[];
  };
  return {
    nodes: json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? ''),
    materials: json.materials.map((m) => m.name ?? ''),
  };
}

describe('stupně rozpadu obydlí', () => {
  it('stav 100–70 % celý dům, 70–45 sešlý, 45–20 propadá se, 20–0 zřícený; bez údaje celý', () => {
    expect(decayStage(undefined)).toBe(0);
    expect(decayStage(1)).toBe(0);
    expect(decayStage(0.7)).toBe(0);
    expect(decayStage(0.69)).toBe(1);
    expect(decayStage(0.45)).toBe(1);
    expect(decayStage(0.44)).toBe(2);
    expect(decayStage(0.2)).toBe(2);
    expect(decayStage(0.19)).toBe(3);
    expect(decayStage(0)).toBe(3);
  });

  it('s rozpadem střecha méně kryje jámu, hlína zarůstá; plot a záhony od propadající se střechy', () => {
    for (let k = 1; k < DECAY_STAGES.length; k++) {
      const [a, b] = [DECAY_LOOKS[DECAY_STAGES[k - 1]!], DECAY_LOOKS[DECAY_STAGES[k]!]];
      expect(b.roofCover).toBeLessThan(a.roofCover);
      expect(b.earth).toBeLessThanOrEqual(a.earth);
      expect(b.fence).toBeGreaterThanOrEqual(a.fence);
      expect(b.beds).toBeGreaterThanOrEqual(a.beds);
    }
    expect(DECAY_LOOKS[1].fence).toBe(0);
    expect(DECAY_LOOKS[2].fence).toBeGreaterThan(0);
    expect(DECAY_LOOKS[2].beds).toBeGreaterThan(0);
    // ze zřícené střechy nestoupá dým
    expect(DECAY_LOOKS[2].smoke).toBe(true);
    expect(DECAY_LOOKS[3].smoke).toBe(false);
  });

  it('celý dům je hotový model; díly rozpadu a zbytku jámy jsou v decay.glb', () => {
    const { nodes, materials } = glb('dwellings/decay.glb');
    for (const type of TYPES) {
      expect(decayModelParts(type, 0)).toEqual([]);
      for (const stage of [1, 2, 3] as const) {
        for (const part of decayModelParts(type, stage)) expect(nodes).toContain(part);
      }
      for (const suffix of ['ruin', 'ruin-late', 'ruin-berms']) {
        expect(nodes).toContain(`${type}-${suffix}`);
      }
    }
    expect(nodes).toContain('nettle');
    expect(materials).toEqual(
      expect.arrayContaining(['dwelling-atlas', 'decay-faded', 'decay-moss', 'decay-nettle']),
    );
  });
});

describe('zbytek jámy', () => {
  it('prohlubeň se zasypává, trámy hnijí, valy se srovnají; kopřivy nejbujnější pár let po zániku', () => {
    for (const type of TYPES) {
      const looks = [0, 0.2, 0.5, 0.85, 1].map((g) => ruinLook(type, g));
      for (let i = 1; i < looks.length; i++) {
        expect(looks[i]!.depth).toBeLessThan(looks[i - 1]!.depth);
        expect(looks[i]!.berms).toBeLessThan(looks[i - 1]!.berms);
      }
      expect(looks[0]!.depth).toBeLessThan(PIT_SHAPES[type].depth);
      expect(looks.map((l) => l.beams)).toEqual(['ruin', 'ruin', 'ruin-late', null, null]);
      expect(looks[1]!.nettles.scale).toBeGreaterThan(looks[0]!.nettles.scale);
      expect(looks[1]!.nettles.scale).toBeGreaterThan(looks[4]!.nettles.scale);
    }
    // vzhled jen po krocích 5 %
    expect(ruinLook('zemnice', 0.31)).toEqual(ruinLook('zemnice', 0.29));
  });

  it('řez terénu jen obdélník jámy – šíje je zasypaná', () => {
    for (const type of TYPES) {
      const shape = ruinPitShape(type);
      const pit = PIT_SHAPES[type];
      expect(insidePit(shape, 0, 0)).toBe(true);
      expect(insidePit(shape, 0, pit.halfZ + 0.3)).toBe(false);
      expect(insidePit(pit, 0, pit.halfZ + 0.3)).toBe(true);
      expect(shape.rampEndZ).toBe(pit.halfZ);
    }
  });

  it('síť prohlubně: okraj na terénu, uprostřed dno, nikde nad terénem; kopřivy stojí na ní', () => {
    const rim = (x: number, z: number): number => 3 + 0.05 * x - 0.02 * z;
    for (const type of TYPES) {
      const base = rim(POSITION.x, POSITION.z) - 0.05;
      const depth = ruinLook(type, 0).depth;
      const data = ruinHollowData(type, POSITION, { base, depth, rim, overgrowth: 0 });
      const { halfX, halfZ } = PIT_SHAPES[type];
      let lowest = Infinity;
      for (let v = 0; v < data.positions.length / 3; v++) {
        const [x, y, z] = [
          data.positions[v * 3]!,
          data.positions[v * 3 + 1]!,
          data.positions[v * 3 + 2]!,
        ];
        const [lx, lz] = worldToLocal(POSITION, x, z);
        expect(Math.abs(lx)).toBeLessThanOrEqual(halfX + 1e-6);
        expect(Math.abs(lz)).toBeLessThanOrEqual(halfZ + 1e-6);
        const edge = Math.abs(Math.abs(lx) - halfX) < 1e-6 || Math.abs(Math.abs(lz) - halfZ) < 1e-6;
        if (edge) expect(y).toBeCloseTo(rim(x, z) + 0.015, 6);
        else {
          expect(y).toBeLessThanOrEqual(rim(x, z) + 1e-9);
          expect(y).toBeCloseTo(ruinHollowY(type, POSITION, { base, depth, rim }, x, z), 6);
        }
        lowest = Math.min(lowest, y);
      }
      expect(lowest).toBeCloseTo(base - depth, 1);
      expect(data.indices.length % 3).toBe(0);
      expect(Math.max(...data.indices)).toBeLessThan(data.positions.length / 3);
      // mimo jámu výška terénu
      expect(ruinHollowY(type, POSITION, { base, depth, rim }, POSITION.x + 20, POSITION.z)).toBe(
        rim(POSITION.x + 20, POSITION.z),
      );
    }
  });

  it('kopřivy: pevně podle seedu, u domu za valy a ne před vchodem, v jámě po okraji', () => {
    for (const type of TYPES) {
      const house = decayNettles(type, POSITION, 4, 6, 1, 'house');
      expect(house).toHaveLength(6);
      expect(decayNettles(type, POSITION, 4, 6, 1, 'house')).toEqual(house);
      expect(decayNettles(type, POSITION, 5, 6, 1, 'house')).not.toEqual(house);
      const { halfX, halfZ } = PIT_SHAPES[type];
      for (const n of house) {
        const [lx, lz] = worldToLocal(POSITION, n.x, n.z);
        // mimo jámu (za valy) a vpředu u vchodu nic
        expect(Math.abs(lx) > halfX || Math.abs(lz) > halfZ).toBe(true);
        expect(lz).toBeLessThan(halfZ + 0.5);
      }
      for (const n of decayNettles(type, POSITION, 9, 7, 0.8, 'pit')) {
        const [lx, lz] = worldToLocal(POSITION, n.x, n.z);
        expect(Math.abs(lx)).toBeLessThan(halfX + 0.7);
        expect(Math.abs(lz)).toBeLessThan(halfZ + 0.7);
        expect(n.scale).toBeGreaterThan(0.5);
        expect(n.scale).toBeLessThan(1.1);
      }
      expect(decayNettles(type, POSITION, 1, 0, 1, 'pit')).toEqual([]);
    }
  });
});
