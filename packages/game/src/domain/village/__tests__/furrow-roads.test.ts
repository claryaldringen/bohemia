import { describe, expect, it } from 'vitest';
import type { Landscape } from '../../landscape';
import { capsuleRange, roadCapsules, roadFreeRuns, roadLandWidthM } from '../paths/road-land';
import { bandLengthM } from '../plough-blocks';
import {
  bandFurrowM,
  furrowInputs,
  plannedFurrowEfficiency,
  sameFurrowInputs,
  sowingFurrowEfficiency,
} from '../plough-trip';
import type { FieldPart, PloughBand, Road, VillageState } from '../types';

// Brázdy končí na cestě (oxen.md – Co nejdelší brázda; Martin, 19. 10. 2026: „pokud oráč
// narazí na cestu, tak spřežení otočí“): řádek orby se na pásu pevné cesty láme a pás dílů má
// tolik kusů brázdy, kolik ho cesty rozdělí.

const road = (points: [number, number][], grade: Road['grade'] = 'trodden'): Road => ({
  id: 1,
  points: points.map(([x, z]) => ({ x, z })),
  bornDay: 0,
  grade,
  traffic: [],
  spots: [],
});

describe('řádek orby přes pás cesty', () => {
  it('přímka křížící cestu napříč – dva úseky, mezera v šířce pásu', () => {
    const capsules = roadCapsules([
      road([
        [20, -50],
        [20, 50],
      ]),
    ]);
    const runs = roadFreeRuns(capsules, 0, 0, 1, 0, 0, 45);
    const half = roadLandWidthM({ grade: 'trodden' }) / 2;
    expect(runs).toHaveLength(2);
    expect(runs[0]!.from).toBe(0);
    expect(runs[0]!.to).toBeCloseTo(20 - half, 9);
    expect(runs[1]!.from).toBeCloseTo(20 + half, 9);
    expect(runs[1]!.to).toBe(45);
  });

  it('šikmá cesta – mezera podle šikmého průsečíku; cesta vedle řádku ho nezkrátí', () => {
    const capsules = roadCapsules([
      road(
        [
          [0, -40],
          [40, 40],
        ],
        'improved',
      ),
    ]);
    const [range] = [capsuleRange(capsules[0]!, -20, 0, 1, 0)];
    // osa protne z = 0 v x = 20 (u = 40 od začátku přímky v x = −20); pás ±1,5 m napříč osy –
    // podél řádku 1,5 / sin(úhlu)
    const sin = 80 / Math.sqrt(40 * 40 + 80 * 80);
    expect(range!.from).toBeCloseTo(40 - 1.5 / sin, 6);
    expect(range!.to).toBeCloseTo(40 + 1.5 / sin, 6);
    const aside = roadCapsules([
      road([
        [0, 10],
        [40, 10],
      ]),
    ]);
    expect(roadFreeRuns(aside, 0, 0, 1, 0, 0, 40)).toEqual([{ from: 0, to: 40 }]);
  });

  it('konec cesty a plácek rozcestí; kus kratší než minimum se neorá', () => {
    // cesta končí kus před řádkem – kulatý konec pásu
    const ends = roadCapsules([
      road([
        [20, 30],
        [20, 0.5],
      ]),
    ]);
    expect(roadFreeRuns(ends, 0, 0, 1, 0, 0, 40)).toHaveLength(2);
    expect(roadFreeRuns(ends, 0, -2, 1, 0, 0, 40)).toEqual([{ from: 0, to: 40 }]);
    // křižovatka tří úseků – obrys z pásů ramen a středu mezi nimi, žádný kruh
    const junction = roadCapsules([
      road([
        [20, 0],
        [20, 30],
      ]),
      road([
        [20, 0],
        [50, 0],
      ]),
      road([
        [20, 0],
        [-10, -20],
      ]),
    ]);
    expect(junction.some((c) => c.ax === c.bx && c.az === c.bz)).toBe(false);
    // spojnice sousedních ramen (mezery 90°, 124° a 146° – všechny pod 180°) 1,9 m od středu
    const fills = junction.filter(
      (c) =>
        Math.abs(Math.hypot(c.ax - 20, c.az) - 1.9) < 1e-9 &&
        Math.abs(Math.hypot(c.bx - 20, c.bz) - 1.9) < 1e-9,
    );
    expect(fills).toHaveLength(3);
    const runs = roadFreeRuns(junction, 0, 2, 1, 0, -10, 15, 2);
    expect(runs.every((r) => r.to - r.from >= 2)).toBe(true);
  });
});

