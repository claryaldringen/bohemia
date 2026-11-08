import { describe, expect, it } from 'vitest';
import { selfCrossing } from '@bohemia/game';
import {
  RAMPART_CROWN_M,
  STAKES_PER_M,
  crownLift,
  ditchCuts,
  fortFenceStage,
  fortBand,
  fortGateInstances,
  insetLine,
  insetPoint,
  perimeterSamples,
  insideDitchCut,
  packDitchCuts,
  palisadeLayout,
  pincerGateInstances,
  rampartAt,
  towerInstances,
  rampartLooks,
  rampartProfile,
  segmentBuild,
  walkwayLayout,
  cribLayout,
  chamberLayout,
  woodTint,
  CRIB,
  CHAMBER,
  STAKE_HEIGHT_M,
  WALKWAY,
  MAX_DITCH_CUTS,
  type FortInstance,
} from '../fortification-layout';
import type { SceneFortification } from '../../fort-view';
import { demoFortification, type DemoFort, SHOWCASE_FORT_GEO } from '../fortification-showcase';
import {
  RAMPART_COLUMNS,
  RAMPART_RING_STEP_M,
  rampartMeshData,
  wallCoreMeshData,
} from '../rampart-mesh';
import { fortSitePhase } from '../village-construction';

// Opevnění ve scéně (fortifications.md – Ve scéně): kůly, plot, brány, val a prořez příkopu.

const fort = (o: Partial<DemoFort> = {}): ReturnType<typeof demoFortification> =>
  demoFortification(
    { id: 3, kind: 'palisade', cells: { x: 8, y: 8, w: 6, h: 6 }, ...o },
    SHOWCASE_FORT_GEO,
  );
const flat = (): number => 0;
/** Tětiva úseku – od začátku po konec jeho lomené čáry. */
const lineOf = (shape: {
  path: readonly (readonly [number, number])[];
}): { x: number; z: number; dx: number; dz: number } => {
  const [ax, az] = shape.path[0]!;
  const [bx, bz] = shape.path[shape.path.length - 1]!;
  const len = Math.hypot(bx - ax, bz - az);
  return { x: ax, z: az, dx: (bx - ax) / len, dz: (bz - az) / len };
};
const lineLength = (pts: { x: number; z: number }[]): number =>
  pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return sum + Math.hypot(q.x - p.x, q.z - p.z);
  }, 0);

describe('palisáda', () => {
  it('kůly ≈ 4 na metr po celé čáře palisády i po obloucích, pevně stejně', () => {
    const f = fort();
    const line = insetLine(f, 0.75, 0.25);
    const { stakes } = palisadeLayout(f, () => 0);
    expect(stakes.length / lineLength(line)).toBeCloseTo(STAKES_PER_M, 1);
    // obvod 6 × 6 čtverců (90 m) – palisáda ≈ 350 m
    expect(f.shapes.reduce((s, x) => s + x.lengthM, 0)).toBeGreaterThan(345);
    expect(palisadeLayout(f, () => 0)).toEqual({ stakes, trench: [] });
    const heights = new Set(stakes.map((s) => s.scaleY.toFixed(3)));
    expect(heights.size).toBeGreaterThan(10);
    expect(stakes.every((s) => s.scaleY >= 0.95 && s.scaleY <= 1.03)).toBe(true);
    // obvod z bodů oblouky nemá (tětivy úseků) – kůly na obloucích ověří scéna obvodu z bodů
  });

  it('brána je mezera 4 m s dvěma křídly, kůly a trámem; otevřená dovnitř, zavřená napříč', () => {
    const f = fort({ gates: [{ segment: 2 }] });
    const gate = f.gates[0]!;
    const { stakes } = palisadeLayout(f, () => 0);
    expect(stakes.some((s) => Math.hypot(s.x - gate.x, s.z - gate.z) < 1.9)).toBe(false);
    const open = fortGateInstances(f);
    expect(open.map((p) => p.part).sort()).toEqual([
      'gate-beam',
      'gate-planks',
      'gate-planks',
      'gate-post',
      'gate-post',
    ]);
    const closed = fortGateInstances({ ...f, gatesClosed: true });
    const leaves = (list: typeof open): number[] =>
      list.filter((p) => p.part === 'gate-planks').map((p) => p.yaw);
    expect(leaves(open)).not.toEqual(leaves(closed));
  });

  it('stáří: za životností mezery a šedší dřevo, průlom vyvrátí kůly', () => {
    const young = palisadeLayout(fort(), () => 0).stakes;
    const old = palisadeLayout(fort({ age: () => 22, state: 0.5 }), () => 0).stakes;
    expect(old.length).toBeLessThan(young.length * 0.65);
    expect(old[0]!.color[0]).toBeLessThan(young[0]!.color[0]);
    const broken = palisadeLayout(fort({ breached: [3] }), () => 0).stakes;
    expect(broken.some((s) => Math.hypot(s.lean[0], s.lean[1]) > 3)).toBe(true);
  });

  it('staveniště: žlab, pak kůly od začátku úseku', () => {
    expect(fortSitePhase('palisade', 0.15)).toMatchObject({ posts: 0, trench: 0.5 });
    const f = fort({
      age: () => null,
      work: { kind: 'build', progress: (s) => (s === 0 ? 0.65 : undefined) },
    });
    const { stakes, trench } = palisadeLayout(f, () => 0);
    const len = f.shapes[0]!.lengthM;
    expect(stakes.length).toBeGreaterThan(len * 0.4 * STAKES_PER_M);
    expect(stakes.length).toBeLessThan(len * 0.6 * STAKES_PER_M);
    expect(trench.length).toBeGreaterThan(len * 0.4 * STAKES_PER_M);
    // kůly stojí na začátku úseku (od brány po směru hodin), žlab za nimi
    const start = lineOf(f.shapes[0]!);
    const dist = (x: number, z: number): number =>
      (x - start.x) * start.dx + (z - start.z) * start.dz;
    const lastStake = Math.max(...stakes.map((s) => dist(s.x, s.z)));
    expect(Math.min(...trench.map((t) => dist(t[0], t[1])))).toBeGreaterThan(lastStake - 0.5);
  });
});

