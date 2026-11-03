import { describe, expect, it } from 'vitest';
import type { SceneRoad } from '../../village-view';
import {
  junctionPatch,
  mergeGrids,
  patchAlpha,
  PATCH_CORE,
  type PatchArm,
} from '../junction-patch';
import {
  axisPart,
  cutAxisEnd,
  junctionPatchGrid,
  roadBands,
  roadLength,
  throughCurve,
  type JunctionCut,
} from '../road-works-layout';

// Plácek křižovatky se stejnými měkkými okraji jako pásy cest (Martin 24. 10. 2026: „ty ostrý
// křižovatky už jsou upravený?“) – oblouk ve vnitřních rozích, plynulý přechod z pásu do plácku.

const R = 8;
/** Rameno Y: osa z řezu R m od středu do středu (0, 0) ve směru `deg`. */
const arm = (deg: number, half = 1, softM = 0.6, alpha = 0.95): PatchArm => {
  const a = (deg * Math.PI) / 180;
  return {
    axis: [
      { x: Math.cos(a) * R, z: Math.sin(a) * R },
      { x: 0, z: 0 },
    ],
    half,
    softM,
    alpha,
  };
};
const y = (): PatchArm[] => [arm(0), arm(120, 1.75), arm(240, 0.95)];

/** Průřez pásu (path-ribbon.ts `addRibbon`): plné do 0,35 × půl šířky, k okraji + měkkému 0. */
const profile = (o: number, half: number, softM: number, alpha: number): number =>
  alpha *
  Math.min(1, Math.max(0, (half + softM - Math.abs(o)) / (half + softM - PATCH_CORE * half)));

