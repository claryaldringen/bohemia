import { describe, expect, it } from 'vitest';
import {
  DWELLING_PATH_BOX_M,
  PATH_TRAFFIC,
  computePathNetwork,
  pathAgeFactor,
  pathBounds,
  pathNetworkKey,
  pathStrength,
  simplifyPathLine,
  smoothPathLine,
  type PathNetwork,
  type PathVillage,
} from '../paths/network';
import { house, part, pathTestTerrain } from './paths-fixtures';

const terrain = pathTestTerrain();

function village(extra: Partial<PathVillage> = {}): PathVillage {
  return {
    dwellings: [house(1, 0, 0), house(2, 14, 4), house(3, -13, 5)],
    fields: [],
    labor: { day: 4000, month: 6, people: { children: 4, adults: 8, elders: 2 }, shares: [] },
    ...extra,
  };
}

const points = (network: PathNetwork): { x: number; z: number }[] =>
  network.lines.flatMap((l) => l.points);

/** Body os pěšin po 0,5 m (i mezi body lomené čáry). */
const samples = (network: PathNetwork): { x: number; z: number }[] =>
  network.lines.flatMap((l) =>
    l.points.slice(1).flatMap((b, k) => {
      const a = l.points[k]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
      return Array.from({ length: n }, (_, i) => ({
        x: a.x + ((b.x - a.x) * i) / n,
        z: a.z + ((b.z - a.z) * i) / n,
      }));
    }),
  );

describe('pathStrength, pathAgeFactor', () => {
  it('pod prahem provozu 0, pak roste a od plného provozu 1', () => {
    expect(pathStrength(PATH_TRAFFIC.min * 0.9)).toBe(0);
    expect(pathStrength(PATH_TRAFFIC.min)).toBeGreaterThan(0);
    expect(pathStrength(3)).toBeGreaterThan(pathStrength(1));
    expect(pathStrength(PATH_TRAFFIC.full)).toBe(1);
    expect(pathStrength(1000)).toBe(1);
  });

  it('spojení se vyšlapává dva roky', () => {
    expect(pathAgeFactor(0)).toBe(0);
    expect(pathAgeFactor(1)).toBeCloseTo(0.5);
    expect(pathAgeFactor(5)).toBe(1);
  });
});