/** Opevnění `f` s díly `gone` zbořenými a díly `bare` bez nástavby (`top: 'none'`). */
const withSegments = (
  f: SceneFortification,
  gone: readonly number[],
  bare: readonly number[] = [],
): SceneFortification => ({
  ...f,
  segments: f.segments.map((s) => {
    if (gone.includes(s.index)) return { ...s, demolishedDay: 5, state: 0 };
    if (bare.includes(s.index)) {
      const rest = { ...s, top: 'none' as const };
      delete rest.topBuiltDay;
      return rest;
    }
    return s;
  }),
  looks: f.looks.map((l, i) => {
    if (!bare.includes(i)) return l;
    const rest = { ...l };
    delete rest.topAge;
    return rest;
  }),
});

describe('zboření úseku (demolition.md – Opevnění)', () => {
  it('palisáda se rozebírá jako staveniště pozpátku, zbořený díl je mezera', () => {
    const full = palisadeLayout(fort(), () => 0).stakes.length;
    const len0 = fort().shapes[0]!.lengthM;
    // rozebráno 35 % práce dílu 0 = fáze stavby na 65 % – polovina kůlů stojí
    const down = fort({
      work: { kind: 'demolish', progress: (s) => (s === 0 ? 0.35 : undefined) },
    });
    expect(segmentBuild(down, 0).ground?.phase).toEqual(fortSitePhase('palisade', 0.65));
    const missing = full - palisadeLayout(down, () => 0).stakes.length;
    expect(missing).toBeGreaterThan(len0 * 0.4 * STAKES_PER_M);
    expect(missing).toBeLessThan(len0 * 0.6 * STAKES_PER_M);
    // díl 1 zbořený – nic na něm nestojí, kůly chybí po celé jeho délce
    const gone = withSegments(fort(), [1]);
    expect(segmentBuild(gone, 1)).toMatchObject({ ground: null, top: null, rampart: null });
    const len1 = gone.shapes[1]!.lengthM;
    expect(full - palisadeLayout(gone, () => 0).stakes.length).toBeGreaterThan(
      len1 * 0.9 * STAKES_PER_M,
    );
  });

  it('val: nástavba se rozebírá, `none` bez nástavby, srovnávaný val klesá, srovnaný mezera', () => {
    const topped = fort({ kind: 'rampart', top: 'palisade' });
    expect(segmentBuild(topped, 0).top?.layer).toBe('palisade');
    const down = fort({
      kind: 'rampart',
      top: 'palisade',
      work: { kind: 'demolish', progress: (s) => (s === 0 ? 1 : undefined) },
    });
    expect(segmentBuild(down, 0).top?.phase.posts).toBe(0);
    expect(segmentBuild(down, 0).rampart?.earth).toBe(1);
    const bare = withSegments(topped, [], [0]);
    expect(segmentBuild(bare, 0).top).toBeNull();
    expect(segmentBuild(bare, 1).top?.layer).toBe('palisade');
    const level = fort({
      kind: 'rampart',
      work: { kind: 'level', progress: (s) => (s === 1 ? 0.25 : undefined) },
    });
    expect(rampartLooks(level)[1]!.height).toBeCloseTo(0.75);
    expect(rampartLooks(withSegments(fort({ kind: 'rampart' }), [2]))[2]!.height).toBe(0);
  });
});