describe('plácek křižovatky (junction-patch.ts)', () => {
  it('v řezu je krytí přesně průřez navazujícího pásu – přechod z pásu do plácku není vidět', () => {
    const arms = y();
    for (const o of [-2, -1.6, -1.2, -0.6, -0.35, 0, 0.2, 0.5, 1, 1.4, 1.6, 2]) {
      expect(patchAlpha(arms, { x: R, z: o })).toBeCloseTo(profile(o, 1, 0.6, 0.95), 6);
    }
    // a po ose ramene dovnitř plné krytí
    for (let s = 0; s <= R; s += 0.5) expect(patchAlpha(arms, { x: s, z: 0 })).toBeCloseTo(0.95, 6);
  });

  it('vnitřní roh je oblouk: plácek ho vyplní a krytí k okraji klesá plynule, bez tvrdé hrany', () => {
    const arms = y();
    // osa mezery mezi rameny 0° a 120°
    const at = (r: number): number =>
      patchAlpha(arms, { x: Math.cos(Math.PI / 3) * r, z: Math.sin(Math.PI / 3) * r });
    const single = (r: number): number =>
      Math.max(
        ...arms.map((a) =>
          patchAlpha([a], { x: Math.cos(Math.PI / 3) * r, z: Math.sin(Math.PI / 3) * r }),
        ),
      );
    // roh, kde se protnou okraje pásů ramene 0° (půl šířky 1 m) – plácek přidá krytí navíc
    const corner = 1 / Math.sin(Math.PI / 3);
    expect(at(corner)).toBeGreaterThan(single(corner) + 0.05);
    let previous = at(0);
    for (let r = 0.1; r <= 5; r += 0.1) {
      const value = at(r);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      expect(previous - value).toBeLessThan(0.08);
      previous = value;
    }
    expect(previous).toBe(0);
  });

  it('síť: vrcholy přesně v bodech průřezu pásu v řezu, nic za řezem, nulové okolí vynechané', () => {
    const arms = y();
    const grid = junctionPatch({ x: 0, z: 0 }, arms);
    const vertices = Array.from({ length: grid.alphas.length }, (_, i) => ({
      x: grid.positions[i * 2]!,
      z: grid.positions[i * 2 + 1]!,
      alpha: grid.alphas[i]!,
    }));
    expect(grid.indices.length).toBeGreaterThan(0);
    // čtyři body průřezu ramene 0° v řezu (x = R) s krytím pásu
    for (const o of [-1.6, -0.35, 0.35, 1.6]) {
      const v = vertices.find((p) => Math.hypot(p.x - R, p.z - o) < 1e-4);
      expect(v, `bod průřezu ${o}`).toBeDefined();
      expect(v!.alpha).toBeCloseTo(profile(o, 1, 0.6, 0.95), 5);
    }
    // žádný vrchol za přímkou řezu kteréhokoli ramene
    for (const a of arms) {
      const c = a.axis[0]!;
      const len = Math.hypot(c.x, c.z);
      for (const p of vertices) expect((p.x * c.x + p.z * c.z) / len).toBeLessThanOrEqual(R + 1e-4);
    }
    // jen vrcholy trojúhelníků s nějakým krytím
    expect(vertices.length).toBeLessThan(10 * 80);
    // rozumný počet trojúhelníků na křižovatku (dvě vrstvy) – oblouk a měkký okraj zůstávají
    expect(grid.indices.length / 3).toBeLessThan(1500);
  });

  it('pásy cest končí v řezu a kus do středu je rameno plácku; koleje vedou skrz', () => {
    const road = (id: number, x: number, z: number, grade: SceneRoad['grade']): SceneRoad => ({
      id,
      points: [
        { x, z },
        { x: 0, z: 0 },
      ],
      grade,
    });
    const cut: JunctionCut = { x: 0, z: 0, radius: 6 };
    const roads = [
      road(1, 30, 0, 'wagon'),
      road(2, -30, 0, 'wagon'),
      road(3, 0, 30, 'trodden'),
      road(4, 0, -30, 'improved'),
    ];
    const bands = roadBands(roads, [cut]);
    const lines = [...bands.wagon, ...bands.trodden, ...bands.improved];
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      const end = line.points[line.points.length - 1]!;
      expect(Math.hypot(end.x, end.z)).toBeCloseTo(6, 6);
      expect(line.openEnd).toBe(false);
    }
    expect(bands.arms).toHaveLength(4);
    for (const a of bands.arms) {
      expect(Math.hypot(a.axis[0]!.x, a.axis[0]!.z)).toBeCloseTo(6, 6);
      expect(a.axis[a.axis.length - 1]).toEqual({ x: 0, z: 0 });
    }
    // vozová cesta skrz (protilehlá ramena): koleje přes plácek rovně, ±0,65 m od osy
    const through = bands.gravel.filter((l) => l.points.every((p) => Math.abs(p.x) <= 6 + 1e-6));
    expect(through).toHaveLength(2);
    expect(through.map((l) => Math.abs(l.points[0]!.z)).sort()).toEqual([0.65, 0.65]);
    // bez křižovatky pás vede až do středu jako dřív
    const plain = roadBands(roads);
    expect(plain.arms).toEqual([]);
    expect(plain.wagon[0]!.points.at(-1)).toEqual({ x: 0, z: 0 });
  });

  it('hvězda s pěti rameny: pět pásů do řezu, koleje skrz jen po vozové cestě, ne do páté', () => {
    const road = (id: number, deg: number, grade: SceneRoad['grade']): SceneRoad => {
      const a = (deg * Math.PI) / 180;
      return {
        id,
        points: [
          { x: Math.round(Math.cos(a) * 3000) / 100, z: Math.round(Math.sin(a) * 3000) / 100 },
          { x: 0, z: 0 },
        ],
        grade,
      };
    };
    // vozová skrz (0° a 180°), upravené 90° a 270°, napojená vyšlapaná v ose mezery (45°)
    const roads = [
      road(1, 0, 'wagon'),
      road(2, 180, 'wagon'),
      road(3, 90, 'improved'),
      road(4, 270, 'improved'),
      road(5, 45, 'trodden'),
    ];
    const bands = roadBands(roads, [{ x: 0, z: 0, radius: 6.75 }]);
    expect(bands.arms).toHaveLength(5);
    expect([...bands.wagon, ...bands.trodden, ...bands.improved]).toHaveLength(5);
    const through = bands.gravel.filter((l) => l.points.every((p) => Math.abs(p.x) <= 6.75 + 1e-6));
    expect(through).toHaveLength(2);
    for (const rut of through) {
      for (const p of rut.points) expect(Math.abs(p.z)).toBeCloseTo(0.65, 6);
    }
  });

  it('vozová cesta, která v křižovatce končí: koleje dojdou ke středu a vytratí se', () => {
    const roads: SceneRoad[] = [
      {
        id: 1,
        points: [
          { x: 30, z: 0 },
          { x: 0, z: 0 },
        ],
        grade: 'wagon',
      },
      {
        id: 2,
        points: [
          { x: 0, z: 30 },
          { x: 0, z: 0 },
        ],
        grade: 'improved',
      },
      {
        id: 3,
        points: [
          { x: 0, z: -30 },
          { x: 0, z: 0 },
        ],
        grade: 'trodden',
      },
    ];
    const bands = roadBands(roads, [{ x: 0, z: 0, radius: 6 }]);
    expect(bands.gravel).toHaveLength(2);
    for (const rut of bands.gravel) {
      expect(rut.points.at(-1)!.x).toBeCloseTo(0, 6);
      expect(rut.openEnd).toBe(true);
    }
  });
  it('krátká cesta k brance celá v plácku: rameno se k brance vytrácí jako volný konec pásu', () => {
    const roads: SceneRoad[] = [
      {
        id: 1,
        points: [
          { x: 30, z: 0 },
          { x: 0, z: 0 },
        ],
        grade: 'wagon',
      },
      {
        id: 2,
        points: [
          { x: -30, z: 0 },
          { x: 0, z: 0 },
        ],
        grade: 'improved',
      },
      // 5 m k brance hřbitova (J565 na Vlkově)
      {
        id: 3,
        points: [
          { x: 0, z: 5 },
          { x: 0, z: 0 },
        ],
        grade: 'trodden',
        openEnds: [true, false],
      },
    ];
    const cut: JunctionCut = { x: 0, z: 0, radius: 6.75 };
    const bands = roadBands(roads, [cut]);
    expect(bands.trodden).toEqual([]);
    const gate = bands.arms.find((a) => a.kind === 'trodden')!;
    expect(gate.axis[0]).toEqual({ x: 0, z: 5 });
    expect(gate.openM).toBeCloseTo(5 / 3, 9);
    const worn = junctionPatchGrid(bands.arms, [cut], 'worn');
    const near = (x: number, z: number): number => {
      let best = { d: Infinity, a: 0 };
      for (let i = 0; i < worn.alphas.length; i++) {
        const d = Math.hypot(worn.positions[i * 2]! - x, worn.positions[i * 2 + 1]! - z);
        if (d < best.d) best = { d, a: worn.alphas[i]! };
      }
      return best.a;
    };
    expect(near(0, 4.95)).toBeLessThan(0.05);
    expect(near(0, 2)).toBeGreaterThan(0.5);
  });

  it('vozová cesta mezi blízkými křižovatkami (plácky se překrývají): koleje po celé délce', () => {
    // Vlkov 2. 11. 2026 (Martin: „je veden jako vozová cesta, ale nevypadá tak“): vozová 1387
    // ≈ 10 m mezi křižovatkou 1131 (kříž) a novou 1619 (Y) – obě mají pevné rameno, plácky se
    // překrývají (paths.md – Rozestup, přijatá výjimka). Úsek byl celý v plácku bez štěrku.
    type Pt = { x: number; z: number };
    const road = (id: number, grade: SceneRoad['grade'], pts: [number, number][]): SceneRoad => ({
      id,
      grade,
      points: pts.map(([x, z]) => ({ x, z })),
    });
    const short = road(1387, 'wagon', [
      [237.01, -308.76],
      [233.83, -305.58],
      [232.3, -304.62],
      [230.45, -304.22],
      [228.36, -304.2],
    ]);
    const roads = [
      road(1386, 'wagon', [
        [237.01, -308.76],
        [240.19, -305.58],
        [242.64, -304.39],
        [251.25, -303.75],
      ]),
      road(1385, 'wagon', [
        [217.5, -315],
        [228.43, -314.95],
        [230.95, -314.09],
        [233.83, -311.94],
        [237.01, -308.76],
      ]),
      road(1476, 'improved', [
        [252.76, -322.45],
        [249.46, -320.23],
        [240.19, -311.94],
        [237.01, -308.76],
      ]),
      short,
      road(1617, 'wagon', [
        [228.36, -304.2],
        [222.52, -304.14],
        [220.63, -304.76],
        [217.25, -306.83],
        [207.35, -307.93],
      ]),
      road(1618, 'improved', [
        [228.75, -285],
        [228.07, -298.96],
        [228.36, -304.2],
      ]),
    ];
    const cuts: JunctionCut[] = [
      { x: 237.01, z: -308.76, radius: 6.75 },
      { x: 228.36, z: -304.2, radius: 6.75 },
    ];
    const bands = roadBands(roads, cuts);
    // plácky se o úsek dělí v půli překryvu – ramena obou křižovatek začínají v témže bodě
    const meet = bands.arms.filter((a) =>
      bands.arms.some(
        (b) =>
          b.junction !== a.junction &&
          Math.hypot(b.axis[0]!.x - a.axis[0]!.x, b.axis[0]!.z - a.axis[0]!.z) < 1e-6,
      ),
    );
    expect(meet).toHaveLength(2);
    const m = meet[0]!.axis[0]!;
    const d0 = Math.hypot(m.x - cuts[0]!.x, m.z - cuts[0]!.z);
    const d1 = Math.hypot(m.x - cuts[1]!.x, m.z - cuts[1]!.z);
    expect(Math.abs(d0 - d1)).toBeLessThan(0.5);
    // štěrk v kolejích po celé délce úseku (±0,65 m od osy) a nikde se tu nevytrácí
    const lineDist = (p: Pt, line: readonly Pt[]): number => {
      let best = Infinity;
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1]!;
        const b = line[k]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
        best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
      }
      return best;
    };
    const length = roadLength(short);
    for (let s = 0; s <= length; s += 0.25) {
      const p = axisPart(short.points, 0, Math.max(s, 1e-3)).at(-1)!;
      const near = Math.min(...bands.gravel.map((l) => lineDist(p, l.points)));
      expect(near).toBeLessThan(0.65 + 0.3);
    }
    for (const line of bands.gravel) {
      const ends = [
        line.openStart ? line.points[0] : null,
        line.openEnd ? line.points.at(-1) : null,
      ];
      for (const e of ends) if (e) expect(lineDist(e, short.points)).toBeGreaterThan(3);
    }
    // vozová cesta skrz nevede (odbočky jsou vyšlapané): koleje úseku ze středu do středu,
    // u obou se vytratí
    const lone = (x: number): SceneRoad[] => [
      road(10 + x, 'trodden', [
        [x, 20],
        [x, 0],
      ]),
      road(20 + x, 'trodden', [
        [x, -20],
        [x, 0],
      ]),
    ];
    const pair = roadBands(
      [
        road(1, 'wagon', [
          [0, 0],
          [8, 0],
        ]),
        ...lone(0),
        ...lone(8),
      ],
      [
        { x: 0, z: 0, radius: 6 },
        { x: 8, z: 0, radius: 6 },
      ],
    );
    expect(pair.wagon).toEqual([]);
    expect(pair.gravel).toHaveLength(2);
    for (const rut of pair.gravel) {
      expect(rut.points[0]!.x).toBeCloseTo(0, 6);
      expect(rut.points.at(-1)!.x).toBeCloseTo(8, 6);
      expect([rut.openStart, rut.openEnd]).toEqual([true, true]);
    }
  });

  it('smíšená křižovatka: pás u řezu nezužuje ze středu, v řezu má plnou šířku jako rameno plácku', () => {
    const roads: SceneRoad[] = [
      {
        id: 1,
        points: [
          { x: 30, z: 0 },
          { x: 0, z: 0 },
        ],
        grade: 'wagon',
      },
      {
        id: 2,
        points: [
          { x: 0, z: 0 },
          { x: -30, z: 0 },
        ],
        grade: 'trodden',
      },
    ];
    const bands = roadBands(roads, [{ x: 0, z: 0, radius: 6 }]);
    for (const line of [...bands.wagon, ...bands.trodden]) {
      expect(line.narrowStart).toBeUndefined();
      expect(line.narrowEnd).toBeUndefined();
    }
    // bez křižovatky se užší druh dál zužuje u uzlu
    const plain = roadBands(roads);
    expect([...plain.wagon, ...plain.trodden].some((l) => l.narrowStart || l.narrowEnd)).toBe(true);
  });

  it('cutAxisEnd: řez na kružnici, krátký úsek celý do plácku, osa uvnitř', () => {
    const c = { x: 0, z: 0 };
    const cut = cutAxisEnd(
      [
        { x: 20, z: 0 },
        { x: 0, z: 0 },
      ],
      c,
      6,
    );
    expect(cut.kept.at(-1)!.x).toBeCloseTo(6, 9);
    expect(cut.inner[0]!.x).toBeCloseTo(6, 9);
    expect(cut.inner.at(-1)).toEqual(c);
    // zbylo by méně než 1 m pásu – celé rameno
    const short = cutAxisEnd(
      [
        { x: 6.5, z: 0 },
        { x: 0, z: 0 },
      ],
      c,
      6,
    );
    expect(short.kept).toEqual([]);
    expect(short.inner).toHaveLength(2);
    // osa celá uvnitř kružnice
    expect(cutAxisEnd([{ x: 3, z: 0 }, c], c, 6).kept).toEqual([]);
  });

  it('throughCurve: začíná a končí v řezech, zatáčka 120° má body po ≈ 0,5 m a drží se uvnitř', () => {
    const a = arm(0).axis;
    const b = arm(120).axis;
    const curve = throughCurve(a, b);
    expect(curve[0]).toEqual(a[0]);
    expect(curve.at(-1)!.x).toBeCloseTo(b[0]!.x, 9);
    expect(curve.at(-1)!.z).toBeCloseTo(b[0]!.z, 9);
    expect(curve.length).toBeGreaterThan(10);
    for (let i = 1; i < curve.length; i++) {
      const d = Math.hypot(curve[i]!.x - curve[i - 1]!.x, curve[i]!.z - curve[i - 1]!.z);
      expect(d).toBeLessThan(0.8);
    }
    for (const p of curve) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(R + 1e-6);
  });

  it('patchAlpha: souměrná podle os a bez ramen nula; otevřené rameno slábne k volnému konci', () => {
    const arms = [arm(0), arm(180)];
    expect(patchAlpha(arms, { x: 3, z: 0.4 })).toBeCloseTo(patchAlpha(arms, { x: -3, z: 0.4 }), 9);
    expect(patchAlpha(arms, { x: 3, z: 0.4 })).toBeCloseTo(patchAlpha(arms, { x: 3, z: -0.4 }), 9);
    expect(patchAlpha([], { x: 1, z: 1 })).toBe(0);
    const open = [{ ...arm(0), openM: 3 }];
    expect(patchAlpha(open, { x: 7.9, z: 0 })).toBeLessThan(patchAlpha(open, { x: 3, z: 0 }));
  });

  it('mergeGrids: slučuje sítě s posunutými indexy (i velká pole)', () => {
    const g = junctionPatch({ x: 0, z: 0 }, y());
    const merged = mergeGrids(Array.from({ length: 60 }, () => g));
    expect(merged.alphas.length).toBe(g.alphas.length * 60);
    expect(merged.indices.length).toBe(g.indices.length * 60);
    expect(merged.indices[g.indices.length]).toBe(g.indices[0]! + g.alphas.length);
  });
});