describe('computePathNetwork – pěšiny vsi', () => {
  it('je deterministická', () => {
    const a = computePathNetwork({ village: village(), terrain });
    const b = computePathNetwork({ village: village(), terrain });
    expect(a.lines).toEqual(b.lines);
    expect(a.lines.length).toBeGreaterThan(0);
  });

  it('z domů vede pěšina k vodě (břeh potoka) a k okraji lesa', () => {
    const network = computePathNetwork({ village: village(), terrain });
    const pts = points(network);
    // u břehu (potok z ∈ (70, 76))
    expect(pts.some((p) => p.z > 60 && p.z < 72)).toBe(true);
    // u okraje lesa (x < −90 je les)
    expect(pts.some((p) => p.x < -80)).toBe(true);
    for (const id of [1, 2, 3]) {
      const errand = network.errands.get(id)!;
      expect(errand.water!.z).toBeGreaterThan(60);
      expect(errand.water!.z).toBeLessThan(72);
      expect(errand.wood!.x).toBeLessThan(-80);
    }
  });

  it('pěšina nevede domem a začíná u brány před vchodem', () => {
    const v = village();
    const network = computePathNetwork({ village: v, terrain });
    for (const d of v.dwellings) {
      const box = DWELLING_PATH_BOX_M[d.type];
      for (const p of network.lines.flatMap((l) => l.points)) {
        const c = Math.cos(d.position.rotation);
        const s = Math.sin(d.position.rotation);
        const lx = (p.x - d.position.x) * c - (p.z - d.position.z) * s;
        const lz = (p.x - d.position.x) * s + (p.z - d.position.z) * c;
        const inside = lx > box.minX && lx < box.maxX && lz > box.minZ && lz < box.maxZ;
        expect(inside).toBe(false);
      }
      // brána je kus před koncem šíje (vchod míří k +z)
      const gate = { x: d.position.x, z: d.position.z + box.maxZ + 1 };
      expect(
        network.lines.some((l) => l.points.some((p) => Math.hypot(p.x - gate.x, p.z - gate.z) < 4)),
      ).toBe(true);
    }
  });

  it('osetý díl obchází po okraji, přes úhor jde rovně', () => {
    // pole přes cestu k vodě: díly v řadě z = 37,5, x od −22,5 do 22,5
    const across = (stage: 'sown' | 'young-fallow'): PathVillage =>
      village({
        fields: [{ id: 9, parts: [-22.5, -7.5, 7.5, 22.5].map((x) => part(x, 37.5, stage)) }],
      });
    const deepInside = (network: PathNetwork): number =>
      samples(network).filter((p) => Math.abs(p.x) < 25 && Math.abs(p.z - 37.5) < 4.5).length;
    const sown = computePathNetwork({ village: across('sown'), terrain });
    const fallow = computePathNetwork({ village: across('young-fallow'), terrain });
    expect(deepInside(sown)).toBe(0);
    expect(deepInside(fallow)).toBeGreaterThan(0);
  });

  it('na pole se chodí podle práce dne – pěšina tam vede, s prací silnější', () => {
    const field = { id: 5, parts: [part(67.5, -22.5), part(82.5, -22.5)] };
    const idle = computePathNetwork({ village: village({ fields: [field] }), terrain });
    const busy = computePathNetwork({
      village: village({
        fields: [field],
        labor: {
          day: 4000,
          month: 7,
          people: { children: 4, adults: 8, elders: 2 },
          shares: [{ target: { kind: 'field', id: 5 }, manDays: 6 }],
        },
      }),
      terrain,
    });
    const nearField = (network: PathNetwork): number =>
      Math.max(
        0,
        ...network.lines.flatMap((l) =>
          l.points.flatMap((p, k) => (p.x > 45 && p.x < 62 ? [l.strength[k]!] : [])),
        ),
      );
    expect(nearField(idle)).toBeGreaterThan(0);
    expect(nearField(busy)).toBeGreaterThan(nearField(idle));
  });

  it('trasy se slévají – sousedé chodí k vodě i pro dřevo po společné pěšině', () => {
    const network = computePathNetwork({ village: village(), terrain });
    const key = (p: { x: number; z: number } | null): string => (p ? `${p.x},${p.z}` : '');
    const wood = [1, 2, 3].map((id) => key(network.errands.get(id)!.wood));
    expect(new Set(wood).size).toBe(1);
    // k vodě (z 40–55) vedou méně než tři souběžné pěšiny
    const lanes = new Set(
      samples(network)
        .filter((p) => p.z > 40 && p.z < 55)
        .map((p) => Math.round(p.x / 6)),
    );
    expect(lanes.size).toBeLessThan(3);
    // společný úsek je silnější než pěšina jedné domácnosti
    const strengths = network.lines.map((l) => Math.max(...l.strength));
    expect(Math.max(...strengths)).toBeGreaterThan(Math.min(...strengths));
  });

  it('nové obydlí pěšiny teprve vyšlapává (stáří), odjakživa stojící je má', () => {
    const fresh = village({
      dwellings: [house(1, 0, 0, 0, { since: 4000 }), house(2, 14, 4, 0, { since: 4000 })],
    });
    const old = village({
      dwellings: [house(1, 0, 0, 0, { since: 0 }), house(2, 14, 4, 0, { since: 0 })],
    });
    expect(computePathNetwork({ village: fresh, terrain }).lines).toEqual([]);
    expect(computePathNetwork({ village: old, terrain }).lines.length).toBeGreaterThan(0);
  });

  it('ves se dvěma domácnostmi má pěšinu ke hřbitovu (návštěvy hrobů)', () => {
    // domy daleko od sebe – každá domácnost chodí ke hřbitovu svou cestou, trasy se neslijí
    const cemetery = { id: 7, squares: [part(-7.5, -67.5), part(7.5, -67.5)] };
    const v = village({
      dwellings: [house(1, -40, 0), house(2, 40, 0)],
      cemeteries: [cemetery],
      labor: { day: 4000, month: 6, people: { children: 2, adults: 4, elders: 1 }, shares: [] },
    });
    const network = computePathNetwork({ village: v, terrain });
    expect(samples(network).some((p) => p.z < -50 && Math.abs(p.x) < 25)).toBe(true);
    // bez hřbitova tam pěšina nevede
    const none = computePathNetwork({ village: { ...v, cemeteries: [] }, terrain });
    expect(samples(none).some((p) => p.z < -50 && Math.abs(p.x) < 25)).toBe(false);
  });

  it('zrušený cíl vypadne', () => {
    const field = { id: 5, parts: [part(67.5, -52.5)] };
    const withField = computePathNetwork({ village: village({ fields: [field] }), terrain });
    const without = computePathNetwork({ village: village(), terrain });
    const towards = (network: PathNetwork): boolean =>
      points(network).some((p) => p.x > 55 && p.z < -40);
    expect(towards(withField)).toBe(true);
    expect(towards(without)).toBe(false);
  });

  it('pozemek polozemnice: pěšina vede od branky a dovnitř plotu nechodí', () => {
    // pozemek na políčku se středem (37,5; 7,5), dům vchodem k −z (k brance)
    const plot = { cell: { x: 2, y: 0 }, x: 37.5, z: 7.5, size: 15, variant: 'center' as const };
    const v = village({
      dwellings: [
        house(1, 0, 0),
        house(2, 14, 4),
        {
          ...house(5, 37.5, 7.5, Math.PI),
          type: 'polozemnice',
          plot,
        },
      ],
    });
    const network = computePathNetwork({ village: v, terrain });
    const inside = samples(network).filter(
      (p) => Math.abs(p.x - plot.x) < 6.5 && Math.abs(p.z - plot.z) < 6.5,
    );
    expect(inside).toEqual([]);
    // branka je na přední straně (−z) proti vchodu
    const gate = { x: 37.5, z: 7.5 - 7.5 - 1 };
    expect(
      network.lines.some((l) => l.points.some((p) => Math.hypot(p.x - gate.x, p.z - gate.z) < 3)),
    ).toBe(true);
  });

  it('ves bez obydlí pěšiny nemá', () => {
    expect(computePathNetwork({ village: village({ dwellings: [] }), terrain }).lines).toEqual([]);
    expect(pathBounds(village({ dwellings: [] }))).toBeNull();
  });

  it('stáří pěšiny v bodech podle stáří obydlí', () => {
    const v = village({
      dwellings: [house(1, 0, 0, 0, { since: 4000 - 3653 }), house(2, 14, 4, 0, { since: 0 })],
    });
    const network = computePathNetwork({ village: v, terrain });
    const years = network.lines.flatMap((l) => l.years);
    expect(Math.min(...years)).toBeGreaterThan(5);
    expect(Math.max(...years)).toBeLessThanOrEqual(100);
  });
});