describe('polský plot opevnění', () => {
  it('kůly po metru, větve mezi nimi, mezera brány; staveniště napřed kůly', () => {
    const f = fort({ kind: 'fence', gates: [{ segment: 1 }] });
    const stage = fortFenceStage(f, () => 0);
    const length = f.shapes.reduce((s, x) => s + x.lengthM, 0);
    expect(stage.posts.length).toBeGreaterThan(length * 0.9 - 6);
    expect(stage.posts.filter((p) => p.gate)).toHaveLength(2);
    // 7 výšek větví mezi sousedními kůly, kolem brány ne
    expect(stage.rails.length).toBe((stage.posts.length - 1) * 7);
    const site = fortFenceStage(
      fort({ kind: 'fence', age: () => null, work: { kind: 'build', progress: () => 0.3 } }),
      () => 0,
    );
    expect(site.rails).toHaveLength(0);
    expect(site.posts.length).toBeGreaterThan(length * 0.5);
  });
});

describe('val s příkopem', () => {
  it('průřez: příkop 1,5 m pod terénem, koruna 2 m, pata 10 m od okraje', () => {
    const full = { height: 1, round: 0 };
    expect(rampartProfile(2, full)).toBeCloseTo(-1.5);
    expect(rampartProfile(RAMPART_CROWN_M, full)).toBeCloseTo(2);
    expect(rampartProfile(10, full)).toBe(0);
    expect(rampartProfile(4, full)).toBeCloseTo(0);
    // starý val je nižší a zaoblený
    expect(rampartProfile(5, { height: 0.5, round: 1 })).toBeLessThan(rampartProfile(5, full) / 2);
  });

  it('zarůstá trávou za 2–3 roky, staveniště roste po úsecích, v bráně průchod', () => {
    const rampart = (o: Partial<DemoFort>): ReturnType<typeof demoFortification> =>
      fort({ kind: 'rampart', ...o });
    expect(rampartLooks(rampart({ age: () => 0 }))[0]!.grass).toBe(0);
    expect(rampartLooks(rampart({ age: () => 2 }))[0]!.grass).toBeGreaterThan(0.6);
    expect(rampartLooks(rampart({ age: () => 3 }))[0]!.grass).toBe(1);
    const site = rampart({
      age: () => null,
      work: { kind: 'build', progress: (s) => (s === 1 ? 0.4 : 0) },
    });
    expect(
      rampartLooks(site)
        .map((l) => l.height)
        .slice(0, 3),
    ).toEqual([0, 0.4, 0]);
    const gated = rampart({ gates: [{ segment: 2 }] });
    const s = gated.shapes[0]!.lengthM + gated.shapes[1]!.lengthM + gated.gates[0]!.offsetM;
    expect(rampartAt(gated, rampartLooks(gated), s).height).toBe(0);
    expect(crownLift(gated)(s + 10)).toBeCloseTo(2);
  });

  it('síť valu – hlína a tráva podle stáří, bez sítě v průchodu brány', () => {
    const fresh = rampartMeshData(fort({ kind: 'rampart', age: () => 0 }), flat);
    expect(fresh.grass.indices).toHaveLength(0);
    expect(fresh.earth.indices.length).toBeGreaterThan(0);
    const grown = rampartMeshData(fort({ kind: 'rampart', age: () => 5 }), flat);
    expect(grown.earth.indices).toHaveLength(0);
    const gated = rampartMeshData(
      fort({ kind: 'rampart', age: () => 0, gates: [{ segment: 2 }] }),
      flat,
    );
    expect(gated.earth.indices.length).toBeLessThan(fresh.earth.indices.length);
  });

  it('prořez příkopu: osa příkopu v pár úsečkách, mimo průchod brány, v mezích shaderu', () => {
    const f = fort({ kind: 'rampart', gates: [{ segment: 2 }] });
    const cuts = ditchCuts(f);
    expect(cuts.length).toBeGreaterThan(4);
    expect(cuts.length).toBeLessThanOrEqual(MAX_DITCH_CUTS);
    const packed = packDitchCuts(cuts);
    const gate = f.gates[0]!;
    const side = lineOf(f.shapes[2]!);
    // střed příkopu vedle brány (10 m) ano, v bráně ne, uvnitř plochy ne
    const n = { x: -side.dz, z: side.dx };
    const inward = (x: number, z: number, d: number): [number, number] => {
      const a: [number, number] = [x + n.x * d, z + n.z * d];
      const b: [number, number] = [x - n.x * d, z - n.z * d];
      const c = f.outline.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
      const cx = c[0] / f.outline.length;
      const cz = c[1] / f.outline.length;
      return Math.hypot(a[0] - cx, a[1] - cz) < Math.hypot(b[0] - cx, b[1] - cz) ? a : b;
    };
    const beside = inward(gate.x + side.dx * 10, gate.z + side.dz * 10, 2);
    expect(insideDitchCut(packed, ...beside)).toBe(true);
    expect(insideDitchCut(packed, ...inward(gate.x, gate.z, 2))).toBe(false);
    expect(insideDitchCut(packed, ...inward(gate.x + side.dx * 10, gate.z + side.dz * 10, 7))).toBe(
      false,
    );
    expect(ditchCuts(fort())).toEqual([]);
  });
});

