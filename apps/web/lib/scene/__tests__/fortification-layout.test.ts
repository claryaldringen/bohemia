import { describe, expect, it } from 'vitest';
import {
  RAMPART_CROWN_M,
  STAKES_PER_M,
  crownLift,
  ditchCuts,
  fortFenceStage,
  fortGateInstances,
  insetLine,
  insideDitchCut,
  packDitchCuts,
  palisadeLayout,
  rampartAt,
  rampartLooks,
  rampartProfile,
  MAX_DITCH_CUTS,
} from '../fortification-layout';
import { demoFortification, type DemoFort, SHOWCASE_FORT_GEO } from '../fortification-showcase';
import { rampartMeshData } from '../rampart-mesh';
import { fortSitePhase } from '../village-construction';

// Opevnění ve scéně (fortifications.md – Ve scéně): kůly, plot, brány, val a prořez příkopu.

const fort = (o: Partial<DemoFort> = {}): ReturnType<typeof demoFortification> =>
  demoFortification(
    { id: 3, kind: 'palisade', cells: { x: 8, y: 8, w: 6, h: 6 }, ...o },
    SHOWCASE_FORT_GEO,
  );
const flat = (): number => 0;
const lineLength = (pts: { x: number; z: number }[]): number =>
  pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return sum + Math.hypot(q.x - p.x, q.z - p.z);
  }, 0);

describe('palisáda', () => {
  it('kůly ≈ 4 na metr po celé čáře palisády i po obloucích, pevně stejně', () => {
    const f = fort();
    const line = insetLine(f.shapes, 0.75, 0.25, { rigid: 1.5, full: 1.5 });
    const { stakes } = palisadeLayout(f, () => 0);
    expect(stakes.length / lineLength(line)).toBeCloseTo(STAKES_PER_M, 1);
    // obvod 6 × 6 čtverců (90 m) – palisáda ≈ 350 m
    expect(f.shapes.reduce((s, x) => s + x.lengthM, 0)).toBeGreaterThan(345);
    expect(palisadeLayout(f, () => 0)).toEqual({ stakes, trench: [] });
    const heights = new Set(stakes.map((s) => s.scaleY.toFixed(3)));
    expect(heights.size).toBeGreaterThan(10);
    expect(stakes.every((s) => s.scaleY >= 0.95 && s.scaleY <= 1.03)).toBe(true);
    // kůly i na oblouku rohu (ne jen na rovných částech)
    const arc = f.shapes.find((s) => s.arc)!.arc!;
    expect(stakes.some((s) => Math.hypot(s.x - arc.x, s.z - arc.z) < arc.r)).toBe(true);
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
    const start = f.shapes[0]!.line;
    const dist = (x: number, z: number): number =>
      (x - start.x) * start.dx + (z - start.z) * start.dz;
    const lastStake = Math.max(...stakes.map((s) => dist(s.x, s.z)));
    expect(Math.min(...trench.map((t) => dist(t[0], t[1])))).toBeGreaterThan(lastStake - 0.5);
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
    const side = f.shapes[2]!.line;
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
