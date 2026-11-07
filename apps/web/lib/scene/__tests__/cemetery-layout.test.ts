import { describe, expect, it } from 'vitest';
import {
  CEMETERY,
  MOUND_SIZES,
  cemeteryEntrance,
  gravePlaceCenter,
  rotationCosSin,
  turnRotation,
} from '@bohemia/game';
import {
  CEMETERY_FENCE,
  CEMETERY_PHASES,
  FRESH_GRAVES,
  GRAVE_GRID,
  MOUND_SHAPES,
  cemeteryConstruction,
  cemeteryFenceGone,
  fenceLayout,
  gravePlacements,
  moundPlacements,
} from '../cemetery-layout';
import type { CellSquare } from '../field-cells';
import { PLOT_FENCE } from '../homestead-layout';
import { WOVEN_CORNER_RADIUS_M, fencePosts, type FencePost } from '../woven-fence';

const square = (cx: number, cy: number): CellSquare => ({
  cell: { x: cx, y: cy },
  x: cx * 15,
  z: cy * 15,
  size: 15,
});
const two = [square(0, 0), square(1, 0)];

describe('gravePlacements', () => {
  it('mřížka 7 × 8 = hroby čtverce podle pravidel', () => {
    expect(GRAVE_GRID.columns * GRAVE_GRID.rows).toBe(CEMETERY.gravesPerSquare);
  });

  it('hroby leží ve svých čtvercích, plní se po čtvercích; poslední jsou čerstvé', () => {
    const graves = gravePlacements(two, 60, 3);
    expect(graves).toHaveLength(60);
    for (const [i, g] of graves.entries()) {
      const s = two[i < 56 ? 0 : 1]!;
      expect(Math.abs(g.x - s.x)).toBeLessThan(7.5);
      expect(Math.abs(g.z - s.z)).toBeLessThan(7.5);
    }
    expect(graves.filter((g) => g.fresh)).toHaveLength(FRESH_GRAVES);
    expect(graves.at(-1)?.fresh).toBe(true);
    expect(graves[0]?.fresh).toBe(false);
  });

  it('deterministické; víc hrobů, než se vejde, se nekreslí', () => {
    expect(gravePlacements(two, 20, 9)).toEqual(gravePlacements(two, 20, 9));
    expect(gravePlacements(two, 500, 9)).toHaveLength(112);
    expect(gravePlacements(two, 0, 9)).toEqual([]);
  });

  it('staré hroby vedle mohyl podle významu jsou všechny zarostlé – jinak stejné', () => {
    const old = gravePlacements(two, 20, 9, 0);
    expect(old.some((g) => g.fresh)).toBe(false);
    const where = (g: { x: number; z: number; rotationY: number; scale: number }): number[] => [
      g.x,
      g.z,
      g.rotationY,
      g.scale,
    ];
    expect(old.map(where)).toEqual(gravePlacements(two, 20, 9).map(where));
  });

  it('staré hroby leží na místech mřížky z jádra (gravePlaceCenter) – mohyly se jim vyhnou', () => {
    const graves = gravePlacements(two, 9, 4);
    graves.forEach((g, i) => {
      const center = gravePlaceCenter(two[0]!, 15, undefined, i % 7, Math.floor(i / 7));
      expect(Math.abs(g.x - center.x)).toBeLessThan(0.3);
      expect(Math.abs(g.z - center.z)).toBeLessThan(0.3);
    });
  });
});

describe('plot starého hřbitova (abandonment.md)', () => {
  it('spadlý plot zmizí úplně, rozpadající se a celý zůstane', () => {
    expect(cemeteryFenceGone(0)).toBe(true);
    expect(cemeteryFenceGone(0.05)).toBe(false);
    expect(cemeteryFenceGone(undefined)).toBe(false);
  });
});