describe('rohy pásu (fortifications.md – Obvod)', () => {
  type Fort = ReturnType<typeof fort>;
  const val = (top?: 'palisade'): Fort =>
    fort({ id: 5, kind: 'rampart', cells: { x: 8, y: 8, w: 3, h: 3 }, ...(top ? { top } : {}) });
  const dist = (a: readonly [number, number], b: readonly [number, number]): number =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  type Sample = ReturnType<typeof perimeterSamples>[number];
  /**
   * Body mimo ostré ohyby – vnitřní okraj přesně 10 m po normále (křivka ze čtverců nemá úplně
   * rovné kusy, tečny bodů oblouku ji lehce prohnou); musí to být víc než polovina obvodu.
   */
  const straightSamples = (samples: readonly Sample[]): Sample[] => {
    const out = samples.filter(
      (p) => dist([p.ix, p.iz], [p.x + p.nx * 10, p.z + p.nz * 10]) < 1e-6,
    );
    expect(out.length).toBeGreaterThan(samples.length / 2);
    return out;
  };
  /** Uzavřená čára bez opakovaných bodů (vnitřní okraj se v rohu sejde do jednoho bodu). */
  const loop = (pts: readonly (readonly [number, number])[]): [number, number][] =>
    pts
      .filter((p, i) => dist(p, pts[(i + 1) % pts.length]!) > 1e-9)
      .map(([x, z]): [number, number] => [x, z]);

  it('val: vnitřní okraj 10 m od rovných částí, v ohybu se sejde do rohu bez smyčky; příkop drží 4 m', () => {
    const f = val();
    const samples = perimeterSamples(f, RAMPART_RING_STEP_M);
    const band = fortBand(f);
    straightSamples(samples);
    // ohyb valu (8 m) je ostřejší než pás (10 m) – vnitřní okraj se v rozích sejde
    const cornered = samples.filter(
      (p) => dist([p.ix, p.iz], [p.x + p.nx * 10, p.z + p.nz * 10]) > 0.05,
    );
    expect(cornered.length).toBeGreaterThan(0);
    expect(selfCrossing(loop(samples.map((p): [number, number] => [p.ix, p.iz])))).toBeNull();
    for (const p of samples) {
      expect(dist(insetPoint(p, band.rigid, band), [p.x, p.z])).toBeCloseTo(4, 6);
      // normála dovnitř: jednotková, vnitřní okraj leží uvnitř plochy
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1, 9);
    }
  });

  it('val: průřez se nepřehne a násep v rohu není vyšší než na rovné části', () => {
    const f = val();
    const samples = perimeterSamples(f, RAMPART_RING_STEP_M);
    const band = fortBand(f);
    const mesh = rampartMeshData(f, flat).earth.positions;
    const cols = RAMPART_COLUMNS.length;
    const top = (i: number): number =>
      Math.max(...RAMPART_COLUMNS.map((_, c) => mesh[(i * cols + c) * 3 + 1]!));
    const flatTop = top(samples.indexOf(straightSamples(samples)[0]!));
    samples.forEach((p, i) => {
      expect(top(i)).toBeLessThanOrEqual(flatTop + 1e-9);
      // sloupce průřezu jdou od vnějšího okraje dovnitř – žádný se nevrátí ven
      const along = RAMPART_COLUMNS.map((d) => {
        const [x, z] = insetPoint(p, d, band);
        return (x - p.x) * p.nx + (z - p.z) * p.nz;
      });
      along.slice(1).forEach((a, c) => expect(a).toBeGreaterThanOrEqual(along[c]! - 1e-6));
    });
  });

  it('val s palisádou: koruna bez smyčky, kůly po ní 4 na metr', () => {
    const f = val('palisade');
    const crown = insetLine(f, RAMPART_CROWN_M, 0.25);
    expect(selfCrossing(loop(crown.map((p): [number, number] => [p.x, p.z])))).toBeNull();
    const { stakes } = palisadeLayout(f, () => 0);
    expect(stakes.length / lineLength(crown)).toBeCloseTo(STAKES_PER_M, 1);
  });

  it('palisáda a plot: čára kůlů soustředná s křivkou vnějšího okraje, nic se nestlačí', () => {
    for (const [kind, d] of [
      ['palisade', 0.75],
      ['fence', 0.5],
    ] as const) {
      const f = fort({ kind });
      const outer = f.shapes.flatMap((s) => s.path.slice(0, -1));
      const line = insetLine(f, d, 0.25);
      for (const p of line) {
        let best = Infinity;
        outer.forEach((a, i) => {
          const b = outer[(i + 1) % outer.length]!;
          const ex = b[0] - a[0];
          const ez = b[1] - a[1];
          const t = Math.min(
            1,
            Math.max(0, ((p.x - a[0]) * ex + (p.z - a[1]) * ez) / (ex * ex + ez * ez)),
          );
          best = Math.min(best, dist([p.x, p.z], [a[0] + ex * t, a[1] + ez * t]));
        });
        // tolerance – tětivy křivky po 1,5 m a nový krok čáry
        expect(Math.abs(best - d)).toBeLessThan(0.03);
      }
    }
  });
});

