import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fallbackGeometry } from '../sacred-fallback';
import {
  DEAD_OAK_MODELS,
  IDOL_RING_M,
  SACRED_SITE_KIND,
  SHRINE_FIRE_RADIUS_M,
  SHRINE_RING_M,
  fallenOakInstance,
  groveStones,
  sacredSnagInstance,
  sacredStakeLines,
  shrineFireSpots,
} from '../sacred-layout';
import { ROUND_SITE_M, constructionParts, constructionState } from '../village-construction';

describe('staveniště modly a svatyně (fáze z village-construction.ts)', () => {
  it('hned po zadání (průběh 0) stojí jen kolíky a provázek a světlá čára vytyčení – Martin', () => {
    for (const kind of ['idol', 'shrine'] as const) {
      const state = constructionState(SACRED_SITE_KIND[kind], 0);
      expect(state.parts).toEqual(['stakes']);
      expect(state.outline).toBe(1);
      expect(state.phase.id).toBe('layout');
    }
  });

  it('vytyčení náhradních tvarů sedí s kruhy staveniště (ROUND_SITE_M)', () => {
    expect(IDOL_RING_M).toBe(ROUND_SITE_M.modla.outline);
    expect(SHRINE_RING_M.inner).toBe(ROUND_SITE_M.svatyne.outline);
    // ušlapaná tráva svatyně jen uvnitř příkopu
    expect(ROUND_SITE_M.svatyne.trampled).toBeLessThan(SHRINE_RING_M.inner);
  });
});

describe('ohniště a vytyčení svatyně', () => {
  it('osm ohnišť uprostřed výběžků, souměrně podle osy předku', () => {
    const fires = shrineFireSpots();
    expect(fires).toHaveLength(8);
    for (const [x, z] of fires) expect(Math.hypot(x, z)).toBeCloseTo(SHRINE_FIRE_RADIUS_M, 9);
    // žádné ohniště přímo vpředu (výběžky začínají hroty na ose)
    expect(fires.some(([x]) => Math.abs(x) < 1)).toBe(false);
    const xs = fires.map(([x]) => Math.round(x * 1000)).sort((a, b) => a - b);
    expect(xs).toEqual([...xs].map((x) => -x).sort((a, b) => a - b));
  });

  it('spočítaná ohniště leží na uzlech fire-1…8 v shrine.glb (osa x z glTF zrcadlená)', () => {
    const data = readFileSync(join(__dirname, '../../../public/models/sacred/shrine.glb'));
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
      nodes: { name?: string; translation?: [number, number, number] }[];
    };
    const spots = shrineFireSpots();
    for (let k = 1; k <= 8; k++) {
      const node = json.nodes.find((n) => n.name === `fire-${k}`);
      expect(node?.translation, `fire-${k}`).toBeDefined();
      const [x, , z] = node!.translation!;
      // loader glTF převrací osu: bod (x, z) z glTF je ve scéně (−x, z)
      expect(spots[k - 1]![0]).toBeCloseTo(-x, 1);
      expect(spots[k - 1]![1]).toBeCloseTo(z, 1);
    }
  });

  it('modla má kruh, svatyně kruh příkopu a okvětí s hroty a vrcholy výběžků', () => {
    const [ring] = sacredStakeLines('idol');
    expect(ring![0]).toEqual(ring!.at(-1));
    for (const [x, z] of ring!) expect(Math.hypot(x, z)).toBeCloseTo(IDOL_RING_M, 9);
    const [inner, petals] = sacredStakeLines('shrine');
    for (const [x, z] of inner!) expect(Math.hypot(x, z)).toBeCloseTo(SHRINE_RING_M.inner, 9);
    expect(petals).toHaveLength(17);
    petals!.forEach(([x, z], k) =>
      expect(Math.hypot(x, z)).toBeCloseTo(k % 2 === 0 ? SHRINE_RING_M.cusp : SHRINE_RING_M.tip, 9),
    );
  });
});

