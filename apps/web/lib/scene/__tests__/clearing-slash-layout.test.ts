import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneVillage } from '../../village-view';
import {
  HEAP_GAP_M,
  SLASH_EDGE_MARGIN_M,
  SLASH_HEAPS_MAX,
  SLASH_HEAPS_MIN,
  STUMP_CLEAR_M,
  clearingHeaps,
  clearingHeapsKey,
  slashHeapSites,
  type ClearingHeap,
} from '../clearing-slash-layout';
import { squareContains } from '../field-cells';
import { stumpScale } from '../felled-trees';
import type { Point } from '../village-layout';

/** Díl pole v lese – čtverec 15 m na políčku (x, 0). */
const part = (id: number, x: number, extra: Partial<SceneFieldPart> = {}): SceneFieldPart => ({
  id,
  cell: { x, y: 0 },
  x: x * 15,
  z: 0,
  size: 15,
  stage: 'founding',
  ...extra,
});
const dwellings: SceneVillage['dwellings'] = [
  { id: 1, type: 'zemnice', position: { x: -60, z: 0, rotation: 0 }, built: true, progress: 1 },
];
const village = (parts: SceneFieldPart[]): Pick<SceneVillage, 'fields' | 'dwellings'> => ({
  dwellings,
  fields: [{ id: 1, parts }],
});
const noAvoid = (): Point[] => [];
const kinds = (heaps: readonly ClearingHeap[]): string[] => heaps.map((h) => h.kind);
const at = (heaps: readonly ClearingHeap[]): string[] =>
  heaps.map((h) => `${h.x.toFixed(6)},${h.z.toFixed(6)}`);

describe('slashHeapSites – místa hromad větví na čtverci', () => {
  it('2–4 hromady uvnitř čtverce, deterministicky z id dílu', () => {
    const counts = new Set<number>();
    for (let id = 1; id <= 40; id++) {
      const square = part(id, 3, id % 2 === 0 ? { rotation: Math.PI / 12 } : {});
      const sites = slashHeapSites(square, []);
      counts.add(sites.length);
      expect(sites.length).toBeGreaterThanOrEqual(SLASH_HEAPS_MIN);
      expect(sites.length).toBeLessThanOrEqual(SLASH_HEAPS_MAX);
      for (const s of sites) {
        expect(squareContains(square, s.x, s.z, -SLASH_EDGE_MARGIN_M + 1e-6)).toBe(true);
      }
      expect(slashHeapSites(square, [])).toEqual(sites);
    }
    expect([...counts].sort()).toEqual([2, 3, 4]);
  });

  it('ne na pařezu ani na jiné hromadě; bez místa hromada chybí', () => {
    const square = part(7, 2);
    // pařezy v mřížce po 4 m – mezi nimi je místo jen na pár hromad
    const stumps: Point[] = [];
    for (let x = 22.5; x <= 37.5; x += 4) for (let z = -7.5; z <= 7.5; z += 4) stumps.push([x, z]);
    for (let id = 1; id <= 20; id++) {
      const sites = slashHeapSites({ ...square, id }, stumps);
      for (const s of sites) {
        for (const [x, z] of stumps) {
          expect(Math.hypot(x - s.x, z - s.z)).toBeGreaterThanOrEqual(STUMP_CLEAR_M);
        }
        for (const o of sites) {
          if (o !== s) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(HEAP_GAP_M);
        }
      }
    }
    // pařez na každém metru – žádná hromada
    const dense: Point[] = [];
    for (let x = 22; x <= 38; x++) for (let z = -8; z <= 8; z++) dense.push([x, z]);
    expect(slashHeapSites(square, dense)).toEqual([]);
  });
});

describe('clearingHeaps – co je vidět v které fázi', () => {
  const all = slashHeapSites(part(5, 1), []);

  it('kácení: větve jen na části, kde stromy padly; nezačaté kácení nic', () => {
    expect(clearingHeaps(village([part(5, 1, { look: 'slash', work: 0 })]), noAvoid)).toEqual([]);
    const half = clearingHeaps(village([part(5, 1, { look: 'slash', work: 0.5 })]), noAvoid);
    expect(half.every((h) => h.kind === 'slash')).toBe(true);
    expect(half.length).toBeLessThanOrEqual(all.length);
    const done = clearingHeaps(village([part(5, 1, { look: 'slash', work: 1 })]), noAvoid);
    expect(kinds(done)).toEqual(all.map(() => 'slash'));
  });

  it('schnutí: všechny hromady větví; pálení: spálená část ohořelé zbytky, zbytek větve', () => {
    const dry = clearingHeaps(village([part(5, 1, { look: 'slash' })]), noAvoid);
    expect(kinds(dry)).toEqual(all.map(() => 'slash'));
    expect(at(dry)).toEqual(at(all.map((s) => ({ ...s, kind: 'slash' as const }))));
    for (const work of [0.25, 0.5, 0.75]) {
      const burning = clearingHeaps(
        village([part(5, 1, { look: 'burnt', work, before: 'slash' })]),
        noAvoid,
      );
      // stejná místa – hromada shoří na místě
      expect(at(burning)).toEqual(at(dry));
      const burnt = clearingHeaps(village([part(5, 1, { look: 'burnt' })]), noAvoid);
      expect(kinds(burnt)).toEqual(all.map(() => 'char'));
      // s postupem pálení ohořelých zbytků přibývá
      const chars = burning.filter((h) => h.kind === 'char').length;
      const more = clearingHeaps(
        village([part(5, 1, { look: 'burnt', work: work + 0.25, before: 'slash' })]),
        noAvoid,
      ).filter((h) => h.kind === 'char').length;
      expect(more).toBeGreaterThanOrEqual(chars);
    }
  });

  it('první práce na spálenině: ohořelé zbytky jen na nezpracované části, pak nic', () => {
    const sowing = clearingHeaps(
      village([part(5, 1, { stage: 'sown', look: 'sown', work: 0.5, before: 'burnt' })]),
      noAvoid,
    );
    expect(sowing.every((h) => h.kind === 'char')).toBe(true);
    expect(sowing.length).toBeLessThanOrEqual(all.length);
    expect(clearingHeaps(village([part(5, 1, { look: 'sown' })]), noAvoid)).toEqual([]);
    expect(clearingHeaps(village([part(5, 1, { look: 'bare' })]), noAvoid)).toEqual([]);
  });
});

describe('clearingHeapsKey', () => {
  it('beze změny dílů a fází stejný, změna pruhu práce nebo vzhledu jiný; bez paseky prázdný', () => {
    const a = clearingHeapsKey(village([part(5, 1, { look: 'slash', work: 0.5 })]));
    expect(clearingHeapsKey(village([part(5, 1, { look: 'slash', work: 0.51 })]))).toBe(a);
    expect(clearingHeapsKey(village([part(5, 1, { look: 'slash', work: 0.75 })]))).not.toBe(a);
    expect(clearingHeapsKey(village([part(5, 1, { look: 'burnt' })]))).not.toBe(a);
    expect(clearingHeapsKey(village([part(5, 1, { look: 'sown' })]))).toBe('');
  });
});

describe('stumpScale – pařezy klučení', () => {
  it('mladý stromek má nízký pahýl, dospělý strom a souš pařez podle velikosti', () => {
    expect(stumpScale('youngTree', 0.35)).toBeLessThan(0.5);
    expect(stumpScale('youngTree', 1.2)).toBeLessThanOrEqual(0.5);
    expect(stumpScale('tree', 1)).toBeCloseTo(0.86, 9);
    expect(stumpScale('snag', 0.9)).toBeCloseTo(0.83, 9);
  });
});
