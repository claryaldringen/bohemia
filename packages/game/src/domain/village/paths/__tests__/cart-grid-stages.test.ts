// Mřížka vozu s jinými stadii dílů (withPartStages) = celá mřížka nové vsi, bit po bitu
// (docs/code/village-roads.md – Trasy v paměti); buňky polí v paměti (fieldCellsOf) = bez paměti.
import { describe, expect, it } from 'vitest';
import { createRandom, type Random } from '../../../landscape/random';
import { NO_OBSTACLE_CHANGES } from '../../core/obstacles';
import { cartGrid, withPartStages, type CartGrid, type CartVillage } from '../cart';
import { cartGridKey, forgetCartRoutes, memoCartCost } from '../cart-memo';
import { fieldCellsOf, forgetFieldCells, squareCells } from '../network-grid';
import { nearestPartFinder } from '../nearest';
import { pathWindowFor } from '../terrain';
import type { PartStage } from '../../core/summary';
import { house, part, pathLandscape, pathTestTerrain } from '../../__tests__/paths-fixtures';

const STAGES: readonly PartStage[] = [
  'sown',
  'ready',
  'founding',
  'meadow',
  'shrubs',
  'young-forest',
];
const pick = <T>(r: Random, list: readonly T[]): T => list[Math.floor(r.next() * list.length)]!;
/** Střed políčka uvnitř okna testového terénu. */
const spot = (r: Random): number => -142.5 + 15 * (2 + Math.floor(r.next() * 16));
const squareAt = (r: Random): ReturnType<typeof part> => part(spot(r), spot(r));

/** Ves s poli (i přes sebe – tentýž čtverec ve dvou polích) a vrstvami, které díly přepíšou. */
function randomVillage(r: Random): CartVillage {
  const fields: { id: number; parts: ReturnType<typeof part>[] }[] = [];
  const nFields = 1 + Math.floor(r.next() * 4);
  for (let f = 0; f < nFields; f++) {
    // víc než 16 dílů = hledání nejbližšího dílu po přihrádkách
    const n = 1 + Math.floor(r.next() * 24);
    const parts: ReturnType<typeof part>[] = [];
    for (let k = 0; k < n; k++) {
      const prev = fields[f - 1]?.parts;
      const square = prev && r.next() < 0.2 ? { ...pick(r, prev) } : squareAt(r);
      parts.push({ ...square, stage: pick(r, STAGES) });
    }
    fields.push({ id: f + 1, parts });
  }
  const road = [
    { x: spot(r), z: spot(r) },
    { x: spot(r) + 4, z: spot(r) - 3 },
    { x: spot(r), z: spot(r) + 2 },
  ];
  return {
    dwellings: [house(1, spot(r), spot(r)), house(2, spot(r), spot(r))],
    fields,
    roads: r.next() < 0.8 ? [{ id: 1, points: road, grade: 'trodden' }] : [],
    woods: [{ ...squareAt(r), surface: pick(r, ['meadow', 'forest'] as const) }],
    orchards: [{ id: 1, squares: [pick(r, fields[0]!.parts), squareAt(r)] }],
    cemeteries: [{ id: 1, built: true, squares: [squareAt(r)] }],
    pens: [{ ...pick(r, fields[nFields - 1]!.parts), id: 1, built: true }],
    sacred: {
      oaks: [],
      groves: [],
      buildings: [
        {
          id: 1,
          kind: 'shrine',
          position: { x: spot(r), z: spot(r), rotation: 0 },
          built: true,
        },
      ],
    },
  };
}

/** Táž ves s jinými stadii dílů (často zarostlý ↔ ne). */
function restaged(r: Random, v: CartVillage): CartVillage {
  return {
    ...v,
    fields: v.fields.map((f) => ({
      ...f,
      parts: f.parts.map((p) => (r.next() < 0.5 ? { ...p, stage: pick(r, STAGES) } : p)),
    })),
  };
}

/** První buňka, kde se mřížky liší (bitově, i pásy pevné cesty) – shoda −1. */
function firstDifference(a: CartGrid, b: CartGrid): number {
  const ab = new Uint32Array(a.cost.buffer, a.cost.byteOffset, a.cost.length);
  const bb = new Uint32Array(b.cost.buffer, b.cost.byteOffset, b.cost.length);
  if (ab.length !== bb.length) return 0;
  for (let c = 0; c < ab.length; c++) {
    if (ab[c] !== bb[c] || (a.road?.[c] ?? 0) !== (b.road?.[c] ?? 0)) return c;
  }
  return -1;
}