describe('pathNetworkKey', () => {
  it('drobná změna práce síť nepřepočítá, nové pole ano', () => {
    const base = village({
      fields: [{ id: 5, parts: [part(67.5, -22.5)] }],
      labor: {
        day: 4000,
        month: 7,
        people: { children: 4, adults: 8, elders: 2 },
        shares: [{ target: { kind: 'field', id: 5 }, manDays: 6.04 }],
      },
    });
    const tiny = {
      ...base,
      labor: {
        ...base.labor!,
        day: 4001,
        shares: [
          { activity: 'harvest' as const, target: { kind: 'field' as const, id: 5 }, manDays: 6.1 },
        ],
      },
    };
    expect(pathNetworkKey(tiny)).toBe(pathNetworkKey(base));
    const grown = { ...base, fields: [...base.fields, { id: 6, parts: [part(82.5, -22.5)] }] };
    expect(pathNetworkKey(grown)).not.toBe(pathNetworkKey(base));
  });
});

describe('pathBounds', () => {
  it('ves s okolím zaokrouhlená ven', () => {
    const b = pathBounds(village())!;
    expect(b.minX).toBeLessThan(-200);
    expect(b.maxX).toBeGreaterThan(200);
    expect(Math.abs(b.minX % 90)).toBe(0);
  });
});

describe('simplifyPathLine, smoothPathLine', () => {
  it('zjednodušení nechá konce a zlom, vyhlazení konce a hodnoty mezi', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 5, z: 0.1 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    const simple = simplifyPathLine(pts, [[0, 0.5, 1, 1]], 0.5);
    expect(simple.points).toEqual([pts[0], pts[2], pts[3]]);
    expect(simple.values[0]).toEqual([0, 1, 1]);
    const smooth = smoothPathLine(simple.points, simple.values, 2);
    expect(smooth.points[0]).toEqual(pts[0]);
    expect(smooth.points[smooth.points.length - 1]).toEqual(pts[3]);
    expect(smooth.points.length).toBeGreaterThan(3);
    for (const v of smooth.values[0]!) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
