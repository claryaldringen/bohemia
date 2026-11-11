import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import type { Landscape } from '../../../landscape';
import { createRandom, type Random } from '../../../landscape/random';
import { foundField, foundVillage } from '../../core/actions';
import type { PathLine } from '../network';
import { PATH_WATER, PATH_WETLAND, type PathTerrain } from '../terrain';
import { refreshWalkDistances } from '../village';
import {
  forgetWalkMemo,
  walkGraph,
  walkingDistances,
  walkMemoOf,
  type WalkGround,
} from '../walking';
import type { Person, VillageState } from '../../types';
import { LANDSCAPE } from '../../__tests__/paths-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Paměť chůze rovně po úsečkách (docs/code/village-roads.md – Trasy v paměti): délky z paměti
// platí, dokud se buňky půdy kolem úsečky nezmění – vzdálenosti chůze bit po bitu tytéž jako bez
// paměti, s teplou pamětí přes změny polí i se studeným startem.

const CELL_M = 3.75;

interface Layers {
  flags: Uint8Array;
  speed: Float32Array;
  crop: Uint8Array;
}

/** Náhodný terén: louka s mokřinou a vodou; pole po dílech (rychlost, osev) zvlášť. */
function randomTerrain(r: Random): { terrain: PathTerrain; layers: Layers } {
  const width = 30 + Math.floor(r.next() * 50);
  const height = 30 + Math.floor(r.next() * 50);
  const all = width * height;
  const layers: Layers = {
    flags: new Uint8Array(all),
    speed: new Float32Array(all).fill(1),
    crop: new Uint8Array(all),
  };
  const terrain: PathTerrain = {
    width,
    height,
    originX: -40 + Math.floor(r.next() * 8) * CELL_M,
    originZ: -30 + Math.floor(r.next() * 8) * CELL_M,
    cellM: CELL_M,
    window: { i0: 0, j0: 0, i1: width - 1, j1: height - 1 },
    cost: new Float32Array(all).fill(1),
    flags: layers.flags,
  };
  for (let q = 0; q < 6; q++)
    patch(r, terrain, (c) => (layers.flags[c] = layers.flags[c]! | PATH_WETLAND));
  for (let q = 0; q < 3; q++)
    patch(r, terrain, (c) => (layers.flags[c] = layers.flags[c]! | PATH_WATER));
  return { terrain, layers };
}

/** Čtvercová skvrna buněk na náhodném místě. */
function patch(r: Random, t: PathTerrain, fill: (c: number) => void, max = 10): void {
  const i0 = Math.floor(r.next() * t.width);
  const j0 = Math.floor(r.next() * t.height);
  const size = 1 + Math.floor(r.next() * max);
  for (let j = j0; j < Math.min(t.height, j0 + size); j++) {
    for (let i = i0; i < Math.min(t.width, i0 + size); i++) fill(j * t.width + i);
  }
}

/** Pole přes terén: `count` skvrn dílů (rychlost pole, osev) – nová půda nad týmž terénem. */
function fieldGround(r: Random, t: PathTerrain, base: Layers, count: number): WalkGround {
  const speed = base.speed.slice();
  const crop = base.crop.slice();
  for (let q = 0; q < count; q++) {
    const sown = r.next() < 0.5 ? 1 : 0;
    const v = sown ? 0.875 : 1;
    patch(
      r,
      t,
      (c) => {
        speed[c] = v;
        crop[c] = sown;
      },
      6,
    );
  }
  return { terrain: t, fields: { speed, crop } };
}

/** Náhodná pěšina přes mřížku (body po ≈ 5 m) s náhodnou silou. */
function randomLine(r: Random, t: PathTerrain): PathLine {
  const points = [];
  let x = t.originX + r.next() * t.width * t.cellM;
  let z = t.originZ + r.next() * t.height * t.cellM;
  const steps = 5 + Math.floor(r.next() * 25);
  for (let k = 0; k < steps; k++) {
    points.push({ x, z });
    x += (r.next() - 0.5) * 10;
    z += (r.next() - 0.5) * 10;
  }
  return {
    points,
    strength: points.map(() => r.next()),
    years: points.map(() => 10),
    openStart: true,
    openEnd: true,
  };
}

const sameBits = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, k) => Object.is(v, b[k]));