// Hradby a obrana (fortifications.md – Hradby a obrana, Rozhraní a scéna): palisáda s ochozem,
// roštová a komorová hradba po dílech podle `segmentWall`.
describe('palisáda s ochozem, roštová a komorová hradba', () => {
  /** Vzdálenost bodu od vnějšího okraje (lomené čáry úseků) a nejbližší úsek. */
  const edge = (f: SceneFortification, x: number, z: number): { d: number; segment: number } => {
    let best = { d: Infinity, segment: -1 };
    f.shapes.forEach((shape, k) => {
      for (let i = 0; i + 1 < shape.path.length; i++) {
        const [ax, az] = shape.path[i]!;
        const [bx, bz] = shape.path[i + 1]!;
        const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
        const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2));
        const d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
        if (d < best.d) best = { d, segment: k };
      }
    });
    return best;
  };
  /** Rovný úsek ≈ 15 m (tětiva skoro celá délka – bez oblouku rohu) – jeho index. */
  const straight = (f: SceneFortification): number =>
    f.shapes.findIndex((s) => {
      const [ax, az] = s.path[0]!;
      const [bx, bz] = s.path[s.path.length - 1]!;
      return Math.abs(s.lengthM - 15) < 1 && Math.hypot(bx - ax, bz - az) > s.lengthM * 0.999;
    });
  const parts = (list: FortInstance[], part: string): FortInstance[] =>
    list.filter((i) => i.part.startsWith(part));
  const inSegment = (f: SceneFortification, list: FortInstance[], k: number): FortInstance[] =>
    list.filter((i) => edge(f, i.x, i.z).segment === k);

  it('ochoz: 15 m – 60 kůlů a 7–8 fošen 1,5 m pod špičkami, sloupky k fošnám, schůdky jednou v úseku', () => {
    const f = fort({ kind: 'walkway' });
    const k = straight(f);
    expect(k).toBeGreaterThanOrEqual(0);
    const { stakes } = palisadeLayout(f, flat);
    const walk = walkwayLayout(f, flat);
    const len = f.shapes[k]!.lengthM;
    expect(Math.abs(inSegment(f, stakes, k).length - len * STAKES_PER_M)).toBeLessThanOrEqual(2);
    const planks = parts(walk, 'walk-plank');
    expect(inSegment(f, planks, k).length).toBeGreaterThanOrEqual(7);
    expect(inSegment(f, planks, k).length).toBeLessThanOrEqual(8);
    for (const p of planks) {
      expect(p.lift + WALKWAY.plankThickM).toBeCloseTo(STAKE_HEIGHT_M - 1.5, 5);
      // za kůly (0,75 m od okraje), uvnitř pásu 5,5 m
      expect(edge(f, p.x, p.z).d).toBeGreaterThan(1);
      expect(edge(f, p.x, p.z).d).toBeLessThan(2);
    }
    // sloupek stojí na násypu a sahá k fošně
    for (const post of parts(walk, 'walk-post'))
      expect(post.lift + post.scaleY * WALKWAY.postM).toBeCloseTo(
        WALKWAY.deckM - WALKWAY.plankThickM,
        5,
      );
    expect(parts(walk, 'walk-steps')).toHaveLength(f.shapes.length);
    expect(walkwayLayout(f, flat)).toEqual(walk);
    // palisáda bez ochozu nemá fošny
    expect(walkwayLayout(fort(), flat)).toEqual([]);
  });

  it('roštová 15 m: plenta po 1 m na vnější hraně pásu 7 m, klády roštu po 2 m, předprseň', () => {
    const f = fort({ kind: 'crib' });
    const k = straight(f);
    const crib = cribLayout(f, flat);
    const facing = parts(crib, 'facing-stone');
    expect(Math.abs(inSegment(f, facing, k).length - f.shapes[k]!.lengthM)).toBeLessThanOrEqual(1);
    for (const s of inSegment(f, facing, k)) {
      expect(edge(f, s.x, s.z).d).toBeCloseTo(CRIB.facingM / 2, 1);
      expect(s.scaleY * CRIB.facingModuleM).toBeCloseTo(CRIB.heightM, 5);
    }
    const logs = parts(crib, 'crib-log');
    expect(Math.max(...logs.map((l) => edge(f, l.x, l.z).d))).toBeLessThanOrEqual(CRIB.bandM);
    // na koruně dvě příčné klády po 2 m
    const top = logs.filter((l) => l.lift > CRIB.heightM - 0.5);
    expect(Math.abs(inSegment(f, top, k).length - f.shapes[k]!.lengthM)).toBeLessThanOrEqual(2);
    const parapets = parts(crib, 'parapet');
    expect(parapets.length).toBeGreaterThan(0);
    expect(parapets.every((p) => p.lift === CRIB.heightM)).toBe(true);
  });

  it('komorová: 15 m – 3 komory přes pás 8 m, čelní zeď vně', () => {
    const f = fort({ kind: 'chamber' });
    const k = straight(f);
    const chamber = chamberLayout(f, flat);
    const boxes = parts(chamber, 'chamber-box');
    expect(inSegment(f, boxes, k)).toHaveLength(3);
    for (const b of boxes)
      expect((b.scaleZ ?? 1) * CHAMBER.boxDepthM).toBeCloseTo(CHAMBER.bandM - CHAMBER.faceM, 5);
    const face = parts(chamber, 'chamber-face');
    expect(Math.abs(inSegment(f, face, k).length - f.shapes[k]!.lengthM)).toBeLessThanOrEqual(1);
    for (const s of inSegment(f, face, k))
      expect(edge(f, s.x, s.z).d).toBeCloseTo(CHAMBER.faceM / 2, 1);
    expect(parts(chamber, 'parapet').every((p) => p.lift === CHAMBER.heightM)).toBe(true);
  });

  it('na valu se vše zvedne o korunu, hradba začíná na koruně', () => {
    const crown = (): number => 2;
    const walk = walkwayLayout(fort({ kind: 'rampart', top: 'walkway' }), crown);
    const planks = parts(walk, 'walk-plank');
    expect(planks.length).toBeGreaterThan(0);
    expect(planks.every((p) => Math.abs(p.lift - (2 + WALKWAY.deckM - 0.05)) < 1e-9)).toBe(true);
    const cribFort = fort({ kind: 'rampart', top: 'crib' });
    const facing = parts(cribLayout(cribFort, crown), 'facing-stone');
    expect(facing.every((s) => s.lift === 2)).toBe(true);
    const onCrown = inSegment(cribFort, facing, straight(cribFort));
    expect(onCrown.length).toBeGreaterThan(10);
    for (const s of onCrown)
      expect(edge(cribFort, s.x, s.z).d).toBeCloseTo(RAMPART_CROWN_M + CRIB.facingM / 2, 1);
    const boxes = parts(
      chamberLayout(fort({ kind: 'rampart', top: 'chamber' }), crown),
      'chamber-box',
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => b.lift === 2)).toBe(true);
  });

  it('staveniště podle fáze úseku, dřevo šedne, kámen nestárne', () => {
    const building = (kind: 'walkway' | 'crib' | 'chamber', p: number): SceneFortification =>
      fort({
        kind,
        age: () => null,
        work: { kind: 'build', progress: (s) => (s === 0 ? p : undefined) },
      });
    // ochoz: kůly stojí, fošny od začátku úseku s násypem
    const walk = building('walkway', 0.8);
    const len = walk.shapes[0]!.lengthM;
    expect(palisadeLayout(walk, flat).stakes.length).toBeGreaterThan(len * 0.9 * STAKES_PER_M);
    const planks = parts(walkwayLayout(walk, flat), 'walk-plank');
    expect(planks.length).toBeGreaterThan(0);
    expect(planks.length).toBeLessThan(len / 2 / 2 + 1.5);
    // roštová roste po patrech – plenta do poloviny, bez předprsně
    const crib = cribLayout(building('crib', 0.5), flat);
    expect(parts(crib, 'facing-stone').every((s) => s.scaleY === 0.75)).toBe(true);
    expect(parts(crib, 'parapet')).toEqual([]);
    // komorová: napřed komory od začátku úseku, čelní zeď až potom
    const chamber = chamberLayout(building('chamber', 0.25), flat);
    expect(parts(chamber, 'chamber-box').length).toBeGreaterThan(0);
    expect(parts(chamber, 'chamber-box').length).toBeLessThan(len / 5);
    expect(parts(chamber, 'chamber-face')).toEqual([]);
    // stáří: klády šednou, plenta ne
    const old = cribLayout(fort({ kind: 'crib', age: () => 25 }), flat);
    expect(parts(old, 'crib-log')[0]!.color).toEqual(woodTint(25, 'crib'));
    expect(parts(old, 'facing-stone')[0]!.color).toEqual([1, 1, 1]);
  });

  it('zemina: násyp ochozu, jádro roštu a výplň komor ve výšce druhu, v bráně nic', () => {
    const top = (kind: 'walkway' | 'crib' | 'chamber'): number => {
      const data = wallCoreMeshData(fort({ kind, gates: [{ segment: 2 }] }), flat);
      const ys = [...data.earth.positions, ...data.grass.positions].filter((_, i) => i % 3 === 1);
      expect(data.earth.indices.length + data.grass.indices.length).toBeGreaterThan(0);
      return Math.max(...ys) - 0.02;
    };
    expect(top('walkway')).toBeCloseTo(WALKWAY.bankM, 5);
    expect(top('crib')).toBeCloseTo(CRIB.heightM, 5);
    expect(top('chamber')).toBeCloseTo(CHAMBER.fillM, 5);
    const none = wallCoreMeshData(fort(), flat);
    expect(none.earth.indices).toEqual([]);
    // v průchodu brány zemina není
    const f = fort({ kind: 'crib', gates: [{ segment: 2 }] });
    const gate = f.gates[0]!;
    const data = wallCoreMeshData(f, flat);
    const p = data.earth.positions;
    for (let i = 0; i < p.length; i += 3)
      if (Math.hypot(p[i]! - gate.x, p[i + 2]! - gate.z) < 1.5)
        expect(p[i + 1]!).toBeLessThan(0.03);
  });
});