describe('moundPlacements (cemetery.md – Mohyly podle významu)', () => {
  it('mohyla na středu svých míst; vojvodova rodina s kůlem výrazně větší než dítě', () => {
    const mounds = moundPlacements(
      two,
      [
        { cell: { x: 1, y: 0 }, column: 2, row: 0, size: 'great', fresh: true },
        { cell: { x: 0, y: 0 }, column: 6, row: 6, size: 'small' },
        { cell: { x: 5, y: 5 }, column: 0, row: 0, size: 'normal' },
      ],
      7,
    );
    // mohyla ve čtverci mimo hřbitov (rozšíření ve stavbě) se nekreslí
    expect(mounds.map((m) => m.size)).toEqual(['great', 'small']);
    const great = gravePlaceCenter(two[1]!, 15, undefined, 2, 0, 2, 2);
    expect(Math.abs(mounds[0]!.x - great.x)).toBeLessThan(0.2);
    expect(Math.abs(mounds[0]!.z - great.z)).toBeLessThan(0.2);
    expect(mounds[0]!.fresh).toBe(true);
    expect(mounds[1]!.fresh).toBe(false);
    expect(MOUND_SHAPES.great.radius).toBeGreaterThan(2.5 * MOUND_SHAPES.small.radius);
    expect(MOUND_SHAPES.great.height).toBeGreaterThan(2 * MOUND_SHAPES.normal.height);
    expect(MOUND_SHAPES.great.post).toBe(true);
    // mohyla se vejde na svá místa (2 × 2 = 4 × 3,5 m)
    const { columns, rows } = MOUND_SIZES.great;
    expect(2 * MOUND_SHAPES.great.radius * 1.04).toBeLessThan(rows * 1.75 + 0.2);
    expect(columns * 2).toBeGreaterThan(2 * MOUND_SHAPES.great.radius);
    // deterministicky
    expect(
      moundPlacements(two, [{ ...mounds[0]!, cell: { x: 1, y: 0 }, column: 2, row: 0 }], 7)[0],
    ).toEqual(mounds[0]);
  });

  it('podlouhlá mohyla hlavy rodiny leží po řadách – i v natočeném hřbitově', () => {
    const rotation = turnRotation(3);
    const turned: CellSquare[] = [{ ...square(0, 0), rotation }];
    const [m] = moundPlacements(
      turned,
      [{ cell: { x: 0, y: 0 }, column: 3, row: 2, size: 'large' }],
      2,
    );
    const center = gravePlaceCenter(turned[0]!, 15, rotation, 3, 2, 1, 2);
    expect(Math.abs(m!.x - center.x)).toBeLessThan(0.2);
    expect(Math.abs(m!.z - center.z)).toBeLessThan(0.2);
    // natočení po řadách (± půl otočky a drobná odchylka)
    const off = Math.abs(((m!.rotationY - rotation + Math.PI / 2) % Math.PI) - Math.PI / 2);
    expect(off).toBeLessThan(0.07);
  });
});

const gateKeys = (posts: readonly FencePost[]): string[] =>
  posts
    .filter((p) => p.gate)
    .map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)
    .sort();