describe('kameny háje', () => {
  const squares = [0, 1, 2].flatMap((y) =>
    [0, 1, 2].map((x) => ({ cell: { x, y }, x: x * 15 + 7.5, z: y * 15 + 7.5, size: 15 })),
  );
  const grove = { id: 42, x: 22.5, z: 22.5, squares };

  it('hraniční kameny po obvodu uvnitř háje, jeden oltář na straně ke vsi čelem ke vsi', () => {
    const stones = groveStones(grove, { x: 22.5, z: -200 });
    const altars = stones.filter((s) => s.model === 'altar');
    expect(altars).toHaveLength(1);
    const altar = altars[0]!;
    expect(altar.z).toBeLessThan(5);
    // předek (+z modelu) míří ven ke vsi (−z)
    expect(Math.cos(altar.rotationY)).toBeCloseTo(-1, 6);
    const edges = stones.filter((s) => s.model !== 'altar');
    expect(edges.length).toBeGreaterThan(12);
    for (const s of edges) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(45);
      expect(s.z).toBeGreaterThan(0);
      expect(s.z).toBeLessThan(45);
      // u okraje, ne uprostřed háje
      const edge = Math.min(s.x, 45 - s.x, s.z, 45 - s.z);
      expect(edge).toBeLessThan(1.5);
    }
  });

  it('deterministicky podle id háje; vynechá místa, která nejdou', () => {
    expect(groveStones(grove, null)).toEqual(groveStones(grove, null));
    expect(groveStones({ ...grove, id: 7 }, null)).not.toEqual(groveStones(grove, null));
    expect(groveStones(grove, null, () => false)).toEqual([]);
  });
});

describe('náhradní tvary', () => {
  it('každý model a díl staveniště má náhradní síť s platnými indexy', () => {
    const keys = [
      'idol',
      'shrine',
      'oak-offerings',
      'stone-a',
      'stone-b',
      'altar',
      ...constructionParts('modla').map((p) => `modla-${p}`),
      ...constructionParts('svatyne').map((p) => `svatyne-${p}`),
    ];
    for (const key of keys) {
      const geometry = fallbackGeometry(key);
      expect(geometry, key).not.toBeNull();
      const vertices = geometry!.positions.length / 3;
      expect(geometry!.colors).toHaveLength(vertices * 4);
      expect(Math.max(...geometry!.indices)).toBeLessThan(vertices);
    }
    expect(fallbackGeometry('neznámý')).toBeNull();
  });
});

describe('uschlý a padlý posvátný dub', () => {
  /** Rozměry modelu dekorace z GLB (min a max pozic všech meshů). */
  const bounds = (model: string): { height: number; length: number } => {
    const data = readFileSync(join(__dirname, `../../../public/models/decor/${model}.glb`));
    const length = data.readUInt32LE(12);
    const json = JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
      meshes: { primitives: { attributes: { POSITION: number } }[] }[];
      accessors: { min?: number[]; max?: number[] }[];
    };
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of json.meshes) {
      for (const p of mesh.primitives) {
        const accessor = json.accessors[p.attributes.POSITION]!;
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, accessor.min![i]!);
          max[i] = Math.max(max[i]!, accessor.max![i]!);
        }
      }
    }
    return { height: max[1]! - min[1]!, length: max[0]! - min[0]! };
  };
  const oak = { id: 7, x: 10, z: -4, growth: 1.1, sizeM: 22 };

  it('souš stojí na místě dubu, o čtvrtinu nižší než dub v den uschnutí', () => {
    const snag = sacredSnagInstance({ ...oak, snag: true });
    expect(snag).toMatchObject({ x: 10, z: -4 });
    expect(bounds(DEAD_OAK_MODELS.snag).height * snag.scale).toBeCloseTo(0.75 * 22 * 1.1, 1);
    // stejný dub = stejné natočení
    expect(sacredSnagInstance({ ...oak, snag: true })).toEqual(snag);
  });

  it('padlý kmen leží přes místo dubu na délku ≈ 70 % výšky dubu; bez velikosti odhad', () => {
    const fallen = fallenOakInstance(oak);
    expect(fallen).toMatchObject({ x: 10, z: -4 });
    expect(bounds(DEAD_OAK_MODELS.fallen).length * fallen.scale).toBeCloseTo(0.7 * 22 * 1.1, 1);
    expect(fallenOakInstance({ id: 7, x: 0, z: 0 }).scale).toBeGreaterThan(0.5);
  });
});
