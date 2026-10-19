import { describe, expect, it } from 'vitest';
import type { Landscape } from '../../landscape';
import { capsuleRange, roadCapsules, roadFreeRuns, roadLandWidthM } from '../paths/road-land';
import { bandLengthM } from '../plough-blocks';
import { bandFurrowM } from '../plough-trip';
import { ROAD_LAND } from '../rules';
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
    // rozcestí tří úseků – plácek širší než pás
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
    const disc = junction.find((c) => c.ax === c.bx && c.az === c.bz)!;
    expect(disc.r).toBeCloseTo(1.9 * ROAD_LAND.junctionScale, 9);
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
});
