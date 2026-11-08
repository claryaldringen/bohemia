import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone';
import { obstacleChangesAt } from '../obstacles';
import { orchardSeasonDay } from '../orchard';
import { ORCHARD, ORCHARD_WILD } from '../rules';
import { advanceVillage } from '../simulate';
import { abandonStructure, restoreStructure } from '../structure-use';
import { WILD_TREE_ID_BASE, wildTreeMature } from '../wild-orchard';
import type { Orchard, VillageState } from '../types';
import { Y1, village } from './abandonment-fixtures';

// Zdivočelý sad: v opuštěném sadu vyrůstají mezi starými stromy nové (orchard.md – Zdivočelý sad).

const YEAR = 365.25;

function square(x: number): Orchard['squares'][number] {
  return {
    cell: { x, y: 3 },
    areaM2: 5000,
    distanceM: 40,
    plantingCost: 40,
    plantingDone: 40,
    plantedDay: Y1 - 10 * 365,
  };
}

function wildOrchard(disused: boolean): VillageState {
  const s = village(Y1);
  s.orchards = [
    { id: 70, squares: [1, 2, 3, 4, 5, 6].map(square), ...(disused ? { disusedDay: Y1 } : {}) },
  ];
  return s;
}

/** Dny sadu jeden po druhém (jako worker) – dny od `from` do `to` včetně. */
function run(state: VillageState, from: number, to: number, step = 1): void {
  for (let day = from; day <= to; day += step) orchardSeasonDay(state, day);
}

describe('Zdivočelý sad', () => {
  it('opuštěný sad po letech nese nové stromky, většinou jabloně', () => {
    const s = wildOrchard(true);
    run(s, Y1, Y1 + Math.round(20 * YEAR));
    const trees = s.wildTrees ?? [];
    expect(trees.length).toBeGreaterThan(10);
    const apples = trees.filter((t) => t.apple).length;
    expect(apples / trees.length).toBeGreaterThan(0.6);
    expect(apples).toBeLessThan(trees.length);
    // nejvýš maxPerSquare na čtverec, stromy leží na politkách sadu, id nad lesem vsi
    for (const q of s.orchards![0]!.squares) {
      expect(q.wild ?? 0).toBeLessThanOrEqual(ORCHARD_WILD.maxPerSquare);
    }
    expect(trees.every((t) => t.id >= WILD_TREE_ID_BASE)).toBe(true);
    expect(new Set(trees.map((t) => t.id)).size).toBe(trees.length);
  });

  it('používaný sad ani ves bez sadu nezdivočí (stav beze změny)', () => {
    const used = wildOrchard(false);
    const before = JSON.stringify(used);
    run(used, Y1, Y1 + Math.round(10 * YEAR));
    expect(used.wildTrees).toBeUndefined();
    expect(JSON.stringify(used.orchards)).toBe(
      JSON.stringify(cloneState(JSON.parse(before)).orchards),
    );
    const bare = village(Y1);
    const bareBefore = JSON.stringify(bare);
    run(bare, Y1, Y1 + Math.round(3 * YEAR));
    expect(JSON.stringify(bare)).toBe(bareBefore);
  });

  it('nálet zůstane po dosloužení čtverců a je překážkou (mladý, pak dospělý strom)', () => {
    const s = wildOrchard(true);
    run(s, Y1, Y1 + Math.round((ORCHARD.endYear - 10 + 1) * YEAR));
    // čtverce dosloužily a zanikly, stromy zůstaly
    expect(s.orchards ?? []).toHaveLength(0);
    const trees = s.wildTrees ?? [];
    expect(trees.length).toBeGreaterThan(10);
    const day = Y1 + Math.round(60 * YEAR);
    const added = obstacleChangesAt(s, day).added ?? [];
    for (const t of trees) {
      const o = added.find((a) => a.id === t.id)!;
      expect(o.kind).toBe(wildTreeMature(t, day) ? 'tree' : 'youngTree');
    }
    expect(added.some((a) => a.kind === 'tree')).toBe(true);
  });

  it('determinismus: výsledek nezávisí na kouscích, po kterých se ves dopočítá', () => {
    const end = Y1 + Math.round(4 * YEAR);
    const whole = advanceVillage(wildOrchard(true), end, null);
    let chunked = wildOrchard(true);
    for (const to of [Y1 + 100, Y1 + 400, Y1 + 1000, end])
      chunked = advanceVillage(chunked, to, null);
    expect(whole.wildTrees?.length ?? 0).toBeGreaterThan(0);
    expect(chunked.wildTrees).toEqual(whole.wildTrees);
  });

  it('Vrátit sad nálet vyklučí, Zbourat taky', () => {
    const s = wildOrchard(true);
    run(s, Y1, Y1 + Math.round(10 * YEAR));
    expect(s.wildTrees?.length ?? 0).toBeGreaterThan(0);
    const back = restoreStructure(s, Y1 + 4000, { structure: 'orchard', id: 70 });
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.wildTrees).toBeUndefined();
    expect(back.state.orchards![0]!.squares.every((q) => q.wild === undefined)).toBe(true);
    // opuštění znovu: počet stromků se počítá od nuly
    const again = abandonStructure(back.state, Y1 + 4001, { structure: 'orchard', id: 70 });
    expect(again.ok).toBe(true);
  });

  it('advanceVillage opuštěného sadu nálet přidá', () => {
    const s = wildOrchard(true);
    const next = advanceVillage(s, Y1 + 3 * 365 + 10, null);
    expect((next.wildTrees ?? []).length).toBeGreaterThan(0);
  });
});