describe('délka brázdy pásu přes cestu', () => {
  const geo = { size: 64, cellSizeM: 15 } as Landscape;
  const part = (id: number, x: number): FieldPart => ({
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 60,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x, y: 32 },
  });
  // šest dílů v řadě (90 m) – políčka 32–37 na ose z ≈ 7,5 m
  const parts = [1, 2, 3, 4, 5, 6].map((id) => part(id, 31 + id));
  const byId = new Map(parts.map((p) => [p.id, p]));
  const band: PloughBand = { partIds: [1, 2, 3, 4, 5, 6], axis: 'x', sweep: 1, block: 0 };
  const state = (roads: Road[]): Pick<VillageState, 'fields' | 'roads'> =>
    ({ fields: [{ id: 1 }], roads: { roads } }) as Pick<VillageState, 'fields' | 'roads'>;

  it('bez cesty celý pás; cesta napříč ho rozdělí na dva kusy s vlastními obraty', () => {
    expect(bandFurrowM(state([]), band, byId, geo)).toBe(bandLengthM(band, byId));
    expect(
      bandFurrowM(
        state([
          road([
            [30, -50],
            [30, 50],
          ]),
        ]),
        band,
        byId,
        null,
      ),
    ).toBe(90);
    // cesta x = 30 m (pás od 0 do 90 m)
    const crossed = bandFurrowM(
      state([
        road([
          [30, -50],
          [30, 50],
        ]),
      ]),
      band,
      byId,
      geo,
    );
    expect(crossed).toBeCloseTo((90 - 1.9) / 2, 6);
    // cesta podél pásu (mimo jeho osu) pás nedělí
    expect(
      bandFurrowM(
        state([
          road([
            [0, 14],
            [90, 14],
          ]),
        ]),
        band,
        byId,
        geo,
      ),
    ).toBe(90);
  });

  it('výkon orby plánu osevu z paměti – týž jako bez ní, se změnou dílů nebo cest se přepočte', () => {
    const land = { size: 64, cellSizeM: 15 } as Landscape;
    const across = state([
      road([
        [30, -50],
        [30, 50],
      ]),
    ]);
    const plain = plannedFurrowEfficiency(parts, across, land);
    expect(sowingFurrowEfficiency(parts, across, land)).toBe(plain);
    expect(sowingFurrowEfficiency(parts, across, land)).toBe(plain);
    // bez cesty delší brázda
    expect(sowingFurrowEfficiency(parts, state([]), land)).toBe(
      plannedFurrowEfficiency(parts, state([]), land),
    );
    expect(sowingFurrowEfficiency(parts, state([]), land)).toBeGreaterThan(plain);
    // jiná plocha jednoho dílu – jiná délka brázdy, ne paměť
    const open = sowingFurrowEfficiency(parts, state([]), land);
    const larger = parts.map((p) => (p.id === 1 ? { ...p, areaM2: 400 } : p));
    expect(sowingFurrowEfficiency(larger, state([]), land)).toBe(
      plannedFurrowEfficiency(larger, state([]), land),
    );
    expect(sowingFurrowEfficiency(larger, state([]), land)).not.toBe(open);
  });

  it('vstupy výkonu orby porovnané během průchodu – shoda jen při stejné řadě čísel', () => {
    const roads = [
      road([
        [30, -50],
        [30, 50],
      ]),
    ];
    const base = state(roads);
    const known = furrowInputs(parts, base);
    expect(sameFurrowInputs(known, parts, base)).toBe(true);
    expect(sameFurrowInputs(known, parts, state(roads.map((r) => ({ ...r }))))).toBe(true);
    const part = (change: Partial<FieldPart>): FieldPart[] =>
      parts.map((p, k) => (k === parts.length - 1 ? { ...p, ...change } : p));
    const changed: [readonly FieldPart[], Pick<VillageState, 'fields' | 'roads'>][] = [
      [parts.slice(1), base],
      [part({ id: 999 }), base],
      [part({ fieldId: 7 }), base],
      [part({ cell: { x: 50, y: 0 } }), base],
      [part({ cell: undefined }), base],
      [part({ areaM2: 1 }), base],
      [part({ distanceM: 1 }), base],
      [part({ walkDistanceM: 1 }), base],
      [parts, state([])],
      [parts, state([{ ...roads[0]!, grade: 'improved' }])],
      [parts, state([{ ...roads[0]!, cart: true }])],
      [
        parts,
        state([
          {
            ...roads[0]!,
            points: [
              { x: 30, z: -50 },
              { x: 31, z: 50 },
            ],
          },
        ]),
      ],
      [parts, { ...base, fields: [] }],
      [parts, { ...base, fields: base.fields.map((f) => ({ ...f, id: f.id + 1 })) }],
    ];
    for (const [p, s] of changed) {
      expect(furrowInputs(p, s)).not.toEqual(known);
      expect(sameFurrowInputs(known, p, s)).toBe(false);
      expect(sameFurrowInputs(furrowInputs(p, s), p, s)).toBe(true);
    }
  });

  it('výkon orby bez krajiny (výhled správce) z paměti – týž jako bez ní, se změnou dílů se přepočte', () => {
    const plain = plannedFurrowEfficiency(parts, state([]), null);
    expect(sowingFurrowEfficiency(parts, state([]), null)).toBe(plain);
    expect(sowingFurrowEfficiency(parts, state([]), null)).toBe(plain);
    // paměť s krajinou a bez ní se nepletou
    const land = { size: 64, cellSizeM: 15 } as Landscape;
    expect(sowingFurrowEfficiency(parts, state([]), land)).toBe(
      plannedFurrowEfficiency(parts, state([]), land),
    );
    expect(sowingFurrowEfficiency(parts, state([]), null)).toBe(plain);
    // jiná plocha i jiná vzdálenost chůze dílu – přepočet, ne paměť
    const larger = parts.map((p) => (p.id === 1 ? { ...p, areaM2: 400 } : p));
    expect(sowingFurrowEfficiency(larger, state([]), null)).toBe(
      plannedFurrowEfficiency(larger, state([]), null),
    );
    expect(sowingFurrowEfficiency(larger, state([]), null)).not.toBe(plain);
    const farther = parts.map((p) => (p.id === 1 ? { ...p, walkDistanceM: 900 } : p));
    expect(sowingFurrowEfficiency(farther, state([]), null)).toBe(
      plannedFurrowEfficiency(farther, state([]), null),
    );
  });
});