describe('mřížka vozu s jinými stadii dílů (withPartStages)', () => {
  const terrain = pathTestTerrain();

  it('= celá mřížka nové vsi bit po bitu (60 náhodných vsí, dvakrát po sobě)', () => {
    const r = createRandom(20261027);
    let changed = 0;
    for (let n = 0; n < 60; n++) {
      const a = randomVillage(r);
      const b = restaged(r, a);
      const c = restaged(r, b);
      const gridA = cartGrid({ village: a, terrain });
      const gridB = cartGrid({ village: b, terrain });
      const fromA = withPartStages(gridA, b)!;
      expect(firstDifference(fromA, gridB)).toBe(-1);
      // odvozená z odvozené
      expect(firstDifference(withPartStages(fromA, c)!, cartGrid({ village: c, terrain }))).toBe(
        -1,
      );
      if (firstDifference(gridA, gridB) >= 0) changed++;
    }
    // test má smysl: většina vsí změnou stadií změní mřížku
    expect(changed).toBeGreaterThan(30);
  });

  it('mřížka bez vrstvy dílů (ne z cartGrid) se neodvodí', () => {
    const r = createRandom(7);
    const v = randomVillage(r);
    const grid = cartGrid({ village: v, terrain });
    expect(withPartStages({ ...grid, fieldCells: null }, v)).toBeNull();
  });

  it('paměť mřížek: klíč lišící se jen zarostlými díly mřížku odvodí, jiné rozložení ne', () => {
    const l = pathLandscape();
    forgetCartRoutes(l);
    const window = pathWindowFor(l, { minX: -150, minZ: -150, maxX: 150, maxZ: 150 });
    const r = createRandom(11);
    const a = randomVillage(r);
    const shrubs = (v: CartVillage, stage: PartStage): CartVillage => ({
      ...v,
      fields: v.fields.map((f, i) => ({
        ...f,
        parts: f.parts.map((p, k) => (i === 0 && k === 0 ? { ...p, stage } : p)),
      })),
    });
    const sown = shrubs(a, 'sown');
    const overgrown = shrubs(a, 'shrubs');
    const key = (v: CartVillage): string => cartGridKey(v, window, NO_OBSTACLE_CHANGES);
    expect(key(sown)).not.toBe(key(overgrown));
    const similar: (CartGrid | null)[] = [];
    const make =
      (v: CartVillage) =>
      (from: CartGrid | null): CartGrid => {
        similar.push(from);
        return (from && withPartStages(from, v)) ?? cartGrid({ village: v, terrain });
      };
    const depots = [{ x: spot(r), z: spot(r) }];
    const target = { x: spot(r), z: spot(r), reachM: 3 };
    const cost = (v: CartVillage): number =>
      memoCartCost(l, null, key(v), make(v), 'two-wheel', depots, target).cost;
    cost(sown);
    const derived = cost(overgrown);
    expect(similar[0]).toBeNull();
    expect(similar[1]).not.toBeNull();
    forgetCartRoutes(l);
    expect(cost(overgrown)).toBe(derived);
    // jiné rozložení (díl jinde) – mřížka se staví celá
    const moved: CartVillage = {
      ...a,
      fields: [{ id: 9, parts: [part(-112.5, -112.5)] }, ...a.fields],
    };
    cost(moved);
    expect(similar[3]).toBeNull();
    forgetCartRoutes(l);
  });
});

describe('buňky polí v paměti (fieldCellsOf)', () => {
  const terrain = pathTestTerrain();
  /** Bez paměti: `squareCells` a nejbližší díl (`nearestPartFinder`) – jako dřív v mřížkách. */
  const direct = (
    grid: typeof terrain,
    parts: readonly ReturnType<typeof part>[],
  ): { inside: number[]; edge: number[]; nearest: ReturnType<typeof part>[] } => {
    const { inside, edge } = squareCells(grid, parts);
    const finder = nearestPartFinder(parts, parts[0]?.size ?? 0);
    const nearest = inside.map((c) =>
      finder(
        grid.originX + (c % grid.width) * grid.cellM,
        grid.originZ + Math.floor(c / grid.width) * grid.cellM,
      ),
    );
    return { inside, edge, nearest };
  };

  it('= bez paměti (80 náhodných polí, i natočená, posunutá a v menším okně), teplá i studená', () => {
    const r = createRandom(42);
    const small = { ...terrain, width: terrain.width - 7, originX: terrain.originX + 4.5 };
    for (let n = 0; n < 80; n++) {
      const rotation = r.next() < 0.3 ? (Math.PI / 12) * Math.floor(r.next() * 6) : undefined;
      const parts = Array.from({ length: 1 + Math.floor(r.next() * 24) }, () => ({
        ...squareAt(r),
        ...(rotation === undefined ? {} : { rotation }),
      }));
      for (const grid of [terrain, small]) {
        if (n % 2 === 0) forgetFieldCells();
        const want = direct(grid, parts);
        for (let round = 0; round < 2; round++) {
          const got = fieldCellsOf(grid, parts);
          expect(got.inside).toEqual(want.inside);
          expect(got.edge).toEqual(want.edge);
          want.nearest.forEach((p, k) => expect(parts[got.nearest[k]!]).toBe(p));
        }
      }
      // díl posunutý na místě (týž objekt) – paměť ho pozná podle polohy
      parts[0]!.x += 15;
      const moved = direct(terrain, parts);
      expect(fieldCellsOf(terrain, parts).inside).toEqual(moved.inside);
    }
  });
});
