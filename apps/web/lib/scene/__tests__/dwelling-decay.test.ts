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
  dwellingDecayStage,
  logHouseRemains,
  ruinHollowData,
  ruinHollowY,
  ruinLook,
  ruinPitShape,
} from '../dwelling-decay';
import { PIT_SHAPES, hasPit, insidePit, worldToLocal } from '../dwelling-pit';
import { decalGrid } from '../village-layout';

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
  });

  it('rozpadá se jen prázdné obydlí – obydlené je celé i s nízkým stavem; dílny zatím celé', () => {
    expect(dwellingDecayStage({ condition: 0.1, inhabited: false })).toBe(3);
    expect(dwellingDecayStage({ condition: 0.5, inhabited: false })).toBe(1);
    // obyvatelé dům opravují (Martin) – i znovu osídlený zchátralý dům je celý
    expect(dwellingDecayStage({ condition: 0.1, inhabited: true })).toBe(0);
    expect(dwellingDecayStage({ condition: 0.1 })).toBe(0);
    expect(dwellingDecayStage({ condition: 0.1, inhabited: false, craft: 'potter' })).toBe(0);
    expect(dwellingDecayStage({ inhabited: false })).toBe(0);
  });

  it('celý dům je hotový model; díly rozpadu a zbytku jámy jsou v decay.glb', () => {
    const { nodes, materials } = glb('dwellings/decay.glb');
    for (const type of TYPES) {
      expect(decayModelParts(type, 0)).toEqual([]);
      for (const stage of [1, 2, 3] as const) {
        for (const part of decayModelParts(type, stage)) expect(nodes).toContain(part);
      }
      for (const suffix of ['ruin', 'ruin-late']) expect(nodes).toContain(`${type}-${suffix}`);
      // ploché pruhované „valy“ zbytku jámy už nejsou – val je součástí prohlubně
      expect(nodes).not.toContain(`${type}-ruin-berms`);
    }
    expect(nodes).toContain('nettle');
    expect(materials).toEqual(
      expect.arrayContaining(['dwelling-atlas', 'decay-faded', 'decay-moss', 'decay-nettle']),
    );
  });
});