describe('klešťová brána a věž (plán hradeb Ú18)', () => {
  /** Osa uličky z jádra: ústí, směr dovnitř a podél tětivy. */
  const frame = (
    f: SceneFortification,
  ): { mx: number; mz: number; nx: number; nz: number; ux: number; uz: number } => {
    const [a, b, c, d] = f.gateLooks![0]!.pincer!.alley;
    const mx = (a![0] + b![0]) / 2;
    const mz = (a![1] + b![1]) / 2;
    const ex = (c![0] + d![0]) / 2 - mx;
    const ez = (c![1] + d![1]) / 2 - mz;
    const len = Math.hypot(ex, ez);
    const across = Math.hypot(b![0] - a![0], b![1] - a![1]);
    return {
      mx,
      mz,
      nx: ex / len,
      nz: ez / len,
      ux: (b![0] - a![0]) / across,
      uz: (b![1] - a![1]) / across,
    };
  };

  it('ramena po obou stranách uličky 12 m podél cesty, vrata na vnitřním konci', () => {
    const f = fort({ gates: [{ segment: 1, pincer: true }] });
    expect(f.gateLooks?.[0]?.pincer?.age).not.toBeNull();
    const parts = pincerGateInstances(f);
    const ax = frame(f);
    const along = (p: FortInstance): number => (p.x - ax.mx) * ax.nx + (p.z - ax.mz) * ax.nz;
    const across = (p: FortInstance): number => (p.x - ax.mx) * ax.ux + (p.z - ax.mz) * ax.uz;
    for (const side of [-1, 1]) {
      const stakes = parts.filter((p) => p.part.startsWith('stake') && across(p) * side > 0);
      expect(stakes.length).toBeGreaterThan(40);
      const ts = stakes.map(along);
      expect(Math.max(...ts)).toBeGreaterThan(11.5);
      expect(Math.max(...ts) - Math.min(...ts)).toBeGreaterThanOrEqual(12);
      // kůly k uličce (4 m) – mimo ni
      for (const p of stakes) expect(Math.abs(across(p))).toBeGreaterThan(2);
    }
    const leaves = parts.filter((p) => p.part === 'gate-planks');
    expect(leaves).toHaveLength(2);
    for (const p of leaves) expect(along(p)).toBeCloseTo(12, 1);
    // v pásu zůstanou kůly a trám brány, křídla jsou na vratech
    const outer = fortGateInstances(f);
    expect(outer.some((p) => p.part === 'gate-post')).toBe(true);
    expect(outer.some((p) => p.part === 'gate-planks')).toBe(false);
  });

  it('rozestavěná klešťová brána – ramena od ústí podle průběhu, vrata až hotová', () => {
    const f = fort({ gates: [{ segment: 1, pincer: true }] });
    const look = f.gateLooks![0]!;
    const half = { ...f, gateLooks: [{ pincer: { ...look.pincer!, age: null, progress: 0.5 } }] };
    const done = pincerGateInstances(f).filter((p) => p.part.startsWith('stake')).length;
    const parts = pincerGateInstances(half);
    const stakes = parts.filter((p) => p.part.startsWith('stake')).length;
    expect(stakes).toBeGreaterThan(done * 0.4);
    expect(stakes).toBeLessThan(done * 0.6);
    expect(parts.some((p) => p.part === 'gate-planks')).toBe(false);
    // dokud ramena nestojí, křídla zůstanou v pásu
    expect(fortGateInstances(half).some((p) => p.part === 'gate-planks')).toBe(true);
  });

  it('věž stojí nad vraty, bez věže nic', () => {
    expect(towerInstances(fort({ gates: [{ segment: 1, pincer: true }] }))).toEqual([]);
    const f = fort({ gates: [{ segment: 1, pincer: true, tower: true }] });
    const [tower, ...rest] = towerInstances(f);
    expect(rest).toHaveLength(0);
    const ax = frame(f);
    expect(tower!.part).toBe('tower');
    expect((tower!.x - ax.mx) * ax.nx + (tower!.z - ax.mz) * ax.nz).toBeCloseTo(12, 1);
    expect((tower!.x - ax.mx) * ax.ux + (tower!.z - ax.mz) * ax.uz).toBeCloseTo(0, 1);
  });

  it('roštová hradba má ramena s kamenným čelem a ochozem na koruně', () => {
    const f = fort({ kind: 'crib', gates: [{ segment: 1, pincer: true }] });
    expect(f.gateLooks?.[0]?.pincer?.kind).toBe('crib');
    const parts = pincerGateInstances(f);
    expect(parts.some((p) => p.part.startsWith('facing-stone'))).toBe(true);
    expect(parts.some((p) => p.part.startsWith('stake'))).toBe(false);
    const planks = parts.filter((p) => p.part === 'walk-plank');
    expect(planks.length).toBeGreaterThan(8);
    for (const p of planks) expect(p.lift).toBeCloseTo(CRIB.heightM - WALKWAY.plankThickM, 6);
  });
});