describe('walkingDistances s pamětí chůze rovně', () => {
  it('na 30 náhodných mapách a sledech půd dá bit po bitu totéž co bez paměti', () => {
    const r = createRandom(20261027);
    for (let map = 0; map < 30; map++) {
      const { terrain: t, layers } = randomTerrain(r);
      const memo = walkMemoOf({ map } as unknown as Landscape);
      const point = (): { x: number; z: number } => ({
        x: t.originX + (r.next() * 1.3 - 0.15) * t.width * t.cellM,
        z: t.originZ + (r.next() * 1.3 - 0.15) * t.height * t.cellM,
      });
      const origins = [point(), point(), point()];
      const targets = Array.from({ length: 40 }, point);
      const graph = walkGraph(Array.from({ length: 4 }, () => randomLine(r, t)));
      // sled půd: pole, táž pole v novém objektu, pár změněných skvrn, hodně změn, bez polí
      const first = fieldGround(r, t, layers, 8);
      const grounds: WalkGround[] = [
        first,
        {
          terrain: t,
          fields: { speed: first.fields!.speed.slice(), crop: first.fields!.crop.slice() },
        },
        fieldGround(r, t, { ...layers, ...first.fields! }, 2),
        fieldGround(r, t, layers, 20),
        { terrain: t },
        first,
      ];
      const gens: number[] = [];
      for (const ground of grounds) {
        const more = [...targets, point(), point()];
        const expected = walkingDistances(graph, origins, more, ground);
        const actual = walkingDistances(graph, origins, more, ground, memo);
        expect(sameBits(actual, expected), `mapa ${map}`).toBe(true);
        gens.push(memo.gen);
      }
      // táž pole v novém objektu generaci nemění
      expect(gens[1]).toBe(gens[0]);
      expect(gens[3]).toBeGreaterThan(gens[1]!);
      expect(memo.size).toBeGreaterThan(0);
    }
  });

  it('jiný terén paměť vyprázdní, mez krajin: třetí krajina vytlačí nejstarší', () => {
    const r = createRandom(7);
    const a = randomTerrain(r).terrain;
    const b = randomTerrain(r).terrain;
    const l1 = { id: 1 } as unknown as Landscape;
    const memo = walkMemoOf(l1);
    const graph = walkGraph([]);
    const o = [{ x: a.originX + 5, z: a.originZ + 5 }];
    const q = [{ x: a.originX + 60, z: a.originZ + 40 }];
    walkingDistances(graph, o, q, { terrain: a }, memo);
    expect(memo.size).toBe(1);
    walkingDistances(graph, o, q, { terrain: b }, memo);
    expect(memo.size).toBe(1);
    expect(memo.terrain).toBe(b);
    walkMemoOf({ id: 2 } as unknown as Landscape);
    walkMemoOf({ id: 3 } as unknown as Landscape);
    expect(walkMemoOf(l1)).not.toBe(memo);
    forgetWalkMemo(l1);
  });
});

const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const YEAR = 365.25;

/** Ves s hotovou zemnicí v (−60, −40), dvěma páry dospělých a polem na východě (5 dílů). */
function withField(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: -60, z: -40, rotation: 0 } }),
  );
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: DAY - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 22), adult(5, 21)];
  s.constructions = [];
  s.storesKg = 4000;
  s.dwellings[0]!.builtDay = DAY - 20 * 365;
  const cells = [12, 13, 14, 15, 16].map((x) => ({ x, y: 7 }));
  return foundField(s, DAY, {
    parts: cells.map((cell) => ({
      cell,
      areaM2: 225,
      distanceM: Math.hypot(-142.5 + cell.x * 15 + 60, -142.5 + cell.y * 15 + 40),
      naturalFertility: 60,
      surface: 'meadow' as const,
      obstacleCost: 0,
    })),
  });
}

describe('přepočet chůze vsi s pamětí (refreshWalkDistances)', () => {
  it('teplá paměť přes přidané a odebrané díly = studený start před každým přepočtem', () => {
    const run = (forget: boolean): unknown[] => {
      forgetWalkMemo(LANDSCAPE);
      const s = withField();
      const out: unknown[] = [];
      const template = s.parts[0]!;
      const changes: ((s: VillageState) => void)[] = [
        () => {},
        (v) => v.parts.push({ ...template, id: 901, cell: { x: 12, y: 8 } }),
        (v) => v.parts.push({ ...template, id: 902, cell: { x: 13, y: 8 } }),
        (v) => (v.parts = v.parts.filter((p) => p.id !== 901)),
        (v) => v.parts.push({ ...template, id: 903, cell: { x: 16, y: 9 } }),
      ];
      changes.forEach((change, k) => {
        change(s);
        if (forget) forgetWalkMemo(LANDSCAPE);
        refreshWalkDistances(s, DAY + 1 + k, LANDSCAPE, null);
        out.push(
          structuredClone({
            parts: s.parts.map((p) => [p.id, p.walkDistanceM]),
            dwellings: s.dwellings.map((d) => [d.forestWalkM, d.waterWalkM]),
          }),
        );
      });
      return out;
    };
    const warm = run(false);
    expect(run(true)).toEqual(warm);
    expect(warm.length).toBe(5);
  });
});