describe('zbytek jámy', () => {
  it('prohlubeň se zasypává, trámy hnijí; kopřivy nejbujnější pár let po zániku', () => {
    for (const type of TYPES) {
      const looks = [0, 0.2, 0.5, 0.85, 1].map((g) => ruinLook(type, g));
      for (let i = 1; i < looks.length; i++) {
        expect(looks[i]!.depth).toBeLessThan(looks[i - 1]!.depth);
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

  /** Trojúhelníky sítě: (p1 − p0) × (p2 − p0) – v Babylonu míří od pozorovatele. */
  function crossY(positions: ArrayLike<number>, indices: ArrayLike<number>, t: number): number {
    const p = (k: number): [number, number, number] => {
      const v = indices[t * 3 + k]!;
      return [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
    };
    const [a, b, c] = [p(0), p(1), p(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return u[2]! * w[0]! - u[0]! * w[2]!;
  }

  it('síť prohlubně má přední stranu nahoru jako terén – shora je vidět (jinak prosvítá obloha)', () => {
    // terén a obtisky (decalGrid) – stejné dělení čtverce: v Babylonu (b−a)×(c−a) míří dolů
    const grid = decalGrid({ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, 1, () => 1);
    const flat = new Float32Array((grid.positions.length / 2) * 3);
    for (let v = 0; v < grid.positions.length / 2; v++) {
      flat[v * 3] = grid.positions[v * 2]!;
      flat[v * 3 + 2] = grid.positions[v * 2 + 1]!;
    }
    for (let t = 0; t < grid.indices.length / 3; t++) {
      expect(crossY(flat, grid.indices, t)).toBeLessThan(0);
    }
    const rim = (x: number, z: number): number => 3 + 0.05 * x - 0.02 * z;
    for (const type of TYPES) {
      for (const rotation of [0, 0.7, Math.PI, -2.1]) {
        const position = { ...POSITION, rotation };
        const data = ruinHollowData(type, position, {
          base: 2.9,
          depth: ruinLook(type, 0).depth,
          rim,
          overgrowth: 0.3,
        });
        for (let t = 0; t < data.indices.length / 3; t++) {
          expect(crossY(data.positions, data.indices, t)).toBeLessThan(0);
        }
      }
    }
  });

  it('síť prohlubně: lem za řezem těsně nad terénem, uvnitř val a dno, žádné NaN; kopřivy na ní', () => {
    const rim = (x: number, z: number): number => 3 + 0.05 * x - 0.02 * z;
    for (const type of TYPES) {
      const base = rim(POSITION.x, POSITION.z) - 0.05;
      const depth = ruinLook(type, 0).depth;
      const hollow = { base, depth, rim, overgrowth: 0 };
      const data = ruinHollowData(type, POSITION, hollow);
      const { halfX, halfZ } = PIT_SHAPES[type];
      let lowest = Infinity;
      let highest = -Infinity;
      for (const v of [...data.positions, ...data.uvs, ...data.colors]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      for (let v = 0; v < data.positions.length / 3; v++) {
        const [x, y, z] = [
          data.positions[v * 3]!,
          data.positions[v * 3 + 1]!,
          data.positions[v * 3 + 2]!,
        ];
        const [lx, lz] = worldToLocal(POSITION, x, z);
        // síť přesahuje řez terénu (obdélník jámy) jen o úzký lem
        expect(Math.abs(lx)).toBeLessThanOrEqual(halfX + 0.08 + 1e-6);
        expect(Math.abs(lz)).toBeLessThanOrEqual(halfZ + 0.08 + 1e-6);
        const inside = Math.abs(lx) < halfX && Math.abs(lz) < halfZ;
        if (!inside) expect(y).toBeCloseTo(rim(x, z) + 0.015, 6);
        else {
          // síť je ve Float32 – na desetiny milimetru
          expect(y).toBeCloseTo(ruinHollowY(type, POSITION, hollow, x, z), 4);
          // nízký val po okraji – nejvýš pár decimetrů nad terénem
          expect(y).toBeLessThanOrEqual(rim(x, z) + 0.16 + 1e-9);
          highest = Math.max(highest, y - rim(x, z));
        }
        lowest = Math.min(lowest, y);
      }
      expect(lowest).toBeCloseTo(base - depth, 1);
      expect(highest).toBeGreaterThan(0.03);
      expect(data.indices.length % 3).toBe(0);
      expect(Math.max(...data.indices)).toBeLessThan(data.positions.length / 3);
      // mimo jámu výška terénu; zarostlý val se s časem srovná
      expect(ruinHollowY(type, POSITION, hollow, POSITION.x + 20, POSITION.z)).toBe(
        rim(POSITION.x + 20, POSITION.z),
      );
      const [ex, ez] = [halfX - 0.4, 0];
      const c = Math.cos(POSITION.rotation);
      const s = Math.sin(POSITION.rotation);
      const bankAt = (overgrowth: number): number => {
        const x = POSITION.x + ex * c + ez * s;
        const z = POSITION.z - ex * s + ez * c;
        return ruinHollowY(type, POSITION, { ...hollow, overgrowth }, x, z) - rim(x, z);
      };
      expect(bankAt(1)).toBeLessThan(bankAt(0));
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

describe('zbytky nadzemního srubu (log-house.md – Scéna)', () => {
  /** Jména uzlů s meshem v GLB (JSON blok souboru). */
  const glbNodes = (file: string): Set<string> => {
    const data = readFileSync(join(__dirname, '../../../public/models/dwellings', file));
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
      nodes: { name?: string; mesh?: number }[];
    };
    return new Set(json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name ?? ''));
  };

  it('srub jámu nemá – žádná prohlubeň ani díly decay.glb, obydlí s jámou ano', () => {
    expect(hasPit('srub')).toBe(false);
    expect(hasPit('dvorec-srub')).toBe(false);
    expect(hasPit('polozemnice')).toBe(true);
    expect(ruinLook('srub', 0).depth).toBe(0);
    expect(decayModelParts('srub', 3)).toEqual([]);
    expect(logHouseRemains('polozemnice', 3)).toBeNull();
  });

  it('sešlý a propadající se stojí celý, zřícený jsou kameny a věnce, zbytek zarůstá', () => {
    for (const type of ['srub', 'dvorec-srub'] as const) {
      const nodes = glbNodes(`${type}-construction.glb`);
      expect(logHouseRemains(type, 1)).toBeNull();
      expect(logHouseRemains(type, 2)).toBeNull();
      const fallen = logHouseRemains(type, 3)!;
      expect(fallen.map((r) => r.part)).toContain(`${type}-stones`);
      for (const r of fallen) expect(nodes.has(r.part), r.part).toBe(true);
      // věnce leží na kamenech o věnec níž – nejspodnější s nitrem za dveřmi se nekreslí
      expect(fallen.filter((r) => r.part.includes('-logs-')).every((r) => r.drop > 0)).toBe(true);
      expect(fallen.map((r) => r.part)).not.toContain(`${type}-logs-1`);
      const fresh = logHouseRemains(type, 'ruin', 0)!;
      const late = logHouseRemains(type, 'ruin', 0.7)!;
      expect(fresh.length).toBeGreaterThan(late.length);
      expect(late.map((r) => r.part)).toEqual([`${type}-stones`]);
      expect(logHouseRemains(type, 'ruin', 1)).toEqual([]);
    }
  });
});

describe('zbytky vypleteného domu (log-house.md – Dům s vypletenými stěnami)', () => {
  it('bez jámy; zřícený jsou kůly a sesutá mazanice, zbytek zarůstá – díly z vypleteny-construction.glb', () => {
    expect(hasPit('vypleteny')).toBe(false);
    expect(decayModelParts('vypleteny', 3)).toEqual([]);
    expect(logHouseRemains('vypleteny', 1)).toBeNull();
    expect(logHouseRemains('vypleteny', 2)).toBeNull();
    const data = readFileSync(
      join(__dirname, '../../../public/models/dwellings/vypleteny-construction.glb'),
    );
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
      nodes: { name?: string }[];
    };
    const nodes = new Set(json.nodes.map((n) => n.name ?? ''));
    const ruined = logHouseRemains('vypleteny', 3)!;
    expect(ruined.map((r) => r.part)).toEqual(['vypleteny-piles', 'vypleteny-daub-1']);
    for (const r of ruined) expect(nodes.has(r.part), r.part).toBe(true);
    expect(logHouseRemains('vypleteny', 'ruin', 0.2)!.map((r) => r.part)).toEqual([
      'vypleteny-daub-1',
    ]);
    expect(logHouseRemains('vypleteny', 'ruin', 0.7)).toEqual([]);
  });
});