describe('fenceLayout', () => {
  it('pletený plot kolem obrysu se zakulacenými rohy a brankou nejblíž k vsi', () => {
    // čtverce x −7,5 … 22,5, z −7,5 … 7,5; ves na jihu (−z)
    const { fence, outline } = fenceLayout(two, { x: 7.5, z: -100 });
    expect(outline.length).toBeGreaterThan(0);
    expect(fence.runs).toHaveLength(1);
    const posts = fence.runs[0]!.posts;
    // branka: krajní kůly kusu na jižní straně kolem x = 7,5
    const first = posts[0]!;
    const last = posts[posts.length - 1]!;
    expect(first.gate && last.gate).toBe(true);
    // plot stojí 1,5 m uvnitř čtverců (cemetery.md – ulička 3 m mezi stavbami)
    expect(first.z).toBeCloseTo(-6, 9);
    expect(last.z).toBeCloseTo(-6, 9);
    expect(first.x - last.x).toBeCloseTo(CEMETERY_FENCE.gateWidth, 9);
    expect((first.x + last.x) / 2).toBeCloseTo(7.5, 9);
    // rohy zakulacené – kůl uprostřed oblouku, žádný v ostrém rohu
    for (const [cx, cz] of [
      [-6, -6],
      [21, -6],
      [21, 6],
      [-6, 6],
    ] as const) {
      const nearest = Math.min(...posts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
      expect(nearest).toBeCloseTo((Math.SQRT2 - 1) * WOVEN_CORNER_RADIUS_M, 6);
    }
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1]!;
      const b = posts[i]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(CEMETERY_FENCE.postStep + 1e-9);
    }
  });

  it('branka zůstane na místě, když se hřbitov rozšíří jinam; rozšíření ve stavbě branku nemá', () => {
    const village = { x: 0, z: -100 };
    const gate = (squares: CellSquare[]): string[] =>
      gateKeys(fencePosts(fenceLayout(squares, village).fence));
    const before = gate([square(0, 0)]);
    expect(before).toHaveLength(2);
    // rozšíření na sever (+z) a na východ – jižní strana u vsi zůstává
    expect(gate([square(0, 0), square(0, 1), square(1, 0), square(1, 1)])).toEqual(before);
    const extension = fenceLayout([square(0, 1)], village, { withGate: false });
    expect(fencePosts(extension.fence).some((p) => p.gate)).toBe(false);
  });

  it('rozšíření ve stavbě: plot jen tam, kde ještě není – na starý plot navazuje', () => {
    const ready = [square(0, 0)];
    const { fence, outline } = fenceLayout([square(1, 0)], null, {
      withGate: false,
      fenced: ready,
    });
    // vytyčení obepne celý nový čtverec
    expect(outline.flat()).toContainEqual([9, -6]);
    expect(fence.runs).toHaveLength(1);
    const { posts, closed } = fence.runs[0]!;
    expect(closed).toBe(false);
    // společná strana x = 7,5 bez plotu, jen dva konce zasahují zpět na přímé úseky starého plotu
    // (kus před jeho zakulaceným rohem)
    expect(posts.filter((p) => Math.abs(p.x - 7.5) < 1 && Math.abs(p.z) < 5.5)).toHaveLength(0);
    const ends = [posts[0]!, posts[posts.length - 1]!].map((p) => `${p.x},${p.z}`).sort();
    expect(ends).toEqual(['4.75,-6', '4.75,6']);
  });

  it('plot kolem tvaru L: vnější rohy zakulacené, vnitřní roh malým obloukem', () => {
    const ell = [square(0, 0), square(1, 0), square(0, 1)];
    const posts = fencePosts(fenceLayout(ell, null).fence);
    // vnitřní roh plotu (6; 6) (odsazený o 1,5 m od rohu čtverců) – plot ho objede malým obloukem
    const inner = Math.min(...posts.map((p) => Math.hypot(p.x - 6, p.z - 6)));
    expect(inner).toBeGreaterThan(0.3);
    expect(inner).toBeLessThan(0.8);
    const keys = new Set(posts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`));
    expect(keys.size).toBe(posts.length);
  });

  it('čtverce dotýkající se jen rohem mají každý svůj obrys', () => {
    const fence = fenceLayout([square(0, 0), square(1, 1)], null, { withGate: false }).fence;
    expect(fence.runs).toHaveLength(2);
    expect(fence.runs.every((run) => run.closed)).toBe(true);
  });
});

describe('branka hřbitova = vchod z jádra (paths.md – Vchody)', () => {
  /** Čtverec natočené mřížky (natočení po 15°) s počátkem v (ox, oz). */
  const turned = (i: number, j: number, turn: number, ox = 37.5, oz = 37.5): CellSquare => {
    const rotation = turnRotation(turn);
    const [c, s] = rotationCosSin(rotation);
    return {
      cell: { x: i, y: j },
      x: ox + i * 15 * c + j * 15 * s,
      z: oz - i * 15 * s + j * 15 * c,
      size: 15,
      rotation,
    };
  };
  /** Střed branky plotu (mezi kůly branky). */
  const gateAt = (squares: CellSquare[], toward: { x: number; z: number }): [number, number] => {
    const gate = fencePosts(fenceLayout(squares, toward).fence).filter((p) => p.gate);
    expect(gate).toHaveLength(2);
    return [(gate[0]!.x + gate[1]!.x) / 2, (gate[0]!.z + gate[1]!.z) / 2];
  };
  const shapes: [string, CellSquare[]][] = [
    ['dva čtverce', two],
    ['tvar L', [square(0, 0), square(1, 0), square(0, 1)]],
    ['jen rohem', [square(0, 0), square(1, 1)]],
    ['natočený 15°', [turned(0, 0, 1), turned(1, 0, 1)]],
    ['natočený 90°', [turned(0, 0, 6), turned(0, 1, 6)]],
    ['natočený 105° L', [turned(0, 0, 7), turned(1, 0, 7), turned(1, 1, 7)]],
  ];
  const homes = [
    { x: 7.5, z: -100 },
    { x: 60, z: 70 },
    { x: -40, z: 12 },
    { x: 8.2, z: 8.6 },
  ];

  it('scéna kreslí branku tam, kde ji jádro zná – a kde byla dřív (k nejbližšímu domu)', () => {
    for (const [name, squares] of shapes) {
      for (const home of homes) {
        const entrance = cemeteryEntrance({ squares, built: true }, [
          { position: home, built: true },
        ]);
        expect(entrance, name).not.toBeNull();
        const core: [number, number] = [entrance!.x, entrance!.z];
        const scene = gateAt(squares, { x: core[0], z: core[1] });
        const before = gateAt(squares, home);
        for (const [got, label] of [
          [scene, 'scéna'],
          [before, 'dřív'],
        ] as const) {
          expect(Math.hypot(got[0] - core[0], got[1] - core[1]), `${name} ${label}`).toBeLessThan(
            1e-6,
          );
        }
        // ven z hřbitova: kus za brankou žádný čtverec není
        // (branka stojí 1,5 m uvnitř čtverce, proto 2,5 m ven)
        const out = { x: core[0] + entrance!.outX * 2.5, z: core[1] + entrance!.outZ * 2.5 };
        const inSquare = squares.some((q) => {
          const [c, s] = rotationCosSin(q.rotation ?? 0);
          const dx = out.x - q.x;
          const dz = out.z - q.z;
          return Math.abs(dx * c - dz * s) < q.size / 2 && Math.abs(dx * s + dz * c) < q.size / 2;
        });
        expect(inSquare, name).toBe(false);
      }
    }
  });
});

describe('cemeteryConstruction', () => {
  it('fáze navazují: vytyčení, kůly, pletení; hotové = celý plot', () => {
    expect(CEMETERY_PHASES[0].from).toBe(0);
    expect(CEMETERY_PHASES.at(-1)?.to).toBe(1);
    expect(cemeteryConstruction(0.05, false)).toEqual({ layout: true, posts: 0, rails: 0 });
    const posts = cemeteryConstruction(0.3, false);
    expect(posts.layout).toBe(true);
    expect(posts.posts).toBeCloseTo(0.5, 6);
    expect(posts.rails).toBe(0);
    const weaving = cemeteryConstruction(0.7, false);
    expect(weaving.layout).toBe(false);
    expect(weaving.posts).toBe(1);
    expect(weaving.rails).toBeGreaterThan(0);
    expect(weaving.rails).toBeLessThan(1);
    expect(cemeteryConstruction(0.2, true)).toEqual({ layout: false, posts: 1, rails: 1 });
  });

  it('plot hřbitova je hustší než polský plot pozemku', () => {
    expect(CEMETERY_FENCE.rails.length).toBeGreaterThan(PLOT_FENCE.rails.length);
    expect(CEMETERY_FENCE.postStep).toBeLessThanOrEqual(PLOT_FENCE.postStep);
    expect(CEMETERY_FENCE.rails.at(-1)).toBeCloseTo(0.8, 9);
  });
});
