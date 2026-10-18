import { describe, expect, it } from 'vitest';
import { fallbackGeometry } from '../sacred-fallback';
import {
  IDOL_RING_M,
  SACRED_PHASES,
  SHRINE_FIRE_RADIUS_M,
  SHRINE_RING_M,
  groveStones,
  sacredConstructionParts,
  sacredPhase,
  sacredSiteParts,
  sacredStakeLines,
  shrineFireSpots,
  type SacredSiteKind,
} from '../sacred-layout';

const KINDS: readonly SacredSiteKind[] = ['modla', 'svatyne'];

describe('fáze staveniště modly a svatyně', () => {
  it('fáze navazují od 0 do 1', () => {
    for (const kind of KINDS) {
      const phases = SACRED_PHASES[kind];
      expect(phases[0]!.from).toBe(0);
      expect(phases.at(-1)!.to).toBe(1);
      for (let i = 1; i < phases.length; i++) expect(phases[i]!.from).toBe(phases[i - 1]!.to);
    }
  });

  it('hned po zadání (průběh 0) stojí jen kolíky a provázek – Martin', () => {
    for (const kind of KINDS) {
      expect(sacredSiteParts(kind, 0)).toEqual(['stakes']);
      expect(sacredPhase(kind, 0).id).toBe('layout');
    }
  });

  it('modla jde kmen → vztyčení → osekání → řezba, na konci hotová modla s obětinami', () => {
    expect(sacredSiteParts('modla', 0.25)).toContain('log');
    expect(sacredSiteParts('modla', 0.4)).toEqual(
      expect.arrayContaining(['ground', 'post', 'struts']),
    );
    expect(sacredSiteParts('modla', 0.6)).toContain('hewn');
    expect(sacredSiteParts('modla', 0.8)).toContain('carved');
    const done = sacredSiteParts('modla', 0.999);
    expect(done).toEqual(
      expect.arrayContaining(['ground', 'stones', 'idol', 'ribbon', 'offerings']),
    );
    expect(done).not.toContain('stakes');
    expect(done).not.toContain('post');
  });

  it('svatyně kope příkop výběžek po výběžku, pak plocha, ohniště a modla', () => {
    const digging = SACRED_PHASES.svatyne.find((p) => p.id === 'dig')!;
    let previous = 0;
    for (let p = digging.from; p <= digging.to; p += 0.01) {
      const ditches = sacredSiteParts('svatyne', p).filter((part) => part.startsWith('ditch-'));
      expect(ditches.length).toBeGreaterThanOrEqual(previous);
      previous = ditches.length;
    }
    expect(previous).toBe(8);
    expect(sacredSiteParts('svatyne', 0.3)).toContain('stakes');
    expect(sacredSiteParts('svatyne', 0.5)).toContain('platform-1');
    const fires = sacredSiteParts('svatyne', 0.76).filter((part) => part.startsWith('fire-'));
    expect(fires).toHaveLength(8);
    expect(sacredSiteParts('svatyne', 0.999)).toEqual(
      expect.arrayContaining(['platform-2', 'paving', 'idol', 'offerings']),
    );
  });

  it('každý díl se někdy ukáže', () => {
    for (const kind of KINDS) {
      const seen = new Set<string>();
      for (let p = 0; p <= 1; p += 0.002)
        for (const part of sacredSiteParts(kind, p)) seen.add(part);
      expect([...seen].sort()).toEqual([...new Set(sacredConstructionParts(kind))].sort());
    }
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
      ...sacredConstructionParts('modla').map((p) => `modla-${p}`),
      ...sacredConstructionParts('svatyne').map((p) => `svatyne-${p}`),
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
